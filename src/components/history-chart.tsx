interface HistoryBar {
  status: 'up' | 'down' | 'degraded' | 'empty'
  checkedAt: string
}

export function HistoryChart({ bars }: { bars: HistoryBar[] }) {
  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-10 text-[11px] text-zinc-400">
        Todavía sin historial
      </div>
    )
  }

  return (
    <div className="flex gap-[1px] items-end h-8 rounded-md overflow-hidden">
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`flex-1 min-w-[3px] rounded-[1px] transition-all duration-150 hover:opacity-70 ${
            bar.status === 'up'
              ? 'bg-emerald-500 h-full'
              : bar.status === 'degraded'
                ? 'bg-amber-500 h-3/4'
                : bar.status === 'down'
                  ? 'bg-red-500 h-full'
                  : // "sin dato" tiene que distinguirse del fondo blanco sin competir
                    // con los estados reales: gris claro, pero visible.
                    'bg-zinc-200 h-1/3'
          }`}
          title={`${bar.checkedAt}: ${bar.status}`}
        />
      ))}
    </div>
  )
}
