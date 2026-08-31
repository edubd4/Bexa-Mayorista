"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { cobrarVenta } from "@/app/(dashboard)/caja/actions"
import { PagosInput, validarPagos, type PagoDraft } from "@/components/caja/PagosInput"
import { METODO_PAGO } from "@/lib/validators/caja"
import { formatPesos } from "@/lib/utils"

type Props = {
  ventaId:    string
  idPublico:  string
  saldo:      number
}

export function CobrarVentaForm({ ventaId, idPublico, saldo }: Props) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [pagos, setPagos] = useState<PagoDraft[]>([{ metodo: METODO_PAGO.EFECTIVO, monto: saldo }])
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
    const invalido = validarPagos(pagos, saldo, false)
    if (invalido) return setError(invalido)

    startTransition(async () => {
      const res = await cobrarVenta({
        venta_id: ventaId,
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto! })),
        descripcion: descripcion.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success(`Cobro registrado en venta ${idPublico}`)
      setShowForm(false)
      setPagos([{ metodo: METODO_PAGO.EFECTIVO, monto: null }])
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

      <div className="space-y-1">
        <Label htmlFor="cobro-metodo-0">Pago</Label>
        <PagosInput
          pagos={pagos}
          onChange={setPagos}
          objetivo={saldo}
          idPrefix="cobro"
          disabled={isPending}
        />
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
          onClick={() => setPagos([{ metodo: pagos[0]?.metodo ?? METODO_PAGO.EFECTIVO, monto: saldo }])}
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
