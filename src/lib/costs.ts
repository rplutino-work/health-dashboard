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

const ROLE: Record<Provider, 'frontend' | 'backend' | 'database' | 'tooling'> = {
  vercel: 'frontend',
  railway: 'backend',
  neon: 'database',
  supabase: 'database',
  // Anthropic no es infraestructura de ningun sitio: es herramienta de trabajo.
  // Entra al total porque se paga todos los meses, pero no se reparte entre
  // proyectos — atribuirle un porcentaje a cada sitio seria inventar un dato.
  anthropic: 'tooling',
}

/** La métrica que mejor aproxima el reparto del gasto en cada proveedor. */
const BILLED_METRIC: Record<Provider, string> = {
  neon: 'cu_hours',
  supabase: 'schema_bytes',
  railway: 'memory_usage_gb',
  vercel: 'deployments',
  // Sin metrica de consumo: el cargo se muestra entero, sin prorratear.
  anthropic: '__none__',
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
  /** 'panel' = leído de la facturación del proveedor; 'estimado' = declarado. */
  source: string
}

export interface ResourceCost {
  role: 'frontend' | 'backend' | 'database' | 'tooling'
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
      source: r.source ?? 'panel',
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
    // Solo los proveedores que pueden pertenecer a un proyecto. Anthropic queda
    // fuera a proposito: es herramienta de trabajo, no infraestructura de un sitio.
    const ATTRIBUTABLE = ['vercel', 'railway', 'neon', 'supabase'] as const
    for (const provider of ATTRIBUTABLE) {
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

export interface FxSnapshot {
  oficial: number | null
  tarjeta: number | null
  day: string | null
  /** Serie de los últimos días para ver si el peso movió la factura. */
  series: Array<{ day: string; oficial: number | null; tarjeta: number | null }>
}

/**
 * Cotización para convertir el gasto a pesos.
 *
 * Se usa el dólar OFICIAL: los servicios se pagan comprando los dólares y
 * cancelando el resumen en moneda extranjera, sin las percepciones que aplican
 * los bancos al consumo con tarjeta. Convertir al tarjeta inflaría el costo un
 * ~30% que en este caso no se paga.
 *
 * Se guarda igual la serie del tarjeta como referencia, por si algún pago llega
 * a hacerse por esa vía.
 */
export async function getFx(days = 30): Promise<FxSnapshot> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('fx_rates')
    .select('day, casa, venta')
    .gte('day', since)
    .order('day', { ascending: true })

  const byDay = new Map<string, { oficial: number | null; tarjeta: number | null }>()
  for (const r of data ?? []) {
    const entry = byDay.get(r.day) ?? { oficial: null, tarjeta: null }
    if (r.casa === 'oficial') entry.oficial = Number(r.venta)
    if (r.casa === 'tarjeta') entry.tarjeta = Number(r.venta)
    byDay.set(r.day, entry)
  }

  const series = [...byDay.entries()].map(([day, v]) => ({ day, ...v }))
  const last = series[series.length - 1]
  return {
    oficial: last?.oficial ?? null,
    tarjeta: last?.tarjeta ?? null,
    day: last?.day ?? null,
    series,
  }
}

/** Facturas reales ya emitidas: historia verificada, anterior al dashboard. */
export async function getInvoices(limit = 12) {
  const { data } = await supabase
    .from('provider_invoices')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => ({
    provider: r.provider as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    amount: Number(r.amount),
    note: (r.note as string) ?? null,
  }))
}
