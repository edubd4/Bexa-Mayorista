"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { updateConfiguracion } from "@/app/(dashboard)/configuracion/actions"
import { CONFIG_FIELDS } from "@/lib/validators/configuracion"

type Props = {
  values: Record<string, string>
}

export function ConfiguracionForm({ values }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Record<string, string>>(values)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setOk(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(false)
    startTransition(async () => {
      const result = await updateConfiguracion(form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOk(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {CONFIG_FIELDS.map((f, i) => (
          <section
            key={f.clave}
            className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3"
          >
            {/* Título de sección cuando arranca un grupo nuevo (ej. ARCA) */}
            {f.grupo && f.grupo !== CONFIG_FIELDS[i - 1]?.grupo && (
              <h2 className="font-display text-xl font-semibold text-app-accent -mb-1">
                {f.grupo}
              </h2>
            )}
            <div>
              <Label htmlFor={f.clave} className="text-app-text font-display text-base">
                {f.label}
              </Label>
              <p className="text-[12px] text-app-muted mt-1">{f.descripcion}</p>
            </div>

            {f.tipo === "moneda" ? (
              <Select
                id={f.clave}
                value={form[f.clave] ?? "ARS"}
                onChange={(e) => update(f.clave, e.target.value)}
              >
                <option value="ARS">ARS · Peso argentino</option>
                <option value="USD">USD · Dólar</option>
              </Select>
            ) : (
              <Input
                id={f.clave}
                type={f.tipo === "number" ? "number" : "text"}
                inputMode={f.tipo === "number" ? "numeric" : undefined}
                min={f.tipo === "number" ? 0 : undefined}
                value={form[f.clave] ?? ""}
                onChange={(e) => update(f.clave, e.target.value)}
                placeholder={f.placeholder}
              />
            )}

            <p className="font-mono text-[10px] text-app-muted uppercase tracking-widest">
              clave: {f.clave}
            </p>
          </section>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-app-green/40 bg-app-green/10 px-4 py-3 text-sm text-app-green">
          Configuración guardada.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
