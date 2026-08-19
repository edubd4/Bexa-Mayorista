"use client"

import { useState, useTransition } from "react"
import { CalendarClock, Check, Pencil, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput, NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  createGastoFijo,
  registrarPagoGastoFijo,
  toggleGastoFijoActivo,
  updateGastoFijo,
} from "@/app/(dashboard)/gastos/actions"
import {
  METODO_PAGO,
  PERIODICIDAD_GASTO_FIJO,
  type GastoFijoInput,
  type MetodoPago,
  type PeriodicidadGastoFijo,
} from "@/lib/validators/caja"
import { METODO_PAGO_LABEL, PERIODICIDAD_GASTO_FIJO_LABEL } from "@/lib/caja-ui"
import { formatFecha, formatPesos } from "@/lib/utils"

// ============================================================================
// GastosFijosManager (0035) — la lista de "esto se paga siempre".
// Recordatorio + un click: el fijo NO mueve plata solo. "Registrar" carga el
// gasto real (mismo circuito que /gastos/nuevo) con el monto ajustable —
// la luz no sale igual todos los meses.
// ============================================================================

export type GastoFijoEstado = {
  id: number
  nombre: string
  categoria_id: number
  categoria_nombre: string
  monto_estimado: number
  metodo_pago: MetodoPago
  periodicidad: PeriodicidadGastoFijo
  dia_pago: number | null
  mes_pago: number | null
  notas: string | null
  activo: boolean
  ultimo_pago: string | null
  pagado_periodo: boolean
}

type Props = {
  fijos: GastoFijoEstado[]
  categorias: { id: number; nombre: string }[]
}

const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function cuandoSePaga(f: GastoFijoEstado): string {
  const p = PERIODICIDAD_GASTO_FIJO_LABEL[f.periodicidad]
  if (f.periodicidad === "SEMANAL" && f.dia_pago) {
    return `${p} · ${DIAS_SEMANA[f.dia_pago - 1] ?? `día ${f.dia_pago}`}`
  }
  if (f.periodicidad === "MENSUAL" && f.dia_pago) return `${p} · día ${f.dia_pago}`
  if (f.periodicidad === "ANUAL" && f.mes_pago) {
    return `${p} · ${f.dia_pago ? `${f.dia_pago} de ` : ""}${MESES[f.mes_pago - 1]}`
  }
  return p
}

const FORM_VACIO: GastoFijoInput = {
  nombre: "",
  categoria_id: 0,
  monto_estimado: 0,
  metodo_pago: METODO_PAGO.EFECTIVO,
  periodicidad: PERIODICIDAD_GASTO_FIJO.MENSUAL,
  dia_pago: undefined,
  mes_pago: undefined,
  notas: undefined,
}

export function GastosFijosManager({ fijos, categorias }: Props) {
  const toast = useToast()
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState<GastoFijoInput>(FORM_VACIO)
  // Registro del pago: qué fijo está confirmando y con qué monto.
  const [pagandoId, setPagandoId] = useState<number | null>(null)
  const [montoPago, setMontoPago] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const pendientes = fijos.filter((f) => f.activo && !f.pagado_periodo).length

  function update<K extends keyof GastoFijoInput>(key: K, value: GastoFijoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function abrirAlta() {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setMostrarAlta(true)
  }

  function abrirEdicion(f: GastoFijoEstado) {
    setForm({
      nombre: f.nombre,
      categoria_id: f.categoria_id,
      monto_estimado: Number(f.monto_estimado),
      metodo_pago: f.metodo_pago,
      periodicidad: f.periodicidad,
      dia_pago: f.dia_pago ?? undefined,
      mes_pago: f.mes_pago ?? undefined,
      notas: f.notas ?? undefined,
    })
    setEditandoId(f.id)
    setMostrarAlta(true)
  }

  function guardar() {
    startTransition(async () => {
      const res = editandoId !== null
        ? await updateGastoFijo(editandoId, form)
        : await createGastoFijo(form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(editandoId !== null ? "Gasto fijo actualizado" : "Gasto fijo agregado")
      setMostrarAlta(false)
      setEditandoId(null)
    })
  }

  function abrirPago(f: GastoFijoEstado) {
    setPagandoId(f.id)
    setMontoPago(Number(f.monto_estimado))
  }

  function confirmarPago(f: GastoFijoEstado) {
    if (montoPago === null || montoPago <= 0) {
      toast.error("Monto debe ser > 0")
      return
    }
    startTransition(async () => {
      const res = await registrarPagoGastoFijo({ gasto_fijo_id: f.id, monto: montoPago })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${f.nombre} registrado · ${formatPesos(montoPago)} — ya salió de la caja`)
      setPagandoId(null)
    })
  }

  function toggleActivo(f: GastoFijoEstado) {
    startTransition(async () => {
      const res = await toggleGastoFijoActivo(f.id)
      if (!res.ok) toast.error(res.error)
      else toast.success(`${f.nombre} ${f.activo ? "desactivado" : "reactivado"}`)
    })
  }

  return (
    <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-app-line-soft">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-app-accent" />
          <h2 className="font-display font-semibold">Gastos fijos</h2>
          {pendientes > 0 && (
            <Badge variant="amber">{pendientes} sin pagar este período</Badge>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={abrirAlta}>
          <Plus className="w-4 h-4" />
          Agregar fijo
        </Button>
      </div>

      {mostrarAlta && (
        <div className="px-5 py-4 border-b border-app-line-soft bg-app-surface-mid/40 space-y-3">
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
            {editandoId !== null ? "Editar gasto fijo" : "Nuevo gasto fijo"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="gf-nombre">Nombre *</Label>
              <Input
                id="gf-nombre"
                value={form.nombre}
                onChange={(e) => update("nombre", e.target.value)}
                placeholder="Ej: Alquiler del local"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-categoria">Categoría *</Label>
              <Select
                id="gf-categoria"
                value={String(form.categoria_id || "")}
                onChange={(e) => update("categoria_id", e.target.value ? Number(e.target.value) : 0)}
              >
                <option value="">— Elegí categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-monto">Monto estimado *</Label>
              <MoneyInput
                id="gf-monto"
                decimals={2}
                value={form.monto_estimado || null}
                onChange={(v) => update("monto_estimado", v ?? 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-metodo">Método</Label>
              <Select
                id="gf-metodo"
                value={form.metodo_pago}
                onChange={(e) => update("metodo_pago", e.target.value as MetodoPago)}
              >
                {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
                  <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-periodicidad">Período</Label>
              <Select
                id="gf-periodicidad"
                value={form.periodicidad}
                onChange={(e) => update("periodicidad", e.target.value as PeriodicidadGastoFijo)}
              >
                {(Object.keys(PERIODICIDAD_GASTO_FIJO) as PeriodicidadGastoFijo[]).map((p) => (
                  <option key={p} value={p}>{PERIODICIDAD_GASTO_FIJO_LABEL[p]}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="gf-dia">
                  {form.periodicidad === "SEMANAL" ? "Día (1=lun)" : "Día del mes"}
                </Label>
                <NumberInput
                  id="gf-dia"
                  decimals={0}
                  value={form.dia_pago ?? null}
                  onChange={(v) => update("dia_pago", v ?? undefined)}
                  placeholder="opcional"
                />
              </div>
              {form.periodicidad === "ANUAL" && (
                <div className="space-y-1">
                  <Label htmlFor="gf-mes">Mes (1-12)</Label>
                  <NumberInput
                    id="gf-mes"
                    decimals={0}
                    value={form.mes_pago ?? null}
                    onChange={(v) => update("mes_pago", v ?? undefined)}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarAlta(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={guardar} disabled={isPending}>
              {isPending ? "Guardando…" : editandoId !== null ? "Guardar cambios" : "Agregar"}
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Se paga</TableHead>
            <TableHead className="hidden lg:table-cell">Último pago</TableHead>
            <TableHead className="text-right">Estimado</TableHead>
            <TableHead className="text-right">Este período</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fijos.length === 0 ? (
            <TableEmpty colSpan={5}>
              Sin gastos fijos todavía. Cargá acá lo que se paga siempre
              (alquiler, luz, sueldos) y todos los meses vas a ver qué falta pagar.
            </TableEmpty>
          ) : (
            fijos.map((f) => (
              <TableRow key={f.id} className={!f.activo ? "opacity-50" : undefined}>
                <TableCell>
                  <span className="font-medium">{f.nombre}</span>
                  <span className="block text-[11px] text-app-muted">{f.categoria_nombre}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                  {cuandoSePaga(f)}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-app-secondary">
                  {f.ultimo_pago ? formatFecha(f.ultimo_pago) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatPesos(Number(f.monto_estimado))}
                </TableCell>
                <TableCell className="text-right">
                  {!f.activo ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge variant="gray">Inactivo</Badge>
                      <button
                        type="button"
                        onClick={() => toggleActivo(f)}
                        disabled={isPending}
                        className="text-[11px] font-mono text-app-muted hover:text-app-accent"
                      >
                        reactivar
                      </button>
                    </div>
                  ) : f.pagado_periodo ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge variant="green">
                        <Check className="w-3 h-3 mr-1" />
                        Pagado
                      </Badge>
                      <IconBtn onClick={() => abrirEdicion(f)} label="Editar" disabled={isPending}>
                        <Pencil className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  ) : pagandoId === f.id ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-32">
                        <MoneyInput
                          decimals={2}
                          value={montoPago}
                          onChange={setMontoPago}
                        />
                      </div>
                      <Button type="button" size="sm" onClick={() => confirmarPago(f)} disabled={isPending}>
                        {isPending ? "…" : "Confirmar"}
                      </Button>
                      <IconBtn onClick={() => setPagandoId(null)} label="Cancelar" disabled={isPending}>
                        <X className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge variant="amber">Pendiente</Badge>
                      <Button type="button" size="sm" variant="outline" onClick={() => abrirPago(f)} disabled={isPending}>
                        Registrar
                      </Button>
                      <IconBtn onClick={() => abrirEdicion(f)} label="Editar" disabled={isPending}>
                        <Pencil className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn onClick={() => toggleActivo(f)} label="Desactivar" disabled={isPending}>
                        <X className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="px-5 py-3 text-[11px] font-mono text-app-muted border-t border-app-line-soft">
        El fijo es un recordatorio: la plata sale de la caja recién cuando apretás
        Registrar. El monto se puede ajustar en ese momento (la factura real manda).
      </p>
    </section>
  )
}

function IconBtn({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-1.5 rounded-md text-app-muted hover:text-app-accent hover:bg-app-surface-mid transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  )
}
