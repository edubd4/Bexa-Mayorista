"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  CONSUMIDOR_FINAL_ID,
  clienteSchema,
  nombreVisible,
  type ClienteInput,
} from "@/lib/validators/cliente"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function createCliente(input: ClienteInput): Promise<ActionResult> {
  const parsed = clienteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("clientes")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id, id_publico, tipo, nombre, apellido, razon_social")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el cliente" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Cliente ${data.id_publico} · ${nombreVisible(data)}`,
    entidadTipo: "cliente",
    entidadId: data.id_publico,
    payload: { tipo: parsed.data.tipo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.clientes.ruta)
  redirect(`${DOMINIO.clientes.ruta}/${data.id}`)
}

export async function updateCliente(id: string, input: ClienteInput): Promise<ActionResult> {
  const parsed = clienteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  // El cliente especial Consumidor Final no se edita: la UI de venta rápida lo asume tal cual.
  if (id === CONSUMIDOR_FINAL_ID) {
    return { ok: false, error: "El Consumidor Final es un cliente del sistema — no se edita." }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("clientes")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .select("id_publico")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Cliente ${data.id_publico} editado`,
    entidadTipo: "cliente",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.clientes.ruta)
  revalidatePath(`${DOMINIO.clientes.ruta}/${id}`)
  return { ok: true }
}

export async function toggleClienteActivo(id: string): Promise<ActionResult> {
  // Consumidor Final no se puede desactivar (invariante que asume ventas).
  if (id === CONSUMIDOR_FINAL_ID) {
    return { ok: false, error: "El Consumidor Final no se puede desactivar." }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current, error: readErr } = await supabase
    .from("clientes")
    .select("activo, id_publico")
    .eq("id", id)
    .single()
  if (readErr || !current) return { ok: false, error: "Cliente no encontrado" }

  const nuevo = !current.activo

  const { error } = await supabase
    .from("clientes")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Cliente ${current.id_publico} ${nuevo ? "reactivado" : "desactivado"}`,
    entidadTipo: "cliente",
    entidadId: current.id_publico,
    payload: { activo_anterior: current.activo, activo_nuevo: nuevo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.clientes.ruta)
  revalidatePath(`${DOMINIO.clientes.ruta}/${id}`)
  return { ok: true }
}
