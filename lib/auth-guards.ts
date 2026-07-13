import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"
import { ROL } from "@/lib/constants"

// Discriminated union con literal boolean `ok`. Garantiza narrowing de TS:
// tras `if (!guard.ok) return ...`, el compilador sabe que guard es AdminGuardOk
// y `guard.supabase` / `guard.user` dejan de ser posiblemente null.
type AdminGuardOk = {
  ok: true
  supabase: SupabaseClient
  user: User
}
type AdminGuardFail = {
  ok: false
  error: string
}
export type AdminGuardResult = AdminGuardOk | AdminGuardFail

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
  return { ok: true, supabase, user }
}
