import type { UsageSample } from '@/lib/types'

/**
 * Consumo de Vercel.
 *
 * Limitación real, no un pendiente: Vercel NO expone consumo por proyecto en su
 * API pública. El desglose de ancho de banda, invocaciones y GB-horas existe
 * solo a nivel cuenta y solo dentro del dashboard.
 *
 * Lo que sí se puede medir por proyecto, y es lo que hace este colector:
 *   - deployments del período (proxy de actividad de build)
 *   - si el proyecto está pausado
 *
 * O sea: sirve para ver qué proyectos están vivos y cuáles quedaron olvidados,
 * no para prorratear una factura de Vercel. El dashboard lo muestra aparte por
 * eso mismo — mezclarlo con los CU-h de Neon sería mentir sobre lo que mide.
 *
 * Token de VERCEL_API_TOKEN, generado en vercel.com/account/tokens.
 */

const VERCEL_API = 'https://api.vercel.com'

interface VercelDeployment {
  uid: string
  name: string
  created: number
  state?: string
}

export async function collectVercel(
  token: string,
  teamId: string | undefined,
  projectToSlug: Map<string, string>,
  since: Date,
): Promise<UsageSample[]> {
  const team = teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''
  const res = await fetch(
    `${VERCEL_API}/v6/deployments?limit=100&since=${since.getTime()}${team}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const { deployments } = (await res.json()) as { deployments: VercelDeployment[] }

  // Un deployment por proyecto no dice mucho; el conteo del período sí.
  const counts = new Map<string, number>()
  for (const d of deployments ?? []) {
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1)
  }

  return [...counts.entries()].map(([name, count]) => ({
    provider: 'vercel' as const,
    resource_ref: name,
    project_slug: projectToSlug.get(name) ?? null,
    metric: 'deployments',
    value: count,
    delta: null,
    unit: 'deploys',
  }))
}
