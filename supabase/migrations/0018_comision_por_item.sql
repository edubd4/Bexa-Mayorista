-- ============================================================================
-- BEXA · 0018 · La comisión por producto empieza a aplicarse de verdad
-- Hallazgo 2 de docs/AUDITORIA-FUNCIONAL.md.
--
-- EL PROBLEMA
-- `productos.comision_pct` existe desde la 0005 y el admin lo carga desde el
-- campo "Comisión override (%)" del formulario. La 0007 lo documentó
-- ("Comisión = % del vendedor + override por producto"), la ficha del producto
-- lo muestra y /comisiones le promete al admin que "el override por producto
-- tiene prioridad".
-- Y nunca se aplicó. En registrar_venta se leía a una variable
-- (`v_producto_com`) que no se volvía a usar en ninguna línea. La comisión
-- salía siempre del % del vendedor. Es plata mal liquidada.
--
-- POR QUÉ SE IMPLEMENTA Y NO SE SACA EL CAMPO
-- Es requisito del cliente, respuesta del 2026-07-13 (PLAN-TECNICO §2.7.2):
--   "Comisiones: % fijo por vendedor + a veces override por producto."
-- Y tiene sentido de negocio: con comisión plana el vendedor empuja lo que más
-- FACTURA, no lo que más DEJA. En una distribuidora con electros (ticket alto,
-- margen fino) y ferretería (ticket bajo, margen gordo), eso trabaja contra el
-- margen de la empresa.
--
-- CÓMO QUEDA EL MODELO
-- La comisión se calcula LÍNEA POR LÍNEA:
--   coalesce(producto.comision_pct, vendedor.comision_pct, config default, 0)
-- aplicado sobre el subtotal final de esa línea (ya con descuento).
--
-- `comisiones` mantiene UNA fila por venta — deliberado. Así no se tocan
-- v_comisiones_semana, la pantalla /comisiones ni el ranking de vendedores, que
-- es donde estaría todo el riesgo de regresión sobre un sistema en producción.
-- El desglose fino vive en venta_items, con el mismo patrón de snapshot que ya
-- usan precio_unitario, descuento_pct y costo_snapshot.
--
-- EFECTO RETROACTIVO: NINGUNO.
-- `comisiones` es append-only (triggers que bloquean UPDATE y DELETE) y las
-- columnas nuevas de venta_items nacen en 0. Todo lo ya liquidado queda como
-- está. Esto aplica desde la primera venta posterior al deploy.
-- ============================================================================

-- ─── A. El desglose por línea ──────────────────────────────────────────────
alter table public.venta_items
  add column if not exists comision_pct_snapshot numeric(5,2)  not null default 0
    check (comision_pct_snapshot >= 0 and comision_pct_snapshot <= 100),
  add column if not exists comision_monto        numeric(14,2) not null default 0
    check (comision_monto >= 0);

comment on column public.venta_items.comision_pct_snapshot is
  'Porcentaje de comision que se aplico A ESTA LINEA: override del producto si tiene, si no el del vendedor, si no el default de configuracion. Snapshot: cambiar el % del producto no reescribe ventas viejas.';
comment on column public.venta_items.comision_monto is
  'Plata de comision que genero esta linea. La suma de todas las lineas es comisiones.monto de la venta.';

-- ─── B. registrar_venta con comisión por ítem ──────────────────────────────
-- Misma firma que la 0015. Cambios: se resuelven el % del vendedor y el default
-- ANTES del loop, cada ítem calcula y guarda lo suyo, y la fila de `comisiones`
-- se arma con la suma.
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

    select costo, comision_pct
      into v_producto_costo, v_producto_com
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

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'SALIDA', v_item.cantidad,
            'Venta ' || v_id_publico, v_vendedor_id)
    returning id into v_mov_id;

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

alter function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid)
  security definer
  set search_path = public;

grant execute on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) to authenticated;

comment on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) is
  'Registra una venta de forma atomica: valida stock, inserta venta + items (precio via resolver_precio), genera los movimientos de SALIDA y liquida la comision LINEA POR LINEA (override del producto > % del vendedor > default de configuracion). Ver 0018.';
