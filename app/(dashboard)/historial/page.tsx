import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { formatFechaHora, cn } from "@/lib/utils"
import {
  TIPO_EVENTO_LABEL,
  TIPO_EVENTO_VARIANT,
  ENTIDAD_TIPO_LABEL,
  linkEntidad,
} from "@/lib/historial-ui"

// Los filtros salen de los mapas de historial-ui: al cosechar un módulo que
// agrega tipos/entidades, registrarlos allá y estos filtros los levantan solos.
const TIPOS_EVENTO = Object.keys(TIPO_EVENTO_LABEL)
const ENTIDADES = Object.keys(ENTIDAD_TIPO_LABEL)

const PAGE_SIZE = 50

type Params = {
  tipo?: string
  entidad?: string
  page?: string
}

type EventoRow = {
  id: number
  tipo: string
  descripcion: string
  entidad_tipo: string | null
  entidad_id: string | null
  payload: unknown
  user_id: string | null
  created_at: string
  usuario: { nombre: string } | null
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Params
}) {
  const supabase = await createServerClient()

  // Guard admin
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user!.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) {
    redirect("/panel")
  }

  const page = Math.max(0, Number(searchParams.page ?? "0") || 0)
  const tipoFiltro = searchParams.tipo && TIPOS_EVENTO.includes(searchParams.tipo as typeof TIPOS_EVENTO[number])
    ? searchParams.tipo
    : null
  const entidadFiltro = searchParams.entidad && ENTIDADES.includes(searchParams.entidad as typeof ENTIDADES[number])
    ? searchParams.entidad
    : null

  let query = supabase
    .from("historial")
    .select(`
      id, tipo, descripcion, entidad_tipo, entidad_id, payload, user_id, created_at,
      usuario:user_id ( nombre )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (tipoFiltro) query = query.eq("tipo", tipoFiltro)
  if (entidadFiltro) query = query.eq("entidad_tipo", entidadFiltro)

  const { data, count, error } = await query
  const rows = (data ?? []) as unknown as EventoRow[]
  const totalPaginas = count ? Math.ceil(count / PAGE_SIZE) : 1

  const buildLink = (updates: Partial<Params>): string => {
    const params = new URLSearchParams()
    const merged: Params = { ...searchParams, ...updates }
    if (merged.tipo) params.set("tipo", merged.tipo)
    if (merged.entidad) params.set("entidad", merged.entidad)
    if (merged.page && merged.page !== "0") params.set("page", merged.page)
    const qs = params.toString()
    return qs ? `/historial?${qs}` : "/historial"
  }

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Módulo · Historial
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Auditoría del sistema
          </h1>
          <p className="text-app-secondary mt-1">
            Todos los eventos importantes que pasaron. Append-only, inmutable.
          </p>
        </header>

        <AyudaPantalla
          que="Todo lo que pasó en el sistema: quién hizo qué y cuándo. No se puede editar ni borrar."
          cuando="Cuando algo no cierra y necesitás saber quién lo tocó: un precio que cambió, un stock que no coincide, una venta que apareció o desapareció."
          seccion="metodologia"
        />

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Tipo:</span>
            <FiltroChip href={buildLink({ tipo: undefined, page: "0" })} active={!tipoFiltro} label="Todos" />
            {TIPOS_EVENTO.map((t) => (
              <FiltroChip
                key={t}
                href={buildLink({ tipo: t, page: "0" })}
                active={tipoFiltro === t}
                label={TIPO_EVENTO_LABEL[t] ?? t}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Entidad:</span>
          <FiltroChip href={buildLink({ entidad: undefined, page: "0" })} active={!entidadFiltro} label="Todas" />
          {ENTIDADES.map((e) => (
            <FiltroChip
              key={e}
              href={buildLink({ entidad: e, page: "0" })}
              active={entidadFiltro === e}
              label={ENTIDAD_TIPO_LABEL[e] ?? e}
            />
          ))}
        </div>

        <p className="font-mono text-[11px] text-app-muted">
          {count ?? 0} evento{(count ?? 0) === 1 ? "" : "s"}
          {(tipoFiltro || entidadFiltro) && " (filtrado)"}
        </p>

        {error ? (
          <div className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
            Error al cargar historial: {error.message}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Fecha</TableHead>
                  <TableHead className="w-[180px]">Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-[140px]">Entidad</TableHead>
                  <TableHead className="w-[120px]">Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmpty colSpan={5}>
                    No hay eventos que coincidan con los filtros.
                  </TableEmpty>
                ) : (
                  rows.map((r) => {
                    const linkEnt = linkEntidad(r.entidad_tipo, r.entidad_id)
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-app-muted">
                          {formatFechaHora(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={TIPO_EVENTO_VARIANT[r.tipo] ?? "gray"}>
                            {TIPO_EVENTO_LABEL[r.tipo] ?? r.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-app-text whitespace-pre-wrap">
                          {r.descripcion}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.entidad_tipo && r.entidad_id ? (
                            linkEnt ? (
                              <Link
                                href={linkEnt}
                                className="font-mono text-app-accent hover:underline underline-offset-4"
                              >
                                {r.entidad_id}
                              </Link>
                            ) : (
                              <span className="font-mono text-app-muted">{r.entidad_id}</span>
                            )
                          ) : (
                            <span className="text-app-muted">—</span>
                          )}
                          {r.entidad_tipo && (
                            <p className="text-[10px] text-app-muted mt-0.5">
                              {ENTIDAD_TIPO_LABEL[r.entidad_tipo] ?? r.entidad_tipo}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-app-muted text-sm">
                          {r.usuario?.nombre ?? "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-app-muted font-mono">
                  Página {page + 1} de {totalPaginas}
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    href={buildLink({ page: String(Math.max(0, page - 1)) })}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-mono border border-app-line",
                      page === 0 ? "text-app-muted pointer-events-none opacity-50" : "text-app-secondary hover:text-app-text",
                    )}
                    aria-disabled={page === 0}
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Anterior
                  </Link>
                  <Link
                    href={buildLink({ page: String(page + 1) })}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-mono border border-app-line",
                      page + 1 >= totalPaginas ? "text-app-muted pointer-events-none opacity-50" : "text-app-secondary hover:text-app-text",
                    )}
                    aria-disabled={page + 1 >= totalPaginas}
                  >
                    Siguiente
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FiltroChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1 rounded-md text-xs font-mono border transition-colors",
        active
          ? "border-app-accent/50 bg-app-accent/10 text-app-accent"
          : "border-app-line text-app-muted hover:text-app-text",
      )}
    >
      {label}
    </Link>
  )
}
