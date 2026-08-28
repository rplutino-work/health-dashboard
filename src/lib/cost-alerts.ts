import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'
import { alertConfig, projects } from '@/config/projects'
import { getCostBreakdown, getFx } from '@/lib/costs'
import { renderEmail, subjectFor, renderBarChart, type EmailRow } from '@/lib/email-templates'

/**
 * Avisos de plata y de límites.
 *
 * Las alertas de caída ya existían; estas cubren lo que no se ve hasta que llega
 * la factura. Todas pasan por el mismo filtro: se manda mail solo cuando hay
 * algo que decidir. Un aviso que llega todos los días por lo mismo se deja de
 * leer, y entonces tampoco sirve para el día que importa.
 */

const DASHBOARD_URL = 'https://health-dashboard-kohl-delta.vercel.app'

/** Se avisa cuando la proyección del ciclo supera esto. */
const COST_ALERT_USD = Number(process.env.COST_ALERT_THRESHOLD_USD ?? 100)
/** Porcentaje de un límite del plan free a partir del cual conviene enterarse. */
const LIMIT_ALERT_PCT = 80
/** Un aviso del mismo tipo no se repite dentro de esta ventana. */
const COOLDOWN_HOURS = 24

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
}

async function alreadySent(type: string, hours = COOLDOWN_HOURS): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const { data } = await supabase
    .from('alert_log')
    .select('id')
    .eq('project_slug', '__system__')
    .eq('alert_type', type)
    .gte('sent_at', since)
    .limit(1)
  return !!data?.length
}

async function logSystemAlert(type: string) {
  // email_to es NOT NULL en alert_log: omitirlo hacia fallar el insert en
  // silencio, y sin registro el cooldown no se aplicaba nunca — el mismo aviso
  // salia en cada corrida del cron.
  const { error } = await supabase.from('alert_log').insert({
    project_slug: '__system__',
    check_name: 'cost',
    alert_type: type,
    sent_at: new Date().toISOString(),
    email_to: alertConfig.emailTo,
  })
  if (error) {
    // Si no se puede registrar, es preferible saberlo: la alternativa silenciosa
    // es spamear la casilla cada 30 minutos.
    console.error('No se pudo registrar la alerta:', error.message)
  }
}

function money(usd: number, rate: number | null) {
  const ars = rate ? ` · $${Math.round(usd * rate).toLocaleString('es-AR')}` : ''
  return `US$${usd.toFixed(2)}${ars}`
}

export interface CostAlertReport {
  sent: string[]
  skipped: string[]
}

export async function processCostAlerts(): Promise<CostAlertReport> {
  const sent: string[] = []
  const skipped: string[] = []

  const [breakdown, fx] = await Promise.all([getCostBreakdown(), getFx()])
  const rate = fx.oficial ?? fx.tarjeta

  // ── Proyección por encima del umbral ──────────────────────────────────────
  if (breakdown.totalProjected >= COST_ALERT_USD) {
    if (await alreadySent('cost_projection')) {
      skipped.push('cost_projection')
    } else {
      const top = breakdown.projects.filter((p) => (p.total ?? 0) > 0).slice(0, 5)
      const rows: EmailRow[] = [
        {
          label: 'Gasto a hoy',
          value: money(breakdown.totalToDate, rate),
        },
        {
          label: 'Proyectado al cierre',
          value: money(breakdown.totalProjected, rate),
          emphasis: true,
        },
        ...breakdown.charges
          .filter((c) => c.amountToDate > 0)
          .map((c) => ({
            label: `${c.provider} · cierra ${c.cycleEnd.slice(8, 10)}/${c.cycleEnd.slice(5, 7)}`,
            value: money(c.amountToDate, rate),
          })),
      ]

      const list = top
        .map(
          (p) =>
            `<li style="margin:2px 0;">${p.name} — <strong>US$${(p.total ?? 0).toFixed(2)}</strong></li>`
        )
        .join('')

      await resend().emails.send({
        from: 'Health Dashboard <onboarding@resend.dev>',
        to: alertConfig.emailTo,
        subject: subjectFor(
          'warning',
          `Infraestructura proyecta US$${breakdown.totalProjected.toFixed(0)} este ciclo`
        ),
        html: renderEmail({
          severity: 'warning',
          title: `Proyección: ${money(breakdown.totalProjected, rate)}`,
          subtitle: `Supera el umbral de US$${COST_ALERT_USD}. Los ciclos de cada proveedor cierran en fechas distintas.`,
          body: top.length
            ? `<p style="margin:0 0 8px;">Los que más pesan:</p><ul style="margin:0;padding-left:18px;">${list}</ul>`
            : undefined,
          rows,
          cta: { label: 'Ver el detalle', url: DASHBOARD_URL },
          footer: rate ? `Convertido al dólar oficial $${rate.toLocaleString('es-AR')}.` : undefined,
        }),
      })
      await logSystemAlert('cost_projection')
      sent.push('cost_projection')
    }
  }

  // ── Límites del plan free de Supabase ─────────────────────────────────────
  const limit = await checkSupabaseLimits()
  if (limit) {
    if (await alreadySent('supabase_limit')) {
      skipped.push('supabase_limit')
    } else {
      await resend().emails.send({
        from: 'Health Dashboard <onboarding@resend.dev>',
        to: alertConfig.emailTo,
        subject: subjectFor('warning', `Supabase al ${limit.pct.toFixed(0)}% de ${limit.what}`),
        html: renderEmail({
          severity: limit.pct >= 90 ? 'critical' : 'warning',
          title: `Supabase: ${limit.what} al ${limit.pct.toFixed(0)}%`,
          subtitle:
            'En el plan free no se cobra el excedente: se restringe el proyecto. Pasarse corta el servicio.',
          rows: [
            { label: limit.what, value: limit.detail, emphasis: true },
            { label: 'Plan', value: 'Free' },
          ],
          cta: { label: 'Ver el dashboard', url: DASHBOARD_URL },
        }),
      })
      await logSystemAlert('supabase_limit')
      sent.push('supabase_limit')
    }
  }

  return { sent, skipped }
}

async function checkSupabaseLimits() {
  const one = async (metric: string) => {
    const { data } = await supabase
      .from('provider_usage')
      .select('value')
      .eq('provider', 'supabase')
      .eq('metric', metric)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? Number(data.value) : null
  }

  const [dbBytes, conns, maxConns] = await Promise.all([
    one('db_bytes'),
    one('connections'),
    one('max_connections'),
  ])

  const dbMb = dbBytes ? dbBytes / 1048576 : 0
  const dbPct = (dbMb / 500) * 100
  if (dbPct >= LIMIT_ALERT_PCT) {
    return {
      what: 'tamaño de la base',
      pct: dbPct,
      detail: `${Math.round(dbMb)} MB de 500 MB`,
    }
  }

  if (conns && maxConns) {
    const pct = (conns / maxConns) * 100
    if (pct >= LIMIT_ALERT_PCT) {
      return { what: 'conexiones', pct, detail: `${conns} de ${maxConns}` }
    }
  }
  return null
}

/**
 * Resumen diario: estado, gasto y cotización en un solo mail.
 *
 * Va una vez por día para que exista un momento fijo en que uno se entera de
 * cómo viene todo, sin depender de que algo se rompa.
 */
/**
 * @param force Ignora el cooldown de 20 h. Solo para reenvio manual — sirve para
 *   ver el mail cuando hace falta sin esperar al dia siguiente.
 */
export async function sendDailyDigest(force = false): Promise<boolean> {
  if (!force && (await alreadySent('daily_digest', 20))) return false

  const [breakdown, fx] = await Promise.all([getCostBreakdown(), getFx()])
  const rate = fx.oficial ?? fx.tarjeta

  const { data: lastRun } = await supabase
    .from('health_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const down = lastRun?.failed ?? 0
  const degraded = lastRun?.degraded ?? 0
  const severity = down > 0 ? 'critical' : degraded > 0 ? 'warning' : 'ok'

  // QUE sitios estan caidos, no solo cuantos. Un "3 con problemas" obliga a
  // abrir el dashboard para saber si hay que salir corriendo o puede esperar;
  // con los nombres en el mail la decision se toma desde el celular.
  const failing = await getFailingChecks()

  // Grafico de barras del gasto por proyecto: en un resumen diario un ranking se
  // lee de un vistazo, una lista de numeros hay que compararla mentalmente.
  const chart = renderBarChart(
    breakdown.projects
      .filter((p) => (p.total ?? 0) > 0)
      .slice(0, 6)
      .map((p) => ({
        label: p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name,
        value: p.total ?? 0,
        display: `US$${(p.total ?? 0).toFixed(2)}`,
      }))
  )

  // Y otro con el peso de cada proveedor, que es donde se decide el total.
  const providerChart = renderBarChart(
    breakdown.charges
      .filter((c) => c.amountToDate > 0)
      .map((c) => ({
        label: c.provider,
        value: c.amountToDate,
        display: `US$${c.amountToDate.toFixed(2)}`,
      })),
    '#3f3f46'
  )

  const rows: EmailRow[] = [
    { label: 'Proyectos OK', value: String(lastRun?.passed ?? 0) },
    { label: 'Con problemas', value: String(down + degraded), emphasis: down + degraded > 0 },
    { label: 'Gasto a hoy', value: money(breakdown.totalToDate, rate) },
    {
      label: 'Proyectado al cierre',
      value: money(breakdown.totalProjected, rate),
      emphasis: true,
    },
    ...(rate ? [{ label: 'Dólar oficial', value: `$${rate.toLocaleString('es-AR')}` }] : []),
  ]

  await resend().emails.send({
    from: 'Health Dashboard <onboarding@resend.dev>',
    to: alertConfig.emailTo,
    subject: subjectFor(
      severity,
      down > 0
        ? // Con un solo caído el asunto lo nombra: es lo único que se lee en la
          // notificación del celular, y "Storefront caído" decide más que "1 caído".
          failing.down.length === 1
          ? `${failing.down[0].name} caído · US$${breakdown.totalProjected.toFixed(0)} proyectados`
          : `${down} proyectos caídos: ${failing.down.slice(0, 2).map((f) => f.name).join(', ')}${down > 2 ? '…' : ''}`
        : `Todo OK · US$${breakdown.totalProjected.toFixed(0)} proyectados este ciclo`
    ),
    html: renderEmail({
      severity,
      title:
        down > 0
          ? failing.down.length === 1
            ? `${failing.down[0].name} está caído`
            : `${down} proyectos caídos`
          : 'Todo funcionando',
      subtitle: `Resumen del día · ${breakdown.projects.length} proyectos con consumo atribuido`,
      body: `
      ${renderFailingList(failing)}
      ${providerChart ? `<p style="margin:0 0 4px;font-weight:600;">Por proveedor</p>${providerChart}` : ''}
      ${chart ? `<p style="margin:16px 0 4px;font-weight:600;">Por proyecto</p>${chart}` : ''}
    `,
      rows,
      cta: { label: 'Abrir el dashboard', url: DASHBOARD_URL },
      footer: 'Los ciclos de cada proveedor cierran en fechas distintas.',
    }),
  })
  await logSystemAlert('daily_digest')
  return true
}

interface FailingCheck {
  slug: string
  name: string
  url: string
  check: string
  status: string
  statusCode: number | null
  error: string | null
}

/**
 * Qué está fallando ahora mismo, con nombre y motivo.
 *
 * Se toma la última medición de cada par (proyecto, check) y no el conteo del
 * run: así el mail no lista algo que ya se recuperó entre corridas.
 */
async function getFailingChecks(): Promise<{ down: FailingCheck[]; degraded: FailingCheck[] }> {
  // Piso de 6 h: si un proyecto dejo de chequearse (se saco de la config, se
  // dio de baja) no tiene que seguir apareciendo como caido con una medicion
  // vieja. 300 filas cubren mas de diez corridas de los ~23 checks actuales.
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('health_checks')
    .select('project_slug, check_name, status, status_code, error_message, checked_at')
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
    .limit(300)

  const latest = new Map<string, FailingCheck & { status: string }>()
  const bySlug = new Map(projects.map((p) => [p.slug, p]))

  for (const r of data ?? []) {
    const key = `${r.project_slug}:${r.check_name}`
    if (latest.has(key)) continue
    const p = bySlug.get(r.project_slug)
    latest.set(key, {
      slug: r.project_slug,
      name: p?.name ?? r.project_slug,
      url: p?.url ?? '',
      check: r.check_name,
      status: r.status,
      statusCode: r.status_code,
      error: r.error_message,
    })
  }

  const all = [...latest.values()]
  return {
    down: all.filter((c) => c.status === 'down'),
    degraded: all.filter((c) => c.status === 'degraded'),
  }
}

/** Lista de caídos y degradados para el cuerpo del mail. */
function renderFailingList(f: { down: FailingCheck[]; degraded: FailingCheck[] }): string {
  if (f.down.length === 0 && f.degraded.length === 0) {
    return '<p style="margin:0 0 14px;color:#15803d;font-weight:600;">Todos los sitios responden bien.</p>'
  }

  const row = (c: FailingCheck, color: string) => `
    <tr>
      <td style="padding:6px 8px 6px 0;font-size:12px;color:#18181b;font-weight:600;white-space:nowrap;">${esc(c.name)}</td>
      <td style="padding:6px 0;font-size:11px;color:#71717a;">${esc(c.url.replace('https://', ''))}</td>
      <td style="padding:6px 0 6px 8px;font-size:11px;color:${color};font-weight:600;text-align:right;white-space:nowrap;">${esc(c.error || String(c.statusCode ?? ''))}</td>
    </tr>`

  const sections: string[] = []
  if (f.down.length) {
    sections.push(`
      <p style="margin:0 0 4px;font-weight:600;color:#dc2626;">Caídos (${f.down.length})</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;">
        ${f.down.map((c) => row(c, '#dc2626')).join('')}
      </table>`)
  }
  if (f.degraded.length) {
    sections.push(`
      <p style="margin:0 0 4px;font-weight:600;color:#b45309;">Lentos o protegidos (${f.degraded.length})</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;">
        ${f.degraded.map((c) => row(c, '#b45309')).join('')}
      </table>`)
  }
  return sections.join('')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
