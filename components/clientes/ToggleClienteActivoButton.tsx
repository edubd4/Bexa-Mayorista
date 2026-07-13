"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { toggleClienteActivo } from "@/app/(dashboard)/clientes/actions"

type Props = {
  clienteId: string
  idPublico: string
  activo: boolean
}

export function ToggleClienteActivoButton({ clienteId, idPublico, activo }: Props) {
  const [isPending, startTransition] = useTransition()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleClick() {
    const ok = await confirm({
      title: activo
        ? `Desactivar cliente ${idPublico}?`
        : `Reactivar cliente ${idPublico}?`,
      description: activo
        ? "Deja de aparecer en el selector de ventas y en listados por defecto. Los históricos se mantienen."
        : "Vuelve a estar disponible para registrar ventas.",
      confirmLabel: activo ? "Desactivar" : "Reactivar",
      tone: activo ? "danger" : "default",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await toggleClienteActivo(clienteId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(activo ? "Cliente desactivado" : "Cliente reactivado")
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
