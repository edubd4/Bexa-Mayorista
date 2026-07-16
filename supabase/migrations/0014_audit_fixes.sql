-- ============================================================================
-- BEXA · Audit fixes (0014) — hallazgos del audit sistemático pre-entrega
-- Depende de: 0005, 0008, 0009, 0011.
--
-- A. v_campana_metricas: el monto automático sumaba el total de la venta UNA
--    VEZ POR ITEM matcheado (fan-out del join con venta_items). Una venta con
--    2 productos de la campaña contaba doble. Fix: dedupe de ventas antes de
--    agregar.
-- B. v_comisiones_semana: sumaba comisiones de ventas CANCELADAS (la tabla
--    comisiones es append-only y cancelar_venta no la toca — el contrato es
--    que la liquidación EXCLUYE canceladas vía vista). Fix: join a ventas.
-- C. v_ranking_productos: las unidades de ventas canceladas sumaban al ranking
--    (el filtro estaba en el ON de un LEFT JOIN que no participa del SUM).
--    Fix: EXISTS sobre ventas no canceladas en el join de items.
-- D. recibir_compra: SECURITY DEFINER sin check de rol — cualquier vendedor
--    podía crear compras llamando el RPC directo (el RLS admin-only no aplica
--    a DEFINER). Fix: check explícito de admin, igual que cancelar_compra.
-- E. movimientos_stock: policy de INSERT era para cualquier authenticated —
--    un vendedor podía insertar AJUSTEs arbitrarios por supabase-js. El único
--    caller legítimo no-admin es registrar_venta, que es SECURITY DEFINER y
--    no pasa por RLS. Fix: policy admin-only.
-- F. Timezone: v_campanas y la ventana de campaña en resolver_precio usaban
--    current_date (UTC en Supabase) — una campaña del día 20 se "activaba" a
--    las 21:00 del 19 hora argentina. Fix: helper hoy_local() con TZ AR.
-- ============================================================================

-- ─── F. Helper de fecha local Argentina ─────────────────────────────────────
create or replace function public.hoy_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

grant execute on function public.hoy_local() to authenticated;

-- ─── A. v_campana_metricas sin fan-out ──────────────────────────────────────
-- Nota: usamos DROP + CREATE en vez de CREATE OR REPLACE — Postgres 42P16 rechaza
-- CREATE OR REPLACE VIEW si cambia la firma (nombre/tipo/orden) de cualquier
-- columna, aunque sea idéntica en apariencia. GRANT + REVOKE se re-aplican abajo.
drop view if exists public.v_campana_metricas;
create view public.v_campana_metricas as
  with base_manual as (
    select
      v.campana_id,
      count(*)::integer                     as ventas_manuales,
      coalesce(sum(v.total), 0)::numeric(14,2) as monto_manual
    from public.ventas v
    where v.campana_id is not null
      and v.estado_cobro <> 'CANCELADA'
    group by v.campana_id
  ),
  -- Dedupe: una fila por (campaña, venta) aunque la venta tenga N items de la campaña
  ventas_auto as (
    select distinct cp.campana_id, v.id as venta_id, v.total
    from public.campana_productos cp
    join public.campanas c    on c.id = cp.campana_id
    join public.venta_items vi on vi.producto_id = cp.producto_id
    join public.ventas v      on v.id = vi.venta_id
    where v.estado_cobro <> 'CANCELADA'
      and v.fecha::date between c.fecha_inicio and c.fecha_fin
      and (v.campana_id is null or v.campana_id <> cp.campana_id)
  ),
  base_auto as (
    select
      campana_id,
      count(*)::integer                       as ventas_automaticas,
      coalesce(sum(total), 0)::numeric(14,2)  as monto_automatico
    from ventas_auto
    group by campana_id
  )
  select
    c.id as campana_id,
    coalesce(bm.ventas_manuales, 0)     as ventas_manuales,
    coalesce(bm.monto_manual, 0)::numeric(14,2)     as monto_manual,
    coalesce(ba.ventas_automaticas, 0)  as ventas_automaticas,
    coalesce(ba.monto_automatico, 0)::numeric(14,2) as monto_automatico,
    (coalesce(bm.ventas_manuales, 0) + coalesce(ba.ventas_automaticas, 0)) as ventas_totales,
    (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0))::numeric(14,2) as monto_total,
    coalesce(g.monto, 0)::numeric(14,2) as costo,
    case
      when coalesce(g.monto, 0) > 0 then
        round(
          (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0) - g.monto)
          / g.monto * 100, 2)
      else null
    end as roi_pct,
    case
      when (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)) > 0 then
        round(
          (coalesce(bm.monto_manual,0) + coalesce(ba.monto_automatico,0))
          / (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)),
          2)
      else 0
    end::numeric(14,2) as ticket_promedio
  from public.campanas c
  left join base_manual bm on bm.campana_id = c.id
  left join base_auto   ba on ba.campana_id = c.id
  left join public.gastos g on g.id = c.gasto_id;

-- Re-aplicar grants/revoke (DROP los borra)
grant select on public.v_campana_metricas to authenticated;
revoke all  on public.v_campana_metricas from anon;

-- ─── B. v_comisiones_semana excluye ventas canceladas ───────────────────────
drop view if exists public.v_comisiones_semana;
create view public.v_comisiones_semana as
  select
    co.vendedor_id,
    date_trunc('week', co.fecha)::date as semana_inicio,
    count(*)::integer                  as ventas_count,
    sum(co.monto_base)::numeric(14,2)  as base,
    sum(co.monto)::numeric(14,2)       as total
  from public.comisiones co
  join public.ventas v on v.id = co.venta_id
  where v.estado_cobro <> 'CANCELADA'
  group by co.vendedor_id, date_trunc('week', co.fecha);

grant select on public.v_comisiones_semana to authenticated;
revoke all  on public.v_comisiones_semana from anon;

-- ─── C. v_ranking_productos sin unidades de canceladas ──────────────────────
drop view if exists public.v_ranking_productos;
create view public.v_ranking_productos as
  select
    p.id, p.id_publico, p.nombre, p.categoria, p.marca,
    coalesce(sum(vi.cantidad), 0)::integer as unidades_vendidas,
    coalesce(sum(vi.precio_final_unit * vi.cantidad), 0)::numeric(14,2) as facturado,
    count(distinct vi.venta_id)::integer as ventas_count
  from public.productos p
  left join public.venta_items vi
    on vi.producto_id = p.id
   and exists (
     select 1 from public.ventas v
     where v.id = vi.venta_id and v.estado_cobro <> 'CANCELADA'
   )
  where p.activo = true
  group by p.id;

-- ─── D. recibir_compra con check de admin ───────────────────────────────────
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
  v_rol          text;
  v_compra_id    uuid;
  v_id_publico   text;
  v_item         compra_item_input;
  v_mov_id       bigint;
  v_total        numeric(14,2) := 0;
  v_subtotal     numeric(14,2);
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  -- Compras es admin-only (matriz §6). SECURITY DEFINER no pasa por RLS,
  -- así que el check tiene que vivir acá — igual que en cancelar_compra.
  v_rol := public.current_user_rol();
  if v_rol <> 'admin' then
    raise exception 'Solo un admin puede registrar compras';
  end if;

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

  insert into public.compras (
    proveedor_id, numero_factura, notas, fecha, created_by, updated_by
  ) values (
    p_proveedor_id, p_numero_factura, p_notas, coalesce(p_fecha, now()), v_actor_id, v_actor_id
  ) returning id, id_publico into v_compra_id, v_id_publico;

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

    update public.productos
      set costo = v_item.costo_unitario,
          updated_at = now(),
          updated_by = v_actor_id
      where id = v_item.producto_id;
  end loop;

  update public.compras set total = v_total where id = v_compra_id;

  return v_compra_id;
end;
$$;

alter function public.recibir_compra(uuid, compra_item_input[], text, text, timestamptz)
  security definer
  set search_path = public;

-- ─── E. movimientos_stock INSERT admin-only ─────────────────────────────────
-- El path del vendedor (registrar_venta) es SECURITY DEFINER → no pasa por RLS.
-- Los AJUSTEs manuales y el stock inicial son de admin. Nadie más inserta directo.
drop policy if exists "movstock_insert_authenticated" on public.movimientos_stock;

create policy "movstock_insert_admin"
  on public.movimientos_stock for insert
  to authenticated
  with check (public.current_user_rol() = 'admin');

grant select on public.v_ranking_productos to authenticated;
revoke all  on public.v_ranking_productos from anon;

-- ─── F (cont.). v_campanas con fecha local AR ───────────────────────────────
drop view if exists public.v_campanas;
create view public.v_campanas as
  select
    c.*,
    coalesce(
      c.estado_manual::text,
      case
        when public.hoy_local() < c.fecha_inicio then 'PROGRAMADA'
        when public.hoy_local() > c.fecha_fin    then 'CONCLUIDA'
        else 'ACTIVA'
      end
    ) as estado_efectivo,
    g.monto as costo_real,
    (
      select count(*)::integer
      from public.campana_canal_asignaciones a
      where a.campana_id = c.id
    ) as canales_count,
    (
      select count(*)::integer
      from public.campana_productos cp
      where cp.campana_id = c.id
    ) as productos_count,
    (
      select count(*)::integer
      from public.campana_publicaciones p
      where p.campana_id = c.id
    ) as publicaciones_count
  from public.campanas c
  left join public.gastos g on g.id = c.gasto_id;

grant select on public.v_campanas to authenticated;
revoke all  on public.v_campanas from anon;

-- ─── F (cont.). resolver_precio con ventana de campaña en fecha local AR ────
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

  select precio_base, categoria into v_precio_base, v_categoria
    from public.productos where id = p_producto_id;
  if v_precio_base is null then
    raise exception 'producto % no encontrado', p_producto_id;
  end if;

  if p_cliente_id is not null then
    select lista_precio_id into v_lista_id
      from public.clientes where id = p_cliente_id;
  end if;

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

  with reglas_candidatas as (
    select r.*,
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
    left join public.campanas c on c.id = r.campana_id
    where r.activo
      and p_cantidad >= r.cantidad_min
      and (
        (r.scope = 'PRODUCTO'  and r.producto_id = p_producto_id) or
        (r.scope = 'CATEGORIA' and lower(coalesce(r.categoria,'')) = lower(coalesce(v_categoria,''))) or
        (r.scope = 'GLOBAL')
      )
      and (r.lista_precio_id is null or r.lista_precio_id = v_lista_id)
      -- Ventana de campaña en fecha LOCAL Argentina (fix F del audit)
      and (
        r.campana_id is null
        or (
          public.hoy_local() between c.fecha_inicio and c.fecha_fin
          and (c.estado_manual is null or c.estado_manual not in ('PAUSADA','CANCELADA','BORRADOR'))
        )
      )
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
