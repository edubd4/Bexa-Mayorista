// ─── Cliente AFIP/ARCA (WSFEv1 vía Afip SDK) — SOLO servidor ────────────────
// Este módulo lo importan únicamente server actions. El cert y la key son
// secretos: viven en env vars, jamás en la base ni en un client component.
//
// Env vars (ver env.example):
//   AFIP_SDK_ACCESS_TOKEN  token de app.afipsdk.com (cuenta gratuita)
//   AFIP_PRODUCTION        "true" en producción; cualquier otra cosa = homologación
//   AFIP_CERT / AFIP_KEY   certificado X.509 y clave privada en PEM (solo producción)
//
// El CUIT emisor y el punto de venta son DATO (tabla configuracion) — la
// empresa puede cambiar de punto de venta sin tocar un deploy.

import Afip from "@afipsdk/afip.js"
import {
  type CondicionIva,
  type TipoComprobante,
} from "@/lib/validators/facturacion"
import { CBTE_TIPO_CODIGO } from "@/lib/facturacion-ui"

// Condición IVA del receptor — códigos ARCA (RG 5616, FEParamGetCondicionIvaReceptor)
const CONDICION_IVA_RECEPTOR_ID: Record<CondicionIva, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTISTA: 6,
}

// Alícuotas de IVA — códigos ARCA (FEParamGetTiposIva)
const IVA_ALICUOTA_ID: Record<string, number> = {
  "10.5": 4,
  "21": 5,
  "27": 6,
}

export type EmisionParams = {
  cuitEmisor: string
  puntoVenta: number
  tipo: TipoComprobante
  docTipo: number   // 80=CUIT · 96=DNI · 99=sin identificar
  docNro: string    // '0' cuando docTipo=99
  condicionIvaReceptor: CondicionIva
  neto: number
  iva: number
  total: number
  ivaPct: number
  // Solo notas de crédito/débito (RG 4540): el comprobante que se anula o
  // ajusta, identificado como lo exige el WS (CbtesAsoc).
  comprobanteAsociado?: {
    tipo: TipoComprobante
    puntoVenta: number
    numero: number
    fechaEmision: string  // "yyyy-mm-dd" (fecha_emision de la fila original)
  }
}

export type EmisionResult =
  | { ok: false; error: string }
  | { ok: true; numero: number; cae: string; caeVencimiento: string }

// Fecha de hoy en la zona del negocio, como la exige el WS (yyyymmdd numérico).
function fechaComprobanteHoy(): { cbteFch: number; iso: string } {
  const iso = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
  return { cbteFch: Number(iso.replace(/-/g, "")), iso }
}

export async function emitirComprobanteAfip(params: EmisionParams): Promise<EmisionResult> {
  const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN
  if (!accessToken) {
    return { ok: false, error: "Falta AFIP_SDK_ACCESS_TOKEN en las variables de entorno" }
  }

  const production = process.env.AFIP_PRODUCTION === "true"
  if (production && (!process.env.AFIP_CERT || !process.env.AFIP_KEY)) {
    return { ok: false, error: "Modo producción sin certificado: faltan AFIP_CERT / AFIP_KEY" }
  }

  const alicuotaId = IVA_ALICUOTA_ID[String(params.ivaPct)]
  if (!alicuotaId) {
    return { ok: false, error: `Alícuota de IVA ${params.ivaPct}% no soportada (usar 10.5, 21 o 27)` }
  }

  const afip = new Afip({
    CUIT: Number(params.cuitEmisor),
    production,
    cert: process.env.AFIP_CERT,
    key: process.env.AFIP_KEY,
    access_token: accessToken,
  })

  const { cbteFch } = fechaComprobanteHoy()

  // RG 4540: la NC/ND identifica al comprobante que ajusta. El WS lo recibe
  // en CbtesAsoc con la fecha del original en yyyymmdd y el CUIT del emisor
  // (mismo emisor siempre — una NC ajena no existe).
  const cbtesAsoc = params.comprobanteAsociado
    ? [{
        Tipo: CBTE_TIPO_CODIGO[params.comprobanteAsociado.tipo],
        PtoVta: params.comprobanteAsociado.puntoVenta,
        Nro: params.comprobanteAsociado.numero,
        Cuit: params.cuitEmisor,
        CbteFch: Number(params.comprobanteAsociado.fechaEmision.replace(/-/g, "")),
      }]
    : undefined

  try {
    const res = await afip.ElectronicBilling.createNextVoucher({
      CantReg: 1,
      PtoVta: params.puntoVenta,
      CbteTipo: CBTE_TIPO_CODIGO[params.tipo],
      Concepto: 1, // productos
      DocTipo: params.docTipo,
      DocNro: Number(params.docNro),
      CbteFch: cbteFch,
      ImpTotal: params.total,
      ImpTotConc: 0,
      ImpNeto: params.neto,
      ImpOpEx: 0,
      ImpIVA: params.iva,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId: CONDICION_IVA_RECEPTOR_ID[params.condicionIvaReceptor],
      Iva: [{ Id: alicuotaId, BaseImp: params.neto, Importe: params.iva }],
      ...(cbtesAsoc ? { CbtesAsoc: cbtesAsoc } : {}),
    })

    // CAEFchVto puede venir "yyyy-mm-dd" o "yyyymmdd" según versión del WS.
    const vtoRaw = String(res.CAEFchVto ?? "")
    const caeVencimiento = /^\d{8}$/.test(vtoRaw)
      ? `${vtoRaw.slice(0, 4)}-${vtoRaw.slice(4, 6)}-${vtoRaw.slice(6, 8)}`
      : vtoRaw

    return {
      ok: true,
      numero: Number(res.voucherNumber),
      cae: String(res.CAE),
      caeVencimiento,
    }
  } catch (e) {
    // Los errores del WS traen el mensaje normativo de ARCA (ej. 10242 por
    // condición IVA inválida) — se muestran tal cual: son la explicación real.
    const msg = e instanceof Error ? e.message : "Error desconocido del web service"
    return { ok: false, error: `ARCA rechazó la emisión: ${msg}` }
  }
}
