import Link from "next/link"
import { redirect } from "next/navigation"
import { TrendingUp, TrendingDown, Wallet } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import { ESTADO_COBRO_LABEL, ESTADO_COBRO_VARIANT } from "@/lib/ventas-ui"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import type { EstadoCobro } from "@/lib/validators/venta"
import { logPerfilError } from "@/lib/auth-guards"

export default async function FinanzasPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile, error: perfilError } = await supabase.from("profiles").select("rol, activo").eq("id", user.id).single()
  logPerfilError("FinanzasPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const [saldoRes, porCobrarRes, gananciaRes] = await Promise.all([
    supabase.from("saldo_caja").select("saldo, total_ingresos, total_egresos").maybeSingle(),
    supabase.from("v_ventas_con_saldo")
      .select("id, id_publico, fecha, total, total_cobrado, saldo, dias_desde_venta, estado_cobro, cliente:cliente_id ( nombre, apellido, razon_social, tipo )")
      .order("saldo", { ascending: false })
      .limit(100),
    supabase.from("v_ventas_ganancia")
      .select("id, id_publico, fecha, total, costo_total, ganancia")
      .gt("ganancia", 0)
      .order("ganancia", { ascending: false })
      .limit(50),
  ])

  const saldo = Number(saldoRes.data?.saldo ?? 0)
  const totalIngresos = Number(saldoRes.data?.total_ingresos ?? 0)
  const totalEgresos = Number(saldoRes.data?.total_egresos ?? 0)
  const porCobrar = (porCobrarRes.data ?? []) as unknown as PorCobrarRow[]
  const ganancias = (gananciaRes.data ?? []) as GananciaRow[]

  const totalPorCobrar = porCobrar.reduce((s, r) => s + Number(r.saldo), 0)
  const totalFacturadoConGanancia = ganancias.reduce((s, r) => s + Number(r.total), 0)
  const totalGanancia = ganancias.reduce((s, r) => s + Number(r.ganancia), 0)
  const margenPct = totalFacturadoConGanancia > 0 ? (totalGanancia / totalFacturadoConGanancia) * 100 : 0

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Plata · Finanzas
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Finanzas</h1>
          <p className="text-app-secondary mt-1">
            Por cobrar y ganancia real por venta (total − costo snapshot).
          </p>
        </header>

        <AyudaPantalla
          que="La foto de la plata: qué te deben, qué ya cobraste y cuánta ganancia real dejó cada venta después de descontar los costos."
          cuando="Una vez por semana, para ver quién te debe hace mucho y salir a cobrar antes de que se haga viejo."
          ojo="La ganancia que ves acá depende de que los costos de los productos estén bien cargados. Un producto con costo en cero se muestra como ganancia pura, y es mentira."
        />

        {/* KPIs de tesorería */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI icon={<Wallet className="w-4 h-4" />} label="Saldo caja" value={formatPesos(saldo)} tone="accent" />
          <KPI icon={<TrendingUp className="w-4 h-4" />} label="Ingresos totales" value={formatPesos(totalIngresos)} tone="green" />
          <KPI icon={<TrendingDown className="w-4 h-4" />} label="Egresos totales" value={formatPesos(totalEgresos)} tone="red" />
          <KPI label="Por cobrar" value={formatPesos(totalPorCobrar)} tone="amber" sub={`${porCobrar.length} venta${porCobrar.length === 1 ? "" : "s"}`} />
        </section>

        {/* Por cobrar */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
            <h2 className="font-display font-semibold">Por cobrar · {porCobrar.length}</h2>
            <Link href={DOMINIO.ventas.ruta} className="text-xs font-mono text-app-muted hover:text-app-accent">Ir a ventas →</Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">Cobrado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Días</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porCobrar.length === 0 ? (
                <TableEmpty colSpan={8}>Todo cobrado. 🎉</TableEmpty>
              ) : porCobrar.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-app-accent text-xs">
                    <Link href={`${DOMINIO.ventas.ruta}/${v.id}`} className="hover:underline">{v.id_publico}</Link>
                  </TableCell>
                  <TableCell>{v.cliente ? nombreVisible(v.cliente) : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-app-secondary">{formatFecha(v.fecha)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPesos(Number(v.total))}</TableCell>
                  <TableCell className="text-right font-mono text-sm hidden md:table-cell text-app-green">{formatPesos(Number(v.total_cobrado))}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-amber">{formatPesos(Number(v.saldo))}</TableCell>
                  <TableCell className="text-right font-mono text-sm hidden lg:table-cell">{v.dias_desde_venta}</TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_COBRO_VARIANT[v.estado_cobro]}>{ESTADO_COBRO_LABEL[v.estado_cobro]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* Ganancia real */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Ganancia real · top 50 ventas</h2>
              <p className="text-[11px] font-mono text-app-muted mt-0.5">
                Total ganancia {formatPesos(totalGanancia)} sobre {formatPesos(totalFacturadoConGanancia)} facturado ({margenPct.toFixed(1)}% margen)
              </p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">Costo</TableHead>
                <TableHead className="text-right">Ganancia</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ganancias.length === 0 ? (
                <TableEmpty colSpan={6}>
                  Sin ventas para calcular ganancia. La ganancia es el total de
                  la venta menos el costo de los productos, así que necesita que
                  los productos tengan el costo cargado.
                </TableEmpty>
              ) : ganancias.map((g) => {
                const margen = Number(g.total) > 0 ? (Number(g.ganancia) / Number(g.total)) * 100 : 0
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-app-accent text-xs">
                      <Link href={`${DOMINIO.ventas.ruta}/${g.id}`} className="hover:underline">{g.id_publico}</Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">{formatFecha(g.fecha)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPesos(Number(g.total))}</TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell text-app-red">{formatPesos(Number(g.costo_total))}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-app-green">{formatPesos(Number(g.ganancia))}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{margen.toFixed(1)}%</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  )
}

type PorCobrarRow = {
  id: string; id_publico: string; fecha: string; total: number; total_cobrado: number;
  saldo: number; dias_desde_venta: number; estado_cobro: EstadoCobro;
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
}
type GananciaRow = { id: string; id_publico: string; fecha: string; total: number; costo_total: number; ganancia: number }

function KPI({ icon, label, value, sub, tone }: { icon?: React.ReactNode; label: string; value: string; sub?: string; tone: "accent" | "green" | "red" | "amber" }) {
  const toneClass = { accent: "text-app-accent", green: "text-app-green", red: "text-app-red", amber: "text-app-amber" }[tone]
  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
      <div className={`flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest ${toneClass}`}>
        {icon}
        {label}
      </div>
      <p className="font-display text-2xl mt-2">{value}</p>
      {sub && <p className="text-[10.5px] font-mono text-app-muted mt-1">{sub}</p>}
    </div>
  )
}
