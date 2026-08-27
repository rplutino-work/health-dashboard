import { supabase } from '@/lib/supabase'
import { getCostBreakdown, getFx } from '@/lib/costs'
import type { Provider } from '@/lib/types'

/**
 * Historia de facturación.
 *
 * Se guarda un snapshot por día de cada ciclo abierto, no solo el total al
 * cerrar. La diferencia importa: con el total se sabe cuánto se pagó, con la
 * serie se sabe QUÉ DÍA se disparó el gasto y se pueden comparar dos ciclos en
 * el mismo punto ("al día 15 íbamos por US$30, ahora vamos por US$50").
 *
 * El tipo de cambio se congela en cada fila. Convertir un ciclo de hace tres
 * meses con la cotización de hoy daría un número en pesos que nunca se pagó.
 */

export interface HistoryRow {
  provider: Provider
  cycleStart: string
  cycleEnd: string
  snapshotDay: string
  amountUsd: number
  amountArs: number | null
  fxTarjeta: number | null
  consumption: number | null
  unit: string | null
  isFinal: boolean
  perProject: Record<string, number> | null
}

export interface SnapshotReport {
  written: number
  closed: number
}

/**
 * Guarda el estado de hoy de cada ciclo y marca como definitivos los que ya
 * cerraron. Idempotente: correrlo dos veces el mismo día pisa la fila, no
 * duplica.
 */
export async function snapshotBilling(): Promise<SnapshotReport> {
  const [breakdown, fx] = await Promise.all([getCostBreakdown(), getFx(2)])
  const today = new Date().toISOString().slice(0, 10)
  const rate = fx.tarjeta ?? fx.oficial

  const rows = breakdown.charges.map((c) => {
    // Reparto por proyecto de ESTE proveedor, para poder reconstruir después
    // quién gastó qué en un ciclo ya cerrado.
    const perProject: Record<string, number> = {}
    for (const p of breakdown.projects) {
      const own = p.resources
        .filter((r) => r.provider === c.provider && r.cost !== null)
        .reduce((a, b) => a + (b.cost ?? 0), 0)
      if (own > 0) perProject[p.slug] = Number(own.toFixed(4))
    }

    const consumption = breakdown.projects
      .flatMap((p) => p.resources)
      .filter((r) => r.provider === c.provider)
      .reduce((a, b) => a + b.value, 0)

    return {
      provider: c.provider,
      cycle_start: c.cycleStart,
      cycle_end: c.cycleEnd,
      snapshot_day: today,
      amount_usd: c.amountToDate,
      consumption: consumption > 0 ? consumption : null,
      unit: c.provider === 'neon' ? 'CU-h' : null,
      fx_oficial: fx.oficial,
      fx_tarjeta: fx.tarjeta,
      amount_ars: rate ? Number((c.amountToDate * rate).toFixed(2)) : null,
      per_project: perProject,
      // El ciclo ya cerró: este es el valor definitivo del período.
      is_final: Date.parse(c.cycleEnd) <= Date.now(),
    }
  })

  if (rows.length === 0) return { written: 0, closed: 0 }

  const { error } = await supabase
    .from('billing_history')
    .upsert(rows, { onConflict: 'provider,cycle_start,snapshot_day' })

  if (error) throw new Error(`billing_history: ${error.message}`)

  return {
    written: rows.length,
    closed: rows.filter((r) => r.is_final).length,
  }
}

/** Ciclos ya cerrados, uno por proveedor y período: la historia de lo pagado. */
export async function getClosedCycles(limit = 24): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('billing_history')
    .select('*')
    .eq('is_final', true)
    .order('cycle_end', { ascending: false })
    .limit(limit * 4)

  // De cada ciclo cerrado interesa el último snapshot: es el total definitivo.
  const best = new Map<string, HistoryRow>()
  for (const r of data ?? []) {
    const key = `${r.provider}:${r.cycle_start}`
    const prev = best.get(key)
    if (!prev || r.snapshot_day > prev.snapshotDay) {
      best.set(key, toRow(r))
    }
  }
  return [...best.values()]
    .sort((a, b) => b.cycleEnd.localeCompare(a.cycleEnd))
    .slice(0, limit)
}

/** Evolución dentro del ciclo en curso de un proveedor. */
export async function getCycleProgress(provider: Provider): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('billing_history')
    .select('*')
    .eq('provider', provider)
    .eq('is_final', false)
    .order('snapshot_day', { ascending: true })
    .limit(40)
  return (data ?? []).map(toRow)
}

function toRow(r: Record<string, unknown>): HistoryRow {
  return {
    provider: r.provider as Provider,
    cycleStart: r.cycle_start as string,
    cycleEnd: r.cycle_end as string,
    snapshotDay: r.snapshot_day as string,
    amountUsd: Number(r.amount_usd),
    amountArs: r.amount_ars !== null ? Number(r.amount_ars) : null,
    fxTarjeta: r.fx_tarjeta !== null ? Number(r.fx_tarjeta) : null,
    consumption: r.consumption !== null ? Number(r.consumption) : null,
    unit: (r.unit as string) ?? null,
    isFinal: Boolean(r.is_final),
    perProject: (r.per_project as Record<string, number>) ?? null,
  }
}
