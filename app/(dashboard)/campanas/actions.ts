"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
// Las campañas las gestiona marketing (y el admin). El vendedor las lee desde
// las pantallas, pero ninguna de estas acciones le corresponde. Antes las 6
// usaban requireAuthenticated (sin mirar rol) y la RLS era FOR ALL a cualquier
// autenticado: un vendedor podía crear, editar presupuesto y borrar
// publicaciones. Ver 0017.
import { requireGestionCampanas } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  campanaSchema,
  publicacionSchema,
  metricasManualesSchema,
  ESTADO_CAMPANA_MANUAL,
  type CampanaInput,
  type CampanaUpdate,
  type EstadoCampanaManual,
  type PublicacionInput,
  type MetricasManuales,
} from "@/lib/validators/campana"

type ActionResult = { ok: false; error: string } | { ok: true }

// ─── Reemplazar M:N de asignaciones (canales/productos) ────────────────────
async function syncAsignaciones(
  supabase: SupabaseClient,
  tabla: "campana_canal_asignaciones" | "campana_productos",
  campanaId: string,
  columnaFk: "canal_id" | "producto_id",
  ids: (string | number)[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase.from(tabla).delete().eq("campana_id", campanaId)
  if (delErr) return { error: delErr.message }
  if (ids.length === 0) return { error: null }
  const rows = ids.map((id) => ({ campana_id: campanaId, [columnaFk]: id }))
  const { error: insErr } = await supabase.from(tabla).insert(rows)
  return { error: insErr?.message ?? null }
}

// ─── Crear campaña ─────────────────────────────────────────────────────────
export async function createCampana(input: CampanaInput): Promise<ActionResult> {
  const parsed = campanaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { canal_ids, producto_ids, ...campo } = parsed.data
  const { data, error } = await supabase
    .from("campanas")
    .insert({
      ...campo,
      estado_manual: campo.estado_manual ?? ESTADO_CAMPANA_MANUAL.BORRADOR,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear la campaña" }
  }

  const asig1 = await syncAsignaciones(supabase, "campana_canal_asignaciones", data.id, "canal_id", canal_ids)
  if (asig1.error) return { ok: false, error: asig1.error }
  const asig2 = await syncAsignaciones(supabase, "campana_productos", data.id, "producto_id", producto_ids)
  if (asig2.error) return { ok: false, error: asig2.error }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Campaña ${data.id_publico} · ${data.nombre}`,
    entidadTipo: "campana",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.campanas.ruta)
  redirect(`${DOMINIO.campanas.ruta}/${data.id}`)
}

// ─── Editar campaña (nombre, fechas, presupuesto, gasto, canales, productos) ─
export async function updateCampana(id: string, input: CampanaInput): Promise<ActionResult> {
  const parsed = campanaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { canal_ids, producto_ids, ...campo } = parsed.data
  const { data, error } = await supabase
    .from("campanas")
    .update({ ...campo, updated_by: user.id })
    .eq("id", id)
    .select("id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar la campaña" }
  }

  const asig1 = await syncAsignaciones(supabase, "campana_canal_asignaciones", id, "canal_id", canal_ids)
  if (asig1.error) return { ok: false, error: asig1.error }
  const asig2 = await syncAsignaciones(supabase, "campana_productos", id, "producto_id", producto_ids)
  if (asig2.error) return { ok: false, error: asig2.error }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Campaña ${data.id_publico} editada`,
    entidadTipo: "campana",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.campanas.ruta)
  revalidatePath(`${DOMINIO.campanas.ruta}/${id}`)
  return { ok: true }
}

// ─── Cambiar estado manual (pausar / reanudar / cancelar / marcar borrador) ─
// Un valor null desactiva el manual y el efectivo vuelve a calcularse por fecha.
export async function cambiarEstadoManual(
  id: string,
  estado: EstadoCampanaManual | null,
): Promise<ActionResult> {
  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const patch: Partial<CampanaUpdate> & { updated_by: string } = {
    estado_manual: estado,
    updated_by: user.id,
  }
  const { data, error } = await supabase
    .from("campanas")
    .update(patch)
    .eq("id", id)
    .select("id_publico")
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo cambiar el estado" }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.CAMBIO_ESTADO,
    descripcion: `Campaña ${data.id_publico} → ${estado ?? "AUTOMÁTICO"}`,
    entidadTipo: "campana",
    entidadId: data.id_publico,
    payload: { estado_manual: estado },
    userId: user.id,
  })

  revalidatePath(DOMINIO.campanas.ruta)
  revalidatePath(`${DOMINIO.campanas.ruta}/${id}`)
  return { ok: true }
}

// ─── Métricas manuales (impresiones, alcance, clicks, engagement, ...) ─────
export async function updateMetricasManuales(
  id: string,
  metricas: MetricasManuales,
): Promise<ActionResult> {
  const parsed = metricasManualesSchema.safeParse(metricas)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase
    .from("campanas")
    .update({ metricas_manuales: parsed.data, updated_by: user.id })
    .eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`${DOMINIO.campanas.ruta}/${id}`)
  return { ok: true }
}

// ─── Publicaciones (CRUD) ─────────────────────────────────────────────────
export async function crearPublicacion(input: PublicacionInput): Promise<ActionResult> {
  const parsed = publicacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase.from("campana_publicaciones").insert({
    ...parsed.data,
    created_by: user.id,
    updated_by: user.id,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`${DOMINIO.campanas.ruta}/${parsed.data.campana_id}`)
  return { ok: true }
}

export async function actualizarPublicacion(
  id: string,
  input: Partial<PublicacionInput>,
): Promise<ActionResult> {
  // Era la única de las 41 server actions sin Zod: hacía spread del input crudo,
  // así que desde un cliente manipulado se podía escribir cualquier columna de
  // campana_publicaciones — campana_id incluido, moviendo la publicación a otra
  // campaña. Hallazgo 5 de la auditoría.
  const parsed = publicacionSchema.partial().safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }
  // campana_id no se reasigna por esta vía: una publicación no cambia de campaña.
  const { campana_id: _ignorado, ...campos } = parsed.data

  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("campana_publicaciones")
    .update({ ...campos, updated_by: user.id })
    .eq("id", id)
    .select("campana_id")
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath(`${DOMINIO.campanas.ruta}/${data.campana_id}`)
  return { ok: true }
}

export async function borrarPublicacion(id: string): Promise<ActionResult> {
  const guard = await requireGestionCampanas()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase } = guard

  const { data: pub } = await supabase
    .from("campana_publicaciones")
    .select("campana_id")
    .eq("id", id)
    .single()

  const { error } = await supabase.from("campana_publicaciones").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  if (pub) revalidatePath(`${DOMINIO.campanas.ruta}/${pub.campana_id}`)
  return { ok: true }
}
