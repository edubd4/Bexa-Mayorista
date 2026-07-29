"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { AnularGastoButton } from "@/components/gastos/AnularGastoButton"
import { registrarGastoDeCampana } from "@/app/(dashboard)/gastos/actions"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"
import { formatFecha, formatPesos } from "@/lib/utils"
import { METODO_PAGO, type MetodoPago } from "@/lib/validators/caja"

// Lo que la campaña costó de verdad (0028). Antes esto no existía: la 0011
// dejó `campanas.gasto_id` (UN gasto) y el formulario nunca renderizó el campo,
// así que el ROI venía en null desde el día uno.
//
// Cada fila de acá ES un gasto de caja: el mismo registro que sale en Caja y en
// Finanzas. No es un anotador paralelo de marketing — si fuera un registro
// aparte, el día que alguien carga el pago de Instagram en los dos lados los
// números dejan de cerrar.

export type CampanaGasto = {
  id: string
  id_publico: string
  monto: number
  descripcion: string
  fecha: string
  metodo_pago: MetodoPago
  categoria_nombre: string
  anulado_at: string | null
  anulado_motivo: string | null
}

export type CategoriaGasto = {
  id: number
  nombre: string
  es_publicidad: boolean
}

type Props = {
  campanaId: string
  gastos: CampanaGasto[]
  categorias: CategoriaGasto[]
  /** Admin y marketing cargan. El vendedor solo mira. */
  puedeCargar: boolean
  /** Anular sigue siendo admin-only: mueve plata de vuelta a la caja (0023). */
  puedeAnular: boolean
  /** Marketing solo puede usar categorías de publicidad (lo impone el RPC). */
  soloPublicidad: boolean
}

function hoyISO(): string {
  // Fecha local, no toISOString(): a partir de las 21:00 en Argentina el UTC ya
  // es mañana y el gasto se cargaría con la fecha corrida (mismo motivo que
  // hoy_local() en SQL, fix de la 0019).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date())
}

export function CampanaGastosManager({
  campanaId,
  gastos,
  categorias,
  puedeCargar,
  puedeAnular,
  soloPublicidad,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [isPending, startTransition] = useTransition()

  const disponibles = soloPublicidad ? categorias.filter((c) => c.es_publicidad) : categorias

  const [categoriaId, setCategoriaId] = useState<number | "">(
    disponibles.find((c) => c.es_publicidad)?.id ?? disponibles[0]?.id ?? "",
  )
  const [monto, setMonto] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [metodo, setMetodo] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  const [notas, setNotas] = useState("")
  const [error, setError] = useState<string | null>(null)

  const vigentes = gastos.filter((g) => !g.anulado_at)
  const total = vigentes.reduce((acc, g) => acc + Number(g.monto), 0)

  function limpiar() {
    setMonto(null)
    setDescripcion("")
    setFecha(hoyISO())
    setMetodo(METODO_PAGO.EFECTIVO)
    setNotas("")
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!categoriaId) return setError("Elegí una categoría")
    if (monto === null || monto <= 0) return setError("El monto tiene que ser mayor a 0")
    if (!descripcion.trim()) return setError("Poné una descripción — el extracto de caja tiene que explicarse solo")

    startTransition(async () => {
      const res = await registrarGastoDeCampana(campanaId, {
        categoria_id: Number(categoriaId),
        monto,
        descripcion: descripcion.trim(),
        fecha,
        metodo,
        notas: notas.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(`Costo cargado · ${formatPesos(monto)} salieron de la caja`)
      limpiar()
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-base flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-app-amber" />
            Costos de la campaña
          </h3>
          <p className="text-xs text-app-muted mt-1">
            Cada costo es un gasto real: sale de la caja y entra en el ROI de acá arriba.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
              Total invertido
            </p>
            <p className="font-display text-lg text-app-red">{formatPesos(total)}</p>
          </div>
          {puedeCargar && !abierto && (
            <Button type="button" size="sm" onClick={() => setAbierto(true)}>
              <Plus className="w-3.5 h-3.5" /> Cargar costo
            </Button>
          )}
        </div>
      </div>

      {puedeCargar && abierto && (
        disponibles.length === 0 ? (
          <div className="rounded-md border border-app-amber/40 bg-app-amber/10 px-4 py-3">
            <p className="text-sm text-app-amber font-display font-semibold">
              No hay categorías de publicidad activas
            </p>
            <p className="text-xs text-app-secondary mt-1">
              Pedile al admin que active una categoría de gasto marcada como
              publicidad en Configuración → Categorías de gasto.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-app-line bg-app-input/40 p-4 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="gasto-categoria">Categoría *</Label>
                <Select
                  id="gasto-categoria"
                  value={String(categoriaId)}
                  onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— Elegí categoría —</option>
                  {disponibles.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </Select>
                {soloPublicidad && (
                  <p className="text-[11px] text-app-muted font-mono">
                    Marketing carga solo gastos de publicidad, y siempre imputados a una campaña.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gasto-monto">Monto *</Label>
                <MoneyInput id="gasto-monto" decimals={2} value={monto} onChange={setMonto} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gasto-fecha">Fecha</Label>
                <input
                  id="gasto-fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-app-input border border-app-line text-sm text-app-text focus:outline-none focus:border-app-accent/50"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="gasto-descripcion">Descripción *</Label>
                <Input
                  id="gasto-descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: pauta Instagram 5 al 12 de agosto"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gasto-metodo">Método de pago</Label>
                <Select
                  id="gasto-metodo"
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                >
                  {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
                    <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gasto-notas">Notas</Label>
                <Textarea
                  id="gasto-notas"
                  rows={1}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-xs text-app-red"
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { limpiar(); setAbierto(false) }}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Cargando…" : "Cargar costo"}
              </Button>
            </div>
          </form>
        )
      )}

      {gastos.length === 0 ? (
        <p className="text-sm text-app-muted">
          Todavía no se cargó ningún costo. Sin costo no hay ROI — la métrica de
          arriba queda sin con qué calcular.
        </p>
      ) : (
        <ul className="divide-y divide-app-line-soft">
          {gastos.map((g) => {
            const anulado = !!g.anulado_at
            return (
              <li
                key={g.id}
                className={`flex items-start justify-between gap-3 py-2.5 ${anulado ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-app-text">
                    <span className={anulado ? "line-through" : ""}>{g.descripcion}</span>
                    {anulado && (
                      <span className="ml-2 font-mono text-[10.5px] uppercase tracking-widest text-app-red">
                        Anulado
                      </span>
                    )}
                  </p>
                  <p className="text-[10.5px] font-mono text-app-muted mt-0.5">
                    <span className="text-app-accent">{g.id_publico}</span>
                    {" · "}{g.categoria_nombre}
                    {" · "}{formatFecha(g.fecha)}
                    {" · "}{METODO_PAGO_LABEL[g.metodo_pago]}
                  </p>
                  {anulado && g.anulado_motivo && (
                    <p className="text-[10.5px] font-mono text-app-red mt-0.5">
                      Motivo: {g.anulado_motivo}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-mono ${anulado ? "text-app-muted line-through" : "text-app-red"}`}>
                    -{formatPesos(Number(g.monto))}
                  </span>
                  {puedeAnular && !anulado && (
                    <AnularGastoButton
                      gastoId={g.id}
                      idPublico={g.id_publico}
                      monto={Number(g.monto)}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
