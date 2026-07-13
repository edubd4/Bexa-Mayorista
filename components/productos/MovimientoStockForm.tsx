"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { registrarMovimientoStock } from "@/app/(dashboard)/productos/actions"
import {
  TIPO_MOV_STOCK,
  type MovimientoStockInput,
  type TipoMovStock,
} from "@/lib/validators/producto"
import { TIPO_MOV_STOCK_LABEL } from "@/lib/productos-ui"

type Props = {
  productoId: string
  stockActual: number
}

export function MovimientoStockForm({ productoId, stockActual }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoMovStock>(TIPO_MOV_STOCK.ENTRADA)
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [motivo, setMotivo] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (cantidad === null || cantidad <= 0) {
      setError("Cantidad requerida (> 0)")
      return
    }
    const payload: MovimientoStockInput = {
      producto_id: productoId,
      tipo,
      cantidad,
      motivo: motivo.trim() || undefined,
    }
    startTransition(async () => {
      const res = await registrarMovimientoStock(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Movimiento registrado")
      setCantidad(null)
      setMotivo("")
      setTipo(TIPO_MOV_STOCK.ENTRADA)
      router.refresh()
    })
  }

  const restaStock = tipo === "SALIDA" || tipo === "AJUSTE_NEGATIVO"
  const excedeStock = restaStock && cantidad !== null && cantidad > stockActual

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mov-tipo">Tipo</Label>
          <Select
            id="mov-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMovStock)}
          >
            {(Object.keys(TIPO_MOV_STOCK) as TipoMovStock[]).map((t) => (
              <option key={t} value={t}>{TIPO_MOV_STOCK_LABEL[t]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mov-cantidad">Cantidad</Label>
          <NumberInput
            id="mov-cantidad"
            decimals={0}
            value={cantidad}
            onChange={setCantidad}
            placeholder="Unidades"
          />
        </div>
        <div className="space-y-1.5 md:col-span-1">
          <Label htmlFor="mov-motivo">Motivo</Label>
          <Input
            id="mov-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Compra, rotura, inventario…"
          />
        </div>
      </div>

      {excedeStock && (
        <p className="text-xs text-app-amber font-mono">
          ⚠ Restarían {(cantidad ?? 0) - stockActual} unidades — el trigger lo va a rechazar.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Registrando…" : "Registrar movimiento"}
        </Button>
      </div>
    </form>
  )
}
