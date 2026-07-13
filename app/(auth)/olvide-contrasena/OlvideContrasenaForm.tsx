"use client"

import { useState, useTransition } from "react"
import { CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function OlvideContrasenaForm() {
  const [email, setEmail] = useState("")
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const supabase = createClient()
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo },
      )

      if (resetErr) {
        setError(resetErr.message)
        return
      }
      setEnviado(true)
    })
  }

  if (enviado) {
    return (
      <div className="rounded-xl border border-app-green/40 bg-app-green/10 p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-app-green mx-auto" />
        <p className="font-display font-semibold text-app-text">Revisá tu correo</p>
        <p className="text-sm text-app-secondary">
          Si el email <span className="font-mono text-app-text">{email}</span> está registrado, te llegó un mensaje con el link para reiniciar tu contraseña.
        </p>
        <p className="text-[11px] text-app-muted">
          Puede tardar un par de minutos. Revisá también la carpeta de spam.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
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
        {isPending ? "Enviando…" : "Enviar link de reinicio"}
      </Button>
    </form>
  )
}
