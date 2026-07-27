-- ============================================================================
-- BEXA · 0019 · Fixes operativos
-- Hallazgo 4 de docs/AUDITORIA-FUNCIONAL.md + un default que quedó suelto.
--
-- EL PROBLEMA: fecha UTC en los gastos.
-- El fix F de la 0014 creó `hoy_local()` justamente porque `current_date` en
-- Supabase devuelve la fecha UTC, y una operación de las 21:30 en Argentina ya
-- es "mañana" en UTC. Pero `registrar_gasto` se aplicó ANTES (0013) y nunca se
-- actualizó.
--
-- Consecuencia concreta: todo gasto cargado después de las 21:00 hora argentina
-- queda con la fecha del día siguiente. El cierre de caja del día no cuadra y
-- el reporte mensual del contador se corre de mes cuando el gasto cae el último
-- día. Es de las cosas que hacen desconfiar del sistema entero.
-- ============================================================================

-- ─── A. El default de la columna ───────────────────────────────────────────
-- `gastos.fecha` nació con `default current_date` (0009). Hoy casi nunca se
-- dispara porque registrar_gasto pasa la fecha explícita — pero es una trampa
-- esperando al próximo insert que no la pase.
alter table public.gastos
  alter column fecha set default public.hoy_local();

-- ─── B. registrar_gasto con fecha local ────────────────────────────────────
-- Idéntica a la 0013 salvo los dos `current_date` → `public.hoy_local()`.
-- Se mantiene el fix de la 0013 (pre-generar los UUIDs e insertar las dos filas
-- ya cruzadas, sin ningún UPDATE, para no chocar contra el trigger append-only
-- de movimientos_caja).
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
  v_fecha         date;
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

  -- ACÁ está el fix: hoy_local(), no current_date. Un gasto cargado 21:30 en
  -- Argentina tiene que quedar con la fecha de HOY, no la de mañana en UTC.
  v_fecha := coalesce(p_fecha, public.hoy_local());

  -- 1) Movimiento EGRESO con el link al gasto ya seteado (FK diferida)
  insert into public.movimientos_caja (
    id, tipo, origen, monto, metodo_pago, descripcion, fecha, gasto_id, created_by
  ) values (
    v_mov_id, 'EGRESO', 'GASTO', p_monto, p_metodo,
    v_categoria.nombre || ' · ' || p_descripcion,
    v_fecha::timestamptz, v_gasto_id, v_actor_id
  );

  -- 2) Gasto con el link inverso al movimiento
  insert into public.gastos (
    id, categoria_id, monto, descripcion, fecha, metodo_pago, notas, movimiento_id, created_by
  ) values (
    v_gasto_id, p_categoria_id, p_monto, p_descripcion, v_fecha,
    p_metodo, p_notas, v_mov_id, v_actor_id
  );

  return v_gasto_id;
end;
$$;

alter function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text)
  security definer
  set search_path = public;

grant execute on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text) to authenticated;

comment on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text) is
  'Registra un gasto y su EGRESO de caja de forma atomica, sin UPDATEs (trigger append-only). Usa hoy_local() — nunca current_date, que en Supabase es UTC. Ver 0019.';
