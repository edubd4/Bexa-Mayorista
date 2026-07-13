import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { UsuarioEditForm } from "@/components/usuarios/UsuarioEditForm"
import { DeleteUsuarioButton } from "@/components/usuarios/DeleteUsuarioButton"
import { ROL } from "@/lib/constants"
import { formatFechaHora } from "@/lib/utils"

type Profile = {
  id: string
  email: string
  nombre: string
  rol: "admin" | "colaborador"
  activo: boolean
  created_at: string
  updated_at: string
}

export default async function UsuarioDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user!.id)
    .single()

  if (myProfile?.rol !== ROL.ADMIN || !myProfile.activo) {
    redirect("/panel")
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id, email, nombre, rol, activo, created_at, updated_at")
    .eq("id", params.id)
    .maybeSingle()

  if (!target) notFound()
  const t = target as Profile
  const isSelf = t.id === user!.id

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/usuarios"
          className="inline-flex items-center gap-2 text-sm text-app-muted hover:text-app-text w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a usuarios
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={t.rol === "admin" ? "accent" : "violet"}>
              {t.rol.toUpperCase()}
            </Badge>
            <Badge variant={t.activo ? "green" : "gray"}>
              {t.activo ? "ACTIVO" : "INACTIVO"}
            </Badge>
            {isSelf && (
              <Badge variant="amber">TU CUENTA</Badge>
            )}
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">
            {t.nombre}
          </h1>
          <p className="font-mono text-sm text-app-muted">{t.email}</p>
        </header>

        <UsuarioEditForm
          usuarioId={t.id}
          isSelf={isSelf}
          initial={{
            nombre: t.nombre,
            rol: t.rol,
            activo: t.activo,
          }}
        />

        <p className="text-xs font-mono text-app-muted">
          Creado {formatFechaHora(t.created_at)} · Actualizado {formatFechaHora(t.updated_at)}
        </p>

        <section className="pt-6 border-t border-app-line-soft space-y-3">
          <h2 className="font-display text-xl font-semibold text-app-red">
            Zona de peligro
          </h2>
          <p className="text-sm text-app-secondary max-w-lg">
            Borrar el usuario elimina su acceso al sistema. El historial de acciones que
            realizó queda preservado para auditoría.
          </p>
          <DeleteUsuarioButton
            usuarioId={t.id}
            usuarioEmail={t.email}
            disabled={isSelf}
            disabledReason={isSelf ? "No podés eliminarte a vos mismo." : undefined}
          />
        </section>
      </div>
    </div>
  )
}
