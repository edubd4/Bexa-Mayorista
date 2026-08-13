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
  // Facturación electrónica ARCA (seeds en 0031)
  AFIP_CUIT:                "afip_cuit",
  AFIP_RAZON_SOCIAL:        "afip_razon_social",
  AFIP_DOMICILIO:           "afip_domicilio",
  AFIP_PUNTO_VENTA:         "afip_punto_venta",
  AFIP_IVA_PCT:             "afip_iva_pct",
  AFIP_IIBB:                "afip_iibb",
  AFIP_INICIO_ACTIVIDADES:  "afip_inicio_actividades",
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
  /** Los campos con el mismo grupo se renderizan bajo un título de sección.
   *  Sin grupo = sección general de arriba (datos del negocio). */
  grupo?: string
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
  // ── Facturación electrónica ARCA (0031) ──
  // afip_cuit es la llave maestra: vacío = módulo apagado en toda la app.
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_CUIT,
    label: "CUIT de la empresa emisora",
    descripcion: "Con o sin guiones, lo normalizamos. VACÍO = facturación electrónica apagada: el botón Facturar y el circuito facturado no aparecen en ninguna pantalla.",
    tipo: "text",
    placeholder: "30-12345678-9",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_RAZON_SOCIAL,
    label: "Razón social",
    descripcion: "Tal cual figura en ARCA. Encabeza la factura impresa.",
    tipo: "text",
    placeholder: "BEXA IMPORT S.A.",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_DOMICILIO,
    label: "Domicilio comercial",
    descripcion: "El que figura en el comprobante impreso.",
    tipo: "text",
    placeholder: "Calle y número, ciudad, provincia",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_PUNTO_VENTA,
    label: "Punto de venta (Web Services)",
    descripcion: "El número que ARCA asignó al dar de alta el punto de venta modo Web Services (Trámite 3 del instructivo). NO es el del talonario ni el del facturador en línea.",
    tipo: "number",
    placeholder: "3",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_IVA_PCT,
    label: "Alícuota de IVA (%)",
    descripcion: "10.5, 21 o 27. Los precios del sistema son finales (IVA incluido); esta alícuota discrimina el neto en la Factura A.",
    tipo: "text",
    placeholder: "21",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_IIBB,
    label: "Nº de Ingresos Brutos",
    descripcion: "Va en el pie de la factura impresa (RG 1415).",
    tipo: "text",
  },
  {
    grupo: "Facturación electrónica (ARCA)",
    clave: CONFIG_KEYS.AFIP_INICIO_ACTIVIDADES,
    label: "Inicio de actividades",
    descripcion: "Fecha dd/mm/aaaa. Va en el pie de la factura impresa.",
    tipo: "text",
    placeholder: "01/03/2015",
  },
]
