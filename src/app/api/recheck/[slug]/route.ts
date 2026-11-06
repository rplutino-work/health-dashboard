import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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

    // Sin esto el boton de recheck no se veria hasta la proxima regeneracion,
    // que con `revalidate = 1800` serian 30 minutos. Es el path literal y no el
    // patron porque aca cambio un solo proyecto.
    try {
      revalidatePath('/')
      revalidatePath(`/project/${slug}`)
    } catch (err) {
      console.error('Revalidate error:', err)
    }
  }

  return NextResponse.json({ success: true, results })
}
