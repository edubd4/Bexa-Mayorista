"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { toggleListaActivo } from "@/app/(dashboard)/listas-precios/actions"

type Props = {
  listaId: string
  idPublico: string
  activo: boolean
}

export function ToggleListaActivoButton({ listaId, idPublico, activo }: Props) {
  const [isPending, startTransition] = useTransition()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleClick() {
    const ok = await confirm({
      title: activo ? `Desactivar lista ${idPublico}?` : `Reactivar lista ${idPublico}?`,
      description: activo
        ? "Los clientes asignados a esta lista van a caer a precio base. Los precios guardados se mantienen."
        : "Vuelve a estar disponible para asignar a clientes.",
      confirmLabel: activo ? "Desactivar" : "Reactivar",
      tone: activo ? "danger" : "default",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await toggleListaActivo(listaId)
      if (!res.ok) toast.error(res.error)
      else toast.success(activo ? "Lista desactivada" : "Lista reactivada")
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
      {isPending ? "…" : activo ? "Desactivar" : "Reactivar"}
    </Button>
  )
}
