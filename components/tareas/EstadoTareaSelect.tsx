"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { cambiarEstadoOcurrencia } from "@/app/(dashboard)/tareas/actions"
import { ESTADO_TAREA, type EstadoTarea } from "@/lib/validators/tarea"
import { ESTADO_TAREA_LABEL } from "@/lib/tareas-ui"
import { cn } from "@/lib/utils"

// Select con pinta de badge para cambiar el estado de una ocurrencia desde la
// tabla — mismo patrón que EstadoEntregaSelect (ventas). El server sella la
// hora real (RPC cambiar_estado_ocurrencia). Vive dentro de filas clickeables
// → stopPropagation.
type Props = {
  ocurrenciaId: string
  estado: EstadoTarea
}

const OPCIONES: EstadoTarea[] = [
  ESTADO_TAREA.PENDIENTE,
  ESTADO_TAREA.EN_PROCESO,
  ESTADO_TAREA.FINALIZADA,
]

const ESTILO: Record<EstadoTarea, string> = {
  PENDIENTE:  "border-app-amber/40 bg-app-amber/10 text-app-amber",
  EN_PROCESO: "border-app-accent/40 bg-app-accent/10 text-app-accent",
  FINALIZADA: "border-app-green/40 bg-app-green/10 text-app-green",
}

export function EstadoTareaSelect({ ocurrenciaId, estado }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevo: EstadoTarea) {
    if (nuevo === estado) return
    startTransition(async () => {
      const res = await cambiarEstadoOcurrencia({ ocurrencia_id: ocurrenciaId, estado: nuevo })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Tarea → ${ESTADO_TAREA_LABEL[nuevo]}`)
      router.refresh()
    })
  }

  return (
    <select
      value={estado}
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value as EstadoTarea)}
      className={cn(
        "h-6 rounded-full border px-2 pr-5 text-[11px] font-mono cursor-pointer",
        "appearance-none bg-no-repeat bg-[right_0.35rem_center]",
        "focus:outline-none focus:ring-1 focus:ring-app-accent/50 disabled:opacity-50",
        ESTILO[estado],
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      aria-label="Cambiar estado de la tarea"
    >
      {OPCIONES.map((op) => (
        <option key={op} value={op} className="bg-app-card text-app-text">
          {ESTADO_TAREA_LABEL[op]}
        </option>
      ))}
    </select>
  )
}
