import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { ListaHeaderForm } from "@/components/listas-precios/ListaHeaderForm"
import { ROL } from "@/lib/constants"

export default async function NuevaListaPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data: proveedores } = await supabase
    .from("proveedores")
    .select("id, id_publico, nombre")
    .eq("activo", true)
    .order("nombre")

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/listas-precios"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a listas
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Listas de precios · Alta
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Nueva lista
          </h1>
          <p className="text-app-secondary mt-1">
            Después de crearla, cargá los precios de los productos y las reglas de descuento.
          </p>
        </header>

        <ListaHeaderForm
          mode="create"
          proveedores={(proveedores ?? []) as { id: string; id_publico: string; nombre: string }[]}
        />
      </div>
    </div>
  )
}
