import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { LinkRow } from "@/components/ui/link-row"
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
import { DOMINIO, nuevoLabel } from "@/lib/dominio"
import { formatFecha, formatPesos } from "@/lib/utils"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"
import type { MetodoPago } from "@/lib/validators/caja"

type GastoRow = {
  id: string
  id_publico: string
  monto: number
  descripcion: string
  fecha: string
  metodo_pago: MetodoPago
  categoria: { nombre: string } | null
}

export default async function GastosPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const { data } = await supabase
    .from("gastos")
    .select("id, id_publico, monto, descripcion, fecha, metodo_pago, categoria:categoria_id ( nombre )")
    .order("fecha", { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as GastoRow[]
  const total = rows.reduce((sum, g) => sum + Number(g.monto), 0)
  const ent = DOMINIO.gastos

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Plata · {ent.plural}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {ent.plural}
            </h1>
            <p className="text-app-secondary mt-1">
              Cada gasto genera un EGRESO en caja automáticamente.
            </p>
          </div>
          <Button asChild>
            <Link href={`${ent.ruta}/nuevo`}>
              <Plus className="w-4 h-4" />
              {nuevoLabel(ent)}
            </Link>
          </Button>
        </header>

        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                <TableHead className="hidden md:table-cell">Método</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>Sin gastos todavía.</TableEmpty>
              ) : (
                rows.map((g) => (
                  <LinkRow key={g.id} href={`${DOMINIO.caja.ruta}?q=${g.id_publico}`}>
                    <TableCell className="font-mono text-app-accent text-xs">{g.id_publico}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(g.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">{g.descripcion}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      {g.categoria?.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {METODO_PAGO_LABEL[g.metodo_pago]}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-app-red">
                      −{formatPesos(Number(g.monto))}
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "gasto" : "gastos"} · Total mostrado {formatPesos(total)}
        </p>
      </div>
    </div>
  )
}
