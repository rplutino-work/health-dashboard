import type { ProjectCost } from '@/lib/costs'

interface CostBarsProps {
  projects: ProjectCost[]
  /** Dólar tarjeta: el que se aplica al pagar servicios del exterior. */
  fxTarjeta: number | null
  total: number
}

/**
 * Ranking de gasto por proyecto en barras.
 *
 * Una lista de números ordenada ya dice quién gasta más, pero no cuánto más. La
 * barra hace visible la proporción: que el primero sea el doble del segundo se
 * ve antes de leer las cifras.
 *
 * Los colores no codifican categoría, solo posición en el ranking — usar una
 * paleta acá competiría con el rojo de "caído", que es lo único que debe gritar
 * en este panel.
 */
export function CostBars({ projects, fxTarjeta, total }: CostBarsProps) {
  const withCost = projects.filter((p) => (p.total ?? 0) > 0)
  if (withCost.length === 0) return null

  const max = Math.max(...withCost.map((p) => p.total ?? 0))

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Gasto por proyecto
        </h3>
        <span className="text-[10px] text-zinc-400">
          {withCost.length} con consumo atribuido
        </span>
      </div>

      <ul className="space-y-2.5">
        {withCost.map((p) => {
          const cost = p.total ?? 0
          const pct = (cost / max) * 100
          const shareOfTotal = total > 0 ? (cost / total) * 100 : 0
          return (
            <li key={p.slug}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[12px] text-zinc-700 truncate">{p.name}</span>
                <span className="text-[11px] tabular-nums shrink-0">
                  <span className="font-bold text-zinc-900">US${cost.toFixed(2)}</span>
                  {fxTarjeta && (
                    <span className="text-zinc-400 ml-1.5">
                      ${Math.round(cost * fxTarjeta).toLocaleString('es-AR')}
                    </span>
                  )}
                  <span className="text-zinc-300 ml-1.5">{shareOfTotal.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-800 rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 1.5)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface FxCardProps {
  oficial: number | null
  tarjeta: number | null
  day: string | null
  series: Array<{ day: string; oficial: number | null; tarjeta: number | null }>
  totalUsd: number
  projectedUsd: number
}

/**
 * Cotización y el gasto convertido a pesos.
 *
 * Es el número que importa a la hora de pagar: el gasto puede estar planchado en
 * dólares y aun así subir en pesos. La serie de los últimos días deja ver cuál
 * de las dos cosas pasó.
 */
export function FxCard({ oficial, tarjeta, day, series, totalUsd, projectedUsd }: FxCardProps) {
  const rate = tarjeta ?? oficial
  const bars = series.slice(-14)
  const values = bars.map((b) => b.tarjeta ?? b.oficial ?? 0).filter((v) => v > 0)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = max - min || 1

  // Variación del período, para saber si el peso movió la factura.
  const first = values[0]
  const last = values[values.length - 1]
  const variation = first && last ? ((last - first) / first) * 100 : null

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          A pagar en pesos
        </h3>
        {day && (
          <span className="text-[10px] text-zinc-400">
            cotización {day.slice(8, 10)}/{day.slice(5, 7)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">A hoy</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums leading-tight">
            {rate ? `$${Math.round(totalUsd * rate).toLocaleString('es-AR')}` : '—'}
          </p>
          <p className="text-[10px] text-zinc-400">US${totalUsd.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Al cierre (est.)</p>
          <p className="text-xl font-bold text-amber-700 tabular-nums leading-tight">
            {rate ? `$${Math.round(projectedUsd * rate).toLocaleString('es-AR')}` : '—'}
          </p>
          <p className="text-[10px] text-zinc-400">US${projectedUsd.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 text-[11px]">
        <span className="text-zinc-500">
          oficial{' '}
          <span className="text-zinc-800 font-semibold tabular-nums">
            ${oficial?.toLocaleString('es-AR') ?? '—'}
          </span>
        </span>
        <span className="text-zinc-500">
          tarjeta{' '}
          <span className="text-zinc-900 font-bold tabular-nums">
            ${tarjeta?.toLocaleString('es-AR') ?? '—'}
          </span>
        </span>
        {variation !== null && Math.abs(variation) >= 0.1 && (
          <span
            className={`ml-auto tabular-nums font-semibold ${
              variation > 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {variation > 0 ? '+' : ''}
            {variation.toFixed(1)}%
          </span>
        )}
      </div>

      {bars.length > 1 && (
        <div className="flex items-end gap-[3px] h-10 mt-3">
          {bars.map((b) => {
            const v = b.tarjeta ?? b.oficial ?? 0
            const h = ((v - min) / range) * 80 + 20
            return (
              <div
                key={b.day}
                className="flex-1 bg-zinc-300 rounded-sm"
                style={{ height: `${h}%` }}
                title={`${b.day}: $${v.toLocaleString('es-AR')}`}
              />
            )
          })}
        </div>
      )}
      <p className="text-[10px] text-zinc-400 mt-2">
        Se usa el dólar tarjeta: es el que aplican los bancos a servicios del exterior.
      </p>
    </div>
  )
}
