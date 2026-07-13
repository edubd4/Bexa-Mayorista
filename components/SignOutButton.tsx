"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    startTransition(() => {
      router.refresh()
      router.replace("/login")
    })
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isPending}>
      {isPending ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  )
}
