import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { ProveedorForm } from "@/components/proveedores/ProveedorForm"
import { ToggleProveedorActivoButton } from "@/components/proveedores/ToggleProveedorActivoButton"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logPerfilError } from "@/lib/auth-guards"

type Params = { id: string }

type ProveedorRow = {
  id: string
  id_publico: string
  nombre: string
  cuit: string | null
  contacto_nombre: string | null
  telefono: string | null
  whatsapp: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  provincia: string | null
  condiciones_pago: string | null
  notas: string | null
  activo: boolean
}

export default async function ProveedorDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("ProveedorDetallePage", perfilError)
  if (!profile?.activo) redirect("/login")

  const esAdmin = profile.rol === ROL.ADMIN

  const { data: proveedor } = await supabase
    .from("proveedores")
    .select(
      "id, id_publico, nombre, cuit, contacto_nombre, telefono, whatsapp, email, direccion, ciudad, provincia, condiciones_pago, notas, activo",
    )
    .eq("id", params.id)
    .maybeSingle<ProveedorRow>()

  if (!proveedor) notFound()

  const ent = DOMINIO.proveedores
  const ubicacion = [proveedor.direccion, proveedor.ciudad, proveedor.provincia]
    .filter(Boolean)
    .join(", ")

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

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              {ent.singular} · <span className="text-app-secondary">{proveedor.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {proveedor.nombre}
            </h1>
            {(proveedor.cuit || proveedor.condiciones_pago) && (
              <p className="text-app-secondary mt-1 font-mono text-xs">
                {proveedor.cuit && <span>CUIT {proveedor.cuit}</span>}
                {proveedor.cuit && proveedor.condiciones_pago && <span> · </span>}
                {proveedor.condiciones_pago && <span>{proveedor.condiciones_pago}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={proveedor.activo ? "green" : "gray"}>
              {proveedor.activo ? "Activo" : "Inactivo"}
            </Badge>
            {esAdmin && (
              <ToggleProveedorActivoButton
                proveedorId={proveedor.id}
                idPublico={proveedor.id_publico}
                activo={proveedor.activo}
              />
            )}
          </div>
        </header>

        {/* Chips de contacto rápido */}
        {(proveedor.contacto_nombre || proveedor.telefono || proveedor.email || ubicacion) && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            {proveedor.contacto_nombre && (
              <p className="text-sm">
                <span className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest mr-2">
                  Contacto
                </span>
                {proveedor.contacto_nombre}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-app-secondary">
              {proveedor.telefono && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-app-muted" />
                  {proveedor.telefono}
                  {proveedor.whatsapp && proveedor.whatsapp !== proveedor.telefono && (
                    <span className="text-app-muted"> · WA {proveedor.whatsapp}</span>
                  )}
                </span>
              )}
              {proveedor.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-app-muted" />
                  {proveedor.email}
                </span>
              )}
              {ubicacion && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-app-muted" />
                  {ubicacion}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Form de edición (o vista de solo lectura para no-admin) */}
        {esAdmin ? (
          <ProveedorForm
            mode="edit"
            proveedorId={proveedor.id}
            initial={{
              nombre: proveedor.nombre,
              cuit: proveedor.cuit ?? undefined,
              contacto_nombre: proveedor.contacto_nombre ?? undefined,
              telefono: proveedor.telefono ?? undefined,
              whatsapp: proveedor.whatsapp ?? undefined,
              email: proveedor.email ?? undefined,
              direccion: proveedor.direccion ?? undefined,
              ciudad: proveedor.ciudad ?? undefined,
              provincia: proveedor.provincia ?? undefined,
              condiciones_pago: proveedor.condiciones_pago ?? undefined,
              notas: proveedor.notas ?? undefined,
            }}
          />
        ) : (
          proveedor.notas && (
            <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-2">
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Notas
              </p>
              <p className="text-sm text-app-text whitespace-pre-wrap">{proveedor.notas}</p>
            </section>
          )
        )}
      </div>
    </div>
  )
}
