# Informe del sistema actual — antes de agregar COMBOS

> **Para qué sirve este informe:** entender cómo funciona hoy Fast Good, de punta a punta, antes de pasar de vender **platos sueltos** a vender **combos** (por ejemplo "Keto x10": el cliente elige 10 viandas de un menú de platos).
>
> **Cómo se armó:** leyendo el código y consultando la base **solo para leer** (nombres de columnas y cantidad de filas). No se cambió ningún archivo de código ni ningún dato.
>
> **Versión revisada:** rama `mejoras-fastgood`, commit `8ca1469` ("AGREGADO DE COMPRAS"), 14/10/2026. Los números de línea son los de ese momento: si después se edita un archivo, pueden correrse un poco.

---

## Índice

0. [Palabras que se usan en el informe](#0-palabras-que-se-usan-en-el-informe)
1. [La web del cliente, paso a paso](#1-la-web-del-cliente-paso-a-paso)
2. [El panel: admin, cocina y producción](#2-el-panel-admin-cocina-y-producción)
3. [Listar pedidos y armado: cómo se ven los platos de un pedido](#3-listar-pedidos-y-armado)
4. [Estados del pedido: dónde se cambian y quién](#4-estados-del-pedido)
5. [Impacto de los combos](#5-impacto-de-los-combos)
6. [Código complicado o repetido para simplificar en el refactor](#6-código-complicado-o-repetido)
7. [Resumen en una página](#7-resumen-en-una-página)

---

## 0. Palabras que se usan en el informe

| Palabra | Qué significa acá |
|---|---|
| **Plato** / **producto** / **vianda** | Lo mismo: una comida del menú. En la base es una fila de la tabla `productos`. |
| **Plan** | Un grupo de platos (ej: "MANTENIMIENTO", "SIN TACC"). Tabla `planes`. |
| **Categoría** | Un grupo de planes (ej: "Viandas Saludables"). Tabla `categorias`. |
| **Pedido** | Lo que compra un cliente. Tabla `pedidos` (la "cabecera": cliente, fecha, total, estado). |
| **Renglón del pedido** | Cada plato dentro del pedido. Tabla `pedido_detalles` (qué plato, cuántos, a qué precio). |
| **Ruta** / **endpoint** | Una dirección del servidor que el navegador llama, por ejemplo `POST /api/pedidos`. Vive en `server.js`. |
| **Renderizar** | Dibujar en pantalla (armar el HTML con los datos). |
| **localStorage** | Una "cajita" del navegador donde una página guarda texto y otra página lo puede leer después. |
| **Receta** | Qué insumos lleva un plato y cuánto. Tabla `producto_insumo`. |
| **Insumo** | Materia prima (harina, carne…). Tabla `insumos`, columna `stock_actual`. |
| **Stock de heladera** | Viandas ya cocinadas y guardadas. Columna `productos.stock_heladera`. |
| **RPC** / **función de la base** | Una función escrita en SQL dentro de Supabase que hace varias cosas juntas, "todo o nada". El servidor la llama con `supabase.rpc(...)`. |

---

## 1. La web del cliente, paso a paso

### 1.1 El recorrido completo, en un dibujo

```
 index.html (portada)                          pages/formulario.html                WhatsApp
┌───────────────────────────┐   "Confirmar"   ┌────────────────────────────┐  envía  ┌─────────────┐
│ Categorías → Planes →     │ ──────────────▶ │ Resumen del carrito +      │ ──────▶ │ Mensaje con │
│ Platos → Carrito lateral  │  (localStorage) │ datos de entrega y pago    │         │ el pedido   │
└───────────────────────────┘                 └────────────────────────────┘         └─────────────┘
        │ GET /api/v1/catalogo                        │ GET /api/barrios
        │ (una sola vez, al entrar)                   │ POST /api/pedidos  ← acá se crea el pedido
```

**No existe una pantalla para que el cliente consulte su pedido.** El recorrido termina cuando se abre WhatsApp con el resumen. El seguimiento lo hace el local por WhatsApp.

### 1.2 Qué archivos participan y en qué orden

| Paso | Pantalla | HTML | JS que la hace funcionar (en el orden en que se cargan) |
|---|---|---|---|
| 1 | Portada + categorías | `frontend/index.html` | `roles.js` → `auth.js` → `global.js` → `funciones.js` → `carrito.js` → `escape.js` → **`index.js`** → `animations.js` |
| 2 | Planes de una categoría | `frontend/index.html` (la misma página, cambia la vista) | **`index.js`** (`mostrarPlanes`) |
| 3 | Platos de un plan | `frontend/index.html` (acordeón dentro de la vista de planes) | **`index.js`** (`togglePlan`, `renderProductos`, `buildPlatoHTML`) |
| 4 | Carrito | panel lateral dentro de `index.html` (`#carrito`) | **`carrito.js`** + **`funciones.js`** (`gestionarCarrito`, `calcularTotales`, `persistirDatos`) |
| 5 | Checkout (datos de entrega) | `frontend/pages/formulario.html` | `fechas.js` → `funciones.js` → **`formulario.js`** |
| 6 | Confirmación | WhatsApp (sale de la web) | `formulario.js` (`redirigirAWhatsApp`) |
| — | ~~Consultar mi pedido~~ | **no existe** | — |

> **Hay un segundo catálogo que no se usa:** `pages/viandasSaludables.html` (con `productos.js` y `viandasSaludables.js`) hace lo mismo que la portada pero pidiendo los datos de a partes. **Ninguna página tiene un enlace hacia ella.** Ver sección 6.

### 1.3 Cada pantalla en detalle

#### Paso 1 — Portada y categorías (`index.html` + `index.js`)

| Qué muestra | De dónde salen los datos | Qué función lo dibuja |
|---|---|---|
| Banner, descripción de la empresa y **4 tarjetas de categoría fijas**: Viandas Saludables, Viandas Sin Gluten, Pastelería Saludable, **Combos Saludables** | Las 4 tarjetas están **escritas a mano en el HTML** (`index.html:103-130`), cada una con un `onclick="mostrarPlanes('Nombre')"` | Ninguna: es HTML fijo |
| (Invisible) todo el catálogo en memoria | **`GET /api/v1/catalogo`** (`server.js:485`), una sola vez al entrar | `init()` → `fetchCatalogo()` (`index.js:265`, `:25`) |

`GET /api/v1/catalogo` devuelve un "árbol": cada **categoría** con sus **planes activos**, y cada plan con sus **platos activos** (id, nombre, descripción, imagen, precio, descuento). El navegador lo guarda en `catalogoData` y arma un "diccionario" `categoriasMap` para buscar una categoría por su nombre.

> **Ojo:** como las tarjetas del HTML buscan la categoría **por nombre**, si alguien le cambia el nombre a una categoría en la base, su tarjeta deja de funcionar.

> **La categoría "Combos Saludables" ya existe**, pero hoy es una categoría común: tiene el plan "PROMO SEMANAL" con platos sueltos. No usa las tablas nuevas de combos.

#### Paso 2 — Planes de una categoría

| Qué muestra | De dónde salen los datos | Qué función lo dibuja |
|---|---|---|
| Título "Planes de …" y un **acordeón** con un botón por plan | De la memoria (`catalogoData`), **sin pedir nada al servidor** | `mostrarPlanes(nombreCategoria)` (`index.js:202`) → `buildPlanItem(plan)` (`index.js:165`) por cada plan |

#### Paso 3 — Platos de un plan

| Qué muestra | De dónde salen los datos | Qué función lo dibuja |
|---|---|---|
| Una tarjeta por plato: foto, nombre, descripción, precio (con el descuento tachado si tiene), un contador − 1 + y el botón "Agregar al carrito" | De la memoria | `togglePlan` (`index.js:143`) → `renderProductos` (`:88`) → `buildPlatoHTML` (`:61`) y `renderPrecio` (`:37`) |
| Los botones − / + / Agregar | — | `attachPanelEvents` (`index.js:101`): un solo "escuchador" para todo el panel |

Al tocar **Agregar al carrito**, `index.js:127` llama a `agregarItemAlCarrito(producto, cantidad)` (de `carrito.js`), pasándole el precio **ya con el descuento aplicado** (`precioEfectivo`, `index.js:54`).

#### Paso 4 — El carrito (`carrito.js` + `funciones.js`)

**Dónde se guarda:**

| Momento | Dónde está el carrito | Qué pasa si recargás la página |
|---|---|---|
| Mientras elegís platos | En una **variable de JavaScript** (`let carrito = []`, `carrito.js:11`), en la memoria de la página | **Se pierde** |
| Al tocar "Confirmar Pedido" | Se copia a **localStorage** con la clave `FG_CARRITO_ACTUAL` (`carrito.js:112`) | Queda guardado para la página siguiente |
| Al terminar el pedido | `formulario.js` borra `FG_CARRITO_ACTUAL` (`formulario.js:159`) | — |

**Qué datos tiene cada elemento del carrito** (lo arma `gestionarCarrito`, `funciones.js:9`):

| Campo | Ejemplo | Para qué |
|---|---|---|
| `producto_id` | `17` | Identificar el plato |
| `nombre` | `"fideos"` | Mostrarlo |
| `precio` | `13500` | Precio unitario **ya con descuento** |
| `cantidad` | `2` | Cuántas viandas |
| `subtotal` | `27000` | `precio × cantidad` |

**Reglas del carrito:**
- Si agregás un plato que ya está, **se suma a la cantidad** (no aparece dos veces). Esto lo decide `gestionarCarrito` buscando por `producto_id`.
- `actualizarVistaCarrito` (`carrito.js:69`) dibuja la lista ("fideos x2 - $27000 ❌") y el número del ícono (`calcularTotales`, `funciones.js:38`).
- `eliminarDelCarrito(indice)` saca un renglón entero.
- `confirmarPedido()` (`carrito.js:106`) controla que no esté vacío, lo guarda en localStorage y te lleva a `/pages/formulario.html`.

> **El precio que ve el carrito es informativo.** El precio que se cobra lo vuelve a calcular el servidor (ver 1.4).

#### Paso 5 — Checkout (`pages/formulario.html` + `formulario.js`)

| Qué muestra | De dónde salen los datos | Qué función |
|---|---|---|
| Resumen "fideos × 2" | localStorage `FG_CARRITO_ACTUAL` | `mostrarResumenCarrito` (`formulario.js:121`) |
| Formulario: nombre, apellido, dirección, teléfono, email, fecha de entrega, forma de pago (Efectivo / Transferencia), tipo de entrega (Delivery / Retiro en local), barrio, observaciones | Si el cliente inició sesión, se completa solo con sus datos de localStorage | `preLlenarFormulario` (`:52`) |
| Lista de barrios | **`GET /api/barrios`** (`server.js:2546`, pública) | `cargarBarrios` (`:70`) |
| Fecha mínima = 2 días hábiles después de hoy | Calculada en el navegador con `fechas.js` | `configurarFechaMinima` (`:33`) |

Al tocar **Finalizar Pedido**, `enviarFormulario()` (`formulario.js:318`):
1. Lee el carrito y los datos del formulario.
2. Controla que el carrito no esté vacío y que estén los datos obligatorios.
3. Arma el pedido (`armarObjetoPedido`, `:221`) y lo manda con **`POST /api/pedidos`** (`enviarPedidoAlServidor`, `:242`). **No manda el token de sesión**, aunque el cliente esté logueado.
4. Si sale bien: guarda una "comanda" en localStorage (que nadie lee, ver sección 6), borra el carrito y el formulario, y abre **WhatsApp** con el resumen (`redirigirAWhatsApp`, `:264`). El total y los precios del mensaje son **los que devolvió el servidor**.

> **Posible error (sin probar):** el select de barrio tiene `required` (`formulario.html:65`). Cuando se elige "Retiro en local", ese select se oculta pero sigue siendo obligatorio, y el navegador puede bloquear el envío del formulario sin mostrar el motivo. Conviene probarlo a mano.

### 1.4 Cómo se crea el pedido en el servidor (`POST /api/pedidos`, `server.js:715-862`)

Es una ruta **pública** (no pide sesión), con un límite de **5 pedidos cada 10 minutos por IP**.

**Lo que manda el navegador vs. lo que usa el servidor:**

| Campo que manda el navegador | ¿Lo usa el servidor? |
|---|---|
| `items: [{ producto_id, cantidad, precio, observaciones_plato }]` | Usa **solo** `producto_id` y `cantidad`. El `precio` y las `observaciones_plato` **se ignoran**. |
| `total` | **Se ignora** (lo recalcula). |
| `usuario_id` | **Se ignora**. El usuario sale del token; si no hay token, se usa "Consumidor Final". |
| `cliente_nombre`, `cliente_direccion`, `cliente_telefono`, `cliente_email`, `observaciones`, `fecha_entrega`, `metodo_pago`, `tipo_entrega`, `barrio_id` | Sí, después de validarlos. |

**Qué valida, en orden:**

| # | Qué controla | Si falla | Líneas |
|---|---|---|---|
| 1 | Que `items` sea una lista no vacía; cada `producto_id` entero y cada `cantidad` entera entre 1 y 100 | 400 | `730-741` |
| 2 | `metodo_pago` dentro de la lista cerrada (Efectivo, Transferencia, Tarjeta Débito, Tarjeta Crédito, Mixto) y `tipo_entrega` (Delivery, Retiro en local) | 400 | `744-749` |
| 3 | Largo máximo: nombre 100, dirección 200, teléfono 30, observaciones 500 | 400 | `750-755` |
| 4 | Fecha de entrega: formato AAAA-MM-DD, día hábil y al menos 2 días hábiles después de hoy (hora de Argentina) | 400 | `758-770` |
| 5 | Que cada plato exista, esté **activo** y tenga precio | 400 | `773-795` |

**Qué calcula y qué guarda:**

| Paso | Qué hace | Tabla | Líneas |
|---|---|---|---|
| Precio | Precio de lista con el descuento (%) aplicado: `precioFinal()` | — | `686`, `798-803` |
| Total | Suma de `cantidad × precio` de cada renglón | — | `804` |
| Cabecera | Inserta el pedido con estado **1 (Registrado)** y `pagado = false` | **`pedidos`** | `810-832` |
| Renglones | Inserta un renglón por plato: `id_pedido`, `id_producto`, `cantidad`, `precio_unitario` | **`pedido_detalles`** | `834-847` |
| Si fallan los renglones | Borra la cabecera "a mano" para no dejar un pedido vacío | `pedidos` | `843-846` |
| Respuesta | `{ pedido, total, items: [{ producto_id, nombre, cantidad, precio_unitario, subtotal }] }` (lo usa WhatsApp) | — | `849-861` |

**¿Descuenta stock al crear el pedido? No.** Ni insumos ni viandas de heladera. El stock se toca recién al **cambiar de estado** (sección 4).

> Las dos inserciones (cabecera y renglones) **no van en una sola transacción**: si el servidor se cae justo en el medio, puede quedar un pedido sin renglones. Para combos conviene pasar esto a una función de la base, "todo o nada" (ver sección 5).

---

## 2. El panel: admin, cocina y producción

Todas estas pantallas están en `frontend/pages/` (salvo `admin.html`), pasan por el guard de roles (`roles.js` + `guard.js`) y llaman al servidor con `apiFetch` (`api.js`), que agrega el token de sesión.

**Roles:** 1 Administrador · 2 Cocinero · 3 Repartidor · 4 Consumidor final · 5 Dueño · 6 Administrador del sistema.

### 2.1 Pantallas que tocan pedidos, platos o stock de viandas

| Pantalla (menú) | Archivos | Quién la ve | Qué muestra / qué permite | Rutas que usa |
|---|---|---|---|---|
| 🏠 **Inicio (Reportes)** | `admin.html` + `reportes.js` | 6, 5 | Indicadores (cantidad de pedidos, ingresos), gráficos por día, por estado, por barrio y **top 10 de platos más vendidos** | `GET /api/pedidos?desde&hasta` · `GET /api/reportes/productos-mas-vendidos` |
| 🧾 **Consultar Pedidos** | `pages/ConsultarPedidos.html` + `ListarPedidos.js` | 6, 5, 1 | Grilla de pedidos (por defecto los de la producción de hoy), filtros, **cambiar estado**, modal **Detalles** (los platos), modal **Pago**, **Anular** con PIN | `GET /api/estados` · `GET /api/pedidos` · `PUT /api/pedidos/:id/estado` · `GET /api/pedidos/:id/verificar-stock` · `PUT …/pago` · `PUT …/pagado` · `PUT …/transferencia-confirmada` · `POST …/anular` |
| 🥗 **Tareas de Cocina** | `pages/cocinero.html` + `cocinero.js` + `pedidosCocina.js` | 2 (6, 5, 1 solo miran) | Arriba: los **pedidos de clientes en preparación** (estado 2), un renglón por plato, con botón "✓ Listo". Abajo: los **pedidos a cocina** pendientes (producción para la heladera), con botón "Hecho" | `GET /api/cocina/tareas` · `PUT /api/pedidos/:id/listo-cocinero` · `GET /api/ordenes-produccion/pendientes` · `POST /api/ordenes-produccion/detalles/:id/hecho` |
| 🍳 **Producción** (heladera) | `pages/heladera.html` + `heladera.js` + `pedidosCocina.js` | 6, 5, 1, 2 | Tabla de platos con **cuántas viandas hay** (`stock_heladera`), el mínimo y su estado (Sin stock / Bajo / Bien / Sin control). Botones: **Pedir a cocina** (6, 5, 1), **Descartar**, ver pendientes y hechos de hoy. Panel de últimos movimientos. Se actualiza sola cada 60 s | `GET /api/viandas-stock` · `GET /api/movimientos-viandas` · `GET /api/ordenes-produccion/pendientes` · `GET /api/ordenes-produccion/hechos-hoy` · `POST /api/ordenes-produccion` · `POST /api/viandas-stock/descarte` |
| 📝 **Generar Receta** | `pages/generarReceta.html` + `generarReceta.js` | 6, 5 | Alta, edición y baja de **platos con su receta**, precio, descuento, imagen y cocinero | `GET/POST /api/recetas` · `DELETE /api/recetas/:id` · `POST /api/productos/con-receta` · `POST /api/productos/:id/imagen` · `PUT /api/productos/:id/cocinero` · `GET /api/v1/categorias…` · `GET /api/planes/:id/siguiente-codigo` · `GET /api/insumos` · `GET /api/cocineros` |
| 👨‍🍳 **Asignar Cocineros** | `pages/AsignarCocinero.html` + `AsignarCocinero.js` | 6, 5 | Qué cocinero hace cada plato | `GET /api/productos/cocineros` · `GET /api/cocineros` · `PUT /api/productos/:id/cocinero` |
| 🚗 **Envíos del Día** | `pages/Envios.html` + `Envios.js` | 6, 5, 1, 3 | Tarjetas de los pedidos **Delivery** en estado 3 o 4, agrupadas por barrio, con sus platos, qué cobrar, botón "Cobrado", cambio de estado, hoja de ruta e impresión | `GET /api/estados` · `GET /api/envios?fecha=` · `PUT …/pagado` · `PUT …/estado` |
| 📦 Gestión de Stock · 📋 Movimientos de Stock · 📦 Movimientos (nuevo) | `stock.html`, `MovimientosStock.html`, `MovimientosStockNuevo.html` | 6, 5, 1 | Stock de **insumos** (no de viandas), compras y movimientos | `/api/insumos`, `/api/movimientos-stock`, `/api/compras` |

### 2.2 Dos "cocinas" distintas que conviven

Es importante no confundirlas, porque los combos van a tener que elegir con cuál trabajar:

| | **Pedidos de clientes** | **Pedidos a cocina** (producción para la heladera) |
|---|---|---|
| Qué es | Lo que compró un cliente | Lo que el local le pide a la cocina para tener viandas guardadas |
| Tablas | `pedidos` + `pedido_detalles` | `ordenes_produccion` + `orden_produccion_detalles` |
| Dónde lo ve la cocina | Tareas de Cocina, tabla de arriba (`cocinero.js`) | Tareas de Cocina y Producción, lista de pendientes (`pedidosCocina.js`) |
| Qué hace "Listo / Hecho" | Marca el renglón como `listo`; cuando están todos, el pedido pasa a **3** | Llama a `marcar_detalle_hecho` (SQL): **suma viandas a `stock_heladera` y descuenta los insumos** de la receta |
| ¿Toca la heladera? | **No** | **Sí, suma** |

> **Cuidado con el doble descuento de insumos.** Una vianda que se cocinó para la heladera **ya descontó sus insumos**. Si después esa vianda se vende en un pedido de cliente, el pedido **vuelve a descontar** los insumos de la receta al pasar a 3 o 4, y **no resta nada de la heladera**. Hoy los dos mundos no están conectados. Con los combos (que en la práctica se arman con viandas ya cocinadas) esto hay que resolverlo sí o sí: ver sección 5.

---

## 3. Listar pedidos y armado

### 3.1 Cómo se listan (Consultar Pedidos)

| Paso | Qué pasa | Dónde |
|---|---|---|
| 1 | Pide **todos** los pedidos con sus renglones | `fetchPedidos()` (`ListarPedidos.js:30`) → `GET /api/pedidos` (`server.js:870`) |
| 2 | El servidor devuelve cada pedido con sus datos de cliente y pago, `estados(nombre)`, `barrios(nombre)` y **`pedido_detalles(cantidad, precio_unitario, productos(nombre, codigo_plato))`** | `server.js:876-906` |
| 3 | Filtra en el navegador: por defecto "producción de hoy" (entregas del próximo día hábil, sin cancelados); también por rango de entrega o "Ver todos", y por texto | `filtrarPedidos()` (`:663`) |
| 4 | Dibuja una fila por pedido, paginada: N°, entrega, cliente, dirección, teléfono, mail, botón **Detalles**, costo, select de estado, método de pago, Pago / Anular | `renderizarPedidos` (`:48`) → `crearFilaPedido` (`:66`) |

En la grilla **no se ven los platos**: solo el botón "Detalles".

### 3.2 Cómo se ven los platos de un pedido hoy

| Lugar | Cómo se muestran | Código |
|---|---|---|
| **Consultar Pedidos → Detalles** | Un modal con una tabla: **Cantidad · Plato · Precio**, un renglón por cada `pedido_detalles`, y "Realizado el …" | `abrirModalDetalles` (`ListarPedidos.js:324`) |
| **Tareas de Cocina** (pedidos de clientes) | Un renglón **por plato**: #pedido, fecha, código, nombre, "x2", observaciones del pedido, botón Listo. Solo los platos de ese cocinero (`es_mio`) que todavía no están listos. Al costado, un **resumen** que agrupa por plato + observación y suma las porciones | `cocinero.js:169-205`, `construirResumen` (`:16`) · servidor `server.js:610-678` |
| **Envíos** (tarjeta y hoja impresa) | Lista "2× fideos" dentro de la tarjeta, y en la vista de impresión "2× fideos · 1× canelones" | `buildCard` (`Envios.js:372`, ítems en `:382`) · `buildPrintRow` (`:524`) · servidor `server.js:2559` |
| **Reportes → Top productos** | Suma de cantidades e ingresos (`cantidad × precio_unitario`) por nombre de plato | `server.js:2501-2523` |
| **WhatsApp del cliente** | "2x fideos: $27.000" con los ítems que devolvió el servidor | `formulario.js:273` |

**El "armado"** (juntar las viandas de un pedido para entregarlo) **no tiene una pantalla propia**. Hoy se hace con: la cocina marca "Listo" por plato → cuando están todos, el pedido pasa a "Listo para Entregar" (3) → Envíos lo muestra al repartidor. Todo se basa en que **un pedido es una lista plana de platos** (`pedido_detalles`), sin agrupaciones.

---

## 4. Estados del pedido

### 4.1 Los estados

| id | Estado | Qué significa |
|---|---|---|
| 1 | Registrado | Recién creado desde la web |
| 2 | En Preparación | La cocina lo está haciendo |
| 3 | Listo para Entregar | Todos los platos están listos |
| 4 | Entregado | Lo recibió el cliente |
| 5 | Cancelado | Anulado con PIN |

### 4.2 Quién cambia qué y dónde

| Quién | Desde qué pantalla | Qué puede hacer | Ruta |
|---|---|---|---|
| Sistema (cliente en la web) | Formulario | Crea el pedido en **1** | `POST /api/pedidos` |
| Roles 6, 5, 1 | Consultar Pedidos (select de estado) | Cualquier cambio **menos Cancelado** (1↔2↔3↔4) | `PUT /api/pedidos/:id/estado` (`server.js:1127`) |
| Roles 6, 5, 1 | Consultar Pedidos (botón Anular) | **Cancelado (5)**, solo con PIN | `POST /api/pedidos/:id/anular` (`server.js:1246`) |
| Cocinero (2) y 6, 5, 1 | Tareas de Cocina (botón Listo) | Marca **sus** platos como listos; cuando no queda ninguno pendiente, el pedido pasa solo a **3** | `PUT /api/pedidos/:id/listo-cocinero` (`server.js:1168`) |
| Repartidor (3) | Envíos (select de estado) | **Solo** pasar a **4 (Entregado)** | `PUT /api/pedidos/:id/estado` |
| 6, 5, 1, 3 | Envíos / Consultar Pedidos | Marcar cobrado (`pagado`) — no cambia el estado | `PUT /api/pedidos/:id/pagado` |

### 4.3 Qué hace el sistema al cambiar de estado

Toda la lógica está en **`cambiarEstadoPedido()`** del servidor (`server.js:1073`):

| Al pasar a… | Qué hace con el stock | Funciones |
|---|---|---|
| **2** En Preparación | **Verifica** que alcancen los **insumos** para todas las recetas del pedido. Si no alcanzan → 409 y no cambia nada. No descuenta. | `verificarStockPedido` → `calcularConsumoPedido` (`server.js:234`, `:152`) |
| **3** Listo o **4** Entregado | **Descuenta los insumos** (receta × cantidad) y anota cada salida en `movimientos_stock` con el motivo "Consumo por producción pedido #NNN". Lo hace una sola vez por pedido (si ya hay un movimiento con ese motivo, no repite). | `descontarStockPedido` (`server.js:244`) |
| **3** | Además marca **todos** los renglones como `listo = true` | `server.js:1093-1101` |
| **5** | Nada con el stock (no devuelve lo descontado) | `/anular` |

> **En ningún estado se toca `stock_heladera`.** Los pedidos de clientes descuentan **insumos**, como si cada vianda se cocinara para ese pedido.

> **Nombre repetido:** hay una función `cambiarEstadoPedido` en el **servidor** (`server.js:1073`) y otra **distinta** con el mismo nombre en el **navegador** (`ListarPedidos.js:200`). Lo mismo pasa con `verificarStockPedido` (`server.js:234` y `ListarPedidos.js:237`).

---

## 5. Impacto de los combos

### 5.1 Lo que ya existe en la base

| Tabla | Columnas (leídas de la base) | Para qué sirve | Filas hoy |
|---|---|---|---|
| `combos` | `id`, `id_plan`, `nombre`, `cantidad`, `precio`, `activo` | El combo en sí: "Keto x10", de qué plan es, **cuántas viandas** se eligen (`cantidad` = 10) y su **precio total** | 1 ("PRUEBA Mantenimiento x10", **inactivo**) |
| `combo_productos` | `id`, `id_combo`, `id_producto`, `activo` | El **menú** del combo: qué platos se pueden elegir | 3 (berenjenas rellenas, canelones, fideos) |
| `pedido_combos` | `id`, `id_pedido`, `id_combo`, `precio` | Cada combo que se compró dentro de un pedido, con el precio que se cobró | 0 |
| `pedido_detalles` (columnas nuevas) | `id_pedido_combo`, `personalizado` | Cada vianda elegida sigue siendo un renglón de `pedido_detalles`, pero ahora dice **a qué combo pertenece**. `personalizado` todavía no lo usa nadie (probablemente "el cliente eligió o modificó este plato") | — |

**Cómo encajan (un ejemplo):** el cliente compra "Keto x10" eligiendo 4 fideos, 3 canelones y 3 berenjenas.

```
pedidos (id 200, total 50.000)
 └─ pedido_combos (id 7, id_pedido 200, id_combo 1, precio 50.000)
     ├─ pedido_detalles (id_pedido 200, id_producto fideos,     cantidad 4, id_pedido_combo 7)
     ├─ pedido_detalles (id_pedido 200, id_producto canelones,  cantidad 3, id_pedido_combo 7)
     └─ pedido_detalles (id_pedido 200, id_producto berenjenas, cantidad 3, id_pedido_combo 7)
```

**Observaciones sobre el modelo:**
- `pedido_combos` **no tiene columna `cantidad`**: si alguien compra dos "Keto x10", son **dos filas** de `pedido_combos`, cada una con sus 10 viandas.
- El menú del combo de prueba tiene "canelones", que hoy es de **otro plan** (no de MANTENIMIENTO). O sea, el menú de un combo no está limitado a los platos de su plan. Hay que decidir si eso está bien.
- Hay que decidir **qué `precio_unitario` llevan los renglones de un combo**: 0, o el precio del combo repartido entre las viandas. Esto afecta los reportes de "más vendidos" (que suman `cantidad × precio_unitario`).
- Las tablas nuevas **están protegidas**: la clave pública de Supabase no ve ninguna fila (RLS activo). Pero `sql/activar_rls.sql` no las incluye: conviene agregarlas ahí para que quede documentado.

### 5.2 Decisión previa que cambia todo: ¿de dónde salen las viandas de un combo?

| Opción | Qué significa | Consecuencia |
|---|---|---|
| **A. De la heladera** (lo más probable, porque la dueña cocina por tandas) | Al vender, o al entregar, el combo **resta de `productos.stock_heladera`** y **no** descuenta insumos | Hay que crear la lógica "vender desde heladera" (no existe) y evitar que `descontarStockPedido` vuelva a descontar insumos de esos renglones |
| B. Se cocina a pedido | Igual que hoy: los renglones del combo descuentan insumos al pasar a 3/4 | No hay que cambiar el stock, pero se mantiene el doble descuento si el plato también se produce para la heladera |

Hasta que esto no esté decidido, **el cambio más grande (stock) no se puede diseñar**.

### 5.3 Qué hay que cambiar o crear

Tamaño: **Chico** = unas líneas, sin lógica nueva · **Mediano** = una función nueva o varios ajustes · **Grande** = pantalla, ruta o lógica nueva con decisiones de negocio.

#### Web del cliente

| # | Archivo / ruta / función | Qué cambio necesita | Tamaño |
|---|---|---|---|
| 1 | `GET /api/v1/catalogo` (`server.js:485`) | Devolver también los **combos activos** de cada plan, con su menú (`combo_productos` → `productos`, solo activos). O una ruta nueva `GET /api/v1/combos` | Mediano |
| 2 | `index.html` (`:103-130`) | Las tarjetas de categoría están escritas a mano. Decidir si los combos van dentro de cada plan o en "Combos Saludables" (que hoy es una categoría común con platos sueltos) | Chico |
| 3 | `index.js` (`buildPlanItem`, `renderProductos`, `attachPanelEvents`) | **Pantalla nueva para armar el combo**: elegir platos del menú hasta completar la cantidad (ej: 10), con contador "te faltan 3", y recién ahí "Agregar al carrito" | **Grande** |
| 4 | `funciones.js` → `gestionarCarrito` (`:9`) | Hoy junta por `producto_id`. Un combo es otro tipo de elemento (`tipo: 'combo'`, `id_combo`, `precio`, `platos: [{ producto_id, cantidad }]`) y **dos combos no se juntan** aunque sean iguales | Mediano |
| 5 | `funciones.js` → `calcularTotales` (`:38`) | El número del ícono: decidir si un combo cuenta como 1 o como 10 | Chico |
| 6 | `carrito.js` → `actualizarVistaCarrito` (`:69`) | Mostrar "Keto x10 — $50.000" con sus platos debajo (y escapar el nombre con `escHtml`, hoy no lo hace) | Chico-Mediano |
| 7 | `formulario.js` → `mostrarResumenCarrito` (`:121`), `prepararItemsParaServidor` (`:212`), `armarObjetoPedido` (`:221`) | Mandar los combos aparte: `combos: [{ id_combo, platos: [{ producto_id, cantidad }] }]`, además de `items` para los platos sueltos | Mediano |
| 8 | `formulario.js` → `redirigirAWhatsApp` (`:264`) | Que el mensaje muestre "1x Keto x10: $50.000" y el detalle de platos (con lo que devuelva el servidor) | Chico |
| 9 | **`POST /api/pedidos`** (`server.js:715`) | Aceptar `combos`: validar que el combo exista y esté activo, que cada plato esté en su menú y activo, que la suma sea **exactamente** `combos.cantidad`; tomar el precio de `combos.precio`; calcular el total; guardar `pedido_combos` + sus renglones con `id_pedido_combo`. Y permitir un pedido **solo con combos** (hoy exige `items` no vacío) | **Grande** |
| 10 | Guardado del pedido (nuevo) | Pasar la creación del pedido a una **función de la base** (RPC, "todo o nada"): cabecera + combos + renglones en una sola transacción. Hoy son inserciones sueltas con borrado manual si falla | Mediano |
| 11 | `pages/viandasSaludables.html` + `viandasSaludables.js` + `productos.js` | Catálogo viejo sin enlaces. **Borrarlo** antes de hacer combos, para no tener que adaptarlo | Chico |

#### Panel

| # | Archivo / ruta / función | Qué cambio necesita | Tamaño |
|---|---|---|---|
| 12 | **Pantalla nueva "Combos"** + rutas `GET/POST/PUT /api/combos`, menú (`combo_productos`) | Hoy **no hay forma de crear ni editar combos** desde el panel (el único combo se cargó a mano). Alta, edición, activar/desactivar, armar el menú | **Grande** |
| 13 | `roles.js` (`PANTALLAS`) | Agregar la pantalla nueva al menú (roles 6, 5) | Chico |
| 14 | `GET /api/pedidos` (`server.js:870`) | Traer también `pedido_combos ( id, precio, combos ( nombre ) )` y en los renglones `id_pedido_combo` y `personalizado` | Chico |
| 15 | `ListarPedidos.js` → `abrirModalDetalles` (`:324`) | Agrupar los platos bajo su combo: "Keto x10 — $50.000" y debajo "4 fideos · 3 canelones · 3 berenjenas"; los platos sueltos aparte | Mediano |
| 16 | `GET /api/envios` (`server.js:2559`) + `Envios.js` → `buildCard` (`:372`), `buildPrintRow` (`:524`) | Mostrar el combo en la tarjeta y en la hoja impresa (no solo la lista plana de platos) | Chico-Mediano |
| 17 | `GET /api/cocina/tareas` (`server.js:610`) + `cocinero.js` | **Sigue funcionando sin cambios** (la cocina ve renglones de `pedido_detalles`). Opcional: mostrar a qué combo pertenece cada plato. Si las viandas del combo salen de la heladera (opción A), estos renglones ni siquiera deberían pasar por la cocina | Chico (o decidir) |
| 18 | `PUT /api/pedidos/:id/listo-cocinero` (`server.js:1168`) | Sin cambios si se cocina a pedido. Con la opción A, decidir si los renglones de un combo nacen ya "listos" | Chico (o decidir) |
| 19 | **Stock**: `cambiarEstadoPedido` (`server.js:1073`), `calcularConsumoPedido` (`:152`), `descontarStockPedido` (`:244`) | Con la opción A: que los renglones de combos **resten `stock_heladera`** (y quede un movimiento en `movimientos_viandas`, tipo "venta") y **no descuenten insumos**. Ojo con el orden: ¿se reserva al crear el pedido o se resta al entregar? Y qué pasa si no hay viandas | **Grande** |
| 20 | `GET /api/reportes/productos-mas-vendidos` (`server.js:2501`) + `reportes.js` | Hoy los ingresos salen de `cantidad × precio_unitario`; con combos el precio está en `pedido_combos`. Agregar "combos más vendidos" y decidir cómo contar las viandas de los combos | Mediano |
| 21 | Producción (`heladera.js`, `GET /api/viandas-stock`) | Opcional: avisar si un combo activo tiene platos sin stock suficiente | Chico (opcional) |
| 22 | `sql/activar_rls.sql` | Agregar `combos`, `combo_productos`, `pedido_combos` y las otras tablas nuevas (hoy ya tienen RLS en la base, pero el archivo no lo refleja) | Chico |

### 5.4 Qué NO cambia

| Parte | Por qué no cambia |
|---|---|
| Login, registro, roles, JWT, guard, `apiFetch` | No dependen de qué se vende |
| Gestión de Usuarios, Asignar Cocineros | Trabajan sobre usuarios y platos, no sobre pedidos |
| Insumos, compras, Gestión de Stock, Movimientos de Stock | Son el stock de **materia prima** |
| Generar Receta (platos y recetas) | Un combo se arma **con** platos existentes; los platos no cambian |
| Pedidos a cocina y descartes (Producción) | Ya trabajan con `stock_heladera`; solo se agrega, opcionalmente, un aviso |
| Pagos: Pago, Mixto, transferencia, Cobrado | Se basan en `pedidos.total`, que seguirá existiendo |
| Anular con PIN, estados 1 a 5, quién los cambia | El ciclo de vida del pedido es el mismo |
| Fecha de entrega (48 hs hábiles), barrios, tipo de entrega, límites de largo y de pedidos por IP | Son del pedido, no de su contenido |
| Envíos: agrupado por barrio, hoja de ruta, cobro | Solo cambia cómo se listan los platos (#16) |

---

## 6. Código complicado o repetido

Cosas para limpiar **antes o durante** el refactor de combos, de más a menos útil:

| # | Qué pasa | Dónde | Sugerencia |
|---|---|---|---|
| 1 | **Dos catálogos** que hacen lo mismo con código distinto: la portada (`index.js`, una consulta y acordeón) y `viandasSaludables` (varias consultas, breadcrumb, buscador). Cada uno tiene su propia tarjeta de plato, sus botones − / + y su forma de agregar al carrito. El segundo **no tiene enlaces** y además **no aplica el descuento** al agregar al carrito | `index.js:61-133` · `funciones.js:79-118` · `viandasSaludables.js` · `productos.js` | Borrar `viandasSaludables.html`, `viandasSaludables.js`, `productos.js` y `renderizarproductos` / `buscarProductos` / `renderizarCategorias` / `renderizarPlanes` de `funciones.js`. Así los combos se hacen una sola vez |
| 2 | **La regla del descuento está escrita en 3 lugares**: `renderPrecio` y `precioEfectivo` en el navegador, `precioFinal` en el servidor | `index.js:37`, `index.js:54`, `server.js:686` | Dejar una sola en el navegador (o que el catálogo mande `precio_final` ya calculado por el servidor) |
| 3 | **El navegador manda datos que el servidor ignora**: `total`, `usuario_id`, `precio` y `observaciones_plato` de cada ítem | `formulario.js:212-235` | Sacarlos del pedido que se envía; confunden al leer el código |
| 4 | **Código que escribe o lee cosas que nadie usa**: `guardarComandaParaCocina` guarda `pedidoFastGood` y nadie lo lee; `cocinero.js` lee `FG_RECETAS` y nadie lo escribe (`buscarReceta` y `renderReceta` no sirven); `recuperarDatos` no se usa; `GUEST_UUID` se manda y el servidor lo ignora | `formulario.js:8`, `:147-157` · `cocinero.js:101-122` · `funciones.js:65` | Borrar |
| 5 | **El carrito vive en memoria** hasta que se toca "Confirmar": si se recarga la página, se pierde | `carrito.js:11`, `:112` | Guardarlo en localStorage en cada cambio (útil para combos, que llevan más tiempo de armar) |
| 6 | **Creación del pedido sin transacción**: cabecera y renglones en dos inserciones, con borrado "a mano" si falla la segunda | `server.js:810-847` | Pasarla a una función de la base, como ya se hizo con compras y producción. Con combos se suma una tercera tabla, así que esto pasa a ser necesario |
| 7 | **`calcularConsumoPedido` adivina el nombre de la columna** (`r.cantidad \|\| r.cantidad_insumo \|\| r.cantidad_necesaria`) y escribe dos `console.log` de depuración en cada llamada | `server.js:187-188`, `:223` | Usar el nombre real (`cantidad_necesaria`) y sacar los logs |
| 8 | **"Receta × cantidad" se calcula en varios lugares**: en los pedidos (`calcularConsumoPedido`) y en las funciones SQL de producción | `server.js:180-192` · `sql/Produccion.sql` · `sql/stock_viandas_funciones.sql` | Si se cambia la regla, cambiarla en todos. Idealmente, una sola función SQL |
| 9 | **El "no descontar dos veces" de un pedido se basa en buscar un texto** (`ilike` sobre el motivo "pedido #NNN") y el descuento lee el stock, resta en JavaScript y escribe el número final (si dos cosas descuentan a la vez, una pisa a la otra) | `server.js:249-283` | Pasar a una función de la base que reste sobre lo que haya (`stock_actual - x`) y marque el pedido como descontado con una columna, no con un texto |
| 10 | **Dos funciones casi iguales para "hoy en Argentina"**, con zonas horarias distintas (Córdoba y Buenos Aires) | `hoyArgentina` (`server.js:694`) y `hoyEnArgentina` (`:2364`) | Dejar una sola |
| 11 | **Nombres repetidos entre servidor y navegador**: `cambiarEstadoPedido` y `verificarStockPedido` existen en los dos con funciones distintas | `server.js:1073`, `:234` · `ListarPedidos.js:200`, `:237` | Renombrar las del navegador (por ejemplo `guardarEstadoEnServidor`, `consultarStock`) |
| 12 | **Selects de pedidos casi iguales** en `GET /api/pedidos` y `GET /api/envios` (los mismos 20 campos escritos dos veces); el filtro "plato del cocinero" se repite en 4 rutas | `server.js:876-906`, `:2562-2590` · `:623`, `:1198`, `:2279`, `:2399` | Una constante con los campos del pedido. Cuando se agreguen los combos, se agregan en un solo lugar |
| 13 | **Dos pantallas de movimientos de insumos** (la vieja y "Movimientos (nuevo)") | `MovimientosStock.*`, `MovimientosStockNuevo.*` | Quedarse con una cuando la nueva esté completa |
| 14 | **Categorías e imágenes escritas a mano** en la portada y en `IMAGENES_CATEGORIAS` | `index.html:103-130` · `funciones.js:120` | Dibujar las tarjetas desde `/api/v1/catalogo` (así un combo o una categoría nueva aparece sola) |
| 15 | **El nombre del plato se muestra sin escapar en el carrito** | `carrito.js:76` | Usar `escHtml` (la página ya carga `escape.js`). Conviene hacerlo al tocar el carrito para los combos |

---

## 7. Resumen en una página

- **Cliente:** entra a `index.html` → `index.js` trae **todo el catálogo de una vez** (`GET /api/v1/catalogo`) y dibuja categorías → planes → platos desde la memoria → el carrito vive en memoria (`carrito.js` + `funciones.js`) y pasa por localStorage al formulario → `formulario.js` manda `POST /api/pedidos` → el servidor **recalcula precios y total**, valida todo, guarda `pedidos` + `pedido_detalles` en estado 1 y **no toca el stock** → se abre WhatsApp. No hay pantalla para consultar el pedido.
- **Panel:** Consultar Pedidos (lista, estado, pago, anular), Tareas de Cocina (platos de pedidos en preparación + pedidos a cocina), Producción (stock de heladera, pedir a cocina, descartar), Envíos (delivery del día), Reportes, Generar Receta, Asignar Cocineros.
- **Un pedido hoy es una lista plana de platos** (`pedido_detalles`). Todas las pantallas que muestran platos (Detalles, Cocina, Envíos, Reportes, WhatsApp) asumen eso.
- **Estados:** 1→2 verifica insumos, 2→3/4 **descuenta insumos**, 5 solo con PIN. La heladera (`stock_heladera`) **no la toca ningún pedido**: solo la producción (suma) y el descarte (resta).
- **Combos:** las tablas ya están (`combos`, `combo_productos`, `pedido_combos`, `pedido_detalles.id_pedido_combo`), pero **ningún archivo las usa** y no hay pantalla para crearlas. Lo grande es: (1) armar el combo en la web, (2) que `POST /api/pedidos` acepte y valide combos en una transacción, (3) la pantalla de combos del panel, y (4) **decidir si las viandas de un combo salen de la heladera**, que es lo que define todo el manejo de stock.
- **Antes de empezar, conviene limpiar** el catálogo duplicado (`viandasSaludables`), los datos que el servidor ignora y el código muerto del formulario y de cocina.
