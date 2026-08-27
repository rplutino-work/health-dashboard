/**
 * Plantillas de mail.
 *
 * Los clientes de correo no soportan flex, grid ni variables CSS, y Gmail borra
 * los <style> del head. Así que todo va con tablas y estilos inline — se ve
 * anticuado en el código a propósito: es lo único que renderiza igual en Gmail,
 * Outlook y iOS Mail.
 *
 * Cada mail responde tres cosas en el orden en que se leen desde el celular:
 * qué pasó, cuánto importa, y qué mirar.
 */

const BRAND = {
  bg: '#f4f4f5',
  card: '#ffffff',
  text: '#18181b',
  muted: '#71717a',
  border: '#e4e4e7',
  danger: '#dc2626',
  warn: '#b45309',
  ok: '#15803d',
}

export type Severity = 'critical' | 'warning' | 'ok' | 'info'

const TONE: Record<Severity, { color: string; bg: string; label: string }> = {
  critical: { color: BRAND.danger, bg: '#fef2f2', label: 'CRÍTICO' },
  warning: { color: BRAND.warn, bg: '#fffbeb', label: 'ATENCIÓN' },
  ok: { color: BRAND.ok, bg: '#f0fdf4', label: 'RESUELTO' },
  info: { color: BRAND.muted, bg: '#fafafa', label: 'INFO' },
}

export interface EmailRow {
  label: string
  value: string
  /** Resalta el valor: se usa para el dato que motivó el mail. */
  emphasis?: boolean
}

export interface EmailOptions {
  severity: Severity
  title: string
  /** Una frase que explique la consecuencia, no solo el hecho. */
  subtitle?: string
  rows?: EmailRow[]
  body?: string
  cta?: { label: string; url: string }
  footer?: string
}

export function renderEmail(o: EmailOptions): string {
  const tone = TONE[o.severity]

  const rowsHtml = (o.rows ?? [])
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:13px;">${escapeHtml(r.label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};text-align:right;font-size:13px;font-weight:${r.emphasis ? '700' : '400'};color:${r.emphasis ? tone.color : BRAND.text};">${escapeHtml(r.value)}</td>
        </tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">

          <tr>
            <td style="background:${tone.bg};padding:16px 20px;border-bottom:1px solid ${BRAND.border};">
              <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:1px;color:${tone.color};">${tone.label}</span>
              <h1 style="margin:6px 0 0;font-size:18px;line-height:1.3;color:${BRAND.text};font-weight:700;">${escapeHtml(o.title)}</h1>
              ${o.subtitle ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(o.subtitle)}</p>` : ''}
            </td>
          </tr>

          ${
            o.body
              ? `<tr><td style="padding:16px 20px 0;font-size:13px;line-height:1.6;color:${BRAND.text};">${o.body}</td></tr>`
              : ''
          }

          ${
            rowsHtml
              ? `<tr><td style="padding:8px 20px 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
                </td></tr>`
              : ''
          }

          ${
            o.cta
              ? `<tr><td style="padding:0 20px 20px;">
                  <a href="${o.cta.url}" style="display:inline-block;background:${BRAND.text};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(o.cta.label)}</a>
                </td></tr>`
              : ''
          }

          <tr>
            <td style="padding:14px 20px;background:#fafafa;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:11px;line-height:1.5;color:${BRAND.muted};">
                ${o.footer ? escapeHtml(o.footer) + '<br>' : ''}
                Health Dashboard · ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** El asunto es lo único que se ve en la notificación del celular. */
export function subjectFor(severity: Severity, text: string): string {
  const icon = { critical: '🔴', warning: '🟠', ok: '🟢', info: '📊' }[severity]
  return `${icon} ${text}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface BarDatum {
  label: string
  value: number
  /** Texto a la derecha: el monto formateado. */
  display: string
}

/**
 * Gráfico de barras para mail.
 *
 * Nada de SVG ni divs con flex: Gmail los descarta y Outlook los rompe. La única
 * forma que renderiza igual en todos lados es una tabla donde cada barra son dos
 * celdas con ancho en porcentaje y color de fondo — feo de escribir, pero se ve
 * bien hasta en Outlook 2016.
 *
 * El ancho va en porcentaje sobre el mayor valor, no sobre el total: así la
 * barra más larga siempre llena la fila y las proporciones se leen entre sí.
 */
export function renderBarChart(data: BarDatum[], color = '#18181b'): string {
  if (data.length === 0) return ''
  const max = Math.max(...data.map((d) => d.value), 1)

  const rows = data
    .map((d) => {
      // Mínimo 2% para que una barra chica siga siendo visible.
      const pct = Math.max(Math.round((d.value / max) * 100), 2)
      const rest = 100 - pct
      return `
        <tr>
          <td style="padding:5px 8px 5px 0;font-size:12px;color:#3f3f46;white-space:nowrap;">${escapeHtml(d.label)}</td>
          <td style="padding:5px 0;width:55%;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td width="${pct}%" bgcolor="${color}" style="background:${color};height:8px;border-radius:4px 0 0 4px;font-size:0;line-height:0;">&nbsp;</td>
                ${rest > 0 ? `<td width="${rest}%" bgcolor="#e4e4e7" style="background:#e4e4e7;height:8px;border-radius:0 4px 4px 0;font-size:0;line-height:0;">&nbsp;</td>` : ''}
              </tr>
            </table>
          </td>
          <td style="padding:5px 0 5px 10px;font-size:12px;font-weight:700;color:#18181b;text-align:right;white-space:nowrap;">${escapeHtml(d.display)}</td>
        </tr>`
    })
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 0;">${rows}</table>`
}

