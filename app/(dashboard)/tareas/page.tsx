import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ExternalLink, History } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OcurrenciaEstadoButtons } from "@/components/tareas/OcurrenciaEstadoButtons"
import { RegistrarEventualButton } from "@/components/tareas/RegistrarEventualButton"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { ahoraArgentina, toISODate } from "@/lib/fechas"
import { formatFecha } from "@/lib/utils"
import {
  PRIORIDAD_TAREA_LABEL,
  PRIORIDAD_TAREA_VARIANT,
  describirFrecuencia,
} from "@/lib/tareas-ui"
import type { EstadoTarea, FrecuenciaTarea, PrioridadTarea } from "@/lib/validators/tarea"

type TareaRef = {
  id: string
  id_publico: string
  codigo: string | null
  nombre: string
  area: string | null
  asignado_a: string | null
  prioridad: PrioridadTarea
  tiempo_estimado_min: number | null
  frecuencia: FrecuenciaTarea
  dia_semana: number | null
  dia_mes: number | null
  hora_sugerida: string | null
  manual_url: string | null
  activo: boolean
  asignado: { nombre: string } | null
}

type OcurrenciaRow = {
  id: string
  fecha: string
  estado: EstadoTarea
  iniciada_at: string | null
  finalizada_at: string | null
  notas: string | null
  tarea: TareaRef | null
}

function horaCorta(ts: string | null): string {
  if (!ts) return ""
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
    id, id_publico, codigo, nombre, area, asignado_a, prioridad,
    tiempo_estimado_min, frecuencia, dia_semana, dia_mes, hora_sugerida,
    manual_url, activo, asignado:asignado_a ( nombre )
  `

  const [hoyRes, atrasadasRes, eventualesRes, catalogoRes] = await Promise.all([
    supabase
      .from("tarea_ocurrencias")
      .select(`id, fecha, estado, iniciada_at, finalizada_at, notas, tarea:tarea_id ( ${tareaCols} )`)
      .eq("fecha", hoy)
      .order("created_at"),
    supabase
      .from("tarea_ocurrencias")
      .select(`id, fecha, estado, iniciada_at, finalizada_at, notas, tarea:tarea_id ( ${tareaCols} )`)
      .lt("fecha", hoy)
      .neq("estado", "FINALIZADA")
      .order("fecha", { ascending: false })
      .limit(60),
    supabase
      .from("tareas")
      .select(tareaCols)
      .eq("frecuencia", "EVENTUAL")
      .eq("activo", true)
      .order("nombre"),
    esAdmin
      ? supabase.from("tareas").select(tareaCols).order("area").order("nombre")
      : Promise.resolve({ data: [] }),
  ])

  const deHoy = (hoyRes.data ?? []) as unknown as OcurrenciaRow[]
  const atrasadas = (atrasadasRes.data ?? []) as unknown as OcurrenciaRow[]
  const eventuales = (eventualesRes.data ?? []) as unknown as TareaRef[]
  const catalogo = (catalogoRes.data ?? []) as unknown as TareaRef[]

  // Eventuales que ya tienen ocurrencia hoy no ofrecen "La hago hoy" de nuevo.
  const eventualesHoy = new Set(
    deHoy.filter((o) => o.tarea?.frecuencia === "EVENTUAL").map((o) => o.tarea!.id),
  )
  const eventualesDisponibles = eventuales.filter((t) => !eventualesHoy.has(t.id))

  // Orden del día: por hora sugerida (las sin hora al final), prioridad desempata.
  const prioridadOrden = { ALTA: 0, MEDIA: 1, BAJA: 2 }
  const deHoyOrdenadas = [...deHoy].sort((a, b) => {
    const ha = a.tarea?.hora_sugerida ?? "99:99"
    const hb = b.tarea?.hora_sugerida ?? "99:99"
    if (ha !== hb) return ha.localeCompare(hb)
    return prioridadOrden[a.tarea?.prioridad ?? "BAJA"] - prioridadOrden[b.tarea?.prioridad ?? "BAJA"]
  })

  // Tablero del admin: agrupado por responsable.
  const porResponsable = new Map<string, OcurrenciaRow[]>()
  if (esAdmin) {
    for (const o of deHoyOrdenadas) {
      const key = o.tarea?.asignado?.nombre ?? "Sin asignar"
      porResponsable.set(key, [...(porResponsable.get(key) ?? []), o])
    }
  }

  const ent = DOMINIO.tareas
  const finalizadasHoy = deHoy.filter((o) => o.estado === "FINALIZADA").length

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Operación · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural} de hoy
            </h1>
            <p className="text-app-secondary mt-1">
              {formatFecha(hoy)} · {finalizadasHoy}/{deHoy.length} finalizadas
              {esAdmin ? " · Ves el tablero de todo el equipo." : " · Estas son las tuyas."}
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
          que="El sistema operativo del equipo: qué hace cada uno, cada día. Las tareas diarias, semanales y mensuales aparecen solas cuando les toca; las 'cuando corresponda' las registrás vos al hacerlas."
          cuando="Arrancando el día, para ver qué te toca. Y cada vez que termines algo: marcalo en el momento, no al final del día."
          ojo="La hora en que marcás cada tarea queda registrada — así el admin sabe qué se hizo y cuándo, sin perseguir a nadie. Marcar todo junto a las 20:00 se nota."
          seccion="tareas"
        />

        {/* Atrasadas */}
        {atrasadas.length > 0 && (
          <section className="rounded-xl border border-app-amber/40 bg-app-amber/5 p-5 space-y-3">
            <h2 className="font-display font-semibold text-app-amber">
              Atrasadas ({atrasadas.length})
            </h2>
            <ul className="space-y-1">
              {atrasadas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-app-line-soft last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[11px] text-app-muted shrink-0">{formatFecha(o.fecha)}</span>
                    <span className="text-sm font-medium truncate">{o.tarea?.nombre ?? "—"}</span>
                    {esAdmin && o.tarea?.asignado && (
                      <span className="text-xs font-mono text-app-muted">{o.tarea.asignado.nombre}</span>
                    )}
                  </div>
                  <OcurrenciaEstadoButtons ocurrenciaId={o.id} estado={o.estado} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Hoy */}
        {esAdmin ? (
          Array.from(porResponsable.entries()).map(([nombre, ocurrencias]) => (
            <section key={nombre} className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold">{nombre}</h2>
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                  {ocurrencias.filter((o) => o.estado === "FINALIZADA").length}/{ocurrencias.length} finalizadas
                </p>
              </div>
              <ListaOcurrencias ocurrencias={ocurrencias} mostrarSellos />
            </section>
          ))
        ) : (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <h2 className="font-display font-semibold">Tus tareas de hoy</h2>
            {deHoyOrdenadas.length === 0 ? (
              <p className="text-sm text-app-muted font-mono">
                No tenés tareas asignadas para hoy. Si te falta alguna, avisale al admin.
              </p>
            ) : (
              <ListaOcurrencias ocurrencias={deHoyOrdenadas} mostrarSellos={false} />
            )}
          </section>
        )}

        {esAdmin && porResponsable.size === 0 && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <p className="text-sm text-app-muted font-mono">
              Hoy no se generó ninguna tarea. Asigná responsables en el catálogo de abajo — las
              tareas sin responsable igual se generan; las ve solo el admin hasta que las asignes.
            </p>
          </section>
        )}

        {/* Cuando corresponda */}
        {eventualesDisponibles.length > 0 && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">Cuando corresponda</h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Se registran al hacerlas
              </p>
            </div>
            <ul className="space-y-1">
              {eventualesDisponibles.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-app-line-soft last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={PRIORIDAD_TAREA_VARIANT[t.prioridad]}>
                      {PRIORIDAD_TAREA_LABEL[t.prioridad]}
                    </Badge>
                    <span className="text-sm font-medium truncate">{t.nombre}</span>
                    {esAdmin && <span className="text-xs font-mono text-app-muted">{t.asignado?.nombre ?? "Sin asignar"}</span>}
                  </div>
                  <RegistrarEventualButton tareaId={t.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Catálogo (admin) */}
        {esAdmin && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">Catálogo de tareas</h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                {catalogo.filter((t) => t.activo).length} activas · {catalogo.length} totales
              </p>
            </div>
            <ul className="space-y-1">
              {catalogo.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`${ent.ruta}/${t.id}`}
                    className={`flex flex-wrap items-center justify-between gap-2 py-2 border-b border-app-line-soft last:border-0 hover:bg-app-surface-mid/30 rounded px-1 -mx-1 transition-colors ${t.activo ? "" : "opacity-50"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-app-accent shrink-0">
                        {t.codigo ?? t.id_publico}
                      </span>
                      <span className="text-sm font-medium truncate">{t.nombre}</span>
                      {t.area && <span className="text-xs font-mono text-app-muted hidden md:inline">{t.area}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-app-muted">
                      <span className="hidden sm:inline">{describirFrecuencia(t)}</span>
                      <span>{t.asignado?.nombre ?? "Sin asignar"}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

// Lista compartida de ocurrencias del día. `mostrarSellos` agrega la
// auditoría de horarios (vista del admin).
function ListaOcurrencias({
  ocurrencias,
  mostrarSellos,
}: {
  ocurrencias: OcurrenciaRow[]
  mostrarSellos: boolean
}) {
  return (
    <ul className="space-y-1">
      {ocurrencias.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-app-line-soft last:border-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="font-mono text-[11px] text-app-muted w-10 shrink-0">
              {o.tarea?.hora_sugerida?.slice(0, 5) ?? "—"}
            </span>
            <Badge variant={PRIORIDAD_TAREA_VARIANT[o.tarea?.prioridad ?? "BAJA"]}>
              {PRIORIDAD_TAREA_LABEL[o.tarea?.prioridad ?? "BAJA"]}
            </Badge>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {o.tarea?.nombre ?? "—"}
                {o.tarea?.manual_url && (
                  <a
                    href={o.tarea.manual_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center ml-1.5 text-app-muted hover:text-app-accent align-middle"
                    aria-label="Abrir manual de la tarea"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
              <p className="text-[10.5px] font-mono text-app-muted">
                {o.tarea?.tiempo_estimado_min ? `~${o.tarea.tiempo_estimado_min} min` : ""}
                {mostrarSellos && o.iniciada_at && ` · inició ${horaCorta(o.iniciada_at)}`}
                {mostrarSellos && o.finalizada_at && ` · terminó ${horaCorta(o.finalizada_at)}`}
                {o.notas && ` · ${o.notas}`}
              </p>
            </div>
          </div>
          <OcurrenciaEstadoButtons ocurrenciaId={o.id} estado={o.estado} />
        </li>
      ))}
    </ul>
  )
}
