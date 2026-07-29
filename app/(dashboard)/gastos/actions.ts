"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin, requireRegistroGastos } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  anularGastoSchema,
  categoriaGastoSchema,
  gastoSchema,
  type AnularGastoInput,
  type CategoriaGastoInput,
  type GastoInput,
} from "@/lib/validators/caja"

type ActionResult = { ok: false; error: string } | { ok: true }

// ─── Registrar gasto (via RPC atómica que crea mov EGRESO + gasto) ─────────
// El guard deja pasar admin y marketing; las dos condiciones extra de marketing
// (categoría de publicidad + campaña obligatoria) las impone registrar_gasto en
// SQL, que es donde no se pueden saltear. Ver 0028.
async function registrarGastoInterno(
  input: GastoInput,
): Promise<{ ok: false; error: string } | { ok: true; gastoId: string }> {
  const parsed = gastoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireRegistroGastos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: gastoId, error } = await supabase.rpc("registrar_gasto", {
    p_categoria_id: parsed.data.categoria_id,
    p_monto:        parsed.data.monto,
    p_descripcion:  parsed.data.descripcion,
    p_fecha:        parsed.data.fecha ?? null,
    p_metodo:       parsed.data.metodo,
    p_notas:        parsed.data.notas ?? null,
    p_campana_id:   parsed.data.campana_id ?? null,
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
      payload: {
        monto: g.monto,
        categoria_id: parsed.data.categoria_id,
        campana_id: parsed.data.campana_id ?? null,
      },
      userId: user.id,
    })
  }

  revalidatePath(DOMINIO.gastos.ruta)
  revalidatePath(DOMINIO.caja.ruta)
  return { ok: true, gastoId: gastoId as string }
}

export async function registrarGasto(input: GastoInput): Promise<ActionResult> {
  const res = await registrarGastoInterno(input)
  if (!res.ok) return res

  if (input.campana_id) revalidatePath(`${DOMINIO.campanas.ruta}/${input.campana_id}`)
  redirect(DOMINIO.gastos.ruta)
}

// Variante para la ficha de la campaña: mismo RPC, pero NO redirige a /gastos.
// El que está cargando la pauta de Instagram quiere quedarse en la campaña
// viendo cómo se le mueve el ROI, no irse a la lista de gastos.
export async function registrarGastoDeCampana(
  campanaId: string,
  input: Omit<GastoInput, "campana_id">,
): Promise<ActionResult> {
  const res = await registrarGastoInterno({ ...input, campana_id: campanaId })
  if (!res.ok) return res

  revalidatePath(`${DOMINIO.campanas.ruta}/${campanaId}`)
  revalidatePath(DOMINIO.campanas.ruta)
  return { ok: true }
}

// ─── Anular gasto (0023) ───────────────────────────────────────────────────
// Un gasto no se edita ni se borra: se ANULA. El RPC devuelve la plata a la
// caja con un INGRESO AJUSTE espejo y marca anulado_* — la única mutación que
// el trigger de inmutabilidad deja pasar. Corregir = anular + cargar de nuevo.
export async function anularGasto(input: AnularGastoInput): Promise<ActionResult> {
  const parsed = anularGastoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase.rpc("anular_gasto", {
    p_gasto_id: parsed.data.gasto_id,
    p_motivo:   parsed.data.motivo,
  })
  if (error) return { ok: false, error: error.message }

  const { data: g } = await supabase
    .from("gastos")
    .select("id_publico, monto, campana_id")
    .eq("id", parsed.data.gasto_id)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.BAJA,
    descripcion: `Gasto ${g?.id_publico ?? parsed.data.gasto_id} anulado · ${parsed.data.motivo}`,
    entidadTipo: "gasto",
    entidadId: g?.id_publico ?? parsed.data.gasto_id,
    payload: { monto: g?.monto ?? null, motivo: parsed.data.motivo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.gastos.ruta)
  revalidatePath(DOMINIO.caja.ruta)
  // Anular un gasto de campaña le baja el costo y le mueve el ROI: la ficha
  // tiene que reflejarlo sin esperar a que caduque el cache.
  if (g?.campana_id) {
    revalidatePath(`${DOMINIO.campanas.ruta}/${g.campana_id}`)
    revalidatePath(DOMINIO.campanas.ruta)
  }
  return { ok: true }
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

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Categoría de gasto · ${parsed.data.nombre}`,
    entidadTipo: "categoria_gasto",
    entidadId: parsed.data.nombre,
    userId: user.id,
  })

  revalidatePath("/configuracion/categorias-gasto")
  return { ok: true }
}

// Renombrar/redescribir una categoría (hueco de CRUD detectado 2026-07-27:
// una categoría con typo quedaba así para siempre, solo se podía desactivar).
export async function updateCategoriaGasto(
  id: number,
  input: CategoriaGastoInput,
): Promise<ActionResult> {
  const parsed = categoriaGastoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("categorias_gasto")
    .select("nombre")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Categoría no encontrada" }

  const { error } = await supabase
    .from("categorias_gasto")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Categoría de gasto ${current.nombre} → ${parsed.data.nombre}`,
    entidadTipo: "categoria_gasto",
    entidadId: parsed.data.nombre,
    payload: { nombre_anterior: current.nombre },
    userId: user.id,
  })

  revalidatePath("/configuracion/categorias-gasto")
  return { ok: true }
}

export async function toggleCategoriaGastoActivo(id: number): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current } = await supabase
    .from("categorias_gasto")
    .select("activo, nombre")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Categoría no encontrada" }

  const nuevo = !current.activo
  const { error } = await supabase
    .from("categorias_gasto")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Categoría de gasto ${current.nombre} ${nuevo ? "reactivada" : "desactivada"}`,
    entidadTipo: "categoria_gasto",
    entidadId: current.nombre,
    payload: { activo_anterior: current.activo, activo_nuevo: nuevo },
    userId: user.id,
  })

  revalidatePath("/configuracion/categorias-gasto")
  return { ok: true }
}
