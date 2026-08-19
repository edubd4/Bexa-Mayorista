-- ============================================================================
-- 0037 · cancelar_venta devuelve la plata cobrada a quien corresponde
--        (review 2026-08-19, hallazgo #3)
--
-- ⚠ REQUIERE LA 0034 APLICADA (este cuerpo incluye el filtro de
--   movimiento_stock_id de la 0034 — aplicar en orden: 0034 → 0036 → 0037).
--
-- El bug: cancelar una venta CON cobros revertía el stock y marcaba
-- CANCELADA, pero los INGRESO COBRO_VENTA quedaban en movimientos_caja sin
-- compensar. El admin le devuelve la plata al cliente en el mundo real, y la
-- caja del sistema seguía mostrando esa plata adentro — el arqueo no cerraba
-- hasta que alguien se acordara de cargar un AJUSTE a mano.
--
-- Fix: si total_cobrado > 0, la cancelación inserta un EGRESO AJUSTE espejo
-- por el total cobrado, linkeado a la venta y con descripción que se explica
-- sola en el extracto. Mismo criterio que anular_gasto (0023): el espejo es
-- automático porque una cancelación con plata SIEMPRE implica devolución.
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

  -- ← 0037: devolver la plata cobrada. Un EGRESO AJUSTE espejo por el total
  -- cobrado — la caja del sistema refleja la devolución al cliente y el
  -- arqueo cierra. Solo llega acá un admin (el vendedor rebota arriba si
  -- total_cobrado > 0).
  if v_venta.total_cobrado > 0 then
    insert into public.movimientos_caja (
      tipo, origen, monto, metodo_pago, descripcion, fecha, venta_id, created_by
    ) values (
      'EGRESO', 'AJUSTE', v_venta.total_cobrado, 'EFECTIVO',
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
  'Cancela una venta: repone stock SOLO de los items con movimiento_stock_id (0034), devuelve a caja lo cobrado con un EGRESO AJUSTE espejo (0037) y marca CANCELADA. Autoriza admin, o el vendedor propio sin cobros. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';
