"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toggleTareaActivo } from "@/app/(dashboard)/tareas/actions"

// Baja lógica del catálogo: una tarea inactiva deja de generar ocurrencias,
// pero su historial de ejecuciones queda.
export function ToggleTareaActivoButton({ tareaId, activo }: { tareaId: string; activo: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    if (activo) {
      const ok = await confirm({
        title: "¿Desactivar esta tarea?",
        description: "Deja de aparecer en el día a día del equipo. El historial de ejecuciones se conserva.",
        confirmLabel: "Desactivar",
        tone: "warning",
      })
      if (!ok) return
    }
    startTransition(async () => {
      const res = await toggleTareaActivo(tareaId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(activo ? "Tarea desactivada" : "Tarea reactivada")
      router.refresh()
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "…" : activo ? "Desactivar" : "Reactivar"}
    </Button>
  )
}
