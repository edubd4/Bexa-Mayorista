"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
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
import { Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { createRegla, removeRegla, toggleReglaActivo } from "@/app/(dashboard)/listas-precios/actions"
import {
  SCOPE_DESCUENTO,
  type ReglaDescuentoInput,
  type ScopeDescuento,
} from "@/lib/validators/lista-precio"

type Producto = { id: string; id_publico: string; nombre: string; categoria: string | null }
type Regla = {
  id: string
  id_publico: string
  scope: ScopeDescuento
  producto_id: string | null
  categoria: string | null
  cantidad_min: number
  descuento_pct: number
  activo: boolean
  producto: { id_publico: string; nombre: string } | null
}

type Props = {
  listaId: string | null            // null = reglas generales (todas las listas)
  productos: Producto[]
  categorias: string[]
  reglas: Regla[]
  ambito: "lista" | "global"        // decide el label del alta
}

const SCOPE_LABEL: Record<ScopeDescuento, string> = {
  PRODUCTO:  "Producto",
  CATEGORIA: "Categoría",
  GLOBAL:    "Toda venta",
}

export function ReglasManager({ listaId, productos, categorias, reglas, ambito }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [scope, setScope] = useState<ScopeDescuento>(SCOPE_DESCUENTO.PRODUCTO)
  const [productoId, setProductoId] = useState<string>("")
  const [categoria, setCategoria] = useState<string>("")
  const [cantidadMin, setCantidadMin] = useState<number | null>(null)
  const [descuentoPct, setDescuentoPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleAdd() {
    setError(null)
    const payload: ReglaDescuentoInput = {
      lista_precio_id: listaId ?? undefined,
      scope,
      producto_id: scope === SCOPE_DESCUENTO.PRODUCTO ? productoId || undefined : undefined,
      categoria:   scope === SCOPE_DESCUENTO.CATEGORIA ? categoria.trim() || undefined : undefined,
      cantidad_min: cantidadMin ?? 0,
      descuento_pct: descuentoPct ?? -1,
    }
    startTransition(async () => {
      const res = await createRegla(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Regla creada")
      setProductoId("")
      setCategoria("")
      setCantidadMin(null)
      setDescuentoPct(null)
    })
  }

  async function handleToggle(r: Regla) {
    startTransition(async () => {
      const res = await toggleReglaActivo(r.id, listaId)
      if (!res.ok) toast.error(res.error)
      else toast.success(r.activo ? "Regla desactivada" : "Regla reactivada")
    })
  }

  async function handleRemove(r: Regla) {
    const ok = await confirm({
      title: `¿Eliminar la regla ${r.id_publico}?`,
      description: "Las ventas ya hechas no cambian: el descuento aplicado quedó guardado en cada venta.",
      confirmLabel: "Eliminar regla",
      tone: "danger",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeRegla(r.id, listaId)
      if (!res.ok) toast.error(res.error)
      else toast.success("Regla eliminada")
    })
  }

  const productosOrdenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const scopeAmbitoLabel =
    ambito === "lista"
      ? "Reglas de esta lista"
      : "Reglas generales (aplican a todas las listas)"

  return (
    <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
      <div>
        <h2 className="font-display font-semibold">Reglas de descuento por cantidad</h2>
        <p className="text-xs text-app-muted mt-0.5">{scopeAmbitoLabel}</p>
      </div>

      {/* Alta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="scope">Aplicar a</Label>
          <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as ScopeDescuento)}>
            <option value={SCOPE_DESCUENTO.PRODUCTO}>Un producto</option>
            <option value={SCOPE_DESCUENTO.CATEGORIA}>Una categoría</option>
            <option value={SCOPE_DESCUENTO.GLOBAL}>Toda venta</option>
          </Select>
        </div>

        {scope === SCOPE_DESCUENTO.PRODUCTO && (
          <div className="space-y-1.5">
            <Label htmlFor="prod">Producto</Label>
            <Select id="prod" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">— Elegí producto —</option>
              {productosOrdenados.map((p) => (
                <option key={p.id} value={p.id}>{p.id_publico} · {p.nombre}</option>
              ))}
            </Select>
          </div>
        )}
        {scope === SCOPE_DESCUENTO.CATEGORIA && (
          <div className="space-y-1.5">
            <Label htmlFor="cat">Categoría</Label>
            <Input
              id="cat"
              list="categorias-existentes"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Escribí o elegí una existente"
            />
            <datalist id="categorias-existentes">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        )}
        {scope === SCOPE_DESCUENTO.GLOBAL && <div />}

        <div className="space-y-1.5">
          <Label htmlFor="cant">Cantidad mínima</Label>
          <NumberInput id="cant" decimals={0} value={cantidadMin} onChange={setCantidadMin} placeholder="Ej. 10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pct">Descuento (%)</Label>
          <NumberInput id="pct" decimals={2} value={descuentoPct} onChange={setDescuentoPct} placeholder="Ej. 5" />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleAdd} disabled={isPending} size="sm">
          {isPending ? "…" : "Agregar regla"}
        </Button>
      </div>

      {/* Tabla */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Aplica a</TableHead>
            <TableHead className="text-right">Desde</TableHead>
            <TableHead className="text-right">Descuento</TableHead>
            <TableHead className="text-right">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reglas.length === 0 ? (
            <TableEmpty colSpan={5}>Sin reglas todavía.</TableEmpty>
          ) : (
            reglas.map((r) => {
              const aplicaA = r.scope === "PRODUCTO"
                ? (r.producto?.nombre ?? "Producto")
                : r.scope === "CATEGORIA"
                  ? (r.categoria ?? "Categoría")
                  : "Toda venta"
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-app-accent text-xs">{r.id_publico}</TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-app-muted mr-2">
                      {SCOPE_LABEL[r.scope]}
                    </span>
                    {aplicaA}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.cantidad_min}+</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.descuento_pct)}%</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(r)}
                        disabled={isPending}
                      >
                        <Badge variant={r.activo ? "green" : "gray"}>
                          {r.activo ? "Activa" : "Inactiva"}
                        </Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(r)}
                        disabled={isPending}
                        className="text-app-muted hover:text-app-red transition-colors disabled:opacity-50"
                        aria-label={`Eliminar regla ${r.id_publico}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </section>
  )
}
