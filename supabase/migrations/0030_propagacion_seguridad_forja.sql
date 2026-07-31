-- ============================================================================
-- 0030 · Propagación de seguridad desde el maestro FORJA
-- ============================================================================
-- Trae a Bexa tres arreglos de seguridad que ya se aplicaron en el repo maestro
-- (FORJA), más la verificación de un cuarto que Bexa ya tenía resuelto por su
-- cuenta. Nada de esto cambia funcionalidad: son guardas y permisos.
--
--   Maestro PR #4  → guardas NULL-safe de rol + security_invoker en vistas
--   Maestro PR #9  → segundo barrido de guardas NULL-safe (la FORMA VARIABLE,
--                    `v_rol := ...` seguido de `if v_rol <> 'admin'`, que el
--                    primer barrido no había detectado)
--   Maestro PR #11 → revoke de EXECUTE a PUBLIC/anon + default privileges
--
-- Gotchas de referencia (docs/GOTCHAS.md del maestro):
--   · "current_user_rol() devuelve NULL y el check de rol NO dispara"
--   · "Toda función nace ejecutable por PUBLIC"
--   · "CREATE OR REPLACE FUNCTION resetea SECURITY a INVOKER"
--   · "Una vista NO aplica la RLS de sus tablas base"
--
-- ---------------------------------------------------------------------------
-- POR QUÉ IMPORTA (el bug que se está cerrando)
-- ---------------------------------------------------------------------------
-- `current_user_rol()` es `select rol from profiles where id = auth.uid() and
-- activo = true`. Si el usuario fue dado de baja (`activo = false`) la consulta
-- no devuelve fila y la función devuelve NULL. En SQL toda comparación contra
-- NULL da NULL —ni true ni false— y plpgsql trata NULL como falso en un IF:
--
--     v_rol := public.current_user_rol();   -- NULL para un usuario desactivado
--     if v_rol <> 'admin' then              -- NULL <> 'admin' = NULL → NO entra
--       raise exception '...';              -- ← el portazo NUNCA se ejecuta
--     end if;
--
-- Resultado: un empleado desactivado conserva poder de admin sobre los RPCs de
-- plata mientras su JWT siga vivo. Desactivar a alguien NO invalida su sesión, y
-- los RPCs se llaman directo por PostgREST sin pasar por las server actions.
-- La forma positiva (`= 'admin'`) falla cerrada y es segura; la forma negada
-- (`<>`, `not in`) es la natural de escribir y es la que falla abierta.
--
-- ---------------------------------------------------------------------------
-- CÓMO APLICAR (base en PRODUCCIÓN)
-- ---------------------------------------------------------------------------
--   1. Supabase Dashboard → SQL Editor → pegar este archivo COMPLETO y ejecutar.
--      Es un único script autocontenido e idempotente: se puede correr dos veces
--      sin efecto adicional.
--   2. Al terminar, recargar el cache de esquema de PostgREST:
--
--        notify pgrst, 'reload schema';
--
--   3. Correr las consultas de verificación del final del PR.
--
-- No requiere deploy de la app: ninguna firma de función cambia y ningún
-- comportamiento visible se altera para un usuario ACTIVO con el rol correcto.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 · Guardas NULL-safe en los RPCs de rol negado
-- ============================================================================
-- Las cinco funciones de abajo son las ÚNICAS definiciones VIVAS de Bexa que
-- leen el rol en una variable y lo comparan en forma negada sin guarda de NULL.
-- Cada una se reconstruye desde el cuerpo VIGENTE de Bexa (no desde el canónico
-- del maestro: Bexa tiene extras —comisión por ítem, precios por tramo, campaña
-- en la venta— que deben sobrevivir intactos). El ÚNICO cambio respecto del
-- original es la línea marcada con `← 0030`.
--
-- Las definiciones NULL-unsafe que quedaron SUPERSEDIDAS por migraciones
-- posteriores no se tocan (no existen en la base): registrar_gasto de 0009/0013/
-- 0019 (dropeada en 0028) y registrar_venta de 0015 (reemplazada por 0018).
--
-- ⚠ REGLA DE LA 0024: `create or replace function` NO hereda los atributos de la
-- versión anterior — el security vuelve a INVOKER y el search_path se pierde.
-- Por eso DESPUÉS DE CADA `create or replace` va, obligatoriamente y como
-- statement aparte, su `alter function ... security definer set search_path`.
-- Es redundante a propósito. NO BORRAR por prolijidad.


-- ─── 1.1 · registrar_venta — cuerpo vigente de 0018 (comisión por ítem) ──────
-- Sin la guarda, un usuario desactivado con JWT vivo registra ventas: el check
-- `not in ('admin','colaborador')` da NULL y no levanta.
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

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid)
  security definer
  set search_path = public;

grant execute on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) to authenticated;

comment on function public.registrar_venta(uuid, venta_item_input[], text, estado_entrega, uuid) is
  'Registra una venta de forma atomica: valida stock, inserta venta + items (precio via resolver_precio), genera los movimientos de SALIDA y liquida la comision LINEA POR LINEA (override del producto > % del vendedor > default de configuracion). Ver 0018. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';


-- ─── 1.2 · cobrar_venta — cuerpo vigente de 0009 ─────────────────────────────
-- El check es `v_rol <> 'admin' and v_venta.vendedor_id <> v_actor_id`. Con
-- v_rol NULL sobre una venta AJENA la expresión da `NULL and true` = NULL → no
-- levanta: un usuario desactivado cobraba ventas de cualquier otro vendedor.
create or replace function public.cobrar_venta(
  p_venta_id     uuid,
  p_monto        numeric,
  p_metodo       metodo_pago default 'EFECTIVO',
  p_descripcion  text default null,
  p_fecha        timestamptz default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_venta        record;
  v_actor_id     uuid;
  v_rol          text;
  v_mov_id       uuid;
  v_id_publico   text;
  v_saldo        numeric(14,2);
  v_nuevo_cobrado numeric(14,2);
  v_nuevo_estado estado_cobro;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Monto debe ser > 0'; end if;

  -- Validación de negocio + lock
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta % no encontrada', p_venta_id; end if;
  if v_venta.estado_cobro = 'CANCELADA' then raise exception 'La venta está cancelada'; end if;
  if v_venta.estado_cobro = 'COBRADA'   then raise exception 'La venta ya está cobrada'; end if;

  v_saldo := v_venta.total - v_venta.total_cobrado;
  if p_monto > v_saldo then
    raise exception 'Monto excede el saldo pendiente (%): %', v_saldo, p_monto;
  end if;

  -- Autorización: admin siempre; vendedor solo sobre sus ventas
  v_rol := public.current_user_rol();
  if v_rol is null then raise exception 'Usuario sin perfil activo'; end if;  -- ← 0030
  if v_rol <> 'admin' and v_venta.vendedor_id <> v_actor_id then
    raise exception 'Solo el admin o el vendedor de la venta pueden cobrar';
  end if;

  -- 1) Insertar movimiento INGRESO
  insert into public.movimientos_caja (
    tipo, origen, monto, metodo_pago, descripcion, fecha, venta_id, created_by
  ) values (
    'INGRESO', 'COBRO_VENTA', p_monto, p_metodo,
    coalesce(p_descripcion, 'Cobro venta ' || v_venta.id_publico),
    coalesce(p_fecha, now()),
    p_venta_id, v_actor_id
  )
  returning id, id_publico into v_mov_id, v_id_publico;

  -- 2) Actualizar la venta: total_cobrado + estado_cobro
  v_nuevo_cobrado := v_venta.total_cobrado + p_monto;
  v_nuevo_estado := case
    when v_nuevo_cobrado >= v_venta.total then 'COBRADA'::estado_cobro
    when v_nuevo_cobrado > 0              then 'PARCIAL'::estado_cobro
    else 'PENDIENTE'::estado_cobro
  end;

  update public.ventas
    set total_cobrado = v_nuevo_cobrado,
        estado_cobro  = v_nuevo_estado,
        updated_by    = v_actor_id
    where id = p_venta_id;

  return v_mov_id;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.cobrar_venta(uuid, numeric, metodo_pago, text, timestamptz)
  security definer
  set search_path = public;


-- ─── 1.3 · cancelar_venta — cuerpo vigente de 0007 ───────────────────────────
-- Sin guarda, un usuario desactivado entraba por la rama de "no admin" pero
-- igual podía cancelar sus propias ventas sin cobros. Con la guarda, no pasa
-- del primer statement.
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

  -- Revertir stock: por cada item, una ENTRADA compensatoria
  for v_item in select producto_id, cantidad from public.venta_items where venta_id = p_venta_id loop
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


-- ─── 1.4 · recibir_compra — cuerpo vigente de 0014 ───────────────────────────
-- Compras es admin-only. Sin guarda, un desactivado registraba compras (y con
-- ellas ENTRADAS de stock y actualización del costo de los productos).
create or replace function public.recibir_compra(
  p_proveedor_id    uuid,
  p_items           compra_item_input[],
  p_numero_factura  text default null,
  p_notas           text default null,
  p_fecha           timestamptz default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_actor_id     uuid;
  v_rol          text;
  v_compra_id    uuid;
  v_id_publico   text;
  v_item         compra_item_input;
  v_mov_id       bigint;
  v_total        numeric(14,2) := 0;
  v_subtotal     numeric(14,2);
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  -- Compras es admin-only (matriz §6). SECURITY DEFINER no pasa por RLS,
  -- así que el check tiene que vivir acá — igual que en cancelar_compra.
  v_rol := public.current_user_rol();
  if v_rol is null then raise exception 'Usuario sin perfil activo'; end if;  -- ← 0030
  if v_rol <> 'admin' then
    raise exception 'Solo un admin puede registrar compras';
  end if;

  if p_proveedor_id is null then
    raise exception 'Proveedor requerido';
  end if;
  perform 1 from public.proveedores where id = p_proveedor_id and activo = true;
  if not found then
    raise exception 'Proveedor no encontrado o inactivo';
  end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) = 0 then
    raise exception 'La compra debe tener al menos un producto';
  end if;

  insert into public.compras (
    proveedor_id, numero_factura, notas, fecha, created_by, updated_by
  ) values (
    p_proveedor_id, p_numero_factura, p_notas, coalesce(p_fecha, now()), v_actor_id, v_actor_id
  ) returning id, id_publico into v_compra_id, v_id_publico;

  foreach v_item in array p_items loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad inválida para producto %', v_item.producto_id;
    end if;
    if v_item.costo_unitario is null or v_item.costo_unitario < 0 then
      raise exception 'Costo unitario inválido para producto %', v_item.producto_id;
    end if;

    perform 1 from public.productos where id = v_item.producto_id and activo = true;
    if not found then
      raise exception 'Producto % no encontrado o inactivo', v_item.producto_id;
    end if;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'ENTRADA', v_item.cantidad,
            'Compra ' || v_id_publico, v_actor_id)
    returning id into v_mov_id;

    v_subtotal := v_item.costo_unitario * v_item.cantidad;
    v_total := v_total + v_subtotal;

    insert into public.compra_items (
      compra_id, producto_id, cantidad, costo_unitario, subtotal, movimiento_stock_id
    ) values (
      v_compra_id, v_item.producto_id, v_item.cantidad, v_item.costo_unitario, v_subtotal, v_mov_id
    );

    update public.productos
      set costo = v_item.costo_unitario,
          updated_at = now(),
          updated_by = v_actor_id
      where id = v_item.producto_id;
  end loop;

  update public.compras set total = v_total where id = v_compra_id;

  return v_compra_id;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.recibir_compra(uuid, compra_item_input[], text, text, timestamptz)
  security definer
  set search_path = public;


-- ─── 1.5 · cancelar_compra — cuerpo vigente de 0008 ──────────────────────────
create or replace function public.cancelar_compra(
  p_compra_id  uuid,
  p_motivo     text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_compra    record;
  v_actor_id  uuid;
  v_rol       text;
  v_item      record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'No autenticado';
  end if;

  v_rol := public.current_user_rol();
  if v_rol is null then raise exception 'Usuario sin perfil activo'; end if;  -- ← 0030
  if v_rol <> 'admin' then
    raise exception 'Solo un admin puede cancelar compras';
  end if;

  select * into v_compra from public.compras where id = p_compra_id for update;
  if not found then
    raise exception 'Compra % no encontrada', p_compra_id;
  end if;
  if v_compra.estado = 'CANCELADA' then
    raise exception 'La compra ya está cancelada';
  end if;

  -- Por cada item una SALIDA compensatoria (el trigger valida que haya stock —
  -- si ya se vendió más de lo que había, va a fallar y el admin debe hacer
  -- AJUSTE manual antes de cancelar. Comportamiento honesto: no borrar stock
  -- que ya se vendió.)
  for v_item in select producto_id, cantidad from public.compra_items where compra_id = p_compra_id loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, created_by)
    values (v_item.producto_id, 'SALIDA', v_item.cantidad,
            'Cancelación compra ' || v_compra.id_publico, v_actor_id);
  end loop;

  update public.compras
    set estado            = 'CANCELADA',
        cancelada_at      = now(),
        cancelada_motivo  = p_motivo,
        updated_by        = v_actor_id
    where id = p_compra_id;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.cancelar_compra(uuid, text)
  security definer
  set search_path = public;


-- ============================================================================
-- BLOQUE 2 · resolver_precio y el resto de las SECURITY DEFINER — VERIFICADO
-- ============================================================================
-- No hay nada que emitir acá. Se deja escrito el resultado de la auditoría para
-- que el próximo que lea no tenga que repetirla.
--
-- `resolver_precio` recibió su ALTER en la 0024. La pregunta era si alguna
-- migración POSTERIOR la volvió a definir sin re-aplicarlo (lo que la dejaría
-- silenciosamente INVOKER en producción, que es exactamente el bug que la 0024
-- vino a arreglar). Se revisaron las migraciones 0025 a 0029:
--
--   resolver_precio se define en 0006, 0011, 0014 y 0022 — TODAS anteriores a
--   la 0024. Ninguna migración posterior a la 0024 la toca. El ALTER de la 0024
--   sigue siendo el último statement que le aplica: la función está DEFINER.
--
-- Se hizo la misma verificación para todas las funciones SECURITY DEFINER del
-- esquema: para cada una, su último `create or replace` es ANTERIOR al último
-- `alter function ... security definer` que la afecta. registrar_gasto es el
-- caso más reciente y la 0028 lo hizo bien (drop + create + ALTER en la línea
-- 213). No falta ningún ALTER.
--
-- (Los ALTER del BLOQUE 1 no son excepciones a esto: son la re-aplicación
-- obligatoria de los ALTER que esas mismas funciones ya tenían, porque el
-- `create or replace` de arriba los habría reseteado a INVOKER.)


-- ============================================================================
-- BLOQUE 3 · security_invoker en vistas — RE-ASERCIÓN (Bexa ya lo hizo en 0016)
-- ============================================================================
-- El maestro activó `security_invoker` en 7 vistas (PR #4). Bexa ya había hecho
-- ese trabajo por su cuenta en la migración 0016, y de forma más completa: cubrió
-- las mismas 7 y además decidió explícitamente las excepciones.
--
-- Los statements de abajo son una RE-ASERCIÓN idempotente: si la base está como
-- la dejó la 0016, no cambian nada. Están para cubrir el caso de que alguna vista
-- haya sido recreada a mano en producción (un `create view` sin la cláusula
-- pierde la opción y nadie se entera).
--
-- Se verificó que ninguna migración posterior a la 0016 recrea estas 7 vistas.
alter view public.v_ventas_lista       set (security_invoker = true);
alter view public.v_ventas_con_saldo   set (security_invoker = true);
alter view public.v_ventas_ganancia    set (security_invoker = true);
alter view public.v_comisiones_semana  set (security_invoker = true);
alter view public.saldo_caja           set (security_invoker = true);
alter view public.v_ranking_productos  set (security_invoker = true);
alter view public.v_ranking_vendedores set (security_invoker = true);

-- ─── NO TOCAR — vistas SIN security_invoker A PROPÓSITO ─────────────────────
-- Estas existen para DAR un acceso que la tabla base niega (patrón "seguridad de
-- COLUMNAS por rol": tabla admin-only + vista sin las columnas sensibles). Una
-- vista de esa familia DEPENDE de los privilegios del dueño; ponerle
-- security_invoker le devuelve CERO filas y rompe la pantalla. Ver 0016 y el
-- gotcha "Una vista NO aplica la RLS de sus tablas base".
--
--   · productos_catalogo   → protege por selección de columnas (sin costo ni
--                            comision_pct). Con invoker el vendedor se queda sin
--                            catálogo y NO PUEDE VENDER. (0016, ampliada en 0020)
--   · v_clientes_inactivos → dias_sin_comprar necesita alcance de empresa. Con
--                            invoker un vendedor vería como inactivo a un cliente
--                            que ayer le compró a otro. (0016)
--   · v_campanas           → el rol marketing no es admin ni vendedor; con invoker
--                            todas las métricas darían 0. (0016 / 0023 / 0028)
--   · v_campana_metricas   → ídem v_campanas. (0016 / 0023 / 0028)
--   · v_campana_gastos     → costo_real sale de gastos (admin-only) y marketing
--                            necesita el costo de SUS campañas. El WHERE
--                            campana_id is not null garantiza que nunca expone la
--                            caja general. (0028)
--
-- v_stock_bajo tampoco se toca acá: Bexa YA la puso con security_invoker en la
-- 0016 (en el maestro sigue siendo una decisión pendiente). No hay nada que
-- propagar en los dos sentidos.


-- ============================================================================
-- BLOQUE 4 · Privilegios de ejecución — revoke a PUBLIC y anon (maestro PR #11)
-- ============================================================================
-- Postgres otorga EXECUTE a PUBLIC por default en TODA función, y los default
-- privileges de Supabase suman `anon` explícitamente. Un `grant execute ... to
-- authenticated` AGREGA un permiso: no quita el que ya estaba. Resultado: los
-- RPCs de plata quedan invocables por `anon` vía PostgREST, y lo único que frena
-- a un anónimo es el `auth.uid() is null` de la primera línea — defensa única
-- donde tiene que haber dos capas.
--
-- Bexa venía revocando explícito función por función desde la 0017 (0017, 0020,
-- 0021, 0023, 0025, 0026, 0028, 0029 lo hacen bien), pero las de los módulos
-- ANTERIORES —justo los RPCs de plata: registrar_venta, cobrar_venta,
-- cancelar_venta, recibir_compra, cancelar_compra, resolver_precio,
-- kpi_ventas_periodo, contar_alertas— nunca fueron revocadas. Esto lo cierra en
-- bloque y de una vez.
--
-- ─── Verificación previa hecha sobre el código de la app ────────────────────
-- Se auditaron TODAS las rutas de `app/api/` y todos los `.rpc()` del repo:
--
--   · app/api/ tiene exactamente 3 rutas: auth/signout, contabilidad/csv y
--     search. NO hay rutas de webhook ni ningún endpoint con auth por API-key
--     propia. Las tres usan `createServerClient()`, que va con la sesión del
--     usuario (rol `authenticated`), no con la anon key pelada.
--   · `createServiceRoleClient()` existe en lib/supabase/server.ts pero solo lo
--     usa app/(dashboard)/usuarios/actions.ts, y para la Admin API de auth — no
--     para llamar RPCs.
--   · Los 29 `.rpc()` del repo salen todos de server actions o server components
--     del dashboard, siempre detrás de sesión.
--
-- CONCLUSIÓN: NINGUNA función del esquema public se invoca con el rol `anon`.
-- No hace falta devolverle ningún grant a anon. Si en el futuro se agrega un
-- webhook público que llame un RPC, hay que darle el grant EXPLÍCITO a esa
-- función (o llamarla con service_role, que es lo preferible).
--
-- Nota sobre el alcance del revoke en bloque: `pgcrypto` es la única extensión
-- del proyecto y `gen_random_uuid()` es built-in de pg_catalog desde PG13, así
-- que los `default gen_random_uuid()` de las tablas no dependen de este grant.
-- Las funciones de trigger tampoco se ven afectadas: Postgres chequea EXECUTE
-- sobre la función de trigger al CREAR el trigger, no al dispararlo.

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

-- Y que las funciones que se creen de acá en adelante nazcan limpias, para que
-- el grant de cada módulo vuelva a significar lo que dice.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;


-- ============================================================================
-- FIN · recordar ejecutar después:   notify pgrst, 'reload schema';
-- ============================================================================
