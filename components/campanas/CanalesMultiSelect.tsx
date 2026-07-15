"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Canal = { id: number; nombre: string }

type Props = {
  canales: Canal[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export function CanalesMultiSelect({ canales, selectedIds, onChange }: Props) {
  function toggle(id: number) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canales.map((c) => {
        const selected = selectedIds.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm transition-colors",
              selected
                ? "border-app-accent bg-app-accent/10 text-app-accent"
                : "border-app-line bg-app-input text-app-secondary hover:border-app-accent/40",
            )}
          >
            {selected && <Check className="w-3.5 h-3.5" />}
            {c.nombre}
          </button>
        )
      })}
      {canales.length === 0 && (
        <p className="text-xs text-app-muted">No hay canales cargados.</p>
      )}
    </div>
  )
}
