"use client"

import { useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Comprobante post-cobro: el paso que sale SIEMPRE ───────────────────────
// Después de cobrar, el cliente se lleva un papel sí o sí (pedido 2026-08-27):
// la factura si ARCA la autorizó, el recibo no fiscal si no (checkbox apagado,
// ARCA caído o sin configurar). Lo usan Nueva venta y el Mostrador — mismo
// paso, mismo diálogo. La venta ya está registrada y cobrada cuando esto se
// abre: cerrarlo por cualquier vía equivale a Continuar, jamás bloquea ni
// deshace nada.

type Props = {
  /** Venta a mostrar; null = diálogo cerrado */
  ventaId: string | null
  /** Qué documento previsualizar — la ruta se llama igual que el doc */
  doc: "factura" | "recibo"
  onContinuar: () => void
}

export function ComprobanteDialog({ ventaId, doc, onContinuar }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const esFactura = doc === "factura"

  return (
    <Dialog.Root
      open={ventaId !== null}
      onOpenChange={(open) => {
        if (!open) onContinuar()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150" />
        <Dialog.Content className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:max-w-2xl rounded-xl border border-app-line-soft bg-app-card shadow-2xl p-6 space-y-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150">
          <div>
            <Dialog.Title className="font-display text-lg font-semibold text-app-text">
              Venta registrada y cobrada ✓
            </Dialog.Title>
            <Dialog.Description className="text-sm text-app-secondary mt-1">
              {esFactura
                ? "La factura salió autorizada por ARCA, con su CAE. Imprimila y entregásela al cliente."
                : "El cobro entró a la caja. Este es el comprobante de pago para entregarle al cliente — no es una factura; si la necesita, se emite desde la ficha de la venta."}
            </Dialog.Description>
          </div>

          {ventaId && (
            <iframe
              ref={frameRef}
              src={`/${doc}/${ventaId}?embed=1`}
              title="Comprobante"
              className="w-full h-[50vh] rounded-lg border border-app-line-soft bg-white"
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onContinuar}>
              Continuar
            </Button>
            <Button type="button" size="sm" onClick={() => frameRef.current?.contentWindow?.print()}>
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
