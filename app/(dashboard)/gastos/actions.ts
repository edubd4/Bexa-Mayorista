"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  categoriaGastoSchema,
  gastoSchema,
  type CategoriaGastoInput,
  type GastoInput,
} from "@/lib/validators/caja"

type ActionResult = { ok: false; error: string } | { ok: true }

// ─── Registrar gasto (via RPC atómica que crea mov EGRESO + gasto) ─────────
export async function registrarGasto(input: GastoInput): Promise<ActionResult> {
  const parsed = gastoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: gastoId, error } = await supabase.rpc("registrar_gasto", {
    p_categoria_id: parsed.data.categoria_id,
    p_monto:        parsed.data.monto,
    p_descripcion:  parsed.data.descripcion,
    p_fecha:        parsed.data.fecha ?? null,
    p_metodo:       parsed.data.metodo,
    p_notas:        parsed.data.notas ?? null,
  })
  if (error || !gastoId) return { ok: false, error: error?.message ?? "No se pudo registrar el gasto" }

  const { data: g } = await supabase
    .from("gastos")
    .select("id_publico, monto")
    .eq("id", gastoId as string)
    .single()

  if (g) {
    await logHistorial(supabase, {
      tipo: TIPO_EVENTO.GASTO,
      descripcion: `Gasto ${g.id_publico} · ${g.monto} · ${parsed.data.descripcion}`,
      entidadTipo: "gasto",
      entidadId: g.id_publico,
      payload: { monto: g.monto, categoria_id: parsed.data.categoria_id },
      userId: user.id,
    })
  }

  revalidatePath(DOMINIO.gastos.ruta)
  revalidatePath(DOMINIO.caja.ruta)
  redirect(DOMINIO.gastos.ruta)
}

// ─── Categorías de gasto (CRUD para el admin) ──────────────────────────────
export async function createCategoriaGasto(input: CategoriaGastoInput): Promise<ActionResult> {
  const parsed = categoriaGastoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase
    .from("categorias_gasto")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/configuracion/categorias-gasto")
  return { ok: true }
}

export async function toggleCategoriaGastoActivo(id: number): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("categorias_gasto")
    .select("activo")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Categoría no encontrada" }

  const { error } = await supabase
    .from("categorias_gasto")
    .update({ activo: !current.activo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/configuracion/categorias-gasto")
  return { ok: true }
}
