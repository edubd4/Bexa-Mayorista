import { formatPesos } from "@/lib/utils"

// Vista de solo lectura de los precios por cantidad (0022) — la ve el
// vendedor para cotizar. El admin los edita en el form del producto.
export type PrecioTramo = {
  id: string
  cantidad_min: number
  precio: number
}

export function PreciosTramoLista({ tramos }: { tramos: PrecioTramo[] }) {
  const ordenados = [...tramos].sort((a, b) => a.cantidad_min - b.cantidad_min)

  // "Hasta" de cada tramo = el "desde" del siguiente - 1 (solo presentación).
  function rangoLabel(t: PrecioTramo, idx: number): string {
    const sig = ordenados[idx + 1]
    if (!sig) return `${t.cantidad_min}+ u.`
    if (sig.cantidad_min - 1 === t.cantidad_min) return `${t.cantidad_min} u.`
    return `${t.cantidad_min}–${sig.cantidad_min - 1} u.`
  }

  return (
    <ul className="space-y-1">
      {ordenados.map((t, idx) => (
        <li
          key={t.id}
          className="flex items-baseline gap-3 py-2 border-b border-app-line-soft last:border-0"
        >
          <span className="font-mono text-sm text-app-accent">{rangoLabel(t, idx)}</span>
          <span className="font-mono text-sm text-app-text">{formatPesos(Number(t.precio))} c/u</span>
        </li>
      ))}
    </ul>
  )
}
