import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { TareaComentariosDialog } from "@/components/tareas/TareaComentariosDialog"
import { TareaForm } from "@/components/tareas/TareaForm"
import { ToggleTareaActivoButton } from "@/components/tareas/ToggleTareaActivoButton"
import { Badge } from "@/components/ui/badge"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import type { TareaInput } from "@/lib/validators/tarea"

type Params = { id: string }

export default async function TareaDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  // La edición del catálogo es admin-only; el empleado opera desde /tareas.
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/tareas")

  const { data: tarea } = await supabase
    .from("tareas")
    .select("id, id_publico, codigo, nombre, descripcion, area, asignado_a, prioridad, tiempo_estimado_min, frecuencia, dia_semana, dia_mes, hora_sugerida, fecha_limite, manual_url, activo")
    .eq("id", params.id)
    .maybeSingle()
  if (!tarea) notFound()

  const [{ data: usuarios }, { data: areaRows }, { data: resumenRows }] = await Promise.all([
    supabase.from("profiles").select("id, nombre, rol").eq("activo", true).order("nombre"),
    supabase.from("tareas").select("area").not("area", "is", null),
    // Estado de la conversación de ESTA tarea (0029). La ficha no tenía
    // comentarios: entrabas a la tarea y la charla no existía.
    supabase.rpc("resumen_comentarios_tareas"),
  ])

  const resumen = ((resumenRows ?? []) as { tarea_id: string; total: number; no_leidos: number }[])
    .find((r) => r.tarea_id === tarea.id)

  const areasExistentes = Array.from(
    new Set(((areaRows ?? []) as { area: string | null }[]).map((r) => r.area).filter((a): a is string => !!a)),
  ).sort()

  const ent = DOMINIO.tareas
  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              {ent.singular} · <span className="text-app-secondary">{tarea.codigo ?? tarea.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {tarea.nombre}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={tarea.activo ? "green" : "gray"}>
              {tarea.activo ? "Activa" : "Inactiva"}
            </Badge>
            {/* La conversación, también acá (0029): si entrás a la tarea desde
                la tabla, lo primero que querés es leer lo que se dijo. */}
            <TareaComentariosDialog
              tareaId={tarea.id}
              tareaNombre={tarea.nombre}
              noLeidos={Number(resumen?.no_leidos ?? 0)}
              total={Number(resumen?.total ?? 0)}
              usuarioId={user.id}
            />
            <ToggleTareaActivoButton tareaId={tarea.id} activo={tarea.activo} />
          </div>
        </header>

        <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <TareaForm
            mode="edit"
            tareaId={tarea.id}
            initial={{
              codigo: tarea.codigo ?? undefined,
              nombre: tarea.nombre,
              descripcion: tarea.descripcion ?? undefined,
              area: tarea.area ?? undefined,
              asignado_a: tarea.asignado_a ?? undefined,
              prioridad: tarea.prioridad,
              tiempo_estimado_min: tarea.tiempo_estimado_min ?? undefined,
              frecuencia: tarea.frecuencia,
              dia_semana: tarea.dia_semana ?? undefined,
              dia_mes: tarea.dia_mes ?? undefined,
              hora_sugerida: tarea.hora_sugerida?.slice(0, 5) ?? undefined,
              fecha_limite: tarea.fecha_limite ?? undefined,
              manual_url: tarea.manual_url ?? undefined,
            } satisfies Partial<TareaInput>}
            usuarios={(usuarios ?? []) as { id: string; nombre: string; rol: string }[]}
            areasExistentes={areasExistentes}
          />
        </section>
      </div>
    </div>
  )
}
