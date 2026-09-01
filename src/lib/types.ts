export type CheckType = 'frontend' | 'api' | 'admin' | 'cron'
export type CheckStatus = 'up' | 'down' | 'degraded'

export interface CheckDefinition {
  name: string
  type: CheckType
  path: string
}

/**
 * Recursos de infraestructura que le pertenecen a un proyecto. Sirven para
 * atribuirle su consumo: sin este mapeo la API de cada proveedor devuelve
 * identificadores propios (`withered-fire-54414959`) que no dicen nada.
 *
 * Un proyecto puede tener recursos en varios proveedores a la vez, o haberse
 * mudado de uno a otro — por eso son todos opcionales e independientes.
 */
export interface ProjectResources {
  /**
   * Project id de Neon. Acepta varios: argentum tiene produccion y staging como
   * bases separadas, y hasta que esto fue lista la de staging aparecia bajo
   * "consumo sin proyecto asignado" — que es justo donde no hay que buscarla,
   * porque era la que mas consumia.
   */
  neon?: string | string[]
  supabase?: string // project ref de Supabase
  railway?: string // service id de Railway
  vercel?: string // project id o nombre en Vercel
}

/** Normaliza un campo que puede venir suelto o como lista. */
export function refList(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
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

// ── Consumo por proveedor ──────────────────────────────────────────────────

export type Provider = 'neon' | 'supabase' | 'railway' | 'vercel' | 'anthropic'

/**
 * Una medición de consumo. `value` es el valor crudo que devolvió el proveedor;
 * `delta` es cuánto subió desde la captura anterior.
 *
 * La distinción importa: Neon devuelve contadores ACUMULADOS del ciclo de
 * facturación, así que sumar `value` a lo largo del mes contaría lo mismo una y
 * otra vez. Para "cuánto se consumió el martes" hay que sumar `delta`.
 * Las métricas que ya son instantáneas (tamaño de una base) dejan `delta` en null.
 */
export interface UsageSample {
  provider: Provider
  resource_ref: string
  project_slug: string | null
  metric: string
  value: number
  delta: number | null
  unit: string
}

export interface UsageRow extends UsageSample {
  id: number
  captured_at: string
}

/** Consumo de un proyecto ya prorrateado sobre el total del proveedor. */
export interface ProratedUsage {
  project_slug: string | null
  project_name: string
  provider: Provider
  metric: string
  value: number
  unit: string
  share: number // 0..1 sobre el total del proveedor
  cost: number | null // null si no hay costo mensual configurado
}

export interface DailyHealth {
  day: string
  project_slug: string
  checks_total: number
  checks_up: number
  checks_down: number
  checks_degraded: number
  avg_response_ms: number | null
  p95_response_ms: number | null
  uptime_pct: number | null
}
