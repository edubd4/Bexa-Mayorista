"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin, requireCargaProductos } from "@/lib/auth-guards"
import { TIPO_EVENTO } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { esAdmin } from "@/lib/permisos"
import { logHistorial } from "@/lib/historial"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  movimientoStockSchema,
  movimientoStockVendedorSchema,
  productoSchema,
  type MovimientoStockInput,
  type MovimientoStockVendedorInput,
  type PrecioTramoItem,
  type ProductoInput,
} from "@/lib/validators/producto"
import { signoDelta } from "@/lib/productos-ui"

type ActionResult = { ok: false; error: string } | { ok: true }

// Reconcilia productos_precios_tramo contra lo que mandó el form: upsert de
// los tramos presentes, DELETE de los que ya no están. Los tramos viajan
// DENTRO del producto (pedido del cliente 2026-07-27) — un solo lugar para
// cargar precio base y precios por cantidad.
async function reconciliarTramos(
  supabase: SupabaseClient,
  userId: string,
  productoId: string,
  tramos: PrecioTramoItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cantidades = tramos.map((t) => t.cantidad_min)

  if (tramos.length > 0) {
    const { error } = await supabase
      .from("productos_precios_tramo")
      .upsert(
        tramos.map((t) => ({
          producto_id: productoId,
          cantidad_min: t.cantidad_min,
          precio: t.precio,
          created_by: userId,
          updated_by: userId,
        })),
        { onConflict: "producto_id,cantidad_min" },
      )
    if (error) return { ok: false, error: error.message }
  }

  const deleteQuery = supabase
    .from("productos_precios_tramo")
    .delete()
    .eq("producto_id", productoId)
  const { error: delErr } = cantidades.length > 0
    ? await deleteQuery.not("cantidad_min", "in", `(${cantidades.join(",")})`)
    : await deleteQuery
  if (delErr) return { ok: false, error: delErr.message }

  return { ok: true }
}

// Alta de producto. La hacen el admin Y el vendedor (decisión del cliente,
// 0017), por dos caminos distintos:
//
//   admin    → INSERT directo. Puede definir comision_pct.
//   vendedor → RPC crear_producto_vendedor (SECURITY DEFINER, lista blanca de
//              parámetros). Puede tipear el costo del producto que trae, pero
//              NO define comisión y NO gana permiso de lectura sobre los costos
//              del catálogo. Ver la nota larga en la 0017.
export async function createProducto(input: ProductoInput): Promise<ActionResult> {
  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireCargaProductos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user, rol } = guard

  let creado: { id: string; id_publico: string; nombre: string }
  // precios_tramo no es columna de `productos`: se separa y se reconcilia
  // aparte. Desde la 0028 los carga también el vendedor, así que la
  // reconciliación quedó FUERA del if — antes vivía solo en la rama del admin
  // y los tramos que cargaba un vendedor se perdían sin decir nada.
  const { precios_tramo, ...productoData } = parsed.data

  if (esAdmin(rol)) {
    const { data, error } = await supabase
      .from("productos")
      .insert({ ...productoData, created_by: user.id, updated_by: user.id })
      .select("id, id_publico, nombre")
      .single()

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo crear el producto" }
    }
    creado = data
  } else {
    // `comision_pct` no viaja: no es parámetro del RPC. Si el form de un
    // vendedor lo mandara igual, se ignora acá y la función lo escribe null.
    const { data, error } = await supabase.rpc("crear_producto_vendedor", {
      p_nombre:       parsed.data.nombre,
      p_sku:          parsed.data.sku ?? null,
      p_descripcion:  parsed.data.descripcion ?? null,
      p_categoria:    parsed.data.categoria ?? null,
      p_marca:        parsed.data.marca ?? null,
      p_atributos:    parsed.data.atributos ?? {},
      p_proveedor_id: parsed.data.proveedor_id ?? null,
      p_costo:        parsed.data.costo ?? 0,
      p_precio_base:  parsed.data.precio_base ?? 0,
      p_stock_minimo: parsed.data.stock_minimo ?? 0,
    })

    const fila = (Array.isArray(data) ? data[0] : data) as
      | { producto_id: string; producto_id_publico: string }
      | undefined

    if (error || !fila) {
      return { ok: false, error: error?.message ?? "No se pudo crear el producto" }
    }
    creado = {
      id: fila.producto_id,
      id_publico: fila.producto_id_publico,
      nombre: parsed.data.nombre,
    }
  }

  if (precios_tramo && precios_tramo.length > 0) {
    const res = await reconciliarTramos(supabase, user.id, creado.id, precios_tramo)
    if (!res.ok) {
      return { ok: false, error: `Producto creado, pero los precios por cantidad fallaron: ${res.error}` }
    }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.ALTA,
    descripcion: `Producto ${creado.id_publico} · ${creado.nombre}`,
    entidadTipo: "producto",
    entidadId: creado.id_publico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  redirect(`${DOMINIO.productos.ruta}/${creado.id}`)
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

// Edición. La hacen el admin Y el vendedor (decisión del cliente 2026-07-29),
// por los dos mismos caminos que el alta:
//
//   admin    → UPDATE directo. Toca comisión y costo como siempre.
//   vendedor → RPC actualizar_producto_vendedor (SECURITY DEFINER, lista
//              blanca). No manda comisión NI costo: el costo no puede leerlo,
//              así que tampoco puede reescribirlo — el RPC lo deja como estaba.
export async function updateProducto(id: string, input: ProductoInput): Promise<ActionResult> {
  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireCargaProductos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user, rol } = guard

  const { precios_tramo, ...productoData } = parsed.data
  let idPublico: string

  if (esAdmin(rol)) {
    const { data, error } = await supabase
      .from("productos")
      .update({ ...productoData, updated_by: user.id })
      .eq("id", id)
      .select("id_publico")
      .single()

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo actualizar el producto" }
    }
    idPublico = data.id_publico
  } else {
    // `p_costo` NO viaja: el form del vendedor no muestra el campo (no puede
    // leer el valor actual) y el RPC interpreta null como "dejá el que estaba".
    // Si mandáramos el 0 que trae el schema por default, cada edición del
    // vendedor le borraría al admin el costo del producto en silencio.
    const { data, error } = await supabase.rpc("actualizar_producto_vendedor", {
      p_producto_id:  id,
      p_nombre:       parsed.data.nombre,
      p_sku:          parsed.data.sku ?? null,
      p_descripcion:  parsed.data.descripcion ?? null,
      p_categoria:    parsed.data.categoria ?? null,
      p_marca:        parsed.data.marca ?? null,
      p_atributos:    parsed.data.atributos ?? {},
      p_proveedor_id: parsed.data.proveedor_id ?? null,
      p_precio_base:  parsed.data.precio_base ?? 0,
      p_stock_minimo: parsed.data.stock_minimo ?? 0,
    })

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo actualizar el producto" }
    }
    idPublico = data as string
  }

  // El form siempre manda el array (vacío = sin tramos): la reconciliación
  // borra los que sacó. `undefined` = el editor no se renderizó, no tocar.
  // Desde la 0028 la policy de escritura de tramos incluye al vendedor.
  if (precios_tramo !== undefined) {
    const res = await reconciliarTramos(supabase, user.id, id, precios_tramo)
    if (!res.ok) {
      return { ok: false, error: `Producto guardado, pero los precios por cantidad fallaron: ${res.error}` }
    }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MODIFICACION,
    descripcion: `Producto ${idPublico} editado`,
    entidadTipo: "producto",
    entidadId: idPublico,
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${id}`)
  return { ok: true }
}

// Baja lógica / reactivación. Va por RPC también para el admin: unifica el
// camino y evita que el vendedor choque contra productos_select_admin, que le
// tapa la fila antes de poder actualizarla.
export async function toggleProductoActivo(id: string): Promise<ActionResult> {
  const guard = await requireCargaProductos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user, rol } = guard

  // El vendedor lee por la vista sin costos; el admin, por la tabla.
  const { data: current } = await supabase
    .from(esAdmin(rol) ? "productos" : "productos_catalogo")
    .select("activo, id_publico")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Producto no encontrado" }

  const nuevo = !current.activo

  const { error } = await supabase.rpc("set_producto_activo", {
    p_producto_id: id,
    p_activo: nuevo,
  })
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

// Eliminar (0028). El RPC decide y devuelve QUÉ hizo: borra de verdad solo si
// el producto nunca se usó; si tiene ventas, compras, movimientos de stock,
// listas o campañas, lo desactiva. La UI muestra cuál de las dos cosas pasó —
// decir "listo" a secas cuando en realidad se desactivó es mentirle al usuario.
type EliminarResult =
  | { ok: false; error: string }
  | { ok: true; resultado: "BORRADO" | "DESACTIVADO" }

export async function eliminarProducto(id: string): Promise<EliminarResult> {
  const guard = await requireCargaProductos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user, rol } = guard

  // El id_publico se lee ANTES: si el RPC borra la fila, después no hay de
  // dónde sacarlo y el historial quedaría con un UUID que no le dice nada a nadie.
  const { data: current } = await supabase
    .from(esAdmin(rol) ? "productos" : "productos_catalogo")
    .select("id_publico, nombre")
    .eq("id", id)
    .maybeSingle()
  if (!current) return { ok: false, error: "Producto no encontrado" }

  const { data, error } = await supabase.rpc("eliminar_producto", { p_producto_id: id })
  if (error) return { ok: false, error: error.message }

  const resultado = (data as string) === "BORRADO" ? "BORRADO" : "DESACTIVADO"

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.BAJA,
    descripcion:
      resultado === "BORRADO"
        ? `Producto ${current.id_publico} · ${current.nombre} eliminado definitivamente (nunca se usó)`
        : `Producto ${current.id_publico} · ${current.nombre} dado de baja (tiene movimientos — se conserva)`,
    entidadTipo: "producto",
    entidadId: current.id_publico,
    payload: { resultado, nombre: current.nombre },
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${id}`)
  return { ok: true, resultado }
}

// ─── Movimientos de stock ──────────────────────────────────────────────────
// SOLO ADMIN. El comentario anterior decía "cualquier usuario autenticado puede
// registrar (la RLS del schema lo permite)" y quedó viejo: el fix E de la 0014
// cambió la policy a `movstock_insert_admin` porque un vendedor podía insertar
// AJUSTEs arbitrarios llamando a supabase-js directo. Sin este guard, el
// vendedor recibía un error crudo de Postgres en vez de un mensaje.
// Los callers no-admin legítimos son registrar_venta y registrar_stock_vendedor
// (0020), ambos SECURITY DEFINER — no pasan por acá.
// El trigger valida stock suficiente y actualiza productos.stock_actual de
// forma atómica.
export async function registrarMovimientoStock(input: MovimientoStockInput): Promise<ActionResult> {
  const parsed = movimientoStockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

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

// Variante del vendedor (0020). Va por el RPC registrar_stock_vendedor
// (SECURITY DEFINER) porque la policy de INSERT sigue siendo admin-only: el
// RPC valida rol, que el producto sea SUYO (created_by), tipo sin SALIDA y
// motivo obligatorio. La mercadería llega en partes — puede cargar ENTRADAs
// cuando sea — y corrige errores propios con AJUSTE. Decisión del cliente
// 2026-07-27; el detalle del control interno está en la 0020.
export async function registrarMovimientoStockVendedor(
  input: MovimientoStockVendedorInput,
): Promise<ActionResult> {
  const parsed = movimientoStockVendedorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const guard = await requireCargaProductos()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const { data: producto } = await supabase
    .from("productos_catalogo")
    .select("id, id_publico, nombre")
    .eq("id", parsed.data.producto_id)
    .maybeSingle()
  if (!producto) return { ok: false, error: "Producto no encontrado" }

  const { error: rpcErr } = await supabase.rpc("registrar_stock_vendedor", {
    p_producto_id: parsed.data.producto_id,
    p_tipo: parsed.data.tipo,
    p_cantidad: parsed.data.cantidad,
    p_motivo: parsed.data.motivo,
  })
  if (rpcErr) {
    return { ok: false, error: rpcErr.message }
  }

  await logHistorial(supabase, {
    tipo: TIPO_EVENTO.MOVIMIENTO,
    descripcion: `Stock ${producto.id_publico} · ${signoDelta(parsed.data.tipo)}${parsed.data.cantidad} (${parsed.data.tipo.replace("_", " ").toLowerCase()})`,
    entidadTipo: "producto",
    entidadId: producto.id_publico,
    payload: { tipo: parsed.data.tipo, cantidad: parsed.data.cantidad, motivo: parsed.data.motivo },
    userId: user.id,
  })

  revalidatePath(DOMINIO.productos.ruta)
  revalidatePath(`${DOMINIO.productos.ruta}/${parsed.data.producto_id}`)
  return { ok: true }
}
