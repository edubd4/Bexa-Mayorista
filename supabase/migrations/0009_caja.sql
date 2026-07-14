-- ============================================================================
-- BEXA · Ola C · Caja + Gastos + Cobrar venta (0009)
-- Depende de: ventas (0007), compras (0008).
--
-- Cierra el circuito de plata del sistema:
--   - Movimientos de caja append-only (INGRESO/EGRESO por origen).
--   - RPC cobrar_venta: pasa una venta de PENDIENTE→PARCIAL→COBRADA registrando
--     el INGRESO en caja atómicamente (una sola transacción).
--   - Categorías de gasto configurables + gastos con FK al movimiento de caja.
--   - RPC registrar_gasto: EGRESO + fila en gastos, atómico.
--   - Vista saldo_caja para el panel.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type tipo_mov_caja as enum ('INGRESO', 'EGRESO');

create type origen_mov_caja as enum (
  'COBRO_VENTA',   -- INGRESO desde ventas.cobrar_venta
  'PAGO_COMPRA',   -- EGRESO cuando se paga a proveedor (Ola D o manual)
  'GASTO',         -- EGRESO desde registrar_gasto
  'AJUSTE',        -- corrección de saldo (append-only: se registra otro mov)
  'APERTURA',      -- carga inicial de caja
  'OTRO'
);

create type metodo_pago as enum (
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA_DEBITO',
  'TARJETA_CREDITO',
  'MERCADO_PAGO',
  'CHEQUE',
  'OTRO'
);

-- ─── Categorías de gasto (configurables) ────────────────────────────────────
create table public.categorias_gasto (
  id           bigserial primary key,
  nombre       text not null,
  descripcion  text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  updated_by   uuid references auth.users(id)
);

create unique index idx_categorias_gasto_nombre on public.categorias_gasto(lower(nombre));

create trigger categorias_gasto_touch_updated_at
  before update on public.categorias_gasto
  for each row execute function public.touch_updated_at();

-- Seeds básicos — el admin puede editar/agregar desde configuración.
insert into public.categorias_gasto (nombre) values
  ('Servicios'),
  ('Sueldos'),
  ('Alquiler'),
  ('Logística'),
  ('Impuestos'),
  ('Otro')
on conflict do nothing;

-- ─── Tabla movimientos_caja (append-only) ──────────────────────────────────
create sequence public.movimientos_caja_id_publico_seq start with 1;

create table public.movimientos_caja (
  id             uuid primary key default gen_random_uuid(),
  id_publico     text not null unique,
  tipo           tipo_mov_caja not null,
  origen         origen_mov_caja not null,
  monto          numeric(14,2) not null check (monto > 0),   -- SIEMPRE positivo; tipo determina signo
  metodo_pago    metodo_pago not null default 'EFECTIVO',
  descripcion    text,
  fecha          timestamptz not null default now(),
  -- FKs opcionales según origen (permiten cruzar caja ↔ ventas / compras / gastos)
  venta_id       uuid references public.ventas(id)   on delete set null,
  compra_id      uuid references public.compras(id)  on delete set null,
  gasto_id       uuid references public.gastos(id)   on delete set null   deferrable initially deferred,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);

create or replace function public.set_mov_caja_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_movimientos_caja';
    new.id_publico := coalesce(v_prefijo, 'MOV') || '-' ||
                      lpad(nextval('public.movimientos_caja_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger movcaja_set_id_publico
  before insert on public.movimientos_caja
  for each row execute function public.set_mov_caja_id_publico();

create index idx_movcaja_tipo    on public.movimientos_caja(tipo);
create index idx_movcaja_origen  on public.movimientos_caja(origen);
create index idx_movcaja_fecha   on public.movimientos_caja(fecha desc);
create index idx_movcaja_venta   on public.movimientos_caja(venta_id)  where venta_id  is not null;
create index idx_movcaja_compra  on public.movimientos_caja(compra_id) where compra_id is not null;
create index idx_movcaja_metodo  on public.movimientos_caja(metodo_pago);

-- Append-only: nada de UPDATE/DELETE (correcciones = otro mov con origen AJUSTE)
create or replace function public.movcaja_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'movimientos_caja es inmutable: % no permitido. Registrá un mov AJUSTE para corregir.', TG_OP;
end;
$$;

create trigger movcaja_no_update
  before update on public.movimientos_caja
  for each row execute function public.movcaja_block_mutations();

create trigger movcaja_no_delete
  before delete on public.movimientos_caja
  for each row execute function public.movcaja_block_mutations();

-- ─── Tabla gastos ───────────────────────────────────────────────────────────
create sequence public.gastos_id_publico_seq start with 1;

create table public.gastos (
  id             uuid primary key default gen_random_uuid(),
  id_publico     text not null unique,
  categoria_id   bigint not null references public.categorias_gasto(id) on delete restrict,
  monto          numeric(14,2) not null check (monto > 0),
  descripcion    text not null,
  fecha          date not null default current_date,
  metodo_pago    metodo_pago not null default 'EFECTIVO',
  notas          text,
  movimiento_id  uuid not null references public.movimientos_caja(id) deferrable initially deferred,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);

create or replace function public.set_gasto_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_gastos';
    new.id_publico := coalesce(v_prefijo, 'GST') || '-' ||
                      lpad(nextval('public.gastos_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger gastos_set_id_publico
  before insert on public.gastos
  for each row execute function public.set_gasto_id_publico();

create index idx_gastos_categoria on public.gastos(categoria_id);
create index idx_gastos_fecha     on public.gastos(fecha desc);
create index idx_gastos_metodo    on public.gastos(metodo_pago);

-- Gastos también append-only (correcciones = ajuste de caja + nuevo gasto)
create or replace function public.gastos_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'gastos es inmutable: % no permitido. Registrá un ajuste + nuevo gasto para corregir.', TG_OP;
end;
$$;

create trigger gastos_no_update
  before update on public.gastos
  for each row execute function public.gastos_block_mutations();

create trigger gastos_no_delete
  before delete on public.gastos
  for each row execute function public.gastos_block_mutations();

-- ============================================================================
-- ★ RPC cobrar_venta — INGRESO atómico + actualización de estado_cobro
-- ============================================================================
create or replace function public.cobrar_venta(
  p_venta_id     uuid,
  p_monto        numeric,
  p_metodo       metodo_pago default 'EFECTIVO',
  p_descripcion  text default null,
  p_fecha        timestamptz default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_venta        record;
  v_actor_id     uuid;
  v_rol          text;
  v_mov_id       uuid;
  v_id_publico   text;
  v_saldo        numeric(14,2);
  v_nuevo_cobrado numeric(14,2);
  v_nuevo_estado estado_cobro;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Monto debe ser > 0'; end if;

  -- Validación de negocio + lock
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta % no encontrada', p_venta_id; end if;
  if v_venta.estado_cobro = 'CANCELADA' then raise exception 'La venta está cancelada'; end if;
  if v_venta.estado_cobro = 'COBRADA'   then raise exception 'La venta ya está cobrada'; end if;

  v_saldo := v_venta.total - v_venta.total_cobrado;
  if p_monto > v_saldo then
    raise exception 'Monto excede el saldo pendiente (%): %', v_saldo, p_monto;
  end if;

  -- Autorización: admin siempre; vendedor solo sobre sus ventas
  v_rol := public.current_user_rol();
  if v_rol <> 'admin' and v_venta.vendedor_id <> v_actor_id then
    raise exception 'Solo el admin o el vendedor de la venta pueden cobrar';
  end if;

  -- 1) Insertar movimiento INGRESO
  insert into public.movimientos_caja (
    tipo, origen, monto, metodo_pago, descripcion, fecha, venta_id, created_by
  ) values (
    'INGRESO', 'COBRO_VENTA', p_monto, p_metodo,
    coalesce(p_descripcion, 'Cobro venta ' || v_venta.id_publico),
    coalesce(p_fecha, now()),
    p_venta_id, v_actor_id
  )
  returning id, id_publico into v_mov_id, v_id_publico;

  -- 2) Actualizar la venta: total_cobrado + estado_cobro
  v_nuevo_cobrado := v_venta.total_cobrado + p_monto;
  v_nuevo_estado := case
    when v_nuevo_cobrado >= v_venta.total then 'COBRADA'::estado_cobro
    when v_nuevo_cobrado > 0              then 'PARCIAL'::estado_cobro
    else 'PENDIENTE'::estado_cobro
  end;

  update public.ventas
    set total_cobrado = v_nuevo_cobrado,
        estado_cobro  = v_nuevo_estado,
        updated_by    = v_actor_id
    where id = p_venta_id;

  return v_mov_id;
end;
$$;

alter function public.cobrar_venta(uuid, numeric, metodo_pago, text, timestamptz)
  security definer
  set search_path = public;

-- ============================================================================
-- ★ RPC registrar_gasto — EGRESO + fila gasto atómico
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
  v_mov_id        uuid;
  v_gasto_id      uuid;
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

  -- 1) Movimiento EGRESO
  insert into public.movimientos_caja (
    tipo, origen, monto, metodo_pago, descripcion, fecha, created_by
  ) values (
    'EGRESO', 'GASTO', p_monto, p_metodo,
    v_categoria.nombre || ' · ' || p_descripcion,
    coalesce(p_fecha, current_date)::timestamptz, v_actor_id
  )
  returning id into v_mov_id;

  -- 2) Gasto con FK al movimiento
  insert into public.gastos (
    categoria_id, monto, descripcion, fecha, metodo_pago, notas, movimiento_id, created_by
  ) values (
    p_categoria_id, p_monto, p_descripcion, coalesce(p_fecha, current_date),
    p_metodo, p_notas, v_mov_id, v_actor_id
  )
  returning id into v_gasto_id;

  -- 3) Cerrar el link inverso movimiento → gasto (FK deferrable inicial diferida)
  update public.movimientos_caja set gasto_id = v_gasto_id where id = v_mov_id;

  return v_gasto_id;
end;
$$;

alter function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text)
  security definer
  set search_path = public;

-- ============================================================================
-- Vistas de reporting
-- ============================================================================

-- Saldo de caja (todos los movimientos vivos, no cancelados)
create or replace view public.saldo_caja as
  select
    coalesce(sum(case when tipo = 'INGRESO' then monto else -monto end), 0)::numeric(14,2) as saldo,
    coalesce(sum(case when tipo = 'INGRESO' then monto else 0 end), 0)::numeric(14,2) as total_ingresos,
    coalesce(sum(case when tipo = 'EGRESO'  then monto else 0 end), 0)::numeric(14,2) as total_egresos
  from public.movimientos_caja;

grant select on public.saldo_caja to authenticated;
revoke all on public.saldo_caja from anon;

-- Ganancia real por venta (admin-only): total_final - suma(costo_snapshot * cantidad).
-- Se usa en /finanzas y en el panel admin. NO exponer a vendedores.
create or replace view public.v_ventas_ganancia as
  select
    v.id, v.id_publico, v.fecha, v.total, v.total_cobrado, v.estado_cobro,
    coalesce(sum(vi.costo_snapshot * vi.cantidad), 0)::numeric(14,2) as costo_total,
    (v.total - coalesce(sum(vi.costo_snapshot * vi.cantidad), 0))::numeric(14,2) as ganancia
  from public.ventas v
  left join public.venta_items vi on vi.venta_id = v.id
  where v.estado_cobro <> 'CANCELADA'
  group by v.id;

grant select on public.v_ventas_ganancia to authenticated;
revoke all on public.v_ventas_ganancia from anon;

-- Liquidación de comisiones semanal (decisión cliente: pagan por semana).
-- Cada semana se paga el total_comisiones. Admin ve todo; vendedor solo lo suyo.
create or replace view public.v_comisiones_semana as
  select
    vendedor_id,
    date_trunc('week', fecha)::date as semana_inicio,
    count(*)::integer               as ventas_count,
    sum(monto_base)::numeric(14,2)  as base,
    sum(monto)::numeric(14,2)       as total
  from public.comisiones
  group by vendedor_id, date_trunc('week', fecha);

grant select on public.v_comisiones_semana to authenticated;
revoke all on public.v_comisiones_semana from anon;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.categorias_gasto    enable row level security;
alter table public.movimientos_caja    enable row level security;
alter table public.gastos              enable row level security;

-- categorias_gasto: authenticated select (el form de gasto necesita las opciones); admin escribe
create policy "categorias_gasto_select_authenticated"
  on public.categorias_gasto for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "categorias_gasto_write_admin"
  on public.categorias_gasto for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- Caja admin-only (matriz §6 — vendedor no ve caja)
create policy "movcaja_select_admin"
  on public.movimientos_caja for select
  using (public.current_user_rol() = 'admin');

-- La RPC cobrar_venta (SECURITY DEFINER) inserta con permisos del owner, no del caller.
-- Pero también permitimos insert directo a admin por si acaso (ej. mov APERTURA manual).
create policy "movcaja_insert_admin"
  on public.movimientos_caja for insert
  to authenticated
  with check (public.current_user_rol() = 'admin');

create policy "gastos_select_admin"
  on public.gastos for select
  using (public.current_user_rol() = 'admin');

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.categorias_gasto to authenticated;
grant usage on sequence public.categorias_gasto_id_seq to authenticated;

grant select, insert on public.movimientos_caja to authenticated;
grant usage on sequence public.movimientos_caja_id_publico_seq to authenticated;

grant select, insert on public.gastos to authenticated;
grant usage on sequence public.gastos_id_publico_seq to authenticated;

grant execute on function public.cobrar_venta(uuid, numeric, metodo_pago, text, timestamptz) to authenticated;
grant execute on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text) to authenticated;

revoke all on public.categorias_gasto from anon;
revoke all on public.movimientos_caja from anon;
revoke all on public.gastos           from anon;
