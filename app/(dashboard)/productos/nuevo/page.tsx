import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { ProductoForm } from "@/components/productos/ProductoForm"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"

export default async function NuevoProductoPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) {
    redirect(DOMINIO.productos.ruta)
  }

  const [{ data: proveedores }, { data: catRows }, { data: marcaRows }] = await Promise.all([
    supabase
      .from("proveedores")
      .select("id, id_publico, nombre")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("productos_catalogo")
      .select("categoria")
      .not("categoria", "is", null),
    supabase
      .from("productos_catalogo")
      .select("marca")
      .not("marca", "is", null),
  ])

  const categoriasExistentes = Array.from(
    new Set(((catRows ?? []) as { categoria: string | null }[])
      .map((r) => r.categoria)
      .filter((c): c is string => !!c)),
  ).sort()
  const marcasExistentes = Array.from(
    new Set(((marcaRows ?? []) as { marca: string | null }[])
      .map((r) => r.marca)
      .filter((m): m is string => !!m)),
  ).sort()

  const ent = DOMINIO.productos

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
            El stock inicial se carga después con un movimiento ENTRADA.
          </p>
        </header>

        <ProductoForm
          mode="create"
          proveedores={(proveedores ?? []) as { id: string; id_publico: string; nombre: string }[]}
          categoriasExistentes={categoriasExistentes}
          marcasExistentes={marcasExistentes}
        />
      </div>
    </div>
  )
}
