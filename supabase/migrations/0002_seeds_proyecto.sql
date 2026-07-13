-- ============================================================================
-- BEXA · Seeds del proyecto (generada desde FORJA/registry/blueprints/bexa.yaml)
-- La 0001 es byte-idéntica al maestro y NO se toca; lo específico de BEXA va acá.
-- Los prefijos de id_publico son DATO (regla de oro #3): los triggers de cada
-- módulo los leen de configuracion.
-- ============================================================================

insert into public.configuracion (clave, valor, descripcion) values
  -- Identidad
  ('negocio_nombre',    'BEXA',  'Nombre comercial mostrado en la app y mensajes'),
  -- Parámetros del negocio (PLAN-TECNICO §4 seeds)
  ('comision_default_pct',          '5',    'Comisión por defecto del vendedor sobre la venta (%)'),
  ('alerta_cliente_inactivo_dias',  '60',   'Días sin comprar para considerar un cliente inactivo'),
  ('alerta_stock_bajo_habilitada',  'true', 'Mostrar alertas de stock bajo mínimo'),
  -- Prefijos de id_publico por módulo (blueprint)
  ('prefijo_clientes',         'CLI',  'Prefijo de id público de clientes'),
  ('prefijo_proveedores',      'PROV', 'Prefijo de id público de proveedores'),
  ('prefijo_productos',        'PROD', 'Prefijo de id público de productos'),
  ('prefijo_ventas',           'VTA',  'Prefijo de id público de ventas'),
  ('prefijo_compras',          'COMP', 'Prefijo de id público de compras'),
  ('prefijo_movimientos_caja', 'MOV',  'Prefijo de id público de movimientos de caja'),
  ('prefijo_gastos',           'GST',  'Prefijo de id público de gastos')
on conflict (clave) do update set
  valor = excluded.valor,
  descripcion = excluded.descripcion;
