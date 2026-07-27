-- ============================================================================
-- BEXA · 0027 · FKs adicionales a profiles — arregla los embeds de nombres
--
-- EL BUG (reportado por el cliente 2026-07-27 en comentarios de tareas):
--   "Could not find a relationship between 'tarea_comentarios' and 'autor_id'"
--
-- LA CAUSA
-- PostgREST solo puede embeber (`autor:autor_id ( nombre )`) siguiendo una FK
-- hacia una tabla EXPUESTA. Las columnas de usuario referencian auth.users —
-- schema NO expuesto — así que el join no existe para PostgREST. La solución
-- es una FK ADICIONAL hacia public.profiles (cuyo id ES auth.users.id).
--
-- El patrón estaba pagado y documentado en la 0001 (historial.user_id,
-- "Gotcha pagado")… y las migraciones siguientes se lo olvidaron. Por eso:
--   - tarea_comentarios.autor_id        → el error del cliente (0026)
--   - tarea_comentario_lecturas.usuario_id → "visto por" vacío (0026)
--   - tarea_ocurrencias.completada_por  → "Quién" vacío en auditoría (0025)
--   - movimientos_stock.created_by      → sin nombre en la ficha (0005) *
--   - ventas.vendedor_id                → vendedor "—" en listados (0007) *
--   - comisiones.vendedor_id            → ídem en comisiones (0007) *
--   (* rotos EN SILENCIO desde su ola: el fetch falla, la UI muestra el
--      fallback y nadie ve un error. Este es el costo de tragarse errores.)
--
-- Cada FK espeja el ON DELETE de su FK original a auth.users: no cambia
-- ninguna semántica de borrado, solo habilita el join.
-- ============================================================================

alter table public.tarea_comentarios
  add constraint tarea_comentarios_autor_profiles_fkey
  foreign key (autor_id) references public.profiles(id);

alter table public.tarea_comentario_lecturas
  add constraint tarea_lecturas_usuario_profiles_fkey
  foreign key (usuario_id) references public.profiles(id)
  on delete cascade;

alter table public.tarea_ocurrencias
  add constraint tarea_ocurrencias_completada_profiles_fkey
  foreign key (completada_por) references public.profiles(id);

alter table public.movimientos_stock
  add constraint movimientos_stock_created_by_profiles_fkey
  foreign key (created_by) references public.profiles(id);

alter table public.ventas
  add constraint ventas_vendedor_profiles_fkey
  foreign key (vendedor_id) references public.profiles(id)
  on delete restrict;

alter table public.comisiones
  add constraint comisiones_vendedor_profiles_fkey
  foreign key (vendedor_id) references public.profiles(id)
  on delete restrict;

-- PostgREST recarga el schema cache solo tras DDL en Supabase; si un embed
-- siguiera fallando justo después de aplicar, es el cache: NOTIFY pgrst,
-- 'reload schema';  (ver GOTCHAS de Forja).
