import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { CompraForm } from "@/components/compras/CompraForm"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { logPerfilError } from "@/lib/auth-guards"

export default async function NuevaCompraPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("NuevaCompraPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect(DOMINIO.compras.ruta)

  const [{ data: proveedores }, { data: productos }] = await Promise.all([
    supabase
      .from("proveedores")
      .select("id, id_publico, nombre")
      .eq("activo", true)
      .order("nombre"),
    // Admin ve la tabla completa (con costo) para poder editarlo desde acá.
    supabase
      .from("productos")
      .select("id, id_publico, nombre, costo, stock_actual")
      .eq("activo", true)
      .order("nombre"),
  ])

  const ent = DOMINIO.compras

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
            Nueva compra
          </h1>
          <p className="text-app-secondary mt-1">
            Cargá qué recibiste del proveedor. El stock se suma automático y el costo del producto se actualiza.
          </p>
        </header>

        <CompraForm
          proveedores={(proveedores ?? []) as { id: string; id_publico: string; nombre: string }[]}
          productos={(productos ?? []) as Parameters<typeof CompraForm>[0]["productos"]}
        />
      </div>
    </div>
  )
}
