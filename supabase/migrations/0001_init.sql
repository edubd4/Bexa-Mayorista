-- ============================================================================
-- FORJA · Migración inicial canónica (core)
-- Schema base: perfiles, roles, configuración, historial inmutable, helpers.
-- Tablas de dominio (clientes, ventas, etc.) viven en migrations/modulos/.
-- ============================================================================
-- Esta migración es BYTE-IDÉNTICA en todos los proyectos hijos.
-- Lo específico del proyecto (nombre del negocio, prefijos de id_publico,
-- parámetros) va en una migración de seeds generada desde el blueprint
-- (0002_seeds_proyecto.sql) — acá solo defaults genéricos con on conflict.
--
-- Gotchas ya foldeados (no re-descubrir — ver docs/GOTCHAS.md):
-- - current_user_rol() SECURITY DEFINER: policies SIN subquery a profiles (recursión)
-- - GRANTs explícitos + REVOKE anon en toda tabla
-- - FK historial.user_id → profiles para embeds PostgREST (además de auth.users)
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Enums del core ──────────────────────────────────────────────────────────
-- Roles: nombres de ESQUEMA fijos ('admin' | 'colaborador'). Lo que ve el
-- usuario ("Técnico", "Vendedor") sale de lib/dominio.ts — regla de oro #1.
create type rol_usuario as enum ('admin', 'colaborador');

-- Tipos de evento genéricos. Los módulos agregan los suyos con
-- ALTER TYPE tipo_evento ADD VALUE en su propia migración.
create type tipo_evento as enum (
  'ALTA',
  'MODIFICACION',
  'BAJA',
  'CAMBIO_ESTADO',
  'MOVIMIENTO',
  'COBRO',
  'GASTO',
  'NOTA',
  'ALERTA',
  'MENSAJE_IA',
  'SISTEMA'
);

-- ─── Tabla: profiles ────────────────────────────────────────────────────────
-- Espejo de auth.users con campos de negocio. PK = auth.users.id.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text not null,
  rol         rol_usuario not null default 'colaborador',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_profiles_rol on public.profiles(rol) where activo = true;

-- ─── Helper: rol del usuario actual (SECURITY DEFINER — anti-recursión) ─────
-- Las policies usan SIEMPRE este helper. JAMÁS subquery directa a profiles.
-- Va DESPUÉS de profiles: es `language sql`, y Postgres valida el catálogo al
-- crear la función (a diferencia de plpgsql, que es perezosa) — gotcha pagado.
create or replace function public.current_user_rol()
returns text
language sql stable security definer set search_path = public as $$
  select rol::text from public.profiles where id = auth.uid() and activo = true
$$;

alter table public.profiles enable row level security;

-- Cada usuario lee su propio perfil. Admin lee todos.
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.current_user_rol() = 'admin');

-- Solo admin escribe perfiles (roles, activo). Insert lo hace el trigger definer.
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

grant select, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- ─── Tabla: configuracion ───────────────────────────────────────────────────
-- Key-value para parámetros del negocio Y prefijos de id_publico de módulos
-- (prefijo_<modulo> = 'CLI'): el prefijo es DATO, no código — regla de oro #3.
create table public.configuracion (
  id           bigserial primary key,
  clave        text not null unique,
  valor        text,
  descripcion  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id)
);

alter table public.configuracion enable row level security;

create policy "configuracion_select_authenticated"
  on public.configuracion for select
  to authenticated using (true);

create policy "configuracion_write_admin"
  on public.configuracion for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

grant select, insert, update on public.configuracion to authenticated;
grant usage on sequence public.configuracion_id_seq to authenticated;
revoke all on public.configuracion from anon;

-- Seeds genéricos — el 0002 del proyecto (generado del blueprint) los pisa.
insert into public.configuracion (clave, valor, descripcion) values
  ('negocio_nombre',    'Forja', 'Nombre comercial mostrado en la app y mensajes'),
  ('negocio_telefono',  '',      'Teléfono de contacto'),
  ('negocio_direccion', '',      'Dirección física'),
  ('moneda_default',    'ARS',   'Moneda por defecto para operaciones')
on conflict (clave) do nothing;

-- ─── Tabla: historial (audit log inmutable) ─────────────────────────────────
-- Solo INSERT. Update/delete bloqueados por RLS (sin policies) y por trigger.
create table public.historial (
  id           bigserial primary key,
  tipo         tipo_evento not null,
  descripcion  text not null,
  entidad_tipo text,                 -- 'cliente' | 'venta' | ... (nombre de ESQUEMA)
  entidad_id   text,                 -- id_publico legible (CLI-0001), no uuid
  payload      jsonb,                -- snapshot del cambio
  user_id      uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- FK adicional hacia profiles: habilita el embed `usuario:user_id(nombre)` en
-- PostgREST (la FK a auth.users no sirve — schema no expuesto). Gotcha pagado.
alter table public.historial
  add constraint historial_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id)
  on delete set null;

create index idx_historial_entidad on public.historial(entidad_tipo, entidad_id);
create index idx_historial_tipo    on public.historial(tipo);
create index idx_historial_created on public.historial(created_at desc);
create index idx_historial_user    on public.historial(user_id);

alter table public.historial enable row level security;

-- Lectura: solo admin
create policy "historial_select_admin"
  on public.historial for select
  using (public.current_user_rol() = 'admin');

-- Insert: cualquier autenticado (la app loguea sus propias acciones)
create policy "historial_insert_authenticated"
  on public.historial for insert
  to authenticated with check (true);

-- ❌ Sin policies de UPDATE/DELETE → bloqueado por RLS.
-- Trigger de defensa en profundidad:
create or replace function public.historial_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'historial es inmutable: % no permitido', TG_OP;
end;
$$;

create trigger historial_no_update
  before update on public.historial
  for each row execute function public.historial_block_mutations();

create trigger historial_no_delete
  before delete on public.historial
  for each row execute function public.historial_block_mutations();

grant select, insert on public.historial to authenticated;
grant usage on sequence public.historial_id_seq to authenticated;
revoke all on public.historial from anon;

-- ─── Trigger: auto-crear profile al registrar un usuario ────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'rol')::rol_usuario, 'colaborador')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── updated_at automático (helper reusado por todos los módulos) ───────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger configuracion_touch_updated_at
  before update on public.configuracion
  for each row execute function public.touch_updated_at();
