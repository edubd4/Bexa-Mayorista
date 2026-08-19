-- ============================================================================
-- 0038 · Candado anti doble emisión de comprobantes (review 2026-08-19, #2)
--
-- El bug: emitirFactura hacía check-de-existente → llamada a ARCA → insert.
-- Dos emisiones simultáneas de la MISMA venta (vendedor con "emitir al
-- registrar" + admin en la ficha, o dos pestañas) pasaban las dos el check,
-- ARCA autorizaba DOS comprobantes con números consecutivos, y el segundo
-- insert moría contra unique(venta_id): quedaba un CAE fiscal emitido en ARCA
-- sin registro local (solo la ALERTA de historial).
--
-- No se puede sostener una transacción a través de la llamada a ARCA (es un
-- web service externo en el medio del flujo TS). El candado es una tabla con
-- PK en venta_id: el INSERT es atómico — el primero reserva, el segundo
-- rebota ANTES de tocar ARCA. El flujo TS libera el candado al terminar
-- (éxito o error); si un proceso muere con el candado puesto, el siguiente
-- intento lo roba pasados 2 minutos (iniciado_at).
--
-- Las filas acá son EFÍMERAS (viven lo que dura una emisión). No lleva
-- id_publico ni updated_at.
-- ============================================================================

create table public.comprobantes_en_curso (
  venta_id     uuid primary key references public.ventas(id) on delete cascade,
  iniciado_at  timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

-- RLS: mismos actores que comprobantes (admin, o vendedor dueño de la venta).
alter table public.comprobantes_en_curso enable row level security;

create policy "comprobantes_en_curso_all"
  on public.comprobantes_en_curso for all
  to authenticated
  using (
    exists (
      select 1 from public.ventas v
      where v.id = comprobantes_en_curso.venta_id
        and (public.current_user_rol() = 'admin' or v.vendedor_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.ventas v
      where v.id = comprobantes_en_curso.venta_id
        and (public.current_user_rol() = 'admin' or v.vendedor_id = auth.uid())
    )
  );

grant select, insert, delete on public.comprobantes_en_curso to authenticated;
revoke all on public.comprobantes_en_curso from anon;

comment on table public.comprobantes_en_curso is
  'Candado efimero anti doble emision (0038): PK venta_id = solo una emision en curso por venta. Lo toma y libera emitirFactura; candados de mas de 2 min se consideran colgados y se roban.';
