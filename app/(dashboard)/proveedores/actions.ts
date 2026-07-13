"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import { proveedorSchema, type ProveedorInput } from "@/lib/validators/proveedor"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function createProveedor(input: ProveedorInput): Promise<ActionResult> {
  const parsed = proveedorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("proveedores")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id, id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el proveedor" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Proveedor ${data.id_publico} · ${data.nombre}`,
    entidadTipo: "proveedor",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.proveedores.ruta)
  redirect(`${DOMINIO.proveedores.ruta}/${data.id}`)
}

export async function updateProveedor(id: string, input: ProveedorInput): Promise<ActionResult> {
  const parsed = proveedorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("proveedores")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .select("id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar el proveedor" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Proveedor ${data.id_publico} editado`,
    entidadTipo: "proveedor",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.proveedores.ruta)
  revalidatePath(`${DOMINIO.proveedores.ruta}/${id}`)
  return { ok: true }
}

export async function toggleProveedorActivo(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current, error: readErr } = await supabase
    .from("proveedores")
    .select("activo, id_publico")
    .eq("id", id)
    .single()
  if (readErr || !current) return { ok: false, error: "Proveedor no encontrado" }

  const nuevo = !current.activo

  const { error } = await supabase
    .from("proveedores")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    // Reactivar = MODIFICACION (no re-alta). Desactivar = BAJA lógica (soft delete).
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Proveedor ${current.id_publico} ${nuevo ? "reactivado" : "desactivado"}`,
    entidadTipo: "proveedor",
    entidadId: current.id_publico,
    payload: { activo_anterior: current.activo, activo_nuevo: nuevo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.proveedores.ruta)
  revalidatePath(`${DOMINIO.proveedores.ruta}/${id}`)
  return { ok: true }
}
