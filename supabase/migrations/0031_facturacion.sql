-- ============================================================================
-- BEXA · Módulo Facturación Electrónica (AFIP/ARCA — WSFEv1 vía Afip SDK)
-- Pedido del cliente 2026-08-04: las facturas del sistema deben impactar en
-- AFIP. Factura A a Responsable Inscripto / Monotributista (IVA discriminado),
-- Factura B a Consumidor Final / Exento (IVA incluido).
--
-- Decisiones de diseño (engram bexa/facturacion-afip):
--   - `comprobantes` es una tabla SEPARADA de `ventas`: la venta es negocio,
--     el comprobante es fiscal. Una venta puede existir sin facturar (ARCA
--     caído no frena la operación) y el modelo queda listo para notas de
--     crédito futuras.
--   - Append-only: un comprobante autorizado por ARCA (con CAE) es inmutable.
--     No hay UPDATE ni DELETE — jamás.
--   - La numeración fiscal la asigna ARCA (punto_venta + numero); no hay
--     id_publico propio: el número de comprobante ES el identificador público.
--   - RG 5616: la condición de IVA del receptor viaja en cada emisión y desde
--     el 01/09/2026 ARCA rechaza comprobantes sin ese dato → snapshot acá y
--     campo obligatorio en clientes.
-- ============================================================================

-- ─── Enums del dominio fiscal ───────────────────────────────────────────────
create type condicion_iva as enum (
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTISTA',
  'CONSUMIDOR_FINAL',
  'EXENTO'
);

create type tipo_comprobante as enum ('FACTURA_A', 'FACTURA_B');

-- ─── Clientes: condición frente al IVA ──────────────────────────────────────
-- Default CONSUMIDOR_FINAL: es el caso más común en minorista y el más seguro
-- (Factura B). Los mayoristas RI existentes se corrigen desde su ficha antes
-- de facturarles — la emisión de Factura A valida CUIT presente.
alter table public.clientes
  add column condicion_iva condicion_iva not null default 'CONSUMIDOR_FINAL';

-- ─── Comprobantes emitidos (append-only) ────────────────────────────────────
create table public.comprobantes (
  id                      uuid primary key default gen_random_uuid(),
  venta_id                uuid not null references public.ventas(id) on delete restrict,
  -- Identidad fiscal del comprobante (la asigna ARCA al autorizar)
  tipo                    tipo_comprobante not null,
  punto_venta             integer not null check (punto_venta > 0),
  numero                  bigint  not null check (numero > 0),
  fecha_emision           date    not null default current_date,
  -- Snapshots del emisor y receptor al momento de emitir
  cuit_emisor             text not null,
  doc_tipo                integer not null,  -- código ARCA: 80=CUIT · 96=DNI · 99=sin identificar
  doc_nro                 text not null,     -- '0' cuando doc_tipo=99
  condicion_iva_receptor  condicion_iva not null,
  -- Montos (los precios del sistema son finales → neto = total / (1 + iva%))
  neto                    numeric(14,2) not null check (neto >= 0),
  iva                     numeric(14,2) not null check (iva >= 0),
  total                   numeric(14,2) not null check (total >= 0),
  -- Autorización ARCA
  cae                     text not null,
  cae_vencimiento         date not null,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id),
  -- Una factura por venta (las notas de crédito, cuando lleguen, relajan esto)
  unique (venta_id),
  -- La numeración ARCA es única por (punto de venta, tipo)
  unique (punto_venta, tipo, numero)
);

create index idx_comprobantes_venta  on public.comprobantes(venta_id);
create index idx_comprobantes_fecha  on public.comprobantes(fecha_emision desc);

-- Append-only: mismo patrón que comisiones (0007)
create or replace function public.comprobantes_block_mutations()
returns trigger language plpgsql as $$
begin
  raise exception 'comprobantes es inmutable: % no permitido. Un comprobante con CAE no se toca — se anula con nota de crédito.', TG_OP;
end;
$$;

create trigger comprobantes_no_update
  before update on public.comprobantes
  for each row execute function public.comprobantes_block_mutations();

create trigger comprobantes_no_delete
  before delete on public.comprobantes
  for each row execute function public.comprobantes_block_mutations();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Misma visibilidad que la venta que respaldan: admin todo, vendedor lo suyo.
alter table public.comprobantes enable row level security;

create policy "comprobantes_select"
  on public.comprobantes for select
  using (
    exists (
      select 1 from public.ventas v
      where v.id = comprobantes.venta_id
        and (public.current_user_rol() = 'admin' or v.vendedor_id = auth.uid())
    )
  );

-- Emite el admin o el vendedor dueño de la venta (el CAE ya viene autorizado
-- por ARCA cuando se inserta — la fila solo registra lo que ARCA aprobó).
create policy "comprobantes_insert"
  on public.comprobantes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.ventas v
      where v.id = comprobantes.venta_id
        and (public.current_user_rol() = 'admin' or v.vendedor_id = auth.uid())
    )
  );

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
grant select, insert on public.comprobantes to authenticated;
revoke all on public.comprobantes from anon;

-- ─── Seeds de configuración fiscal ──────────────────────────────────────────
-- afip_cuit vacío = facturación deshabilitada (la UI no muestra el botón).
-- Cert/key/token del SDK van por env vars (secretos), NUNCA a esta tabla.
insert into public.configuracion (clave, valor, descripcion) values
  ('afip_cuit',         '',   'CUIT de la empresa emisora (solo números). Vacío = facturación electrónica deshabilitada'),
  ('afip_razon_social', '',   'Razón social de la empresa tal como figura en ARCA'),
  ('afip_domicilio',    '',   'Domicilio comercial que figura en el comprobante'),
  ('afip_punto_venta',  '1',  'Punto de venta modo Web Services dado de alta en ARCA'),
  ('afip_iva_pct',      '21', 'Alícuota de IVA del rubro (%) — los precios del sistema son finales (IVA incluido)')
on conflict (clave) do nothing;
