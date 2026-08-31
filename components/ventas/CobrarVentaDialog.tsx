"use client"

import { useState, useTransition } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { cobrarVenta } from "@/app/(dashboard)/caja/actions"
import { PagosInput, validarPagos, type PagoDraft } from "@/components/caja/PagosInput"
import { METODO_PAGO } from "@/lib/validators/caja"
import { formatPesos } from "@/lib/utils"

// Cobro rápido desde la tabla de ventas, sin entrar al detalle. Mismo circuito
// que CobrarVentaForm: va por cobrar_venta() — el estado de cobro NUNCA se
// setea a mano, lo deriva el RPC de la plata que entra (y esa plata queda en
// caja). El cobro puede dividirse en varios métodos (0043): cada pago es su
// propio movimiento. Vive dentro de una LinkRow → stopPropagation en trigger
// y contenido.
type Props = {
  ventaId:   string
  idPublico: string
  saldo:     number
}

export function CobrarVentaDialog({ ventaId, idPublico, saldo }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pagos, setPagos] = useState<PagoDraft[]>([{ metodo: METODO_PAGO.EFECTIVO, monto: saldo }])
  const [descripcion, setDescripcion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
        return
      }
      toast.success(`Cobro registrado en venta ${idPublico}`)
      setOpen(false)
      setPagos([{ metodo: METODO_PAGO.EFECTIVO, monto: null }])
      setDescripcion("")
      router.refresh()
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="h-6 rounded-full border border-app-accent/40 bg-app-accent/10 px-2 text-[11px] font-mono text-app-accent hover:bg-app-accent/20 transition-colors"
        >
          Cobrar
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150" />
        <Dialog.Content
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:max-w-md rounded-xl border border-app-line-soft bg-app-card shadow-2xl p-6 space-y-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150"
        >
          <div>
            <Dialog.Title className="font-display text-lg font-semibold text-app-text">
              Cobrar venta {idPublico}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-app-secondary mt-1">
              Saldo pendiente: <span className="font-mono text-app-amber">{formatPesos(saldo)}</span>.
              El cobro entra a la caja y el estado se actualiza solo.
            </Dialog.Description>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`cobro-metodo-${ventaId}-0`}>Pago</Label>
              <PagosInput
                pagos={pagos}
                onChange={setPagos}
                objetivo={saldo}
                idPrefix={`cobro-${ventaId}`}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`cobro-desc-${ventaId}`}>Descripción (opcional)</Label>
              <Input
                id={`cobro-desc-${ventaId}`}
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Registrando…" : "Registrar cobro"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
