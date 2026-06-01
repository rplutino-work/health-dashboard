import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { Header } from '@/components/header'
import { ProjectCard } from '@/components/project-card'

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

export default async function DashboardPage() {
  const { checks, lastRun } = await getData()

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
