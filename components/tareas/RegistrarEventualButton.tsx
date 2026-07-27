"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { registrarTareaEventual } from "@/app/(dashboard)/tareas/actions"

// Tareas "cuando corresponda": no se generan solas — el asignado las
// materializa el día que las hace, y ahí arranca el circuito de estados.
export function RegistrarEventualButton({ tareaId }: { tareaId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const res = await registrarTareaEventual(tareaId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Tarea registrada para hoy — marcala cuando avances")
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="h-6 rounded-full border border-app-accent/40 bg-app-accent/10 px-2 text-[11px] font-mono text-app-accent hover:bg-app-accent/20 transition-colors disabled:opacity-50"
    >
      {isPending ? "…" : "La hago hoy"}
    </button>
  )
}
