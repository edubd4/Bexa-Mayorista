"use client"

import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

// ============================================================================
// ConfirmDialog — modal de confirmación reutilizable con Radix.
//
// Uso:
//   const confirm = useConfirm()
//
//   const ok = await confirm({
//     title: "¿Cancelar orden?",
//     description: "Esta acción cambia el estado a CANCELADA. La podés revertir después.",
//     confirmLabel: "Cancelar orden",
//     tone: "danger",
//   })
//   if (!ok) return
//   // ... proceder ...
// ============================================================================

type Tone = "danger" | "warning" | "default"

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: Tone
}

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    // Fallback a window.confirm nativo si no hay provider (nunca debería pasar en producción)
    return async (opts: ConfirmOptions) => {
      const msg = opts.description ? `${opts.title}\n\n${opts.description}` : opts.title
      return typeof window !== "undefined" ? window.confirm(msg) : false
    }
  }
  return ctx
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void }

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null)

  const confirm = React.useCallback<ConfirmContextValue>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve })
      }),
    [],
  )

  function handleClose(result: boolean) {
    pending?.resolve(result)
    setPending(null)
  }

  const tone: Tone = pending?.tone ?? "default"
  const toneClasses = {
    danger:  { icon: "text-app-red",   button: "destructive" as const },
    warning: { icon: "text-app-amber", button: "default" as const },
    default: { icon: "text-app-accent",  button: "default" as const },
  }[tone]

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Dialog.Root open={pending !== null} onOpenChange={(open) => { if (!open) handleClose(false) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150" />
          <Dialog.Content className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:max-w-md rounded-xl border border-app-line-soft bg-app-card shadow-2xl p-6 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className={`shrink-0 rounded-full bg-app-surface-mid/40 p-2 ${toneClasses.icon}`}>
                <AlertTriangle className="w-5 h-5" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <Dialog.Title className="font-display text-lg font-semibold text-app-text">
                  {pending?.title ?? ""}
                </Dialog.Title>
                {pending?.description && (
                  <Dialog.Description className="text-sm text-app-secondary mt-1.5 whitespace-pre-wrap">
                    {pending.description}
                  </Dialog.Description>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                {pending?.cancelLabel ?? "Cancelar"}
              </Button>
              <Button variant={toneClasses.button} onClick={() => handleClose(true)} autoFocus>
                {pending?.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  )
}
