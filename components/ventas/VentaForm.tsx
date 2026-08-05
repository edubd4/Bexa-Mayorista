"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileCheck2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
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
import { emitirFactura, registrarVenta, resolverPrecio } from "@/app/(dashboard)/ventas/actions"
import { DOMINIO } from "@/lib/dominio"
import { CONDICION_IVA_LABEL, TIPO_COMPROBANTE_LABEL } from "@/lib/facturacion-ui"
import { formatPesos } from "@/lib/utils"
import { explicarOrigenPrecio } from "@/lib/ventas-ui"
import {
  normalizarCuit,
  tipoComprobantePara,
  type CondicionIva,
} from "@/lib/validators/facturacion"
import {
  ESTADO_ENTREGA,
  type PrecioResuelto,
  type VentaInput,
} from "@/lib/validators/venta"

// Al crear no se puede elegir CANCELADA — solo estados vivos.
type EstadoEntregaEditable = "ENTREGADA" | "PEDIDO" | "EN_PREPARACION"

type ClienteOption = {
  id: string
  id_publico: string
  nombre: string
  apellido: string | null
  razon_social: string | null
  tipo: string
  lista_precio_id: string | null
  condicion_iva: CondicionIva
  documento: string | null
}
type ProductoOption = {
  id: string
  id_publico: string
  nombre: string
  precio_base: number
  stock_actual: number
  activo: boolean
}

type LineaBorrador = {
  key:        string                // uuid local para React key
  producto_id: string
  cantidad:   number
  // Resuelto por el server:
  resolving:  boolean
  error:      string | null
  precio:     PrecioResuelto | null
}

type CampanaOption = {
  id: string
  id_publico: string
  nombre: string
}

type Props = {
  clientes:  ClienteOption[]
  productos: ProductoOption[]
  campanasActivas?: CampanaOption[]
  /** true cuando afip_cuit está cargado en Configuración (0031) —
   *  habilita el hint de comprobante y el "emitir al registrar" */
  afipConfigurada?: boolean
}

function nombreCliente(c: ClienteOption): string {
  if (c.tipo === "MAYORISTA") return c.razon_social ?? c.nombre
  return [c.nombre, c.apellido].filter(Boolean).join(" ")
}

let seq = 0
const nextKey = () => `linea-${++seq}-${Date.now()}`

export function VentaForm({ clientes, productos, campanasActivas = [], afipConfigurada = false }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [clienteId, setClienteId] = useState<string>(clientes[0]?.id ?? "")
  const [estadoEntrega, setEstadoEntrega] = useState<EstadoEntregaEditable>(ESTADO_ENTREGA.ENTREGADA)
  const [notas, setNotas] = useState("")
  const [campanaId, setCampanaId] = useState<string>("")
  const [lineas, setLineas] = useState<LineaBorrador[]>([])
  const [facturarAlRegistrar, setFacturarAlRegistrar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Qué comprobante saldría para el cliente elegido (mejora premium #2) ──
  const clienteSel = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  )
  const tipoFactura = clienteSel ? tipoComprobantePara(clienteSel.condicion_iva) : null
  // Factura A sin CUIT válido = rechazo seguro → se avisa ANTES de registrar.
  const faltaCuitParaA =
    tipoFactura === "FACTURA_A" && !normalizarCuit(clienteSel?.documento)
  const puedeFacturarAca = afipConfigurada && tipoFactura !== null && !faltaCuitParaA

  const productosOrdenados = useMemo(
    () => [...productos].filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos],
  )
  const productoById = useMemo(
    () => new Map(productosOrdenados.map((p) => [p.id, p])),
    [productosOrdenados],
  )

  // Resolver precio via server action y actualizar la línea.
  const resolverLinea = useCallback(
    async (key: string, prodId: string, cantidad: number) => {
      if (!clienteId || !prodId || cantidad <= 0) return
      setLineas((prev) =>
        prev.map((l) => (l.key === key ? { ...l, resolving: true, error: null } : l)),
      )
      const res = await resolverPrecio({
        cliente_id:  clienteId,
        producto_id: prodId,
        cantidad,
      })
      setLineas((prev) =>
        prev.map((l) =>
          l.key === key
            ? {
                ...l,
                resolving: false,
                error: res.ok ? null : res.error,
                precio: res.ok && res.data ? res.data : null,
              }
            : l,
        ),
      )
    },
    [clienteId],
  )

  // Cuando cambia el cliente, re-resuelvo todos los precios (la lista puede cambiar).
  useEffect(() => {
    if (!clienteId) return
    for (const l of lineas) {
      if (l.producto_id && l.cantidad > 0) {
        resolverLinea(l.key, l.producto_id, l.cantidad)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function agregarLinea() {
    const key = nextKey()
    setLineas((prev) => [
      ...prev,
      { key, producto_id: "", cantidad: 1, resolving: false, error: null, precio: null },
    ])
  }

  function quitarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key))
  }

  function updateProducto(key: string, producto_id: string) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, producto_id } : l)))
    const linea = lineas.find((l) => l.key === key)
    if (producto_id && linea) {
      resolverLinea(key, producto_id, linea.cantidad)
    }
  }

  function updateCantidad(key: string, cantidad: number | null) {
    const c = cantidad ?? 0
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: c } : l)))
    const linea = lineas.find((l) => l.key === key)
    if (linea?.producto_id && c > 0) {
      resolverLinea(key, linea.producto_id, c)
    }
  }

  // Totales
  const totales = useMemo(() => {
    let subtotal = 0
    let descuento = 0
    let total = 0
    for (const l of lineas) {
      if (!l.precio) continue
      const sub = l.precio.precio_unitario * l.cantidad
      const fin = l.precio.precio_final * l.cantidad
      subtotal += sub
      descuento += sub - fin
      total += fin
    }
    return { subtotal, descuento, total }
  }, [lineas])

  const puedeGuardar =
    !!clienteId &&
    lineas.length > 0 &&
    lineas.every((l) => l.producto_id && l.cantidad > 0 && l.precio && !l.error)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!clienteId) return setError("Elegí un cliente")
    if (lineas.length === 0) return setError("Agregá al menos un producto")

    const items = lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }))
    const payload: VentaInput = {
      cliente_id:      clienteId,
      items,
      notas:           notas.trim() || undefined,
      estado_entrega:  estadoEntrega,
      campana_id:      campanaId || undefined,
    }

    startTransition(async () => {
      const res = await registrarVenta(payload)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      const ventaId = res.data!.venta_id

      // Mejora premium #1: factura en el mismo acto. Si ARCA falla, la venta
      // YA quedó (stock/caja/comisión) — se avisa y se emite después desde la ficha.
      if (puedeFacturarAca && facturarAlRegistrar && tipoFactura) {
        const fact = await emitirFactura({ venta_id: ventaId })
        if (fact.ok) {
          toast.success(`Venta registrada · ${TIPO_COMPROBANTE_LABEL[tipoFactura]} emitida con CAE`)
        } else {
          toast.error(`Venta registrada, pero la factura no salió: ${fact.error} — podés emitirla desde la ficha.`)
        }
      } else {
        toast.success("Venta registrada")
      }

      router.push(`${DOMINIO.ventas.ruta}/${ventaId}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente y estado */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Cliente y logística</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="cliente">Cliente *</Label>
            <Select
              id="cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">— Elegí un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id_publico} · {nombreCliente(c)}
                  {c.lista_precio_id ? " · con lista" : " · precio base"}
                </option>
              ))}
            </Select>
            {/* El vendedor sabe QUÉ va a salir antes de registrar (regla A/B) */}
            {afipConfigurada && clienteSel && tipoFactura && (
              faltaCuitParaA ? (
                <p className="text-[11px] font-mono text-app-amber">
                  ⚠ {CONDICION_IVA_LABEL[clienteSel.condicion_iva]} → {TIPO_COMPROBANTE_LABEL[tipoFactura]},
                  pero le falta un CUIT válido en su ficha — sin eso no se puede facturar
                </p>
              ) : (
                <p className="text-[11px] font-mono text-app-muted">
                  → {TIPO_COMPROBANTE_LABEL[tipoFactura]} · {CONDICION_IVA_LABEL[clienteSel.condicion_iva]}
                </p>
              )
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="estado_entrega">Estado de entrega</Label>
            <Select
              id="estado_entrega"
              value={estadoEntrega}
              onChange={(e) => setEstadoEntrega(e.target.value as EstadoEntregaEditable)}
            >
              <option value={ESTADO_ENTREGA.ENTREGADA}>Entregada (venta directa)</option>
              <option value={ESTADO_ENTREGA.PEDIDO}>Pedido</option>
              <option value={ESTADO_ENTREGA.EN_PREPARACION}>En preparación</option>
            </Select>
            <p className="text-[11px] text-app-muted font-mono">
              El stock sale al registrar (reserva). El estado es solo logística.
            </p>
          </div>
          {campanasActivas.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="campana">Campaña de marketing (opcional)</Label>
              <Select
                id="campana"
                value={campanaId}
                onChange={(e) => setCampanaId(e.target.value)}
              >
                <option value="">— sin campaña —</option>
                {campanasActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id_publico} · {c.nombre}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-app-muted font-mono">
                Atribuí la venta a una campaña activa para medir su impacto.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold">Productos</h2>
            <p className="text-xs text-app-muted mt-0.5">
              El precio se calcula en vivo según la lista del cliente y las reglas de descuento.
            </p>
          </div>
          <Button type="button" onClick={agregarLinea} size="sm" variant="outline">
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-24 text-right">Cantidad</TableHead>
              <TableHead className="w-32 text-right">Precio</TableHead>
              <TableHead className="w-24 text-right">Desc</TableHead>
              <TableHead className="w-32 text-right">Subtotal</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableEmpty colSpan={6}>Todavía no agregaste productos.</TableEmpty>
            ) : (
              lineas.map((l) => {
                const prod = productoById.get(l.producto_id)
                const excedeStock = prod && l.cantidad > prod.stock_actual
                const sub = l.precio ? l.precio.precio_final * l.cantidad : 0
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
                      {l.precio && (
                        <p className="mt-1 text-[10.5px] font-mono text-app-muted">
                          {explicarOrigenPrecio(l.precio.origen)}
                        </p>
                      )}
                      {l.error && (
                        <p className="mt-1 text-[10.5px] font-mono text-app-red">{l.error}</p>
                      )}
                      {excedeStock && !l.error && (
                        <p className="mt-1 text-[10.5px] font-mono text-app-amber">
                          ⚠ Excede stock ({prod.stock_actual} disp.) — el RPC lo va a rechazar
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
                    <TableCell className="text-right font-mono text-sm">
                      {l.resolving ? "…" : l.precio ? formatPesos(l.precio.precio_final) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.precio && l.precio.descuento_pct > 0
                        ? `-${Number(l.precio.descuento_pct)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.precio ? formatPesos(sub) : "—"}
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

      {/* Totales */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Total label="Subtotal"  value={formatPesos(totales.subtotal)}  />
          <Total label="Descuento" value={`-${formatPesos(totales.descuento)}`} tone="amber" />
          <Total label="Total"     value={formatPesos(totales.total)}     tone="accent" big />
        </div>
      </section>

      {/* Notas */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-3">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea
          id="notas"
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Detalles del pedido, retiro, etc."
        />
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
        {afipConfigurada && (
          <label
            className={`flex items-center gap-2 text-sm sm:mr-auto ${
              puedeFacturarAca ? "text-app-text cursor-pointer" : "text-app-muted cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-app-accent"
              checked={puedeFacturarAca && facturarAlRegistrar}
              disabled={!puedeFacturarAca || isPending}
              onChange={(e) => setFacturarAlRegistrar(e.target.checked)}
            />
            <FileCheck2 className="w-4 h-4" />
            Emitir {tipoFactura ? TIPO_COMPROBANTE_LABEL[tipoFactura] : "factura"} al registrar
          </label>
        )}
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={DOMINIO.ventas.ruta}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending || !puedeGuardar}>
          {isPending ? "Registrando…" : "Registrar venta"}
        </Button>
      </div>
    </form>
  )
}

function Total({
  label,
  value,
  tone = "gray",
  big = false,
}: {
  label: string
  value: string
  tone?: "gray" | "amber" | "accent"
  big?: boolean
}) {
  const toneClass =
    tone === "accent" ? "text-app-accent"
    : tone === "amber" ? "text-app-amber"
    : "text-app-secondary"
  return (
    <div className="text-right">
      <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">{label}</p>
      <p className={`font-display ${big ? "text-2xl" : "text-lg"} ${toneClass} mt-1`}>{value}</p>
    </div>
  )
}
