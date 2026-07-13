"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { createLista, updateLista } from "@/app/(dashboard)/listas-precios/actions"
import type { ListaPrecioInput } from "@/lib/validators/lista-precio"

type Props = {
  mode: "create" | "edit"
  listaId?: string
  initial?: Partial<ListaPrecioInput>
  proveedores: { id: string; id_publico: string; nombre: string }[]
}

const DEFAULTS: ListaPrecioInput = {
  nombre: "",
  proveedor_id: undefined,
  notas: undefined,
}

export function ListaHeaderForm({ mode, listaId, initial, proveedores }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<ListaPrecioInput>({ ...DEFAULTS, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof ListaPrecioInput>(key: K, value: ListaPrecioInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = mode === "create" ? await createLista(form) : await updateLista(listaId!, form)
      if (res && !res.ok) {
        setError(res.error)
        return
      }
      if (mode === "edit") {
        toast.success("Cambios guardados")
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
      <h2 className="font-display text-lg font-semibold">Datos de la lista</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input
            id="nombre"
            required
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            placeholder='Ej: "Lista mayorista general" o "Precios ProveedorX 2026"'
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="proveedor_id">Proveedor asociado</Label>
          <Select
            id="proveedor_id"
            value={form.proveedor_id ?? ""}
            onChange={(e) => update("proveedor_id", e.target.value || undefined)}
          >
            <option value="">— Sin proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.id_publico} · {p.nombre}</option>
            ))}
          </Select>
          <p className="text-[11px] text-app-muted font-mono">
            Opcional. Sirve para reconocer de dónde vienen los precios.
          </p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            rows={3}
            value={form.notas ?? ""}
            onChange={(e) => update("notas", e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={mode === "create" ? "/listas-precios" : `/listas-precios/${listaId}`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "create" ? "Creando…" : "Guardando…"
            : mode === "create" ? "Crear lista" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
