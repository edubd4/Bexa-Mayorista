-- ============================================================================
-- BEXA · Módulo Campañas (0011) — planificación de marketing
-- Depende de: ventas (0007), gastos (0009), reglas_descuento (0006).
--
-- Módulo nuevo — nace en Bexa, se cosechará al maestro Forja como opcional del
-- catálogo tras probarse en producción (Biblia §6 · regla del segundo consumidor).
--
-- Piezas:
--   - campanas: cabecera con estado híbrido (manual + calculado por fecha).
--   - campana_canales + asignaciones: catálogo editable de canales de difusión.
--   - campana_productos: M:N para atribución automática.
--   - campana_publicaciones: mensajes/posts (MVP texto; imágenes en Fase 2).
--   - ventas.campana_id: atribución MANUAL (se marca al facturar).
--   - reglas_descuento.campana_id: activa reglas solo en la ventana de la campaña.
--   - Vistas v_campanas (estado_efectivo) y v_campana_metricas (ROI + atribución).
-- ============================================================================

-- ─── Enum estado manual ─────────────────────────────────────────────────────
create type estado_campana_manual as enum ('BORRADOR', 'PAUSADA', 'CANCELADA');
create type estado_publicacion as enum ('BORRADOR', 'PROGRAMADA', 'PUBLICADA', 'CANCELADA');

-- ─── Tabla campanas ────────────────────────────────────────────────────────
create sequence public.campanas_id_publico_seq start with 1;

create table public.campanas (
  id                    uuid primary key default gen_random_uuid(),
  id_publico            text not null unique,
  nombre                text not null,
  descripcion           text,
  fecha_inicio          date not null,
  fecha_fin             date not null,
  -- Estado híbrido: si estado_manual es NULL, el efectivo se calcula por fecha
  -- (PROGRAMADA / ACTIVA / CONCLUIDA). Si NO NULL, el manual manda
  -- (BORRADOR / PAUSADA / CANCELADA).
  estado_manual         estado_campana_manual,
  presupuesto_estimado  numeric(14,2) not null default 0 check (presupuesto_estimado >= 0),
  gasto_id              uuid references public.gastos(id) on delete set null,
  -- Métricas manuales que el user carga desde UI (impresiones, alcance, clicks, ...).
  -- Formato libre: { "impresiones": N, "alcance": N, "clicks": N, "engagement": N }
  metricas_manuales     jsonb not null default '{}'::jsonb,
  notas                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  updated_by            uuid references auth.users(id),
  constraint campanas_fechas_coherentes check (fecha_fin >= fecha_inicio)
);

create or replace function public.set_campana_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_campanas';
    new.id_publico := coalesce(v_prefijo, 'CAMP') || '-' ||
                      lpad(nextval('public.campanas_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger campanas_set_id_publico
  before insert on public.campanas
  for each row execute function public.set_campana_id_publico();

create trigger campanas_touch_updated_at
  before update on public.campanas
  for each row execute function public.touch_updated_at();

create index idx_campanas_fecha_inicio  on public.campanas(fecha_inicio);
create index idx_campanas_fecha_fin     on public.campanas(fecha_fin);
create index idx_campanas_estado_manual on public.campanas(estado_manual) where estado_manual is not null;
create index idx_campanas_gasto         on public.campanas(gasto_id)      where gasto_id is not null;

-- ─── Canales (catálogo editable por admin) ─────────────────────────────────
create table public.campana_canales (
  id         bigserial primary key,
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index idx_campana_canales_nombre on public.campana_canales(lower(nombre));

insert into public.campana_canales (nombre) values
  ('Instagram'), ('Facebook'), ('WhatsApp'), ('TikTok'), ('Email'), ('Otro')
on conflict do nothing;

-- ─── M:N campaña ↔ canal ───────────────────────────────────────────────────
create table public.campana_canal_asignaciones (
  campana_id uuid not null references public.campanas(id)        on delete cascade,
  canal_id   bigint not null references public.campana_canales(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campana_id, canal_id)
);

create index idx_campana_canal_asig_canal on public.campana_canal_asignaciones(canal_id);

-- ─── M:N campaña ↔ productos (atribución automática) ──────────────────────
create table public.campana_productos (
  campana_id  uuid not null references public.campanas(id)   on delete cascade,
  producto_id uuid not null references public.productos(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (campana_id, producto_id)
);

create index idx_campana_productos_producto on public.campana_productos(producto_id);

-- ─── Publicaciones (MVP solo texto; imagenes_urls reservado para Fase 2) ───
create sequence public.campana_publicaciones_id_publico_seq start with 1;

create table public.campana_publicaciones (
  id                 uuid primary key default gen_random_uuid(),
  id_publico         text not null unique,
  campana_id         uuid not null references public.campanas(id) on delete cascade,
  canal_id           bigint references public.campana_canales(id) on delete set null,
  titulo             text,
  cuerpo             text not null,
  imagenes_urls      text[] not null default '{}',
  fecha_publicacion  timestamptz,
  estado             estado_publicacion not null default 'BORRADOR',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_by         uuid references auth.users(id)
);

create or replace function public.set_publicacion_id_publico()
returns trigger language plpgsql as $$
declare v_prefijo text;
begin
  if new.id_publico is null or new.id_publico = '' then
    select valor into v_prefijo from public.configuracion where clave = 'prefijo_publicaciones';
    new.id_publico := coalesce(v_prefijo, 'PUB') || '-' ||
                      lpad(nextval('public.campana_publicaciones_id_publico_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger publicaciones_set_id_publico
  before insert on public.campana_publicaciones
  for each row execute function public.set_publicacion_id_publico();

create trigger publicaciones_touch_updated_at
  before update on public.campana_publicaciones
  for each row execute function public.touch_updated_at();

create index idx_publicaciones_campana on public.campana_publicaciones(campana_id);
create index idx_publicaciones_canal   on public.campana_publicaciones(canal_id);
create index idx_publicaciones_fecha   on public.campana_publicaciones(fecha_publicacion) where fecha_publicacion is not null;

-- ─── ALTER ventas: FK opcional a campanas (atribución MANUAL) ──────────────
alter table public.ventas
  add column campana_id uuid references public.campanas(id) on delete set null;

create index idx_ventas_campana on public.ventas(campana_id) where campana_id is not null;

-- ─── ALTER reglas_descuento: FK opcional a campanas ────────────────────────
-- Cuando una regla tiene campana_id, solo aplica si la fecha actual está dentro
-- de la ventana de esa campaña Y la campaña está activa (estado_efectivo='ACTIVA').
alter table public.reglas_descuento
  add column campana_id uuid references public.campanas(id) on delete set null;

create index idx_reglas_descuento_campana on public.reglas_descuento(campana_id) where campana_id is not null;

-- ─── Redefinir resolver_precio para respetar la ventana de la campaña ─────
-- Cambio mínimo: agregar filtro al WHERE que descarte reglas cuya campaña no
-- está en ventana. Se mantiene toda la lógica de prioridades intacta.
create or replace function public.resolver_precio(
  p_cliente_id   uuid,
  p_producto_id  uuid,
  p_cantidad     integer
)
returns table (
  precio_unitario  numeric(14,2),
  precio_final     numeric(14,2),
  descuento_pct    numeric(5,2),
  origen           text
)
language plpgsql
stable
security invoker
as $$
declare
  v_lista_id        uuid;
  v_precio_base     numeric(14,2);
  v_precio_unit     numeric(14,2);
  v_categoria       text;
  v_desc_pct        numeric(5,2) := 0;
  v_origen_precio   text;
  v_origen_desc     text := '';
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad debe ser > 0';
  end if;

  select precio_base, categoria into v_precio_base, v_categoria
    from public.productos where id = p_producto_id;
  if v_precio_base is null then
    raise exception 'producto % no encontrado', p_producto_id;
  end if;

  if p_cliente_id is not null then
    select lista_precio_id into v_lista_id
      from public.clientes where id = p_cliente_id;
  end if;

  if v_lista_id is not null then
    select precio into v_precio_unit
      from public.listas_precios_items
      where lista_precio_id = v_lista_id and producto_id = p_producto_id;
    if v_precio_unit is not null then
      v_origen_precio := 'lista';
    else
      v_precio_unit := v_precio_base;
      v_origen_precio := 'precio_base';
    end if;
  else
    v_precio_unit := v_precio_base;
    v_origen_precio := 'precio_base';
  end if;

  with reglas_candidatas as (
    select r.*,
      case
        when r.scope = 'PRODUCTO'  and r.lista_precio_id is not distinct from v_lista_id then 1
        when r.scope = 'PRODUCTO'  and r.lista_precio_id is null                         then 2
        when r.scope = 'CATEGORIA' and r.lista_precio_id is not distinct from v_lista_id then 3
        when r.scope = 'CATEGORIA' and r.lista_precio_id is null                         then 4
        when r.scope = 'GLOBAL'    and r.lista_precio_id is not distinct from v_lista_id then 5
        when r.scope = 'GLOBAL'    and r.lista_precio_id is null                         then 6
        else 999
      end as rank
    from public.reglas_descuento r
    left join public.campanas c on c.id = r.campana_id
    where r.activo
      and p_cantidad >= r.cantidad_min
      and (
        (r.scope = 'PRODUCTO'  and r.producto_id = p_producto_id) or
        (r.scope = 'CATEGORIA' and lower(coalesce(r.categoria,'')) = lower(coalesce(v_categoria,''))) or
        (r.scope = 'GLOBAL')
      )
      and (r.lista_precio_id is null or r.lista_precio_id = v_lista_id)
      -- ★ Ventana de campaña: si la regla tiene campana_id, solo aplica dentro de la ventana
      -- y siempre que la campaña no esté PAUSADA/CANCELADA/BORRADOR.
      and (
        r.campana_id is null
        or (
          current_date between c.fecha_inicio and c.fecha_fin
          and (c.estado_manual is null or c.estado_manual not in ('PAUSADA','CANCELADA','BORRADOR'))
        )
      )
  )
  select rc.descuento_pct,
         case rc.scope
           when 'PRODUCTO'  then 'descuento_producto'
           when 'CATEGORIA' then 'descuento_categoria'
           when 'GLOBAL'    then 'descuento_global'
         end
    into v_desc_pct, v_origen_desc
    from reglas_candidatas rc
    where rc.rank < 999
    order by rc.rank asc, rc.descuento_pct desc
    limit 1;

  return query select
    v_precio_unit                                                    as precio_unitario,
    round(v_precio_unit * (1 - coalesce(v_desc_pct, 0) / 100.0), 2)   as precio_final,
    coalesce(v_desc_pct, 0)                                          as descuento_pct,
    (v_origen_precio || case when v_desc_pct is not null then '+' || v_origen_desc else '' end) as origen;
end;
$$;

-- ============================================================================
-- Vistas de reporting
-- ============================================================================

-- v_campanas: agrega estado_efectivo calculado (manual gana; si null, por fecha)
-- + costo_real desde gastos.
create or replace view public.v_campanas as
  select
    c.*,
    coalesce(
      c.estado_manual::text,
      case
        when current_date < c.fecha_inicio then 'PROGRAMADA'
        when current_date > c.fecha_fin    then 'CONCLUIDA'
        else 'ACTIVA'
      end
    ) as estado_efectivo,
    g.monto as costo_real,
    (
      select count(*)::integer
      from public.campana_canal_asignaciones a
      where a.campana_id = c.id
    ) as canales_count,
    (
      select count(*)::integer
      from public.campana_productos cp
      where cp.campana_id = c.id
    ) as productos_count,
    (
      select count(*)::integer
      from public.campana_publicaciones p
      where p.campana_id = c.id
    ) as publicaciones_count
  from public.campanas c
  left join public.gastos g on g.id = c.gasto_id;

grant select on public.v_campanas to authenticated;
revoke all  on public.v_campanas from anon;

-- v_campana_metricas: ventas atribuidas (manual + automática) + ROI.
-- MANUALES: ventas con campana_id = c.id (canceladas excluidas).
-- AUTOMATICAS: ventas en la ventana temporal que incluyen al menos un producto
--              de la campaña, EXCLUYENDO las que ya fueron atribuidas
--              manualmente a esta campaña (evita doble conteo).
create or replace view public.v_campana_metricas as
  with base_manual as (
    select
      v.campana_id,
      count(*)::integer                     as ventas_manuales,
      coalesce(sum(v.total), 0)::numeric(14,2) as monto_manual
    from public.ventas v
    where v.campana_id is not null
      and v.estado_cobro <> 'CANCELADA'
    group by v.campana_id
  ),
  base_auto as (
    select
      cp.campana_id,
      count(distinct v.id)::integer         as ventas_automaticas,
      coalesce(sum(v.total), 0)::numeric(14,2) as monto_automatico
    from public.campana_productos cp
    join public.campanas c   on c.id = cp.campana_id
    join public.venta_items vi on vi.producto_id = cp.producto_id
    join public.ventas v     on v.id = vi.venta_id
    where v.estado_cobro <> 'CANCELADA'
      and v.fecha::date between c.fecha_inicio and c.fecha_fin
      and (v.campana_id is null or v.campana_id <> cp.campana_id)
    group by cp.campana_id
  )
  select
    c.id as campana_id,
    coalesce(bm.ventas_manuales, 0)     as ventas_manuales,
    coalesce(bm.monto_manual, 0)::numeric(14,2)     as monto_manual,
    coalesce(ba.ventas_automaticas, 0)  as ventas_automaticas,
    coalesce(ba.monto_automatico, 0)::numeric(14,2) as monto_automatico,
    (coalesce(bm.ventas_manuales, 0) + coalesce(ba.ventas_automaticas, 0)) as ventas_totales,
    (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0))::numeric(14,2) as monto_total,
    coalesce(g.monto, 0)::numeric(14,2) as costo,
    case
      when coalesce(g.monto, 0) > 0 then
        round(
          (coalesce(bm.monto_manual, 0) + coalesce(ba.monto_automatico, 0) - g.monto)
          / g.monto * 100, 2)
      else null
    end as roi_pct,
    case
      when (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)) > 0 then
        round(
          (coalesce(bm.monto_manual,0) + coalesce(ba.monto_automatico,0))
          / (coalesce(bm.ventas_manuales,0) + coalesce(ba.ventas_automaticas,0)),
          2)
      else 0
    end::numeric(14,2) as ticket_promedio
  from public.campanas c
  left join base_manual bm on bm.campana_id = c.id
  left join base_auto   ba on ba.campana_id = c.id
  left join public.gastos g on g.id = c.gasto_id;

grant select on public.v_campana_metricas to authenticated;
revoke all  on public.v_campana_metricas from anon;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.campanas                    enable row level security;
alter table public.campana_canales             enable row level security;
alter table public.campana_canal_asignaciones  enable row level security;
alter table public.campana_productos           enable row level security;
alter table public.campana_publicaciones       enable row level security;

-- Decisión cliente: admin + vendedor pueden crear/editar campañas. Rol
-- 'marketing' se resolverá en Fase 2 si el cliente lo pide.
create policy "campanas_all_authenticated"
  on public.campanas for all
  to authenticated
  using (public.current_user_rol() is not null)
  with check (public.current_user_rol() is not null);

create policy "canales_select_authenticated"
  on public.campana_canales for select
  to authenticated
  using (public.current_user_rol() is not null);

create policy "canales_write_admin"
  on public.campana_canales for all
  using (public.current_user_rol() = 'admin')
  with check (public.current_user_rol() = 'admin');

create policy "canal_asig_all_authenticated"
  on public.campana_canal_asignaciones for all
  to authenticated
  using (public.current_user_rol() is not null)
  with check (public.current_user_rol() is not null);

create policy "campana_productos_all_authenticated"
  on public.campana_productos for all
  to authenticated
  using (public.current_user_rol() is not null)
  with check (public.current_user_rol() is not null);

create policy "publicaciones_all_authenticated"
  on public.campana_publicaciones for all
  to authenticated
  using (public.current_user_rol() is not null)
  with check (public.current_user_rol() is not null);

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.campanas                    to authenticated;
grant select, insert, update, delete on public.campana_canal_asignaciones  to authenticated;
grant select, insert, update, delete on public.campana_productos           to authenticated;
grant select, insert, update, delete on public.campana_publicaciones       to authenticated;
grant select, insert, update         on public.campana_canales             to authenticated;

grant usage on sequence public.campanas_id_publico_seq                   to authenticated;
grant usage on sequence public.campana_publicaciones_id_publico_seq      to authenticated;
grant usage on sequence public.campana_canales_id_seq                    to authenticated;

revoke all on public.campanas                    from anon;
revoke all on public.campana_canales             from anon;
revoke all on public.campana_canal_asignaciones  from anon;
revoke all on public.campana_productos           from anon;
revoke all on public.campana_publicaciones       from anon;

-- ─── Seeds nuevas en configuracion ─────────────────────────────────────────
insert into public.configuracion (clave, valor, descripcion) values
  ('prefijo_campanas',       'CAMP', 'Prefijo de id público de campañas'),
  ('prefijo_publicaciones',  'PUB',  'Prefijo de id público de publicaciones de campaña')
on conflict (clave) do update set
  valor       = excluded.valor,
  descripcion = excluded.descripcion;
