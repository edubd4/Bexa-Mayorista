"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import {
  registrarMovimientoStock,
  registrarMovimientoStockVendedor,
} from "@/app/(dashboard)/productos/actions"
import {
  TIPO_MOV_STOCK,
  type TipoMovStock,
} from "@/lib/validators/producto"
import { TIPO_MOV_STOCK_LABEL } from "@/lib/productos-ui"

type Props = {
  productoId: string
  stockActual: number
  // "admin" inserta directo (policy movstock_insert_admin). "vendedor" va por
  // el RPC registrar_stock_vendedor (0020): sin SALIDA y con motivo
  // obligatorio — el vendedor recibe mercadería y corrige SUS cargas, nunca
  // saca stock (eso es una venta).
  modo?: "admin" | "vendedor"
}

type TipoMovStockVendedor = Exclude<TipoMovStock, "SALIDA">

const TIPOS_VENDEDOR: TipoMovStockVendedor[] = [
  TIPO_MOV_STOCK.ENTRADA,
  TIPO_MOV_STOCK.AJUSTE_POSITIVO,
  TIPO_MOV_STOCK.AJUSTE_NEGATIVO,
]

export function MovimientoStockForm({ productoId, stockActual, modo = "admin" }: Props) {
  const router = useRouter()
  const toast = useToast()
  const esVendedor = modo === "vendedor"
  const tipos = esVendedor ? TIPOS_VENDEDOR : (Object.keys(TIPO_MOV_STOCK) as TipoMovStock[])
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
    if (esVendedor && !motivo.trim()) {
      setError("El motivo es obligatorio: contá qué llegó o qué corregís")
      return
    }
    startTransition(async () => {
      const res = esVendedor
        ? await registrarMovimientoStockVendedor({
            producto_id: productoId,
            // El select en modo vendedor solo ofrece TIPOS_VENDEDOR; el
            // schema y el RPC vuelven a validar por si acaso.
            tipo: tipo as TipoMovStockVendedor,
            cantidad,
            motivo: motivo.trim(),
          })
        : await registrarMovimientoStock({
            producto_id: productoId,
            tipo,
            cantidad,
            motivo: motivo.trim() || undefined,
          })
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
            {tipos.map((t) => (
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
          <Label htmlFor="mov-motivo">Motivo{esVendedor ? "" : " (opcional)"}</Label>
          <Input
            id="mov-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={esVendedor ? "Llegó la segunda parte del pedido…" : "Compra, rotura, inventario…"}
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
