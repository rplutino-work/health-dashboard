import { DOMINIOS, AVISAR_DIAS, type DominioVigilado } from '@/config/domains'

/**
 * Cuanto le queda a cada dominio.
 *
 * Los `.com` se consultan por RDAP, que es HTTP y anda desde serverless. Los
 * `.com.ar` no tienen RDAP —NIC Argentina solo expone WHOIS en el puerto 43—
 * asi que para esos vale la fecha guardada en config.
 */

export interface EstadoDominio extends DominioVigilado {
  diasRestantes: number
  /** De donde salio la fecha que se esta usando. */
  fuente: 'rdap' | 'config'
  vencido: boolean
  porVencer: boolean
}

const RDAP: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
}

async function vencimientoRdap(dominio: string): Promise<string | null> {
  const tld = dominio.split('.').pop() ?? ''
  const base = RDAP[tld]
  if (!base) return null
  try {
    const res = await fetch(base + dominio, {
      headers: { Accept: 'application/rdap+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const d = (await res.json()) as { events?: Array<{ eventAction: string; eventDate: string }> }
    const ev = d.events?.find((e) => e.eventAction === 'expiration')
    // Se devuelve el instante completo y NO `.slice(0, 10)`: la hora es justo la
    // precision que hace falta mas abajo para no declarar vencido un dominio que
    // todavia esta vivo.
    return ev?.eventDate ?? null
  } catch {
    return null // sin RDAP se usa la fecha de config, que es mejor que nada
  }
}

export async function revisarDominios(): Promise<EstadoDominio[]> {
  const hoy = Date.now()
  return Promise.all(
    DOMINIOS.map(async (d) => {
      const fresca = await vencimientoRdap(d.dominio)

      // El vencimiento tiene HORA, y redondear al dia la adelantaba.
      // `compactfit-pilatesbasics.com` vencia el 2026-11-06T18:27:35Z;
      // `Date.parse('2026-11-06')` es la medianoche UTC de ese dia, asi que a
      // las 14:30 el calculo daba -0,6, el `floor` lo dejaba en -1 y el panel
      // anuncio "vencido hace 1 dias" un dominio que seguia resolviendo y
      // respondiendo 200. Un monitoreo que grita antes de hora entrena a que lo
      // ignoren, igual que uno que no grita.
      //
      // Las fechas de config no traen hora: valen hasta el final de su dia.
      const instante = fresca
        ? Date.parse(fresca)
        : Date.parse(`${d.vence}T23:59:59Z`)
      const dias = Math.floor((instante - hoy) / 86400000)
      return {
        ...d,
        vence: fresca ? fresca.slice(0, 10) : d.vence,
        diasRestantes: dias,
        fuente: fresca ? ('rdap' as const) : ('config' as const),
        vencido: dias < 0,
        porVencer: dias >= 0 && dias <= AVISAR_DIAS,
      }
    })
  )
}

/** Los que hay que mirar hoy, del mas urgente al menos. */
export function urgentes(estados: EstadoDominio[]): EstadoDominio[] {
  return estados
    .filter((e) => e.vencido || e.porVencer)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
}
