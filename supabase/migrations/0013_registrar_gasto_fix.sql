-- ============================================================================
-- BEXA · Fix registrar_gasto (0013) — bug: chocaba contra el trigger append-only
-- Depende de: caja (0009).
--
-- Root cause: el paso 3 de registrar_gasto hacía
--   UPDATE movimientos_caja SET gasto_id = ... WHERE id = ...
-- pero movcaja_no_update (trigger append-only de la 0009) bloquea TODO update.
-- El RPC fallaba SIEMPRE con "movimientos_caja es inmutable: UPDATE no permitido".
--
-- Fix: pre-generar ambos UUIDs e insertar las dos filas ya cruzadas. Las FKs
-- gastos.movimiento_id y movimientos_caja.gasto_id son DEFERRABLE INITIALLY
-- DEFERRED (0009), así que Postgres valida recién al commit — no importa el
-- orden ni que la fila referenciada todavía no exista al momento del insert.
-- Cero UPDATEs → el trigger append-only queda intacto.
-- ============================================================================

create or replace function public.registrar_gasto(
  p_categoria_id  bigint,
  p_monto         numeric,
  p_descripcion   text,
  p_fecha         date default null,
  p_metodo        metodo_pago default 'EFECTIVO',
  p_notas         text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_actor_id      uuid;
  v_rol           text;
  v_categoria     record;
  v_mov_id        uuid := gen_random_uuid();
  v_gasto_id      uuid := gen_random_uuid();
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'No autenticado'; end if;

  v_rol := public.current_user_rol();
  if v_rol <> 'admin' then
    raise exception 'Solo un admin puede registrar gastos';
  end if;

  if p_monto is null or p_monto <= 0 then raise exception 'Monto debe ser > 0'; end if;
  if p_descripcion is null or length(trim(p_descripcion)) = 0 then
    raise exception 'Descripción requerida';
  end if;

  select * into v_categoria from public.categorias_gasto
    where id = p_categoria_id and activo = true;
  if not found then
    raise exception 'Categoría de gasto no encontrada o inactiva';
  end if;

  -- 1) Movimiento EGRESO con el link al gasto ya seteado (FK diferida)
  insert into public.movimientos_caja (
    id, tipo, origen, monto, metodo_pago, descripcion, fecha, gasto_id, created_by
  ) values (
    v_mov_id, 'EGRESO', 'GASTO', p_monto, p_metodo,
    v_categoria.nombre || ' · ' || p_descripcion,
    coalesce(p_fecha, current_date)::timestamptz, v_gasto_id, v_actor_id
  );

  -- 2) Gasto con el link inverso al movimiento
  insert into public.gastos (
    id, categoria_id, monto, descripcion, fecha, metodo_pago, notas, movimiento_id, created_by
  ) values (
    v_gasto_id, p_categoria_id, p_monto, p_descripcion, coalesce(p_fecha, current_date),
    p_metodo, p_notas, v_mov_id, v_actor_id
  );

  return v_gasto_id;
end;
$$;

alter function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text)
  security definer
  set search_path = public;

grant execute on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text) to authenticated;
