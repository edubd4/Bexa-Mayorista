-- ============================================================================
-- BEXA · 0016 · Cerrar la fuga de confidencialidad de las vistas
-- Hallazgo 1 de docs/AUDITORIA-FUNCIONAL.md.
--
-- EL PROBLEMA
-- En PostgreSQL una vista creada sin `security_invoker` se ejecuta con los
-- privilegios de su DUEÑO, no del que consulta. Las policies RLS de las tablas
-- de abajo NO se aplican. Todas nuestras vistas están grant a `authenticated`.
-- Consecuencia real, hoy, en la app: un vendedor abre /ventas y ve las ventas
-- de toda la empresa; abre /comisiones y ve la liquidación de sus compañeros.
--
-- POR QUÉ ESTA MIGRACIÓN VA VISTA POR VISTA Y NO CON UN LOOP
-- Cuatro de las vistas dependen de ese bypass para funcionar. Aplicar
-- `security_invoker = true` en bloque a las 13 deja al vendedor sin catálogo de
-- productos (no puede vender) y a marketing con las métricas en cero. Cada
-- excepción está justificada abajo, una por una. Si alguien agrega una vista
-- nueva: nace con `security_invoker = true` salvo que pueda escribir acá por
-- qué no.
--
-- LO QUE **NO** SE PUEDE HACER: revocar el grant a `authenticated`.
-- `authenticated` es el rol de Postgres de TODO usuario logueado — el admin
-- también lo es. No existe un rol de base de datos `admin`: ser admin es un
-- valor en `profiles.rol`. Revocar de `authenticated` rompe la vista para
-- todos, admin incluido. Por eso la protección de las vistas admin-only se
-- hace con un `where public.current_user_rol() = 'admin'` ADENTRO de la vista.
-- ============================================================================

-- ─── A. Vistas que pasan a respetar la RLS de sus tablas base ──────────────
-- En las tres primeras vive el hallazgo. `ventas` y `comisiones` ya tienen la
-- policy correcta desde la 0007 (`admin or vendedor_id = auth.uid()`); lo único
-- que faltaba era que la vista la respetara.

alter view public.v_ventas_lista       set (security_invoker = true);
alter view public.v_comisiones_semana  set (security_invoker = true);
alter view public.v_ventas_con_saldo   set (security_invoker = true);

-- `saldo_caja` lee movimientos_caja (policy `movcaja_select_admin`). Con
-- invoker, el vendedor obtiene cero filas y la suma da 0 — no un error. El
-- admin la sigue viendo completa. Es exactamente el comportamiento buscado.
alter view public.saldo_caja           set (security_invoker = true);

-- Estas tres leen `productos` (policy `productos_select_admin`) o `ventas`.
-- Solo las consume el panel de admin y /alertas, que ya son admin-only.
alter view public.v_stock_bajo         set (security_invoker = true);
alter view public.v_ranking_productos  set (security_invoker = true);
alter view public.v_ranking_vendedores set (security_invoker = true);

-- ─── B. v_ventas_ganancia — la más sensible del sistema ────────────────────
-- Expone costo_total y ganancia por venta. `security_invoker` SOLO no alcanza:
-- la policy de `ventas` es "admin OR vendedor_id = auth.uid()", así que el
-- vendedor pasaría a ver el costo y la ganancia DE SUS PROPIAS VENTAS. Eso
-- sigue siendo una fuga de costo y rompe la regla de oro de CLAUDE.md:
--   "Si un costo llega al client de un vendedor, está MAL aunque la UI no lo
--    muestre."
-- Por eso el filtro de rol va adentro de la vista.
drop view if exists public.v_ventas_ganancia;
create view public.v_ventas_ganancia
with (security_invoker = true) as
  select
    v.id, v.id_publico, v.fecha, v.total, v.total_cobrado, v.estado_cobro,
    coalesce(sum(vi.costo_snapshot * vi.cantidad), 0)::numeric(14,2) as costo_total,
    (v.total - coalesce(sum(vi.costo_snapshot * vi.cantidad), 0))::numeric(14,2) as ganancia
  from public.ventas v
  left join public.venta_items vi on vi.venta_id = v.id
  where v.estado_cobro <> 'CANCELADA'
    and public.current_user_rol() = 'admin'   -- ← admin-only, a nivel dato
  group by v.id;

grant select on public.v_ventas_ganancia to authenticated;
revoke all  on public.v_ventas_ganancia from anon;

-- ─── C. Las cuatro excepciones — NO llevan security_invoker ────────────────
-- Se documentan acá para que nadie las "arregle" por consistencia y tumbe algo.
--
-- 1) `productos_catalogo`
--    Protege por SELECCIÓN DE COLUMNAS (no trae costo ni comision_pct), no por
--    RLS. La policy de `productos` es `productos_select_admin`. Si la vista
--    respetara esa RLS, el vendedor se quedaría sin catálogo: no podría elegir
--    productos en /ventas/nuevo y NO PODRÍA VENDER. El bypass acá es el diseño,
--    no el bug.
--
-- 2) `v_clientes_inactivos`
--    Lee `clientes` LEFT JOIN `ventas` para calcular dias_sin_comprar. Con
--    invoker, el join se filtra por la RLS de ventas y el vendedor vería como
--    "última compra" solo SUS ventas. Un cliente que le compró ayer a otro
--    vendedor le aparecería con 300 días sin comprar, y le mandaría un mensaje
--    de reactivación a alguien que acaba de comprar. "Días sin comprar" solo
--    significa algo con alcance de empresa.
--
-- 3) `v_campana_metricas`
--    Agrega ventas atribuidas a cada campaña. El rol `marketing` no es admin ni
--    es vendedor de ninguna venta: con invoker no matchea ninguna rama de
--    `ventas_select` y TODAS las métricas le darían 0 — se rompe la única
--    pantalla que justifica el rol. Devuelve agregados por campaña, nunca filas
--    de ventas individuales.
--
-- 4) `v_campanas`
--    Trae costo_real desde `gastos` (policy `gastos_select_admin`). Con invoker,
--    marketing perdería el costo de sus propias campañas. El presupuesto de una
--    campaña no es el costo de un producto: son sensibilidades distintas.

comment on view public.productos_catalogo is
  'Sin security_invoker A PROPOSITO: protege por seleccion de columnas (sin costo ni comision_pct). Con invoker el vendedor se queda sin catalogo y no puede vender. Ver 0016.';
comment on view public.v_clientes_inactivos is
  'Sin security_invoker A PROPOSITO: dias_sin_comprar necesita alcance de empresa. Con invoker un vendedor veria como inactivo a un cliente que le compro ayer a otro. Ver 0016.';
comment on view public.v_campana_metricas is
  'Sin security_invoker A PROPOSITO: el rol marketing no es admin ni vendedor; con invoker todas las metricas darian 0. Devuelve agregados, nunca filas de ventas. Ver 0016.';
comment on view public.v_campanas is
  'Sin security_invoker A PROPOSITO: costo_real viene de gastos (admin-only) y marketing necesita el costo de sus campanas. Ver 0016.';
