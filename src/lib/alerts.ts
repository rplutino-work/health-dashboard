import { Resend } from 'resend'
import { supabase } from './supabase'
import { CheckResult } from './types'
import { projects, alertConfig } from '@/config/projects'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function processAlerts(results: CheckResult[]) {
  for (const result of results) {
    // No alerts for degraded
    if (result.status === 'degraded') continue

    // Get previous status (skip the current one we just inserted)
    const { data: prevRows } = await supabase
      .from('health_checks')
      .select('status')
      .eq('project_slug', result.project_slug)
      .eq('check_name', result.check_name)
      .order('checked_at', { ascending: false })
      .range(1, 1) // Skip first (current), get second (previous)

    const previousStatus = prevRows?.[0]?.status

    if (result.status === 'down' && previousStatus !== 'down') {
      // Transition to DOWN - check cooldown
      const cooldownTime = new Date(
        Date.now() - alertConfig.cooldownMinutes * 60000
      ).toISOString()

      const { data: recentAlert } = await supabase
        .from('alert_log')
        .select('id')
        .eq('project_slug', result.project_slug)
        .eq('check_name', result.check_name)
        .eq('alert_type', 'down')
        .gte('sent_at', cooldownTime)
        .limit(1)

      if (!recentAlert || recentAlert.length === 0) {
        await sendDownAlert(result)
        await logAlert(result, 'down')
      }
    }

    if (result.status === 'up' && previousStatus === 'down') {
      // Recovery
      await sendRecoveryAlert(result)
      await logAlert(result, 'recovered')
    }
  }
}

async function sendDownAlert(result: CheckResult) {
  const project = projects.find((p) => p.slug === result.project_slug)
  const name = project?.name ?? result.project_slug

  try {
    await getResend().emails.send({
      from: 'Health Dashboard <onboarding@resend.dev>',
      to: alertConfig.emailTo,
      subject: `[DOWN] ${name} - ${result.check_name}`,
      text: [
        `Proyecto: ${name} (${result.project_slug})`,
        `Check: ${result.check_name}`,
        `Status: DOWN`,
        `Error: ${result.error_message ?? 'Unknown'}`,
        `HTTP: ${result.status_code ?? 'N/A'}`,
        `Tiempo: ${result.checked_at}`,
        '',
        `Response: ${result.response_ms}ms`,
      ].join('\n'),
    })
  } catch (err) {
    console.error('Failed to send DOWN alert:', err)
  }
}

async function sendRecoveryAlert(result: CheckResult) {
  const project = projects.find((p) => p.slug === result.project_slug)
  const name = project?.name ?? result.project_slug

  try {
    await getResend().emails.send({
      from: 'Health Dashboard <onboarding@resend.dev>',
      to: alertConfig.emailTo,
      subject: `[RECOVERED] ${name} - ${result.check_name}`,
      text: [
        `Proyecto: ${name} (${result.project_slug})`,
        `Check: ${result.check_name}`,
        `Status: UP (recuperado)`,
        `Response: ${result.response_ms}ms`,
        `Tiempo: ${result.checked_at}`,
      ].join('\n'),
    })
  } catch (err) {
    console.error('Failed to send RECOVERY alert:', err)
  }
}

async function logAlert(result: CheckResult, alertType: 'down' | 'recovered') {
  await supabase.from('alert_log').insert({
    project_slug: result.project_slug,
    check_name: result.check_name,
    alert_type: alertType,
    email_to: alertConfig.emailTo,
  })
}
