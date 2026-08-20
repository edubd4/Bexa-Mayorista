import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LinkRow } from "@/components/ui/link-row"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CobrarVentaDialog } from "@/components/ventas/CobrarVentaDialog"
import { EstadoEntregaSelect } from "@/components/ventas/EstadoEntregaSelect"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import {
  ESTADO_COBRO_LABEL,
  ESTADO_COBRO_VARIANT,
  ESTADO_ENTREGA_LABEL,
  ESTADO_ENTREGA_VARIANT,
} from "@/lib/ventas-ui"
import { formatNumeroComprobante } from "@/lib/facturacion-ui"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"
import type { MetodoPago } from "@/lib/validators/caja"
import { ahoraArgentina, diaSiguienteISO, toISODate, tsArgentina } from "@/lib/fechas"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import type { TipoComprobante } from "@/lib/validators/facturacion"
import type { EstadoCobro, EstadoEntrega } from "@/lib/validators/venta"
import { logPerfilError } from "@/lib/auth-guards"

type VentaRow = {
  id: string
  id_publico: string
  fecha: string
  cliente_id: string
  vendedor_id: string
  estado_entrega: EstadoEntrega
  estado_cobro: EstadoCobro
  total: number
  saldo: number
  items_count: number
  facturada: boolean
  comp_tipo: TipoComprobante | null
  comp_punto_venta: number | null
  comp_numero: number | null
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
  vendedor: { nombre: string } | null
}

// Fila de v_resumen_facturacion (0033). security_invoker: el vendedor ve SUS
// totales, el admin los del negocio — misma RLS que la lista.
type ResumenFacturacion = {
  facturada: boolean
  cantidad: number
  monto_total: number
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { q?: string; cobro?: string; entrega?: string; fact?: string; metodo?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("VentasPage", perfilError)
  if (!profile?.activo) redirect("/login")
  // Marketing no vende ni cobra comisiones — no ve el módulo.
  if (profile.rol === ROL.MARKETING) redirect("/panel")

  const esAdmin = profile.rol === ROL.ADMIN

  // El vendedor ve SOLO sus ventas. Se filtra en dos lugares a propósito:
  // acá (explícito) y en la RLS de `ventas`, que la vista respeta desde la
  // 0016. Defensa en profundidad — si mañana alguien afloja una policy, esta
  // pantalla sigue sin filtrar de más.
  let query = supabase
    .from("v_ventas_lista")
    .select(`
      id, id_publico, fecha, cliente_id, vendedor_id,
      estado_entrega, estado_cobro,
      total, saldo, items_count,
      facturada, comp_tipo, comp_punto_venta, comp_numero,
      cliente:cliente_id ( nombre, apellido, razon_social, tipo ),
      vendedor:vendedor_id ( nombre )
    `)
    .order("fecha", { ascending: false })
    .limit(200)

  if (!esAdmin) query = query.eq("vendedor_id", user.id)

  if (searchParams.cobro && ["PENDIENTE", "PARCIAL", "COBRADA", "CANCELADA"].includes(searchParams.cobro)) {
    query = query.eq("estado_cobro", searchParams.cobro)
  }
  if (searchParams.entrega && ["ENTREGADA", "PEDIDO", "EN_PREPARACION", "CANCELADA"].includes(searchParams.entrega)) {
    query = query.eq("estado_entrega", searchParams.entrega)
  }
  // Circuito fiscal (0033): SI = con comprobante, NO = sin facturar.
  if (searchParams.fact === "SI") query = query.eq("facturada", true)
  if (searchParams.fact === "NO") query = query.eq("facturada", false)
  const q = (searchParams.q ?? "").trim()
  if (q.length >= 2) {
    query = query.ilike("id_publico", `%${q}%`)
  }

  // Filtro por fecha (pedido del cliente 2026-08-19): rango [desde, hasta]
  // inclusivo en días argentinos, contra la columna timestamptz.
  const esFechaISO = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const desde = esFechaISO(searchParams.desde) ? searchParams.desde! : ""
  const hasta = esFechaISO(searchParams.hasta) ? searchParams.hasta! : ""
  if (desde) query = query.gte("fecha", tsArgentina(desde))
  if (hasta) query = query.lt("fecha", tsArgentina(diaSiguienteISO(hasta)))

  // Filtro por método de pago: una venta "pagada con X" es una venta con al
  // menos un cobro por ese método. Se buscan primero los cobros y se acota la
  // lista a esas ventas. Si no hay ninguna, forzamos lista vacía.
  const metodo = (searchParams.metodo ?? "") as MetodoPago | ""
  if (metodo && metodo in METODO_PAGO_LABEL) {
    let cobrosQ = supabase
      .from("movimientos_caja")
      .select("venta_id")
      .eq("origen", "COBRO_VENTA")
      .eq("metodo_pago", metodo)
      .not("venta_id", "is", null)
      .limit(1000)
    if (desde) cobrosQ = cobrosQ.gte("fecha", tsArgentina(desde))
    if (hasta) cobrosQ = cobrosQ.lt("fecha", tsArgentina(diaSiguienteISO(hasta)))
    const { data: cobros } = await cobrosQ
    const ids = Array.from(new Set((cobros ?? []).map((c) => c.venta_id as string)))
    query = ids.length > 0
      ? query.in("id", ids)
      : query.eq("id", "00000000-0000-0000-0000-000000000000")
  }

  const conFechas = !!(desde || hasta)
  const [{ data }, { data: resumenData }, resumenPeriodoQ] = await Promise.all([
    query,
    supabase.from("v_resumen_facturacion").select("facturada, cantidad, monto_total"),
    // Con fechas activas, las tarjetas Facturado/Sin facturar se calculan del
    // PERIODO (antes ignoraban el filtro: filtrabas "hoy" y seguian mostrando
    // la historia entera sin decirlo — pulido 2026-08-19).
    (async () => {
      if (!conFechas) return { data: null }
      let rq = supabase
        .from("v_ventas_lista")
        .select("facturada, total")
        .neq("estado_cobro", "CANCELADA")
        .limit(2000)
      if (!esAdmin) rq = rq.eq("vendedor_id", user.id)
      if (desde) rq = rq.gte("fecha", tsArgentina(desde))
      if (hasta) rq = rq.lt("fecha", tsArgentina(diaSiguienteISO(hasta)))
      return rq
    })(),
  ])
  const rows = (data ?? []) as unknown as VentaRow[]

  // Métodos de pago de cada venta listada (columna "Pago"): salen de los
  // cobros reales en caja — una venta puede tener varios (parcial + saldo).
  const metodosPorVenta = new Map<string, MetodoPago[]>()
  if (rows.length > 0) {
    const { data: movs } = await supabase
      .from("movimientos_caja")
      .select("venta_id, metodo_pago")
      .eq("origen", "COBRO_VENTA")
      .in("venta_id", rows.map((r) => r.id))
    for (const m of (movs ?? []) as { venta_id: string; metodo_pago: MetodoPago }[]) {
      const arr = metodosPorVenta.get(m.venta_id) ?? []
      if (!arr.includes(m.metodo_pago)) arr.push(m.metodo_pago)
      metodosPorVenta.set(m.venta_id, arr)
    }
  }

  // Total de lo que está en pantalla — con filtros activos es el balance del
  // recorte (ej: "hoy en efectivo"). Canceladas excluidas de la suma.
  const hayFiltros = !!(desde || hasta || metodo || searchParams.cobro || searchParams.entrega || searchParams.fact || q.length >= 2)
  const vivas = rows.filter((r) => r.estado_cobro !== "CANCELADA")
  const totalFiltrado = vivas.reduce((s, r) => s + Number(r.total), 0)
  const hoyISO = toISODate(ahoraArgentina())
  const resumen = (resumenData ?? []) as ResumenFacturacion[]
  const filasPeriodo = (resumenPeriodoQ.data ?? null) as { facturada: boolean; total: number }[] | null
  const tarjetaFiscal = (facturada: boolean) => {
    if (filasPeriodo) {
      const filas = filasPeriodo.filter((r) => r.facturada === facturada)
      return { monto: filas.reduce((sum, r) => sum + Number(r.total), 0), cantidad: filas.length }
    }
    const r = resumen.find((x) => x.facturada === facturada)
    return { monto: Number(r?.monto_total ?? 0), cantidad: Number(r?.cantidad ?? 0) }
  }
  const cardFacturado = tarjetaFiscal(true)
  const cardSinFacturar = tarjetaFiscal(false)
  // La tarjeta dice DE QUE PERIODO habla — "facturado" a secas era ambiguo.
  const etiquetaPeriodo = !conFechas
    ? "histórico"
    : desde && desde === hasta
      ? (desde === hoyISO ? "hoy" : desde)
      : `${desde || "inicio"} → ${hasta || "hoy"}`
  const ent = DOMINIO.ventas

  // Links que PRESERVAN los filtros activos (antes clickear una tarjeta te
  // borraba la fecha y el metodo elegidos). fact undefined = destildar.
  const urlConFact = (valor?: "SI" | "NO") => {
    const params = new URLSearchParams()
    if (q.length >= 2) params.set("q", q)
    if (searchParams.cobro) params.set("cobro", searchParams.cobro)
    if (searchParams.entrega) params.set("entrega", searchParams.entrega)
    if (metodo) params.set("metodo", metodo)
    if (desde) params.set("desde", desde)
    if (hasta) params.set("hasta", hasta)
    if (valor) params.set("fact", valor)
    const qs = params.toString()
    return qs ? `${ent.ruta}?${qs}` : ent.ruta
  }

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Operación · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              Cada venta mueve stock, comisión e historial · {esAdmin ? "ves todas" : "ves las tuyas"}.
            </p>
          </div>
          <Button asChild>
            <Link href={`${ent.ruta}/nuevo`}>
              <Plus className="w-4 h-4" />
              {nuevoLabel(ent)}
            </Link>
          </Button>
        </header>

        <AyudaPantalla
          que="Todas las ventas registradas, con su estado de cobro y de entrega. Desde acá registrás una venta nueva y entrás a cobrar las que quedaron pendientes."
          cuando="Cada vez que le vendés algo a alguien, en el momento. Y cuando un cliente viene a pagarte algo que se había llevado con saldo."
          ojo="Registrar la venta descuenta el stock enseguida, pero NO entra la plata a la caja. La plata entra recién cuando cobrás la venta."
          seccion="registrar-venta"
        />

        {/* Circuito fiscal (0033): los dos números que el dueño quiere ver
            separados. Canceladas excluidas. Cada tarjeta filtra al click (y
            destilda si ya estaba activa); con fechas puestas hablan DEL
            período, no de la historia — y lo dicen en la etiqueta. */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            href={urlConFact(searchParams.fact === "SI" ? undefined : "SI")}
            className={`rounded-xl border p-4 transition-colors ${
              searchParams.fact === "SI"
                ? "border-app-accent/60 bg-app-accent/10"
                : "border-app-line-soft bg-app-card hover:border-app-accent/40"
            }`}
          >
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
              Facturado · {etiquetaPeriodo}
            </p>
            <p className="font-display text-xl md:text-2xl text-app-green mt-1">
              {formatPesos(cardFacturado.monto)}
            </p>
            <p className="text-[11px] font-mono text-app-muted mt-0.5">
              {cardFacturado.cantidad} {cardFacturado.cantidad === 1 ? "venta" : "ventas"} con comprobante
            </p>
          </Link>
          <Link
            href={urlConFact(searchParams.fact === "NO" ? undefined : "NO")}
            className={`rounded-xl border p-4 transition-colors ${
              searchParams.fact === "NO"
                ? "border-app-accent/60 bg-app-accent/10"
                : "border-app-line-soft bg-app-card hover:border-app-accent/40"
            }`}
          >
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
              Sin facturar · {etiquetaPeriodo}
            </p>
            <p className="font-display text-xl md:text-2xl text-app-amber mt-1">
              {formatPesos(cardSinFacturar.monto)}
            </p>
            <p className="text-[11px] font-mono text-app-muted mt-0.5">
              {cardSinFacturar.cantidad} {cardSinFacturar.cantidad === 1 ? "venta" : "ventas"} solo registro interno
            </p>
          </Link>
        </section>

        {/* Filtros — en tarjeta y en dos filas con logica (pulido 2026-08-19):
            arriba QUE ventas busco (texto y estados), abajo CUANDO y COMO se
            pagaron, con las acciones al final de la fila. */}
        <form action={ent.ruta} method="get" className="rounded-xl border border-app-line-soft bg-app-card p-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID (VTA-0001…)"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="cobro"
            defaultValue={searchParams.cobro ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo cobro</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="COBRADA">Cobrada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
          <select
            name="entrega"
            defaultValue={searchParams.entrega ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Toda entrega</option>
            <option value="ENTREGADA">Entregada</option>
            <option value="PEDIDO">Pedido</option>
            <option value="EN_PREPARACION">En preparación</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
          <select
            name="fact"
            defaultValue={searchParams.fact ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Facturadas y sin facturar</option>
            <option value="SI">Solo facturadas</option>
            <option value="NO">Solo sin facturar</option>
          </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {/* Método de pago real de los cobros (2026-08-19) */}
          <select
            name="metodo"
            defaultValue={metodo}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo método de pago</option>
            {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
              <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
            ))}
          </select>
          {/* Rango de fechas en días argentinos, leido como una frase */}
          <span className="text-xs font-mono text-app-muted">del</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            aria-label="Desde"
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          />
          <span className="text-xs font-mono text-app-muted">al</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            aria-label="Hasta"
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          />
          <Link
            href={`${ent.ruta}?desde=${hoyISO}&hasta=${hoyISO}`}
            className={`h-10 inline-flex items-center rounded-md border px-3 text-sm font-mono transition-colors ${
              desde === hoyISO && hasta === hoyISO
                ? "border-app-accent/60 bg-app-accent/10 text-app-accent"
                : "border-app-line text-app-secondary hover:text-app-accent hover:border-app-accent/40"
            }`}
          >
            Hoy
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {hayFiltros && (
              <Link href={ent.ruta} className="h-10 inline-flex items-center px-2 text-xs font-mono text-app-muted hover:text-app-accent">
                limpiar ✕
              </Link>
            )}
            <Button type="submit" variant="outline" size="sm">Filtrar</Button>
          </div>
          </div>
        </form>

        {/* Balance del recorte: lo que suman las ventas visibles con los
            filtros puestos (canceladas afuera). Es la respuesta a "cuánto
            vendí hoy" / "cuánto salió por posnet esta semana". */}
        {hayFiltros && (
          <div className="rounded-xl border border-app-accent/30 bg-app-accent/5 px-4 py-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-app-secondary">
              <span className="font-mono text-app-text font-semibold">{vivas.length}</span>
              {vivas.length === 1 ? " venta" : " ventas"} en el recorte
              {metodo && ` · cobradas con ${METODO_PAGO_LABEL[metodo as MetodoPago]}`}
              {rows.length === 200 && (
                <span className="text-app-muted"> · tope de 200 filas — afiná el rango si necesitás exactitud</span>
              )}
            </p>
            <p className="font-mono text-lg text-app-accent font-semibold">{formatPesos(totalFiltrado)}</p>
          </div>
        )}

        {/* Tabla */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                {esAdmin && <TableHead className="hidden lg:table-cell">Vendedor</TableHead>}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">Saldo</TableHead>
                <TableHead className="hidden md:table-cell">Entrega</TableHead>
                <TableHead>Cobro</TableHead>
                <TableHead className="hidden md:table-cell">Pago</TableHead>
                <TableHead className="hidden lg:table-cell">Comprobante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={esAdmin ? 10 : 9}>
                  {q.length >= 2 || searchParams.cobro || searchParams.entrega || searchParams.fact
                    ? "Ninguna venta coincide con estos filtros. Probá sacando alguno."
                    : "Todavía no hay ventas registradas. Registrá una con el botón de arriba: se descuenta el stock y se genera la comisión sola."}
                </TableEmpty>
              ) : (
                rows.map((v) => (
                  <LinkRow key={v.id} href={`${ent.ruta}/${v.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">{v.id_publico}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(v.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {v.cliente ? nombreVisible(v.cliente) : "—"}
                    </TableCell>
                    {esAdmin && (
                      <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                        {v.vendedor?.nombre ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(v.total))}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell font-mono text-sm">
                      {Number(v.saldo) > 0
                        ? <span className="text-app-amber">{formatPesos(Number(v.saldo))}</span>
                        : <span className="text-app-muted">—</span>}
                    </TableCell>
                    {/* Entrega editable inline (0021). Cancelada queda como
                        badge: esa venta no se toca. */}
                    <TableCell className="hidden md:table-cell">
                      {v.estado_entrega === "CANCELADA" ? (
                        <Badge variant={ESTADO_ENTREGA_VARIANT.CANCELADA}>
                          {ESTADO_ENTREGA_LABEL.CANCELADA}
                        </Badge>
                      ) : (
                        <EstadoEntregaSelect ventaId={v.id} estado={v.estado_entrega} />
                      )}
                    </TableCell>
                    {/* El estado de cobro no se edita: lo deriva cobrar_venta()
                        de la plata que entra. El atajo correcto es cobrar acá. */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={ESTADO_COBRO_VARIANT[v.estado_cobro]}>
                          {ESTADO_COBRO_LABEL[v.estado_cobro]}
                        </Badge>
                        {(v.estado_cobro === "PENDIENTE" || v.estado_cobro === "PARCIAL") &&
                          Number(v.saldo) > 0 && (
                            <CobrarVentaDialog
                              ventaId={v.id}
                              idPublico={v.id_publico}
                              saldo={Number(v.saldo)}
                            />
                          )}
                      </div>
                    </TableCell>
                    {/* Con qué se pagó (2026-08-19): métodos reales de los
                        cobros en caja. Varios métodos = cobro parcial + saldo. */}
                    <TableCell className="hidden md:table-cell text-xs text-app-secondary">
                      {(() => {
                        const ms = metodosPorVenta.get(v.id) ?? []
                        if (ms.length === 0) return <span className="text-app-muted">—</span>
                        const etiqueta = METODO_PAGO_LABEL[ms[0]]
                        return ms.length === 1
                          ? etiqueta
                          : <span title={ms.map((m) => METODO_PAGO_LABEL[m]).join(" + ")}>{etiqueta} +{ms.length - 1}</span>
                      })()}
                    </TableCell>
                    {/* Circuito fiscal (0033): letra + número si tiene CAE,
                        "Interna" si quedó solo en el registro del sistema. */}
                    <TableCell className="hidden lg:table-cell">
                      {v.facturada && v.comp_tipo && v.comp_numero != null && v.comp_punto_venta != null ? (
                        <span className="font-mono text-xs text-app-green">
                          {v.comp_tipo === "FACTURA_A" ? "A" : "B"}{" "}
                          {formatNumeroComprobante(v.comp_punto_venta, Number(v.comp_numero))}
                        </span>
                      ) : v.estado_cobro === "CANCELADA" ? (
                        <span className="text-app-muted text-xs">—</span>
                      ) : (
                        <Badge variant="gray">Interna</Badge>
                      )}
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "venta" : "ventas"}
        </p>
      </div>
    </div>
  )
}
