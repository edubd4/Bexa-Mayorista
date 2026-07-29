import { ROL, type Rol } from "@/lib/constants"

// ============================================================================
// Quién puede hacer qué. UN solo lugar.
//
// Antes esto vivía repetido como `rol === ROL.ADMIN` en cada page.tsx, y el día
// que entró el rol `marketing` (0015) hubo que cazar las apariciones una por
// una. Cada función de acá tiene su espejo en SQL; si cambia una, cambia la
// otra:
//
//   puedeGestionarCampanas    ←→  public.puede_gestionar_campanas()   (0017)
//   puedeCargarProductos      ←→  public.puede_cargar_catalogo()      (0028)
//   puedeCargarClientes       ←→  public.puede_cargar_catalogo()      (0028)
//   puedeCargarStockVendedor  ←→  checks de registrar_stock_vendedor() (0020)
//   puedeRegistrarGastos      ←→  checks de rol en registrar_gasto()  (0028)
//
// Estas funciones deciden qué se MUESTRA. Nunca son la única defensa: la server
// action valida de nuevo con su guard, y la RLS valida de nuevo en la base.
// ============================================================================

type RolInput = Rol | string | null | undefined

export function esAdmin(rol: RolInput): boolean {
  return rol === ROL.ADMIN
}

// Campañas: las gestiona el área de marketing. El vendedor las ve para saber
// qué se está promocionando cuando vende, pero no las crea ni las edita.
export function puedeGestionarCampanas(rol: RolInput): boolean {
  return rol === ROL.ADMIN || rol === ROL.MARKETING
}

// Catálogo: lo cargan admin y vendedor. Marketing no carga mercadería.
// Desde la 0028 esto ya no es solo el ALTA: el vendedor también EDITA y DA DE
// BAJA productos (decisión del cliente 2026-07-29). Lo único que sigue siendo
// exclusivo del admin es `comision_pct` y el costo como dato de LECTURA.
export function puedeCargarProductos(rol: RolInput): boolean {
  return rol === ROL.ADMIN || rol === ROL.COLABORADOR
}

// Clientes: mismo criterio que el catálogo desde la 0028 — el vendedor da de
// alta, edita y da de baja a sus clientes. Función aparte y no un alias de
// `puedeCargarProductos` porque son dos permisos distintos que hoy coinciden:
// el día que el cliente quiera separarlos, se cambia acá y no hay que ir a
// buscar cuál de las dos cosas significaba cada llamada.
export function puedeCargarClientes(rol: RolInput): boolean {
  return rol === ROL.ADMIN || rol === ROL.COLABORADOR
}

// Gastos (0028): el admin registra cualquiera. Marketing SOLO gastos de
// publicidad imputados a una campaña — es el dueño de las campañas y necesita
// cargar lo que gasta, pero la caja del resto del negocio no es asunto suyo.
// El RPC registrar_gasto vuelve a validar las dos condiciones en SQL.
export function puedeRegistrarGastos(rol: RolInput): boolean {
  return rol === ROL.ADMIN || rol === ROL.MARKETING
}

// La lista de precios de un cliente define lo que paga en CADA venta futura
// (resolver_precio la lee). Es política de precios: admin-only por CLAUDE.md.
// Espeja al trigger clientes_lista_precio_admin_only (0028).
export function puedeAsignarListaPrecios(rol: RolInput): boolean {
  return rol === ROL.ADMIN
}

// El costo y la comisión del producto son SOLO del admin. Es la regla de oro
// del proyecto: si un costo llega al client de un vendedor está mal, aunque la
// UI no lo muestre. El vendedor SÍ puede tipear un costo al dar de alta un
// producto (lo trae él) — eso es escribir, no leer. Ver 0017.
export function puedeVerCostos(rol: RolInput): boolean {
  return rol === ROL.ADMIN
}

// Stock del vendedor (0020): solo sobre productos que ÉL creó — completa su
// alta y corrige sus errores, no toca el catálogo ajeno. La mercadería llega
// en partes, así que no hay ventana temporal (decisión del cliente 2026-07-27).
// El admin no pasa por acá: tiene el form completo con insert directo.
export function puedeCargarStockVendedor(rol: RolInput, esCreadorDelProducto: boolean): boolean {
  return rol === ROL.COLABORADOR && esCreadorDelProducto
}
