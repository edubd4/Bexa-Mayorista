-- ============================================================================
-- BEXA · 0024 · resolver_precio pasa a SECURITY DEFINER
-- Hallazgo de la revisión de lógica 2026-07-27.
--
-- EL BUG
-- resolver_precio() era security INVOKER y lee la TABLA productos
-- (precio_base, categoria). La policy de productos es SELECT admin-only
-- (0005, protege costo y comision_pct). Para un vendedor la consulta devuelve
-- cero filas → "producto no encontrado".
--
-- La consecuencia en la app: la cotización en vivo de /ventas/nuevo
-- (server action resolverPrecio) le falla al vendedor en cada línea, la línea
-- queda sin precio y el botón de guardar se deshabilita — EL VENDEDOR NO
-- PUEDE REGISTRAR VENTAS por el form. La venta en sí nunca estuvo rota:
-- registrar_venta() es SECURITY DEFINER y su llamada interna a
-- resolver_precio corre como owner. Por eso el bug es solo del preview…
-- que es la puerta de entrada del form.
--
-- EL FIX
-- SECURITY DEFINER, como registrar_venta / cobrar_venta / recibir_compra.
-- Es seguro: resolver_precio devuelve SOLO precios de venta (precio_base,
-- lista, tramo, descuento). El costo y la comisión no pasan por acá — la
-- regla de oro queda intacta.
--
-- OJO A FUTURO: cualquier CREATE OR REPLACE de resolver_precio RESETEA el
-- security a INVOKER (pasó en 0011, 0014 y 0022 sin consecuencias porque ya
-- venía invoker). Después de redefinirla, SIEMPRE re-aplicar este ALTER.
-- ============================================================================

alter function public.resolver_precio(uuid, uuid, integer)
  security definer
  set search_path = public;

comment on function public.resolver_precio is
  'Pricing engine: tramo (0022) > lista > precio_base, + reglas de descuento. SECURITY DEFINER desde 0024 (lee productos, que es select admin-only; devuelve SOLO precios de venta, nunca costo). Si se redefine con CREATE OR REPLACE, re-aplicar el ALTER de 0024.';
