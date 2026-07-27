import type { EstadoTarea, FrecuenciaTarea, PrioridadTarea } from "@/lib/validators/tarea"

export const ESTADO_TAREA_LABEL: Record<EstadoTarea, string> = {
  PENDIENTE:  "Pendiente",
  EN_PROCESO: "En proceso",
  FINALIZADA: "Finalizada",
}

export const ESTADO_TAREA_VARIANT: Record<EstadoTarea, "amber" | "accent" | "green"> = {
  PENDIENTE:  "amber",
  EN_PROCESO: "accent",
  FINALIZADA: "green",
}

export const PRIORIDAD_TAREA_LABEL: Record<PrioridadTarea, string> = {
  ALTA:  "Alta",
  MEDIA: "Media",
  BAJA:  "Baja",
}

export const PRIORIDAD_TAREA_VARIANT: Record<PrioridadTarea, "red" | "amber" | "gray"> = {
  ALTA:  "red",
  MEDIA: "amber",
  BAJA:  "gray",
}

export const FRECUENCIA_TAREA_LABEL: Record<FrecuenciaTarea, string> = {
  DIARIA:   "Diaria",
  SEMANAL:  "Semanal",
  MENSUAL:  "Mensual",
  EVENTUAL: "Cuando corresponda",
}

export const DIA_SEMANA_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
}

// "Diaria · 09:00" / "Semanal · Lunes 10:00" / "Mensual · día 31" / "Cuando corresponda"
export function describirFrecuencia(t: {
  frecuencia: FrecuenciaTarea
  dia_semana: number | null
  dia_mes: number | null
  hora_sugerida: string | null
}): string {
  const hora = t.hora_sugerida ? ` · ${t.hora_sugerida.slice(0, 5)}` : ""
  switch (t.frecuencia) {
    case "DIARIA":   return `Diaria${hora}`
    case "SEMANAL":  return `Semanal · ${DIA_SEMANA_LABEL[t.dia_semana ?? 1]}${hora}`
    case "MENSUAL":  return `Mensual · día ${t.dia_mes === 31 ? "fin de mes" : t.dia_mes}${hora}`
    case "EVENTUAL": return "Cuando corresponda"
  }
}
