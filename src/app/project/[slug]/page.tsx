import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { CheckStatus } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'
import { CheckRow } from '@/components/check-row'
import { HistoryChart } from '@/components/history-chart'
import { ManualRecheckButton } from '@/components/manual-recheck-button'

export const revalidate = 60

interface HealthCheck {
  check_name: string
  status: string
  status_code: number | null
  response_ms: number
  error_message: string | null
  checked_at: string
}

async function getProjectData(slug: string) {
  // Latest checks for this project
  const { data: checks } = await supabase
    .from('health_checks')
    .select('check_name, status, status_code, response_ms, error_message, checked_at')
    .eq('project_slug', slug)
    .order('checked_at', { ascending: false })
    .limit(200)

  // History for last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: history } = await supabase
    .from('health_checks')
    .select('check_name, status, checked_at')
    .eq('project_slug', slug)
    .gte('checked_at', since)
    .order('checked_at', { ascending: true })

  return {
    checks: (checks as HealthCheck[]) || [],
    history: (history as Array<{ check_name: string; status: string; checked_at: string }>) || [],
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)
  if (!project) notFound()

  const { checks, history } = await getProjectData(slug)

  // Deduplicate: latest per check_name
  const latestChecks = new Map<string, HealthCheck>()
  for (const check of checks) {
    if (!latestChecks.has(check.check_name)) {
      latestChecks.set(check.check_name, check)
    }
  }

  const latestArray = [...latestChecks.values()]

  const overallStatus = latestArray.some((c) => c.status === 'down')
    ? 'down'
    : latestArray.some((c) => c.status === 'degraded')
      ? 'degraded'
      : latestArray.length > 0
        ? 'up'
        : 'unknown'

  // Build history bars (aggregate by time slot - worst status wins)
  const historyBars = history.map((h) => ({
    status: h.status as 'up' | 'down' | 'degraded',
    checkedAt: new Date(h.checked_at).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }))

  // Calculate uptime percentage (last 24h)
  const totalHistory = history.length
  const upHistory = history.filter((h) => h.status === 'up').length
  const uptimePercent = totalHistory > 0 ? Math.round((upHistory / totalHistory) * 100) : 0

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              <StatusBadge status={overallStatus as CheckStatus | 'unknown'} />
            </div>
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              {project.url.replace('https://', '')}
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
        <ManualRecheckButton slug={slug} />
      </div>

      {/* Uptime bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-300">Uptime (24h)</h2>
          <span className={`text-sm font-bold ${uptimePercent >= 99 ? 'text-emerald-400' : uptimePercent >= 90 ? 'text-yellow-400' : 'text-red-400'}`}>
            {uptimePercent}%
          </span>
        </div>
        <HistoryChart bars={historyBars} />
      </div>

      {/* Current checks */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Current Checks</h2>
        {latestArray.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">
            No check data yet. Run a health check first.
          </p>
        ) : (
          latestArray.map((check) => (
            <CheckRow
              key={check.check_name}
              name={check.check_name}
              status={check.status as CheckStatus}
              statusCode={check.status_code}
              responseMs={check.response_ms}
              errorMessage={check.error_message}
              checkedAt={check.checked_at}
            />
          ))
        )}
      </div>
    </>
  )
}
