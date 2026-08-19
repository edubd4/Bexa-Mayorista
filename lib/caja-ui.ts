import type { MetodoPago, OrigenMovCaja, TipoMovCaja } from "@/lib/validators/caja"

export const TIPO_MOV_CAJA_LABEL: Record<TipoMovCaja, string> = {
  INGRESO: "Ingreso",
  EGRESO:  "Egreso",
}

export const TIPO_MOV_CAJA_VARIANT: Record<TipoMovCaja, "green" | "red"> = {
  INGRESO: "green",
  EGRESO:  "red",
}

export const ORIGEN_MOV_CAJA_LABEL: Record<OrigenMovCaja, string> = {
  COBRO_VENTA: "Cobro de venta",
  PAGO_COMPRA: "Pago a proveedor",
  GASTO:       "Gasto",
  AJUSTE:      "Ajuste",
  APERTURA:    "Apertura",
  OTRO:        "Otro",
}

// "Posnet" es como el cliente llama al cobro con tarjeta en el mostrador —
// presentación BEXA, el enum de esquema no cambia (regla de oro #1).
export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO:         "Efectivo",
  TRANSFERENCIA:    "Transferencia",
  TARJETA_DEBITO:   "Posnet · débito",
  TARJETA_CREDITO:  "Posnet · crédito",
  MERCADO_PAGO:     "Mercado Pago",
  CHEQUE:           "Cheque",
  OTRO:             "Otro",
}
