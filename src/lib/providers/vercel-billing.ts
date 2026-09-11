/**
 * Facturación real de Vercel.
 *
 * Antes el monto de Vercel se cargaba a mano copiando el panel, y al rotar el
 * ciclo quedaba en cero: el dashboard mostraba US$0 para un proveedor que sí
 * cobra. Este colector lo saca de la API de cargos, que es la misma fuente que
 * usa `vercel usage`.
 *
 * Hay dos montos y no significan lo mismo:
 *   - EffectiveCost: el consumo bruto.
 *   - BilledCost:    lo que efectivamente se cobra.
 * El plan Pro incluye consumo, así que al principio del ciclo BilledCost es cero
 * aunque el consumo ya sea alto. Mostrar el bruto como si fuera la factura
 * asustaría sin motivo.
 */

const API = 'https://api.vercel.com'

/**
 * Consumo incluido antes de empezar a facturar, medido sobre el ciclo cerrado
 * 29/07–29/08: US$76.47 de consumo derivaron en US$49.20 facturados. El plan
 * declara US$20 incluidos; la diferencia real fue mayor, así que se usa la
 * observada y no la declarada.
 */
const ALLOWANCE_USD = 27.27

export interface VercelCharge {
  amountToDate: number
  amountProjected: number
  effectiveToDate: number
  breakdown: Record<string, { usage: string; charge: number }>
}

export async function collectVercelCharge(
  token: string,
  teamId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<VercelCharge | null> {
  // El `to` se corta en hoy, nunca en el fin del ciclo. Pidiendo una fecha
  // futura la API devuelve mas del doble de cargos (53.847 contra 22.412) y
  // montos que no coinciden con `vercel usage` — trae cosas que todavia no
  // pasaron. Lo que se quiere es lo gastado hasta ahora.
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < cycleEnd ? hoy : cycleEnd
  const url = `${API}/v1/billing/charges?teamId=${teamId}&from=${cycleStart}&to=${hasta}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`vercel billing: HTTP ${res.status}`)

  // La respuesta viene como JSON por línea (NDJSON), no como un array.
  const text = await res.text()
  const rows: Array<Record<string, unknown>> = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try {
      rows.push(JSON.parse(t))
    } catch {
      // una línea cortada no invalida el resto
    }
  }
  if (rows.length === 0) return null

  let effective = 0
  let billed = 0
  const byService: Record<string, { usage: string; charge: number }> = {}

  for (const r of rows) {
    const e = Number(r.EffectiveCost ?? 0)
    const b = Number(r.BilledCost ?? 0)
    effective += e
    billed += b
    const name = String(r.ServiceName ?? 'otros')
    const prev = byService[name]?.charge ?? 0
    byService[name] = { usage: '', charge: Number((prev + e).toFixed(4)) }
  }

  // Solo las líneas que mueven la aguja, de mayor a menor.
  const top = Object.entries(byService)
    .filter(([, v]) => v.charge >= 0.01)
    .sort((a, b) => b[1].charge - a[1].charge)
    .slice(0, 8)

  const start = Date.parse(cycleStart)
  const end = Date.parse(cycleEnd)
  const pct = Math.min(Math.max((Date.parse(hasta) - start) / (end - start), 0.001), 1)
  const effectiveProjected = effective / pct

  // Mientras no se facture nada, proyectar el bruto menos lo incluido; una vez
  // que empezó a facturar, extrapolar lo facturado, que ya es el dato real.
  const projected =
    billed > 0.01 ? billed / pct : Math.max(effectiveProjected - ALLOWANCE_USD, 0)

  return {
    amountToDate: Number(billed.toFixed(2)),
    amountProjected: Number(projected.toFixed(2)),
    effectiveToDate: Number(effective.toFixed(2)),
    breakdown: Object.fromEntries(
      top.map(([k, v]) => [k, { usage: `US$${v.charge.toFixed(2)} de consumo`, charge: v.charge }])
    ),
  }
}
