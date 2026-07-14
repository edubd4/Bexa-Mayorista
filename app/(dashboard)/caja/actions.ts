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
// La RPC valida el permiso y hace todo atómico.
export async function cobrarVenta(input: CobrarVentaInput): Promise<ActionResult> {
  const parsed = cobrarVentaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { error } = await supabase.rpc("cobrar_venta", {
    p_venta_id:    parsed.data.venta_id,
    p_monto:       parsed.data.monto,
    p_metodo:      parsed.data.metodo,
    p_descripcion: parsed.data.descripcion ?? null,
    p_fecha:       null,
  })
  if (error) return { ok: false, error: error.message }

  const { data: v } = await supabase
    .from("ventas")
    .select("id_publico, estado_cobro")
    .eq("id", parsed.data.venta_id)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.COBRO,
    descripcion: `Cobro venta ${v?.id_publico ?? parsed.data.venta_id} · ${parsed.data.monto} · ${parsed.data.metodo}${v ? ` → ${v.estado_cobro}` : ""}`,
    entidadTipo: "venta",
    entidadId: v?.id_publico ?? parsed.data.venta_id,
    payload: { monto: parsed.data.monto, metodo: parsed.data.metodo },
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
