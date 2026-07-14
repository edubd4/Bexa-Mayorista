// Labels + variants para el módulo core /historial.
// Los tipos vienen del enum tipo_evento (0001_init). Cuando un módulo cosechado
// agrega valores al enum, registra acá su label/variant y su link de entidad.
import { DOMINIO } from "@/lib/dominio"

export const TIPO_EVENTO_LABEL: Record<string, string> = {
  ALTA:           "Alta / Registro",
  MODIFICACION:   "Modificación",
  BAJA:           "Baja",
  CAMBIO_ESTADO:  "Cambio de estado",
  MOVIMIENTO:     "Movimiento",
  COBRO:          "Cobro",
  GASTO:          "Gasto",
  NOTA:           "Nota",
  ALERTA:         "Alerta",
  MENSAJE_IA:     "Mensaje IA",
  SISTEMA:        "Sistema",
}

export const TIPO_EVENTO_VARIANT: Record<string, "accent" | "amber" | "green" | "red" | "violet" | "gray"> = {
  ALTA:           "gray",
  MODIFICACION:   "accent",
  BAJA:           "red",
  CAMBIO_ESTADO:  "accent",
  MOVIMIENTO:     "accent",
  COBRO:          "green",
  GASTO:          "red",
  NOTA:           "gray",
  ALERTA:         "amber",
  MENSAJE_IA:     "violet",
  SISTEMA:        "gray",
}

// entidad_tipo (nombre de ESQUEMA: 'usuario', 'cliente', ...) → label visible.
// Las entidades de dominio salen del diccionario; acá solo mapeos del core.
export const ENTIDAD_TIPO_LABEL: Record<string, string> = {
  usuario:          DOMINIO.usuarios.singular,
  configuracion:    DOMINIO.configuracion.singular,
  proveedor:        DOMINIO.proveedores.singular,
  cliente:          DOMINIO.clientes.singular,
  producto:         DOMINIO.productos.singular,
  lista_precio:     "Lista de precios",
  regla_descuento:  "Regla de descuento",
  venta:            DOMINIO.ventas.singular,
  compra:           DOMINIO.compras.singular,
  gasto:            DOMINIO.gastos.singular,
  movimiento_caja:  "Movimiento de caja",
}

// Link a la entidad desde el historial. Los módulos cosechados registran su
// ruta acá (patrón: `${DOMINIO.<entidad>.ruta}?q=<id_publico>`).
export const ENTIDAD_TIPO_RUTA: Record<string, string> = {
  usuario:   DOMINIO.usuarios.ruta,
  proveedor: DOMINIO.proveedores.ruta,
  cliente:   DOMINIO.clientes.ruta,
  producto:  DOMINIO.productos.ruta,
  venta:     DOMINIO.ventas.ruta,
  compra:    DOMINIO.compras.ruta,
  gasto:     DOMINIO.gastos.ruta,
  // movimiento_caja, lista_precio, regla_descuento se filtran por texto en /historial.
}

export function linkEntidad(tipo: string | null, id: string | null): string | null {
  if (!tipo || !id) return null
  const ruta = ENTIDAD_TIPO_RUTA[tipo]
  return ruta ? `${ruta}?q=${encodeURIComponent(id)}` : null
}
