import { CheckStatus } from '@/lib/types'

/**
 * Sobre fondo claro los tonos tienen que ser más oscuros y saturados que en el
 * tema oscuro para mantener contraste legible. El punto de color va acompañado
 * siempre de la etiqueta: el estado nunca depende solo del color.
 */
const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  up: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-600',
    label: 'OK',
  },
  down: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-600',
    label: 'CAÍDO',
  },
  degraded: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-600',
    label: 'LENTO',
  },
  unknown: {
    bg: 'bg-zinc-100 border-zinc-200',
    text: 'text-zinc-500',
    dot: 'bg-zinc-400',
    label: 'S/D',
  },
}

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: CheckStatus | 'unknown'
  size?: 'sm' | 'lg'
}) {
  const c = config[status] || config.unknown
  const sizeClasses =
    size === 'lg' ? 'px-3 py-1.5 text-xs gap-2' : 'px-2 py-0.5 text-[10px] gap-1.5'

  return (
    <span
      className={`inline-flex items-center rounded-md border font-bold tracking-wider ${sizeClasses} ${c.bg} ${c.text}`}
    >
      <span
        className={`rounded-full ${c.dot} ${size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5'}`}
        style={status === 'up' ? { animation: 'pulse-dot 2s ease-in-out infinite' } : undefined}
      />
      {c.label}
    </span>
  )
}
