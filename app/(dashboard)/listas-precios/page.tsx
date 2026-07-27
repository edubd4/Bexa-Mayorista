import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, BookOpen } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LinkRow } from "@/components/ui/link-row"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"

// Listas de precios — admin-only (matriz PLAN-TECNICO §6).
export default async function ListasPreciosPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data: listas } = await supabase
    .from("listas_precios")
    .select("id, id_publico, nombre, activo, proveedor:proveedor_id ( id, id_publico, nombre )")
    .order("created_at", { ascending: false })

  const rows = (listas ?? []) as unknown as {
    id: string
    id_publico: string
    nombre: string
    activo: boolean
    proveedor: { id: string; id_publico: string; nombre: string } | null
  }[]

  // Conteo simple de reglas generales (sin lista específica)
  const { count: reglasGeneralesCount } = await supabase
    .from("reglas_descuento")
    .select("id", { count: "exact", head: true })
    .is("lista_precio_id", null)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Comercial · Listas de precios
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              Listas de precios
            </h1>
            <p className="text-app-secondary mt-1">
              Precio por producto según cliente, con reglas de descuento por cantidad.
            </p>
          </div>
          <Button asChild>
            <Link href="/listas-precios/nuevo">
              <Plus className="w-4 h-4" />
              Nueva lista
            </Link>
          </Button>
        </header>

        <AyudaPantalla
          que="Una lista de precios es un precio especial para un grupo de clientes. En vez de cargarle un precio distinto a cada cliente, armás una lista (por ejemplo 'Mayorista') y se la asignás a todos los que corresponda desde su ficha."
          cuando="Cuando un grupo de clientes te compra a otro precio que el mostrador: mayoristas, un cliente grande, una promoción por temporada. Si todos te compran al mismo precio, no necesitás listas: alcanza con el precio base de cada producto."
          ojo="Solo cargás en la lista los productos cuyo precio cambia. El producto que no está en la lista se vende a su precio base — no queda sin precio."
          seccion="listas-de-precios"
        />

        {/* Reglas generales (aplicables a todas las listas incluso ventas sin lista) */}
        <Link
          href="/listas-precios/reglas-generales"
          className="flex items-center justify-between rounded-xl border border-app-line-soft bg-app-card px-5 py-4 hover:border-app-accent/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-app-accent" />
            <div>
              <p className="font-display font-semibold">Reglas generales</p>
              <p className="text-xs text-app-secondary">
                Descuentos que aplican a TODAS las listas (o a ventas sin lista asignada).
              </p>
            </div>
          </div>
          <Badge variant="accent">{reglasGeneralesCount ?? 0} regla{(reglasGeneralesCount ?? 0) === 1 ? "" : "s"}</Badge>
        </Link>

        {/* Tabla de listas */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={4}>
                  Todavía no creaste listas. Una lista es un precio especial
                  para un grupo de clientes — por ejemplo &quot;Mayorista&quot;.
                  Si todos te compran al mismo precio, no necesitás ninguna.
                </TableEmpty>
              ) : (
                rows.map((l) => (
                  <LinkRow key={l.id} href={`/listas-precios/${l.id}`}>
                    <TableCell className="font-mono text-app-accent text-xs">{l.id_publico}</TableCell>
                    <TableCell className="font-medium">{l.nombre}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {l.proveedor ? `${l.proveedor.id_publico} · ${l.proveedor.nombre}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={l.activo ? "green" : "gray"}>
                        {l.activo ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
