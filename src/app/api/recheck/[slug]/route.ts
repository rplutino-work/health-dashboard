import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runAllChecks } from '@/lib/checker'
import { projects } from '@/config/projects'

export const maxDuration = 30

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const results = await runAllChecks([project])

  if (results.length > 0) {
    await supabase.from('health_checks').insert(results)
  }

  return NextResponse.json({ success: true, results })
}
