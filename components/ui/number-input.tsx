"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// ============================================================================
// NumberInput — input numérico con formato es-AR EN VIVO.
//
// Comportamiento (pedido del cliente, smoke 2026-07-15):
// - Los separadores de miles aparecen MIENTRAS se tipea: "1000000" → "1.000.000".
//   Nada de esperar al blur para saber cuántos ceros pusiste.
// - Los ceros iniciales se eliminan solos ("0100" → "100") — no hay que borrarlos.
// - Coma = separador decimal (es-AR), habilitada solo si decimals > 0.
// - El cursor se mantiene en su lugar lógico aunque se inserten puntos.
// - onChange devuelve el número parseado, o null si el input está vacío.
//
// Props clave:
// - decimals: 0 (default, enteros) | 2 (plata con centavos)
// - prefix: "$" para plata.
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

// Agrupa la parte entera con puntos de miles: "1234567" → "1.234.567"
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

// Normaliza lo que el usuario tipeó y lo devuelve formateado en vivo.
// Acepta dígitos, una coma decimal (si decimals > 0) y signo negativo inicial.
function formatLive(raw: string, decimals: number): string {
  const isNegative = raw.trimStart().startsWith("-")
  // Nos quedamos solo con dígitos y comas
  let cleaned = raw.replace(/[^\d,]/g, "")

  let integerPart = cleaned
  let decimalPart: string | null = null
  if (decimals > 0) {
    const firstComma = cleaned.indexOf(",")
    if (firstComma >= 0) {
      integerPart = cleaned.slice(0, firstComma)
      // Solo la primera coma cuenta; las demás se descartan
      decimalPart = cleaned.slice(firstComma + 1).replace(/,/g, "").slice(0, decimals)
    }
  } else {
    integerPart = cleaned.replace(/,/g, "")
  }

  // Matar ceros iniciales ("0100" → "100"), pero conservar un "0" solo
  integerPart = integerPart.replace(/^0+(?=\d)/, "")

  if (integerPart === "" && decimalPart === null) return isNegative ? "-" : ""

  const grouped = groupThousands(integerPart || "0")
  const sign = isNegative ? "-" : ""
  return decimalPart !== null ? `${sign}${grouped},${decimalPart}` : `${sign}${grouped}`
}

// Parsea el display formateado a número. Devuelve null si vacío.
function parseDisplay(s: string): number | null {
  const trimmed = s.trim()
  if (trimmed === "" || trimmed === "-") return null
  const isNegative = trimmed.startsWith("-")
  const cleaned = (isNegative ? trimmed.slice(1) : trimmed).replace(/\./g, "").replace(",", ".")
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return isNegative ? -parsed : parsed
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
  const inputRef = React.useRef<HTMLInputElement>(null)
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
    const el = e.target
    const raw = el.value
    const caret = el.selectionStart ?? raw.length
    // Cuántos caracteres "significativos" (dígitos/coma) hay antes del cursor —
    // los puntos de miles se regeneran, así que no cuentan.
    const significantBefore = raw.slice(0, caret).replace(/[^\d,]/g, "").length

    const formatted = formatLive(raw, decimals)
    setDisplay(formatted)
    onChange(parseDisplay(formatted))

    // Restaurar el cursor después del re-render: avanzamos hasta cubrir la misma
    // cantidad de caracteres significativos.
    requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      let count = 0
      let pos = 0
      while (pos < formatted.length && count < significantBefore) {
        if (/[\d,]/.test(formatted[pos]!)) count++
        pos++
      }
      node.setSelectionRange(pos, pos)
    })
  }

  function handleFocus() {
    setFocused(true)
  }

  function handleBlur() {
    setFocused(false)
    // Al salir, formato completo (agrega decimales faltantes: "1.000" → "1.000,00")
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
        ref={inputRef}
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
// (se trabaja en pesos enteros; si mañana quieren centavos, pasar decimals={2}).
export function MoneyInput(props: Omit<NumberInputProps, "prefix">) {
  return <NumberInput prefix="$" {...props} />
}
