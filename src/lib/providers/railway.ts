import type { UsageSample } from '@/lib/types'

/**
 * Consumo de Railway.
 *
 * Railway cobra por RECURSOS (memoria, CPU, red, disco) por servicio y por hora,
 * no por "estar despierto" como Neon. Un backend always-on ahí no tiene el
 * problema que tenía en Neon.
 *
 * SIN VERIFICAR CONTRA LA API REAL: se escribió sin un token de cuenta a mano,
 * así que la forma de la respuesta está tomada de la documentación de su API
 * GraphQL. Si el dashboard muestra Railway vacío, es acá donde hay que mirar
 * primero — el colector falla en silencio a propósito para no tumbar la corrida
 * entera del cron.
 *
 * El token va en RAILWAY_API_TOKEN y se saca de railway.com/account/tokens
 * (token de CUENTA, no el del CLI: el del CLI es de sesión y la API lo rechaza
 * con "Not Authorized").
 */

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'

const USAGE_QUERY = `
  query usage($startDate: DateTime!, $endDate: DateTime!) {
    usage(startDate: $startDate, endDate: $endDate, groupBy: [SERVICE_ID]) {
      measurement
      value
      tags { serviceId projectId }
    }
  }
`

interface RailwayUsageNode {
  measurement: string
  value: number
  tags?: { serviceId?: string; projectId?: string }
}

/** Unidades por medición, según lo que documenta Railway. */
const UNITS: Record<string, string> = {
  MEMORY_USAGE_GB: 'GB-h',
  CPU_USAGE: 'vCPU-h',
  NETWORK_TX_GB: 'GB',
  DISK_USAGE_GB: 'GB-h',
}

export async function collectRailway(
  token: string,
  serviceToSlug: Map<string, string>,
  since: Date,
): Promise<UsageSample[]> {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: USAGE_QUERY,
      variables: { startDate: since.toISOString(), endDate: new Date().toISOString() },
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Railway API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const body = (await res.json()) as {
    data?: { usage?: RailwayUsageNode[] }
    errors?: Array<{ message: string }>
  }
  if (body.errors?.length) {
    throw new Error(`Railway GraphQL: ${body.errors.map((e) => e.message).join('; ')}`)
  }

  return (body.data?.usage ?? []).map((u) => {
    const ref = u.tags?.serviceId ?? u.tags?.projectId ?? 'unknown'
    return {
      provider: 'railway' as const,
      resource_ref: ref,
      project_slug: serviceToSlug.get(ref) ?? null,
      metric: u.measurement.toLowerCase(),
      value: u.value,
      // La query ya pide una ventana acotada, así que el valor es del período:
      // no hay que restarle la captura anterior.
      delta: null,
      unit: UNITS[u.measurement] ?? '',
    }
  })
}
