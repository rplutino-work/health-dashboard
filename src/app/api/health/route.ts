import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { projects } from '@/config/projects'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Get latest check per project+check_name
  const { data: checks } = await supabase
    .from('health_checks')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(200)

  if (!checks) {
    return NextResponse.json({ projects: [], lastRun: null })
  }

  // Deduplicate: keep only the latest per project_slug+check_name
  const latest = new Map<string, typeof checks[0]>()
  for (const check of checks) {
    const key = `${check.project_slug}:${check.check_name}`
    if (!latest.has(key)) {
      latest.set(key, check)
    }
  }

  // Build response grouped by project
  const projectStatuses = projects.map((project) => {
    const projectChecks = [...latest.values()].filter(
      (c) => c.project_slug === project.slug
    )

    const overallStatus = projectChecks.some((c) => c.status === 'down')
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

    return {
      slug: project.slug,
      name: project.name,
      url: project.url,
      status: overallStatus,
      avgResponseMs,
      checks: projectChecks,
    }
  })

  // Get last run
  const { data: lastRun } = await supabase
    .from('health_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    projects: projectStatuses,
    lastRun,
  })
}
