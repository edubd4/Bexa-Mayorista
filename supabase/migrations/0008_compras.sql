-- ============================================================================
-- BEXA · Ola B · Módulo Compras (COMP-XXXX)
-- Depende de: proveedores (0003), productos (0005).
--
-- Es el espejo de ventas pero más simple: sin pricing_engine, sin comisiones,
-- sin flujo de estados. Una compra ENTRA mercadería y ACTUALIZA el costo del
-- producto (fifo/promedio simple: usamos el último costo pagado — decisión
-- alineada con la propuesta, sin promedios ponderados en el MVP).
--
-- La RPC recibir_compra() es transaccional:
--   1. Inserta compras + compra_items con costo snapshot.
--   2. Dispara movimientos_stock ENTRADA por item.
--   3. Actualiza productos.costo con el costo_unitario de la compra.
-- ============================================================================

-- ─── Enum estado de la compra ───────────────────────────────────────────────
create type estado_compra as enum ('RECIBIDA', 'PENDIENTE', 'CANCELADA');

-- ─── Tabla compras ──────────────────────────────────────────────────────────
create sequence public.compras_id_publico_seq start with 1;

create table public.compras (
  id                uuid primary key default gen_random_uuid(),
  id_publico        text not null unique,
  proveedor_id      uuid not null references public.proveedores(id) on delete restrict,
  estado            estado_compra not null default 'RECIBIDA',
  -- Totales (calculados por la RPC)
  total             numeric(14,2) not null default 0 check (total >= 0),
  -- Meta
  numero_factura    text,             -- referencia de la factura del proveedor
  notas             text,
  fecha             timestamptz not null default now(),
  cancelada_at      timestamptz,
  cancelada_motivo  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id)
);

create or replace function public.set_compra_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_compras';
    new.id_publico := coalesce(v_prefijo, 'COMP') || '-' ||
                      lpad(nextval('public.compras_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger compras_set_id_publico
  before insert on public.compras
  for each row execute function public.set_compra_id_publico();

create trigger compras_touch_updated_at
  before update on public.compras
  for each row execute function public.touch_updated_at();

create index idx_compras_proveedor      on public.compras(proveedor_id);
create index idx_compras_fecha          on public.compras(fecha desc);
create index idx_compras_estado         on public.compras(estado);
create index idx_compras_numero_factura on public.compras(numero_factura) where numero_factura is not null;

-- ─── Ítems de compra con snapshot de costo ────────────────────────────────
create table public.compra_items (
  id                    uuid primary key default gen_random_uuid(),
  compra_id             uuid not null references public.compras(id)    on delete cascade,
  producto_id           uuid not null references public.productos(id)  on delete restrict,
  cantidad              integer not null check (cantidad > 0),
  costo_unitario        numeric(14,2) not null check (costo_unitario >= 0),
  subtotal              numeric(14,2) not null check (subtotal >= 0),
  -- FK al movimiento_stock que la compra generó (auditoría)
  movimiento_stock_id   bigint references public.movimientos_stock(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index idx_compra_items_compra    on public.compra_items(compra_id);
create index idx_compra_items_producto  on public.compra_items(producto_id);

-- ============================================================================
-- ★ RPC recibir_compra — atómica
--   Params: proveedor_id, items (producto_id, cantidad, costo_unitario),
--           numero_factura?, notas?
--   Retorna: id de la compra creada.
--   Post-condición: por cada item una ENTRADA de stock + costo del producto
--   actualizado al costo_unitario del item.
-- ============================================================================
create type public.compra_item_input as (
  producto_id     uuid,
  cantidad        integer,
  costo_unitario  numeric
);

create or replace function public.recibir_compra(
  p_proveedor_id    uuid,
  p_items           compra_item_input[],
  p_numero_factura  text default null,
  p_notas           text default null,
  p_fecha           timestamptz default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_actor_id     uuid;
  v_compra_id    uuid;
  v_id_publico   text;
  v_item         compra_item_input;
  v_mov_id       bigint;
  v_total        numeric(14,2) := 0;
  v_subtotal     numeric(14,2);
begin
  -- 1) Autenticación
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  -- 2) Validaciones básicas
  if p_proveedor_id is null then
    raise exception 'Proveedor requerido';
  end if;
  perform 1 from public.proveedores where id = p_proveedor_id and activo = true;
  if not found then
    raise exception 'Proveedor no encontrado o inactivo';
  end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) = 0 then
    raise exception 'La compra debe tener al menos un producto';
  end if;

  -- 3) Crear cabezal
  insert into public.compras (
    proveedor_id, numero_factura, notas, fecha, created_by, updated_by
  ) values (
    p_proveedor_id, p_numero_factura, p_notas, coalesce(p_fecha, now()), v_actor_id, v_actor_id
  ) returning id, id_publico into v_compra_id, v_id_publico;

  -- 4) Ítems + ENTRADA de stock + actualización de costo
  foreach v_item in array p_items loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad inválida para producto %', v_item.producto_id;
    end if;
    if v_item.costo_unitario is null or v_item.costo_unitario < 0 then
      raise exception 'Costo unitario inválido para producto %', v_item.producto_id;
    end if;

    perform 1 from public.productos where id = v_item.producto_id and activo = true;
    if not found then
      raise exception 'Producto % no encontrado o inactivo', v_item.producto_id;
    end if;

    -- ENTRADA de stock (el trigger de 0005 sube stock_actual atómicamente)
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'ENTRADA', v_item.cantidad,
            'Compra ' || v_id_publico, v_actor_id)
    returning id into v_mov_id;

    v_subtotal := v_item.costo_unitario * v_item.cantidad;
    v_total := v_total + v_subtotal;

    insert into public.compra_items (
      compra_id, producto_id, cantidad, costo_unitario, subtotal, movimiento_stock_id
    ) values (
      v_compra_id, v_item.producto_id, v_item.cantidad, v_item.costo_unitario, v_subtotal, v_mov_id
    );

    -- Actualizar costo del producto al último pagado (MVP: sin promedio ponderado)
    update public.productos
      set costo = v_item.costo_unitario,
          updated_at = now(),
          updated_by = v_actor_id
      where id = v_item.producto_id;
  end loop;

  -- 5) Total del cabezal
  update public.compras set total = v_total where id = v_compra_id;

  return v_compra_id;
end;
$$;

alter function public.recibir_compra(uuid, compra_item_input[], text, text, timestamptz)
  security definer
  set search_path = public;

-- ============================================================================
-- Cancelar compra: revierte stock con SALIDAs compensatorias.
-- No revierte el costo del producto (podría haber compras posteriores del mismo
-- producto que ya cambiaron el costo, y hacer chain de reversiones es frágil).
-- Si se necesita, el admin puede editar el costo a mano después.
-- ============================================================================
create or replace function public.cancelar_compra(
  p_compra_id  uuid,
  p_motivo     text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_compra    record;
  v_actor_id  uuid;
  v_rol       text;
  v_item      record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  v_rol := public.current_user_rol();
  if v_rol <> 'admin' then
    raise exception 'Solo un admin puede cancelar compras';
  end if;

  select * into v_compra from public.compras where id = p_compra_id for update;
  if not found then
    raise exception 'Compra % no encontrada', p_compra_id;
  end if;
  if v_compra.estado = 'CANCELADA' then
    raise exception 'La compra ya está cancelada';
  end if;

  -- Por cada item una SALIDA compensatoria (el trigger valida que haya stock —
  -- si ya se vendió más de lo que había, va a fallar y el admin debe hacer
  -- AJUSTE manual antes de cancelar. Comportamiento honesto: no borrar stock
  -- que ya se vendió.)
  for v_item in select producto_id, cantidad from public.compra_items where compra_id = p_compra_id loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'SALIDA', v_item.cantidad,
            'Cancelación compra ' || v_compra.id_publico, v_actor_id);
  end loop;

  update public.compras
    set estado            = 'CANCELADA',
        cancelada_at      = now(),
        cancelada_motivo  = p_motivo,
        updated_by        = v_actor_id
    where id = p_compra_id;
end;
$$;

alter function public.cancelar_compra(uuid, text)
  security definer
  set search_path = public;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Compras es admin-only (matriz PLAN-TECNICO §6): el vendedor no compra.
alter table public.compras       enable row level security;
alter table public.compra_items  enable row level security;

create policy "compras_select_admin"
  on public.compras for select
  using (public.current_user_rol() = 'admin');

create policy "compras_write_admin"
  on public.compras for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

create policy "compra_items_select_admin"
  on public.compra_items for select
  using (public.current_user_rol() = 'admin');

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.compras                        to authenticated;
grant select                 on public.compra_items                   to authenticated;
grant usage on sequence public.compras_id_publico_seq                 to authenticated;
grant execute on function public.recibir_compra(uuid, compra_item_input[], text, text, timestamptz) to authenticated;
grant execute on function public.cancelar_compra(uuid, text)          to authenticated;

revoke all on public.compras      from anon;
revoke all on public.compra_items from anon;
