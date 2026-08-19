-- ============================================================================
-- 0039 · URGENTE: la 0036 rompió /finanzas — v_ventas_ganancia sin invoker
--
-- El bug (introducido por la 0036, detectado por review el mismo día):
-- `v_ventas_ganancia` corre con security_invoker = true (0016, re-asegurado
-- en 0030) → ejecuta como el rol `authenticated`. La 0036 le revocó a
-- `authenticated` la columna venta_items.costo_snapshot, que la vista lee
-- para calcular ganancia. Resultado: la query muere con permission denied,
-- /finanzas hace `data ?? []` y muestra "Ganancia $0 / margen 0%" EN
-- SILENCIO. El negocio parece no dejar ganancia.
--
-- Fix: la vista pasa a correr como OWNER (quinta excepción del sistema, se
-- suma a las 4 documentadas en 0016 sección C). Es seguro porque el gate
-- admin vive ADENTRO de la vista desde la 0016:
--   `and public.current_user_rol() = 'admin'` — a nivel dato.
-- Un vendedor que la consulta recibe cero filas, con o sin invoker. Y el
-- agujero que cerró la 0036 (select directo de venta_items.costo_snapshot
-- por API) sigue cerrado: esto no re-otorga ningún grant de columna.
--
-- ⚠ Si esta vista se redefine algún día: NO volver a ponerle
-- security_invoker = true mientras costo_snapshot no tenga grant (0036) —
-- se rompe /finanzas de nuevo, y en silencio.
-- ============================================================================

alter view public.v_ventas_ganancia set (security_invoker = false);

comment on view public.v_ventas_ganancia is
  'Ganancia real por venta (total - costos snapshot). SIN security_invoker A PROPOSITO desde 0039: la 0036 revoco costo_snapshot a authenticated y con invoker la vista muere (finanzas en $0 silencioso). El gate admin vive adentro de la vista (0016). Quinta excepcion junto a las 4 de la 0016 seccion C.';
