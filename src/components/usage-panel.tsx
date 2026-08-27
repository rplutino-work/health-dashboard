import { Cpu, HardDrive, Plug, TrendingUp } from 'lucide-react'
import type { ProratedUsage } from '@/lib/types'

interface UsagePanelProps {
  /** Consumo de Neon prorrateado, ya ordenado de mayor a menor. */
  neon: ProratedUsage[]
  /** Métricas puntuales de Supabase: tamaño y conexiones contra sus límites. */
  supabase: {
    dbBytes: number | null
    connections: number | null
    maxConnections: number | null
    schemas: Array<{ name: string; bytes: number }>
  }
  capturedAt: string | null
}

const MB = 1048576
const SUPABASE_FREE_LIMIT_MB = 500

function fmtMB(bytes: number) {
  return (bytes / MB).toFixed(bytes / MB < 10 ? 1 : 0) + ' MB'
}

/** Verde mientras haya margen, ámbar al 75%, rojo al 90%. */
function limitTone(pct: number) {
  if (pct >= 90) return 'text-red-400'
  if (pct >= 75) return 'text-amber-400'
  return 'text-emerald-400'
}

export function UsagePanel({ neon, supabase, capturedAt }: UsagePanelProps) {
  const totalCu = neon.reduce((a, b) => a + b.value, 0)
  const hasCost = neon.some((n) => n.cost !== null)

  const dbPct = supabase.dbBytes ? (supabase.dbBytes / MB / SUPABASE_FREE_LIMIT_MB) * 100 : 0
  const connPct =
    supabase.connections && supabase.maxConnections
      ? (supabase.connections / supabase.maxConnections) * 100
      : 0

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <TrendingUp size={15} className="text-zinc-500" />
          Consumo por proyecto
        </h2>
        {capturedAt && (
          <span className="text-[11px] text-zinc-600">
            medido {new Date(capturedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
          </span>
        )}
      </div>

      {/* ── Neon: lo unico que se puede prorratear de verdad ────────────── */}
      <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Cpu size={13} className="text-zinc-500" />
            Neon — CU-horas del ciclo
          </h3>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {totalCu.toFixed(1)} CU-h en total
          </span>
        </div>

        {neon.length === 0 ? (
          <p className="text-[11px] text-zinc-600">
            Sin datos todavía. Se captura en la próxima corrida del cron.
          </p>
        ) : (
          <ul className="space-y-2">
            {neon.map((p) => {
              const pct = p.share * 100
              return (
                <li key={`${p.provider}-${p.project_name}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-zinc-300 truncate">{p.project_name}</span>
                    <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
                      {p.value.toFixed(1)} CU-h · {pct.toFixed(1)}%
                      {p.cost !== null && (
                        <span className="text-zinc-400"> · US${p.cost.toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-500 rounded-full"
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!hasCost && neon.length > 0 && (
          <p className="text-[10px] text-zinc-600 mt-3">
            Para ver el reparto en dólares, definí COST_NEON_MONTHLY con el total de la factura.
          </p>
        )}
      </div>

      {/* ── Supabase: no hay API de consumo, solo lo medible por SQL ─────── */}
      <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mb-3">
          <HardDrive size={13} className="text-zinc-500" />
          Supabase — límites del plan free
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-lg font-bold tabular-nums ${limitTone(dbPct)}`}>
                {supabase.dbBytes !== null ? fmtMB(supabase.dbBytes) : '—'}
              </span>
              <span className="text-[11px] text-zinc-600">de {SUPABASE_FREE_LIMIT_MB} MB</span>
            </div>
            <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-zinc-500 rounded-full"
                style={{ width: `${Math.min(dbPct, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-1.5">
              <Plug size={12} className="text-zinc-600" />
              <span className={`text-lg font-bold tabular-nums ${limitTone(connPct)}`}>
                {supabase.connections ?? '—'}
              </span>
              <span className="text-[11px] text-zinc-600">de {supabase.maxConnections ?? '—'}</span>
            </div>
            <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-zinc-500 rounded-full"
                style={{ width: `${Math.min(connPct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {supabase.schemas.length > 0 && (
          <ul className="mt-3 pt-3 border-t border-zinc-800/60 space-y-1">
            {supabase.schemas.map((s) => (
              <li key={s.name} className="flex justify-between text-[11px]">
                <span className="text-zinc-500">{s.name}</span>
                <span className="text-zinc-400 tabular-nums">{fmtMB(s.bytes)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[10px] text-zinc-600 mt-3">
          El ancho de banda no figura acá: Supabase no lo expone por API. Se mira en su dashboard.
        </p>
      </div>
    </section>
  )
}
