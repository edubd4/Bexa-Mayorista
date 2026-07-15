"use client"

import { useTransition } from "react"
import { Pause, Play, XCircle, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cambiarEstadoManual } from "@/app/(dashboard)/campanas/actions"
import {
  ESTADO_CAMPANA_MANUAL,
  type EstadoCampanaEfectivo,
  type EstadoCampanaManual,
} from "@/lib/validators/campana"

type Props = {
  campanaId: string
  estadoEfectivo: EstadoCampanaEfectivo
  estadoManual: EstadoCampanaManual | null
}

export function CambiarEstadoButtons({ campanaId, estadoEfectivo, estadoManual }: Props) {
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  async function handle(nuevo: EstadoCampanaManual | null, msg: string, tone: "default" | "danger" = "default") {
    const ok = await confirm({
      title: msg,
      description:
        nuevo === null
          ? "El estado vuelve a calcularse automáticamente según fecha."
          : "Podés revertir esta acción cambiando el estado nuevamente.",
      confirmLabel: "Confirmar",
      tone,
    })
    if (!ok) return

    startTransition(async () => {
      const res = await cambiarEstadoManual(campanaId, nuevo)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Estado actualizado")
    })
  }

  const puedePausar = estadoEfectivo === "ACTIVA"
  const puedeReanudar = estadoEfectivo === "PAUSADA"
  const puedeCancelar = estadoEfectivo !== "CANCELADA" && estadoEfectivo !== "CONCLUIDA"
  const puedeVolverAuto = estadoManual !== null && estadoManual !== ESTADO_CAMPANA_MANUAL.CANCELADA

  return (
    <div className="flex flex-wrap gap-2">
      {puedePausar && (
        <Button variant="outline" size="sm" disabled={isPending}
          onClick={() => handle(ESTADO_CAMPANA_MANUAL.PAUSADA, "¿Pausar campaña?")}>
          <Pause className="w-3.5 h-3.5" /> Pausar
        </Button>
      )}
      {puedeReanudar && (
        <Button variant="outline" size="sm" disabled={isPending}
          onClick={() => handle(null, "¿Reanudar campaña?")}>
          <Play className="w-3.5 h-3.5" /> Reanudar
        </Button>
      )}
      {puedeVolverAuto && !puedeReanudar && (
        <Button variant="ghost" size="sm" disabled={isPending}
          onClick={() => handle(null, "¿Dejar el estado en automático?")}>
          <Play className="w-3.5 h-3.5" /> Automático
        </Button>
      )}
      {puedeCancelar && (
        <Button variant="outline" size="sm" disabled={isPending}
          onClick={() => handle(ESTADO_CAMPANA_MANUAL.CANCELADA, "¿Cancelar campaña?", "danger")}>
          <Ban className="w-3.5 h-3.5" /> Cancelar
        </Button>
      )}
      {estadoEfectivo === "CANCELADA" && (
        <Button variant="ghost" size="sm" disabled={isPending}
          onClick={() => handle(null, "¿Reactivar campaña?")}>
          <XCircle className="w-3.5 h-3.5" /> Reactivar
        </Button>
      )}
    </div>
  )
}
