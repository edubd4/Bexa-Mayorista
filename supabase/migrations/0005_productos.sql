-- ============================================================================
-- BEXA · Ola A · Módulo Productos + Movimientos de stock (PROD-XXXX)
-- Depende de: proveedores (0003). Referenciado por listas-precios (0006) y
--             ventas/compras (Ola B).
--
-- Este módulo estrena la MATRIZ DE PERMISOS DE COLUMNAS (§6 PLAN-TECNICO):
--   - `productos` completa (con costo, comision_pct override): admin-only.
--   - Vista `productos_catalogo` SIN costo ni comision_pct: authenticated.
--   El server también selecciona columnas según rol (defensa en profundidad).
--
-- Blueprint extras aplicados: sku, atributos_jsonb, vista_sin_costos.
-- Decisión cliente (2026-07-13): comision_pct nullable a nivel producto para
-- override del % del vendedor cuando aplique.
-- ============================================================================

-- ─── Enum de movimientos ───────────────────────────────────────────────────
-- Simplificación vs Tecnopro (que tenía ENTRADA|SALIDA|AJUSTE con signo implícito):
-- separamos AJUSTE_POSITIVO / AJUSTE_NEGATIVO — la cantidad SIEMPRE va positiva.
create type tipo_mov_stock as enum (
  'ENTRADA',
  'SALIDA',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO'
);

-- ─── Secuencia + tabla productos ────────────────────────────────────────────
create sequence public.productos_id_publico_seq start with 1;

create table public.productos (
  id             uuid primary key default gen_random_uuid(),
  id_publico     text not null unique,
  sku            text unique,                  -- código externo (proveedor/EAN); NULL permitido
  -- Descripción
  nombre         text not null,
  descripcion    text,
  categoria      text,                          -- text libre por ahora (se formaliza si el patrón se repite)
  marca          text,
  atributos      jsonb not null default '{}',   -- color, medida, modelo, potencia, etc.
  -- Relación
  proveedor_id   uuid references public.proveedores(id) on delete set null,
  -- Plata (SENSIBLES — solo admin)
  costo          numeric(14,2) not null default 0 check (costo >= 0),
  precio_base    numeric(14,2) not null default 0 check (precio_base >= 0), -- minorista sin lista
  comision_pct   numeric(5,2)  check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 100)),
  -- Stock (autocalculado por trigger)
  stock_actual   integer not null default 0,
  stock_minimo   integer not null default 0 check (stock_minimo >= 0),
  activo         boolean not null default true,
  -- Auditoría
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id)
);

-- Trigger id_publico (prefijo desde configuracion)
create or replace function public.set_producto_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_productos';
    new.id_publico := coalesce(v_prefijo, 'PROD') || '-' ||
                      lpad(nextval('public.productos_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger productos_set_id_publico
  before insert on public.productos
  for each row execute function public.set_producto_id_publico();

create trigger productos_touch_updated_at
  before update on public.productos
  for each row execute function public.touch_updated_at();

-- Índices
create index idx_productos_activo      on public.productos(activo);
create index idx_productos_nombre      on public.productos(lower(nombre));
create index idx_productos_sku         on public.productos(sku)          where sku       is not null;
create index idx_productos_categoria   on public.productos(lower(categoria)) where categoria is not null;
create index idx_productos_marca       on public.productos(lower(marca))    where marca     is not null;
create index idx_productos_proveedor   on public.productos(proveedor_id) where proveedor_id is not null;
create index idx_productos_atributos   on public.productos using gin (atributos);
create index idx_productos_stock_bajo  on public.productos(stock_actual) where activo and stock_minimo > 0;

-- ─── Tabla movimientos_stock (append-only) ─────────────────────────────────
create table public.movimientos_stock (
  id           bigserial primary key,
  producto_id  uuid not null references public.productos(id) on delete cascade,
  tipo         tipo_mov_stock not null,
  cantidad     integer not null check (cantidad > 0),   -- SIEMPRE positiva; el tipo determina signo
  motivo       text,                                    -- opcional (compra COMP-XXX, venta VTA-XXX, "ajuste inventario", etc.)
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create index idx_movstock_producto on public.movimientos_stock(producto_id, created_at desc);
create index idx_movstock_tipo     on public.movimientos_stock(tipo);
create index idx_movstock_created  on public.movimientos_stock(created_at desc);

-- ─── Trigger: aplicar movimiento al stock del producto ─────────────────────
-- SALIDA / AJUSTE_NEGATIVO validan stock suficiente. RPC de ventas (Ola B) los
-- disparará dentro de una transacción → si falla, rollback total.
create or replace function public.aplicar_mov_stock()
returns trigger language plpgsql as $$
declare
  v_delta integer;
  v_stock_actual integer;
begin
  v_delta := case new.tipo
    when 'ENTRADA'          then  new.cantidad
    when 'AJUSTE_POSITIVO'  then  new.cantidad
    when 'SALIDA'           then -new.cantidad
    when 'AJUSTE_NEGATIVO'  then -new.cantidad
  end;

  if v_delta < 0 then
    -- Lock optimista de la fila del producto para evitar carreras
    select stock_actual into v_stock_actual
      from public.productos where id = new.producto_id for update;
    if v_stock_actual + v_delta < 0 then
      raise exception 'Stock insuficiente para producto %: hay % unidades, se piden %',
        new.producto_id, v_stock_actual, new.cantidad;
    end if;
  end if;

  update public.productos
    set stock_actual = stock_actual + v_delta,
        updated_at   = now()
    where id = new.producto_id;

  return new;
end;
$$;

create trigger movstock_aplicar
  after insert on public.movimientos_stock
  for each row execute function public.aplicar_mov_stock();

-- ─── Append-only: bloquear UPDATE/DELETE de movimientos ────────────────────
create or replace function public.movstock_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'movimientos_stock es inmutable: % no permitido. Registrar un nuevo movimiento AJUSTE para corregir.', TG_OP;
end;
$$;

create trigger movstock_no_update
  before update on public.movimientos_stock
  for each row execute function public.movstock_block_mutations();

create trigger movstock_no_delete
  before delete on public.movimientos_stock
  for each row execute function public.movstock_block_mutations();

-- ─── Vista productos_catalogo — SIN columnas sensibles ─────────────────────
-- Consumida por vendedores y por cualquier UI que NO deba ver costo/comisión.
-- Hereda RLS de la tabla base pero excluimos las columnas prohibidas.
create or replace view public.productos_catalogo as
  select
    id, id_publico, sku, nombre, descripcion, categoria, marca, atributos,
    proveedor_id, precio_base, stock_actual, stock_minimo, activo,
    created_at, updated_at
  from public.productos;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.productos enable row level security;

-- productos completa: SELECT admin-only (para proteger costo y comision_pct).
create policy "productos_select_admin"
  on public.productos for select
  using (public.current_user_rol() = 'admin');

-- escritura: admin
create policy "productos_write_admin"
  on public.productos for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

alter table public.movimientos_stock enable row level security;

-- movimientos: lectura para authenticated (los vendedores ven el histórico de stock);
-- insert para authenticated (ventas dispara SALIDA con auth.uid());
-- update/delete bloqueados por triggers de append-only (no hace falta policy).
create policy "movstock_select_authenticated"
  on public.movimientos_stock for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "movstock_insert_authenticated"
  on public.movimientos_stock for insert
  to authenticated
  with check (public.current_user_rol() is not null);

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.productos to authenticated;
grant usage on sequence public.productos_id_publico_seq to authenticated;
grant select, insert on public.movimientos_stock to authenticated;
grant usage on sequence public.movimientos_stock_id_seq to authenticated;
grant select on public.productos_catalogo to authenticated;

revoke all on public.productos          from anon;
revoke all on public.movimientos_stock  from anon;
revoke all on public.productos_catalogo from anon;
