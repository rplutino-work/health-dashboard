import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Globe, Database } from 'lucide-react'
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
  const { data: checks } = await supabase
    .from('health_checks')
    .select('check_name, status, status_code, response_ms, error_message, checked_at')
    .eq('project_slug', slug)
    .order('checked_at', { ascending: false })
    .limit(200)

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

  // Build history bars
  const historyBars = history.map((h) => ({
    status: h.status as 'up' | 'down' | 'degraded',
    checkedAt: new Date(h.checked_at).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }))

  // Uptime
  const totalHistory = history.length
  const upHistory = history.filter((h) => h.status === 'up').length
  const uptimePercent = totalHistory > 0 ? Math.round((upHistory / totalHistory) * 100) : 0

  // Has DB check?
  const hasDb = project.checks.some((c) => c.name === 'api+db')

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-white tracking-tight">{project.name}</h1>
              <StatusBadge status={overallStatus as CheckStatus | 'unknown'} size="lg" />
            </div>
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 transition-colors"
            >
              {project.url.replace('https://', '')}
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
        <ManualRecheckButton slug={slug} />
      </div>

      {/* Architecture overview */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <ArchCard
          icon={<Globe size={16} />}
          label="Frontend"
          check={latestArray.find((c) => c.check_name === 'front')}
        />
        <ArchCard
          icon={<Database size={16} />}
          label="API + Database"
          check={hasDb ? latestArray.find((c) => c.check_name === 'api+db') : undefined}
          noCheck={!hasDb}
        />
      </div>

      {/* Uptime chart */}
      {historyBars.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-300">Uptime (24h)</h2>
            <span className={`text-lg font-bold tabular-nums ${
              uptimePercent >= 99 ? 'text-emerald-400'
                : uptimePercent >= 90 ? 'text-yellow-400'
                  : 'text-red-400'
            }`}>
              {uptimePercent}%
            </span>
          </div>
          <HistoryChart bars={historyBars} />
        </div>
      )}

      {/* Checks detail */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Check Details</h2>
        {latestArray.length === 0 ? (
          <div className="text-center py-12 text-sm text-zinc-600">
            No check data yet. Click Recheck to run the first check.
          </div>
        ) : (
          latestArray.map((check, i) => (
            <div key={check.check_name} style={{ animationDelay: `${i * 80}ms` }}>
              <CheckRow
                name={check.check_name}
                status={check.status as CheckStatus}
                statusCode={check.status_code}
                responseMs={check.response_ms}
                errorMessage={check.error_message}
                checkedAt={check.checked_at}
              />
            </div>
          ))
        )}
      </div>
    </>
  )
}

function ArchCard({
  icon,
  label,
  check,
  noCheck,
}: {
  icon: React.ReactNode
  label: string
  check?: HealthCheck
  noCheck?: boolean
}) {
  if (noCheck) {
    return (
      <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-xl p-4 opacity-40">
        <div className="flex items-center gap-2 text-zinc-600 mb-2">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="text-[11px] text-zinc-700">Not applicable</p>
      </div>
    )
  }

  const status = check?.status || 'unknown'
  const color = status === 'up' ? 'emerald' : status === 'down' ? 'red' : status === 'degraded' ? 'yellow' : 'zinc'

  return (
    <div className={`bg-${color}-500/5 border border-${color}-500/15 rounded-xl p-4`}>
      <div className={`flex items-center gap-2 text-${color}-400 mb-2`}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      {check ? (
        <div className="flex items-center justify-between">
          <StatusBadge status={status as CheckStatus | 'unknown'} />
          <span className="text-[11px] text-zinc-500 tabular-nums">{check.response_ms}ms</span>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600">No data</p>
      )}
    </div>
  )
}
