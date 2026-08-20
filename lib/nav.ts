import { ROL, type Rol } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"

// Las claves de iconos deben existir en `components/nav/icons.ts`.
// Se usa string en vez de un componente React porque el nav se define en el
// server component (layout) y se pasa como prop a un client component; las
// funciones/componentes no son JSON-serializables cruzando la frontera.
export type IconKey =
  | "LayoutDashboard"
  | "ClipboardList"
  | "Users"
  | "CalendarDays"
  | "FileText"
  | "BookOpen"
  | "Package"
  | "Wallet"
  | "Receipt"
  | "Landmark"
  | "Calculator"
  | "BarChart3"
  | "UserCog"
  | "Settings"
  | "AlertTriangle"
  | "ScrollText"
  | "Megaphone"
  | "UserRoundSearch"
  | "GraduationCap"
  | "ListChecks"
  | "ScanLine"

export type NavItem = {
  label: string
  href: string
  iconKey: IconKey
  // Roles que pueden ver este item. Si no se define, cualquier rol autenticado.
  roles?: Rol[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

// Configuración del sidebar. Labels de entidades SIEMPRE desde DOMINIO — nada
// hardcodeado. Cada módulo cosechado agrega su item en el grupo que corresponda
// (Operación / Comercial / Plata / Análisis), antes de "Sistema".
// Alias reusables para roles compuestos — mantener consistencia con la matriz
// de permisos: marketing NO puede vender/comprar/tocar plata, pero SÍ ve
// clientes/productos/campañas/seguimiento.
const OPERATIVO = [ROL.ADMIN, ROL.COLABORADOR] as const

export const NAV: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { label: "Panel", href: "/panel", iconKey: "LayoutDashboard" },
      // Sin `roles`: el sistema operativo del equipo es para TODOS — cada uno
      // ve sus tareas; el admin ve el tablero completo (0025).
      { label: DOMINIO.tareas.plural, href: DOMINIO.tareas.ruta, iconKey: "ListChecks" },
      { label: DOMINIO.ventas.plural,  href: DOMINIO.ventas.ruta,  iconKey: "ClipboardList", roles: [...OPERATIVO] },
      // Mostrador (POS): venta rapida con escaner en la pasarela de pago.
      { label: DOMINIO.pos.plural, href: DOMINIO.pos.ruta, iconKey: "ScanLine", roles: [...OPERATIVO] },
      { label: DOMINIO.compras.plural, href: DOMINIO.compras.ruta, iconKey: "Receipt",        roles: [ROL.ADMIN] },
      // Alertas es la rutina diaria del admin, no "análisis": vive con la operación.
      { label: "Alertas", href: "/alertas", iconKey: "AlertTriangle", roles: [ROL.ADMIN] },
    ],
  },
  // Reagrupado 2026-07-27 (pedido del cliente): los grupos de un solo ítem
  // ("Comercial") y los que mezclaban cosas ("Maestros", "Análisis") se
  // reordenan por CÓMO SE TRABAJA: el catálogo con su política de precios al
  // lado, y los clientes con su seguimiento.
  {
    label: "Catálogo y precios",
    items: [
      { label: DOMINIO.productos.plural,   href: DOMINIO.productos.ruta,   iconKey: "Package"                        },
      { label: "Listas de precios",        href: "/listas-precios",        iconKey: "BookOpen", roles: [ROL.ADMIN]   },
      { label: DOMINIO.proveedores.plural, href: DOMINIO.proveedores.ruta, iconKey: "Landmark", roles: [...OPERATIVO] },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: DOMINIO.clientes.plural,    href: DOMINIO.clientes.ruta,    iconKey: "Users"           },
      { label: DOMINIO.seguimiento.plural, href: DOMINIO.seguimiento.ruta, iconKey: "UserRoundSearch" },
    ],
  },
  {
    label: "Plata",
    items: [
      { label: DOMINIO.caja.plural,   href: DOMINIO.caja.ruta,   iconKey: "Wallet",     roles: [ROL.ADMIN] },
      { label: DOMINIO.gastos.plural, href: DOMINIO.gastos.ruta, iconKey: "Receipt",    roles: [ROL.ADMIN] },
      // "Deudas y ganancia" es lo que la pantalla MUESTRA (2026-08-19).
      // Contabilidad se fusiono con Caja: mismo libro, ahora con periodo y CSV
      // en un solo lugar — /contabilidad quedo como redirect.
      { label: "Deudas y ganancia",   href: "/finanzas",         iconKey: "Landmark",   roles: [ROL.ADMIN] },
      { label: "Comisiones",          href: "/comisiones",       iconKey: "BarChart3",  roles: [...OPERATIVO] },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: DOMINIO.campanas.plural, href: DOMINIO.campanas.ruta,       iconKey: "Megaphone"    },
      { label: "Calendario",             href: "/campanas/calendario",     iconKey: "CalendarDays" },
    ],
  },
  {
    label: "Sistema",
    items: [
      // Sin `roles`: el manual es para todos. El filtrado por rol pasa adentro,
      // sección por sección (lib/manual/contenido.ts).
      { label: "Manual",                     href: "/manual",                  iconKey: "GraduationCap" },
      { label: DOMINIO.usuarios.plural,      href: DOMINIO.usuarios.ruta,      iconKey: "UserCog",    roles: [ROL.ADMIN] },
      { label: DOMINIO.historial.plural,     href: DOMINIO.historial.ruta,     iconKey: "ScrollText", roles: [ROL.ADMIN] },
      { label: DOMINIO.configuracion.plural, href: DOMINIO.configuracion.ruta, iconKey: "Settings",   roles: [ROL.ADMIN] },
    ],
  },
]

export function filterNavByRol(nav: NavGroup[], rol: Rol | undefined): NavGroup[] {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || (rol && item.roles.includes(rol))),
    }))
    .filter((group) => group.items.length > 0)
}
