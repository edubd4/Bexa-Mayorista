import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { formatPesos } from "@/lib/utils"

type Metricas = {
  ventas_manuales: number
  monto_manual: number
  ventas_automaticas: number
  monto_automatico: number
  ventas_totales: number
  monto_total: number
  costo: number
  roi_pct: number | null
  ticket_promedio: number
}

export function MetricasCard({ metricas }: { metricas: Metricas }) {
  const roi = metricas.roi_pct
  const roiIcon =
    roi === null ? Minus : roi > 0 ? TrendingUp : roi < 0 ? TrendingDown : Minus
  const roiColor =
    roi === null
      ? "text-app-muted"
      : roi > 0
        ? "text-app-green"
        : roi < 0
          ? "text-app-red"
          : "text-app-muted"

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label="Ventas atribuidas" value={String(metricas.ventas_totales)}
        hint={`${metricas.ventas_manuales} manuales · ${metricas.ventas_automaticas} auto`} />
      <Stat label="Monto vendido" value={formatPesos(metricas.monto_total)}
        hint={`${formatPesos(metricas.monto_manual)} + ${formatPesos(metricas.monto_automatico)} auto`} />
      <Stat label="Costo" value={formatPesos(metricas.costo)}
        hint={metricas.costo === 0 ? "Sin gasto asociado" : "De la tabla gastos"} />
      <div className="rounded-xl border border-app-line-soft bg-app-card p-4">
        <p className="font-mono text-[10px] text-app-muted tracking-wider uppercase">ROI</p>
        <p className={`font-display text-2xl font-bold mt-1 flex items-center gap-1.5 ${roiColor}`}>
          {(() => { const Ic = roiIcon; return <Ic className="w-5 h-5" /> })()}
          {roi === null ? "—" : `${roi > 0 ? "+" : ""}${roi.toFixed(1)}%`}
        </p>
        <p className="text-xs text-app-muted mt-1">
          Ticket promedio: {formatPesos(metricas.ticket_promedio)}
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-4">
      <p className="font-mono text-[10px] text-app-muted tracking-wider uppercase">{label}</p>
      <p className="font-display text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-app-muted mt-1">{hint}</p>}
    </div>
  )
}
