import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runAllChecks } from '@/lib/checker'
import { processAlerts } from '@/lib/alerts'
import { projects } from '@/config/projects'

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

  return NextResponse.json({
    success: true,
    total: results.length,
    passed,
    failed,
    degraded,
  })
}
