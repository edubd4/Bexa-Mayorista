-- ============================================================================
-- 0040 · cancelar_venta: freno fiscal + devolución con el método real
--        (review anti-crisis 2026-08-19, hallazgos #4 y #5)
--
-- ⚠ REQUIERE 0034 Y 0037 APLICADAS (este cuerpo las incluye — aplicar en
--   orden numérico como siempre).
--
-- Hallazgo #4 (fiscal): cancelar_venta no miraba `comprobantes`. Se podía
-- cancelar una venta CON CAE emitido: la venta quedaba CANCELADA pero el
-- comprobante fiscal seguía vivo en ARCA — documento emitido por una
-- operación anulada, sin nota de crédito que lo compense. Eso es un problema
-- con ARCA, no un detalle de UI. Hasta que el sistema tenga notas de crédito,
-- una venta facturada NO SE CANCELA.
--
-- Hallazgo #5 (arqueo): el EGRESO espejo de la 0037 salía siempre EFECTIVO.
-- Si la venta se cobró por transferencia y se devuelve por el mismo canal,
-- el arqueo del efectivo físico no cerraba. Ahora el espejo usa el método
-- del ÚLTIMO cobro de la venta (fallback EFECTIVO si no se encuentra).
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
  v_metodo_dev   metodo_pago;                                        -- ← 0040
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

  -- ← 0040: freno fiscal. Un CAE emitido no se borra cancelando la venta —
  -- ARCA ya lo registró. Sin notas de crédito en el sistema, esta venta no
  -- se puede cancelar.
  if exists (select 1 from public.comprobantes where venta_id = p_venta_id) then
    raise exception 'La venta tiene un comprobante fiscal emitido (CAE) — no se puede cancelar sin emitir la nota de crédito correspondiente. Consultalo con el contador.';
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

  -- ← 0037: devolver la plata cobrada con un EGRESO AJUSTE espejo.
  -- ← 0040: con el método del ÚLTIMO cobro (antes salía siempre EFECTIVO y el
  -- arqueo del efectivo físico no cerraba si el cobro fue por otro canal).
  if v_venta.total_cobrado > 0 then
    select metodo_pago into v_metodo_dev
      from public.movimientos_caja
      where venta_id = p_venta_id and origen = 'COBRO_VENTA'
      order by fecha desc, id desc
      limit 1;

    insert into public.movimientos_caja (
      tipo, origen, monto, metodo_pago, descripcion, fecha, venta_id, created_by
    ) values (
      'EGRESO', 'AJUSTE', v_venta.total_cobrado, coalesce(v_metodo_dev, 'EFECTIVO'),
      'Devolución por cancelación venta ' || v_venta.id_publico
        || coalesce(' · ' || p_motivo, ''),
      now(), p_venta_id, v_actor_id
    );
  end if;

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
  'Cancela una venta: RECHAZA si tiene comprobante fiscal (0040 — sin notas de credito no se cancela lo facturado), repone stock SOLO de items con movimiento_stock_id (0034), devuelve lo cobrado con EGRESO AJUSTE espejo usando el metodo del ultimo cobro (0037/0040) y marca CANCELADA. Autoriza admin, o vendedor propio sin cobros. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';
