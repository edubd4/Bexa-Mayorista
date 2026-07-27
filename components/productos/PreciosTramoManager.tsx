"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput, NumberInput } from "@/components/ui/number-input"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { eliminarPrecioTramo, guardarPrecioTramo } from "@/app/(dashboard)/productos/actions"
import { formatPesos } from "@/lib/utils"

// Precios por tramo de cantidad (0022). El tramo que aplique PISA lista y
// descuentos — un solo beneficio por cantidad. Guardar el mismo "desde"
// actualiza el precio (upsert): así se edita.
export type PrecioTramo = {
  id: string
  cantidad_min: number
  precio: number
}

type Props = {
  productoId: string
  tramos: PrecioTramo[]
  // El admin gestiona; el vendedor solo consulta (le sirve para cotizar).
  editable: boolean
}

export function PreciosTramoManager({ productoId, tramos, editable }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [cantidadMin, setCantidadMin] = useState<number | null>(null)
  const [precio, setPrecio] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const ordenados = [...tramos].sort((a, b) => a.cantidad_min - b.cantidad_min)

  // "Hasta" de cada tramo = el "desde" del siguiente - 1 (solo presentación).
  function rangoLabel(t: PrecioTramo, idx: number): string {
    const sig = ordenados[idx + 1]
    if (!sig) return `${t.cantidad_min}+ u.`
    if (sig.cantidad_min - 1 === t.cantidad_min) return `${t.cantidad_min} u.`
    return `${t.cantidad_min}–${sig.cantidad_min - 1} u.`
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (cantidadMin === null || cantidadMin < 1) return setError("Cantidad mínima requerida (≥ 1)")
    if (precio === null || precio <= 0) return setError("Precio requerido (> 0)")

    startTransition(async () => {
      const res = await guardarPrecioTramo({
        producto_id: productoId,
        cantidad_min: cantidadMin,
        precio,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Tramo guardado")
      setCantidadMin(null)
      setPrecio(null)
      router.refresh()
    })
  }

  async function handleEliminar(t: PrecioTramo) {
    const ok = await confirm({
      title: `¿Eliminar el tramo desde ${t.cantidad_min} u.?`,
      description: "Las ventas desde esa cantidad vuelven a la lista o al precio base.",
      confirmLabel: "Eliminar tramo",
      tone: "danger",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await eliminarPrecioTramo({ producto_id: productoId, tramo_id: t.id })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Tramo eliminado")
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {ordenados.length === 0 ? (
        <p className="text-sm text-app-muted font-mono">
          Sin precios por cantidad: rige la lista del cliente o el precio base.
        </p>
      ) : (
        <ul className="space-y-1">
          {ordenados.map((t, idx) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-app-line-soft last:border-0"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-app-accent">{rangoLabel(t, idx)}</span>
                <span className="font-mono text-sm text-app-text">{formatPesos(Number(t.precio))} c/u</span>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => handleEliminar(t)}
                  disabled={isPending}
                  className="text-app-muted hover:text-app-red transition-colors disabled:opacity-50"
                  aria-label={`Eliminar tramo desde ${t.cantidad_min}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form onSubmit={handleGuardar} className="space-y-3 border-t border-app-line-soft pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tramo-cantidad">Desde (unidades)</Label>
              <NumberInput
                id="tramo-cantidad"
                decimals={0}
                value={cantidadMin}
                onChange={setCantidadMin}
                placeholder="Ej. 10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tramo-precio">Precio unitario</Label>
              <MoneyInput
                id="tramo-precio"
                decimals={2}
                value={precio}
                onChange={setPrecio}
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-mono text-app-muted">
              Guardar el mismo &ldquo;desde&rdquo; actualiza su precio.
            </p>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar tramo"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
