import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Instagram, Mail, MapPin, Phone, Shield } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { ClienteForm } from "@/components/clientes/ClienteForm"
import { ToggleClienteActivoButton } from "@/components/clientes/ToggleClienteActivoButton"
import { EliminarButton } from "@/components/ui/eliminar-button"
import { eliminarCliente } from "@/app/(dashboard)/clientes/actions"
import { TIPO_CLIENTE_LABEL, TIPO_CLIENTE_VARIANT } from "@/lib/clientes-ui"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { puedeCargarClientes } from "@/lib/permisos"
import {
  CONSUMIDOR_FINAL_ID,
  nombreVisible,
  type TipoCliente,
} from "@/lib/validators/cliente"

type Params = { id: string }

type ClienteRow = {
  id: string
  id_publico: string
  tipo: TipoCliente
  nombre: string
  apellido: string | null
  razon_social: string | null
  documento: string | null
  telefono: string | null
  whatsapp: string | null
  instagram: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  provincia: string | null
  lista_precio_id: string | null
  notas: string | null
  activo: boolean
}

export default async function ClienteDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (!profile?.activo) redirect("/login")

  const esAdmin = profile.rol === ROL.ADMIN
  // Desde la 0028 el vendedor edita, da de baja y elimina clientes. Lo único
  // que queda para el admin es asignar la lista de precios.
  const puedeGestionar = puedeCargarClientes(profile.rol)

  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, id_publico, tipo, nombre, apellido, razon_social, documento, telefono, whatsapp, instagram, email, direccion, ciudad, provincia, lista_precio_id, notas, activo",
    )
    .eq("id", params.id)
    .maybeSingle<ClienteRow>()

  if (!cliente) notFound()

  // Solo para el admin: al vendedor no se le renderiza el selector de lista
  // (con el array vacío la sección ni aparece) y el trigger
  // clientes_lista_precio_admin_only lo bloquea igual en la base.
  const { data: listasPrecios } = esAdmin
    ? await supabase
        .from("listas_precios")
        .select("id, id_publico, nombre")
        .eq("activo", true)
        .order("nombre")
    : { data: [] }

  const esConsumidorFinal = cliente.id === CONSUMIDOR_FINAL_ID
  const ent = DOMINIO.clientes
  const ubicacion = [cliente.direccion, cliente.ciudad, cliente.provincia]
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
              {ent.singular} · <span className="text-app-secondary">{cliente.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {nombreVisible(cliente)}
            </h1>
            {cliente.documento && (
              <p className="text-app-secondary mt-1 font-mono text-xs">
                {cliente.tipo === "MAYORISTA" ? "CUIT" : "Doc"} {cliente.documento}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={TIPO_CLIENTE_VARIANT[cliente.tipo]}>
              {TIPO_CLIENTE_LABEL[cliente.tipo]}
            </Badge>
            <Badge variant={cliente.activo ? "green" : "gray"}>
              {cliente.activo ? "Activo" : "Inactivo"}
            </Badge>
            {puedeGestionar && !esConsumidorFinal && (
              <>
                <ToggleClienteActivoButton
                  clienteId={cliente.id}
                  idPublico={cliente.id_publico}
                  activo={cliente.activo}
                />
                <EliminarButton
                  action={eliminarCliente.bind(null, cliente.id)}
                  etiqueta={`${cliente.id_publico} · ${nombreVisible(cliente)}`}
                  entidad="cliente"
                  redirectTo={DOMINIO.clientes.ruta}
                />
              </>
            )}
          </div>
        </header>

        {esConsumidorFinal && (
          <div className="rounded-xl border border-app-accent/40 bg-app-accent/10 px-5 py-4 flex items-start gap-3">
            <Shield className="w-4 h-4 text-app-accent mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-display font-semibold text-app-accent">Cliente del sistema</p>
              <p className="text-app-secondary mt-0.5">
                Se usa para ventas minoristas sin cliente registrado. No se edita ni se desactiva.
              </p>
            </div>
          </div>
        )}

        {(cliente.telefono || cliente.whatsapp || cliente.instagram || cliente.email || ubicacion) && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm text-app-secondary">
              {cliente.telefono && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-app-muted" />
                  {cliente.telefono}
                  {cliente.whatsapp && cliente.whatsapp !== cliente.telefono && (
                    <span className="text-app-muted"> · WA {cliente.whatsapp}</span>
                  )}
                </span>
              )}
              {cliente.instagram && (
                <span className="inline-flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-app-muted" />
                  @{cliente.instagram}
                </span>
              )}
              {cliente.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-app-muted" />
                  {cliente.email}
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

        {puedeGestionar && !esConsumidorFinal ? (
          <ClienteForm
            mode="edit"
            clienteId={cliente.id}
            listasPrecios={(listasPrecios ?? []) as { id: string; id_publico: string; nombre: string }[]}
            initial={{
              tipo: cliente.tipo,
              nombre: cliente.nombre,
              apellido: cliente.apellido ?? undefined,
              razon_social: cliente.razon_social ?? undefined,
              documento: cliente.documento ?? undefined,
              telefono: cliente.telefono ?? undefined,
              whatsapp: cliente.whatsapp ?? undefined,
              instagram: cliente.instagram ?? undefined,
              email: cliente.email ?? undefined,
              direccion: cliente.direccion ?? undefined,
              ciudad: cliente.ciudad ?? undefined,
              provincia: cliente.provincia ?? undefined,
              lista_precio_id: cliente.lista_precio_id ?? undefined,
              notas: cliente.notas ?? undefined,
            }}
          />
        ) : (
          cliente.notas && (
            <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-2">
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Notas
              </p>
              <p className="text-sm text-app-text whitespace-pre-wrap">{cliente.notas}</p>
            </section>
          )
        )}
      </div>
    </div>
  )
}
