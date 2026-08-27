/**
 * Mini-gráfico de tendencia. Va al lado del nombre del proyecto para responder
 * de un vistazo si su consumo viene subiendo o está plano — la pregunta que un
 * número solo no contesta.
 *
 * Los contadores de Neon son acumulados dentro del ciclo, así que la serie
 * siempre sube: lo que importa es la PENDIENTE. Una recta empinada es un
 * proyecto que gasta rápido; una que se aplana es uno que se detuvo.
 */
export function Sparkline({
  values,
  width = 56,
  height = 18,
  className = '',
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} className={className} aria-hidden />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    // 1px de margen arriba y abajo para que la línea no se corte en los bordes.
    const y = height - 1 - ((v - min) / range) * (height - 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  // Pendiente del último tramo: define el color y la lectura rápida.
  const lastDelta = values[values.length - 1] - values[values.length - 2]
  const stroke = lastDelta > 0 ? '#b45309' : '#15803d'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Tendencia: ${lastDelta > 0 ? 'en aumento' : 'estable'}`}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
