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
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import { ESTADO_COMPRA_LABEL, ESTADO_COMPRA_VARIANT } from "@/lib/compras-ui"
import type { EstadoCompra } from "@/lib/validators/compra"

type CompraRow = {
  id: string
  id_publico: string
  fecha: string
  estado: EstadoCompra
  total: number
  numero_factura: string | null
  proveedor: { id: string; id_publico: string; nombre: string } | null
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string }
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

  let query = supabase
    .from("compras")
    .select(`
      id, id_publico, fecha, estado, total, numero_factura,
      proveedor:proveedor_id ( id, id_publico, nombre )
    `)
    .order("fecha", { ascending: false })
    .limit(200)

  if (searchParams.estado && ["RECIBIDA", "PENDIENTE", "CANCELADA"].includes(searchParams.estado)) {
    query = query.eq("estado", searchParams.estado)
  }
  if (q.length >= 2) {
    query = query.or(`id_publico.ilike.%${q}%,numero_factura.ilike.%${q}%`)
  }

  const { data } = await query
  const rows = (data ?? []) as unknown as CompraRow[]
  const ent = DOMINIO.compras

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
              Reposición de stock. Cada compra sube el stock y actualiza el costo del producto.
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
          que="Lo que le comprás a tus proveedores para reponer. Al registrar una compra, el stock sube solo y el costo de cada producto se actualiza con lo que acabás de pagar."
          cuando="Cuando te llega mercadería de un proveedor. Registrala con la factura en la mano, así los costos quedan al día."
          ojo="La compra PISA el costo del producto con el costo de esta compra — no calcula un promedio. Si compraste diez unidades más caras, la ganancia de todo tu stock viejo se recalcula con ese costo nuevo."
          seccion="cargar-compra"
        />

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID o número de factura"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="estado"
            defaultValue={searchParams.estado ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo estado</option>
            <option value="RECIBIDA">Recibida</option>
            <option value="PENDIENTE">Pendiente</option>
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
                <TableHead>Proveedor</TableHead>
                <TableHead className="hidden lg:table-cell">Factura</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  Todavía no cargaste compras. Registrá una cuando te llegue
                  mercadería: sube el stock y actualiza el costo de cada producto.
                </TableEmpty>
              ) : (
                rows.map((c) => (
                  <LinkRow key={c.id} href={`${ent.ruta}/${c.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">{c.id_publico}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(c.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {c.proveedor?.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-app-secondary">
                      {c.numero_factura ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(c.total))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_COMPRA_VARIANT[c.estado]}>
                        {ESTADO_COMPRA_LABEL[c.estado]}
                      </Badge>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "compra" : "compras"}
        </p>
      </div>
    </div>
  )
}
