"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { toggleProveedorActivo } from "@/app/(dashboard)/proveedores/actions"

type Props = {
  proveedorId: string
  idPublico: string
  activo: boolean
}

export function ToggleProveedorActivoButton({ proveedorId, idPublico, activo }: Props) {
  const [isPending, startTransition] = useTransition()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleClick() {
    const ok = await confirm({
      title: activo
        ? `Desactivar proveedor ${idPublico}?`
        : `Reactivar proveedor ${idPublico}?`,
      description: activo
        ? "Deja de aparecer al asignar productos y en el selector. Los históricos se mantienen."
        : "Vuelve a estar disponible para asignar en productos y compras.",
      confirmLabel: activo ? "Desactivar" : "Reactivar",
      tone: activo ? "danger" : "default",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await toggleProveedorActivo(proveedorId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(activo ? "Proveedor desactivado" : "Proveedor reactivado")
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
