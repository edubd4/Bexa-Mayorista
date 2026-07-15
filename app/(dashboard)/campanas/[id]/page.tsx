import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft, Pencil, Receipt } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CampanaEstadoBadge } from "@/components/campanas/CampanaEstadoBadge"
import { CambiarEstadoButtons } from "@/components/campanas/CambiarEstadoButtons"
import { MetricasCard } from "@/components/campanas/MetricasCard"
import { MetricasManualesForm } from "@/components/campanas/MetricasManualesForm"
import { PublicacionesManager } from "@/components/campanas/PublicacionesManager"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import type {
  EstadoCampanaEfectivo,
  EstadoCampanaManual,
  EstadoPublicacion,
  MetricasManuales,
} from "@/lib/validators/campana"

type Params = { params: { id: string } }

type CampanaFull = {
  id: string
  id_publico: string
  nombre: string
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  estado_manual: EstadoCampanaManual | null
  estado_efectivo: EstadoCampanaEfectivo
  presupuesto_estimado: number
  gasto_id: string | null
  costo_real: number | null
  metricas_manuales: MetricasManuales
  notas: string | null
}

export default async function CampanaDetalle({ params }: Params) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles").select("rol, activo").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")

  const [{ data: campanaRaw }, { data: canalesTodos }] = await Promise.all([
    supabase.from("v_campanas").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("campana_canales").select("id, nombre").eq("activo", true).order("nombre"),
  ])

  if (!campanaRaw) notFound()
  const campana = campanaRaw as unknown as CampanaFull

  const [
    { data: metricasRaw },
    { data: asigCanales },
    { data: asigProductos },
    { data: publicacionesRaw },
    { data: gasto },
  ] = await Promise.all([
    supabase.from("v_campana_metricas").select("*").eq("campana_id", campana.id).maybeSingle(),
    supabase.from("campana_canal_asignaciones").select("canal_id, canal:canal_id(nombre)").eq("campana_id", campana.id),
    supabase.from("campana_productos").select("producto_id, producto:producto_id(id_publico, nombre, marca)").eq("campana_id", campana.id),
    supabase.from("campana_publicaciones").select("id, id_publico, canal_id, titulo, cuerpo, fecha_publicacion, estado").eq("campana_id", campana.id).order("created_at", { ascending: false }),
    campana.gasto_id
      ? supabase.from("gastos").select("id, id_publico, monto, descripcion, fecha").eq("id", campana.gasto_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const metricas = (metricasRaw ?? {
    ventas_manuales: 0, monto_manual: 0,
    ventas_automaticas: 0, monto_automatico: 0,
    ventas_totales: 0, monto_total: 0,
    costo: 0, roi_pct: null, ticket_promedio: 0,
  }) as Parameters<typeof MetricasCard>[0]["metricas"]

  const canales = ((asigCanales ?? []) as unknown as Array<{
    canal_id: number; canal: { nombre: string } | null
  }>).map((r) => ({ id: r.canal_id, nombre: r.canal?.nombre ?? "—" }))

  const productos = ((asigProductos ?? []) as unknown as Array<{
    producto_id: string; producto: { id_publico: string; nombre: string; marca: string | null } | null
  }>).map((r) => ({
    id: r.producto_id,
    id_publico: r.producto?.id_publico ?? "—",
    nombre: r.producto?.nombre ?? "—",
    marca: r.producto?.marca ?? null,
  }))

  const publicaciones = ((publicacionesRaw ?? []) as unknown as Array<{
    id: string; id_publico: string; canal_id: number | null;
    titulo: string | null; cuerpo: string;
    fecha_publicacion: string | null; estado: EstadoPublicacion
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

        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              {ent.singular} · {campana.id_publico}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1 flex items-center gap-3">
              {campana.nombre}
              <CampanaEstadoBadge estado={campana.estado_efectivo} />
            </h1>
            <p className="text-app-secondary mt-1">
              {formatFecha(campana.fecha_inicio)} → {formatFecha(campana.fecha_fin)}
              {" · "}
              Presupuesto {formatPesos(Number(campana.presupuesto_estimado))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`${ent.ruta}/${campana.id}/edit`}>
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Link>
            </Button>
          </div>
        </header>

        {/* Estados manuales */}
        <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">Estado de la campaña</h2>
              <p className="text-xs text-app-muted mt-1">
                Sistema calcula PROGRAMADA/ACTIVA/CONCLUIDA por fecha. Vos podés PAUSAR o CANCELAR.
              </p>
            </div>
            <CambiarEstadoButtons
              campanaId={campana.id}
              estadoEfectivo={campana.estado_efectivo}
              estadoManual={campana.estado_manual}
            />
          </div>
        </section>

        {/* Métricas */}
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Métricas</h2>
          <MetricasCard metricas={metricas} />
          <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <h3 className="font-display font-semibold text-base mb-3">Métricas manuales (redes)</h3>
            <MetricasManualesForm campanaId={campana.id} initial={campana.metricas_manuales ?? {}} />
          </div>
        </section>

        {/* Descripción + gasto asociado */}
        {(campana.descripcion || gasto || campana.notas) && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {campana.descripcion && (
              <div className="rounded-xl border border-app-line-soft bg-app-card p-5 md:col-span-2">
                <h3 className="font-display font-semibold text-sm mb-2">Descripción</h3>
                <p className="text-sm text-app-secondary whitespace-pre-wrap">{campana.descripcion}</p>
              </div>
            )}
            {gasto && (
              <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
                <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-app-amber" /> Gasto asociado
                </h3>
                <p className="font-mono text-[10.5px] text-app-accent">{gasto.id_publico}</p>
                <p className="text-sm mt-1">{gasto.descripcion}</p>
                <p className="text-sm font-mono text-app-red mt-1">-{formatPesos(Number(gasto.monto))}</p>
                <p className="text-xs text-app-muted mt-1">{formatFecha(gasto.fecha)}</p>
              </div>
            )}
            {campana.notas && (
              <div className="rounded-xl border border-app-line-soft bg-app-card p-5 md:col-span-3">
                <h3 className="font-display font-semibold text-sm mb-2">Notas internas</h3>
                <p className="text-sm text-app-secondary whitespace-pre-wrap">{campana.notas}</p>
              </div>
            )}
          </section>
        )}

        {/* Canales + productos */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <h3 className="font-display font-semibold text-base mb-3">Canales de difusión</h3>
            {canales.length === 0 ? (
              <p className="text-sm text-app-muted">Sin canales asignados.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {canales.map((c) => <Badge key={c.id} variant="accent">{c.nombre}</Badge>)}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <h3 className="font-display font-semibold text-base mb-3">
              Productos incluidos · {productos.length}
            </h3>
            {productos.length === 0 ? (
              <p className="text-sm text-app-muted">
                Sin productos. Las métricas automáticas necesitan al menos uno.
              </p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {productos.map((p) => (
                  <li key={p.id} className="text-sm flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-app-accent">{p.id_publico}</span>
                    <span>{p.nombre}</span>
                    {p.marca && <span className="text-app-muted text-xs">· {p.marca}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Publicaciones */}
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Publicaciones</h2>
          <PublicacionesManager
            campanaId={campana.id}
            canales={canalesTodos ?? []}
            publicaciones={publicaciones}
          />
        </section>
      </div>
    </div>
  )
}
