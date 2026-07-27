-- ============================================================================
-- BEXA · 0022 · Precios por tramo de cantidad
--
-- PEDIDO DEL CLIENTE (2026-07-27)
-- "Dependiendo la cantidad que se vende, el precio se modifica": el producto
-- tiene un precio para 1-9 unidades, otro de 10 en adelante, otro por bulto.
-- No es un descuento porcentual (eso ya existe: reglas_descuento) — es un
-- PRECIO ABSOLUTO por tramo, editable.
--
-- LA REGLA: EL TRAMO PISA TODO (decisión del cliente 2026-07-27)
-- Si hay un tramo que aplique a la cantidad pedida, ESE es el precio final.
-- No se apilan lista de precios ni reglas de descuento encima — un solo
-- beneficio por cantidad, predecible y auditable. Lista y descuentos siguen
-- funcionando igual que siempre para los productos SIN tramo.
--
-- Cómo se elige el tramo: el de mayor cantidad_min que la cantidad pedida
-- alcance. Con tramos 1→$100, 10→$90, 50→$80: pedir 7 paga $100, pedir 12
-- paga $90, pedir 200 paga $80. Un tramo con cantidad_min = 1 reemplaza al
-- precio_base para cualquier cantidad.
-- ============================================================================

-- ─── Tabla ──────────────────────────────────────────────────────────────────
create table public.productos_precios_tramo (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos(id) on delete cascade,
  cantidad_min  integer not null check (cantidad_min >= 1),
  precio        numeric(14,2) not null check (precio > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_by    uuid references auth.users(id),
  -- Un solo precio por escalón: "editar" un tramo es upsert sobre esta clave.
  unique (producto_id, cantidad_min)
);

create index idx_precios_tramo_producto
  on public.productos_precios_tramo(producto_id, cantidad_min desc);

create trigger precios_tramo_touch_updated_at
  before update on public.productos_precios_tramo
  for each row execute function public.touch_updated_at();

-- ─── RLS: select authenticated, escritura admin ─────────────────────────────
-- Mismo criterio que listas_precios_items: el vendedor NECESITA leer el precio
-- para vender (resolver_precio es security invoker) y el precio de venta no es
-- una columna sensible (el costo sí, y acá no está). Los tramos los define el
-- admin, como toda la política de precios.
alter table public.productos_precios_tramo enable row level security;

create policy "precios_tramo_select_authenticated"
  on public.productos_precios_tramo for select
  to authenticated using (public.current_user_rol() is not null);

create policy "precios_tramo_write_admin"
  on public.productos_precios_tramo for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

grant select, insert, update, delete on public.productos_precios_tramo to authenticated;
revoke all on public.productos_precios_tramo from anon;

-- ─── resolver_precio: el tramo entra ANTES que lista y descuentos ───────────
-- Cuerpo idéntico al de la 0014 (ventana de campaña en fecha local AR incluida)
-- más el early-return del tramo. Si el tramo aplica: precio_unitario =
-- precio_final = tramo, descuento 0, origen 'tramo_cantidad' — y no se evalúa
-- nada más. Ver el encabezado: EL TRAMO PISA TODO.
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
  v_precio_tramo    numeric(14,2);
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

  -- Tramo por cantidad (0022): el escalón más alto que la cantidad alcance.
  select pt.precio into v_precio_tramo
    from public.productos_precios_tramo pt
    where pt.producto_id = p_producto_id
      and p_cantidad >= pt.cantidad_min
    order by pt.cantidad_min desc
    limit 1;

  if v_precio_tramo is not null then
    return query select
      v_precio_tramo          as precio_unitario,
      v_precio_tramo          as precio_final,
      0::numeric(5,2)         as descuento_pct,
      'tramo_cantidad'::text  as origen;
    return;
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

comment on table public.productos_precios_tramo is
  'Precio ABSOLUTO por tramo de cantidad por producto. Si un tramo aplica, PISA lista de precios y reglas de descuento (decision del cliente 2026-07-27). Editar = upsert sobre (producto_id, cantidad_min). Ver 0022.';
