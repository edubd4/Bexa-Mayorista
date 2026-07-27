-- ============================================================================
-- BEXA · 0023 · Anular gasto — cierra el hueco de CRUD de la revisión 2026-07-27
--
-- EL PROBLEMA
-- gastos es append-only (0009) y NO existía NINGÚN camino de corrección: un
-- gasto mal cargado (monto equivocado, categoría errada, duplicado) quedaba
-- para siempre inflando los reportes de finanzas y el costo de campañas.
-- Ventas tiene cancelar_venta, compras tiene cancelar_compra — gastos era la
-- única pata del circuito de plata sin reversa.
--
-- EL DISEÑO: ANULACIÓN, NO BORRADO
-- El gasto no se borra ni se edita — se ANULA, al estilo cancelar_venta:
--   1. Un INGRESO de caja origen AJUSTE devuelve la plata (la caja es
--      append-only y sigue siéndolo: la corrección es otro movimiento).
--   2. El gasto queda marcado (anulado_at/motivo/por) y los reportes lo
--      excluyen. El registro histórico completo se conserva.
-- Corregir un gasto = anularlo + cargar el correcto.
--
-- El trigger de inmutabilidad se afloja SOLO para esa marca: un UPDATE que
-- únicamente setee los campos anulado_* pasa; cualquier otro sigue rechazado.
-- ============================================================================

-- ─── Columnas de anulación ──────────────────────────────────────────────────
alter table public.gastos
  add column anulado_at     timestamptz,
  add column anulado_motivo text,
  add column anulado_por    uuid references auth.users(id);

create index idx_gastos_anulado on public.gastos(anulado_at) where anulado_at is not null;

-- ─── Inmutabilidad con UNA excepción: marcar la anulación ───────────────────
-- Comparación por jsonb sin los campos anulado_*: si el resto de la fila es
-- idéntico y la anulación pasa de null → valor, el UPDATE es la marca legítima.
create or replace function public.gastos_block_mutations()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE'
     and old.anulado_at is null
     and new.anulado_at is not null
     and (to_jsonb(old) - 'anulado_at' - 'anulado_motivo' - 'anulado_por')
       = (to_jsonb(new) - 'anulado_at' - 'anulado_motivo' - 'anulado_por')
  then
    return new;
  end if;
  raise exception 'gastos es inmutable: % no permitido. Un gasto mal cargado se ANULA (y se carga el correcto).', TG_OP;
end;
$$;

-- ─── RPC anular_gasto ───────────────────────────────────────────────────────
create or replace function public.anular_gasto(
  p_gasto_id  uuid,
  p_motivo    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto record;
begin
  -- Gastos y caja son admin-only: acá no hay variante para el vendedor.
  if public.current_user_rol() is distinct from 'admin' then
    raise exception 'Solo un admin puede anular un gasto';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'El motivo de la anulación es obligatorio';
  end if;

  select * into v_gasto from public.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Gasto no encontrado';
  end if;
  if v_gasto.anulado_at is not null then
    raise exception 'El gasto % ya está anulado', v_gasto.id_publico;
  end if;

  -- 1) La plata vuelve: INGRESO AJUSTE espejo del EGRESO original.
  insert into public.movimientos_caja (
    tipo, origen, monto, metodo_pago, descripcion, gasto_id, created_by
  ) values (
    'INGRESO', 'AJUSTE', v_gasto.monto, v_gasto.metodo_pago,
    'Anulación gasto ' || v_gasto.id_publico || ' · ' || btrim(p_motivo),
    v_gasto.id, auth.uid()
  );

  -- 2) La marca (única mutación que el trigger deja pasar).
  update public.gastos
    set anulado_at     = now(),
        anulado_motivo = btrim(p_motivo),
        anulado_por    = auth.uid()
    where id = p_gasto_id;
end;
$$;

comment on function public.anular_gasto is
  'Anula un gasto: INGRESO AJUSTE espejo en caja + marca anulado_*. No borra nada — la correccion es otro movimiento, como en toda la caja. Admin-only. Ver 0023.';

revoke all on function public.anular_gasto from public, anon;
grant execute on function public.anular_gasto to authenticated;

-- ─── Reglas de descuento: falta el GRANT de DELETE ──────────────────────────
-- Hueco de CRUD: la policy reglas_descuento_write_admin es FOR ALL (cubre
-- delete) pero la 0006 solo dio grant select/insert/update. Una regla vieja
-- solo se podía desactivar — se acumulaban inactivas para siempre. Borrar es
-- seguro: la venta guarda snapshot del descuento aplicado (venta_items).
grant delete on public.reglas_descuento to authenticated;

-- ─── Vistas de campañas: un gasto anulado ya no es costo ────────────────────
-- Cuerpos idénticos a los de la 0014, con `and g.anulado_at is null` en el
-- join del gasto. DROP + CREATE por el 42P16 de firmas (ver nota en 0014).

drop view if exists public.v_campana_metricas;
create view public.v_campana_metricas as
  with base_manual as (
    select
      v.campana_id,
      count(*)::integer                     as ventas_manuales,
      coalesce(sum(v.total), 0)::numeric(14,2) as monto_manual
    from public.ventas v
    where v.campana_id is not null
      and v.estado_cobro <> 'CANCELADA'
    group by v.campana_id
  ),
  -- Dedupe: una fila por (campaña, venta) aunque la venta tenga N items de la campaña
  ventas_auto as (
    select distinct cp.campana_id, v.id as venta_id, v.total
    from public.campana_productos cp
    join public.campanas c    on c.id = cp.campana_id
    join public.venta_items vi on vi.producto_id = cp.producto_id
    join public.ventas v      on v.id = vi.venta_id
    where v.estado_cobro <> 'CANCELADA'
      and v.fecha::date between c.fecha_inicio and c.fecha_fin
      and (v.campana_id is null or v.campana_id <> cp.campana_id)
  ),
  base_auto as (
    select
      campana_id,
      count(*)::integer                       as ventas_automaticas,
      coalesce(sum(total), 0)::numeric(14,2)  as monto_automatico
    from ventas_auto
    group by campana_id
  )
  select
    c.id as campana_id,
    coalesce(bm.ventas_manuales, 0)     as ventas_manuales,
    coalesce(bm.monto_manual, 0)::numeric(14,2)     as monto_manual,
    coalesce(ba.ventas_automaticas, 0)  as ventas_automaticas,
    coalesce(ba.monto_automatico, 0)::numeric(14,2) as monto_automatico,
    (coalesce(bm.ventas_manuales, 0) + coalesce(ba.ventas_automaticas, 0)) as ventas_totales,
    (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0))::numeric(14,2) as monto_total,
    coalesce(g.monto, 0)::numeric(14,2) as costo,
    case
      when coalesce(g.monto, 0) > 0 then
        round(
          (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0) - g.monto)
          / g.monto * 100, 2)
      else null
    end as roi_pct,
    case
      when (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)) > 0 then
        round(
          (coalesce(bm.monto_manual,0) + coalesce(ba.monto_automatico,0))
          / (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)),
          2)
      else 0
    end::numeric(14,2) as ticket_promedio
  from public.campanas c
  left join base_manual bm on bm.campana_id = c.id
  left join base_auto   ba on ba.campana_id = c.id
  left join public.gastos g on g.id = c.gasto_id and g.anulado_at is null;

grant select on public.v_campana_metricas to authenticated;
revoke all  on public.v_campana_metricas from anon;

drop view if exists public.v_campanas;
create view public.v_campanas as
  select
    c.*,
    coalesce(
      c.estado_manual::text,
      case
        when public.hoy_local() < c.fecha_inicio then 'PROGRAMADA'
        when public.hoy_local() > c.fecha_fin    then 'CONCLUIDA'
        else 'ACTIVA'
      end
    ) as estado_efectivo,
    g.monto as costo_real,
    (
      select count(*)::integer
      from public.campana_canal_asignaciones a
      where a.campana_id = c.id
    ) as canales_count,
    (
      select count(*)::integer
      from public.campana_productos cp
      where cp.campana_id = c.id
    ) as productos_count,
    (
      select count(*)::integer
      from public.campana_publicaciones p
      where p.campana_id = c.id
    ) as publicaciones_count
  from public.campanas c
  left join public.gastos g on g.id = c.gasto_id and g.anulado_at is null;

grant select on public.v_campanas to authenticated;
revoke all  on public.v_campanas from anon;

comment on view public.v_campanas is
  'Sin security_invoker A PROPOSITO: costo_real viene de gastos (admin-only) y marketing necesita el costo de sus campanas. Ver 0016. Gastos anulados excluidos desde 0023.';
comment on view public.v_campana_metricas is
  'Sin security_invoker A PROPOSITO: el rol marketing no es admin ni vendedor; con invoker todas las metricas darian 0. Devuelve agregados, nunca filas de ventas. Ver 0016. Gastos anulados excluidos desde 0023.';
