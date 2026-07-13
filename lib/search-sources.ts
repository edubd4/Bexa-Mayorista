import type { createServerClient } from "@/lib/supabase/server"
import type { IconKey } from "@/lib/nav"
import { DOMINIO } from "@/lib/dominio"

// ============================================================================
// Registry de fuentes de búsqueda global (server-side, consumido por /api/search).
// Cosechar un módulo = agregar UNA entrada acá. El CommandPalette no se toca.
// RLS filtra: cada rol ve solo lo que sus policies permiten.
// ============================================================================

export type SearchResult = {
  href: string
  label: string
  sub: string
  iconKey: IconKey
}

type Supabase = Awaited<ReturnType<typeof createServerClient>>

type SearchSource = (supabase: Supabase, like: string) => Promise<SearchResult[]>

// ─── Core: usuarios (RLS: admin ve todos; colaborador solo su perfil) ────────
const buscarUsuarios: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo")
    .or(`nombre.ilike.${like},email.ilike.${like}`)
    .limit(5)
  return (data ?? []).map((u) => ({
    href: `${DOMINIO.usuarios.ruta}/${u.id}`,
    label: u.nombre,
    sub: `${DOMINIO.usuarios.singular} · ${u.email}${u.activo ? "" : " · inactivo"}`,
    iconKey: "UserCog" as const,
  }))
}

// Los módulos cosechados agregan su fuente acá (clientes, ventas, ...).
const SOURCES: SearchSource[] = [
  buscarUsuarios,
]

export async function buscarGlobal(supabase: Supabase, q: string): Promise<SearchResult[]> {
  const like = `%${q}%`
  const resultados = await Promise.all(SOURCES.map((fn) => fn(supabase, like)))
  return resultados.flat()
}
