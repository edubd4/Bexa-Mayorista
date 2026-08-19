"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// SearchSelect — select con búsqueda por tipeo para listas largas de entidades
// (productos, clientes): opciones {value, label} donde value es un id.
//
// No confundir con ComboBox (combobox.tsx): aquel es autocompletado de STRINGS
// con "crear nuevo" (categorías, ubicaciones). Este elige una entidad existente
// por id — nunca crea. El Select nativo no deja escribir para filtrar: con
// 300+ productos es inusable en el mostrador.
//
// Filtra en el cliente sobre las opciones ya cargadas — no pega al server.
//
// El panel se renderiza en un PORTAL con posición fija (gotcha pagado
// 2026-08-19): adentro de una tabla con overflow, un dropdown absolute queda
// RECORTADO por el contenedor — en /ventas/nueva se veía una franja de dos
// opciones. El portal lo saca de la jerarquía y lo posiciona sobre el
// viewport; se reposiciona en scroll/resize y abre hacia arriba si no hay
// lugar abajo.
// ============================================================================

export type SearchSelectOption = {
  value: string
  label: string
  /** Texto secundario a la derecha (ej. "stock 12"). */
  hint?: string
  /** Texto extra para matchear que no se muestra (ej. SKU, marca). */
  keywords?: string
}

// Sin acentos y en minúsculas: "cafe" encuentra "Café".
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

const MAX_VISIBLES = 50

type Props = {
  id?: string
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
}

export function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "— Elegí una opción —",
  searchPlaceholder = "Escribí para buscar…",
  emptyText = "Sin resultados",
  disabled = false,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activo, setActivo] = React.useState(0)
  // Posición del panel sobre el viewport (portal): abajo del trigger, o
  // arriba si no entra. null = todavía no medimos (no renderizar el panel).
  const [pos, setPos] = React.useState<
    { left: number; width: number; top?: number; bottom?: number } | null
  >(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  const seleccionada = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  )

  const filtradas = React.useMemo(() => {
    const q = normalizar(query.trim())
    if (!q) return options
    return options.filter((o) =>
      normalizar(`${o.label} ${o.keywords ?? ""}`).includes(q),
    )
  }, [options, query])
  const visibles = filtradas.slice(0, MAX_VISIBLES)
  const ocultas = filtradas.length - visibles.length

  // Cerrar al clickear afuera — afuera del trigger Y del panel (el panel vive
  // en un portal, no es descendiente de rootRef).
  React.useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  // Medir y posicionar el panel; re-medir en scroll (capture: agarra el scroll
  // de CUALQUIER contenedor, no solo window) y resize.
  const medir = React.useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Alto máximo estimado del panel: búsqueda (~48) + lista (max-h-64 = 256).
    const ALTO_PANEL = 312
    const abreArriba = r.bottom + ALTO_PANEL > window.innerHeight && r.top > ALTO_PANEL
    setPos(
      abreArriba
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
        : { left: r.left, width: r.width, top: r.bottom + 4 },
    )
  }, [])

  React.useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    medir()
    window.addEventListener("scroll", medir, true)
    window.addEventListener("resize", medir)
    return () => {
      window.removeEventListener("scroll", medir, true)
      window.removeEventListener("resize", medir)
    }
  }, [open, medir])

  // Al abrir: foco en la búsqueda, reset de estado.
  React.useEffect(() => {
    if (open) {
      setQuery("")
      setActivo(0)
      // El input se monta con el panel — foco en el próximo frame.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Mantener la opción activa a la vista al navegar con flechas.
  React.useEffect(() => {
    const el = listRef.current?.children[activo] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [activo])

  function elegir(v: string) {
    onChange(v)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActivo((a) => Math.min(a + 1, visibles.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActivo((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const opt = visibles[activo]
      if (opt) elegir(opt.value)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-app-line bg-app-input px-3 py-2 text-sm shadow-sm transition-colors text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:border-app-accent/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          seleccionada ? "text-app-text" : "text-app-muted",
        )}
      >
        <span className="truncate">{seleccionada ? seleccionada.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-app-muted shrink-0" />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
          }}
          className="z-[95] rounded-lg border border-app-line bg-app-card shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-app-line-soft">
            <Search className="w-4 h-4 text-app-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActivo(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              className="flex-1 bg-transparent text-sm text-app-text placeholder:text-app-muted focus:outline-none"
            />
          </div>

          {visibles.length === 0 ? (
            <p className="px-3 py-4 text-xs text-app-muted text-center font-mono">
              {emptyText}
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {visibles.map((o, idx) => (
                <li key={o.value} role="option" aria-selected={o.value === value}>
                  <button
                    type="button"
                    onClick={() => elegir(o.value)}
                    onMouseEnter={() => setActivo(idx)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors",
                      idx === activo ? "bg-app-accent/10" : "hover:bg-app-surface-mid",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {o.value === value ? (
                        <Check className="w-3.5 h-3.5 text-app-accent shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate text-app-text">{o.label}</span>
                    </span>
                    {o.hint && (
                      <span className="shrink-0 font-mono text-[11px] text-app-muted">{o.hint}</span>
                    )}
                  </button>
                </li>
              ))}
              {ocultas > 0 && (
                <li className="px-3 py-2 text-[11px] font-mono text-app-muted text-center">
                  …y {ocultas} más — seguí escribiendo para afinar
                </li>
              )}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
