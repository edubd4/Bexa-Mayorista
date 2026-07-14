import type { createServerClient } from "@/lib/supabase/server"
import type { IconKey } from "@/lib/nav"
import { DOMINIO } from "@/lib/dominio"

// ============================================================================
// Registry de fuentes de búsqueda global (server-side, consumido por /api/search).
// Cosechar un módulo = agregar UNA entrada acá. El CommandPalette no se toca.
// RLS filtra: cada rol ve solo lo que sus policies permiten.
// ============================================================================

export type SearchResult = {
  href: string
  label: string
  sub: string
  iconKey: IconKey
}

type Supabase = Awaited<ReturnType<typeof createServerClient>>

type SearchSource = (supabase: Supabase, like: string) => Promise<SearchResult[]>

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

// ─── Productos (usa vista SIN costos — no filtramos por rol, la vista es segura) ─
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

// ─── Ventas (RLS: admin ve todas; vendedor solo las suyas) ───────────────────
const buscarVentas: SearchSource = async (supabase, like) => {
  const { data } = await supabase
    .from("v_ventas_lista")
    .select("id, id_publico, total, estado_cobro, estado_entrega")
    .ilike("id_publico", like)
    .order("fecha", { ascending: false })
    .limit(5)
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

// Los módulos cosechados agregan su fuente acá (clientes, ventas, ...).
const SOURCES: SearchSource[] = [
  buscarCompras,
  buscarVentas,
  buscarUsuarios,
  buscarClientes,
  buscarProveedores,
  buscarProductos,
]

export async function buscarGlobal(supabase: Supabase, q: string): Promise<SearchResult[]> {
  const like = `%${q}%`
  const resultados = await Promise.all(SOURCES.map((fn) => fn(supabase, like)))
  return resultados.flat()
}
