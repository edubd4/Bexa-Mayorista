import { notFound, redirect } from "next/navigation"
import QRCode from "qrcode"
import { createServerClient } from "@/lib/supabase/server"
import { PrintButton } from "@/components/ui/print-button"
import {
  CONDICION_IVA_LABEL,
  CBTE_TIPO_CODIGO,
  TIPO_COMPROBANTE_LABEL,
  formatNumeroComprobante,
  qrUrlComprobante,
} from "@/lib/facturacion-ui"
import { formatFecha, formatPesos } from "@/lib/utils"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import { esNotaCredito, type Comprobante } from "@/lib/validators/facturacion"

// ─── Comprobante imprimible (RG 1415 + QR RG 4892) ──────────────────────────
// Renderiza la FACTURA de la venta, o su NOTA DE CRÉDITO con ?doc=nc (0042).
// Vive FUERA del shell del dashboard: un documento fiscal se imprime en blanco,
// sin sidebar ni tema oscuro. La visibilidad la sigue recortando RLS (admin o
// vendedor dueño de la venta) — sin sesión no hay comprobante.
//
// Regla de presentación clave:
//   Factura A → precios NETOS por ítem + IVA discriminado al pie.
//   Factura B → precios finales con IVA incluido; el total NO se desglosa,
//   pero desde el 01/04/2025 es OBLIGATORIO el bloque informativo "Régimen de
//   Transparencia Fiscal al Consumidor (Ley 27.743)" con el IVA Contenido y
//   Otros Impuestos Nacionales Indirectos (RG 5614/2024). Es una leyenda al
//   pie — los precios y el total siguen mostrándose finales.

type Params = { ventaId: string }

type ClienteFactura = {
  nombre: string
  apellido: string | null
  razon_social: string | null
  tipo: TipoCliente
  documento: string | null
  direccion: string | null
  ciudad: string | null
  provincia: string | null
}

type ItemFactura = {
  id: string
  cantidad: number
  precio_final_unit: number
  producto: { id_publico: string; nombre: string } | null
}

const CLAVES_CONFIG = [
  "afip_razon_social",
  "afip_domicilio",
  "afip_cuit",
  "afip_iibb",
  "afip_inicio_actividades",
  "afip_iva_pct",
] as const

export default async function FacturaPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams?: { doc?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: venta }, { data: comprobantesRows }, { data: config }] = await Promise.all([
    supabase
      .from("ventas")
      .select(`
        id, id_publico, fecha,
        cliente:cliente_id ( nombre, apellido, razon_social, tipo, documento, direccion, ciudad, provincia )
      `)
      .eq("id", params.ventaId)
      .maybeSingle<{ id: string; id_publico: string; fecha: string; cliente: ClienteFactura | null }>(),
    // 0042: la venta puede tener factura + nota de crédito — lista, no single.
    supabase
      .from("comprobantes")
      .select("id, tipo, punto_venta, numero, fecha_emision, cuit_emisor, doc_tipo, doc_nro, condicion_iva_receptor, neto, iva, total, cae, cae_vencimiento, comprobante_asociado_id, motivo")
      .eq("venta_id", params.ventaId)
      .order("created_at"),
    supabase.from("configuracion").select("clave, valor").in("clave", [...CLAVES_CONFIG]),
  ])

  const comprobantes = (comprobantesRows ?? []) as unknown as Comprobante[]
  const factura = comprobantes.find((c) => !c.comprobante_asociado_id) ?? null
  const nc = comprobantes.find((c) => Boolean(c.comprobante_asociado_id)) ?? null
  // ?doc=nc pide la nota de crédito; sin query se muestra la factura.
  const comprobante = searchParams?.doc === "nc" ? nc : factura

  // Sin comprobante no hay documento que mostrar — primero se emite en la venta.
  if (!venta || !comprobante) notFound()

  const { data: items } = await supabase
    .from("venta_items")
    .select("id, cantidad, precio_final_unit, producto:producto_id ( id_publico, nombre )")
    .eq("venta_id", venta.id)
    .order("id")

  const cfg = Object.fromEntries((config ?? []).map((c) => [c.clave, c.valor]))
  const esNC = esNotaCredito(comprobante.tipo)
  const esClaseA = comprobante.tipo === "FACTURA_A" || comprobante.tipo === "NOTA_CREDITO_A"
  const letra = esClaseA ? "A" : "B"
  const tituloDoc = esNC ? "NOTA DE CRÉDITO" : "FACTURA"
  const ivaPct = Number(cfg.afip_iva_pct || "21")
  // En clase A los ítems se muestran a valor neto (los precios del sistema son finales)
  const factorNeto = esClaseA ? 1 / (1 + ivaPct / 100) : 1

  const rows = (items ?? []) as unknown as ItemFactura[]
  const qrDataUrl = await QRCode.toDataURL(qrUrlComprobante(comprobante), { margin: 1, width: 132 })

  const numeroFmt = formatNumeroComprobante(comprobante.punto_venta, Number(comprobante.numero))
  const docReceptor =
    comprobante.doc_tipo === 80 ? `CUIT ${comprobante.doc_nro}`
    : comprobante.doc_tipo === 96 ? `DNI ${comprobante.doc_nro}`
    : "Sin identificar"
  const domicilioReceptor = venta.cliente
    ? [venta.cliente.direccion, venta.cliente.ciudad, venta.cliente.provincia].filter(Boolean).join(", ")
    : ""

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white py-8 print:py-0 px-4 text-black">
      <div className="max-w-[210mm] mx-auto space-y-4">
        <div className="flex justify-end print:hidden">
          <PrintButton label={esNC ? "Imprimir nota de crédito" : "Imprimir factura"} />
        </div>

        <div className="bg-white shadow print:shadow-none p-8 text-[13px] leading-snug font-sans">
          {/* ── Cabecera: emisor | letra | comprobante ── */}
          <p className="text-center text-[10px] tracking-[0.3em] uppercase mb-2">Original</p>
          <div className="grid grid-cols-[1fr_auto_1fr] border border-black">
            <div className="p-4">
              <p className="text-lg font-bold uppercase">{cfg.afip_razon_social || "—"}</p>
              <p className="mt-2">{cfg.afip_domicilio || "—"}</p>
              <p className="mt-1">IVA Responsable Inscripto</p>
            </div>
            <div className="border-x border-black px-4 py-2 text-center self-start -mb-px bg-white">
              <p className="text-4xl font-bold leading-none">{letra}</p>
              <p className="text-[10px] mt-1">COD. {String(CBTE_TIPO_CODIGO[comprobante.tipo]).padStart(2, "0")}</p>
            </div>
            <div className="p-4 text-right">
              <p className="text-lg font-bold">{tituloDoc}</p>
              <p className="font-mono">Nº {numeroFmt}</p>
              <p className="mt-2">Fecha: {formatFecha(comprobante.fecha_emision)}</p>
              <p className="mt-1">CUIT: {comprobante.cuit_emisor}</p>
              <p>IIBB: {cfg.afip_iibb || "—"}</p>
              <p>Inicio de actividades: {cfg.afip_inicio_actividades || "—"}</p>
            </div>
          </div>

          {/* ── Receptor ── */}
          <div className="border border-black border-t-0 p-4 grid grid-cols-2 gap-x-6 gap-y-1">
            <p>
              <span className="font-bold">Señor(es): </span>
              {venta.cliente ? nombreVisible(venta.cliente) : "Consumidor Final"}
            </p>
            <p><span className="font-bold">{docReceptor.startsWith("Sin") ? "Documento: " : ""}</span>{docReceptor}</p>
            <p>
              <span className="font-bold">Condición IVA: </span>
              {CONDICION_IVA_LABEL[comprobante.condicion_iva_receptor]}
            </p>
            {domicilioReceptor && (
              <p><span className="font-bold">Domicilio: </span>{domicilioReceptor}</p>
            )}
          </div>

          {/* ── Comprobante anulado (RG 4540: la NC identifica al original) ── */}
          {esNC && factura && (
            <div className="border border-black border-t-0 px-4 py-2 text-[12px]">
              <span className="font-bold">Anula: </span>
              {TIPO_COMPROBANTE_LABEL[factura.tipo]} Nº{" "}
              {formatNumeroComprobante(factura.punto_venta, Number(factura.numero))} · emitida{" "}
              {formatFecha(factura.fecha_emision)} · CAE {factura.cae}
              {comprobante.motivo && (
                <span className="text-neutral-600"> · Motivo: {comprobante.motivo}</span>
              )}
            </div>
          )}

          {/* ── Ítems ── */}
          <table className="w-full mt-4 border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1.5 pr-2">Código</th>
                <th className="py-1.5 pr-2">Descripción</th>
                <th className="py-1.5 pr-2 text-right">Cant.</th>
                <th className="py-1.5 pr-2 text-right">P. unitario</th>
                <th className="py-1.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const unit = Number(it.precio_final_unit) * factorNeto
                return (
                  <tr key={it.id} className="border-b border-neutral-300">
                    <td className="py-1.5 pr-2 font-mono text-[11px]">{it.producto?.id_publico ?? "—"}</td>
                    <td className="py-1.5 pr-2">{it.producto?.nombre ?? "Producto"}</td>
                    <td className="py-1.5 pr-2 text-right">{it.cantidad}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{formatPesos(unit)}</td>
                    <td className="py-1.5 text-right font-mono">{formatPesos(unit * it.cantidad)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Totales ── */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1">
              {esClaseA ? (
                <>
                  <div className="flex justify-between">
                    <span>Subtotal neto</span>
                    <span className="font-mono">{formatPesos(Number(comprobante.neto))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA {ivaPct}%</span>
                    <span className="font-mono">{formatPesos(Number(comprobante.iva))}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
                <span>TOTAL</span>
                <span className="font-mono">{formatPesos(Number(comprobante.total))}</span>
              </div>
            </div>
          </div>

          {/* ── Transparencia Fiscal (Ley 27.743 · RG 5614) — solo clase B ── */}
          {/* Obligatorio desde 01/04/2025 en comprobantes B a consumidor final
              y exentos: IVA contenido en el precio + otros impuestos nacionales
              indirectos (internos; BEXA no comercializa gravados → $ 0,00). */}
          {!esClaseA && (
            <div className="mt-6 w-80 border border-black p-3 text-[11px] leading-snug">
              <p className="font-bold">
                Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)
              </p>
              <div className="mt-1.5 flex justify-between gap-4">
                <span>IVA Contenido</span>
                <span className="font-mono">{formatPesos(Number(comprobante.iva))}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Otros Impuestos Nacionales Indirectos</span>
                <span className="font-mono">{formatPesos(0)}</span>
              </div>
            </div>
          )}

          {/* ── Pie: CAE + QR ── */}
          <div className="flex items-end justify-between mt-8 pt-4 border-t border-black">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no optimizable */}
            <img src={qrDataUrl} alt="QR de verificación ARCA" className="w-[33mm] h-[33mm]" />
            <div className="text-right">
              <p className="font-bold font-mono">CAE Nº {comprobante.cae}</p>
              <p>Vencimiento CAE: {formatFecha(comprobante.cae_vencimiento)}</p>
              <p className="text-[10px] text-neutral-600 mt-1">
                Comprobante autorizado por ARCA · Venta {venta.id_publico}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
