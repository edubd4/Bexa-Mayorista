"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

type Props = {
  template: string
  vars: Record<string, string | number>
}

function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null ? `{${key}}` : String(v)
  })
}

export function CopiarMensajeBtn({ template, vars }: Props) {
  const toast = useToast()
  const [copiado, setCopiado] = useState(false)

  async function handleClick() {
    const texto = render(template, vars)
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success("Mensaje copiado")
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      toast.error("No se pudo copiar. Copialo manualmente.")
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copiado ? "Copiado" : "Copiar mensaje"}
    </Button>
  )
}
