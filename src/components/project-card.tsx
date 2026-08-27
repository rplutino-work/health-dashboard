import Link from 'next/link'
import { ChevronRight, Globe, Server, Database } from 'lucide-react'
import { StatusBadge } from './status-badge'
import { Sparkline } from './sparkline'
import type { ResourceCost } from '@/lib/costs'

interface ProjectCardProps {
  slug: string
  name: string
  url: string
  status: string
  avgResponseMs: number
  checks: Array<{
    check_name: string
    status: string
    response_ms: number
    checked_at: string
  }>
  /** Infraestructura del proyecto con su costo prorrateado. */
  resources?: ResourceCost[]
  monthlyCost?: number | null
  /** Serie de consumo para la tendencia al lado del nombre. */
  spark?: number[]
}

const ROLE_META = {
  frontend: { icon: Globe, label: 'Front' },
  backend: { icon: Server, label: 'Back' },
  database: { icon: Database, label: 'Base' },
} as const

/** Números chicos con decimal, grandes sin: 8.3 CU-h pero 221 CU-h. */
function fmt(value: number, unit: string) {
  if (unit === 'bytes') {
    const mb = value / 1048576
    return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
  }
  const n = value >= 100 ? Math.round(value).toString() : value.toFixed(1)
  return unit ? `${n} ${unit}` : n
}

export function ProjectCard({
  slug,
  name,
  url,
  status,
  avgResponseMs,
  checks,
  resources = [],
  monthlyCost = null,
  spark = [],
}: ProjectCardProps) {
  return (
    <Link
      href={`/project/${slug}`}
      className="group flex flex-col bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all duration-200"
      style={{ animation: 'fade-in 0.3s ease-out both' }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-900 truncate">{name}</h3>
            <Sparkline values={spark} className="shrink-0 opacity-70" />
          </div>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
            {url.replace('https://', '')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={status as 'up' | 'down' | 'degraded' | 'unknown'} />
          <ChevronRight
            size={14}
            className="text-zinc-300 group-hover:text-zinc-500 transition-colors"
          />
        </div>
      </div>

      {/* Infraestructura: front, back y base en el mismo lugar. Es la pregunta
          real —cuanto cuesta este proyecto— que mirando cada proveedor por
          separado no se puede responder. */}
      {resources.length > 0 && (
        <ul className="space-y-1 mb-3">
          {resources.map((r) => {
            const meta = ROLE_META[r.role]
            const Icon = meta.icon
            return (
              <li
                key={`${r.provider}-${r.ref}`}
                className="flex items-center gap-2 text-[11px]"
              >
                <Icon size={11} className="text-zinc-400 shrink-0" />
                <span className="text-zinc-500 w-9 shrink-0">{meta.label}</span>
                <span className="text-zinc-400 truncate flex-1">{r.provider}</span>
                <span className="text-zinc-500 tabular-nums shrink-0">
                  {fmt(r.value, r.unit)}
                </span>
                {r.cost !== null && (
                  <span className="text-zinc-700 font-semibold tabular-nums shrink-0 w-14 text-right">
                    US${r.cost.toFixed(2)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-auto pt-2 border-t border-zinc-100 flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">
          {checks.length} check{checks.length === 1 ? '' : 's'} · {avgResponseMs} ms
        </span>
        {monthlyCost !== null ? (
          <span className="text-xs font-bold text-zinc-900 tabular-nums">
            US${monthlyCost.toFixed(2)}
            <span className="text-[10px] font-normal text-zinc-400">/mes</span>
          </span>
        ) : (
          <span className="text-[10px] text-zinc-300">sin costo asignado</span>
        )}
      </div>
    </Link>
  )
}
