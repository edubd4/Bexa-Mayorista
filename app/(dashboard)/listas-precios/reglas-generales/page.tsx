import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { ReglasManager } from "@/components/listas-precios/ReglasManager"
import { ROL } from "@/lib/constants"
import type { ScopeDescuento } from "@/lib/validators/lista-precio"
import { logPerfilError } from "@/lib/auth-guards"

type Regla = {
  id: string
  id_publico: string
  scope: ScopeDescuento
  producto_id: string | null
  categoria: string | null
  cantidad_min: number
  descuento_pct: number
  activo: boolean
  producto: { id_publico: string; nombre: string } | null
}

export default async function ReglasGeneralesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("ReglasGeneralesPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const [productosRes, reglasRes] = await Promise.all([
    supabase
      .from("productos_catalogo")
      .select("id, id_publico, nombre, categoria")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("reglas_descuento")
      .select("id, id_publico, scope, producto_id, categoria, cantidad_min, descuento_pct, activo, producto:producto_id ( id_publico, nombre )")
      .is("lista_precio_id", null)
      .order("cantidad_min"),
  ])

  const productos = (productosRes.data ?? []) as { id: string; id_publico: string; nombre: string; categoria: string | null }[]
  const reglas = (reglasRes.data ?? []) as unknown as Regla[]
  const categorias = Array.from(new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))).sort()

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          href="/listas-precios"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a listas
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Comercial · Reglas generales
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Reglas generales</h1>
          <p className="text-app-secondary mt-1">
            Descuentos que aplican a TODAS las listas y también a ventas sin lista asignada.
          </p>
        </header>

        <ReglasManager
          listaId={null}
          productos={productos}
          categorias={categorias}
          reglas={reglas}
          ambito="global"
        />
      </div>
    </div>
  )
}
