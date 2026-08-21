"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileX2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { emitirNotaCredito } from "@/app/(dashboard)/ventas/actions"

type Props = {
  ventaId: string
  idPublico: string
  /** "Nota de Crédito A" / "Nota de Crédito B" — misma letra que la factura */
  tipoLabel: string
  /** "Factura B 0001-00000042" — lo que se anula, para el confirm */
  facturaLabel: string
  totalFmt: string
}

// Solo lo ve el admin (la página no lo renderiza para vendedores y la RLS de
// 0042 lo rechaza igual). El motivo es obligatorio: es "el hecho que origina"
// la NC según la RG 4540 y queda en el comprobante y el historial.
export function EmitirNotaCreditoButton({ ventaId, idPublico, tipoLabel, facturaLabel, totalFmt }: Props) {
  const [isPending, startTransition] = useTransition()
  const [motivo, setMotivo] = useState("")
  const [showInput, setShowInput] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()

  async function handleClick() {
    if (!showInput) {
      setShowInput(true)
      return
    }
    if (motivo.trim().length < 3) {
      toast.error("Contá el motivo de la anulación (devolución, error de carga…)")
      return
    }
    const ok = await confirm({
      title: `¿Emitir ${tipoLabel}?`,
      description: `Anula fiscalmente ${facturaLabel} (venta ${idPublico}) por el total de ${totalFmt}.\nSe autoriza en ARCA (CAE) y no se puede deshacer. Después vas a poder cancelar la venta si corresponde.`,
      confirmLabel: `Emitir ${tipoLabel}`,
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await emitirNotaCredito({ venta_id: ventaId, motivo: motivo.trim() })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${tipoLabel} emitida y autorizada por ARCA`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {showInput && (
        <div className="space-y-1.5">
          <Label htmlFor="motivo-nc">Motivo de la anulación</Label>
          <Input
            id="motivo-nc"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Devolución de mercadería, error de carga…"
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
        <FileX2 className="w-3.5 h-3.5 mr-1.5" />
        {isPending ? "Emitiendo…" : showInput ? `Confirmar ${tipoLabel}` : "Emitir nota de crédito"}
      </Button>
    </div>
  )
}
