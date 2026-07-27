# BEXA · Manual de usuario

Sistema de gestión de BEXA Import.
Última actualización: 2026-07-16.

> ⚠️ **Este archivo ya no es la fuente de verdad.**
> El manual que leen los empleados vive **dentro del sistema**, en `/manual`, y su
> contenido está en `lib/manual/contenido.ts`. Editá ahí — este `.md` queda como
> referencia histórica y para lectura offline.

---

## Índice

1. [Bienvenida](#1-bienvenida)
2. [Los tres roles](#2-los-tres-roles)
3. [Ingresar al sistema](#3-ingresar-al-sistema)
4. [El Panel — tu pantalla principal](#4-el-panel--tu-pantalla-principal)
5. [Ventas](#5-ventas)
6. [Cobranzas](#6-cobranzas)
7. [Compras](#7-compras)
8. [Clientes](#8-clientes)
9. [Productos](#9-productos)
10. [Proveedores](#10-proveedores)
11. [Listas de precios y descuentos](#11-listas-de-precios-y-descuentos)
12. [Caja y gastos](#12-caja-y-gastos)
13. [Finanzas y contabilidad](#13-finanzas-y-contabilidad)
14. [Comisiones](#14-comisiones)
15. [Alertas](#15-alertas)
16. [Seguimiento de clientes inactivos](#16-seguimiento-de-clientes-inactivos)
17. [Campañas de marketing](#17-campañas-de-marketing)
18. [Historial](#18-historial)
19. [Configuración](#19-configuración)
20. [Usuarios](#20-usuarios)
21. [Buenas prácticas](#21-buenas-prácticas)
22. [Preguntas frecuentes](#22-preguntas-frecuentes)
23. [Contacto de soporte](#23-contacto-de-soporte)

---

## 1. Bienvenida

BEXA es tu sistema de gestión integral: cargás ventas, controlás stock, seguís cobros, medís campañas y todo queda registrado en un solo lugar. Está pensado para que funcione en la computadora del local y en el celular del vendedor por igual.

**Tres conceptos que te van a ahorrar tiempo antes de arrancar:**

- **Todo lo importante deja huella.** Cada venta, compra, cobro, gasto y cambio de estado se guarda en el historial. Nunca vas a perder de dónde salió un movimiento.
- **Los IDs con prefijo** (`VTA-0001`, `CLI-0042`, `PROD-0135`) son los que usamos para hablar con el cliente. Son cortos y no cambian nunca.
- **La plata solo se mueve por acciones explícitas.** Cargar un producto no toca caja. Registrar una venta cobrada, sí. Registrar un gasto, sí. Esto evita sorpresas contables.

---

## 2. Los tres roles

Cada usuario tiene un rol que define qué puede hacer.

### 👑 Admin (dueño / gerente)

Ve y hace **todo**: ventas de todos los vendedores, caja, gastos, costos de productos, comisiones, configuración, alta de usuarios.

### 🛒 Vendedor (`colaborador` en el sistema)

- Vende y cobra sus propias ventas.
- Ve **solo sus ventas** y sus comisiones — no las de otros vendedores.
- Ve el catálogo de productos **sin costo** (solo el precio de venta).
- Puede ver clientes, proveedores y campañas.
- **No** ve caja, gastos, finanzas, ni el costo de los productos.

### 📣 Marketing

- Crea y edita **campañas + publicaciones**.
- Ve clientes y el seguimiento de inactivos (a quién reactivar).
- Ve productos del catálogo (sin costo).
- **No** puede vender, comprar, ni ver plata (caja, gastos, comisiones).

> **Regla clave**: si un vendedor o marketing intenta abrir una URL a la que no tiene permiso, el sistema lo devuelve al Panel. No hay pantallas rotas.

---

## 3. Ingresar al sistema

1. Abrí `bexa-mayorista.vercel.app` (o el dominio que se les asigne).
2. Ingresá con tu **email** y **contraseña**.
3. Si olvidaste la clave, tocá "**Olvidé mi contraseña**" — te llega un email con el link para resetearla.

### Cerrar sesión

Botón **"Cerrar sesión"** arriba a la derecha, junto a tu nombre. Se recomienda cerrar sesión al terminar el día si compartís la máquina.

---

## 4. El Panel — tu pantalla principal

Es lo primero que ves al entrar. Cambia según tu rol.

### Franja de "Acciones rápidas"

Arriba de todo hay atajos según lo que podés hacer:
- Admin: 8 atajos (nueva venta, cobrar, nueva compra, nuevo gasto, nuevo cliente/proveedor/producto, nueva campaña).
- Vendedor: 3 atajos (nueva venta, cobrar, nueva campaña).
- Marketing: 1 atajo (nueva campaña).

### Búsqueda global

Presioná `Ctrl+K` (o `Cmd+K` en Mac) desde cualquier pantalla para abrir el buscador. Buscá por:
- ID (`VTA-0012`, `CLI-0007`)
- Nombre de cliente / producto / proveedor
- Nombre de una campaña
- Número de factura de una compra

Aparecen los resultados filtrados por tu rol.

### KPIs del día / semana / mes

- **Admin**: saldo de caja, vendido hoy/semana/mes, cobrado y por cobrar.
- **Vendedor**: solo lo tuyo, más tu comisión de la semana en curso.
- **Marketing**: campañas activas y programadas + clientes para reactivar.

### Alertas activas

Si hay stock bajo, saldos vencidos o entregas atrasadas, aparece un banner ámbar arriba con el conteo. Al hacer clic te lleva a **Alertas**.

---

## 5. Ventas

### Registrar una venta nueva

1. Panel → **"Nueva venta"** (o sidebar Operación → Ventas → **"Nueva venta"**).
2. Elegí el **cliente**.
   - Si es un cliente eventual, elegí `CLI-0000 · Consumidor Final`.
   - Si el cliente tiene lista de precios asignada, se aplica automáticamente.
3. Elegí el **estado de entrega**:
   - **Entregada**: venta directa en el local. Sale el stock ya.
   - **Pedido**: ya cobraste o vas a cobrar, pero el cliente todavía no se lleva la mercadería.
   - **En preparación**: pedido en armado.
   - En los tres casos el **stock sale ya** (reserva) — el estado es solo información logística.
4. Elegí una **campaña** (opcional): si la venta viene de una promoción, marcala. Impacta las métricas de esa campaña. Aparece solo si hay campañas activas.
5. Agregá **productos** con el botón `+ Agregar`:
   - Por cada línea: elegís producto, cantidad, y el sistema calcula el precio **en vivo** (lista del cliente + reglas de descuento).
   - Si el precio cambia por descuento, ves el % aplicado.
6. Revisá el **total** y tocá **"Registrar venta"**.

**Qué pasa detrás**:
- Baja el stock (una salida por producto).
- Se calcula la comisión del vendedor si corresponde.
- Todo en una sola operación atómica: si algo falla, nada se guarda.

### Ver ventas

Sidebar → **Ventas**.

- **Admin** ve todas.
- **Vendedor** ve solo las suyas (RLS del sistema — no es solo un filtro visual, la base de datos lo garantiza).

Filtros disponibles: búsqueda, estado de cobro, estado de entrega.

### Cancelar una venta

Desde el detalle de la venta, botón **"Cancelar venta"** (arriba).
- Vendedor: solo puede cancelar sus propias ventas y **si no cobró nada** todavía.
- Admin: puede cancelar cualquier venta.
- **La cancelación repone el stock** con entradas compensatorias (no borra el movimiento original — queda registro).

---

## 6. Cobranzas

### Cobrar una venta

Desde el detalle de la venta (`/ventas/VTA-XXXX`), sección **"Cobrar"**:

1. Ingresá el **monto** cobrado.
2. Elegí el **método de pago** (efectivo, transferencia, tarjeta, MP, cheque).
3. Podés agregar una **descripción** (ej. "seña 50%").
4. Tocá **"Registrar cobro"**.

**Cobros parciales**: si el cliente pagó una parte, el estado pasa a **PARCIAL**. Podés seguir cobrando hasta llegar al total (estado **COBRADA**).

**Cada cobro es un ingreso en caja**. Aparece en el módulo Caja como origen `COBRO_VENTA`.

### Ver saldos pendientes

Sidebar → **Ventas** → filtro `Cobro = PENDIENTE` o `PARCIAL`.

O más directo: **Alertas** te muestra los saldos vencidos según los días que definiste en configuración (por defecto 30).

---

## 7. Compras

**Solo admin puede comprar.**

### Registrar una compra recibida

1. Sidebar → **Compras** → **"Nueva compra"**.
2. Elegí el **proveedor**.
3. Cargá el **N° de factura** del proveedor (opcional, útil para conciliar).
4. **Fecha de la compra**: dejala vacía para usar hoy. Si estás cargando una factura vieja, poné la fecha real.
5. Agregá **líneas** con cantidad y **costo unitario**.
   - Si el costo unitario cambia respecto al catálogo, el sistema te avisa — al confirmar, actualiza el costo del producto al último pagado.
6. **Producto nuevo desde acá** (carga rápida): si estás cargando una compra y aparece un producto que todavía no está en el catálogo, tocá **"Producto nuevo"** en el header de ítems. Con **nombre + costo** alcanza. El producto se crea con **precio de venta en cero**, marcado como `incompleto`, y hereda el proveedor de esa compra. Después completá el precio desde Productos.
7. Tocá **"Registrar compra"**.

**Qué pasa detrás**:
- Sube el stock de cada producto (una entrada por línea).
- Actualiza el costo del producto al último pagado.
- NO toca caja (el pago al proveedor es una operación separada — se registra manualmente con un movimiento de caja o gasto si se paga en efectivo).

### Cancelar una compra

Solo admin. Repone stock con salidas compensatorias. **Si ya vendiste más de lo que había, la cancelación falla** — hay que hacer un ajuste de stock manual antes.

---

## 8. Clientes

### Crear un cliente

1. Sidebar → **Clientes** → **"Nuevo cliente"**.
2. Elegí el **tipo**:
   - **Minorista**: se muestra por nombre + apellido.
   - **Mayorista**: se muestra por razón social.
3. Completá los datos que tengas. Solo el nombre es obligatorio.
4. Si vas a asignarle una **lista de precios**, elegila del dropdown (aparecen las activas).
5. Al tocar **"Crear cliente"** aparece una **confirmación con el resumen** de los datos cargados — repasá antes de confirmar. Sirve para no crear duplicados por typos.

### Ver, editar, desactivar

- Lista con búsqueda por ID, nombre, CUIT/DNI, teléfono.
- Filtro por estado (activos / inactivos / todos).
- Desde el detalle podés editar todo. **No borramos clientes** — los desactivamos (el historial de ventas se preserva).

---

## 9. Productos

### Crear un producto

Sidebar → **Productos** → **"Nuevo producto"** (solo admin).

Campos importantes:

- **Nombre, SKU, marca, categoría**: para búsqueda y filtros.
- **Proveedor**: quién lo suministra.
- **Costo**: solo lo ve el admin. **NO registra plata en caja** — es un dato del catálogo. Si querés comprar mercadería con plata, usá Compras.
- **Precio base**: el minorista. Las listas de precios lo overridean por lista.
- **Comisión (%)**: opcional, override sobre el default global.
- **Stock actual y mínimo**: si el actual queda ≤ mínimo, aparece en Alertas.

### Ver la lista de productos

Filtros: búsqueda, categoría, proveedor, stock (bajo), estado.

En la fila vas a ver:
- **ID + nombre**. Si dice `incompleto` (ámbar), significa que fue cargado rápido desde una compra y **falta el precio de venta**. Editalo cuanto antes.
- Columnas: marca, categoría, proveedor, costo (solo admin), precio base, stock actual/mínimo, estado.
- Si el stock está por debajo del mínimo, aparece con un triángulo ámbar.

### Ajustar stock manualmente

Desde el detalle del producto, sección **"Ajustar stock"**. Solo admin.

Tipos de movimiento:
- **AJUSTE_POSITIVO**: aparecieron unidades (recuento, error de carga).
- **AJUSTE_NEGATIVO**: se perdieron unidades (rotura, robo, error).

Los ajustes quedan en el historial de movimientos. **Los movimientos son inmutables** — no se editan ni se borran. Para corregir uno, hacé otro movimiento en sentido contrario.

---

## 10. Proveedores

### Crear un proveedor

Sidebar → **Proveedores** → **"Nuevo proveedor"** (admin y vendedor).

Datos: nombre, CUIT, contacto, teléfono, WhatsApp, email, dirección, ciudad, provincia, condiciones de pago, notas.

Al confirmar aparece la **confirmación con resumen** — repasá los datos antes de crear.

Los proveedores se referencian desde **productos** (quién lo provee) y desde **compras** (a quién le compraste).

---

## 11. Listas de precios y descuentos

**Solo admin.** Sidebar → Comercial → **Listas de precios**.

### Concepto

Cada lista tiene:
- **Ítems**: precio específico para ciertos productos (override del `precio_base`).
- **Reglas de descuento**: aplican solo cuando esta lista está activa en la venta.

Los clientes se asignan a **una lista** (o a ninguna, en cuyo caso usan el precio base).

### Reglas de descuento

Cada regla tiene:
- **Alcance**: `PRODUCTO` (un producto específico), `CATEGORIA` (todos los de una categoría), `GLOBAL` (cualquier producto).
- **Cantidad mínima**: se aplica desde X unidades.
- **Descuento %**.
- **Campaña** (opcional): si está atada a una campaña, **solo aplica cuando esa campaña está activa** (dentro de sus fechas y no pausada/cancelada).
- **Lista de precios** (opcional): si es null, aplica a cualquier lista (o a ninguna).

**Orden de prioridad** (de más específico a más general):
1. Descuento por producto atado a tu lista.
2. Descuento por producto sin lista.
3. Descuento por categoría atado a tu lista.
4. Descuento por categoría sin lista.
5. Descuento global atado a tu lista.
6. Descuento global sin lista.

Dentro de la misma prioridad, gana el que da **mayor descuento** para el cliente.

### Reglas generales

Botón **"Reglas generales"**: reglas que no están atadas a ninguna lista específica (aplican en todo el sistema).

---

## 12. Caja y gastos

**Solo admin.**

### Caja

Sidebar → Plata → **Caja**.

- Movimientos **append-only**: se registran ingresos y egresos, nunca se editan ni se borran.
- Para corregir un error, se hace un movimiento de **AJUSTE** (INGRESO o EGRESO según corresponda).
- Origen del movimiento: `COBRO_VENTA`, `PAGO_COMPRA`, `GASTO`, `AJUSTE`, `APERTURA`, `OTRO`.

### Cargar un movimiento manual

Desde `/caja/nuevo`:
- Tipo (INGRESO / EGRESO).
- Origen.
- Monto.
- Método de pago.
- Descripción.

Útil para: apertura de caja, ajustes, movimientos que no salen de una venta/compra/gasto.

### Gastos

Sidebar → Plata → **Gastos**.

Un gasto es un EGRESO de caja con clasificación por **categoría** (Servicios, Sueldos, Alquiler, Logística, Impuestos, Otro — configurables).

Cargar un gasto:
1. `/gastos/nuevo`.
2. Elegí categoría.
3. Monto y descripción (obligatorios).
4. Fecha (default: hoy).
5. Método de pago.

Al confirmar se genera **atómicamente**: un movimiento EGRESO en caja + una fila en gastos. Aparece en Caja y en Finanzas.

### Categorías de gasto

Sidebar → Configuración → **Categorías de gasto**. Podés agregar, editar o desactivar categorías.

---

## 13. Finanzas y contabilidad

**Solo admin.**

### Finanzas (`/finanzas`)

Panel general de plata: saldo de caja, ventas del mes, cobrado, por cobrar, ticket promedio, ranking de vendedores.

### Contabilidad (`/contabilidad`)

Vista más detallada + exportación a CSV (con BOM UTF-8, se abre limpio en Excel argentino).

---

## 14. Comisiones

Sidebar → Plata → **Comisiones**.

- Se calculan al **registrar la venta** (no al cobrarla — decisión del cliente).
- Se agrupan por **semana ISO** (lunes a domingo).
- **Excluyen ventas canceladas** (si cancelás una venta, esa comisión no se liquida).
- **Admin**: ve todos los vendedores y sus semanas.
- **Vendedor**: ve solo las suyas.

**Porcentaje**: el que tiene el vendedor en su perfil (o el default global de configuración).

---

## 15. Alertas

**Solo admin.** Sidebar → Análisis → **Alertas**.

Muestra tres tipos:
- **Stock bajo**: productos donde `stock_actual <= stock_minimo`.
- **Saldos vencidos**: ventas con saldo pendiente hace más de N días (configurable).
- **Entregas atrasadas**: pedidos con más de 7 días en estado `PEDIDO` o `EN_PREPARACION`.

El banner del Panel resume el total.

---

## 16. Seguimiento de clientes inactivos

Sidebar → Análisis → **Seguimiento** (admin, vendedor y marketing).

Lista de clientes que **hace más de X días** no compran (default 60, configurable desde `/configuracion`).

Cada fila muestra: ID, cliente, contacto (WhatsApp priorizado sobre teléfono), última venta, días sin comprar, ventas totales, ticket promedio, facturado.

### Copiar mensaje de reactivación

Botón **"Copiar mensaje"** al final de cada fila:
- Copia al portapapeles un mensaje personalizado listo para pegar en WhatsApp.
- El template se edita desde `/configuracion` → "Mensaje de reactivación".
- Placeholders: `{cliente}` (nombre visible), `{negocio}` (nombre configurado), `{dias}` (días sin comprar).

---

## 17. Campañas de marketing

Sidebar → Marketing → **Campañas** (admin, vendedor y marketing).

### Crear una campaña

1. **Campañas** → **"Nueva campaña"**.
2. **Nombre y descripción**: qué es y para qué.
3. **Fechas** (inicio y fin): definen la ventana de actividad.
4. **Presupuesto estimado**: referencia visual.
5. **Canales de difusión**: Instagram, Facebook, WhatsApp, TikTok, Email, Otro (editables desde admin).
6. **Productos incluidos**: los que la campaña promociona. Sirve para **atribución automática de ventas**.
7. **Notas internas**.

### Estados

El sistema calcula el estado automáticamente por fecha (hora Argentina):
- **PROGRAMADA**: la fecha de inicio es futura.
- **ACTIVA**: hoy cae dentro del rango.
- **CONCLUIDA**: la fecha de fin ya pasó.

Vos podés overridear manualmente:
- **BORRADOR**: mientras la armás, no aplica descuentos.
- **PAUSADA**: temporalmente detenida (los descuentos atados a la campaña dejan de aplicar).
- **CANCELADA**: descartada.

### Atribución de ventas — dos formas

1. **Manual**: al registrar una venta, el vendedor elige la campaña en el dropdown. Cuenta como **venta manual** en las métricas.
2. **Automática**: el sistema busca ventas dentro de la ventana de la campaña que incluyan alguno de sus productos y que NO estén atribuidas manualmente. Cuentan como **ventas automáticas**.

No hay doble conteo — las manuales excluyen las automáticas de la misma campaña.

### Métricas

En el detalle de la campaña vas a ver:
- **Ventas atribuidas** (manuales + automáticas).
- **Monto vendido**.
- **Costo** (si vinculaste un gasto).
- **ROI %** = (monto vendido − costo) / costo × 100.
- **Ticket promedio**.
- **Métricas manuales** (impresiones, alcance, clicks, engagement): las cargás vos con datos de las plataformas de redes.

### Publicaciones

Dentro del detalle de la campaña, sección **"Publicaciones"**:
- Agregá el contenido de cada post (canal + título opcional + cuerpo).
- Estado: `BORRADOR`, `PROGRAMADA`, `PUBLICADA`, `CANCELADA`.
- El texto se copia y pega en la red correspondiente.
- (Las imágenes están planeadas para la próxima versión — MVP solo texto.)

### Calendario

Marketing → **Calendario** → vista mensual con todas las campañas como bloques coloreados por estado. Click en una campaña te lleva a su detalle.

### Descuentos por campaña

En una **regla de descuento** (Listas de precios → Reglas generales o dentro de una lista), podés atarla a una campaña. **Solo aplica** cuando esa campaña está ACTIVA.

---

## 18. Historial

**Solo admin.** Sidebar → Sistema → **Historial**.

Registro cronológico de todo lo que pasó en el sistema: altas, modificaciones, bajas, cambios de estado, cobros, gastos, ajustes de stock, notas del sistema.

Filtros: por tipo, entidad, usuario, rango de fechas.

Es tu **auditoría**. Si algo no cierra ("¿quién modificó este cliente?"), acá está.

---

## 19. Configuración

**Solo admin.** Sidebar → Sistema → **Configuración**.

Campos editables:

- **Nombre del negocio**: aparece en encabezados y mensajes.
- **Teléfono de contacto**: el público, para clientes.
- **Dirección**.
- **Moneda por defecto**: ARS o USD.
- **Mensaje de reactivación**: template para copiar desde Seguimiento. Usá `{cliente}`, `{negocio}`, `{dias}`.
- **Días sin comprar para marcar cliente inactivo**: umbral del módulo Seguimiento. Default 60.

Otras configuraciones internas (prefijos de ID, comisión default, alertas) están seteadas en la base y no se tocan salvo migración.

### Categorías de gasto

Subseccion aparte (link en Configuración) — agregar/editar/desactivar categorías del módulo Gastos.

---

## 20. Usuarios

**Solo admin.** Sidebar → Sistema → **Usuarios**.

Lista de todos los usuarios del sistema (admin + vendedores + marketing).

### Crear un usuario

1. **"Nuevo usuario"**.
2. **Email**, **contraseña** (mínimo 8 caracteres), **nombre**.
3. **Rol**: Vendedor, Marketing o Admin.
4. La contraseña se la das vos y se la comunicás al usuario por WhatsApp / presencial.

### Editar

Podés cambiar nombre, rol y estado (activo/inactivo). **No podés cambiarte a vos mismo el rol** (protección anti-lockout).

### Desactivar

En vez de borrar, se desactiva. El usuario deja de poder ingresar pero su historial se preserva.

---

## 21. Buenas prácticas

- **Registrá las ventas apenas ocurren.** Cuanto más se demora, más se olvida y más difícil es reconstruir.
- **Cobros en el momento.** Si el cliente pagó, marcalo ya. Los saldos que se acumulan por olvido son los peores.
- **Ajustes de stock semanales.** Fijate un día a la semana para hacer inventario en frío y corregir con ajustes. Nunca modifiques directamente el stock.
- **Categorías de gasto**: usá siempre la más específica. "Otro" solo cuando no encaje.
- **Campañas cerradas**: cuando termina una campaña, cargá las métricas manuales de las redes (impresiones/clicks). Sin eso el ROI queda incompleto.
- **Precios de productos incompletos**: revisá la lista una vez por semana. Cualquier producto con badge `incompleto` es una venta que va a salir mal facturada.
- **Clientes inactivos**: revisá Seguimiento una vez por semana. Un mensaje a tiempo puede recuperar un cliente antes de que se vaya a la competencia.
- **Backups**: los hace Supabase automáticamente. Podés bajarte un dump manualmente desde el dashboard si necesitás un snapshot puntual.

---

## 22. Preguntas frecuentes

### "Cargué una venta y no aparece."
- Como vendedor solo ves las tuyas. Si buscabas la venta de otro vendedor, pedile al admin.
- Si sos admin y no aparece, revisá el filtro de estado (arriba de la tabla). Podés estar filtrando canceladas o cobradas.

### "El precio se calcula distinto al que esperaba."
- Fijate qué lista tiene asignada el cliente (aparece en el select de cliente al armar la venta).
- Revisá las reglas de descuento activas en Comercial → Listas de precios.
- Si hay una campaña activa, puede estar aplicando un descuento.
- En la fila de la venta, el sistema muestra el **origen del precio** (`lista+descuento_producto`, `precio_base+descuento_global`, etc).

### "Registré un cobro y no aparece en caja."
- Andá a Caja y filtrá por origen `COBRO_VENTA`. Debería estar ahí con la fecha del cobro.
- Si no aparece, avisá a soporte con el ID de la venta.

### "Quiero borrar un gasto que cargué mal."
- No se pueden borrar (append-only). Registrá un movimiento manual de **AJUSTE INGRESO** por el mismo monto en Caja para revertir el impacto, y cargá el gasto correcto.

### "Un producto tiene el stock mal."
- Ajustá con un movimiento AJUSTE_POSITIVO o AJUSTE_NEGATIVO desde el detalle del producto. Nunca modifiques el número directamente.

### "Necesito darle acceso al nuevo empleado."
- Sistema → Usuarios → Nuevo usuario. Elegí el rol correcto.

### "Un vendedor pide ver todas las ventas."
- No se puede — es una decisión del sistema (RLS a nivel de base de datos). Si necesita analizar, exportá el reporte vos como admin y compartilo.

### "El sistema está lento."
- Refrescá la página (F5). Si sigue lento, avisá a soporte con la hora exacta.

### "Un cliente me pidió su historial de compras."
- Detalle del cliente → sección "Últimas ventas". Podés exportarlo a CSV desde Contabilidad filtrando por ese cliente.

---

## 23. Contacto de soporte

**Eduardo Barreiro** — desarrollador del sistema.
Email: `eduardo.barreiro93@gmail.com`

Para reportar un problema, incluí:
- Qué estabas haciendo (paso a paso).
- Qué esperabas que pase.
- Qué pasó en su lugar.
- Screenshot si podés.
- Fecha, hora aproximada y usuario con el que estabas.

Los primeros 14 días desde la puesta en producción tenés **acompañamiento incluido**: cualquier duda o bug, respondemos en el día.

Después del período de acompañamiento, el soporte funciona bajo el plan mensual acordado (mantenimiento + nuevas features priorizadas).

---

**Fin del manual.**
Guardá esta página como favorito para consulta rápida.
