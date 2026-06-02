import { Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'

interface HeaderProps {
  total: number
  up: number
  degraded: number
  down: number
  lastRun: string | null
}

export function Header({ total, up, degraded, down, lastRun }: HeaderProps) {
  const timeAgo = lastRun ? getTimeAgo(new Date(lastRun)) : 'Never'
  const allGood = down === 0 && degraded === 0

  return (
    <div className="mb-8">
      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${allGood ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            <Activity size={18} className={allGood ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Health Dashboard</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Clock size={10} />
              <span>Last check {timeAgo}</span>
            </div>
          </div>
        </div>

        {/* Overall status */}
        <div className={`px-4 py-2 rounded-lg border text-sm font-bold tracking-wide ${
          allGood
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {allGood ? 'ALL SYSTEMS OK' : `${down + degraded} ISSUE${down + degraded > 1 ? 'S' : ''}`}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Projects" value={total} icon={<Activity size={12} />} accent="text-zinc-400" />
        <Stat label="Healthy" value={up} icon={<CheckCircle2 size={12} />} accent="text-emerald-400" />
        <Stat label="Slow" value={degraded} icon={<AlertTriangle size={12} />} accent="text-yellow-400" />
        <Stat label="Down" value={down} icon={<XCircle size={12} />} accent="text-red-400" />
      </div>
    </div>
  )
}

function Stat({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-lg px-3 py-2.5">
      <div className={`flex items-center gap-1.5 ${accent} text-[10px] tracking-wider uppercase mb-1`}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-white tabular-nums">{value}</p>
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
