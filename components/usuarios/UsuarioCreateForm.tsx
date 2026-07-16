"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createUsuario } from "@/app/(dashboard)/usuarios/actions"
import type { UsuarioCreateInput } from "@/lib/validators/usuario"

const DEFAULTS: UsuarioCreateInput = {
  email: "",
  password: "",
  nombre: "",
  rol: "colaborador",
}

export function UsuarioCreateForm() {
  const [form, setForm] = useState<UsuarioCreateInput>(DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof UsuarioCreateInput>(key: K, value: UsuarioCreateInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createUsuario(form)
      if (result && !result.ok) setError(result.error)
      // create hace redirect si sale bien
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold">Nuevo usuario</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              required
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rol">Rol</Label>
            <Select
              id="rol"
              value={form.rol}
              onChange={(e) => update("rol", e.target.value as UsuarioCreateInput["rol"])}
            >
              <option value="colaborador">Vendedor</option>
              <option value="marketing">Marketing</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="usuario@dominio.com"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="password">Contraseña temporal *</Label>
            <Input
              id="password"
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            <p className="text-[11px] text-app-muted">
              Pasásela al usuario en persona o por WhatsApp. Va a poder cambiarla luego.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href="/usuarios">Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Creando…" : "Crear usuario"}
        </Button>
      </div>
    </form>
  )
}
