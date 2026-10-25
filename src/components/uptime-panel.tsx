import { Activity } from 'lucide-react'
import type { SaludProyecto } from '@/lib/monthly-costs'

/**
 * Uptime y latencia de los ultimos 30 dias, peor primero.
 *
 * Ordenado por el que peor anda y no alfabeticamente: un panel se mira para
 * encontrar el problema, no para buscar un nombre. Los que estan al 100% se
 * pliegan en una linea al final — ocupan lugar y no dicen nada.
 *
 * El p95 es el PEOR dia del periodo, no el promedio de los p95 diarios:
 * interesa cuanto llego a tardar, no cuanto tarda un dia promedio.
 */

function tono(pct: number) {
  if (pct >= 99.9) return 'text-emerald-700'
  if (pct >= 99) return 'text-amber-600'
  return 'text-red-600'
}

function tonoLatencia(ms: number | null) {
  if (ms === null) return 'text-zinc-300'
  if (ms > 3000) return 'text-red-600'
  if (ms > 1200) return 'text-amber-600'
  return 'text-zinc-500'
}

export function UptimePanel({ salud }: { salud: SaludProyecto[] }) {
  if (salud.length === 0) return null
  const conProblemas = salud.filter((s) => s.uptimePct < 99.9)
  const perfectos = salud.filter((s) => s.uptimePct >= 99.9)
  const mostrar = conProblemas.length > 0 ? conProblemas.slice(0, 8) : salud.slice(0, 6)
  const dias = Math.max(...salud.map((s) => s.dias), 0)

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={12} />
          Disponibilidad · {dias} días
        </h3>
        <span className="text-[11px] text-zinc-400 tabular-nums">
          {perfectos.length}/{salud.length} al 100%
        </span>
      </div>
      <p className="text-[10px] text-zinc-400 mb-3 leading-relaxed">
        Ordenado por el que peor anda. El p95 es el peor día del período, no el promedio.
      </p>

      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-zinc-400 uppercase tracking-wider">
            <th className="text-left font-medium pb-1.5">Proyecto</th>
            <th className="text-right font-medium pb-1.5">Uptime</th>
            <th className="text-right font-medium pb-1.5">p95</th>
            <th className="text-right font-medium pb-1.5">Caídas</th>
          </tr>
        </thead>
        <tbody>
          {mostrar.map((s) => (
            <tr key={s.slug} className="border-t border-zinc-100">
              <td className="py-1.5 text-[12px] text-zinc-800 truncate max-w-[150px]">{s.slug}</td>
              <td className={`py-1.5 text-right text-[12px] font-semibold tabular-nums ${tono(s.uptimePct)}`}>
                {s.uptimePct.toFixed(s.uptimePct >= 99.95 ? 0 : 2)}%
              </td>
              <td className={`py-1.5 text-right text-[11px] tabular-nums ${tonoLatencia(s.p95Ms)}`}>
                {s.p95Ms !== null ? `${(s.p95Ms / 1000).toFixed(1)}s` : '—'}
              </td>
              <td className="py-1.5 text-right text-[11px] tabular-nums text-zinc-500">
                {s.caidas || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {conProblemas.length > 0 && perfectos.length > 0 && (
        <p className="text-[10px] text-zinc-400 mt-2.5 pt-2.5 border-t border-zinc-100 leading-relaxed">
          Los otros {perfectos.length} estuvieron al 100%: {perfectos.slice(0, 6).map((p) => p.slug).join(', ')}
          {perfectos.length > 6 ? ` y ${perfectos.length - 6} más` : ''}.
        </p>
      )}
    </div>
  )
}
