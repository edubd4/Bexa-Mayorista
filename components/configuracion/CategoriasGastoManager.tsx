"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  createCategoriaGasto,
  toggleCategoriaGastoActivo,
} from "@/app/(dashboard)/gastos/actions"

type Categoria = { id: number; nombre: string; descripcion: string | null; activo: boolean }

export function CategoriasGastoManager({ categorias }: { categorias: Categoria[] }) {
  const toast = useToast()
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleAdd() {
    setError(null)
    if (!nombre.trim()) return setError("Nombre requerido")
    startTransition(async () => {
      const res = await createCategoriaGasto({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Categoría creada")
      setNombre("")
      setDescripcion("")
    })
  }

  async function handleToggle(c: Categoria) {
    startTransition(async () => {
      const res = await toggleCategoriaGastoActivo(c.id)
      if (!res.ok) toast.error(res.error)
      else toast.success(c.activo ? "Desactivada" : "Reactivada")
    })
  }

  return (
    <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
      <div>
        <h2 className="font-display font-semibold">Categorías de gasto</h2>
        <p className="text-xs text-app-muted mt-0.5">
          Aparecen en el selector al registrar un gasto.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label htmlFor="cat-nombre">Nombre</Label>
          <Input id="cat-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Marketing" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat-desc">Descripción (opcional)</Label>
          <Input id="cat-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <Button type="button" onClick={handleAdd} disabled={isPending} size="sm">
          {isPending ? "…" : "Agregar"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red">
          {error}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Descripción</TableHead>
            <TableHead className="text-right">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categorias.length === 0 ? (
            <TableEmpty colSpan={3}>Sin categorías todavía.</TableEmpty>
          ) : (
            categorias.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nombre}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                  {c.descripcion ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <button type="button" onClick={() => handleToggle(c)} disabled={isPending}>
                    <Badge variant={c.activo ? "green" : "gray"}>
                      {c.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  )
}
