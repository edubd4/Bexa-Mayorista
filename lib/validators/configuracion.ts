import { z } from "zod"

// Config es un key-value store. Solo validamos que las claves conocidas
// tengan formato/rangos razonables cuando se les cambia el valor.
export const configuracionUpdateSchema = z.record(
  z.string().min(1),
  z.string().max(500)
)
export type ConfiguracionUpdate = z.infer<typeof configuracionUpdateSchema>

// Claves del CORE (matchean con los seeds de 0001_init.sql).
// Cada módulo cosechado agrega sus claves (y sus CONFIG_FIELDS) al integrarse:
// parámetros propios + su `prefijo_<modulo>` de id_publico.
export const CONFIG_KEYS = {
  NEGOCIO_NOMBRE:               "negocio_nombre",
  NEGOCIO_TELEFONO:             "negocio_telefono",
  NEGOCIO_DIRECCION:            "negocio_direccion",
  MONEDA_DEFAULT:               "moneda_default",
  TEMPLATE_REACTIVACION:        "template_reactivacion",
  ALERTA_CLIENTE_INACTIVO_DIAS: "alerta_cliente_inactivo_dias",
} as const

// Defaults hardcoded para claves de config. Si la fila no existe en la tabla
// (seed no corrido), se usa este valor. Regla: SIEMPRE con fallback.
export const CONFIG_DEFAULTS: Record<string, string> = {
  [CONFIG_KEYS.MONEDA_DEFAULT]: "ARS",
}

// Helper: lee un número de la config con fallback al default.
export function configNumber(
  values: Record<string, string>,
  clave: string,
  fallback: number,
): number {
  const raw = values[clave] ?? CONFIG_DEFAULTS[clave]
  if (raw === undefined || raw === null || raw === "") return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

// Descripcion humana + tipo esperado, para renderizar el form.
export type ConfigFieldSpec = {
  clave: string
  label: string
  descripcion: string
  tipo: "text" | "number" | "moneda"
  placeholder?: string
}

export const CONFIG_FIELDS: ConfigFieldSpec[] = [
  {
    clave: CONFIG_KEYS.NEGOCIO_NOMBRE,
    label: "Nombre del negocio",
    descripcion: "Se muestra en encabezados, emails y documentos.",
    tipo: "text",
    placeholder: "Mi Negocio",
  },
  {
    clave: CONFIG_KEYS.NEGOCIO_TELEFONO,
    label: "Teléfono de contacto",
    descripcion: "El teléfono público que ven los clientes.",
    tipo: "text",
    placeholder: "351 555-1234",
  },
  {
    clave: CONFIG_KEYS.NEGOCIO_DIRECCION,
    label: "Dirección",
    descripcion: "Dirección física del negocio.",
    tipo: "text",
    placeholder: "Calle y número, ciudad, provincia",
  },
  {
    clave: CONFIG_KEYS.MONEDA_DEFAULT,
    label: "Moneda por defecto",
    descripcion: "ARS o USD. Se usa cuando no se especifica otra.",
    tipo: "moneda",
  },
  {
    clave: CONFIG_KEYS.TEMPLATE_REACTIVACION,
    label: "Mensaje de reactivación",
    descripcion: "Texto que se copia desde /seguimiento. Placeholders: {cliente}, {negocio}, {dias}.",
    tipo: "text",
    placeholder: "Hola {cliente}, hace {dias} días que no te vemos por {negocio}…",
  },
  {
    clave: CONFIG_KEYS.ALERTA_CLIENTE_INACTIVO_DIAS,
    label: "Días sin comprar para marcar cliente inactivo",
    descripcion: "Alimenta la sección Seguimiento. Default 60. Poné un número menor para ser más proactivo, mayor para ver solo los muy vencidos.",
    tipo: "number",
    placeholder: "60",
  },
]
