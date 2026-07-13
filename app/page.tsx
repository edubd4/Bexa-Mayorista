import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { APP } from "@/lib/dominio"

export default async function Home() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si ya está autenticado, mandamos derecho al panel
  if (user) {
    redirect("/panel")
  }

  return (
    <main className="app-circuit min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-8">
        <div className="inline-flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-app-grad flex items-center justify-center font-display font-bold text-app-bg text-xl">
            {APP.nombre.charAt(0)}
          </div>
          <div className="text-left">
            <p className="font-display font-bold text-xl tracking-wider">{APP.nombre}</p>
            <p className="font-mono text-[10.5px] text-app-muted tracking-[0.16em] uppercase">
              {APP.tagline}
            </p>
          </div>
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
          Toda tu operación,{" "}
          <span className="bg-app-grad bg-clip-text text-transparent">
            en un solo lugar.
          </span>
        </h1>

        <p className="text-app-secondary">
          Iniciá sesión para acceder al panel.
        </p>

        <Link
          href="/login"
          className="inline-block px-6 py-3 rounded-lg bg-app-grad text-app-bg font-display font-semibold hover:opacity-90 transition"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  )
}
