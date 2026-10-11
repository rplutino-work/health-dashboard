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
 * Consumo que el plan absorbe antes de facturar.
 *
 * Medido sobre los dos ciclos cerrados con datos completos:
 *   29/07-29/08  consumo US$76.47 - facturado US$56.47 = US$20.00
 *   29/08-29/09  consumo US$58.82 - facturado US$38.84 = US$19.98
 *
 * Son exactamente los US$20 incluidos del plan Pro. Antes esta constante decia
 * 27.27, sacado de una lectura truncada; con los datos enteros la regla es
 * simple: facturado = consumo - 20.
 */
const ALLOWANCE_USD = 20

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
  let hasta = hoy < cycleEnd ? hoy : cycleEnd
  // El primer dia del ciclo `from` y `to` coinciden y la API rechaza el rango,
  // el colector se caia y el cargo quedaba arrastrado del mes anterior. Se pide
  // al menos un dia.
  if (hasta <= cycleStart) {
    const d = new Date(`${cycleStart}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    hasta = d.toISOString().slice(0, 10)
  }
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
    byService[name] = { usage: '', charge: Number((prev + b).toFixed(4)) }
  }

  // Control de que la respuesta llego entera.
  //
  // Son decenas de miles de lineas JSONL y si el stream se corta el total sale
  // bajo sin avisar: pidiendo el ciclo 29/08-29/09 se leyeron 7 de 31 dias y
  // daba US$23.66 cuando la factura fue US$38.82.
  //
  // Se mide por COBERTURA DE DIAS, no por el renglon del plan. El primer
  // intento usaba el plan Pro como testigo asumiendo que se prorratea parejo;
  // no sirve: Vercel lo asigna a distintos dias segun el rango que se pida, y
  // el control fallaba con respuestas completas —21.420 filas y Pro en cero—
  // dejando el cargo congelado en el valor viejo.
  const diasPedidos = Math.round((Date.parse(hasta) - Date.parse(cycleStart)) / 86400000)
  const diasPresentes = new Set(
    rows.map((r) => String(r.ChargePeriodStart ?? '').slice(0, 10)).filter(Boolean)
  ).size
  if (diasPedidos >= 2 && diasPresentes < diasPedidos * 0.8) {
    throw new Error(
      `vercel billing: respuesta incompleta (${diasPresentes} dias de ${diasPedidos} pedidos)`
    )
  }

  // Solo las líneas que mueven la aguja, de mayor a menor.
  const top = Object.entries(byService)
    .filter(([, v]) => v.charge >= 0.01)
    .sort((a, b) => b[1].charge - a[1].charge)
    .slice(0, 8)

  // Proyeccion desde el ritmo RECIENTE, no desde el promedio del ciclo.
  //
  // Promediar todo el ciclo deja la proyeccion pegada al pasado: el 11/10 se
  // apago Observability Plus para toda la cuenta —el renglon mas caro— y la
  // proyeccion seguia dando US$55 porque arrastraba doce dias con el prendido.
  // Se usan los ultimos 3 dias CERRADOS; el de hoy va incompleto y bajaria el
  // promedio sin motivo.
  const porDia = new Map<string, number>()
  for (const r of rows) {
    const d = String(r.ChargePeriodStart ?? '').slice(0, 10)
    if (!d) continue
    porDia.set(d, (porDia.get(d) ?? 0) + Number(r.EffectiveCost ?? 0))
  }
  const hoyStr = new Date().toISOString().slice(0, 10)
  const cerrados = [...porDia.entries()]
    .filter(([d]) => d < hoyStr)
    .sort((a, b) => a[0].localeCompare(b[0]))
  const ultimos = cerrados.slice(-3)
  const ritmoDiario =
    ultimos.length > 0 ? ultimos.reduce((a, b) => a + b[1], 0) / ultimos.length : 0

  const end = Date.parse(cycleEnd)
  const diasRestantes = Math.max((end - Date.now()) / 86400000, 0)
  const effectiveProjected = effective + ritmoDiario * diasRestantes

  // Siempre se proyecta desde el consumo, nunca extrapolando lo facturado.
  //
  // Lo facturado NO crece en linea recta: el plan absorbe los primeros US$20,
  // asi que al principio del ciclo queda cerca de cero y recien despues
  // arranca. Extrapolarlo daba US$5.46 para un ciclo que va camino a US$55.
  const projected = Math.max(effectiveProjected - ALLOWANCE_USD, 0)

  return {
    amountToDate: Number(billed.toFixed(2)),
    amountProjected: Number(projected.toFixed(2)),
    effectiveToDate: Number(effective.toFixed(2)),
    breakdown: Object.fromEntries(
      top.map(([k, v]) => [k, { usage: `US$${v.charge.toFixed(2)} facturados`, charge: v.charge }])
    ),
  }
}
