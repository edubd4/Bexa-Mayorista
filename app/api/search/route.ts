import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { buscarGlobal } from "@/lib/search-sources"
import { ROL } from "@/lib/constants"
import { logPerfilError } from "@/lib/auth-guards"

// GET /api/search?q=texto
// Busca en las fuentes registradas en lib/search-sources.ts (hasta 5 por tipo).
// La RLS filtra por rol, y además le pasamos el contexto del usuario a las
// fuentes para que filtren explícitamente lo que es de alcance restringido
// (ventas). Ver el encabezado de lib/search-sources.ts.
export async function GET(req: Request) {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })
  }

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("SearchRoute", perfilError)
  if (!profile?.activo) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })
  }

  const url = new URL(req.url)
  // Comas y paréntesis son sintaxis del filtro .or() de PostgREST: si viajan
  // dentro del término rompen la query. Los reemplazamos por espacio.
  const q = (url.searchParams.get("q") ?? "").replace(/[,()]/g, " ").trim()
  if (q.length < 2) {
    return NextResponse.json({ ok: true, data: { resultados: [] } })
  }

  const resultados = await buscarGlobal(supabase, q, {
    userId: user.id,
    esAdmin: profile.rol === ROL.ADMIN,
  })

  return NextResponse.json({ ok: true, data: { resultados } })
}
