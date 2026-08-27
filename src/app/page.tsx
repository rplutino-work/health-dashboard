import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { Header } from '@/components/header'
import { ProjectCard } from '@/components/project-card'
import { UsagePanel } from '@/components/usage-panel'
import { getProratedUsage } from '@/lib/usage'

export const revalidate = 60

interface HealthCheck {
  project_slug: string
  check_name: string
  status: string
  status_code: number | null
  response_ms: number
  error_message: string | null
  checked_at: string
}

async function getData() {
  const { data: checks } = await supabase
    .from('health_checks')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(300)

  const { data: lastRun } = await supabase
    .from('health_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  return { checks: (checks as HealthCheck[]) || [], lastRun }
}


/**
 * Consumo para el panel. Lee de provider_usage, que ya viene capturado por el
 * cron: la página no llama a las APIs de los proveedores, así que abrir el
 * dashboard no dispara pedidos ni consumo contra ellos.
 */
async function getUsage() {
  const [neon, dbBytes, conns, maxConns, schemaRows] = await Promise.all([
    getProratedUsage('neon', 'cu_hours'),
    latestValue('supabase', 'db_bytes'),
    latestValue('supabase', 'connections'),
    latestValue('supabase', 'max_connections'),
    getProratedUsage('supabase', 'schema_bytes'),
  ])

  const { data: last } = await supabase
    .from('provider_usage')
    .select('captured_at')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    neon: neon.filter((n) => n.value > 0),
    supabase: {
      dbBytes,
      connections: conns,
      maxConnections: maxConns,
      schemas: schemaRows
        .filter((r) => r.value > 0.05 * 1048576)
        .map((r) => ({ name: r.project_name, bytes: r.value })),
    },
    capturedAt: last?.captured_at ?? null,
  }
}

async function latestValue(provider: string, metric: string): Promise<number | null> {
  const { data } = await supabase
    .from('provider_usage')
    .select('value')
    .eq('provider', provider)
    .eq('metric', metric)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? Number(data.value) : null
}

export default async function DashboardPage() {
  const [{ checks, lastRun }, usage] = await Promise.all([getData(), getUsage()])

  // Deduplicate: keep latest per project_slug+check_name
  const latest = new Map<string, HealthCheck>()
  for (const check of checks) {
    const key = `${check.project_slug}:${check.check_name}`
    if (!latest.has(key)) {
      latest.set(key, check)
    }
  }

  // Build project statuses
  const projectStatuses = projects.map((project) => {
    const projectChecks = [...latest.values()].filter(
      (c) => c.project_slug === project.slug
    )

    const status = projectChecks.some((c) => c.status === 'down')
      ? 'down'
      : projectChecks.some((c) => c.status === 'degraded')
        ? 'degraded'
        : projectChecks.length > 0
          ? 'up'
          : 'unknown'

    const avgResponseMs =
      projectChecks.length > 0
        ? Math.round(
            projectChecks.reduce((sum, c) => sum + (c.response_ms || 0), 0) /
              projectChecks.length
          )
        : 0

    return { ...project, status, avgResponseMs, checks: projectChecks }
  })

  // Sort: down first, then degraded, then up, then unknown
  const order = { down: 0, degraded: 1, up: 2, unknown: 3 }
  projectStatuses.sort(
    (a, b) =>
      (order[a.status as keyof typeof order] ?? 3) -
      (order[b.status as keyof typeof order] ?? 3)
  )

  const up = projectStatuses.filter((p) => p.status === 'up').length
  const degraded = projectStatuses.filter((p) => p.status === 'degraded').length
  const down = projectStatuses.filter((p) => p.status === 'down').length

  return (
    <>
      <Header
        total={projects.length}
        up={up}
        degraded={degraded}
        down={down}
        lastRun={lastRun?.finished_at || lastRun?.started_at || null}
      />

      <div className="mb-5">
        <UsagePanel neon={usage.neon} supabase={usage.supabase} capturedAt={usage.capturedAt} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projectStatuses.map((project) => (
          <ProjectCard
            key={project.slug}
            slug={project.slug}
            name={project.name}
            url={project.url}
            status={project.status}
            avgResponseMs={project.avgResponseMs}
            checks={project.checks}
          />
        ))}
      </div>
    </>
  )
}
