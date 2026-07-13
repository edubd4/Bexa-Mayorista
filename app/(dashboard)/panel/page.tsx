import Link from "next/link"
import {
  Users,
  Activity,
  ScrollText,
  Settings,
  ArrowRight,
} from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { formatFechaHora } from "@/lib/utils"
import { toISODate, ahoraArgentina, tsArgentina } from "@/lib/fechas"
import { ROL } from "@/lib/constants"
import { APP, DOMINIO } from "@/lib/dominio"
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_VARIANT } from "@/lib/historial-ui"

// ============================================================================
// Panel principal — landing del dashboard (CORE).
// - Admin: KPIs del sistema + últimos eventos del historial + accesos rápidos
// - Colaborador: bienvenida + sus accesos
// Los módulos de dominio cosechados suman sus KPIs/secciones acá al integrarse.
// ============================================================================

export default async function PanelPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user.id)
    .single()

  const nombre = profile?.nombre ?? user.email
  const esAdmin = profile?.rol === ROL.ADMIN

  if (esAdmin) {
    return <PanelAdmin nombre={nombre ?? "Admin"} />
  }
  return <PanelColaborador nombre={nombre ?? "Colaborador"} />
}

// ─── Admin ──────────────────────────────────────────────────────────────────
async function PanelAdmin({ nombre }: { nombre: string }) {
  const supabase = await createServerClient()
  // "Hoy" según la hora argentina, no la del server (UTC en Vercel).
  const hoyISO = toISODate(ahoraArgentina())

  const [usuariosActivosRes, eventosHoyRes, ultimosEventosRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),
    supabase
      .from("historial")
      .select("id", { count: "exact", head: true })
      .gte("created_at", tsArgentina(hoyISO)),
    supabase
      .from("historial")
      .select("id, tipo, descripcion, created_at, usuario:user_id ( nombre )")
      .order("created_at", { ascending: false })
      .limit(6),
  ])

  const usuariosActivos = usuariosActivosRes.count ?? 0
  const eventosHoy = eventosHoyRes.count ?? 0
  const eventos = (ultimosEventosRes.data ?? []) as unknown as {
    id: number
    tipo: string
    descripcion: string
    created_at: string
    usuario: { nombre: string } | null
  }[]

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Panel · Admin
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Hola, {nombre}
          </h1>
          <p className="text-app-secondary mt-1">
            Resumen del sistema. Los módulos que se activen suman sus indicadores acá.
          </p>
        </header>

        {/* KPIs del core */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI
            icon={<Users className="w-4 h-4" />}
            label={`${DOMINIO.usuarios.plural} activos`}
            value={String(usuariosActivos)}
            href={DOMINIO.usuarios.ruta}
            tone="accent"
          />
          <KPI
            icon={<Activity className="w-4 h-4" />}
            label="Actividad hoy"
            value={String(eventosHoy)}
            href={DOMINIO.historial.ruta}
            tone="green"
          />
          <KPI
            icon={<ScrollText className="w-4 h-4" />}
            label={DOMINIO.historial.plural}
            value="Ver"
            href={DOMINIO.historial.ruta}
            tone="violet"
          />
          <KPI
            icon={<Settings className="w-4 h-4" />}
            label={DOMINIO.configuracion.plural}
            value="Ajustar"
            href={DOMINIO.configuracion.ruta}
            tone="amber"
          />
        </section>

        {/* Últimos eventos */}
        <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-app-accent" />
              <h2 className="font-display font-semibold">Última actividad</h2>
            </div>
            <Link
              href={DOMINIO.historial.ruta}
              className="text-xs font-mono text-app-muted hover:text-app-accent"
            >
              Ver historial →
            </Link>
          </div>
          {eventos.length === 0 ? (
            <p className="text-sm text-app-muted font-mono">
              Sin actividad todavía. Los eventos del sistema van a aparecer acá.
            </p>
          ) : (
            <ul className="space-y-1">
              {eventos.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={TIPO_EVENTO_VARIANT[e.tipo] ?? "gray"}>
                      {TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm text-app-text truncate">{e.descripcion}</p>
                      <p className="text-[10.5px] font-mono text-app-muted">
                        {formatFechaHora(e.created_at)}
                        {e.usuario?.nombre ? ` · ${e.usuario.nombre}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Aviso de maestro sin módulos de dominio */}
        <Link
          href={DOMINIO.configuracion.ruta}
          className="flex items-center justify-between rounded-xl border border-app-line-soft bg-app-card px-5 py-4 hover:border-app-accent/40 transition-colors"
        >
          <div>
            <p className="font-display font-semibold">{APP.nombre} · core operativo</p>
            <p className="text-xs text-app-secondary font-mono mt-0.5">
              Auth, usuarios, configuración e historial andando. Los módulos de dominio se suman desde el catálogo.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-app-muted" />
        </Link>
      </div>
    </div>
  )
}

// ─── Colaborador ─────────────────────────────────────────────────────────────
async function PanelColaborador({ nombre }: { nombre: string }) {
  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Panel
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Hola, {nombre}
          </h1>
          <p className="text-app-secondary mt-1">
            Tus módulos aparecen en la barra lateral a medida que se habilitan.
          </p>
        </header>
      </div>
    </div>
  )
}

// ─── KPI card ───────────────────────────────────────────────────────────────
function KPI({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href: string
  tone: "accent" | "amber" | "violet" | "green"
}) {
  const toneClasses = {
    accent: "text-app-accent",
    amber: "text-app-amber",
    violet: "text-app-violet",
    green: "text-app-green",
  }[tone]

  return (
    <Link
      href={href}
      className="group rounded-xl border border-app-line-soft bg-app-card p-5 hover:border-app-accent/40 transition-colors"
    >
      <div className={`flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest ${toneClasses}`}>
        {icon}
        {label}
      </div>
      <p className="font-display text-2xl mt-2 text-app-text group-hover:text-app-accent transition-colors">
        {value}
      </p>
    </Link>
  )
}
