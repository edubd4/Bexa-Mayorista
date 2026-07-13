"use client"

import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ICONS } from "@/components/nav/icons"
import type { SearchResult } from "@/lib/search-sources"

// ============================================================================
// CommandPalette — buscador global. Cmd+K / Ctrl+K abre.
// Renderiza resultados genéricos de /api/search (lib/search-sources.ts).
// Cosechar un módulo = registrar su fuente allá; este componente NO se toca.
// RLS filtra: cada rol ve solo lo suyo.
// ============================================================================

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<SearchResult[]>([])
  const [cargando, setCargando] = React.useState(false)
  const [seleccionado, setSeleccionado] = React.useState(0)

  // Hotkey global Cmd+K / Ctrl+K
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Búsqueda debounced
  React.useEffect(() => {
    const q = query.trim()
    if (!open) return
    if (q.length < 2) {
      setItems([])
      return
    }
    setCargando(true)
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const body = await res.json()
        if (body.ok) {
          setItems((body.data?.resultados ?? []) as SearchResult[])
          setSeleccionado(0)
        }
      } catch (err) {
        console.error("[CommandPalette] error:", err)
      } finally {
        setCargando(false)
      }
    }, 200)
    return () => clearTimeout(timeoutId)
  }, [query, open])

  // Reset al cerrar
  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setItems([])
      setSeleccionado(0)
    }
  }, [open])

  function irA(href: string) {
    setOpen(false)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSeleccionado((s) => Math.min(s + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSeleccionado((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter" && items[seleccionado]) {
      e.preventDefault()
      irA(items[seleccionado].href)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-100" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="fixed z-[91] left-1/2 top-[15%] -translate-x-1/2 w-[calc(100vw-2rem)] sm:max-w-lg rounded-xl border border-app-line-soft bg-app-card shadow-2xl overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150"
        >
          <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>
          <Dialog.Description className="sr-only">
            Buscá por ID, nombre o teléfono en todos los módulos.
          </Dialog.Description>

          <div className="flex items-center gap-3 px-4 py-3 border-b border-app-line-soft">
            <Search className="w-4 h-4 text-app-muted shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ID, nombre o teléfono…"
              className="flex-1 bg-transparent text-sm text-app-text placeholder:text-app-muted focus:outline-none"
            />
            {cargando && <Loader2 className="w-4 h-4 text-app-accent animate-spin shrink-0" />}
            <span className="text-[10px] font-mono text-app-muted shrink-0 hidden sm:inline">Esc</span>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {query.trim().length < 2 ? (
              <p className="px-4 py-8 text-xs text-app-muted text-center font-mono">
                Escribí al menos 2 caracteres para buscar.
              </p>
            ) : items.length === 0 && !cargando ? (
              <p className="px-4 py-8 text-xs text-app-muted text-center font-mono">
                Sin resultados para &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul className="py-1">
                {items.map((item, idx) => {
                  const Icon = ICONS[item.iconKey] ?? Search
                  return (
                    <li key={`${item.href}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => irA(item.href)}
                        onMouseEnter={() => setSeleccionado(idx)}
                        className={cn(
                          "w-full text-left px-4 py-2 flex items-center gap-3 transition-colors",
                          seleccionado === idx
                            ? "bg-app-accent/10"
                            : "hover:bg-app-surface-mid",
                        )}
                      >
                        <span className="shrink-0 text-app-accent">
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-app-text truncate">{item.label}</p>
                          <p className="text-[11px] text-app-muted truncate">{item.sub}</p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-app-line-soft px-4 py-2 flex items-center justify-between text-[10px] font-mono text-app-muted">
            <span>↑↓ para navegar · Enter para abrir</span>
            <span className="hidden sm:inline">Ctrl+K para abrir</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
