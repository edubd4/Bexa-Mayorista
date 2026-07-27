-- ============================================================================
-- BEXA · 0021 · RPC cambiar_estado_entrega
--
-- EL PROBLEMA
-- estado_entrega nacía en registrar_venta() y no se podía tocar nunca más:
-- ni el detalle de la venta ni la tabla tenían forma de pasar un PEDIDO a
-- EN_PREPARACION o ENTREGADA. La única transición existente era la de
-- cancelar_venta(). Una venta que nacía como pedido moría como pedido.
--
-- POR QUÉ RPC Y NO UPDATE DIRECTO
-- La policy ventas_update_admin (0007) deja el UPDATE directo solo al admin,
-- y está bien así: total, total_cobrado y estado_cobro son campos contables.
-- Pero la entrega es logística y el que entrega es el vendedor. Mismo criterio
-- que cobrar_venta(): SECURITY DEFINER con la autorización adentro — admin
-- siempre, vendedor solo sobre SUS ventas.
--
-- QUÉ NO HACE
-- CANCELADA no es un estado de entrega que se setea: es el resultado de
-- cancelar_venta(), que revierte stock y comisión. Este RPC solo mueve entre
-- ENTREGADA / PEDIDO / EN_PREPARACION, en cualquier dirección — marcar
-- ENTREGADA por error también se corrige desde acá.
-- ============================================================================

create or replace function public.cambiar_estado_entrega(
  p_venta_id  uuid,
  p_estado    estado_entrega
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta record;
  v_rol   text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_rol := public.current_user_rol();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para cambiar el estado de entrega';
  end if;

  if p_estado not in ('ENTREGADA', 'PEDIDO', 'EN_PREPARACION') then
    raise exception 'Una venta se cancela desde "Cancelar venta", no cambiando la entrega: eso devuelve el stock y da de baja la comisión.';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  if v_venta.estado_cobro = 'CANCELADA' or v_venta.estado_entrega = 'CANCELADA' then
    raise exception 'La venta está cancelada: su entrega no se toca';
  end if;

  if v_rol <> 'admin' and v_venta.vendedor_id <> auth.uid() then
    raise exception 'Solo el admin o el vendedor de la venta pueden cambiar la entrega';
  end if;

  update public.ventas
    set estado_entrega = p_estado,
        updated_by     = auth.uid()
    where id = p_venta_id;
end;
$$;

comment on function public.cambiar_estado_entrega is
  'Mueve estado_entrega entre ENTREGADA/PEDIDO/EN_PREPARACION. CANCELADA jamas (eso es cancelar_venta). Admin siempre; vendedor solo sus ventas. Ver 0021.';

revoke all on function public.cambiar_estado_entrega from public, anon;
grant execute on function public.cambiar_estado_entrega to authenticated;
