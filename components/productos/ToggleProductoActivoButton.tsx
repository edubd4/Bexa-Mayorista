"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { toggleProductoActivo } from "@/app/(dashboard)/productos/actions"

type Props = {
  productoId: string
  idPublico: string
  activo: boolean
}

export function ToggleProductoActivoButton({ productoId, idPublico, activo }: Props) {
  const [isPending, startTransition] = useTransition()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleClick() {
    const ok = await confirm({
      title: activo
        ? `Desactivar producto ${idPublico}?`
        : `Reactivar producto ${idPublico}?`,
      description: activo
        ? "Deja de aparecer al armar ventas y en el catálogo. El stock se conserva."
        : "Vuelve a estar disponible para vender.",
      confirmLabel: activo ? "Desactivar" : "Reactivar",
      tone: activo ? "danger" : "default",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await toggleProductoActivo(productoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(activo ? "Producto desactivado" : "Producto reactivado")
    })
  }

  return (
    <Button
      type="button"
      variant={activo ? "outline" : "default"}
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending
        ? "Actualizando…"
        : activo ? "Desactivar" : "Reactivar"}
    </Button>
  )
}
