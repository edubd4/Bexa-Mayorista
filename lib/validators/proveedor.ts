import { z } from "zod"

// Preprocess: convierte "" → undefined así los campos opcionales no rompen la
// validación (los <input> vacíos entregan "" no null).
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v)

export const proveedorSchema = z.object({
  nombre:           z.string().trim().min(1, "El nombre es obligatorio").max(200),
  cuit:             z.preprocess(emptyToUndef, z.string().trim().max(20).optional()),
  contacto_nombre:  z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  telefono:         z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  whatsapp:         z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  email:            z.preprocess(emptyToUndef, z.string().trim().email("Email inválido").optional()),
  direccion:        z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  ciudad:           z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  provincia:        z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  condiciones_pago: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  notas:            z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
})

export type ProveedorInput = z.infer<typeof proveedorSchema>
