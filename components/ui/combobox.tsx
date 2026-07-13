"use client"

import * as React from "react"
import { Plus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// ============================================================================
// ComboBox — input con autocompletado desde opciones existentes + crear nueva.
//
// Uso típico: categorías de repuestos, ubicaciones en depósito — datos que
// nacieron como texto libre y quedan sucios por typos. El ComboBox invita a
// reutilizar los valores existentes; solo se crea uno nuevo si es intencional.
//
// Comportamiento:
// - Al escribir: filtra las opciones que coinciden (case-insensitive).
// - Si el texto matchea una opción → se puede seleccionar.
// - Si no matchea y allowCreate=true → aparece "Crear \"...\"".
// - Al perder foco: si el texto trimmed no coincide con ninguna opción y
//   allowCreate, lo aplica como nuevo valor. Si está vacío, limpia el value.
// ============================================================================

type ComboBoxProps = {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  options: string[]
  placeholder?: string
  allowCreate?: boolean
  emptyMessage?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

export function ComboBox({
  id,
  value,
  onChange,
  options,
  placeholder,
  allowCreate = true,
  emptyMessage = "Sin opciones cargadas todavía",
  required,
  disabled,
  className,
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState<string>(value ?? "")

  // Sync input cuando value externo cambia (ej: reset del form)
  React.useEffect(() => {
    setInput(value ?? "")
  }, [value])

  const inputTrimmed = input.trim()
  const inputLower = inputTrimmed.toLowerCase()

  // Filtramos las opciones. Si no hay input, mostramos todas.
  const filtered = React.useMemo(() => {
    if (inputTrimmed === "") return options
    return options.filter((o) => o.toLowerCase().includes(inputLower))
  }, [options, inputTrimmed, inputLower])

  const exactMatch = React.useMemo(
    () => options.find((o) => o.toLowerCase() === inputLower),
    [options, inputLower],
  )

  const showCreate = allowCreate && inputTrimmed !== "" && !exactMatch

  function select(v: string) {
    setInput(v)
    onChange(v)
    setOpen(false)
  }

  function handleBlur() {
    // Timeout para permitir el click en las opciones (mouseDown ya lo previene,
    // pero como red de seguridad).
    setTimeout(() => {
      setOpen(false)
      if (inputTrimmed === "") {
        onChange(null)
      } else if (exactMatch) {
        onChange(exactMatch)
      } else if (allowCreate) {
        onChange(inputTrimmed)
      } else {
        // Revert al último valor válido
        setInput(value ?? "")
      }
    }, 120)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false)
      e.currentTarget.blur()
    } else if (e.key === "Enter" && open) {
      e.preventDefault()
      if (filtered.length === 1) {
        select(filtered[0])
      } else if (showCreate) {
        select(inputTrimmed)
      }
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        className="pr-9"
      />
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted transition-transform",
          open && "rotate-180",
        )}
        aria-hidden
      />

      {open && !disabled && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-app-line bg-app-card shadow-lg max-h-60 overflow-auto"
          // onMouseDown preventDefault evita que blur del input dispare antes del click.
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 && !showCreate && (
            <p className="px-3 py-2 text-xs text-app-muted">{emptyMessage}</p>
          )}

          {filtered.length > 0 && (
            <ul>
              {filtered.map((o) => (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => select(o)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm text-app-text hover:bg-app-surface-mid",
                      value === o && "bg-app-accent/10 text-app-accent",
                    )}
                  >
                    {o}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showCreate && (
            <button
              type="button"
              onClick={() => select(inputTrimmed)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm text-app-accent hover:bg-app-accent/10 border-t border-app-line-soft flex items-center gap-2",
                filtered.length === 0 && "border-t-0",
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              Crear <span className="font-semibold">&ldquo;{inputTrimmed}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
