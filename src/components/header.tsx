import { Activity, CheckCircle2, AlertTriangle, XCircle, Clock, DollarSign } from 'lucide-react'

interface HeaderProps {
  total: number
  up: number
  degraded: number
  down: number
  lastRun: string | null
  /** Costo mensual de toda la infraestructura, si hay tarifas configuradas. */
  monthlyTotal?: number | null
}

export function Header({ total, up, degraded, down, lastRun, monthlyTotal = null }: HeaderProps) {
  const timeAgo = lastRun ? getTimeAgo(new Date(lastRun)) : 'nunca'
  const allGood = down === 0 && degraded === 0

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              allGood ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            <Activity size={18} className={allGood ? 'text-emerald-600' : 'text-red-600'} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 tracking-tight">Health Dashboard</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Clock size={10} />
              <span>último chequeo {timeAgo}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {monthlyTotal !== null && (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-right">
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase tracking-wider">
                <DollarSign size={10} />
                infra / mes
              </div>
              <p className="text-base font-bold text-zinc-900 tabular-nums leading-tight">
                US${monthlyTotal.toFixed(0)}
              </p>
            </div>
          )}
          <div
            className={`px-4 py-2 rounded-lg border text-xs font-bold tracking-wide ${
              allGood
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {allGood ? 'TODO OK' : `${down + degraded} PROBLEMA${down + degraded > 1 ? 'S' : ''}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Proyectos" value={total} icon={<Activity size={12} />} accent="text-zinc-500" />
        <Stat label="Sanos" value={up} icon={<CheckCircle2 size={12} />} accent="text-emerald-600" />
        <Stat label="Lentos" value={degraded} icon={<AlertTriangle size={12} />} accent="text-amber-600" />
        <Stat label="Caídos" value={down} icon={<XCircle size={12} />} accent="text-red-600" />
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg px-3 py-2.5">
      <div
        className={`flex items-center gap-1.5 ${accent} text-[10px] tracking-wider uppercase mb-1`}
      >
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-zinc-900 tabular-nums">{value}</p>
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}
