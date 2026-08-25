import { notFound, redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { PrintButton } from "@/components/ui/print-button"
import { formatFecha, formatPesos } from "@/lib/utils"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"

// ─── Recibo NO fiscal de la venta ───────────────────────────────────────────
// Comprobante interno de entrega/cobro para el comprador — NO reemplaza a la
// factura: se imprime aunque la facturación ARCA no esté configurada todavía,
// porque sale de los datos de la venta y no necesita CAE. Por eso la letra X
// y la leyenda "documento no válido como factura" van SIEMPRE: sin ellas esto
// sería una factura trucha.
// Vive FUERA del shell del dashboard, igual que /factura: papel en blanco,
// sin sidebar ni tema oscuro. La visibilidad la recorta RLS (admin o vendedor
// dueño de la venta) — sin sesión no hay recibo.

type Params = { ventaId: string }

type ClienteRecibo = {
  nombre: string
  apellido: string | null
  razon_social: string | null
  tipo: TipoCliente
  documento: string | null
  direccion: string | null
  ciudad: string | null
  provincia: string | null
}

type VentaRecibo = {
  id: string
  id_publico: string
  fecha: string
  subtotal: number
  descuento_total: number
  total: number
  total_cobrado: number
  cancelada_at: string | null
  cliente: ClienteRecibo | null
  vendedor: { nombre: string } | null
}

type ItemRecibo = {
  id: string
  cantidad: number
  precio_final_unit: number
  producto: { id_publico: string; nombre: string } | null
}

// negocio_nombre viene de los seeds (0002) y existe siempre; los afip_* (0031)
// pueden estar vacíos si la facturación electrónica aún no se configuró — el
// recibo usa lo que haya y no exige nada. Sin CUIT a propósito (2026-08-25):
// es el comprobante informal para el comprador — los datos fiscales viven en
// la factura, que es el documento que los exige.
const CLAVES_CONFIG = ["negocio_nombre", "afip_razon_social", "afip_domicilio"] as const

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Params
  // ?embed=1: la vista se incrusta en el diálogo post-cobro de Nueva venta —
  // el botón de imprimir sobra ahí (el diálogo tiene el suyo).
  searchParams?: { embed?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: venta }, { data: config }] = await Promise.all([
    supabase
      .from("ventas")
      .select(`
        id, id_publico, fecha, subtotal, descuento_total, total, total_cobrado, cancelada_at,
        cliente:cliente_id ( nombre, apellido, razon_social, tipo, documento, direccion, ciudad, provincia ),
        vendedor:vendedor_id ( nombre )
      `)
      .eq("id", params.ventaId)
      .maybeSingle<VentaRecibo>(),
    supabase.from("configuracion").select("clave, valor").in("clave", [...CLAVES_CONFIG]),
  ])

  // Una venta cancelada no genera recibo: sería un comprobante de una
  // operación que ya no existe.
  if (!venta || venta.cancelada_at) notFound()

  const { data: items } = await supabase
    .from("venta_items")
    .select("id, cantidad, precio_final_unit, producto:producto_id ( id_publico, nombre )")
    .eq("venta_id", venta.id)
    .order("id")

  const cfg = Object.fromEntries((config ?? []).map((c) => [c.clave, c.valor]))
  const emisor = cfg.afip_razon_social || cfg.negocio_nombre || "—"
  const rows = (items ?? []) as unknown as ItemRecibo[]

  const cobrado = Number(venta.total_cobrado)
  const saldo = Number(venta.total) - cobrado
  const domicilioReceptor = venta.cliente
    ? [venta.cliente.direccion, venta.cliente.ciudad, venta.cliente.provincia].filter(Boolean).join(", ")
    : ""

  const embed = Boolean(searchParams?.embed)

  return (
    <div className={`min-h-screen bg-neutral-200 print:bg-white ${embed ? "py-4" : "py-8"} print:py-0 px-4 text-black`}>
      {/* Margen de página 0: el navegador imprime SU cabecera y pie (URL,
          fecha, "1/1") EN el margen — sin margen, no hay dónde y desaparecen.
          El respiro del papel lo pone el padding del propio documento. */}
      <style>{`@media print { @page { size: A4; margin: 0; } }`}</style>
      <div className="max-w-[210mm] mx-auto space-y-4">
        {!embed && (
          <div className="flex justify-end print:hidden">
            <PrintButton label="Imprimir recibo" />
          </div>
        )}

        <div className="bg-white shadow print:shadow-none p-8 text-[13px] leading-snug font-sans">
          {/* ── Cabecera: emisor | letra X | recibo ──
              La leyenda "no válido como factura" va SOLO al pie (pedido
              2026-08-25) — arriba alcanza con la letra X / NO FISCAL. */}
          <div className="grid grid-cols-[1fr_auto_1fr] border border-black">
            <div className="p-4">
              <p className="text-lg font-bold uppercase">{emisor}</p>
              {cfg.afip_domicilio && <p className="mt-2">{cfg.afip_domicilio}</p>}
            </div>
            <div className="border-x border-black px-4 py-2 text-center self-start -mb-px bg-white">
              <p className="text-4xl font-bold leading-none">X</p>
              <p className="text-[10px] mt-1">NO FISCAL</p>
            </div>
            <div className="p-4 text-right">
              <p className="text-lg font-bold">RECIBO</p>
              <p className="font-mono">Nº {venta.id_publico}</p>
              <p className="mt-2">Fecha: {formatFecha(venta.fecha)}</p>
            </div>
          </div>

          {/* ── Receptor ── */}
          <div className="border border-black border-t-0 p-4 grid grid-cols-2 gap-x-6 gap-y-1">
            <p>
              <span className="font-bold">Señor(es): </span>
              {venta.cliente ? nombreVisible(venta.cliente) : "Consumidor Final"}
            </p>
            {venta.cliente?.documento && (
              <p><span className="font-bold">Documento: </span>{venta.cliente.documento}</p>
            )}
            {domicilioReceptor && (
              <p><span className="font-bold">Domicilio: </span>{domicilioReceptor}</p>
            )}
          </div>

          {/* ── Ítems (precios finales — sin desglose de IVA: no es fiscal) ── */}
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
                const unit = Number(it.precio_final_unit)
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
              {Number(venta.descuento_total) > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatPesos(Number(venta.subtotal))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento</span>
                    <span className="font-mono">-{formatPesos(Number(venta.descuento_total))}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
                <span>TOTAL</span>
                <span className="font-mono">{formatPesos(Number(venta.total))}</span>
              </div>
              {/* El recibo también documenta el cobro: si hubo pago parcial,
                  el comprador ve cuánto entregó y cuánto debe. */}
              {cobrado > 0 && saldo > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Cobrado</span>
                    <span className="font-mono">{formatPesos(cobrado)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Saldo pendiente</span>
                    <span className="font-mono">{formatPesos(saldo)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Pie ── */}
          <div className="flex items-end justify-between mt-8 pt-4 border-t border-black text-[11px] text-neutral-600">
            <p>
              Venta {venta.id_publico}
              {venta.vendedor?.nombre && ` · Atendió: ${venta.vendedor.nombre}`}
            </p>
            <p className="font-bold uppercase">Documento no válido como factura</p>
          </div>
        </div>
      </div>
    </div>
  )
}
