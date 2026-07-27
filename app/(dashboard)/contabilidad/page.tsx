import Link from "next/link"
import { redirect } from "next/navigation"
import { Download } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import {
  ahoraArgentina,
  diaSiguienteISO,
  rangoAnioActual,
  rangoMesActual,
  toISODate,
  tsArgentina,
} from "@/lib/fechas"
import { formatFechaHora, formatPesos } from "@/lib/utils"
import { METODO_PAGO_LABEL, ORIGEN_MOV_CAJA_LABEL, TIPO_MOV_CAJA_LABEL, TIPO_MOV_CAJA_VARIANT } from "@/lib/caja-ui"
import type { MetodoPago, OrigenMovCaja, TipoMovCaja } from "@/lib/validators/caja"

type Preset = "mes" | "anio" | "custom"

type MovRow = {
  id: string
  id_publico: string
  fecha: string
  tipo: TipoMovCaja
  origen: OrigenMovCaja
  monto: number
  metodo_pago: MetodoPago
  descripcion: string | null
}

function resolverPeriodo(sp: { preset?: string; desde?: string; hasta?: string }): { preset: Preset; desde: string; hasta: string; label: string } {
  const ahora = ahoraArgentina()
  if (sp.preset === "anio") {
    const r = rangoAnioActual(ahora)
    return { preset: "anio", desde: r.desde, hasta: r.hasta, label: `Año ${ahora.getFullYear()}` }
  }
  if (sp.preset === "custom") {
    const desde = sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : toISODate(ahora)
    const hastaRaw = sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : desde
    return { preset: "custom", desde, hasta: diaSiguienteISO(hastaRaw), label: `${desde} → ${hastaRaw}` }
  }
  const r = rangoMesActual(ahora)
  return { preset: "mes", desde: r.desde, hasta: r.hasta, label: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(ahora) }
}

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: { preset?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("rol, activo").eq("id", user.id).single()
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const periodo = resolverPeriodo(searchParams)

  const { data } = await supabase
    .from("movimientos_caja")
    .select("id, id_publico, fecha, tipo, origen, monto, metodo_pago, descripcion")
    .gte("fecha", tsArgentina(periodo.desde))
    .lt("fecha", tsArgentina(periodo.hasta))
    .order("fecha", { ascending: false })
    .limit(1000)

  const rows = (data ?? []) as MovRow[]
  const totalIngresos = rows.filter((r) => r.tipo === "INGRESO").reduce((s, r) => s + Number(r.monto), 0)
  const totalEgresos = rows.filter((r) => r.tipo === "EGRESO").reduce((s, r) => s + Number(r.monto), 0)
  const neto = totalIngresos - totalEgresos

  const csvUrl = `/api/contabilidad/csv?desde=${periodo.desde}&hasta=${periodo.hasta}`

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Plata · Contabilidad
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Libro</h1>
            <p className="text-app-secondary mt-1">
              Movimientos de caja del período. Exportable a CSV para Excel/contador.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={csvUrl}>
              <Download className="w-4 h-4" />
              Exportar CSV
            </a>
          </Button>
        </header>

        <AyudaPantalla
          que="El resumen del mes en números, y la exportación en CSV para pasarle al contador."
          cuando="A fin de mes, cuando armás lo que va al estudio contable."
          seccion="cerrar-el-dia"
        />

        {/* Filtro de período */}
        <div className="flex flex-wrap items-center gap-2">
          <PresetLink current={periodo.preset} value="mes" label="Mes actual" />
          <PresetLink current={periodo.preset} value="anio" label="Año actual" />
          <form action="/contabilidad" method="get" className="flex items-center gap-2 ml-2">
            <input type="hidden" name="preset" value="custom" />
            <input type="date" name="desde" defaultValue={searchParams.desde ?? periodo.desde}
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text focus:outline-none focus:border-app-accent/50"
            />
            <span className="text-xs text-app-muted">→</span>
            <input type="date" name="hasta" defaultValue={searchParams.hasta ?? toISODate(new Date(new Date(`${periodo.hasta}T12:00:00`).getTime() - 24 * 3600 * 1000))}
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text focus:outline-none focus:border-app-accent/50"
            />
            <Button type="submit" variant="outline" size="sm">Ver</Button>
          </form>
        </div>

        {/* KPIs del período */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KPI label={`Ingresos · ${periodo.label}`} value={formatPesos(totalIngresos)} tone="green" />
          <KPI label={`Egresos · ${periodo.label}`}  value={formatPesos(totalEgresos)}  tone="red" />
          <KPI label={`Neto del período`}            value={formatPesos(neto)}          tone={neto >= 0 ? "green" : "red"} />
        </section>

        {/* Tabla */}
        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="hidden lg:table-cell">Método</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  Sin movimientos en el período elegido. Probá con otro mes.
                </TableEmpty>
              ) : rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-app-accent text-xs">
                    <Link href={`${DOMINIO.caja.ruta}?q=${m.id_publico}`} className="hover:underline">{m.id_publico}</Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-app-secondary">{formatFechaHora(m.fecha)}</TableCell>
                  <TableCell className="text-sm">{m.descripcion ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-app-secondary">{METODO_PAGO_LABEL[m.metodo_pago]}</TableCell>
                  <TableCell>
                    <Badge variant={TIPO_MOV_CAJA_VARIANT[m.tipo]}>{TIPO_MOV_CAJA_LABEL[m.tipo]}</Badge>
                    <p className="text-[10.5px] font-mono text-app-muted mt-0.5">{ORIGEN_MOV_CAJA_LABEL[m.origen]}</p>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${m.tipo === "INGRESO" ? "text-app-green" : "text-app-red"}`}>
                    {m.tipo === "INGRESO" ? "+" : "−"}{formatPesos(Number(m.monto))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"} en el período · límite 1.000. Si necesitás más, usá el CSV.
        </p>
      </div>
    </div>
  )
}

function PresetLink({ current, value, label }: { current: Preset; value: Preset; label: string }) {
  const active = current === value
  return (
    <Link
      href={`/contabilidad?preset=${value}`}
      className={
        active
          ? "h-9 px-3 inline-flex items-center rounded-md bg-app-accent/15 text-app-accent border border-app-accent/40 text-sm font-mono"
          : "h-9 px-3 inline-flex items-center rounded-md bg-app-input border border-app-line text-sm text-app-secondary hover:text-app-accent"
      }
    >
      {label}
    </Link>
  )
}

function KPI({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "amber" }) {
  const toneClass = { green: "text-app-green", red: "text-app-red", amber: "text-app-amber" }[tone]
  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-5">
      <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">{label}</p>
      <p className={`font-display text-2xl mt-2 ${toneClass}`}>{value}</p>
    </div>
  )
}
