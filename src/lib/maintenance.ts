import { supabase } from '@/lib/supabase'

/**
 * Tareas que no tienen por qué correr en cada tick del cron.
 *
 * El cron de checks corre cada 30 minutos, pero capturar consumo y consolidar
 * históricos a esa frecuencia sería absurdo: los contadores de los proveedores
 * se mueven despacio y guardar 48 capturas diarias de cada serie llenaría la
 * base con las mismas cifras repetidas. Cada tarea trae su propio intervalo y
 * decide sola si le toca.
 */

/** Cada cuánto capturar consumo. Los contadores no se mueven más rápido que esto. */
const USAGE_INTERVAL_MS = 60 * 60 * 1000 // 1 hora

/** Días de checks crudos a conservar. Lo anterior queda solo como resumen diario. */
const KEEP_DAYS = 30

export async function shouldCollectUsage(): Promise<boolean> {
  const { data } = await supabase
    .from('provider_usage')
    .select('captured_at')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.captured_at) return true
  return Date.now() - Date.parse(data.captured_at) >= USAGE_INTERVAL_MS
}

export interface MaintenanceReport {
  ran: boolean
  rolledUp?: number
  purged?: number
  error?: string
}

/**
 * Consolida el día anterior y purga lo viejo. Corre una vez por día: si el
 * resumen de ayer ya existe, no hay nada que hacer.
 *
 * El orden importa y está garantizado dentro de `purge_old_checks`: nunca borra
 * un día que no haya sido consolidado antes.
 */
export async function runDailyMaintenance(): Promise<MaintenanceReport> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: already } = await supabase
    .from('health_daily')
    .select('day')
    .eq('day', yesterday)
    .limit(1)
    .maybeSingle()

  if (already) return { ran: false }

  const { data: rolledUp, error: rollupError } = await supabase.rpc('rollup_health_daily', {
    target_day: yesterday,
  })
  if (rollupError) return { ran: true, error: `rollup: ${rollupError.message}` }

  const { data: purged, error: purgeError } = await supabase.rpc('purge_old_checks', {
    keep_days: KEEP_DAYS,
  })
  if (purgeError) {
    return { ran: true, rolledUp: rolledUp ?? 0, error: `purge: ${purgeError.message}` }
  }

  return { ran: true, rolledUp: rolledUp ?? 0, purged: purged ?? 0 }
}
