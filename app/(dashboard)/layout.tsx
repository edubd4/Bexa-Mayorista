import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { DashboardShell } from "@/components/nav/DashboardShell"
import { CommandPalette } from "@/components/nav/CommandPalette"
import { ToastProvider } from "@/components/ui/toast"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"
import { NAV, filterNavByRol } from "@/lib/nav"
import { type Rol } from "@/lib/constants"
import { ROL_LABEL } from "@/lib/dominio"

// El módulo opcional ia-chat agrega acá su <ChatDrawer /> al cosecharse.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user.id)
    .single()

  const userDisplay = profile?.nombre ?? user.email ?? "usuario"
  const userRol = profile?.rol ? ROL_LABEL[profile.rol] ?? profile.rol : "sin rol"
  const navGroups = filterNavByRol(NAV, profile?.rol as Rol | undefined)

  return (
    <ToastProvider>
      <ConfirmProvider>
        <DashboardShell navGroups={navGroups} userDisplay={userDisplay} userRol={userRol}>
          {children}
        </DashboardShell>
        <CommandPalette />
      </ConfirmProvider>
    </ToastProvider>
  )
}
