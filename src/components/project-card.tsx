import Link from 'next/link'
import { Globe, Database, Clock, ChevronRight } from 'lucide-react'
import { StatusBadge } from './status-badge'

interface ProjectCardProps {
  slug: string
  name: string
  url: string
  status: string
  avgResponseMs: number
  checks: Array<{
    check_name: string
    status: string
    response_ms: number
    checked_at: string
  }>
}

export function ProjectCard({ slug, name, url, status, avgResponseMs, checks }: ProjectCardProps) {
  const frontCheck = checks.find((c) => c.check_name === 'front')
  const dbCheck = checks.find((c) => c.check_name === 'api+db')

  return (
    <Link
      href={`/project/${slug}`}
      className="group block bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4 hover:bg-zinc-900 hover:border-zinc-700/60 transition-all duration-200"
      style={{ animation: 'fade-in 0.3s ease-out both' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-zinc-100 truncate group-hover:text-white transition-colors">
            {name}
          </h3>
          <p className="text-[11px] text-zinc-600 truncate mt-0.5">
            {url.replace('https://', '')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status as 'up' | 'down' | 'degraded' | 'unknown'} />
          <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </div>
      </div>

      {/* Check indicators */}
      <div className="flex items-center gap-3 text-[11px]">
        <CheckIndicator
          icon={<Globe size={11} />}
          label="Front"
          status={frontCheck?.status}
          ms={frontCheck?.response_ms}
        />
        {dbCheck && (
          <CheckIndicator
            icon={<Database size={11} />}
            label="API+DB"
            status={dbCheck.status}
            ms={dbCheck.response_ms}
          />
        )}
        {!frontCheck && !dbCheck && (
          <span className="text-zinc-600">No data yet</span>
        )}
      </div>

      {/* Response time bar */}
      {avgResponseMs > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                avgResponseMs < 1000
                  ? 'bg-emerald-500'
                  : avgResponseMs < 3000
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (avgResponseMs / 5000) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 tabular-nums flex items-center gap-1">
            <Clock size={9} />
            {avgResponseMs}ms
          </span>
        </div>
      )}
    </Link>
  )
}

function CheckIndicator({
  icon,
  label,
  status,
  ms,
}: {
  icon: React.ReactNode
  label: string
  status?: string
  ms?: number
}) {
  const color = status === 'up'
    ? 'text-emerald-400'
    : status === 'down'
      ? 'text-red-400'
      : status === 'degraded'
        ? 'text-yellow-400'
        : 'text-zinc-600'

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      {icon}
      <span className="font-medium">{label}</span>
      {ms != null && <span className="text-zinc-600">{ms}ms</span>}
    </div>
  )
}
