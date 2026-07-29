"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuthenticated } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  cambiarEstadoOcurrenciaSchema,
  comentarioTareaSchema,
  tareaSchema,
  FRECUENCIA_TAREA,
  type CambiarEstadoOcurrenciaInput,
  type ComentarioTareaInput,
  type FrecuenciaTarea,
  type TareaInput,
} from "@/lib/validators/tarea"
import { ESTADO_TAREA_LABEL, FRECUENCIA_TAREA_LABEL } from "@/lib/tareas-ui"
import { zUuid } from "@/lib/validators/shared"

type ActionResult<T = undefined> =
  | { ok: false; error: string }
  | { ok: true; data?: T }

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

// ─── Atajos de la tabla (admin): asignar y cambiar frecuencia ──────────────
export async function asignarTarea(
  tareaId: string,
  usuarioId: string | null,
): Promise<ActionResult> {
  if (!zUuid().safeParse(tareaId).success) return { ok: false, error: "Tarea inválida" }
  if (usuarioId !== null && !zUuid().safeParse(usuarioId).success) {
    return { ok: false, error: "Usuario inválido" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("tareas")
    .select("id_publico, nombre")
    .eq("id", tareaId)
    .maybeSingle()
  if (!current) return { ok: false, error: "Tarea no encontrada" }

  let nombreAsignado: string | null = null
  if (usuarioId) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre, activo")
      .eq("id", usuarioId)
      .maybeSingle()
    if (!perfil?.activo) return { ok: false, error: "Usuario no encontrado o inactivo" }
    nombreAsignado = perfil.nombre
  }

  const { error } = await supabase
    .from("tareas")
    .update({ asignado_a: usuarioId, updated_by: user.id })
    .eq("id", tareaId)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Tarea ${current.id_publico} · ${current.nombre} → ${nombreAsignado ?? "sin asignar"}`,
    entidadTipo: "tarea",
    entidadId: current.id_publico,
    payload: { asignado_a: usuarioId },
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  return { ok: true }
}

// Cambio rápido de frecuencia desde la fila. Si pasa a SEMANAL/MENSUAL sin
// día definido, arranca con lunes / día 1 — el fino se ajusta en la ficha.
export async function cambiarFrecuenciaTarea(
  tareaId: string,
  frecuencia: FrecuenciaTarea,
): Promise<ActionResult> {
  if (!zUuid().safeParse(tareaId).success) return { ok: false, error: "Tarea inválida" }
  if (!Object.values(FRECUENCIA_TAREA).includes(frecuencia)) {
    return { ok: false, error: "Frecuencia inválida" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("tareas")
    .select("id_publico, nombre, dia_semana, dia_mes")
    .eq("id", tareaId)
    .maybeSingle()
  if (!current) return { ok: false, error: "Tarea no encontrada" }

  const { error } = await supabase
    .from("tareas")
    .update({
      frecuencia,
      dia_semana: frecuencia === "SEMANAL" ? (current.dia_semana ?? 1) : null,
      dia_mes:    frecuencia === "MENSUAL" ? (current.dia_mes ?? 1) : null,
      updated_by: user.id,
    })
    .eq("id", tareaId)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Tarea ${current.id_publico} · frecuencia → ${FRECUENCIA_TAREA_LABEL[frecuencia].toLowerCase()}`,
    entidadTipo: "tarea",
    entidadId: current.id_publico,
    payload: { frecuencia },
    userId: user.id,
  })

  revalidatePath(DOMINIO.tareas.ruta)
  return { ok: true }
}

// ─── Comentarios (0026): la conversación queda EN la tarea ─────────────────
export type ComentarioTarea = {
  id: string
  texto: string
  created_at: string
  autor_id: string
  autor_nombre: string
  visto_por: string[]
}

// Trae la conversación y de paso marca como leídos los mensajes de otros:
// abrirla ES leerla. La RLS garantiza que solo se listan tareas visibles.
export async function listarComentarios(
  tareaId: string,
): Promise<ActionResult<ComentarioTarea[]>> {
  if (!zUuid().safeParse(tareaId).success) return { ok: false, error: "Tarea inválida" }

  const guard = await requireAuthenticated()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("tarea_comentarios")
    .select("id, texto, created_at, autor_id, autor:autor_id ( nombre )")
    .eq("tarea_id", tareaId)
    .order("created_at")
  if (error) return { ok: false, error: error.message }

  const comentarios = (data ?? []) as unknown as {
    id: string; texto: string; created_at: string; autor_id: string
    autor: { nombre: string } | null
  }[]

  // Marcar leídos los ajenos (idempotente por la PK compuesta).
  const ajenos = comentarios.filter((c) => c.autor_id !== user.id)
  if (ajenos.length > 0) {
    await supabase
      .from("tarea_comentario_lecturas")
      .upsert(
        ajenos.map((c) => ({ comentario_id: c.id, usuario_id: user.id })),
        { onConflict: "comentario_id,usuario_id", ignoreDuplicates: true },
      )
  }

  // "Visto por" para mostrar en la conversación.
  const { data: lecturas } = comentarios.length > 0
    ? await supabase
        .from("tarea_comentario_lecturas")
        .select("comentario_id, usuario:usuario_id ( nombre )")
        .in("comentario_id", comentarios.map((c) => c.id))
    : { data: [] }

  const vistosPorComentario = new Map<string, string[]>()
  for (const l of (lecturas ?? []) as unknown as { comentario_id: string; usuario: { nombre: string } | null }[]) {
    if (!l.usuario?.nombre) continue
    vistosPorComentario.set(l.comentario_id, [
      ...(vistosPorComentario.get(l.comentario_id) ?? []),
      l.usuario.nombre,
    ])
  }

  revalidatePath(DOMINIO.tareas.ruta)
  revalidatePath(`${DOMINIO.tareas.ruta}/${tareaId}`)
  revalidatePath("/panel")
  return {
    ok: true,
    data: comentarios.map((c) => ({
      id: c.id,
      texto: c.texto,
      created_at: c.created_at,
      autor_id: c.autor_id,
      autor_nombre: c.autor?.nombre ?? "—",
      visto_por: vistosPorComentario.get(c.id) ?? [],
    })),
  }
}

export async function enviarComentario(
  input: ComentarioTareaInput,
): Promise<ActionResult<ComentarioTarea>> {
  const parsed = comentarioTareaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAuthenticated()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  // La RLS valida la visibilidad (admin o asignado); acá solo insertamos.
  const { data, error } = await supabase
    .from("tarea_comentarios")
    .insert({ tarea_id: parsed.data.tarea_id, autor_id: user.id, texto: parsed.data.texto })
    .select("id, texto, created_at, autor_id, autor:autor_id ( nombre )")
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo enviar el comentario" }
  }

  const c = data as unknown as {
    id: string; texto: string; created_at: string; autor_id: string
    autor: { nombre: string } | null
  }

  // El Panel muestra el aviso global de mensajes sin leer (0029) y la ficha
  // tiene su propio globito: los tres tienen que enterarse del mensaje nuevo.
  revalidatePath(DOMINIO.tareas.ruta)
  revalidatePath(`${DOMINIO.tareas.ruta}/${parsed.data.tarea_id}`)
  revalidatePath("/panel")
  return {
    ok: true,
    data: {
      id: c.id,
      texto: c.texto,
      created_at: c.created_at,
      autor_id: c.autor_id,
      autor_nombre: c.autor?.nombre ?? "Yo",
      visto_por: [],
    },
  }
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
