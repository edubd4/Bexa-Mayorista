"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

type SearchInputProps = {
  basePath: string
  placeholder?: string
  paramName?: string
  className?: string
}

// Debounce 300ms, sincroniza con ?q= en la URL sin recargar.
// Reutilizable para lista de clientes, servicios, repuestos, ordenes, etc.
export function SearchInput({
  basePath,
  placeholder = "Buscar…",
  paramName = "q",
  className,
}: SearchInputProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get(paramName) ?? "")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = params.get(paramName) ?? ""
      if (value === current) return
      const sp = new URLSearchParams(params.toString())
      if (value) sp.set(paramName, value)
      else sp.delete(paramName)
      const qs = sp.toString()
      startTransition(() => {
        router.replace(qs ? `${basePath}?${qs}` : basePath)
      })
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-10 rounded-md border border-app-line bg-app-input pl-9 pr-9 py-2 text-sm text-app-text shadow-sm transition-colors",
          "placeholder:text-app-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:border-app-accent/40"
        )}
      />
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-app-muted">
          …
        </span>
      )}
    </div>
  )
}
