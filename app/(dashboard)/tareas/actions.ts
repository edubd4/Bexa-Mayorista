"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuthenticated } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  cambiarEstadoOcurrenciaSchema,
  tareaSchema,
  type CambiarEstadoOcurrenciaInput,
  type TareaInput,
} from "@/lib/validators/tarea"
import { ESTADO_TAREA_LABEL } from "@/lib/tareas-ui"

type ActionResult = { ok: false; error: string } | { ok: true }

// ─── Catálogo (admin) ──────────────────────────────────────────────────────
export async function createTarea(input: TareaInput): Promise<ActionResult> {
  const parsed = tareaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("tareas")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id_publico, nombre")
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la tarea" }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Tarea ${data.id_publico} · ${data.nombre}`,
    entidadTipo: "tarea",
    entidadId: data.id_publico,
    payload: { asignado_a: parsed.data.asignado_a ?? null, frecuencia: parsed.data.frecuencia },
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  return { ok: true }
}

export async function updateTarea(id: string, input: TareaInput): Promise<ActionResult> {
  const parsed = tareaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("tareas")
    .select("id_publico")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Tarea no encontrada" }

  // Los campos de frecuencia no aplicables viajan como null explícito: si una
  // semanal pasa a diaria, dia_semana tiene que limpiarse, no quedar colgado.
  const { error } = await supabase
    .from("tareas")
    .update({
      ...parsed.data,
      codigo:              parsed.data.codigo ?? null,
      descripcion:         parsed.data.descripcion ?? null,
      area:                parsed.data.area ?? null,
      asignado_a:          parsed.data.asignado_a ?? null,
      tiempo_estimado_min: parsed.data.tiempo_estimado_min ?? null,
      dia_semana:          parsed.data.frecuencia === "SEMANAL" ? parsed.data.dia_semana : null,
      dia_mes:             parsed.data.frecuencia === "MENSUAL" ? parsed.data.dia_mes : null,
      hora_sugerida:       parsed.data.hora_sugerida ?? null,
      fecha_limite:        parsed.data.fecha_limite ?? null,
      manual_url:          parsed.data.manual_url ?? null,
      updated_by:          user.id,
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Tarea ${current.id_publico} · ${parsed.data.nombre} actualizada`,
    entidadTipo: "tarea",
    entidadId: current.id_publico,
    payload: { asignado_a: parsed.data.asignado_a ?? null, frecuencia: parsed.data.frecuencia },
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  revalidatePath(`${DOMINIO.tareas.ruta}/${id}`)
  return { ok: true }
}

export async function toggleTareaActivo(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("tareas")
    .select("id_publico, nombre, activo")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Tarea no encontrada" }

  const nuevo = !current.activo
  const { error } = await supabase
    .from("tareas")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Tarea ${current.id_publico} ${nuevo ? "reactivada" : "desactivada"}`,
    entidadTipo: "tarea",
    entidadId: current.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  revalidatePath(`${DOMINIO.tareas.ruta}/${id}`)
  return { ok: true }
}

// ─── Ejecución (el empleado marca; el server sella la hora) ────────────────
export async function cambiarEstadoOcurrencia(
  input: CambiarEstadoOcurrenciaInput,
): Promise<ActionResult> {
  const parsed = cambiarEstadoOcurrenciaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAuthenticated()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase.rpc("cambiar_estado_ocurrencia", {
    p_ocurrencia_id: parsed.data.ocurrencia_id,
    p_estado:        parsed.data.estado,
    p_notas:         parsed.data.notas ?? null,
  })
  if (error) return { ok: false, error: error.message }

  const { data: oc } = await supabase
    .from("tarea_ocurrencias")
    .select("fecha, tarea:tarea_id ( id_publico, nombre )")
    .eq("id", parsed.data.ocurrencia_id)
    .maybeSingle()
  const tarea = (oc as unknown as { tarea: { id_publico: string; nombre: string } | null } | null)?.tarea

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Tarea ${tarea?.id_publico ?? ""} · ${tarea?.nombre ?? ""} → ${ESTADO_TAREA_LABEL[parsed.data.estado]}`,
    entidadTipo: "tarea",
    entidadId: tarea?.id_publico ?? parsed.data.ocurrencia_id,
    payload: { estado: parsed.data.estado, fecha: (oc as { fecha?: string } | null)?.fecha ?? null, notas: parsed.data.notas ?? null },
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  return { ok: true }
}

// Tareas "cuando corresponda": el asignado la materializa el día que la hace.
export async function registrarTareaEventual(tareaId: string): Promise<ActionResult> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase.rpc("crear_ocurrencia_eventual", { p_tarea_id: tareaId })
  if (error) return { ok: false, error: error.message }

  const { data: t } = await supabase
    .from("tareas")
    .select("id_publico, nombre")
    .eq("id", tareaId)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Tarea ${t?.id_publico ?? ""} · ${t?.nombre ?? ""} registrada para hoy`,
    entidadTipo: "tarea",
    entidadId: t?.id_publico ?? tareaId,
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  return { ok: true }
}
