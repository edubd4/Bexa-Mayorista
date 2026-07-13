"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { logHistorial } from "@/lib/historial"
import {
  listaPrecioItemSchema,
  listaPrecioSchema,
  reglaDescuentoSchema,
  type ListaPrecioInput,
  type ListaPrecioItemInput,
  type ReglaDescuentoInput,
} from "@/lib/validators/lista-precio"

type ActionResult = { ok: false; error: string } | { ok: true }

const RUTA = "/listas-precios"

// ─── Listas ────────────────────────────────────────────────────────────────
export async function createLista(input: ListaPrecioInput): Promise<ActionResult> {
  const parsed = listaPrecioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("listas_precios")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id, id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear la lista" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Lista ${data.id_publico} · ${data.nombre}`,
    entidadTipo: "lista_precio",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(RUTA)
  redirect(`${RUTA}/${data.id}`)
}

export async function updateLista(id: string, input: ListaPrecioInput): Promise<ActionResult> {
  const parsed = listaPrecioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("listas_precios")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .select("id_publico")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar la lista" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Lista ${data.id_publico} editada`,
    entidadTipo: "lista_precio",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(RUTA)
  revalidatePath(`${RUTA}/${id}`)
  return { ok: true }
}

export async function toggleListaActivo(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("listas_precios")
    .select("activo, id_publico")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Lista no encontrada" }

  const nuevo = !current.activo
  const { error } = await supabase
    .from("listas_precios")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Lista ${current.id_publico} ${nuevo ? "reactivada" : "desactivada"}`,
    entidadTipo: "lista_precio",
    entidadId: current.id_publico,
    userId: user.id,
  })

  revalidatePath(RUTA)
  revalidatePath(`${RUTA}/${id}`)
  return { ok: true }
}

// ─── Items ─────────────────────────────────────────────────────────────────
export async function upsertItemLista(input: ListaPrecioItemInput): Promise<ActionResult> {
  const parsed = listaPrecioItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase
    .from("listas_precios_items")
    .upsert(
      { ...parsed.data, created_by: user.id, updated_by: user.id },
      { onConflict: "lista_precio_id,producto_id" },
    )
  if (error) return { ok: false, error: error.message }

  revalidatePath(`${RUTA}/${parsed.data.lista_precio_id}`)
  return { ok: true }
}

export async function removeItemLista(listaId: string, itemId: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase } = guard

  const { error } = await supabase.from("listas_precios_items").delete().eq("id", itemId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`${RUTA}/${listaId}`)
  return { ok: true }
}

// ─── Reglas de descuento ───────────────────────────────────────────────────
export async function createRegla(input: ReglaDescuentoInput): Promise<ActionResult> {
  const parsed = reglaDescuentoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("reglas_descuento")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id_publico")
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la regla" }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Regla ${data.id_publico} · ${parsed.data.scope} · ${parsed.data.cantidad_min}+ → ${parsed.data.descuento_pct}%`,
    entidadTipo: "regla_descuento",
    entidadId: data.id_publico,
    payload: { ...parsed.data },
    userId: user.id,
  })

  if (parsed.data.lista_precio_id) revalidatePath(`${RUTA}/${parsed.data.lista_precio_id}`)
  revalidatePath(RUTA)
  return { ok: true }
}

export async function toggleReglaActivo(id: string, listaId: string | null): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("reglas_descuento")
    .select("activo, id_publico")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Regla no encontrada" }

  const nuevo = !current.activo
  const { error } = await supabase
    .from("reglas_descuento")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Regla ${current.id_publico} ${nuevo ? "reactivada" : "desactivada"}`,
    entidadTipo: "regla_descuento",
    entidadId: current.id_publico,
    userId: user.id,
  })

  if (listaId) revalidatePath(`${RUTA}/${listaId}`)
  revalidatePath(RUTA)
  return { ok: true }
}
