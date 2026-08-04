"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { emitirFactura } from "@/app/(dashboard)/ventas/actions"

type Props = {
  ventaId: string
  idPublico: string
  /** "Factura A" / "Factura B" — resuelto en el server según el cliente */
  tipoLabel: string
  /** Nombre visible del receptor + su condición de IVA, para el confirm */
  receptor: string
  totalFmt: string
}

export function EmitirFacturaButton({ ventaId, idPublico, tipoLabel, receptor, totalFmt }: Props) {
  const [isPending, startTransition] = useTransition()
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()

  async function handleClick() {
    const ok = await confirm({
      title: `¿Emitir ${tipoLabel}?`,
      description: `Venta ${idPublico} · ${receptor} · Total ${totalFmt}.\nEl comprobante se autoriza en ARCA (CAE) y no se puede modificar después — solo anular con nota de crédito.`,
      confirmLabel: `Emitir ${tipoLabel}`,
    })
    if (!ok) return

    startTransition(async () => {
      const res = await emitirFactura({ venta_id: ventaId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${tipoLabel} emitida y autorizada por ARCA`)
      router.refresh()
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
      {isPending ? "Emitiendo…" : `Emitir ${tipoLabel}`}
    </Button>
  )
}
