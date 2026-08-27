import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'
import { Header } from '@/components/header'
import { ProjectCard } from '@/components/project-card'
import { CostPanel } from '@/components/cost-panel'
import { getCostBreakdown, getInvoices } from '@/lib/costs'

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
 * Métricas puntuales de Supabase. Van aparte del prorrateo porque no son un
 * costo sino un techo: en el plan free lo que corta el servicio es pasarse de
 * los 500 MB o de las conexiones, no gastar de más.
 */
async function getSupabaseLimits() {
  const one = async (metric: string) => {
    const { data } = await supabase
      .from('provider_usage')
      .select('value')
      .eq('provider', 'supabase')
      .eq('metric', metric)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? Number(data.value) : null
  }
  const [dbBytes, connections, maxConnections] = await Promise.all([
    one('db_bytes'),
    one('connections'),
    one('max_connections'),
  ])
  return { dbBytes, connections, maxConnections }
}

export default async function DashboardPage() {
  const [{ checks, lastRun }, breakdown, invoices, supabaseLimits] = await Promise.all([
    getData(),
    getCostBreakdown(),
    getInvoices(),
    getSupabaseLimits(),
  ])

  // Deduplicate: keep latest per project_slug+check_name
  const latest = new Map<string, HealthCheck>()
  for (const check of checks) {
    const key = `${check.project_slug}:${check.check_name}`
    if (!latest.has(key)) {
      latest.set(key, check)
    }
  }

  const costBySlug = new Map(breakdown.projects.map((p) => [p.slug, p]))

  const projectStatuses = projects.map((project) => {
    const projectChecks = [...latest.values()].filter((c) => c.project_slug === project.slug)

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
            projectChecks.reduce((sum, c) => sum + (c.response_ms || 0), 0) / projectChecks.length
          )
        : 0

    const cost = costBySlug.get(project.slug)

    return {
      ...project,
      status,
      avgResponseMs,
      checks: projectChecks,
      resources: cost?.resources ?? [],
      monthlyCost: cost?.total ?? null,
      spark: cost?.spark ?? [],
    }
  })

  // Primero lo que está roto; a igual estado, lo que más cuesta. Un dashboard
  // ordena por lo que necesita atención, no alfabéticamente.
  const order = { down: 0, degraded: 1, up: 2, unknown: 3 }
  projectStatuses.sort((a, b) => {
    const byStatus =
      (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3)
    if (byStatus !== 0) return byStatus
    return (b.monthlyCost ?? -1) - (a.monthlyCost ?? -1)
  })

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
        monthlyTotal={breakdown.grandTotalToDate}
      />

      <CostPanel breakdown={breakdown} invoices={invoices} supabase={supabaseLimits} />

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
            resources={project.resources}
            monthlyCost={project.monthlyCost}
            spark={project.spark}
          />
        ))}
      </div>
    </>
  )
}
