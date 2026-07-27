import Link from "next/link"
import { redirect } from "next/navigation"
import { Search, TrendingDown, TrendingUp, Wallet } from "lucide-react"
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

export default async function CajaPage({
  searchParams,
}: {
  searchParams: { tipo?: string; origen?: string; q?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const q = (searchParams.q ?? "").trim()

  const [saldoRes, movsQ] = await Promise.all([
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
      if (searchParams.tipo === "INGRESO" || searchParams.tipo === "EGRESO") {
        query = query.eq("tipo", searchParams.tipo)
      }
      if (searchParams.origen && ["COBRO_VENTA","PAGO_COMPRA","GASTO","AJUSTE","APERTURA","OTRO"].includes(searchParams.origen)) {
        query = query.eq("origen", searchParams.origen)
      }
      if (q.length >= 2) {
        query = query.or(`id_publico.ilike.%${q}%,descripcion.ilike.%${q}%`)
      }
      return query
    })(),
  ])

  const saldo = Number(saldoRes.data?.saldo ?? 0)
  const totalIngresos = Number(saldoRes.data?.total_ingresos ?? 0)
  const totalEgresos = Number(saldoRes.data?.total_egresos ?? 0)
  const rows = (movsQ.data ?? []) as unknown as MovRow[]
  const ent = DOMINIO.caja

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

        {/* KPIs de caja */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KPI icon={<Wallet className="w-4 h-4" />} label="Saldo actual" value={formatPesos(saldo)} tone="accent" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Ingresos" value={formatPesos(totalIngresos)} tone="green" />
          <KPI icon={<TrendingDown className="w-4 h-4" />} label="Egresos" value={formatPesos(totalEgresos)} tone="red" />
        </section>

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
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
