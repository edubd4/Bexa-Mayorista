"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { updateMetricasManuales } from "@/app/(dashboard)/campanas/actions"
import type { MetricasManuales } from "@/lib/validators/campana"

type CampoKey = "impresiones" | "alcance" | "clicks" | "engagement"
const CAMPOS: Array<{ key: CampoKey; label: string }> = [
  { key: "impresiones", label: "Impresiones" },
  { key: "alcance",     label: "Alcance" },
  { key: "clicks",      label: "Clicks" },
  { key: "engagement",  label: "Engagement" },
]

type Props = {
  campanaId: string
  initial: MetricasManuales
}

export function MetricasManualesForm({ campanaId, initial }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<MetricasManuales>(initial ?? {})
  const [isPending, startTransition] = useTransition()

  function update(key: CampoKey, value: string) {
    const parsed = value === "" ? undefined : Number(value)
    setForm((prev) => {
      const next: MetricasManuales = { ...prev }
      if (parsed === undefined || Number.isNaN(parsed)) {
        delete next[key]
      } else {
        next[key] = parsed
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await updateMetricasManuales(campanaId, form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Métricas guardadas")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CAMPOS.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type="number"
              min={0}
              step={1}
              value={form[key] === undefined ? "" : String(form[key])}
              onChange={(e) => update(key, e.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          <Save className="w-3.5 h-3.5" />
          {isPending ? "Guardando…" : "Guardar métricas"}
        </Button>
      </div>
      <p className="text-xs text-app-muted">
        Cargá los números que reporten las redes / plataformas. Ventas, monto y ROI se calculan
        automáticamente desde el sistema.
      </p>
    </form>
  )
}
