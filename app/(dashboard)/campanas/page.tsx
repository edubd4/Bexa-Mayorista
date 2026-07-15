import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Search, Calendar } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { LinkRow } from "@/components/ui/link-row"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { CampanaEstadoBadge } from "@/components/campanas/CampanaEstadoBadge"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import type { EstadoCampanaEfectivo } from "@/lib/validators/campana"

type CampanaRow = {
  id: string
  id_publico: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado_efectivo: EstadoCampanaEfectivo
  presupuesto_estimado: number
  costo_real: number | null
  canales_count: number
  productos_count: number
  publicaciones_count: number
}

export default async function CampanasPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles").select("rol, activo").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")

  const q = (searchParams.q ?? "").trim()
  const estadoFilter = searchParams.estado ?? "todos"

  let query = supabase
    .from("v_campanas")
    .select("id, id_publico, nombre, fecha_inicio, fecha_fin, estado_efectivo, presupuesto_estimado, costo_real, canales_count, productos_count, publicaciones_count")
    .order("fecha_inicio", { ascending: false })
    .limit(200)

  if (estadoFilter !== "todos") query = query.eq("estado_efectivo", estadoFilter)
  if (q.length >= 2) {
    const like = `%${q.replace(/[,()]/g, " ")}%`
    query = query.or(`id_publico.ilike.${like},nombre.ilike.${like}`)
  }

  const { data: campanas } = await query
  const rows = (campanas ?? []) as unknown as CampanaRow[]

  const ent = DOMINIO.campanas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Marketing · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              Planificá campañas, seguí publicaciones y medí el impacto en ventas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campanas/calendario">
                <Calendar className="w-4 h-4" />
                Calendario
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${ent.ruta}/nueva`}>
                <Plus className="w-4 h-4" />
                {nuevoLabel(ent)}
              </Link>
            </Button>
          </div>
        </header>

        <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por ID o nombre…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
            />
          </div>
          <select
            name="estado"
            defaultValue={estadoFilter}
            className="h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
          >
            <option value="todos">Todos los estados</option>
            <option value="BORRADOR">Borrador</option>
            <option value="PROGRAMADA">Programadas</option>
            <option value="ACTIVA">Activas</option>
            <option value="PAUSADA">Pausadas</option>
            <option value="CONCLUIDA">Concluidas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
          <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        </form>

        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead className="hidden md:table-cell">Ventana</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Canales</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Productos</TableHead>
                <TableHead className="hidden md:table-cell text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={7}>
                  {q.length >= 2
                    ? `Sin resultados para "${q}".`
                    : "Todavía no creaste campañas. Arrancá con la primera."}
                </TableEmpty>
              ) : (
                rows.map((c) => (
                  <LinkRow key={c.id} href={`${ent.ruta}/${c.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">{c.id_publico}</TableCell>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(c.fecha_inicio)} → {formatFecha(c.fecha_fin)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                      {c.canales_count}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                      {c.productos_count}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                      {formatPesos(Number(c.presupuesto_estimado))}
                    </TableCell>
                    <TableCell className="text-right">
                      <CampanaEstadoBadge estado={c.estado_efectivo} />
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "campaña" : "campañas"}
        </p>
      </div>
    </div>
  )
}
