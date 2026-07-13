import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { VentaForm } from "@/components/ventas/VentaForm"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"

export default async function NuevaVentaPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("activo")
    .eq("id", user.id)
    .single()
  if (!profile?.activo) redirect("/login")

  const [{ data: clientes }, { data: productos }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, id_publico, nombre, apellido, razon_social, tipo, lista_precio_id")
      .eq("activo", true)
      .order("razon_social", { ascending: true, nullsFirst: false })
      .order("nombre")
      .limit(500),
    supabase
      .from("productos_catalogo")
      .select("id, id_publico, nombre, precio_base, stock_actual, activo")
      .eq("activo", true)
      .order("nombre")
      .limit(500),
  ])

  const ent = DOMINIO.ventas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            {ent.plural} · {nuevoLabel(ent)}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Nueva venta
          </h1>
          <p className="text-app-secondary mt-1">
            Elegí el cliente, agregá productos y el precio se resuelve en vivo. Registrar
            aplica stock, comisión e historial en una sola transacción.
          </p>
        </header>

        <VentaForm
          clientes={(clientes ?? []) as Parameters<typeof VentaForm>[0]["clientes"]}
          productos={(productos ?? []) as Parameters<typeof VentaForm>[0]["productos"]}
        />
      </div>
    </div>
  )
}
