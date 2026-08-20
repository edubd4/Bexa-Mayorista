import Link from "next/link"
import { redirect } from "next/navigation"
import { Download, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ROL } from "@/lib/constants"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DOMINIO } from "@/lib/dominio"
import { formatFechaHora, formatPesos } from "@/lib/utils"
import {
  METODO_PAGO_LABEL,
  ORIGEN_MOV_CAJA_LABEL,
  TIPO_MOV_CAJA_LABEL,
  TIPO_MOV_CAJA_VARIANT,
} from "@/lib/caja-ui"
import type {
  MetodoPago,
  OrigenMovCaja,
  TipoMovCaja,
} from "@/lib/validators/caja"
import { ahoraArgentina, diaSiguienteISO, rangoMesActual, toISODate, tsArgentina } from "@/lib/fechas"
import { logPerfilError } from "@/lib/auth-guards"

type MovRow = {
  id: string
  id_publico: string
  tipo: TipoMovCaja
  origen: OrigenMovCaja
  monto: number
  metodo_pago: MetodoPago
  descripcion: string | null
  fecha: string
  venta:  { id: string; id_publico: string } | null
  compra: { id: string; id_publico: string } | null
  gasto:  { id: string; id_publico: string } | null
}

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

type PeriodoPreset = "hoy" | "ayer" | "semana" | "mes" | "todo" | "rango"

// Rango [desde, hastaExclusiva) en días argentinos. "todo" = sin filtro.
// Default HOY (pedido del cliente 2026-08-19): la caja es el ritual del
// cierre del día — el histórico completo queda a un click en "Todo".
function resolverPeriodo(sp: { periodo?: string; desde?: string; hasta?: string }): {
  preset: PeriodoPreset
  desde: string | null
  hastaExclusiva: string | null
  label: string
} {
  const hoy = toISODate(ahoraArgentina())
  const esISO = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  switch (sp.periodo) {
    case "todo":
      return { preset: "todo", desde: null, hastaExclusiva: null, label: "Histórico completo" }
    case "ayer": {
      const ayer = sumarDias(hoy, -1)
      return { preset: "ayer", desde: ayer, hastaExclusiva: hoy, label: `Ayer (${ayer})` }
    }
    case "semana":
      return { preset: "semana", desde: sumarDias(hoy, -6), hastaExclusiva: sumarDias(hoy, 1), label: "Últimos 7 días" }
    case "mes": {
      const r = rangoMesActual()
      return { preset: "mes", desde: r.desde, hastaExclusiva: r.hasta, label: "Mes actual" }
    }
    case "rango": {
      const desde = esISO(sp.desde) ? sp.desde! : hoy
      const hasta = esISO(sp.hasta) ? sp.hasta! : desde
      return { preset: "rango", desde, hastaExclusiva: diaSiguienteISO(hasta), label: `${desde} → ${hasta}` }
    }
    default:
      return { preset: "hoy", desde: hoy, hastaExclusiva: sumarDias(hoy, 1), label: `Hoy (${hoy})` }
  }
}

export default async function CajaPage({
  searchParams,
}: {
  searchParams: { tipo?: string; origen?: string; q?: string; periodo?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("CajaPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const q = (searchParams.q ?? "").trim()
  const periodo = resolverPeriodo(searchParams)

  const [saldoRes, movsQ, cierreQ, ventasQ] = await Promise.all([
    supabase.from("saldo_caja").select("saldo, total_ingresos, total_egresos").maybeSingle(),
    (async () => {
      let query = supabase
        .from("movimientos_caja")
        .select(`
          id, id_publico, tipo, origen, monto, metodo_pago, descripcion, fecha,
          venta:venta_id ( id, id_publico ),
          compra:compra_id ( id, id_publico ),
          gasto:gasto_id ( id, id_publico )
        `)
        .order("fecha", { ascending: false })
        .limit(200)
      if (periodo.desde) query = query.gte("fecha", tsArgentina(periodo.desde))
      if (periodo.hastaExclusiva) query = query.lt("fecha", tsArgentina(periodo.hastaExclusiva))
      if (searchParams.tipo === "INGRESO" || searchParams.tipo === "EGRESO") {
        query = query.eq("tipo", searchParams.tipo)
      }
      if (searchParams.origen && ["COBRO_VENTA","PAGO_COMPRA","GASTO","AJUSTE","APERTURA","OTRO"].includes(searchParams.origen)) {
        query = query.eq("origen", searchParams.origen)
      }
      if (q.length >= 2) {
        // Comas y paréntesis son sintaxis del parser de .or() de PostgREST:
        // interpolarlos crudos rompía la query y la caja se mostraba VACÍA en
        // silencio (review #6). Se reemplazan por espacio antes de interpolar.
        const qSafe = q.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim()
        if (qSafe.length >= 2) {
          query = query.or(`id_publico.ilike.%${qSafe}%,descripcion.ilike.%${qSafe}%`)
        }
      }
      return query
    })(),
    // Cierre del período: TODOS los movimientos del rango (sin los filtros de
    // arriba y sin el tope de 200 de la tabla) para que las sumas sean reales.
    // Con "todo" no se calcula — el cierre es de un período, no de la historia.
    (async () => {
      if (!periodo.desde || !periodo.hastaExclusiva) return { data: null }
      return supabase
        .from("movimientos_caja")
        .select("tipo, origen, monto, metodo_pago")
        .gte("fecha", tsArgentina(periodo.desde))
        .lt("fecha", tsArgentina(periodo.hastaExclusiva))
        .limit(5000)
    })(),
    // Lo VENDIDO del período (que no es lo cobrado: la venta a cuenta genera
    // deuda, no caja) + cuánto quedó a cuenta.
    (async () => {
      if (!periodo.desde || !periodo.hastaExclusiva) return { data: null }
      return supabase
        .from("ventas")
        .select("total, total_cobrado, estado_cobro")
        .gte("fecha", tsArgentina(periodo.desde))
        .lt("fecha", tsArgentina(periodo.hastaExclusiva))
        .neq("estado_cobro", "CANCELADA")
        .limit(2000)
    })(),
  ])

  const saldo = Number(saldoRes.data?.saldo ?? 0)
  const totalIngresos = Number(saldoRes.data?.total_ingresos ?? 0)
  const totalEgresos = Number(saldoRes.data?.total_egresos ?? 0)
  const rows = (movsQ.data ?? []) as unknown as MovRow[]
  const ent = DOMINIO.caja

  // ── Números del cierre ─────────────────────────────────────────────────────
  type MovCierre = { tipo: TipoMovCaja; origen: OrigenMovCaja; monto: number; metodo_pago: MetodoPago }
  const movsCierre = (cierreQ.data ?? []) as MovCierre[]
  const hayCierre = periodo.preset !== "todo"

  // Cobrado por método (solo COBRO_VENTA — la apertura o un ajuste no son ventas).
  const cobradoPorMetodo = new Map<MetodoPago, number>()
  for (const m of movsCierre) {
    if (m.tipo === "INGRESO" && m.origen === "COBRO_VENTA") {
      cobradoPorMetodo.set(m.metodo_pago, (cobradoPorMetodo.get(m.metodo_pago) ?? 0) + Number(m.monto))
    }
  }
  const cobradoTotal = Array.from(cobradoPorMetodo.values()).reduce((a, b) => a + b, 0)

  // Efectivo NETO del período: entradas menos salidas en efectivo. Es EL número
  // comparable contra el cajón — el saldo global mezcla todos los métodos.
  const efectivoNeto = movsCierre
    .filter((m) => m.metodo_pago === "EFECTIVO")
    .reduce((a, m) => a + (m.tipo === "INGRESO" ? Number(m.monto) : -Number(m.monto)), 0)

  // Egresos del período por origen (gastos, pagos a proveedor, ajustes).
  const egresosPorOrigen = new Map<OrigenMovCaja, number>()
  for (const m of movsCierre) {
    if (m.tipo === "EGRESO") {
      egresosPorOrigen.set(m.origen, (egresosPorOrigen.get(m.origen) ?? 0) + Number(m.monto))
    }
  }
  const ingresosPeriodo = movsCierre.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + Number(m.monto), 0)
  const egresosPeriodo  = movsCierre.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + Number(m.monto), 0)
  const netoPeriodo = ingresosPeriodo - egresosPeriodo

  type VentaCierre = { total: number; total_cobrado: number; estado_cobro: string }
  const ventasPeriodo = (ventasQ.data ?? []) as VentaCierre[]
  const vendidoPeriodo = ventasPeriodo.reduce((a, v) => a + Number(v.total), 0)
  const quedoACuenta = ventasPeriodo.reduce((a, v) => a + Math.max(0, Number(v.total) - Number(v.total_cobrado)), 0)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Plata · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              Movimientos append-only · corregí con un AJUSTE, nunca editando.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* El CSV del contador vivia en Contabilidad; la fusion (2026-08-19)
                lo trae aca, con el periodo elegido. El endpoint espera el
                "hasta" INCLUSIVO — se resta el dia de la cota exclusiva. */}
            {periodo.desde && periodo.hastaExclusiva && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/contabilidad/csv?desde=${periodo.desde}&hasta=${sumarDias(periodo.hastaExclusiva, -1)}`}>
                  <Download className="w-4 h-4" />
                  CSV del período
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`${DOMINIO.gastos.ruta}/nuevo`}>+ Gasto</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`${ent.ruta}/nuevo`}>+ Movimiento manual</Link>
            </Button>
          </div>
        </header>

        <AyudaPantalla
          que="El dinero que entra y sale, movimiento por movimiento. El saldo que ves acá es lo que el sistema dice que tenés."
          cuando="Al cerrar el día, para comparar este saldo contra la plata que tenés físicamente en la caja."
          ojo="Los movimientos de caja no se editan ni se borran nunca. Si algo quedó mal cargado, se corrige con otro movimiento que lo compense, y así queda explicado en el historial."
          seccion="caja-y-gastos"
        />

        {/* Barra de período (2026-08-19): la caja arranca en HOY — el ritual
            del cierre. "Todo" muestra el histórico como antes. */}
        <div className="flex flex-wrap items-center gap-2">
          {([["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "7 días"], ["mes", "Mes"], ["todo", "Todo"]] as const).map(([valor, etiqueta]) => (
            <Link
              key={valor}
              href={valor === "hoy" ? ent.ruta : `${ent.ruta}?periodo=${valor}`}
              className={`h-9 inline-flex items-center rounded-md border px-3 text-sm font-mono transition-colors ${
                periodo.preset === valor
                  ? "border-app-accent/60 bg-app-accent/10 text-app-accent"
                  : "border-app-line text-app-secondary hover:text-app-accent hover:border-app-accent/40"
              }`}
            >
              {etiqueta}
            </Link>
          ))}
          <form action={ent.ruta} method="get" className="flex items-center gap-2 ml-1">
            <input type="hidden" name="periodo" value="rango" />
            <input type="date" name="desde" defaultValue={periodo.preset === "rango" ? periodo.desde ?? "" : ""} aria-label="Desde"
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text" />
            <input type="date" name="hasta" defaultValue={periodo.preset === "rango" ? searchParams.hasta ?? "" : ""} aria-label="Hasta"
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text" />
            <Button type="submit" variant="outline" size="sm">Ver rango</Button>
          </form>
        </div>

        {/* Cierre del período: la respuesta a "como cierro el dia" en una sola
            pantalla — vendido, entrado por método, salido, y el efectivo que
            tiene que haber en el cajón. El saldo acumulado va aparte para que
            nadie compare el cajón contra un número que mezcla métodos. */}
        {hayCierre && (
          <section className="rounded-xl border border-app-accent/30 bg-app-card overflow-hidden">
            <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
              <h2 className="font-display font-semibold">Cierre · {periodo.label}</h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Neto del período {netoPeriodo >= 0 ? "+" : "-"}{formatPesos(Math.abs(netoPeriodo))}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:divide-x divide-app-line-soft">
              {/* Columna 1: lo vendido y lo que quedó a cuenta */}
              <div className="p-5 space-y-2">
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Ventas</p>
                <Linea label="Vendido" valor={formatPesos(vendidoPeriodo)} />
                <Linea label="Cobrado (ventas)" valor={formatPesos(cobradoTotal)} tone="green" />
                <Linea label="Quedó a cuenta" valor={formatPesos(quedoACuenta)} tone={quedoACuenta > 0 ? "amber" : undefined} />
              </div>
              {/* Columna 2: entró, por método — el desglose que faltaba */}
              <div className="p-5 space-y-2">
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Entró · por método</p>
                {cobradoPorMetodo.size === 0 ? (
                  <p className="text-sm text-app-muted">Sin cobros en el período.</p>
                ) : (
                  Array.from(cobradoPorMetodo.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, monto]) => (
                      <Linea key={m} label={METODO_PAGO_LABEL[m]} valor={formatPesos(monto)} tone="green" />
                    ))
                )}
                <div className="pt-2 mt-2 border-t border-app-line-soft">
                  <Linea
                    label="Efectivo neto (contra el cajón)"
                    valor={formatPesos(efectivoNeto)}
                    tone="accent"
                    destacada
                  />
                </div>
              </div>
              {/* Columna 3: salió, por origen */}
              <div className="p-5 space-y-2">
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Salió</p>
                {egresosPorOrigen.size === 0 ? (
                  <p className="text-sm text-app-muted">Sin egresos en el período.</p>
                ) : (
                  Array.from(egresosPorOrigen.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([o, monto]) => (
                      <Linea key={o} label={ORIGEN_MOV_CAJA_LABEL[o]} valor={`-${formatPesos(monto)}`} tone="red" />
                    ))
                )}
                <div className="pt-2 mt-2 border-t border-app-line-soft">
                  <Linea label="Total egresos" valor={`-${formatPesos(egresosPeriodo)}`} tone="red" destacada />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Saldo acumulado de toda la vida — separado del cierre a propósito. */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KPI icon={<Wallet className="w-4 h-4" />} label="Saldo acumulado" value={formatPesos(saldo)} tone="accent" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Ingresos históricos" value={formatPesos(totalIngresos)} tone="green" />
          <KPI icon={<TrendingDown className="w-4 h-4" />} label="Egresos históricos" value={formatPesos(totalEgresos)} tone="red" />
        </section>

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          {/* Mantener el período elegido al filtrar por tipo/origen/texto */}
          {periodo.preset !== "hoy" && <input type="hidden" name="periodo" value={periodo.preset} />}
          {periodo.preset === "rango" && periodo.desde && (
            <input type="hidden" name="desde" value={periodo.desde} />
          )}
          {periodo.preset === "rango" && searchParams.hasta && (
            <input type="hidden" name="hasta" value={searchParams.hasta} />
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID o descripción"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="tipo"
            defaultValue={searchParams.tipo ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo tipo</option>
            <option value="INGRESO">Ingresos</option>
            <option value="EGRESO">Egresos</option>
          </select>
          <select
            name="origen"
            defaultValue={searchParams.origen ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo origen</option>
            <option value="COBRO_VENTA">Cobros de venta</option>
            <option value="GASTO">Gastos</option>
            <option value="PAGO_COMPRA">Pagos a proveedor</option>
            <option value="AJUSTE">Ajustes</option>
            <option value="APERTURA">Apertura</option>
            <option value="OTRO">Otro</option>
          </select>
          <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        </form>

        {/* Tabla */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="hidden lg:table-cell">Método</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  Sin movimientos con esos filtros. La plata entra a la caja
                  cuando cobrás una venta, y sale cuando cargás un gasto.
                </TableEmpty>
              ) : (
                rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-app-accent text-xs">{m.id_publico}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFechaHora(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{m.descripcion ?? "—"}</p>
                      {m.venta && (
                        <Link href={`${DOMINIO.ventas.ruta}/${m.venta.id}`} className="text-[10.5px] font-mono text-app-muted hover:text-app-accent">
                          → {m.venta.id_publico}
                        </Link>
                      )}
                      {m.compra && (
                        <Link href={`${DOMINIO.compras.ruta}/${m.compra.id}`} className="text-[10.5px] font-mono text-app-muted hover:text-app-accent">
                          → {m.compra.id_publico}
                        </Link>
                      )}
                      {m.gasto && (
                        <Link href={`${DOMINIO.gastos.ruta}/${m.gasto.id}`} className="text-[10.5px] font-mono text-app-muted hover:text-app-accent">
                          → {m.gasto.id_publico}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      {METODO_PAGO_LABEL[m.metodo_pago]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TIPO_MOV_CAJA_VARIANT[m.tipo]}>
                        {TIPO_MOV_CAJA_LABEL[m.tipo]}
                      </Badge>
                      <p className="text-[10.5px] font-mono text-app-muted mt-0.5">
                        {ORIGEN_MOV_CAJA_LABEL[m.origen]}
                      </p>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${m.tipo === "INGRESO" ? "text-app-green" : "text-app-red"}`}>
                      {m.tipo === "INGRESO" ? "+" : "−"}{formatPesos(Number(m.monto))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"} · Los movimientos son inmutables — para corregir, registrá un AJUSTE.
        </p>
      </div>
    </div>
  )
}

function Linea({ label, valor, tone, destacada }: {
  label: string
  valor: string
  tone?: "green" | "red" | "amber" | "accent"
  destacada?: boolean
}) {
  const toneClass =
    tone === "green" ? "text-app-green"
    : tone === "red" ? "text-app-red"
    : tone === "amber" ? "text-app-amber"
    : tone === "accent" ? "text-app-accent"
    : "text-app-text"
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${destacada ? "font-semibold text-app-text" : "text-app-secondary"}`}>{label}</span>
      <span className={`font-mono ${destacada ? "text-base font-semibold" : "text-sm"} ${toneClass}`}>{valor}</span>
    </div>
  )
}

function KPI({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: "accent" | "green" | "red"
}) {
  const toneClasses = {
    accent: "text-app-accent",
    green:  "text-app-green",
    red:    "text-app-red",
  }[tone]
  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
      <div className={`flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest ${toneClasses}`}>
        {icon}
        {label}
      </div>
      <p className="font-display text-2xl mt-2">{value}</p>
    </div>
  )
}
