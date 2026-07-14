import Link from "next/link"
import { redirect } from "next/navigation"
import {
  AlertTriangle,
  Wallet,
  ClipboardList,
  TrendingUp,
  Package,
  ArrowRight,
  Users,
} from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { formatPesos } from "@/lib/utils"
import { ahoraArgentina, toISODate, tsArgentina } from "@/lib/fechas"
import { ROL } from "@/lib/constants"
import { APP, DOMINIO } from "@/lib/dominio"
import {
  ESTADO_COBRO_LABEL,
  ESTADO_COBRO_VARIANT,
  ESTADO_ENTREGA_LABEL,
  ESTADO_ENTREGA_VARIANT,
} from "@/lib/ventas-ui"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import type { EstadoCobro, EstadoEntrega } from "@/lib/validators/venta"

// ============================================================================
// Panel principal — Ola D · KPIs reales sobre las vistas de 0010_reporting
// Admin: KPIs plata + alertas + últimas ventas + ranking productos/vendedores.
// Vendedor: sus KPIs + comisión de la semana + sus ventas recientes.
// ============================================================================

function inicioSemanaISO(hoyISO: string): string {
  const d = new Date(`${hoyISO}T12:00:00`)
  const diaSemana = (d.getDay() + 6) % 7  // lunes=0
  d.setDate(d.getDate() - diaSemana)
  return toISODate(d)
}
function inicioMesISO(hoyISO: string): string {
  return `${hoyISO.slice(0, 7)}-01`
}

export default async function PanelPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user.id)
    .single()

  const nombre = profile?.nombre ?? user.email ?? "Usuario"
  const esAdmin = profile?.rol === ROL.ADMIN

  if (esAdmin) return <PanelAdmin nombre={nombre} />
  return <PanelVendedor nombre={nombre} userId={user.id} />
}

// ─── Admin ──────────────────────────────────────────────────────────────────
async function PanelAdmin({ nombre }: { nombre: string }) {
  const supabase = await createServerClient()
  const ahora = ahoraArgentina()
  const hoyISO = toISODate(ahora)
  const semanaInicioISO = inicioSemanaISO(hoyISO)
  const mesInicioISO = inicioMesISO(hoyISO)
  const finHoyISO = toISODate(new Date(new Date(`${hoyISO}T12:00:00`).getTime() + 24 * 3600 * 1000))

  const [
    kpiHoyRes, kpiSemanaRes, kpiMesRes,
    saldoRes, alertasRes,
    ultimasVentasRes, rankingProductosRes, rankingVendedoresRes,
  ] = await Promise.all([
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(hoyISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: null }),
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(semanaInicioISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: null }),
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(mesInicioISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: null }),
    supabase.from("saldo_caja").select("saldo").maybeSingle(),
    supabase.rpc("contar_alertas"),
    supabase.from("v_ventas_lista")
      .select("id, id_publico, total, estado_cobro, estado_entrega, fecha, cliente:cliente_id ( nombre, apellido, razon_social, tipo )")
      .order("fecha", { ascending: false })
      .limit(5),
    supabase.from("v_ranking_productos")
      .select("id, id_publico, nombre, unidades_vendidas, facturado")
      .order("facturado", { ascending: false })
      .limit(5),
    supabase.from("v_ranking_vendedores")
      .select("vendedor_id, vendedor_nombre, ventas_count, facturado, comisiones_generadas")
      .order("facturado", { ascending: false })
      .limit(5),
  ])

  const kpiHoy    = pickKpi(kpiHoyRes.data)
  const kpiSemana = pickKpi(kpiSemanaRes.data)
  const kpiMes    = pickKpi(kpiMesRes.data)
  const saldo     = Number(saldoRes.data?.saldo ?? 0)
  const alertas   = pickAlertas(alertasRes.data)
  const totalAlertas = alertas.stock_bajo + alertas.saldos_pendientes + alertas.entregas_atrasadas
  const ventas = (ultimasVentasRes.data ?? []) as unknown as UltimaVenta[]
  const productos = (rankingProductosRes.data ?? []) as RankingProducto[]
  const vendedores = (rankingVendedoresRes.data ?? []) as RankingVendedor[]

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Panel · Admin
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Hola, {nombre}
          </h1>
          <p className="text-app-secondary mt-1">
            {APP.nombre} · resumen operativo
          </p>
        </header>

        {totalAlertas > 0 && (
          <Link
            href="/alertas"
            className="flex items-center justify-between rounded-xl border border-app-amber/40 bg-app-amber/10 px-5 py-4 hover:bg-app-amber/15 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-app-amber" />
              <div>
                <p className="font-display font-semibold text-app-amber">
                  {totalAlertas} alerta{totalAlertas === 1 ? "" : "s"} activa{totalAlertas === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-app-secondary font-mono mt-0.5">
                  {alertas.stock_bajo > 0 && <span className="mr-3">{alertas.stock_bajo} stock bajo</span>}
                  {alertas.saldos_pendientes > 0 && <span className="mr-3">{alertas.saldos_pendientes} saldo{alertas.saldos_pendientes === 1 ? "" : "s"} vencido{alertas.saldos_pendientes === 1 ? "" : "s"}</span>}
                  {alertas.entregas_atrasadas > 0 && <span>{alertas.entregas_atrasadas} entrega{alertas.entregas_atrasadas === 1 ? "" : "s"} atrasada{alertas.entregas_atrasadas === 1 ? "" : "s"}</span>}
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-app-amber" />
          </Link>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI icon={<Wallet className="w-4 h-4" />}  label="Saldo caja"     value={formatPesos(saldo)}       href={DOMINIO.caja.ruta}      tone="accent" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido hoy"   value={formatPesos(kpiHoy.facturado)}   sub={`${kpiHoy.ventas_count} venta${kpiHoy.ventas_count === 1 ? "" : "s"}`}  href={DOMINIO.ventas.ruta} tone="green" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido semana" value={formatPesos(kpiSemana.facturado)} sub={`${kpiSemana.ventas_count} venta${kpiSemana.ventas_count === 1 ? "" : "s"}`} href={DOMINIO.ventas.ruta} tone="green" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido mes"   value={formatPesos(kpiMes.facturado)}    sub={`ticket prom. ${formatPesos(kpiMes.ticket_prom)}`} href="/finanzas" tone="green" />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KPICompact label="Cobrado mes"   value={formatPesos(kpiMes.cobrado)}     tone="green" />
          <KPICompact label="Por cobrar"    value={formatPesos(kpiMes.por_cobrar)}  tone="amber" href="/finanzas" />
          <KPICompact label="Ticket prom."  value={formatPesos(kpiMes.ticket_prom)} tone="accent" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-app-accent" />
                <h2 className="font-display font-semibold">Últimas ventas</h2>
              </div>
              <Link href={DOMINIO.ventas.ruta} className="text-xs font-mono text-app-muted hover:text-app-accent">
                Ver todas →
              </Link>
            </div>
            {ventas.length === 0 ? (
              <p className="text-sm text-app-muted font-mono">Sin ventas todavía.</p>
            ) : (
              <ul className="space-y-1">
                {ventas.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`${DOMINIO.ventas.ruta}/${v.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-app-surface-mid/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-app-accent text-xs shrink-0">{v.id_publico}</span>
                        <span className="text-sm text-app-text truncate">
                          {v.cliente ? nombreVisible(v.cliente) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-app-secondary">{formatPesos(Number(v.total))}</span>
                        <Badge variant={ESTADO_COBRO_VARIANT[v.estado_cobro]}>{ESTADO_COBRO_LABEL[v.estado_cobro]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-app-accent" />
                <h2 className="font-display font-semibold">Top productos</h2>
              </div>
              <Link href={DOMINIO.productos.ruta} className="text-xs font-mono text-app-muted hover:text-app-accent">
                Ver todos →
              </Link>
            </div>
            {productos.filter((p) => p.unidades_vendidas > 0).length === 0 ? (
              <p className="text-sm text-app-muted font-mono">Sin ventas para rankear todavía.</p>
            ) : (
              <ul className="space-y-1">
                {productos.filter((p) => p.unidades_vendidas > 0).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`${DOMINIO.productos.ruta}/${p.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-app-surface-mid/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-app-accent text-xs shrink-0">{p.id_publico}</span>
                        <span className="text-sm text-app-text truncate">{p.nombre}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm">{formatPesos(Number(p.facturado))}</p>
                        <p className="text-[10.5px] font-mono text-app-muted">{p.unidades_vendidas} u.</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-app-accent" />
              <h2 className="font-display font-semibold">Vendedores · desempeño</h2>
            </div>
            <Link href="/comisiones" className="text-xs font-mono text-app-muted hover:text-app-accent">
              Ver liquidación →
            </Link>
          </div>
          {vendedores.filter((v) => v.ventas_count > 0).length === 0 ? (
            <p className="text-sm text-app-muted font-mono">Sin datos de ventas por vendedor.</p>
          ) : (
            <ul className="space-y-1">
              {vendedores.filter((v) => v.ventas_count > 0).map((v) => (
                <li key={v.vendedor_id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-app-text truncate">{v.vendedor_nombre}</span>
                  <div className="text-right shrink-0 flex items-center gap-4">
                    <div>
                      <p className="font-mono text-sm">{formatPesos(Number(v.facturado))}</p>
                      <p className="text-[10.5px] font-mono text-app-muted">{v.ventas_count} ventas</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-app-green">{formatPesos(Number(v.comisiones_generadas))}</p>
                      <p className="text-[10.5px] font-mono text-app-muted">comisión</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Vendedor ───────────────────────────────────────────────────────────────
async function PanelVendedor({ nombre, userId }: { nombre: string; userId: string }) {
  const supabase = await createServerClient()
  const ahora = ahoraArgentina()
  const hoyISO = toISODate(ahora)
  const semanaInicioISO = inicioSemanaISO(hoyISO)
  const mesInicioISO = inicioMesISO(hoyISO)
  const finHoyISO = toISODate(new Date(new Date(`${hoyISO}T12:00:00`).getTime() + 24 * 3600 * 1000))

  const [kpiHoyRes, kpiSemanaRes, kpiMesRes, misVentasRes, misComisionesRes] = await Promise.all([
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(hoyISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: userId }),
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(semanaInicioISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: userId }),
    supabase.rpc("kpi_ventas_periodo", { p_desde: tsArgentina(mesInicioISO), p_hasta: tsArgentina(finHoyISO), p_vendedor_id: userId }),
    supabase.from("v_ventas_lista")
      .select("id, id_publico, total, estado_cobro, estado_entrega, fecha, cliente:cliente_id ( nombre, apellido, razon_social, tipo )")
      .eq("vendedor_id", userId)
      .order("fecha", { ascending: false })
      .limit(5),
    supabase.from("v_comisiones_semana")
      .select("semana_inicio, ventas_count, total")
      .eq("vendedor_id", userId)
      .order("semana_inicio", { ascending: false })
      .limit(4),
  ])

  const kpiHoy    = pickKpi(kpiHoyRes.data)
  const kpiSemana = pickKpi(kpiSemanaRes.data)
  const kpiMes    = pickKpi(kpiMesRes.data)
  const misVentas = (misVentasRes.data ?? []) as unknown as UltimaVenta[]
  const misComisiones = (misComisionesRes.data ?? []) as { semana_inicio: string; ventas_count: number; total: number }[]

  const semanaActual = misComisiones.find((c) => c.semana_inicio === semanaInicioISO)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Panel · Vendedor
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Hola, {nombre}
          </h1>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido hoy"    value={formatPesos(kpiHoy.facturado)}    sub={`${kpiHoy.ventas_count} venta${kpiHoy.ventas_count === 1 ? "" : "s"}`}  href={DOMINIO.ventas.ruta} tone="green" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido semana" value={formatPesos(kpiSemana.facturado)} sub={`${kpiSemana.ventas_count} venta${kpiSemana.ventas_count === 1 ? "" : "s"}`} href={DOMINIO.ventas.ruta} tone="green" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Vendido mes"    value={formatPesos(kpiMes.facturado)}    sub={`ticket prom. ${formatPesos(kpiMes.ticket_prom)}`} href={DOMINIO.ventas.ruta} tone="green" />
        </section>

        <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Comisión esta semana</p>
              <p className="font-display text-3xl mt-1 text-app-green">
                {formatPesos(Number(semanaActual?.total ?? 0))}
              </p>
              <p className="text-xs font-mono text-app-muted mt-1">
                {semanaActual?.ventas_count ?? 0} venta{(semanaActual?.ventas_count ?? 0) === 1 ? "" : "s"} incluida{(semanaActual?.ventas_count ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <Link href="/comisiones" className="text-xs font-mono text-app-muted hover:text-app-accent">
              Ver historial →
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-app-accent" />
              <h2 className="font-display font-semibold">Mis últimas ventas</h2>
            </div>
            <Link href={DOMINIO.ventas.ruta} className="text-xs font-mono text-app-muted hover:text-app-accent">
              Ver todas →
            </Link>
          </div>
          {misVentas.length === 0 ? (
            <p className="text-sm text-app-muted font-mono">Todavía no cargaste ventas.</p>
          ) : (
            <ul className="space-y-1">
              {misVentas.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`${DOMINIO.ventas.ruta}/${v.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-app-surface-mid/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-app-accent text-xs shrink-0">{v.id_publico}</span>
                      <span className="text-sm text-app-text truncate">
                        {v.cliente ? nombreVisible(v.cliente) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs">{formatPesos(Number(v.total))}</span>
                      <Badge variant={ESTADO_ENTREGA_VARIANT[v.estado_entrega]}>{ESTADO_ENTREGA_LABEL[v.estado_entrega]}</Badge>
                      <Badge variant={ESTADO_COBRO_VARIANT[v.estado_cobro]}>{ESTADO_COBRO_LABEL[v.estado_cobro]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

type KpiRow = { ventas_count: number; facturado: number; cobrado: number; por_cobrar: number; ticket_prom: number }
function pickKpi(data: unknown): KpiRow {
  const arr = Array.isArray(data) ? data : (data ? [data] : [])
  const r = arr[0] as Partial<KpiRow> | undefined
  return {
    ventas_count: Number(r?.ventas_count ?? 0),
    facturado:    Number(r?.facturado ?? 0),
    cobrado:      Number(r?.cobrado ?? 0),
    por_cobrar:   Number(r?.por_cobrar ?? 0),
    ticket_prom:  Number(r?.ticket_prom ?? 0),
  }
}
type AlertasRow = { stock_bajo: number; saldos_pendientes: number; entregas_atrasadas: number }
function pickAlertas(data: unknown): AlertasRow {
  const arr = Array.isArray(data) ? data : (data ? [data] : [])
  const r = arr[0] as Partial<AlertasRow> | undefined
  return {
    stock_bajo:         Number(r?.stock_bajo ?? 0),
    saldos_pendientes:  Number(r?.saldos_pendientes ?? 0),
    entregas_atrasadas: Number(r?.entregas_atrasadas ?? 0),
  }
}

type UltimaVenta = {
  id: string
  id_publico: string
  total: number
  estado_cobro: EstadoCobro
  estado_entrega: EstadoEntrega
  fecha: string
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
}
type RankingProducto = { id: string; id_publico: string; nombre: string; unidades_vendidas: number; facturado: number }
type RankingVendedor = { vendedor_id: string; vendedor_nombre: string; ventas_count: number; facturado: number; comisiones_generadas: number }

function KPI({
  icon, label, value, sub, href, tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  href: string
  tone: "accent" | "green" | "amber"
}) {
  const toneClasses = { accent: "text-app-accent", green: "text-app-green", amber: "text-app-amber" }[tone]
  return (
    <Link
      href={href}
      className="group rounded-xl border border-app-line-soft bg-app-card p-5 hover:border-app-accent/40 transition-colors"
    >
      <div className={`flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest ${toneClasses}`}>
        {icon}
        {label}
      </div>
      <p className="font-display text-2xl mt-2">{value}</p>
      {sub && <p className="text-[10.5px] font-mono text-app-muted mt-1">{sub}</p>}
    </Link>
  )
}

function KPICompact({ label, value, tone, href }: { label: string; value: string; tone: "accent" | "green" | "amber"; href?: string }) {
  const toneClass = { accent: "text-app-accent", green: "text-app-green", amber: "text-app-amber" }[tone]
  const inner = (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-4">
      <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">{label}</p>
      <p className={`font-display text-xl mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner
}
