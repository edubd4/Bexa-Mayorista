import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, Package, TrendingDown, Clock } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import { ESTADO_COBRO_LABEL, ESTADO_COBRO_VARIANT, ESTADO_ENTREGA_LABEL, ESTADO_ENTREGA_VARIANT } from "@/lib/ventas-ui"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import type { EstadoCobro, EstadoEntrega } from "@/lib/validators/venta"

export default async function AlertasPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("rol, activo").eq("id", user.id).single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const [{ data: cfgRow }, { data: stockBajo }, { data: saldosPendientes }, { data: entregasAtrasadas }] = await Promise.all([
    supabase.from("configuracion").select("valor").eq("clave", "alerta_saldo_vencido_dias").maybeSingle(),
    supabase.from("v_stock_bajo").select("id, id_publico, nombre, marca, stock_actual, stock_minimo, faltante").order("faltante", { ascending: false }),
    supabase.from("v_ventas_con_saldo").select("id, id_publico, fecha, cliente_id, total, saldo, dias_desde_venta, estado_cobro, cliente:cliente_id ( nombre, apellido, razon_social, tipo )").order("dias_desde_venta", { ascending: false }),
    supabase.from("ventas").select("id, id_publico, fecha, estado_entrega, estado_cobro, total, cliente:cliente_id ( nombre, apellido, razon_social, tipo )").in("estado_entrega", ["PEDIDO", "EN_PREPARACION"]).lt("fecha", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()).order("fecha", { ascending: true }),
  ])

  const diasVencido = Number(cfgRow?.valor ?? 30)
  const stock = (stockBajo ?? []) as StockRow[]
  const saldos = ((saldosPendientes ?? []) as unknown as SaldoRow[]).filter((s) => s.dias_desde_venta > diasVencido)
  const entregas = (entregasAtrasadas ?? []) as unknown as EntregaRow[]
  const total = stock.length + saldos.length + entregas.length

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Análisis · Alertas
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {total > 0 ? `${total} alerta${total === 1 ? "" : "s"} activa${total === 1 ? "" : "s"}` : "Sin alertas activas"}
          </h1>
          <p className="text-app-secondary mt-1">
            Stock bajo, saldos con demora y entregas atrasadas. Configurables en{" "}
            <Link href="/configuracion" className="underline hover:text-app-accent">Configuración</Link>.
          </p>
        </header>

        {/* Stock bajo */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center gap-2">
            <Package className="w-4 h-4 text-app-amber" />
            <h2 className="font-display font-semibold">Stock bajo · {stock.length}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden md:table-cell">Marca</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Faltante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 ? (
                <TableEmpty colSpan={6}>Ningún producto por debajo del stock mínimo.</TableEmpty>
              ) : stock.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-app-accent text-xs">
                    <Link href={`${DOMINIO.productos.ruta}/${p.id}`} className="hover:underline">{p.id_publico}</Link>
                  </TableCell>
                  <TableCell>{p.nombre}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-app-secondary">{p.marca ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-amber">{p.stock_actual}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-muted">{p.stock_minimo}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-red">{p.faltante}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* Saldos vencidos */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-app-red" />
            <h2 className="font-display font-semibold">Saldos con más de {diasVencido} días · {saldos.length}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="hidden md:table-cell">Cobro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saldos.length === 0 ? (
                <TableEmpty colSpan={7}>Sin saldos vencidos.</TableEmpty>
              ) : saldos.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-app-accent text-xs">
                    <Link href={`${DOMINIO.ventas.ruta}/${v.id}`} className="hover:underline">{v.id_publico}</Link>
                  </TableCell>
                  <TableCell>{v.cliente ? nombreVisible(v.cliente) : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-app-secondary">{formatFecha(v.fecha)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPesos(Number(v.total))}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-amber">{formatPesos(Number(v.saldo))}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{v.dias_desde_venta}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={ESTADO_COBRO_VARIANT[v.estado_cobro]}>{ESTADO_COBRO_LABEL[v.estado_cobro]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* Entregas atrasadas */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center gap-2">
            <Clock className="w-4 h-4 text-app-amber" />
            <h2 className="font-display font-semibold">Pedidos con más de 7 días sin entregar · {entregas.length}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entregas.length === 0 ? (
                <TableEmpty colSpan={5}>Sin entregas atrasadas.</TableEmpty>
              ) : entregas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-app-accent text-xs">
                    <Link href={`${DOMINIO.ventas.ruta}/${v.id}`} className="hover:underline">{v.id_publico}</Link>
                  </TableCell>
                  <TableCell>{v.cliente ? nombreVisible(v.cliente) : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-app-secondary">{formatFecha(v.fecha)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPesos(Number(v.total))}</TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_ENTREGA_VARIANT[v.estado_entrega]}>{ESTADO_ENTREGA_LABEL[v.estado_entrega]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {total === 0 && (
          <div className="rounded-xl border border-app-green/40 bg-app-green/10 px-5 py-8 text-center">
            <AlertTriangle className="w-6 h-6 text-app-green mx-auto opacity-40" />
            <p className="font-display font-semibold text-app-green mt-2">Todo en orden.</p>
            <p className="text-xs text-app-secondary mt-1">Sin alertas activas.</p>
          </div>
        )}
      </div>
    </div>
  )
}

type StockRow = { id: string; id_publico: string; nombre: string; marca: string | null; stock_actual: number; stock_minimo: number; faltante: number }
type SaldoRow = {
  id: string; id_publico: string; fecha: string; cliente_id: string;
  total: number; saldo: number; dias_desde_venta: number; estado_cobro: EstadoCobro;
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
}
type EntregaRow = {
  id: string; id_publico: string; fecha: string;
  estado_entrega: EstadoEntrega; estado_cobro: EstadoCobro; total: number;
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
}
