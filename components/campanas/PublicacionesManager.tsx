"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  crearPublicacion,
  borrarPublicacion,
  actualizarPublicacion,
} from "@/app/(dashboard)/campanas/actions"
import {
  ESTADO_PUBLICACION,
  ESTADO_PUBLICACION_LABEL,
  type EstadoPublicacion,
} from "@/lib/validators/campana"

type Canal = { id: number; nombre: string }
type Publicacion = {
  id: string
  id_publico: string
  canal_id: number | null
  titulo: string | null
  cuerpo: string
  fecha_publicacion: string | null
  estado: EstadoPublicacion
}

type Props = {
  campanaId: string
  canales: Canal[]
  publicaciones: Publicacion[]
}

export function PublicacionesManager({ campanaId, canales, publicaciones }: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [nueva, setNueva] = useState<{
    canal_id: number | undefined
    titulo: string
    cuerpo: string
    estado: EstadoPublicacion
  }>({
    canal_id: canales[0]?.id,
    titulo: "",
    cuerpo: "",
    estado: ESTADO_PUBLICACION.BORRADOR,
  })

  function handleCrear() {
    if (!nueva.cuerpo.trim()) {
      toast.error("Escribí el cuerpo del mensaje.")
      return
    }
    startTransition(async () => {
      const res = await crearPublicacion({
        campana_id: campanaId,
        canal_id: nueva.canal_id,
        titulo: nueva.titulo || undefined,
        cuerpo: nueva.cuerpo,
        estado: nueva.estado,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Publicación creada")
      setNueva({ canal_id: canales[0]?.id, titulo: "", cuerpo: "", estado: ESTADO_PUBLICACION.BORRADOR })
      router.refresh()
    })
  }

  async function handleBorrar(id: string) {
    const ok = await confirm({
      title: "¿Borrar publicación?",
      description: "Esta acción no se puede deshacer.",
      confirmLabel: "Borrar",
      tone: "danger",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await borrarPublicacion(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Publicación eliminada")
      router.refresh()
    })
  }

  function handleCambiarEstado(id: string, nuevoEstado: EstadoPublicacion) {
    startTransition(async () => {
      const res = await actualizarPublicacion(id, { estado: nuevoEstado })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      router.refresh()
    })
  }

  const canalNombre = (id: number | null) => canales.find((c) => c.id === id)?.nombre ?? "—"

  return (
    <div className="space-y-6">
      {/* Nueva publicación */}
      <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
        <h3 className="font-display font-semibold text-base">Nueva publicación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pub_canal">Canal</Label>
            <select
              id="pub_canal"
              value={nueva.canal_id ?? ""}
              onChange={(e) => setNueva({ ...nueva, canal_id: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full h-10 rounded-md bg-app-input border border-app-line px-3 text-sm text-app-text"
            >
              <option value="">— sin canal —</option>
              {canales.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub_titulo">Título (opcional)</Label>
            <Input
              id="pub_titulo"
              value={nueva.titulo}
              onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
              placeholder="Ej. Post principal de lanzamiento"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pub_cuerpo">Cuerpo del mensaje *</Label>
          <Textarea
            id="pub_cuerpo"
            rows={4}
            value={nueva.cuerpo}
            onChange={(e) => setNueva({ ...nueva, cuerpo: e.target.value })}
            placeholder="El texto que se va a copiar y pegar al canal…"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleCrear} disabled={isPending}>
            <Plus className="w-3.5 h-3.5" /> Agregar publicación
          </Button>
        </div>
      </section>

      {/* Listado */}
      {publicaciones.length === 0 ? (
        <p className="text-sm text-app-muted text-center py-6">
          Todavía no hay publicaciones. Agregá la primera arriba.
        </p>
      ) : (
        <div className="space-y-3">
          {publicaciones.map((p) => (
            <article key={p.id} className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10.5px] text-app-accent">{p.id_publico}</span>
                    <Badge variant="accent">{canalNombre(p.canal_id)}</Badge>
                    <Badge variant={p.estado === "PUBLICADA" ? "green" : p.estado === "CANCELADA" ? "red" : "outline"}>
                      {ESTADO_PUBLICACION_LABEL[p.estado]}
                    </Badge>
                  </div>
                  {p.titulo && <p className="font-display font-semibold mt-1.5">{p.titulo}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <select
                    value={p.estado}
                    onChange={(e) => handleCambiarEstado(p.id, e.target.value as EstadoPublicacion)}
                    disabled={isPending}
                    className="h-8 rounded-md bg-app-input border border-app-line px-2 text-xs text-app-text"
                    aria-label="Cambiar estado"
                  >
                    {Object.values(ESTADO_PUBLICACION).map((v) => (
                      <option key={v} value={v}>{ESTADO_PUBLICACION_LABEL[v]}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="icon" onClick={() => handleBorrar(p.id)} disabled={isPending}
                    aria-label="Borrar publicación">
                    <Trash2 className="w-4 h-4 text-app-red" />
                  </Button>
                </div>
              </header>
              <p className="text-sm text-app-text whitespace-pre-wrap">{p.cuerpo}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
