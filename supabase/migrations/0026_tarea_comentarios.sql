-- ============================================================================
-- BEXA · 0026 · Comentarios por tarea — la conversación queda EN la tarea
-- Pedido del cliente (2026-07-27): que el equipo pueda dejar comentarios
-- sobre una tarea sin tener que hablarse por afuera, con estado de leído y
-- notificación de mensajes pendientes. Candidato directo a cosecha a Forja.
--
-- EL MODELO
--   - tarea_comentarios: el mensaje. Inmutable (no se edita ni se borra —
--     es comunicación operativa, mismo criterio que historial).
--   - tarea_comentario_lecturas: quién leyó qué y cuándo (PK compuesto).
--     "No leído para mí" = comentario visible, de otro autor, sin MI fila
--     de lectura. Se marca al abrir la conversación.
--
-- VISIBILIDAD (espeja la de tareas): el admin ve/comenta todo; el empleado
-- ve/comenta SOLO las tareas asignadas a él. Ambos lados de la conversación
-- quedan auditables con hora del server.
-- ============================================================================

create table public.tarea_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarea_id    uuid not null references public.tareas(id) on delete cascade,
  autor_id    uuid not null references auth.users(id),
  texto       text not null check (btrim(texto) <> ''),
  created_at  timestamptz not null default now()
);

create index idx_tarea_comentarios_tarea on public.tarea_comentarios(tarea_id, created_at);

create table public.tarea_comentario_lecturas (
  comentario_id uuid not null references public.tarea_comentarios(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  leido_at      timestamptz not null default now(),
  primary key (comentario_id, usuario_id)
);

-- Inmutables: la conversación operativa no se reescribe.
create or replace function public.tarea_comentarios_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'Los comentarios de tareas son inmutables: % no permitido.', TG_OP;
end;
$$;

create trigger tarea_comentarios_no_update
  before update on public.tarea_comentarios
  for each row execute function public.tarea_comentarios_block_mutations();
create trigger tarea_comentarios_no_delete
  before delete on public.tarea_comentarios
  for each row execute function public.tarea_comentarios_block_mutations();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.tarea_comentarios          enable row level security;
alter table public.tarea_comentario_lecturas  enable row level security;

-- Ver comentarios: admin todos; empleado los de SUS tareas.
create policy "tarea_comentarios_select"
  on public.tarea_comentarios for select
  to authenticated
  using (
    public.current_user_rol() = 'admin'
    or exists (
      select 1 from public.tareas t
      where t.id = tarea_comentarios.tarea_id and t.asignado_a = auth.uid()
    )
  );

-- Comentar: admin en cualquier tarea; empleado en las suyas. Autor = uno mismo.
create policy "tarea_comentarios_insert"
  on public.tarea_comentarios for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and (
      public.current_user_rol() = 'admin'
      or exists (
        select 1 from public.tareas t
        where t.id = tarea_comentarios.tarea_id and t.asignado_a = auth.uid()
      )
    )
  );

-- Lecturas: cada uno ve las lecturas de los comentarios que puede ver
-- (para mostrar "visto por") y solo registra las PROPIAS.
create policy "tarea_lecturas_select"
  on public.tarea_comentario_lecturas for select
  to authenticated
  using (
    exists (
      select 1 from public.tarea_comentarios tc
      where tc.id = tarea_comentario_lecturas.comentario_id
    )
  );

create policy "tarea_lecturas_insert"
  on public.tarea_comentario_lecturas for insert
  to authenticated
  with check (usuario_id = auth.uid());

grant select, insert on public.tarea_comentarios         to authenticated;
grant select, insert on public.tarea_comentario_lecturas to authenticated;
revoke all on public.tarea_comentarios         from anon;
revoke all on public.tarea_comentario_lecturas from anon;

-- ─── No leídos por tarea (para el badge de notificación) ────────────────────
-- SECURITY INVOKER a propósito: la RLS de tarea_comentarios ya filtra lo que
-- cada uno puede ver — la función solo agrega. Cuenta comentarios de OTROS
-- sin MI lectura, agrupados por tarea.
create or replace function public.comentarios_no_leidos()
returns table (tarea_id uuid, no_leidos bigint)
language sql
stable
security invoker
as $$
  select tc.tarea_id, count(*) as no_leidos
  from public.tarea_comentarios tc
  where tc.autor_id <> auth.uid()
    and not exists (
      select 1 from public.tarea_comentario_lecturas l
      where l.comentario_id = tc.id and l.usuario_id = auth.uid()
    )
  group by tc.tarea_id
$$;

grant execute on function public.comentarios_no_leidos to authenticated;
revoke all on function public.comentarios_no_leidos from public, anon;

comment on table public.tarea_comentarios is
  'Conversacion operativa por tarea, inmutable. Visibilidad = la de la tarea (admin todo, empleado las suyas). Lecturas en tarea_comentario_lecturas. Ver 0026.';
