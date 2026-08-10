import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { formatFecha, formatFechaHora } from "@/lib/utils"
import { ESTADO_TAREA_LABEL, ESTADO_TAREA_VARIANT } from "@/lib/tareas-ui"
import type { EstadoTarea } from "@/lib/validators/tarea"
import { logPerfilError } from "@/lib/auth-guards"

type Row = {
  id: string
  fecha: string
  estado: EstadoTarea
  iniciada_at: string | null
  finalizada_at: string | null
  notas: string | null
  tarea: { codigo: string | null; id_publico: string; nombre: string; asignado: { nombre: string } | null } | null
  completador: { nombre: string } | null
}

// La auditoría que pide el cliente: qué se hizo, quién y a qué hora REAL.
// Los sellos los pone el server (RPC cambiar_estado_ocurrencia) — no hay
// forma de marcar "lo hice a las 9" a las 20.
export default async function AuditoriaTareasPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("AuditoriaTareasPage", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) redirect("/tareas")

  const { data } = await supabase
    .from("tarea_ocurrencias")
    .select(`
      id, fecha, estado, iniciada_at, finalizada_at, notas,
      tarea:tarea_id ( codigo, id_publico, nombre, asignado:asignado_a ( nombre ) ),
      completador:completada_por ( nombre )
    `)
    .order("fecha", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(300)

  const rows = (data ?? []) as unknown as Row[]
  const ent = DOMINIO.tareas

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Operación · Auditoría
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Auditoría de tareas
          </h1>
          <p className="text-app-secondary mt-1">
            Qué se hizo, quién y a qué hora real. Los horarios los sella el sistema al
            momento de marcar — no se pueden inventar después.
          </p>
        </header>

        <div className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Fecha</TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead className="hidden md:table-cell">Responsable</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Inició</TableHead>
                <TableHead className="hidden md:table-cell">Terminó</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  Todavía no hay ejecuciones registradas. Se generan solas al abrir Tareas
                  cada día.
                </TableEmpty>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-app-secondary">
                      {formatFecha(r.fecha)}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px] text-app-accent mr-2">
                        {r.tarea?.codigo ?? r.tarea?.id_publico ?? ""}
                      </span>
                      <span className="text-sm font-medium">{r.tarea?.nombre ?? "—"}</span>
                      {r.notas && (
                        <p className="text-[10.5px] font-mono text-app-muted mt-0.5">{r.notas}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-app-secondary">
                      {r.completador?.nombre ?? r.tarea?.asignado?.nombre ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_TAREA_VARIANT[r.estado]}>
                        {ESTADO_TAREA_LABEL[r.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-app-secondary">
                      {r.iniciada_at ? formatFechaHora(r.iniciada_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-app-secondary">
                      {r.finalizada_at ? formatFechaHora(r.finalizada_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs font-mono text-app-muted">
          Últimas {rows.length} ejecuciones
        </p>
      </div>
    </div>
  )
}
