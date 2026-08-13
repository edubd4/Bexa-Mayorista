-- ============================================================================
-- BEXA · Facturación separada: circuito facturado vs sin facturar
-- Pedido del cliente 2026-08-05 (referencia: sistema Jamrock): poder NO
-- facturar una venta pero tener TODO registrado igual, y ver los montos,
-- ventas y movimientos separados por facturado / sin facturar.
--
-- El modelo YA lo soporta (la emisión es opcional desde la 0031: venta sin
-- fila en `comprobantes` = sin facturar). Esta migración lo EXPONE:
--   1. v_ventas_lista suma la marca `facturada` + identificación del
--      comprobante — la lista filtra y muestra sin N+1.
--   2. v_resumen_facturacion: totales agrupados por facturada. Con
--      security_invoker la RLS de ventas recorta sola: el vendedor ve SUS
--      totales, el admin los del negocio. Canceladas afuera.
-- ============================================================================

-- ─── 1. v_ventas_lista con la marca fiscal ──────────────────────────────────
-- OR REPLACE solo agrega columnas al final — las existentes no cambian, la UI
-- vieja sigue andando durante el deploy.
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
  left join public.comprobantes c on c.venta_id = v.id;

-- OR REPLACE conserva las opciones de la vista, pero el invoker es la línea
-- de defensa del vendedor (0016) — se re-asegura explícito, no por fe.
alter view public.v_ventas_lista set (security_invoker = true);

grant select on public.v_ventas_lista to authenticated;
revoke all on public.v_ventas_lista from anon;

-- ─── 2. Resumen por circuito ────────────────────────────────────────────────
-- Una fila por estado de facturación. La lista de ventas pinta las tarjetas
-- "Facturado" / "Sin facturar" de acá — sin traerse las 200 filas del límite.
create or replace view public.v_resumen_facturacion as
  select (c.id is not null)              as facturada,
         count(*)                        as cantidad,
         coalesce(sum(v.total), 0)       as monto_total,
         coalesce(sum(v.total_cobrado), 0) as monto_cobrado,
         coalesce(sum(v.total - v.total_cobrado), 0) as saldo
  from public.ventas v
  left join public.comprobantes c on c.venta_id = v.id
  where v.estado_cobro <> 'CANCELADA'
  group by (c.id is not null);

alter view public.v_resumen_facturacion set (security_invoker = true);

grant select on public.v_resumen_facturacion to authenticated;
revoke all on public.v_resumen_facturacion from anon;
