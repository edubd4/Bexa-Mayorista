"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import {
  cancelarCompraSchema,
  compraSchema,
  type CancelarCompraInput,
  type CompraInput,
} from "@/lib/validators/compra"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function recibirCompra(input: CompraInput): Promise<ActionResult> {
  const parsed = compraSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: compraId, error } = await supabase.rpc("recibir_compra", {
    p_proveedor_id:    parsed.data.proveedor_id,
    p_items:           parsed.data.items.map((i) => ({
      producto_id:    i.producto_id,
      cantidad:       i.cantidad,
      costo_unitario: i.costo_unitario,
    })),
    p_numero_factura:  parsed.data.numero_factura ?? null,
    p_notas:           parsed.data.notas ?? null,
    p_fecha:           null,
  })

  if (error || !compraId) {
    return { ok: false, error: error?.message ?? "No se pudo registrar la compra" }
  }

  const { data: c } = await supabase
    .from("compras")
    .select("id_publico, total")
    .eq("id", compraId as string)
    .single()

  if (c) {
    await logHistorial(supabase, {
      tipo: TIPO_EVENTO.ALTA,
      descripcion: `Compra ${c.id_publico} · ${parsed.data.items.length} ítem${parsed.data.items.length === 1 ? "" : "s"} · Total ${c.total}`,
      entidadTipo: "compra",
      entidadId: c.id_publico,
      payload: { items: parsed.data.items.length, total: c.total },
      userId: user.id,
    })
  }

  revalidatePath(DOMINIO.compras.ruta)
  redirect(`${DOMINIO.compras.ruta}/${compraId as string}`)
}

export async function cancelarCompra(input: CancelarCompraInput): Promise<ActionResult> {
  const parsed = cancelarCompraSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { error } = await supabase.rpc("cancelar_compra", {
    p_compra_id: parsed.data.compra_id,
    p_motivo:    parsed.data.motivo ?? null,
  })
  if (error) return { ok: false, error: error.message }

  const { data: c } = await supabase
    .from("compras")
    .select("id_publico")
    .eq("id", parsed.data.compra_id)
    .maybeSingle()

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.BAJA,
    descripcion: `Compra ${c?.id_publico ?? parsed.data.compra_id} cancelada${parsed.data.motivo ? ` · ${parsed.data.motivo}` : ""}`,
    entidadTipo: "compra",
    entidadId: c?.id_publico ?? parsed.data.compra_id,
    payload: { motivo: parsed.data.motivo ?? null },
    userId: user.id,
  })

  revalidatePath(DOMINIO.compras.ruta)
  revalidatePath(`${DOMINIO.compras.ruta}/${parsed.data.compra_id}`)
  return { ok: true }
}
