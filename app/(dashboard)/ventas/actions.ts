"use server"

import { revalidatePath } from "next/cache"
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
import {
  emitirFacturaSchema,
  normalizarCuit,
  tipoComprobantePara,
  type CondicionIva,
  type EmitirFacturaInput,
} from "@/lib/validators/facturacion"
import { TIPO_COMPROBANTE_LABEL, formatNumeroComprobante } from "@/lib/facturacion-ui"
import { emitirComprobanteAfip } from "@/lib/facturacion/afip"

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
// Devuelve el venta_id en lugar de redirigir: el form encadena la emisión de
// la factura ("emitir al registrar") antes de navegar a la ficha. Si la
// factura falla, la venta YA está registrada — stock/caja/comisión no dependen
// jamás de que ARCA responda.
export async function registrarVenta(input: VentaInput): Promise<ActionResult<{ venta_id: string }>> {
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
  // La venta movió stock: sin esto, /productos y el buscador de la nueva
  // venta muestran stock viejo hasta que caduque el router cache (review #5).
  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.ventas.ruta}/nuevo`)
  return { ok: true, data: { venta_id: ventaId as string } }
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

// ─── Emitir factura electrónica (AFIP/ARCA) ────────────────────────────────
// La emisión es un paso POSTERIOR al registro de la venta, a pedido: si ARCA
// está caído, la venta (stock, caja, comisión) no se frena. Regla A/B:
// RI/Monotributista → Factura A · Consumidor Final/Exento → Factura B.
export async function emitirFactura(input: EmitirFacturaInput): Promise<ActionResult> {
  const parsed = emitirFacturaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  // Venta + condición fiscal del cliente (RLS ya recorta a admin/dueño).
  const { data: venta } = await supabase
    .from("ventas")
    .select(`
      id, id_publico, estado_cobro, total,
      cliente:cliente_id ( id, documento, condicion_iva, razon_social, nombre, apellido, tipo )
    `)
    .eq("id", parsed.data.venta_id)
    .maybeSingle<{
      id: string
      id_publico: string
      estado_cobro: string
      total: number
      cliente: {
        id: string
        documento: string | null
        condicion_iva: CondicionIva
        razon_social: string | null
        nombre: string
        apellido: string | null
        tipo: string
      } | null
    }>()

  if (!venta) return { ok: false, error: "Venta no encontrada" }
  if (!venta.cliente) return { ok: false, error: "La venta no tiene cliente asociado" }
  if (venta.estado_cobro === "CANCELADA") {
    return { ok: false, error: "Una venta cancelada no se factura" }
  }
  if (Number(venta.total) <= 0) {
    return { ok: false, error: "La venta no tiene total facturable" }
  }

  const { data: existente } = await supabase
    .from("comprobantes")
    .select("id")
    .eq("venta_id", venta.id)
    .maybeSingle()
  if (existente) return { ok: false, error: "Esta venta ya tiene un comprobante emitido" }

  // Config fiscal (seeds 0031). afip_cuit vacío = módulo deshabilitado.
  const { data: config } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["afip_cuit", "afip_punto_venta", "afip_iva_pct"])
  const cfg = Object.fromEntries((config ?? []).map((c) => [c.clave, c.valor]))

  const cuitEmisor = normalizarCuit(cfg.afip_cuit)
  if (!cuitEmisor) {
    return { ok: false, error: "Facturación no configurada: falta el CUIT de la empresa en Configuración" }
  }
  const puntoVenta = Number(cfg.afip_punto_venta)
  if (!Number.isInteger(puntoVenta) || puntoVenta <= 0) {
    return { ok: false, error: "Punto de venta inválido en Configuración" }
  }
  const ivaPct = Number(cfg.afip_iva_pct)

  // Tipo de comprobante + documento del receptor según su condición de IVA.
  const condicion = venta.cliente.condicion_iva
  const tipo = tipoComprobantePara(condicion)
  const cuitReceptor = normalizarCuit(venta.cliente.documento)

  let docTipo: number
  let docNro: string
  if (tipo === "FACTURA_A") {
    // Factura A exige identificar al receptor por CUIT — sin excepción.
    if (!cuitReceptor) {
      return {
        ok: false,
        error: "Para Factura A el cliente necesita un CUIT válido — cargalo en su ficha",
      }
    }
    docTipo = 80
    docNro = cuitReceptor
  } else if (cuitReceptor) {
    docTipo = 80
    docNro = cuitReceptor
  } else {
    const dni = (venta.cliente.documento ?? "").replace(/\D/g, "")
    if (dni.length >= 7 && dni.length <= 8) {
      docTipo = 96
      docNro = dni
    } else {
      // Consumidor final sin identificar. Por encima del tope vigente de ARCA
      // el WS lo rechaza pidiendo DNI — ese mensaje se muestra tal cual.
      docTipo = 99
      docNro = "0"
    }
  }

  // Los precios del sistema son finales (IVA incluido) → discriminar hacia atrás.
  const total = Number(venta.total)
  const neto = Math.round((total / (1 + ivaPct / 100)) * 100) / 100
  const iva = Math.round((total - neto) * 100) / 100

  const emision = await emitirComprobanteAfip({
    cuitEmisor,
    puntoVenta,
    tipo,
    docTipo,
    docNro,
    condicionIvaReceptor: condicion,
    neto,
    iva,
    total,
    ivaPct,
  })
  if (!emision.ok) return { ok: false, error: emision.error }

  const numeroFmt = formatNumeroComprobante(puntoVenta, emision.numero)

  const { error: insertError } = await supabase.from("comprobantes").insert({
    venta_id: venta.id,
    tipo,
    punto_venta: puntoVenta,
    numero: emision.numero,
    cuit_emisor: cuitEmisor,
    doc_tipo: docTipo,
    doc_nro: docNro,
    condicion_iva_receptor: condicion,
    neto,
    iva,
    total,
    cae: emision.cae,
    cae_vencimiento: emision.caeVencimiento,
    created_by: user.id,
  })

  if (insertError) {
    // El CAE YA fue otorgado por ARCA — perder el registro local sería grave.
    // Queda en historial para reconciliar a mano y se avisa con el dato entero.
    await logHistorial(supabase, {
      tipo: TIPO_EVENTO.ALERTA,
      descripcion: `⚠ CAE ${emision.cae} otorgado para venta ${venta.id_publico} (${TIPO_COMPROBANTE_LABEL[tipo]} ${numeroFmt}) pero falló el guardado: ${insertError.message}`,
      entidadTipo: "venta",
      entidadId: venta.id_publico,
      payload: { cae: emision.cae, numero: emision.numero, punto_venta: puntoVenta, tipo },
      userId: user.id,
    })
    return {
      ok: false,
      error: `ARCA autorizó ${TIPO_COMPROBANTE_LABEL[tipo]} ${numeroFmt} (CAE ${emision.cae}) pero no se pudo guardar localmente. Quedó asentado en el historial — avisale al admin antes de reintentar.`,
    }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `${TIPO_COMPROBANTE_LABEL[tipo]} ${numeroFmt} emitida para venta ${venta.id_publico} · CAE ${emision.cae}`,
    entidadTipo: "venta",
    entidadId: venta.id_publico,
    payload: { tipo, numero: emision.numero, cae: emision.cae, condicion_iva: condicion },
    userId: user.id,
  })

  revalidatePath(`${DOMINIO.ventas.ruta}/${venta.id}`)
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
  // La cancelación repone stock: mismas rutas stale que registrarVenta (review #5).
  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.ventas.ruta}/nuevo`)
  // Y si la venta tenía cobros, la 0037 devuelve la plata a la caja.
  revalidatePath(DOMINIO.caja.ruta)
  return { ok: true }
}
