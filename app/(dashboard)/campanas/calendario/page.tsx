import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAuthenticated } from "@/lib/auth-guards"
import { CampanasCalendario } from "@/components/campanas/CampanasCalendario"
import { DOMINIO } from "@/lib/dominio"
import type { EstadoCampanaEfectivo } from "@/lib/validators/campana"

export default async function CalendarioPage() {
  // El gate es EXACTAMENTE `requireAuthenticated`: el calendario lo lee
  // cualquier rol activo (no mira el rol ni calcula ninguna capacidad de
  // `lib/permisos.ts`) y los dos motivos de rechazo van al mismo destino. El
  // guard loguea el error de lectura del perfil en vez de descartarlo.
  const guard = await requireAuthenticated()
  if (!guard.ok) redirect("/login")
  const { supabase } = guard

  const { data: campanas } = await supabase
    .from("v_campanas")
    .select("id, id_publico, nombre, fecha_inicio, fecha_fin, estado_efectivo")
    .order("fecha_inicio")

  const items = ((campanas ?? []) as unknown as Array<{
    id: string; id_publico: string; nombre: string;
    fecha_inicio: string; fecha_fin: string; estado_efectivo: EstadoCampanaEfectivo;
  }>)

  const ent = DOMINIO.campanas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link href={ent.ruta} className="inline-flex items-center gap-1 text-sm text-app-secondary hover:text-app-accent">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a {ent.plural.toLowerCase()}
          </Link>
        </div>
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Marketing · Calendario
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Calendario de {ent.plural.toLowerCase()}
          </h1>
          <p className="text-app-secondary mt-1">
            Todas las campañas en el tiempo. Color según estado. Clickeá una para ver el detalle.
          </p>
        </header>

        <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <CampanasCalendario campanas={items} />
        </div>
      </div>
    </div>
  )
}
