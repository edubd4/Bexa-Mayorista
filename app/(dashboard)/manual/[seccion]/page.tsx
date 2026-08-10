import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ArrowRight, Clock, Info, AlertTriangle, OctagonAlert } from "lucide-react"
import { requireAuthenticated } from "@/lib/auth-guards"
import { type Rol } from "@/lib/constants"
import {
  buscarSeccion,
  seccionesPorRol,
  type Bloque,
  type NivelAviso,
} from "@/lib/manual/contenido"

// Estilo de cada nivel de aviso. Tokens `app-` únicamente (regla de oro #2).
const AVISO: Record<NivelAviso, { icono: typeof Info; clases: string; color: string }> = {
  info: { icono: Info, clases: "border-app-accent/30 bg-app-accent/5", color: "text-app-accent" },
  ojo: { icono: AlertTriangle, clases: "border-app-amber/30 bg-app-amber/5", color: "text-app-amber" },
  cuidado: { icono: OctagonAlert, clases: "border-app-red/30 bg-app-red/5", color: "text-app-red" },
}

export default async function SeccionManualPage({
  params,
}: {
  params: { seccion: string }
}) {
  // El gate de ENTRADA es EXACTAMENTE `requireAuthenticated`: entra cualquier
  // rol activo y los dos motivos de rechazo van al mismo destino. El filtro por
  // rol de la sección es autorización posterior, no el gate. El guard loguea el
  // error de lectura del perfil en vez de descartarlo.
  const guard = await requireAuthenticated()
  if (!guard.ok) redirect("/login")

  const rol = guard.rol as Rol
  const seccion = buscarSeccion(params.seccion)
  if (!seccion) notFound()

  // Una sección restringida no se muestra a quien no la puede ejecutar: el
  // manual respeta la misma matriz de permisos que el resto del sistema.
  if (seccion.roles && !seccion.roles.includes(rol)) redirect("/manual")

  const visibles = seccionesPorRol(rol)
  const idx = visibles.findIndex((s) => s.slug === seccion.slug)
  const anterior = idx > 0 ? visibles[idx - 1] : null
  const siguiente = idx >= 0 && idx < visibles.length - 1 ? visibles[idx + 1] : null

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <article className="max-w-3xl mx-auto space-y-6">
        <header>
          <Link
            href="/manual"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-app-muted hover:text-app-accent transition-colors uppercase tracking-widest"
          >
            <ArrowLeft className="w-3 h-3" />
            Manual
          </Link>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase mt-3">
            {seccion.categoria}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {seccion.titulo}
          </h1>
          <p className="text-app-secondary mt-1.5">{seccion.resumen}</p>
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-app-muted mt-3">
            <Clock className="w-3 h-3" />
            {seccion.minutos} min de lectura
          </p>
        </header>

        <div className="space-y-6">
          {seccion.bloques.map((bloque, i) => (
            <BloqueView key={i} bloque={bloque} />
          ))}
        </div>

        <nav className="flex items-stretch gap-3 pt-4 border-t border-app-line-soft">
          {anterior ? (
            <Link
              href={`/manual/${anterior.slug}`}
              className="flex-1 rounded-xl border border-app-line-soft bg-app-card p-4 hover:border-app-accent/50 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                <ArrowLeft className="w-3 h-3" />
                Anterior
              </span>
              <span className="block font-display font-semibold mt-1">{anterior.titulo}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {siguiente ? (
            <Link
              href={`/manual/${siguiente.slug}`}
              className="flex-1 rounded-xl border border-app-line-soft bg-app-card p-4 hover:border-app-accent/50 transition-colors text-right"
            >
              <span className="flex items-center justify-end gap-1.5 font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                Siguiente
                <ArrowRight className="w-3 h-3" />
              </span>
              <span className="block font-display font-semibold mt-1">{siguiente.titulo}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </nav>
      </article>
    </div>
  )
}

function BloqueView({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case "texto":
      return (
        <div className="space-y-3">
          {bloque.parrafos.map((p, i) => (
            <p key={i} className="text-app-secondary leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )

    case "pasos":
      return (
        <section className="rounded-xl border border-app-line-soft bg-app-card overflow-hidden">
          <div className="px-5 py-3 border-b border-app-line-soft">
            <h2 className="font-display font-semibold">{bloque.titulo}</h2>
          </div>
          <ol className="divide-y divide-app-line-soft">
            {bloque.pasos.map((paso, i) => (
              <li key={i} className="px-5 py-4 flex gap-4">
                <span className="font-mono text-[11px] text-app-accent shrink-0 mt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium">{paso.titulo}</h3>
                  <p className="text-sm text-app-secondary mt-1 leading-relaxed">
                    {paso.detalle}
                  </p>
                  {paso.ruta && (
                    <Link
                      href={paso.ruta}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-app-accent hover:underline mt-2"
                    >
                      Ir a {paso.ruta}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )

    case "lista":
      return (
        <section className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <h2 className="font-display font-semibold mb-3">{bloque.titulo}</h2>
          <ul className="space-y-2">
            {bloque.items.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-app-secondary leading-relaxed">
                <span className="text-app-accent shrink-0 mt-1.5 w-1 h-1 rounded-full bg-app-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )

    case "aviso": {
      const { icono: Icono, clases, color } = AVISO[bloque.nivel]
      return (
        <aside className={`rounded-xl border p-5 ${clases}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <Icono className={`w-4 h-4 shrink-0 ${color}`} />
            <h2 className="font-display font-semibold">{bloque.titulo}</h2>
          </div>
          <p className="text-sm text-app-secondary leading-relaxed">{bloque.texto}</p>
        </aside>
      )
    }

    case "faq":
      return (
        <div className="space-y-2">
          {bloque.items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border border-app-line-soft bg-app-card overflow-hidden"
            >
              <summary className="px-5 py-4 cursor-pointer font-medium list-none flex items-start gap-3 hover:text-app-accent transition-colors">
                <span className="font-mono text-[11px] text-app-muted shrink-0 mt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item.pregunta}</span>
              </summary>
              <p className="px-5 pb-4 pl-[3.4rem] text-sm text-app-secondary leading-relaxed">
                {item.respuesta}
              </p>
            </details>
          ))}
        </div>
      )
  }
}
