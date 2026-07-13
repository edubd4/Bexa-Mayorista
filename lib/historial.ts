import type { SupabaseClient } from "@supabase/supabase-js"
import type { TipoEvento } from "@/lib/constants"

type LogParams = {
  tipo: TipoEvento
  descripcion: string
  entidadTipo?: string           // 'cliente' | 'orden' | 'presupuesto' | ...
  entidadId?: string             // id_publico o uuid
  payload?: Record<string, unknown>
  userId?: string | null
}

// Inserta una fila en historial. Best-effort: si falla el log NO revierte la operacion
// principal. La tabla historial es append-only (bloqueada por RLS + trigger).
export async function logHistorial(
  supabase: SupabaseClient,
  { tipo, descripcion, entidadTipo, entidadId, payload, userId }: LogParams
): Promise<void> {
  const { error } = await supabase.from("historial").insert({
    tipo,
    descripcion,
    entidad_tipo: entidadTipo ?? null,
    entidad_id:   entidadId   ?? null,
    payload:      payload     ?? null,
    user_id:      userId      ?? null,
  })
  if (error) {
    // Log a consola del server para que quede en Vercel logs. NO throw.
    console.error("[historial] insert failed:", error.message, { tipo, entidadTipo, entidadId })
  }
}
