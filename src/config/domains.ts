/**
 * Vencimientos de dominios.
 *
 * Existe porque el 22/10/2026 meleroller.com.ar se cayo y tardamos en entender
 * por que: no era el hosting, era el dominio vencido un mes antes. NIC le habia
 * quitado la delegacion. El monitoreo chequeaba que el sitio respondiera, pero
 * nadie miraba las fechas.
 *
 * Los `.com` se refrescan solos por RDAP. Los `.com.ar` NO: IANA anuncia
 * `https://rdap.nic.ar/` para `.ar`, pero el host resuelve y no acepta
 * conexiones (probado el 29/10/2026: timeout). Solo queda WHOIS en el puerto 43.
 * Para esos la fecha vive aca y se actualiza a mano cuando se renueva.
 *
 * El riesgo de eso es la ALERTA FALSA, no el olvido: si el dominio se renueva y
 * nadie toca este archivo, el dashboard grita "vencido" para siempre. Paso con
 * meleroller.com.ar, renovado el 23/10/2026 y todavia en rojo el 29/10. Para
 * auditar las fechas contra el registro, desde la Mac (no desde serverless):
 *
 *   whois -h whois.nic.ar <dominio>.com.ar | grep expire
 *   curl -sH 'Accept: application/rdap+json' \
 *     https://rdap.verisign.com/com/v1/domain/<dominio>.com | jq '.events'
 */

export interface DominioVigilado {
  dominio: string
  /** Proyecto al que sirve, para saber que se cae si vence. */
  proyecto: string
  /** ISO. Para los .com es un respaldo: RDAP manda si responde. */
  vence: string
  registrador: string
  /** Quien lo tiene que renovar. Casi nunca es Rodrigo. */
  titular: string
}

export const DOMINIOS: DominioVigilado[] = [
  // ── Por fecha de vencimiento ─────────────────────────────────────────────
  {
    // OJO: NO es el club. Es la TIENDA Shopify (`bnwyf7-dj.myshopify.com`), que
    // no esta en `projects.ts` porque no se monitorea como app. Apunta a
    // 23.227.38.32 y www a shops.myshopify.com. El club es pilatesbasicsclub.com,
    // mas abajo. Estuvo mal etiquetado como 'compactfit-membresias' hasta el
    // 29/10/2026 — la alerta apuntaba al sistema equivocado.
    // Registro Y DNS estan los dos en GoDaddy: si vence, se cae la zona entera.
    dominio: 'compactfit-pilatesbasics.com',
    proyecto: 'compactfit-pilatesbasics (tienda Shopify)',
    vence: '2026-11-06',
    registrador: 'GoDaddy',
    titular: 'CompactFit',
  },
  {
    dominio: 'rodrigoplutino.com.ar',
    proyecto: 'sitioweb-rodrigoplutino',
    vence: '2027-03-17',
    registrador: 'NIC Argentina',
    titular: 'PLUTINO RODRIGO IVAN',
  },
  {
    dominio: 'rok.com.ar',
    proyecto: 'rok-studio',
    vence: '2027-03-19',
    registrador: 'NIC Argentina',
    titular: 'PLUTINO RODRIGO IVAN',
  },
  {
    // Este si es el club (PB Club). Registro y DNS en Cloudflare, sirve Vercel.
    dominio: 'pilatesbasicsclub.com',
    proyecto: 'compactfit-membresias',
    vence: '2027-04-22',
    registrador: 'Cloudflare',
    titular: 'CompactFit',
  },
  {
    dominio: 'toll.com.ar',
    proyecto: 'toll-landing',
    vence: '2027-06-18',
    registrador: 'NIC Argentina',
    titular: 'MONTES QUINTANS VALENTIN',
  },
  {
    dominio: 'raceroom.com.ar',
    proyecto: 'simuladorvr',
    vence: '2027-07-16',
    registrador: 'NIC Argentina',
    titular: 'PLUTINO RODRIGO IVAN',
  },
  {
    dominio: 'plasdeko.com.ar',
    proyecto: 'plasdeko-store',
    vence: '2027-09-06',
    registrador: 'NIC Argentina',
    titular: 'FAGALDE Karina Andrea (CUIT 27227170668)',
  },
  {
    // Renovado el 23/10/2026. Estuvo vencido un mes y NIC le quito la
    // delegacion; ahora resuelve de nuevo a Vercel. La fecha la confirmo WHOIS
    // el 29/10/2026 — ver la cabecera de este archivo sobre por que se revisa a mano.
    dominio: 'meleroller.com.ar',
    proyecto: 'meller',
    vence: '2027-09-22',
    registrador: 'NIC Argentina',
    titular: 'Oscar Alberto MELE (CUIT 20323824801)',
  },
  {
    dominio: 'argentumsubastas.com',
    proyecto: 'argentum-web',
    vence: '2028-05-19',
    registrador: 'GoDaddy',
    titular: 'Argentum',
  },
  {
    dominio: 'compactfitclub.com',
    proyecto: 'powerseries-club',
    vence: '2029-08-12',
    registrador: 'GoDaddy',
    titular: 'CompactFit',
  },
]

/** A partir de aca conviene enterarse. Un .com.ar tarda dias en renovarse. */
export const AVISAR_DIAS = 45
