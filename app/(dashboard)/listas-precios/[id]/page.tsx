import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { ItemsManager } from "@/components/listas-precios/ItemsManager"
import { ListaHeaderForm } from "@/components/listas-precios/ListaHeaderForm"
import { ReglasManager } from "@/components/listas-precios/ReglasManager"
import { ToggleListaActivoButton } from "@/components/listas-precios/ToggleListaActivoButton"
import { ROL } from "@/lib/constants"
import type { ScopeDescuento } from "@/lib/validators/lista-precio"
import { logPerfilError } from "@/lib/auth-guards"

type Params = { id: string }

type Item = {
  id: string
  producto_id: string
  precio: number
  producto: { id: string; id_publico: string; nombre: string; precio_base: number } | null
}
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

export default async function ListaPreciosDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("ListaPreciosDetallePage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data: lista } = await supabase
    .from("listas_precios")
    .select("id, id_publico, nombre, proveedor_id, notas, activo")
    .eq("id", params.id)
    .maybeSingle<{
      id: string
      id_publico: string
      nombre: string
      proveedor_id: string | null
      notas: string | null
      activo: boolean
    }>()
  if (!lista) notFound()

  const [proveedoresRes, productosRes, itemsRes, reglasRes] = await Promise.all([
    supabase.from("proveedores").select("id, id_publico, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("productos_catalogo")
      .select("id, id_publico, nombre, categoria, precio_base")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("listas_precios_items")
      .select("id, producto_id, precio, producto:producto_id ( id, id_publico, nombre, precio_base )")
      .eq("lista_precio_id", lista.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reglas_descuento")
      .select("id, id_publico, scope, producto_id, categoria, cantidad_min, descuento_pct, activo, producto:producto_id ( id_publico, nombre )")
      .eq("lista_precio_id", lista.id)
      .order("cantidad_min"),
  ])

  const proveedores = (proveedoresRes.data ?? []) as { id: string; id_publico: string; nombre: string }[]
  const productos = (productosRes.data ?? []) as { id: string; id_publico: string; nombre: string; categoria: string | null; precio_base: number }[]
  const items = (itemsRes.data ?? []) as unknown as Item[]
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

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Lista · <span className="text-app-secondary">{lista.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">{lista.nombre}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={lista.activo ? "green" : "gray"}>
              {lista.activo ? "Activa" : "Inactiva"}
            </Badge>
            <ToggleListaActivoButton listaId={lista.id} idPublico={lista.id_publico} activo={lista.activo} />
          </div>
        </header>

        <ListaHeaderForm
          mode="edit"
          listaId={lista.id}
          initial={{
            nombre: lista.nombre,
            proveedor_id: lista.proveedor_id ?? undefined,
            notas: lista.notas ?? undefined,
          }}
          proveedores={proveedores}
        />

        <ItemsManager listaId={lista.id} productos={productos} items={items} />

        <ReglasManager
          listaId={lista.id}
          productos={productos}
          categorias={categorias}
          reglas={reglas}
          ambito="lista"
        />
      </div>
    </div>
  )
}
