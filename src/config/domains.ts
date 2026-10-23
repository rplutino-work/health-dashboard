/**
 * Vencimientos de dominios.
 *
 * Existe porque el 22/10/2026 meleroller.com.ar se cayo y tardamos en entender
 * por que: no era el hosting, era el dominio vencido un mes antes. NIC le habia
 * quitado la delegacion. El monitoreo chequeaba que el sitio respondiera, pero
 * nadie miraba las fechas.
 *
 * Los `.com` se refrescan solos por RDAP. Los `.com.ar` NO: NIC Argentina no
 * tiene RDAP y su WHOIS es puerto 43, que una funcion serverless no puede usar.
 * Para esos la fecha vive aca y se actualiza a mano cuando se renueva — que es
 * una vez por año y la alerta avisa antes.
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
  // ── Vencido: NIC le quito la delegacion, el sitio no resuelve ────────────
  {
    dominio: 'meleroller.com.ar',
    proyecto: 'meller',
    vence: '2026-09-22',
    registrador: 'NIC Argentina',
    titular: 'Oscar Alberto MELE (CUIT 20323824801)',
  },
  // ── El resto, por fecha ──────────────────────────────────────────────────
  {
    dominio: 'compactfit-pilatesbasics.com',
    proyecto: 'compactfit-membresias',
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
