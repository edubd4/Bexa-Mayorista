-- ============================================================================
-- BEXA · 0025 · Módulo Tareas (sistema operativo del equipo)
-- Origen: planilla "Bexa_Sistema_Operativo" del cliente (2026-07-27).
-- Candidato a cosecha a Forja: no tiene NADA específico de Bexa salvo seeds.
--
-- EL MODELO: DEFINICIÓN ≠ EJECUCIÓN
-- La planilla del cliente mezcla en una fila la tarea ("Responder WhatsApp,
-- diaria, 09:00, Empleado 1") con su ejecución ("En proceso, 24/07"). Acá se
-- separan:
--   - `tareas`: el catálogo. Qué se hace, quién, con qué frecuencia,
--     prioridad, tiempo estimado y link al manual. Lo gestiona el admin.
--   - `tarea_ocurrencias`: la ejecución de UN día concreto. Es lo que el
--     empleado marca (pendiente → en proceso → finalizada) y donde quedan los
--     timestamps reales (iniciada_at / finalizada_at / completada_por) que el
--     admin audita. Append por generación, nunca se borra la historia.
--
-- FRECUENCIAS (de la planilla: Diaria / Semanal / Mensual / Cuando corresponda)
--   DIARIA   → una ocurrencia por día.
--   SEMANAL  → una por semana, el día `dia_semana` (0=domingo … 6=sábado).
--   MENSUAL  → una por mes, el día `dia_mes` (31 = "fin de mes": se ajusta al
--              último día real del mes).
--   EVENTUAL → "cuando corresponda": no se genera sola; el asignado la
--              registra cuando la hace (crear_ocurrencia_eventual).
--
-- EL REINICIO DIARIO SIN CRON
-- `generar_ocurrencias_tareas()` es idempotente (unique tarea+fecha) y se
-- dispara al abrir /tareas: la primera visita del día materializa las tareas
-- de HOY. No hay job externo que se pueda caer — patrón lazy, cosechable.
--
-- ATRASADA (columna "Atrasada" de la planilla) no se guarda: se CALCULA
-- (ocurrencia no finalizada con fecha < hoy, o vencida contra hora_sugerida).
-- Un flag persistido se desactualiza; un cálculo no.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type frecuencia_tarea as enum ('DIARIA', 'SEMANAL', 'MENSUAL', 'EVENTUAL');
create type prioridad_tarea  as enum ('ALTA', 'MEDIA', 'BAJA');
create type estado_tarea     as enum ('PENDIENTE', 'EN_PROCESO', 'FINALIZADA');

-- ─── Catálogo: tareas ───────────────────────────────────────────────────────
create sequence public.tareas_id_publico_seq start with 1;

insert into public.configuracion (clave, valor, descripcion)
values ('prefijo_tareas', 'TAR', 'Prefijo de id_publico para tareas')
on conflict (clave) do nothing;

create table public.tareas (
  id                  uuid primary key default gen_random_uuid(),
  id_publico          text not null unique,
  -- Código operativo del cliente (BX-V01…). Opcional, editable, único si está.
  codigo              text,
  nombre              text not null,
  descripcion         text,                  -- "Observaciones" de la planilla
  area                text,                  -- Ventas / Contenido / Depósito… texto libre con datalist
  asignado_a          uuid references public.profiles(id) on delete set null,
  prioridad           prioridad_tarea not null default 'MEDIA',
  tiempo_estimado_min integer check (tiempo_estimado_min > 0),
  frecuencia          frecuencia_tarea not null default 'DIARIA',
  dia_semana          integer check (dia_semana between 0 and 6),   -- SEMANAL
  dia_mes             integer check (dia_mes between 1 and 31),      -- MENSUAL
  hora_sugerida       time,
  fecha_limite        date,                  -- opcional, para vencimientos puntuales
  manual_url          text,                  -- Google Doc con el paso a paso
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  updated_by          uuid references auth.users(id),
  constraint tareas_frecuencia_coherente check (
    (frecuencia = 'SEMANAL' and dia_semana is not null)
    or (frecuencia = 'MENSUAL' and dia_mes is not null)
    or (frecuencia in ('DIARIA', 'EVENTUAL'))
  )
);

create unique index idx_tareas_codigo on public.tareas(upper(codigo)) where codigo is not null;
create index idx_tareas_asignado   on public.tareas(asignado_a) where asignado_a is not null;
create index idx_tareas_activo     on public.tareas(activo);
create index idx_tareas_frecuencia on public.tareas(frecuencia);

create or replace function public.set_tarea_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_tareas';
    new.id_publico := coalesce(v_prefijo, 'TAR') || '-' ||
                      lpad(nextval('public.tareas_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger tareas_set_id_publico
  before insert on public.tareas
  for each row execute function public.set_tarea_id_publico();

create trigger tareas_touch_updated_at
  before update on public.tareas
  for each row execute function public.touch_updated_at();

-- ─── Ejecución: tarea_ocurrencias ───────────────────────────────────────────
create table public.tarea_ocurrencias (
  id             uuid primary key default gen_random_uuid(),
  tarea_id       uuid not null references public.tareas(id) on delete cascade,
  fecha          date not null,               -- el día que la ocurrencia representa
  estado         estado_tarea not null default 'PENDIENTE',
  -- La auditoría que pide el cliente: cuándo la agarró, cuándo la terminó, quién.
  iniciada_at    timestamptz,
  finalizada_at  timestamptz,
  completada_por uuid references auth.users(id),
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tarea_id, fecha)                    -- idempotencia del generador
);

create index idx_ocurrencias_fecha  on public.tarea_ocurrencias(fecha desc);
create index idx_ocurrencias_estado on public.tarea_ocurrencias(estado);
create index idx_ocurrencias_tarea  on public.tarea_ocurrencias(tarea_id, fecha desc);

create trigger ocurrencias_touch_updated_at
  before update on public.tarea_ocurrencias
  for each row execute function public.touch_updated_at();

-- ─── Generador idempotente del día ──────────────────────────────────────────
-- Corre al abrir /tareas (cualquier usuario activo). Materializa las
-- ocurrencias de HOY (fecha local AR — gotcha del fix F de la 0014) para
-- DIARIA siempre, SEMANAL si es el día, MENSUAL si es el día (31 = último).
-- El ON CONFLICT hace que N usuarios abriendo a la vez no dupliquen nada.
create or replace function public.generar_ocurrencias_tareas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date;
  v_creadas integer;
begin
  if auth.uid() is null or public.current_user_rol() is null then
    raise exception 'No autenticado';
  end if;

  v_hoy := public.hoy_local();

  with candidatas as (
    select t.id
    from public.tareas t
    where t.activo
      and (
        t.frecuencia = 'DIARIA'
        or (t.frecuencia = 'SEMANAL' and t.dia_semana = extract(dow from v_hoy)::integer)
        or (t.frecuencia = 'MENSUAL' and extract(day from v_hoy)::integer =
              least(t.dia_mes, extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'))::integer))
      )
  ),
  insertadas as (
    insert into public.tarea_ocurrencias (tarea_id, fecha)
    select id, v_hoy from candidatas
    on conflict (tarea_id, fecha) do nothing
    returning 1
  )
  select count(*) into v_creadas from insertadas;

  return v_creadas;
end;
$$;

-- ─── Registrar una tarea EVENTUAL ("cuando corresponda") ────────────────────
-- El asignado (o el admin) la materializa el día que la hace.
create or replace function public.crear_ocurrencia_eventual(p_tarea_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarea record;
  v_rol   text;
  v_id    uuid;
begin
  v_rol := public.current_user_rol();
  if v_rol is null then raise exception 'No autenticado'; end if;

  select * into v_tarea from public.tareas where id = p_tarea_id;
  if not found or not v_tarea.activo then
    raise exception 'Tarea no encontrada o inactiva';
  end if;
  if v_tarea.frecuencia <> 'EVENTUAL' then
    raise exception 'Solo las tareas "cuando corresponda" se registran a mano; las demás se generan solas';
  end if;
  if v_rol <> 'admin' and v_tarea.asignado_a is distinct from auth.uid() then
    raise exception 'Solo el asignado o el admin pueden registrar esta tarea';
  end if;

  insert into public.tarea_ocurrencias (tarea_id, fecha)
  values (p_tarea_id, public.hoy_local())
  on conflict (tarea_id, fecha) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Esta tarea ya tiene una ejecución registrada hoy';
  end if;
  return v_id;
end;
$$;

-- ─── Cambiar estado (lo que marca el empleado) ──────────────────────────────
-- Los timestamps NO los manda el cliente: los pone el server acá. Eso es lo
-- que hace confiable la auditoría — la hora es del sistema, no del empleado.
--   → EN_PROCESO: sella iniciada_at la primera vez.
--   → FINALIZADA: sella finalizada_at + completada_por.
--   → volver atrás (equivocación): borra el sello correspondiente. El cambio
--     queda igualmente en el historial global vía la server action.
create or replace function public.cambiar_estado_ocurrencia(
  p_ocurrencia_id uuid,
  p_estado        estado_tarea,
  p_notas         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc    record;
  v_tarea record;
  v_rol   text;
begin
  v_rol := public.current_user_rol();
  if v_rol is null then raise exception 'No autenticado'; end if;

  select * into v_oc from public.tarea_ocurrencias where id = p_ocurrencia_id for update;
  if not found then raise exception 'Ocurrencia no encontrada'; end if;

  select * into v_tarea from public.tareas where id = v_oc.tarea_id;

  if v_rol <> 'admin' and v_tarea.asignado_a is distinct from auth.uid() then
    raise exception 'Solo el asignado o el admin pueden cambiar el estado de esta tarea';
  end if;

  update public.tarea_ocurrencias set
    estado         = p_estado,
    iniciada_at    = case
                       when p_estado = 'PENDIENTE' then null
                       else coalesce(iniciada_at, now())
                     end,
    finalizada_at  = case when p_estado = 'FINALIZADA' then coalesce(finalizada_at, now()) else null end,
    completada_por = case when p_estado = 'FINALIZADA' then auth.uid() else null end,
    notas          = coalesce(nullif(btrim(coalesce(p_notas, '')), ''), notas)
    where id = p_ocurrencia_id;
end;
$$;

comment on function public.generar_ocurrencias_tareas is
  'Materializa las ocurrencias de HOY (fecha local AR) segun frecuencia. Idempotente (unique tarea+fecha). Se dispara al abrir /tareas — reinicio diario sin cron. Ver 0025.';
comment on function public.cambiar_estado_ocurrencia is
  'Cambio de estado con sellos de tiempo del SERVER (iniciada_at/finalizada_at/completada_por) — la auditoria no depende del reloj del cliente. Asignado o admin. Ver 0025.';

revoke all on function public.generar_ocurrencias_tareas from public, anon;
revoke all on function public.crear_ocurrencia_eventual  from public, anon;
revoke all on function public.cambiar_estado_ocurrencia  from public, anon;
grant execute on function public.generar_ocurrencias_tareas to authenticated;
grant execute on function public.crear_ocurrencia_eventual  to authenticated;
grant execute on function public.cambiar_estado_ocurrencia  to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- El empleado ve SUS tareas (y las sin asignar no: sin dueño no hay deber).
-- El admin ve todo. Marketing incluido: los empleados de Contenido/Redes de
-- la planilla del cliente son ese rol. Escritura SOLO por RPC (definer) y por
-- el admin (gestión del catálogo).
alter table public.tareas            enable row level security;
alter table public.tarea_ocurrencias enable row level security;

create policy "tareas_select_propias"
  on public.tareas for select
  to authenticated
  using (public.current_user_rol() = 'admin' or asignado_a = auth.uid());

create policy "tareas_write_admin"
  on public.tareas for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

create policy "ocurrencias_select_propias"
  on public.tarea_ocurrencias for select
  to authenticated
  using (
    public.current_user_rol() = 'admin'
    or exists (
      select 1 from public.tareas t
      where t.id = tarea_ocurrencias.tarea_id and t.asignado_a = auth.uid()
    )
  );

-- Sin policy de INSERT/UPDATE para no-admin: todo pasa por los RPC definer.
create policy "ocurrencias_write_admin"
  on public.tarea_ocurrencias for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

grant select on public.tareas            to authenticated;
grant select on public.tarea_ocurrencias to authenticated;
grant insert, update, delete on public.tareas            to authenticated; -- policy admin filtra
grant insert, update, delete on public.tarea_ocurrencias to authenticated; -- policy admin filtra
grant usage on sequence public.tareas_id_publico_seq to authenticated;

revoke all on public.tareas            from anon;
revoke all on public.tarea_ocurrencias from anon;

-- ─── Seeds: el catálogo de la planilla del cliente ──────────────────────────
-- Sin asignado_a (los "Empleado 1-4" de la planilla se mapean a usuarios
-- reales desde la UI — acá no hay UUIDs). El admin asigna al entrar.
insert into public.tareas (codigo, nombre, area, prioridad, tiempo_estimado_min, frecuencia, dia_semana, dia_mes, hora_sugerida, descripcion) values
  ('BX-V01', 'Responder mensajes de WhatsApp',              'Ventas',         'ALTA',  480, 'DIARIA',   null, null, '09:00', 'Prioridad máxima del día, se revisa cada hora'),
  ('BX-V02', 'Hacer seguimiento a clientes sin respuesta',  'Ventas',         'ALTA',   60, 'DIARIA',   null, null, '16:00', 'Usar el paso 10 del manual de ventas'),
  ('BX-V03', 'Etiquetar clientes según tipo e interés',     'Ventas',         'MEDIA',  20, 'DIARIA',   null, null, '18:00', null),
  ('BX-V04', 'Actualizar CRM con conversaciones nuevas',    'Ventas',         'MEDIA',  20, 'DIARIA',   null, null, '18:30', null),
  ('BX-V05', 'Enviar lista de precios mayorista',           'Ventas',         'ALTA',   10, 'EVENTUAL', null, null, null,    'Se manda solo después de entender qué necesita el cliente'),
  ('BX-V06', 'Confirmar pagos recibidos',                   'Ventas',         'ALTA',   15, 'DIARIA',   null, null, '12:00', 'Revisar contra extracto bancario'),
  ('BX-V07', 'Cerrar ventas del día',                       'Ventas',         'ALTA',   30, 'DIARIA',   null, null, '19:00', null),
  ('BX-V08', 'Armar pedidos de clientes que compraron',     'Ventas',         'MEDIA',  40, 'DIARIA',   null, null, '17:00', null),
  ('BX-V09', 'Revisar clientes inactivos para recompra',    'Ventas',         'MEDIA',  45, 'SEMANAL',  1,    null, '10:00', 'Ver paso 14 del manual de ventas'),
  ('BX-C01', 'Planificar contenido de la semana',           'Contenido',      'ALTA',   60, 'SEMANAL',  1,    null, '09:30', null),
  ('BX-C02', 'Grabar Reels / TikToks',                      'Contenido',      'ALTA',  120, 'SEMANAL',  2,    null, '11:00', 'Coordinar guiones antes de grabar'),
  ('BX-C03', 'Editar videos',                               'Contenido',      'MEDIA',  90, 'SEMANAL',  3,    null, '10:00', null),
  ('BX-C04', 'Buscar tendencias y sonidos',                 'Contenido',      'BAJA',   30, 'SEMANAL',  1,    null, '09:00', null),
  ('BX-C05', 'Redactar guiones',                            'Contenido',      'ALTA',   60, 'SEMANAL',  1,    null, '10:30', null),
  ('BX-R01', 'Publicar historias',                          'Redes Sociales', 'MEDIA',  15, 'DIARIA',   null, null, '11:00', null),
  ('BX-R02', 'Programar publicaciones',                     'Redes Sociales', 'MEDIA',  45, 'SEMANAL',  5,    null, '15:00', null),
  ('BX-R03', 'Responder comentarios y DMs de Instagram',    'Redes Sociales', 'ALTA',   30, 'DIARIA',   null, null, '13:00', null),
  ('BX-R04', 'Revisar métricas de redes',                   'Redes Sociales', 'BAJA',   30, 'SEMANAL',  5,    null, '16:00', null),
  ('BX-A01', 'Registrar ventas del día',                    'Administración', 'ALTA',   30, 'DIARIA',   null, null, '19:30', null),
  ('BX-A02', 'Registrar gastos',                            'Administración', 'MEDIA',  20, 'DIARIA',   null, null, '19:45', 'Cruzar con hoja REGISTRO DIARIO'),
  ('BX-A03', 'Actualizar stock en sistema',                 'Administración', 'ALTA',   30, 'DIARIA',   null, null, '18:00', null),
  ('BX-A04', 'Revisar pedidos pendientes de pago',          'Administración', 'ALTA',   20, 'DIARIA',   null, null, '11:00', null),
  ('BX-A05', 'Controlar pagos a proveedores',               'Administración', 'ALTA',   45, 'SEMANAL',  3,    null, '10:00', 'Avisar a Ventas si hay demoras'),
  ('BX-A06', 'Conciliar caja',                              'Administración', 'ALTA',   20, 'DIARIA',   null, null, '20:00', null),
  ('BX-A07', 'Emitir facturas',                             'Administración', 'MEDIA',  15, 'EVENTUAL', null, null, null,    null),
  ('BX-D01', 'Revisar stock físico',                        'Depósito',       'MEDIA',  60, 'SEMANAL',  5,    null, '09:00', 'Comparar contra sistema'),
  ('BX-D02', 'Recibir y controlar mercadería nueva',        'Depósito',       'ALTA',   90, 'EVENTUAL', null, null, null,    null),
  ('BX-D03', 'Organizar depósito',                          'Depósito',       'BAJA',   60, 'SEMANAL',  6,    null, '10:00', null),
  ('BX-D04', 'Contar inventario',                           'Depósito',       'ALTA',  180, 'MENSUAL',  null, 31,   '09:00', null),
  ('BX-L01', 'Preparar pedidos para despacho',              'Logística',      'ALTA',   60, 'DIARIA',   null, null, '10:00', null),
  ('BX-L02', 'Despachar pedidos',                           'Logística',      'ALTA',   45, 'DIARIA',   null, null, '14:00', null),
  ('BX-L03', 'Confirmar envíos con transportista',          'Logística',      'MEDIA',  20, 'DIARIA',   null, null, '15:00', null),
  ('BX-L04', 'Actualizar clientes con número de seguimiento','Logística',     'MEDIA',  20, 'DIARIA',   null, null, '15:30', 'Registrar número de seguimiento');
