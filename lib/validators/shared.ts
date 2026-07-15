import { z } from "zod"

// Zod 4 endureció .uuid(): valida los bits de versión/variante RFC 4122 y
// rechaza UUIDs "planos" como el seed Consumidor Final
// (00000000-0000-0000-0000-000000000001). Postgres acepta cualquier hex
// 8-4-4-4-12 — este helper matchea la semántica de la DB, no el RFC estricto.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function zUuid(message = "ID inválido") {
  return z.string().regex(UUID_RE, message)
}
