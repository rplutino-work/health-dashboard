import { AlertCircle, HardDrive, Plug, TrendingUp } from 'lucide-react'
import type { CostBreakdown } from '@/lib/costs'

interface CostPanelProps {
  breakdown: CostBreakdown
  trend: Array<{ month: string; total: number; projects: Array<{ slug: string; value: number }> }>
  supabase: {
    dbBytes: number | null
    connections: number | null
    maxConnections: number | null
  }
}

const MB = 1048576
const SUPABASE_FREE_LIMIT_MB = 500
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthLabel(iso: string) {
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

/** Verde con margen, ámbar al 75%, rojo al 90%. */
function limitTone(pct: number) {
  if (pct >= 90) return 'text-red-600'
  if (pct >= 75) return 'text-amber-600'
  return 'text-emerald-700'
}

export function CostPanel({ breakdown, trend, supabase }: CostPanelProps) {
  const { grandTotal, byProvider, unattributed, capturedAt } = breakdown
  const missingCosts = byProvider.filter((b) => !b.configured)
  const maxTrend = Math.max(...trend.map((t) => t.total), 1)

  const dbPct = supabase.dbBytes ? (supabase.dbBytes / MB / SUPABASE_FREE_LIMIT_MB) * 100 : 0
  const connPct =
    supabase.connections && supabase.maxConnections
      ? (supabase.connections / supabase.maxConnections) * 100
      : 0

  return (
    <section className="space-y-3 mb-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
          <TrendingUp size={15} className="text-zinc-400" />
          Costos de infraestructura
        </h2>
        {capturedAt && (
          <span className="text-[11px] text-zinc-400">
            medido{' '}
            {new Date(capturedAt).toLocaleString('es-AR', {
              timeZone: 'America/Argentina/Buenos_Aires',
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ── Desglose por proveedor ─────────────────────────────────────── */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Por proveedor
          </h3>
          <ul className="space-y-2">
            {byProvider.map((b) => (
              <li key={b.provider} className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 capitalize">{b.provider}</span>
                {b.cost !== null ? (
                  <span className="font-bold text-zinc-900 tabular-nums">
                    US${b.cost.toFixed(0)}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-300">sin tarifa</span>
                )}
              </li>
            ))}
          </ul>
          {grandTotal !== null && (
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700">Total</span>
              <span className="text-lg font-bold text-zinc-900 tabular-nums">
                US${grandTotal.toFixed(0)}
              </span>
            </div>
          )}
          {missingCosts.length > 0 && (
            <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
              Definí {missingCosts.map((m) => `COST_${m.provider.toUpperCase()}_MONTHLY`).join(', ')}{' '}
              para incluirlos.
            </p>
          )}
        </div>

        {/* ── Evolución mensual ──────────────────────────────────────────── */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Neon · CU-horas por mes
          </h3>
          {trend.length === 0 ? (
            <p className="text-[11px] text-zinc-400">Todavía sin historial.</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {trend.map((t) => (
                <div key={t.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[9px] text-zinc-500 tabular-nums">{t.total.toFixed(0)}</span>
                  <div
                    className="w-full bg-zinc-800 rounded-t"
                    style={{ height: `${Math.max((t.total / maxTrend) * 100, 3)}%` }}
                  />
                  <span className="text-[9px] text-zinc-400 truncate w-full text-center">
                    {monthLabel(t.month)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
            El historial arranca cuando el dashboard empezó a medir; los meses previos no existen.
          </p>
        </div>

        {/* ── Límites del plan free de Supabase ──────────────────────────── */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Supabase · límites free
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                  <HardDrive size={11} /> Base
                </span>
                <span className={`text-sm font-bold tabular-nums ${limitTone(dbPct)}`}>
                  {supabase.dbBytes !== null ? `${Math.round(supabase.dbBytes / MB)} MB` : '—'}
                  <span className="text-[10px] font-normal text-zinc-400"> / 500</span>
                </span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-700 rounded-full"
                  style={{ width: `${Math.min(dbPct, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                  <Plug size={11} /> Conexiones
                </span>
                <span className={`text-sm font-bold tabular-nums ${limitTone(connPct)}`}>
                  {supabase.connections ?? '—'}
                  <span className="text-[10px] font-normal text-zinc-400">
                    {' '}
                    / {supabase.maxConnections ?? '—'}
                  </span>
                </span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-700 rounded-full"
                  style={{ width: `${Math.min(connPct, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-3 leading-relaxed">
            El ancho de banda no figura: Supabase no lo expone por API.
          </p>
        </div>
      </div>

      {/* Plata que se paga sin dueño. Esconderla seria el peor default. */}
      {unattributed.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <h3 className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertCircle size={12} />
            Consumo sin proyecto asignado
          </h3>
          <ul className="space-y-1">
            {unattributed.slice(0, 6).map((u) => (
              <li key={`${u.provider}-${u.ref}`} className="flex justify-between text-[11px]">
                <span className="text-amber-900 truncate">
                  <span className="text-amber-600">{u.provider}</span> · {u.ref}
                </span>
                <span className="text-amber-900 tabular-nums shrink-0 ml-2">
                  {u.cost !== null ? `US$${u.cost.toFixed(2)}` : u.value.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-amber-700 mt-2">
            Mapealos en src/config/resources.ts para atribuirles el gasto.
          </p>
        </div>
      )}
    </section>
  )
}
