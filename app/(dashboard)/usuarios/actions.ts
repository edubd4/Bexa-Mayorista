"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  usuarioCreateSchema,
  usuarioUpdateSchema,
  passwordResetSchema,
  type UsuarioCreateInput,
  type UsuarioUpdateInput,
  type PasswordResetInput,
} from "@/lib/validators/usuario"
import { logHistorial } from "@/lib/historial"
import { ROL, TIPO_EVENTO } from "@/lib/constants"

type ActionResult<T = void> =
  | { ok: false; error: string }
  | { ok: true; data?: T }

export async function createUsuario(input: UsuarioCreateInput): Promise<ActionResult> {
  const parsed = usuarioCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user: adminUser } = guard

  // Para crear un usuario necesitamos service_role: bypass RLS + auth.admin
  const admin = createServiceRoleClient()

  // El trigger handle_new_user() (SECURITY DEFINER) ya lee `nombre` y `rol`
  // del raw_user_meta_data y crea el profile correctamente. No hace falta
  // update posterior. Ese update lanzaba "permission denied for table profiles"
  // por como resuelve PostgREST el service_role con RLS habilitada.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,       // no exigimos flujo de email en el MVP
    user_metadata: {
      nombre: parsed.data.nombre,
      rol: parsed.data.rol,
    },
  })

  if (createErr || !created?.user) {
    return { ok: false, error: createErr?.message ?? "No se pudo crear el usuario" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Nuevo usuario · ${parsed.data.nombre} (${parsed.data.email}) como ${parsed.data.rol}`,
    entidadTipo: "usuario",
    entidadId: created.user.id,
    userId: adminUser.id,
  })

  revalidatePath("/usuarios")
  redirect(`/usuarios/${created.user.id}`)
}

export async function updateUsuario(id: string, input: UsuarioUpdateInput): Promise<ActionResult> {
  const parsed = usuarioUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user: adminUser } = guard

  // Bloqueos de seguridad sobre el usuario que se esta editando:
  const editandoAsiMismo = id === adminUser.id
  if (editandoAsiMismo) {
    if (parsed.data.rol !== ROL.ADMIN) {
      return { ok: false, error: "No podés quitarte a vos mismo el rol admin" }
    }
    if (!parsed.data.activo) {
      return { ok: false, error: "No podés desactivarte a vos mismo" }
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      nombre: parsed.data.nombre,
      rol: parsed.data.rol,
      activo: parsed.data.activo,
    })
    .eq("id", id)
    .select("email, nombre, rol, activo")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar el usuario" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Usuario ${data.email} actualizado (${data.rol}, ${data.activo ? "activo" : "inactivo"})`,
    entidadTipo: "usuario",
    entidadId: id,
    payload: parsed.data,
    userId: adminUser.id,
  })

  revalidatePath("/usuarios")
  revalidatePath(`/usuarios/${id}`)
  return { ok: true }
}

export async function resetPasswordUsuario(id: string, input: PasswordResetInput): Promise<ActionResult> {
  const parsed = passwordResetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Contraseña inválida" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user: adminUser } = guard

  const admin = createServiceRoleClient()

  const { error } = await admin.auth.admin.updateUserById(id, {
    password: parsed.data.password,
  })
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Password reseteada para usuario ${id}`,
    entidadTipo: "usuario",
    entidadId: id,
    userId: adminUser.id,
  })

  return { ok: true }
}

// Hard delete de usuario: borra de auth.users → cascade borra de profiles.
// El historial de acciones que hizo ese usuario NO se borra (no hay FK).
// El admin NO puede eliminarse a si mismo.
export async function deleteUsuario(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user: adminUser } = guard

  if (id === adminUser.id) {
    return { ok: false, error: "No podés eliminarte a vos mismo" }
  }

  // Snapshot para el historial antes de borrar
  const { data: victim } = await supabase
    .from("profiles")
    .select("email, nombre, rol")
    .eq("id", id)
    .maybeSingle()

  const admin = createServiceRoleClient()

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.BAJA,
    descripcion: `Usuario eliminado · ${victim?.email ?? id}`,
    entidadTipo: "usuario",
    entidadId: id,
    payload: victim ?? { note: "profile no encontrado al momento del delete" },
    userId: adminUser.id,
  })

  revalidatePath("/usuarios")
  return { ok: true }
}
