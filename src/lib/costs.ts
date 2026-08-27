import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { RESOURCES } from '@/config/resources'
import type { Provider } from '@/lib/types'

/**
 * Costo por proyecto, a partir de los cargos REALES de cada proveedor.
 *
 * Ninguno de los proveedores expone su facturación por API (Neon devuelve 404 en
 * billing con el plan Launch; Supabase tampoco). Así que el monto se carga en
 * provider_charges leyéndolo del panel de cada uno, y el dashboard lo reparte
 * entre proyectos según el consumo que sí puede medir.
 *
 * Esa división importa y se muestra en pantalla:
 *   REAL      el monto del ciclo, tomado del panel del proveedor
 *   MEDIDO    el consumo por proyecto, leído de su API
 *   DERIVADO  el reparto, que sale de cruzar los dos
 *
 * Cada proveedor cierra su ciclo cuando quiere — Neon el 1, Vercel el 29,
 * Railway el 14 — así que no existe "el gasto del mes": existe el gasto del
 * ciclo de cada uno, y sumarlos como si coincidieran sería inventar precisión.
 */

const ROLE: Record<Provider, 'frontend' | 'backend' | 'database'> = {
  vercel: 'frontend',
  railway: 'backend',
  neon: 'database',
  supabase: 'database',
}

/** La métrica que mejor aproxima el reparto del gasto en cada proveedor. */
const BILLED_METRIC: Record<Provider, string> = {
  neon: 'cu_hours',
  supabase: 'schema_bytes',
  railway: 'memory_usage_gb',
  vercel: 'deployments',
}

export interface ProviderCharge {
  provider: Provider
  plan: string | null
  cycleStart: string
  cycleEnd: string
  amountToDate: number
  amountProjected: number | null
  breakdown: Record<string, { usage?: string; charge: number }> | null
  /** Días transcurridos del ciclo, para poder proyectar el cierre. */
  pctElapsed: number
  daysLeft: number
  /** Proyección propia si el proveedor no la publica. */
  ownProjection: number
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
  spark: number[]
}

export interface CostBreakdown {
  projects: ProjectCost[]
  charges: ProviderCharge[]
  /** Suma de los cargos reales. Los ciclos no coinciden: es una foto de hoy. */
  totalToDate: number
  totalProjected: number
  unattributed: Array<{ provider: Provider; ref: string; value: number; cost: number | null }>
  capturedAt: string | null
  /** Proveedores con consumo medido pero sin cargo cargado. */
  missingCharges: Provider[]
}

async function getCharges(): Promise<Map<Provider, ProviderCharge>> {
  const { data } = await supabase.from('provider_charges').select('*')
  const map = new Map<Provider, ProviderCharge>()
  const now = Date.now()

  for (const r of data ?? []) {
    const start = Date.parse(r.cycle_start)
    const end = Date.parse(r.cycle_end)
    const total = end - start
    const elapsed = Math.min(Math.max(now - start, 0), total)
    const pct = total > 0 ? (elapsed / total) * 100 : 0
    const amount = Number(r.amount_to_date)

    map.set(r.provider as Provider, {
      provider: r.provider,
      plan: r.plan,
      cycleStart: r.cycle_start,
      cycleEnd: r.cycle_end,
      amountToDate: amount,
      amountProjected: r.amount_projected !== null ? Number(r.amount_projected) : null,
      breakdown: r.breakdown ?? null,
      pctElapsed: pct,
      daysLeft: Math.max((end - now) / 86400000, 0),
      // Si el proveedor no publica su estimación, se extrapola el ritmo.
      ownProjection: pct > 0 ? (amount / pct) * 100 : amount,
    })
  }
  return map
}

export async function getCostBreakdown(): Promise<CostBreakdown> {
  const [{ data }, charges] = await Promise.all([
    supabase
      .from('provider_usage')
      .select('provider, resource_ref, project_slug, metric, value, unit, captured_at')
      .order('captured_at', { ascending: false })
      .limit(4000),
    getCharges(),
  ])

  type Row = { provider: Provider; ref: string; slug: string | null; value: number; unit: string }
  const latest = new Map<string, Row>()
  const history = new Map<string, number[]>()
  let capturedAt: string | null = null

  for (const r of data ?? []) {
    const provider = r.provider as Provider
    if (r.metric !== BILLED_METRIC[provider]) continue
    const key = `${provider}:${r.resource_ref}`
    if (!latest.has(key)) {
      latest.set(key, {
        provider,
        ref: r.resource_ref,
        slug: r.project_slug,
        value: Number(r.value),
        unit: r.unit ?? '',
      })
      capturedAt ??= r.captured_at
    }
    const h = history.get(key) ?? []
    if (h.length < 24) h.push(Number(r.value))
    history.set(key, h)
  }

  const totals = new Map<Provider, number>()
  for (const row of latest.values()) {
    totals.set(row.provider, (totals.get(row.provider) ?? 0) + row.value)
  }

  /** Reparte el cargo real del proveedor según la porción de consumo medido. */
  const costOf = (row: Row): number | null => {
    const charge = charges.get(row.provider)
    const total = totals.get(row.provider) ?? 0
    if (!charge || total <= 0) return null
    return (row.value / total) * charge.amountToDate
  }
  const shareOf = (row: Row) => {
    const total = totals.get(row.provider) ?? 0
    return total > 0 ? row.value / total : 0
  }

  const byProject = new Map<string, ResourceCost[]>()
  const sparkByProject = new Map<string, number[]>()
  const attributed = new Set<string>()

  for (const [slug, res] of Object.entries(RESOURCES)) {
    const list: ResourceCost[] = []
    for (const provider of ['vercel', 'railway', 'neon', 'supabase'] as Provider[]) {
      const ref = res[provider]
      if (!ref) continue
      const key = `${provider}:${ref}`
      const row = latest.get(key)
      if (!row) continue
      attributed.add(key)
      list.push({
        role: ROLE[provider],
        provider,
        ref,
        value: row.value,
        unit: row.unit,
        share: shareOf(row),
        cost: costOf(row),
      })
      if (provider === 'neon') sparkByProject.set(slug, (history.get(key) ?? []).slice().reverse())
    }
    if (list.length) byProject.set(slug, list)
  }

  const bySlug = new Map(projects.map((p) => [p.slug, p]))
  const projectCosts: ProjectCost[] = [...byProject.entries()]
    .map(([slug, resources]) => {
      const known = resources.filter((r) => r.cost !== null)
      const p = bySlug.get(slug)
      return {
        slug,
        name: p?.name ?? slug,
        url: p?.url ?? '',
        resources,
        total: known.length ? known.reduce((a, b) => a + (b.cost ?? 0), 0) : null,
        spark: sparkByProject.get(slug) ?? [],
      }
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1))

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

  const chargeList = [...charges.values()].sort((a, b) => b.amountToDate - a.amountToDate)
  const measured = new Set(totals.keys())

  return {
    projects: projectCosts,
    charges: chargeList,
    totalToDate: chargeList.reduce((a, b) => a + b.amountToDate, 0),
    totalProjected: chargeList.reduce(
      (a, b) => a + (b.amountProjected ?? b.ownProjection),
      0
    ),
    unattributed,
    capturedAt,
    missingCharges: [...measured].filter((p) => !charges.has(p)),
  }
}
