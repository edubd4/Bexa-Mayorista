import type {
  MetodoPago,
  OrigenMovCaja,
  PagoVenta,
  PeriodicidadGastoFijo,
  TipoMovCaja,
} from "@/lib/validators/caja"
import { formatPesos } from "@/lib/utils"

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

// "$5.000 Efectivo + $5.000 Transferencia" — el desglose de un cobro mixto
// para toasts e historial. Con un solo pago queda "$10.000 Efectivo".
export function resumenPagos(pagos: PagoVenta[]): string {
  return pagos.map((p) => `${formatPesos(p.monto)} ${METODO_PAGO_LABEL[p.metodo]}`).join(" + ")
}

export const PERIODICIDAD_GASTO_FIJO_LABEL: Record<PeriodicidadGastoFijo, string> = {
  SEMANAL: "Semanal",
  MENSUAL: "Mensual",
  ANUAL:   "Anual",
}
