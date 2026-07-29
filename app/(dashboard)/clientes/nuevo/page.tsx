import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { ClienteForm } from "@/components/clientes/ClienteForm"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { esAdmin as esRolAdmin, puedeCargarClientes } from "@/lib/permisos"

export default async function NuevoClientePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  // El vendedor también da de alta clientes desde la 0028 (decisión del cliente
  // 2026-07-29). Marketing sigue afuera: no carga fichas de clientes.
  if (!profile?.activo || !puedeCargarClientes(profile.rol)) {
    redirect(DOMINIO.clientes.ruta)
  }

  // La lista de precios del cliente la asigna SOLO el admin: define lo que paga
  // en cada venta futura. Al vendedor ni se le renderiza el selector, y el
  // trigger clientes_lista_precio_admin_only lo frena igual en la base si el
  // payload llegara por otro lado.
  const puedeAsignarLista = esRolAdmin(profile.rol)

  const { data: listasPrecios } = puedeAsignarLista
    ? await supabase
        .from("listas_precios")
        .select("id, id_publico, nombre")
        .eq("activo", true)
        .order("nombre")
    : { data: [] }

  const ent = DOMINIO.clientes

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
            Elegí el tipo (mayorista o minorista) y cargá los datos que tengas. Solo el nombre es obligatorio.
          </p>
        </header>

        <ClienteForm
          mode="create"
          listasPrecios={(listasPrecios ?? []) as { id: string; id_publico: string; nombre: string }[]}
        />
      </div>
    </div>
  )
}
