import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { ConfiguracionForm } from "@/components/configuracion/ConfiguracionForm"
import { CONFIG_FIELDS } from "@/lib/validators/configuracion"
import { ROL } from "@/lib/constants"

export default async function ConfiguracionPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user!.id)
    .single()

  if (profile?.rol !== ROL.ADMIN || !profile.activo) {
    redirect("/panel")
  }

  // Traigo todos los valores conocidos. Si alguna clave no existe (por si
  // se agregara despues), la muestro vacia.
  const { data: rows } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", CONFIG_FIELDS.map((f) => f.clave))

  const values = Object.fromEntries(
    (rows ?? []).map((r) => [r.clave, (r.valor as string | null) ?? ""])
  ) as Record<string, string>

  // Rellenar con "" las claves faltantes para que el form no tire warnings
  for (const f of CONFIG_FIELDS) {
    if (!(f.clave in values)) values[f.clave] = ""
  }

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Módulo · Configuración
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Datos del negocio y parámetros
          </h1>
          <p className="text-app-secondary mt-1 max-w-2xl">
            Estos valores se usan en toda la app: nombre en encabezados y documentos,
            datos de contacto y moneda por defecto. Los módulos que se activen suman
            sus parámetros acá.
          </p>
        </header>

        <ConfiguracionForm values={values} />
      </div>
    </div>
  )
}
