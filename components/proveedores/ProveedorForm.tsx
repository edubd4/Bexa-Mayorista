"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { createProveedor, updateProveedor } from "@/app/(dashboard)/proveedores/actions"
import { DOMINIO } from "@/lib/dominio"
import type { ProveedorInput } from "@/lib/validators/proveedor"

type Props = {
  mode: "create" | "edit"
  proveedorId?: string
  initial?: Partial<ProveedorInput>
}

const DEFAULTS: ProveedorInput = {
  nombre: "",
  cuit: undefined,
  contacto_nombre: undefined,
  telefono: undefined,
  whatsapp: undefined,
  email: undefined,
  direccion: undefined,
  ciudad: undefined,
  provincia: undefined,
  condiciones_pago: undefined,
  notas: undefined,
}

export function ProveedorForm({ mode, proveedorId, initial }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState<ProveedorInput>({ ...DEFAULTS, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof ProveedorInput>(key: K, value: ProveedorInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Preview de confirmación en el alta (pedido del cliente): repasar los
    // datos cargados antes de crear. En edición no molesta — ya hay detalle.
    if (mode === "create") {
      const resumen = [
        ["Nombre", form.nombre],
        ["CUIT", form.cuit],
        ["Contacto", form.contacto_nombre],
        ["Teléfono", form.telefono],
        ["WhatsApp", form.whatsapp],
        ["Email", form.email],
        ["Ciudad", [form.ciudad, form.provincia].filter(Boolean).join(", ")],
        ["Cond. de pago", form.condiciones_pago],
      ]
        .filter(([, v]) => v && String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")

      const ok = await confirm({
        title: "¿Crear este proveedor?",
        description: resumen || "Solo se cargó el nombre.",
        confirmLabel: "Crear proveedor",
      })
      if (!ok) return
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProveedor(form)
          : await updateProveedor(proveedorId!, form)

      // create hace redirect en el server (no vuelve). update retorna { ok }:
      if (result && !result.ok) {
        setError(result.error)
        return
      }
      if (mode === "edit") {
        toast.success("Cambios guardados")
        router.refresh()
      }
    })
  }

  const cancelHref =
    mode === "create" ? DOMINIO.proveedores.ruta : `${DOMINIO.proveedores.ruta}/${proveedorId}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Datos generales</h2>
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-[0.12em]">
            Obligatorio: nombre
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nombre">Nombre o razón social *</Label>
            <Input
              id="nombre"
              required
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder="Nombre comercial o legal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cuit">CUIT</Label>
            <Input
              id="cuit"
              value={form.cuit ?? ""}
              onChange={(e) => update("cuit", e.target.value)}
              placeholder="30-XXXXXXXX-X"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="condiciones_pago">Condiciones de pago</Label>
            <Input
              id="condiciones_pago"
              value={form.condiciones_pago ?? ""}
              onChange={(e) => update("condiciones_pago", e.target.value)}
              placeholder="30 días · Contado · 50/50…"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">Contacto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="contacto_nombre">Persona de contacto</Label>
            <Input
              id="contacto_nombre"
              value={form.contacto_nombre ?? ""}
              onChange={(e) => update("contacto_nombre", e.target.value)}
              placeholder="A quién le pedimos / pagamos"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={form.telefono ?? ""}
              onChange={(e) => update("telefono", e.target.value)}
              placeholder="Ej. 351 555-1234"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              value={form.whatsapp ?? ""}
              onChange={(e) => update("whatsapp", e.target.value)}
              placeholder="Puede ser el mismo teléfono"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="proveedor@dominio.com"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">Ubicación</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              value={form.direccion ?? ""}
              onChange={(e) => update("direccion", e.target.value)}
              placeholder="Calle y número"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ciudad">Ciudad</Label>
            <Input
              id="ciudad"
              value={form.ciudad ?? ""}
              onChange={(e) => update("ciudad", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provincia">Provincia</Label>
            <Input
              id="provincia"
              value={form.provincia ?? ""}
              onChange={(e) => update("provincia", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea
          id="notas"
          rows={4}
          value={form.notas ?? ""}
          onChange={(e) => update("notas", e.target.value)}
          placeholder="Cualquier observación útil sobre el proveedor."
        />
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={cancelHref}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending
            ? mode === "create" ? "Creando…" : "Guardando…"
            : mode === "create" ? "Crear proveedor" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
