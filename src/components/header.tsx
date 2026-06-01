import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

interface HeaderProps {
  total: number
  up: number
  degraded: number
  down: number
  lastRun: string | null
}

export function Header({ total, up, degraded, down, lastRun }: HeaderProps) {
  const timeAgo = lastRun ? getTimeAgo(new Date(lastRun)) : 'Never'

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <Activity size={20} className="text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Health Dashboard</h1>
          <p className="text-xs text-zinc-500">Last check: {timeAgo}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={total}
          icon={<Activity size={14} />}
          color="text-zinc-400"
          bg="bg-zinc-800"
        />
        <StatCard
          label="Up"
          value={up}
          icon={<CheckCircle2 size={14} />}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
        />
        <StatCard
          label="Degraded"
          value={degraded}
          icon={<AlertTriangle size={14} />}
          color="text-yellow-400"
          bg="bg-yellow-500/10"
        />
        <StatCard
          label="Down"
          value={down}
          icon={<XCircle size={14} />}
          color="text-red-400"
          bg="bg-red-500/10"
        />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div className={`${bg} rounded-lg p-3 border border-zinc-800`}>
      <div className={`flex items-center gap-1.5 ${color} text-xs mb-1`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
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
