import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { RESOURCES, SUPABASE_SCHEMA_OWNER } from '@/config/resources'
import { collectNeon, NEON_CUMULATIVE } from '@/lib/providers/neon'
import { collectSupabase } from '@/lib/providers/supabase-usage'
import { collectRailway } from '@/lib/providers/railway'
import { collectVercel } from '@/lib/providers/vercel'
import { collectFx } from '@/lib/providers/fx'
import type { Provider, UsageSample, ProratedUsage } from '@/lib/types'

/**
 * Junta el consumo de todos los proveedores y lo atribuye a cada proyecto.
 *
 * Dos reglas que hacen que los números sean honestos:
 *
 * 1. DELTAS. Neon devuelve contadores acumulados del ciclo de facturación.
 *    Sumar el valor crudo a lo largo del mes contaría lo mismo muchas veces, así
 *    que guardamos cuánto subió desde la captura anterior. Cuando el ciclo se
 *    reinicia el contador vuelve a cero y el delta daría negativo: en ese caso
 *    el delta es el valor nuevo, no la resta.
 *
 * 2. UN COLECTOR CAÍDO NO TUMBA AL RESTO. Cada proveedor va en su propio
 *    try/catch. Si Railway no tiene token o cambió su API, el dashboard sigue
 *    mostrando Neon y Supabase, y el error queda registrado.
 */

/** Costo mensual por proveedor, para poder prorratear en pesos/dólares. */
function monthlyCost(provider: Provider): number | null {
  const raw = process.env[`COST_${provider.toUpperCase()}_MONTHLY`]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}

/** Invierte el mapeo: del id del proveedor al slug del proyecto. */
function buildMaps() {
  const neon = new Map<string, string>()
  const railway = new Map<string, string>()
  const vercel = new Map<string, string>()
  for (const [slug, r] of Object.entries(RESOURCES)) {
    if (r.neon) neon.set(r.neon, slug)
    if (r.railway) railway.set(r.railway, slug)
    if (r.vercel) vercel.set(r.vercel, slug)
  }
  return { neon, railway, vercel }
}

const SCHEMA_OWNER = new Map(Object.entries(SUPABASE_SCHEMA_OWNER))

export interface CollectReport {
  captured: number
  errors: Array<{ provider: Provider; message: string }>
}

export async function collectAllUsage(): Promise<CollectReport> {
  const maps = buildMaps()
  const errors: CollectReport['errors'] = []
  const samples: UsageSample[] = []

  if (process.env.NEON_API_KEY) {
    try {
      const snap = await collectNeon(process.env.NEON_API_KEY, maps.neon)
      samples.push(...snap.samples)
    } catch (e) {
      errors.push({ provider: 'neon', message: (e as Error).message })
    }
  }

  if (process.env.SUPABASE_MGMT_TOKEN && process.env.SUPABASE_PROJECT_REF) {
    try {
      samples.push(
        ...(await collectSupabase(
          process.env.SUPABASE_MGMT_TOKEN,
          process.env.SUPABASE_PROJECT_REF,
          SCHEMA_OWNER,
        )),
      )
    } catch (e) {
      errors.push({ provider: 'supabase', message: (e as Error).message })
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  if (process.env.RAILWAY_API_TOKEN) {
    try {
      samples.push(...(await collectRailway(process.env.RAILWAY_API_TOKEN, maps.railway, since)))
    } catch (e) {
      errors.push({ provider: 'railway', message: (e as Error).message })
    }
  }

  if (process.env.VERCEL_API_TOKEN) {
    try {
      samples.push(
        ...(await collectVercel(
          process.env.VERCEL_API_TOKEN,
          process.env.VERCEL_TEAM_ID,
          maps.vercel,
          since,
        )),
      )
    } catch (e) {
      errors.push({ provider: 'vercel', message: (e as Error).message })
    }
  }

  // Cotizacion del dolar: el gasto esta en dolares pero se paga en pesos, y la
  // factura puede subir sin que se consuma un byte mas.
  try {
    const quotes = await collectFx()
    const today = new Date().toISOString().slice(0, 10)
    const rows = quotes.map((q) => ({
      day: today,
      casa: q.casa,
      compra: q.compra,
      venta: q.venta,
    }))
    if (rows.length) {
      await supabase.from('fx_rates').upsert(rows, { onConflict: 'day,casa' })
    }
  } catch (e) {
    errors.push({ provider: 'neon', message: `fx: ${(e as Error).message}` })
  }

  if (samples.length === 0) return { captured: 0, errors }

  // Traer el último valor de cada serie para poder calcular el delta. Una sola
  // consulta con los últimos registros alcanza: las series son pocas (decenas).
  const { data: prev } = await supabase
    .from('provider_usage')
    .select('provider, resource_ref, metric, value')
    .order('captured_at', { ascending: false })
    .limit(1000)

  const lastValue = new Map<string, number>()
  for (const r of prev ?? []) {
    const key = `${r.provider}:${r.resource_ref}:${r.metric}`
    if (!lastValue.has(key)) lastValue.set(key, Number(r.value))
  }

  const rows = samples.map((s) => {
    let delta = s.delta
    const cumulative = s.provider === 'neon' && NEON_CUMULATIVE.has(s.metric)
    if (cumulative) {
      const key = `${s.provider}:${s.resource_ref}:${s.metric}`
      const before = lastValue.get(key)
      if (before === undefined) {
        delta = null // primera captura de esta serie: no hay contra qué comparar
      } else {
        const d = s.value - before
        // Negativo = el ciclo de facturación se reinició y el contador volvió a
        // empezar. Lo consumido desde entonces es el valor nuevo.
        delta = d < 0 ? s.value : d
      }
    }
    return { ...s, delta }
  })

  const { error } = await supabase.from('provider_usage').insert(rows)
  if (error) errors.push({ provider: 'neon', message: `insert: ${error.message}` })

  return { captured: rows.length, errors }
}

/**
 * Prorratea el consumo de un proveedor entre los proyectos: cada uno recibe la
 * porción del costo mensual que corresponde a su parte del consumo total.
 */
export async function getProratedUsage(
  provider: Provider,
  metric: string,
): Promise<ProratedUsage[]> {
  const { data } = await supabase
    .from('provider_usage')
    .select('resource_ref, project_slug, value, unit, captured_at')
    .eq('provider', provider)
    .eq('metric', metric)
    .order('captured_at', { ascending: false })
    .limit(500)

  // Última medición de cada recurso.
  const latest = new Map<string, { value: number; unit: string; slug: string | null }>()
  for (const r of data ?? []) {
    if (!latest.has(r.resource_ref)) {
      latest.set(r.resource_ref, {
        value: Number(r.value),
        unit: r.unit ?? '',
        slug: r.project_slug,
      })
    }
  }

  const total = [...latest.values()].reduce((a, b) => a + b.value, 0)
  const cost = monthlyCost(provider)
  const nameBySlug = new Map(projects.map((p) => [p.slug, p.name]))

  return [...latest.entries()]
    .map(([ref, v]) => ({
      project_slug: v.slug,
      // Sin mapeo mostramos el id del proveedor: es preferible a esconder consumo
      // que existe y que alguien está pagando.
      project_name: (v.slug && nameBySlug.get(v.slug)) || ref,
      provider,
      metric,
      value: v.value,
      unit: v.unit,
      share: total > 0 ? v.value / total : 0,
      cost: cost !== null && total > 0 ? (v.value / total) * cost : null,
    }))
    .sort((a, b) => b.value - a.value)
}
