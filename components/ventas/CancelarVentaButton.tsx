"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cancelarVenta } from "@/app/(dashboard)/ventas/actions"

export function CancelarVentaButton({ ventaId, idPublico }: { ventaId: string; idPublico: string }) {
  const [isPending, startTransition] = useTransition()
  const [motivo, setMotivo] = useState("")
  const [showInput, setShowInput] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()

  async function handleClick() {
    if (!showInput) {
      setShowInput(true)
      return
    }
    const ok = await confirm({
      title: `Cancelar venta ${idPublico}?`,
      description:
        "Se revierte el stock (una ENTRADA compensatoria por cada item). La venta queda con estado CANCELADA.",
      confirmLabel: "Cancelar venta",
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await cancelarVenta({ venta_id: ventaId, motivo: motivo.trim() || undefined })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Venta cancelada")
    })
  }

  return (
    <div className="space-y-2">
      {showInput && (
        <div className="space-y-1.5">
          <Label htmlFor="motivo-cancelar">Motivo (opcional)</Label>
          <Input
            id="motivo-cancelar"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cliente arrepentido, error de carga, etc."
          />
        </div>
      )}
      <Button
        type="button"
        variant={showInput ? "destructive" : "outline"}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Cancelando…" : showInput ? "Confirmar cancelación" : "Cancelar venta"}
      </Button>
    </div>
  )
}
