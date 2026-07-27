import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"
import { ROL, type Rol } from "@/lib/constants"

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()

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
// no cargan mercadería (matriz de la 0015).
export async function requireCargaProductos(): Promise<AdminGuardResult> {
  return requireRol(
    [ROL.ADMIN, ROL.COLABORADOR],
    "No tenés permiso para dar de alta productos",
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()

  if (!profile?.activo || profile.rol !== ROL.ADMIN) {
    return { ok: false, error: "Solo un admin puede realizar esta acción" }
  }
  return { ok: true, supabase, user, rol: ROL.ADMIN }
}
