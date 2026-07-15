"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { CanalesMultiSelect } from "@/components/campanas/CanalesMultiSelect"
import { ProductosMultiSelect } from "@/components/campanas/ProductosMultiSelect"
import { createCampana, updateCampana } from "@/app/(dashboard)/campanas/actions"
import { DOMINIO } from "@/lib/dominio"
import type { CampanaInput } from "@/lib/validators/campana"

type Canal = { id: number; nombre: string }
type Producto = { id: string; id_publico: string; nombre: string; marca: string | null }

type Props = {
  mode: "create" | "edit"
  campanaId?: string
  initial?: Partial<CampanaInput>
  canales: Canal[]
  productos: Producto[]
}

const DEFAULTS: CampanaInput = {
  nombre: "",
  descripcion: undefined,
  fecha_inicio: "",
  fecha_fin: "",
  estado_manual: null,
  presupuesto_estimado: 0,
  gasto_id: undefined,
  notas: undefined,
  canal_ids: [],
  producto_ids: [],
}

export function CampanaForm({ mode, campanaId, initial, canales, productos }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<CampanaInput>({ ...DEFAULTS, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof CampanaInput>(key: K, value: CampanaInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCampana(form)
          : await updateCampana(campanaId!, form)

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
    mode === "create" ? DOMINIO.campanas.ruta : `${DOMINIO.campanas.ruta}/${campanaId}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Datos generales</h2>
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-[0.12em]">
            Obligatorio: nombre y fechas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nombre">Nombre de la campaña *</Label>
            <Input
              id="nombre"
              required
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder="Ej. Liquidación de invierno 2026"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              rows={3}
              value={form.descripcion ?? ""}
              onChange={(e) => update("descripcion", e.target.value)}
              placeholder="Objetivo, mensaje central, público…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_inicio">Fecha de inicio *</Label>
            <Input
              id="fecha_inicio"
              type="date"
              required
              value={form.fecha_inicio}
              onChange={(e) => update("fecha_inicio", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_fin">Fecha de fin *</Label>
            <Input
              id="fecha_fin"
              type="date"
              required
              value={form.fecha_fin}
              onChange={(e) => update("fecha_fin", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="presupuesto">Presupuesto estimado</Label>
            <MoneyInput
              id="presupuesto"
              min={0}
              value={form.presupuesto_estimado || null}
              onChange={(v) => update("presupuesto_estimado", v ?? 0)}
            />
            <p className="text-xs text-app-muted">
              Referencia visual. El costo real se toma del gasto asociado (si hay).
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Canales de difusión</h2>
          <p className="text-xs text-app-muted mt-1">
            Dónde se publica esta campaña. Podés agregar canales nuevos en configuración.
          </p>
        </div>
        <CanalesMultiSelect
          canales={canales}
          selectedIds={form.canal_ids}
          onChange={(ids) => update("canal_ids", ids)}
        />
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Productos incluidos</h2>
          <p className="text-xs text-app-muted mt-1">
            Se usa para atribución automática: cualquier venta con alguno de estos productos, en la
            ventana de la campaña y sin campaña marcada manualmente, se cuenta en las métricas.
          </p>
        </div>
        <ProductosMultiSelect
          productos={productos}
          selectedIds={form.producto_ids}
          onChange={(ids) => update("producto_ids", ids)}
        />
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea
          id="notas"
          rows={4}
          value={form.notas ?? ""}
          onChange={(e) => update("notas", e.target.value)}
          placeholder="Cualquier detalle interno del equipo."
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
            : mode === "create" ? "Crear campaña" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
