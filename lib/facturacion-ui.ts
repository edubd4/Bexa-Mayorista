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
  NOTA_CREDITO_A: "Nota de Crédito A",
  NOTA_CREDITO_B: "Nota de Crédito B",
}

// Códigos de comprobante ARCA (tabla FEParamGetTiposCbte)
export const CBTE_TIPO_CODIGO: Record<TipoComprobante, number> = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  NOTA_CREDITO_A: 3,
  NOTA_CREDITO_B: 8,
}

// "0003-00000042" — formato estándar punto de venta + número
export function formatNumeroComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`
}

// ─── Motivo "humano" cuando la factura no salió ─────────────────────────────
// El que está cobrando no necesita la jerga del web service — necesita saber
// que la venta está BIEN y por qué no hay factura. Los errores de
// configuración/credenciales (env vars, token, HTTP crudo tipo "Request
// failed with status code 400") se traducen a "falta configurar"; los
// rechazos normativos de ARCA se muestran tal cual, porque son la explicación
// real (ej. condición de IVA inválida).
export function motivoFacturaPendiente(error: string): string {
  const esConfiguracion =
    /no configurada|falta |faltan |access.?token|certificado|request failed|status code/i.test(error)
  return esConfiguracion
    ? "la facturación en ARCA todavía no está configurada (lo termina el admin)"
    : `ARCA la rechazó — ${error}`
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
