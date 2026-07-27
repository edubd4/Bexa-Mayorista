-- ============================================================================
-- BEXA · 0017 · Dos cambios de permisos pedidos por el cliente
--
--   A. Campañas: las crea MARKETING (y el admin). El vendedor solo las MIRA.
--   B. Productos: el vendedor puede DAR DE ALTA productos.
--
-- Contexto de A: la 0011 dejó `campanas_all_authenticated` (policy FOR ALL) con
-- el comentario "Decisión cliente: admin + vendedor pueden crear/editar
-- campañas. Rol 'marketing' se resolverá en Fase 2 si el cliente lo pide."
-- El cliente lo pidió: el área de marketing es la dueña de las campañas. Hoy un
-- vendedor puede crear, editar el presupuesto y BORRAR publicaciones — y ni la
-- RLS ni las server actions lo frenan (las 6 usan requireAuthenticated sin
-- mirar el rol). Esto lo cierra en la base; las actions se ajustan en el mismo
-- commit.
-- ============================================================================

-- ─── A. Campañas ───────────────────────────────────────────────────────────

-- Helper: quién gestiona campañas. En función y no repetido en 5 policies para
-- que el día que entre otro rol se cambie en UN lugar.
create or replace function public.puede_gestionar_campanas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_rol() in ('admin', 'marketing');
$$;

comment on function public.puede_gestionar_campanas() is
  'Quien puede CREAR/EDITAR/BORRAR campanas: admin y marketing. El vendedor solo lee. Ver 0017.';

revoke all on function public.puede_gestionar_campanas() from public, anon;
grant execute on function public.puede_gestionar_campanas() to authenticated;

-- campanas
drop policy if exists "campanas_all_authenticated" on public.campanas;

create policy "campanas_select_authenticated"
  on public.campanas for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "campanas_write_marketing"
  on public.campanas for all
  to authenticated
  using (public.puede_gestionar_campanas())
  with check (public.puede_gestionar_campanas());

-- campana_canal_asignaciones
drop policy if exists "canal_asig_all_authenticated" on public.campana_canal_asignaciones;

create policy "canal_asig_select_authenticated"
  on public.campana_canal_asignaciones for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "canal_asig_write_marketing"
  on public.campana_canal_asignaciones for all
  to authenticated
  using (public.puede_gestionar_campanas())
  with check (public.puede_gestionar_campanas());

-- campana_productos
drop policy if exists "campana_productos_all_authenticated" on public.campana_productos;

create policy "campana_productos_select_authenticated"
  on public.campana_productos for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "campana_productos_write_marketing"
  on public.campana_productos for all
  to authenticated
  using (public.puede_gestionar_campanas())
  with check (public.puede_gestionar_campanas());

-- campana_publicaciones
drop policy if exists "publicaciones_all_authenticated" on public.campana_publicaciones;

create policy "publicaciones_select_authenticated"
  on public.campana_publicaciones for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "publicaciones_write_marketing"
  on public.campana_publicaciones for all
  to authenticated
  using (public.puede_gestionar_campanas())
  with check (public.puede_gestionar_campanas());

-- `campana_canales` (el catálogo de canales: Instagram, WhatsApp, ...) ya era
-- select-authenticated + write-admin desde la 0011. Queda como está: es
-- configuración del sistema, no contenido de campaña.

-- ─── B. Alta de productos por el vendedor ──────────────────────────────────
--
-- POR QUÉ UN RPC Y NO AFLOJAR LA RLS.
-- La policy `productos_select_admin` (0005) existe para proteger dos columnas:
-- `costo` y `comision_pct`. Y el GRANT de tabla ya está dado:
--   grant select, insert, update on public.productos to authenticated;
-- Lo ÚNICO que frena hoy al vendedor es esa policy. Si la aflojamos para que
-- pueda insertar, le abrimos también la lectura de costo y comisión de TODO el
-- catálogo. Se rompe la regla de oro de CLAUDE.md.
--
-- La distinción que hace funcionar esto: ESCRIBIR un costo al dar de alta no es
-- lo mismo que LEER los costos del catálogo. El vendedor trae el producto y
-- sabe cuánto le salió — lo tipea. Nunca lo lee de vuelta: la ficha usa
-- `productos_catalogo`, que no trae la columna.
--
-- Por eso: SECURITY DEFINER, lista blanca de parámetros, y `comision_pct` NO es
-- parámetro. La comisión la pone solo el admin (decisión del cliente).
create or replace function public.crear_producto_vendedor(
  p_nombre        text,
  p_sku           text    default null,
  p_descripcion   text    default null,
  p_categoria     text    default null,
  p_marca         text    default null,
  p_atributos     jsonb   default '{}'::jsonb,
  p_proveedor_id  uuid    default null,
  p_costo         numeric default 0,
  p_precio_base   numeric default 0,
  p_stock_minimo  integer default 0
)
-- Los OUT se llaman producto_* y no id/id_publico a propósito: en plpgsql los
-- parámetros de salida sombrean los nombres de columna y el RETURNING quedaría
-- ambiguo.
returns table (producto_id uuid, producto_id_publico text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_id  uuid;
  v_pub text;
  v_sku text;
begin
  -- Como es SECURITY DEFINER se saltea la RLS: el check de rol va acá adentro.
  -- Marketing queda afuera a propósito — no carga catálogo (matriz de la 0015).
  v_rol := public.current_user_rol();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para dar de alta productos';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;
  if p_costo < 0 or p_precio_base < 0 then
    raise exception 'Ni el costo ni el precio pueden ser negativos';
  end if;
  if p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  -- `sku` es unique. Sin este check, un SKU repetido le devuelve al vendedor el
  -- error crudo de Postgres ("duplicate key value violates unique constraint").
  v_sku := nullif(btrim(coalesce(p_sku, '')), '');
  if v_sku is not null and exists (select 1 from public.productos where sku = v_sku) then
    raise exception 'Ya hay un producto con el SKU %. Buscalo en el catálogo antes de cargarlo de nuevo.', v_sku;
  end if;

  insert into public.productos (
    nombre, sku, descripcion, categoria, marca, atributos,
    proveedor_id, costo, precio_base, stock_minimo,
    comision_pct,          -- ← SIEMPRE null. Solo el admin la define después.
    created_by, updated_by
  ) values (
    btrim(p_nombre),
    v_sku,
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    nullif(btrim(coalesce(p_categoria, '')), ''),
    nullif(btrim(coalesce(p_marca, '')), ''),
    coalesce(p_atributos, '{}'::jsonb),
    p_proveedor_id,
    p_costo,
    p_precio_base,
    p_stock_minimo,
    null,
    auth.uid(),
    auth.uid()
  )
  returning productos.id, productos.id_publico into v_id, v_pub;

  return query select v_id, v_pub;
end;
$$;

comment on function public.crear_producto_vendedor is
  'Alta de producto para admin y vendedor. SECURITY DEFINER con lista blanca de parametros: comision_pct NO es parametro (la define solo el admin). Permite ESCRIBIR el costo sin habilitar LEER los costos del catalogo. Ver 0017.';

revoke all on function public.crear_producto_vendedor from public, anon;
grant execute on function public.crear_producto_vendedor to authenticated;
