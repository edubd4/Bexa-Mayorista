"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ComboBox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput, NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { createProducto, updateProducto } from "@/app/(dashboard)/productos/actions"
import { DOMINIO } from "@/lib/dominio"
import type { ProductoInput } from "@/lib/validators/producto"
import { atributosATexto } from "@/lib/validators/producto"

type Props = {
  mode: "create" | "edit"
  productoId?: string
  initial?: Partial<ProductoInput> & { atributos?: Record<string, string> }
  proveedores: { id: string; nombre: string; id_publico: string }[]
  categoriasExistentes: string[]
  marcasExistentes: string[]
  // La comisión por producto la define SOLO el admin. Cuando es false, el campo
  // ni se renderiza y el valor no viaja: el RPC del vendedor no lo acepta como
  // parámetro. Ver 0017.
  mostrarComision?: boolean
}

const DEFAULTS: ProductoInput = {
  nombre: "",
  sku: undefined,
  descripcion: undefined,
  categoria: undefined,
  marca: undefined,
  atributos: {},
  proveedor_id: undefined,
  costo: 0,
  precio_base: 0,
  comision_pct: undefined,
  stock_minimo: 0,
}

export function ProductoForm({
  mode,
  productoId,
  initial,
  proveedores,
  categoriasExistentes,
  marcasExistentes,
  mostrarComision = true,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<ProductoInput>({
    ...DEFAULTS,
    ...initial,
    atributos: initial?.atributos ?? {},
  })
  const [atributosTexto, setAtributosTexto] = useState<string>(
    atributosATexto(initial?.atributos ?? {}),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof ProductoInput>(key: K, value: ProductoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // El schema hace el parse del textarea. Le pasamos como string y Zod lo convierte a objeto.
    const payload = { ...form, atributos: atributosTexto as unknown as Record<string, string> }
    startTransition(async () => {
      const result = mode === "create"
        ? await createProducto(payload)
        : await updateProducto(productoId!, payload)
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
    mode === "create" ? DOMINIO.productos.ruta : `${DOMINIO.productos.ruta}/${productoId}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Identificación</h2>
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-[0.12em]">
            Obligatorio: nombre
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              required
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder="Nombre comercial del producto"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sku">SKU / código</Label>
            <Input
              id="sku"
              value={form.sku ?? ""}
              onChange={(e) => update("sku", e.target.value || undefined)}
              placeholder="Del proveedor o EAN"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proveedor_id">Proveedor</Label>
            <Select
              id="proveedor_id"
              value={form.proveedor_id ?? ""}
              onChange={(e) => update("proveedor_id", e.target.value || undefined)}
            >
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id_publico} · {p.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoría</Label>
            <ComboBox
              id="categoria"
              value={form.categoria ?? null}
              onChange={(v) => update("categoria", v ?? undefined)}
              options={categoriasExistentes}
              placeholder="Escribí o elegí"
              emptyMessage="Todavía sin categorías cargadas"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="marca">Marca</Label>
            <ComboBox
              id="marca"
              value={form.marca ?? null}
              onChange={(v) => update("marca", v ?? undefined)}
              options={marcasExistentes}
              placeholder="Escribí o elegí"
              emptyMessage="Todavía sin marcas cargadas"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              rows={3}
              value={form.descripcion ?? ""}
              onChange={(e) => update("descripcion", e.target.value)}
              placeholder="Detalle para mostrar en la ficha."
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="atributos">Atributos</Label>
            <Textarea
              id="atributos"
              rows={4}
              value={atributosTexto}
              onChange={(e) => setAtributosTexto(e.target.value)}
              placeholder="clave: valor por línea. Ej:&#10;color: negro&#10;medida: 3/4&#10;modelo: T-2000"
            />
            <p className="text-[11px] text-app-muted font-mono">
              Una línea por atributo, formato <code>clave: valor</code>. Las líneas sin dos puntos se ignoran.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">
          {mostrarComision ? "Precio y comisión" : "Costo y precio"}
        </h2>
        <div className={`grid grid-cols-1 gap-4 ${mostrarComision ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          <div className="space-y-2">
            <Label htmlFor="costo">Costo</Label>
            <MoneyInput
              id="costo"
              decimals={2}
              value={form.costo ?? 0}
              onChange={(v) => update("costo", v ?? 0)}
            />
            <p className="text-[11px] text-app-muted font-mono">
              {mostrarComision
                ? "Es un dato del catálogo — NO registra plata en caja. Para comprar mercadería con plata usá Compras."
                : "Cuánto te salió a vos este producto. Lo cargás ahora y después no vuelve a mostrarse: los costos del catálogo los ve solo el admin. Cargarlo acá NO mueve plata de la caja."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="precio_base">Precio base (minorista)</Label>
            <MoneyInput
              id="precio_base"
              decimals={2}
              value={form.precio_base ?? 0}
              onChange={(v) => update("precio_base", v ?? 0)}
            />
            <p className="text-[11px] text-app-muted font-mono">
              Se usa si el cliente no tiene lista asignada.
            </p>
          </div>
          {mostrarComision && (
            <div className="space-y-2">
              <Label htmlFor="comision_pct">Comisión override (%)</Label>
              <NumberInput
                id="comision_pct"
                decimals={2}
                value={form.comision_pct ?? null}
                onChange={(v) => update("comision_pct", v ?? undefined)}
                placeholder="Usar la del vendedor"
              />
              <p className="text-[11px] text-app-muted font-mono">
                Vacío = se usa el % del vendedor. Si cargás un número acá, este
                producto paga ESE % a cualquier vendedor que lo venda. Aplica a
                las ventas nuevas; las ya registradas no cambian.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">Stock</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock_minimo">Stock mínimo</Label>
            <NumberInput
              id="stock_minimo"
              decimals={0}
              value={form.stock_minimo ?? 0}
              onChange={(v) => update("stock_minimo", v ?? 0)}
              placeholder="0 = sin alerta"
            />
            <p className="text-[11px] text-app-muted font-mono">
              Aparece en Alertas cuando el stock actual queda por debajo.
            </p>
          </div>
          {mode === "edit" && (
            <div className="rounded-md border border-app-line bg-app-input px-4 py-3 flex flex-col justify-center">
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Stock actual</p>
              <p className="font-display text-lg mt-0.5">
                Se ajusta con movimientos ↓
              </p>
            </div>
          )}
        </div>
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
            : mode === "create" ? "Crear producto" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
