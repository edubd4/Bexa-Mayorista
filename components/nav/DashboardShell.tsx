"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, GraduationCap } from "lucide-react"
import { Sidebar, SidebarMobileClose } from "./Sidebar"
import { SignOutButton } from "@/components/SignOutButton"
import { cn } from "@/lib/utils"
import type { NavGroup } from "@/lib/nav"

type Props = {
  navGroups: NavGroup[]
  userDisplay: string
  userRol: string
  children: React.ReactNode
}

export function DashboardShell({ navGroups, userDisplay, userRol, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-app-bg text-app-text">
      {/* Sidebar fijo en desktop */}
      <div className="hidden lg:block sticky top-0 h-screen shrink-0">
        <Sidebar groups={navGroups} />
      </div>

      {/* Sidebar drawer en mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="relative h-full w-64 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar groups={navGroups} onNavigate={() => setMobileOpen(false)} />
            <SidebarMobileClose onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className={cn(
            "border-b border-app-line-soft bg-app-surface-low/70 backdrop-blur",
            "sticky top-0 z-20"
          )}
        >
          <div className="flex items-center justify-between px-4 md:px-8 h-16">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-app-secondary hover:text-app-text hover:bg-app-surface-mid"
              aria-label="Abrir navegación"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden lg:block" />

            <div className="flex items-center gap-3">
              {/* Manual arriba a la derecha, permanente y en todas las
                  pantallas. El item del sidebar sigue estando, pero acá lo ve
                  el que está perdido AHORA: no hay que saber dónde buscarlo. */}
              <Link
                href="/manual"
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-md",
                  "border border-app-line-soft text-app-secondary",
                  "hover:text-app-accent hover:border-app-accent/40 hover:bg-app-surface-mid/50",
                  "transition-colors",
                )}
                title="Manual de uso: tutoriales paso a paso y preguntas frecuentes"
              >
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline text-sm">Manual</span>
              </Link>

              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-tight">{userDisplay}</p>
                <p className="font-mono text-[10px] text-app-muted uppercase tracking-wider">
                  {userRol}
                </p>
              </div>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}
