import { supabase } from '@/lib/supabase'
import type { Provider } from '@/lib/types'

/**
 * Costo mes a mes de infraestructura.
 *
 * Los ciclos no coinciden con el calendario —Vercel corta el 29, Neon el 1,
 * Railway el 13— asi que agrupar por fecha de inicio da un mes con tres
 * proveedores y otro con uno. Cada ciclo se asigna al mes donde cae su PUNTO
 * MEDIO, que es el mes que mayormente cubre.
 *
 * Claude queda afuera: es herramienta de trabajo, monto fijo, y meterlo en la
 * serie aplasta todo lo demas contra el piso del grafico.
 */

export interface MesDeCosto {
  /** 'YYYY-MM' */
  mes: string
  porProveedor: Partial<Record<Provider, number>>
  total: number
  /** Ningun ciclo del mes sigue abierto: el numero ya no se mueve. */
  cerrado: boolean
}

const FUERA = new Set<string>(['anthropic'])

export async function getMonthlyCosts(meses = 6): Promise<MesDeCosto[]> {
  const [{ data: facturas }, { data: cargos }] = await Promise.all([
    supabase
      .from('provider_invoices')
      .select('provider, period_start, period_end, amount')
      .order('period_start', { ascending: true }),
    supabase.from('provider_charges').select('provider, cycle_start, cycle_end, amount_projected'),
  ])

  const acc = new Map<string, { porProveedor: Map<Provider, number>; abierto: boolean }>()

  const sumar = (
    provider: Provider,
    inicio: string,
    fin: string,
    monto: number,
    abierto: boolean
  ) => {
    if (FUERA.has(provider) || !(monto > 0)) return
    // Un cargo de un solo dia es una compra suelta, no un ciclo: va a su dia.
    const medio = new Date((Date.parse(inicio) + Date.parse(fin)) / 2)
    const mes = `${medio.getUTCFullYear()}-${String(medio.getUTCMonth() + 1).padStart(2, '0')}`
    const e = acc.get(mes) ?? { porProveedor: new Map(), abierto: false }
    e.porProveedor.set(provider, (e.porProveedor.get(provider) ?? 0) + monto)
    if (abierto) e.abierto = true
    acc.set(mes, e)
  }

  for (const f of facturas ?? []) {
    sumar(f.provider as Provider, f.period_start, f.period_end, Number(f.amount), false)
  }

  // El ciclo en curso de cada proveedor, con su proyeccion. Solo si no hay ya
  // una factura que lo cubra: la factura siempre gana.
  const yaFacturado = new Set((facturas ?? []).map((f) => `${f.provider}:${f.period_start}`))
  for (const c of cargos ?? []) {
    if (yaFacturado.has(`${c.provider}:${c.cycle_start}`)) continue
    sumar(
      c.provider as Provider,
      c.cycle_start,
      c.cycle_end,
      Number(c.amount_projected ?? 0),
      true
    )
  }

  return [...acc.entries()]
    .map(([mes, e]) => {
      const porProveedor = Object.fromEntries(e.porProveedor) as Partial<Record<Provider, number>>
      return {
        mes,
        porProveedor,
        total: [...e.porProveedor.values()].reduce((a, b) => a + b, 0),
        cerrado: !e.abierto,
      }
    })
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-meses)
}

export interface SaludProyecto {
  slug: string
  uptimePct: number
  p95Ms: number | null
  avgMs: number | null
  dias: number
  caidas: number
}

/** Uptime y latencia de los ultimos N dias, por proyecto. */
export async function getSaludMensual(dias = 30): Promise<SaludProyecto[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('health_daily')
    .select('project_slug, checks_total, checks_up, checks_down, avg_response_ms, p95_response_ms')
    .gte('day', desde)

  const acc = new Map<
    string,
    { total: number; up: number; down: number; p95: number[]; avg: number[]; dias: number }
  >()
  for (const r of data ?? []) {
    const k = r.project_slug as string
    const e = acc.get(k) ?? { total: 0, up: 0, down: 0, p95: [], avg: [], dias: 0 }
    e.total += Number(r.checks_total ?? 0)
    e.up += Number(r.checks_up ?? 0)
    e.down += Number(r.checks_down ?? 0)
    if (r.p95_response_ms) e.p95.push(Number(r.p95_response_ms))
    if (r.avg_response_ms) e.avg.push(Number(r.avg_response_ms))
    e.dias++
    acc.set(k, e)
  }

  // p95 del periodo: el peor dia, no el promedio de los p95. Lo que interesa es
  // cuanto llego a tardar, no cuanto tarda en promedio un dia promedio.
  return [...acc.entries()]
    .map(([slug, e]) => ({
      slug,
      uptimePct: e.total > 0 ? (e.up / e.total) * 100 : 0,
      p95Ms: e.p95.length ? Math.max(...e.p95) : null,
      avgMs: e.avg.length ? Math.round(e.avg.reduce((a, b) => a + b, 0) / e.avg.length) : null,
      dias: e.dias,
      caidas: e.down,
    }))
    .sort((a, b) => a.uptimePct - b.uptimePct || (b.p95Ms ?? 0) - (a.p95Ms ?? 0))
}
