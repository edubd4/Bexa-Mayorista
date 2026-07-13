import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ============================================================================
// Middleware de auth (edge runtime).
//
// Gotcha pagado (BEXA 2026-07-13, docs/GOTCHAS.md): si algo dentro tira
// excepción (JWT roto en cookie, red intermitente al Supabase, breaking change
// del SDK, env var faltante en runtime, etc.), Vercel devuelve
// MIDDLEWARE_INVOCATION_FAILED en TODA la app — el sitio queda inservible.
// La lógica de auth SIEMPRE va en try/catch: si falla, tratamos como "sin
// sesión" y dejamos que las páginas server-side manejen la redirección.
// ============================================================================

// Public path check factorizado — se usa en el happy-path y en el catch.
function isPublic(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/olvide-contrasena') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas webhook: autenticación por API key propia, no por sesión.
  if (pathname.startsWith('/api/webhook/')) {
    return NextResponse.next()
  }

  // Env vars: si faltan, no podemos crear el cliente — no crashear.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Env vars de Supabase faltantes en runtime')
    // Sin auth posible: dejamos pasar rutas públicas, redirigimos el resto a /login.
    if (isPublic(pathname)) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isPublic(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Si ya está autenticado y va a /login, redirigir al dashboard.
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/panel'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (err) {
    // ★ NUNCA propagar la excepción: causa MIDDLEWARE_INVOCATION_FAILED en toda la app.
    console.error('[middleware] error al validar sesión, tratando como sin usuario:', err)
    if (isPublic(pathname)) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
