import { z } from "zod"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)

// ─── Estados ────────────────────────────────────────────────────────────────
export const ESTADO_ENTREGA = {
  ENTREGADA:       "ENTREGADA",
  PEDIDO:          "PEDIDO",
  EN_PREPARACION:  "EN_PREPARACION",
  CANCELADA:       "CANCELADA",
} as const
export type EstadoEntrega = typeof ESTADO_ENTREGA[keyof typeof ESTADO_ENTREGA]

export const ESTADO_COBRO = {
  PENDIENTE:  "PENDIENTE",
  PARCIAL:    "PARCIAL",
  COBRADA:    "COBRADA",
  CANCELADA:  "CANCELADA",
} as const
export type EstadoCobro = typeof ESTADO_COBRO[keyof typeof ESTADO_COBRO]

// ─── Item de venta (input) ──────────────────────────────────────────────────
export const ventaItemSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad:    z.number().int().positive("Cantidad debe ser > 0"),
})
export type VentaItemInput = z.infer<typeof ventaItemSchema>

// ─── Venta (input) ──────────────────────────────────────────────────────────
export const ventaSchema = z.object({
  cliente_id:      z.string().uuid("Elegí un cliente"),
  items:           z.array(ventaItemSchema).min(1, "Agregá al menos un producto"),
  notas:           z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  estado_entrega:  z.enum([
    ESTADO_ENTREGA.ENTREGADA,
    ESTADO_ENTREGA.PEDIDO,
    ESTADO_ENTREGA.EN_PREPARACION,
  ]).default(ESTADO_ENTREGA.ENTREGADA),
  // Atribución MANUAL: el vendedor elige la campaña al facturar. Opcional.
  campana_id:      z.preprocess(emptyToUndef, z.string().uuid().optional()),
})
export type VentaInput = z.infer<typeof ventaSchema>

// ─── Cancelar venta ────────────────────────────────────────────────────────
export const cancelarVentaSchema = z.object({
  venta_id: z.string().uuid(),
  motivo:   z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CancelarVentaInput = z.infer<typeof cancelarVentaSchema>

// ─── Preview de precio (llama a resolver_precio via server action) ─────────
export const resolverPrecioParamsSchema = z.object({
  cliente_id:  z.string().uuid(),
  producto_id: z.string().uuid(),
  cantidad:    z.number().int().positive(),
})
export type ResolverPrecioParams = z.infer<typeof resolverPrecioParamsSchema>

export type PrecioResuelto = {
  precio_unitario: number
  precio_final:    number
  descuento_pct:   number
  origen:          string
}
