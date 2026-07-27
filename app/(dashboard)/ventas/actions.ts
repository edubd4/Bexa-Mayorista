"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  cambiarEstadoEntregaSchema,
  cancelarVentaSchema,
  resolverPrecioParamsSchema,
  ventaSchema,
  type CambiarEstadoEntregaInput,
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
    p_campana_id:      parsed.data.campana_id ?? null,
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

// ─── Cambiar estado de entrega (0021) ──────────────────────────────────────
// Va por RPC porque la policy de UPDATE de ventas es admin-only (y está bien:
// protege los campos contables). El RPC autoriza como cobrar_venta: admin
// siempre, vendedor solo sus ventas. CANCELADA nunca — eso es cancelarVenta.
export async function cambiarEstadoEntrega(input: CambiarEstadoEntregaInput): Promise<ActionResult> {
  const parsed = cambiarEstadoEntregaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { error } = await supabase.rpc("cambiar_estado_entrega", {
    p_venta_id: parsed.data.venta_id,
    p_estado:   parsed.data.estado,
  })
  if (error) return { ok: false, error: error.message }

  const { data: v } = await supabase
    .from("ventas")
    .select("id_publico")
    .eq("id", parsed.data.venta_id)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Venta ${v?.id_publico ?? parsed.data.venta_id} · entrega → ${parsed.data.estado.replace("_", " ").toLowerCase()}`,
    entidadTipo: "venta",
    entidadId: v?.id_publico ?? parsed.data.venta_id,
    payload: { estado_entrega: parsed.data.estado },
    userId: user.id,
  })

  revalidatePath(DOMINIO.ventas.ruta)
  revalidatePath(`${DOMINIO.ventas.ruta}/${parsed.data.venta_id}`)
  return { ok: true }
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
