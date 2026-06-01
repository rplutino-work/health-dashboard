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

    const res = await fetch(url, {
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
      // Frontend & API: expect 200
      if (statusCode !== 200) {
        status = 'down'
        errorMessage = `HTTP ${statusCode}`
      }
    }

    // Validate response body
    if (status === 'up') {
      try {
        const body = await res.text()
        if (check.type === 'api') {
          try {
            JSON.parse(body)
          } catch {
            status = 'degraded'
            errorMessage = 'Invalid JSON response'
          }
        }
        if (check.type === 'frontend' && body.length < 100) {
          status = 'degraded'
          errorMessage = 'Response body too short'
        }
      } catch {
        // Body read failed, still consider the status code result
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
  // Build flat list of all checks
  const allChecks = projects.flatMap((project) =>
    project.checks.map((check) => ({ project, check }))
  )

  const results: CheckResult[] = []
  const CHUNK_SIZE = 10

  // Process in chunks to avoid overwhelming the serverless function
  for (let i = 0; i < allChecks.length; i += CHUNK_SIZE) {
    const chunk = allChecks.slice(i, i + CHUNK_SIZE)
    const chunkResults = await Promise.allSettled(
      chunk.map(({ project, check }) => runSingleCheck(project, check))
    )

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  return results
}
