-- ============================================================================
-- 0034 · Stock opcional por producto
--
-- Pedido del cliente (2026-08-19): hay productos que no llevan control de
-- stock (servicios, productos al peso, mercadería que no se cuenta). La venta
-- debe registrar la CANTIDAD vendida igual (venta_items no cambia), pero sin
-- validar disponibilidad ni generar movimiento de stock. El control se puede
-- activar o desactivar después desde la ficha.
--
-- Diseño:
--   - `productos.controla_stock` boolean, default true (todo lo existente
--     sigue igual).
--   - registrar_venta: si el producto NO controla stock, no inserta la SALIDA
--     — venta_items.movimiento_stock_id queda null (ya era nullable, 0007).
--   - cancelar_venta: repone stock SOLO para items con movimiento_stock_id
--     not null. Así revierte exactamente lo que se movió, aunque el flag del
--     producto haya cambiado entre la venta y la cancelación.
--   - Compras: sin cambios. Una ENTRADA sobre un producto sin control suma
--     stock_actual, que la UI ignora mientras el flag esté apagado — si lo
--     encienden después, el número está.
--   - Vista productos_catalogo: se recrea agregando la columna AL FINAL
--     (create or replace exige mismo orden). SIN security_invoker a propósito
--     — protege por selección de columnas, ver 0016. NO "arreglar".
--
-- ⚠ REGLA DE LA 0024: create or replace function NO hereda atributos — después
-- de CADA uno va su `alter function ... security definer set search_path`
-- como statement aparte. Es redundante a propósito. NO BORRAR.
-- ============================================================================

-- ─── 1 · Columna ─────────────────────────────────────────────────────────────
alter table public.productos
  add column controla_stock boolean not null default true;

comment on column public.productos.controla_stock is
  'false = el producto no lleva stock: las ventas registran cantidad pero no validan disponibilidad ni generan movimiento. Ver 0034.';

-- ─── 2 · Vista productos_catalogo con la columna nueva ──────────────────────
-- Columnas en el MISMO orden que 0005 + controla_stock al final.
create or replace view public.productos_catalogo as
  select
    id, id_publico, sku, nombre, descripcion, categoria, marca, atributos,
    proveedor_id, precio_base, stock_actual, stock_minimo, activo,
    created_at, updated_at,
    controla_stock
  from public.productos;

comment on view public.productos_catalogo is
  'Sin security_invoker A PROPOSITO: protege por seleccion de columnas (sin costo ni comision_pct). Con invoker el vendedor se queda sin catalogo y no puede vender. Ver 0016. controla_stock desde 0034.';

-- ─── 3 · registrar_venta — cuerpo vigente de 0030, cambios marcados ← 0034 ──
create or replace function public.registrar_venta(
  p_cliente_id       uuid,
  p_items            venta_item_input[],
  p_notas            text default null,
  p_estado_entrega   estado_entrega default 'ENTREGADA',
  p_campana_id       uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_vendedor_id      uuid;
  v_vendedor_rol     text;
  v_venta_id         uuid;
  v_id_publico       text;
  v_item             venta_item_input;
  v_precio           record;
  v_producto_com     numeric(5,2);
  v_producto_costo   numeric(14,2);
  v_controla_stock   boolean;                                        -- ← 0034
  v_mov_id           bigint;
  v_total            numeric(14,2) := 0;
  v_subtotal         numeric(14,2);
  v_item_subtotal    numeric(14,2);
  v_item_final       numeric(14,2);
  v_descuento_total  numeric(14,2) := 0;
  -- Comisión: fallbacks resueltos una vez, y acumulador del total.
  v_com_vendedor     numeric(5,2);
  v_com_default      numeric(5,2);
  v_item_com_pct     numeric(5,2);
  v_item_com_monto   numeric(14,2);
  v_comision_total   numeric(14,2) := 0;
  v_comision_pct_ef  numeric(5,2)  := 0;
begin
  v_vendedor_id := auth.uid();
  if v_vendedor_id is null then
    raise exception 'No autenticado';
  end if;

  -- Solo admin y colaborador (vendedor) pueden registrar ventas. Marketing NO.
  v_vendedor_rol := public.current_user_rol();
  if v_vendedor_rol is null then raise exception 'Usuario sin perfil activo'; end if;  -- ← 0030
  if v_vendedor_rol not in ('admin', 'colaborador') then
    raise exception 'Tu rol no permite registrar ventas';
  end if;

  if p_cliente_id is null then raise exception 'Cliente requerido'; end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  perform 1 from public.clientes where id = p_cliente_id and activo = true;
  if not found then raise exception 'Cliente no encontrado o inactivo'; end if;

  if p_campana_id is not null then
    perform 1 from public.campanas where id = p_campana_id;
    if not found then raise exception 'Campaña % no encontrada', p_campana_id; end if;
  end if;

  -- Los dos fallbacks de comisión, una sola vez para toda la venta.
  select comision_pct into v_com_vendedor
    from public.profiles where id = v_vendedor_id;
  select nullif(valor, '')::numeric(5,2) into v_com_default
    from public.configuracion where clave = 'comision_default_pct';

  insert into public.ventas (
    cliente_id, vendedor_id, estado_entrega, notas, campana_id, created_by, updated_by
  ) values (
    p_cliente_id, v_vendedor_id, p_estado_entrega, p_notas, p_campana_id, v_vendedor_id, v_vendedor_id
  )
  returning id, id_publico into v_venta_id, v_id_publico;

  foreach v_item in array p_items loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad inválida para producto %', v_item.producto_id;
    end if;

    select costo, comision_pct, controla_stock                       -- ← 0034
      into v_producto_costo, v_producto_com, v_controla_stock
      from public.productos where id = v_item.producto_id and activo = true;
    if not found then
      raise exception 'Producto % no encontrado o inactivo', v_item.producto_id;
    end if;

    select * into v_precio
      from public.resolver_precio(p_cliente_id, v_item.producto_id, v_item.cantidad);

    v_item_subtotal := v_precio.precio_unitario * v_item.cantidad;
    v_item_final    := v_precio.precio_final    * v_item.cantidad;

    -- ACÁ vive el fix. El override del producto gana; si no tiene, el % del
    -- vendedor; si tampoco, el default de configuración; si nada, 0.
    -- La comisión se calcula sobre el precio YA CON DESCUENTO: si el vendedor
    -- bonifica, la comisión baja con la bonificación.
    v_item_com_pct   := coalesce(v_producto_com, v_com_vendedor, v_com_default, 0);
    v_item_com_monto := round(v_item_final * v_item_com_pct / 100.0, 2);
    v_comision_total := v_comision_total + v_item_com_monto;

    -- ← 0034: solo los productos que controlan stock generan SALIDA (el
    -- trigger aplicar_mov_stock valida disponibilidad y descuenta). Para los
    -- que no, movimiento_stock_id queda null y la cantidad vive en venta_items.
    if v_controla_stock then
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
      values (v_item.producto_id, 'SALIDA', v_item.cantidad,
              'Venta ' || v_id_publico, v_vendedor_id)
      returning id into v_mov_id;
    else
      v_mov_id := null;
    end if;

    insert into public.venta_items (
      venta_id, producto_id, cantidad,
      precio_unitario, descuento_pct, precio_final_unit,
      costo_snapshot, origen_precio, movimiento_stock_id,
      comision_pct_snapshot, comision_monto
    ) values (
      v_venta_id, v_item.producto_id, v_item.cantidad,
      v_precio.precio_unitario, v_precio.descuento_pct, v_precio.precio_final,
      coalesce(v_producto_costo, 0), v_precio.origen, v_mov_id,
      v_item_com_pct, v_item_com_monto
    );

    v_subtotal        := v_precio.precio_unitario * v_item.cantidad;
    v_descuento_total := v_descuento_total + (v_item_subtotal - v_item_final);
    v_total           := v_total + v_item_final;
  end loop;

  update public.ventas
    set subtotal = v_total + v_descuento_total,
        descuento_total = v_descuento_total,
        total = v_total
    where id = v_venta_id;

  if v_comision_total > 0 then
    -- `porcentaje` pasa a ser el efectivo PONDERADO de la venta. Con override
    -- por producto ya no hay un único % que describa la venta entera, y esta
    -- columna es lo que se muestra en la liquidación.
    -- Ojo: monto_base * porcentaje / 100 puede diferir de monto en centavos,
    -- porque monto es la suma de importes redondeados línea por línea. La
    -- fuente de verdad es venta_items — ahí está el desglose exacto.
    if v_total > 0 then
      v_comision_pct_ef := round(v_comision_total * 100.0 / v_total, 2);
    end if;

    insert into public.comisiones (venta_id, vendedor_id, monto_base, porcentaje, monto)
    values (v_venta_id, v_vendedor_id, v_total, v_comision_pct_ef, v_comision_total);
  end if;

  return v_venta_id;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid)
  security definer
  set search_path = public;

grant execute on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) to authenticated;

comment on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) is
  'Registra una venta de forma atomica: valida stock, inserta venta + items (precio via resolver_precio), genera los movimientos de SALIDA (solo productos con controla_stock, ver 0034) y liquida la comision LINEA POR LINEA (override del producto > % del vendedor > default de configuracion). Ver 0018. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';

-- ─── 4 · cancelar_venta — cuerpo vigente de 0030, cambios marcados ← 0034 ───
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
  if v_rol is null then raise exception 'Usuario sin perfil activo'; end if;  -- ← 0030
  if v_rol <> 'admin' then
    if v_venta.vendedor_id <> v_actor_id then
      raise exception 'Solo el admin o el vendedor que registró puede cancelar';
    end if;
    if v_venta.total_cobrado > 0 then
      raise exception 'La venta ya tiene cobros — solo un admin puede cancelar';
    end if;
  end if;

  -- Revertir stock: una ENTRADA compensatoria por cada item QUE MOVIÓ STOCK.
  -- ← 0034: el filtro por movimiento_stock_id revierte exactamente lo que se
  -- movió al vender — inmune a que el flag controla_stock cambie entre medio.
  for v_item in
    select producto_id, cantidad from public.venta_items
    where venta_id = p_venta_id and movimiento_stock_id is not null
  loop
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

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.cancelar_venta(uuid, text)
  security definer
  set search_path = public;

comment on function public.cancelar_venta(uuid, text) is
  'Cancela una venta: repone stock SOLO de los items con movimiento_stock_id (ver 0034) y marca CANCELADA. Autoriza admin, o el vendedor propio sin cobros. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';

-- ─── 5 · v_stock_bajo: los productos sin control no alertan ─────────────────
-- Mismas columnas que 0010 + filtro nuevo. El security_invoker de la 0016
-- persiste al recrear, pero se re-asegura explícito (cultura de la 0024/0030).
create or replace view public.v_stock_bajo as
  select
    id, id_publico, sku, nombre, categoria, marca,
    stock_actual, stock_minimo,
    (stock_minimo - stock_actual)::integer as faltante
  from public.productos
  where activo = true
    and controla_stock = true                                        -- ← 0034
    and stock_minimo > 0
    and stock_actual <= stock_minimo;

alter view public.v_stock_bajo set (security_invoker = true);

comment on view public.v_stock_bajo is
  'Productos activos con stock por debajo del minimo. Excluye controla_stock = false (0034). security_invoker desde 0016.';
