import { AlertCircle, HardDrive, Plug, CalendarClock, Ruler } from 'lucide-react'
import type { CostBreakdown } from '@/lib/costs'

interface CostPanelProps {
  breakdown: CostBreakdown
  supabase: {
    dbBytes: number | null
    connections: number | null
    maxConnections: number | null
  }
}

const MB = 1048576
const SUPABASE_FREE_LIMIT_MB = 500

function limitTone(pct: number) {
  if (pct >= 90) return 'text-red-600'
  if (pct >= 75) return 'text-amber-600'
  return 'text-emerald-700'
}

function d(iso: string) {
  const [, m, day] = iso.split('-')
  return `${day}/${m}`
}

/** Nombres legibles para las líneas de la factura. */
const LABELS: Record<string, string> = {
  observability_events: 'Observability',
  build_cpu: 'Build CPU',
  fluid_active_cpu: 'CPU activa',
  function_invocations: 'Invocaciones',
  fast_origin_transfer: 'Transfer origen',
  fluid_provisioned_memory: 'Memoria',
  image_optimization: 'Imágenes',
  subscription: 'Suscripción',
  credits_applied: 'Créditos',
  compute: 'Compute',
  storage: 'Storage',
}

export function CostPanel({ breakdown, supabase }: CostPanelProps) {
  const { charges, totalToDate, totalProjected, unattributed, capturedAt, missingCharges } =
    breakdown

  const dbPct = supabase.dbBytes ? (supabase.dbBytes / MB / SUPABASE_FREE_LIMIT_MB) * 100 : 0
  const connPct =
    supabase.connections && supabase.maxConnections
      ? (supabase.connections / supabase.maxConnections) * 100
      : 0

  return (
    <section className="space-y-3 mb-6">
      {/* Total real arriba de todo. */}
      <div className="bg-zinc-900 text-white rounded-xl p-5 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">
            Infraestructura · cargos reales a hoy
          </p>
          <p className="text-3xl font-bold tabular-nums leading-tight">
            US${totalToDate.toFixed(2)}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            suma de ciclos que no coinciden entre sí
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">
            Proyectado al cierre
          </p>
          <p className="text-3xl font-bold tabular-nums leading-tight text-amber-300">
            US${totalProjected.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-4">
          {charges.map((c) => (
            <div key={c.provider} className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 capitalize">
                {c.provider}
              </p>
              <p className="text-lg font-bold tabular-nums leading-tight">
                US${c.amountToDate.toFixed(0)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-zinc-500 bg-zinc-100/70 border border-zinc-200 rounded-lg px-3 py-2">
        <Ruler size={13} className="mt-0.5 shrink-0 text-zinc-400" />
        <p className="leading-relaxed">
          Los <strong className="text-zinc-700">montos son reales</strong>, tomados del panel de
          facturación de cada proveedor. El{' '}
          <strong className="text-zinc-700">reparto entre proyectos es derivado</strong>: se
          prorratea según el consumo medido por API.
          {capturedAt && (
            <>
              {' '}
              Consumo medido{' '}
              {new Date(capturedAt).toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </>
          )}
          {missingCharges.length > 0 && (
            <>
              {' '}
              Sin cargo cargado:{' '}
              <strong className="text-amber-700">{missingCharges.join(', ')}</strong>.
            </>
          )}
        </p>
      </div>

      {/* ── Un bloque por proveedor, cada uno con SU ciclo ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {charges
          .filter((c) => c.amountToDate > 0 || c.plan !== 'Free')
          .map((c) => {
            const lines = Object.entries(c.breakdown ?? {})
              .map(([k, v]) => ({ key: k, ...v }))
              .filter((l) => typeof l.charge === 'number' && Math.abs(l.charge) >= 0.01)
              .sort((a, b) => Math.abs(b.charge) - Math.abs(a.charge))
            const projected = c.amountProjected ?? c.ownProjection

            return (
              <div key={c.provider} className="bg-white border border-zinc-200 rounded-xl p-4">
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="text-sm font-bold text-zinc-900 capitalize">
                    {c.provider}
                    {c.plan && (
                      <span className="ml-2 text-[10px] font-normal text-zinc-400 uppercase tracking-wider">
                        {c.plan}
                      </span>
                    )}
                    {/* Un monto declarado no puede parecer uno leido de la
                        facturacion: la diferencia cambia cuanto confiar en el total. */}
                    {c.source !== 'panel' && (
                      <span className="ml-2 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 uppercase tracking-wider">
                        estimado
                      </span>
                    )}
                  </h3>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <CalendarClock size={10} />
                    {d(c.cycleStart)} → {d(c.cycleEnd)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-1 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-300 rounded-full"
                      style={{ width: `${c.pctElapsed}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
                    {c.pctElapsed.toFixed(0)}% · faltan {c.daysLeft.toFixed(0)}d
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">A hoy</p>
                    <p className="text-xl font-bold text-zinc-900 tabular-nums leading-tight">
                      US${c.amountToDate.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Al cierre</p>
                    <p className="text-xl font-bold text-amber-700 tabular-nums leading-tight">
                      US${projected.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Desglose de la factura: donde esta el gasto de verdad. */}
                {lines.length > 0 && (
                  <ul className="space-y-1 pt-3 border-t border-zinc-100">
                    {lines.slice(0, 6).map((l) => (
                      <li key={l.key} className="flex items-baseline justify-between text-[11px]">
                        <span className="text-zinc-500 truncate">
                          {LABELS[l.key] ?? l.key}
                          {l.usage && (
                            <span className="text-zinc-300 ml-1.5">{l.usage}</span>
                          )}
                        </span>
                        <span
                          className={`tabular-nums shrink-0 ml-2 font-semibold ${
                            l.charge < 0 ? 'text-emerald-700' : 'text-zinc-700'
                          }`}
                        >
                          {l.charge < 0 ? '−' : ''}US${Math.abs(l.charge).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Supabase · límites del plan free
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
        </div>

        {unattributed.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertCircle size={12} />
              Consumo sin proyecto asignado
            </h3>
            <ul className="space-y-1">
              {unattributed.slice(0, 5).map((u) => (
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
          </div>
        )}
      </div>
    </section>
  )
}
