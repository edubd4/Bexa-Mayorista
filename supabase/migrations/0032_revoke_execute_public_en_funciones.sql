-- ============================================================================
-- 0032 · Barrido de EXECUTE a PUBLIC (y anon) en funciones — propagación FORJA
-- ============================================================================
-- Propagación a Bexa del fix que el maestro FORJA se aplicó a sí mismo el
-- 2026-08-02 (migración `revoke_execute_public_en_funciones` del maestro).
-- Referencia: docs/GOTCHAS.md del maestro · "Toda función nace ejecutable por
-- PUBLIC (y por anon) — el GRANT no limpia nada" (incluida su RECAÍDA del
-- 2026-08-02).
--
-- POR QUÉ OTRA VEZ, si la 0030 ya hizo este mismo revoke (2026-07-31):
--   1. `revoke execute on all functions in schema public from public` es una
--      FOTO: alcanza solo a las funciones que existían en ese momento. La 0031
--      (facturación, 2026-08-04) creó `comprobantes_block_mutations()` DESPUÉS
--      del barrido de la 0030 y sin revoke por función: no quedó cubierta.
--   2. El `alter default privileges` de la 0030 es política, no garantía: en la
--      base del maestro se probó (caso `resolver_precio`, recreada 20 horas
--      después de su barrido) que una función recreada puede volver a nacer con
--      `=X` (EXECUTE para PUBLIC) igual. Cada `create or replace` de un fix
--      futuro puede reabrir el hueco en silencio.
--   Por eso el barrido se re-corre entero: es idempotente, cuesta nada y no
--   depende de que el diagnóstico haya sido exhaustivo.
--
-- ANON, verificado sobre las migraciones de Bexa (0001..0031):
--   NO existe ningún `grant ... to anon` sobre funciones en todo el historial.
--   Bexa no tiene módulo de inscripción pública ni flujos anónimos: la 0030 ya
--   auditó todas las rutas de app/api/ y los 29 `.rpc()` del repo — todos van
--   con sesión (rol `authenticated`). El revoke masivo a `anon` de acá abajo
--   no le saca EXECUTE a ningún flujo real, porque no hay ninguno que lo use.
--   Si algún día se agrega un flujo anon con RPC, esa función necesita su
--   `grant execute ... to anon` EXPLÍCITO después de este archivo.
--
-- SEGURIDAD DEL BARRIDO: no toca `authenticated` ni `service_role` — son
-- grantees distintos de PUBLIC. La premisa que lo hace seguro es que toda
-- función invocable por nombre tenga su grant explícito a `authenticated`
-- (en Bexa lo garantizó el `grant execute on all functions ... to
-- authenticated` de la 0030 para lo previo, y los grants por función de los
-- módulos posteriores). Pero eso NO se deja escrito en un comentario: lo
-- chequea el gate de acá abajo, que aborta antes de tocar un permiso.
-- ============================================================================

-- ─── GATE · se verifica, no se afirma ───────────────────────────────────────
-- El revoke de más abajo es CIEGO: le saca EXECUTE a PUBLIC en TODAS las
-- funciones del esquema. Alcanza una función nueva sin su grant, o una base que
-- divergió, para que el revoke deje la app rota EN SILENCIO (42501 en cada
-- llamada, que la UI lee como "no tenés permiso"). Este bloque falla
-- ruidosamente ANTES de sacar nada, con la lista de culpables.
--
-- Quedan FUERA del chequeo, a propósito:
--   · las funciones de trigger y de event trigger — nadie las invoca por nombre
--     y Postgres verifica EXECUTE en el `CREATE TRIGGER`, no en cada disparo,
--     así que no necesitan grant a `authenticated`;
--   · `service_role` — en Bexa ningún RPC se invoca con esa key (la 0030 lo
--     auditó: `createServiceRoleClient()` se usa solo para la Admin API de
--     auth, no para llamar funciones).
do $$
declare
  v_faltantes text;
begin
  select string_agg(
           format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
           ', ' order by p.proname
         )
    into v_faltantes
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
    -- `coalesce(proacl, acldefault(...))`: un proacl NULL no es "sin permisos",
    -- es "los de fábrica" (owner + EXECUTE para PUBLIC) — y ahí authenticated
    -- tampoco figura explícito, que es exactamente lo que hay que detectar.
    and not exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = to_regrole('authenticated')::oid
        and a.privilege_type = 'EXECUTE'
    );

  if v_faltantes is not null then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'ABORTA el barrido de EXECUTE: hay funciones en public sin grant explícito a authenticated.',
      detail  = 'El revoke masivo de esta migración las dejaría sin EXECUTE para nadie. Funciones: ' || v_faltantes,
      hint    = 'Dales su `grant execute on function public.<f>(<firma>) to authenticated;` (ver docs/GOTCHAS.md del maestro) y volvé a correr este archivo entero.';
  end if;
end
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

-- Explícito además del barrido: es la que quedó fuera de la foto de la 0030
-- (creada por la 0031) y deja rastro de por qué existe este archivo. Es de
-- trigger, así que revocarla no rompe nada: el trigger ya creado sigue
-- funcionando aunque la función quede sin EXECUTE para PUBLIC.
do $$
begin
  if to_regprocedure('public.comprobantes_block_mutations()') is not null then
    revoke execute on function public.comprobantes_block_mutations() from public, anon;
  end if;
end
$$;

-- Se re-afirma la política para lo que venga (idempotente — la 0030 ya la trae).
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ─── Re-grants post-revoke ──────────────────────────────────────────────────
-- Estas funciones las evalúan las POLICIES (o defaults de columna) con los
-- permisos del usuario que consulta: si el barrido las dejara sin EXECUTE,
-- toda lectura con RLS moriría con 42501. Los grants son idempotentes y van
-- DESPUÉS del revoke a propósito (mismo criterio que el maestro). El guard
-- `to_regprocedure` evita que el archivo explote si una firma cambió.
--
--   · current_user_rol()          → la invocan TODAS las policies (0001+)
--   · hoy_local()                 → default de gastos.fecha (0019) + funciones
--   · puede_gestionar_campanas()  → policies de campañas/publicaciones (0017)
--   · puede_cargar_catalogo()     → policies de productos/precios tramo (0028)
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.current_user_rol()',
    'public.hoy_local()',
    'public.puede_gestionar_campanas()',
    'public.puede_cargar_catalogo()'
  ]
  loop
    if to_regprocedure(v_fn) is not null then
      execute format('grant execute on function %s to authenticated', v_fn);
    else
      raise warning 'Re-grant salteado: % no existe en esta base.', v_fn;
    end if;
  end loop;
end
$$;

-- Verificación (debe devolver 0 filas): `proacl` NULL significa "default", y el
-- default de Postgres es EXECUTE para PUBLIC.
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (p.proacl is null or array_to_string(p.proacl, ',') like '=%');

notify pgrst, 'reload schema';
