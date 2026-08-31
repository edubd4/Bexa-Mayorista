-- ============================================================================
-- 0043 · Cobro mixto — una venta pagada con más de un método en un solo acto
-- ============================================================================
-- La arquitectura de caja YA soporta el pago mixto a nivel datos: cada cobro
-- es un movimiento con su metodo_pago, y estado_cobro/total_cobrado se
-- derivan de la suma (cobrar_venta, 0009/0030). Lo que faltaba era la
-- ATOMICIDAD del acto: "$5.000 efectivo + $5.000 transferencia" tiene que
-- entrar entero o no entrar — dos llamadas sueltas desde el client podían
-- dejar media plata registrada si la segunda fallaba.
--
-- Diseño: cobrar_venta_multi NO duplica la lógica de cobro. Delegando cada
-- pago en cobrar_venta() se heredan lock, validación de saldo, permisos
-- (admin o vendedor de la venta, guarda NULL-safe de 0030) y la derivación
-- de estado — y como plpgsql corre todo en la transacción del caller, si un
-- pago rebota (p.ej. la suma excede el saldo) se revierten TODOS.
-- Un movimiento de caja por método: el arqueo por método queda intacto.

create or replace function public.cobrar_venta_multi(
  p_venta_id    uuid,
  p_pagos       jsonb,               -- [{"metodo":"EFECTIVO","monto":5000}, ...]
  p_descripcion text default null,
  p_fecha       timestamptz default null
)
returns uuid[]
language plpgsql
security invoker
as $$
declare
  v_pago    jsonb;
  v_metodo  metodo_pago;
  v_monto   numeric;
  v_mov_ids uuid[] := '{}';
begin
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array'
     or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Se requiere al menos un pago';
  end if;
  if jsonb_array_length(p_pagos) > 7 then
    raise exception 'Demasiados métodos en un solo cobro (máximo 7)';
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    begin
      v_metodo := (v_pago->>'metodo')::metodo_pago;
    exception when invalid_text_representation then
      raise exception 'Método de pago inválido: %', v_pago->>'metodo';
    end;
    -- El cast de NULL no levanta: sin este check el error saldría recién del
    -- INSERT como not-null violation, ilegible para el que cobra.
    if v_metodo is null then
      raise exception 'Cada pago necesita su método';
    end if;
    v_monto := (v_pago->>'monto')::numeric;

    v_mov_ids := v_mov_ids || public.cobrar_venta(
      p_venta_id, v_monto, v_metodo, p_descripcion, p_fecha
    );
  end loop;

  return v_mov_ids;
end;
$$;

-- OBLIGATORIO tras el create or replace (ver 0024). No borrar.
alter function public.cobrar_venta_multi(uuid, jsonb, text, timestamptz)
  security definer
  set search_path = public;

grant execute on function public.cobrar_venta_multi(uuid, jsonb, text, timestamptz) to authenticated;

comment on function public.cobrar_venta_multi(uuid, jsonb, text, timestamptz) is
  'Cobro pagado con varios métodos: un movimiento de caja por método, atómico (todos o ninguno). Delega cada pago en cobrar_venta() — validaciones, permisos y estado_cobro idénticos al cobro simple. Ver 0043.';
