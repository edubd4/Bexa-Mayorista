"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  cancelarVentaSchema,
  resolverPrecioParamsSchema,
  ventaSchema,
  type CancelarVentaInput,
  type PrecioResuelto,
  type ResolverPrecioParams,
  type VentaInput,
} from "@/lib/validators/venta"

type ActionResult<T = undefined> =
  | { ok: false; error: string }
  | { ok: true; data?: T }

// ─── Resolver precio (usado por el form en vivo mientras el vendedor arma) ──
export async function resolverPrecio(
  params: ResolverPrecioParams,
): Promise<ActionResult<PrecioResuelto>> {
  const parsed = resolverPrecioParamsSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { data, error } = await supabase.rpc("resolver_precio", {
    p_cliente_id:  parsed.data.cliente_id,
    p_producto_id: parsed.data.producto_id,
    p_cantidad:    parsed.data.cantidad,
  })

  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { ok: false, error: "Sin precio devuelto" }

  return {
    ok: true,
    data: {
      precio_unitario: Number(row.precio_unitario),
      precio_final:    Number(row.precio_final),
      descuento_pct:   Number(row.descuento_pct),
      origen:          String(row.origen ?? "precio_base"),
    },
  }
}

// ─── Registrar venta (el corazón — vía RPC transaccional) ──────────────────
export async function registrarVenta(input: VentaInput): Promise<ActionResult> {
  const parsed = ventaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  // Postgres composite type recibe strings tipo (uuid,cantidad).
  const { data: ventaId, error } = await supabase.rpc("registrar_venta", {
    p_cliente_id:      parsed.data.cliente_id,
    p_items:           parsed.data.items.map((i) => ({
      producto_id: i.producto_id,
      cantidad:    i.cantidad,
    })),
    p_notas:           parsed.data.notas ?? null,
    p_estado_entrega:  parsed.data.estado_entrega,
  })

  if (error || !ventaId) {
    return { ok: false, error: error?.message ?? "No se pudo registrar la venta" }
  }

  // Traer id_publico para historial (la RPC devuelve solo el UUID).
  const { data: v } = await supabase
    .from("ventas")
    .select("id_publico, total")
    .eq("id", ventaId as string)
    .single()

  if (v) {
    await logHistorial(supabase, {
      tipo: TIPO_EVENTO.ALTA,
      descripcion: `Venta ${v.id_publico} · ${parsed.data.items.length} ítem${parsed.data.items.length === 1 ? "" : "s"} · Total ${v.total}`,
      entidadTipo: "venta",
      entidadId: v.id_publico,
      payload: { items: parsed.data.items.length, total: v.total, estado_entrega: parsed.data.estado_entrega },
      userId: user.id,
    })
  }

  revalidatePath(DOMINIO.ventas.ruta)
  redirect(`${DOMINIO.ventas.ruta}/${ventaId as string}`)
}

// ─── Cancelar venta (revierte stock via RPC) ───────────────────────────────
export async function cancelarVenta(input: CancelarVentaInput): Promise<ActionResult> {
  const parsed = cancelarVentaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { error } = await supabase.rpc("cancelar_venta", {
    p_venta_id: parsed.data.venta_id,
    p_motivo:   parsed.data.motivo ?? null,
  })
  if (error) return { ok: false, error: error.message }

  const { data: v } = await supabase
    .from("ventas")
    .select("id_publico")
    .eq("id", parsed.data.venta_id)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.BAJA,
    descripcion: `Venta ${v?.id_publico ?? parsed.data.venta_id} cancelada${parsed.data.motivo ? ` · ${parsed.data.motivo}` : ""}`,
    entidadTipo: "venta",
    entidadId: v?.id_publico ?? parsed.data.venta_id,
    payload: { motivo: parsed.data.motivo ?? null },
    userId: user.id,
  })

  revalidatePath(DOMINIO.ventas.ruta)
  revalidatePath(`${DOMINIO.ventas.ruta}/${parsed.data.venta_id}`)
  return { ok: true }
}
