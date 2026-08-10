import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { GastoForm } from "@/components/gastos/GastoForm"
import { ROL } from "@/lib/constants"
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { logPerfilError } from "@/lib/auth-guards"

export default async function NuevoGastoPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("NuevoGastoPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const [{ data: categorias }, { data: campanas }] = await Promise.all([
    supabase
      .from("categorias_gasto")
      .select("id, nombre, descripcion")
      .eq("activo", true)
      .order("nombre"),
    // Para imputar el gasto a una campaña desde acá (0028). Las concluidas
    // entran igual: la factura de la pauta llega después de que terminó.
    supabase
      .from("campanas")
      .select("id, id_publico, nombre")
      .order("fecha_inicio", { ascending: false })
      .limit(100),
  ])

  const ent = DOMINIO.gastos

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a gastos
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            {ent.plural} · {nuevoLabel(ent)}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Nuevo gasto
          </h1>
          <p className="text-app-secondary mt-1">
            El monto se registra como EGRESO en caja automáticamente.
          </p>
        </header>

        <GastoForm
          categorias={(categorias ?? []) as { id: number; nombre: string; descripcion: string | null }[]}
          campanas={(campanas ?? []) as { id: string; id_publico: string; nombre: string }[]}
        />
      </div>
    </div>
  )
}
