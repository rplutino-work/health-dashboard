import { StatusBadge } from './status-badge'
import { Clock } from 'lucide-react'
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

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <StatusBadge status={status} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{name}</p>
          {errorMessage && (
            <p className="text-xs text-red-400 truncate mt-0.5">{errorMessage}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-500 flex-shrink-0">
        {statusCode && (
          <span className={statusCode >= 400 ? 'text-red-400' : 'text-zinc-400'}>
            {statusCode}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {responseMs}ms
        </span>
        <span className="w-16 text-right">{timeAgo}</span>
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
