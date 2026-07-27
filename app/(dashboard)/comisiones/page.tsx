import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { formatFecha, formatPesos } from "@/lib/utils"

// Liquidación semanal — decisión cliente 2026-07-13.
// El vendedor ve SOLO su liquidación; el admin ve la de todos. Se filtra en dos
// lugares a propósito: acá (explícito) y en la RLS de `comisiones`, que la
// vista respeta desde la 0016. Defensa en profundidad.
export default async function ComisionesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("rol, activo, nombre").eq("id", user.id).single()
  if (!profile?.activo) redirect("/login")
  if (profile.rol === ROL.MARKETING) redirect("/panel")
  const esAdmin = profile.rol === ROL.ADMIN

  let queryComisiones = supabase.from("v_comisiones_semana")
    .select("vendedor_id, semana_inicio, ventas_count, base, total, vendedor:vendedor_id ( nombre )")
    .order("semana_inicio", { ascending: false })
    .limit(200)
  if (!esAdmin) queryComisiones = queryComisiones.eq("vendedor_id", user.id)

  const [{ data: semanas }, { data: vendedoresRows }] = await Promise.all([
    queryComisiones,
    esAdmin
      ? supabase.from("profiles").select("id, nombre, comision_pct").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { id: string; nombre: string; comision_pct: number | null }[] }),
  ])

  const rows = (semanas ?? []) as unknown as SemanaRow[]
  const vendedores = (vendedoresRows ?? []) as { id: string; nombre: string; comision_pct: number | null }[]
  const totalHistorico = rows.reduce((s, r) => s + Number(r.total), 0)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Plata · Comisiones
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Liquidación semanal
          </h1>
          <p className="text-app-secondary mt-1">
            {esAdmin ? "Comisiones de todos los vendedores por semana ISO (lunes a domingo)." : "Tus comisiones semana a semana."}
          </p>
        </header>

        {esAdmin && vendedores.length > 0 && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
            <h2 className="font-display font-semibold mb-3">Porcentaje por vendedor</h2>
            <p className="text-xs text-app-muted mb-3">
              La comisión se calcula producto por producto. Si el producto tiene
              su propio % cargado en la ficha, gana ese; si no, se usa el % del
              vendedor de esta lista; y si el vendedor no tiene, el default de
              Configuración. Por eso una venta puede liquidar a un % promedio.
            </p>
            <ul className="space-y-1">
              {vendedores.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span>{v.nombre}</span>
                  <span className="font-mono text-app-accent">
                    {v.comision_pct !== null ? `${v.comision_pct}%` : "— (usar default de configuración)"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft flex items-center justify-between">
            <h2 className="font-display font-semibold">Semanas · {rows.length}</h2>
            <span className="text-xs font-mono text-app-muted">
              Total histórico {formatPesos(totalHistorico)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana desde</TableHead>
                {esAdmin && <TableHead>Vendedor</TableHead>}
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={esAdmin ? 5 : 4}>Sin comisiones registradas.</TableEmpty>
              ) : rows.map((r, idx) => (
                <TableRow key={`${r.vendedor_id}-${r.semana_inicio}-${idx}`}>
                  <TableCell className="font-mono text-sm text-app-secondary">{formatFecha(r.semana_inicio)}</TableCell>
                  {esAdmin && <TableCell>{r.vendedor?.nombre ?? "—"}</TableCell>}
                  <TableCell className="text-right font-mono text-sm">{r.ventas_count}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-secondary">{formatPesos(Number(r.base))}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-app-green font-semibold">{formatPesos(Number(r.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  )
}

type SemanaRow = {
  vendedor_id: string
  semana_inicio: string
  ventas_count: number
  base: number
  total: number
  vendedor: { nombre: string } | null
}
