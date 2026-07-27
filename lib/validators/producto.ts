import { z } from "zod"
import { zUuid } from "./shared"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)

// atributos jsonb — el form entrega texto "clave: valor" por línea; parseamos
// a objeto plano. Si el usuario escribe algo raro, ignoramos la línea (no rompemos).
const atributosPreprocess = (v: unknown): unknown => {
  if (v === undefined || v === null) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v
  if (typeof v !== "string") return {}
  const out: Record<string, string> = {}
  for (const raw of v.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key && val) out[key] = val
  }
  return out
}

// Números que llegan como "" o "1.234,56" (input HTML) → number.
const numeroPreprocess = (v: unknown): unknown => {
  if (v === "" || v === null || v === undefined) return undefined
  if (typeof v === "number") return v
  if (typeof v !== "string") return v
  const norm = v.replace(/\./g, "").replace(",", ".")
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

// ─── Precios por tramo de cantidad (0022) ──────────────────────────────────
// Precio ABSOLUTO por escalón. Viajan DENTRO del producto (pedido del cliente
// 2026-07-27: los precios se cargan en el mismo lugar que el producto): el
// form manda el array completo y el server reconcilia (upsert + borrar los
// que ya no están). Si un tramo aplica a la cantidad vendida, pisa lista y
// descuentos.
export const precioTramoItemSchema = z.object({
  cantidad_min: z.preprocess(numeroPreprocess, z.number().int().min(1, "La cantidad mínima de un tramo debe ser al menos 1")),
  precio:       z.preprocess(numeroPreprocess, z.number().positive("El precio de un tramo debe ser mayor a 0")),
})
export type PrecioTramoItem = z.infer<typeof precioTramoItemSchema>

export const productoSchema = z.object({
  nombre:        z.string().trim().min(1, "El nombre es obligatorio").max(200),
  sku:           z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  descripcion:   z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  categoria:     z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  marca:         z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  atributos:     z.preprocess(atributosPreprocess, z.record(z.string(), z.string()).default({})),
  proveedor_id:  z.preprocess(emptyToUndef, zUuid().optional()),
  costo:         z.preprocess(numeroPreprocess, z.number().nonnegative("El costo no puede ser negativo").default(0)),
  precio_base:   z.preprocess(numeroPreprocess, z.number().nonnegative("El precio no puede ser negativo").default(0)),
  comision_pct:  z.preprocess(numeroPreprocess, z.number().min(0).max(100, "La comisión va de 0 a 100").optional()),
  stock_minimo:  z.preprocess(numeroPreprocess, z.number().int().nonnegative().default(0)),
  // Solo lo manda el form del admin (la política de precios es suya). No es
  // columna de `productos`: las actions lo separan y reconcilian contra
  // productos_precios_tramo.
  precios_tramo: z.array(precioTramoItemSchema)
    .optional()
    .refine(
      (ts) => !ts || new Set(ts.map((t) => t.cantidad_min)).size === ts.length,
      "Hay dos tramos con la misma cantidad mínima",
    ),
})

export type ProductoInput = z.infer<typeof productoSchema>

// Serializar atributos de vuelta a texto para el textarea del form.
export function atributosATexto(a: Record<string, string> | null | undefined): string {
  if (!a) return ""
  return Object.entries(a)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
}

// ─── Movimiento de stock ────────────────────────────────────────────────────
export const TIPO_MOV_STOCK = {
  ENTRADA: "ENTRADA",
  SALIDA: "SALIDA",
  AJUSTE_POSITIVO: "AJUSTE_POSITIVO",
  AJUSTE_NEGATIVO: "AJUSTE_NEGATIVO",
} as const
export type TipoMovStock = typeof TIPO_MOV_STOCK[keyof typeof TIPO_MOV_STOCK]

export const movimientoStockSchema = z.object({
  producto_id: zUuid(),
  tipo: z.enum([
    TIPO_MOV_STOCK.ENTRADA,
    TIPO_MOV_STOCK.SALIDA,
    TIPO_MOV_STOCK.AJUSTE_POSITIVO,
    TIPO_MOV_STOCK.AJUSTE_NEGATIVO,
  ]),
  cantidad: z.preprocess(numeroPreprocess, z.number().int().positive("La cantidad debe ser mayor a 0")),
  motivo: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
})

export type MovimientoStockInput = z.infer<typeof movimientoStockSchema>

// Variante del vendedor (0020): sin SALIDA — la única salida de stock es una
// venta — y con motivo obligatorio. El RPC registrar_stock_vendedor valida lo
// mismo en SQL; esto existe para que el error llegue en castellano y antes.
export const movimientoStockVendedorSchema = z.object({
  producto_id: zUuid(),
  tipo: z.enum([
    TIPO_MOV_STOCK.ENTRADA,
    TIPO_MOV_STOCK.AJUSTE_POSITIVO,
    TIPO_MOV_STOCK.AJUSTE_NEGATIVO,
  ]),
  cantidad: z.preprocess(numeroPreprocess, z.number().int().positive("La cantidad debe ser mayor a 0")),
  motivo: z.string().trim().min(1, "El motivo es obligatorio").max(500),
})

export type MovimientoStockVendedorInput = z.infer<typeof movimientoStockVendedorSchema>

