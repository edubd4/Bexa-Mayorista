"use client"

import { useMemo, useState } from "react"
import { Check, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Producto = { id: string; id_publico: string; nombre: string; marca: string | null }

type Props = {
  productos: Producto[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function ProductosMultiSelect({ productos, selectedIds, onChange }: Props) {
  const [q, setQ] = useState("")

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return productos
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(needle) ||
        p.id_publico.toLowerCase().includes(needle) ||
        (p.marca?.toLowerCase().includes(needle) ?? false),
    )
  }, [productos, q])

  const selectedList = useMemo(
    () => productos.filter((p) => selectedIds.includes(p.id)),
    [productos, selectedIds],
  )

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    )
  }

  return (
    <div className="space-y-3">
      {/* Chips seleccionados */}
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedList.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-md bg-app-accent/10 text-app-accent text-xs border border-app-accent/30"
            >
              {p.nombre}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="rounded-sm p-0.5 hover:bg-app-accent/20"
                aria-label={`Quitar ${p.nombre}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
        <input
          type="search"
          placeholder="Buscar producto por nombre, marca o ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-md bg-app-input border border-app-line text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/50"
        />
      </div>

      {/* Lista scrolleable */}
      <div className="max-h-64 overflow-y-auto rounded-md border border-app-line-soft divide-y divide-app-line-soft">
        {filtrados.length === 0 ? (
          <p className="text-xs text-app-muted px-3 py-3">Sin productos.</p>
        ) : (
          filtrados.map((p) => {
            const selected = selectedIds.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-app-surface-mid transition-colors",
                  selected && "bg-app-accent/5",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center",
                    selected ? "bg-app-accent border-app-accent" : "border-app-line",
                  )}
                >
                  {selected && <Check className="w-3 h-3 text-app-bg" />}
                </span>
                <span className="font-mono text-[10.5px] text-app-accent w-16">{p.id_publico}</span>
                <span className="flex-1">{p.nombre}</span>
                {p.marca && (
                  <span className="text-xs text-app-muted">{p.marca}</span>
                )}
              </button>
            )
          })
        )}
      </div>
      <p className="text-xs text-app-muted">
        {selectedIds.length} producto{selectedIds.length === 1 ? "" : "s"} seleccionado
        {selectedIds.length === 1 ? "" : "s"}.
      </p>
    </div>
  )
}
