interface HistoryBar {
  status: 'up' | 'down' | 'degraded' | 'empty'
  checkedAt: string
}

export function HistoryChart({ bars }: { bars: HistoryBar[] }) {
  if (bars.length === 0) {
    return (
      <p className="text-xs text-zinc-500 py-4 text-center">
        No history data yet
      </p>
    )
  }

  return (
    <div className="flex gap-[2px] items-end h-8">
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm min-w-[2px] ${
            bar.status === 'up'
              ? 'bg-emerald-500 h-full'
              : bar.status === 'degraded'
                ? 'bg-yellow-500 h-3/4'
                : bar.status === 'down'
                  ? 'bg-red-500 h-1/2'
                  : 'bg-zinc-800 h-1/4'
          }`}
          title={`${bar.checkedAt}: ${bar.status}`}
        />
      ))}
    </div>
  )
}
