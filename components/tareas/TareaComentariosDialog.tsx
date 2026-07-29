"use client"

import { useState, useTransition } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { MessageCircle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  enviarComentario,
  listarComentarios,
  type ComentarioTarea,
} from "@/app/(dashboard)/tareas/actions"
import { cn } from "@/lib/utils"

// La conversación de la tarea (0026): comentarios inmutables con "visto",
// para no tener que avisarse por afuera. Abrir el diálogo marca como leídos
// los mensajes de otros — abrir ES leer. Vive dentro de una LinkRow →
// stopPropagation.
//
// TRES ESTADOS, y que se distingan de un vistazo (0029). Antes el globito solo
// se pintaba si había pendientes: una tarea con la conversación entera leída se
// veía IDÉNTICA a una sin un solo mensaje, así que la charla desaparecía apenas
// la abrías una vez. Ahora:
//   sin mensajes   → gris pelado, no hay nada que leer
//   sin leer  (>0) → ROJO con el número de pendientes
//   al día    (>0) → VERDE con el total: hay conversación y estás al día
type Props = {
  tareaId: string
  tareaNombre: string
  noLeidos: number
  /** Total de mensajes de la tarea, los propios incluidos. */
  total: number
  usuarioId: string
}

function horaCorta(ts: string): string {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export function TareaComentariosDialog({
  tareaId,
  tareaNombre,
  noLeidos,
  total,
  usuarioId,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [comentarios, setComentarios] = useState<ComentarioTarea[]>([])
  const [texto, setTexto] = useState("")
  const [isPending, startTransition] = useTransition()

  // Mientras el diálogo está abierto los mensajes ya están leídos: no tiene
  // sentido que el globito de atrás siga en rojo mientras los estás mirando.
  const hayPendientes = noLeidos > 0 && !open
  const hayCharla = total > 0

  function handleOpenChange(abierto: boolean) {
    setOpen(abierto)
    if (abierto) {
      setCargando(true)
      startTransition(async () => {
        const res = await listarComentarios(tareaId)
        setCargando(false)
        if (!res.ok) {
          toast.error(res.error)
          setOpen(false)
          return
        }
        setComentarios(res.data ?? [])
        // El badge de no-leídos cambió al abrir: refrescar la tabla de atrás.
        router.refresh()
      })
    }
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    startTransition(async () => {
      const res = await enviarComentario({ tarea_id: tareaId, texto: texto.trim() })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.data) setComentarios((prev) => [...prev, res.data!])
      setTexto("")
      // El total del globito subió: sin esto la fila de atrás sigue mostrando
      // el número viejo hasta la próxima navegación.
      router.refresh()
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors",
            hayPendientes
              ? "text-app-red hover:bg-app-red/10"
              : hayCharla
                ? "text-app-green hover:bg-app-green/10"
                : "text-app-muted hover:text-app-accent hover:bg-app-accent/10",
          )}
          // El aria-label dice lo mismo que el color: quien navega con lector de
          // pantalla no ve el rojo ni el verde.
          aria-label={
            hayPendientes
              ? `Comentarios de ${tareaNombre} · ${noLeidos} sin leer`
              : hayCharla
                ? `Comentarios de ${tareaNombre} · ${total} ${total === 1 ? "mensaje leído" : "mensajes leídos"}`
                : `Comentarios de ${tareaNombre} · sin mensajes`
          }
          title={
            hayPendientes
              ? `${noLeidos} sin leer`
              : hayCharla
                ? `${total} ${total === 1 ? "mensaje" : "mensajes"} · al día`
                : "Sin mensajes"
          }
        >
          <MessageCircle className="w-4 h-4" />
          {(hayPendientes || hayCharla) && (
            <span
              className={cn(
                "absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center",
                hayPendientes
                  ? "bg-app-red text-white"
                  : "bg-app-green/20 text-app-green border border-app-green/40",
              )}
            >
              {hayPendientes
                ? (noLeidos > 9 ? "9+" : noLeidos)
                : (total > 9 ? "9+" : total)}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150" />
        <Dialog.Content
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-app-line-soft bg-app-card shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150"
        >
          <div className="px-5 py-4 border-b border-app-line-soft">
            <Dialog.Title className="font-display text-lg font-semibold text-app-text">
              {tareaNombre}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-app-muted font-mono mt-0.5">
              La conversación queda acá, con la tarea — no en el WhatsApp de nadie.
            </Dialog.Description>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[120px]">
            {cargando ? (
              <p className="text-sm text-app-muted font-mono">Cargando…</p>
            ) : comentarios.length === 0 ? (
              <p className="text-sm text-app-muted font-mono">
                Sin comentarios todavía. Escribí el primero.
              </p>
            ) : (
              comentarios.map((c) => {
                const propio = c.autor_id === usuarioId
                const vistos = c.visto_por.filter((n) => n !== c.autor_nombre)
                return (
                  <div key={c.id} className={cn("flex", propio ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2",
                        propio
                          ? "bg-app-accent/10 border border-app-accent/20"
                          : "bg-app-surface-mid border border-app-line-soft",
                      )}
                    >
                      <p className="text-[10.5px] font-mono text-app-muted">
                        {propio ? "Vos" : c.autor_nombre} · {horaCorta(c.created_at)}
                      </p>
                      <p className="text-sm text-app-text whitespace-pre-wrap mt-0.5">{c.texto}</p>
                      {propio && vistos.length > 0 && (
                        <p className="text-[10px] font-mono text-app-green mt-1 text-right">
                          ✓✓ Visto por {vistos.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <form onSubmit={handleEnviar} className="px-5 py-3 border-t border-app-line-soft flex items-end gap-2">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribí un comentario…"
              rows={2}
              className="flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleEnviar(e)
                }
              }}
            />
            <Button type="submit" size="sm" disabled={isPending || !texto.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
