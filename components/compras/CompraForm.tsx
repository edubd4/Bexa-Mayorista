"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput, NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { recibirCompra } from "@/app/(dashboard)/compras/actions"
import { quickCreateProducto } from "@/app/(dashboard)/productos/actions"
import { DOMINIO } from "@/lib/dominio"
import { formatPesos } from "@/lib/utils"
import type { CompraInput } from "@/lib/validators/compra"

type ProveedorOption = { id: string; id_publico: string; nombre: string }
type ProductoOption = {
  id: string
  id_publico: string
  nombre: string
  costo: number      // el admin ve el costo actual → sirve de default al agregar línea
  stock_actual: number
}

type Linea = {
  key: string
  producto_id: string
  cantidad: number
  costo_unitario: number
}

let seq = 0
const nextKey = () => `linea-${++seq}-${Date.now()}`

type Props = {
  proveedores: ProveedorOption[]
  productos: ProductoOption[]
}

export function CompraForm({ proveedores, productos }: Props) {
  const toast = useToast()
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "")
  const [numeroFactura, setNumeroFactura] = useState("")
  const [fecha, setFecha] = useState("")   // vacío = hoy (lo resuelve el server)
  const [notas, setNotas] = useState("")
  const [lineas, setLineas] = useState<Linea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Productos creados en línea (quick-create) se suman a los que vinieron del server
  const [productosExtra, setProductosExtra] = useState<ProductoOption[]>([])
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickNombre, setQuickNombre] = useState("")
  const [quickCosto, setQuickCosto] = useState<number | null>(null)
  const [quickCategoria, setQuickCategoria] = useState("")
  const [quickPending, startQuickTransition] = useTransition()

  const productosOrdenados = useMemo(
    () => [...productos, ...productosExtra].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos, productosExtra],
  )
  const productoById = useMemo(
    () => new Map(productosOrdenados.map((p) => [p.id, p])),
    [productosOrdenados],
  )

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { key: nextKey(), producto_id: "", cantidad: 1, costo_unitario: 0 },
    ])
  }

  function quitarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key))
  }

  function updateProducto(key: string, producto_id: string) {
    const prod = productoById.get(producto_id)
    setLineas((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, producto_id, costo_unitario: prod?.costo ?? l.costo_unitario }
          : l,
      ),
    )
  }

  function updateCantidad(key: string, v: number | null) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: v ?? 0 } : l)))
  }

  function updateCosto(key: string, v: number | null) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, costo_unitario: v ?? 0 } : l)))
  }

  // Quick-create: producto con info mínima (nombre + costo) que se agrega como
  // línea de la compra al toque. Queda "incompleto" (sin precio de venta) hasta
  // que el admin lo complete desde Productos.
  function handleQuickCreate() {
    const nombre = quickNombre.trim()
    if (nombre.length < 2) {
      toast.error("Poné un nombre para el producto.")
      return
    }
    startQuickTransition(async () => {
      const res = await quickCreateProducto({
        nombre,
        costo: quickCosto ?? 0,
        categoria: quickCategoria.trim() || undefined,
        proveedor_id: proveedorId || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const nuevo: ProductoOption = {
        id: res.producto.id,
        id_publico: res.producto.id_publico,
        nombre: res.producto.nombre,
        costo: res.producto.costo,
        stock_actual: res.producto.stock_actual,
      }
      setProductosExtra((prev) => [...prev, nuevo])
      setLineas((prev) => [
        ...prev,
        { key: nextKey(), producto_id: nuevo.id, cantidad: 1, costo_unitario: nuevo.costo },
      ])
      setQuickNombre("")
      setQuickCosto(null)
      setQuickCategoria("")
      setQuickOpen(false)
      toast.success(`${nuevo.id_publico} creado — completá el precio de venta después`)
    })
  }

  const totales = useMemo(() => {
    let total = 0
    for (const l of lineas) total += l.costo_unitario * l.cantidad
    return { total }
  }, [lineas])

  const puedeGuardar =
    !!proveedorId &&
    lineas.length > 0 &&
    lineas.every((l) => l.producto_id && l.cantidad > 0 && l.costo_unitario >= 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!proveedorId) return setError("Elegí un proveedor")
    if (lineas.length === 0) return setError("Agregá al menos un producto")

    const payload: CompraInput = {
      proveedor_id: proveedorId,
      items: lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        costo_unitario: l.costo_unitario,
      })),
      numero_factura: numeroFactura.trim() || undefined,
      notas: notas.trim() || undefined,
      fecha: fecha || undefined,
    }

    startTransition(async () => {
      const res = await recibirCompra(payload)
      if (res && !res.ok) {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Proveedor y factura</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="proveedor">Proveedor *</Label>
            <Select
              id="proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              required
            >
              <option value="">— Elegí proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.id_publico} · {p.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="numero_factura">Nº de factura del proveedor</Label>
            <Input
              id="numero_factura"
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
              placeholder="Ej. 0001-00012345"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fecha_compra">Fecha de la compra</Label>
            <Input
              id="fecha_compra"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <p className="text-[11px] text-app-muted font-mono">
              Dejalo vacío para usar hoy. Útil para cargar facturas viejas.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold">Ítems recibidos</h2>
            <p className="text-xs text-app-muted mt-0.5">
              El costo unitario acá actualiza el costo del producto en el catálogo (último pagado).
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setQuickOpen((v) => !v)} size="sm" variant="ghost">
              <Plus className="w-4 h-4" />
              Producto nuevo
            </Button>
            <Button type="button" onClick={agregarLinea} size="sm" variant="outline">
              <Plus className="w-4 h-4" />
              Agregar
            </Button>
          </div>
        </div>

        {quickOpen && (
          <div className="rounded-lg border border-app-accent/30 bg-app-accent/5 p-4 space-y-3">
            <p className="text-xs text-app-secondary">
              Carga rápida: nombre y costo alcanzan. El producto queda marcado{" "}
              <span className="text-app-amber font-mono text-[11px]">incompleto</span> hasta
              que le pongas precio de venta en Productos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quick_nombre">Nombre *</Label>
                <Input
                  id="quick_nombre"
                  value={quickNombre}
                  onChange={(e) => setQuickNombre(e.target.value)}
                  placeholder="Ej. Ventilador 16'' turbo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_costo">Costo unitario</Label>
                <MoneyInput
                  id="quick_costo"
                  decimals={2}
                  value={quickCosto}
                  onChange={setQuickCosto}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick_categoria">Categoría (opcional)</Label>
                <Input
                  id="quick_categoria"
                  value={quickCategoria}
                  onChange={(e) => setQuickCategoria(e.target.value)}
                  placeholder="Ej. Climatización"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuickOpen(false)} disabled={quickPending}>
                Cerrar
              </Button>
              <Button type="button" size="sm" onClick={handleQuickCreate} disabled={quickPending}>
                {quickPending ? "Creando…" : "Crear y agregar a la compra"}
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-24 text-right">Cantidad</TableHead>
              <TableHead className="w-40 text-right">Costo unitario</TableHead>
              <TableHead className="w-32 text-right">Subtotal</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableEmpty colSpan={5}>Todavía no agregaste productos.</TableEmpty>
            ) : (
              lineas.map((l) => {
                const prod = productoById.get(l.producto_id)
                const cambiaCosto = prod && l.costo_unitario !== Number(prod.costo)
                return (
                  <TableRow key={l.key}>
                    <TableCell>
                      <Select
                        value={l.producto_id}
                        onChange={(e) => updateProducto(l.key, e.target.value)}
                      >
                        <option value="">— Elegí producto —</option>
                        {productosOrdenados.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id_publico} · {p.nombre} (stock {p.stock_actual})
                          </option>
                        ))}
                      </Select>
                      {prod && cambiaCosto && (
                        <p className="mt-1 text-[10.5px] font-mono text-app-amber">
                          Costo pasa de {formatPesos(Number(prod.costo))} a {formatPesos(l.costo_unitario)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <NumberInput
                        decimals={0}
                        value={l.cantidad}
                        onChange={(v) => updateCantidad(l.key, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyInput
                        decimals={2}
                        value={l.costo_unitario}
                        onChange={(v) => updateCosto(l.key, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPesos(l.cantidad * l.costo_unitario)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => quitarLinea(l.key)}
                        aria-label="Quitar línea"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
          <div />
          <div />
          <div>
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total</p>
            <p className="font-display text-2xl text-app-accent mt-1">{formatPesos(totales.total)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea
          id="notas"
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Fecha de recepción, faltantes, etc."
        />
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={DOMINIO.compras.ruta}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending || !puedeGuardar}>
          {isPending ? "Registrando…" : "Registrar compra"}
        </Button>
      </div>
    </form>
  )
}
