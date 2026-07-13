// Mapa de string key → componente Lucide. Se usa en el sidebar (client component)
// para resolver los iconos que vienen serializados desde el nav config.
// IMPORTANTE: los iconos NO se pueden pasar como prop desde un server component
// a un client component — hay que pasar la key y resolver acá.

import {
  LayoutDashboard,
  ClipboardList,
  Users,
  CalendarDays,
  FileText,
  BookOpen,
  Package,
  Wallet,
  Receipt,
  Landmark,
  Calculator,
  BarChart3,
  UserCog,
  Settings,
  AlertTriangle,
  ScrollText,
  type LucideIcon,
} from "lucide-react"
import type { IconKey } from "@/lib/nav"

export const ICONS: Record<IconKey, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  Users,
  CalendarDays,
  FileText,
  BookOpen,
  Package,
  Wallet,
  Receipt,
  Landmark,
  Calculator,
  BarChart3,
  UserCog,
  Settings,
  AlertTriangle,
  ScrollText,
}
