import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { CampanaForm } from "@/components/campanas/CampanaForm"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { puedeGestionarCampanas } from "@/lib/permisos"

export default async function NuevaCampanaPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles").select("rol, activo").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")
  // Las campañas las crea marketing (y el admin). Ver 0017.
  if (!puedeGestionarCampanas(profile.rol)) redirect(DOMINIO.campanas.ruta)

  const [{ data: canales }, { data: productos }] = await Promise.all([
    supabase.from("campana_canales").select("id, nombre").eq("activo", true).order("nombre"),
    // `productos_catalogo`, no `productos`: la tabla completa es admin-only por
    // RLS, así que a un usuario de marketing el selector le venía VACÍO y no
    // podía asociar productos a la campaña. El catálogo no trae costo.
    supabase.from("productos_catalogo").select("id, id_publico, nombre, marca").eq("activo", true).order("nombre"),
  ])

  const ent = DOMINIO.campanas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link
            href={ent.ruta}
            className="inline-flex items-center gap-1 text-sm text-app-secondary hover:text-app-accent"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a {ent.plural.toLowerCase()}
          </Link>
        </div>
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Marketing · {ent.plural}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {nuevoLabel(ent)}
          </h1>
        </header>

        <CampanaForm
          mode="create"
          canales={canales ?? []}
          productos={productos ?? []}
        />
      </div>
    </div>
  )
}
