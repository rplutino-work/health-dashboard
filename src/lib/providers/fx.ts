/**
 * Cotización del dólar en Argentina.
 *
 * El gasto está en dólares pero se paga en pesos, así que la factura puede subir
 * sin que se consuma un byte más. Guardar la serie diaria permite separar una
 * cosa de la otra: cuánto subió por consumo y cuánto por tipo de cambio.
 *
 * Se guardan dos casas y cada una responde algo distinto:
 *   OFICIAL  la referencia del BCRA
 *   TARJETA  oficial más impuestos — es el que se aplica realmente al pagar
 *            servicios del exterior con tarjeta argentina, y hoy está ~30% arriba
 *
 * Mostrar el costo al oficial sería subestimarlo en casi un tercio.
 */

const DOLAR_API = 'https://dolarapi.com/v1/dolares'

export interface FxQuote {
  casa: string
  compra: number | null
  venta: number | null
  updatedAt: string | null
}

/** Casas que se guardan. El resto no aporta para este uso. */
const CASAS = ['oficial', 'tarjeta'] as const

export async function collectFx(): Promise<FxQuote[]> {
  const res = await fetch(DOLAR_API, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`dolarapi ${res.status}: ${(await res.text()).slice(0, 120)}`)
  }

  const all = (await res.json()) as Array<{
    casa: string
    compra: number | null
    venta: number | null
    fechaActualizacion: string | null
  }>

  return all
    .filter((q) => (CASAS as readonly string[]).includes(q.casa))
    .map((q) => ({
      casa: q.casa,
      compra: q.compra,
      venta: q.venta,
      updatedAt: q.fechaActualizacion,
    }))
}
