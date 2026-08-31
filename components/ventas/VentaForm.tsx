"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as Dialog from "@radix-ui/react-dialog"
import { BadgePercent, FileCheck2, Plus, Trash2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
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
import { cobrarVenta } from "@/app/(dashboard)/caja/actions"
import { ComprobanteDialog } from "@/components/ventas/ComprobanteDialog"
import { DOMINIO } from "@/lib/dominio"
import {
  CONDICION_IVA_LABEL,
  TIPO_COMPROBANTE_LABEL,
  motivoFacturaPendiente,
} from "@/lib/facturacion-ui"
import { METODO_PAGO_LABEL, resumenPagos } from "@/lib/caja-ui"
import {
  PagosInput,
  pagosParaCobrar,
  validarPagos,
  type PagoDraft,
} from "@/components/caja/PagosInput"
import { formatPesos } from "@/lib/utils"
import { explicarOrigenPrecio } from "@/lib/ventas-ui"
import {
  normalizarCuit,
  tipoComprobantePara,
  type CondicionIva,
} from "@/lib/validators/facturacion"
import { METODO_PAGO, type MetodoPago, type PagoVenta } from "@/lib/validators/caja"
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
  // false = sin control de stock (0034): la venta no valida ni descuenta.
  controla_stock: boolean
  activo: boolean
}

type LineaBorrador = {
  key:        string                // uuid local para React key
  producto_id: string
  cantidad:   number
  // Bonificación manual del vendedor (0041): % ENCIMA del precio resuelto.
  // null = sin bonificar. No pasa por el server hasta registrar.
  bonif:      number | null
  // Resuelto por el server:
  resolving:  boolean
  error:      string | null
  precio:     PrecioResuelto | null
}

// El precio unitario final CON bonificación, redondeado POR UNIDAD — el mismo
// cálculo que hace la RPC (0041). Redondear acá evita que la pantalla cante
// un total distinto del que guarda la base.
function unitConBonif(l: LineaBorrador): number {
  if (!l.precio) return 0
  const pct = l.bonif ?? 0
  return Math.round(l.precio.precio_final * (1 - pct / 100) * 100) / 100
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
  // Cobro en el acto (2026-08-19, rediseñado 2026-08-20): un BOTÓN que abre
  // el diálogo de pago — el patrón de todo punto de venta (elegir método →
  // confirmar). Confirmar encadena cobrar_venta con el total — mismo circuito
  // que el botón Cobrar de la ficha y que el mostrador. Acá lo habitual es
  // cobrar en el momento — por eso es la acción primaria del pie (2026-08-25);
  // el submit normal registra a cuenta, que es la excepción.
  const [cobroOpen, setCobroOpen] = useState(false)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  // Pago mixto (0043): el fast path sigue siendo un método a un toque; la
  // división en varios métodos se abre a pedido y exige sumar el total exacto.
  const [pagoMixto, setPagoMixto] = useState(false)
  const [pagosMixtos, setPagosMixtos] = useState<PagoDraft[]>([])
  const [errorCobro, setErrorCobro] = useState<string | null>(null)
  // Comprobante post-cobro SIEMPRE (2026-08-27): factura si ARCA la autorizó,
  // recibo no fiscal si no — el cliente no se va sin papel. Es un paso del
  // cobro, no un opcional.
  const [comprobante, setComprobante] =
    useState<{ ventaId: string; doc: "factura" | "recibo" } | null>(null)
  // Bonificación "a toda la venta": azúcar de UI — replica el % en cada línea.
  const [bonifGlobal, setBonifGlobal] = useState<number | null>(null)
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
  // Opciones del buscador: matchea por ID público y nombre (tipear filtra).
  const productoOptions = useMemo<SearchSelectOption[]>(
    () =>
      productosOrdenados.map((p) => ({
        value: p.id,
        label: `${p.id_publico} · ${p.nombre}`,
        hint: p.controla_stock ? `stock ${p.stock_actual}` : "sin control",
      })),
    [productosOrdenados],
  )

  // Anti-carrera (review 2026-08-19 #4): cada línea lleva un número de pedido
  // incremental; una respuesta solo pisa el estado si sigue siendo la ÚLTIMA
  // pedida para esa línea. Sin esto, tipear rápido cantidad "1"→"12" podía
  // dejar en pantalla el precio del tramo de 1 con el total equivocado.
  const reqSeq = useRef(new Map<string, number>())

  // Resolver precio via server action y actualizar la línea.
  const resolverLinea = useCallback(
    async (key: string, prodId: string, cantidad: number) => {
      if (!clienteId || !prodId || cantidad <= 0) return
      const reqId = (reqSeq.current.get(key) ?? 0) + 1
      reqSeq.current.set(key, reqId)
      setLineas((prev) =>
        prev.map((l) => (l.key === key ? { ...l, resolving: true, error: null } : l)),
      )
      const res = await resolverPrecio({
        cliente_id:  clienteId,
        producto_id: prodId,
        cantidad,
      })
      // Llegó tarde: ya salió una resolución más nueva para esta línea — la
      // respuesta vieja se descarta y el estado lo pisa solo la última.
      if (reqSeq.current.get(key) !== reqId) return
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
      { key, producto_id: "", cantidad: 1, bonif: null, resolving: false, error: null, precio: null },
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

  // Bonificación por línea: no toca el server — se aplica en pantalla sobre
  // el precio ya resuelto y viaja recién al registrar.
  function updateBonif(key: string, bonif: number | null) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, bonif } : l)))
  }

  // "A toda la venta": el mismo % en cada línea. Después se puede retocar
  // línea por línea — el RPC solo conoce líneas, un único mecanismo (0041).
  function aplicarBonifGlobal() {
    const pct = bonifGlobal
    if (pct === null || pct < 0 || pct > 100) return
    setLineas((prev) => prev.map((l) => ({ ...l, bonif: pct === 0 ? null : pct })))
  }

  // Totales — con la bonificación aplicada por unidad, igual que la RPC.
  const totales = useMemo(() => {
    let subtotal = 0
    let total = 0
    for (const l of lineas) {
      if (!l.precio) continue
      subtotal += l.precio.precio_unitario * l.cantidad
      total += unitConBonif(l) * l.cantidad
    }
    return { subtotal, descuento: subtotal - total, total }
  }, [lineas])

  const puedeGuardar =
    !!clienteId &&
    lineas.length > 0 &&
    lineas.every(
      (l) =>
        l.producto_id && l.cantidad > 0 && l.precio && !l.error &&
        (l.bonif === null || (l.bonif >= 0 && l.bonif <= 100)),
    )

  // Un solo flujo, dos puertas: el submit del form registra a cuenta; el
  // botón "Cobrar ahora" abre el diálogo de pago y confirma con cobro=true.
  function registrar(conCobro: boolean) {
    setError(null)

    if (!clienteId) return setError("Elegí un cliente")
    if (lineas.length === 0) return setError("Agregá al menos un producto")

    const items = lineas.map((l) => ({
      producto_id: l.producto_id,
      cantidad:    l.cantidad,
      descuento_manual_pct: l.bonif ?? undefined,
    }))
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

      // Cobro en el acto: mismo orden que el mostrador (registrar → cobrar →
      // facturar). Si el cobro falla, la venta YA quedó registrada — se avisa
      // y se cobra desde la ficha; nunca se pierde la venta por esto.
      //
      // El monto sale del TOTAL QUE GUARDÓ la RPC, no de la suma del client:
      // sumar precio*cantidad en floats da 59.970000000000006 contra el
      // numeric exacto 59.97 y cobrar_venta lo rechaza por "excede el saldo"
      // (review 2026-08-19 #3). El redondeo queda de fallback por si la
      // lectura del total no vuelve.
      const totalCobrable = res.data!.total ?? Math.round(totales.total * 100) / 100
      // Un método → un pago por el total; pago mixto → el desglose del
      // diálogo, con el drift de centavos absorbido en el último pago.
      const pagos: PagoVenta[] = pagoMixto
        ? pagosParaCobrar(pagosMixtos, totalCobrable)
        : [{ metodo: metodoPago, monto: totalCobrable }]
      let cobroFallo: string | null = null
      if (conCobro) {
        const cobro = await cobrarVenta({ venta_id: ventaId, pagos })
        if (!cobro.ok) cobroFallo = cobro.error
      }

      // Si el total guardado no coincide con el que se mostró en pantalla (un
      // precio cambió entre resolver y registrar), el vendedor le cantó otro
      // número al cliente: se avisa con los dos importes.
      if (Math.abs(totalCobrable - totales.total) >= 0.01) {
        toast.error(
          `Ojo: el total de la venta quedó en ${formatPesos(totalCobrable)} y en pantalla decía ${formatPesos(totales.total)} — revisá el precio con el cliente.`,
        )
      }

      // Mejora premium #1: factura en el mismo acto. Si ARCA falla, la venta
      // YA quedó (stock/caja/comisión) — se avisa y se emite después desde la ficha.
      let facturaEmitida = false
      if (puedeFacturarAca && facturarAlRegistrar && tipoFactura) {
        const fact = await emitirFactura({ venta_id: ventaId })
        facturaEmitida = fact.ok
        if (fact.ok) {
          toast.success(`Venta registrada${sufijoCobro(conCobro, cobroFallo, pagos)} · ${TIPO_COMPROBANTE_LABEL[tipoFactura]} emitida con CAE`)
        } else {
          toast.error(`Venta registrada, pero sin factura: ${motivoFacturaPendiente(fact.error)}. Se puede emitir después desde la ficha.`)
        }
      } else {
        toast.success(`Venta registrada${sufijoCobro(conCobro, cobroFallo, pagos)}`)
      }
      // El cobro fallido se avisa aparte y con el motivo: es plata, no puede
      // quedar tapado por el mensaje de la factura.
      if (cobroFallo) {
        toast.error(`El cobro no se registró: ${cobroFallo} — cobrala desde la ficha.`)
      }

      // Comprobante post-cobro SIEMPRE: la factura si salió, el recibo si no.
      // Con cobro fallido no hay comprobante de pago que valga — se va al
      // detalle a resolver el cobro, como siempre.
      if (conCobro && !cobroFallo) {
        setComprobante({ ventaId, doc: facturaEmitida ? "factura" : "recibo" })
      } else {
        router.push(`${DOMINIO.ventas.ruta}/${ventaId}`)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    registrar(false)
  }

  function confirmarCobro() {
    if (!puedeGuardar || isPending) return
    if (pagoMixto) {
      const invalido = validarPagos(pagosMixtos, Math.round(totales.total * 100) / 100, true)
      if (invalido) return setErrorCobro(invalido)
    }
    setErrorCobro(null)
    setCobroOpen(false)
    registrar(true)
  }

  function activarPagoMixto() {
    // Arranca con el método ya elegido y monto vacío: el vendedor tipea lo
    // que entra por ese método y "Agregar método" precarga el restante.
    setPagosMixtos([{ metodo: metodoPago, monto: null }])
    setErrorCobro(null)
    setPagoMixto(true)
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
              <TableHead className="w-20 text-right">Desc</TableHead>
              <TableHead className="w-24 text-right">Bonif %</TableHead>
              <TableHead className="w-32 text-right">Subtotal</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableEmpty colSpan={7}>Todavía no agregaste productos.</TableEmpty>
            ) : (
              lineas.map((l) => {
                const prod = productoById.get(l.producto_id)
                // Sin control de stock (0034) no hay nada que exceder: el RPC
                // ya no valida ni mueve stock para esos productos.
                const excedeStock = prod && prod.controla_stock && l.cantidad > prod.stock_actual
                const sub = unitConBonif(l) * l.cantidad
                return (
                  <TableRow key={l.key}>
                    <TableCell>
                      <SearchSelect
                        options={productoOptions}
                        value={l.producto_id}
                        onChange={(v) => updateProducto(l.key, v)}
                        placeholder="— Elegí producto —"
                        searchPlaceholder="Buscá por ID o nombre…"
                        emptyText="Ningún producto matchea"
                      />
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
                    <TableCell className="text-right">
                      {/* Bonificación manual (0041): remata el precio resuelto.
                          Vacío = sin bonificar. */}
                      <NumberInput
                        decimals={2}
                        max={100}
                        value={l.bonif}
                        onChange={(v) => updateBonif(l.key, v)}
                        placeholder="—"
                        disabled={isPending}
                        aria-label="Bonificación manual %"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.precio ? formatPesos(sub) : "—"}
                      {l.precio && (l.bonif ?? 0) > 0 && (
                        <p className="text-[10.5px] text-app-amber">
                          bonif. {formatPesos(unitConBonif(l))}/u
                        </p>
                      )}
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

        {/* Bonificación a toda la venta (0041): replica el % en cada línea —
            después se retoca línea por línea si hace falta. */}
        <div className="pt-3 border-t border-app-line-soft flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="bonif-global" className="flex items-center gap-2 text-sm">
            <BadgePercent className="w-4 h-4 text-app-amber" />
            Bonificar toda la venta
          </label>
          <div className="w-28">
            <NumberInput
              id="bonif-global"
              decimals={2}
              max={100}
              value={bonifGlobal}
              onChange={setBonifGlobal}
              placeholder="0"
              disabled={isPending}
              aria-label="Bonificación % a toda la venta"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || bonifGlobal === null || lineas.length === 0}
            onClick={aplicarBonifGlobal}
          >
            Aplicar
          </Button>
          <p className="text-[11px] text-app-muted font-mono sm:ml-auto">
            Pone el mismo % en todas las líneas — la columna Bonif se puede retocar una por una.
          </p>
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

      {/* Acciones: acá se cobra en el acto casi siempre — por eso "Cobrar
          ahora" es EL botón (jerarquía pedida 2026-08-25). La venta a cuenta
          existe pero es la excepción: queda al lado, como secundario. */}
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
        {/* El módulo apagado se EXPLICA — un checkbox que desaparece sin decir
            por qué se lee como "está roto" (reporte 2026-08-19). */}
        {!afipConfigurada && (
          <p className="text-[11px] font-mono text-app-muted sm:mr-auto">
            Facturación ARCA sin configurar — se activa cargando el CUIT en
            Configuración (lo hace el admin).
          </p>
        )}
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={DOMINIO.ventas.ruta}>Cancelar</Link>
        </Button>
        <Button type="submit" variant="outline" disabled={isPending || !puedeGuardar}>
          {isPending ? "Registrando…" : "Registrar sin cobrar"}
        </Button>
        <Dialog.Root open={cobroOpen} onOpenChange={setCobroOpen}>
          <Dialog.Trigger asChild>
            <Button type="button" size="lg" disabled={isPending || !puedeGuardar}>
              <Wallet className="w-5 h-5" />
              {isPending ? "Registrando…" : `Cobrar ahora (${formatPesos(totales.total)})`}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150" />
            <Dialog.Content className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:max-w-md rounded-xl border border-app-line-soft bg-app-card shadow-2xl p-6 space-y-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150">
              <div>
                <Dialog.Title className="font-display text-lg font-semibold text-app-text">
                  Cobrar ahora
                </Dialog.Title>
                <Dialog.Description className="text-sm text-app-secondary mt-1">
                  Se registra la venta y el cobro entra a la caja en el mismo acto.
                </Dialog.Description>
              </div>

              <div className="rounded-lg border border-app-line-soft bg-app-surface-mid/40 px-4 py-3 text-center">
                <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total a cobrar</p>
                <p className="font-display text-3xl text-app-accent mt-1">{formatPesos(totales.total)}</p>
              </div>

              {/* Método de pago a un toque, como en el mostrador. El pago
                  mixto (0043) se abre a pedido: varios métodos, cada uno con
                  su monto, y la suma tiene que dar el total exacto. */}
              {!pagoMixto ? (
                <div className="space-y-1.5">
                  <span className="text-sm text-app-secondary">Método de pago</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetodoPago(m)}
                        className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          metodoPago === m
                            ? "border-app-accent bg-app-accent/15 text-app-accent font-semibold"
                            : "border-app-line-soft bg-app-card text-app-secondary hover:border-app-line hover:text-app-text"
                        }`}
                      >
                        {METODO_PAGO_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={activarPagoMixto}
                    className="text-xs font-mono text-app-muted hover:text-app-accent transition-colors"
                  >
                    ¿Pagó con más de un método? Dividir el pago
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-app-secondary">Pago mixto</span>
                    <button
                      type="button"
                      onClick={() => { setPagoMixto(false); setErrorCobro(null) }}
                      className="text-xs font-mono text-app-muted hover:text-app-accent transition-colors"
                    >
                      Volver a un solo método
                    </button>
                  </div>
                  <PagosInput
                    pagos={pagosMixtos}
                    onChange={setPagosMixtos}
                    objetivo={Math.round(totales.total * 100) / 100}
                    exacto
                    idPrefix="cobro-mixto"
                    disabled={isPending}
                  />
                </div>
              )}

              {errorCobro && (
                <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-xs text-app-red">
                  {errorCobro}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCobroOpen(false)}>
                  Volver
                </Button>
                <Button type="button" size="sm" disabled={isPending} onClick={confirmarCobro}>
                  {isPending
                    ? "Registrando…"
                    : `Cobrar y registrar · ${pagoMixto ? "pago mixto" : METODO_PAGO_LABEL[metodoPago]}`}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <p className="text-[11px] text-app-muted font-mono text-right">
        ¿Te pagan después? &apos;Registrar sin cobrar&apos; deja la venta pendiente y la cobrás desde la ficha.
      </p>

      {/* El paso final del cobro: factura o recibo, pero papel SIEMPRE.
          Continuar (o cerrar) lleva al detalle de la venta. */}
      <ComprobanteDialog
        ventaId={comprobante?.ventaId ?? null}
        doc={comprobante?.doc ?? "recibo"}
        onContinuar={() => comprobante && router.push(`${DOMINIO.ventas.ruta}/${comprobante.ventaId}`)}
      />
    </form>
  )
}

// Sufijo del toast segun como salio el cobro encadenado. Con pago mixto va
// el desglose completo: es el comprobante hablado de lo que entró por dónde.
function sufijoCobro(cobrarAhora: boolean, fallo: string | null, pagos: PagoVenta[]): string {
  if (!cobrarAhora || fallo) return ""
  return pagos.length === 1
    ? ` y cobrada · ${METODO_PAGO_LABEL[pagos[0].metodo]}`
    : ` y cobrada · ${resumenPagos(pagos)}`
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
