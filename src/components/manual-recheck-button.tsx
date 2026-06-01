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
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
    >
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Checking...' : 'Recheck'}
    </button>
  )
}
