import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ExternalLink, History, ChevronDown } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LinkRow } from "@/components/ui/link-row"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EstadoTareaSelect } from "@/components/tareas/EstadoTareaSelect"
import { FrecuenciaSelect } from "@/components/tareas/FrecuenciaSelect"
import { RegistrarEventualButton } from "@/components/tareas/RegistrarEventualButton"
import { ResponsableSelect } from "@/components/tareas/ResponsableSelect"
import { TareaComentariosDialog } from "@/components/tareas/TareaComentariosDialog"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { ahoraArgentina, toISODate } from "@/lib/fechas"
import { formatFecha } from "@/lib/utils"
import {
  ESTADO_TAREA_LABEL,
  ESTADO_TAREA_VARIANT,
  PRIORIDAD_TAREA_LABEL,
  frecuenciaCorta,
} from "@/lib/tareas-ui"
import type { EstadoTarea, FrecuenciaTarea, PrioridadTarea } from "@/lib/validators/tarea"
import { logPerfilError } from "@/lib/auth-guards"

// UX del módulo (feedback del cliente, 2 iteraciones):
//   1ª: tarjetas → "no se entiende". 2ª: tabla completa → "mucho dato
//   amontonado". Esta versión es el patrón de las apps de operaciones
//   (Linear/Asana "My Tasks"): KPIs del día arriba, filtros, grupos por ÁREA
//   colapsables con barra de progreso, y filas densas donde el dato frío
//   (prioridad, frecuencia) se achica a un punto de color y una línea mono,
//   para que lo operativo (tarea + estado) respire.

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

// El punto de color reemplaza al badge de prioridad: misma información,
// una fracción del ruido visual.
const PRIORIDAD_DOT: Record<PrioridadTarea, string> = {
  ALTA:  "bg-app-red",
  MEDIA: "bg-app-amber",
  BAJA:  "bg-app-muted/50",
}

function horaCorta(ts: string | null): string {
  if (!ts) return ""
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export default async function TareasPage({
  searchParams,
}: {
  searchParams: { area?: string; resp?: string; f?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("TareasPage", perfilError)
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

  const [catalogoRes, hoyRes, atrasadasRes, historialRes, usuariosRes, noLeidosRes] = await Promise.all([
    // La RLS filtra: el empleado recibe SOLO sus tareas; el admin, todas.
    supabase.from("tareas").select(tareaCols).eq("activo", true)
      .order("hora_sugerida", { nullsFirst: false }),
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
          .limit(20)
      : Promise.resolve({ data: [] }),
    esAdmin
      ? supabase.from("profiles").select("id, nombre").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] }),
    // Estado del globito por tarea (0029): total de mensajes + cuántos me
    // faltan leer. Antes solo se pedían los pendientes, y una conversación
    // leída quedaba indistinguible de una tarea sin mensajes.
    supabase.rpc("resumen_comentarios_tareas"),
  ])

  const catalogoTodo = (catalogoRes.data ?? []) as unknown as TareaRow[]
  const deHoy = (hoyRes.data ?? []) as unknown as OcurrenciaRow[]
  const atrasadas = (atrasadasRes.data ?? []) as unknown as OcurrenciaRow[]
  const historial = (historialRes.data ?? []) as unknown as HistorialRow[]
  const usuarios = (usuariosRes.data ?? []) as { id: string; nombre: string }[]
  const resumenComentarios = new Map(
    ((noLeidosRes.data ?? []) as { tarea_id: string; total: number; no_leidos: number }[])
      .map((r) => [r.tarea_id, { total: Number(r.total), noLeidos: Number(r.no_leidos) }]),
  )
  const SIN_MENSAJES = { total: 0, noLeidos: 0 }
  const totalNoLeidos = Array.from(resumenComentarios.values())
    .reduce((a, r) => a + r.noLeidos, 0)

  const ocurrenciaHoy = new Map(deHoy.map((o) => [o.tarea_id, o]))
  const tareasAtrasadas = new Set(atrasadas.map((o) => o.tarea_id))
  const tareaPorId = new Map(catalogoTodo.map((t) => [t.id, t]))

  function esAtrasada(t: TareaRow): boolean {
    if (tareasAtrasadas.has(t.id)) return true
    if (t.fecha_limite && t.fecha_limite < hoy) {
      const oc = ocurrenciaHoy.get(t.id)
      return !oc || oc.estado !== "FINALIZADA"
    }
    return false
  }

  // ─── Filtros del admin (server-side, via querystring) ─────────────────────
  const areas = Array.from(new Set(catalogoTodo.map((t) => t.area ?? "Sin área"))).sort()
  const responsables = Array.from(
    new Set(catalogoTodo.map((t) => t.asignado?.nombre ?? "Sin asignar")),
  ).sort()
  const fArea = searchParams.area ?? ""
  const fResp = searchParams.resp ?? ""
  // `f` viene de las cards de arriba: son filtros clickeables.
  const fEstado = ["finalizadas", "en_proceso", "atrasadas"].includes(searchParams.f ?? "")
    ? searchParams.f!
    : ""
  const catalogo = catalogoTodo.filter((t) => {
    if (fArea && (t.area ?? "Sin área") !== fArea) return false
    if (fResp && (t.asignado?.nombre ?? "Sin asignar") !== fResp) return false
    if (fEstado === "finalizadas" && ocurrenciaHoy.get(t.id)?.estado !== "FINALIZADA") return false
    if (fEstado === "en_proceso" && ocurrenciaHoy.get(t.id)?.estado !== "EN_PROCESO") return false
    if (fEstado === "atrasadas" && !esAtrasada(t)) return false
    return true
  })

  // Las cards linkean conservando los filtros de área/responsable.
  function urlConFiltro(f: string): string {
    const params = new URLSearchParams()
    if (fArea) params.set("area", fArea)
    if (fResp) params.set("resp", fResp)
    if (f) params.set("f", f)
    const qs = params.toString()
    return qs ? `${DOMINIO.tareas.ruta}?${qs}` : DOMINIO.tareas.ruta
  }

  // ─── Agrupar por área (la unidad mental de la planilla del cliente) ───────
  const porArea = new Map<string, TareaRow[]>()
  for (const t of catalogo) {
    const key = t.area ?? "Sin área"
    porArea.set(key, [...(porArea.get(key) ?? []), t])
  }

  // ─── KPIs del día ─────────────────────────────────────────────────────────
  const totalHoy = deHoy.length
  const finalizadasHoy = deHoy.filter((o) => o.estado === "FINALIZADA").length
  const enProcesoHoy = deHoy.filter((o) => o.estado === "EN_PROCESO").length
  const totalAtrasadas = atrasadas.length
  const ent = DOMINIO.tareas

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
              {formatFecha(hoy)} · {esAdmin ? "el día de todo el equipo" : "tu día, ordenado por horario"}
              {/* Rojo, igual que los globitos de las filas: si el aviso de
                  arriba y la marca de la fila no son del mismo color, no se
                  leen como la misma cosa. */}
              {totalNoLeidos > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-app-red/40 bg-app-red/10 px-2 py-0.5 font-mono text-[11px] text-app-red align-middle">
                  💬 {totalNoLeidos} {totalNoLeidos === 1 ? "mensaje sin leer" : "mensajes sin leer"}
                </span>
              )}
            </p>
          </div>
          {esAdmin && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`${ent.ruta}/auditoria`}>
                  <History className="w-4 h-4" />
                  Auditoría
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
          que="El sistema operativo del equipo: cada tarea con su responsable, horario y estado del día, agrupadas por área. Las diarias, semanales y mensuales aparecen solas cuando les toca."
          cuando="Arrancando el día, para ver qué toca. Y al terminar cada tarea: marcala en el momento, no al final del día."
          ojo="La hora en que se marca cada tarea la sella el sistema — el admin ve qué se hizo y cuándo, sin perseguir a nadie."
          seccion="tareas"
        />

        {/* ─── KPIs del día — clickeables: cada card filtra la tabla ────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Tareas de hoy"
            valor={String(totalHoy)}
            tono="accent"
            href={urlConFiltro("")}
            activa={fEstado === ""}
          />
          <StatCard
            label="Finalizadas"
            valor={`${finalizadasHoy}/${totalHoy}`}
            tono="green"
            progreso={totalHoy > 0 ? finalizadasHoy / totalHoy : 0}
            href={urlConFiltro("finalizadas")}
            activa={fEstado === "finalizadas"}
          />
          <StatCard
            label="En proceso"
            valor={String(enProcesoHoy)}
            tono="accent"
            href={urlConFiltro("en_proceso")}
            activa={fEstado === "en_proceso"}
          />
          <StatCard
            label="Atrasadas"
            valor={String(totalAtrasadas)}
            tono={totalAtrasadas > 0 ? "red" : "muted"}
            href={urlConFiltro("atrasadas")}
            activa={fEstado === "atrasadas"}
          />
        </section>

        {/* ─── Filtros (admin) ──────────────────────────────────────────── */}
        {esAdmin && (
          <form action={ent.ruta} method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="area"
              defaultValue={fArea}
              className="h-9 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
            >
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              name="resp"
              defaultValue={fResp}
              className="h-9 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
            >
              <option value="">Todo el equipo</option>
              {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Button type="submit" variant="outline" size="sm">Filtrar</Button>
            {(fArea || fResp) && (
              <Button asChild variant="ghost" size="sm">
                <Link href={ent.ruta}>Limpiar</Link>
              </Button>
            )}
          </form>
        )}

        {/* ─── Grupos por área ──────────────────────────────────────────── */}
        {porArea.size === 0 ? (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-8 text-center">
            <p className="text-sm text-app-muted font-mono">
              {esAdmin
                ? "Sin tareas con estos filtros. Probá limpiarlos o creá una nueva."
                : "No tenés tareas asignadas. Si te falta alguna, avisale al admin."}
            </p>
          </section>
        ) : (
          Array.from(porArea.entries()).map(([area, tareas]) => {
            const conOcurrencia = tareas.filter((t) => ocurrenciaHoy.has(t.id))
            const hechas = conOcurrencia.filter(
              (t) => ocurrenciaHoy.get(t.id)!.estado === "FINALIZADA",
            ).length
            const progreso = conOcurrencia.length > 0 ? hechas / conOcurrencia.length : 0
            return (
              <details
                key={area}
                open
                className="group rounded-xl border border-app-line-soft bg-app-card overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-4 px-5 py-3.5 cursor-pointer select-none hover:bg-app-surface-mid/30 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown className="w-4 h-4 text-app-muted transition-transform group-open:rotate-0 -rotate-90 shrink-0" />
                    <h2 className="font-display font-semibold truncate">{area}</h2>
                    <span className="font-mono text-[11px] text-app-muted shrink-0">
                      {tareas.length} {tareas.length === 1 ? "tarea" : "tareas"}
                    </span>
                  </div>
                  {conOcurrencia.length > 0 && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 h-1.5 rounded-full bg-app-surface-mid overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full ${progreso === 1 ? "bg-app-green" : "bg-app-accent"}`}
                          style={{ width: `${Math.round(progreso * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-app-secondary">
                        {hechas}/{conOcurrencia.length} hoy
                      </span>
                    </div>
                  )}
                </summary>

                <div className="border-t border-app-line-soft overflow-x-auto">
                  <Table className="border-0">
                    <TableBody>
                      {tareas.map((t) => {
                        const oc = ocurrenciaHoy.get(t.id)
                        const atrasada = esAtrasada(t)
                        const fila = (
                          <>
                            {/* Prioridad: punto de color, no badge — menos ruido. */}
                            <TableCell className="py-2.5 w-8 pr-0">
                              <span
                                className={`inline-block w-2 h-2 rounded-full ${PRIORIDAD_DOT[t.prioridad]}`}
                                title={`Prioridad ${PRIORIDAD_TAREA_LABEL[t.prioridad].toLowerCase()}`}
                              />
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-app-text">{t.nombre}</span>
                                {atrasada && <Badge variant="red">Atrasada</Badge>}
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
                              <p className="text-[10.5px] font-mono text-app-muted mt-0.5">
                                {[
                                  t.codigo ?? t.id_publico,
                                  t.tiempo_estimado_min ? `~${t.tiempo_estimado_min} min` : null,
                                  t.fecha_limite ? `límite ${formatFecha(t.fecha_limite)}` : null,
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </TableCell>
                            {esAdmin && (
                              // Atajo: asignar responsable desde la fila.
                              <TableCell className="py-2.5 hidden md:table-cell whitespace-nowrap">
                                <ResponsableSelect
                                  tareaId={t.id}
                                  asignadoA={t.asignado_a}
                                  usuarios={usuarios}
                                />
                              </TableCell>
                            )}
                            <TableCell className="py-2.5 hidden sm:table-cell whitespace-nowrap">
                              {esAdmin ? (
                                // Atajo: cambiar frecuencia desde la fila.
                                <FrecuenciaSelect
                                  tareaId={t.id}
                                  frecuencia={t.frecuencia}
                                  detalle={frecuenciaCorta(t)}
                                />
                              ) : (
                                <span className="font-mono text-xs text-app-secondary">
                                  {frecuenciaCorta(t)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-right whitespace-nowrap">
                              {oc ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <EstadoTareaSelect ocurrenciaId={oc.id} estado={oc.estado} />
                                  {oc.finalizada_at && (
                                    <span className="font-mono text-[10px] text-app-green">
                                      ✓ {horaCorta(oc.finalizada_at)}
                                    </span>
                                  )}
                                </div>
                              ) : t.frecuencia === "EVENTUAL" ? (
                                <RegistrarEventualButton tareaId={t.id} />
                              ) : (
                                <span className="font-mono text-[11px] text-app-muted">No toca hoy</span>
                              )}
                            </TableCell>
                            {/* La conversación de la tarea (0026). */}
                            <TableCell className="py-2.5 w-10 text-right">
                              <TareaComentariosDialog
                                tareaId={t.id}
                                tareaNombre={t.nombre}
                                noLeidos={(resumenComentarios.get(t.id) ?? SIN_MENSAJES).noLeidos}
                                total={(resumenComentarios.get(t.id) ?? SIN_MENSAJES).total}
                                usuarioId={user.id}
                              />
                            </TableCell>
                          </>
                        )
                        return esAdmin ? (
                          <LinkRow key={t.id} href={`${ent.ruta}/${t.id}`}>{fila}</LinkRow>
                        ) : (
                          <TableRow key={t.id}>{fila}</TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )
          })
        )}

        {/* ─── Pendientes de días anteriores ────────────────────────────── */}
        {atrasadas.length > 0 && (
          <section className="rounded-xl border border-app-amber/40 bg-app-card overflow-hidden">
            <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
              <h2 className="font-display font-semibold text-app-amber">
                Pendientes de días anteriores ({atrasadas.length})
              </h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest hidden sm:block">
                Finalizalas o siguen acumulando
              </p>
            </div>
            <Table className="border-0">
              <TableBody>
                {atrasadas.map((o) => {
                  const t = tareaPorId.get(o.tarea_id)
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="py-2.5 w-24 font-mono text-xs text-app-secondary whitespace-nowrap">
                        {formatFecha(o.fecha)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-sm font-medium text-app-text">{t?.nombre ?? "—"}</span>
                        {esAdmin && (
                          <span className="ml-2 font-mono text-[10.5px] text-app-muted">
                            {t?.asignado?.nombre ?? "Sin asignar"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <EstadoTareaSelect ocurrenciaId={o.id} estado={o.estado} />
                      </TableCell>
                      {/* El globito TAMBIÉN acá (0029). Faltaba, y esta es
                          justamente la tabla donde más se necesita: una tarea
                          atrasada es sobre la que alguien tiene algo que
                          explicar ("no llegué", "faltaba el repuesto"). Si el
                          único lugar para escribir está en la tabla de arriba,
                          la explicación termina en el WhatsApp de alguien. */}
                      <TableCell className="py-2.5 w-10 text-right">
                        <TareaComentariosDialog
                          tareaId={o.tarea_id}
                          tareaNombre={t?.nombre ?? "Tarea"}
                          noLeidos={(resumenComentarios.get(o.tarea_id) ?? SIN_MENSAJES).noLeidos}
                          total={(resumenComentarios.get(o.tarea_id) ?? SIN_MENSAJES).total}
                          usuarioId={user.id}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </section>
        )}

        {/* ─── Historial: lo que el equipo va haciendo (admin) ──────────── */}
        {esAdmin && historial.length > 0 && (
          <details className="group rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
            <summary className="flex items-center justify-between gap-4 px-5 py-3.5 cursor-pointer select-none hover:bg-app-surface-mid/30 transition-colors list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <ChevronDown className="w-4 h-4 text-app-muted transition-transform group-open:rotate-0 -rotate-90" />
                <h2 className="font-display font-semibold">Lo que el equipo va haciendo</h2>
              </div>
              <Link
                href={`${ent.ruta}/auditoria`}
                className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest hover:text-app-accent"
              >
                Auditoría completa →
              </Link>
            </summary>
            <div className="border-t border-app-line-soft">
              <Table className="border-0">
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
                  {historial.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="py-2.5 font-mono text-xs text-app-secondary">
                        {formatFecha(h.fecha)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="font-mono text-[11px] text-app-accent mr-2">
                          {h.tarea?.codigo ?? h.tarea?.id_publico ?? ""}
                        </span>
                        <span className="text-sm">{h.tarea?.nombre ?? "—"}</span>
                      </TableCell>
                      <TableCell className="py-2.5 hidden md:table-cell text-sm text-app-secondary">
                        {h.completador?.nombre ?? h.tarea?.asignado?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant={ESTADO_TAREA_VARIANT[h.estado]}>
                          {ESTADO_TAREA_LABEL[h.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 hidden lg:table-cell font-mono text-xs text-app-secondary">
                        {horaCorta(h.iniciada_at) || "—"}
                      </TableCell>
                      <TableCell className="py-2.5 hidden md:table-cell font-mono text-xs text-app-secondary">
                        {horaCorta(h.finalizada_at) || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// Card de KPI clickeable: filtra la tabla de abajo. `activa` marca cuál
// filtro está aplicado. `progreso` (0-1) pinta una barrita abajo.
function StatCard({
  label,
  valor,
  tono,
  progreso,
  href,
  activa,
}: {
  label: string
  valor: string
  tono: "accent" | "green" | "red" | "muted"
  progreso?: number
  href: string
  activa: boolean
}) {
  const color = {
    accent: "text-app-accent",
    green:  "text-app-green",
    red:    "text-app-red",
    muted:  "text-app-muted",
  }[tono]
  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-app-card px-4 py-3 transition-colors hover:border-app-accent/50 ${
        activa ? "border-app-accent ring-1 ring-app-accent/40" : "border-app-line-soft"
      }`}
    >
      <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">{label}</p>
      <p className={`font-display text-2xl font-bold mt-0.5 ${color}`}>{valor}</p>
      {progreso !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-app-surface-mid overflow-hidden">
          <div
            className={`h-full rounded-full ${progreso === 1 ? "bg-app-green" : "bg-app-accent"}`}
            style={{ width: `${Math.round(progreso * 100)}%` }}
          />
        </div>
      )}
    </Link>
  )
}
