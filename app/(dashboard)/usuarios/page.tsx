import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { AyudaPantalla } from "@/components/ui/ayuda-pantalla"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from "@/components/ui/table"
import { LinkRow } from "@/components/ui/link-row"
import { ROL } from "@/lib/constants"

type Profile = {
  id: string
  email: string
  nombre: string
  rol: "admin" | "colaborador" | "marketing"
  activo: boolean
  created_at: string
}

export default async function UsuariosPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user!.id)
    .single()

  // Guard fuerte: usuarios es admin-only.
  if (myProfile?.rol !== ROL.ADMIN || !myProfile.activo) {
    redirect("/panel")
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, nombre, rol, activo, created_at")
    .order("activo", { ascending: false })
    .order("rol", { ascending: true })
    .order("nombre", { ascending: true })

  const rows = (profiles ?? []) as Profile[]

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              Módulo · Usuarios
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              Usuarios y técnicos
            </h1>
            <p className="text-app-secondary mt-1">
              Alta y gestión de accesos al sistema.
            </p>
          </div>

          <Button asChild>
            <Link href="/usuarios/nuevo">
              <Plus className="w-4 h-4" />
              Nuevo usuario
            </Link>
          </Button>
        </header>

        <AyudaPantalla
          que="Las personas que entran al sistema, con su rol y su porcentaje de comisión."
          cuando="Cuando entra alguien nuevo al equipo, cuando alguien se va (se desactiva, no se borra) o cuando cambia un porcentaje de comisión."
          ojo="Nunca compartas una cuenta entre dos personas. Si dos empleados usan el mismo usuario, las ventas, las comisiones y el historial dejan de significar algo."
          seccion="usuarios"
        />

        {error ? (
          <div className="rounded-md border border-app-red/40 bg-app-red/10 px-4 py-3 text-sm text-app-red">
            Error al cargar usuarios: {error.message}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[120px]">Rol</TableHead>
                <TableHead className="w-[110px]">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={4}>
                  Aún no hay usuarios cargados.
                </TableEmpty>
              ) : (
                rows.map((u) => (
                  <LinkRow key={u.id} href={`/usuarios/${u.id}`}>
                    <TableCell className="text-app-text font-medium">
                      {u.nombre}
                      {u.id === user!.id && (
                        <span className="ml-2 font-mono text-[10px] text-app-accent uppercase tracking-widest">
                          (vos)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-app-muted">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.rol === "admin" ? "accent" : "violet"}>
                        {u.rol.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.activo ? "green" : "gray"}>
                        {u.activo ? "ACTIVO" : "INACTIVO"}
                      </Badge>
                    </TableCell>
                  </LinkRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
