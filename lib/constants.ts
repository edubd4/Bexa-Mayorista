// ENUMs del CORE — usar exactamente estos strings en toda la app.
// Cada ENUM tiene espejo en Postgres (ver supabase/migrations/0001_init.sql).
// Los ENUMs de dominio (estado_cliente, estado_venta, etc.) viven con su módulo
// en lib/<modulo>-ui.ts + su migración — NO acá.

// ─── Roles ────────────────────────────────────────────────────────────────────
// Nombres de ESQUEMA fijos. La presentación ("Técnico", "Vendedor") sale de
// ROL_LABEL en lib/dominio.ts — regla de oro #1.
export const ROL = {
  ADMIN: 'admin',
  COLABORADOR: 'colaborador',
} as const
export type Rol = typeof ROL[keyof typeof ROL]

// ─── Historial / auditoría ────────────────────────────────────────────────────
// Genéricos del core. Los módulos agregan valores con ALTER TYPE ... ADD VALUE
// en su propia migración y los espejan en su lib/<modulo>-ui.ts.
export const TIPO_EVENTO = {
  ALTA: 'ALTA',
  MODIFICACION: 'MODIFICACION',
  BAJA: 'BAJA',
  CAMBIO_ESTADO: 'CAMBIO_ESTADO',
  MOVIMIENTO: 'MOVIMIENTO',
  COBRO: 'COBRO',
  GASTO: 'GASTO',
  NOTA: 'NOTA',
  ALERTA: 'ALERTA',
  MENSAJE_IA: 'MENSAJE_IA',
  SISTEMA: 'SISTEMA',
} as const
export type TipoEvento = typeof TIPO_EVENTO[keyof typeof TIPO_EVENTO]

// ─── Métodos de pago (compartido por módulos de plata) ────────────────────────
export const METODO_PAGO = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  MERCADO_PAGO: 'MERCADO_PAGO',
  OTRO: 'OTRO',
} as const
export type MetodoPago = typeof METODO_PAGO[keyof typeof METODO_PAGO]

// NOTA: no hay ID_PREFIX acá. Los prefijos de id_publico son DATO, no código:
// viven como seeds `prefijo_<modulo>` en la tabla configuracion (regla de oro #3)
// y como `prefijoId` informativo en lib/dominio.ts para la UI.
