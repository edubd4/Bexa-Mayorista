import { ROL, type Rol } from "@/lib/constants"

// ============================================================================
// Quién puede hacer qué. UN solo lugar.
//
// Antes esto vivía repetido como `rol === ROL.ADMIN` en cada page.tsx, y el día
// que entró el rol `marketing` (0015) hubo que cazar las apariciones una por
// una. Cada función de acá tiene su espejo en SQL; si cambia una, cambia la
// otra:
//
//   puedeGestionarCampanas  ←→  public.puede_gestionar_campanas()   (0017)
//   puedeCargarProductos    ←→  check de rol en crear_producto_vendedor() (0017)
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
export function puedeCargarProductos(rol: RolInput): boolean {
  return rol === ROL.ADMIN || rol === ROL.COLABORADOR
}

// El costo y la comisión del producto son SOLO del admin. Es la regla de oro
// del proyecto: si un costo llega al client de un vendedor está mal, aunque la
// UI no lo muestre. El vendedor SÍ puede tipear un costo al dar de alta un
// producto (lo trae él) — eso es escribir, no leer. Ver 0017.
export function puedeVerCostos(rol: RolInput): boolean {
  return rol === ROL.ADMIN
}
