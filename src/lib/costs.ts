import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { RESOURCES } from '@/config/resources'
import type { Provider } from '@/lib/types'

/**
 * Costo por proyecto, juntando toda su infraestructura en un solo lugar.
 *
 * Un proyecto no es "una base": es un frontend en Vercel, quizás un backend en
 * Railway y una base en Neon o Supabase. Mirar cada proveedor por separado
 * esconde la pregunta que importa — cuánto cuesta ESTE proyecto — y por eso el
 * dashboard agrupa por proyecto y no por factura.
 *
 * El reparto es proporcional al consumo dentro de cada proveedor: si Neon
 * factura US$60 y un proyecto usa el 37% de las CU-horas, le tocan US$22.
 * Es una aproximación —los proveedores tienen mínimos y escalones— pero responde
 * bien la pregunta de dónde se va la plata.
 */

/** Qué parte de un proyecto representa cada proveedor. */
const ROLE: Record<Provider, 'frontend' | 'backend' | 'database'> = {
  vercel: 'frontend',
  railway: 'backend',
  neon: 'database',
  supabase: 'database',
}

/** La métrica que se factura en cada proveedor. */
const BILLED_METRIC: Record<Provider, string> = {
  neon: 'cu_hours',
  supabase: 'schema_bytes',
  railway: 'memory_usage_gb',
  vercel: 'deployments',
}

export interface ResourceCost {
  role: 'frontend' | 'backend' | 'database'
  provider: Provider
  ref: string
  value: number
  unit: string
  share: number
  cost: number | null
}

export interface ProjectCost {
  slug: string
  name: string
  url: string
  resources: ResourceCost[]
  total: number | null
}

function monthlyCost(provider: Provider): number | null {
  const raw = process.env[`COST_${provider.toUpperCase()}_MONTHLY`]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}

export interface CostBreakdown {
  projects: ProjectCost[]
  /** Total mensual de toda la infraestructura, si hay costos configurados. */
  grandTotal: number | null
  /** Lo que se está pagando por recursos que no pertenecen a ningún proyecto. */
  unattributed: Array<{ provider: Provider; ref: string; value: number; cost: number | null }>
  byProvider: Array<{ provider: Provider; cost: number | null; configured: boolean }>
  capturedAt: string | null
}

export async function getCostBreakdown(): Promise<CostBreakdown> {
  const { data } = await supabase
    .from('provider_usage')
    .select('provider, resource_ref, project_slug, metric, value, unit, captured_at')
    .order('captured_at', { ascending: false })
    .limit(2000)

  // Última medición de cada serie facturable.
  type Row = { provider: Provider; ref: string; slug: string | null; value: number; unit: string }
  const latest = new Map<string, Row>()
  let capturedAt: string | null = null

  for (const r of data ?? []) {
    const provider = r.provider as Provider
    if (r.metric !== BILLED_METRIC[provider]) continue
    const key = `${provider}:${r.resource_ref}`
    if (latest.has(key)) continue
    latest.set(key, {
      provider,
      ref: r.resource_ref,
      slug: r.project_slug,
      value: Number(r.value),
      unit: r.unit ?? '',
    })
    capturedAt ??= r.captured_at
  }

  // Total por proveedor, para poder repartir su factura.
  const totals = new Map<Provider, number>()
  for (const row of latest.values()) {
    totals.set(row.provider, (totals.get(row.provider) ?? 0) + row.value)
  }

  const costOf = (row: Row): number | null => {
    const bill = monthlyCost(row.provider)
    const total = totals.get(row.provider) ?? 0
    if (bill === null || total <= 0) return null
    return (row.value / total) * bill
  }
  const shareOf = (row: Row): number => {
    const total = totals.get(row.provider) ?? 0
    return total > 0 ? row.value / total : 0
  }

  // Agrupar por proyecto.
  const byProject = new Map<string, ResourceCost[]>()
  const attributed = new Set<string>()

  for (const [slug, res] of Object.entries(RESOURCES)) {
    const list: ResourceCost[] = []
    for (const provider of ['vercel', 'railway', 'neon', 'supabase'] as Provider[]) {
      const ref = res[provider]
      if (!ref) continue
      const row = latest.get(`${provider}:${ref}`)
      if (!row) continue
      attributed.add(`${provider}:${ref}`)
      list.push({
        role: ROLE[provider],
        provider,
        ref,
        value: row.value,
        unit: row.unit,
        share: shareOf(row),
        cost: costOf(row),
      })
    }
    if (list.length) byProject.set(slug, list)
  }

  const nameBySlug = new Map(projects.map((p) => [p.slug, p]))
  const projectCosts: ProjectCost[] = [...byProject.entries()]
    .map(([slug, resources]) => {
      const known = resources.filter((r) => r.cost !== null)
      const p = nameBySlug.get(slug)
      return {
        slug,
        name: p?.name ?? slug,
        url: p?.url ?? '',
        resources,
        total: known.length ? known.reduce((a, b) => a + (b.cost ?? 0), 0) : null,
      }
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1))

  // Recursos que se pagan pero no están asignados a ningún proyecto: es plata
  // que se va sin dueño, y esconderla sería el peor default posible.
  const unattributed = [...latest.entries()]
    .filter(([key]) => !attributed.has(key))
    .map(([, row]) => ({
      provider: row.provider,
      ref: row.ref,
      value: row.value,
      cost: costOf(row),
    }))
    .filter((u) => u.value > 0)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))

  const byProvider = (['neon', 'supabase', 'railway', 'vercel'] as Provider[]).map((p) => ({
    provider: p,
    cost: monthlyCost(p),
    configured: monthlyCost(p) !== null,
  }))

  const configuredTotal = byProvider
    .filter((b) => b.cost !== null)
    .reduce((a, b) => a + (b.cost ?? 0), 0)

  return {
    projects: projectCosts,
    grandTotal: byProvider.some((b) => b.configured) ? configuredTotal : null,
    unattributed,
    byProvider,
    capturedAt,
  }
}

/**
 * Consumo mensual de Neon. Sus contadores se reinician con el ciclo de
 * facturación, así que el mes en curso se lee del valor acumulado y los meses
 * cerrados se reconstruyen sumando los deltas guardados.
 *
 * Los meses anteriores a que el dashboard empezara a capturar aparecen vacíos:
 * es la verdad, no un error. El historial se construye de acá en adelante.
 */
export async function getMonthlyTrend(months = 6) {
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const { data } = await supabase
    .from('provider_usage')
    .select('captured_at, value, delta, project_slug, metric, provider')
    .eq('provider', 'neon')
    .eq('metric', 'cu_hours')
    .gte('captured_at', since.toISOString())
    .order('captured_at', { ascending: true })

  const byMonth = new Map<string, Map<string, number>>()
  for (const r of data ?? []) {
    const month = r.captured_at.slice(0, 7)
    const slug = r.project_slug ?? 'sin asignar'
    if (!byMonth.has(month)) byMonth.set(month, new Map())
    const m = byMonth.get(month)!
    // Dentro de un mismo ciclo el acumulado ya es el total del mes: nos quedamos
    // con el máximo visto en vez de sumar deltas, que perdería lo consumido
    // antes de la primera captura.
    m.set(slug, Math.max(m.get(slug) ?? 0, Number(r.value)))
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, perProject]) => ({
      month,
      total: [...perProject.values()].reduce((a, b) => a + b, 0),
      projects: [...perProject.entries()]
        .map(([slug, value]) => ({ slug, value }))
        .sort((a, b) => b.value - a.value),
    }))
}
