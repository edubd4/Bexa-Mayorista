"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// ============================================================================
// NumberInput — input numérico con formato es-AR (separador de miles + decimal).
//
// Comportamiento:
// - Sin foco: muestra el valor formateado ("1.234.567" o "1.234.567,89").
// - Con foco: muestra el valor sin separadores para editar sin fricción.
// - onChange devuelve el número parseado, o null si el input está vacío.
// - Placeholder por defecto "0" (o el que se le pase).
//
// Props clave:
// - decimals: 0 (default, enteros) | 2 (plata con centavos)
// - prefix: "$" para plata, "%" no funciona como prefix pero como suffix (TBD).
// - min/max/required/disabled: se pasan al input nativo.
// ============================================================================

type NumberInputProps = {
  id?: string
  name?: string
  value: number | null
  onChange: (value: number | null) => void
  decimals?: number
  min?: number
  max?: number
  required?: boolean
  disabled?: boolean
  placeholder?: string
  prefix?: string
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
  "aria-label"?: string
}

function formatWithSeparators(n: number, decimals: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function toRawString(n: number, decimals: number): string {
  if (decimals === 0) return String(Math.trunc(n))
  return n.toFixed(decimals).replace(".", ",")
}

// Parsea input del usuario: permite dígitos, punto (miles) y coma (decimal).
// Coma es prioridad como separador decimal (patrón es-AR). Devuelve null si vacío.
function parseInput(s: string, decimals: number): number | null {
  const trimmed = s.trim()
  if (trimmed === "" || trimmed === "-") return null

  // Detectamos signo negativo al inicio (para AJUSTES eventualmente)
  const isNegative = trimmed.startsWith("-")
  const withoutSign = isNegative ? trimmed.substring(1) : trimmed

  // Removemos separadores de miles (puntos que NO son el último separador antes de decimales)
  // Estrategia simple: si hay una coma, todo lo antes de la última coma es entero (con puntos que ignoramos),
  //                    y lo después es decimal. Si no hay coma, todos los puntos son miles.
  let integerPart: string
  let decimalPart = ""
  const lastComma = withoutSign.lastIndexOf(",")
  if (lastComma >= 0) {
    integerPart = withoutSign.substring(0, lastComma).replace(/\./g, "")
    decimalPart = withoutSign.substring(lastComma + 1)
  } else {
    integerPart = withoutSign.replace(/\./g, "")
  }

  // Validación: solo dígitos ahora
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(decimalPart)) return null
  if (integerPart === "" && decimalPart === "") return null

  const combined = (integerPart || "0") + (decimalPart ? "." + decimalPart : "")
  const parsed = Number(combined)
  if (!Number.isFinite(parsed)) return null

  const truncated = decimals === 0
    ? Math.trunc(parsed)
    : Math.round(parsed * Math.pow(10, decimals)) / Math.pow(10, decimals)

  return isNegative ? -truncated : truncated
}

export function NumberInput({
  value,
  onChange,
  decimals = 0,
  prefix,
  placeholder,
  className,
  onBlur: externalOnBlur,
  ...rest
}: NumberInputProps) {
  const [display, setDisplay] = React.useState<string>(() =>
    value !== null && value !== undefined ? formatWithSeparators(value, decimals) : "",
  )
  const [focused, setFocused] = React.useState(false)

  // Sync display con value externo cuando NO estamos escribiendo.
  React.useEffect(() => {
    if (!focused) {
      setDisplay(
        value !== null && value !== undefined ? formatWithSeparators(value, decimals) : "",
      )
    }
  }, [value, decimals, focused])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDisplay(raw)
    const parsed = parseInput(raw, decimals)
    onChange(parsed)
  }

  function handleFocus() {
    setFocused(true)
    // Mostramos el valor "crudo" (sin separadores de miles) para editar sin drama.
    if (value !== null && value !== undefined) {
      setDisplay(toRawString(value, decimals))
    }
  }

  function handleBlur() {
    setFocused(false)
    // Reformateamos con separadores al perder foco.
    if (value !== null && value !== undefined) {
      setDisplay(formatWithSeparators(value, decimals))
    } else {
      setDisplay("")
    }
    externalOnBlur?.()
  }

  return (
    <div className="relative">
      {prefix && (
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted text-sm font-mono"
          aria-hidden
        >
          {prefix}
        </span>
      )}
      <Input
        {...rest}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder ?? "0"}
        className={cn(prefix && "pl-7", className)}
        autoComplete="off"
      />
    </div>
  )
}

// Wrapper para inputs de plata: prefix "$" y default decimals=0
// (Guillo trabaja en pesos enteros; si mañana quiere centavos, pasar decimals={2}).
export function MoneyInput(props: Omit<NumberInputProps, "prefix">) {
  return <NumberInput prefix="$" {...props} />
}
