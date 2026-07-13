import type { TipoMovStock } from "@/lib/validators/producto"

export const TIPO_MOV_STOCK_LABEL: Record<TipoMovStock, string> = {
  ENTRADA:          "Entrada",
  SALIDA:           "Salida",
  AJUSTE_POSITIVO:  "Ajuste +",
  AJUSTE_NEGATIVO:  "Ajuste −",
}

export const TIPO_MOV_STOCK_VARIANT: Record<TipoMovStock, "green" | "red" | "amber" | "gray"> = {
  ENTRADA:          "green",
  SALIDA:           "red",
  AJUSTE_POSITIVO:  "amber",
  AJUSTE_NEGATIVO:  "amber",
}

// Signo visual del delta: + para ENTRADA/AJUSTE_POSITIVO, − para el resto.
export function signoDelta(tipo: TipoMovStock): "+" | "−" {
  return tipo === "ENTRADA" || tipo === "AJUSTE_POSITIVO" ? "+" : "−"
}
