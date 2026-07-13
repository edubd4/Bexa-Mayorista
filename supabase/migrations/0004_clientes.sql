-- ============================================================================
-- BEXA · Ola A · Módulo Clientes (CLI-XXXX)
-- Maestro. Adaptado desde Tecnopro (PARTICULAR/EMPRESA) al dominio distribuidora:
--   tipo = MAYORISTA | MINORISTA (decisión del cliente 2026-07-13)
-- Blueprint extras: lista_precio_id (opcional, FK al módulo listas-precios que
-- llega en 0006), instagram, ciudad ya venía en base.
-- Sigue la anatomía canónica de FORJA/docs/PATRONES.md.
-- ============================================================================

-- ─── Enum del dominio ───────────────────────────────────────────────────────
create type tipo_cliente as enum ('MAYORISTA', 'MINORISTA');

-- ─── Secuencia + tabla ──────────────────────────────────────────────────────
create sequence public.clientes_id_publico_seq start with 1;

create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  id_publico     text not null unique,
  tipo           tipo_cliente not null default 'MINORISTA',
  -- Identificación
  nombre         text not null,               -- persona o comercial (obligatorio)
  apellido       text,                        -- típico en MINORISTA
  razon_social   text,                        -- típico en MAYORISTA
  documento      text,                        -- DNI o CUIT
  -- Contacto
  telefono       text,
  whatsapp       text,
  instagram      text,                        -- ★ blueprint: los mayoristas venden por IG
  email          text,
  -- Domicilio
  direccion      text,
  ciudad         text,
  provincia      text,
  -- Comerciales
  lista_precio_id uuid,                       -- ★ FK diferida: se agrega en 0006_listas_precios.sql
                                              --   Nullable → si no tiene lista, se usa precio_base del producto.
  notas          text,
  -- Soft delete (los históricos de ventas los referencian por FK)
  activo         boolean not null default true,
  -- Auditoría
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id)
);

-- ─── Trigger id_publico (prefijo desde configuracion — regla de oro #3) ─────
create or replace function public.set_cliente_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_clientes';
    new.id_publico := coalesce(v_prefijo, 'CLI') || '-' ||
                      lpad(nextval('public.clientes_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger clientes_set_id_publico
  before insert on public.clientes
  for each row execute function public.set_cliente_id_publico();

create trigger clientes_touch_updated_at
  before update on public.clientes
  for each row execute function public.touch_updated_at();

-- ─── Índices ────────────────────────────────────────────────────────────────
create index idx_clientes_activo    on public.clientes(activo);
create index idx_clientes_tipo      on public.clientes(tipo);
create index idx_clientes_nombre    on public.clientes(lower(nombre));
create index idx_clientes_apellido  on public.clientes(lower(apellido))     where apellido     is not null;
create index idx_clientes_razon     on public.clientes(lower(razon_social)) where razon_social is not null;
create index idx_clientes_documento on public.clientes(documento)           where documento    is not null;
create index idx_clientes_telefono  on public.clientes(telefono)            where telefono     is not null;
create index idx_clientes_instagram on public.clientes(lower(instagram))    where instagram    is not null;

-- ─── RLS ─── (misma política que proveedores: authenticated lee, admin escribe)
alter table public.clientes enable row level security;

create policy "clientes_select_authenticated"
  on public.clientes for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "clientes_write_admin"
  on public.clientes for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.clientes to authenticated;
grant usage on sequence public.clientes_id_publico_seq to authenticated;
revoke all on public.clientes from anon;

-- ─── Seed especial: Consumidor Final ────────────────────────────────────────
-- Decisión cliente 2026-07-13: se hacen ventas minoristas sin cliente registrado.
-- Ese cliente especial vive con UUID e id_publico fijos ('CLI-0000', fuera de
-- la secuencia que arranca en 1) para poder referenciarlo desde la UI de venta
-- rápida. NO se debe desactivar ni borrar — el módulo ventas lo asume presente.
insert into public.clientes (id, id_publico, tipo, nombre, notas, activo)
values (
  '00000000-0000-0000-0000-000000000001',
  'CLI-0000',
  'MINORISTA',
  'Consumidor Final',
  'Cliente especial del sistema — venta minorista sin registrar. No editar ni desactivar.',
  true
)
on conflict (id) do nothing;
