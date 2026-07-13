"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guards"
import { configuracionUpdateSchema, type ConfiguracionUpdate } from "@/lib/validators/configuracion"
import { logHistorial } from "@/lib/historial"
import { TIPO_EVENTO } from "@/lib/constants"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function updateConfiguracion(updates: ConfiguracionUpdate): Promise<ActionResult> {
  const parsed = configuracionUpdateSchema.safeParse(updates)
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  // Upsert por clave. Trae el valor previo para poder loguear el delta.
  const entries = Object.entries(parsed.data)
  if (entries.length === 0) return { ok: true }

  const { data: previos } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", entries.map(([k]) => k))

  const previosMap = new Map((previos ?? []).map((r) => [r.clave, r.valor as string | null]))

  const cambios: Array<{ clave: string; anterior: string | null; nuevo: string }> = []

  for (const [clave, valor] of entries) {
    const anterior = previosMap.get(clave) ?? null
    if (anterior === valor) continue

    const { error } = await supabase
      .from("configuracion")
      .upsert(
        { clave, valor, updated_by: user.id },
        { onConflict: "clave" }
      )
    if (error) {
      return { ok: false, error: `${clave}: ${error.message}` }
    }
    cambios.push({ clave, anterior, nuevo: valor })
  }

  if (cambios.length > 0) {
    await logHistorial(supabase, {
      tipo: TIPO_EVENTO.MODIFICACION,
      descripcion: `Configuración editada · ${cambios.map((c) => c.clave).join(", ")}`,
      entidadTipo: "configuracion",
      payload: { cambios },
      userId: user.id,
    })
  }

  revalidatePath("/configuracion")
  return { ok: true }
}
