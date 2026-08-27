import { History, TrendingUp } from 'lucide-react'
import type { HistoryRow } from '@/lib/billing-history'

interface HistoryPanelProps {
  /** Ciclos ya cerrados: el valor definitivo de cada período. */
  closed: HistoryRow[]
  /** Snapshots del ciclo en curso, para ver cómo viene. */
  progress: HistoryRow[]
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function cycleLabel(start: string) {
  const [y, m] = start.split('-')
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

export function HistoryPanel({ closed, progress }: HistoryPanelProps) {
  const hasHistory = closed.length > 0
  const hasProgress = progress.length > 1

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
      {/* ── Ciclos cerrados: lo que efectivamente se pagó ─────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <History size={12} />
          Ciclos cerrados
        </h3>

        {!hasHistory ? (
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Todavía no cerró ningún ciclo desde que el dashboard empieza a guardar. El primero en
            cerrar es Vercel el 29/08, después Neon el 01/09 y Railway el 14/09.
          </p>
        ) : (
          <ul className="space-y-2">
            {closed.map((h) => (
              <li
                key={`${h.provider}-${h.cycleStart}`}
                className="flex items-baseline justify-between gap-2 text-[12px] pb-2 border-b border-zinc-100 last:border-0"
              >
                <span className="text-zinc-600">
                  <span className="capitalize font-medium text-zinc-800">{h.provider}</span>
                  <span className="text-zinc-400 ml-1.5">{cycleLabel(h.cycleStart)}</span>
                </span>
                <span className="tabular-nums shrink-0 text-right">
                  <span className="font-bold text-zinc-900">US${h.amountUsd.toFixed(2)}</span>
                  {h.amountArs !== null && (
                    <span className="text-zinc-400 block text-[10px] leading-tight">
                      ${Math.round(h.amountArs).toLocaleString('es-AR')}
                      {h.fxTarjeta && (
                        <span className="text-zinc-300"> @{Math.round(h.fxTarjeta)}</span>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-zinc-400 mt-3 leading-relaxed">
          El tipo de cambio queda congelado en cada ciclo: convertir uno viejo con la cotización de
          hoy daría un monto que nunca se pagó.
        </p>
      </div>

      {/* ── Evolución del ciclo en curso ──────────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <TrendingUp size={12} />
          Ciclo en curso · Neon
        </h3>

        {!hasProgress ? (
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Se guarda una foto por día. Con dos o más se dibuja acá la curva del ciclo, y se puede
            comparar contra el mismo día del ciclo anterior.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-1 h-20 mb-2">
              {progress.map((h) => {
                const max = Math.max(...progress.map((x) => x.amountUsd), 1)
                const pct = (h.amountUsd / max) * 100
                return (
                  <div
                    key={h.snapshotDay}
                    className="flex-1 bg-zinc-800 rounded-t min-w-[3px]"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={`${h.snapshotDay}: US$${h.amountUsd.toFixed(2)}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>{fmtDate(progress[0].snapshotDay)}</span>
              <span className="tabular-nums font-semibold text-zinc-700">
                US${progress[progress.length - 1].amountUsd.toFixed(2)}
              </span>
              <span>{fmtDate(progress[progress.length - 1].snapshotDay)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
