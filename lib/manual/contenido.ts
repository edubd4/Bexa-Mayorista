// ★ CONTENIDO DEL MANUAL DE USUARIO — dato, no JSX.
//
// El manual vive DENTRO del sistema (/manual) para que el empleado lo consulte
// sin salir de la app. Las secciones se filtran por rol igual que el sidebar:
// un vendedor no lee tutoriales de caja que no puede ejecutar.
//
// Regla de oro #1: los nombres de entidad salen de DOMINIO, no se hardcodean.
// Regla: lo que se documenta acá tiene que ser lo que el sistema HACE. Si una
// función cambia, esta es la primera parada.

import { ROL, type Rol } from "@/lib/constants"
import { DOMINIO } from "@/lib/dominio"

const D = DOMINIO

// ─── Modelo de contenido ─────────────────────────────────────────────────────

export type Paso = {
  /** Qué hace el usuario en este paso */
  titulo: string
  /** El detalle: qué ve, qué completa, qué pasa después */
  detalle: string
  /** Ruta interna si el paso arranca en una pantalla concreta */
  ruta?: string
}

export type Bloque =
  | { tipo: "texto"; parrafos: string[] }
  | { tipo: "pasos"; titulo: string; pasos: Paso[] }
  | { tipo: "lista"; titulo: string; items: string[] }
  | { tipo: "aviso"; nivel: NivelAviso; titulo: string; texto: string }
  | { tipo: "faq"; items: { pregunta: string; respuesta: string }[] }

export type NivelAviso = "info" | "ojo" | "cuidado"

export type CategoriaManual = "Arranque" | "Tutoriales" | "Metodología" | "Referencia"

export type SeccionManual = {
  slug: string
  titulo: string
  /** Una línea: qué resuelve esta sección */
  resumen: string
  categoria: CategoriaManual
  /** Roles que la ven. Sin definir = todos los roles. */
  roles?: Rol[]
  /** Minutos estimados de lectura — expectativa honesta para el empleado */
  minutos: number
  bloques: Bloque[]
}

const OPERATIVO: Rol[] = [ROL.ADMIN, ROL.COLABORADOR]
const SOLO_ADMIN: Rol[] = [ROL.ADMIN]

// ─── Secciones ───────────────────────────────────────────────────────────────

export const SECCIONES: SeccionManual[] = [
  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "primeros-pasos",
    titulo: "Primeros pasos",
    resumen: "Entrar al sistema, entender el panel y moverte rápido.",
    categoria: "Arranque",
    minutos: 4,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "BEXA es el sistema de gestión de la distribuidora. Todo lo que se vende, se compra, se cobra y se gasta se registra acá. No hay planilla paralela: si no está en el sistema, no pasó.",
          "Este manual está adentro del sistema a propósito. Cuando dudes de algo, entrá acá antes de preguntar — la respuesta está a un clic de donde estás trabajando.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Ingresar",
        pasos: [
          {
            titulo: "Abrí el sistema e ingresá con tu email",
            detalle:
              "Usás el email y la contraseña que te dio el admin. La cuenta es personal e intransferible: todo lo que hacés queda firmado con tu nombre en el Historial.",
            ruta: "/login",
          },
          {
            titulo: "Si olvidaste la contraseña",
            detalle:
              "Usá el link 'Olvidé mi contraseña' en la pantalla de login y seguí el mail que te llega. Si no llega, pedile al admin que te la resetee desde Usuarios.",
            ruta: "/olvide-contrasena",
          },
          {
            titulo: "Cerrá sesión al terminar",
            detalle:
              "Botón de salir abajo del menú lateral. Si compartís la computadora con otro empleado, esto no es opcional: las ventas quedan registradas a nombre de quien tiene la sesión abierta.",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Moverte por el sistema",
        pasos: [
          {
            titulo: "El menú lateral muestra solo lo tuyo",
            detalle:
              "El menú se arma según tu rol. Si no ves un módulo, no es un error: es que tu rol no lo usa. El detalle está en la sección 'Qué puede hacer cada rol'.",
          },
          {
            titulo: "Buscador global",
            detalle:
              "Ctrl+K (o Cmd+K en Mac) abre el buscador desde cualquier pantalla. Escribí un código (VTA-000123, CLI-000045), un nombre de cliente o de producto y saltás directo. Es el camino más rápido, aprendelo el primer día.",
          },
          {
            titulo: "El Panel es tu pantalla de inicio",
            detalle:
              "Muestra los números del día, de la semana y del mes, las últimas ventas y los accesos rápidos a lo que más usás. Empezá siempre el día acá.",
            ruta: "/panel",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Todos los códigos son rastreables",
        texto:
          "Cada registro tiene un código público: CLI para clientes, PROD para productos, VTA para ventas, COMP para compras, GST para gastos, MOV para movimientos de caja. Cuando reportes un problema, pasá el código — es la forma más rápida de encontrar el registro exacto.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "iniciar-el-dia",
    titulo: "Cómo iniciar el día",
    resumen: "La rutina de apertura, paso a paso, según tu rol.",
    categoria: "Metodología",
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Diez minutos de rutina al abrir evitan un día entero de corregir. Esta es la secuencia recomendada. No la improvises: hacela siempre en el mismo orden hasta que te salga sola.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Si sos Admin",
        pasos: [
          {
            titulo: "1 · Abrí el Panel y leé los números",
            detalle:
              "Ventas de ayer, de la semana y del mes. Saldo de caja. Si un número te sorprende, ese es el primer tema del día — no lo dejes pasar.",
            ruta: "/panel",
          },
          {
            titulo: "2 · Revisá Alertas",
            detalle:
              "Tres cosas te esperan acá: productos por debajo del stock mínimo, ventas con saldo vencido y entregas atrasadas de más de 7 días. Si hay stock bajo, ese es el pedido a proveedor de hoy.",
            ruta: "/alertas",
          },
          {
            titulo: "3 · Confirmá el saldo de caja contra la caja física",
            detalle:
              "Abrí Caja y compará el saldo del sistema con la plata real. Si no coincide, cargá un movimiento de AJUSTE con la explicación. No sigas el día con una diferencia sin explicar: mañana es imposible de reconstruir.",
            ruta: "/caja",
          },
          {
            titulo: "4 · Mirá Seguimiento",
            detalle:
              "Clientes que hace tiempo no compran. Elegí dos o tres y pasalos al vendedor para que los contacte hoy. Un cliente inactivo que nadie llama es un cliente perdido.",
            ruta: "/seguimiento",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Si sos Vendedor",
        pasos: [
          {
            titulo: "1 · Abrí el Panel",
            detalle:
              "Vas a ver tus ventas de la semana y tus comisiones acumuladas. Ese es tu tablero: sabés dónde estás parado antes de atender al primer cliente.",
            ruta: "/panel",
          },
          {
            titulo: "2 · Revisá tus ventas pendientes de cobro",
            detalle:
              "En Ventas, filtrá por estado de cobro PENDIENTE o PARCIAL. Esos son los clientes a los que hay que llamar hoy. Una venta sin cobrar todavía no es plata.",
            ruta: "/ventas",
          },
          {
            titulo: "3 · Revisá entregas en preparación",
            detalle:
              "Filtrá por estado de entrega PEDIDO o EN_PREPARACIÓN. Cuando entregues, cambiá el estado ahí mismo, desde la tabla. Si algo lleva más de una semana ahí, avisá al admin antes de que el cliente llame quejándose.",
            ruta: "/ventas",
          },
          {
            titulo: "4 · Mirá Seguimiento",
            detalle:
              "La lista de clientes que dejaron de comprar. Tenés un botón para copiar un mensaje de reactivación listo para mandar por WhatsApp. Dos llamados por día mueven el número del mes.",
            ruta: "/seguimiento",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Si sos Marketing",
        pasos: [
          {
            titulo: "1 · Abrí el Calendario de campañas",
            detalle:
              "Mirá qué campañas arrancan, están activas o terminan esta semana. Una campaña que arranca hoy necesita sus publicaciones cargadas hoy.",
            ruta: "/campanas/calendario",
          },
          {
            titulo: "2 · Actualizá métricas de las campañas activas",
            detalle:
              "Entrá a cada campaña activa y cargá las métricas del día anterior (impresiones, alcance, clicks). Las ventas se atribuyen solas; las métricas de redes las cargás vos.",
            ruta: "/campanas",
          },
          {
            titulo: "3 · Revisá Seguimiento",
            detalle:
              "Los clientes inactivos son la mejor audiencia para una campaña de reactivación. Cruzá esa lista con lo que estás por publicar.",
            ruta: "/seguimiento",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "El sistema trabaja en hora de Argentina",
        texto:
          "Las fechas de campañas y los cortes de día usan la hora local argentina. Una campaña que empieza el 20 arranca el 20 a las 00:00 de acá, no de Londres.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "cerrar-el-dia",
    titulo: "Cómo cerrar el día",
    resumen: "Rutina de cierre: caja cuadrada y nada colgado.",
    categoria: "Metodología",
    roles: SOLO_ADMIN,
    minutos: 3,
    bloques: [
      {
        tipo: "pasos",
        titulo: "Cierre diario",
        pasos: [
          {
            titulo: "1 · Cargá los gastos del día",
            detalle:
              "Todo lo que salió de caja: flete, combustible, sueldos, servicios. Cada gasto con su categoría. Un gasto que no se carga hoy se olvida para siempre.",
            ruta: "/gastos/nuevo",
          },
          {
            titulo: "2 · Abrí Caja: el Cierre del día ya está armado",
            detalle:
              "Caja se abre en HOY con el cierre listo: cuánto se vendió, cuánto entró por cada método de pago (efectivo, posnet, transferencia), cuánto salió y el neto. Verificá que cada cobro del día esté — si un vendedor cobró y no lo registró, acá se nota.",
            ruta: "/caja",
          },
          {
            titulo: "3 · Cuadrá el EFECTIVO contra el cajón",
            detalle:
              "Contá la plata física y comparala con \"Efectivo neto (contra el cajón)\" del Cierre — ese es el único número comparable con el cajón, porque el saldo general mezcla todos los métodos. Si hay diferencia, cargá un AJUSTE explicando el motivo. Nunca dejes la diferencia sin registrar.",
            ruta: "/caja/nuevo",
          },
          {
            titulo: "4 · Revisá Deudas y ganancia",
            detalle:
              "Mirá cuánto queda por cobrar y qué ventas dejaron más ganancia. Es el chequeo de que el día cerró en verde, no solo en movimiento. Para el CSV del contador, usá \"CSV del período\" en Caja.",
            ruta: "/finanzas",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Caja y gastos no se borran — los gastos se ANULAN",
        texto:
          "Los movimientos de caja y los gastos son inmutables por diseño: no se editan ni se eliminan. Un gasto mal cargado se ANULA desde la tabla de Gastos (botón Anular, con motivo): la plata vuelve a la caja con un ajuste y el gasto queda marcado, sin borrar nada. Si el gasto era real pero estaba mal cargado, registralo de nuevo con los datos correctos. Así la contabilidad siempre se puede auditar.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "tareas",
    titulo: "Tareas del equipo",
    resumen: "Tus tareas del día: qué te toca, cómo marcarlas y qué queda registrado.",
    categoria: "Tutoriales",
    minutos: 4,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Tareas es el sistema operativo del equipo: cada uno entra y ve qué le toca hoy, con su horario sugerido y su prioridad. Las diarias aparecen todos los días, las semanales su día, las mensuales su fecha — solas, no hay que cargarlas de nuevo.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "El circuito de una tarea",
        pasos: [
          {
            titulo: "1 · Abrí Tareas al arrancar el día",
            detalle:
              "Ahí está tu lista de hoy, ordenada por horario. Si una tarea tiene manual (el ícono de link), leelo antes de hacerla la primera vez.",
            ruta: "/tareas",
          },
          {
            titulo: "2 · Marcá 'En proceso' cuando la agarrás",
            detalle:
              "Un toque en el botón. El sistema guarda la hora real en que empezaste — no hace falta anotar nada.",
          },
          {
            titulo: "3 · Marcá 'Finalizada' cuando la terminás",
            detalle:
              "En el momento, no al final del día. La hora de cierre queda registrada y el admin ve el avance del equipo sin preguntar.",
          },
          {
            titulo: "4 · Las 'cuando corresponda' se registran al hacerlas",
            detalle:
              "Tareas como 'Enviar lista de precios' no tienen día fijo. Cuando la hacés, tocá 'La hago hoy' y marcala como cualquier otra.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "La hora la pone el sistema, no vos",
        texto:
          "Cada cambio de estado queda sellado con la hora real del momento en que lo marcaste. Marcar todo junto a las 20:00 se nota en la auditoría. Marcá en el momento y listo — es un toque.",
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "La conversación de cada tarea vive en la tarea",
        texto:
          "El globito de la fila abre los comentarios: dudas, avisos, 'faltó tal cosa' — todo queda escrito ahí, con quién lo dijo, a qué hora y quién lo leyó (✓✓). Mirá el color: GRIS y sin número es que no hay ningún mensaje; ROJO con un número son los mensajes sin leer que tenés esperando; VERDE con un número es que hay conversación y ya está leída. Además el Panel te avisa apenas entrás si tenés algo sin leer, y el globito está también en las tareas atrasadas y en la ficha de cada tarea. No hace falta escribirse por WhatsApp por cosas del trabajo: dejalo en la tarea, que mañana también sirve.",
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Para el admin",
        texto:
          "Vos ves el día completo del equipo agrupado por área, con las cards de arriba como filtros (tocá 'Atrasadas' y la tabla muestra solo eso). Desde la misma fila asignás el responsable y cambiás la frecuencia, sin entrar a la ficha. El cumplimiento de la semana — por día y por persona — lo tenés en el Panel, junto al resto de los números del negocio. Y la Auditoría guarda los horarios reales de inicio y fin de cada ejecución. Una tarea que ya no aplica se desactiva — el historial queda.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "cargar-productos",
    titulo: `Cargar ${D.productos.plural.toLowerCase()}`,
    resumen: "Alta de producto, stock inicial y qué significa cada campo.",
    categoria: "Tutoriales",
    // Admin y vendedor: los dos cargan productos. Marketing no carga catálogo.
    roles: OPERATIVO,
    minutos: 6,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "El producto es la base de todo: de él salen el precio, la ganancia, el stock y la comisión. Un producto mal cargado ensucia las ventas, los reportes y la caja. Vale la pena hacerlo bien la primera vez.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Alta de un producto nuevo",
        pasos: [
          {
            titulo: "1 · Andá a Productos y tocá 'Nuevo producto'",
            detalle: "El código PROD se genera solo. No lo escribís vos.",
            ruta: "/productos/nuevo",
          },
          {
            titulo: "2 · Nombre, categoría y marca",
            detalle:
              "El nombre es lo que ve el vendedor cuando busca. Sé específico: 'Taladro percutor 750W Bosch' encuentra mejor que 'Taladro'. La categoría importa de verdad: los descuentos por categoría se aplican con este campo, así que usá siempre la misma escritura.",
          },
          {
            titulo: "3 · Proveedor",
            detalle:
              "Enlazalo con el proveedor que te lo vende. Después podés ver todo lo que le comprás a cada uno desde su ficha.",
          },
          {
            titulo: "4 · Costo",
            detalle:
              "Lo que te sale a vos. Si sos vendedor podés cargarlo cuando das de alta el producto (vos sabés cuánto te salió), pero después NO vuelve a mostrarse: los costos del catálogo los ve solo el admin. Cargar el costo acá no mueve plata de la caja — para eso está Compras. Ojo: cada vez que registres una compra de este producto, el costo se actualiza automáticamente con el de esa compra.",
          },
          {
            titulo: "5 · Precio base",
            detalle:
              "El precio de venta por defecto. Es el que se usa si el cliente no tiene una lista de precios asignada. Si lo dejás en 0, el producto queda marcado como incompleto en la lista.",
          },
          {
            titulo: "6 · Comisión (solo admin)",
            detalle:
              "Vacío es lo normal: el producto paga el porcentaje que tenga el vendedor en su ficha. Si le cargás un número, ESTE producto paga ese porcentaje a cualquiera que lo venda, sin importar su ficha. Sirve para los productos donde el margen es distinto del promedio. Aplica a las ventas nuevas; las ya registradas no se tocan.",
          },
          {
            titulo: "7 · Stock mínimo",
            detalle:
              "Cuando el stock cae por debajo de este número, el producto aparece en Alertas. Ponelo pensando en cuánto tarda tu proveedor en reponer.",
          },
          {
            titulo: "8 · Guardá y cargá el stock inicial",
            detalle:
              "El producto nace con stock 0. Cargá el stock desde la ficha del producto con un movimiento de tipo ENTRADA y el motivo (por ejemplo 'Stock inicial'). Si sos vendedor, podés cargar y corregir el stock de los productos que diste de alta VOS — si la mercadería llega en partes, cargá una ENTRADA por cada tanda. El stock de los demás productos lo maneja el admin. Hasta que no tenga stock cargado, el producto no se puede vender.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Precios por cantidad: el tramo manda",
        texto:
          "Un producto puede tener un precio distinto según cuántas unidades se lleven, con tantos escalones como quieras. Se cargan en el MISMO formulario del producto (al crearlo o al editarlo), sección 'Precios por cantidad', y los carga el admin Y el vendedor. Cargás desde qué cantidad rige cada precio, y el precio va POR UNIDAD. Ejemplo: 1 → $10.000, 3 → $9.000, 5 → $8.000. Llevando 2 paga $10.000 cada una; llevando 4 paga $9.000 cada una; llevando 6 o 20, $8.000 cada una. Siempre se aplica el escalón más alto que la cantidad alcance. Dos cosas para tener en la cabeza: si un escalón aplica, ESE es el precio final — no se le suma la lista del cliente ni los descuentos (un solo beneficio por cantidad, así el precio siempre se puede explicar). Y si ponés un escalón 'desde 1', el precio base de arriba deja de usarse para ese producto.",
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Editar y eliminar productos",
        texto:
          "El vendedor puede editar cualquier producto del catálogo y eliminarlo. Dos aclaraciones. Primera: al editar no vas a ver el campo Costo — no es un error, los costos del catálogo los ve solo el admin; guardar tus cambios deja el costo como estaba. Segunda: 'Eliminar' borra el producto de verdad SOLO si nunca se usó (sin ventas, compras ni movimientos de stock). Si ya tiene movimientos, se da de baja y se conserva — borrarlo rompería las ventas viejas que lo mencionan. El sistema te avisa cuál de las dos cosas hizo.",
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Carga rápida desde una compra",
        texto:
          "Si estás cargando una compra y aparece un producto que todavía no existe, podés crearlo ahí mismo con nombre y costo. Queda con precio de venta en 0 y marcado como incompleto: acordate de volver a Productos y ponerle el precio antes de que un vendedor intente venderlo.",
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "El stock se corrige con AJUSTE, no se edita",
        texto:
          "Los movimientos de stock son inmutables: quedan para siempre. Si contaste mal, no borres nada — cargá un movimiento de tipo AJUSTE con la diferencia y el motivo. Así el historial explica por qué el número cambió.",
      },
      {
        tipo: "lista",
        titulo: "Antes de dar por cargado un producto, chequeá",
        items: [
          "Tiene precio base distinto de 0.",
          "Tiene costo cargado (si no, la ganancia del sistema va a mentir).",
          "La categoría está escrita igual que en los productos hermanos.",
          "Tiene stock mínimo definido, si no nunca va a avisarte que se está por acabar.",
          "El stock inicial quedó cargado como ENTRADA.",
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "registrar-venta",
    titulo: `Registrar una ${D.ventas.singular.toLowerCase()}`,
    resumen: "El flujo completo de una venta y todo lo que dispara.",
    categoria: "Tutoriales",
    roles: OPERATIVO,
    minutos: 8,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Registrar una venta es la operación más importante del sistema, y la que más cosas mueve de una sola vez. Entendé qué dispara antes de aprender dónde hacer clic.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Lo que pasa cuando confirmás una venta",
        items: [
          "Se descuenta el stock de cada producto, al instante (salvo los productos marcados 'sin control de stock': registran la cantidad pero no mueven stock).",
          "Se guarda el costo del producto en ese momento (así la ganancia histórica no cambia si mañana sube el costo).",
          "Se calcula tu comisión sobre el precio final de cada línea — con descuentos y bonificaciones ya aplicados.",
          "Queda registrada en el Historial con tu nombre.",
          "Si usaste 'Cobrar ahora', el cobro entra a la caja en el mismo acto. Si no, la venta nace PENDIENTE de cobro: todavía NO entró plata a la caja.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Paso a paso",
        pasos: [
          {
            titulo: "1 · Andá a Ventas y tocá 'Nueva venta'",
            detalle: "También lo tenés en los accesos rápidos del Panel.",
            ruta: "/ventas/nuevo",
          },
          {
            titulo: "2 · Elegí el cliente",
            detalle:
              "Buscá por nombre o razón social. Si es una venta de mostrador sin cliente identificado, usá 'Consumidor Final'. El cliente define el precio: si tiene una lista asignada, los precios salen de esa lista.",
          },
          {
            titulo: "3 · Agregá los productos",
            detalle:
              "Buscá cada producto y poné la cantidad. El precio se calcula solo y se actualiza en vivo mientras cambiás la cantidad — porque los descuentos por volumen dependen de cuánto lleva. No pelees con el precio: si te parece mal, mirá la sección 'Cómo se calcula el precio'.",
          },
          {
            titulo: "4 · Bonificá si lo negociaste (opcional)",
            detalle:
              "La columna 'Bonif %' es tu descuento manual, POR LÍNEA, encima del precio que calculó el sistema. Si le prometiste un porcentaje sobre toda la compra, usá 'Bonificar toda la venta': pone el mismo % en todas las líneas y después podés retocar una por una. La bonificación queda registrada en la venta — se ve quién bonificó y cuánto — y tu comisión se calcula sobre el precio ya bonificado.",
          },
          {
            titulo: "5 · Estado de entrega",
            detalle:
              "ENTREGADA si el cliente se lleva la mercadería ahora. PEDIDO o EN PREPARACIÓN si queda para entregar después. Cuando la entregues, actualizá el estado directo desde la tabla de Ventas — no hace falta entrar a la venta. Poné la verdad: las entregas atrasadas de más de 7 días saltan como alerta al admin.",
          },
          {
            titulo: "6 · Campaña (opcional)",
            detalle:
              "Si la venta vino de una campaña puntual, elegila. Así marketing puede medir el retorno real de lo que invirtió.",
          },
          {
            titulo: "7 · ¿Te pagan en el acto? Botón 'Cobrar ahora'",
            detalle:
              "Es el botón grande al pie del formulario — el camino normal: acá casi siempre se cobra en el momento. Abre la ventana de pago: ves el total, elegís el método a un toque (efectivo, transferencia, débito, crédito, Mercado Pago) y confirmás. Se registra la venta Y el cobro juntos — la plata entra a la caja al instante. Si el cliente paga después, usá 'Registrar sin cobrar', al lado: la venta queda pendiente y la cobrás desde la ficha cuando te paguen.",
          },
          {
            titulo: "8 · Notas y confirmar",
            detalle:
              "Cualquier cosa que el que venga después necesite saber. Si la facturación está configurada, abajo tenés 'Emitir factura al registrar' — el sistema ya te dice qué comprobante (A o B) le corresponde al cliente. Confirmás y el sistema te lleva al detalle de la venta con su código VTA.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Descuento y Bonif no son lo mismo",
        texto:
          "La columna 'Desc' es el descuento AUTOMÁTICO: lo aplican las reglas por volumen, categoría o campaña que armó el admin, y no se toca a mano. La columna 'Bonif %' es TU descuento manual: lo que negociaste con el cliente en el momento. Se pueden dar juntos: primero el sistema resuelve el precio con sus reglas, y tu bonificación se aplica encima de ese resultado.",
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "Si no hay stock suficiente, la venta no entra",
        texto:
          "El sistema no deja vender lo que no tenés (la excepción son los productos 'sin control de stock', que no validan disponibilidad). Si el stock del sistema no coincide con el depósito, avisá al admin para que haga el AJUSTE — no busques la vuelta para forzar la venta.",
      },
      {
        tipo: "pasos",
        titulo: "Cancelar una venta",
        pasos: [
          {
            titulo: "Entrá al detalle de la venta y usá 'Cancelar'",
            detalle:
              "Escribí siempre el motivo. El stock vuelve automáticamente al depósito con un movimiento de entrada compensatorio, y la comisión deja de contar para la liquidación.",
          },
          {
            titulo: "Quién puede cancelar",
            detalle:
              "El admin siempre. El vendedor solo puede cancelar sus propias ventas y únicamente si todavía no se cobró nada. En cuanto entró un peso, la cancelación es del admin.",
          },
          {
            titulo: "¿La venta tiene factura emitida? Primero la nota de crédito",
            detalle:
              "Una venta con factura autorizada por ARCA no se puede cancelar directo: el sistema te frena y te lo dice. El admin emite primero la nota de crédito (ver la sección 'Facturación electrónica') y recién después la venta se cancela normal.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "cobrar-venta",
    titulo: "Cobrar una venta",
    resumen: "Cómo se registra la plata que entra y qué mueve en caja.",
    categoria: "Tutoriales",
    roles: OPERATIVO,
    minutos: 4,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Vender y cobrar son dos cosas distintas y el sistema las trata así. La venta descuenta stock. El cobro mueve la caja. Hasta que no registrás el cobro, esa venta es una promesa, no plata.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Si te pagan en el acto, cobrá en el mismo registro",
        texto:
          "No hace falta registrar y después ir a buscar la venta para cobrarla. En 'Nueva venta' tenés el botón 'Cobrar ahora': elegís el método y el sistema registra la venta y el cobro juntos. El Mostrador hace lo mismo con 'Cobrar y cerrar'. Los pasos de abajo son para el otro caso — la venta a cuenta, que se cobra cuando el cliente paga.",
      },
      {
        tipo: "pasos",
        titulo: "Registrar un cobro",
        pasos: [
          {
            titulo: "1 · Abrí la venta",
            detalle:
              "Desde Ventas, o pegando el código VTA en el buscador global (Ctrl+K).",
            ruta: "/ventas",
          },
          {
            titulo: "2 · Usá el formulario de cobro",
            detalle:
              "Está en el detalle de la venta. Muestra el saldo pendiente arriba.",
          },
          {
            titulo: "3 · Monto y método de pago",
            detalle:
              "Podés cobrar todo o una parte. Elegí bien el método (efectivo, transferencia, débito, crédito, Mercado Pago): de eso depende que la caja física cuadre después.",
          },
          {
            titulo: "4 · Confirmá",
            detalle:
              "Se crea el ingreso en Caja y la venta cambia de estado sola: PARCIAL si quedó saldo, COBRADA si se saldó todo.",
          },
        ],
      },
      {
        tipo: "lista",
        titulo: "Reglas del cobro",
        items: [
          "No podés cobrar más que el saldo pendiente. El sistema lo rechaza.",
          "No se puede cobrar una venta cancelada.",
          "No se puede cobrar dos veces una venta ya saldada.",
          "El admin puede cobrar cualquier venta; el vendedor solo las suyas.",
          "Los cobros parciales son normales: cargá cada entrega de plata cuando ocurre, no al final.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Un cobro no se borra",
        texto:
          "Los movimientos de caja son inmutables. Si registraste un cobro equivocado, avisá al admin: se corrige con un movimiento de ajuste que lo compense, con la explicación escrita. Nunca intentes 'arreglarlo' cargando otra venta.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "facturacion",
    titulo: "Facturación electrónica (ARCA)",
    resumen: "Emitir la factura de una venta, imprimirla y anularla con nota de crédito.",
    categoria: "Tutoriales",
    roles: OPERATIVO,
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "La factura del sistema es una factura electrónica DE VERDAD: cada emisión se autoriza en ARCA en el momento y vuelve con su CAE (el código de autorización) y su código QR de verificación. No es un ticket interno.",
          "Facturar es opcional por venta: la venta registra stock, cobro y comisión igual, con o sin factura. El circuito facturado / sin facturar se ve separado en la lista de Ventas.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Qué comprobante sale — lo decide el cliente, no vos",
        items: [
          "El sistema elige la letra según la condición frente al IVA cargada en la ficha del cliente: Responsable Inscripto y Monotributista reciben Factura A; Consumidor Final y Exento reciben Factura B.",
          "Para Factura A el cliente necesita un CUIT válido en su ficha — sin CUIT el sistema no emite y te avisa.",
          "La Factura B imprime sola el bloque 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)' con el IVA contenido. Es obligatorio por ley — no lo saques ni lo tapes.",
          "Si el cliente te dice que 'la factura está mal', casi siempre es la condición de IVA de su ficha: corregila ahí ANTES de emitir, no después.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Emitir la factura",
        pasos: [
          {
            titulo: "1 · En el momento o después — las dos valen",
            detalle:
              "Al registrar la venta tenés 'Emitir factura al registrar' (también en el Mostrador). Si no la emitiste ahí, entrá al detalle de la venta cuando quieras y usá 'Emitir Factura A/B' — el botón ya te dice qué letra corresponde.",
          },
          {
            titulo: "2 · Confirmá y ARCA autoriza",
            detalle:
              "El sistema manda la solicitud y ARCA responde con el CAE. Desde ese momento el comprobante existe fiscalmente y queda guardado en la venta con su número, CAE y vencimiento.",
          },
          {
            titulo: "3 · Imprimila o verificala",
            detalle:
              "En el detalle de la venta: 'Ver / imprimir factura' abre el documento listo para imprimir en A4, y 'Verificar en ARCA' abre la página oficial donde cualquiera puede validar el QR.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Una factura con CAE no se toca",
        texto:
          "No se edita, no se borra, no se 'vuelve a hacer'. Si está mal — precio, cliente, lo que sea — el único camino legal es la nota de crédito, y la emite el admin. Por eso: revisá cliente y total ANTES de confirmar la emisión.",
      },
      {
        tipo: "pasos",
        titulo: "Anular una factura — nota de crédito (solo admin)",
        pasos: [
          {
            titulo: "1 · Entrá al detalle de la venta facturada",
            detalle:
              "Vas a ver el botón 'Emitir nota de crédito' junto al comprobante. Solo lo ve el admin: la nota de crédito baja el IVA declarado del negocio y no es una acción de vendedor.",
          },
          {
            titulo: "2 · Escribí el motivo — es obligatorio",
            detalle:
              "Devolución de mercadería, error de carga, lo que haya pasado. Queda impreso la referencia en el comprobante y registrado en el Historial. Ojo con el reloj: la norma da 15 días corridos desde el hecho para emitirla — no la dejes juntar polvo.",
          },
          {
            titulo: "3 · ARCA autoriza la nota — y recién ahí podés cancelar la venta",
            detalle:
              "La nota sale con la misma letra que la factura, con su propio CAE, identificando a la factura que anula. La factura queda marcada 'Anulada'. Si además hay que devolver mercadería y plata, ahora sí: 'Cancelar venta' repone el stock y devuelve el cobro por caja.",
          },
        ],
      },
      {
        tipo: "lista",
        titulo: "El recibo — comprobante para el cliente SIN factura",
        items: [
          "Toda venta activa tiene 'Ver / imprimir recibo' en su detalle: un comprobante en A4 con los productos, el total y, si el pago fue parcial, cuánto entregó y cuánto debe.",
          "No necesita ARCA: sale de los datos de la venta, así que funciona aunque la facturación electrónica no esté configurada todavía o el servicio esté caído.",
          "Es un documento NO fiscal — sale con letra X y la leyenda 'Documento no válido como factura'. Sirve como constancia de entrega y de cobro; NO reemplaza a la factura.",
          "Recibo y factura conviven en la misma venta: si el cliente además necesita factura, se emite igual que siempre.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "¿ARCA caído? La venta no se frena",
        texto:
          "Si ARCA no responde, registrá la venta igual — stock, cobro y comisión no dependen de ARCA. La factura la emitís después desde el detalle, cuando el servicio vuelva. Mientras tanto, el recibo le da al cliente su constancia.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "mostrador",
    titulo: "Mostrador (venta rápida)",
    resumen: "Escanear, cobrar y cerrar: la venta de mostrador en segundos.",
    categoria: "Tutoriales",
    roles: OPERATIVO,
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "El Mostrador es la caja registradora del sistema: pensado para el cliente que está parado adelante tuyo, pagando ya. Escaneás con el lector de código de barras, el carrito se arma solo, elegís el método de pago y cerrás. Una venta de mostrador tarda menos que escribir esta oración.",
          "Por dentro hace EXACTAMENTE lo mismo que una venta normal: descuenta stock, guarda el costo, calcula tu comisión y deja todo en el Historial. No es un circuito aparte — es el mismo, más rápido.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "El circuito completo",
        pasos: [
          {
            titulo: "1 · Abrí Mostrador",
            detalle:
              "El cursor queda esperando en el campo de escaneo. Dejalo ahí: el lector escribe como un teclado, y si el foco está en otro lado el código cae donde no debe.",
            ruta: "/pos",
          },
          {
            titulo: "2 · Escaneá los productos",
            detalle:
              "Cada escaneo agrega el producto al carrito; escanear el mismo producto de nuevo le suma 1 a la cantidad. El precio se resuelve en vivo con la lista del cliente y las reglas de descuento — igual que en una venta normal.",
          },
          {
            titulo: "3 · ¿Sin código de barras? Buscalo",
            detalle:
              "El buscador de al lado matchea por nombre o ID. Con el campo vacío, al hacer clic ya te despliega el catálogo. Tocás el producto y entra al carrito.",
          },
          {
            titulo: "4 · Ajustá cantidades si hace falta",
            detalle:
              "La cantidad se edita directo en la fila del carrito. Si un producto entró de más, lo sacás con el tachito.",
          },
          {
            titulo: "5 · Cliente",
            detalle:
              "Arranca en 'Consumidor Final', que es lo correcto para el mostrador. Si el que compra es un cliente con cuenta (y su lista de precios), elegilo — los precios se recalculan solos.",
          },
          {
            titulo: "6 · Método de pago y 'Cobrar y cerrar'",
            detalle:
              "Elegís el método, y si corresponde marcás 'Emitir factura'. 'Cobrar y cerrar' registra la venta, mete el cobro en la caja y deja el carrito listo para el próximo cliente. Arriba te queda el acceso a la venta cerrada y a imprimir la factura.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "¿Mostrador o Nueva venta?",
        texto:
          "Mostrador: cliente presente, paga ya, se lleva la mercadería. Nueva venta: todo lo demás — venta a cuenta, entrega para después, atribución a campaña, notas internas o bonificación manual. Si en el medio de una venta de mostrador el cliente te pide un descuento especial, pasate a Nueva venta: ahí tenés la columna Bonif % y el botón Cobrar ahora, que es el mismo cobro en el acto.",
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "El Mostrador SIEMPRE cobra en el acto",
        texto:
          "No existe la venta de mostrador pendiente de cobro: 'Cobrar y cerrar' registra venta y cobro juntos. Si el cliente se lleva mercadería sin pagar, eso es una venta a cuenta — registrala en Nueva venta, sin tocar 'Cobrar ahora', y cobrala cuando pague.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "cargar-compra",
    titulo: `Cargar una ${D.compras.singular.toLowerCase()}`,
    resumen: "Recepción de mercadería: sube el stock y actualiza el costo.",
    categoria: "Tutoriales",
    roles: SOLO_ADMIN,
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "La compra es el espejo de la venta: sube stock en vez de bajarlo. Se carga cuando la mercadería LLEGA, no cuando se pide.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Paso a paso",
        pasos: [
          {
            titulo: "1 · Andá a Compras y tocá 'Nueva compra'",
            detalle: "El código COMP sale solo.",
            ruta: "/compras/nuevo",
          },
          {
            titulo: "2 · Elegí el proveedor",
            detalle: "Tiene que estar activo. Si es nuevo, dalo de alta primero en Proveedores.",
            ruta: "/proveedores/nuevo",
          },
          {
            titulo: "3 · Número de factura y fecha",
            detalle:
              "La fecha es la de recepción real de la mercadería. Cargar el número de factura te salva cuando hay que reclamar algo.",
          },
          {
            titulo: "4 · Cargá los ítems con su costo unitario",
            detalle:
              "Producto, cantidad y lo que te costó cada unidad EN ESTA COMPRA. Si el producto no existe todavía, podés crearlo desde acá con nombre y costo.",
          },
          {
            titulo: "5 · Confirmá",
            detalle:
              "El stock de cada producto sube al instante y el costo del producto se actualiza con el costo de esta compra.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "La compra PISA el costo del producto",
        texto:
          "El sistema guarda el ÚLTIMO costo, no un promedio. Si comprás el mismo producto más caro que la vez pasada, el costo nuevo reemplaza al viejo y la ganancia de las ventas futuras se calcula con ese. Las ventas ya hechas no se tocan: cada una guardó su propio costo del momento. Consecuencia práctica: si cargás mal un costo, ese error se arrastra a la ganancia de todo lo que vendas después hasta que lo corrijas.",
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Cancelar una compra devuelve el stock",
        texto:
          "Si cancelás una compra, el stock que había entrado se resta de vuelta. Si ya vendiste parte de esa mercadería, vas a quedar con stock negativo o con un desfasaje. Cancelá compras solo si la mercadería efectivamente se devolvió.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "precios-y-descuentos",
    titulo: "Cómo se calcula el precio",
    resumen: "Listas, reglas, bonificaciones y por qué sale ese número.",
    categoria: "Referencia",
    roles: OPERATIVO,
    minutos: 7,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Esta es la pregunta que más se hace en todo sistema de gestión: '¿por qué me salió ese precio?'. La respuesta siempre es la misma secuencia. Aprendela y dejás de dudar.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Paso 1 · De dónde sale el precio unitario",
        pasos: [
          {
            titulo: "¿El cliente tiene lista de precios asignada?",
            detalle:
              "Si tiene lista Y esa lista tiene un precio cargado para ese producto → se usa el precio de la lista.",
          },
          {
            titulo: "Si no",
            detalle:
              "Se usa el precio base del producto. Sin lista, o con lista pero sin ese producto adentro, siempre cae al precio base.",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Paso 2 · Qué descuento se aplica encima",
        pasos: [
          {
            titulo: "Se buscan las reglas de descuento que apliquen",
            detalle:
              "Una regla aplica si está activa, si la cantidad que estás vendiendo llega al mínimo que pide la regla, y si corresponde al producto, a su categoría, o es global.",
          },
          {
            titulo: "Gana la regla más específica, no la más grande",
            detalle:
              "El orden de prioridad es: regla de PRODUCTO para esa lista → regla de PRODUCTO general → regla de CATEGORÍA para esa lista → regla de CATEGORÍA general → regla GLOBAL para esa lista → regla GLOBAL general. Se aplica UNA sola: la primera que gana. Los descuentos no se suman.",
          },
          {
            titulo: "Si la regla está atada a una campaña",
            detalle:
              "Solo se aplica si la campaña está vigente hoy (hora Argentina) y no está pausada, cancelada ni en borrador.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "Excepción: los precios por cantidad pisan todo lo anterior",
        texto:
          "Si el producto tiene precios por cantidad (escalones cargados en su ficha) y la cantidad alcanza un escalón, ESE es el precio — no se usa la lista del cliente ni se le aplican reglas de descuento. Un solo beneficio por cantidad, así el precio siempre se puede explicar. El detalle está en 'Cargar productos', sección 'Precios por cantidad'.",
      },
      {
        tipo: "pasos",
        titulo: "Paso 3 · La bonificación manual del vendedor (opcional)",
        pasos: [
          {
            titulo: "Se aplica ENCIMA del precio ya resuelto",
            detalle:
              "Cuando el vendedor negocia un descuento en el momento, lo carga en la columna 'Bonif %' de la venta (o con 'Bonificar toda la venta'). Ese porcentaje remata el precio que salió de los pasos 1 y 2 — no lo reemplaza, lo descuenta encima.",
          },
          {
            titulo: "Queda registrada y baja la comisión",
            detalle:
              "La bonificación se guarda línea por línea en la venta: en la ficha se ve separada del descuento automático ('bonif. -X%'). Y la comisión del vendedor se calcula sobre el precio ya bonificado — bonificar de más es regalar margen y comisión.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "El precio se recalcula en vivo",
        texto:
          "Mientras armás la venta, si cambiás la cantidad el precio se vuelve a calcular solo. Es normal que el precio unitario baje al subir la cantidad: se activó una regla por volumen o un escalón de precio por cantidad.",
      },
      {
        tipo: "lista",
        titulo: "Si el precio no es el que esperabas, chequeá en este orden",
        items: [
          "¿El producto tiene precios por cantidad y la cantidad alcanza un escalón? Ese escalón pisa la lista y las reglas.",
          "¿El cliente tiene la lista de precios correcta asignada en su ficha?",
          "¿Esa lista tiene cargado ese producto en particular?",
          "¿La cantidad llega al mínimo que pide la regla de descuento?",
          "¿La regla de descuento está activa?",
          "¿La categoría del producto está escrita igual que en la regla de categoría?",
          "Si la regla es de campaña: ¿la campaña está vigente y no pausada?",
          "¿Alguien cargó una bonificación manual en la columna Bonif %?",
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "listas-de-precios",
    titulo: "Administrar listas y descuentos",
    resumen: "Crear listas, cargar precios y armar reglas de descuento.",
    categoria: "Tutoriales",
    roles: SOLO_ADMIN,
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Las listas de precios existen porque no le vendés al mismo precio al mayorista, al minorista y al cliente de mostrador. Una lista es un conjunto de precios que se le asigna a un cliente.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Crear una lista",
        pasos: [
          {
            titulo: "1 · Nueva lista",
            detalle: "Ponele un nombre que se entienda solo: 'Mayorista', 'Ferreterías', 'Mostrador'.",
            ruta: "/listas-precios/nuevo",
          },
          {
            titulo: "2 · Cargá los precios producto por producto",
            detalle:
              "Solo cargás los productos que tienen precio diferencial. Los que no cargues usan el precio base — no hace falta cargar el catálogo entero.",
          },
          {
            titulo: "3 · Asignala a los clientes",
            detalle:
              "Desde la ficha de cada cliente. Un cliente sin lista compra al precio base.",
            ruta: "/clientes",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Armar una regla de descuento",
        pasos: [
          {
            titulo: "Elegí el alcance",
            detalle:
              "PRODUCTO (un producto puntual), CATEGORÍA (todos los de una categoría) o GLOBAL (todo el catálogo).",
          },
          {
            titulo: "Definí la cantidad mínima",
            detalle:
              "El descuento se activa a partir de esa cantidad en una misma venta. Es la palanca de venta por volumen.",
          },
          {
            titulo: "Definí el porcentaje",
            detalle: "El descuento que se aplica sobre el precio unitario.",
          },
          {
            titulo: "Atala o no a una lista",
            detalle:
              "Si la atás a una lista, solo aplica a los clientes de esa lista. Si la dejás general, aplica a todos.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "Las reglas no se suman, compiten",
        texto:
          "Si un producto entra en tres reglas a la vez, se aplica UNA sola: la más específica. Antes de crear una regla nueva, revisá qué reglas ya existen — si no, vas a estar debuggeando descuentos que 'no aparecen' cuando en realidad los está pisando una regla de producto.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "clientes",
    titulo: `${D.clientes.plural} y seguimiento`,
    resumen: "Alta de clientes, ficha y reactivación de los que se fueron.",
    categoria: "Tutoriales",
    minutos: 4,
    bloques: [
      {
        tipo: "pasos",
        titulo: "Dar de alta un cliente",
        pasos: [
          {
            titulo: "1 · Nuevo cliente",
            detalle:
              "Elegí si es persona o empresa. Si es empresa, cargá razón social y CUIT; si es persona, nombre y apellido.",
            ruta: "/clientes/nuevo",
          },
          {
            titulo: "2 · Datos de contacto",
            detalle:
              "El teléfono no es opcional en la práctica: es lo que usás para cobrar y para reactivar. Cargalo siempre.",
          },
          {
            titulo: "3 · Lista de precios (solo el admin)",
            detalle:
              "Asignale la lista que corresponda a su tipo de cliente. Este campo es el que define a qué precio le vas a vender de acá en adelante — por eso lo maneja solo el admin. Si sos vendedor no vas a ver este campo: cargá el cliente igual y pedile al admin que le asigne la lista.",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "El alta y la edición de clientes las hace también el vendedor",
        texto:
          "Dar de alta, editar y eliminar clientes lo pueden hacer el admin y el vendedor. Todo queda asentado en el historial con tu nombre. Lo único reservado al admin es la lista de precios del cliente.",
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Consumidor Final es un cliente del sistema",
        texto:
          "Ya viene creado para las ventas de mostrador sin cliente identificado. No se puede editar, desactivar ni eliminar, a propósito: media operación depende de que exista.",
      },
      {
        tipo: "texto",
        parrafos: [
          "Un cliente que ya compró NO se borra: se desactiva. Deja de aparecer para vender pero conserva todo su historial de compras. Es la única forma de que los números del pasado sigan siendo verdad.",
          "Si apretás 'Eliminar' sobre un cliente que nunca compró (lo cargaste con un typo, quedó duplicado), ahí sí se borra de verdad. El sistema decide solo cuál de las dos cosas corresponde y te lo dice.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Seguimiento de clientes inactivos",
        pasos: [
          {
            titulo: "La lista de los que dejaron de comprar",
            detalle:
              "El sistema arma solo la lista de clientes que hace tiempo no compran, ordenados por cuánto hace. No hay que salir a buscarlos: están acá.",
            ruta: "/seguimiento",
          },
          {
            titulo: "Copiar mensaje de reactivación",
            detalle:
              "Cada fila tiene un botón que te copia un mensaje armado, listo para pegar en WhatsApp. Es la tarea de mayor retorno por minuto que tenés disponible.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "caja-y-gastos",
    titulo: "Caja, gastos y finanzas",
    resumen: "Dónde vive la plata y cómo se corrige un error.",
    categoria: "Tutoriales",
    roles: SOLO_ADMIN,
    minutos: 5,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Caja es el registro de todo lo que entra y sale. La mayoría de los movimientos los genera el sistema solo: cuando cobrás una venta entra un ingreso, cuando cargás un gasto sale un egreso. Los movimientos manuales son para lo excepcional.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Qué mueve la caja automáticamente",
        items: [
          "Cobrar una venta → INGRESO con origen COBRO_VENTA.",
          "Registrar un gasto → EGRESO con origen GASTO.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Movimiento manual",
        pasos: [
          {
            titulo: "Cuándo se usa",
            detalle:
              "Apertura de caja, un ajuste por diferencia de arqueo, o un ingreso/egreso que no encaja en ninguna otra categoría. Si el movimiento tiene una venta o un gasto detrás, NO lo cargues manual: cargá la venta o el gasto.",
            ruta: "/caja/nuevo",
          },
          {
            titulo: "Descripción obligatoria en la práctica",
            detalle:
              "Un movimiento manual sin explicación es un agujero en la contabilidad. Escribí qué pasó, con fecha y contexto.",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Cargar un gasto",
        pasos: [
          {
            titulo: "1 · Nuevo gasto",
            detalle: "Categoría, monto, descripción y método de pago.",
            ruta: "/gastos/nuevo",
          },
          {
            titulo: "2 · Si es publicidad, elegí la campaña",
            detalle:
              "El formulario tiene un campo Campaña. Si el gasto es la pauta de una campaña, elegila: el monto entra en el costo de esa campaña y el retorno se calcula solo. Cargalo UNA sola vez — acá o desde la ficha de la campaña, es el mismo registro.",
          },
          {
            titulo: "3 · Las categorías las administrás vos",
            detalle:
              "Se crean y desactivan desde Configuración. Tener categorías bien pensadas es lo que hace útil el reporte de fin de mes. La categoría 'Publicidad' es especial: es la única que Marketing puede usar.",
            ruta: "/configuracion/categorias-gasto",
          },
        ],
      },
      {
        tipo: "texto",
        parrafos: [
          "Finanzas te muestra el saldo, lo que falta cobrar ordenado por antigüedad, y las ventas que más ganancia dejaron. Contabilidad te arma el resumen del período y te lo exporta en CSV para el contador.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Nada de esto se borra",
        texto:
          "Movimientos de caja y gastos son append-only: quedan registrados para siempre. Un error se corrige con un movimiento compensatorio, nunca borrando. Es incómodo el primer mes y es lo que salva la auditoría todos los años siguientes.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "comisiones",
    titulo: "Comisiones",
    resumen: "Cómo se calculan y cuándo se liquidan.",
    categoria: "Referencia",
    roles: OPERATIVO,
    minutos: 3,
    bloques: [
      {
        tipo: "lista",
        titulo: "Cómo se calcula",
        items: [
          "La comisión se genera en el momento de registrar la venta, no cuando se cobra.",
          "Se calcula PRODUCTO POR PRODUCTO, sobre el precio final de cada línea (ya con el descuento aplicado).",
          "Para cada producto, el sistema busca el porcentaje en este orden y usa el primero que encuentra: 1) el porcentaje propio del producto, cargado en su ficha; 2) el porcentaje del vendedor, en su ficha de usuario; 3) el porcentaje por defecto de Configuración.",
          "Si no encuentra ninguno de los tres, ese producto no genera comisión.",
          "La comisión de la venta es la suma de lo que generó cada producto.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Por qué a veces el porcentaje de una venta es un número raro",
        texto:
          "Si en la misma venta hay productos con porcentajes distintos, el porcentaje que muestra la venta es el PROMEDIO de esa venta, no el de nadie en particular. Ejemplo: vendés un producto de $100.000 al 3% y otro de $100.000 al 5%; la comisión es $8.000 y la venta muestra 4%. En el detalle de la venta tenés el desglose línea por línea para ver de dónde sale cada peso.",
      },
      {
        tipo: "lista",
        titulo: "Cómo se liquida",
        items: [
          "La liquidación es semanal, de lunes a domingo.",
          "Las ventas canceladas NO cuentan para la liquidación.",
          "El vendedor ve sus comisiones semana a semana en su Panel y en el módulo Comisiones.",
          "El admin ve las de todo el equipo.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "La comisión se calcula con el porcentaje del momento de la venta",
        texto:
          "Si el admin te cambia el porcentaje, el cambio aplica de ahí en adelante. Las ventas ya registradas conservan la comisión con la que se generaron.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "campanas",
    titulo: `${D.campanas.plural} de marketing`,
    resumen: "Crear una campaña, publicaciones, métricas y retorno.",
    categoria: "Tutoriales",
    minutos: 6,
    bloques: [
      {
        tipo: "pasos",
        titulo: "Crear una campaña",
        pasos: [
          {
            titulo: "1 · Nueva campaña",
            detalle:
              "Nombre, objetivo, fecha de inicio y fecha de fin. Las fechas definen la ventana en la que la campaña está activa.",
            ruta: "/campanas/nueva",
          },
          {
            titulo: "2 · Canales",
            detalle: "Dónde se publica: Instagram, Facebook, WhatsApp, lo que uses.",
          },
          {
            titulo: "3 · Productos de la campaña",
            detalle:
              "Los productos que estás promocionando. Esto es lo que después permite atribuir ventas automáticamente.",
          },
          {
            titulo: "4 · Presupuesto estimado",
            detalle:
              "Lo que pensás gastar. Es una referencia: no mueve plata ni entra en el retorno.",
          },
          {
            titulo: "5 · Cargá los costos a medida que pagás",
            detalle:
              "En la ficha de la campaña, 'Costos de la campaña' → Cargar costo. Cada carga es un gasto REAL: sale de la caja igual que cualquier otro gasto y suma al costo de la campaña. Podés cargar todos los que quieras (la pauta de Instagram, el influencer, la impresión de folletos) — no es uno solo. Sin costos cargados, el retorno no se puede calcular y queda vacío.",
          },
        ],
      },
      {
        tipo: "lista",
        titulo: "Sobre los costos de la campaña",
        items: [
          "Los cargan el Admin y Marketing. El Vendedor los ve pero no los toca.",
          "Marketing solo puede cargar gastos de categoría de publicidad, y siempre imputados a una campaña.",
          "El gasto se carga UNA sola vez: desde la ficha de la campaña o desde Gastos eligiendo la campaña. Es el mismo registro — no lo cargues en los dos lados o vas a estar contando la plata dos veces.",
          "Si te equivocaste, no se edita: se ANULA (solo el Admin) y se carga de nuevo. La plata vuelve a la caja y el costo de la campaña baja solo.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Estados de una campaña",
        items: [
          "PROGRAMADA: la fecha de inicio todavía no llegó.",
          "ACTIVA: hoy está dentro de la ventana de fechas.",
          "CONCLUIDA: la fecha de fin ya pasó.",
          "El estado se calcula solo por fecha, salvo que lo fuerces a BORRADOR, PAUSADA o CANCELADA a mano.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Cómo se atribuyen las ventas",
        pasos: [
          {
            titulo: "Atribución manual",
            detalle:
              "El vendedor elige la campaña al registrar la venta. Es la más precisa: el cliente dijo explícitamente que venía por la promo.",
          },
          {
            titulo: "Atribución automática",
            detalle:
              "Si se vendió un producto de la campaña dentro de la ventana de fechas y la venta no fue atribuida a mano, se cuenta como automática. Es una estimación, no una certeza — tratala como tal.",
          },
        ],
      },
      {
        tipo: "texto",
        parrafos: [
          "Las métricas de redes (impresiones, alcance, clicks, engagement) se cargan a mano en la campaña. El sistema no se conecta con las redes: vos traés esos números y él los cruza con las ventas para darte el retorno.",
          "El calendario te muestra todas las campañas en el mes para que veas de un vistazo qué se solapa con qué.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Descuentos de campaña",
        texto:
          "Podés atar una regla de descuento a una campaña. El descuento se aplica solo mientras la campaña está vigente y no está pausada. Cuando la campaña termina, el precio vuelve solo — no hay que acordarse de desactivar nada.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "metodologia",
    titulo: "Metodología de trabajo",
    resumen: "Las rutinas y los acuerdos que hacen que el sistema sirva.",
    categoria: "Metodología",
    minutos: 6,
    bloques: [
      {
        tipo: "texto",
        parrafos: [
          "Un sistema de gestión no falla por el software: falla por la disciplina de carga. Estas son las reglas del equipo. No son sugerencias.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Las cinco reglas no negociables",
        items: [
          "1 · Se carga en el momento, no al final del día. La memoria miente, el sistema no.",
          "2 · Si no está en el sistema, no pasó. Nada de anotar en un papel 'para cargar después'.",
          "3 · Un error no se tapa, se corrige con un movimiento que lo explique.",
          "4 · Cada uno entra con su usuario. Siempre. Las ventas se firman solas con el nombre de quien tiene la sesión.",
          "5 · Ante la duda, se pregunta antes de cargar. Corregir cuesta diez veces más que preguntar.",
        ],
      },
      {
        tipo: "pasos",
        titulo: "Ritmo semanal recomendado",
        pasos: [
          {
            titulo: "Lunes · Planificación",
            detalle:
              "Revisar stock bajo y armar los pedidos a proveedores de la semana. Mirar las comisiones de la semana que cerró.",
            ruta: "/alertas",
          },
          {
            titulo: "Miércoles · Cobranzas",
            detalle:
              "Dedicar un bloque a los saldos pendientes ordenados por antigüedad. Cuanto más vieja la deuda, más difícil de cobrar.",
            ruta: "/finanzas",
          },
          {
            titulo: "Viernes · Reactivación",
            detalle:
              "Trabajar la lista de clientes inactivos. Objetivo mínimo: cinco contactos.",
            ruta: "/seguimiento",
          },
          {
            titulo: "Domingo o lunes temprano · Cierre",
            detalle:
              "Liquidar comisiones de la semana cerrada y revisar el resumen de contabilidad.",
            ruta: "/comisiones",
          },
        ],
      },
      {
        tipo: "pasos",
        titulo: "Ritmo mensual",
        pasos: [
          {
            titulo: "Cierre contable",
            detalle:
              "Exportar el CSV de Contabilidad para el contador. Revisar el total de gastos por categoría.",
            ruta: "/contabilidad",
          },
          {
            titulo: "Revisión de precios",
            detalle:
              "Con inflación, los precios base y las listas quedan viejos rápido. Fijate una fecha del mes y respetala.",
            ruta: "/listas-precios",
          },
          {
            titulo: "Limpieza de catálogo",
            detalle:
              "Desactivar productos que ya no se venden y clientes que se fueron de verdad. Un catálogo sucio hace lento a todo el equipo.",
            ruta: "/productos",
          },
        ],
      },
      {
        tipo: "aviso",
        nivel: "ojo",
        titulo: "El Historial existe y se mira",
        texto:
          "Cada alta, cambio, baja, cobro y gasto queda registrado con usuario y fecha. No es para vigilar a nadie: es para poder reconstruir qué pasó cuando un número no cierra. Saber que está ahí es lo que hace que todos carguen bien.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "roles",
    titulo: "Qué puede hacer cada rol",
    resumen: "La matriz de permisos, sin sorpresas.",
    categoria: "Referencia",
    minutos: 3,
    bloques: [
      {
        tipo: "lista",
        titulo: "Admin — el dueño o gerente",
        items: [
          "Ve y hace todo: ventas, compras, caja, gastos, finanzas y contabilidad.",
          "Es el único que ve los costos y la ganancia real.",
          "Administra proveedores, listas de precios y reglas de descuento. Productos y clientes los comparte con el vendedor.",
          "Crea usuarios, les asigna rol y porcentaje de comisión, y resetea contraseñas.",
          "Es el único que puede ajustar stock a mano y cancelar ventas ya cobradas.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Vendedor — el que está en el mostrador",
        items: [
          "Registra ventas y cobra las suyas.",
          "Da de alta, edita y elimina productos y clientes, con precios por cantidad incluidos.",
          "Ve el catálogo con precio y stock, pero NUNCA el costo ni la ganancia. Al editar un producto el campo Costo ni aparece: guardar deja el costo como estaba.",
          "No define la comisión de un producto ni la lista de precios de un cliente — eso es del admin.",
          "Ve sus comisiones, semana a semana.",
          "Trabaja la lista de seguimiento.",
          "No entra a caja, gastos, finanzas, contabilidad, compras ni configuración.",
        ],
      },
      {
        tipo: "lista",
        titulo: "Marketing — el que trae la demanda",
        items: [
          "Crea y gestiona campañas, publicaciones y métricas.",
          "Carga los costos de sus campañas: gastos de categoría publicidad, siempre imputados a una campaña. Eso sale de la caja y es lo que alimenta el retorno.",
          "Ve el calendario de campañas y el retorno de cada una.",
          "Consulta clientes y productos, y trabaja la lista de seguimiento.",
          "No registra ventas ni compras. No carga ni edita productos ni clientes.",
          "No anula gastos (eso devuelve plata a la caja: solo el admin) ni entra a finanzas o comisiones.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "info",
        titulo: "Los permisos se aplican en el servidor",
        texto:
          "No es que la pantalla 'esconda' el botón: la operación se rechaza del lado del servidor aunque alguien intente saltarse la interfaz. Si necesitás hacer algo que tu rol no permite, pedíselo al admin — no hay atajo.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "usuarios",
    titulo: "Administrar usuarios",
    resumen: "Alta, baja y contraseñas del equipo.",
    categoria: "Tutoriales",
    roles: SOLO_ADMIN,
    minutos: 3,
    bloques: [
      {
        tipo: "pasos",
        titulo: "Dar de alta un empleado",
        pasos: [
          {
            titulo: "1 · Nuevo usuario",
            detalle:
              "Nombre, email, contraseña inicial y rol. El empleado ya puede entrar: no hay mail de confirmación que esperar.",
            ruta: "/usuarios/nuevo",
          },
          {
            titulo: "2 · Cargale el porcentaje de comisión",
            detalle:
              "Si es vendedor y tiene un porcentaje distinto al general, cargalo en su ficha. Si lo dejás vacío, se usa el porcentaje por defecto de Configuración.",
          },
          {
            titulo: "3 · Mandale este manual",
            detalle:
              "El primer día, que lea 'Primeros pasos', 'Cómo iniciar el día' y el tutorial de su tarea principal. Media hora bien invertida.",
          },
        ],
      },
      {
        tipo: "lista",
        titulo: "Bajas y contraseñas",
        items: [
          "Para que alguien deje de tener acceso, desactivalo. Su historial y sus ventas quedan intactos.",
          "Eliminar un usuario es definitivo y solo tiene sentido si se cargó por error.",
          "No podés quitarte a vos mismo el rol admin, desactivarte ni eliminarte. Es a propósito: evita que la empresa se quede sin administrador.",
          "Si un empleado olvidó la contraseña, se la reseteás desde su ficha.",
        ],
      },
      {
        tipo: "aviso",
        nivel: "cuidado",
        titulo: "Una cuenta por persona",
        texto:
          "Nunca compartas una cuenta entre dos empleados. Si dos personas usan el mismo usuario, las ventas, las comisiones y el historial dejan de significar algo — y ya no vas a poder saber quién hizo qué.",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    slug: "preguntas-frecuentes",
    titulo: "Preguntas frecuentes",
    resumen: "Lo que más se pregunta, resuelto.",
    categoria: "Referencia",
    minutos: 7,
    bloques: [
      {
        tipo: "faq",
        items: [
          {
            pregunta: "Cargué una venta y no la encuentro en la lista.",
            respuesta:
              "Revisá los filtros de estado activos en la pantalla de Ventas — probablemente estés filtrando por un estado que no es el de tu venta. El camino más rápido: Ctrl+K y pegá el código VTA.",
          },
          {
            pregunta: "El precio que salió no es el que yo esperaba.",
            respuesta:
              "Casi siempre es una de tres: el cliente no tiene asignada la lista que vos creías, la cantidad no llega al mínimo que pide la regla de descuento, o hay una regla más específica pisando a la que esperabas. Mirá la sección 'Cómo se calcula el precio': está la secuencia exacta.",
          },
          {
            pregunta: "El cliente me pide un descuento. ¿Cómo lo cargo?",
            respuesta:
              "En la venta, columna 'Bonif %': ponés el porcentaje en la línea que corresponda, o usás 'Bonificar toda la venta' para aplicar el mismo % a todo. Es un descuento manual encima del precio del sistema, queda registrado en la venta y tu comisión se calcula sobre el precio ya bonificado. No toques el precio del producto ni inventes otra vuelta: la bonificación existe justamente para esto.",
          },
          {
            pregunta: "El cliente paga en el momento. ¿Registro y después cobro?",
            respuesta:
              "No hace falta: usá el botón 'Cobrar ahora' en la misma pantalla de la venta — elegís el método y se registran venta y cobro juntos. Y si es una venta de mostrador con el cliente adelante, directamente usá Mostrador, que siempre cobra en el acto.",
          },
          {
            pregunta: "Registré un cobro y la caja no lo muestra.",
            respuesta:
              "Refrescá la pantalla de Caja. Si sigue sin aparecer, verificá en el detalle de la venta que el cobro haya quedado registrado (el estado tiene que haber pasado a PARCIAL o COBRADA). Si el estado no cambió, el cobro no se guardó: volvé a cargarlo.",
          },
          {
            pregunta: "Cargué un gasto con el monto equivocado. ¿Lo borro?",
            respuesta:
              "No se puede, y está bien que sea así. Cargá un movimiento manual de caja que compense la diferencia, explicando en la descripción que corrige el gasto GST-xxxxx. La contabilidad tiene que poder auditarse: por eso nada se borra.",
          },
          {
            pregunta: "El stock de un producto está mal.",
            respuesta:
              "Contá el stock real y pedile al admin que cargue un movimiento de AJUSTE con la diferencia y el motivo. Solo el admin puede ajustar stock. No intentes arreglarlo cargando una venta o una compra falsa: ensucia la ganancia y la caja.",
          },
          {
            pregunta: "¿Por qué no veo el costo de los productos?",
            respuesta:
              "Porque tu rol no es admin. Los costos y la ganancia son información sensible del negocio y están restringidos a nivel servidor, no solo escondidos en pantalla. Es intencional.",
          },
          {
            pregunta: "Soy vendedor y quiero ver las ventas de todo el equipo.",
            respuesta:
              "Pedíselo al admin, que sí las ve. Si necesitás un dato puntual para atender a un cliente, el admin te lo pasa.",
          },
          {
            pregunta: "Entra un empleado nuevo. ¿Qué hago?",
            respuesta:
              "El admin lo da de alta en Usuarios con su rol y le carga el porcentaje de comisión si corresponde. Después, que lea este manual: 'Primeros pasos', 'Cómo iniciar el día' y el tutorial de su tarea principal.",
          },
          {
            pregunta: "Un cliente me pide su historial de compras.",
            respuesta:
              "Entrá a su ficha desde Clientes: ahí tenés todas sus ventas con fecha, total y estado de cobro.",
          },
          {
            pregunta: "¿Puedo cancelar una venta que ya cobré?",
            respuesta:
              "Solo el admin. Al cancelar, el sistema repone el stock Y devuelve la plata cobrada con un egreso de caja automático, usando el mismo método del último cobro — no hay que compensar nada a mano. Si la venta además tenía factura emitida, antes va la nota de crédito (la emite el admin).",
          },
          {
            pregunta: "Vendí y ahora el cliente devuelve la mercadería.",
            respuesta:
              "Si no se cobró nada ni se facturó, cancelá la venta: el stock vuelve solo. Si ya se cobró, la cancela el admin y el sistema devuelve la plata por caja automáticamente. Si además estaba facturada, el orden es: primero la nota de crédito (admin), después cancelar.",
          },
          {
            pregunta: "Facturé una venta con un error. ¿La puedo corregir?",
            respuesta:
              "No — una factura autorizada por ARCA no se edita ni se borra, nunca. El admin emite la nota de crédito desde el detalle de la venta (con el motivo), la factura queda anulada, y si hace falta se registra la venta de nuevo y se factura bien. Los detalles están en la sección 'Facturación electrónica'.",
          },
          {
            pregunta: "El sistema no me deja vender por falta de stock.",
            respuesta:
              "El sistema no permite vender lo que no figura en stock. Si en el depósito hay mercadería que el sistema no ve, falta cargar una compra o hacer un ajuste. Avisá al admin: no busques la vuelta.",
          },
          {
            pregunta: "¿Cada cuánto se pagan las comisiones?",
            respuesta:
              "Semanalmente, de lunes a domingo. Las ventas canceladas no cuentan.",
          },
          {
            pregunta: "Me olvidé la contraseña.",
            respuesta:
              "Usá 'Olvidé mi contraseña' en la pantalla de login. Si el mail no llega, pedile al admin que te la resetee desde tu ficha en Usuarios.",
          },
          {
            pregunta: "El sistema está lento.",
            respuesta:
              "Primero probá refrescar y revisar tu conexión. Si sigue lento, avisá indicando en qué pantalla concreta pasa y a qué hora — con eso se puede diagnosticar; con 'anda lento' no.",
          },
        ],
      },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Secciones que un rol puede leer. Sin rol definido en la sección = todos. */
export function seccionesPorRol(rol: Rol | undefined): SeccionManual[] {
  return SECCIONES.filter((s) => !s.roles || (rol && s.roles.includes(rol)))
}

export function buscarSeccion(slug: string): SeccionManual | undefined {
  return SECCIONES.find((s) => s.slug === slug)
}

export const CATEGORIAS: CategoriaManual[] = [
  "Arranque",
  "Tutoriales",
  "Metodología",
  "Referencia",
]

/** Una línea por categoría: para qué sirve el grupo. */
export const CATEGORIA_DESCRIPCION: Record<CategoriaManual, string> = {
  Arranque: "Lo primero que tenés que saber para empezar a trabajar.",
  Tutoriales: "Paso a paso de cada operación del sistema.",
  Metodología: "Las rutinas y acuerdos de trabajo del equipo.",
  Referencia: "Cómo funcionan las cosas por dentro y qué hacer cuando algo no cierra.",
}
