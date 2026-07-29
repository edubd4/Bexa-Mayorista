-- ============================================================================
-- BEXA · 0029 · El globito tiene que decir SIEMPRE en qué estado está
--
-- EL PROBLEMA (reportado por el cliente 2026-07-29)
-- "No da notificación en ningún lado de que hay mensajes sin leer, y hay
-- mensajes."
--
-- La 0026 dejó `comentarios_no_leidos()`, que devuelve SOLO las tareas con
-- mensajes pendientes. Sirve para el badge de "nuevos" y nada más. El agujero
-- es lo que NO devuelve: una tarea con conversación entera leída y una tarea
-- sin un solo mensaje son, para la UI, exactamente lo mismo — globito gris y
-- pelado. Nadie puede saber dónde hay charla si no tiene mensajes pendientes,
-- así que la conversación se vuelve invisible apenas la leés una vez.
--
-- Y hay un segundo efecto que hace parecer que la función está rota: cuenta
-- `autor_id <> auth.uid()`. El que prueba solo, escribiendo sus propios
-- comentarios, no ve NUNCA un badge. Correcto conceptualmente (nadie se
-- notifica a sí mismo) e indistinguible de un bug desde afuera.
--
-- LA SOLUCIÓN: devolver el ESTADO COMPLETO, no solo lo pendiente.
--   total     → cuántos mensajes tiene la tarea (los míos incluidos).
--   no_leidos → cuántos son de otros y todavía no abrí.
-- Con esos dos números la UI puede pintar los tres estados de verdad:
--   sin mensajes  → gris, sin número
--   no_leidos > 0 → ROJO con el número de pendientes
--   total > 0     → VERDE con el total (hay charla, está al día)
-- ============================================================================

create or replace function public.resumen_comentarios_tareas()
returns table (tarea_id uuid, total bigint, no_leidos bigint)
language sql
stable
security invoker
as $$
  select
    tc.tarea_id,
    count(*) as total,
    -- Los propios nunca cuentan como pendientes: uno no se notifica a sí mismo.
    count(*) filter (
      where tc.autor_id <> auth.uid()
        and not exists (
          select 1 from public.tarea_comentario_lecturas l
          where l.comentario_id = tc.id and l.usuario_id = auth.uid()
        )
    ) as no_leidos
  from public.tarea_comentarios tc
  group by tc.tarea_id
$$;

comment on function public.resumen_comentarios_tareas() is
  'Estado de la conversacion por tarea: total de mensajes y cuantos me faltan leer. SECURITY INVOKER a proposito — la RLS de tarea_comentarios ya filtra (admin todo, empleado las suyas) y la funcion solo agrega. Reemplaza a comentarios_no_leidos(), que solo devolvia lo pendiente y dejaba las conversaciones leidas indistinguibles de las vacias. Ver 0029.';

revoke all on function public.resumen_comentarios_tareas() from public, anon;
grant execute on function public.resumen_comentarios_tareas() to authenticated;

-- `comentarios_no_leidos()` (0026) NO se borra acá A PROPÓSITO. La app en
-- producción todavía la llama: si la migración se aplica antes del deploy —que
-- es el orden correcto— dropearla dejaría /tareas rota en esa ventana. Queda
-- como está, sin consumidores nuevos, para borrarla en una migración posterior
-- cuando el deploy ya esté arriba.
comment on function public.comentarios_no_leidos() is
  'SUPERSEDIDA por resumen_comentarios_tareas() (0029). Se conserva solo para no romper el deploy anterior durante la ventana entre migracion y despliegue. Borrar en una migracion futura.';

-- PostgREST cachea las firmas de las funciones RPC: sin esto la app puede
-- seguir sin ver `resumen_comentarios_tareas` aunque exista en la base.
notify pgrst, 'reload schema';
