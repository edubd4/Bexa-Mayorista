"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { createTarea, updateTarea } from "@/app/(dashboard)/tareas/actions"
import {
  FRECUENCIA_TAREA,
  PRIORIDAD_TAREA,
  type FrecuenciaTarea,
  type PrioridadTarea,
  type TareaInput,
} from "@/lib/validators/tarea"
import {
  DIA_SEMANA_LABEL,
  FRECUENCIA_TAREA_LABEL,
  PRIORIDAD_TAREA_LABEL,
} from "@/lib/tareas-ui"
import { DOMINIO } from "@/lib/dominio"

type Usuario = { id: string; nombre: string; rol: string }

type Props = {
  mode: "create" | "edit"
  tareaId?: string
  initial?: Partial<TareaInput>
  usuarios: Usuario[]
  areasExistentes: string[]
}

export function TareaForm({ mode, tareaId, initial, usuarios, areasExistentes }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [codigo, setCodigo] = useState(initial?.codigo ?? "")
  const [nombre, setNombre] = useState(initial?.nombre ?? "")
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "")
  const [area, setArea] = useState(initial?.area ?? "")
  const [asignadoA, setAsignadoA] = useState(initial?.asignado_a ?? "")
  const [prioridad, setPrioridad] = useState<PrioridadTarea>(initial?.prioridad ?? PRIORIDAD_TAREA.MEDIA)
  const [tiempoEstimado, setTiempoEstimado] = useState<number | null>(initial?.tiempo_estimado_min ?? null)
  const [frecuencia, setFrecuencia] = useState<FrecuenciaTarea>(initial?.frecuencia ?? FRECUENCIA_TAREA.DIARIA)
  const [diaSemana, setDiaSemana] = useState<string>(initial?.dia_semana?.toString() ?? "1")
  const [diaMes, setDiaMes] = useState<number | null>(initial?.dia_mes ?? null)
  const [horaSugerida, setHoraSugerida] = useState(initial?.hora_sugerida ?? "")
  const [manualUrl, setManualUrl] = useState(initial?.manual_url ?? "")
  const [fechaLimite, setFechaLimite] = useState(initial?.fecha_limite ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const payload: TareaInput = {
      codigo: codigo.trim() || undefined,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      area: area.trim() || undefined,
      asignado_a: asignadoA || undefined,
      prioridad,
      tiempo_estimado_min: tiempoEstimado ?? undefined,
      frecuencia,
      dia_semana: frecuencia === FRECUENCIA_TAREA.SEMANAL ? Number(diaSemana) : undefined,
      dia_mes: frecuencia === FRECUENCIA_TAREA.MENSUAL ? (diaMes ?? undefined) : undefined,
      hora_sugerida: horaSugerida || undefined,
      fecha_limite: fechaLimite || undefined,
      manual_url: manualUrl.trim() || undefined,
    }

    startTransition(async () => {
      const res = mode === "create"
        ? await createTarea(payload)
        : await updateTarea(tareaId!, payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(mode === "create" ? "Tarea creada" : "Tarea actualizada")
      router.push(DOMINIO.tareas.ruta)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-codigo">Código (opcional)</Label>
          <Input id="t-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="BX-V01" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="t-nombre">Nombre</Label>
          <Input id="t-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Responder mensajes de WhatsApp" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-area">Área</Label>
          <Input
            id="t-area"
            list="areas-existentes"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Ventas, Depósito…"
          />
          <datalist id="areas-existentes">
            {areasExistentes.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-asignado">Responsable</Label>
          <Select id="t-asignado" value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-prioridad">Prioridad</Label>
          <Select id="t-prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadTarea)}>
            {(Object.keys(PRIORIDAD_TAREA) as PrioridadTarea[]).map((p) => (
              <option key={p} value={p}>{PRIORIDAD_TAREA_LABEL[p]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-frecuencia">Frecuencia</Label>
          <Select id="t-frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaTarea)}>
            {(Object.keys(FRECUENCIA_TAREA) as FrecuenciaTarea[]).map((f) => (
              <option key={f} value={f}>{FRECUENCIA_TAREA_LABEL[f]}</option>
            ))}
          </Select>
        </div>
        {frecuencia === FRECUENCIA_TAREA.SEMANAL && (
          <div className="space-y-1.5">
            <Label htmlFor="t-dia-semana">Día de la semana</Label>
            <Select id="t-dia-semana" value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)}>
              {Object.entries(DIA_SEMANA_LABEL).map(([n, label]) => (
                <option key={n} value={n}>{label}</option>
              ))}
            </Select>
          </div>
        )}
        {frecuencia === FRECUENCIA_TAREA.MENSUAL && (
          <div className="space-y-1.5">
            <Label htmlFor="t-dia-mes">Día del mes (31 = fin de mes)</Label>
            <NumberInput id="t-dia-mes" decimals={0} value={diaMes} onChange={setDiaMes} placeholder="1-31" />
          </div>
        )}
        {frecuencia !== FRECUENCIA_TAREA.EVENTUAL && (
          <div className="space-y-1.5">
            <Label htmlFor="t-hora">Hora sugerida</Label>
            <Input id="t-hora" type="time" value={horaSugerida} onChange={(e) => setHoraSugerida(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="t-tiempo">Tiempo estimado (min)</Label>
          <NumberInput id="t-tiempo" decimals={0} value={tiempoEstimado} onChange={setTiempoEstimado} placeholder="30" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-limite">Fecha límite (opcional)</Label>
          <Input
            id="t-limite"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
          <p className="text-[10.5px] font-mono text-app-muted">
            Vencida y sin finalizar = atrasada.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-desc">Observaciones</Label>
        <Textarea
          id="t-desc"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Detalles, criterios, con qué cruzar el resultado…"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-manual">Link al manual (Google Docs)</Label>
        <Input
          id="t-manual"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="https://docs.google.com/…"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : mode === "create" ? "Crear tarea" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
