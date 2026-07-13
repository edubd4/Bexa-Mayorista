"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { updateUsuario, resetPasswordUsuario } from "@/app/(dashboard)/usuarios/actions"
import type { UsuarioUpdateInput } from "@/lib/validators/usuario"

type Props = {
  usuarioId: string
  isSelf: boolean
  initial: UsuarioUpdateInput
}

export function UsuarioEditForm({ usuarioId, isSelf, initial }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<UsuarioUpdateInput>(initial)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwOk, setPwOk] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isPwPending, startPwTransition] = useTransition()

  function update<K extends keyof UsuarioUpdateInput>(key: K, value: UsuarioUpdateInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setOk(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(false)
    startTransition(async () => {
      const result = await updateUsuario(usuarioId, form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOk(true)
      router.refresh()
    })
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwOk(false)
    startPwTransition(async () => {
      const result = await resetPasswordUsuario(usuarioId, { password: newPassword })
      if (!result.ok) {
        setPwError(result.error)
        return
      }
      setPwOk(true)
      setNewPassword("")
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
          <h2 className="font-display text-lg font-semibold">Datos del usuario</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                required
                value={form.nombre}
                onChange={(e) => update("nombre", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rol">Rol</Label>
              <Select
                id="rol"
                value={form.rol}
                onChange={(e) => update("rol", e.target.value as UsuarioUpdateInput["rol"])}
                disabled={isSelf}
              >
                <option value="colaborador">Colaborador</option>
                <option value="admin">Admin</option>
              </Select>
              {isSelf && (
                <p className="text-[11px] text-app-muted">
                  No podés cambiarte a vos mismo el rol.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="activo">Estado</Label>
              <Select
                id="activo"
                value={form.activo ? "true" : "false"}
                onChange={(e) => update("activo", e.target.value === "true")}
                disabled={isSelf}
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </Select>
              {isSelf && (
                <p className="text-[11px] text-app-muted">
                  No podés desactivarte a vos mismo.
                </p>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
            {error}
          </div>
        )}
        {ok && (
          <div className="rounded-md border border-app-green/40 bg-app-green/10 px-4 py-3 text-sm text-app-green">
            Cambios guardados.
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>

      <form onSubmit={handlePasswordReset} className="space-y-4">
        <section className="rounded-xl border border-app-line-soft bg-app-card p-6 space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Cambiar contraseña</h2>
            <p className="text-sm text-app-muted mt-1">
              Setea una contraseña nueva y comunicásela al usuario.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              type="text"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {pwError && (
            <div role="alert" className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-2 text-sm text-app-red">
              {pwError}
            </div>
          )}
          {pwOk && (
            <div className="rounded-md border border-app-green/40 bg-app-green/10 px-4 py-2 text-sm text-app-green">
              Contraseña actualizada.
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={isPwPending || newPassword.length < 8}
            >
              {isPwPending ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </div>
        </section>
      </form>
    </div>
  )
}
