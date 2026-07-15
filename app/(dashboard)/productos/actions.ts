"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { logHistorial } from "@/lib/historial"
import { createServerClient } from "@/lib/supabase/server"
import {
  movimientoStockSchema,
  productoSchema,
  type MovimientoStockInput,
  type ProductoInput,
} from "@/lib/validators/producto"
import { signoDelta } from "@/lib/productos-ui"

type ActionResult = { ok: false; error: string } | { ok: true }

export async function createProducto(input: ProductoInput): Promise<ActionResult> {
  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("productos")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id, id_publico, nombre")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el producto" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Producto ${data.id_publico} · ${data.nombre}`,
    entidadTipo: "producto",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  redirect(`${DOMINIO.productos.ruta}/${data.id}`)
}

// ─── Quick-create desde el form de compras ──────────────────────────────────
// Producto con la info mínima viable (nombre + costo + proveedor/categoría
// opcionales). precio_base queda en 0 → la lista lo marca "incompleto" hasta
// que el admin lo complete. NO redirige — devuelve el producto para que el
// form de compra lo agregue en línea.
type QuickCreateResult =
  | { ok: false; error: string }
  | { ok: true; producto: { id: string; id_publico: string; nombre: string; costo: number; stock_actual: number } }

export async function quickCreateProducto(input: {
  nombre: string
  costo: number
  categoria?: string
  proveedor_id?: string
}): Promise<QuickCreateResult> {
  const nombre = (input.nombre ?? "").trim()
  if (nombre.length < 2) return { ok: false, error: "Nombre demasiado corto" }
  if (typeof input.costo !== "number" || !Number.isFinite(input.costo) || input.costo < 0) {
    return { ok: false, error: "Costo inválido" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("productos")
    .insert({
      nombre,
      costo: input.costo,
      precio_base: 0,           // señal de "incompleto" — falta precio de venta
      categoria: input.categoria?.trim() || null,
      proveedor_id: input.proveedor_id || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, id_publico, nombre, costo, stock_actual")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el producto" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Producto ${data.id_publico} · ${data.nombre} (carga rápida desde compra — completar precio)`,
    entidadTipo: "producto",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  return { ok: true, producto: { ...data, costo: Number(data.costo) } }
}

export async function updateProducto(id: string, input: ProductoInput): Promise<ActionResult> {
  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data, error } = await supabase
    .from("productos")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .select("id_publico")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo actualizar el producto" }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Producto ${data.id_publico} editado`,
    entidadTipo: "producto",
    entidadId: data.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${id}`)
  return { ok: true }
}

export async function toggleProductoActivo(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: current, error: readErr } = await supabase
    .from("productos")
    .select("activo, id_publico")
    .eq("id", id)
    .single()
  if (readErr || !current) return { ok: false, error: "Producto no encontrado" }

  const nuevo = !current.activo

  const { error } = await supabase
    .from("productos")
    .update({ activo: nuevo, updated_by: user.id })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logHistorial(supabase, {
    tipo: nuevo ? TIPO_EVENTO.MODIFICACION : TIPO_EVENTO.BAJA,
    descripcion: `Producto ${current.id_publico} ${nuevo ? "reactivado" : "desactivado"}`,
    entidadTipo: "producto",
    entidadId: current.id_publico,
    payload: { activo_anterior: current.activo, activo_nuevo: nuevo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${id}`)
  return { ok: true }
}

// ─── Movimientos de stock ──────────────────────────────────────────────────
// Cualquier usuario autenticado puede registrar (la RLS del schema lo permite —
// el módulo ventas de Ola B disparará SALIDA con auth.uid()). El trigger valida
// stock suficiente y actualiza productos.stock_actual atómicamente.
export async function registrarMovimientoStock(input: MovimientoStockInput): Promise<ActionResult> {
  const parsed = movimientoStockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { data: producto } = await supabase
    .from("productos_catalogo")
    .select("id, id_publico, nombre")
    .eq("id", parsed.data.producto_id)
    .maybeSingle()
  if (!producto) return { ok: false, error: "Producto no encontrado" }

  const { error: insErr } = await supabase
    .from("movimientos_stock")
    .insert({ ...parsed.data, created_by: user.id })
  if (insErr) {
    return { ok: false, error: insErr.message }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MOVIMIENTO,
    descripcion: `Stock ${producto.id_publico} · ${signoDelta(parsed.data.tipo)}${parsed.data.cantidad} (${parsed.data.tipo.replace("_", " ").toLowerCase()})`,
    entidadTipo: "producto",
    entidadId: producto.id_publico,
    payload: { tipo: parsed.data.tipo, cantidad: parsed.data.cantidad, motivo: parsed.data.motivo ?? null },
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${parsed.data.producto_id}`)
  return { ok: true }
}
