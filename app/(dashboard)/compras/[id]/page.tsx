import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { CancelarCompraButton } from "@/components/compras/CancelarCompraButton"
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
import { DOMINIO } from "@/lib/dominio"
import { formatFechaHora, formatPesos } from "@/lib/utils"
import { ESTADO_COMPRA_LABEL, ESTADO_COMPRA_VARIANT } from "@/lib/compras-ui"
import type { EstadoCompra } from "@/lib/validators/compra"
import { logPerfilError } from "@/lib/auth-guards"

type Params = { id: string }
type Compra = {
  id: string
  id_publico: string
  fecha: string
  estado: EstadoCompra
  total: number
  numero_factura: string | null
  notas: string | null
  cancelada_at: string | null
  cancelada_motivo: string | null
  proveedor: { id: string; id_publico: string; nombre: string } | null
}
type Item = {
  id: string
  cantidad: number
  costo_unitario: number
  subtotal: number
  producto: { id: string; id_publico: string; nombre: string } | null
}

export default async function CompraDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("CompraDetallePage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data: compra } = await supabase
    .from("compras")
    .select(`
      id, id_publico, fecha, estado, total, numero_factura, notas,
      cancelada_at, cancelada_motivo,
      proveedor:proveedor_id ( id, id_publico, nombre )
    `)
    .eq("id", params.id)
    .maybeSingle<Compra>()
  if (!compra) notFound()

  const { data: items } = await supabase
    .from("compra_items")
    .select("id, cantidad, costo_unitario, subtotal, producto:producto_id ( id, id_publico, nombre )")
    .eq("compra_id", compra.id)
    .order("id")

  const rows = (items ?? []) as unknown as Item[]
  const puedeCancelar = compra.estado !== "CANCELADA"
  const ent = DOMINIO.compras

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
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
              Compra · <span className="text-app-secondary">{compra.id_publico}</span>
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {compra.proveedor?.nombre ?? "—"}
            </h1>
            <p className="text-app-secondary mt-1 font-mono text-xs">
              {formatFechaHora(compra.fecha)}
              {compra.proveedor && (
                <>
                  {" · "}
                  <Link href={`${DOMINIO.proveedores.ruta}/${compra.proveedor.id}`} className="hover:text-app-accent">
                    {compra.proveedor.id_publico}
                  </Link>
                </>
              )}
              {compra.numero_factura && ` · Factura ${compra.numero_factura}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={ESTADO_COMPRA_VARIANT[compra.estado]}>
              {ESTADO_COMPRA_LABEL[compra.estado]}
            </Badge>
            {puedeCancelar && (
              <CancelarCompraButton compraId={compra.id} idPublico={compra.id_publico} />
            )}
          </div>
        </header>

        {compra.cancelada_at && (
          <div className="rounded-xl border border-app-red/40 bg-app-red/10 px-5 py-4">
            <p className="font-display font-semibold text-app-red">Compra cancelada</p>
            <p className="text-xs text-app-secondary font-mono mt-0.5">
              {formatFechaHora(compra.cancelada_at)}
              {compra.cancelada_motivo && ` · ${compra.cancelada_motivo}`}
            </p>
          </div>
        )}

        {/* Ítems */}
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft">
            <h2 className="font-display font-semibold">Ítems recibidos</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant</TableHead>
                <TableHead className="text-right">Costo u.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={4}>Sin ítems.</TableEmpty>
              ) : (
                rows.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      {it.producto ? (
                        <Link href={`${DOMINIO.productos.ruta}/${it.producto.id}`} className="hover:text-app-accent">
                          <span className="font-mono text-app-accent text-xs">{it.producto.id_publico}</span>
                          <span className="ml-2">{it.producto.nombre}</span>
                        </Link>
                      ) : "Producto eliminado"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{it.cantidad}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(it.costo_unitario))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(Number(it.subtotal))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-xl border border-app-line-soft bg-app-card p-6">
          <div className="text-right">
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total</p>
            <p className="font-display text-2xl text-app-accent mt-1">{formatPesos(Number(compra.total))}</p>
          </div>
        </section>

        {compra.notas && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Notas</p>
            <p className="text-sm text-app-text whitespace-pre-wrap mt-1">{compra.notas}</p>
          </section>
        )}
      </div>
    </div>
  )
}
