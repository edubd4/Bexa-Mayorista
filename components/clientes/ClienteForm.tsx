"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { createCliente, updateCliente } from "@/app/(dashboard)/clientes/actions"
import { DOMINIO } from "@/lib/dominio"
import { TIPO_CLIENTE, type ClienteInput } from "@/lib/validators/cliente"

type ListaPrecio = { id: string; id_publico: string; nombre: string }

type Props = {
  mode: "create" | "edit"
  clienteId?: string
  initial?: Partial<ClienteInput>
  listasPrecios?: ListaPrecio[]
}

const DEFAULTS: ClienteInput = {
  tipo: TIPO_CLIENTE.MINORISTA,
  nombre: "",
  apellido: undefined,
  razon_social: undefined,
  documento: undefined,
  telefono: undefined,
  whatsapp: undefined,
  instagram: undefined,
  email: undefined,
  direccion: undefined,
  ciudad: undefined,
  provincia: undefined,
  lista_precio_id: undefined,
  notas: undefined,
}

export function ClienteForm({ mode, clienteId, initial, listasPrecios = [] }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState<ClienteInput>({ ...DEFAULTS, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof ClienteInput>(key: K, value: ClienteInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const esMayorista = form.tipo === TIPO_CLIENTE.MAYORISTA

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Preview de confirmación en el alta (pedido del cliente): repasar los
    // datos antes de crear. En edición no aplica.
    if (mode === "create") {
      const lista = listasPrecios.find((l) => l.id === form.lista_precio_id)
      const resumen = [
        ["Tipo", esMayorista ? "Mayorista" : "Minorista"],
        ["Nombre", esMayorista ? form.razon_social : [form.nombre, form.apellido].filter(Boolean).join(" ")],
        ["Documento", form.documento],
        ["Teléfono", form.telefono],
        ["WhatsApp", form.whatsapp],
        ["Instagram", form.instagram],
        ["Email", form.email],
        ["Ciudad", [form.ciudad, form.provincia].filter(Boolean).join(", ")],
        ["Lista de precios", lista ? lista.nombre : undefined],
      ]
        .filter(([, v]) => v && String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")

      const ok = await confirm({
        title: "¿Crear este cliente?",
        description: resumen || "Solo se cargó el nombre.",
        confirmLabel: "Crear cliente",
      })
      if (!ok) return
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCliente(form)
          : await updateCliente(clienteId!, form)
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
    mode === "create" ? DOMINIO.clientes.ruta : `${DOMINIO.clientes.ruta}/${clienteId}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Datos generales</h2>
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-[0.12em]">
            Obligatorio: nombre {esMayorista && "· razón social recomendada"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select
              id="tipo"
              value={form.tipo}
              onChange={(e) => update("tipo", e.target.value as ClienteInput["tipo"])}
            >
              <option value={TIPO_CLIENTE.MINORISTA}>Minorista</option>
              <option value={TIPO_CLIENTE.MAYORISTA}>Mayorista</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documento">{esMayorista ? "CUIT" : "DNI / CUIT"}</Label>
            <Input
              id="documento"
              value={form.documento ?? ""}
              onChange={(e) => update("documento", e.target.value)}
              placeholder={esMayorista ? "30-XXXXXXXX-X" : "DNI o CUIT"}
            />
          </div>

          {esMayorista && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="razon_social">Razón social</Label>
              <Input
                id="razon_social"
                value={form.razon_social ?? ""}
                onChange={(e) => update("razon_social", e.target.value)}
                placeholder="Nombre legal del negocio"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nombre">{esMayorista ? "Contacto" : "Nombre"} *</Label>
            <Input
              id="nombre"
              required
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder={esMayorista ? "Persona con la que tratás" : "Nombre"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apellido">Apellido</Label>
            <Input
              id="apellido"
              value={form.apellido ?? ""}
              onChange={(e) => update("apellido", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">Contacto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={form.instagram ?? ""}
              onChange={(e) => update("instagram", e.target.value)}
              placeholder="@usuario · sin arroba también sirve"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="cliente@dominio.com"
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
          placeholder="Cualquier observación útil sobre el cliente."
        />
      </section>

      {listasPrecios.length > 0 && (
        <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Lista de precios</h2>
          <p className="text-xs text-app-muted">
            La lista que usa este cliente para calcular precios en cada venta. Si queda vacío, usa el precio base del producto.
          </p>
          <Select
            id="lista_precio_id"
            value={form.lista_precio_id ?? ""}
            onChange={(e) => update("lista_precio_id", e.target.value || undefined)}
          >
            <option value="">— Sin lista (precio base) —</option>
            {listasPrecios.map((l) => (
              <option key={l.id} value={l.id}>{l.id_publico} · {l.nombre}</option>
            ))}
          </Select>
        </section>
      )}

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
            : mode === "create" ? "Crear cliente" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
