import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { PosTerminal } from "@/components/pos/PosTerminal"
import { DOMINIO } from "@/lib/dominio"
import { ROL } from "@/lib/constants"
import { logPerfilError } from "@/lib/auth-guards"
import { normalizarCuit } from "@/lib/validators/facturacion"

// ─── Mostrador (POS) ────────────────────────────────────────────────────────
// La pasarela de pago del local: escáner USB (teclea el código + Enter),
// carrito en vivo, y cierre en un paso — registrar + cobrar + facturar.
// Toda la mecánica pesada ya existe: registrar_venta / cobrar_venta (RPCs
// transaccionales) y emitirFactura. Esta pantalla solo los encadena.

export default async function PosPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("PosPage", perfilError)
  if (!profile?.activo) redirect("/login")
  // Marketing no vende (misma regla que /ventas/nuevo).
  if (profile.rol === ROL.MARKETING) redirect("/panel")

  const [{ data: clientes }, { data: cfgCuit }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, id_publico, nombre, apellido, razon_social, tipo, condicion_iva, documento")
      .eq("activo", true)
      .order("razon_social", { ascending: true, nullsFirst: false })
      .order("nombre")
      .limit(500),
    supabase
      .from("configuracion")
      .select("valor")
      .eq("clave", "afip_cuit")
      .maybeSingle(),
  ])

  const ent = DOMINIO.pos

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-4 md:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Ventas · {ent.singular}
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">
            Mostrador
          </h1>
          <p className="text-app-secondary mt-1 text-sm">
            Escaneá los productos con el lector — el carrito se arma solo. El precio
            respeta la lista del cliente y los descuentos por cantidad, como siempre.
          </p>
        </header>

        <PosTerminal
          clientes={(clientes ?? []) as Parameters<typeof PosTerminal>[0]["clientes"]}
          afipConfigurada={Boolean(normalizarCuit(cfgCuit?.valor))}
        />
      </div>
    </div>
  )
}
