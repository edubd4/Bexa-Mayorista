import Link from "next/link"
import { GraduationCap, HelpCircle, AlertTriangle } from "lucide-react"
import { SECCIONES } from "@/lib/manual/contenido"

// ============================================================================
// Ayuda contextual de pantalla.
//
// El problema que resuelve, con nombre y apellido: un admin entra a "Listas de
// precios" y no entiende para qué sirve la pantalla ni qué se supone que tiene
// que hacer ahí. El manual existe, pero hay que saber que existe, ir a
// buscarlo y encontrar la sección — tres pasos que nadie da en el medio del
// laburo.
//
// Por eso la explicación vive EN la pantalla:
//   - `que`    → qué es esto, en una frase, sin vocabulario de sistema.
//   - `cuando` → cuándo la uso. Es la pregunta real del empleado.
//   - `ojo`    → el error que se comete siempre acá (opcional).
//   - `seccion`→ slug del manual, para el tutorial completo.
//
// Es un <details> nativo: sin JavaScript, sin estado, sin hidratación. Arranca
// ABIERTO a propósito — el que ya sabe lo cierra de un clic y le cuesta nada;
// el que no sabe no tiene que descubrir que había algo para abrir.
// ============================================================================

type Props = {
  /** Qué es esta pantalla, en una frase. Sin jerga. */
  que: string
  /** Cuándo se usa. La pregunta que realmente se hace el empleado. */
  cuando: string
  /** El error clásico de esta pantalla. Opcional. */
  ojo?: string
  /** Slug de la sección del manual con el tutorial completo. Opcional. */
  seccion?: string
}

export function AyudaPantalla({ que, cuando, ojo, seccion }: Props) {
  // Se resuelve el título real del manual en vez de hardcodear el texto del
  // link: si mañana la sección se renombra, esto acompaña solo.
  const destino = seccion ? SECCIONES.find((s) => s.slug === seccion) : undefined

  return (
    <details
      open
      className="group rounded-xl border border-app-line-soft bg-app-card/60 overflow-hidden"
    >
      {/* `list-none` saca el triangulito en la mayoría de los navegadores;
          Safari necesita además el pseudo-elemento -webkit. */}
      <summary
        className="flex items-center gap-2 px-5 py-3 cursor-pointer list-none
                   [&::-webkit-details-marker]:hidden
                   text-app-secondary hover:text-app-text select-none"
      >
        <HelpCircle className="w-4 h-4 text-app-accent shrink-0" />
        <span className="font-display font-semibold text-sm">¿Para qué sirve esta pantalla?</span>
        <span className="ml-auto font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
          <span className="group-open:hidden">Mostrar</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </span>
      </summary>

      <div className="px-5 pb-5 pt-1 space-y-3 border-t border-app-line-soft">
        <p className="text-sm text-app-text">{que}</p>

        <div>
          <p className="font-mono text-[10.5px] text-app-accent uppercase tracking-widest">
            ¿Cuándo la uso?
          </p>
          <p className="text-sm text-app-secondary mt-0.5">{cuando}</p>
        </div>

        {ojo && (
          <div className="flex gap-2 rounded-md border border-app-amber/40 bg-app-amber/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-app-amber shrink-0 mt-0.5" />
            <p className="text-sm text-app-text">{ojo}</p>
          </div>
        )}

        {destino && (
          <Link
            href={`/manual/${destino.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Tutorial completo: {destino.titulo} · {destino.minutos} min →
          </Link>
        )}
      </div>
    </details>
  )
}
