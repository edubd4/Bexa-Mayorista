import { z } from "zod"
import { zUuid } from "./shared"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)
const numeroPreprocess = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

// ─── Enums (espejo de los tipos SQL de la 0025) ─────────────────────────────
export const FRECUENCIA_TAREA = {
  DIARIA:   "DIARIA",
  SEMANAL:  "SEMANAL",
  MENSUAL:  "MENSUAL",
  EVENTUAL: "EVENTUAL",
} as const
export type FrecuenciaTarea = typeof FRECUENCIA_TAREA[keyof typeof FRECUENCIA_TAREA]

export const PRIORIDAD_TAREA = {
  ALTA:  "ALTA",
  MEDIA: "MEDIA",
  BAJA:  "BAJA",
} as const
export type PrioridadTarea = typeof PRIORIDAD_TAREA[keyof typeof PRIORIDAD_TAREA]

export const ESTADO_TAREA = {
  PENDIENTE:  "PENDIENTE",
  EN_PROCESO: "EN_PROCESO",
  FINALIZADA: "FINALIZADA",
} as const
export type EstadoTarea = typeof ESTADO_TAREA[keyof typeof ESTADO_TAREA]

// ─── Tarea (catálogo, admin) ────────────────────────────────────────────────
// El CHECK de coherencia frecuencia/día vive también en SQL (0025).
export const tareaSchema = z
  .object({
    codigo:              z.preprocess(emptyToUndef, z.string().trim().max(20).optional()),
    nombre:              z.string().trim().min(1, "El nombre de la tarea es obligatorio").max(200),
    descripcion:         z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
    area:                z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
    asignado_a:          z.preprocess(emptyToUndef, zUuid().optional()),
    prioridad:           z.enum([PRIORIDAD_TAREA.ALTA, PRIORIDAD_TAREA.MEDIA, PRIORIDAD_TAREA.BAJA]),
    tiempo_estimado_min: z.preprocess(numeroPreprocess, z.number().int().positive().optional()),
    frecuencia:          z.enum([
      FRECUENCIA_TAREA.DIARIA,
      FRECUENCIA_TAREA.SEMANAL,
      FRECUENCIA_TAREA.MENSUAL,
      FRECUENCIA_TAREA.EVENTUAL,
    ]),
    dia_semana:          z.preprocess(numeroPreprocess, z.number().int().min(0).max(6).optional()),
    dia_mes:             z.preprocess(numeroPreprocess, z.number().int().min(1).max(31).optional()),
    hora_sugerida:       z.preprocess(emptyToUndef, z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida").optional()),
    fecha_limite:        z.preprocess(emptyToUndef, z.string().optional()),
    manual_url:          z.preprocess(emptyToUndef, z.string().trim().url("El link al manual no es una URL válida").max(500).optional()),
  })
  .refine((t) => t.frecuencia !== FRECUENCIA_TAREA.SEMANAL || t.dia_semana !== undefined, {
    message: "Una tarea semanal necesita su día de la semana",
    path: ["dia_semana"],
  })
  .refine((t) => t.frecuencia !== FRECUENCIA_TAREA.MENSUAL || t.dia_mes !== undefined, {
    message: "Una tarea mensual necesita su día del mes (31 = fin de mes)",
    path: ["dia_mes"],
  })
export type TareaInput = z.infer<typeof tareaSchema>

// ─── Comentarios de tarea (0026) ────────────────────────────────────────────
export const comentarioTareaSchema = z.object({
  tarea_id: zUuid(),
  texto: z.string().trim().min(1, "Escribí el comentario").max(1000),
})
export type ComentarioTareaInput = z.infer<typeof comentarioTareaSchema>

// ─── Cambio de estado de una ocurrencia ─────────────────────────────────────
export const cambiarEstadoOcurrenciaSchema = z.object({
  ocurrencia_id: zUuid(),
  estado: z.enum([ESTADO_TAREA.PENDIENTE, ESTADO_TAREA.EN_PROCESO, ESTADO_TAREA.FINALIZADA]),
  notas: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CambiarEstadoOcurrenciaInput = z.infer<typeof cambiarEstadoOcurrenciaSchema>
