"use client"

import { useState, useTransition } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { anularGasto } from "@/app/(dashboard)/gastos/actions"
import { formatPesos } from "@/lib/utils"

// Anulación de gasto (0023): devuelve la plata a la caja con un INGRESO
// AJUSTE y marca el gasto como anulado. Motivo obligatorio — la anulación
// tiene que explicarse sola en el extracto. Vive dentro de una LinkRow →
// stopPropagation.
type Props = {
  gastoId:   string
  idPublico: string
  monto:     number
}

export function AnularGastoButton({ gastoId, idPublico, monto }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!motivo.trim()) return setError("El motivo de la anulación es obligatorio")

    startTransition(async () => {
      const res = await anularGasto({ gasto_id: gastoId, motivo: motivo.trim() })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(`Gasto ${idPublico} anulado — la plata volvió a la caja`)
      setOpen(false)
      setMotivo("")
      router.refresh()
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="h-6 rounded-full border border-app-red/40 bg-app-red/10 px-2 text-[11px] font-mono text-app-red hover:bg-app-red/20 transition-colors"
        >
          Anular
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
              ¿Anular el gasto {idPublico}?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-app-secondary mt-1">
              Vuelven <span className="font-mono text-app-green">{formatPesos(monto)}</span> a
              la caja con un movimiento de AJUSTE. El gasto queda marcado como
              anulado — no se borra nada. Si el gasto era real pero estaba mal
              cargado, después registralo de nuevo con los datos correctos.
            </Dialog.Description>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`anular-motivo-${gastoId}`}>Motivo</Label>
              <Input
                id={`anular-motivo-${gastoId}`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. monto equivocado, gasto duplicado…"
                autoFocus
              />
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
              <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
                {isPending ? "Anulando…" : "Anular gasto"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
