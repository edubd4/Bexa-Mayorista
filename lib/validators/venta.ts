import { z } from "zod"
import { zUuid } from "./shared"

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
  producto_id: zUuid(),
  cantidad:    z.number().int().positive("Cantidad debe ser > 0"),
  // Bonificación manual del vendedor (0041): % sobre el precio ya resuelto.
  // Opcional — el POS y las llamadas viejas no la mandan.
  descuento_manual_pct: z
    .number()
    .min(0, "La bonificación no puede ser negativa")
    .max(100, "La bonificación no puede superar el 100%")
    .optional(),
})
export type VentaItemInput = z.infer<typeof ventaItemSchema>

// ─── Venta (input) ──────────────────────────────────────────────────────────
export const ventaSchema = z.object({
  cliente_id:      zUuid("Elegí un cliente"),
  items:           z.array(ventaItemSchema).min(1, "Agregá al menos un producto"),
  notas:           z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  estado_entrega:  z.enum([
    ESTADO_ENTREGA.ENTREGADA,
    ESTADO_ENTREGA.PEDIDO,
    ESTADO_ENTREGA.EN_PREPARACION,
  ]).default(ESTADO_ENTREGA.ENTREGADA),
  // Atribución MANUAL: el vendedor elige la campaña al facturar. Opcional.
  campana_id:      z.preprocess(emptyToUndef, zUuid().optional()),
})
export type VentaInput = z.infer<typeof ventaSchema>

// ─── Cambiar estado de entrega (0021) ──────────────────────────────────────
// CANCELADA no es opción: cancelar es cancelar_venta (revierte stock y
// comisión), no un cambio de entrega. El RPC valida lo mismo en SQL.
export const cambiarEstadoEntregaSchema = z.object({
  venta_id: zUuid(),
  estado: z.enum([
    ESTADO_ENTREGA.ENTREGADA,
    ESTADO_ENTREGA.PEDIDO,
    ESTADO_ENTREGA.EN_PREPARACION,
  ]),
})
export type CambiarEstadoEntregaInput = z.infer<typeof cambiarEstadoEntregaSchema>

// ─── Cancelar venta ────────────────────────────────────────────────────────
export const cancelarVentaSchema = z.object({
  venta_id: zUuid(),
  motivo:   z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})
export type CancelarVentaInput = z.infer<typeof cancelarVentaSchema>

// ─── Preview de precio (llama a resolver_precio via server action) ─────────
export const resolverPrecioParamsSchema = z.object({
  cliente_id:  zUuid(),
  producto_id: zUuid(),
  cantidad:    z.number().int().positive(),
})
export type ResolverPrecioParams = z.infer<typeof resolverPrecioParamsSchema>

export type PrecioResuelto = {
  precio_unitario: number
  precio_final:    number
  descuento_pct:   number
  origen:          string
}
