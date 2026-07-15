import { z } from "zod"
import { zUuid } from "./shared"

// ─── Enums (matchean con el schema SQL) ─────────────────────────────────────
export const ESTADO_CAMPANA_MANUAL = {
  BORRADOR: "BORRADOR",
  PAUSADA: "PAUSADA",
  CANCELADA: "CANCELADA",
} as const
export type EstadoCampanaManual = typeof ESTADO_CAMPANA_MANUAL[keyof typeof ESTADO_CAMPANA_MANUAL]

// Estados efectivos que la vista v_campanas devuelve.
// Los tres primeros los calcula el sistema por fecha; los otros vienen del manual.
export const ESTADO_CAMPANA_EFECTIVO = {
  BORRADOR: "BORRADOR",
  PROGRAMADA: "PROGRAMADA",
  ACTIVA: "ACTIVA",
  CONCLUIDA: "CONCLUIDA",
  PAUSADA: "PAUSADA",
  CANCELADA: "CANCELADA",
} as const
export type EstadoCampanaEfectivo = typeof ESTADO_CAMPANA_EFECTIVO[keyof typeof ESTADO_CAMPANA_EFECTIVO]

export const ESTADO_PUBLICACION = {
  BORRADOR: "BORRADOR",
  PROGRAMADA: "PROGRAMADA",
  PUBLICADA: "PUBLICADA",
  CANCELADA: "CANCELADA",
} as const
export type EstadoPublicacion = typeof ESTADO_PUBLICACION[keyof typeof ESTADO_PUBLICACION]

// Emptystring → undefined (para inputs opcionales vacíos)
const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v

// ─── Schema Campaña ────────────────────────────────────────────────────────
// Base sin refine (para poder derivar partial); campanaSchema aplica el refine.
const campanaBase = z.object({
  nombre:               z.string().trim().min(1, "Nombre requerido").max(120),
  descripcion:          z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  fecha_inicio:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  fecha_fin:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  estado_manual:        z.nativeEnum(ESTADO_CAMPANA_MANUAL).nullable().optional(),
  presupuesto_estimado: z.coerce.number().min(0).default(0),
  gasto_id:             z.preprocess(emptyToUndef, zUuid().optional()),
  notas:                z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  // M:N — enviadas como arrays de IDs
  canal_ids:            z.array(z.coerce.number().int().positive()).default([]),
  producto_ids:         z.array(zUuid()).default([]),
})

export const campanaSchema = campanaBase.refine(
  (data) => data.fecha_fin >= data.fecha_inicio,
  { message: "La fecha de fin debe ser >= a la de inicio", path: ["fecha_fin"] },
)

export type CampanaInput = z.infer<typeof campanaSchema>

// Actualización parcial (para PATCH del cambio de estado, ajuste de gasto, etc.)
export const campanaUpdateSchema = campanaBase.partial()
export type CampanaUpdate = z.infer<typeof campanaUpdateSchema>

// ─── Schema Publicación ────────────────────────────────────────────────────
export const publicacionSchema = z.object({
  campana_id:         zUuid(),
  canal_id:           z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional()),
  titulo:             z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  cuerpo:             z.string().trim().min(1, "Cuerpo requerido").max(5000),
  fecha_publicacion:  z.preprocess(emptyToUndef, z.string().datetime().optional()),
  estado:             z.nativeEnum(ESTADO_PUBLICACION).default(ESTADO_PUBLICACION.BORRADOR),
})

export type PublicacionInput = z.infer<typeof publicacionSchema>

// ─── Schema Métricas manuales ──────────────────────────────────────────────
// El user puede cargar los números que le importen desde redes; formato libre
// pero validamos los conocidos como enteros >= 0.
export const metricasManualesSchema = z.object({
  impresiones: z.coerce.number().int().min(0).optional(),
  alcance:     z.coerce.number().int().min(0).optional(),
  clicks:      z.coerce.number().int().min(0).optional(),
  engagement:  z.coerce.number().int().min(0).optional(),
}).catchall(z.coerce.number().int().min(0))

export type MetricasManuales = z.infer<typeof metricasManualesSchema>

// ─── Helper: estado efectivo en cliente (mismo cálculo que la vista SQL) ──
// Se usa cuando tenemos la campaña sin haber pasado por v_campanas (ej. tras
// una mutación optimista o al armar un select de campañas activas).
export function estadoEfectivo(c: {
  fecha_inicio: string
  fecha_fin: string
  estado_manual: EstadoCampanaManual | null | undefined
}): EstadoCampanaEfectivo {
  if (c.estado_manual) return c.estado_manual
  // Fecha local Argentina — mismo criterio que hoy_local() en SQL (fix F audit).
  // toISOString() daría UTC y correría el día a las 21:00 hora AR.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date())
  if (hoy < c.fecha_inicio) return ESTADO_CAMPANA_EFECTIVO.PROGRAMADA
  if (hoy > c.fecha_fin)    return ESTADO_CAMPANA_EFECTIVO.CONCLUIDA
  return ESTADO_CAMPANA_EFECTIVO.ACTIVA
}

// UI: label + variante de Badge por estado efectivo.
export const ESTADO_CAMPANA_LABEL: Record<EstadoCampanaEfectivo, string> = {
  BORRADOR: "Borrador",
  PROGRAMADA: "Programada",
  ACTIVA: "Activa",
  CONCLUIDA: "Concluida",
  PAUSADA: "Pausada",
  CANCELADA: "Cancelada",
}

// Debe coincidir con los variants que expone components/ui/badge.tsx
export const ESTADO_CAMPANA_VARIANT: Record<
  EstadoCampanaEfectivo,
  "default" | "green" | "amber" | "red" | "accent" | "violet" | "gray" | "outline"
> = {
  BORRADOR:   "outline",
  PROGRAMADA: "violet",
  ACTIVA:     "green",
  CONCLUIDA:  "gray",
  PAUSADA:    "amber",
  CANCELADA:  "red",
}

export const ESTADO_PUBLICACION_LABEL: Record<EstadoPublicacion, string> = {
  BORRADOR: "Borrador",
  PROGRAMADA: "Programada",
  PUBLICADA: "Publicada",
  CANCELADA: "Cancelada",
}
