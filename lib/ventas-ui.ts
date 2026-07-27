import type { EstadoCobro, EstadoEntrega } from "@/lib/validators/venta"

export const ESTADO_COBRO_LABEL: Record<EstadoCobro, string> = {
  PENDIENTE:  "Pendiente",
  PARCIAL:    "Parcial",
  COBRADA:    "Cobrada",
  CANCELADA:  "Cancelada",
}

export const ESTADO_COBRO_VARIANT: Record<EstadoCobro, "amber" | "accent" | "green" | "gray"> = {
  PENDIENTE:  "amber",
  PARCIAL:    "accent",
  COBRADA:    "green",
  CANCELADA:  "gray",
}

export const ESTADO_ENTREGA_LABEL: Record<EstadoEntrega, string> = {
  ENTREGADA:       "Entregada",
  PEDIDO:          "Pedido",
  EN_PREPARACION:  "En preparación",
  CANCELADA:       "Cancelada",
}

export const ESTADO_ENTREGA_VARIANT: Record<EstadoEntrega, "green" | "amber" | "accent" | "gray"> = {
  ENTREGADA:       "green",
  PEDIDO:          "amber",
  EN_PREPARACION:  "accent",
  CANCELADA:       "gray",
}

// Trace legible del origen que devuelve resolver_precio.
// Ej.: "lista+descuento_producto" → "Lista de precios · Descuento por producto"
export function explicarOrigenPrecio(origen: string | null | undefined): string {
  if (!origen) return "Precio base"
  // Tramo por cantidad (0022): pisa lista y descuentos, viene solo.
  if (origen === "tramo_cantidad") return "Precio por cantidad"
  const [precio, descuento] = origen.split("+")
  const parts: string[] = []
  parts.push(precio === "lista" ? "Lista de precios" : "Precio base")
  if (descuento) {
    if (descuento === "descuento_producto")  parts.push("Descuento por producto")
    else if (descuento === "descuento_categoria") parts.push("Descuento por categoría")
    else if (descuento === "descuento_global") parts.push("Descuento global")
    else parts.push(descuento)
  }
  return parts.join(" · ")
}
