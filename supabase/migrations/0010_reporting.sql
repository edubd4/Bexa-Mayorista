-- ============================================================================
-- BEXA · Ola D · Vistas de reporting (0010)
-- Sin nuevas tablas — solo vistas y funciones que combinan lo existente.
-- Objetivo: panel con KPIs reales, alertas, contabilidad, por-cobrar, ganancia,
-- comisiones semanales. Todas las policies siguen siendo las de las tablas base.
-- ============================================================================

-- ─── Ventas con saldo (usada por /finanzas y por-cobrar) ────────────────────
create or replace view public.v_ventas_con_saldo as
  select
    v.id, v.id_publico, v.fecha, v.cliente_id, v.vendedor_id,
    v.estado_entrega, v.estado_cobro,
    v.total, v.total_cobrado,
    (v.total - v.total_cobrado)::numeric(14,2) as saldo,
    extract(day from (now() - v.fecha))::integer as dias_desde_venta
  from public.ventas v
  where v.estado_cobro in ('PENDIENTE', 'PARCIAL');

grant select on public.v_ventas_con_saldo to authenticated;
revoke all on public.v_ventas_con_saldo from anon;

-- ─── Stock bajo (evita comparar dos columnas en supabase-js) ────────────────
create or replace view public.v_stock_bajo as
  select
    id, id_publico, sku, nombre, categoria, marca,
    stock_actual, stock_minimo,
    (stock_minimo - stock_actual)::integer as faltante
  from public.productos
  where activo = true
    and stock_minimo > 0
    and stock_actual <= stock_minimo;

grant select on public.v_stock_bajo to authenticated;
revoke all on public.v_stock_bajo from anon;

-- ─── Ranking de productos más vendidos (unidades y monto) ───────────────────
create or replace view public.v_ranking_productos as
  select
    p.id, p.id_publico, p.nombre, p.categoria,
    coalesce(sum(vi.cantidad), 0)::integer as unidades_vendidas,
    coalesce(sum(vi.precio_final_unit * vi.cantidad), 0)::numeric(14,2) as facturado,
    count(distinct vi.venta_id)::integer as ventas_count
  from public.productos p
  left join public.venta_items vi on vi.producto_id = p.id
  left join public.ventas v       on v.id = vi.venta_id and v.estado_cobro <> 'CANCELADA'
  where p.activo = true
  group by p.id;

grant select on public.v_ranking_productos to authenticated;
revoke all on public.v_ranking_productos from anon;

-- ─── Ranking de vendedores (ventas del período reciente) ────────────────────
create or replace view public.v_ranking_vendedores as
  select
    pr.id as vendedor_id, pr.nombre as vendedor_nombre,
    count(v.id)::integer as ventas_count,
    coalesce(sum(v.total), 0)::numeric(14,2) as facturado,
    coalesce(sum(c.monto), 0)::numeric(14,2) as comisiones_generadas
  from public.profiles pr
  left join public.ventas v on v.vendedor_id = pr.id and v.estado_cobro <> 'CANCELADA'
  left join public.comisiones c on c.venta_id = v.id
  where pr.activo = true
  group by pr.id;

grant select on public.v_ranking_vendedores to authenticated;
revoke all on public.v_ranking_vendedores from anon;

-- ─── Clientes inactivos + ticket promedio + productos favoritos ─────────────
-- Se calcula el ranking de productos por cliente en la app (para el mensaje de
-- reactivación); acá solo la lista de inactivos con métricas básicas.
create or replace view public.v_clientes_inactivos as
  select
    c.id, c.id_publico, c.tipo, c.nombre, c.apellido, c.razon_social,
    c.telefono, c.whatsapp, c.instagram, c.email,
    max(v.fecha) as ultima_venta,
    extract(day from (now() - max(v.fecha)))::integer as dias_sin_comprar,
    count(v.id)::integer as ventas_totales,
    coalesce(sum(v.total), 0)::numeric(14,2) as facturado_total,
    case when count(v.id) > 0
         then (coalesce(sum(v.total), 0) / count(v.id))::numeric(14,2)
         else 0::numeric(14,2)
    end as ticket_promedio
  from public.clientes c
  left join public.ventas v on v.cliente_id = c.id and v.estado_cobro <> 'CANCELADA'
  where c.activo = true
    and c.id <> '00000000-0000-0000-0000-000000000001'   -- Consumidor Final
  group by c.id;

grant select on public.v_clientes_inactivos to authenticated;
revoke all on public.v_clientes_inactivos from anon;

-- ─── KPIs del panel (día / semana / mes) ────────────────────────────────────
-- Usa fechas del server. En la UI se filtra según TZ Argentina.
create or replace function public.kpi_ventas_periodo(
  p_desde  timestamptz,
  p_hasta  timestamptz,
  p_vendedor_id uuid default null
)
returns table (
  ventas_count   integer,
  facturado      numeric(14,2),
  cobrado        numeric(14,2),
  por_cobrar     numeric(14,2),
  ticket_prom    numeric(14,2)
)
language sql stable security invoker as $$
  select
    count(v.id)::integer                                                    as ventas_count,
    coalesce(sum(v.total), 0)::numeric(14,2)                                as facturado,
    coalesce(sum(v.total_cobrado), 0)::numeric(14,2)                        as cobrado,
    coalesce(sum(v.total - v.total_cobrado), 0)::numeric(14,2)              as por_cobrar,
    case when count(v.id) > 0
         then (coalesce(sum(v.total), 0) / count(v.id))::numeric(14,2)
         else 0::numeric(14,2)
    end                                                                      as ticket_prom
  from public.ventas v
  where v.fecha >= p_desde
    and v.fecha <  p_hasta
    and v.estado_cobro <> 'CANCELADA'
    and (p_vendedor_id is null or v.vendedor_id = p_vendedor_id);
$$;

grant execute on function public.kpi_ventas_periodo(timestamptz, timestamptz, uuid) to authenticated;

-- ─── Contador de alertas (para el banner del panel) ─────────────────────────
create or replace function public.contar_alertas()
returns table (
  stock_bajo         integer,
  saldos_pendientes  integer,
  entregas_atrasadas integer
)
language sql stable security invoker as $$
  select
    (select count(*)::integer from public.v_stock_bajo)                       as stock_bajo,
    (select count(*)::integer from public.v_ventas_con_saldo
       where dias_desde_venta > coalesce(
         (select nullif(valor,'')::integer from public.configuracion
          where clave = 'alerta_saldo_vencido_dias'), 30))                    as saldos_pendientes,
    (select count(*)::integer from public.ventas
      where estado_entrega in ('PEDIDO', 'EN_PREPARACION')
        and fecha < now() - interval '7 days')                                as entregas_atrasadas;
$$;

grant execute on function public.contar_alertas() to authenticated;

-- ─── Seeds de configuración de la Ola D ────────────────────────────────────
insert into public.configuracion (clave, valor, descripcion) values
  ('alerta_saldo_vencido_dias',       '30', 'Días desde la venta para considerar el saldo vencido'),
  ('alerta_cliente_inactivo_dias',    '60', 'Días sin comprar para considerar un cliente inactivo')
on conflict (clave) do nothing;
