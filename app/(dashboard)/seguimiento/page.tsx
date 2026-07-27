import Link from "next/link"
import { redirect } from "next/navigation"
import { UserRoundSearch, Phone, MessageCircle } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import { nombreVisible, type TipoCliente } from "@/lib/validators/cliente"
import { CopiarMensajeBtn } from "@/components/seguimiento/CopiarMensajeBtn"

// Template por defecto — placeholders {cliente} {negocio} {dias}.
// Se puede sobreescribir con la clave 'template_reactivacion' en configuracion.
const TEMPLATE_DEFAULT =
  "Hola {cliente}, ¿cómo va? Soy de {negocio}. Hace {dias} días que no te vemos por acá y te queríamos saludar. Si necesitás algo, te armamos el pedido enseguida."

type InactivoRow = {
  id: string
  id_publico: string
  tipo: TipoCliente
  nombre: string
  apellido: string | null
  razon_social: string | null
  telefono: string | null
  whatsapp: string | null
  instagram: string | null
  email: string | null
  ultima_venta: string | null
  dias_sin_comprar: number | null
  ventas_totales: number
  facturado_total: number
  ticket_promedio: number
}

export default async function SeguimientoPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles").select("rol, activo").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")

  const [{ data: umbralRow }, { data: negocioRow }, { data: tplRow }] = await Promise.all([
    supabase.from("configuracion").select("valor").eq("clave", "alerta_cliente_inactivo_dias").maybeSingle(),
    supabase.from("configuracion").select("valor").eq("clave", "negocio_nombre").maybeSingle(),
    supabase.from("configuracion").select("valor").eq("clave", "template_reactivacion").maybeSingle(),
  ])

  const umbral = Number(umbralRow?.valor ?? 60)
  const negocio = negocioRow?.valor ?? "el negocio"
  const template = tplRow?.valor?.trim() ? tplRow.valor : TEMPLATE_DEFAULT

  const { data: rows } = await supabase
    .from("v_clientes_inactivos")
    .select("*")
    .gte("dias_sin_comprar", umbral)
    .order("dias_sin_comprar", { ascending: false })

  const inactivos = ((rows ?? []) as unknown as InactivoRow[])
    .filter((r) => r.ventas_totales > 0)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Análisis · {DOMINIO.seguimiento.plural}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {inactivos.length > 0
              ? `${inactivos.length} cliente${inactivos.length === 1 ? "" : "s"} sin comprar hace ${umbral}+ días`
              : "Ningún cliente inactivo"}
          </h1>
          <p className="text-app-secondary mt-1">
            Clientes que dejaron de comprar. Los días de inactividad y el mensaje de
            contacto se ajustan desde{" "}
            <Link href="/configuracion" className="underline hover:text-app-accent">
              Configuración
            </Link>.
          </p>
        </header>

        <AyudaPantalla
          que="Los clientes que te compraban seguido y hace rato no aparecen, con el mensaje listo para copiar y mandarles."
          cuando="Una o dos veces por semana, cuando tenés un rato para salir a buscar ventas en vez de esperarlas."
          seccion="metodologia"
        />

        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center gap-2">
            <UserRoundSearch className="w-4 h-4 text-app-accent" />
            <h2 className="font-display font-semibold">Clientes inactivos</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Contacto</TableHead>
                <TableHead className="hidden md:table-cell">Última venta</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="hidden md:table-cell text-right">Ventas</TableHead>
                <TableHead className="hidden md:table-cell text-right">Ticket prom.</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right w-40">Mensaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inactivos.length === 0 ? (
                <TableEmpty colSpan={9}>
                  Ningún cliente con más de {umbral} días sin comprar. Buen trabajo.
                </TableEmpty>
              ) : inactivos.map((c) => {
                const nombre = nombreVisible(c)
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-app-accent text-xs">
                      <Link href={`${DOMINIO.clientes.ruta}/${c.id}`} className="hover:underline">
                        {c.id_publico}
                      </Link>
                    </TableCell>
                    <TableCell>{nombre}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      <div className="flex flex-col gap-0.5">
                        {c.whatsapp && (
                          <span className="inline-flex items-center gap-1.5">
                            <MessageCircle className="w-3 h-3 text-app-green" />
                            {c.whatsapp}
                          </span>
                        )}
                        {c.telefono && !c.whatsapp && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3 h-3" />
                            {c.telefono}
                          </span>
                        )}
                        {!c.whatsapp && !c.telefono && <span className="text-app-muted">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(c.ultima_venta)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-app-amber">
                      {c.dias_sin_comprar ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                      {c.ventas_totales}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                      {formatPesos(Number(c.ticket_promedio))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(c.facturado_total))}
                    </TableCell>
                    <TableCell className="text-right">
                      <CopiarMensajeBtn
                        template={template}
                        vars={{
                          cliente: nombre,
                          negocio,
                          dias: c.dias_sin_comprar ?? 0,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  )
}
