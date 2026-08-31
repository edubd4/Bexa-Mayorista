"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import { createServerClient } from "@/lib/supabase/server"
import {
  cobrarVentaSchema,
  movimientoManualSchema,
  type CobrarVentaInput,
  type MovimientoManualInput,
} from "@/lib/validators/caja"

type ActionResult = { ok: false; error: string } | { ok: true }

// ─── Cobrar venta (invocable por admin o por el vendedor de la venta) ───────
// Recibe una LISTA de pagos (0043): uno solo va por cobrar_venta; dos o más
// (pago mixto) van por cobrar_venta_multi, que registra todos-o-ninguno. En
// ambos casos la RPC valida permiso y saldo y hace todo atómico.
export async function cobrarVenta(input: CobrarVentaInput): Promise<ActionResult> {
  const parsed = cobrarVentaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { venta_id, pagos, descripcion } = parsed.data
  const { error } = pagos.length === 1
    ? await supabase.rpc("cobrar_venta", {
        p_venta_id:    venta_id,
        p_monto:       pagos[0].monto,
        p_metodo:      pagos[0].metodo,
        p_descripcion: descripcion ?? null,
        p_fecha:       null,
      })
    : await supabase.rpc("cobrar_venta_multi", {
        p_venta_id:    venta_id,
        p_pagos:       pagos,
        p_descripcion: descripcion ?? null,
        p_fecha:       null,
      })
  if (error) return { ok: false, error: error.message }

  const { data: v } = await supabase
    .from("ventas")
    .select("id_publico, estado_cobro")
    .eq("id", venta_id)
    .maybeSingle()

  const detallePagos = pagos.map((p) => `${p.monto} ${p.metodo}`).join(" + ")
  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.COBRO,
    descripcion: `Cobro venta ${v?.id_publico ?? venta_id} · ${detallePagos}${v ? ` → ${v.estado_cobro}` : ""}`,
    entidadTipo: "venta",
    entidadId: v?.id_publico ?? venta_id,
    payload: { pagos },
    userId: user.id,
  })

  revalidatePath(`${DOMINIO.ventas.ruta}/${parsed.data.venta_id}`)
  revalidatePath(DOMINIO.ventas.ruta)
  revalidatePath(DOMINIO.caja.ruta)
  return { ok: true }
}

// ─── Movimiento manual (APERTURA / AJUSTE / OTRO) — admin only ─────────────
// Los movimientos con origen COBRO_VENTA / GASTO / PAGO_COMPRA se generan por
// sus RPCs propias — acá solo se registran los excepcionales.
export async function registrarMovimientoManual(input: MovimientoManualInput): Promise<ActionResult> {
  const parsed = movimientoManualSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: mov, error } = await supabase
    .from("movimientos_caja")
    .insert({
      tipo:        parsed.data.tipo,
      origen:      parsed.data.origen,
      monto:       parsed.data.monto,
      metodo_pago: parsed.data.metodo,
      descripcion: parsed.data.descripcion,
      created_by:  user.id,
    })
    .select("id_publico")
    .single()

  if (error || !mov) return { ok: false, error: error?.message ?? "No se pudo registrar" }

  await logHistorial(supabase, {
    tipo: parsed.data.tipo === "INGRESO" ? TIPO_EVENTO.COBRO : TIPO_EVENTO.GASTO,
    descripcion: `${parsed.data.origen} ${mov.id_publico} · ${parsed.data.tipo === "INGRESO" ? "+" : "-"}${parsed.data.monto} · ${parsed.data.descripcion}`,
    entidadTipo: "movimiento_caja",
    entidadId: mov.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.caja.ruta)
  return { ok: true }
}
