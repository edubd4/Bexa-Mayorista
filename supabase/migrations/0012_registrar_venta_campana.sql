-- ============================================================================
-- BEXA · Módulo Campañas (0012) — extender registrar_venta con p_campana_id
-- Depende de: ventas (0007), campanas (0011).
--
-- Se agrega un parámetro nuevo (p_campana_id uuid default null) al final de la
-- firma. Postgres no permite CREATE OR REPLACE cambiando la signature, entonces
-- hacemos DROP + CREATE. Toda la lógica interna se mantiene idéntica al 0007;
-- lo único que cambia es que el INSERT del cabezal ahora setea también campana_id.
-- ============================================================================

drop function if exists public.registrar_venta(uuid, venta_item_input[], text, estado_entrega);

create function public.registrar_venta(
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
  v_vendedor_id := auth.uid();
  if v_vendedor_id is null then raise exception 'No autenticado'; end if;

  if p_cliente_id is null then raise exception 'Cliente requerido'; end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  perform 1 from public.clientes where id = p_cliente_id and activo = true;
  if not found then raise exception 'Cliente no encontrado o inactivo'; end if;

  -- Validar la campaña si se pasa (debe existir; permitimos cualquier estado — el
  -- vendedor podría atribuir a una campaña recién concluida por una venta atrasada).
  if p_campana_id is not null then
    perform 1 from public.campanas where id = p_campana_id;
    if not found then raise exception 'Campaña % no encontrada', p_campana_id; end if;
  end if;

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

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'SALIDA', v_item.cantidad,
            'Venta ' || v_id_publico, v_vendedor_id)
    returning id into v_mov_id;

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

  update public.ventas
    set subtotal = v_subtotal,
        descuento_total = v_descuento_total,
        total = v_total
    where id = v_venta_id;

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

alter function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid)
  security definer
  set search_path = public;

grant execute on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) to authenticated;
