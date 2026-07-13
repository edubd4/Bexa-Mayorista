"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { deleteUsuario } from "@/app/(dashboard)/usuarios/actions"

type Props = {
  usuarioId: string
  usuarioEmail: string
  disabled?: boolean
  disabledReason?: string
}

export function DeleteUsuarioButton({ usuarioId, usuarioEmail, disabled, disabledReason }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    if (disabled) return

    const ok = await confirm({
      title: `¿Eliminar al usuario ${usuarioEmail}?`,
      description:
        "Se borra su cuenta de acceso al sistema (Auth + profile). El historial de acciones que hizo se preserva para auditoría.\n\nEsta acción NO se puede deshacer.",
      confirmLabel: "Eliminar usuario",
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const result = await deleteUsuario(usuarioId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Usuario ${usuarioEmail} eliminado`)
      router.push("/usuarios")
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        onClick={handleClick}
        disabled={disabled || isPending}
        title={disabledReason}
      >
        <Trash2 className="w-4 h-4" />
        {isPending ? "Eliminando…" : "Eliminar usuario"}
      </Button>
      {disabled && disabledReason && (
        <p className="text-[11px] text-app-muted">{disabledReason}</p>
      )}
    </div>
  )
}
