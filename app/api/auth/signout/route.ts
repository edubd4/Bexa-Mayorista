import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createServerClient()
  await supabase.auth.signOut()

  const url = new URL("/login", request.url)
  return NextResponse.redirect(url, { status: 303 })
}
