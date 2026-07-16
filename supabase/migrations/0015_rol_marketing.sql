-- ============================================================================
-- BEXA · Rol Marketing (0015) — nuevo valor del enum rol_usuario
-- Depende de: 0001 (rol_usuario, current_user_rol), 0007 (registrar_venta),
--             0008 (recibir_compra + patch de 0014).
--
-- Marketing = "vendedor sin plata ni ventas":
--   - Lee: clientes, productos_catalogo (sin costo), campañas + publicaciones,
--          seguimiento, alertas, historial (según policies existentes que ya
--          son `authenticated`).
--   - Escribe: clientes, campañas, publicaciones (comparte permisos con
--     colaborador — las policies ya son authenticated).
--   - NO puede: registrar ventas, comprar, tocar caja/gastos/finanzas/comisiones,
--     ver el costo de productos (RLS admin-only sigue vigente).
--
-- Este script:
--   A. Agrega el valor 'marketing' al enum rol_usuario.
--   B. Bloquea registrar_venta para marketing (no genera ventas ni comisiones).
--   C. recibir_compra ya bloquea a todo no-admin (fix D del audit 0014).
--   D. Las policies existentes que dicen `current_user_rol() is not null`
--      automáticamente le dan acceso a marketing — no hace falta tocarlas.
--   E. Las policies `current_user_rol() = 'admin'` correctamente lo excluyen.
-- ============================================================================

-- ─── A. Agregar el valor al enum ────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE debe correr FUERA de una transacción explícita.
-- El SQL Editor de Supabase envuelve todo el script en una transacción, así
-- que este script tiene que aplicarse solo (o Postgres 12+ permite ADD VALUE
-- dentro de txn si no se usa en la misma; nuestro caso lo cumple).
alter type rol_usuario add value if not exists 'marketing';

-- ─── B. registrar_venta: bloquear marketing ────────────────────────────────
-- Marketing puede leer ventas para métricas (via vistas) pero NO puede
-- registrarlas — no tiene comisiones, no factura. El check va en el RPC porque
-- SECURITY DEFINER se saltea RLS.
--
-- Nota: la firma actual de registrar_venta (post 0012) es
-- (uuid, venta_item_input[], text, estado_entrega, uuid). Solo agregamos el
-- check de rol al principio; el resto de la lógica queda idéntica.
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
  v_comision_pct     numeric(5,2);
  v_producto_com     numeric(5,2);
  v_producto_costo   numeric(14,2);
  v_mov_id           bigint;
  v_total            numeric(14,2) := 0;
  v_subtotal         numeric(14,2);
  v_item_subtotal    numeric(14,2);
  v_item_final       numeric(14,2);
  v_descuento_total  numeric(14,2) := 0;
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

    v_subtotal        := v_precio.precio_unitario * v_item.cantidad;
    v_descuento_total := v_descuento_total + (v_item_subtotal - v_item_final);
    v_total           := v_total + v_item_final;
  end loop;

  update public.ventas
    set subtotal = v_total + v_descuento_total,
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
