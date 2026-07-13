"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, XCircle, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// Toast — sistema custom con React Context + Portal.
// Sin dependencias externas.
//
// Uso:
//   const toast = useToast()
//   toast.success("Cliente creado")
//   toast.error("No se pudo guardar")
//   toast.info("El presupuesto vence en 3 días")
// ============================================================================

type ToastKind = "success" | "error" | "info"

type ToastItem = {
  id: string
  kind: ToastKind
  message: string
}

type ToastContextValue = {
  show: (message: string, kind?: ToastKind, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    // Fallback silencioso a console para que un componente que use useToast()
    // fuera de un provider no rompa el árbol.
    return {
      show: (m) => console.log("[toast]", m),
      success: (m) => console.log("[toast.success]", m),
      error: (m) => console.error("[toast.error]", m),
      info: (m) => console.info("[toast.info]", m),
    }
  }
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = React.useCallback(
    (message: string, kind: ToastKind = "info", duration = 4000) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev, { id, kind, message }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
    },
    [dismiss],
  )

  const value = React.useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m: string, d?: number) => show(m, "success", d ?? 4000),
      // errores duran más: el user puede necesitar leerlo con calma
      error: (m: string, d?: number) => show(m, "error", d ?? 6000),
      info: (m: string, d?: number) => show(m, "info", d ?? 4000),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="true"
            className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm pointer-events-none"
          >
            {toasts.map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: () => void
}) {
  const config = {
    success: { icon: CheckCircle2, cls: "border-app-green/40 bg-app-green/10 text-app-green" },
    error:   { icon: XCircle,      cls: "border-app-red/40   bg-app-red/10   text-app-red" },
    info:    { icon: Info,         cls: "border-app-accent/40  bg-app-accent/10  text-app-accent" },
  }[toast.kind]
  const Icon = config.icon

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-lg border bg-app-card shadow-lg px-4 py-3 flex items-start gap-3",
        "animate-in slide-in-from-right-2 fade-in duration-200",
        config.cls,
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
      <p className="flex-1 text-sm text-app-text leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="text-app-muted hover:text-app-text transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
