-- ============================================================================
-- BEXA · 0028 · Dos pedidos del cliente (2026-07-29)
--
--   A. Costos por campaña: hoy la publicidad se paga y no hay dónde cargarla.
--   B. El empleado (rol `colaborador`) hace el CRUD completo de productos y
--      clientes, precios por cantidad incluidos.
--
-- ─── CONTEXTO DE A ─────────────────────────────────────────────────────────
-- La 0011 dejó `campanas.gasto_id`: UN gasto por campaña. Y el CampanaForm
-- NUNCA renderizó ese campo — está en el validator y en el edit page, pero no
-- hay input. Consecuencia: `v_campanas.costo_real` y `v_campana_metricas.roi_pct`
-- vienen en null desde el día uno. La métrica estaba construida y no tenía con
-- qué calcular.
--
-- Y hay un segundo cierre: `registrar_gasto` (0019) es admin-only, pero las
-- campañas las gestiona MARKETING desde la 0017. El que maneja la campaña no
-- podía registrar lo que gastó ni aunque hubiera campo.
--
-- EL DISEÑO: el costo de campaña ES un gasto de caja (decisión del cliente
-- 2026-07-29). Se da vuelta la relación — `gastos.campana_id`, 1 campaña → N
-- gastos — porque no se gasta una sola vez: se paga Instagram el 5, Facebook el
-- 12, un influencer el 20. Un solo asiento por pago, visible al mismo tiempo en
-- caja, en finanzas y en el ROI. Cargar el costo aparte de la caja habría sido
-- doble contabilidad, y los números dejan de cerrar el día que alguien carga el
-- mismo pago dos veces.
--
-- ─── CONTEXTO DE B ─────────────────────────────────────────────────────────
-- Estado previo: el vendedor solo podía DAR DE ALTA productos (RPC de la 0017).
-- Editar, dar de baja y los precios por cantidad eran admin-only, y clientes lo
-- era entero. El cliente lo quiere todo abierto — queda auditado en el historial
-- maestro con nombre y apellido.
--
-- LA ASIMETRÍA (productos por RPC, clientes por RLS) NO ES INCONSISTENCIA:
--   · `productos_select_admin` (0005) le bloquea al vendedor hasta el SELECT,
--     para proteger `costo` y `comision_pct`. Un UPDATE por RLS es imposible: la
--     policy ni siquiera le deja VER la fila que quiere tocar. Aflojarla le
--     abriría la lectura de los costos de todo el catálogo — se rompe la regla
--     de oro de CLAUDE.md. Por eso va RPC SECURITY DEFINER con lista blanca,
--     mismo patrón que la 0017 y la 0020.
--   · `clientes_select_authenticated` (0004) ya lo deja leer. No hay columna
--     oculta que proteger salvo `lista_precio_id` — y eso lo resuelve un
--     trigger, sin necesidad de un RPC de 17 parámetros.
-- ============================================================================


-- ============================================================================
-- PARTE A · COSTOS POR CAMPAÑA
-- ============================================================================

-- ─── A.1 · gastos.campana_id ────────────────────────────────────────────────
-- `on delete set null`: si se borrara una campaña, el gasto NO se va con ella.
-- La plata salió igual — lo que se pierde es la atribución, no el asiento.
alter table public.gastos
  add column campana_id uuid references public.campanas(id) on delete set null;

create index idx_gastos_campana on public.gastos(campana_id) where campana_id is not null;

comment on column public.gastos.campana_id is
  'Campana a la que se imputa este gasto (0028). Reemplaza a campanas.gasto_id, que era 1:1 y no tenia UI.';

-- ─── A.2 · Categorías habilitadas para marketing ────────────────────────────
-- Marketing puede registrar gastos, pero NO cualquier gasto: solo los de
-- publicidad y solo imputados a una campaña. Sin este flag habría que elegir
-- entre dejarlo fuera (y que no pueda cargar lo suyo) o abrirle la caja entera.
alter table public.categorias_gasto
  add column es_publicidad boolean not null default false;

comment on column public.categorias_gasto.es_publicidad is
  'Categoria que el rol marketing puede usar en registrar_gasto, y solo con campana_id. Ver 0028.';

insert into public.categorias_gasto (nombre, descripcion, es_publicidad) values
  ('Publicidad', 'Pauta, contenido y difusión de campañas', true)
on conflict do nothing;

-- Por si el admin ya se había creado la categoría a mano con otro nombre.
update public.categorias_gasto
   set es_publicidad = true
 where es_publicidad = false
   and lower(nombre) in ('publicidad', 'marketing', 'pauta', 'difusión', 'difusion');

-- ─── A.3 · Backfill del gasto 1:1 que hubiera ───────────────────────────────
-- `gastos` es append-only: los triggers `gastos_no_update` / `gastos_no_delete`
-- (0009, afinados en 0023) rechazan cualquier UPDATE que no sea la marca de
-- anulación. Este backfill es una migración de estructura, no una mutación de
-- negocio — se desactiva el trigger para el ALTER de datos y se vuelve a
-- prender. Si esto no estuviera, el UPDATE de abajo falla con la excepción del
-- trigger y la migración se corta a la mitad.
alter table public.gastos disable trigger gastos_no_update;

update public.gastos g
   set campana_id = c.id
  from public.campanas c
 where c.gasto_id = g.id
   and g.campana_id is null;

alter table public.gastos enable trigger gastos_no_update;

comment on column public.campanas.gasto_id is
  'DEPRECADO por la 0028 — el costo de campana ahora vive en gastos.campana_id (1:N). Se conserva por historia; ninguna vista ni pantalla lo lee. No escribir.';

-- ─── A.4 · registrar_gasto con campaña ──────────────────────────────────────
-- DROP + CREATE, no `create or replace`: agregar un parámetro con default crea
-- una SOBRECARGA nueva en vez de reemplazar la función. Las dos firmas
-- coexistirían y una llamada con 6 argumentos quedaría ambigua (42725).
drop function if exists public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text);

create or replace function public.registrar_gasto(
  p_categoria_id  bigint,
  p_monto         numeric,
  p_descripcion   text,
  p_fecha         date default null,
  p_metodo        metodo_pago default 'EFECTIVO',
  p_notas         text default null,
  p_campana_id    uuid default null
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

  if p_monto is null or p_monto <= 0 then raise exception 'Monto debe ser > 0'; end if;
  if p_descripcion is null or length(trim(p_descripcion)) = 0 then
    raise exception 'Descripción requerida';
  end if;

  select * into v_categoria from public.categorias_gasto
    where id = p_categoria_id and activo = true;
  if not found then
    raise exception 'Categoría de gasto no encontrada o inactiva';
  end if;

  -- Quién puede registrar qué (0028):
  --   admin     → cualquier gasto, con o sin campaña. Como siempre.
  --   marketing → SOLO categoría de publicidad Y SOLO imputado a una campaña.
  --               Es el dueño de las campañas (0017) y necesita cargar lo que
  --               gasta; la caja del resto del negocio no es asunto suyo.
  --   el resto  → nada.
  if v_rol = 'admin' then
    null;
  elsif v_rol = 'marketing' then
    if p_campana_id is null then
      raise exception 'Marketing solo puede registrar gastos imputados a una campaña';
    end if;
    if not v_categoria.es_publicidad then
      raise exception 'La categoría % no es de publicidad. Marketing solo carga gastos de publicidad.', v_categoria.nombre;
    end if;
  else
    raise exception 'No tenés permiso para registrar gastos';
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
    movimiento_id, campana_id, created_by
  ) values (
    v_gasto_id, p_categoria_id, p_monto, p_descripcion, v_fecha,
    p_metodo, p_notas, v_mov_id, p_campana_id, v_actor_id
  );

  return v_gasto_id;
end;
$$;

alter function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid)
  security definer
  set search_path = public;

revoke all on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid)
  from public, anon;
grant execute on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid)
  to authenticated;

comment on function public.registrar_gasto(bigint, numeric, text, date, metodo_pago, text, uuid) is
  'Registra un gasto y su EGRESO de caja de forma atomica. Admin: cualquier gasto. Marketing: solo categoria es_publicidad Y con campana_id. Usa hoy_local(). Ver 0019 y 0028.';

-- ─── A.5 · Las vistas suman TODOS los gastos de la campaña ──────────────────
-- Cuerpos idénticos a los de la 0023 salvo el origen del costo: en vez del join
-- 1:1 contra `campanas.gasto_id`, un agregado sobre `gastos.campana_id`. Los
-- anulados siguen sin contar (0023). DROP + CREATE por el 42P16 de firmas.

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
  ),
  -- ★ 0028: N gastos por campaña, anulados afuera.
  base_costo as (
    select
      g.campana_id,
      coalesce(sum(g.monto), 0)::numeric(14,2) as costo,
      count(*)::integer                        as gastos_count
    from public.gastos g
    where g.campana_id is not null
      and g.anulado_at is null
    group by g.campana_id
  )
  select
    c.id as campana_id,
    coalesce(bm.ventas_manuales, 0)     as ventas_manuales,
    coalesce(bm.monto_manual, 0)::numeric(14,2)     as monto_manual,
    coalesce(ba.ventas_automaticas, 0)  as ventas_automaticas,
    coalesce(ba.monto_automatico, 0)::numeric(14,2) as monto_automatico,
    (coalesce(bm.ventas_manuales, 0) + coalesce(ba.ventas_automaticas, 0)) as ventas_totales,
    (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0))::numeric(14,2) as monto_total,
    coalesce(bc.costo, 0)::numeric(14,2) as costo,
    coalesce(bc.gastos_count, 0)         as gastos_count,
    case
      when coalesce(bc.costo, 0) > 0 then
        round(
          (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0) - bc.costo)
          / bc.costo * 100, 2)
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
  left join base_costo  bc on bc.campana_id = c.id;

grant select on public.v_campana_metricas to authenticated;
revoke all  on public.v_campana_metricas from anon;

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
    (
      select coalesce(sum(g.monto), 0)::numeric(14,2)
      from public.gastos g
      where g.campana_id = c.id
        and g.anulado_at is null
    ) as costo_real,
    (
      select count(*)::integer
      from public.gastos g
      where g.campana_id = c.id
        and g.anulado_at is null
    ) as gastos_count,
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
  from public.campanas c;

grant select on public.v_campanas to authenticated;
revoke all  on public.v_campanas from anon;

comment on view public.v_campanas is
  'Sin security_invoker A PROPOSITO: costo_real viene de gastos (admin-only) y marketing necesita el costo de sus campanas. Ver 0016. Anulados excluidos (0023). costo_real = SUMA de gastos.campana_id desde 0028 — antes era un unico gasto y siempre daba null.';
comment on view public.v_campana_metricas is
  'Sin security_invoker A PROPOSITO: el rol marketing no es admin ni vendedor; con invoker todas las metricas darian 0. Devuelve agregados, nunca filas de ventas. Ver 0016. Anulados excluidos (0023). costo = SUMA de gastos.campana_id desde 0028.';

-- ─── A.6 · Vista del detalle de gastos de una campaña ───────────────────────
-- Sin security_invoker, por lo mismo que las dos de arriba: `gastos` es
-- admin-only y marketing tiene que ver los costos de SUS campañas. Devuelve
-- solo gastos imputados a una campaña — nunca la caja completa.
create or replace view public.v_campana_gastos as
  select
    g.id,
    g.id_publico,
    g.campana_id,
    g.monto,
    g.descripcion,
    g.fecha,
    g.metodo_pago,
    g.notas,
    g.anulado_at,
    g.anulado_motivo,
    g.created_at,
    g.created_by,
    cg.nombre as categoria_nombre
  from public.gastos g
  join public.categorias_gasto cg on cg.id = g.categoria_id
  where g.campana_id is not null;

grant select on public.v_campana_gastos to authenticated;
revoke all  on public.v_campana_gastos from anon;

comment on view public.v_campana_gastos is
  'Detalle de los gastos imputados a campanas. Sin security_invoker a proposito (gastos es admin-only y marketing necesita ver el costo de sus campanas); el WHERE campana_id is not null garantiza que nunca expone la caja general. Ver 0028.';


-- ============================================================================
-- PARTE B · CRUD DEL EMPLEADO
-- ============================================================================

-- ─── B.1 · Helper de rol: quién carga catálogo y clientes ───────────────────
-- Espeja a `puedeCargarProductos` en lib/permisos.ts. Marketing queda afuera:
-- no carga mercadería ni fichas de clientes (matriz de la 0015).
create or replace function public.puede_cargar_catalogo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_rol() in ('admin', 'colaborador');
$$;

comment on function public.puede_cargar_catalogo() is
  'Quien da de alta/edita/baja productos y clientes: admin y colaborador (vendedor). Marketing no. Ver 0028.';

revoke all on function public.puede_cargar_catalogo() from public, anon;
grant execute on function public.puede_cargar_catalogo() to authenticated;

-- ─── B.2 · Editar producto (vendedor) ───────────────────────────────────────
-- Gemela de `crear_producto_vendedor` (0017): SECURITY DEFINER, lista blanca,
-- `comision_pct` NO es parámetro.
--
-- ★ EL DETALLE QUE EVITA PERDER DATOS: `p_costo` va con `default null` y null
-- significa NO TOCAR — no "poner en cero". El vendedor no puede LEER el costo
-- (esa es la razón de ser de `productos_select_admin`), así que su formulario
-- de edición no tiene con qué precargar el campo. Si el RPC tomara el costo
-- como obligatorio, cada edición del vendedor le borraría al admin el costo del
-- producto, en silencio, y el margen de todo el catálogo se iría a la basura.
-- Por eso el form del vendedor directamente no muestra el campo y acá no llega.
create or replace function public.actualizar_producto_vendedor(
  p_producto_id   uuid,
  p_nombre        text,
  p_sku           text    default null,
  p_descripcion   text    default null,
  p_categoria     text    default null,
  p_marca         text    default null,
  p_atributos     jsonb   default '{}'::jsonb,
  p_proveedor_id  uuid    default null,
  p_precio_base   numeric default 0,
  p_stock_minimo  integer default 0,
  p_costo         numeric default null   -- null = NO TOCAR (ver nota de arriba)
)
returns text   -- id_publico, para el historial
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual  record;
  v_sku     text;
begin
  if not public.puede_cargar_catalogo() then
    raise exception 'No tenés permiso para editar productos';
  end if;

  select * into v_actual from public.productos where id = p_producto_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;
  if p_precio_base < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if p_costo is not null and p_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;
  if p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  -- `sku` es unique: sin este check el vendedor recibe el error crudo de
  -- Postgres. El `<> p_producto_id` es para que guardar sin cambiar el SKU no
  -- choque contra sí mismo.
  v_sku := nullif(btrim(coalesce(p_sku, '')), '');
  if v_sku is not null and exists (
    select 1 from public.productos where sku = v_sku and id <> p_producto_id
  ) then
    raise exception 'Ya hay otro producto con el SKU %.', v_sku;
  end if;

  update public.productos set
    nombre       = btrim(p_nombre),
    sku          = v_sku,
    descripcion  = nullif(btrim(coalesce(p_descripcion, '')), ''),
    categoria    = nullif(btrim(coalesce(p_categoria, '')), ''),
    marca        = nullif(btrim(coalesce(p_marca, '')), ''),
    atributos    = coalesce(p_atributos, '{}'::jsonb),
    proveedor_id = p_proveedor_id,
    precio_base  = p_precio_base,
    stock_minimo = p_stock_minimo,
    costo        = coalesce(p_costo, v_actual.costo),   -- ★ null = queda el que estaba
    -- comision_pct NO se toca: no es parámetro y no aparece en el SET.
    updated_by   = auth.uid()
  where id = p_producto_id;

  return v_actual.id_publico;
end;
$$;

comment on function public.actualizar_producto_vendedor is
  'Edicion de producto para admin y vendedor. SECURITY DEFINER con lista blanca: comision_pct NO es parametro y p_costo null = NO TOCAR (el vendedor no puede leer el costo, si lo mandara en 0 lo borraria). Ver 0028.';

revoke all on function public.actualizar_producto_vendedor from public, anon;
grant execute on function public.actualizar_producto_vendedor to authenticated;

-- ─── B.3 · Baja y reactivación de producto (vendedor) ───────────────────────
create or replace function public.set_producto_activo(
  p_producto_id uuid,
  p_activo      boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_pub text;
begin
  if not public.puede_cargar_catalogo() then
    raise exception 'No tenés permiso para dar de baja productos';
  end if;

  update public.productos
     set activo = p_activo, updated_by = auth.uid()
   where id = p_producto_id
   returning id_publico into v_pub;

  if v_pub is null then raise exception 'Producto no encontrado'; end if;
  return v_pub;
end;
$$;

comment on function public.set_producto_activo is
  'Baja logica / reactivacion de producto para admin y vendedor. SECURITY DEFINER porque productos_select_admin le tapa la fila al vendedor. Ver 0028.';

revoke all on function public.set_producto_activo from public, anon;
grant execute on function public.set_producto_activo to authenticated;

-- ─── B.4 · Eliminar producto ────────────────────────────────────────────────
-- Decisión del cliente 2026-07-29: "eliminar" borra de verdad SOLO si el
-- producto nunca se usó. Si tiene rastro, se desactiva.
--
-- POR QUÉ NO SE BORRA SIEMPRE. `venta_items.producto_id` y
-- `compra_items.producto_id` son `on delete restrict`: un DELETE de un producto
-- vendido lo rechaza la base. Y el historial maestro NO salva esto — guarda el
-- TEXTO del evento ("Producto PROD-0012 editado"), no la fila; con el producto
-- borrado la venta vieja no se puede reconstruir. Por eso el borrado real queda
-- para lo que nunca entró al circuito: el producto cargado con un typo, el
-- duplicado, la prueba.
--
-- Devuelve 'BORRADO' o 'DESACTIVADO' para que la UI diga la verdad de lo que
-- pasó en vez de un "listo" genérico.
create or replace function public.eliminar_producto(p_producto_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub  text;
  v_usos integer;
begin
  if not public.puede_cargar_catalogo() then
    raise exception 'No tenés permiso para eliminar productos';
  end if;

  select id_publico into v_pub from public.productos where id = p_producto_id;
  if v_pub is null then raise exception 'Producto no encontrado'; end if;

  select
      (select count(*) from public.venta_items          where producto_id = p_producto_id)
    + (select count(*) from public.compra_items         where producto_id = p_producto_id)
    + (select count(*) from public.movimientos_stock    where producto_id = p_producto_id)
    + (select count(*) from public.listas_precios_items where producto_id = p_producto_id)
    + (select count(*) from public.campana_productos    where producto_id = p_producto_id)
    into v_usos;

  if v_usos > 0 then
    update public.productos
       set activo = false, updated_by = auth.uid()
     where id = p_producto_id;
    return 'DESACTIVADO';
  end if;

  -- Los tramos de precio cuelgan con `on delete cascade` (0022) — se van solos.
  -- Las reglas de descuento por producto también (0006, cascade).
  delete from public.productos where id = p_producto_id;
  return 'BORRADO';
end;
$$;

comment on function public.eliminar_producto is
  'Borra el producto SOLO si nunca se uso (sin ventas, compras, movimientos de stock, listas ni campanas); si tiene rastro lo DESACTIVA. Devuelve BORRADO o DESACTIVADO. Decision del cliente 2026-07-29. Ver 0028.';

revoke all on function public.eliminar_producto from public, anon;
grant execute on function public.eliminar_producto to authenticated;

-- A PROPÓSITO NO se da `grant delete on public.productos to authenticated`.
-- El RPC es SECURITY DEFINER: borra con los permisos del dueño de la función y
-- no necesita el grant. Darlo abriría un DELETE directo por supabase-js que se
-- saltearía la regla del "solo si nunca se usó" — que es justamente la que
-- protege el historial. Sin grant, el único camino es este RPC.

-- ─── B.5 · Precios por cantidad: los carga también el vendedor ──────────────
-- La 0022 los dejó admin-only por ser "política de precios". El cliente los
-- quiere en manos del empleado: es el que negocia el volumen con el mayorista.
-- No hace falta RPC — `productos_precios_tramo` es su propia tabla, el SELECT
-- ya era authenticated y no tiene ninguna columna sensible (el precio de venta
-- no lo es; el costo, que sí, vive en `productos` y no acá).
drop policy if exists "precios_tramo_write_admin" on public.productos_precios_tramo;

create policy "precios_tramo_write_catalogo"
  on public.productos_precios_tramo for all
  to authenticated
  using (public.puede_cargar_catalogo())
  with check (public.puede_cargar_catalogo());

comment on table public.productos_precios_tramo is
  'Precio ABSOLUTO por tramo de cantidad por producto. Si un tramo aplica, PISA lista de precios y reglas de descuento (decision del cliente 2026-07-27). Editar = upsert sobre (producto_id, cantidad_min). Ver 0022. Escritura abierta al vendedor en 0028.';

-- ─── B.6 · Clientes: los carga y edita el vendedor ──────────────────────────
drop policy if exists "clientes_write_admin" on public.clientes;

create policy "clientes_write_catalogo"
  on public.clientes for all
  to authenticated
  using (public.puede_cargar_catalogo())
  with check (public.puede_cargar_catalogo());

-- Igual que en productos: sin `grant delete`. La 0004 nunca lo dio y no se da
-- ahora — el borrado va por eliminar_cliente (SECURITY DEFINER), que es el
-- único lugar donde vive la regla del "solo si nunca compró".

-- ★ El agujero que abre lo de arriba, tapado.
-- `clientes.lista_precio_id` es política de precios: asignarle a un cliente la
-- lista mayorista cambia lo que paga en TODAS sus compras futuras
-- (resolver_precio la lee). Las listas son admin-only por CLAUDE.md, y con la
-- policy abierta un vendedor podría setearla llamando a supabase-js directo,
-- salteándose el formulario. El trigger lo frena en la base, que es donde vale.
create or replace function public.clientes_proteger_lista_precio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin JWT no hay usuario: es el service_role, una migración o psql directo.
  -- Esos caminos ya son full-trust (se saltean la RLS entera) y bloquearlos acá
  -- solo rompería seeds y scripts de mantenimiento sin agregar seguridad.
  if auth.uid() is null then
    return new;
  end if;

  if public.current_user_rol() = 'admin' then
    return new;
  end if;

  if TG_OP = 'INSERT' and new.lista_precio_id is not null then
    raise exception 'La lista de precios del cliente la asigna el admin';
  end if;

  if TG_OP = 'UPDATE' and new.lista_precio_id is distinct from old.lista_precio_id then
    raise exception 'La lista de precios del cliente la asigna el admin';
  end if;

  return new;
end;
$$;

create trigger clientes_lista_precio_admin_only
  before insert or update on public.clientes
  for each row execute function public.clientes_proteger_lista_precio();

comment on function public.clientes_proteger_lista_precio is
  'Solo el admin asigna o cambia clientes.lista_precio_id. Necesario desde 0028, que abrio la escritura de clientes al vendedor: la lista define lo que el cliente paga en cada venta (resolver_precio) y es politica de precios, admin-only por CLAUDE.md.';

-- ─── B.7 · Eliminar cliente ─────────────────────────────────────────────────
-- Mismo criterio que productos. `ventas.cliente_id` es `on delete restrict`.
-- El Consumidor Final está blindado aparte: la venta rápida asume que existe
-- (mismo invariante que ya protegen las server actions).
create or replace function public.eliminar_cliente(p_cliente_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub  text;
  v_usos integer;
begin
  if not public.puede_cargar_catalogo() then
    raise exception 'No tenés permiso para eliminar clientes';
  end if;

  select id_publico into v_pub from public.clientes where id = p_cliente_id;
  if v_pub is null then raise exception 'Cliente no encontrado'; end if;

  -- UUID fijo del seed de la 0004, el mismo que CONSUMIDOR_FINAL_ID en
  -- lib/validators/cliente.ts. Por id y no por id_publico: el UUID es la
  -- identidad real, el id_publico es presentación.
  if p_cliente_id = '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'El Consumidor Final es un cliente del sistema — no se elimina.';
  end if;

  select count(*) into v_usos from public.ventas where cliente_id = p_cliente_id;

  if v_usos > 0 then
    update public.clientes
       set activo = false, updated_by = auth.uid()
     where id = p_cliente_id;
    return 'DESACTIVADO';
  end if;

  delete from public.clientes where id = p_cliente_id;
  return 'BORRADO';
end;
$$;

comment on function public.eliminar_cliente is
  'Borra el cliente SOLO si nunca compro; si tiene ventas lo DESACTIVA (ventas.cliente_id es on delete restrict). El Consumidor Final nunca se toca. Devuelve BORRADO o DESACTIVADO. Ver 0028.';

revoke all on function public.eliminar_cliente from public, anon;
grant execute on function public.eliminar_cliente to authenticated;
