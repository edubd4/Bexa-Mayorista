-- ============================================================================
-- 0035 · Gastos fijos (recordatorio + un click)
--
-- Pedido del cliente (2026-08-19): marcar gastos como fijos (alquiler, luz,
-- sueldos), con día de pago o período, y verlos pendientes/pagados. Decisión
-- de diseño (Edu): el fijo es un RECORDATORIO con registro en un click — NO
-- se registra solo. La plata solo se mueve cuando un humano aprieta
-- "Registrar" (mismo circuito registrar_gasto de siempre, atómico con caja).
--
-- Modelo:
--   - `gastos_fijos`: la plantilla (nombre, categoría, monto estimado, método,
--     periodicidad + día). Admin-only, como todo el módulo de gastos.
--   - `gastos.gasto_fijo_id`: qué fijo originó cada gasto real. Con eso,
--     "¿ya lo pagué este período?" es una consulta, no un estado que se
--     desincroniza.
--   - `v_gastos_fijos_estado`: fijo + último pago + pagado_periodo, calculado
--     con hoy_local() (la lección de la 0019: current_date es UTC).
--
-- ⚠ REGLA DE LA 0024: tras cada create or replace function va su
-- `alter function ... security definer set search_path` como statement aparte.
-- ============================================================================

-- ─── 1 · Enum de periodicidad ────────────────────────────────────────────────
create type periodicidad_gasto_fijo as enum ('SEMANAL', 'MENSUAL', 'ANUAL');

-- ─── 2 · Tabla gastos_fijos ─────────────────────────────────────────────────
create table public.gastos_fijos (
  id              bigserial primary key,
  nombre          text not null,
  categoria_id    bigint not null references public.categorias_gasto(id),
  monto_estimado  numeric(14,2) not null check (monto_estimado > 0),
  metodo_pago     metodo_pago not null default 'EFECTIVO',
  periodicidad    periodicidad_gasto_fijo not null default 'MENSUAL',
  -- Día de pago: 1-31 para MENSUAL/ANUAL (día del mes), 1-7 para SEMANAL
  -- (1 = lunes). Es informativo — ordena la lista y arma el recordatorio;
  -- no dispara nada solo.
  dia_pago        integer check (dia_pago between 1 and 31),
  -- Solo ANUAL: en qué mes cae (1-12).
  mes_pago        integer check (mes_pago between 1 and 12),
  notas           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id)
);

create trigger gastos_fijos_touch_updated_at
  before update on public.gastos_fijos
  for each row execute function public.touch_updated_at();

-- RLS: admin-only, como gastos (regla de oro #4: RLS ON + policies + GRANTs
-- + revoke anon en toda tabla nueva).
alter table public.gastos_fijos enable row level security;

create policy "gastos_fijos_select_admin"
  on public.gastos_fijos for select
  using (public.current_user_rol() = 'admin');

create policy "gastos_fijos_write_admin"
  on public.gastos_fijos for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

grant select, insert, update on public.gastos_fijos to authenticated;
grant usage on sequence public.gastos_fijos_id_seq to authenticated;
revoke all on public.gastos_fijos from anon;

-- ─── 3 · Link del gasto real a su fijo ──────────────────────────────────────
alter table public.gastos
  add column gasto_fijo_id bigint references public.gastos_fijos(id) on delete set null;

create index idx_gastos_gasto_fijo on public.gastos(gasto_fijo_id) where gasto_fijo_id is not null;

comment on column public.gastos.gasto_fijo_id is
  'Gasto fijo (0035) que originó este gasto. "Pagado este período" = existe gasto no anulado del fijo con fecha dentro del período.';

-- ─── 4 · registrar_gasto — cuerpo vigente de 0028 + p_gasto_fijo_id ─────────
-- DROP + CREATE, no `create or replace`: agregar un parámetro con default crea
-- una SOBRECARGA nueva en vez de reemplazar la función (lección de la 0028).
drop function if exists public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid);

create or replace function public.registrar_gasto(
  p_categoria_id   bigint,
  p_monto          numeric,
  p_descripcion    text,
  p_fecha          date default null,
  p_metodo         metodo_pago default 'EFECTIVO',
  p_notas          text default null,
  p_campana_id     uuid default null,
  p_gasto_fijo_id  bigint default null                               -- ← 0035
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_actor_id      uuid;
  v_rol           text;
  v_categoria     record;
  v_campana       record;
  v_mov_id        uuid := gen_random_uuid();
  v_gasto_id      uuid := gen_random_uuid();
  v_fecha         date;
  v_descripcion   text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'No autenticado'; end if;

  v_rol := public.current_user_rol();

  -- Quién puede registrar qué (0028):
  --   admin     → cualquier gasto, con o sin campaña. Como siempre.
  --   marketing → SOLO categoría de publicidad Y SOLO imputado a una campaña.
  --               Es el dueño de las campañas (0017) y necesita cargar lo que
  --               gasta; la caja del resto del negocio no es asunto suyo.
  --   el resto  → nada.
  --
  -- El portazo va PRIMERO, antes de mirar la categoría: si no, un vendedor que
  -- llama al RPC a mano recibe 'Categoría no encontrada' o el nombre de la
  -- categoría en el mensaje de error, y eso ya le confirma qué ids existen.
  -- Que el que no tiene permiso no aprenda NADA del intento.
  if v_rol is null or v_rol not in ('admin', 'marketing') then
    raise exception 'No tenés permiso para registrar gastos';
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

  if v_rol = 'marketing' then
    if p_campana_id is null then
      raise exception 'Marketing solo puede registrar gastos imputados a una campaña';
    end if;
    if not v_categoria.es_publicidad then
      raise exception 'La categoría % no es de publicidad. Marketing solo carga gastos de publicidad.', v_categoria.nombre;
    end if;
  end if;

  -- La campaña tiene que existir. Sin este check, un campana_id inventado
  -- pasaría el FK solo si coincide con alguna fila; si no, el error crudo de
  -- Postgres no le dice nada a nadie.
  if p_campana_id is not null then
    select id, id_publico, nombre into v_campana
      from public.campanas where id = p_campana_id;
    if not found then
      raise exception 'Campaña no encontrada';
    end if;
  end if;

  -- ← 0035: el fijo tiene que existir y estar activo. Los fijos son plantillas
  -- del negocio (admin-only); marketing no los usa.
  if p_gasto_fijo_id is not null then
    if v_rol <> 'admin' then
      raise exception 'Solo el admin registra pagos de gastos fijos';
    end if;
    perform 1 from public.gastos_fijos where id = p_gasto_fijo_id and activo = true;
    if not found then
      raise exception 'Gasto fijo no encontrado o inactivo';
    end if;
  end if;

  -- Fecha local AR, nunca current_date (fix de la 0019: en Supabase current_date
  -- es UTC y un gasto de las 21:30 quedaba con la fecha de mañana).
  v_fecha := coalesce(p_fecha, public.hoy_local());

  -- La campaña queda escrita en la descripción del movimiento de caja: el
  -- extracto tiene que explicarse solo, sin joins.
  v_descripcion := v_categoria.nombre || ' · ' || p_descripcion
                   || case when p_campana_id is not null
                           then ' · ' || v_campana.id_publico || ' ' || v_campana.nombre
                           else '' end;

  -- 1) Movimiento EGRESO con el link al gasto ya seteado (FK diferida)
  insert into public.movimientos_caja (
    id, tipo, origen, monto, metodo_pago, descripcion, fecha, gasto_id, created_by
  ) values (
    v_mov_id, 'EGRESO', 'GASTO', p_monto, p_metodo,
    v_descripcion, v_fecha::timestamptz, v_gasto_id, v_actor_id
  );

  -- 2) Gasto con el link inverso al movimiento
  insert into public.gastos (
    id, categoria_id, monto, descripcion, fecha, metodo_pago, notas,
    movimiento_id, campana_id, gasto_fijo_id, created_by
  ) values (
    v_gasto_id, p_categoria_id, p_monto, p_descripcion, v_fecha,
    p_metodo, p_notas, v_mov_id, p_campana_id, p_gasto_fijo_id, v_actor_id
  );

  return v_gasto_id;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid, bigint)
  security definer
  set search_path = public;

revoke all on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid, bigint)
  from public, anon;
grant execute on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid, bigint)
  to authenticated;

comment on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid, bigint) is
  'Registra un gasto y su EGRESO de caja de forma atomica. Admin: cualquier gasto. Marketing: solo categoria es_publicidad Y con campana_id. p_gasto_fijo_id (0035) linkea el pago a su gasto fijo (admin-only). Usa hoy_local(). Ver 0019, 0028 y 0035.';

-- ─── 5 · Vista de estado: pagado o pendiente en el período actual ────────────
-- El período se calcula con hoy_local() para que un pago del día 1 a las 21:30
-- AR no caiga en el período equivocado. security_invoker: hereda el admin-only
-- de gastos_fijos.
create or replace view public.v_gastos_fijos_estado as
  select
    f.id, f.nombre, f.categoria_id, c.nombre as categoria_nombre,
    f.monto_estimado, f.metodo_pago, f.periodicidad, f.dia_pago, f.mes_pago,
    f.notas, f.activo,
    (
      select max(g.fecha) from public.gastos g
      where g.gasto_fijo_id = f.id and g.anulado_at is null
    ) as ultimo_pago,
    exists (
      select 1 from public.gastos g
      where g.gasto_fijo_id = f.id
        and g.anulado_at is null
        and g.fecha >= case f.periodicidad
          when 'SEMANAL' then date_trunc('week',  public.hoy_local()::timestamp)::date
          when 'MENSUAL' then date_trunc('month', public.hoy_local()::timestamp)::date
          when 'ANUAL'   then date_trunc('year',  public.hoy_local()::timestamp)::date
        end
    ) as pagado_periodo
  from public.gastos_fijos f
  join public.categorias_gasto c on c.id = f.categoria_id;

alter view public.v_gastos_fijos_estado set (security_invoker = true);

grant select on public.v_gastos_fijos_estado to authenticated;
revoke all on public.v_gastos_fijos_estado from anon;

comment on view public.v_gastos_fijos_estado is
  'Gastos fijos + pagado_periodo (existe gasto no anulado del periodo actual, por hoy_local). security_invoker: admin-only via RLS de gastos_fijos. Ver 0035.';
