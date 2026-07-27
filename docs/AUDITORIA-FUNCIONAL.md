# BEXA · Auditoría funcional y de seguridad

**Fecha**: 2026-07-27 · **Alcance**: 41 server actions, 20 funciones/RPC de Postgres,
13 vistas de reporting, 40 rutas, matriz de permisos completa.
**Método**: lectura de cada función una por una, siguiendo el recorrido
`UI → server action → RPC → RLS`.

> **Estado (2026-07-27, rama `feat/manual-in-app`)**: los 7 hallazgos originales
> están resueltos en las migraciones 0016–0019, más 4 hallazgos nuevos que
> aparecieron al implementar los fixes (ver la sección final).
> **Nada está aplicado en Supabase todavía** — falta correr las migraciones y
> probar el preview con un usuario vendedor real.

---

## Resumen ejecutivo

El sistema está bien construido: RPCs transaccionales para toda operación de 2+
tablas, validación con Zod en el 95% de las acciones, historial de auditoría
consistente, tablas de plata append-only. La arquitectura es sólida.

Pero hay **un agujero estructural de permisos** que anula la regla más importante
del proyecto ("el vendedor no ve ni los costos ni las ventas ajenas"), y **una
funcionalidad de dinero que está muerta sin que nadie se haya enterado**.

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | 🔴 CRÍTICO | Las vistas de reporting **bypassean RLS** — el vendedor ve ventas, costos, ganancias y comisiones de todos | ✅ 0016 |
| 2 | 🔴 CRÍTICO | El campo "Comisión override" del producto **no se aplica nunca** | ✅ 0018 |
| 3 | 🟠 ALTO | Formulario de ajuste de stock visible para vendedores, pero la operación falla con error crudo de Postgres | ✅ 0019 |
| 4 | 🟠 ALTO | `registrar_gasto` usa fecha UTC — gastos cargados después de las 21:00 quedan con fecha de mañana | ✅ 0019 |
| 5 | 🟡 MEDIO | `actualizarPublicacion` acepta cualquier columna sin validar (mass assignment) | ✅ 0017 |
| 6 | 🟡 MEDIO | Cambios de precio en listas no dejan rastro en el Historial | ✅ 0019 |
| 7 | 🔵 BAJO | Comentarios en el código que afirman lo contrario de lo que el código hace | ✅ 0016/0019 |

---

## 🔴 1 · Las vistas de reporting bypassean RLS

**Dónde**: las 13 vistas de `supabase/migrations/` (`v_ventas_lista`,
`v_ventas_ganancia`, `v_comisiones_semana`, `v_ranking_vendedores`,
`v_ventas_con_saldo`, `saldo_caja`, etc.)

**El problema**: ninguna vista se creó con `security_invoker = true`. En
PostgreSQL, una vista sin esa opción se ejecuta **con los privilegios de su
dueño**, no del usuario que consulta. Resultado: **las policies RLS de las tablas
subyacentes no se aplican cuando se consulta a través de la vista**. Y todas
están otorgadas a `authenticated`.

**Cómo se ve hoy en la aplicación** (no es teórico, no hace falta tocar la API):

- `app/(dashboard)/ventas/page.tsx:64` — el comentario dice literalmente
  *"RLS filtra: vendedor ve solo las suyas"* y la query **no tiene**
  `.eq("vendedor_id", user.id)`. **Un vendedor abre /ventas y ve TODAS las ventas
  de la empresa**, con cliente, total y el nombre del vendedor que la hizo.
- `app/(dashboard)/comisiones/page.tsx:10` — mismo comentario, mismo hueco.
  **Un vendedor ve la liquidación semanal de todos sus compañeros.**
- `lib/search-sources.ts:115` — buscar un código `VTA-` en Ctrl+K devuelve
  ventas ajenas.
- `v_ventas_ganancia` expone `costo_total` y `ganancia` de cada venta a
  cualquier usuario autenticado vía PostgREST.

Esto contradice de frente la regla de `CLAUDE.md`:
> *"Si un costo llega al client de un vendedor, está MAL aunque la UI no lo muestre."*

**Fix recomendado** (una migración, `0016_views_security_invoker.sql`):

```sql
alter view public.v_ventas_lista       set (security_invoker = true);
alter view public.v_ventas_ganancia    set (security_invoker = true);
alter view public.v_comisiones_semana  set (security_invoker = true);
alter view public.v_ranking_vendedores set (security_invoker = true);
alter view public.v_ventas_con_saldo   set (security_invoker = true);
-- ... y el resto
```

**Ojo al aplicarlo**: `productos_catalogo` protege el costo por *selección de
columnas*, no por RLS — esa está bien como está. Y `saldo_caja` /
`v_ventas_ganancia` son admin-only por matriz: además del `security_invoker`,
conviene revocar el grant a `authenticated` y dejarlas solo donde la página ya
valida rol. Después del cambio hay que **re-testear cada pantalla con un usuario
vendedor real**: varias queries hoy dependen (sin saberlo) de ver todo.

---

## 🔴 2 · La comisión por producto no se aplica nunca

**Dónde**: `supabase/migrations/0015_rol_marketing.sql:103` (y sus versiones
previas en 0007 y 0012).

```sql
select costo, comision_pct
  into v_producto_costo, v_producto_com     -- ← v_producto_com se lee...
  from public.productos where id = v_item.producto_id and activo = true;
```

`v_producto_com` **nunca se vuelve a usar**. La comisión se calcula una sola vez
para toda la venta, desde `profiles.comision_pct` o el default de configuración.

Mientras tanto:
- `0007_ventas.sql:19` documenta: *"Comisión = % del vendedor + override por producto"*.
- `components/productos/ProductoForm.tsx:212` muestra un campo
  **"Comisión override (%)"** que el admin completa.
- `app/(dashboard)/productos/[id]/page.tsx:181` lo muestra en la ficha.

**El admin configura un porcentaje por producto, lo ve en pantalla, y no hace
absolutamente nada.** Esto es plata que se le paga mal a los vendedores.

**Decisión necesaria antes de tocar código**: ¿el override por producto se
implementa o se elimina? Son dos caminos distintos:

- **Implementarlo**: la comisión pasa a calcularse ítem por ítem
  (`coalesce(producto.comision_pct, vendedor.comision_pct, default)` sobre el
  subtotal de cada línea) y se suma. Cambia el modelo de comisiones.
- **Eliminarlo**: sacar el campo del formulario y de la ficha, y limpiar el
  comentario de la migración. Cinco minutos.

Lo que **no** puede seguir es el estado actual: un campo que promete algo que no
cumple. Por eso el manual de usuario **no documenta** este campo.

---

## 🟠 3 · Ajuste de stock: botón roto para vendedores

**Dónde**: `app/(dashboard)/productos/[id]/page.tsx:246` y
`app/(dashboard)/productos/actions.ts:179`.

El `<MovimientoStockForm>` se renderiza **fuera** del bloque `{esAdmin && (...)}`
(que cierra en la línea 235). Un vendedor lo ve y lo puede completar.

La server action `registrarMovimientoStock` no tiene guard de admin — su
comentario dice *"Cualquier usuario autenticado puede registrar (la RLS del
schema lo permite)"*. **Ese comentario quedó viejo**: el fix E de
`0014_audit_fixes.sql:241` cambió la policy a `movstock_insert_admin`.

Resultado: el vendedor llena el formulario, aprieta guardar, y recibe un error
crudo de PostgreSQL del estilo `new row violates row-level security policy`.

**Fix**: dos líneas.
1. Envolver `<MovimientoStockForm>` en el bloque `esAdmin`.
2. Cambiar `createServerClient()` por `requireAdmin()` en la action, y actualizar
   el comentario.

---

## 🟠 4 · `registrar_gasto` usa fecha UTC

**Dónde**: `supabase/migrations/0013_registrar_gasto_fix.sql:61,68`.

```sql
coalesce(p_fecha, current_date)
```

El fix F de la 0014 introdujo `hoy_local()` justamente porque `current_date` en
Supabase devuelve la fecha **UTC**, y una operación de las 21:30 en Argentina ya
es "mañana" en UTC. Pero `registrar_gasto` se aplicó *antes* (0013) y **nunca se
actualizó**.

Consecuencia: todo gasto cargado después de las 21:00 hora argentina queda con la
fecha del día siguiente. El cierre de caja del día no cuadra y el reporte mensual
del contador se corre.

**Fix**: reemplazar `current_date` por `public.hoy_local()` en ambas ocurrencias,
en una nueva migración.

---

## 🟡 5 · `actualizarPublicacion` sin validación

**Dónde**: `app/(dashboard)/campanas/actions.ts:210`.

```ts
export async function actualizarPublicacion(id: string, input: Partial<PublicacionInput>) {
  // ...
  .update({ ...input, updated_by: user.id })   // ← input crudo, sin parsear
```

Es la **única** de las 41 server actions que no pasa por Zod. El spread del input
crudo permite escribir cualquier columna de `campana_publicaciones` (incluido
`campana_id` o `created_by`) desde un cliente manipulado.

**Fix**: `publicacionSchema.partial().safeParse(input)` antes del update — igual
que hacen las otras 40.

---

## 🟡 6 · Cambios de precio sin rastro en el Historial

**Dónde**: `app/(dashboard)/listas-precios/actions.ts:121,143`.

`upsertItemLista` y `removeItemLista` **no llaman a `logHistorial`**. Todas sus
hermanas del mismo archivo sí lo hacen.

Traducido al negocio: alguien cambia el precio de un producto en la lista
"Mayorista" y **no queda registro de quién ni cuándo**. En una distribuidora, el
precio de la lista es exactamente el dato que uno quiere poder auditar.

Mismo hueco, menor impacto, en: `createCategoriaGasto`,
`toggleCategoriaGastoActivo`, `updateMetricasManuales`, `crearPublicacion`,
`borrarPublicacion`.

---

## 🔵 7 · Comentarios que mienten

Tres comentarios afirman que la RLS protege algo que no protege:

- `app/(dashboard)/ventas/page.tsx:64` — *"RLS filtra: vendedor ve solo las suyas"*
- `app/(dashboard)/comisiones/page.tsx:10` — *"Vendedor ve solo lo suyo (RLS)"*
- `app/(dashboard)/productos/actions.ts:176` — *"la RLS del schema lo permite"*

Son peligrosos porque el próximo que lea el código va a confiar en ellos. Se
corrigen junto con los hallazgos 1 y 3.

---

## Lo que está bien (y conviene no romper)

Vale decirlo explícitamente, porque es la mayor parte del sistema:

- **RPCs transaccionales**: `registrar_venta`, `cobrar_venta`, `recibir_compra`,
  `registrar_gasto`, `cancelar_venta`, `cancelar_compra`. Toda operación que toca
  2+ tablas es atómica. Bien resuelto.
- **Checks de rol dentro de los RPC**: como son `SECURITY DEFINER` y se saltean
  RLS, cada uno valida el rol adentro. Correcto y consistente.
- **Append-only real** en `movimientos_caja`, `gastos`, `movimientos_stock`,
  `comisiones` e `historial`, con triggers que bloquean UPDATE y DELETE.
- **Validación Zod** en 40 de 41 server actions, con `safeParse` y mensaje al
  usuario.
- **Guards tipados** (`requireAdmin` / `requireAuthenticated`) con union
  discriminada — el narrowing de TypeScript hace imposible olvidarse el check.
- **Middleware a prueba de caídas**: todo el auth va en `try/catch` para no
  disparar `MIDDLEWARE_INVOCATION_FAILED` y tumbar el sitio entero.
- **Protecciones de negocio bien puestas**: no cobrar más que el saldo, no vender
  sin stock, no auto-degradarse de admin, Consumidor Final inmutable.
- Los fixes de la `0014` (fan-out de métricas de campaña, comisiones de ventas
  canceladas, ranking con canceladas, timezone) están bien razonados y bien
  resueltos.

---

## Hallazgos nuevos, encontrados al implementar los fixes

Estos cuatro no estaban en la auditoría original. Aparecieron al escribir las
migraciones, y dos de ellos habrían roto producción.

### 🚨 8 · El fix del hallazgo 1, aplicado en bloque, TUMBA el sistema

La recomendación original decía "alter view ... set (security_invoker = true)"
para las 13 vistas. **Cuatro de ellas dependen del bypass para funcionar**:

- `productos_catalogo` protege por *selección de columnas*, no por RLS. La
  policy de `productos` es `productos_select_admin`. Con `security_invoker`, el
  vendedor pierde el catálogo entero: **no puede elegir productos y no puede
  vender**.
- `v_clientes_inactivos` calcula `dias_sin_comprar` con un `left join ventas`.
  Filtrado por RLS, un vendedor vería como "última compra" solo las suyas — y
  le mandaría un mensaje de reactivación a un cliente que le compró ayer a otro
  vendedor.
- `v_campana_metricas` agrega ventas por campaña. El rol `marketing` no es admin
  ni es vendedor de ninguna venta: no matchea ninguna rama de `ventas_select` y
  **todas las métricas darían 0**.
- `v_campanas` trae `costo_real` desde `gastos` (admin-only): marketing perdería
  el costo de sus propias campañas.

Las cuatro quedaron documentadas con `comment on view` para que nadie las
"arregle" por consistencia.

### 🚨 9 · No se puede revocar el grant a `authenticated`

La recomendación original sugería revocar `v_ventas_ganancia` y `saldo_caja` de
`authenticated`. **Eso las rompe también para el admin**: `authenticated` es el
rol de Postgres de *todo* usuario logueado. No existe un rol de base de datos
`admin` — ser admin es un valor en `profiles.rol`.

Además, `security_invoker` solo no alcanzaba para `v_ventas_ganancia`: la policy
de `ventas` es "admin OR vendedor_id = auth.uid()", así que el vendedor habría
pasado a ver el costo y la ganancia **de sus propias ventas**. Se resolvió con
un `where public.current_user_rol() = 'admin'` adentro de la vista.

### 🚨 10 · Campañas no tenía NINGÚN control de rol

Las 6 server actions de `campanas/actions.ts` usaban `requireAuthenticated()`
sin mirar el rol, y la RLS era `campanas_all_authenticated` — una policy `FOR
ALL` para cualquier autenticado. Un `rg` de `esAdmin|ROL\.` en toda la UI de
campañas devolvía **cero resultados**.

En la práctica: un vendedor podía crear campañas, editar el presupuesto y
**borrar publicaciones** con un DELETE real, sin dejar rastro en el Historial.
Resuelto en 0017 junto con el pedido del cliente de que las campañas sean del
área de marketing.

### 🚨 11 · Marketing no podía asociar productos a una campaña

`campanas/nueva/page.tsx` y `campanas/[id]/edit/page.tsx` consultaban
`supabase.from("productos")` — la tabla completa, admin-only por RLS. A un
usuario de marketing el selector de productos le llegaba **vacío**. Ahora usan
`productos_catalogo`.

---

## Lo que queda pendiente de decisión

**RESUELTO en la 0020 (2026-07-27).** El vendedor podía crear un producto pero
no cargarle el stock: el fix E de la 0014 dejó `movimientos_stock` con INSERT
admin-only (a propósito: un vendedor podía insertar AJUSTEs arbitrarios por
supabase-js), y desde la 0017 el circuito quedaba a mitad de camino.

La decisión del cliente fue cerrarlo con el RPC acotado
`registrar_stock_vendedor()` (SECURITY DEFINER, la policy no se tocó):

- ENTRADA y AJUSTEs de corrección, **solo sobre productos que él creó**.
- **SALIDA jamás** — la única salida de stock es una venta o el admin.
- Motivo obligatorio; todo queda en `movimientos_stock` + historial.
- Sin ventana temporal: la mercadería llega en partes (días seguidos) y el
  vendedor corrige sus propios errores de carga.

---

## Orden de trabajo aplicado

1. **Hallazgo 1** (0016) — el que rompe el contrato de confidencialidad.
   **Requiere re-testeo con un usuario vendedor real antes de mergear.**
2. **Permisos** (0017) — campañas para marketing, alta de productos para el
   vendedor. Incluye los hallazgos 5, 10 y 11.
3. **Hallazgo 2** (0018) — comisión por ítem. Toca plata; sin efecto retroactivo.
4. **Hallazgos 3, 4, 6, 7** (0019) — fixes operativos e higiene.
5. **UX didáctica** — manual en el header y ayuda contextual en 17 pantallas.
