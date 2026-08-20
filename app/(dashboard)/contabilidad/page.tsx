import { redirect } from "next/navigation"

// ============================================================================
// Contabilidad se fusionó con Caja (2026-08-19, análisis de usabilidad): eran
// la misma tabla de movimientos con distinto filtro — dos pantallas, dos
// nombres ("Contabilidad" en el menú, "Libro" adentro) para un solo libro.
// El período y el "CSV del período" viven ahora en /caja. La ruta queda como
// redirect para marcadores viejos.
//
// De paso murió acá el TypeError "Cannot read properties of null (reading
// 'length')" (digest 86885570): esFacturado() confiaba en que el embed
// venta.comprobantes nunca venía null. El endpoint del CSV heredaba el mismo
// patrón y quedó null-safe en app/api/contabilidad/csv/route.ts — regla:
// NUNCA leer .length de un embed anidado sin ?. de por medio.
// ============================================================================

export default function ContabilidadRedirect() {
  redirect("/caja")
}
