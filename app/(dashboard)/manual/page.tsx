import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Clock, GraduationCap } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { type Rol } from "@/lib/constants"
import { APP, ROL_LABEL } from "@/lib/dominio"
import {
  CATEGORIAS,
  CATEGORIA_DESCRIPCION,
  seccionesPorRol,
  type CategoriaManual,
} from "@/lib/manual/contenido"

// El manual vive adentro del sistema: el empleado lo consulta sin salir de la
// pantalla donde está trabajando. Cada rol ve solo lo que puede ejecutar.
export default async function ManualPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo, nombre")
    .eq("id", user.id)
    .single()
  if (!profile?.activo) redirect("/login")

  const rol = profile.rol as Rol
  const secciones = seccionesPorRol(rol)
  const minutosTotales = secciones.reduce((s, x) => s + x.minutos, 0)

  const porCategoria = CATEGORIAS.map((cat: CategoriaManual) => ({
    cat,
    items: secciones.filter((s) => s.categoria === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
            Sistema · Manual de usuario
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            Cómo se trabaja en {APP.nombre}
          </h1>
          <p className="text-app-secondary mt-2 max-w-2xl">
            Todo lo que necesitás para operar el sistema, ordenado por tema y filtrado
            para tu rol de{" "}
            <span className="text-app-accent font-medium">
              {ROL_LABEL[rol] ?? rol}
            </span>
            . {secciones.length} secciones · {minutosTotales} minutos de lectura en total.
          </p>
        </header>

        {/* Recorrido sugerido para el que recién entra */}
        <section className="rounded-xl border border-app-accent/30 bg-app-accent/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-4 h-4 text-app-accent" />
            <h2 className="font-display font-semibold">¿Primer día?</h2>
          </div>
          <p className="text-sm text-app-secondary">
            Leé estas tres en orden y ya podés trabajar. El resto lo consultás cuando
            aparezca la duda.
          </p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {["primeros-pasos", "iniciar-el-dia", "metodologia"].map((slug, i) => {
              const s = secciones.find((x) => x.slug === slug)
              if (!s) return null
              return (
                <li key={slug} className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-app-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={`/manual/${s.slug}`}
                    className="text-app-accent hover:underline font-medium"
                  >
                    {s.titulo}
                  </Link>
                  <span className="text-app-muted text-xs">· {s.minutos} min</span>
                </li>
              )
            })}
          </ol>
        </section>

        {porCategoria.map(({ cat, items }) => (
          <section key={cat} className="space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold">{cat}</h2>
              <p className="text-sm text-app-muted">{CATEGORIA_DESCRIPCION[cat]}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((s) => (
                <Link
                  key={s.slug}
                  href={`/manual/${s.slug}`}
                  className="group rounded-xl border border-app-line-soft bg-app-card p-4 hover:border-app-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display font-semibold group-hover:text-app-accent transition-colors">
                      {s.titulo}
                    </h3>
                    <span className="flex items-center gap-1 font-mono text-[10.5px] text-app-muted shrink-0 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {s.minutos} min
                    </span>
                  </div>
                  <p className="text-sm text-app-secondary mt-1.5">{s.resumen}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <footer className="rounded-xl border border-app-line-soft bg-app-card p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <BookOpen className="w-4 h-4 text-app-muted" />
            <h2 className="font-display font-semibold">¿Falta algo acá?</h2>
          </div>
          <p className="text-sm text-app-secondary">
            Si una pregunta se repite y no está documentada, avisá — el manual se
            actualiza con el sistema. Es la única fuente de verdad sobre cómo se
            trabaja: si acá dice una cosa y alguien te dice otra, mandá a leer esto.
          </p>
        </footer>
      </div>
    </div>
  )
}
