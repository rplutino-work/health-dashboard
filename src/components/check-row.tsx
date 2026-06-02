import { StatusBadge } from './status-badge'
import { Globe, Database, Clock } from 'lucide-react'
import { CheckStatus } from '@/lib/types'

interface CheckRowProps {
  name: string
  status: CheckStatus
  statusCode: number | null
  responseMs: number
  errorMessage: string | null
  checkedAt: string
}

export function CheckRow({ name, status, statusCode, responseMs, errorMessage, checkedAt }: CheckRowProps) {
  const timeAgo = getTimeAgo(new Date(checkedAt))
  const icon = name === 'api+db' ? <Database size={14} /> : <Globe size={14} />
  const label = name === 'api+db' ? 'API + Database' : name === 'front' ? 'Frontend Server' : name

  return (
    <div
      className="flex items-center gap-4 py-3.5 px-4 bg-zinc-900/50 border border-zinc-800/60 rounded-xl"
      style={{ animation: 'slide-in 0.3s ease-out both' }}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
        status === 'up' ? 'bg-emerald-500/10 text-emerald-400'
          : status === 'down' ? 'bg-red-500/10 text-red-400'
            : 'bg-yellow-500/10 text-yellow-400'
      }`}>
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          <StatusBadge status={status} />
        </div>
        {errorMessage && (
          <p className="text-[11px] text-red-400/80 mt-0.5 truncate">{errorMessage}</p>
        )}
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-5 text-[11px] text-zinc-500 flex-shrink-0">
        {statusCode && (
          <span className={`font-mono ${statusCode >= 400 ? 'text-red-400' : 'text-zinc-400'}`}>
            {statusCode}
          </span>
        )}
        <span className="flex items-center gap-1 tabular-nums">
          <Clock size={10} />
          {responseMs}ms
        </span>
        <span className="w-14 text-right text-zinc-600">{timeAgo}</span>
      </div>
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
