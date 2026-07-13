// Helpers de fecha y CSV compartidos por los módulos de reporting (Tesorería,
// Contabilidad, Gastos). Mantener las fechas siempre como "YYYY-MM-DD" para
// evitar drift de TZ al cruzar server → client.

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ─── Timezone Argentina ─────────────────────────────────────────────────────
// El server (Vercel) corre en UTC; el negocio vive en UTC-3. Sin esto, entre
// las 21:00 y la medianoche argentina "hoy" y "mes actual" apuntan al día/mes
// siguiente. Argentina no tiene DST, así que el offset -03:00 es fijo.
const TZ_ARGENTINA = "America/Argentina/Buenos_Aires"

// Date cuyos getters locales devuelven la hora de pared argentina.
// Solo para decidir "qué día/mes es" — no usar .toISOString() sobre esto.
export function ahoraArgentina(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ_ARGENTINA }))
}

// Medianoche argentina de una fecha "YYYY-MM-DD", como timestamp con offset
// explícito. Para comparar contra columnas timestamptz.
export function tsArgentina(isoDate: string): string {
  return `${isoDate}T00:00:00-03:00`
}

// "YYYY-MM" del mes argentino en que cayó un timestamp (para bucketing).
export function mesArgentina(fechaISO: string): string {
  const d = new Date(new Date(fechaISO).getTime() - 3 * 3600_000)
  return d.toISOString().substring(0, 7)
}

// "YYYY-MM-DD" del día argentino en que cayó un timestamp.
export function fechaArgentinaISO(fechaISO: string): string {
  const d = new Date(new Date(fechaISO).getTime() - 3 * 3600_000)
  return d.toISOString().substring(0, 10)
}

export function rangoMesActual(base: Date = ahoraArgentina()): { desde: string; hasta: string } {
  const y = base.getFullYear()
  const m = base.getMonth()
  const primerDia = new Date(y, m, 1)
  const primerDiaSigMes = new Date(y, m + 1, 1)
  return { desde: toISODate(primerDia), hasta: toISODate(primerDiaSigMes) }
}

export function rangoAnioActual(base: Date = ahoraArgentina()): { desde: string; hasta: string } {
  const y = base.getFullYear()
  return { desde: `${y}-01-01`, hasta: `${y + 1}-01-01` }
}

// Día siguiente de una fecha "YYYY-MM-DD". Para usar rangos [desde, hasta]
// inclusivos del lado del usuario con queries exclusivas (.lt) del lado de la DB.
// T12:00:00 evita drift de TZ al parsear.
export function diaSiguienteISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

export function nombreMes(base: Date = ahoraArgentina()): string {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(base)
}

// ─── CSV ────────────────────────────────────────────────────────────────────
// Escape RFC 4180: si el valor tiene coma, comilla o salto de línea, se envuelve
// entre comillas dobles y las comillas internas se duplican.
export function escapeCSVCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCSVCell).join(",")]
  for (const row of rows) {
    lines.push(row.map(escapeCSVCell).join(","))
  }
  // BOM UTF-8 al principio para que Excel abra bien las tildes.
  return "﻿" + lines.join("\r\n")
}
