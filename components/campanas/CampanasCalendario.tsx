"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, CircleDot } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ESTADO_CAMPANA_VARIANT,
  type EstadoCampanaEfectivo,
} from "@/lib/validators/campana"
import { cn } from "@/lib/utils"

type CampanaItem = {
  id: string
  id_publico: string
  nombre: string
  fecha_inicio: string   // yyyy-mm-dd
  fecha_fin: string      // yyyy-mm-dd
  estado_efectivo: EstadoCampanaEfectivo
}

type Props = {
  campanas: CampanaItem[]
  initialMonth?: string  // yyyy-mm
}

// Mapa Badge variant → clases tailwind para el bloque en el calendario
const VARIANT_CLASSES: Record<string, string> = {
  default: "bg-app-accent/15 text-app-accent border-app-accent/40",
  green:   "bg-app-green/15 text-app-green border-app-green/40",
  amber:   "bg-app-amber/15 text-app-amber border-app-amber/40",
  red:     "bg-app-red/15 text-app-red border-app-red/40",
  accent:  "bg-app-accent/15 text-app-accent border-app-accent/40",
  violet:  "bg-app-violet/15 text-app-violet border-app-violet/40",
  gray:    "bg-app-surface-mid text-app-muted border-app-line",
  outline: "bg-app-surface-mid/50 text-app-secondary border-app-line",
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

// Devuelve la lista de 42 días (6 semanas x 7 días) que cubre el mes
function buildDias(year: number, monthIdx: number): Date[] {
  const first = new Date(year, monthIdx, 1)
  const startOffset = first.getDay()
  const start = new Date(year, monthIdx, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// yyyy-mm-dd sin desfase de zona horaria
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function CampanasCalendario({ campanas, initialMonth }: Props) {
  const hoy = new Date()
  const [year, setYear] = useState(() =>
    initialMonth ? Number(initialMonth.slice(0, 4)) : hoy.getFullYear(),
  )
  const [monthIdx, setMonthIdx] = useState(() =>
    initialMonth ? Number(initialMonth.slice(5, 7)) - 1 : hoy.getMonth(),
  )

  const dias = useMemo(() => buildDias(year, monthIdx), [year, monthIdx])
  const hoyStr = ymd(hoy)

  const campanasEnMes = useMemo(() => {
    const primero = ymd(dias[0]!)
    const ultimo = ymd(dias[dias.length - 1]!)
    return campanas.filter(
      (c) => !(c.fecha_fin < primero || c.fecha_inicio > ultimo),
    )
  }, [campanas, dias])

  function nav(delta: number) {
    let m = monthIdx + delta
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonthIdx(m)
    setYear(y)
  }

  function irHoy() {
    setYear(hoy.getFullYear())
    setMonthIdx(hoy.getMonth())
  }

  return (
    <div className="space-y-4">
      {/* Header nav */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold capitalize">
          {MESES[monthIdx]} {year}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => nav(-1)} aria-label="Mes anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={irHoy}>Hoy</Button>
          <Button variant="outline" size="sm" onClick={() => nav(1)} aria-label="Mes siguiente">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Cabecera días de la semana */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono text-app-muted uppercase tracking-wider">
        {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d) => {
          const dStr = ymd(d)
          const enMes = d.getMonth() === monthIdx
          const esHoy = dStr === hoyStr
          const campanasDelDia = campanasEnMes.filter(
            (c) => dStr >= c.fecha_inicio && dStr <= c.fecha_fin,
          )
          return (
            <div
              key={dStr}
              className={cn(
                "min-h-[96px] rounded-md border p-1.5 flex flex-col gap-1 overflow-hidden",
                enMes ? "border-app-line-soft bg-app-card" : "border-transparent bg-app-surface-low/50",
                esHoy && "ring-1 ring-app-accent",
              )}
            >
              <div className={cn(
                "text-[11px] font-mono tabular-nums",
                enMes ? "text-app-secondary" : "text-app-muted",
                esHoy && "text-app-accent font-semibold",
              )}>
                {d.getDate()}
              </div>
              {campanasDelDia.slice(0, 3).map((c) => {
                const cls = VARIANT_CLASSES[ESTADO_CAMPANA_VARIANT[c.estado_efectivo]] ?? VARIANT_CLASSES.outline
                return (
                  <Link
                    key={c.id}
                    href={`/campanas/${c.id}`}
                    className={cn(
                      "block text-[10.5px] leading-tight border rounded px-1.5 py-0.5 truncate hover:opacity-80 transition-opacity",
                      cls,
                    )}
                    title={`${c.id_publico} · ${c.nombre}`}
                  >
                    {c.nombre}
                  </Link>
                )
              })}
              {campanasDelDia.length > 3 && (
                <p className="text-[10px] text-app-muted">+{campanasDelDia.length - 3} más</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs text-app-secondary pt-2 border-t border-app-line-soft">
        {(["PROGRAMADA", "ACTIVA", "PAUSADA", "CONCLUIDA", "CANCELADA"] as EstadoCampanaEfectivo[]).map((e) => {
          const cls = VARIANT_CLASSES[ESTADO_CAMPANA_VARIANT[e]] ?? VARIANT_CLASSES.outline
          return (
            <span key={e} className="inline-flex items-center gap-1.5">
              <CircleDot className={cn("w-3 h-3", cls.split(" ").find((c) => c.startsWith("text-")))} />
              <span className="capitalize">{e.toLowerCase()}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
