"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { useConfirm } from "@/components/ui/confirm-dialog"
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
import { removeItemLista, upsertItemLista } from "@/app/(dashboard)/listas-precios/actions"
import { formatPesos } from "@/lib/utils"

type Producto = { id: string; id_publico: string; nombre: string; precio_base: number }
type Item = { id: string; producto_id: string; precio: number; producto: Producto | null }

type Props = {
  listaId: string
  productos: Producto[]
  items: Item[]
}

export function ItemsManager({ listaId, productos, items }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [productoId, setProductoId] = useState<string>("")
  const [precio, setPrecio] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleAdd() {
    setError(null)
    if (!productoId) return setError("Elegí un producto")
    if (precio === null || precio < 0) return setError("Precio inválido")

    startTransition(async () => {
      const res = await upsertItemLista({
        lista_precio_id: listaId,
        producto_id: productoId,
        precio,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const yaEstaba = items.some((i) => i.producto_id === productoId)
      toast.success(yaEstaba ? "Precio actualizado" : "Producto agregado")
      setProductoId("")
      setPrecio(null)
    })
  }

  async function handleRemove(item: Item) {
    const ok = await confirm({
      title: "Quitar producto de la lista?",
      description: `Se quita "${item.producto?.nombre ?? "producto"}" de esta lista. El producto no se borra.`,
      confirmLabel: "Quitar",
      tone: "danger",
    })
    if (!ok) return

    startTransition(async () => {
      const res = await removeItemLista(listaId, item.id)
      if (!res.ok) toast.error(res.error)
      else toast.success("Producto quitado")
    })
  }

  const productosOrdenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold">Productos y precios</h2>
          <p className="text-xs text-app-muted mt-0.5">
            Elegí un producto y su precio en esta lista. Reagregarlo actualiza el precio.
          </p>
        </div>
      </div>

      {/* Alta */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="item-producto">Producto</Label>
          <Select
            id="item-producto"
            value={productoId}
            onChange={(e) => {
              setProductoId(e.target.value)
              const p = productosOrdenados.find((x) => x.id === e.target.value)
              if (p && precio === null) setPrecio(Number(p.precio_base))
            }}
          >
            <option value="">— Elegí un producto —</option>
            {productosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id_publico} · {p.nombre} (base {formatPesos(Number(p.precio_base))})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-precio">Precio en esta lista</Label>
          <MoneyInput
            id="item-precio"
            decimals={2}
            value={precio}
            onChange={setPrecio}
          />
        </div>
        <Button type="button" onClick={handleAdd} disabled={isPending}>
          {isPending ? "…" : "Agregar / actualizar"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red">
          {error}
        </div>
      )}

      {/* Tabla */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Precio base</TableHead>
            <TableHead className="text-right">Precio lista</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmpty colSpan={5}>La lista no tiene productos todavía.</TableEmpty>
          ) : (
            items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-app-accent text-xs">
                  {it.producto?.id_publico ?? "—"}
                </TableCell>
                <TableCell>{it.producto?.nombre ?? "Producto eliminado"}</TableCell>
                <TableCell className="text-right font-mono text-sm text-app-muted">
                  {it.producto ? formatPesos(Number(it.producto.precio_base)) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatPesos(Number(it.precio))}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(it)}
                    aria-label="Quitar producto"
                    disabled={isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  )
}
