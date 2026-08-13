import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { ROL } from "@/lib/constants"
import { diaSiguienteISO, toCSV, tsArgentina } from "@/lib/fechas"
import { formatPesos } from "@/lib/utils"
import { METODO_PAGO_LABEL, ORIGEN_MOV_CAJA_LABEL, TIPO_MOV_CAJA_LABEL } from "@/lib/caja-ui"
import type { MetodoPago, OrigenMovCaja, TipoMovCaja } from "@/lib/validators/caja"
import { logPerfilError } from "@/lib/auth-guards"

// GET /api/contabilidad/csv?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Exporta el libro del período con BOM UTF-8 para que Excel lo abra bien.
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const { data: profile, error: perfilError } = await supabase.from("profiles").select("rol, activo").eq("id", user.id).single()
  logPerfilError("ContabilidadCsvRoute", perfilError)
  if (profile?.rol !== ROL.ADMIN || !profile.activo) {
    return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 })
  }

  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hastaInclusive = url.searchParams.get("hasta") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hastaInclusive)) {
    return NextResponse.json({ ok: false, error: "Parámetros desde/hasta inválidos" }, { status: 400 })
  }
  // desde inclusive · hasta exclusivo (el usuario da un día inclusivo)
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(hastaInclusive) ? diaSiguienteISO(hastaInclusive) : hastaInclusive

  const { data, error } = await supabase
    .from("movimientos_caja")
    .select("id_publico, fecha, tipo, origen, monto, metodo_pago, descripcion, venta:venta_id ( id, comprobantes ( id ) )")
    .gte("fecha", tsArgentina(desde))
    .lt("fecha", tsArgentina(hasta))
    .order("fecha", { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // "Facturada" (0032): Sí/No para cobros de venta; vacío si el movimiento no
  // tiene venta asociada (gastos, ajustes) — al contador le importa el circuito.
  const headers = ["ID", "Fecha", "Tipo", "Origen", "Método", "Descripción", "Facturada", "Monto"]
  const rows: (string | number | null)[][] = (data ?? []).map((m) => {
    const mov = m as unknown as {
      id_publico: string
      fecha: string
      tipo: TipoMovCaja
      origen: OrigenMovCaja
      monto: number
      metodo_pago: MetodoPago
      descripcion: string | null
      venta: { id: string; comprobantes: { id: string }[] } | null
    }
    return [
      mov.id_publico,
      mov.fecha,
      TIPO_MOV_CAJA_LABEL[mov.tipo],
      ORIGEN_MOV_CAJA_LABEL[mov.origen],
      METODO_PAGO_LABEL[mov.metodo_pago],
      mov.descripcion ?? "",
      mov.venta ? (mov.venta.comprobantes.length > 0 ? "Sí" : "No") : "",
      formatPesos(Number(mov.monto)),
    ]
  })

  const csv = toCSV(headers, rows)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bexa-libro-${desde}_${hastaInclusive}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
