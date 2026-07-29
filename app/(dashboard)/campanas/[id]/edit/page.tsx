import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { CampanaForm } from "@/components/campanas/CampanaForm"
import { DOMINIO } from "@/lib/dominio"
import { puedeGestionarCampanas } from "@/lib/permisos"
import type { CampanaInput, EstadoCampanaManual } from "@/lib/validators/campana"

type Params = { params: { id: string } }

export default async function EditarCampanaPage({ params }: Params) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles").select("rol, activo").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")
  // Editar campañas es de marketing (y del admin). Ver 0017.
  if (!puedeGestionarCampanas(profile.rol)) redirect(`${DOMINIO.campanas.ruta}/${params.id}`)

  const [{ data: campana }, { data: canales }, { data: productos }, { data: asigCanales }, { data: asigProductos }] = await Promise.all([
    supabase.from("campanas").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("campana_canales").select("id, nombre").eq("activo", true).order("nombre"),
    // productos_catalogo, no productos: la tabla completa es admin-only y a
    // marketing le llegaba el selector vacío. Ver la nota en nueva/page.tsx.
    supabase.from("productos_catalogo").select("id, id_publico, nombre, marca").eq("activo", true).order("nombre"),
    supabase.from("campana_canal_asignaciones").select("canal_id").eq("campana_id", params.id),
    supabase.from("campana_productos").select("producto_id").eq("campana_id", params.id),
  ])

  if (!campana) notFound()

  const initial: Partial<CampanaInput> = {
    nombre: campana.nombre,
    descripcion: campana.descripcion ?? undefined,
    fecha_inicio: campana.fecha_inicio,
    fecha_fin: campana.fecha_fin,
    estado_manual: campana.estado_manual as EstadoCampanaManual | null,
    presupuesto_estimado: Number(campana.presupuesto_estimado),
    notas: campana.notas ?? undefined,
    canal_ids: (asigCanales ?? []).map((r) => r.canal_id as number),
    producto_ids: (asigProductos ?? []).map((r) => r.producto_id as string),
  }

  const ent = DOMINIO.campanas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link href={`${ent.ruta}/${campana.id}`}
            className="inline-flex items-center gap-1 text-sm text-app-secondary hover:text-app-accent">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al detalle
          </Link>
        </div>
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            {ent.singular} · {campana.id_publico}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Editar: {campana.nombre}
          </h1>
        </header>

        <CampanaForm
          mode="edit"
          campanaId={campana.id}
          initial={initial}
          canales={canales ?? []}
          productos={productos ?? []}
        />
      </div>
    </div>
  )
}
