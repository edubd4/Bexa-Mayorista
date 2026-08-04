import { z } from "zod"
import { zUuid } from "./shared"
import { CONDICION_IVA } from "./facturacion"

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)

export const TIPO_CLIENTE = {
  MAYORISTA: "MAYORISTA",
  MINORISTA: "MINORISTA",
} as const
export type TipoCliente = typeof TIPO_CLIENTE[keyof typeof TIPO_CLIENTE]

// Handle de instagram: guardamos SIN @; el usuario lo puede tipear con o sin él.
const instagramSanitize = (v: unknown) => {
  if (typeof v !== "string") return v
  const t = v.trim().replace(/^@+/, "")
  return t === "" ? undefined : t
}

export const clienteSchema = z.object({
  tipo:            z.enum([TIPO_CLIENTE.MAYORISTA, TIPO_CLIENTE.MINORISTA]),
  nombre:          z.string().trim().min(1, "El nombre es obligatorio").max(200),
  apellido:        z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  razon_social:    z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  documento:       z.preprocess(emptyToUndef, z.string().trim().max(20).optional()),
  // Condición frente al IVA (0031) — define si recibe Factura A o B.
  condicion_iva:   z.enum([
    CONDICION_IVA.RESPONSABLE_INSCRIPTO,
    CONDICION_IVA.MONOTRIBUTISTA,
    CONDICION_IVA.CONSUMIDOR_FINAL,
    CONDICION_IVA.EXENTO,
  ]).default(CONDICION_IVA.CONSUMIDOR_FINAL),
  telefono:        z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  whatsapp:        z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  instagram:       z.preprocess(instagramSanitize, z.string().trim().max(60).optional()),
  email:           z.preprocess(emptyToUndef, z.string().trim().email("Email inválido").optional()),
  direccion:       z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  ciudad:          z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  provincia:       z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  lista_precio_id: z.preprocess(emptyToUndef, zUuid().optional()),
  notas:           z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
})
  .refine(
    (d) => d.tipo !== TIPO_CLIENTE.MAYORISTA || Boolean(d.razon_social) || Boolean(d.nombre),
    { message: "En cliente MAYORISTA se recomienda cargar razón social", path: ["razon_social"] },
  )

export type ClienteInput = z.infer<typeof clienteSchema>

// UUID del cliente especial "Consumidor Final" (seed en 0004_clientes.sql).
// La UI de ventas lo asume presente; NO se debe borrar ni desactivar.
export const CONSUMIDOR_FINAL_ID = "00000000-0000-0000-0000-000000000001"

// Helper de presentación — usado en listas y búsquedas.
export function nombreVisible(c: {
  tipo: TipoCliente | string
  nombre: string
  apellido: string | null
  razon_social: string | null
}): string {
  if (c.tipo === TIPO_CLIENTE.MAYORISTA) {
    return c.razon_social ?? c.nombre
  }
  return [c.nombre, c.apellido].filter(Boolean).join(" ")
}
