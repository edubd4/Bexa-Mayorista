import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { ProveedorForm } from "@/components/proveedores/ProveedorForm"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { logPerfilError } from "@/lib/auth-guards"

export default async function NuevoProveedorPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("NuevoProveedorPage", perfilError)

  // Solo admin puede dar de alta proveedores (matriz de permisos PLAN-TECNICO §6).
  if (profile?.rol !== ROL.ADMIN || !profile.activo) {
    redirect(DOMINIO.proveedores.ruta)
  }

  const ent = DOMINIO.proveedores

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            {ent.plural} · Alta
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {nuevoLabel(ent)}
          </h1>
          <p className="text-app-secondary mt-1">
            Cargá los datos de identificación y contacto. El resto es opcional.
          </p>
        </header>

        <ProveedorForm mode="create" />
      </div>
    </div>
  )
}
