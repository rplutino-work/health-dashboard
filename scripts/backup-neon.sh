#!/usr/bin/env bash
#
# Respalda la rama default de TODOS los proyectos de Neon y sube los dumps a R2.
#
# La lista de proyectos se le pide a la API en cada corrida, a propósito: un
# proyecto nuevo queda respaldado la misma noche que se crea, sin que nadie
# tenga que acordarse de agregar nada. Lo contrario —un secret por base— es
# exactamente lo que dejó a ecommerce-kit dos meses sin backup, y en verde.
#
# No lleva `-e`: una base que falla no tiene que cortar las otras diecinueve.
# Los errores se cuentan y el paso termina en rojo al final, con el detalle de
# cuál quedó sin respaldo.
set -uo pipefail

API="https://console.neon.tech/api/v2"
HOY=$(date -u +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for v in NEON_API_KEY R2_ENDPOINT R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "::error::falta la variable $v"
    exit 1
  fi
done

neon() {
  curl -fsS --retry 3 --retry-delay 2 "$API/$1" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H "Accept: application/json"
}

# "ROK ADMIN" -> "rok-admin", para que la ruta en R2 sea predecible.
slug() { echo "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

ok=0
fallas=0
omitidas=0
resumen="$TMP/resumen.tsv"
: > "$resumen"

proyectos=$(neon "projects?limit=200" | jq -r '.projects[] | "\(.id)\t\(.name)"')
if [ -z "$proyectos" ]; then
  echo "::error::la API de Neon no devolvió ningún proyecto"
  exit 1
fi
echo "Proyectos a respaldar: $(echo "$proyectos" | wc -l | tr -d ' ')"

while IFS=$'\t' read -r pid nombre; do
  s=$(slug "$nombre")

  # Un compute apagado a mano no se puede volcar: pg_dump no se conecta y ya.
  # Se mira el estado en vez de llevar una lista de nombres, así que si se
  # vuelve a prender queda respaldado sin tocar nada. Sale como warning y no
  # como falla —argentum-staging está apagada a propósito desde el 28/10—
  # pero queda a la vista, para que apagar una base de producción por error no
  # se transforme en un backup que desaparece en silencio.
  if [ "$(neon "projects/$pid/endpoints" | jq -r '[.endpoints[] | select(.type == "read_write")][0].disabled')" = "true" ]; then
    echo "::warning::$s omitida: su compute está deshabilitado en Neon"
    printf '%s\t-\tomitida · compute deshabilitado\n' "$s" >> "$resumen"
    omitidas=$((omitidas + 1))
    continue
  fi

  rama=$(neon "projects/$pid/branches" | jq -r '[.branches[] | select(.default)][0].id')
  if [ -z "$rama" ] || [ "$rama" = "null" ]; then
    printf '%s\t-\tsin rama default\n' "$s" >> "$resumen"
    fallas=$((fallas + 1))
    continue
  fi

  bases=$(neon "projects/$pid/branches/$rama/databases" | jq -r '.databases[] | "\(.name)\t\(.owner_name)"')

  while IFS=$'\t' read -r base dueno; do
    [ -z "$base" ] && continue

    # Sin pooler: pg_dump abre varias transacciones y pgbouncer no las
    # sostiene. La conexión se pide en cada corrida y no se guarda en ningún
    # lado, así que rotar la contraseña de una base no rompe el backup.
    uri=$(neon "projects/$pid/connection_uri?branch_id=$rama&database_name=$base&role_name=$dueno&pooled=false" | jq -r '.uri')
    if [ -z "$uri" ] || [ "$uri" = "null" ]; then
      printf '%s\t%s\tsin cadena de conexión\n' "$s" "$base" >> "$resumen"
      fallas=$((fallas + 1))
      continue
    fi

    archivo="$TMP/$s-$base.sql.gz"

    # El `pipefail` de arriba es lo que hace que esto sirva de algo: el exit
    # code de un pipe es el del último comando, así que sin él un pg_dump que
    # falla deja un .gz vacío de 20 bytes y el paso sale 0.
    if ! pg_dump "$uri" --no-owner --no-privileges --clean --if-exists \
      2> "$TMP/err" | gzip > "$archivo"; then
      printf '%s\t%s\tpg_dump: %s\n' "$s" "$base" "$(tail -1 "$TMP/err" | cut -c1-80)" >> "$resumen"
      fallas=$((fallas + 1))
      continue
    fi

    # pg_dump escribe "dump complete" SÓLO si llegó al final: es la única
    # prueba de que el volcado está entero y no cortado a la mitad, porque el
    # tamaño no distingue esos dos casos.
    #
    # Se busca en todo el archivo y no en las últimas líneas: el pie no es la
    # última: PG18 escribe un bloque `\unrestrict` después. Un `tail -5` anda
    # hoy y se auto-inventa una falla el día que se agregue un renglón.
    #
    # Un solo pase de descompresión para las dos cuentas: el dump más grande
    # es de 104 MB y no vale la pena abrirlo dos veces.
    if ! medidas=$(gzip -dc "$archivo" | awk '
      /^CREATE TABLE / { t++ }
      /PostgreSQL database dump complete/ { pie = 1 }
      END { print t + 0, pie + 0 }
    '); then
      printf '%s\t%s\tel .gz no se puede leer\n' "$s" "$base" >> "$resumen"
      fallas=$((fallas + 1))
      continue
    fi
    tablas=${medidas%% *}
    pie=${medidas##* }

    if [ "$pie" != "1" ]; then
      printf '%s\t%s\tdump incompleto (sin el pie de pg_dump)\n' "$s" "$base" >> "$resumen"
      fallas=$((fallas + 1))
      continue
    fi

    bytes=$(stat -c%s "$archivo")

    if ! aws s3 cp "$archivo" "s3://$R2_BUCKET/neon/$s/$base/$HOY.sql.gz" \
      --endpoint-url "$R2_ENDPOINT" --only-show-errors < /dev/null; then
      printf '%s\t%s\tfalló la subida a R2\n' "$s" "$base" >> "$resumen"
      fallas=$((fallas + 1))
      continue
    fi

    printf '%s\t%s\tOK · %s bytes · %s tablas\n' "$s" "$base" "$bytes" "$tablas" >> "$resumen"
    ok=$((ok + 1))
    rm -f "$archivo"
  done <<< "$bases"
done <<< "$proyectos"

{
  echo "### Backups del $HOY"
  echo
  echo "| proyecto | base | resultado |"
  echo "|---|---|---|"
  sed 's/\t/ | /g; s/^/| /; s/$/ |/' "$resumen"
  echo
  echo "**$ok bases respaldadas · $omitidas omitidas · $fallas con problemas**"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

column -t -s $'\t' "$resumen"
echo
echo "respaldadas: $ok · omitidas: $omitidas · con problemas: $fallas"

if [ "$fallas" -gt 0 ]; then
  echo "::error::$fallas bases quedaron sin respaldo"
  exit 1
fi
