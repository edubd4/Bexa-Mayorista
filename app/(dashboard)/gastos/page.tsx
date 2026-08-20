import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AnularGastoButton } from "@/components/gastos/AnularGastoButton"
import { GastosFijosManager, type GastoFijoEstado } from "@/components/gastos/GastosFijosManager"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Badge } from "@/components/ui/badge"
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
import { ahoraArgentina, diaSiguienteISO, rangoMesActual, toISODate } from "@/lib/fechas"
import { logPerfilError } from "@/lib/auth-guards"

type GastoRow = {
  id: string
  id_publico: string
  monto: number
  descripcion: string
  fecha: string
  metodo_pago: MetodoPago
  anulado_at: string | null
  categoria: { nombre: string } | null
}

type PeriodoGastos = { preset: "mes" | "todo" | "rango"; desde: string | null; hastaExclusiva: string | null; label: string }

// gastos.fecha es DATE (0009) — se filtra con ISO planos, sin timezone.
// Default MES ACTUAL: "cuanto gaste este mes" es la pregunta real; el
// "Total mostrado" de antes sumaba las ultimas 200 filas de toda la vida —
// un numero sin significado de negocio (analisis 2026-08-19).
function resolverPeriodoGastos(sp: { periodo?: string; desde?: string; hasta?: string }): PeriodoGastos {
  const esISO = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (sp.periodo === "todo") {
    return { preset: "todo", desde: null, hastaExclusiva: null, label: "Histórico completo" }
  }
  if (sp.periodo === "rango") {
    const desde = esISO(sp.desde) ? sp.desde! : toISODate(ahoraArgentina())
    const hasta = esISO(sp.hasta) ? sp.hasta! : desde
    return { preset: "rango", desde, hastaExclusiva: diaSiguienteISO(hasta), label: `${desde} → ${hasta}` }
  }
  const r = rangoMesActual()
  return { preset: "mes", desde: r.desde, hastaExclusiva: r.hasta, label: "Mes actual" }
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: { periodo?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("GastosPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/panel")

  const periodo = resolverPeriodoGastos(searchParams)

  const [{ data }, { data: fijosData }, { data: categoriasData }, totalQ] = await Promise.all([
    (async () => {
      let q = supabase
        .from("gastos")
        .select("id, id_publico, monto, descripcion, fecha, metodo_pago, anulado_at, categoria:categoria_id ( nombre )")
        .order("fecha", { ascending: false })
        .limit(200)
      if (periodo.desde) q = q.gte("fecha", periodo.desde)
      if (periodo.hastaExclusiva) q = q.lt("fecha", periodo.hastaExclusiva)
      return q
    })(),
    // Fijos con su estado del período (0035): pagado_periodo sale de los gastos
    // reales linkeados por gasto_fijo_id — no hay flag que desincronizar.
    supabase
      .from("v_gastos_fijos_estado")
      .select("*")
      .order("activo", { ascending: false })
      .order("dia_pago", { ascending: true, nullsFirst: false }),
    supabase
      .from("categorias_gasto")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre"),
    // Total REAL del periodo — de una query propia, no de las 200 filas
    // visibles. Anulados afuera: su plata ya volvio a la caja.
    (async () => {
      if (!periodo.desde || !periodo.hastaExclusiva) return { data: null }
      return supabase
        .from("gastos")
        .select("monto, anulado_at")
        .gte("fecha", periodo.desde)
        .lt("fecha", periodo.hastaExclusiva)
        .limit(5000)
    })(),
  ])

  const rows = (data ?? []) as unknown as GastoRow[]
  const fijos = (fijosData ?? []) as unknown as GastoFijoEstado[]
  const categorias = (categoriasData ?? []) as { id: number; nombre: string }[]
  // Total del periodo (query completa). Con "Todo", cae al total de las filas
  // visibles — el numero exacto de la historia entera no vale una query pesada.
  const totalesPeriodo = (totalQ.data ?? null) as { monto: number; anulado_at: string | null }[] | null
  const total = totalesPeriodo
    ? totalesPeriodo.reduce((sum, g) => (g.anulado_at ? sum : sum + Number(g.monto)), 0)
    : rows.reduce((sum, g) => (g.anulado_at ? sum : sum + Number(g.monto)), 0)
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

        <AyudaPantalla
          que="Todo lo que gastás y no es mercadería: alquiler, sueldos, fletes, servicios. Cada gasto que cargás sale automáticamente de la caja."
          cuando="El mismo día que pagás el gasto. Si lo dejás para después, el cierre de caja de ese día no te va a cuadrar."
          ojo="Para comprar mercadería NO uses Gastos: usá Compras, que además te sube el stock. Gastos es para lo que no entra al depósito."
          seccion="caja-y-gastos"
        />

        {/* Gastos fijos (0035): recordatorio + un click. La plata sale solo al Registrar. */}
        <GastosFijosManager fijos={fijos} categorias={categorias} />

        {/* Barra de periodo (2026-08-19): mes actual por defecto. */}
        <div className="flex flex-wrap items-center gap-2">
          {([["mes", "Mes actual"], ["todo", "Todo"]] as const).map(([valor, etiqueta]) => (
            <Link
              key={valor}
              href={valor === "mes" ? ent.ruta : `${ent.ruta}?periodo=${valor}`}
              className={`h-9 inline-flex items-center rounded-md border px-3 text-sm font-mono transition-colors ${
                periodo.preset === valor
                  ? "border-app-accent/60 bg-app-accent/10 text-app-accent"
                  : "border-app-line text-app-secondary hover:text-app-accent hover:border-app-accent/40"
              }`}
            >
              {etiqueta}
            </Link>
          ))}
          <form action={ent.ruta} method="get" className="flex items-center gap-2 ml-1">
            <input type="hidden" name="periodo" value="rango" />
            <input type="date" name="desde" defaultValue={periodo.preset === "rango" ? periodo.desde ?? "" : ""} aria-label="Desde"
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text" />
            <input type="date" name="hasta" defaultValue={periodo.preset === "rango" ? searchParams.hasta ?? "" : ""} aria-label="Hasta"
              className="h-9 rounded-md bg-app-input border border-app-line px-2 text-sm text-app-text" />
            <Button type="submit" variant="outline" size="sm">Ver rango</Button>
          </form>
          <p className="text-sm font-mono text-app-secondary ml-auto">
            {periodo.label} · <span className="text-app-red font-semibold">-{formatPesos(total)}</span>
          </p>
        </div>

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
                <TableEmpty colSpan={6}>
                  Sin gastos cargados. Acá va todo lo que pagás y no es
                  mercadería: alquiler, sueldos, fletes, servicios. Para
                  mercadería usá Compras.
                </TableEmpty>
              ) : (
                rows.map((g) => (
                  <LinkRow
                    key={g.id}
                    href={`${DOMINIO.caja.ruta}?q=${g.id_publico}`}
                    className={g.anulado_at ? "opacity-50" : undefined}
                  >
                    <TableCell className="font-mono text-app-accent text-xs">{g.id_publico}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {formatFecha(g.fecha)}
                    </TableCell>
                    <TableCell className={`font-medium ${g.anulado_at ? "line-through" : ""}`}>
                      {g.descripcion}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                      {g.categoria?.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {METODO_PAGO_LABEL[g.metodo_pago]}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`font-mono text-sm ${g.anulado_at ? "text-app-muted line-through" : "text-app-red"}`}>
                          −{formatPesos(Number(g.monto))}
                        </span>
                        {g.anulado_at ? (
                          <Badge variant="gray">Anulado</Badge>
                        ) : (
                          <AnularGastoButton
                            gastoId={g.id}
                            idPublico={g.id_publico}
                            monto={Number(g.monto)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          {rows.length} {rows.length === 1 ? "gasto" : "gastos"} en la tabla · Total del período {formatPesos(total)}
          {rows.length === 200 && " · (la tabla muestra hasta 200 — el total igual es del período completo)"}
        </p>
      </div>
    </div>
  )
}
