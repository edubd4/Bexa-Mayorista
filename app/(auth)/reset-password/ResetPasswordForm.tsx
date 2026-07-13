"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [sesionLista, setSesionLista] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Supabase Auth pone el token en el hash de la URL al llegar del email.
  // El SDK auto-detecta la sesión de recovery y la pone en el cliente.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSesionLista(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSesionLista(true)
      }
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.")
      return
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.")
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) {
        setError(updErr.message)
        return
      }
      setOk(true)
      // Redirect al panel después de un breve delay para que el user vea el mensaje
      setTimeout(() => {
        router.refresh()
        router.replace("/panel")
      }, 1500)
    })
  }

  if (ok) {
    return (
      <div className="rounded-xl border border-app-green/40 bg-app-green/10 p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-app-green mx-auto" />
        <p className="font-display font-semibold text-app-text">Contraseña actualizada</p>
        <p className="text-sm text-app-secondary">
          Ya podés usar tu nueva contraseña. Te llevamos al panel…
        </p>
      </div>
    )
  }

  if (!sesionLista) {
    return (
      <div className="rounded-xl border border-app-amber/40 bg-app-amber/10 p-6 text-center space-y-3">
        <p className="font-display font-semibold text-app-text">Link inválido o expirado</p>
        <p className="text-sm text-app-secondary">
          Este link no es válido. Pedí uno nuevo desde{" "}
          <a href="/olvide-contrasena" className="text-app-accent hover:underline underline-offset-4">
            olvidé mi contraseña
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Al menos 6 caracteres"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmar">Confirmar contraseña</Label>
        <Input
          id="confirmar"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          disabled={isPending}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-app-red/40 bg-app-red/10 px-3 py-2 text-sm text-app-red"
        >
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  )
}
