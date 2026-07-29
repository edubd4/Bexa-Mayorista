import { z } from "zod"
import { zUuid } from "./shared"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)
const numeroPreprocess = (v: unknown): unknown => {
  if (v === "" || v === null || v === undefined) return undefined
  if (typeof v === "number") return v
  if (typeof v !== "string") return v
  const norm = v.replace(/\./g, "").replace(",", ".")
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

// ─── Enums espejo del schema ────────────────────────────────────────────────
export const TIPO_MOV_CAJA = { INGRESO: "INGRESO", EGRESO: "EGRESO" } as const
export type TipoMovCaja = typeof TIPO_MOV_CAJA[keyof typeof TIPO_MOV_CAJA]

export const ORIGEN_MOV_CAJA = {
  COBRO_VENTA: "COBRO_VENTA",
  PAGO_COMPRA: "PAGO_COMPRA",
  GASTO:       "GASTO",
  AJUSTE:      "AJUSTE",
  APERTURA:    "APERTURA",
  OTRO:        "OTRO",
} as const
export type OrigenMovCaja = typeof ORIGEN_MOV_CAJA[keyof typeof ORIGEN_MOV_CAJA]

export const METODO_PAGO = {
  EFECTIVO:         "EFECTIVO",
  TRANSFERENCIA:    "TRANSFERENCIA",
  TARJETA_DEBITO:   "TARJETA_DEBITO",
  TARJETA_CREDITO:  "TARJETA_CREDITO",
  MERCADO_PAGO:     "MERCADO_PAGO",
  CHEQUE:           "CHEQUE",
  OTRO:             "OTRO",
} as const
export type MetodoPago = typeof METODO_PAGO[keyof typeof METODO_PAGO]

// ─── Cobrar venta ──────────────────────────────────────────────────────────
export const cobrarVentaSchema = z.object({
  venta_id:    zUuid(),
  monto:       z.preprocess(numeroPreprocess, z.number().positive("Monto debe ser > 0")),
  metodo:      z.enum([
    METODO_PAGO.EFECTIVO,       METODO_PAGO.TRANSFERENCIA,
    METODO_PAGO.TARJETA_DEBITO, METODO_PAGO.TARJETA_CREDITO,
    METODO_PAGO.MERCADO_PAGO,   METODO_PAGO.CHEQUE, METODO_PAGO.OTRO,
  ]).default(METODO_PAGO.EFECTIVO),
  descripcion: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CobrarVentaInput = z.infer<typeof cobrarVentaSchema>

// ─── Movimiento manual (APERTURA / AJUSTE / OTRO) ──────────────────────────
export const movimientoManualSchema = z.object({
  tipo:        z.enum([TIPO_MOV_CAJA.INGRESO, TIPO_MOV_CAJA.EGRESO]),
  origen:      z.enum([ORIGEN_MOV_CAJA.APERTURA, ORIGEN_MOV_CAJA.AJUSTE, ORIGEN_MOV_CAJA.OTRO]),
  monto:       z.preprocess(numeroPreprocess, z.number().positive("Monto debe ser > 0")),
  metodo:      z.enum([
    METODO_PAGO.EFECTIVO,       METODO_PAGO.TRANSFERENCIA,
    METODO_PAGO.TARJETA_DEBITO, METODO_PAGO.TARJETA_CREDITO,
    METODO_PAGO.MERCADO_PAGO,   METODO_PAGO.CHEQUE, METODO_PAGO.OTRO,
  ]).default(METODO_PAGO.EFECTIVO),
  descripcion: z.string().trim().min(1, "Descripción requerida").max(500),
})
export type MovimientoManualInput = z.infer<typeof movimientoManualSchema>

// ─── Categoría de gasto ────────────────────────────────────────────────────
export const categoriaGastoSchema = z.object({
  nombre:      z.string().trim().min(1, "El nombre es obligatorio").max(80),
  descripcion: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CategoriaGastoInput = z.infer<typeof categoriaGastoSchema>

// ─── Registrar gasto ───────────────────────────────────────────────────────
export const gastoSchema = z.object({
  categoria_id: z.preprocess(numeroPreprocess, z.number().int().positive("Elegí una categoría")),
  monto:        z.preprocess(numeroPreprocess, z.number().positive("Monto debe ser > 0")),
  descripcion:  z.string().trim().min(1, "Descripción requerida").max(500),
  fecha:        z.preprocess(emptyToUndef, z.string().optional()),   // YYYY-MM-DD del <input type=date>
  metodo:       z.enum([
    METODO_PAGO.EFECTIVO,       METODO_PAGO.TRANSFERENCIA,
    METODO_PAGO.TARJETA_DEBITO, METODO_PAGO.TARJETA_CREDITO,
    METODO_PAGO.MERCADO_PAGO,   METODO_PAGO.CHEQUE, METODO_PAGO.OTRO,
  ]).default(METODO_PAGO.EFECTIVO),
  notas:        z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  // Campaña a la que se imputa (0028). Opcional para el admin: la mayoría de
  // los gastos no son de publicidad. OBLIGATORIO para marketing — el RPC lo
  // rechaza sin campaña. Es lo que hace que el ROI tenga con qué calcular.
  campana_id:   z.preprocess(emptyToUndef, zUuid().optional()),
})
export type GastoInput = z.infer<typeof gastoSchema>

// ─── Anular gasto (0023) ────────────────────────────────────────────────────
// El motivo es obligatorio: la anulación genera un INGRESO AJUSTE en caja y
// tiene que explicarse sola en el extracto.
export const anularGastoSchema = z.object({
  gasto_id: zUuid(),
  motivo:   z.string().trim().min(1, "El motivo de la anulación es obligatorio").max(500),
})
export type AnularGastoInput = z.infer<typeof anularGastoSchema>
