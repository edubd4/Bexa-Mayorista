import { z } from "zod"
import { zUuid } from "./shared"

// ─── Condición frente al IVA (espejo del enum SQL en 0031) ──────────────────
export const CONDICION_IVA = {
  RESPONSABLE_INSCRIPTO: "RESPONSABLE_INSCRIPTO",
  MONOTRIBUTISTA: "MONOTRIBUTISTA",
  CONSUMIDOR_FINAL: "CONSUMIDOR_FINAL",
  EXENTO: "EXENTO",
} as const
export type CondicionIva = typeof CONDICION_IVA[keyof typeof CONDICION_IVA]

export const TIPO_COMPROBANTE = {
  FACTURA_A: "FACTURA_A",
  FACTURA_B: "FACTURA_B",
  NOTA_CREDITO_A: "NOTA_CREDITO_A",
  NOTA_CREDITO_B: "NOTA_CREDITO_B",
} as const
export type TipoComprobante = typeof TIPO_COMPROBANTE[keyof typeof TIPO_COMPROBANTE]

// ─── Regla A/B — el corazón normativo del módulo ────────────────────────────
// RI y Monotributista reciben Factura A (IVA discriminado — Ley 27.618);
// Consumidor Final y Exento reciben Factura B (IVA incluido).
export function tipoComprobantePara(condicion: CondicionIva): TipoComprobante {
  return condicion === CONDICION_IVA.RESPONSABLE_INSCRIPTO ||
    condicion === CONDICION_IVA.MONOTRIBUTISTA
    ? TIPO_COMPROBANTE.FACTURA_A
    : TIPO_COMPROBANTE.FACTURA_B
}

export function esNotaCredito(tipo: TipoComprobante): boolean {
  return tipo === TIPO_COMPROBANTE.NOTA_CREDITO_A || tipo === TIPO_COMPROBANTE.NOTA_CREDITO_B
}

// La NC es SIEMPRE de la misma letra que la factura que anula (RG 4540).
export function notaCreditoPara(tipoFactura: TipoComprobante): TipoComprobante {
  return tipoFactura === TIPO_COMPROBANTE.FACTURA_A
    ? TIPO_COMPROBANTE.NOTA_CREDITO_A
    : TIPO_COMPROBANTE.NOTA_CREDITO_B
}

// ─── CUIT: normalización + dígito verificador (módulo 11) ───────────────────
// Acepta "30-12345678-9", "30123456789", con espacios… devuelve 11 dígitos o null.
export function normalizarCuit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 11) return null
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(digits[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return verificador === Number(digits[10]) ? digits : null
}

// ─── Input de la emisión ────────────────────────────────────────────────────
export const emitirFacturaSchema = z.object({
  venta_id: zUuid(),
})
export type EmitirFacturaInput = z.infer<typeof emitirFacturaSchema>

// El motivo es OBLIGATORIO: es "el hecho que la origina" de la RG 4540 (la NC
// debe emitirse dentro de los 15 días corridos de ese hecho) y queda en el
// comprobante y en el historial.
export const emitirNotaCreditoSchema = z.object({
  venta_id: zUuid(),
  motivo: z
    .string()
    .trim()
    .min(3, "Contá el motivo de la anulación (devolución, error de carga…)")
    .max(200, "Máximo 200 caracteres"),
})
export type EmitirNotaCreditoInput = z.infer<typeof emitirNotaCreditoSchema>

// ─── Fila de comprobante como la lee la UI ──────────────────────────────────
export type Comprobante = {
  id: string
  tipo: TipoComprobante
  punto_venta: number
  numero: number
  fecha_emision: string
  cuit_emisor: string
  doc_tipo: number
  doc_nro: string
  condicion_iva_receptor: CondicionIva
  neto: number
  iva: number
  total: number
  cae: string
  cae_vencimiento: string
  // 0042: NULL = factura · NOT NULL = nota de crédito que anula ese comprobante
  comprobante_asociado_id: string | null
  motivo: string | null
}
