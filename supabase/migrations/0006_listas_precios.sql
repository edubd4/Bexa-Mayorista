-- ============================================================================
-- BEXA · Ola A · Módulo Listas de precios + Reglas de descuento (0006)
-- Depende de: clientes (0004), productos (0005), proveedores (0003).
-- Cierra la FK diferida de clientes.lista_precio_id.
--
-- Decisiones del cliente (2026-07-13):
--   - Varias listas según proveedor.
--   - Descuentos por cantidad con scope PRODUCTO | CATEGORIA | GLOBAL.
--
-- El corazón del módulo es la RPC `resolver_precio(cliente, producto, cantidad)`:
--   1) Precio unitario = item de lista del cliente (si existe) o precio_base.
--   2) Regla de descuento más específica que aplique.
--   3) Devuelve precio_unitario original, precio_final, descuento_pct, origen.
-- La UI de ventas (Ola B) la va a llamar al agregar cada item.
-- ============================================================================

-- ─── Enum scope de descuento ────────────────────────────────────────────────
create type scope_descuento as enum ('PRODUCTO', 'CATEGORIA', 'GLOBAL');

-- ─── Listas de precios ──────────────────────────────────────────────────────
create sequence public.listas_precios_id_publico_seq start with 1;

create table public.listas_precios (
  id             uuid primary key default gen_random_uuid(),
  id_publico     text not null unique,
  nombre         text not null,
  proveedor_id   uuid references public.proveedores(id) on delete set null,
  notas          text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id)
);

create unique index idx_listas_precios_nombre_unique
  on public.listas_precios(lower(nombre));

create or replace function public.set_lista_precio_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_listas_precios';
    new.id_publico := coalesce(v_prefijo, 'LP') || '-' ||
                      lpad(nextval('public.listas_precios_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger listas_precios_set_id_publico
  before insert on public.listas_precios
  for each row execute function public.set_lista_precio_id_publico();

create trigger listas_precios_touch_updated_at
  before update on public.listas_precios
  for each row execute function public.touch_updated_at();

create index idx_listas_precios_activo    on public.listas_precios(activo);
create index idx_listas_precios_proveedor on public.listas_precios(proveedor_id) where proveedor_id is not null;

-- ─── Ítems de lista (precio por producto en una lista) ──────────────────────
create table public.listas_precios_items (
  id                 uuid primary key default gen_random_uuid(),
  lista_precio_id    uuid not null references public.listas_precios(id) on delete cascade,
  producto_id        uuid not null references public.productos(id)      on delete restrict,
  precio             numeric(14,2) not null check (precio >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_by         uuid references auth.users(id),
  unique (lista_precio_id, producto_id)
);

create index idx_lpitems_lista    on public.listas_precios_items(lista_precio_id);
create index idx_lpitems_producto on public.listas_precios_items(producto_id);

create trigger lpitems_touch_updated_at
  before update on public.listas_precios_items
  for each row execute function public.touch_updated_at();

-- ─── Reglas de descuento por cantidad ───────────────────────────────────────
-- Scope determina qué campo aplica: PRODUCTO → producto_id · CATEGORIA → categoria
-- · GLOBAL → nada. lista_precio_id nullable: si null, aplica a TODAS las listas
-- (incluso ventas sin lista). CHECK garantiza coherencia scope/campos.
create sequence public.reglas_descuento_id_publico_seq start with 1;

create table public.reglas_descuento (
  id               uuid primary key default gen_random_uuid(),
  id_publico       text not null unique,
  lista_precio_id  uuid references public.listas_precios(id) on delete cascade,
  scope            scope_descuento not null,
  producto_id      uuid references public.productos(id) on delete cascade,
  categoria        text,
  cantidad_min     integer not null check (cantidad_min > 0),
  descuento_pct    numeric(5,2) not null check (descuento_pct >= 0 and descuento_pct <= 100),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  constraint reglas_descuento_scope_coherente check (
    (scope = 'PRODUCTO'  and producto_id is not null and categoria is null) or
    (scope = 'CATEGORIA' and categoria  is not null and producto_id is null) or
    (scope = 'GLOBAL'    and producto_id is null    and categoria  is null)
  )
);

create or replace function public.set_regla_descuento_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_reglas_descuento';
    new.id_publico := coalesce(v_prefijo, 'RD') || '-' ||
                      lpad(nextval('public.reglas_descuento_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger reglas_descuento_set_id_publico
  before insert on public.reglas_descuento
  for each row execute function public.set_regla_descuento_id_publico();

create trigger reglas_descuento_touch_updated_at
  before update on public.reglas_descuento
  for each row execute function public.touch_updated_at();

create index idx_reglas_descuento_activo    on public.reglas_descuento(activo);
create index idx_reglas_descuento_scope     on public.reglas_descuento(scope);
create index idx_reglas_descuento_lista     on public.reglas_descuento(lista_precio_id) where lista_precio_id is not null;
create index idx_reglas_descuento_producto  on public.reglas_descuento(producto_id)     where producto_id is not null;
create index idx_reglas_descuento_categoria on public.reglas_descuento(lower(categoria)) where categoria is not null;

-- ─── FK diferida: cerrar clientes.lista_precio_id ──────────────────────────
-- El módulo 0004_clientes.sql dejó la columna sin FK a propósito (referencia
-- adelantada). Ahora que existe listas_precios, ligamos el constraint.
alter table public.clientes
  add constraint clientes_lista_precio_id_fkey
  foreign key (lista_precio_id) references public.listas_precios(id)
  on delete set null;

-- ─── RPC resolver_precio: el pricing engine ─────────────────────────────────
-- Devuelve (precio_unitario, precio_final, descuento_pct, origen).
-- Prioridad de precio: item de lista del cliente > precio_base del producto.
-- Prioridad de descuento (más específica primero):
--   1) PRODUCTO con la lista del cliente
--   2) PRODUCTO sin lista específica
--   3) CATEGORIA con la lista del cliente
--   4) CATEGORIA sin lista específica
--   5) GLOBAL con la lista del cliente
--   6) GLOBAL sin lista específica
-- Dentro de la misma prioridad: mayor descuento_pct gana (mejor para el cliente).
-- Solo se consideran reglas activas y cantidad >= cantidad_min.
create or replace function public.resolver_precio(
  p_cliente_id   uuid,
  p_producto_id  uuid,
  p_cantidad     integer
)
returns table (
  precio_unitario  numeric(14,2),
  precio_final     numeric(14,2),
  descuento_pct    numeric(5,2),
  origen           text
)
language plpgsql
stable
security invoker
as $$
declare
  v_lista_id        uuid;
  v_precio_base     numeric(14,2);
  v_precio_unit     numeric(14,2);
  v_categoria       text;
  v_desc_pct        numeric(5,2) := 0;
  v_origen_precio   text;
  v_origen_desc     text := '';
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad debe ser > 0';
  end if;

  -- 1) Datos del producto (categoría se usa para reglas)
  select precio_base, categoria into v_precio_base, v_categoria
    from public.productos where id = p_producto_id;
  if v_precio_base is null then
    raise exception 'producto % no encontrado', p_producto_id;
  end if;

  -- 2) Lista del cliente (nullable — consumidor final no tiene)
  if p_cliente_id is not null then
    select lista_precio_id into v_lista_id
      from public.clientes where id = p_cliente_id;
  end if;

  -- 3) Precio unitario: item de lista si existe, si no precio_base
  if v_lista_id is not null then
    select precio into v_precio_unit
      from public.listas_precios_items
      where lista_precio_id = v_lista_id and producto_id = p_producto_id;
    if v_precio_unit is not null then
      v_origen_precio := 'lista';
    else
      v_precio_unit := v_precio_base;
      v_origen_precio := 'precio_base';
    end if;
  else
    v_precio_unit := v_precio_base;
    v_origen_precio := 'precio_base';
  end if;

  -- 4) Mejor regla de descuento por prioridad de especificidad y mejor % dentro de cada nivel.
  --    NULLS FIRST en lista_precio_id no aplica porque estamos filtrando; usamos ranking manual.
  with reglas_candidatas as (
    select r.*,
      -- ranking: menor número = más específico
      case
        when r.scope = 'PRODUCTO'  and r.lista_precio_id is not distinct from v_lista_id then 1
        when r.scope = 'PRODUCTO'  and r.lista_precio_id is null                         then 2
        when r.scope = 'CATEGORIA' and r.lista_precio_id is not distinct from v_lista_id then 3
        when r.scope = 'CATEGORIA' and r.lista_precio_id is null                         then 4
        when r.scope = 'GLOBAL'    and r.lista_precio_id is not distinct from v_lista_id then 5
        when r.scope = 'GLOBAL'    and r.lista_precio_id is null                         then 6
        else 999
      end as rank
    from public.reglas_descuento r
    where r.activo
      and p_cantidad >= r.cantidad_min
      and (
        (r.scope = 'PRODUCTO'  and r.producto_id = p_producto_id) or
        (r.scope = 'CATEGORIA' and lower(coalesce(r.categoria,'')) = lower(coalesce(v_categoria,''))) or
        (r.scope = 'GLOBAL')
      )
      and (r.lista_precio_id is null or r.lista_precio_id = v_lista_id)
  )
  select rc.descuento_pct,
         case rc.scope
           when 'PRODUCTO'  then 'descuento_producto'
           when 'CATEGORIA' then 'descuento_categoria'
           when 'GLOBAL'    then 'descuento_global'
         end
    into v_desc_pct, v_origen_desc
    from reglas_candidatas rc
    where rc.rank < 999
    order by rc.rank asc, rc.descuento_pct desc
    limit 1;

  return query select
    v_precio_unit                                                    as precio_unitario,
    round(v_precio_unit * (1 - coalesce(v_desc_pct, 0) / 100.0), 2)   as precio_final,
    coalesce(v_desc_pct, 0)                                          as descuento_pct,
    (v_origen_precio || case when v_desc_pct is not null then '+' || v_origen_desc else '' end) as origen;
end;
$$;

-- ─── RLS: todo admin-only (matriz PLAN-TECNICO §6) ──────────────────────────
alter table public.listas_precios       enable row level security;
alter table public.listas_precios_items enable row level security;
alter table public.reglas_descuento     enable row level security;

-- Listas: authenticated select (ventas necesita ver la lista del cliente para
--         disparar resolver_precio); admin escribe. Solo el precio está expuesto
--         acá; el margen (precio - costo) sigue oculto por productos_catalogo.
create policy "listas_precios_select_authenticated"
  on public.listas_precios for select
  to authenticated using (public.current_user_rol() is not null);

create policy "listas_precios_write_admin"
  on public.listas_precios for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

create policy "lpitems_select_authenticated"
  on public.listas_precios_items for select
  to authenticated using (public.current_user_rol() is not null);

create policy "lpitems_write_admin"
  on public.listas_precios_items for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- Reglas de descuento: select authenticated (la RPC las usa desde security invoker),
-- write admin.
create policy "reglas_descuento_select_authenticated"
  on public.reglas_descuento for select
  to authenticated using (public.current_user_rol() is not null);

create policy "reglas_descuento_write_admin"
  on public.reglas_descuento for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.listas_precios       to authenticated;
grant select, insert, update, delete on public.listas_precios_items to authenticated; -- items se editan/borran al armar lista
grant select, insert, update on public.reglas_descuento     to authenticated;
grant usage on sequence public.listas_precios_id_publico_seq   to authenticated;
grant usage on sequence public.reglas_descuento_id_publico_seq to authenticated;
grant execute on function public.resolver_precio(uuid, uuid, integer) to authenticated;

revoke all on public.listas_precios       from anon;
revoke all on public.listas_precios_items from anon;
revoke all on public.reglas_descuento     from anon;
