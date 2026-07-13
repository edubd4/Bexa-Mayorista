import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { APP } from "@/lib/dominio"
import { LoginForm } from "./LoginForm"

export default async function LoginPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si ya está logueado, no tiene sentido mostrar el form
  if (user) {
    redirect("/panel")
  }

  return (
    <main className="app-circuit min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-app-grad flex items-center justify-center font-display font-bold text-app-bg text-xl">
            {APP.nombre.charAt(0)}
          </div>
          <div>
            <p className="font-display font-bold text-lg tracking-wider">{APP.nombre}</p>
            <p className="font-mono text-[10px] text-app-muted tracking-[0.16em] uppercase">
              {APP.tagline}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Acceso solo para personal autorizado</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-app-muted font-mono">
          ¿Olvidaste tu contraseña? Contactá al admin.
        </p>
      </div>
    </main>
  )
}
