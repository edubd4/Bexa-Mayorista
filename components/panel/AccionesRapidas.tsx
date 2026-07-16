import Link from "next/link"
import {
  ClipboardList, Receipt, Users, Landmark, Package, Megaphone, Wallet, ArrowRight,
} from "lucide-react"
import type { Rol } from "@/lib/constants"
import { ROL } from "@/lib/constants"

// ============================================================================
// AccionesRapidas — franja de atajos en el /panel. Los items se filtran por rol
// para no tentar a un usuario con acciones que va a rebotar (guards de página).
//
// Convención: solo acciones de CARGA rápida (crear X). Búsquedas cross-módulo
// van al CommandPalette (Ctrl+K) del shell — no acá.
// ============================================================================

type Accion = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: Rol[]
  tono: "accent" | "green" | "amber" | "violet"
}

const ACCIONES: Accion[] = [
  { label: "Nueva venta",     href: "/ventas/nuevo",      icon: ClipboardList, tono: "green",  roles: [ROL.ADMIN, ROL.COLABORADOR] },
  { label: "Cobrar venta",    href: "/ventas?cobro=PENDIENTE", icon: Wallet,   tono: "green",  roles: [ROL.ADMIN, ROL.COLABORADOR] },
  { label: "Nueva compra",    href: "/compras/nuevo",     icon: Receipt,       tono: "amber",  roles: [ROL.ADMIN] },
  { label: "Nuevo gasto",     href: "/gastos/nuevo",      icon: Wallet,        tono: "amber",  roles: [ROL.ADMIN] },
  { label: "Nuevo cliente",   href: "/clientes/nuevo",    icon: Users,         tono: "accent", roles: [ROL.ADMIN] },
  { label: "Nuevo proveedor", href: "/proveedores/nuevo", icon: Landmark,      tono: "accent", roles: [ROL.ADMIN] },
  { label: "Nuevo producto",  href: "/productos/nuevo",   icon: Package,       tono: "accent", roles: [ROL.ADMIN] },
  { label: "Nueva campaña",   href: "/campanas/nueva",    icon: Megaphone,     tono: "violet", roles: [ROL.ADMIN, ROL.COLABORADOR, ROL.MARKETING] },
]

const TONO: Record<Accion["tono"], string> = {
  accent: "text-app-accent border-app-accent/30 hover:bg-app-accent/10 hover:border-app-accent/60",
  green:  "text-app-green  border-app-green/30  hover:bg-app-green/10  hover:border-app-green/60",
  amber:  "text-app-amber  border-app-amber/30  hover:bg-app-amber/10  hover:border-app-amber/60",
  violet: "text-app-violet border-app-violet/30 hover:bg-app-violet/10 hover:border-app-violet/60",
}

export function AccionesRapidas({ rol }: { rol: Rol }) {
  const items = ACCIONES.filter((a) => a.roles.includes(rol))
  if (items.length === 0) return null

  return (
    <section aria-label="Acciones rápidas">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
          Acciones rápidas
        </p>
        <p className="hidden md:block font-mono text-[10.5px] text-app-muted">
          <kbd className="px-1.5 py-0.5 rounded border border-app-line-soft text-[10px]">Ctrl</kbd>
          {" "}+{" "}
          <kbd className="px-1.5 py-0.5 rounded border border-app-line-soft text-[10px]">K</kbd>
          {" "}para buscar
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(({ label, href, icon: Icon, tono }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-center justify-between gap-3 rounded-xl border bg-app-card px-4 py-3 transition-colors ${TONO[tono]}`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-display font-semibold text-sm text-app-text truncate">
                {label}
              </span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </Link>
        ))}
      </div>
    </section>
  )
}
