"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { cambiarEstadoEntrega } from "@/app/(dashboard)/ventas/actions"
import { ESTADO_ENTREGA, type EstadoEntrega } from "@/lib/validators/venta"
import { ESTADO_ENTREGA_LABEL } from "@/lib/ventas-ui"
import { cn } from "@/lib/utils"

// Select inline con pinta de badge: cambia la entrega sin entrar a la venta.
// Vive dentro de una LinkRow → stopPropagation, si no cada click navega.
// CANCELADA no es opción (eso es cancelar_venta); si la venta ya está
// cancelada, el padre muestra el Badge estático en su lugar.
type Props = {
  ventaId: string
  estado: Exclude<EstadoEntrega, "CANCELADA">
}

const OPCIONES: Exclude<EstadoEntrega, "CANCELADA">[] = [
  ESTADO_ENTREGA.PEDIDO,
  ESTADO_ENTREGA.EN_PREPARACION,
  ESTADO_ENTREGA.ENTREGADA,
]

// Espeja los colores de ESTADO_ENTREGA_VARIANT de lib/ventas-ui (badge.tsx no
// exporta sus clases y un <select> no puede ser un <Badge>).
const ESTILO: Record<Exclude<EstadoEntrega, "CANCELADA">, string> = {
  ENTREGADA:      "border-app-green/40 bg-app-green/10 text-app-green",
  PEDIDO:         "border-app-amber/40 bg-app-amber/10 text-app-amber",
  EN_PREPARACION: "border-app-accent/40 bg-app-accent/10 text-app-accent",
}

export function EstadoEntregaSelect({ ventaId, estado }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevo: Exclude<EstadoEntrega, "CANCELADA">) {
    if (nuevo === estado) return
    startTransition(async () => {
      const res = await cambiarEstadoEntrega({ venta_id: ventaId, estado: nuevo })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Entrega → ${ESTADO_ENTREGA_LABEL[nuevo]}`)
      router.refresh()
    })
  }

  return (
    <select
      value={estado}
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value as Exclude<EstadoEntrega, "CANCELADA">)}
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
      aria-label="Cambiar estado de entrega"
    >
      {OPCIONES.map((op) => (
        <option key={op} value={op} className="bg-app-card text-app-text">
          {ESTADO_ENTREGA_LABEL[op]}
        </option>
      ))}
    </select>
  )
}
