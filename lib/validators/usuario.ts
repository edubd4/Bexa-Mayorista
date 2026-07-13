import { z } from "zod"

const trimmedOrNull = (val: unknown) => {
  if (typeof val !== "string") return val
  const t = val.trim()
  return t === "" ? null : t
}

// Alta de un usuario nuevo: admin invita a un colaborador o a otro admin.
// El password lo elige el admin y se lo comunica al usuario por canal externo
// (WhatsApp, presencial). El usuario cambia el password despues (fase 2).
export const usuarioCreateSchema = z.object({
  email: z.string().trim().email("Email inválido").max(200),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  rol: z.enum(["admin", "colaborador"]),
})
export type UsuarioCreateInput = z.infer<typeof usuarioCreateSchema>

// Edicion: no cambia email ni password (esos van en flujos aparte).
export const usuarioUpdateSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  rol: z.enum(["admin", "colaborador"]),
  activo: z.boolean(),
})
export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateSchema>

// Placeholder para futura funcion de reset de password por parte del admin.
export const passwordResetSchema = z.object({
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
})
export type PasswordResetInput = z.infer<typeof passwordResetSchema>

// El helper trimmedOrNull queda exportado por si otros validators lo necesitan.
export { trimmedOrNull }
