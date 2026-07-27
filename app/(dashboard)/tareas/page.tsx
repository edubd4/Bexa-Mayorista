import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ExternalLink, History } from "lucide-react"
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
import { EstadoTareaSelect } from "@/components/tareas/EstadoTareaSelect"
import { RegistrarEventualButton } from "@/components/tareas/RegistrarEventualButton"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { ahoraArgentina, toISODate } from "@/lib/fechas"
import { formatFecha } from "@/lib/utils"
import {
  ESTADO_TAREA_LABEL,
  ESTADO_TAREA_VARIANT,
  PRIORIDAD_TAREA_LABEL,
  PRIORIDAD_TAREA_VARIANT,
  describirFrecuencia,
} from "@/lib/tareas-ui"
import type { EstadoTarea, FrecuenciaTarea, PrioridadTarea } from "@/lib/validators/tarea"

// La vista es LA PLANILLA del cliente, pero viva: una tabla con todas las
// columnas del Bexa_Sistema_Operativo (ID, tarea, área, responsable,
// frecuencia, prioridad, tiempo, estado del día, realización, atrasada) y el
// estado editable en la fila. Abajo, el historial de lo que el equipo va
// haciendo. El empleado ve la misma tabla, filtrada por RLS a SUS tareas.

type TareaRow = {
  id: string
  id_publico: string
  codigo: string | null
  nombre: string
  descripcion: string | null
  area: string | null
  asignado_a: string | null
  prioridad: PrioridadTarea
  tiempo_estimado_min: number | null
  frecuencia: FrecuenciaTarea
  dia_semana: number | null
  dia_mes: number | null
  hora_sugerida: string | null
  fecha_limite: string | null
  manual_url: string | null
  activo: boolean
  asignado: { nombre: string } | null
}

type OcurrenciaRow = {
  id: string
  tarea_id: string
  fecha: string
  estado: EstadoTarea
  iniciada_at: string | null
  finalizada_at: string | null
  notas: string | null
}

type HistorialRow = {
  id: string
  fecha: string
  estado: EstadoTarea
  iniciada_at: string | null
  finalizada_at: string | null
  tarea: { codigo: string | null; id_publico: string; nombre: string; asignado: { nombre: string } | null } | null
  completador: { nombre: string } | null
}

function horaCorta(ts: string | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export default async function TareasPage() {
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

  // El reinicio diario sin cron: la primera visita del día materializa las
  // ocurrencias de HOY (idempotente — ver 0025).
  await supabase.rpc("generar_ocurrencias_tareas")

  const hoy = toISODate(ahoraArgentina())
  const tareaCols = `
    id, id_publico, codigo, nombre, descripcion, area, asignado_a, prioridad,
    tiempo_estimado_min, frecuencia, dia_semana, dia_mes, hora_sugerida,
    fecha_limite, manual_url, activo, asignado:asignado_a ( nombre )
  `

  const [catalogoRes, hoyRes, atrasadasRes, historialRes] = await Promise.all([
    // La RLS filtra: el empleado recibe SOLO sus tareas; el admin, todas.
    supabase.from("tareas").select(tareaCols).eq("activo", true)
      .order("area").order("hora_sugerida", { nullsFirst: false }),
    supabase
      .from("tarea_ocurrencias")
      .select("id, tarea_id, fecha, estado, iniciada_at, finalizada_at, notas")
      .eq("fecha", hoy),
    supabase
      .from("tarea_ocurrencias")
      .select("id, tarea_id, fecha, estado, iniciada_at, finalizada_at, notas")
      .lt("fecha", hoy)
      .neq("estado", "FINALIZADA")
      .order("fecha", { ascending: false })
      .limit(60),
    // Historial de lo que el equipo va haciendo (lo pide el admin abajo).
    esAdmin
      ? supabase
          .from("tarea_ocurrencias")
          .select(`
            id, fecha, estado, iniciada_at, finalizada_at,
            tarea:tarea_id ( codigo, id_publico, nombre, asignado:asignado_a ( nombre ) ),
            completador:completada_por ( nombre )
          `)
          .neq("estado", "PENDIENTE")
          .order("updated_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] }),
  ])

  const catalogo = (catalogoRes.data ?? []) as unknown as TareaRow[]
  const deHoy = (hoyRes.data ?? []) as unknown as OcurrenciaRow[]
  const atrasadas = (atrasadasRes.data ?? []) as unknown as OcurrenciaRow[]
  const historial = (historialRes.data ?? []) as unknown as HistorialRow[]

  const ocurrenciaHoy = new Map(deHoy.map((o) => [o.tarea_id, o]))
  const atrasadasPorTarea = new Map<string, OcurrenciaRow[]>()
  for (const o of atrasadas) {
    atrasadasPorTarea.set(o.tarea_id, [...(atrasadasPorTarea.get(o.tarea_id) ?? []), o])
  }
  const tareaPorId = new Map(catalogo.map((t) => [t.id, t]))

  // "Atrasada" se CALCULA, como la columna de la planilla pero sin poder
  // mentir: hay ejecuciones viejas sin finalizar, o la fecha límite venció y
  // hoy no está finalizada.
  function esAtrasada(t: TareaRow): boolean {
    if (atrasadasPorTarea.has(t.id)) return true
    if (t.fecha_limite && t.fecha_limite < hoy) {
      const oc = ocurrenciaHoy.get(t.id)
      return !oc || oc.estado !== "FINALIZADA"
    }
    return false
  }

  const finalizadasHoy = deHoy.filter((o) => o.estado === "FINALIZADA").length
  const ent = DOMINIO.tareas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Operación · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              {formatFecha(hoy)} · {finalizadasHoy}/{deHoy.length} finalizadas hoy
              {esAdmin ? " · Ves todo el equipo." : " · Estas son las tuyas."}
            </p>
          </div>
          {esAdmin && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`${ent.ruta}/auditoria`}>
                  <History className="w-4 h-4" />
                  Auditoría completa
                </Link>
              </Button>
              <Button asChild>
                <Link href={`${ent.ruta}/nueva`}>
                  <Plus className="w-4 h-4" />
                  {nuevoLabel(ent)}
                </Link>
              </Button>
            </div>
          )}
        </header>

        <AyudaPantalla
          que="El sistema operativo del equipo, como la planilla pero vivo: cada tarea con su responsable, frecuencia, prioridad y estado del día. Las diarias, semanales y mensuales aparecen solas cuando les toca."
          cuando="Arrancando el día, para ver qué toca. Y al terminar cada tarea: marcala en el momento, no al final del día."
          ojo="La hora en que se marca cada tarea la sella el sistema — el admin ve qué se hizo y cuándo, sin perseguir a nadie."
          seccion="tareas"
        />

        {/* ─── La tabla, estilo planilla ───────────────────────────────── */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead className="min-w-[220px]">Tarea</TableHead>
                  <TableHead className="hidden md:table-cell">Área</TableHead>
                  {esAdmin && <TableHead>Responsable</TableHead>}
                  <TableHead className="hidden lg:table-cell">Frecuencia</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado de hoy</TableHead>
                  <TableHead className="hidden md:table-cell">Realizada</TableHead>
                  <TableHead>Atrasada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogo.length === 0 ? (
                  <TableEmpty colSpan={esAdmin ? 9 : 8}>
                    {esAdmin
                      ? "Sin tareas activas. Creá la primera con el botón de arriba."
                      : "No tenés tareas asignadas. Si te falta alguna, avisale al admin."}
                  </TableEmpty>
                ) : (
                  catalogo.map((t) => {
                    const oc = ocurrenciaHoy.get(t.id)
                    const atrasada = esAtrasada(t)
                    const fila = (
                      <>
                        <TableCell className="font-mono text-app-accent text-xs">
                          {t.codigo ?? t.id_publico}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{t.nombre}</span>
                            {t.manual_url && (
                              <a
                                href={t.manual_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-app-muted hover:text-app-accent shrink-0"
                                aria-label={`Manual de ${t.nombre}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {(t.descripcion || t.fecha_limite || t.tiempo_estimado_min) && (
                            <p className="text-[10.5px] font-mono text-app-muted mt-0.5 max-w-[340px] truncate">
                              {[
                                t.tiempo_estimado_min ? `~${t.tiempo_estimado_min} min` : null,
                                t.fecha_limite ? `límite ${formatFecha(t.fecha_limite)}` : null,
                                t.descripcion,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                          {t.area ?? "—"}
                        </TableCell>
                        {esAdmin && (
                          <TableCell className="text-sm">
                            {t.asignado?.nombre ?? (
                              <span className="text-app-amber font-mono text-xs">Sin asignar</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="hidden lg:table-cell font-mono text-xs text-app-secondary whitespace-nowrap">
                          {describirFrecuencia(t)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={PRIORIDAD_TAREA_VARIANT[t.prioridad]}>
                            {PRIORIDAD_TAREA_LABEL[t.prioridad]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {oc ? (
                            <EstadoTareaSelect ocurrenciaId={oc.id} estado={oc.estado} />
                          ) : t.frecuencia === "EVENTUAL" ? (
                            <RegistrarEventualButton tareaId={t.id} />
                          ) : (
                            <span className="font-mono text-[11px] text-app-muted">No toca hoy</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-app-secondary whitespace-nowrap">
                          {oc?.finalizada_at ? horaCorta(oc.finalizada_at) : "—"}
                        </TableCell>
                        <TableCell>
                          {atrasada
                            ? <Badge variant="red">Sí</Badge>
                            : <span className="font-mono text-xs text-app-muted">No</span>}
                        </TableCell>
                      </>
                    )
                    // El admin entra a editar la definición con un click en la
                    // fila; para el empleado la fila es informativa.
                    return esAdmin ? (
                      <LinkRow key={t.id} href={`${ent.ruta}/${t.id}`}>{fila}</LinkRow>
                    ) : (
                      <TableRow key={t.id}>{fila}</TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ─── Pendientes de días anteriores ───────────────────────────── */}
        {atrasadas.length > 0 && (
          <section className="rounded-xl border border-app-amber/40 bg-app-card overflow-hidden">
            <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
              <h2 className="font-display font-semibold text-app-amber">
                Pendientes de días anteriores ({atrasadas.length})
              </h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Finalizalas o siguen acumulando
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Día</TableHead>
                  <TableHead>Tarea</TableHead>
                  {esAdmin && <TableHead className="hidden md:table-cell">Responsable</TableHead>}
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atrasadas.map((o) => {
                  const t = tareaPorId.get(o.tarea_id)
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs text-app-secondary">
                        {formatFecha(o.fecha)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{t?.nombre ?? "—"}</TableCell>
                      {esAdmin && (
                        <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                          {t?.asignado?.nombre ?? "Sin asignar"}
                        </TableCell>
                      )}
                      <TableCell>
                        <EstadoTareaSelect ocurrenciaId={o.id} estado={o.estado} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </section>
        )}

        {/* ─── Historial: lo que el equipo va haciendo (admin) ─────────── */}
        {esAdmin && (
          <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
            <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
              <h2 className="font-display font-semibold">Lo que el equipo va haciendo</h2>
              <Link
                href={`${ent.ruta}/auditoria`}
                className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest hover:text-app-accent"
              >
                Auditoría completa →
              </Link>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead className="hidden md:table-cell">Quién</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Inició</TableHead>
                  <TableHead className="hidden md:table-cell">Terminó</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.length === 0 ? (
                  <TableEmpty colSpan={6}>
                    Todavía nadie marcó nada. Apenas el equipo empiece a trabajar,
                    acá aparece quién hizo qué y a qué hora real.
                  </TableEmpty>
                ) : (
                  historial.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-xs text-app-secondary">
                        {formatFecha(h.fecha)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] text-app-accent mr-2">
                          {h.tarea?.codigo ?? h.tarea?.id_publico ?? ""}
                        </span>
                        <span className="text-sm">{h.tarea?.nombre ?? "—"}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                        {h.completador?.nombre ?? h.tarea?.asignado?.nombre ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ESTADO_TAREA_VARIANT[h.estado]}>
                          {ESTADO_TAREA_LABEL[h.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs text-app-secondary">
                        {horaCorta(h.iniciada_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-app-secondary">
                        {horaCorta(h.finalizada_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        )}
      </div>
    </div>
  )
}
