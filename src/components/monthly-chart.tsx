import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { MesDeCosto } from '@/lib/monthly-costs'
import type { Provider } from '@/lib/types'

/**
 * Gasto mes a mes, apilado por proveedor.
 *
 * Barras y no lineas: cada mes es una magnitud cerrada que se compara con la de
 * al lado, no una serie continua. Apilado porque la pregunta de fondo —"¿cuanto
 * pago y quien se lo lleva?"— necesita el total y la composicion a la vez.
 *
 * Los colores salen de la paleta categorica validada (ΔE CVD peor par 9.1,
 * vision normal 22.9). Dos de los cuatro quedan por debajo de 3:1 contra el
 * fondo, asi que llevan etiqueta directa obligatoria — nunca color solo.
 */

const COLOR: Record<string, string> = {
  neon: '#2a78d6',
  vercel: '#eb6834',
  railway: '#1baf7a',
  supabase: '#eda100',
}
const ORDEN: Provider[] = ['neon', 'vercel', 'railway', 'supabase']

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function etiquetaMes(m: string) {
  const [y, mm] = m.split('-')
  return `${MES[Number(mm) - 1]} ${y.slice(2)}`
}

export function MonthlyChart({ meses }: { meses: MesDeCosto[] }) {
  if (meses.length === 0) return null
  const max = Math.max(...meses.map((m) => m.total), 1)
  const usados = ORDEN.filter((p) => meses.some((m) => (m.porProveedor[p] ?? 0) > 0))

  const cerrados = meses.filter((m) => m.cerrado)
  const ultimo = cerrados[cerrados.length - 1]
  const previo = cerrados[cerrados.length - 2]
  const delta = ultimo && previo ? ultimo.total - previo.total : null
  const pct = delta !== null && previo ? (delta / previo.total) * 100 : null

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Infraestructura mes a mes
        </h3>
        {pct !== null && (
          <span
            className={`flex items-center gap-1 text-[11px] font-semibold ${
              pct < -2 ? 'text-emerald-700' : pct > 2 ? 'text-red-600' : 'text-zinc-500'
            }`}
          >
            {pct < -2 ? <TrendingDown size={12} /> : pct > 2 ? <TrendingUp size={12} /> : <Minus size={12} />}
            {pct > 0 ? '+' : ''}
            {pct.toFixed(0)}% vs el mes anterior
          </span>
        )}
      </div>
      <p className="text-[10px] text-zinc-400 mb-4 leading-relaxed">
        Cada ciclo cuenta en el mes donde cae su punto medio: los proveedores cortan en fechas
        distintas. Claude queda afuera — es monto fijo y aplastaría el resto.
      </p>

      <div className="flex items-end gap-3 h-44 mb-2">
        {meses.map((m) => {
          const alto = (m.total / max) * 100
          return (
            <div key={m.mes} className="flex-1 flex flex-col justify-end items-center gap-1.5 h-full">
              <span className="text-[11px] font-bold text-zinc-900 tabular-nums">
                {m.total.toFixed(0)}
              </span>
              <div
                className={`w-full flex flex-col-reverse rounded-t overflow-hidden ${
                  m.cerrado ? '' : 'opacity-55'
                }`}
                style={{ height: `${Math.max(alto, 3)}%` }}
                title={`${etiquetaMes(m.mes)}: US$${m.total.toFixed(2)}${m.cerrado ? '' : ' (en curso)'}`}
              >
                {usados.map((p) => {
                  const v = m.porProveedor[p] ?? 0
                  if (v <= 0) return null
                  return (
                    <div
                      key={p}
                      style={{
                        height: `${(v / m.total) * 100}%`,
                        background: COLOR[p],
                        // 2px de superficie entre segmentos: sin esto dos hues
                        // contiguos se leen como uno solo.
                        boxShadow: '0 -2px 0 0 #ffffff',
                      }}
                      title={`${p}: US$${v.toFixed(2)}`}
                    />
                  )
                })}
              </div>
              <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                {etiquetaMes(m.mes)}
              </span>
              {!m.cerrado && <span className="text-[9px] text-amber-700">en curso</span>}
            </div>
          )
        })}
      </div>

      {/* Leyenda con el monto del ultimo mes cerrado: identidad nunca por color solo. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 border-t border-zinc-100">
        {usados.map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: COLOR[p] }}
              aria-hidden
            />
            <span className="capitalize">{p}</span>
            {ultimo && (ultimo.porProveedor[p] ?? 0) > 0 && (
              <span className="tabular-nums text-zinc-400">
                US${(ultimo.porProveedor[p] ?? 0).toFixed(0)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
