-- ============================================================================
-- BEXA · Ola A · Módulo Proveedores (PROV-XXXX)
-- Maestro simple: no depende de nada. Referenciado por productos y compras.
-- Sigue la anatomía canónica de FORJA/docs/PATRONES.md:
--   enum + tabla + trigger id_publico (prefijo desde configuracion) + RLS +
--   GRANTs explícitos + REVOKE anon. Soft delete vía `activo boolean`.
-- Nace ACÁ en Bexa (Tecnopro no tenía proveedores → primera cosecha nueva).
-- ============================================================================

-- ─── Secuencia + tabla ──────────────────────────────────────────────────────
create sequence public.proveedores_id_publico_seq start with 1;

create table public.proveedores (
  id                uuid primary key default gen_random_uuid(),
  id_publico        text not null unique,
  -- Identificación del proveedor
  nombre            text not null,          -- razón social o comercial (obligatorio)
  cuit              text,                    -- CUIT (opcional pero indexado)
  -- Contacto operativo (persona a la que se le pide/paga)
  contacto_nombre   text,
  telefono          text,
  whatsapp          text,
  email             text,
  -- Domicilio
  direccion         text,
  ciudad            text,
  provincia         text,
  -- Comerciales (texto libre en el MVP; si aparece patrón, se formaliza)
  condiciones_pago  text,                    -- "30 días", "contado", "50/50", etc.
  notas             text,
  -- Soft delete: no borramos históricos porque los referencian compras
  activo            boolean not null default true,
  -- Auditoría estándar
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id)
);

-- ─── Trigger id_publico (prefijo desde configuracion — regla de oro #3) ─────
create or replace function public.set_proveedor_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_proveedores';
    new.id_publico := coalesce(v_prefijo, 'PROV') || '-' ||
                      lpad(nextval('public.proveedores_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger proveedores_set_id_publico
  before insert on public.proveedores
  for each row execute function public.set_proveedor_id_publico();

create trigger proveedores_touch_updated_at
  before update on public.proveedores
  for each row execute function public.touch_updated_at();

-- ─── Índices ────────────────────────────────────────────────────────────────
create index idx_proveedores_activo    on public.proveedores(activo);
create index idx_proveedores_nombre    on public.proveedores(lower(nombre));
create index idx_proveedores_cuit      on public.proveedores(cuit)     where cuit     is not null;
create index idx_proveedores_telefono  on public.proveedores(telefono) where telefono is not null;

-- ─── RLS (usar current_user_rol() — NUNCA subquery a profiles: recursión) ───
alter table public.proveedores enable row level security;

-- Cualquier usuario autenticado lee proveedores (para JOIN al mostrar producto).
-- Los precios/costos siguen protegidos por la vista sin costos (§6 PLAN-TECNICO).
create policy "proveedores_select_authenticated"
  on public.proveedores for select
  to authenticated
  using (public.current_user_rol() is not null);

-- Solo admin escribe (alta, edición, soft delete).
create policy "proveedores_write_admin"
  on public.proveedores for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- ─── GRANTs explícitos + REVOKE anon ────────────────────────────────────────
grant select, insert, update on public.proveedores to authenticated;
grant usage on sequence public.proveedores_id_publico_seq to authenticated;
revoke all on public.proveedores from anon;
