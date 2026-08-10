import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"
import { ROL, type Rol } from "@/lib/constants"

// ★ Un fallo al LEER el perfil es indistinguible de "no tenés permiso" si se
// descarta el error: los dos terminan en un redirect al panel. Ese silencio
// costó una sesión entera de diagnóstico (perfil correcto en la base, app
// mostrando "sin rol"). La causa real vive en el mensaje de PostgREST: sin
// loguearlo no hay forma de distinguir RLS de credenciales de esquema.
// En Bexa el daño tiene una segunda cara: las pantallas no siempre rebotan —
// calculan una capacidad de `lib/permisos.ts` (`esAdmin`, `puedeGestionar...`)
// y, si la lectura falla, se dibujan sin controles, idénticas a las de un rol
// menor. Nadie fue redirigido a ningún lado: sin este log no hay síntoma.
export function logPerfilError(donde: string, error: PostgrestError | null) {
  if (!error) return
  console.error(
    `[auth] No se pudo leer el perfil en ${donde}: ${error.message}` +
      (error.code ? ` (code ${error.code})` : "") +
      (error.hint ? ` — hint: ${error.hint}` : ""),
  )
}

// Discriminated union con literal boolean `ok`. Garantiza narrowing de TS:
// tras `if (!guard.ok) return ...`, el compilador sabe que guard es AdminGuardOk
// y `guard.supabase` / `guard.user` dejan de ser posiblemente null.
type AdminGuardOk = {
  ok: true
  supabase: SupabaseClient
  user: User
  // El rol del que ejecuta. Lo necesitan las actions que se comportan distinto
  // según quién llama (ej: alta de producto — el admin define comisión, el
  // vendedor no).
  rol: Rol
}
type AdminGuardFail = {
  ok: false
  error: string
}
export type AdminGuardResult = AdminGuardOk | AdminGuardFail

// Guard reusable para server actions que puede ejecutar cualquier usuario activo
// (admin o colaborador). Uso: módulos donde admin+vendedor comparten CRUD (ej. campañas).
export async function requireAuthenticated(): Promise<AdminGuardResult> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: "No autenticado" }

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("requireAuthenticated", perfilError)

  if (!profile?.activo) return { ok: false, error: "Usuario inactivo" }
  return { ok: true, supabase, user, rol: profile.rol as Rol }
}

// Guard para las server actions que solo pueden ejecutar ciertos roles.
// Es la base de los guards de dominio de abajo — no se usa suelto, así los
// roles permitidos quedan escritos en un lugar con nombre, no desperdigados.
async function requireRol(
  permitidos: readonly Rol[],
  errorMsg: string,
): Promise<AdminGuardResult> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: "No autenticado" }

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  // `requireRol` es la base de los guards por capacidad (requireGestionCampanas,
  // requireCargaProductos, …). El nombre del guard concreto no llega hasta acá,
  // así que el log dice `requireRol` + los roles que se esperaban.
  logPerfilError(`requireRol(${permitidos.join(", ")})`, perfilError)

  if (!profile?.activo) return { ok: false, error: "Usuario inactivo" }
  if (!permitidos.includes(profile.rol as Rol)) return { ok: false, error: errorMsg }

  return { ok: true, supabase, user, rol: profile.rol as Rol }
}

// Campañas: las gestiona el área de marketing (y el admin). El vendedor las ve
// pero no las toca — decisión del cliente, ver 0017. Espeja exactamente a
// public.puede_gestionar_campanas() en SQL: si cambia uno, cambia el otro.
export async function requireGestionCampanas(): Promise<AdminGuardResult> {
  return requireRol(
    [ROL.ADMIN, ROL.MARKETING],
    "Las campañas las gestiona el área de marketing",
  )
}

// Catálogo de productos: lo carga el admin y el vendedor. Marketing no —
// no cargan mercadería (matriz de la 0015). Desde la 0028 cubre el CRUD
// completo (alta, edición y baja), no solo el alta.
export async function requireCargaProductos(): Promise<AdminGuardResult> {
  return requireRol(
    [ROL.ADMIN, ROL.COLABORADOR],
    "No tenés permiso para gestionar productos",
  )
}

// Clientes: mismo criterio que productos desde la 0028 (decisión del cliente
// 2026-07-29). Espeja a public.puede_cargar_catalogo() en SQL.
export async function requireCargaClientes(): Promise<AdminGuardResult> {
  return requireRol(
    [ROL.ADMIN, ROL.COLABORADOR],
    "No tenés permiso para gestionar clientes",
  )
}

// Gastos (0028): admin siempre; marketing solo para gastos de publicidad
// imputados a una campaña. Este guard deja pasar a los dos roles — las DOS
// condiciones de marketing las verifica registrar_gasto en SQL, que es donde
// no se pueden saltear llamando a supabase-js directo.
export async function requireRegistroGastos(): Promise<AdminGuardResult> {
  return requireRol(
    [ROL.ADMIN, ROL.MARKETING],
    "No tenés permiso para registrar gastos",
  )
}

// Guard reusable para server actions que solo pueden ejecutar admins.
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: "No autenticado" }
  }

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("requireAdmin", perfilError)

  if (!profile?.activo || profile.rol !== ROL.ADMIN) {
    return { ok: false, error: "Solo un admin puede realizar esta acción" }
  }
  return { ok: true, supabase, user, rol: ROL.ADMIN }
}
