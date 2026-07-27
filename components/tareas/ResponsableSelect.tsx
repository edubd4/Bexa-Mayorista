"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { asignarTarea } from "@/app/(dashboard)/tareas/actions"
import { cn } from "@/lib/utils"

// Asignación de responsable desde la fila (atajo del admin, 0026): sin
// entrar a la ficha. Vive dentro de una LinkRow → stopPropagation.
type Props = {
  tareaId: string
  asignadoA: string | null
  usuarios: { id: string; nombre: string }[]
}

export function ResponsableSelect({ tareaId, asignadoA, usuarios }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevo: string) {
    startTransition(async () => {
      const res = await asignarTarea(tareaId, nuevo || null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(nuevo ? "Responsable asignado" : "Tarea sin asignar")
      router.refresh()
    })
  }

  return (
    <select
      value={asignadoA ?? ""}
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value)}
      className={cn(
        "h-7 max-w-[150px] rounded-md border bg-app-input px-2 text-xs cursor-pointer",
        "focus:outline-none focus:ring-1 focus:ring-app-accent/50 disabled:opacity-50",
        asignadoA ? "border-app-line text-app-text" : "border-app-amber/50 text-app-amber",
      )}
      aria-label="Asignar responsable"
    >
      <option value="">Sin asignar</option>
      {usuarios.map((u) => (
        <option key={u.id} value={u.id}>{u.nombre}</option>
      ))}
    </select>
  )
}
