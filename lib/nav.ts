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
export const NAV: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { label: "Panel", href: "/panel", iconKey: "LayoutDashboard" },
    ],
  },
  {
    label: "Maestros",
    items: [
      { label: DOMINIO.clientes.plural,    href: DOMINIO.clientes.ruta,    iconKey: "Users"    },
      { label: DOMINIO.proveedores.plural, href: DOMINIO.proveedores.ruta, iconKey: "Landmark" },
      { label: DOMINIO.productos.plural,   href: DOMINIO.productos.ruta,   iconKey: "Package"  },
    ],
  },
  {
    label: "Sistema",
    items: [
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
