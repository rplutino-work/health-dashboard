import type { UsageSample } from '@/lib/types'

/**
 * Consumo de Neon.
 *
 * Neon factura COMPUTE HOURS: tiempo que el compute estuvo despierto x CU
 * asignadas. El tamaño de la base es casi irrelevante en la factura.
 *
 * Clave: esto pega a la API de control (console.neon.tech), NO a las bases.
 * Leer el consumo no despierta ningún compute ni cuesta un centavo — que es
 * justamente lo que queremos de un dashboard que corre cada media hora.
 *
 * `active_time` y `cpu_used_sec` son contadores ACUMULADOS del ciclo de
 * facturación y se reinician en `quota_reset_at`. Por eso guardamos también el
 * delta contra la captura anterior: es lo único que se puede sumar por día sin
 * contar dos veces lo mismo.
 */

const NEON_API = 'https://console.neon.tech/api/v2'

interface NeonProject {
  id: string
  name: string
  active_time?: number // segundos
  cpu_used_sec?: number // segundos de CPU ~ CU-segundos
  synthetic_storage_size?: number // bytes
  compute_last_active_at?: string
  quota_reset_at?: string
  default_endpoint_settings?: {
    autoscaling_limit_min_cu?: number
    autoscaling_limit_max_cu?: number
    suspend_timeout_seconds?: number
  }
}

export interface NeonSnapshot {
  samples: UsageSample[]
  /** Estado vivo por proyecto, para mostrar junto al consumo. */
  meta: Array<{
    ref: string
    name: string
    idleMinutes: number | null
    maxCu: number | null
    quotaResetAt: string | null
  }>
}

export async function collectNeon(
  apiKey: string,
  refToSlug: Map<string, string>,
): Promise<NeonSnapshot> {
  const res = await fetch(`${NEON_API}/projects?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Neon API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const { projects } = (await res.json()) as { projects: NeonProject[] }
  const samples: UsageSample[] = []
  const meta: NeonSnapshot['meta'] = []
  const now = Date.now()

  for (const p of projects) {
    const slug = refToSlug.get(p.id) ?? null
    const push = (metric: string, value: number, unit: string) =>
      samples.push({
        provider: 'neon',
        resource_ref: p.id,
        project_slug: slug,
        metric,
        value,
        delta: null, // lo completa el orquestador comparando con la captura previa
        unit,
      })

    // Lo que factura: CU-horas. cpu_used_sec viene en CU-segundos.
    push('cu_hours', (p.cpu_used_sec ?? 0) / 3600, 'CU-h')
    // Cuánto tiempo estuvo despierto — explica el número de arriba.
    push('active_hours', (p.active_time ?? 0) / 3600, 'h')
    // Instantánea, no acumulada: no lleva delta.
    push('storage_bytes', p.synthetic_storage_size ?? 0, 'bytes')

    // Cierre del ciclo de facturación, tal como lo publica Neon. Sin esto habría
    // que asumir mes calendario, y el ciclo de cada proveedor arranca cuando
    // quiere: el consumo "del mes" no significa nada sin saber cuándo corta.
    if (p.quota_reset_at) {
      push('cycle_reset_at_ms', Date.parse(p.quota_reset_at), 'ms')
    }

    const last = p.compute_last_active_at ? Date.parse(p.compute_last_active_at) : null
    meta.push({
      ref: p.id,
      name: p.name,
      idleMinutes: last ? (now - last) / 60000 : null,
      maxCu: p.default_endpoint_settings?.autoscaling_limit_max_cu ?? null,
      quotaResetAt: p.quota_reset_at ?? null,
    })
  }

  return { samples, meta }
}

/** Métricas acumuladas: las que necesitan delta para poder sumarse por día. */
export const NEON_CUMULATIVE = new Set(['cu_hours', 'active_hours'])
