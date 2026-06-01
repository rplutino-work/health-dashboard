import Link from 'next/link'
import { Activity, Clock, ExternalLink } from 'lucide-react'
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
  const passedCount = checks.filter((c) => c.status === 'up').length
  const totalCount = checks.length

  return (
    <Link
      href={`/project/${slug}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">
            {name}
          </h3>
          <p className="text-xs text-zinc-500 truncate mt-0.5 flex items-center gap-1">
            {url.replace('https://', '')}
            <ExternalLink size={10} />
          </p>
        </div>
        <StatusBadge status={status as 'up' | 'down' | 'degraded' | 'unknown'} />
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <Activity size={12} />
          {totalCount > 0 ? `${passedCount}/${totalCount} checks` : 'No data'}
        </span>
        {avgResponseMs > 0 && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {avgResponseMs}ms
          </span>
        )}
      </div>

      {/* Mini status bar */}
      {totalCount > 0 && (
        <div className="flex gap-0.5 mt-3">
          {checks.map((check, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                check.status === 'up'
                  ? 'bg-emerald-500'
                  : check.status === 'degraded'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
            />
          ))}
        </div>
      )}
    </Link>
  )
}
