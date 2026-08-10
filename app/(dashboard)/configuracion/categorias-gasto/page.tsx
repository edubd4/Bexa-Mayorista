import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { CategoriasGastoManager } from "@/components/configuracion/CategoriasGastoManager"
import { ROL } from "@/lib/constants"
import { logPerfilError } from "@/lib/auth-guards"

export default async function CategoriasGastoPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("CategoriasGastoPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data: categorias } = await supabase
    .from("categorias_gasto")
    .select("id, nombre, descripcion, activo")
    .order("nombre")

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/configuracion"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a configuración
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Configuración · Categorías
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Categorías de gasto
          </h1>
          <p className="text-app-secondary mt-1">
            Definen qué opciones aparecen al registrar un gasto. Las que se desactivan no se ven pero mantienen el histórico.
          </p>
        </header>

        <CategoriasGastoManager
          categorias={(categorias ?? []) as { id: number; nombre: string; descripcion: string | null; activo: boolean }[]}
        />
      </div>
    </div>
  )
}
