import { ProjectConfig, CheckDefinition, CheckResult, CheckStatus } from './types'
import { alertConfig } from '@/config/projects'

async function runSingleCheck(
  project: ProjectConfig,
  check: CheckDefinition
): Promise<CheckResult> {
  const url = `${project.url}${check.path}`
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), alertConfig.timeoutMs)

    // HEAD request first (ultra lightweight - no body download)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: check.type === 'admin' ? 'manual' : 'follow',
      headers: { 'User-Agent': 'HealthDashboard/1.0' },
    })
    clearTimeout(timeout)

    const responseMs = Date.now() - start
    const statusCode = res.status
    let status: CheckStatus = 'up'
    let errorMessage: string | null = null

    if (check.type === 'admin') {
      // Admin: 200, 302, 307 are all healthy (redirect to login = OK)
      if (statusCode >= 500) {
        status = 'down'
        errorMessage = `HTTP ${statusCode}`
      }
    } else {
      // Frontend: expect 200
      if (statusCode !== 200) {
        status = 'down'
        errorMessage = `HTTP ${statusCode}`
      }
    }

    // Slow response = degraded
    if (status === 'up' && responseMs > alertConfig.degradedThresholdMs) {
      status = 'degraded'
      errorMessage = `Slow: ${responseMs}ms`
    }

    return {
      project_slug: project.slug,
      check_name: check.name,
      status,
      status_code: statusCode,
      response_ms: responseMs,
      error_message: errorMessage,
      checked_at: new Date().toISOString(),
    }
  } catch (err: unknown) {
    const error = err as Error
    return {
      project_slug: project.slug,
      check_name: check.name,
      status: 'down',
      status_code: null,
      response_ms: Date.now() - start,
      error_message: error.name === 'AbortError' ? 'Timeout' : error.message,
      checked_at: new Date().toISOString(),
    }
  }
}

export async function runAllChecks(
  projects: ProjectConfig[]
): Promise<CheckResult[]> {
  const allChecks = projects.flatMap((project) =>
    project.checks.map((check) => ({ project, check }))
  )

  // All checks in parallel (all are lightweight HEAD requests now)
  const results = await Promise.allSettled(
    allChecks.map(({ project, check }) => runSingleCheck(project, check))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<CheckResult> => r.status === 'fulfilled')
    .map((r) => r.value)
}
