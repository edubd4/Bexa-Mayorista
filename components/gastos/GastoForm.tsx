"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { registrarGasto } from "@/app/(dashboard)/gastos/actions"
import { DOMINIO } from "@/lib/dominio"
import { METODO_PAGO, type GastoInput, type MetodoPago } from "@/lib/validators/caja"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"

type Categoria = { id: number; nombre: string; descripcion: string | null }

type Props = {
  categorias: Categoria[]
}

function hoyISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function GastoForm({ categorias }: Props) {
  const toast = useToast()
  const [categoriaId, setCategoriaId] = useState<number | "">(categorias[0]?.id ?? "")
  const [monto, setMonto] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [metodo, setMetodo] = useState<MetodoPago>(METODO_PAGO.EFECTIVO)
  const [notas, setNotas] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!categoriaId) return setError("Elegí una categoría")
    if (monto === null || monto <= 0) return setError("Monto > 0")
    if (!descripcion.trim()) return setError("Descripción requerida")

    const payload: GastoInput = {
      categoria_id: Number(categoriaId),
      monto,
      descripcion: descripcion.trim(),
      fecha,
      metodo,
      notas: notas.trim() || undefined,
    }
    startTransition(async () => {
      const res = await registrarGasto(payload)
      if (res && !res.ok) {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  if (categorias.length === 0) {
    return (
      <div className="rounded-xl border border-app-amber/40 bg-app-amber/10 px-5 py-4">
        <p className="font-display font-semibold text-app-amber">Falta configurar categorías</p>
        <p className="text-xs text-app-secondary mt-1">
          Andá a{" "}
          <Link href="/configuracion/categorias-gasto" className="underline hover:text-app-accent">
            Configuración → Categorías de gasto
          </Link>{" "}
          y creá al menos una para poder registrar gastos.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="categoria">Categoría *</Label>
          <Select
            id="categoria"
            value={String(categoriaId)}
            onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— Elegí categoría —</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="monto">Monto *</Label>
          <MoneyInput id="monto" decimals={2} value={monto} onChange={setMonto} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha">Fecha</Label>
          <input
            id="fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full h-10 px-3 rounded-md bg-app-input border border-app-line text-sm text-app-text focus:outline-none focus:border-app-accent/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="metodo">Método</Label>
          <Select
            id="metodo"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPago)}
          >
            {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
              <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="descripcion">Descripción *</Label>
          <input
            id="descripcion"
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Factura EPEC septiembre"
            className="w-full h-10 px-3 rounded-md bg-app-input border border-app-line text-sm text-app-text focus:outline-none focus:border-app-accent/50"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notas">Notas</Label>
          <Textarea id="notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href={DOMINIO.gastos.ruta}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Registrando…" : "Registrar gasto"}
        </Button>
      </div>
    </form>
  )
}
