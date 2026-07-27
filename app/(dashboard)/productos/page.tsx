import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Search, AlertTriangle } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
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
import { puedeCargarProductos } from "@/lib/permisos"
import { formatPesos } from "@/lib/utils"

type ProductoRow = {
  id: string
  id_publico: string
  sku: string | null
  nombre: string
  categoria: string | null
  marca: string | null
  precio_base: number
  costo?: number     // solo llega si el usuario es admin
  stock_actual: number
  stock_minimo: number
  activo: boolean
  proveedor: { id: string; nombre: string } | null
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string; categoria?: string; stock?: string; proveedor?: string }
}) {
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
  // El vendedor también da de alta productos (0017), pero sigue sin ver costos.
  const puedeCargar = puedeCargarProductos(profile.rol)

  // Matriz de columnas: vendedor lee la vista SIN costo. Defensa en profundidad:
  // aunque la RLS de `productos` es admin-only, el fetch va a la vista para vendedor.
  const table = esAdmin ? "productos" : "productos_catalogo"
  const columns = esAdmin
    ? "id, id_publico, sku, nombre, categoria, marca, costo, precio_base, stock_actual, stock_minimo, activo, proveedor:proveedor_id (id, nombre)"
    : "id, id_publico, sku, nombre, categoria, marca, precio_base, stock_actual, stock_minimo, activo, proveedor:proveedor_id (id, nombre)"

  const q = (searchParams.q ?? "").trim()
  const estadoFilter = searchParams.estado === "inactivos" ? false
                     : searchParams.estado === "todos"     ? null
                     : true
  const stockFilter = searchParams.stock === "bajo"

  let query = supabase
    .from(table)
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(300)

  if (estadoFilter !== null) query = query.eq("activo", estadoFilter)
  if (searchParams.categoria && searchParams.categoria !== "") {
    query = query.eq("categoria", searchParams.categoria)
  }
  if (searchParams.proveedor && searchParams.proveedor !== "") {
    query = query.eq("proveedor_id", searchParams.proveedor)
  }
  if (q.length >= 2) {
    const like = `%${q.replace(/[,()]/g, " ")}%`
    query = query.or(
      [
        `id_publico.ilike.${like}`,
        `sku.ilike.${like}`,
        `nombre.ilike.${like}`,
        `marca.ilike.${like}`,
        `descripcion.ilike.${like}`,
      ].join(","),
    )
  }

  const [{ data }, { data: proveedoresData }] = await Promise.all([
    query,
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ])
  let productos = ((data ?? []) as unknown as ProductoRow[])
  const proveedores = proveedoresData ?? []

  // Filtro de stock bajo se hace en JS (no podemos comparar dos columnas en supabase-js).
  if (stockFilter) {
    productos = productos.filter(
      (p) => p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo,
    )
  }

  // Categorías distintas (para el filtro dropdown). Usamos la lista actual como base.
  const categorias = Array.from(
    new Set(productos.map((p) => p.categoria).filter(Boolean) as string[]),
  ).sort()

  const ent = DOMINIO.productos

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Módulo · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              Catálogo, precios y stock. {esAdmin ? "Ves costos y comisiones." : "Los costos y comisiones son solo para admin."}
            </p>
          </div>
          {puedeCargar && (
            <Button asChild>
              <Link href={`${ent.ruta}/nuevo`}>
                <Plus className="w-4 h-4" />
                {nuevoLabel(ent)}
              </Link>
            </Button>
          )}
        </header>

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID, SKU, nombre o marca…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="categoria"
            defaultValue={searchParams.categoria ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            name="proveedor"
            defaultValue={searchParams.proveedor ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select
            name="stock"
            defaultValue={searchParams.stock ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todo stock</option>
            <option value="bajo">Solo stock bajo</option>
          </select>
          <select
            name="estado"
            defaultValue={searchParams.estado ?? "activos"}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="todos">Todos</option>
          </select>
          <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        </form>

        {/* Tabla */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Marca</TableHead>
                <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                <TableHead className="hidden xl:table-cell">Proveedor</TableHead>
                {esAdmin && <TableHead className="hidden md:table-cell text-right">Costo</TableHead>}
                <TableHead className="text-right">Precio base</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.length === 0 ? (
                <TableEmpty colSpan={esAdmin ? 9 : 8}>
                  {q.length >= 2 || stockFilter || searchParams.categoria || searchParams.proveedor
                    ? "Sin resultados para los filtros aplicados."
                    : "Todavía no cargaste productos."}
                </TableEmpty>
              ) : (
                productos.map((p) => {
                  const stockBajo = p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo
                  return (
                    <LinkRow key={p.id} href={`${ent.ruta}/${p.id}`}>
                      <TableCell className="font-mono text-app-accent text-xs">
                        {p.id_publico}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.nombre}
                        {p.sku && (
                          <span className="ml-2 font-mono text-[10.5px] text-app-muted">
                            {p.sku}
                          </span>
                        )}
                        {Number(p.precio_base) === 0 && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] text-app-amber"
                            title="Cargado rápido desde una compra — falta completar el precio de venta"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            incompleto
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                        {p.marca ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                        {p.categoria ?? "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-app-secondary">
                        {p.proveedor?.nombre ?? "—"}
                      </TableCell>
                      {esAdmin && (
                        <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                          {formatPesos(Number(p.costo ?? 0))}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono text-sm">
                        {formatPesos(Number(p.precio_base))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={stockBajo ? "text-app-amber" : ""}>
                          {p.stock_actual}
                          {stockBajo && <AlertTriangle className="inline-block w-3 h-3 ml-1" />}
                        </span>
                        {p.stock_minimo > 0 && (
                          <span className="text-app-muted"> /{p.stock_minimo}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.activo ? "green" : "gray"}>
                          {p.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                    </LinkRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {productos.length} {productos.length === 1 ? "producto" : "productos"}
        </p>
      </div>
    </div>
  )
}
