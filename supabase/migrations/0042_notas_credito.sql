-- ============================================================================
-- 0042 · Notas de crédito electrónicas (RG 4540/2019)
-- Auditoría legal 2026-08-21 (engram bexa/facturacion-legal): una factura con
-- CAE no se edita ni se borra — la ÚNICA vía legal de anularla es la nota de
-- crédito electrónica de la misma letra, emitida dentro de los 15 días
-- corridos del hecho e identificando el comprobante original (CbtesAsoc).
--
-- Decisiones de diseño:
--   - La NC es OTRA fila de `comprobantes` (mismo append-only, misma
--     inmutabilidad) con `comprobante_asociado_id` → la factura que anula.
--     Factura ⇔ asociado NULL · NC ⇔ asociado NOT NULL (check abajo).
--   - v1: NC TOTAL únicamente — anula la factura completa (mismos montos).
--     La NC parcial (ajuste de precio post-factura) queda para cuando el
--     negocio la pida; el modelo ya la soporta relajando el unique parcial.
--   - Emite SOLO el admin: reduce el IVA declarado del negocio — no es una
--     acción de vendedor. (Policy de insert distingue por tipo.)
--   - La NC no toca stock/caja/comisión: es el documento FISCAL. La reversión
--     operativa es cancelar_venta — que desde esta migración vuelve a estar
--     permitida para ventas facturadas SI la factura ya tiene su NC (el freno
--     de la 0040 pasa de "tiene comprobante" a "tiene factura sin NC").
--
-- ⚠ Los DDL de abajo referencian SOLO los valores viejos del enum
--   ('FACTURA_A'/'FACTURA_B') o `comprobante_asociado_id` — usar un valor
--   recién agregado en la misma transacción es error de Postgres.
-- ============================================================================

-- ─── Enum: tipos de nota de crédito (códigos ARCA 3 y 8) ────────────────────
alter type tipo_comprobante add value if not exists 'NOTA_CREDITO_A';
alter type tipo_comprobante add value if not exists 'NOTA_CREDITO_B';

-- ─── comprobantes: vínculo NC → factura + motivo ────────────────────────────
alter table public.comprobantes
  add column comprobante_asociado_id uuid references public.comprobantes(id) on delete restrict,
  add column motivo text;

comment on column public.comprobantes.comprobante_asociado_id is
  'NULL = factura. NOT NULL = nota de credito que anula ese comprobante (RG 4540: la NC identifica al original — esto es el CbtesAsoc persistido).';
comment on column public.comprobantes.motivo is
  'Solo NC: el hecho que la origina (devolucion, error de carga). RG 4540 da 15 dias corridos desde ese hecho.';

-- El "una factura por venta" era unique(venta_id) — ahora conviven factura +
-- NC en la misma venta. Se reemplaza por uniques PARCIALES:
alter table public.comprobantes drop constraint comprobantes_venta_id_key;

-- Coherencia tipo ↔ asociado (solo valores viejos del enum — ver header):
alter table public.comprobantes add constraint comprobantes_asociado_coherente
  check ((comprobante_asociado_id is null) = (tipo in ('FACTURA_A', 'FACTURA_B')));

-- Una factura por venta (igual que antes, ahora sin contar las NC):
create unique index comprobantes_factura_unica_por_venta
  on public.comprobantes(venta_id)
  where comprobante_asociado_id is null;

-- Una NC por factura (v1 = NC total; relajar acá el día que haya parciales):
create unique index comprobantes_nc_unica_por_factura
  on public.comprobantes(comprobante_asociado_id)
  where comprobante_asociado_id is not null;

-- ─── RLS: la NC la emite solo el admin ──────────────────────────────────────
-- Facturas: igual que 0031 (admin o vendedor dueño). NC: admin únicamente.
drop policy "comprobantes_insert" on public.comprobantes;
create policy "comprobantes_insert"
  on public.comprobantes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.ventas v
      where v.id = comprobantes.venta_id
        and (
          public.current_user_rol() = 'admin'
          or (v.vendedor_id = auth.uid() and comprobantes.comprobante_asociado_id is null)
        )
    )
  );

-- ─── cancelar_venta: el freno fiscal ahora entiende la NC ───────────────────
-- Cuerpo = 0040 con UN cambio: bloquea solo si hay factura SIN nota de
-- crédito. Con la NC emitida, la venta facturada se puede cancelar (y el
-- circuito queda entero: NC anula lo fiscal, cancelar revierte lo operativo).
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

  -- ← 0042: freno fiscal con notas de crédito. Una factura con CAE solo se
  -- neutraliza con su NC — recién ahí la venta se puede cancelar.
  if exists (
    select 1 from public.comprobantes f
    where f.venta_id = p_venta_id
      and f.comprobante_asociado_id is null
      and not exists (
        select 1 from public.comprobantes nc
        where nc.comprobante_asociado_id = f.id
      )
  ) then
    raise exception 'La venta tiene una factura con CAE sin anular — emití primero la nota de crédito desde la ficha de la venta.';
  end if;

  -- ← 0040: carrera inversa — cancelar MIENTRAS hay una emisión en vuelo
  -- (candado 0038 tomado) produciría venta cancelada + CAE recién emitido.
  if exists (select 1 from public.comprobantes_en_curso where venta_id = p_venta_id) then
    raise exception 'Hay una emisión de comprobante en curso para esta venta — esperá unos segundos y reintentá.';
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
  'Cancela una venta: RECHAZA si tiene factura con CAE sin nota de credito (0042 — con NC emitida si se puede), repone stock SOLO de items con movimiento_stock_id (0034), devuelve lo cobrado con EGRESO AJUSTE espejo usando el metodo del ultimo cobro (0037/0040) y marca CANCELADA. Autoriza admin, o vendedor propio sin cobros. Guarda NULL-safe de rol desde 0030 — si se redefine, re-aplicar el ALTER.';

-- ─── Vistas 0033: el join a comprobantes ahora es SOLO facturas ─────────────
-- Sin el filtro, la NC duplicaría la fila de la venta en la lista y contaría
-- doble en el resumen. Mismas columnas — OR REPLACE seguro.
create or replace view public.v_ventas_lista as
  select v.id, v.id_publico, v.fecha,
         v.cliente_id, v.vendedor_id,
         v.estado_entrega, v.estado_cobro,
         v.subtotal, v.descuento_total, v.total, v.total_cobrado,
         (v.total - v.total_cobrado) as saldo,
         (select count(*) from public.venta_items where venta_id = v.id) as items_count,
         (c.id is not null)  as facturada,
         c.tipo              as comp_tipo,
         c.punto_venta       as comp_punto_venta,
         c.numero            as comp_numero
  from public.ventas v
  left join public.comprobantes c
    on c.venta_id = v.id and c.comprobante_asociado_id is null;

alter view public.v_ventas_lista set (security_invoker = true);

create or replace view public.v_resumen_facturacion as
  select (c.id is not null)              as facturada,
         count(*)                        as cantidad,
         coalesce(sum(v.total), 0)       as monto_total,
         coalesce(sum(v.total_cobrado), 0) as monto_cobrado,
         coalesce(sum(v.total - v.total_cobrado), 0) as saldo
  from public.ventas v
  left join public.comprobantes c
    on c.venta_id = v.id and c.comprobante_asociado_id is null
  where v.estado_cobro <> 'CANCELADA'
  group by (c.id is not null);

alter view public.v_resumen_facturacion set (security_invoker = true);
