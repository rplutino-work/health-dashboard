export type CheckType = 'frontend' | 'api' | 'admin'
export type CheckStatus = 'up' | 'down' | 'degraded'

export interface CheckDefinition {
  name: string
  type: CheckType
  path: string
}

export interface ProjectConfig {
  slug: string
  name: string
  url: string
  checks: CheckDefinition[]
}

export interface CheckResult {
  project_slug: string
  check_name: string
  status: CheckStatus
  status_code: number | null
  response_ms: number
  error_message: string | null
  checked_at: string
}

export interface HealthRun {
  id: number
  started_at: string
  finished_at: string | null
  total_checks: number
  passed: number
  failed: number
  degraded: number
}
