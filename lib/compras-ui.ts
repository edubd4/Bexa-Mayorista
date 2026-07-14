import type { EstadoCompra } from "@/lib/validators/compra"

export const ESTADO_COMPRA_LABEL: Record<EstadoCompra, string> = {
  RECIBIDA:   "Recibida",
  PENDIENTE:  "Pendiente",
  CANCELADA:  "Cancelada",
}

export const ESTADO_COMPRA_VARIANT: Record<EstadoCompra, "green" | "amber" | "gray"> = {
  RECIBIDA:   "green",
  PENDIENTE:  "amber",
  CANCELADA:  "gray",
}
