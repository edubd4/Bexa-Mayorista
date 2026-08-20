-- ============================================================================
-- 0041 · Bonificación manual por línea de venta
--
-- Pedido del cliente (2026-08-20): poder aplicar descuentos a la venta desde
-- el mismo registro, como cualquier sistema de facturación (la "bonificación
-- por renglón" clásica). Diseño:
--
--   - La bonificación es MANUAL y POR LÍNEA (% de 0 a 100). Se aplica ENCIMA
--     del precio ya resuelto por resolver_precio (lista/tramo/regla) — es una
--     decisión del vendedor en el momento, no una regla automática, así que
--     no compite con la cadena de precios: la remata.
--   - El "descuento a toda la venta" de la UI es azúcar: el form replica el
--     mismo % en cada línea. El RPC solo conoce líneas — un único mecanismo.
--   - La comisión ya se calcula sobre v_item_final (0018/0034): al bonificar,
--     la comisión baja sola con la bonificación. Sin cambios ahí.
--   - Queda auditada en venta_items.descuento_manual_pct: la ficha muestra
--     qué bonificó el vendedor, separado del descuento de reglas.
--   - descuento_total del cabezal ya acumula (subtotal - final) por línea →
--     absorbe la bonificación sin tocar nada.
--
-- ⚠ GRANT POR COLUMNAS (0036): venta_items no tiene grant de tabla entera —
-- la columna nueva necesita su propio grant select o el client no la lee.
--
-- ⚠ REGLA DE LA 0024: create or replace function NO hereda atributos — después
-- de CADA uno va su `alter function ... security definer set search_path`
-- como statement aparte. Es redundante a propósito. NO BORRAR.
-- ============================================================================

-- ─── 1 · Columna en venta_items + atributo en el composite de entrada ───────
alter table public.venta_items
  add column descuento_manual_pct numeric(5,2) not null default 0
  constraint venta_items_descuento_manual_pct_check
    check (descuento_manual_pct >= 0 and descuento_manual_pct <= 100);

comment on column public.venta_items.descuento_manual_pct is
  'Bonificación manual del vendedor (%), aplicada ENCIMA del precio resuelto (lista/tramo/regla). 0 = sin bonificar. Ver 0041.';

-- La columna nueva entra al grant por columnas de la 0036 (costo_snapshot
-- sigue afuera, que es el punto de esa migración).
grant select (descuento_manual_pct) on public.venta_items to authenticated;

-- venta_item_input se usa SOLO en firmas de función — agregar el atributo no
-- rompe llamadas viejas: PostgREST castea el JSON por nombre y lo que falta
-- queda null (el RPC lo coalescea a 0). El POS sigue mandando 2 campos y anda.
alter type public.venta_item_input add attribute descuento_manual_pct numeric(5,2);

-- ─── 2 · registrar_venta — cuerpo vigente de 0034, cambios marcados ← 0041 ──
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
  v_controla_stock   boolean;
  v_mov_id           bigint;
  v_total            numeric(14,2) := 0;
  v_subtotal         numeric(14,2);
  v_item_subtotal    numeric(14,2);
  v_item_final       numeric(14,2);
  v_descuento_total  numeric(14,2) := 0;
  v_manual_pct       numeric(5,2);                                   -- ← 0041
  v_unit_final       numeric(14,2);                                  -- ← 0041
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
  if v_vendedor_rol is null then raise exception 'Usuario sin perfil activo'; end if;
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

    -- ← 0041: la bonificación llega opcional (null desde callers viejos) y
    -- se valida acá también — el CHECK de la tabla es la última red.
    v_manual_pct := coalesce(v_item.descuento_manual_pct, 0);
    if v_manual_pct < 0 or v_manual_pct > 100 then
      raise exception 'Bonificación inválida para producto %: debe estar entre 0 y 100', v_item.producto_id;
    end if;

    select costo, comision_pct, controla_stock
      into v_producto_costo, v_producto_com, v_controla_stock
      from public.productos where id = v_item.producto_id and activo = true;
    if not found then
      raise exception 'Producto % no encontrado o inactivo', v_item.producto_id;
    end if;

    select * into v_precio
      from public.resolver_precio(p_cliente_id, v_item.producto_id, v_item.cantidad);

    -- ← 0041: la bonificación remata el precio resuelto. Se redondea POR
    -- UNIDAD para que precio_final_unit sea exacto y el client pueda replicar
    -- el mismo cálculo sin drift de centavos.
    v_unit_final := round(v_precio.precio_final * (1 - v_manual_pct / 100.0), 2);

    v_item_subtotal := v_precio.precio_unitario * v_item.cantidad;
    v_item_final    := v_unit_final * v_item.cantidad;                -- ← 0041

    -- El override del producto gana; si no tiene, el % del vendedor; si
    -- tampoco, el default de configuración; si nada, 0. La comisión se
    -- calcula sobre el precio YA CON DESCUENTO Y BONIFICACIÓN: si el
    -- vendedor bonifica, la comisión baja con la bonificación.
    v_item_com_pct   := coalesce(v_producto_com, v_com_vendedor, v_com_default, 0);
    v_item_com_monto := round(v_item_final * v_item_com_pct / 100.0, 2);
    v_comision_total := v_comision_total + v_item_com_monto;

    -- 0034: solo los productos que controlan stock generan SALIDA (el
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
      comision_pct_snapshot, comision_monto,
      descuento_manual_pct                                            -- ← 0041
    ) values (
      v_venta_id, v_item.producto_id, v_item.cantidad,
      v_precio.precio_unitario, v_precio.descuento_pct, v_unit_final, -- ← 0041
      coalesce(v_producto_costo, 0), v_precio.origen, v_mov_id,
      v_item_com_pct, v_item_com_monto,
      v_manual_pct                                                    -- ← 0041
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
  'Registra una venta de forma atomica: valida stock, inserta venta + items (precio via resolver_precio + bonificacion manual por linea, ver 0041), genera los movimientos de SALIDA (solo productos con controla_stock, 0034) y liquida la comision LINEA POR LINEA sobre el precio final bonificado (0018). Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';
