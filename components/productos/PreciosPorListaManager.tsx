"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MoneyInput } from "@/components/ui/number-input"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { removeItemLista, upsertItemLista } from "@/app/(dashboard)/listas-precios/actions"
import { formatPesos } from "@/lib/utils"

// El precio de ESTE producto en cada lista activa, editable desde la ficha —
// antes había que entrar a Listas de precios, abrir cada lista y buscar el
// producto. Misma data, mismas actions (upsertItemLista/removeItemLista):
// esto es otra puerta al mismo lugar, no otra fuente de verdad.
export type PrecioPorListaFila = {
  listaId: string
  listaIdPublico: string
  nombre: string
  itemId: string | null
  precio: number | null
}

type Props = {
  productoId: string
  filas: PrecioPorListaFila[]
}

export function PreciosPorListaManager({ productoId, filas }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [edicion, setEdicion] = useState<Record<string, number | null>>({})
  const [isPending, startTransition] = useTransition()

  if (filas.length === 0) {
    return (
      <p className="text-sm text-app-muted font-mono">
        No hay listas de precios activas. Se crean desde Listas de precios.
      </p>
    )
  }

  function handleGuardar(fila: PrecioPorListaFila) {
    const nuevo = edicion[fila.listaId]
    if (nuevo === undefined || nuevo === null || nuevo < 0) return
    startTransition(async () => {
      const res = await upsertItemLista({
        lista_precio_id: fila.listaId,
        producto_id: productoId,
        precio: nuevo,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Precio en ${fila.nombre} guardado`)
      setEdicion((prev) => {
        const next = { ...prev }
        delete next[fila.listaId]
        return next
      })
      router.refresh()
    })
  }

  async function handleQuitar(fila: PrecioPorListaFila) {
    if (!fila.itemId) return
    const ok = await confirm({
      title: `¿Quitar el producto de ${fila.nombre}?`,
      description: "Los clientes con esa lista vuelven a pagar el precio base (o el tramo por cantidad, si hay).",
      confirmLabel: "Quitar de la lista",
      tone: "warning",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeItemLista(fila.listaId, fila.itemId!)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Quitado de ${fila.nombre}`)
      router.refresh()
    })
  }

  return (
    <ul className="space-y-2">
      {filas.map((fila) => {
        const enEdicion = edicion[fila.listaId] !== undefined
        return (
          <li
            key={fila.listaId}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_auto] gap-2 items-center py-1.5 border-b border-app-line-soft last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{fila.nombre}</p>
              <p className="font-mono text-[10.5px] text-app-muted">
                {fila.listaIdPublico}
                {fila.precio !== null && !enEdicion && ` · ${formatPesos(fila.precio)}`}
                {fila.precio === null && !enEdicion && " · usa precio base"}
              </p>
            </div>

            {enEdicion ? (
              <>
                <MoneyInput
                  decimals={2}
                  value={edicion[fila.listaId]}
                  onChange={(v) => setEdicion((prev) => ({ ...prev, [fila.listaId]: v }))}
                  aria-label={`Precio en ${fila.nombre}`}
                />
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" onClick={() => handleGuardar(fila)} disabled={isPending}>
                    {isPending ? "…" : "Guardar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() =>
                      setEdicion((prev) => {
                        const next = { ...prev }
                        delete next[fila.listaId]
                        return next
                      })
                    }
                    className="text-xs font-mono text-app-muted hover:text-app-text px-1"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 sm:col-start-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    setEdicion((prev) => ({ ...prev, [fila.listaId]: fila.precio }))
                  }
                >
                  {fila.precio === null ? "Poner precio" : "Editar"}
                </Button>
                {fila.itemId && (
                  <button
                    type="button"
                    onClick={() => handleQuitar(fila)}
                    disabled={isPending}
                    className="text-app-muted hover:text-app-red transition-colors p-1.5 disabled:opacity-50"
                    aria-label={`Quitar de ${fila.nombre}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
