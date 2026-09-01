import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runAllChecks } from '@/lib/checker'
import { processAlerts } from '@/lib/alerts'
import { projects } from '@/config/projects'
import { collectAllUsage } from '@/lib/usage'
import { shouldCollectUsage, runDailyMaintenance } from '@/lib/maintenance'
import { processCostAlerts, sendDailyDigest } from '@/lib/cost-alerts'
import { snapshotBilling } from '@/lib/billing-history'
import { refreshCharges } from '@/lib/provider-charges'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}

async function handler(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()

  // Create run record
  const { data: run } = await supabase
    .from('health_runs')
    .insert({ started_at: startedAt })
    .select('id')
    .single()

  // Run all checks
  const results = await runAllChecks(projects)

  // Insert results
  if (results.length > 0) {
    await supabase.from('health_checks').insert(results)
  }

  // Count results
  const passed = results.filter((r) => r.status === 'up').length
  const failed = results.filter((r) => r.status === 'down').length
  const degraded = results.filter((r) => r.status === 'degraded').length

  // Update run record
  if (run?.id) {
    await supabase
      .from('health_runs')
      .update({
        finished_at: new Date().toISOString(),
        total_checks: results.length,
        passed,
        failed,
        degraded,
      })
      .eq('id', run.id)
  }

  // Process alerts (DOWN / RECOVERED emails)
  try {
    await processAlerts(results)
  } catch (err) {
    console.error('Alert processing error:', err)
  }

  // Consumo de los proveedores. Se lee de sus APIs de control, no de las bases:
  // mirar cuanto gasta Neon no despierta ningun compute ni suma a la factura.
  // Con su propio intervalo, para no guardar la misma cifra 48 veces al dia.
  // ?force=usage salta el intervalo, para refrescar a mano tras un cambio grande
  // (una migracion, una purga) sin esperar a la proxima ventana.
  const force = new URL(request.url).searchParams.get('force') === 'usage'
  let usage: Awaited<ReturnType<typeof collectAllUsage>> | null = null
  try {
    if (force || (await shouldCollectUsage())) {
      usage = await collectAllUsage()
    }
  } catch (err) {
    console.error('Usage collection error:', err)
  }

  // Consolidar el dia anterior y purgar checks crudos viejos. Una vez por dia.
  let maintenance = null
  try {
    maintenance = await runDailyMaintenance()
  } catch (err) {
    console.error('Maintenance error:', err)
  }

  // Recalcular los cargos ANTES del snapshot: si no, la foto del dia guarda el
  // monto viejo. Tambien avanza los ciclos que vencieron — es lo que faltaba
  // cuando el 01/09 el dashboard seguia mostrando el ciclo de agosto.
  let charges = null
  try {
    charges = await refreshCharges()
  } catch (err) {
    console.error('Charge refresh error:', err)
  }

  // Foto del estado de cada ciclo. Va junto con la captura de consumo para que
  // el snapshot refleje los mismos numeros que se acaban de medir.
  let billing = null
  if (usage) {
    try {
      billing = await snapshotBilling()
    } catch (err) {
      console.error('Billing snapshot error:', err)
    }
  }

  // Avisos de plata y limites. Van despues de capturar consumo para que miren
  // datos frescos, no los de la corrida anterior.
  let costAlerts = null
  try {
    costAlerts = await processCostAlerts()
  } catch (err) {
    console.error('Cost alerts error:', err)
  }

  // Resumen diario, a partir de las 9 de la manana hora argentina: un momento
  // fijo para enterarse de como viene todo sin depender de que algo se rompa.
  let digest = false
  try {
    const hourArg = Number(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: 'numeric',
        hour12: false,
      })
    )
    // ?digest=force reenvia el resumen aunque ya se haya mandado hoy.
    const forced = request.nextUrl.searchParams.get('digest') === 'force'
    if (forced || hourArg >= 9) digest = await sendDailyDigest(forced)
  } catch (err) {
    console.error('Digest error:', err)
  }

  return NextResponse.json({
    success: true,
    total: results.length,
    passed,
    failed,
    degraded,
    usage: usage ? { captured: usage.captured, errors: usage.errors } : 'skipped',
    maintenance,
    costAlerts,
    digest,
    billing,
    charges,
  })
}
