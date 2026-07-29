"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

// Botón de eliminar con baja inteligente (0028).
//
// LO IMPORTANTE ES QUE NO MIENTE. El servidor decide si puede borrar de verdad
// (el registro nunca se usó) o si tiene que desactivar (tiene ventas,
// movimientos, compras…), y devuelve CUÁL de las dos cosas hizo. El toast dice
// eso y no un "listo" genérico: el usuario que aprieta "Eliminar" y ve el
// producto seguir en la lista de inactivos tiene que entender por qué, o deja
// de confiar en el sistema.
//
// El borrado real no se ofrece siempre porque `venta_items.producto_id` y
// `ventas.cliente_id` son `on delete restrict`: la base rechaza el DELETE de
// algo que se vendió. Y el historial maestro no salva esto — guarda el TEXTO
// del evento, no la fila; con el producto borrado la venta vieja no se
// reconstruye.

type EliminarResult =
  | { ok: false; error: string }
  | { ok: true; resultado: "BORRADO" | "DESACTIVADO" }

type Props = {
  /** Se ejecuta en el server; decide borrar o desactivar. */
  action: () => Promise<EliminarResult>
  /** Ej. "PROD-0012 · Taladro percutor" */
  etiqueta: string
  /** "producto" | "cliente" — para los textos. */
  entidad: string
  /** A dónde ir si se borró de verdad (la ficha deja de existir). */
  redirectTo?: string
  size?: "sm" | "default"
}

export function EliminarButton({
  action,
  etiqueta,
  entidad,
  redirectTo,
  size = "sm",
}: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: `¿Eliminar ${etiqueta}?`,
      description:
        `Si este ${entidad} nunca se usó, se borra definitivamente. ` +
        `Si ya tiene movimientos, se da de baja y se conserva: borrarlo ` +
        `rompería los registros viejos que lo referencian. En los dos casos ` +
        `queda asentado en el historial con tu nombre.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await action()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.resultado === "BORRADO") {
        toast.success(`${etiqueta} eliminado definitivamente — nunca se había usado.`)
        if (redirectTo) {
          router.push(redirectTo)
          return
        }
      } else {
        toast.success(
          `${etiqueta} dado de baja. Tenía movimientos, así que se conserva para no romper el historial.`,
        )
      }
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size={size}
      onClick={handleClick}
      disabled={isPending}
    >
      <Trash2 className="w-3.5 h-3.5" />
      {isPending ? "Eliminando…" : "Eliminar"}
    </Button>
  )
}
