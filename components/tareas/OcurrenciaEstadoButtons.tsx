"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { cambiarEstadoOcurrencia } from "@/app/(dashboard)/tareas/actions"
import { ESTADO_TAREA, type EstadoTarea } from "@/lib/validators/tarea"
import { ESTADO_TAREA_LABEL } from "@/lib/tareas-ui"
import { cn } from "@/lib/utils"

// Los tres estados como botones-píldora. El activo va coloreado; tocar otro
// cambia el estado (el server sella la hora — RPC cambiar_estado_ocurrencia).
type Props = {
  ocurrenciaId: string
  estado: EstadoTarea
}

const ORDEN: EstadoTarea[] = [
  ESTADO_TAREA.PENDIENTE,
  ESTADO_TAREA.EN_PROCESO,
  ESTADO_TAREA.FINALIZADA,
]

const ACTIVO: Record<EstadoTarea, string> = {
  PENDIENTE:  "border-app-amber/50 bg-app-amber/15 text-app-amber",
  EN_PROCESO: "border-app-accent/50 bg-app-accent/15 text-app-accent",
  FINALIZADA: "border-app-green/50 bg-app-green/15 text-app-green",
}

export function OcurrenciaEstadoButtons({ ocurrenciaId, estado }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleClick(nuevo: EstadoTarea) {
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
    <div className="inline-flex items-center gap-1" role="group" aria-label="Estado de la tarea">
      {ORDEN.map((e) => (
        <button
          key={e}
          type="button"
          disabled={isPending}
          onClick={() => handleClick(e)}
          className={cn(
            "h-6 rounded-full border px-2 text-[11px] font-mono transition-colors disabled:opacity-50",
            e === estado
              ? ACTIVO[e]
              : "border-app-line text-app-muted hover:text-app-text hover:border-app-line-soft",
          )}
        >
          {ESTADO_TAREA_LABEL[e]}
        </button>
      ))}
    </div>
  )
}
