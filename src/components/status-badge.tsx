import { CheckStatus } from '@/lib/types'

const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  up: {
    bg: 'bg-emerald-500/15 border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: 'UP',
  },
  down: {
    bg: 'bg-red-500/15 border-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'DOWN',
  },
  degraded: {
    bg: 'bg-yellow-500/15 border-yellow-500/20',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400',
    label: 'SLOW',
  },
  unknown: {
    bg: 'bg-zinc-500/15 border-zinc-500/20',
    text: 'text-zinc-500',
    dot: 'bg-zinc-500',
    label: 'N/A',
  },
}

export function StatusBadge({ status, size = 'sm' }: { status: CheckStatus | 'unknown'; size?: 'sm' | 'lg' }) {
  const c = config[status] || config.unknown
  const sizeClasses = size === 'lg' ? 'px-3 py-1.5 text-sm gap-2' : 'px-2 py-0.5 text-[10px] gap-1.5'

  return (
    <span className={`inline-flex items-center rounded-md border font-bold tracking-wider ${sizeClasses} ${c.bg} ${c.text}`}>
      <span
        className={`rounded-full ${c.dot} ${size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5'}`}
        style={status === 'up' ? { animation: 'pulse-dot 2s ease-in-out infinite' } : undefined}
      />
      {c.label}
    </span>
  )
}
