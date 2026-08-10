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
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
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
  cliente: { nombre: string; apellido: string | null; razon_social: string | null; tipo: TipoCliente } | null
  vendedor: { nombre: string } | null
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { q?: string; cobro?: string; entrega?: string }
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
  const q = (searchParams.q ?? "").trim()
  if (q.length >= 2) {
    query = query.ilike("id_publico", `%${q}%`)
  }

  const { data } = await query
  const rows = (data ?? []) as unknown as VentaRow[]
  const ent = DOMINIO.ventas

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

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
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
          <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        </form>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={esAdmin ? 8 : 7}>
                  {q.length >= 2 || searchParams.cobro || searchParams.entrega
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
