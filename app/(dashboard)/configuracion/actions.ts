"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guards"
import { CONFIG_KEYS, configuracionUpdateSchema, type ConfiguracionUpdate } from "@/lib/validators/configuracion"
import { normalizarCuit } from "@/lib/validators/facturacion"
import { logHistorial } from "@/lib/historial"
import { TIPO_EVENTO } from "@/lib/constants"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function updateConfiguracion(updates: ConfiguracionUpdate): Promise<ActionResult> {
  const parsed = configuracionUpdateSchema.safeParse(updates)
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" }
  }

  // ── Validaciones fiscales (0031/0032) — atajarlas ACÁ, no en ARCA ──────────
  // Un CUIT mal guardado recién explota al emitir la primera factura, con un
  // error críptico del web service. Mejor que rebote al guardar, con nombre.
  const cuitRaw = parsed.data[CONFIG_KEYS.AFIP_CUIT]
  if (cuitRaw !== undefined && cuitRaw.trim() !== "") {
    const cuit = normalizarCuit(cuitRaw)
    if (!cuit) {
      return { ok: false, error: "El CUIT de la empresa no es válido (falla el dígito verificador). Revisalo." }
    }
    // Se guarda normalizado (11 dígitos): la emisión y la factura lo leen tal cual.
    parsed.data[CONFIG_KEYS.AFIP_CUIT] = cuit
  }
  const ivaPct = parsed.data[CONFIG_KEYS.AFIP_IVA_PCT]
  if (ivaPct !== undefined && ivaPct.trim() !== "" && !["10.5", "21", "27"].includes(ivaPct.trim())) {
    return { ok: false, error: "La alícuota de IVA debe ser 10.5, 21 o 27." }
  }
  const ptoVta = parsed.data[CONFIG_KEYS.AFIP_PUNTO_VENTA]
  if (ptoVta !== undefined && ptoVta.trim() !== "" && (!Number.isInteger(Number(ptoVta)) || Number(ptoVta) <= 0)) {
    return { ok: false, error: "El punto de venta debe ser un número entero positivo." }
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
