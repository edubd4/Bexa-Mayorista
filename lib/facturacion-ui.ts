import {
  type Comprobante,
  type CondicionIva,
  type TipoComprobante,
} from "@/lib/validators/facturacion"

export const CONDICION_IVA_LABEL: Record<CondicionIva, string> = {
  RESPONSABLE_INSCRIPTO: "Responsable Inscripto",
  MONOTRIBUTISTA: "Monotributista",
  CONSUMIDOR_FINAL: "Consumidor Final",
  EXENTO: "IVA Exento",
}

export const TIPO_COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
}

// Códigos de comprobante ARCA (tabla FEParamGetTiposCbte)
export const CBTE_TIPO_CODIGO: Record<TipoComprobante, number> = {
  FACTURA_A: 1,
  FACTURA_B: 6,
}

// "0003-00000042" — formato estándar punto de venta + número
export function formatNumeroComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`
}

// ─── QR obligatorio del comprobante (RG 4892) ───────────────────────────────
// La URL codifica el JSON del comprobante en base64; al escanearla, ARCA
// muestra la validez. Va impresa en la factura y como link "Verificar".
export function qrUrlComprobante(c: Comprobante): string {
  const payload = {
    ver: 1,
    fecha: c.fecha_emision,
    cuit: Number(c.cuit_emisor),
    ptoVta: c.punto_venta,
    tipoCmp: CBTE_TIPO_CODIGO[c.tipo],
    nroCmp: Number(c.numero),
    importe: Number(c.total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: c.doc_tipo,
    nroDocRec: Number(c.doc_nro),
    tipoCodAut: "E",
    codAut: Number(c.cae),
  }
  // btoa existe en browser y en Node 18+ — usable de ambos lados.
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}
