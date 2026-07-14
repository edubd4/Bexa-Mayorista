"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { registrarMovimientoManual } from "@/app/(dashboard)/caja/actions"
import { DOMINIO } from "@/lib/dominio"
import {
  METODO_PAGO,
  ORIGEN_MOV_CAJA,
  TIPO_MOV_CAJA,
  type MetodoPago,
  type MovimientoManualInput,
  type TipoMovCaja,
} from "@/lib/validators/caja"
import { METODO_PAGO_LABEL, ORIGEN_MOV_CAJA_LABEL, TIPO_MOV_CAJA_LABEL } from "@/lib/caja-ui"

const ORIGENES_MANUALES = [ORIGEN_MOV_CAJA.APERTURA, ORIGEN_MOV_CAJA.AJUSTE, ORIGEN_MOV_CAJA.OTRO] as const
type OrigenManual = typeof ORIGENES_MANUALES[number]

export function MovimientoManualForm() {
  const router = useRouter()
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoMovCaja>(TIPO_MOV_CAJA.INGRESO)
  const [origen, setOrigen] = useState<OrigenManual>(ORIGEN_MOV_CAJA.APERTURA)
  const [monto, setMonto] = useState<number | null>(null)
  const [metodo, setMetodo] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  const [descripcion, setDescripcion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (monto === null || monto <= 0) return setError("Monto > 0")
    if (!descripcion.trim()) return setError("Descripción requerida")

    const payload: MovimientoManualInput = {
      tipo,
      origen,
      monto,
      metodo,
      descripcion: descripcion.trim(),
    }
    startTransition(async () => {
      const res = await registrarMovimientoManual(payload)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success("Movimiento registrado")
      router.push(DOMINIO.caja.ruta)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo</Label>
          <Select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovCaja)}>
            <option value="INGRESO">{TIPO_MOV_CAJA_LABEL.INGRESO}</option>
            <option value="EGRESO">{TIPO_MOV_CAJA_LABEL.EGRESO}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="origen">Origen</Label>
          <Select id="origen" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenManual)}>
            {ORIGENES_MANUALES.map((o) => (
              <option key={o} value={o}>{ORIGEN_MOV_CAJA_LABEL[o]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="monto">Monto</Label>
          <MoneyInput id="monto" decimals={2} value={monto} onChange={setMonto} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="metodo">Método</Label>
          <Select id="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
              <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="descripcion">Descripción *</Label>
          <Textarea
            id="descripcion"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalle del ajuste, apertura o motivo."
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={DOMINIO.caja.ruta}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Registrando…" : "Registrar movimiento"}
        </Button>
      </div>
    </form>
  )
}
