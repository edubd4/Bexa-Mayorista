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
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { puedeCargarClientes } from "@/lib/permisos"
import { TIPO_CLIENTE_LABEL, TIPO_CLIENTE_VARIANT } from "@/lib/clientes-ui"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"

type ClienteRow = {
  id: string
  id_publico: string
  tipo: TipoCliente
  nombre: string
  apellido: string | null
  razon_social: string | null
  documento: string | null
  telefono: string | null
  ciudad: string | null
  activo: boolean
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string; tipo?: string; estado?: string }
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

  // El alta de clientes es del admin y del vendedor desde la 0028.
  const puedeGestionar = puedeCargarClientes(profile.rol)

  const q = (searchParams.q ?? "").trim()
  const estadoFilter = searchParams.estado === "inactivos" ? false
                     : searchParams.estado === "todos"     ? null
                     : true

  let query = supabase
    .from("clientes")
    .select("id, id_publico, tipo, nombre, apellido, razon_social, documento, telefono, ciudad, activo")
    .order("created_at", { ascending: false })
    .limit(200)

  if (estadoFilter !== null) query = query.eq("activo", estadoFilter)
  if (searchParams.tipo === "MAYORISTA" || searchParams.tipo === "MINORISTA") {
    query = query.eq("tipo", searchParams.tipo)
  }
  if (q.length >= 2) {
    const like = `%${q.replace(/[,()]/g, " ")}%`
    query = query.or(
      [
        `id_publico.ilike.${like}`,
        `nombre.ilike.${like}`,
        `apellido.ilike.${like}`,
        `razon_social.ilike.${like}`,
        `documento.ilike.${like}`,
        `telefono.ilike.${like}`,
        `instagram.ilike.${like}`,
      ].join(","),
    )
  }

  const { data: clientes } = await query
  const rows = (clientes ?? []) as ClienteRow[]
  const ent = DOMINIO.clientes

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
              A quién le vendemos. Mayoristas con lista propia; minoristas al precio base.
            </p>
          </div>
          {puedeGestionar && (
            <Button asChild>
              <Link href={`${ent.ruta}/nuevo`}>
                <Plus className="w-4 h-4" />
                {nuevoLabel(ent)}
              </Link>
            </Button>
          )}
        </header>

        <AyudaPantalla
          que="Tu cartera de clientes, con su teléfono, su tipo (mayorista o minorista) y la lista de precios que le corresponde a cada uno."
          cuando="Cuando le vendés por primera vez a alguien, o cuando querés ver todo lo que un cliente te compró y cuánto te debe."
          ojo="Para una venta de mostrador sin datos usá el cliente 'Consumidor Final', que ya viene cargado. No crees un cliente nuevo por cada persona que pasa."
          seccion="clientes"
        />

        {/* Filtros */}
        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID, nombre, doc, tel o @IG…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="tipo"
            defaultValue={searchParams.tipo ?? ""}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="">Todos los tipos</option>
            <option value="MAYORISTA">Solo mayoristas</option>
            <option value="MINORISTA">Solo minoristas</option>
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
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Doc</TableHead>
                <TableHead className="hidden lg:table-cell">Contacto</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  {q.length >= 2
                    ? `Sin resultados para "${q}".`
                    : "Todavía no cargaste clientes."}
                </TableEmpty>
              ) : (
                rows.map((c) => (
                  <LinkRow key={c.id} href={`${ent.ruta}/${c.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">
                      {c.id_publico}
                    </TableCell>
                    <TableCell className="font-medium">{nombreVisible(c)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={TIPO_CLIENTE_VARIANT[c.tipo]}>
                        {TIPO_CLIENTE_LABEL[c.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-app-secondary">
                      {c.documento ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      {[c.telefono, c.ciudad].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={c.activo ? "green" : "gray"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
        </p>
      </div>
    </div>
  )
}
