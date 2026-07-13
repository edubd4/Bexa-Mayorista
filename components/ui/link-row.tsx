"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Fila de tabla clickeable con navegación completa a href.
// Los controles interactivos que estén dentro deben llamar stopPropagation
// para no gatillar la navegación.
type Props = {
  href: string
  children: React.ReactNode
  className?: string
}

export function LinkRow({ href, children, className }: Props) {
  const router = useRouter()
  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-app-surface-mid/30 transition-colors",
        className,
      )}
      onClick={() => router.push(href)}
    >
      {children}
    </TableRow>
  )
}
