'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function ManualRecheckButton({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRecheck() {
    setLoading(true)
    try {
      await fetch(`/api/recheck/${slug}`, { method: 'POST' })
      router.refresh()
    } catch (err) {
      console.error('Recheck failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRecheck}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Checking...' : 'Recheck'}
    </button>
  )
}
