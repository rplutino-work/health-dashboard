import { CheckStatus } from '@/lib/types'

const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  up: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'UP' },
  down: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', label: 'DOWN' },
  degraded: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'DEGRADED' },
  unknown: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-400', label: 'NO DATA' },
}

export function StatusBadge({ status }: { status: CheckStatus | 'unknown' }) {
  const c = config[status] || config.unknown
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'up' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  )
}
