"use client"

import { Printer } from "lucide-react"

// Botón imprimir para vistas de documentos (factura, remito). Se oculta solo
// en la impresión — el papel no lleva botones.
export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
    >
      <Printer className="w-4 h-4" />
      {label}
    </button>
  )
}
