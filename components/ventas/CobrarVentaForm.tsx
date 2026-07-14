"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { cobrarVenta } from "@/app/(dashboard)/caja/actions"
import { METODO_PAGO, type MetodoPago } from "@/lib/validators/caja"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"
import { formatPesos } from "@/lib/utils"

type Props = {
  ventaId:    string
  idPublico:  string
  saldo:      number
}

export function CobrarVentaForm({ ventaId, idPublico, saldo }: Props) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [monto, setMonto] = useState<number | null>(saldo)
  const [metodo, setMetodo] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  const [descripcion, setDescripcion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!showForm) {
    return (
      <Button type="button" onClick={() => setShowForm(true)} size="sm">
        Cobrar (saldo {formatPesos(saldo)})
      </Button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (monto === null || monto <= 0) return setError("Monto debe ser > 0")
    if (monto > saldo) return setError(`Monto excede el saldo pendiente (${formatPesos(saldo)})`)

    startTransition(async () => {
      const res = await cobrarVenta({
        venta_id: ventaId,
        monto,
        metodo,
        descripcion: descripcion.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success(`Cobro registrado en venta ${idPublico}`)
      setShowForm(false)
      setMonto(null)
      setDescripcion("")
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full sm:min-w-[320px] rounded-xl border border-app-accent/40 bg-app-accent/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold">Registrar cobro</p>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-xs font-mono text-app-muted hover:text-app-accent"
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="cobro-monto">Monto</Label>
          <MoneyInput
            id="cobro-monto"
            decimals={2}
            value={monto}
            onChange={setMonto}
            max={saldo}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cobro-metodo">Método</Label>
          <Select
            id="cobro-metodo"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPago)}
          >
            {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
              <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cobro-desc">Descripción (opcional)</Label>
        <Input
          id="cobro-desc"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. anticipo, saldo, etc."
        />
      </div>

      <div className="flex justify-between text-xs font-mono">
        <button
          type="button"
          onClick={() => setMonto(saldo)}
          className="text-app-muted hover:text-app-accent"
        >
          Cobrar total ({formatPesos(saldo)})
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-xs text-app-red">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Registrando…" : "Registrar cobro"}
        </Button>
      </div>
    </form>
  )
}
