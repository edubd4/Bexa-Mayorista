import type { createServerClient } from "@/lib/supabase/server"
import type { IconKey } from "@/lib/nav"
import { DOMINIO } from "@/lib/dominio"
import { SECCIONES } from "@/lib/manual/contenido"

// ============================================================================
// Registry de fuentes de búsqueda global (server-side, consumido por /api/search).
// Cosechar un módulo = agregar UNA entrada acá. El CommandPalette no se toca.
//
// La RLS filtra por rol, pero el buscador NO se apoya solo en eso: cada fuente
// que devuelve datos de alcance restringido recibe el `SearchCtx` y filtra
// explícitamente. Defensa en profundidad — el Ctrl+K es la puerta más fácil de
// olvidar cuando se toca una policy.
// ============================================================================

export type SearchResult = {
  href: string
  label: string
  sub: string
  iconKey: IconKey
}

type Supabase = Awaited<ReturnType<typeof createServerClient>>

// Quién está buscando. Lo arma /api/search a partir del profile.
export type SearchCtx = {
  userId: string
  esAdmin: boolean
}

type SearchSource = (supabase: Supabase, like: string, ctx: SearchCtx) => Promise<SearchResult[]>

// ─── Core: usuarios (RLS: admin ve todos; colaborador solo su perfil) ────────
const buscarUsuarios: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo")
    .or(`nombre.ilike.${like},email.ilike.${like}`)
    .limit(5)
  return (data ?? []).map((u) => ({
    href: `${DOMINIO.usuarios.ruta}/${u.id}`,
    label: u.nombre,
    sub: `${DOMINIO.usuarios.singular} · ${u.email}${u.activo ? "" : " · inactivo"}`,
    iconKey: "UserCog" as const,
  }))
}

// ─── Clientes (RLS: authenticated lee; admin escribe) ───────────────────────
const buscarClientes: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("clientes")
    .select("id, id_publico, tipo, nombre, apellido, razon_social, documento, telefono, activo")
    .or(
      [
        `id_publico.ilike.${like}`,
        `nombre.ilike.${like}`,
        `apellido.ilike.${like}`,
        `razon_social.ilike.${like}`,
        `documento.ilike.${like}`,
        `telefono.ilike.${like}`,
        `instagram.ilike.${like}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(5)
  return (data ?? []).map((c) => {
    const label = c.tipo === "MAYORISTA"
      ? (c.razon_social ?? c.nombre)
      : [c.nombre, c.apellido].filter(Boolean).join(" ")
    const tipoLabel = c.tipo === "MAYORISTA" ? "Mayorista" : "Minorista"
    return {
      href: `${DOMINIO.clientes.ruta}/${c.id}`,
      label: `${c.id_publico} · ${label}`,
      sub: `${DOMINIO.clientes.singular} · ${tipoLabel}${c.telefono ? ` · ${c.telefono}` : ""}${c.activo ? "" : " · inactivo"}`,
      iconKey: "Users" as const,
    }
  })
}

// ─── Productos ──────────────────────────────────────────────────────────────
// Usa `productos_catalogo`, que NO trae costo ni comision_pct. Acá no hace
// falta filtrar por rol: el catálogo es visible para todos a propósito (el
// vendedor lo necesita para vender). Ver la nota de esa vista en la 0016.
const buscarProductos: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("productos_catalogo")
    .select("id, id_publico, sku, nombre, marca, activo")
    .or(
      [
        `id_publico.ilike.${like}`,
        `sku.ilike.${like}`,
        `nombre.ilike.${like}`,
        `marca.ilike.${like}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(5)
  return (data ?? []).map((p) => ({
    href: `${DOMINIO.productos.ruta}/${p.id}`,
    label: `${p.id_publico} · ${p.nombre}`,
    sub: `${DOMINIO.productos.singular}${p.sku ? ` · SKU ${p.sku}` : ""}${p.marca ? ` · ${p.marca}` : ""}${p.activo ? "" : " · inactivo"}`,
    iconKey: "Package" as const,
  }))
}

// ─── Proveedores (RLS: authenticated lee; admin escribe) ────────────────────
const buscarProveedores: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("proveedores")
    .select("id, id_publico, nombre, cuit, telefono, activo")
    .or(
      [
        `id_publico.ilike.${like}`,
        `nombre.ilike.${like}`,
        `cuit.ilike.${like}`,
        `telefono.ilike.${like}`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(5)
  return (data ?? []).map((p) => ({
    href: `${DOMINIO.proveedores.ruta}/${p.id}`,
    label: `${p.id_publico} · ${p.nombre}`,
    sub: `${DOMINIO.proveedores.singular}${p.telefono ? ` · ${p.telefono}` : ""}${p.activo ? "" : " · inactivo"}`,
    iconKey: "Landmark" as const,
  }))
}

// ─── Ventas — el admin busca todas; el vendedor solo las suyas ──────────────
// Filtro explícito + RLS de `ventas` (que la vista respeta desde la 0016).
const buscarVentas: SearchSource = async (supabase, like, ctx) => {
  let query = supabase
    .from("v_ventas_lista")
    .select("id, id_publico, total, estado_cobro, estado_entrega")
    .ilike("id_publico", like)
    .order("fecha", { ascending: false })
    .limit(5)
  if (!ctx.esAdmin) query = query.eq("vendedor_id", ctx.userId)
  const { data } = await query
  return (data ?? []).map((v) => ({
    href: `${DOMINIO.ventas.ruta}/${v.id}`,
    label: `${v.id_publico}`,
    sub: `${DOMINIO.ventas.singular} · ${v.estado_cobro} · ${v.estado_entrega}`,
    iconKey: "ClipboardList" as const,
  }))
}

// ─── Compras (RLS: admin-only) ───────────────────────────────────────────────
const buscarCompras: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("compras")
    .select("id, id_publico, total, estado, numero_factura")
    .or(`id_publico.ilike.${like},numero_factura.ilike.${like}`)
    .order("fecha", { ascending: false })
    .limit(5)
  return (data ?? []).map((c) => ({
    href: `${DOMINIO.compras.ruta}/${c.id}`,
    label: `${c.id_publico}${c.numero_factura ? ` · F ${c.numero_factura}` : ""}`,
    sub: `${DOMINIO.compras.singular} · ${c.estado}`,
    iconKey: "Receipt" as const,
  }))
}

// ─── Campañas (RLS: admin+colaborador+marketing) ────────────────────────────
const buscarCampanas: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("v_campanas")
    .select("id, id_publico, nombre, estado_efectivo")
    .or(`id_publico.ilike.${like},nombre.ilike.${like}`)
    .limit(5)
  return (data ?? []).map((c) => ({
    href: `${DOMINIO.campanas.ruta}/${c.id}`,
    label: `${c.id_publico} · ${c.nombre}`,
    sub: `${DOMINIO.campanas.singular} · ${c.estado_efectivo}`,
    iconKey: "Megaphone" as const,
  }))
}

// ─── Manual de usuario (contenido estático, sin DB) ──────────────────────────
// El filtrado por rol se hace en la propia página de la sección; acá devolvemos
// las secciones cuyo título o resumen matchea, para que el empleado llegue a la
// respuesta desde el mismo Ctrl+K con el que busca todo lo demás.
// No recibe `ctx`: el manual no depende del rol acá — cada sección filtra por
// rol en su propia página. TS permite declarar menos parámetros de los que la
// firma ofrece.
const buscarManual: SearchSource = async (_supabase, like) => {
  const q = like.replaceAll("%", "").toLowerCase()
  if (q.length < 2) return []
  return SECCIONES.filter(
    (s) => s.titulo.toLowerCase().includes(q) || s.resumen.toLowerCase().includes(q),
  )
    .slice(0, 4)
    .map((s) => ({
      href: `/manual/${s.slug}`,
      label: s.titulo,
      sub: `Manual · ${s.categoria} · ${s.minutos} min`,
      iconKey: "GraduationCap" as const,
    }))
}

// Los módulos cosechados agregan su fuente acá (clientes, ventas, ...).
const SOURCES: SearchSource[] = [
  buscarManual,
  buscarCompras,
  buscarVentas,
  buscarUsuarios,
  buscarClientes,
  buscarProveedores,
  buscarProductos,
  buscarCampanas,
]

export async function buscarGlobal(
  supabase: Supabase,
  q: string,
  ctx: SearchCtx,
): Promise<SearchResult[]> {
  const like = `%${q}%`
  const resultados = await Promise.all(SOURCES.map((fn) => fn(supabase, like, ctx)))
  return resultados.flat()
}
