"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cancelarCompra } from "@/app/(dashboard)/compras/actions"

export function CancelarCompraButton({ compraId, idPublico }: { compraId: string; idPublico: string }) {
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
      title: `Cancelar compra ${idPublico}?`,
      description:
        "Se revierte el stock (una SALIDA compensatoria por cada ítem). Si ya vendiste parte de este stock, el trigger va a rechazar — hacé un AJUSTE primero.",
      confirmLabel: "Cancelar compra",
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await cancelarCompra({ compra_id: compraId, motivo: motivo.trim() || undefined })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Compra cancelada")
    })
  }

  return (
    <div className="space-y-2">
      {showInput && (
        <div className="space-y-1.5">
          <Label htmlFor="motivo-cancelar-compra">Motivo (opcional)</Label>
          <Input
            id="motivo-cancelar-compra"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Devolución al proveedor, error de carga…"
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
        {isPending ? "Cancelando…" : showInput ? "Confirmar cancelación" : "Cancelar compra"}
      </Button>
    </div>
  )
}
