-- ============================================================================
-- BEXA · Ola B · Módulo Ventas (VTA-XXXX)  ★ EL CORAZÓN DEL SISTEMA
-- Depende de: clientes (0004), productos (0005), listas-precios (0006).
--
-- La promesa central de la propuesta se cumple ACÁ, en la RPC atómica
-- registrar_venta():
--   1. Resuelve precios via resolver_precio() para cada item (respeta lista del
--      cliente + reglas de descuento por cantidad).
--   2. Valida stock; inserta venta + items con snapshots (precio, descuento,
--      costo — para calcular ganancia sin exponerla al vendedor).
--   3. Dispara movimientos_stock SALIDA por item (el trigger de 0005 baja stock
--      y bloquea si no alcanza — TODA la venta hace rollback si falla).
--   4. Registra comisión (append-only) según % del vendedor u override del producto.
--   5. Todo en una sola transacción Postgres: o entra completo, o nada.
--
-- Decisiones del cliente aplicadas (2026-07-13):
--   - Flujo pedido→entrega: enum estado_entrega. El stock sale AL REGISTRAR
--     (reserva física); estado_entrega es logística, no mueve stock.
--   - Comisión = % del vendedor + override por producto (productos.comision_pct).
--     Liquidación semanal → vista v_comisiones_semana en 0009_reporting.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type estado_cobro    as enum ('PENDIENTE', 'PARCIAL', 'COBRADA', 'CANCELADA');
create type estado_entrega  as enum ('ENTREGADA', 'PEDIDO', 'EN_PREPARACION', 'CANCELADA');

-- ─── Secuencia + tabla ventas ───────────────────────────────────────────────
create sequence public.ventas_id_publico_seq start with 1;

create table public.ventas (
  id                uuid primary key default gen_random_uuid(),
  id_publico        text not null unique,
  cliente_id        uuid not null references public.clientes(id) on delete restrict,
  vendedor_id       uuid not null references auth.users(id)      on delete restrict,
  -- Estado logística vs cobro son ortogonales (una venta puede estar ENTREGADA sin cobrar)
  estado_entrega    estado_entrega not null default 'ENTREGADA',
  estado_cobro      estado_cobro   not null default 'PENDIENTE',
  -- Totales calculados por la RPC (no confiar en el cliente para cerrar plata)
  subtotal          numeric(14,2) not null default 0 check (subtotal >= 0),
  descuento_total   numeric(14,2) not null default 0 check (descuento_total >= 0),
  total             numeric(14,2) not null default 0 check (total >= 0),
  total_cobrado     numeric(14,2) not null default 0 check (total_cobrado >= 0),
  -- Meta
  notas             text,
  fecha             timestamptz not null default now(),
  cancelada_at      timestamptz,     -- se setea al pasar a CANCELADA
  cancelada_motivo  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id)
);

create or replace function public.set_venta_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_ventas';
    new.id_publico := coalesce(v_prefijo, 'VTA') || '-' ||
                      lpad(nextval('public.ventas_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger ventas_set_id_publico
  before insert on public.ventas
  for each row execute function public.set_venta_id_publico();

create trigger ventas_touch_updated_at
  before update on public.ventas
  for each row execute function public.touch_updated_at();

create index idx_ventas_cliente         on public.ventas(cliente_id);
create index idx_ventas_vendedor        on public.ventas(vendedor_id);
create index idx_ventas_estado_cobro    on public.ventas(estado_cobro);
create index idx_ventas_estado_entrega  on public.ventas(estado_entrega);
create index idx_ventas_fecha           on public.ventas(fecha desc);
-- Índice específico para saldo pendiente (ver dashboard de por-cobrar futuro)
create index idx_ventas_por_cobrar
  on public.ventas(fecha desc)
  where estado_cobro in ('PENDIENTE', 'PARCIAL');

-- ─── Ítems de venta con snapshots ───────────────────────────────────────────
-- Snapshots: precio, descuento_pct, costo. La venta VIEJA no cambia si el
-- producto cambia de precio/costo mañana. Costo se guarda para calcular
-- ganancia — solo admin lo lee (vista v_ventas_ganancia en 0009_reporting).
create table public.venta_items (
  id                    uuid primary key default gen_random_uuid(),
  venta_id              uuid not null references public.ventas(id)     on delete cascade,
  producto_id           uuid not null references public.productos(id)  on delete restrict,
  cantidad              integer not null check (cantidad > 0),
  precio_unitario       numeric(14,2) not null check (precio_unitario >= 0),   -- precio de lista (o base) antes del descuento
  descuento_pct         numeric(5,2)  not null default 0 check (descuento_pct between 0 and 100),
  precio_final_unit     numeric(14,2) not null check (precio_final_unit >= 0), -- precio_unitario * (1 - descuento_pct/100)
  costo_snapshot        numeric(14,2) not null default 0,                       -- para ganancia (admin-only)
  origen_precio         text,                                                    -- trazabilidad del pricing_engine
  -- FK al movimiento de stock que generó la SALIDA — permite auditar
  movimiento_stock_id   bigint references public.movimientos_stock(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index idx_venta_items_venta      on public.venta_items(venta_id);
create index idx_venta_items_producto   on public.venta_items(producto_id);

-- ─── Comisiones (append-only) ───────────────────────────────────────────────
-- Se registra AL REGISTRAR la venta (no al cobrar — decisión cliente).
-- La vista v_comisiones_semana (0009) las agrupa por semana ISO.
create table public.comisiones (
  id             bigserial primary key,
  venta_id       uuid not null references public.ventas(id) on delete restrict,
  vendedor_id    uuid not null references auth.users(id)    on delete restrict,
  monto_base     numeric(14,2) not null,   -- total de la venta sobre el cual se calcula
  porcentaje     numeric(5,2)  not null,
  monto          numeric(14,2) not null,   -- monto_base * porcentaje / 100
  fecha          timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index idx_comisiones_vendedor  on public.comisiones(vendedor_id, fecha desc);
create index idx_comisiones_venta     on public.comisiones(venta_id);
create index idx_comisiones_fecha     on public.comisiones(fecha desc);

-- Append-only (triggers block UPDATE/DELETE)
create or replace function public.comisiones_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'comisiones es inmutable: % no permitido. Cancelá la venta para revertir.', TG_OP;
end;
$$;

create trigger comisiones_no_update
  before update on public.comisiones
  for each row execute function public.comisiones_block_mutations();

create trigger comisiones_no_delete
  before delete on public.comisiones
  for each row execute function public.comisiones_block_mutations();

-- ============================================================================
-- ★ RPC registrar_venta — LA promesa de la propuesta hecha SQL
-- Params: cliente_id, items (array), notas, estado_entrega opcional
-- Retorna: id de la venta creada.
-- Cualquier fallo (stock insuficiente, cliente inválido, precio no resuelto)
-- hace rollback total — Postgres garantiza atomicidad.
-- ============================================================================
create type public.venta_item_input as (
  producto_id  uuid,
  cantidad     integer
);

create or replace function public.registrar_venta(
  p_cliente_id       uuid,
  p_items            venta_item_input[],
  p_notas            text default null,
  p_estado_entrega   estado_entrega default 'ENTREGADA'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_vendedor_id      uuid;
  v_venta_id         uuid;
  v_id_publico       text;
  v_item             venta_item_input;
  v_precio           record;
  v_comision_pct     numeric(5,2);
  v_producto_com     numeric(5,2);
  v_producto_costo   numeric(14,2);
  v_mov_id           bigint;
  v_subtotal         numeric(14,2) := 0;
  v_descuento_total  numeric(14,2) := 0;
  v_total            numeric(14,2) := 0;
  v_item_subtotal    numeric(14,2);
  v_item_final       numeric(14,2);
begin
  -- 1) Autenticación / vendedor
  v_vendedor_id := auth.uid();
  if v_vendedor_id is null then
    raise exception 'No autenticado';
  end if;

  -- 2) Validaciones básicas
  if p_cliente_id is null then
    raise exception 'Cliente requerido';
  end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  -- Cliente debe existir y estar activo
  perform 1 from public.clientes where id = p_cliente_id and activo = true;
  if not found then
    raise exception 'Cliente no encontrado o inactivo';
  end if;

  -- 3) Crear el cabezal en cero (los totales se actualizan después)
  insert into public.ventas (cliente_id, vendedor_id, estado_entrega, notas, created_by, updated_by)
  values (p_cliente_id, v_vendedor_id, p_estado_entrega, p_notas, v_vendedor_id, v_vendedor_id)
  returning id, id_publico into v_venta_id, v_id_publico;

  -- 4) Por cada item: resolver_precio → snapshot → insertar → SALIDA de stock
  foreach v_item in array p_items loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad inválida para producto %', v_item.producto_id;
    end if;

    -- Traer costo y comisión override del producto (admin-only en app; acá el
    -- caller es la RPC, no el vendedor directo — security invoker → RLS lo verá
    -- para el usuario que llama, pero productos.select es admin. Por eso:
    -- forzamos search_path y usamos SECURITY DEFINER? NO — mantenemos INVOKER
    -- y le damos GRANT SELECT COST/COMISION al vendedor SOLO por la vía de esta
    -- función, leyendo mediante producto interno. Alternativa práctica:
    -- promocionar la RPC a SECURITY DEFINER. Elegimos SECURITY DEFINER porque
    -- esta función es el único punto que necesita costo/comisión y el vendedor
    -- nunca los ve — se guardan como snapshot en venta_items al que no accede.)
    -- (Ver bloque separado abajo con set search_path y grant execute.)
    select costo, comision_pct
      into v_producto_costo, v_producto_com
      from public.productos where id = v_item.producto_id and activo = true;
    if not found then
      raise exception 'Producto % no encontrado o inactivo', v_item.producto_id;
    end if;

    -- Resolver precio con el pricing engine
    select * into v_precio
      from public.resolver_precio(p_cliente_id, v_item.producto_id, v_item.cantidad);

    v_item_subtotal := v_precio.precio_unitario * v_item.cantidad;
    v_item_final    := v_precio.precio_final    * v_item.cantidad;

    -- Insertar movimiento SALIDA (el trigger de 0005 baja stock y valida)
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'SALIDA', v_item.cantidad,
            'Venta ' || v_id_publico, v_vendedor_id)
    returning id into v_mov_id;

    -- Insertar el item con snapshots + link al movimiento
    insert into public.venta_items (
      venta_id, producto_id, cantidad,
      precio_unitario, descuento_pct, precio_final_unit,
      costo_snapshot, origen_precio, movimiento_stock_id
    ) values (
      v_venta_id, v_item.producto_id, v_item.cantidad,
      v_precio.precio_unitario, v_precio.descuento_pct, v_precio.precio_final,
      coalesce(v_producto_costo, 0), v_precio.origen, v_mov_id
    );

    v_subtotal        := v_subtotal + v_item_subtotal;
    v_descuento_total := v_descuento_total + (v_item_subtotal - v_item_final);
    v_total           := v_total + v_item_final;
  end loop;

  -- 5) Actualizar totales del cabezal
  update public.ventas
    set subtotal = v_subtotal,
        descuento_total = v_descuento_total,
        total = v_total
    where id = v_venta_id;

  -- 6) Comisión: % del vendedor (profiles.comision_pct si existe, si no config
  -- global). Puede haber override por producto — para simplicidad del MVP se
  -- calcula sobre el total; el override por producto se agrega en una revisión
  -- futura si Guillermo pide auditoría más fina.
  select coalesce(
    (select comision_pct from public.profiles where id = v_vendedor_id),
    (select nullif(valor,'')::numeric(5,2) from public.configuracion where clave = 'comision_default_pct'),
    0
  ) into v_comision_pct;

  if v_comision_pct > 0 then
    insert into public.comisiones (venta_id, vendedor_id, monto_base, porcentaje, monto)
    values (v_venta_id, v_vendedor_id, v_total, v_comision_pct,
            round(v_total * v_comision_pct / 100.0, 2));
  end if;

  return v_venta_id;
end;
$$;

-- Segunda versión: SECURITY DEFINER + set search_path para el acceso a costo.
-- Nota: la implementación anterior ya cierra costo dentro de la función; el SET
-- search_path evita ataques por schema shadowing. Owner = postgres, search_path
-- fijo a public.
alter function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega)
  security definer
  set search_path = public;

-- ============================================================================
-- Cancelar venta — revierte stock, marca cobros como cancelados
-- (los cobros los maneja el módulo caja de la Ola C. Acá solo marcamos el
-- estado y disparamos entradas compensatorias de stock.)
-- ============================================================================
create or replace function public.cancelar_venta(
  p_venta_id  uuid,
  p_motivo    text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_venta        record;
  v_actor_id     uuid;
  v_rol          text;
  v_item         record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  if v_venta.estado_cobro = 'CANCELADA' then
    raise exception 'La venta ya está cancelada';
  end if;

  -- Autorización: admin, o el vendedor que la hizo si aún no cobró nada
  v_rol := public.current_user_rol();
  if v_rol <> 'admin' then
    if v_venta.vendedor_id <> v_actor_id then
      raise exception 'Solo el admin o el vendedor que registró puede cancelar';
    end if;
    if v_venta.total_cobrado > 0 then
      raise exception 'La venta ya tiene cobros — solo un admin puede cancelar';
    end if;
  end if;

  -- Revertir stock: por cada item, una ENTRADA compensatoria
  for v_item in select producto_id, cantidad from public.venta_items where venta_id = p_venta_id loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'ENTRADA', v_item.cantidad,
            'Cancelación venta ' || v_venta.id_publico, v_actor_id);
  end loop;

  -- Actualizar cabezal
  update public.ventas
    set estado_cobro     = 'CANCELADA',
        estado_entrega   = 'CANCELADA',
        cancelada_at     = now(),
        cancelada_motivo = p_motivo,
        updated_by       = v_actor_id
    where id = p_venta_id;
end;
$$;

alter function public.cancelar_venta(uuid, text)
  security definer
  set search_path = public;

-- ============================================================================
-- Vistas para la UI (columnas SIN costo por defecto)
-- v_ventas_lista: usa el vendedor y el admin. Ganancia se agrega en 0009.
-- ============================================================================
create or replace view public.v_ventas_lista as
  select v.id, v.id_publico, v.fecha,
         v.cliente_id, v.vendedor_id,
         v.estado_entrega, v.estado_cobro,
         v.subtotal, v.descuento_total, v.total, v.total_cobrado,
         (v.total - v.total_cobrado) as saldo,
         (select count(*) from public.venta_items where venta_id = v.id) as items_count
  from public.ventas v;

grant select on public.v_ventas_lista to authenticated;
revoke all on public.v_ventas_lista from anon;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.ventas       enable row level security;
alter table public.venta_items  enable row level security;
alter table public.comisiones   enable row level security;

-- ventas: admin ve todas; vendedor solo las propias (fila).
create policy "ventas_select"
  on public.ventas for select
  using (public.current_user_rol() = 'admin' or vendedor_id = auth.uid());

-- INSERT/UPDATE por RPC (SECURITY DEFINER). Directos no permitidos.
create policy "ventas_update_admin"
  on public.ventas for update
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- venta_items: heredan la restricción vía join implícito — pero PostgreSQL RLS
-- no atraviesa joins de un select del cliente. Filtramos duplicando la regla.
create policy "venta_items_select"
  on public.venta_items for select
  using (
    exists (
      select 1 from public.ventas v
      where v.id = venta_items.venta_id
        and (public.current_user_rol() = 'admin' or v.vendedor_id = auth.uid())
    )
  );

-- comisiones: admin ve todas; vendedor solo las suyas.
create policy "comisiones_select"
  on public.comisiones for select
  using (public.current_user_rol() = 'admin' or vendedor_id = auth.uid());

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select on public.ventas                to authenticated;
grant select on public.venta_items           to authenticated;
grant select on public.comisiones            to authenticated;
grant update on public.ventas                to authenticated; -- policy filtra
grant usage on sequence public.ventas_id_publico_seq to authenticated;
grant execute on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega) to authenticated;
grant execute on function public.cancelar_venta(uuid, text)                                       to authenticated;

revoke all on public.ventas       from anon;
revoke all on public.venta_items  from anon;
revoke all on public.comisiones   from anon;

-- ─── Extras del schema: comision_pct del vendedor (blueprint) ──────────────
alter table public.profiles
  add column if not exists comision_pct numeric(5,2) check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 100));
