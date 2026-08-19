"use server"

import { createServerClient } from "@/lib/supabase/server"
import { z } from "zod"

type ActionResult<T = undefined> =
  | { ok: false; error: string }
  | { ok: true; data: T }

// Producto como lo necesita el mostrador. Sale de productos_catalogo (la vista
// SIN costo, regla de permisos §6) — el vendedor de caja jamás ve márgenes.
export type ProductoPos = {
  id: string
  id_publico: string
  sku: string | null
  nombre: string
  stock_actual: number
  // false = sin control de stock (0034): el mostrador no muestra stock ni
  // advierte excedido — la venta no valida ni descuenta.
  controla_stock: boolean
}

const COLS = "id, id_publico, sku, nombre, stock_actual, controla_stock"

const codigoSchema = z.string().trim().min(1).max(60)

// ─── Buscar por código de barras (SKU exacto) ───────────────────────────────
// El escáner tipea el código + Enter. `sku` es unique + índice parcial (0005):
// un eq resuelve en O(log n) sin depender de listas precargadas en el client.
export async function buscarProductoPorCodigo(codigo: string): Promise<ActionResult<ProductoPos>> {
  const parsed = codigoSchema.safeParse(codigo)
  if (!parsed.success) return { ok: false, error: "Código inválido" }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { data, error } = await supabase
    .from("productos_catalogo")
    .select(COLS)
    .eq("sku", parsed.data)
    .eq("activo", true)
    .maybeSingle<ProductoPos>()

  if (error) return { ok: false, error: error.message }
  if (!data) {
    return {
      ok: false,
      error: `Código "${parsed.data}" no encontrado — asocialo en la ficha del producto (campo SKU) o buscalo por nombre`,
    }
  }
  return { ok: true, data }
}

// ─── Fallback: buscar por nombre (productos sin código o código ilegible) ───
export async function buscarProductosPorNombre(q: string): Promise<ActionResult<ProductoPos[]>> {
  // Comas y paréntesis rompen la sintaxis del filtro .or() de PostgREST —
  // se neutralizan antes de interpolar (el término viene de un input libre).
  const term = q.trim().replace(/[,()]/g, " ").trim()
  if (term.length < 2) return { ok: true, data: [] }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { data, error } = await supabase
    .from("productos_catalogo")
    .select(COLS)
    .eq("activo", true)
    .or(`nombre.ilike.%${term}%,id_publico.ilike.%${term}%`)
    .order("nombre")
    .limit(8)

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as ProductoPos[] }
}
