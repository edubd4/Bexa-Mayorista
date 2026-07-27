import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { DOMINIO } from "@/lib/dominio"
import { ahoraArgentina, toISODate } from "@/lib/fechas"
import type { EstadoTarea } from "@/lib/validators/tarea"

// Resumen semanal de tareas para el PANEL (movido desde /tareas por pedido
// del cliente: en el módulo era redundante — acá es gestión). Server
// component autocontenido: busca sus datos y la RLS decide el alcance — el
// admin ve al equipo entero, el empleado se ve a sí mismo. La generación de
// ocurrencias del día es idempotente (0025), así el resumen nunca miente por
// abrir el panel antes que Tareas.
type Ocurrencia = { tarea_id: string; fecha: string; estado: EstadoTarea }
type TareaMin = { id: string; asignado: { nombre: string } | null }

export async function ResumenSemanalTareas({ esAdmin }: { esAdmin: boolean }) {
  const supabase = await createServerClient()

  await supabase.rpc("generar_ocurrencias_tareas")

  const ahoraAR = ahoraArgentina()
  const hoy = toISODate(ahoraAR)
  const lunes = new Date(ahoraAR)
  lunes.setDate(ahoraAR.getDate() - ((ahoraAR.getDay() + 6) % 7))
  const inicioSemana = toISODate(lunes)

  const [{ data: ocs }, { data: tareas }] = await Promise.all([
    supabase
      .from("tarea_ocurrencias")
      .select("tarea_id, fecha, estado")
      .gte("fecha", inicioSemana)
      .lte("fecha", hoy),
    supabase
      .from("tareas")
      .select("id, asignado:asignado_a ( nombre )")
      .eq("activo", true),
  ])

  const semana = (ocs ?? []) as unknown as Ocurrencia[]
  const tareaPorId = new Map(
    ((tareas ?? []) as unknown as TareaMin[]).map((t) => [t.id, t]),
  )

  const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
  const porFecha = new Map<string, { total: number; hechas: number }>()
  const porResponsable = new Map<string, { total: number; hechas: number; atrasadas: number }>()
  for (const o of semana) {
    const dia = porFecha.get(o.fecha) ?? { total: 0, hechas: 0 }
    dia.total += 1
    if (o.estado === "FINALIZADA") dia.hechas += 1
    porFecha.set(o.fecha, dia)

    const t = tareaPorId.get(o.tarea_id)
    if (t && esAdmin) {
      const key = t.asignado?.nombre ?? "Sin asignar"
      const r = porResponsable.get(key) ?? { total: 0, hechas: 0, atrasadas: 0 }
      r.total += 1
      if (o.estado === "FINALIZADA") r.hechas += 1
      else if (o.fecha < hoy) r.atrasadas += 1
      porResponsable.set(key, r)
    }
  }

  const diasSemana: { fecha: string; label: string; futuro: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    const fecha = toISODate(d)
    diasSemana.push({ fecha, label: `${DIA_CORTO[d.getDay()]} ${d.getDate()}`, futuro: fecha > hoy })
  }
  const total = semana.length
  const hechas = semana.filter((o) => o.estado === "FINALIZADA").length
  const atrasadas = semana.filter((o) => o.estado !== "FINALIZADA" && o.fecha < hoy).length

  // Sin tareas en la semana (empleado sin asignaciones): no ocupar lugar.
  if (total === 0) return null

  return (
    <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold">
          {esAdmin ? "Tareas del equipo · semana" : "Tus tareas · semana"}
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-app-secondary">
            {hechas}/{total} finalizadas
            {atrasadas > 0 && <span className="text-app-red"> · {atrasadas} atrasadas</span>}
          </span>
          <Link
            href={DOMINIO.tareas.ruta}
            className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest hover:text-app-accent whitespace-nowrap"
          >
            Ver tareas →
          </Link>
        </div>
      </div>

      {/* Un cuadrito por día: cuánto se hizo de lo que tocaba. */}
      <div className="grid grid-cols-7 gap-2">
        {diasSemana.map((d) => {
          const stats = porFecha.get(d.fecha)
          const pct = stats && stats.total > 0 ? stats.hechas / stats.total : null
          const esHoy = d.fecha === hoy
          return (
            <div
              key={d.fecha}
              className={`rounded-lg border px-2 py-2 text-center ${
                esHoy ? "border-app-accent/50 bg-app-accent/5" : "border-app-line-soft"
              } ${d.futuro ? "opacity-40" : ""}`}
            >
              <p className="font-mono text-[10px] text-app-muted uppercase">{d.label}</p>
              <p className="font-display text-sm font-semibold mt-0.5">
                {d.futuro ? "—" : stats ? `${stats.hechas}/${stats.total}` : "—"}
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-app-surface-mid overflow-hidden">
                {pct !== null && !d.futuro && (
                  <div
                    className={`h-full rounded-full ${
                      pct === 1 ? "bg-app-green" : pct >= 0.5 ? "bg-app-accent" : "bg-app-amber"
                    }`}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cumplimiento por persona (admin): quién viene bien y quién no. */}
      {esAdmin && porResponsable.size > 0 && (
        <div className="space-y-2">
          {Array.from(porResponsable.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .map(([nombre, r]) => {
              const pct = r.total > 0 ? r.hechas / r.total : 0
              return (
                <div key={nombre} className="flex items-center gap-3">
                  <span className="w-36 truncate text-sm text-app-text shrink-0">{nombre}</span>
                  <div className="flex-1 h-2 rounded-full bg-app-surface-mid overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        pct === 1 ? "bg-app-green" : pct >= 0.5 ? "bg-app-accent" : "bg-app-amber"
                      }`}
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-app-secondary w-24 text-right shrink-0">
                    {r.hechas}/{r.total}
                    {r.atrasadas > 0 && <span className="text-app-red"> · {r.atrasadas} atr.</span>}
                  </span>
                </div>
              )
            })}
        </div>
      )}
    </section>
  )
}
