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

export const ESTADO_COMPRA = {
  RECIBIDA:   "RECIBIDA",
  PENDIENTE:  "PENDIENTE",
  CANCELADA:  "CANCELADA",
} as const
export type EstadoCompra = typeof ESTADO_COMPRA[keyof typeof ESTADO_COMPRA]

export const compraItemSchema = z.object({
  producto_id:     zUuid(),
  cantidad:        z.preprocess(numeroPreprocess, z.number().int().positive("Cantidad debe ser > 0")),
  costo_unitario:  z.preprocess(numeroPreprocess, z.number().nonnegative("Costo unitario no puede ser negativo")),
})
export type CompraItemInput = z.infer<typeof compraItemSchema>

export const compraSchema = z.object({
  proveedor_id:    zUuid("Elegí un proveedor"),
  items:           z.array(compraItemSchema).min(1, "Agregá al menos un producto"),
  numero_factura:  z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  notas:           z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  // Fecha real de la compra (factura vieja que se carga después). Si no viene, now().
  fecha:           z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional()),
})
export type CompraInput = z.infer<typeof compraSchema>

export const cancelarCompraSchema = z.object({
  compra_id: zUuid(),
  motivo:    z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CancelarCompraInput = z.infer<typeof cancelarCompraSchema>
