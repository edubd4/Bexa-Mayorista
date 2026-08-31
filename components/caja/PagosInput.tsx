"use client"

import { X } from "lucide-react"
import { MoneyInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { METODO_PAGO, type MetodoPago, type PagoVenta } from "@/lib/validators/caja"
import { METODO_PAGO_LABEL } from "@/lib/caja-ui"
import { formatPesos } from "@/lib/utils"

// ============================================================================
// PagosInput — el desglose de un cobro (0043).
//
// El caso normal es UNA fila (método + monto), idéntico al viejo par de
// inputs. "Agregar método" abre el pago mixto: "$5.000 efectivo + $5.000
// transferencia" son dos filas, y cada fila termina siendo un movimiento de
// caja con su método — el arqueo por método no se entera de nada raro.
//
// El componente NO valida contra el saldo: eso es del caller, vía
// validarPagos() — la ficha permite cobro parcial (suma ≤ saldo), mientras
// que Cobrar ahora y el Mostrador exigen suma EXACTA al total (exacto=true).
// ============================================================================

export type PagoDraft = { metodo: MetodoPago; monto: number | null }

const redondear = (n: number) => Math.round(n * 100) / 100

export function sumaPagos(pagos: PagoDraft[]): number {
  return redondear(pagos.reduce((acc, p) => acc + (p.monto ?? 0), 0))
}

export function validarPagos(pagos: PagoDraft[], objetivo: number, exacto: boolean): string | null {
  if (pagos.some((p) => p.monto === null || p.monto <= 0)) {
    return "Cada pago necesita un monto mayor a 0"
  }
  const suma = sumaPagos(pagos)
  if (suma > objetivo) {
    return `Los pagos suman ${formatPesos(suma)} y superan ${exacto ? "el total a cobrar" : "el saldo pendiente"} (${formatPesos(objetivo)})`
  }
  if (exacto && suma < objetivo) {
    return `Falta asignar ${formatPesos(redondear(objetivo - suma))} para llegar al total`
  }
  return null
}

// Convierte el desglose validado en los pagos que van al server, cobrando el
// TOTAL QUE GUARDÓ la RPC y no la suma del client: los floats de JS driftean
// centavos contra el numeric de Postgres (review 2026-08-19 #3) y ese delta
// se absorbe en el último pago. Un delta grande NO se toca: significa que un
// precio cambió entre pantalla y registro, y eso se avisa aparte.
export function pagosParaCobrar(pagos: PagoDraft[], totalReal: number): PagoVenta[] {
  const lista = pagos.map((p) => ({ metodo: p.metodo, monto: p.monto ?? 0 }))
  const delta = redondear(totalReal - sumaPagos(pagos))
  if (delta !== 0 && Math.abs(delta) < 1 && lista.length > 0) {
    const ultimo = lista[lista.length - 1]
    ultimo.monto = redondear(ultimo.monto + delta)
  }
  return lista
}

type Props = {
  pagos: PagoDraft[]
  onChange: (pagos: PagoDraft[]) => void
  objetivo: number          // saldo pendiente (ficha) o total a cobrar (POS / Cobrar ahora)
  exacto?: boolean          // true: la suma debe igualar el objetivo
  idPrefix: string
  disabled?: boolean
}

export function PagosInput({ pagos, onChange, objetivo, exacto = false, idPrefix, disabled }: Props) {
  const restante = redondear(objetivo - sumaPagos(pagos))
  const mixto = pagos.length > 1

  function setPago(i: number, patch: Partial<PagoDraft>) {
    onChange(pagos.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  function agregar() {
    // El método nuevo arranca en el primero que no esté usado, con el
    // restante precargado: el caso típico ("mitad y mitad") sale en 2 toques.
    const usados = new Set(pagos.map((p) => p.metodo))
    const libre = (Object.keys(METODO_PAGO) as MetodoPago[]).find((m) => !usados.has(m))
      ?? METODO_PAGO.EFECTIVO
    onChange([...pagos, { metodo: libre, monto: restante > 0 ? restante : null }])
  }

  function quitar(i: number) {
    onChange(pagos.filter((_, j) => j !== i))
  }

  return (
    <div className="space-y-2">
      {pagos.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
          <Select
            id={`${idPrefix}-metodo-${i}`}
            aria-label={`Método del pago ${i + 1}`}
            value={p.metodo}
            disabled={disabled}
            onChange={(e) => setPago(i, { metodo: e.target.value as MetodoPago })}
          >
            {(Object.keys(METODO_PAGO) as MetodoPago[]).map((m) => (
              <option key={m} value={m}>{METODO_PAGO_LABEL[m]}</option>
            ))}
          </Select>
          <MoneyInput
            id={`${idPrefix}-monto-${i}`}
            aria-label={`Monto del pago ${i + 1}`}
            decimals={2}
            value={p.monto}
            onChange={(monto) => setPago(i, { monto })}
            max={objetivo}
            disabled={disabled}
          />
          {mixto ? (
            <button
              type="button"
              onClick={() => quitar(i)}
              disabled={disabled}
              aria-label={`Quitar el pago ${i + 1}`}
              className="h-8 w-8 grid place-items-center rounded-md text-app-muted hover:text-app-red hover:bg-app-red/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span aria-hidden className="w-8" />
          )}
        </div>
      ))}

      <div className="flex items-center justify-between text-xs font-mono">
        {pagos.length < 7 ? (
          <button
            type="button"
            onClick={agregar}
            disabled={disabled}
            className="text-app-muted hover:text-app-accent transition-colors"
          >
            ＋ Agregar método (pago mixto)
          </button>
        ) : (
          <span />
        )}
        {/* En modo exacto el restante se muestra siempre: la suma TIENE que
            llegar al total y este chip es el semáforo. */}
        {(exacto || mixto) && (
          <span className={restante === 0 ? "text-app-green" : "text-app-amber"}>
            {restante === 0
              ? `✓ ${formatPesos(objetivo)} asignados`
              : `Restante: ${formatPesos(restante)}`}
          </span>
        )}
      </div>
    </div>
  )
}
