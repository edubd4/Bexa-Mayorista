-- ============================================================================
-- BEXA · 0020 · Stock para el vendedor: cierra el circuito de la 0017
-- Resuelve el "pendiente de decisión" de docs/AUDITORIA-FUNCIONAL.md.
--
-- EL PROBLEMA
-- Desde la 0017 el vendedor da de alta productos, pero el fix E de la 0014 dejó
-- movimientos_stock con INSERT admin-only (a propósito: un vendedor podía
-- insertar AJUSTEs arbitrarios sobre CUALQUIER producto por supabase-js). El
-- circuito quedó a mitad de camino: el vendedor carga el producto y tiene que
-- pedirle al admin el stock.
--
-- LA DECISIÓN DEL CLIENTE (2026-07-27)
-- El vendedor carga stock cuando sea — la mercadería llega en partes, a veces
-- en días seguidos — y puede corregir si cargó mal. SIN ventana temporal.
-- Lo que NO cambia: el acotamiento a productos que ÉL creó. El agujero que
-- cerró la 0014 (tocar el stock del catálogo ajeno) sigue cerrado, y la policy
-- movstock_insert_admin NO se toca: este RPC es SECURITY DEFINER, como
-- registrar_venta y recibir_compra, los otros dos paths no-admin legítimos.
--
-- QUÉ PUEDE Y QUÉ NO
--   - ENTRADA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO → sí, sobre SUS productos.
--   - SALIDA → NUNCA. La única salida de stock es una venta (registrar_venta)
--     o un ajuste del admin. Un RPC que permita SALIDA es mercadería que
--     desaparece sin venta: exactamente lo que el control interno prohíbe.
--   - motivo → OBLIGATORIO. El movimiento tiene que explicarse solo en la
--     ficha y en el historial; "corrección" sin motivo no audita nada.
--
-- Espejo en app: puedeCargarStockVendedor() en lib/permisos.ts — si cambia
-- uno, cambia el otro.
-- ============================================================================

-- ─── A. productos_catalogo expone created_by ────────────────────────────────
-- La UI necesita saber si el producto es del vendedor logueado para mostrarle
-- el form de stock. created_by no es una columna sensible (costo y comision_pct
-- siguen afuera). CREATE OR REPLACE solo puede AGREGAR columnas al final.
-- La vista mantiene su excepción de la 0016: sin security_invoker, protege por
-- selección de columnas.
create or replace view public.productos_catalogo as
  select
    id, id_publico, sku, nombre, descripcion, categoria, marca, atributos,
    proveedor_id, precio_base, stock_actual, stock_minimo, activo,
    created_at, updated_at, created_by
  from public.productos;

comment on view public.productos_catalogo is
  'Sin security_invoker A PROPOSITO: protege por seleccion de columnas (sin costo ni comision_pct). Con invoker el vendedor se queda sin catalogo y no puede vender. Ver 0016. created_by expuesto desde 0020 para el form de stock del vendedor.';

-- ─── B. RPC registrar_stock_vendedor ────────────────────────────────────────
create or replace function public.registrar_stock_vendedor(
  p_producto_id  uuid,
  p_tipo         tipo_mov_stock,
  p_cantidad     integer,
  p_motivo       text
)
returns integer  -- stock_actual resultante, para que la UI confirme con el número real
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol        text;
  v_creador    uuid;
  v_id_publico text;
  v_stock      integer;
begin
  -- SECURITY DEFINER se saltea la RLS: el check de rol va acá adentro.
  -- Marketing queda afuera — no toca mercadería (matriz de la 0015).
  v_rol := public.current_user_rol();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para registrar stock';
  end if;

  -- SALIDA jamás: la única salida legítima es una venta o un ajuste del admin.
  if p_tipo not in ('ENTRADA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO') then
    raise exception 'Tipo de movimiento no permitido: %. Las salidas van por una venta.', p_tipo;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'El motivo es obligatorio: el movimiento tiene que explicarse solo';
  end if;

  select created_by, id_publico into v_creador, v_id_publico
    from public.productos where id = p_producto_id;
  if v_id_publico is null then
    raise exception 'Producto no encontrado';
  end if;

  -- El acotamiento clave: el vendedor completa SU alta, no toca el catálogo
  -- ajeno. El admin no pasa por acá (usa el insert directo), pero si llama, no
  -- se lo limita.
  if v_rol = 'colaborador' and v_creador is distinct from auth.uid() then
    raise exception 'Solo podés registrar stock de productos que cargaste vos. Este lo maneja el admin.';
  end if;

  -- El trigger movstock_aplicar hace la cuenta y rechaza ajustes negativos que
  -- dejen el stock bajo cero.
  insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
  values (p_producto_id, p_tipo, p_cantidad, btrim(p_motivo), auth.uid());

  select stock_actual into v_stock from public.productos where id = p_producto_id;
  return v_stock;
end;
$$;

comment on function public.registrar_stock_vendedor is
  'Stock para el vendedor sobre productos que EL creo: ENTRADA y AJUSTEs de correccion, motivo obligatorio, SALIDA jamas. SECURITY DEFINER — la policy movstock_insert_admin (0014) no se toca. Ver 0020.';

revoke all on function public.registrar_stock_vendedor from public, anon;
grant execute on function public.registrar_stock_vendedor to authenticated;
