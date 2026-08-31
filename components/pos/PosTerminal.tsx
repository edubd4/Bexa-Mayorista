"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Barcode, FileCheck2, Printer, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { emitirFactura, registrarVenta, resolverPrecio } from "@/app/(dashboard)/ventas/actions"
import { cobrarVenta } from "@/app/(dashboard)/caja/actions"
import {
  buscarProductoPorCodigo, buscarProductosPorNombre, type ProductoPos,
} from "@/app/(dashboard)/pos/actions"
import { ComprobanteDialog } from "@/components/ventas/ComprobanteDialog"
import { DOMINIO } from "@/lib/dominio"
import { METODO_PAGO, type MetodoPago, type PagoVenta } from "@/lib/validators/caja"
import {
  PagosInput,
  pagosParaCobrar,
  validarPagos,
  type PagoDraft,
} from "@/components/caja/PagosInput"
import {
  CONDICION_IVA_LABEL,
  TIPO_COMPROBANTE_LABEL,
  motivoFacturaPendiente,
} from "@/lib/facturacion-ui"
import { METODO_PAGO_LABEL, resumenPagos } from "@/lib/caja-ui"
import { formatPesos } from "@/lib/utils"
import { CONSUMIDOR_FINAL_ID } from "@/lib/validators/cliente"
import {
  normalizarCuit, tipoComprobantePara, type CondicionIva,
} from "@/lib/validators/facturacion"
import type { PrecioResuelto } from "@/lib/validators/venta"

type ClientePos = {
  id: string
  id_publico: string
  nombre: string
  apellido: string | null
  razon_social: string | null
  tipo: string
  condicion_iva: CondicionIva
  documento: string | null
}

type Linea = {
  key: string
  producto: ProductoPos
  cantidad: number
  // Bonificación manual del vendedor (0041), misma columna que Nueva venta —
  // el mostrador también negocia (pedido 2026-08-27: todo el proceso acá).
  bonif: number | null
  resolving: boolean
  precio: PrecioResuelto | null
  error: string | null
}

type UltimaVenta = {
  ventaId: string
  total: number
  facturada: boolean
  cobrada: boolean
}

type Props = {
  clientes: ClientePos[]
  afipConfigurada?: boolean
}

function nombreCliente(c: ClientePos): string {
  if (c.tipo === "MAYORISTA") return c.razon_social ?? c.nombre
  return [c.nombre, c.apellido].filter(Boolean).join(" ")
}

let seq = 0
const nextKey = () => `pos-${++seq}-${Date.now()}`

// El precio unitario final CON bonificación, redondeado POR UNIDAD — el mismo
// cálculo que hace la RPC (0041) y que muestra VentaForm. Redondear acá evita
// que la pantalla cante un total distinto del que guarda la base.
function unitConBonif(l: Linea): number {
  if (!l.precio) return 0
  const pct = l.bonif ?? 0
  return Math.round(l.precio.precio_final * (1 - pct / 100) * 100) / 100
}

export function PosTerminal({ clientes, afipConfigurada = false }: Props) {
  const toast = useToast()
  const scanRef = useRef<HTMLInputElement>(null)

  const [clienteId, setClienteId] = useState<string>(CONSUMIDOR_FINAL_ID)
  const [scan, setScan] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<ProductoPos[]>([])
  const [lineas, setLineas] = useState<Linea[]>([])
  const [metodo, setMetodo] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  // Pago mixto (0043): el select de un método sigue siendo el fast path; la
  // división en varios métodos se abre a pedido y debe sumar el total exacto.
  const [pagoMixto, setPagoMixto] = useState(false)
  const [pagosMixtos, setPagosMixtos] = useState<PagoDraft[]>([])
  // Desmarcado por defecto: en el mostrador facturar es una decisión ACTIVA
  // del que cobra (a diferencia de /ventas/nuevo, donde el default es emitir).
  const [facturar, setFacturar] = useState(false)
  const [ultima, setUltima] = useState<UltimaVenta | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Comprobante post-cobro SIEMPRE (2026-08-27): factura si ARCA la autorizó,
  // recibo no fiscal si no — el cliente no se va del mostrador sin papel.
  const [comprobante, setComprobante] =
    useState<{ ventaId: string; doc: "factura" | "recibo" } | null>(null)
  const [isPending, startTransition] = useTransition()

  // El lector es un teclado: el input de escaneo tiene que estar SIEMPRE
  // enfocado para que el código caiga acá y no en cualquier otro lado.
  const focusScan = useCallback(() => scanRef.current?.focus(), [])
  useEffect(() => { focusScan() }, [focusScan])

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  )
  const tipoFactura = clienteSel ? tipoComprobantePara(clienteSel.condicion_iva) : null
  const faltaCuitParaA =
    tipoFactura === "FACTURA_A" && !normalizarCuit(clienteSel?.documento)
  const puedeFacturar = afipConfigurada && tipoFactura !== null && !faltaCuitParaA

  // Anti-carrera (mismo fix que VentaForm, review 2026-08-19 #4): cada línea
  // lleva un número de pedido incremental; solo la respuesta del ÚLTIMO pedido
  // pisa el estado. Re-escanear rápido el mismo producto dispara resoluciones
  // encadenadas — sin esto, una respuesta vieja podía dejar el precio del
  // tramo equivocado en el carrito.
  const reqSeq = useRef(new Map<string, number>())

  // ── Resolver precio de una línea (mismo motor que ventas) ────────────────
  const resolverLinea = useCallback(
    async (key: string, productoId: string, cantidad: number, cliente: string) => {
      const reqId = (reqSeq.current.get(key) ?? 0) + 1
      reqSeq.current.set(key, reqId)
      setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, resolving: true, error: null } : l)))
      const res = await resolverPrecio({ cliente_id: cliente, producto_id: productoId, cantidad })
      if (reqSeq.current.get(key) !== reqId) return // llegó tarde: la descarta
      setLineas((prev) => prev.map((l) =>
        l.key === key
          ? { ...l, resolving: false, error: res.ok ? null : res.error, precio: res.ok && res.data ? res.data : null }
          : l,
      ))
    },
    [],
  )

  // Cambio de cliente → re-resolver todo (la lista de precios cambia).
  useEffect(() => {
    for (const l of lineas) resolverLinea(l.key, l.producto.id, l.cantidad, clienteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // ── Agregar producto (desde escaneo o búsqueda) ──────────────────────────
  const agregarProducto = useCallback((p: ProductoPos) => {
    setAviso(null)
    setUltima(null)
    setLineas((prev) => {
      const existente = prev.find((l) => l.producto.id === p.id)
      if (existente) {
        const nueva = existente.cantidad + 1
        // El precio puede cambiar con la cantidad (descuentos por tramo).
        resolverLinea(existente.key, p.id, nueva, clienteId)
        return prev.map((l) => (l.key === existente.key ? { ...l, cantidad: nueva } : l))
      }
      const key = nextKey()
      resolverLinea(key, p.id, 1, clienteId)
      return [...prev, { key, producto: p, cantidad: 1, bonif: null, resolving: true, precio: null, error: null }]
    })
  }, [clienteId, resolverLinea])

  async function onScanEnter() {
    const codigo = scan.trim()
    setScan("")
    if (!codigo) return
    const res = await buscarProductoPorCodigo(codigo)
    if (!res.ok) {
      setAviso(res.error)
      return
    }
    agregarProducto(res.data)
  }

  // Mismo anti-carrera que los precios, para el buscador: solo la respuesta
  // del último término tipeado pisa la lista (las viejas llegan tarde y se
  // descartan). Sin esto, tipear rápido podía dejar resultados de un término
  // anterior.
  const busquedaSeq = useRef(0)

  async function onBuscarNombre(q: string) {
    setBusqueda(q)
    const reqId = ++busquedaSeq.current
    // 1 sola letra no filtra nada útil; vacío SÍ busca (lista inicial del
    // catálogo — pedido del cliente 2026-08-19: desplegar sin tipear).
    if (q.trim().length === 1) { setResultados([]); return }
    const res = await buscarProductosPorNombre(q)
    if (busquedaSeq.current !== reqId) return
    setResultados(res.ok ? res.data : [])
  }

  function updateCantidad(key: string, cantidad: number | null) {
    const c = cantidad ?? 0
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: c } : l)))
    const linea = lineas.find((l) => l.key === key)
    if (linea && c > 0) resolverLinea(key, linea.producto.id, c, clienteId)
  }

  function quitarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key))
    focusScan()
  }

  // Bonificación por línea: no toca el server — se aplica en pantalla sobre
  // el precio ya resuelto y viaja recién al registrar (igual que VentaForm).
  function updateBonif(key: string, bonif: number | null) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, bonif } : l)))
  }

  const total = useMemo(
    () => lineas.reduce((s, l) => s + (l.precio ? unitConBonif(l) * l.cantidad : 0), 0),
    [lineas],
  )
  const puedeCerrar =
    lineas.length > 0 &&
    lineas.every(
      (l) =>
        l.cantidad > 0 && l.precio && !l.error && !l.resolving &&
        (l.bonif === null || (l.bonif >= 0 && l.bonif <= 100)),
    )

  // ── Cierre: registrar + cobrar + facturar, en ese orden ──────────────────
  // Si ARCA falla, la venta y el cobro YA están hechos — el mostrador nunca
  // queda rehén del web service; la factura se emite después desde la ficha.
  function cerrarVenta() {
    if (!puedeCerrar || isPending) return
    // El desglose mixto se valida ANTES de registrar: si no suma el total,
    // no hay venta a medias — se corrige y recién ahí se cierra.
    if (pagoMixto) {
      const invalido = validarPagos(pagosMixtos, Math.round(total * 100) / 100, true)
      if (invalido) {
        toast.error(invalido)
        return
      }
    }
    startTransition(async () => {
      const res = await registrarVenta({
        cliente_id: clienteId,
        items: lineas.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          descuento_manual_pct: l.bonif ?? undefined,
        })),
        estado_entrega: "ENTREGADA",
        notas: undefined,
        campana_id: undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        focusScan()
        return
      }
      const ventaId = res.data!.venta_id
      // Cobrar con el total que GUARDÓ la RPC, no con la suma de floats del
      // client (review #3: 59.970000000000006 vs 59.97 → "excede el saldo").
      // También cubre un precio que cambió entre resolver y registrar.
      const totalReal = res.data!.total ?? Math.round(total * 100) / 100

      // Un método → un pago por el total; mixto → el desglose, con el drift
      // de centavos client/numeric absorbido en el último pago.
      const pagos: PagoVenta[] = pagoMixto
        ? pagosParaCobrar(pagosMixtos, totalReal)
        : [{ metodo, monto: totalReal }]
      const cobro = await cobrarVenta({ venta_id: ventaId, pagos })
      if (!cobro.ok) {
        toast.error(`Venta registrada, pero el cobro falló: ${cobro.error} — cobrala desde la ficha.`)
      }

      let facturada = false
      if (puedeFacturar && facturar && tipoFactura) {
        const fact = await emitirFactura({ venta_id: ventaId })
        facturada = fact.ok
        if (!fact.ok) {
          toast.error(`Venta registrada, pero sin factura: ${motivoFacturaPendiente(fact.error)}. Se puede emitir después desde la ficha.`)
        }
      }

      toast.success(
        `Venta cerrada · ${formatPesos(totalReal)}${cobro.ok ? ` · ${pagos.length === 1 ? METODO_PAGO_LABEL[pagos[0].metodo] : resumenPagos(pagos)}` : ""}${facturada && tipoFactura ? ` · ${TIPO_COMPROBANTE_LABEL[tipoFactura]}` : ""}`,
      )
      setUltima({ ventaId, total: totalReal, facturada, cobrada: cobro.ok })
      setLineas([])
      setAviso(null)
      setClienteId(CONSUMIDOR_FINAL_ID)
      setMetodo(METODO_PAGO.EFECTIVO)
      setPagoMixto(false)
      setPagosMixtos([])
      setFacturar(false)
      // Comprobante post-cobro SIEMPRE: la factura si salió, el recibo si no.
      // Con cobro fallido no hay comprobante de pago que valga — el banner de
      // última venta queda con los links para resolverlo.
      if (cobro.ok) {
        setComprobante({ ventaId, doc: facturada ? "factura" : "recibo" })
      }
      focusScan()
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Última venta: acceso a factura/ficha sin frenar la fila ── */}
      {ultima && (
        <div className="rounded-xl border border-app-green/40 bg-app-green/10 px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-app-green font-semibold">
            Venta cerrada · {formatPesos(ultima.total)}
          </span>
          {ultima.facturada && (
            <a
              href={`/factura/${ultima.ventaId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-app-accent hover:underline"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir factura ↗
            </a>
          )}
          <a
            href={`${DOMINIO.ventas.ruta}/${ultima.ventaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-app-muted hover:text-app-accent hover:underline"
          >
            Ver venta ↗
          </a>
        </div>
      )}

      {/* ── Escaneo + búsqueda manual ── */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-4 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pos-scan" className="flex items-center gap-1.5">
            <Barcode className="w-4 h-4 text-app-accent" /> Escanear código
          </Label>
          <Input
            id="pos-scan"
            ref={scanRef}
            value={scan}
            autoComplete="off"
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void onScanEnter() }
            }}
            placeholder="Apuntá el lector y escaneá — el carrito se arma solo"
            className="font-mono text-lg h-12"
          />
          {aviso && (
            <p className="text-[12px] font-mono text-app-amber">⚠ {aviso}</p>
          )}
        </div>

        <div className="space-y-1.5 relative">
          <Label htmlFor="pos-buscar" className="flex items-center gap-1.5">
            <Search className="w-4 h-4 text-app-muted" /> Sin código: buscar
          </Label>
          <Input
            id="pos-buscar"
            value={busqueda}
            autoComplete="off"
            onChange={(e) => void onBuscarNombre(e.target.value)}
            // Al enfocar sin texto: desplegar la lista inicial del catálogo.
            onFocus={() => { if (!busqueda.trim()) void onBuscarNombre("") }}
            // El timeout deja que el click en una opción llegue antes del blur
            // (la lista además frena el blur con preventDefault en mouseDown).
            onBlur={() => setTimeout(() => setResultados([]), 120)}
            placeholder="Nombre o ID del producto"
            className="h-12"
          />
          {resultados.length > 0 && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-app-line bg-app-card shadow-xl overflow-hidden max-h-72 overflow-y-auto"
            >
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-app-surface-mid flex justify-between gap-2"
                    onClick={() => {
                      agregarProducto(p)
                      setBusqueda("")
                      setResultados([])
                      focusScan()
                    }}
                  >
                    <span className="truncate">
                      <span className="font-mono text-app-accent text-xs">{p.id_publico}</span>
                      <span className="ml-2">{p.nombre}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-app-muted">
                      {p.controla_stock ? `stock ${p.stock_actual}` : "sin control"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Carrito ── */}
      <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-28 text-right">Cant</TableHead>
              <TableHead className="w-28 text-right">Precio</TableHead>
              <TableHead className="w-24 text-right">Bonif %</TableHead>
              <TableHead className="w-28 text-right">Subtotal</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableEmpty colSpan={6}>Carrito vacío — escaneá el primer producto.</TableEmpty>
            ) : (
              lineas.map((l) => {
                // Sin control de stock (0034) no hay nada que exceder: el RPC
                // no valida ni descuenta para esos productos.
                const excedeStock = l.producto.controla_stock && l.cantidad > l.producto.stock_actual
                return (
                  <TableRow key={l.key}>
                    <TableCell>
                      <span className="font-mono text-app-accent text-xs">{l.producto.id_publico}</span>
                      <span className="ml-2">{l.producto.nombre}</span>
                      {l.error && (
                        <p className="mt-0.5 text-[10.5px] font-mono text-app-red">{l.error}</p>
                      )}
                      {excedeStock && !l.error && (
                        <p className="mt-0.5 text-[10.5px] font-mono text-app-amber">
                          ⚠ Excede stock ({l.producto.stock_actual} disp.)
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <NumberInput decimals={0} value={l.cantidad} onChange={(v) => updateCantidad(l.key, v)} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.resolving ? "…" : l.precio ? formatPesos(l.precio.precio_final) : "—"}
                      {l.precio && l.precio.descuento_pct > 0 && (
                        <p className="text-[10.5px] text-app-green">-{Number(l.precio.descuento_pct)}%</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Bonificación manual (0041): remata el precio resuelto.
                          Vacío = sin bonificar — misma columna que Nueva venta. */}
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
                      {l.precio ? formatPesos(unitConBonif(l) * l.cantidad) : "—"}
                      {l.precio && (l.bonif ?? 0) > 0 && (
                        <p className="text-[10.5px] text-app-amber">
                          bonif. {formatPesos(unitConBonif(l))}/u
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => quitarLinea(l.key)} aria-label="Quitar">
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

      {/* ── Cliente + cobro + cierre ── */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-4 grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="pos-cliente">Cliente</Label>
          <Select
            id="pos-cliente"
            value={clienteId}
            onChange={(e) => { setClienteId(e.target.value); focusScan() }}
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id_publico} · {nombreCliente(c)}
              </option>
            ))}
          </Select>
          {afipConfigurada && clienteSel && tipoFactura && (
            faltaCuitParaA ? (
              <p className="text-[11px] font-mono text-app-amber">
                ⚠ {CONDICION_IVA_LABEL[clienteSel.condicion_iva]} sin CUIT — no se puede facturar A
              </p>
            ) : (
              <p className="text-[11px] font-mono text-app-muted">
                → {TIPO_COMPROBANTE_LABEL[tipoFactura]} · {CONDICION_IVA_LABEL[clienteSel.condicion_iva]}
              </p>
            )
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={pagoMixto ? "pos-mixto-metodo-0" : "pos-metodo"}>Cobro</Label>
          {!pagoMixto ? (
            <>
              <Select id="pos-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                {Object.entries(METODO_PAGO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => {
                  setPagosMixtos([{ metodo, monto: null }])
                  setPagoMixto(true)
                }}
                className="text-[11px] font-mono text-app-muted hover:text-app-accent transition-colors"
              >
                ¿Paga con más de un método? Dividir el pago
              </button>
            </>
          ) : (
            <>
              <PagosInput
                pagos={pagosMixtos}
                onChange={setPagosMixtos}
                objetivo={Math.round(total * 100) / 100}
                exacto
                idPrefix="pos-mixto"
                disabled={isPending}
              />
              <button
                type="button"
                onClick={() => setPagoMixto(false)}
                className="text-[11px] font-mono text-app-muted hover:text-app-accent transition-colors"
              >
                Volver a un solo método
              </button>
            </>
          )}
          {afipConfigurada && (
            <label className={`flex items-center gap-2 text-xs pt-1 ${puedeFacturar ? "text-app-text cursor-pointer" : "text-app-muted cursor-not-allowed"}`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-app-accent"
                checked={puedeFacturar && facturar}
                disabled={!puedeFacturar || isPending}
                onChange={(e) => setFacturar(e.target.checked)}
              />
              <FileCheck2 className="w-3.5 h-3.5" />
              Emitir {tipoFactura ? TIPO_COMPROBANTE_LABEL[tipoFactura] : "factura"}
            </label>
          )}
          {/* El módulo apagado se EXPLICA — un checkbox que desaparece sin
              decir por qué se lee como "está roto" (reporte 2026-08-19). */}
          {!afipConfigurada && (
            <p className="text-[11px] font-mono text-app-muted pt-1">
              Facturación ARCA sin configurar — se activa cargando el CUIT en
              Configuración (lo hace el admin).
            </p>
          )}
        </div>

        <div className="text-right space-y-2">
          <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">Total</p>
          <p className="font-display text-3xl text-app-accent leading-none">{formatPesos(total)}</p>
          <Button type="button" size="lg" onClick={cerrarVenta} disabled={!puedeCerrar || isPending}>
            {isPending ? "Cerrando…" : "Cobrar y cerrar"}
          </Button>
        </div>
      </section>

      {/* El paso final del cobro: factura o recibo, pero papel SIEMPRE.
          Continuar vuelve al escáner — la fila sigue. */}
      <ComprobanteDialog
        ventaId={comprobante?.ventaId ?? null}
        doc={comprobante?.doc ?? "recibo"}
        onContinuar={() => {
          setComprobante(null)
          focusScan()
        }}
      />
    </div>
  )
}
