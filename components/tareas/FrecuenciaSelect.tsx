"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { cambiarFrecuenciaTarea } from "@/app/(dashboard)/tareas/actions"
import { FRECUENCIA_TAREA, type FrecuenciaTarea } from "@/lib/validators/tarea"
import { FRECUENCIA_TAREA_LABEL } from "@/lib/tareas-ui"

// Cambio rápido de frecuencia desde la fila (atajo del admin, 0026). Si pasa
// a semanal/mensual, el server arranca con lunes / día 1 — el día exacto y la
// hora se afinan en la ficha (click en la fila).
type Props = {
  tareaId: string
  frecuencia: FrecuenciaTarea
  // Texto descriptivo ("Mié 10:00") que se muestra debajo del select.
  detalle: string
}

export function FrecuenciaSelect({ tareaId, frecuencia, detalle }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleChange(nueva: FrecuenciaTarea) {
    if (nueva === frecuencia) return
    startTransition(async () => {
      const res = await cambiarFrecuenciaTarea(tareaId, nueva)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Frecuencia → ${FRECUENCIA_TAREA_LABEL[nueva]}`)
      router.refresh()
    })
  }

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <select
        value={frecuencia}
        disabled={isPending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => handleChange(e.target.value as FrecuenciaTarea)}
        className="h-7 rounded-md border border-app-line bg-app-input px-2 text-xs text-app-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-app-accent/50 disabled:opacity-50"
        aria-label="Cambiar frecuencia"
      >
        {(Object.keys(FRECUENCIA_TAREA) as FrecuenciaTarea[]).map((f) => (
          <option key={f} value={f}>{FRECUENCIA_TAREA_LABEL[f]}</option>
        ))}
      </select>
      <span className="font-mono text-[10px] text-app-muted pl-0.5">{detalle}</span>
    </div>
  )
}
