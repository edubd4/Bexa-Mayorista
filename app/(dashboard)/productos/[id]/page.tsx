import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, AlertTriangle, Package } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { MovimientoStockForm } from "@/components/productos/MovimientoStockForm"
import { PreciosPorListaManager, type PrecioPorListaFila } from "@/components/productos/PreciosPorListaManager"
import { PreciosTramoLista, type PrecioTramo } from "@/components/productos/PreciosTramoLista"
import { ProductoForm } from "@/components/productos/ProductoForm"
import { ToggleProductoActivoButton } from "@/components/productos/ToggleProductoActivoButton"
import { EliminarButton } from "@/components/ui/eliminar-button"
import { eliminarProducto } from "@/app/(dashboard)/productos/actions"
import { ROL } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"
import { puedeCargarProductos, puedeCargarStockVendedor } from "@/lib/permisos"
import { TIPO_MOV_STOCK_LABEL, TIPO_MOV_STOCK_VARIANT, signoDelta } from "@/lib/productos-ui"
import type { TipoMovStock } from "@/lib/validators/producto"
import { formatFechaHora, formatPesos } from "@/lib/utils"
import { logPerfilError } from "@/lib/auth-guards"

type Params = { id: string }

type ProductoAdmin = {
  id: string
  id_publico: string
  sku: string | null
  nombre: string
  descripcion: string | null
  categoria: string | null
  marca: string | null
  atributos: Record<string, string> | null
  proveedor_id: string | null
  costo: number
  precio_base: number
  comision_pct: number | null
  stock_actual: number
  stock_minimo: number
  controla_stock: boolean
  activo: boolean
}

// created_by solo se pide en la variante vendedor: decide si puede cargar
// stock (productos que él creó, ver 0020). Al admin no le hace falta.
type ProductoVendedor = Omit<ProductoAdmin, "costo" | "comision_pct"> & {
  created_by: string | null
}

type MovimientoRow = {
  id: number
  tipo: TipoMovStock
  cantidad: number
  motivo: string | null
  created_at: string
  usuario: { nombre: string } | null
}

export default async function ProductoDetallePage({ params }: { params: Params }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: perfilError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single()
  logPerfilError("ProductoDetallePage", perfilError)
  if (!profile?.activo) redirect("/login")

  const esAdmin = profile.rol === ROL.ADMIN
  // Desde la 0028 el vendedor también edita, da de baja y elimina (decisión del
  // cliente 2026-07-29). Lo que sigue siendo exclusivo del admin es lo que la
  // vista `productos_catalogo` no trae: costo y comisión.
  const puedeGestionar = puedeCargarProductos(profile.rol)

  const table = esAdmin ? "productos" : "productos_catalogo"
  const columns = esAdmin
    ? "id, id_publico, sku, nombre, descripcion, categoria, marca, atributos, proveedor_id, costo, precio_base, comision_pct, stock_actual, stock_minimo, controla_stock, activo"
    : "id, id_publico, sku, nombre, descripcion, categoria, marca, atributos, proveedor_id, precio_base, stock_actual, stock_minimo, controla_stock, activo, created_by"

  const { data: prodRow } = await supabase
    .from(table)
    .select(columns)
    .eq("id", params.id)
    .maybeSingle()

  if (!prodRow) notFound()
  const producto = prodRow as unknown as ProductoAdmin | ProductoVendedor

  // Datos auxiliares para admin: proveedor + form editable, listas de opciones.
  const [proveedorRes, ultimosMovsRes, catRowsRes, marcaRowsRes, tramosRes] = await Promise.all([
    producto.proveedor_id
      ? supabase.from("proveedores")
          .select("id, id_publico, nombre")
          .eq("id", producto.proveedor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("movimientos_stock")
      .select("id, tipo, cantidad, motivo, created_at, usuario:created_by ( nombre )")
      .eq("producto_id", producto.id)
      .order("created_at", { ascending: false })
      .limit(15),
    // Sugerencias del ComboBox: las necesita cualquiera que edite, no solo el
    // admin. Salen de productos_catalogo, que no expone costos.
    puedeGestionar
      ? supabase.from("productos_catalogo").select("categoria").not("categoria", "is", null)
      : Promise.resolve({ data: [] }),
    puedeGestionar
      ? supabase.from("productos_catalogo").select("marca").not("marca", "is", null)
      : Promise.resolve({ data: [] }),
    // Tramos de precio por cantidad (0022). El vendedor también los ve:
    // le sirven para cotizar — el precio de venta no es una columna sensible.
    supabase
      .from("productos_precios_tramo")
      .select("id, cantidad_min, precio")
      .eq("producto_id", params.id)
      .order("cantidad_min"),
  ])
  const proveedor = (proveedorRes.data as { id: string; id_publico: string; nombre: string } | null) ?? null
  const movimientos = (ultimosMovsRes.data ?? []) as unknown as MovimientoRow[]
  const tramos = (tramosRes.data ?? []) as unknown as PrecioTramo[]

  const categoriasExistentes = Array.from(
    new Set(((catRowsRes.data ?? []) as { categoria: string | null }[])
      .map((r) => r.categoria).filter((c): c is string => !!c)),
  ).sort()
  const marcasExistentes = Array.from(
    new Set(((marcaRowsRes.data ?? []) as { marca: string | null }[])
      .map((r) => r.marca).filter((m): m is string => !!m)),
  ).sort()

  const { data: proveedoresActivos } = puedeGestionar
    ? await supabase
        .from("proveedores")
        .select("id, id_publico, nombre")
        .eq("activo", true)
        .order("nombre")
    : { data: [] }

  // Precios por lista (admin): cuánto vale ESTE producto en cada lista activa.
  // Junto con precio base y tramos (en el form), la ficha concentra toda la
  // política de precios del producto en un solo lugar.
  let preciosPorLista: PrecioPorListaFila[] = []
  if (esAdmin) {
    const [{ data: listas }, { data: items }] = await Promise.all([
      supabase.from("listas_precios").select("id, id_publico, nombre").eq("activo", true).order("nombre"),
      supabase.from("listas_precios_items").select("id, lista_precio_id, precio").eq("producto_id", producto.id),
    ])
    const itemPorLista = new Map(
      ((items ?? []) as { id: string; lista_precio_id: string; precio: number }[])
        .map((i) => [i.lista_precio_id, i]),
    )
    preciosPorLista = ((listas ?? []) as { id: string; id_publico: string; nombre: string }[]).map((l) => ({
      listaId: l.id,
      listaIdPublico: l.id_publico,
      nombre: l.nombre,
      itemId: itemPorLista.get(l.id)?.id ?? null,
      precio: itemPorLista.get(l.id) ? Number(itemPorLista.get(l.id)!.precio) : null,
    }))
  }

  const ent = DOMINIO.productos
  const stockBajo =
    producto.controla_stock && producto.stock_minimo > 0 && producto.stock_actual <= producto.stock_minimo
  const atributos = producto.atributos ?? {}

  return (
    <div className="app-circuit min-h-[calc(100vh-4rem)] px-6 md:px-10 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={ent.ruta}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-app-muted hover:text-app-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a {ent.plural.toLowerCase()}
        </Link>

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-app-accent tracking-[0.18em] uppercase">
              {ent.singular} · <span className="text-app-secondary">{producto.id_publico}</span>
              {producto.sku && <span className="text-app-muted"> · SKU {producto.sku}</span>}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              {producto.nombre}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-app-secondary">
              {producto.marca && <span>{producto.marca}</span>}
              {producto.marca && producto.categoria && <span>·</span>}
              {producto.categoria && <span>{producto.categoria}</span>}
              {proveedor && (
                <>
                  <span>·</span>
                  <Link
                    href={`${DOMINIO.proveedores.ruta}/${proveedor.id}`}
                    className="hover:text-app-accent"
                  >
                    {proveedor.id_publico} · {proveedor.nombre}
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={producto.activo ? "green" : "gray"}>
              {producto.activo ? "Activo" : "Inactivo"}
            </Badge>
            {puedeGestionar && (
              <>
                <ToggleProductoActivoButton
                  productoId={producto.id}
                  idPublico={producto.id_publico}
                  activo={producto.activo}
                />
                <EliminarButton
                  action={eliminarProducto.bind(null, producto.id)}
                  etiqueta={`${producto.id_publico} · ${producto.nombre}`}
                  entidad="producto"
                  redirectTo={DOMINIO.productos.ruta}
                />
              </>
            )}
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Stock actual"
               value={producto.controla_stock ? String(producto.stock_actual) : "Sin control"}
               tone={stockBajo ? "amber" : "accent"}
               hint={
                 !producto.controla_stock
                   ? "no descuenta al vender"
                   : producto.stock_minimo > 0 ? `mín ${producto.stock_minimo}` : undefined
               }
               icon={stockBajo ? <AlertTriangle className="w-4 h-4" /> : <Package className="w-4 h-4" />}
          />
          <KPI label="Precio base" value={formatPesos(Number(producto.precio_base))} tone="accent" />
          {esAdmin && "costo" in producto && (
            <KPI label="Costo" value={formatPesos(Number((producto as ProductoAdmin).costo))} tone="violet" />
          )}
          {esAdmin && "comision_pct" in producto && (
            <KPI
              label="Comisión"
              value={
                (producto as ProductoAdmin).comision_pct !== null
                  ? `${(producto as ProductoAdmin).comision_pct}%`
                  : "Vendedor"
              }
              tone="green"
            />
          )}
        </section>

        {/* Descripción y atributos */}
        {(producto.descripcion || Object.keys(atributos).length > 0) && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-3">
            {producto.descripcion && (
              <p className="text-sm text-app-text whitespace-pre-wrap">{producto.descripcion}</p>
            )}
            {Object.keys(atributos).length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                {Object.entries(atributos).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-app-muted uppercase tracking-widest">{k}</dt>
                    <dd className="text-app-text">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {/* Form de edición. Admin y vendedor (0028), con dos diferencias:
            el vendedor no ve `comision_pct` (la define solo el admin, 0017) ni
            `costo` — no puede leerlo, así que tampoco puede reescribirlo; el
            RPC lo deja como estaba. Los precios por cantidad sí los edita. */}
        {puedeGestionar && (
          <ProductoForm
            mode="edit"
            productoId={producto.id}
            initial={{
              nombre: producto.nombre,
              sku: producto.sku ?? undefined,
              descripcion: producto.descripcion ?? undefined,
              categoria: producto.categoria ?? undefined,
              marca: producto.marca ?? undefined,
              atributos,
              proveedor_id: producto.proveedor_id ?? undefined,
              costo: esAdmin ? (producto as ProductoAdmin).costo ?? 0 : 0,
              precio_base: producto.precio_base,
              comision_pct: esAdmin ? (producto as ProductoAdmin).comision_pct ?? undefined : undefined,
              stock_minimo: producto.stock_minimo,
              controla_stock: producto.controla_stock,
              precios_tramo: tramos.map((t) => ({
                cantidad_min: t.cantidad_min,
                precio: Number(t.precio),
              })),
            }}
            proveedores={(proveedoresActivos ?? []) as { id: string; id_publico: string; nombre: string }[]}
            categoriasExistentes={categoriasExistentes}
            marcasExistentes={marcasExistentes}
            mostrarComision={esAdmin}
            mostrarCosto={esAdmin}
            mostrarControlStock={esAdmin}
          />
        )}

        {/* Precios por cantidad — solo lectura para quien NO edita (marketing).
            Admin y vendedor los tocan adentro del form de arriba. */}
        {!puedeGestionar && tramos.length > 0 && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">Precios por cantidad</h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                El tramo pisa lista y descuentos
              </p>
            </div>
            <PreciosTramoLista tramos={tramos} />
          </section>
        )}

        {/* Precios por lista — un solo lugar para toda la política de precios
            del producto: base y tramos en el form, y acá cuánto vale en cada
            lista de precios. Admin-only (la vista del vendedor no expone la
            estructura de listas). */}
        {esAdmin && (
          <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">Precios por lista</h2>
              <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
                La lista del cliente pisa el precio base
              </p>
            </div>
            <PreciosPorListaManager productoId={producto.id} filas={preciosPorLista} />
          </section>
        )}

        {/* Movimientos de stock */}
        <section className="rounded-xl border border-app-line-soft bg-app-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Movimientos de stock</h2>
            <p className="font-mono text-[10.5px] text-app-muted uppercase tracking-widest">
              Inmutables · corregí con AJUSTE
            </p>
          </div>

          {/* Admin: form completo, insert directo (policy de la 0014).
              Vendedor sobre un producto que ÉL creó: form acotado que va por
              el RPC registrar_stock_vendedor (0020) — recibe mercadería en
              partes y corrige sus cargas, sin SALIDA y con motivo obligatorio.
              Vendedor sobre producto ajeno (o marketing): sigue siendo cosa
              del admin. */}
          {esAdmin ? (
            <MovimientoStockForm productoId={producto.id} stockActual={producto.stock_actual} />
          ) : puedeCargarStockVendedor(profile.rol, "created_by" in producto && producto.created_by === user.id) ? (
            <MovimientoStockForm
              productoId={producto.id}
              stockActual={producto.stock_actual}
              modo="vendedor"
            />
          ) : (
            <p className="text-xs text-app-muted font-mono">
              Los movimientos de stock de este producto los registra el admin.
              Si contaste una diferencia, avisale para que la ajuste.
            </p>
          )}

          <div className="border-t border-app-line-soft pt-3">
            {movimientos.length === 0 ? (
              <p className="text-sm text-app-muted font-mono">Sin movimientos todavía.</p>
            ) : (
              <ul className="space-y-1">
                {movimientos.map((m) => {
                  const s = signoDelta(m.tipo)
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-app-line-soft last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={TIPO_MOV_STOCK_VARIANT[m.tipo]}>
                          {TIPO_MOV_STOCK_LABEL[m.tipo]}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-sm text-app-text">
                            <span className={`font-mono font-semibold ${s === "+" ? "text-app-green" : "text-app-red"}`}>
                              {s}{m.cantidad}
                            </span>
                            {m.motivo && <span className="ml-2 text-app-secondary">· {m.motivo}</span>}
                          </p>
                          <p className="text-[10.5px] font-mono text-app-muted">
                            {formatFechaHora(m.created_at)}
                            {m.usuario?.nombre ? ` · ${m.usuario.nombre}` : ""}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function KPI({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string
  value: string
  tone: "accent" | "amber" | "violet" | "green"
  hint?: string
  icon?: React.ReactNode
}) {
  const toneClasses = {
    accent: "text-app-accent",
    amber:  "text-app-amber",
    violet: "text-app-violet",
    green:  "text-app-green",
  }[tone]
  return (
    <div className="rounded-xl border border-app-line-soft bg-app-card p-4">
      <div className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest ${toneClasses}`}>
        {icon}
        {label}
      </div>
      <p className="font-display text-lg mt-1">{value}</p>
      {hint && <p className="text-[10.5px] font-mono text-app-muted mt-0.5">{hint}</p>}
    </div>
  )
}
