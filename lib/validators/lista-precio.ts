import { z } from "zod"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)

const numeroPreprocess = (v: unknown): unknown => {
  if (v === "" || v === null || v === undefined) return undefined
  if (typeof v === "number") return v
  if (typeof v !== "string") return v
  const norm = v.replace(/\./g, "").replace(",", ".")
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

export const listaPrecioSchema = z.object({
  nombre:       z.string().trim().min(1, "El nombre es obligatorio").max(120),
  proveedor_id: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  notas:        z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
})
export type ListaPrecioInput = z.infer<typeof listaPrecioSchema>

export const listaPrecioItemSchema = z.object({
  lista_precio_id: z.string().uuid(),
  producto_id:     z.string().uuid(),
  precio:          z.preprocess(numeroPreprocess, z.number().nonnegative("El precio no puede ser negativo")),
})
export type ListaPrecioItemInput = z.infer<typeof listaPrecioItemSchema>

export const SCOPE_DESCUENTO = {
  PRODUCTO:  "PRODUCTO",
  CATEGORIA: "CATEGORIA",
  GLOBAL:    "GLOBAL",
} as const
export type ScopeDescuento = typeof SCOPE_DESCUENTO[keyof typeof SCOPE_DESCUENTO]

export const reglaDescuentoSchema = z.object({
  lista_precio_id: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  scope: z.enum([
    SCOPE_DESCUENTO.PRODUCTO,
    SCOPE_DESCUENTO.CATEGORIA,
    SCOPE_DESCUENTO.GLOBAL,
  ]),
  producto_id:   z.preprocess(emptyToUndef, z.string().uuid().optional()),
  categoria:     z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  cantidad_min:  z.preprocess(numeroPreprocess, z.number().int().positive("La cantidad mínima debe ser > 0")),
  descuento_pct: z.preprocess(numeroPreprocess, z.number().min(0).max(100, "El descuento va de 0 a 100")),
}).refine(
  (d) => d.scope !== "PRODUCTO"  || Boolean(d.producto_id),
  { message: "Elegí el producto para una regla PRODUCTO", path: ["producto_id"] },
).refine(
  (d) => d.scope !== "CATEGORIA" || Boolean(d.categoria),
  { message: "Elegí la categoría para una regla CATEGORIA", path: ["categoria"] },
).refine(
  (d) => d.scope !== "GLOBAL"    || (!d.producto_id && !d.categoria),
  { message: "La regla GLOBAL no lleva producto ni categoría", path: ["scope"] },
)
export type ReglaDescuentoInput = z.infer<typeof reglaDescuentoSchema>
