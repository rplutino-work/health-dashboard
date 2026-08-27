import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { RESOURCES } from '@/config/resources'
import type { Provider } from '@/lib/types'

/**
 * Costo por proyecto, calculado sobre consumo medido y precios reales.
 *
 * Ningún proveedor de los que usás expone su factura por API: Neon devuelve 404
 * en billing e invoices con el plan launch, y la Management API de Supabase
 * tampoco. Así que el número sale de dos partes, y el dashboard distingue una de
 * la otra en pantalla:
 *
 *   MEDIDO    — el consumo (CU-horas, bytes), leído de la API de cada proveedor.
 *   CARGADO   — la estructura de precios del plan, que carga el usuario en la
 *               tabla provider_billing porque solo él ve su factura.
 *
 * Poner un total inventado sería peor que no mostrar nada: da una precisión que
 * el dato no tiene.
 */

const ROLE: Record<Provider, 'frontend' | 'backend' | 'database'> = {
  vercel: 'frontend',
  railway: 'backend',
  neon: 'database',
  supabase: 'database',
}

const BILLED_METRIC: Record<Provider, string> = {
  neon: 'cu_hours',
  supabase: 'schema_bytes',
  railway: 'memory_usage_gb',
  vercel: 'deployments',
}

export interface BillingPlan {
  provider: Provider
  plan: string | null
  base_cost: number
  included_units: number
  overage_rate: number
  unit: string | null
  cycle_start_day: number | null
  note: string | null
}

/** Estado del ciclo de facturación de un proveedor. Cada uno tiene el suyo. */
export interface BillingCycle {
  start: string
  end: string
  daysElapsed: number
  daysTotal: number
  pctElapsed: number
  consumed: number
  /** Consumo estimado al cierre, extrapolando el ritmo actual. */
  projected: number
  includedUnits: number
  /** Costo a hoy: abono + exceso ya consumido. */
  costToDate: number
  /** Costo estimado al cierre del ciclo. */
  costProjected: number
  unit: string
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
  /** Serie del consumo para dibujar la tendencia del proyecto. */
  spark: number[]
}

async function getPlans(): Promise<Map<Provider, BillingPlan>> {
  const { data } = await supabase.from('provider_billing').select('*')
  const map = new Map<Provider, BillingPlan>()
  for (const r of data ?? []) {
    map.set(r.provider as Provider, {
      provider: r.provider,
      plan: r.plan,
      base_cost: Number(r.base_cost),
      included_units: Number(r.included_units),
      overage_rate: Number(r.overage_rate),
      unit: r.unit,
      cycle_start_day: r.cycle_start_day,
      note: r.note,
    })
  }
  return map
}

/**
 * Costo de un proveedor dado su consumo: abono del plan más el exceso sobre lo
 * incluido. Es el mismo cálculo que hace la factura, con el consumo que medimos.
 */
function costFor(plan: BillingPlan | undefined, consumed: number): number | null {
  if (!plan) return null
  const overage = Math.max(0, consumed - plan.included_units)
  return plan.base_cost + overage * plan.overage_rate
}

export interface CostBreakdown {
  projects: ProjectCost[]
  cycles: Array<BillingCycle & { provider: Provider; plan: string | null; configured: boolean }>
  grandTotalToDate: number | null
  grandTotalProjected: number | null
  unattributed: Array<{ provider: Provider; ref: string; value: number; cost: number | null }>
  capturedAt: string | null
  /** Proveedores sin plan cargado: su costo no se puede calcular. */
  missingPlans: Provider[]
}

export async function getCostBreakdown(): Promise<CostBreakdown> {
  const [{ data }, plans, { data: cycleRows }] = await Promise.all([
    supabase
      .from('provider_usage')
      .select('provider, resource_ref, project_slug, metric, value, unit, captured_at')
      .order('captured_at', { ascending: false })
      .limit(4000),
    getPlans(),
    supabase
      .from('provider_usage')
      .select('provider, metric, value, captured_at')
      .eq('metric', 'cycle_reset_at_ms')
      .order('captured_at', { ascending: false })
      .limit(10),
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
    // Serie para la tendencia (viene de más nuevo a más viejo).
    const h = history.get(key) ?? []
    if (h.length < 24) h.push(Number(r.value))
    history.set(key, h)
  }

  const totals = new Map<Provider, number>()
  for (const row of latest.values()) {
    totals.set(row.provider, (totals.get(row.provider) ?? 0) + row.value)
  }

  // Ciclo por proveedor. Neon publica su quota_reset_at; para el resto se asume
  // mes calendario hasta que se cargue el día de cierre real.
  const resetByProvider = new Map<Provider, number>()
  for (const r of cycleRows ?? []) {
    const p = r.provider as Provider
    if (!resetByProvider.has(p)) resetByProvider.set(p, Number(r.value))
  }

  const now = Date.now()
  const cycles = (['neon', 'supabase', 'railway', 'vercel'] as Provider[]).map((provider) => {
    const plan = plans.get(provider)
    const consumed = totals.get(provider) ?? 0

    const resetMs = resetByProvider.get(provider)
    const end = resetMs ? new Date(resetMs) : firstOfNextMonth()
    const start = new Date(end)
    start.setMonth(start.getMonth() - 1)

    const daysTotal = (end.getTime() - start.getTime()) / 86400000
    const daysElapsed = Math.max((now - start.getTime()) / 86400000, 0.01)
    const projected = daysElapsed > 0 ? (consumed / daysElapsed) * daysTotal : consumed

    return {
      provider,
      plan: plan?.plan ?? null,
      configured: !!plan,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      daysElapsed,
      daysTotal,
      pctElapsed: Math.min((daysElapsed / daysTotal) * 100, 100),
      consumed,
      projected,
      includedUnits: plan?.included_units ?? 0,
      costToDate: costFor(plan, consumed) ?? 0,
      costProjected: costFor(plan, projected) ?? 0,
      unit: plan?.unit ?? '',
    }
  })

  const costOf = (row: Row): number | null => {
    const plan = plans.get(row.provider)
    const total = totals.get(row.provider) ?? 0
    const providerCost = costFor(plan, total)
    if (providerCost === null || total <= 0) return null
    return (row.value / total) * providerCost
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
      // La tendencia del proyecto es la de su recurso mas caro: Neon si tiene.
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

  const configured = cycles.filter((c) => c.configured)
  return {
    projects: projectCosts,
    cycles,
    grandTotalToDate: configured.length
      ? configured.reduce((a, b) => a + b.costToDate, 0)
      : null,
    grandTotalProjected: configured.length
      ? configured.reduce((a, b) => a + b.costProjected, 0)
      : null,
    unattributed,
    capturedAt,
    missingPlans: cycles.filter((c) => !c.configured).map((c) => c.provider),
  }
}

function firstOfNextMonth() {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}

/** Facturas reales ya cargadas, para contrastar contra lo calculado. */
export async function getInvoices() {
  const { data } = await supabase
    .from('provider_invoices')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(24)
  return (data ?? []).map((r) => ({
    provider: r.provider as Provider,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    amount: Number(r.amount),
    note: r.note as string | null,
  }))
}
