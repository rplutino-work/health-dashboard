import { supabase } from '@/lib/supabase'
import type { Provider } from '@/lib/types'

/**
 * Mantiene al día la tabla de cargos.
 *
 * Antes `provider_charges` se cargaba a mano copiando los paneles de facturación.
 * Eso tenía dos fallas que se vieron el 01/09: los montos quedaban congelados en
 * la fecha de la última copia, y cuando un ciclo cerraba la fila seguía diciendo
 * "en curso" con el número del ciclo viejo. Un dashboard de costos que muestra el
 * mes pasado como si fuera el actual es peor que no tener dashboard.
 *
 * Acá se resuelven las dos cosas:
 *   1. Neon se calcula solo, a partir del consumo que ya medimos.
 *   2. Todos los ciclos avanzan cuando vencen, y el que no se puede recalcular
 *      queda marcado como viejo en vez de mentir.
 */

// ── Tarifas de Neon ────────────────────────────────────────────────────────
//
// Calibradas contra la única lectura real del panel (27/08/2026):
//   compute  603.69 CU-h  -> US$63.95   =>  US$0.10593 / CU-h
//   storage    0.81 GB-mes -> US$ 0.28  =>  US$0.346  / GB-mes
//
// El de storage cae en la tarifa publicada de Neon (US$0.35/GB-mes), lo que
// confirma que esta cuenta se factura por uso puro: si hubiera franquicia de
// storage incluida, 0.81 GB costarían cero y cuestan US$0.28. Por eso el modelo
// NO asume las 300 CU-h incluidas del plan Launch — asumirlas daba US$67.59
// contra los US$64.23 que efectivamente marcaba el panel.
//
// El plan Launch cobra un mínimo mensual de US$19 que el uso va consumiendo,
// así que la factura es el mayor entre ese piso y el uso del ciclo.
const NEON_RATE_CU_HOUR = 0.10593
const NEON_RATE_GB_MONTH = 0.346
const NEON_PLAN_FLOOR = 19

export interface ChargeRefresh {
  provider: Provider
  action: 'recalculado' | 'ciclo-avanzado' | 'sin-cambios' | 'marcado-viejo'
  amount: number | null
  cycle: string
  note?: string
}

/**
 * Avanza un ciclo mensual hasta que contenga a `now`.
 *
 * Los ciclos son mensuales pero no arrancan el día 1 (Vercel el 29, Railway el
 * 14, Anthropic el 11), así que se corre mes a mes preservando el día.
 */
function advanceCycle(start: string, end: string, now: number): { start: string; end: string } {
  let s = new Date(start + 'T00:00:00Z')
  let e = new Date(end + 'T00:00:00Z')
  let guard = 0
  while (e.getTime() <= now && guard++ < 60) {
    s = e
    const next = new Date(e)
    next.setUTCMonth(next.getUTCMonth() + 1)
    e = next
  }
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) }
}

/**
 * Consumo del ciclo en curso de Neon.
 *
 * Neon resetea el contador de cada proyecto por separado, no todo junto, y a un
 * proyecto suspendido no se lo resetea hasta que vuelve a despertar: la API
 * sigue devolviendo el valor del ciclo anterior, congelado. El 01/09 eso hacía
 * que plasdeko, argentum y frutos-secos (los tres ya migrados fuera de Neon)
 * aportaran 179 CU-h de agosto a la cuenta de septiembre.
 *
 * La regla que distingue los dos casos: si el valor de ahora es MENOR que el de
 * antes del corte, el contador reseteó y lo de ahora es del ciclo nuevo. Si no
 * bajó, el proyecto está dormido y todavía muestra lo viejo — su consumo del
 * ciclo nuevo es lo que haya subido desde el corte, que para un idle es cero.
 */
async function neonCurrentUsage(
  cycleStart: string
): Promise<{ cuHours: number; gb: number; at: string; stale: string[] } | null> {
  const { data } = await supabase
    .from('provider_usage')
    .select('resource_ref, metric, value, captured_at')
    .eq('provider', 'neon')
    .in('metric', ['cu_hours', 'storage_bytes'])
    .gte('captured_at', new Date(Date.parse(cycleStart) - 3 * 86400000).toISOString())
    .order('captured_at', { ascending: false })
    .limit(4000)

  if (!data || data.length === 0) return null
  const at = data[0].captured_at as string
  const boundary = Date.parse(cycleStart)

  // Último valor de cada proyecto, y el último ANTES de que abriera el ciclo.
  const now = new Map<string, number>()
  const before = new Map<string, number>()
  let bytes = 0

  for (const r of data) {
    // Se agrupa por resource_ref (la base) y no por project_slug: el contador
    // lo resetea Neon por base, y desde que un proyecto puede tener varias
    // (argentum = produccion + staging) agrupar por slug mezclaba dos series
    // distintas en una sola.
    const key = r.resource_ref as string
    if (r.metric === 'storage_bytes') {
      if (r.captured_at === at) bytes += Number(r.value)
      continue
    }
    const t = Date.parse(r.captured_at as string)
    const v = Number(r.value)
    if (t >= boundary) {
      if (!now.has(key)) now.set(key, v)
    } else if (!before.has(key)) {
      before.set(key, v)
    }
  }

  let cuHours = 0
  const stale: string[] = []
  for (const [key, v] of now) {
    const prev = before.get(key)
    if (prev === undefined || v < prev) {
      cuHours += v // resetéo: lo de ahora ya es del ciclo nuevo
    } else {
      const grew = v - prev
      cuHours += grew // dormido: solo cuenta lo que efectivamente subió
      if (grew < 0.05) stale.push(key)
    }
  }

  return { cuHours, gb: bytes / 1e9, at, stale }
}

/**
 * Ritmo de consumo de Neon en CU-h por día, medido sobre los últimos 7 días.
 *
 * Extrapolar el total del ciclo dividido por la fracción transcurrida no sirve
 * al principio del período: el 01/09, con 0.75 de 30 días corridos, daba una
 * proyección de US$178 sobre un consumo real de US$4. Con deltas el número no
 * depende de dónde esté parado el ciclo.
 *
 * Los saltos negativos son el reseteo del contador y se descartan en vez de
 * restarse.
 */
async function neonDailyRate(): Promise<number | null> {
  const from = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data } = await supabase
    .from('provider_usage')
    .select('resource_ref, value, captured_at')
    .eq('provider', 'neon')
    .eq('metric', 'cu_hours')
    .gte('captured_at', from)
    .order('captured_at', { ascending: true })
    .limit(4000)

  if (!data || data.length < 2) return null

  const series = new Map<string, Array<{ t: number; v: number }>>()
  for (const r of data) {
    const key = r.resource_ref as string // por base, no por proyecto
    if (!series.has(key)) series.set(key, [])
    series.get(key)!.push({ t: Date.parse(r.captured_at as string), v: Number(r.value) })
  }

  let total = 0
  for (const points of series.values()) {
    for (let i = 1; i < points.length; i++) {
      const d = points[i].v - points[i - 1].v
      if (d > 0) total += d // un salto negativo es el reseteo, no consumo negativo
    }
  }

  const first = Date.parse(data[0].captured_at as string)
  const last = Date.parse(data[data.length - 1].captured_at as string)
  const days = (last - first) / 86400000
  return days >= 1 ? total / days : null
}

/**
 * Recalcula lo que se puede y avanza lo que venció.
 *
 * Neon se deriva del consumo medido. Los demás proveedores no exponen su
 * facturación con las credenciales que tenemos, así que lo único honesto es
 * avanzar el ciclo y blanquear el monto: es preferible un "sin dato" a un número
 * del mes pasado disfrazado de actual.
 */
export async function refreshCharges(): Promise<ChargeRefresh[]> {
  const { data: rows } = await supabase.from('provider_charges').select('*')
  if (!rows) return []

  const now = Date.now()
  const out: ChargeRefresh[] = []

  for (const r of rows) {
    const provider = r.provider as Provider
    const rolled = advanceCycle(r.cycle_start, r.cycle_end, now)
    const didRoll = rolled.start !== r.cycle_start
    const cycle = `${rolled.start}->${rolled.end}`

    if (provider === 'neon') {
      const u = await neonCurrentUsage(rolled.start)
      if (!u) {
        out.push({ provider, action: 'sin-cambios', amount: null, cycle, note: 'sin consumo medido' })
        continue
      }

      const compute = u.cuHours * NEON_RATE_CU_HOUR
      const storage = u.gb * NEON_RATE_GB_MONTH
      const usage = compute + storage
      const amount = Math.max(usage, NEON_PLAN_FLOOR)

      // Proyección: lo ya consumido más lo que falta del ciclo al ritmo medido
      // de los últimos 7 días. Si todavía no hay serie suficiente se proyecta el
      // piso del plan, que es lo mínimo que se va a pagar igual.
      const start = Date.parse(rolled.start)
      const end = Date.parse(rolled.end)
      const rate = await neonDailyRate()
      const daysLeft = Math.max((end - now) / 86400000, 0)
      const projected =
        rate === null
          ? Math.max(usage, NEON_PLAN_FLOOR)
          : Math.max(usage + rate * daysLeft * NEON_RATE_CU_HOUR, NEON_PLAN_FLOOR)

      await supabase.from('provider_charges').upsert(
        {
          provider,
          plan: 'Launch',
          cycle_start: rolled.start,
          cycle_end: rolled.end,
          amount_to_date: Number(amount.toFixed(2)),
          amount_projected: Number(projected.toFixed(2)),
          breakdown: {
            compute: { usage: `${u.cuHours.toFixed(2)} CU-h`, charge: Number(compute.toFixed(2)) },
            storage: { usage: `${u.gb.toFixed(2)} GB-mes`, charge: Number(storage.toFixed(2)) },
            ...(usage < NEON_PLAN_FLOOR
              ? { piso_del_plan: { usage: 'mínimo Launch', charge: Number((NEON_PLAN_FLOOR - usage).toFixed(2)) } }
              : {}),
          },
          source: 'derived',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      )

      out.push({
        provider,
        action: didRoll ? 'ciclo-avanzado' : 'recalculado',
        amount: Number(amount.toFixed(2)),
        cycle,
        note:
          `${u.cuHours.toFixed(1)} CU-h medidas` +
          (u.stale.length ? ` · ${u.stale.length} proyecto(s) dormido(s) sin resetear` : ''),
      })
      continue
    }

    if (!didRoll) {
      out.push({ provider, action: 'sin-cambios', amount: Number(r.amount_to_date), cycle })
      continue
    }

    // Ciclo vencido y sin forma de recalcularlo: se abre el nuevo en cero y se
    // marca 'stale'. El monto viejo ya quedó guardado en billing_history como
    // definitivo, así que no se pierde: deja de hacerse pasar por el actual.
    await supabase.from('provider_charges').upsert(
      {
        provider,
        plan: r.plan,
        cycle_start: rolled.start,
        cycle_end: rolled.end,
        amount_to_date: 0,
        amount_projected: null,
        breakdown: null,
        source: 'stale',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    )

    out.push({
      provider,
      action: 'marcado-viejo',
      amount: 0,
      cycle,
      note: `cerró en US$${Number(r.amount_to_date).toFixed(2)}, falta cargar el nuevo`,
    })
  }

  return out
}
