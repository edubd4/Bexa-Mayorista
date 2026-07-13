// ★ EL DICCIONARIO DE DOMINIO — generado desde FORJA/registry/blueprints/bexa.yaml
// Regla de oro #1: se renombra la PRESENTACIÓN, jamás el ESQUEMA.
// La tabla se llama `clientes` SIEMPRE; el usuario ve lo que dice este archivo.
// Ningún string de entidad se hardcodea en JSX: siempre DOMINIO.<entidad>.*

export type Genero = "m" | "f"

export type EntidadDominio = {
  /** Lo que ve el usuario, en singular ("Cliente") */
  singular: string
  /** Lo que ve el usuario, en plural ("Clientes") */
  plural: string
  /** Ruta del módulo (la interna; alias vía rewrites solo si el cliente ve URLs) */
  ruta: string
  /** Prefijo de id_publico — INFORMATIVO en UI; el operativo es el seed
   *  `prefijo_<entidad>` en la tabla configuracion (regla de oro #3) */
  prefijoId?: string
  /** Nombre de ícono lucide, resuelto client-side en components/nav/icons.ts */
  icono?: string
  /** Género gramatical: "Nuevo cliente" (m) vs "Nueva venta" (f) */
  genero: Genero
}

// ─── Identidad de la app (del blueprint) ─────────────────────────────────────
export const APP = {
  nombre: process.env.NEXT_PUBLIC_APP_NAME ?? "BEXA",
  tagline: "Distribuidora mayorista",
  descripcion: "Sistema de gestión integral — BEXA Import",
} as const

// ─── Labels de roles — el ESQUEMA siempre es 'admin' | 'colaborador' ─────────
// En BEXA el colaborador se llama "Vendedor". El enum SQL no cambia jamás.
export const ROL_LABEL: Record<string, string> = {
  admin: "Admin",
  colaborador: "Vendedor",
}

// ─── Entidades ────────────────────────────────────────────────────────────────
// Core (activas desde el bootstrap) + dominio (blueprint) — el diccionario ya
// las conoce; el nav suma cada una cuando su ola la construye.
export const DOMINIO = {
  // ── Core ──
  usuarios: {
    singular: "Vendedor",
    plural: "Vendedores",
    ruta: "/usuarios",
    icono: "UserCog",
    genero: "m",
  },
  historial: {
    singular: "Evento",
    plural: "Historial",
    ruta: "/historial",
    icono: "ScrollText",
    genero: "m",
  },
  configuracion: {
    singular: "Configuración",
    plural: "Configuración",
    ruta: "/configuracion",
    icono: "Settings",
    genero: "f",
  },
  // ── Dominio (blueprint) — se activan por ola ──
  clientes: {
    singular: "Cliente",
    plural: "Clientes",
    ruta: "/clientes",
    prefijoId: "CLI",
    icono: "Users",
    genero: "m",
  },
  proveedores: {
    singular: "Proveedor",
    plural: "Proveedores",
    ruta: "/proveedores",
    prefijoId: "PROV",
    icono: "Landmark",
    genero: "m",
  },
  productos: {
    singular: "Producto",
    plural: "Productos",
    ruta: "/productos",
    prefijoId: "PROD",
    icono: "Package",
    genero: "m",
  },
  ventas: {
    singular: "Venta",
    plural: "Ventas",
    ruta: "/ventas",
    prefijoId: "VTA",
    icono: "ClipboardList",
    genero: "f",
  },
  compras: {
    singular: "Compra",
    plural: "Compras",
    ruta: "/compras",
    prefijoId: "COMP",
    icono: "Receipt",
    genero: "f",
  },
  caja: {
    singular: "Movimiento",
    plural: "Caja",
    ruta: "/caja",
    prefijoId: "MOV",
    icono: "Wallet",
    genero: "m",
  },
  contabilidad: {
    singular: "Finanzas",
    plural: "Finanzas",
    ruta: "/contabilidad",
    icono: "Calculator",
    genero: "f",
  },
  alertas: {
    singular: "Alerta",
    plural: "Alertas",
    ruta: "/alertas",
    icono: "AlertTriangle",
    genero: "f",
  },
} satisfies Record<string, EntidadDominio>

export type EntidadKey = keyof typeof DOMINIO

// Helper UX: "Nuevo cliente" / "Nueva venta" según género.
export function nuevoLabel(e: EntidadDominio): string {
  return `${e.genero === "f" ? "Nueva" : "Nuevo"} ${e.singular.toLowerCase()}`
}
