-- ============================================================================
-- 0036 · Cerrar la fuga de costo_snapshot en venta_items (review 2026-08-19)
--
-- La regla de oro del proyecto: "si un costo llega al client de un vendedor,
-- está MAL aunque la UI no lo muestre". La 0016 la cumplió para la vista
-- v_ventas_ganancia (filtro admin ADENTRO de la vista)… pero la tabla base
-- quedó abierta: la policy `venta_items_select` deja al vendedor ver SUS
-- items (correcto) y el `grant select` de la 0007 es de tabla entera — o sea
-- TODAS las columnas, costo_snapshot incluido. Un vendedor con su JWT podía
-- pedir `/rest/v1/venta_items?select=producto_id,costo_snapshot` por API
-- directa y reconstruir el costo del catálogo con lo que vendió.
--
-- Fix: grant por COLUMNAS — todas menos costo_snapshot. PostgREST arma el
-- `select *` implícito a partir de las columnas permitidas, así que la app
-- no se entera (además nunca selecciona costo_snapshot desde TS: verificado
-- 2026-08-19, cero usos en app/, components/ y lib/).
--
-- Quién SÍ sigue leyendo costo_snapshot:
--   - v_ventas_ganancia: corre como owner (sin security_invoker A PROPÓSITO,
--     0016 sección B) → no la afectan los grants de authenticated, y el
--     filtro admin vive adentro de la vista.
--   - Las RPCs (registrar_venta): SECURITY DEFINER, escriben como owner.
--
-- ⚠ Si mañana una pantalla de admin necesita costo_snapshot directo de la
-- tabla, NO devolver el grant de tabla entera: exponerlo por una vista con
-- gate de admin adentro, como v_ventas_ganancia.
-- ============================================================================

revoke select on public.venta_items from authenticated;

grant select (
  id,
  venta_id,
  producto_id,
  cantidad,
  precio_unitario,
  descuento_pct,
  precio_final_unit,
  origen_precio,
  movimiento_stock_id,
  created_at,
  comision_pct_snapshot,
  comision_monto
) on public.venta_items to authenticated;

-- anon ya estaba revocado en la 0007; se re-asegura por si acaso.
revoke all on public.venta_items from anon;

comment on column public.venta_items.costo_snapshot is
  'Snapshot del costo para ganancia. SIN grant a authenticated (0036): se lee SOLO via v_ventas_ganancia (gate admin adentro). No re-abrir con grant de tabla entera.';
