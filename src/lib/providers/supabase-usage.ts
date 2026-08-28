import type { UsageSample } from '@/lib/types'

/**
 * Consumo de Supabase.
 *
 * Advertencia: la Management API NO expone el uso de ancho de banda ni el
 * facturable (`/organizations/{id}/usage` devuelve 404). Lo único medible desde
 * acá es lo que se puede consultar por SQL: tamaño por schema y conexiones.
 *
 * En el plan free eso alcanza para lo que importa, porque los dos límites que
 * pueden cortar el servicio son el tamaño (500 MB) y las conexiones (60). El
 * egress hay que mirarlo a mano en el dashboard de Supabase.
 *
 * Las consultas van por la Management API, que ejecuta SQL sin necesidad de la
 * contraseña de Postgres ni de exponer la base.
 */

const SUPA_API = 'https://api.supabase.com/v1'

/**
 * Schemas que crea Supabase para su propia plataforma. No son proyectos y nadie
 * los puede "asignar": aparecian en el panel como consumo sin dueno, sugiriendo
 * un problema donde solo hay infraestructura del proveedor.
 */
const PLATFORM_SCHEMAS = new Set([
  'auth',
  'storage',
  'realtime',
  '_realtime',
  'vault',
  'cron',
  'extensions',
  'graphql',
  'graphql_public',
  'net',
  'pgsodium',
  'pgsodium_masks',
  'pgbouncer',
  'supabase_functions',
  'supabase_migrations',
  '_analytics',
])

const USAGE_SQL = `
  select
    (select pg_database_size(current_database()))::bigint            as db_bytes,
    (select count(*) from pg_stat_activity)::int                     as connections,
    (select setting::int from pg_settings
      where name = 'max_connections')                                as max_connections,
    coalesce((
      select json_agg(json_build_object('schema', nspname, 'bytes', bytes))
      from (
        select n.nspname, sum(pg_total_relation_size(c.oid))::bigint as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_%'
        group by n.nspname
      ) s
    ), '[]'::json) as schemas
`

interface UsageQueryRow {
  db_bytes: number
  connections: number
  max_connections: number
  schemas: Array<{ schema: string; bytes: number }>
}

export async function collectSupabase(
  token: string,
  projectRef: string,
  /** Mapeo schema -> slug, para atribuir el peso de cada schema a su proyecto. */
  schemaToSlug: Map<string, string>,
): Promise<UsageSample[]> {
  const res = await fetch(`${SUPA_API}/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: USAGE_SQL }),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supabase API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const rows = (await res.json()) as UsageQueryRow[]
  const row = rows?.[0]
  if (!row) return []

  const base = { provider: 'supabase' as const, resource_ref: projectRef, delta: null }
  const samples: UsageSample[] = [
    { ...base, project_slug: null, metric: 'db_bytes', value: row.db_bytes, unit: 'bytes' },
    { ...base, project_slug: null, metric: 'connections', value: row.connections, unit: 'conn' },
    {
      ...base,
      project_slug: null,
      metric: 'max_connections',
      value: row.max_connections,
      unit: 'conn',
    },
  ]

  // Cada schema se atribuye a su proyecto: así "cuánto ocupa simuladorvr" tiene
  // respuesta aunque comparta la base con el health-dashboard.
  //
  // El resource_ref lleva el schema además del proyecto. Sin eso todas las filas
  // compartirían identificador y, al quedarse con la última de cada recurso, el
  // dashboard mostraría el peso de un schema cualquiera para todos.
  for (const s of row.schemas ?? []) {
    // Los schemas de la plataforma no son consumo atribuible a nadie.
    if (PLATFORM_SCHEMAS.has(s.schema)) continue
    samples.push({
      ...base,
      resource_ref: `${projectRef}/${s.schema}`,
      project_slug: schemaToSlug.get(s.schema) ?? null,
      metric: 'schema_bytes',
      value: Number(s.bytes),
      unit: 'bytes',
    })
  }

  return samples
}
