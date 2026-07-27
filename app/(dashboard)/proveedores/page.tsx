import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LinkRow } from "@/components/ui/link-row"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"

// Módulo Proveedores — lista. Admin-only en escritura; lectura para authenticated
// (los productos hacen JOIN a proveedor para mostrar quién lo suministra).
export default async function ProveedoresPage({
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
  if (!profile?.activo) redirect("/login")
  if (profile.rol === ROL.MARKETING) redirect("/panel")

  const esAdmin = profile.rol === ROL.ADMIN

  const q = (searchParams.q ?? "").trim()
  const estadoFilter = searchParams.estado === "inactivos" ? false
                     : searchParams.estado === "todos"     ? null
                     : true   // default: solo activos

  let query = supabase
    .from("proveedores")
    .select("id, id_publico, nombre, cuit, contacto_nombre, telefono, ciudad, activo")
    .order("created_at", { ascending: false })
    .limit(200)

  if (estadoFilter !== null) query = query.eq("activo", estadoFilter)
  if (q.length >= 2) {
    const like = `%${q.replace(/[,()]/g, " ")}%`
    query = query.or(
      [
        `id_publico.ilike.${like}`,
        `nombre.ilike.${like}`,
        `cuit.ilike.${like}`,
        `telefono.ilike.${like}`,
      ].join(","),
    )
  }

  const { data: proveedores } = await query
  const total = proveedores?.length ?? 0

  const ent = DOMINIO.proveedores

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
              A quién le compramos. Los productos referencian su proveedor para reponer.
            </p>
          </div>
          {esAdmin && (
            <Button asChild>
              <Link href={`${ent.ruta}/nuevo`}>
                <Plus className="w-4 h-4" />
                {nuevoLabel(ent)}
              </Link>
            </Button>
          )}
        </header>

        <AyudaPantalla
          que="A quién le comprás. Guarda el contacto, las condiciones de pago y te deja ver todo lo que le compraste a cada uno."
          cuando="Antes de cargar la primera compra de un proveedor nuevo, y cuando necesitás su teléfono para hacer un pedido."
          seccion="cargar-compra"
        />

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID, nombre, CUIT o teléfono…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
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
                <TableHead className="hidden md:table-cell">CUIT</TableHead>
                <TableHead className="hidden md:table-cell">Contacto</TableHead>
                <TableHead className="hidden lg:table-cell">Ciudad</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {total === 0 ? (
                <TableEmpty colSpan={6}>
                  {q.length >= 2
                    ? `Sin resultados para "${q}".`
                    : "Todavía no cargaste proveedores."}
                </TableEmpty>
              ) : (
                proveedores!.map((p) => (
                  <LinkRow key={p.id} href={`${ent.ruta}/${p.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">
                      {p.id_publico}
                    </TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-app-secondary">
                      {p.cuit ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {[p.contacto_nombre, p.telefono].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      {p.ciudad ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.activo ? "green" : "gray"}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {total} {total === 1 ? "proveedor" : "proveedores"}
        </p>
      </div>
    </div>
  )
}
