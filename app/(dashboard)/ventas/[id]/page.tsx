import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { EstadoEntregaSelect } from "@/components/ventas/EstadoEntregaSelect"
import { CancelarVentaButton } from "@/components/ventas/CancelarVentaButton"
import { CobrarVentaForm } from "@/components/ventas/CobrarVentaForm"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmitirFacturaButton } from "@/components/ventas/EmitirFacturaButton"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatFechaHora, formatPesos } from "@/lib/utils"
import {
  ESTADO_COBRO_LABEL,
  ESTADO_COBRO_VARIANT,
  ESTADO_ENTREGA_LABEL,
  ESTADO_ENTREGA_VARIANT,
  explicarOrigenPrecio,
} from "@/lib/ventas-ui"
import {
  CONDICION_IVA_LABEL,
  TIPO_COMPROBANTE_LABEL,
  formatNumeroComprobante,
  qrUrlComprobante,
} from "@/lib/facturacion-ui"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import {
  normalizarCuit,
  tipoComprobantePara,
  type Comprobante,
  type CondicionIva,
} from "@/lib/validators/facturacion"
import type { EstadoCobro, EstadoEntrega } from "@/lib/validators/venta"

type Params = { id: string }

type VentaFull = {
  id: string
  id_publico: string
  fecha: string
  vendedor_id: string
  estado_entrega: EstadoEntrega
  estado_cobro: EstadoCobro
  subtotal: number
  descuento_total: number
  total: number
  total_cobrado: number
  notas: string | null
  cancelada_at: string | null
  cancelada_motivo: string | null
  cliente: {
    id: string
    id_publico: string
    nombre: string
    apellido: string | null
    razon_social: string | null
    tipo: TipoCliente
    documento: string | null
    condicion_iva: CondicionIva
  } | null
  vendedor: { nombre: string } | null
}

type ItemRow = {
  id: string
  cantidad: number
  precio_unitario: number
  descuento_pct: number
  precio_final_unit: number
  origen_precio: string | null
  // Snapshot de la comisión de esta línea (0018). El % puede diferir entre
  // líneas de la misma venta si algún producto tiene override.
  comision_pct_snapshot: number
  comision_monto: number
  producto: { id: string; id_publico: string; nombre: string } | null
}

export default async function VentaDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (!profile?.activo) redirect("/login")

  const esAdmin = profile.rol === ROL.ADMIN

  const { data: venta } = await supabase
    .from("ventas")
    .select(`
      id, id_publico, fecha, vendedor_id,
      estado_entrega, estado_cobro,
      subtotal, descuento_total, total, total_cobrado,
      notas, cancelada_at, cancelada_motivo,
      cliente:cliente_id ( id, id_publico, nombre, apellido, razon_social, tipo, documento, condicion_iva ),
      vendedor:vendedor_id ( nombre )
    `)
    .eq("id", params.id)
    .maybeSingle<VentaFull>()

  if (!venta) notFound()

  const [{ data: items }, { data: comision }, { data: comprobanteRow }, { data: cfgCuit }] = await Promise.all([
    supabase
      .from("venta_items")
      .select("id, cantidad, precio_unitario, descuento_pct, precio_final_unit, origen_precio, comision_pct_snapshot, comision_monto, producto:producto_id ( id, id_publico, nombre )")
      .eq("venta_id", venta.id)
      .order("id"),
    // Comisión visible para admin siempre, para vendedor solo si es la suya (RLS).
    supabase
      .from("comisiones")
      .select("monto_base, porcentaje, monto")
      .eq("venta_id", venta.id)
      .maybeSingle(),
    supabase
      .from("comprobantes")
      .select("id, tipo, punto_venta, numero, fecha_emision, cuit_emisor, doc_tipo, doc_nro, condicion_iva_receptor, neto, iva, total, cae, cae_vencimiento")
      .eq("venta_id", venta.id)
      .maybeSingle<Comprobante>(),
    // afip_cuit vacío = facturación electrónica todavía no configurada.
    supabase
      .from("configuracion")
      .select("valor")
      .eq("clave", "afip_cuit")
      .maybeSingle(),
  ])

  const rows = (items ?? []) as unknown as ItemRow[]
  // ¿Hay productos con override de comisión en esta venta? Si todas las líneas
  // fueron al mismo %, el desglose no aporta nada y no se muestra.
  const comisionMixta =
    new Set(rows.map((r) => Number(r.comision_pct_snapshot ?? 0))).size > 1
  const ent = DOMINIO.ventas
  const saldo = Number(venta.total) - Number(venta.total_cobrado)
  const puedeCancelar =
    venta.estado_cobro !== "CANCELADA" &&
    (esAdmin || (venta.vendedor_id === user.id && Number(venta.total_cobrado) === 0))
  const puedeCobrar =
    venta.estado_cobro !== "CANCELADA" &&
    venta.estado_cobro !== "COBRADA" &&
    saldo > 0 &&
    (esAdmin || venta.vendedor_id === user.id)
  // Facturación electrónica: solo con el CUIT de la empresa configurado (0031),
  // venta viva, sin comprobante previo, y misma autorización que cobrar.
  const afipConfigurada = Boolean(normalizarCuit(cfgCuit?.valor))
  const tipoFactura = venta.cliente ? tipoComprobantePara(venta.cliente.condicion_iva) : null
  const puedeFacturar =
    afipConfigurada &&
    !comprobanteRow &&
    tipoFactura !== null &&
    venta.estado_cobro !== "CANCELADA" &&
    Number(venta.total) > 0 &&
    (esAdmin || venta.vendedor_id === user.id)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Venta · <span className="text-app-secondary">{venta.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {venta.cliente ? nombreVisible(venta.cliente) : "—"}
            </h1>
            <p className="text-app-secondary mt-1 font-mono text-xs">
              {formatFechaHora(venta.fecha)}
              {venta.vendedor?.nombre && ` · ${venta.vendedor.nombre}`}
              {venta.cliente && ` · `}
              {venta.cliente && (
                <Link href={`${DOMINIO.clientes.ruta}/${venta.cliente.id}`} className="hover:text-app-accent">
                  {venta.cliente.id_publico}
                </Link>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {/* Entrega editable (0021); una venta cancelada no se toca. */}
              {venta.estado_entrega === "CANCELADA" ? (
                <Badge variant={ESTADO_ENTREGA_VARIANT.CANCELADA}>
                  {ESTADO_ENTREGA_LABEL.CANCELADA}
                </Badge>
              ) : (
                <EstadoEntregaSelect ventaId={venta.id} estado={venta.estado_entrega} />
              )}
              <Badge variant={ESTADO_COBRO_VARIANT[venta.estado_cobro]}>
                {ESTADO_COBRO_LABEL[venta.estado_cobro]}
              </Badge>
            </div>
            {puedeCobrar && (
              <CobrarVentaForm ventaId={venta.id} idPublico={venta.id_publico} saldo={saldo} />
            )}
            {puedeFacturar && venta.cliente && tipoFactura && (
              <EmitirFacturaButton
                ventaId={venta.id}
                idPublico={venta.id_publico}
                tipoLabel={TIPO_COMPROBANTE_LABEL[tipoFactura]}
                receptor={`${nombreVisible(venta.cliente)} (${CONDICION_IVA_LABEL[venta.cliente.condicion_iva]})`}
                totalFmt={formatPesos(Number(venta.total))}
              />
            )}
            {puedeCancelar && (
              <CancelarVentaButton ventaId={venta.id} idPublico={venta.id_publico} />
            )}
          </div>
        </header>

        {venta.cancelada_at && (
          <div className="rounded-xl border border-app-red/40 bg-app-red/10 px-5 py-4">
            <p className="font-display font-semibold text-app-red">Venta cancelada</p>
            <p className="text-xs text-app-secondary font-mono mt-0.5">
              {formatFechaHora(venta.cancelada_at)}
              {venta.cancelada_motivo && ` · ${venta.cancelada_motivo}`}
            </p>
          </div>
        )}

        {/* Ítems */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft">
            <h2 className="font-display font-semibold">Ítems</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Desc</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={5}>Sin ítems.</TableEmpty>
              ) : (
                rows.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      {it.producto ? (
                        <Link href={`${DOMINIO.productos.ruta}/${it.producto.id}`} className="hover:text-app-accent">
                          <span className="font-mono text-app-accent text-xs">{it.producto.id_publico}</span>
                          <span className="ml-2">{it.producto.nombre}</span>
                        </Link>
                      ) : "Producto eliminado"}
                      <p className="mt-0.5 text-[10.5px] font-mono text-app-muted">
                        {explicarOrigenPrecio(it.origen_precio)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{it.cantidad}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(it.precio_final_unit))}
                      {Number(it.descuento_pct) > 0 && (
                        <p className="text-[10.5px] text-app-muted line-through">
                          {formatPesos(Number(it.precio_unitario))}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(it.descuento_pct) > 0 ? `-${Number(it.descuento_pct)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(it.precio_final_unit) * it.cantidad)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {/* Totales */}
        <section className="rounded-xl border border-app-line-soft bg-app-card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right">
            <div>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Subtotal</p>
              <p className="font-display text-lg mt-1">{formatPesos(Number(venta.subtotal))}</p>
            </div>
            <div>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Descuento</p>
              <p className="font-display text-lg text-app-amber mt-1">-{formatPesos(Number(venta.descuento_total))}</p>
            </div>
            <div>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total</p>
              <p className="font-display text-2xl text-app-accent mt-1">{formatPesos(Number(venta.total))}</p>
            </div>
            <div>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Saldo</p>
              <p className={`font-display text-lg mt-1 ${saldo > 0 ? "text-app-amber" : "text-app-green"}`}>
                {formatPesos(saldo)}
              </p>
              {Number(venta.total_cobrado) > 0 && (
                <p className="text-[10.5px] font-mono text-app-muted mt-0.5">
                  cobrado {formatPesos(Number(venta.total_cobrado))}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Comprobante fiscal (si la venta fue facturada en ARCA) */}
        {comprobanteRow && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">
                  {TIPO_COMPROBANTE_LABEL[comprobanteRow.tipo]}{" "}
                  <span className="font-mono text-app-accent">
                    {formatNumeroComprobante(comprobanteRow.punto_venta, Number(comprobanteRow.numero))}
                  </span>
                </h2>
                <p className="text-xs text-app-secondary font-mono mt-0.5">
                  Emitida {formatFecha(comprobanteRow.fecha_emision)} ·{" "}
                  {CONDICION_IVA_LABEL[comprobanteRow.condicion_iva_receptor]}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <a
                  href={`/factura/${venta.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-app-accent hover:underline"
                >
                  Ver / imprimir factura ↗
                </a>
                <a
                  href={qrUrlComprobante(comprobanteRow)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-app-muted hover:text-app-accent hover:underline"
                >
                  Verificar en ARCA ↗
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right border-t border-app-line-soft pt-4">
              <div>
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Neto</p>
                <p className="font-display text-lg mt-1">{formatPesos(Number(comprobanteRow.neto))}</p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">IVA</p>
                <p className="font-display text-lg mt-1">{formatPesos(Number(comprobanteRow.iva))}</p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total</p>
                <p className="font-display text-lg mt-1">{formatPesos(Number(comprobanteRow.total))}</p>
              </div>
              <div>
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">CAE</p>
                <p className="font-mono text-sm mt-1.5">{comprobanteRow.cae}</p>
                <p className="text-[10.5px] font-mono text-app-muted mt-0.5">
                  vence {formatFecha(comprobanteRow.cae_vencimiento)}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Comisión (si el usuario tiene visibilidad) */}
        {comision && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <h2 className="font-display font-semibold">Comisión</h2>
            <p className="text-sm text-app-secondary">
              <span className="font-mono">{Number(comision.porcentaje)}%</span>
              {comisionMixta && <span className="text-app-muted"> (promedio)</span>} sobre{" "}
              <span className="font-mono">{formatPesos(Number(comision.monto_base))}</span> ={" "}
              <span className="font-mono text-app-green font-semibold">{formatPesos(Number(comision.monto))}</span>
            </p>

            {/* Desglose: solo cuando hay productos con override, que es cuando
                el número de arriba no se explica solo. Si todas las líneas van
                al mismo %, mostrarlo sería ruido. */}
            {comisionMixta && (
              <div className="border-t border-app-line-soft pt-3">
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest mb-2">
                  Por producto · algunos tienen un % propio
                </p>
                <ul className="space-y-1">
                  {rows.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-app-secondary truncate">
                        {it.producto?.nombre ?? "—"}
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        <span className="text-app-muted">{Number(it.comision_pct_snapshot)}%</span>
                        {" · "}
                        <span className="text-app-green">{formatPesos(Number(it.comision_monto))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {venta.notas && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Notas</p>
            <p className="text-sm text-app-text whitespace-pre-wrap mt-1">{venta.notas}</p>
          </section>
        )}
      </div>
    </div>
  )
}
