# Stock de viandas en heladera — Informe

> Este informe tiene dos partes:
> - **Este archivo**: la explicación general (qué problema había, qué se hizo, por qué y cómo probarlo).
> - **[informe_stock_viandas_codigo.md](informe_stock_viandas_codigo.md)**: el código completo de las funciones, los endpoints y las pantallas, comentado línea por línea.
>
> Los números de línea corresponden a los archivos tal como quedaron al escribir este informe (7/10/2026). Si después se edita un archivo, los números pueden correrse unas líneas.

---

## Revisión: errores y riesgos encontrados

Se revisó que las piezas encajen entre sí: lo que devuelve cada función SQL contra lo que espera el servidor, lo que devuelve cada endpoint contra lo que usa la pantalla, que las columnas existan, que haya permisos y validaciones, y que no quede código duplicado o sin usar.

**Lo que está bien:**
- Los nombres de los parámetros (`p_id_producto`, `p_cantidad`, `p_id_usuario`, `p_motivo`, `p_items`) coinciden entre el SQL y las llamadas `supabase.rpc(...)` del servidor.
- Lo que devuelven las funciones (`ok`, `error`, `faltantes`, `id_movimiento`, `stock_heladera`, `plato`, `total`, `items`) es exactamente lo que lee el servidor, y lo que reenvía el servidor es lo que lee la pantalla.
- Los 7 endpoints de viandas tienen `requireAuth` y `requireRol(6, 5, 1, 2)`, validan la cantidad, el id del plato y el motivo, y toman el usuario del token.
- Todos los `id` de heladera.html que usa heladera.js existen, y todas las funciones que llaman los botones existen.
- No quedó ninguna función vieja sin usar en el servidor.

**Errores y riesgos, de más grave a menos grave:**

| # | Gravedad | Qué pasa | Dónde |
|---|---|---|---|
| 1 | **Alta** | **Los insumos se descuentan dos veces si se vende una vianda que salió de la heladera.** Cargar una tanda ya descuenta los insumos. Pero cuando ese plato se vende por un pedido, el flujo de pedidos vuelve a descontar los insumos de la receta al pasar a "Listo" o "Entregado", y no resta nada de la heladera. Hasta hacer la próxima etapa (que los pedidos descuenten de la heladera), no conviene usar la heladera y los pedidos para el mismo plato. | `server.js:1079-1082` (`cambiarEstadoPedido` llama a `descontarStockPedido`, `server.js:244`) |
| 2 | **Alta (sin verificar)** | **La columna `movimientos_stock.id_usuario` no la crea ningún archivo SQL del proyecto.** La función de tanda la usa. Si esa columna no existe en Supabase, **toda** carga de plato o de combo falla con error 500. Hay que confirmarlo en la base. | `sql/stock_viandas_funciones.sql:150` |
| 3 | **Alta (al instalar)** | **El servidor nuevo necesita que el SQL ya esté ejecutado.** `GET /api/movimientos-stock` pide `movimientos_viandas.id_lote`. Si se sube el servidor a una base donde no se corrió `stock_viandas_lotes.sql`, la pantalla Movimientos de Stock deja de cargar (y también el panel de la Heladera). Además, **nada de esto está guardado en git todavía**: los archivos de `sql/`, `heladera.*` y los cambios de `server.js` están sin commit. | `server.js:1780`, `server.js:2279`; `git status` |
| 4 | Media | **Una escritura vieja puede "pisar" el descuento de una tanda.** El código anterior de stock lee el stock en el servidor, hace la cuenta y escribe el número final (por ejemplo "quedan 800"). Si justo en el medio se carga una tanda que descuenta 200, ese descuento se pierde, porque después se escribe "800" encima. Las funciones nuevas restan sobre lo que haya (`stock_actual - x`), así que ellas no tienen el problema; el riesgo está en el código viejo. | `server.js:1837-1871` (alta de movimiento), `server.js:1912-1930` (borrado), `server.js:278-283` (pedidos), `server.js:1506` (editar insumo) |
| 5 | Media | **El reporte de movimientos de stock cuenta la producción como "salidas".** El gráfico de entradas y salidas del inicio suma todas las salidas, incluidas las de las tandas, y mezcla gramos con unidades. Cada combo hace crecer las "salidas" aunque no sea una venta. | `server.js:2408-2423` |
| 6 | Media-baja | **El motivo que se escribe al cargar no aparece en Movimientos de Stock.** La pantalla está preparada para mostrarlo, pero el servidor no lo pide (falta `motivo` dentro de `movimientos_viandas ( ... )`). Esa parte de la pantalla hoy nunca se ejecuta. | `MovimientosStock.js:236` lee `mv.motivo`; `server.js:1780` no lo trae |
| 7 | Baja | **La regla "receta × cantidad" está escrita en tres lugares.** En los pedidos, en el cálculo previo de la Heladera y en la función SQL. Si algún día se cambia (por ejemplo, para convertir unidades), hay que cambiarla en los tres a la vez. | `server.js:152` (`calcularConsumoPedido`), `server.js:2011` (`calcularInsumosTanda`), `sql/stock_viandas_funciones.sql:91-100` |
| 8 | Baja | **No hay forma de deshacer una carga o un descarte.** El borrado está bloqueado a propósito y no hay botón de "anular tanda". Un error de carga hoy se corrige a mano en la base. | — |
| 9 | Baja | **`GET /api/movimientos-stock` trae toda la historia sin límite.** Cada combo agrega muchas filas; con el tiempo la pantalla va a tardar más en cargar. | `server.js:1774-1786` |
| 10 | Baja | Los combos de prueba cargados antes de que existiera `id_lote` se ven separados por plato, como "Producción". Son datos de prueba; no afecta a los nuevos. | — |
| 11 | Cosmético | En el panel de la Heladera la flechita cambia de carácter y el botón sigue diciendo "Detalles"; en Movimientos de Stock la flechita gira y el botón pasa a "Ocultar". | `heladera.js:243-253` vs `MovimientosStock.js:405-417` |
| 12 | Cosmético | Hay dos funciones con el mismo nombre, `agruparMovimientos`, en dos archivos distintos y que devuelven cosas distintas. No falla (cada pantalla carga una sola), pero confunde al leer. La clase `mov-grupo` no tiene estilo propio. | `heladera.js:143`, `MovimientosStock.js:162`, `heladera.js:210` |
| 13 | Cosmético | El comentario de arriba de `stock_viandas_funciones.sql` todavía habla de "las dos" funciones; ya son tres. El mensaje de error de Movimientos de Stock ocupa 6 columnas y la tabla tiene 7. | `sql/stock_viandas_funciones.sql:7-15`, `MovimientosStock.js:37` |
| 14 | Nota | Hay cosas creadas en la base que todavía no se usan, preparadas para la próxima etapa: `pedido_detalles.cantidad_de_heladera`, `movimientos_viandas.id_pedido` y los tipos `venta`, `devolucion` y `ajuste`. No es un error. | `sql/stock_viandas.sql:22-24`, `:40`, `:44` |

---

## 1. El problema

**Cómo funcionaba antes.** El sistema solo llevaba stock de **insumos** (harina, carne, huevos…), en la columna `insumos.stock_actual`. Cada plato tiene una **receta** (tabla `producto_insumo`) que dice cuánto de cada insumo lleva una vianda. Los insumos se descontaban **recién cuando un pedido pasaba a "Listo para entregar"**: el sistema miraba qué platos tenía el pedido, multiplicaba la receta por la cantidad y restaba.

Es decir, el sistema suponía que **se cocina a pedido**: llega un pedido, se cocina, se descuenta.

**Por qué no alcanzaba.** La dueña no cocina así. Cocina **por combos para guardar**: elige un plan (por ejemplo "Mantenimiento") y hace 10, 20 o 30 viandas de ese plan, repartidas entre sus platos, y las guarda en la heladera. Después las va vendiendo.

Con el sistema anterior:
- No había dónde anotar "tengo 12 viandas de berenjenas en la heladera".
- Los insumos que se usaron para cocinar no se descontaban en el momento de cocinar, sino mucho después, cuando se vendía.
- No había registro de qué se cocinó, cuándo y quién.

## 2. La solución, en una mirada

- Cada plato tiene ahora un **contador de viandas en heladera** (`productos.stock_heladera`).
- Una tabla nueva, **`movimientos_viandas`**, guarda cada entrada y salida de viandas (producción, descarte…).
- Se puede **cargar un plato suelto** o **un combo entero**. Al cargar se descuentan los insumos de la receta y se suman las viandas a la heladera, **todo junto o nada**.
- Se pueden **descartar** viandas (vencidas, rotas).
- Una pantalla nueva, **Heladera**, para hacer todo eso, con un panel de últimos movimientos.
- La pantalla **Movimientos de Stock** distingue las salidas de insumos por producción (**Combo** y **Producción**) y las muestra **agrupadas**, con un detalle por plato.

## 3. Qué cambió en la base de datos

### Cosas nuevas

| Nombre | Qué es | Dónde está | Para qué sirve | Archivo que lo creó |
|---|---|---|---|---|
| `stock_heladera` | columna (número entero, no puede ser negativo) | `productos` | Cuántas viandas terminadas hay de ese plato | `sql/stock_viandas.sql:15-17` |
| `cantidad_de_heladera` | columna | `pedido_detalles` | Cuántas viandas de ese renglón del pedido salieron de la heladera. **Todavía no se usa** (próxima etapa) | `sql/stock_viandas.sql:22-24` |
| `movimientos_viandas` | tabla | — | Cada entrada o salida de viandas: qué plato, quién, tipo, cantidad (+ entra, − sale), motivo, fecha | `sql/stock_viandas.sql:28-55` |
| `id_movimiento_vianda` | columna | `movimientos_stock` | Dice qué tanda provocó esa salida de insumo | `sql/stock_viandas.sql:60-61` |
| `id_lote` | columna | `movimientos_viandas` | Número que comparten todos los platos de una misma carga de combo | `sql/stock_viandas_lotes.sql:21-22` |
| `movimientos_viandas_lote_seq` | secuencia (un contador automático 1, 2, 3…) | — | Da el número de cada combo | `sql/stock_viandas_lotes.sql:15` |
| `registrar_tanda_viandas` | función | — | Carga N viandas de un plato | `sql/stock_viandas_funciones.sql:31-166` |
| `registrar_descarte_vianda` | función | — | Descarta N viandas de un plato | `sql/stock_viandas_funciones.sql:173-230` |
| `registrar_tanda_multiple` | función | — | Carga un combo (varios platos), todo o nada | `sql/stock_viandas_funciones.sql:278-422` |
| índices | — | — | Hacen rápidas las búsquedas por plato, pedido, tanda y combo | `sql/stock_viandas.sql:66-68`, `sql/stock_viandas_lotes.sql:25` |
| `movimientos_stock.id_usuario` | columna | `movimientos_stock` | Quién provocó la salida de insumo. **Ningún archivo del proyecto la crea** (ver riesgo 2) | — |

### Por qué `movimientos_viandas` es una tabla aparte

`movimientos_stock` registra **insumos**: gramos de harina, mililitros de aceite. `movimientos_viandas` registra **viandas**: platos terminados, contados de a uno.

Son cosas distintas, con columnas distintas:
- un movimiento de insumo tiene unidad (g, ml, u) y costo; uno de viandas no;
- un movimiento de viandas tiene plato y tipo (producción, descarte, venta…); uno de insumo no;
- en viandas, el signo de la cantidad dice si entra (+) o sale (−); en insumos lo dice la columna `tipo` ('entrada' o 'salida').

Mezclarlas en una sola tabla obligaría a dejar muchas columnas vacías y complicaría todos los reportes que ya existen sobre `movimientos_stock` (por ejemplo, el de gastos).

### La relación "uno a muchos"

**Un** movimiento de viandas (una tanda) provoca **muchos** movimientos de stock (una salida por cada insumo de la receta). La unión es la columna `movimientos_stock.id_movimiento_vianda`, que apunta al `id` de la tanda.

Ejemplo con el formato real de las filas (los números son de ejemplo):

**`movimientos_viandas`**

| id | id_producto | tipo | cantidad | motivo | id_lote |
|---|---|---|---|---|---|
| 41 | 7 (Berenjenas rellenas) | produccion | 5 | NULL | 12 |
| 42 | 9 (Tarta de verdura) | produccion | 5 | NULL | 12 |

**`movimientos_stock`**

| id | id_insumo | tipo | cantidad | unidad | motivo | id_movimiento_vianda |
|---|---|---|---|---|---|---|
| 301 | 3 (Berenjena) | salida | 1000 | g | Producción combo Mantenimiento: 5 Berenjenas rellenas | **41** |
| 302 | 5 (Carne) | salida | 750 | g | Producción combo Mantenimiento: 5 Berenjenas rellenas | **41** |
| 303 | 8 (Queso) | salida | 250 | g | Producción combo Mantenimiento: 5 Berenjenas rellenas | **41** |
| 304 | 11 (Harina integral) | salida | 300 | g | Producción combo Mantenimiento: 5 Tarta de verdura | **42** |
| 305 | 12 (Huevo) | salida | 4 | u | Producción combo Mantenimiento: 5 Tarta de verdura | **42** |

La tanda 41 generó 3 salidas de stock (301, 302 y 303); la tanda 42 generó 2.

### Qué es `id_lote`

Cuando se carga un combo, cada plato es una tanda distinta (41 y 42 en el ejemplo). Para saber que esas tandas **se cargaron juntas**, todas reciben el mismo número de combo: `id_lote = 12`. Ese número lo da la secuencia `movimientos_viandas_lote_seq`.

Así se puede reconstruir el combo entero:
- en `movimientos_viandas`: todas las filas con `id_lote = 12`;
- en `movimientos_stock`: todas las salidas cuyo `id_movimiento_vianda` apunta a una de esas filas (41 o 42).

Un plato cargado suelto y un descarte no tienen `id_lote` (queda vacío). En pantalla nunca aparece la palabra "lote": se muestra "Combo Mantenimiento #12".

## 4. Por qué hubo que ejecutar SQL a mano varias veces

### El código en la PC y la base en Supabase

Hay dos lugares distintos:
- **La PC (el proyecto en Visual Studio)**: tiene los archivos `.js`, `.html` y también los `.sql`. Un archivo `.sql` en la PC es **solo un texto con instrucciones**: no hace nada por estar ahí.
- **Supabase (la base de datos en internet)**: es donde están de verdad las tablas, las columnas y las funciones.

Cuando se cambia `server.js`, alcanza con reiniciar el servidor. Pero cuando se cambia un `.sql`, **la base no se entera sola**: hay que abrir Supabase → SQL Editor, pegar el contenido y ejecutarlo. Por eso, cada vez que se tocó una función o se agregó una columna, hubo que volver a ejecutar SQL a mano.

Los archivos se escribieron para poder ejecutarse más de una vez sin romper nada: usan `if not exists` (crear solo si no existe) y `create or replace` (reemplazar la función por la nueva versión).

### Las ejecuciones, en el orden en que se hicieron

| # | Archivo (o parte) | Qué agregó o cambió | Por qué hizo falta |
|---|---|---|---|
| 1 | `sql/stock_viandas.sql` | `productos.stock_heladera`, `pedido_detalles.cantidad_de_heladera`, la tabla `movimientos_viandas`, `movimientos_stock.id_movimiento_vianda`, índices y seguridad (RLS) | La estructura básica para guardar viandas |
| 2 | `sql/stock_viandas_funciones.sql` (primer bloque) | Crea `registrar_tanda_viandas` y `registrar_descarte_vianda` | Para cargar y descartar en una sola operación segura |
| 3 | El mismo primer bloque, otra vez | La salida de insumo guarda también `unidad` e `id_usuario`, y saltea los insumos con cantidad 0 | Corrección pedida después de revisar la función |
| 4 | Bloque "CARGA POR COMBO" de `stock_viandas_funciones.sql` | Crea `registrar_tanda_multiple` | Para cargar un combo entero, todo o nada |
| 5 | Bloque de combo, otra vez | El motivo de las salidas de un combo pasa a "Producción combo <plan>: N <plato>" | Para que Movimientos de Stock distinga Combo de Producción |
| 6 | `sql/stock_viandas_lotes.sql` | La secuencia y la columna `id_lote` con su índice | Para agrupar los platos de un mismo combo |
| 7 | Bloque de combo, otra vez | La función toma un número de combo y lo guarda en cada plato (`id_lote`) | Para que las pantallas muestren el combo en un solo renglón |

(Si `movimientos_stock.id_usuario` no existía, también hizo falta agregarla a mano; ver riesgo 2.)

### Para montar todo desde cero en otra base

Ejecutar en Supabase → SQL Editor, en este orden:

1. **`sql/stock_viandas.sql`**: crea las columnas y la tabla `movimientos_viandas`.
2. **Revisar que exista `movimientos_stock.id_usuario`.** Si no existe:
   `alter table movimientos_stock add column id_usuario uuid references usuarios(id);`
3. **`sql/stock_viandas_lotes.sql`**: necesita que ya exista `movimientos_viandas` (paso 1).
4. **`sql/stock_viandas_funciones.sql`, el archivo entero**: crea las tres funciones con su última versión.
5. Recién ahí, reiniciar o subir el servidor (ver riesgo 3).

## 5. Las funciones principales

> El código completo, partido en bloques y comentado, está en [informe_stock_viandas_codigo.md → Parte 1](informe_stock_viandas_codigo.md#parte-1--las-funciones-sql). Acá va la explicación.

### Qué es una función de la base y por qué se usaron

Una función de Postgres es un pedazo de código que vive **dentro de la base** y se ejecuta ahí. El servidor la llama con `supabase.rpc('nombre', { parámetros })`.

Se usaron funciones (y no varias llamadas desde `server.js`) porque una carga hace muchas cosas: descontar 8 insumos, anotar 8 salidas, anotar la tanda y sumar a la heladera. Si eso se hiciera con 18 llamadas separadas desde el servidor y la número 10 fallara, quedarían 9 cosas hechas y 9 sin hacer: el stock quedaría roto.

### "Todo o nada" (transacción)

Una **transacción** es un grupo de cambios que la base aplica **todos juntos o ninguno**. Si algo falla en el medio, la base deshace lo que ya había hecho (eso se llama *rollback*) y queda como estaba antes.

Una función de Postgres corre siempre dentro de una transacción, así que **cada llamada es todo o nada automáticamente**. Además, las funciones primero **verifican** que alcance todo y recién después **modifican**: si falta un insumo, devuelven el detalle sin haber tocado nada.

### Bloquear una fila (`for update`)

`select ... for update` lee una fila y la **bloquea** hasta que termine la transacción. Si otra transacción quiere bloquear la misma fila, **espera** a que la primera termine.

**Para qué sirve.** Ejemplo sin bloqueo: hay 1.000 g de carne. Ana carga una tanda que necesita 800 g y Beto, al mismo tiempo, otra que necesita 600 g. Los dos leen "hay 1.000", los dos piensan que alcanza, los dos descuentan: la carne queda en −400. Con `for update`, Beto espera a que Ana termine, lee "hay 200" y su carga se rechaza porque no alcanza.

**Por qué siempre en el mismo orden.** Si cada uno bloquea en distinto orden, pueden trabarse para siempre. Ejemplo: Ana necesita carne y queso, Beto necesita queso y carne.
- Ana bloquea la carne. Beto bloquea el queso.
- Ana quiere el queso: espera a Beto. Beto quiere la carne: espera a Ana.
- Ninguno puede seguir. Eso se llama **bloqueo mutuo** (*deadlock*); Postgres lo detecta y cancela a uno con error.

Si **todos bloquean en el mismo orden** (por ejemplo, por `id` de menor a mayor: primero carne id 5, después queso id 8), el que llega segundo espera en el primer paso y nunca se forma el círculo. Por eso las tres funciones bloquean **primero los platos y después los insumos, ordenados por `id`**.

### `registrar_tanda_viandas` (cargar un plato)

1. Revisa que la cantidad sea mayor a 0.
2. Bloquea el plato y revisa que exista y esté activo.
3. Revisa que tenga receta (sin receta entrarían viandas sin gastar insumos).
4. Bloquea los insumos de la receta, ordenados por `id`.
5. Calcula receta × cantidad para cada insumo. Si alguno no alcanza, devuelve la lista de faltantes **sin tocar nada**.
6. Anota la tanda en `movimientos_viandas` (tipo `produccion`, cantidad positiva).
7. Por cada insumo: le resta lo usado y anota una salida en `movimientos_stock`, con `id_movimiento_vianda` apuntando a la tanda.
8. Suma las viandas a `productos.stock_heladera` y devuelve `{ ok: true, id_movimiento, stock_heladera }`.

### `registrar_descarte_vianda` (tirar viandas)

1. Revisa que la cantidad sea mayor a 0.
2. Bloquea el plato y revisa que exista.
3. Si hay menos viandas que las que se quieren descartar, devuelve error.
4. Anota el descarte en `movimientos_viandas` con cantidad **negativa**.
5. Resta de `stock_heladera`. **No toca insumos**: ya se gastaron al cocinar.

### `registrar_tanda_multiple` (cargar un combo)

1. Valida la lista de platos (`p_items`): que sea una lista y que cada cantidad sea entera y ≥ 0.
2. Arma una lista limpia: suma los platos repetidos y saca los que tienen 0.
3. Pide un número de combo a la secuencia.
4. Bloquea todos los platos y después todos los insumos de todos los platos, ordenados por `id`.
5. **Reutiliza la función de un plato**: por cada plato llama a `registrar_tanda_viandas`. Después de cada uno cambia el motivo de sus salidas a "Producción combo…" y le pone el número de combo.
6. Si un plato falla, lanza un error propio (código `FGT01`). Ese paso 5 está dentro de un bloque con su propio manejo de errores (`begin … exception … end`): al atrapar el error, Postgres **deshace todo lo que hizo el bloque**, incluidos los platos que ya se habían cargado, y la función devuelve qué plato falló y qué le falta.

**Cómo reutiliza la de un plato.** En lugar de copiar las ~100 líneas de la carga de un plato, la llama una vez por plato. Como todo pasa dentro de la misma transacción, cuando se carga el segundo plato **ya ve el stock que dejó el primero**: si los dos usan carne, el segundo se calcula con la carne que quedó.

### Por qué solo el servidor puede ejecutarlas

Supabase permite conectarse a la base directamente desde internet con una clave pública (`anon`). Si las funciones se pudieran ejecutar con esa clave, cualquiera podría cargar o descartar viandas sin pasar por el login.

Por eso, al final de cada archivo se les saca el permiso a `public`, `anon` y `authenticated` y se le da solo a `service_role`, que es la clave secreta que usa `server.js`. Así, la única forma de ejecutarlas es pasando por el servidor, que controla el login y el rol (`sql/stock_viandas_funciones.sql:238-241` y `:425-426`).

## 6. El servidor

> El código completo de cada endpoint, comentado, está en [informe_stock_viandas_codigo.md → Parte 2](informe_stock_viandas_codigo.md#parte-2--el-servidor).

Todos los endpoints de viandas usan `requireAuth` (hay que estar logueado) y `requireRol(6, 5, 1, 2)`: administrador del sistema, dueño, administrador y cocinero.

| Ruta | Qué recibe | Qué devuelve | Qué valida | Línea |
|---|---|---|---|---|
| `GET /api/viandas-stock` | nada | Platos activos: `id, nombre, codigo_plato, stock_heladera, id_plan, plan_nombre, plan_activo, tiene_receta` | — | `server.js:2095` |
| `GET /api/viandas-stock/:idProducto/calculo?cantidad=N` | plato y cantidad | `{ alcanza, insumos: [...], error? }`. No guarda nada | id entero; cantidad entera > 0 | `server.js:2130` |
| `POST /api/viandas-stock/calculo-multiple` | `{ items: [{ id_producto, cantidad }] }` | Igual que el anterior, sumando todos los platos | lista de hasta 100 platos, cantidades enteras ≥ 0, al menos una > 0 | `server.js:2153` |
| `POST /api/viandas-stock/tanda` | `{ id_producto, cantidad, motivo? }` | `{ mensaje, id_movimiento, stock_heladera }`, o **409** con `{ error, faltantes }` | id; cantidad > 0; motivo de hasta 200 caracteres | `server.js:2202` |
| `POST /api/viandas-stock/tanda-multiple` | `{ items, motivo? }` | `{ mensaje, total, items }`, o **409** con `{ error, plato, faltantes }` | igual que calculo-multiple más el motivo | `server.js:2168` |
| `POST /api/viandas-stock/descarte` | `{ id_producto, cantidad, motivo }` | `{ mensaje, id_movimiento, stock_heladera }`, o **409** | id; cantidad > 0; **motivo obligatorio** | `server.js:2241` |
| `GET /api/movimientos-viandas` | nada | Últimos 50 movimientos (completa los combos cortados) con `id_lote, plato_nombre, plan_nombre, usuario_nombre` | — | `server.js:2281` |
| `GET /api/movimientos-stock` (modificado) | nada | Ahora suma `id_movimiento_vianda` y los datos de su tanda: `id_lote`, cantidad, plato, plan y usuario | — (roles 6, 5, 1) | `server.js:1774` |
| `DELETE /api/movimientos-stock/:id` (modificado) | id | **409** si la salida pertenece a una tanda | — | `server.js:1894-1898` |

**Funciones de ayuda del servidor:**
- `leerCantidadViandas` (`server.js:1955`): la cantidad tiene que ser un entero, mayor a 0 (o ≥ 0 en los combos) y no más grande que lo que entra en una columna `integer`.
- `leerItemsViandas` (`server.js:1968`): valida y limpia la lista de un combo.
- `calcularInsumosTanda` (`server.js:2011`): el cálculo previo. Avisa si un plato no existe, está inactivo o no tiene receta.
- `leerMotivoVianda` (`server.js:2081`): motivo opcional u obligatorio, de hasta 200 caracteres.

**El usuario sale del token.** Al loguearse, el servidor entrega un *token* (un texto firmado que dice quién sos y qué rol tenés). En cada carga, el usuario se toma de ese token (`req.usuario.id`) y **nunca** de lo que manda el navegador. Si se tomara del navegador, cualquiera podría hacer una carga a nombre de otra persona.

**Por qué el servidor calcula antes y la base verifica de nuevo.** El cálculo previo (`/calculo`, `/calculo-multiple`) sirve para mostrar en pantalla qué se va a gastar. Pero entre que se calcula y se confirma pueden pasar minutos, y alguien puede haber usado insumos. Por eso, la verificación que vale es la de la función SQL al confirmar: si ya no alcanza, responde 409 y la pantalla pide recalcular.

## 7. Las pantallas

> Las funciones principales enteras, comentadas, están en [informe_stock_viandas_codigo.md → Parte 3](informe_stock_viandas_codigo.md#parte-3--las-pantallas).

### Heladera (`frontend/pages/heladera.html`, `frontend/src/js/heladera.js`, `frontend/src/css/heladera.css`)

**Qué ve el usuario.** En escritorio, dos columnas (`heladera.css:10-22`):
- a la izquierda, la tabla de platos: código, plato, plan, cuántas viandas hay y un botón **Descartar**;
- a la derecha, el panel **Últimos movimientos**, con alto fijo y scroll propio.

En pantallas de menos de 900px el panel pasa abajo de la tabla.

**Qué puede hacer.**
- **+ Cargar combo** (botón principal, `heladera.html:50`): elige plan y cantidad total, revisa el reparto, calcula insumos y confirma.
- **+ Cargar un plato** (`heladera.html:49`): elige un plato y una cantidad, calcula y confirma.
- **Descartar** en cada fila: cantidad y motivo obligatorio.

La pantalla aparece en el menú para los roles 6, 5, 1 y 2 (`roles.js:35`); es la única tabla de menú del sistema, así que con una línea alcanzó.

**El reparto del combo** (`heladera.js:569-586`). Se reparte el total en partes iguales entre los platos del plan **que tienen receta**. Si no da exacto, el sobrante va de a uno a los primeros (ordenados por código de plato, en orden natural: PL2 antes que PL10).

Ejemplo: **10 viandas en 6 platos**.
- 10 ÷ 6 = 1, y sobran 4.
- Todos reciben 1, y los 4 primeros reciben 1 más.
- Resultado: **2, 2, 2, 2, 1, 1**.

Otros: 20 en 6 → 4, 4, 3, 3, 3, 3. 3 en 5 → 1, 1, 1, 0, 0.

Cada casillero se puede cambiar a mano. El contador "**Repartidas X de Y**" (`heladera.js:635-672`) se pone en rojo si la suma no da el total, y en ese caso no deja calcular. Los platos sin receta aparecen grises, con la aclaración "sin receta", y no entran en el reparto.

**Calcular y confirmar** (`heladera.js:681-760`). "Calcular insumos" muestra cuánto se necesita de cada insumo, cuánto hay y si alcanza. "Confirmar" se habilita solo si alcanza todo, y se vuelve a deshabilitar si se cambia el plan, la cantidad o cualquier plato. Lo que se confirma es **exactamente** lo que se calculó (`calculoComboVigente`).

**El panel de movimientos** (`heladera.js:143-289`). Los movimientos con el mismo `id_lote` se juntan en un renglón: "▸ +10 Combo Mantenimiento #12", con fecha corta y usuario. El botón **Detalles** despliega los platos con su cantidad. Si el combo tiene platos de más de un plan, dice "Combo #12". Los platos sueltos y los descartes siguen de a un renglón.

### Movimientos de Stock (`frontend/pages/MovimientosStock.html`, `frontend/src/js/MovimientosStock.js`)

**Las etiquetas** (`MovimientosStock.js:119-146`). La base solo sabe si un movimiento es `entrada` o `salida`. La pantalla lo traduce:

| Etiqueta | Color | Cómo se decide |
|---|---|---|
| Compra | verde | `tipo = 'entrada'` |
| Combo | violeta | salida con `id_movimiento_vianda` y con número de combo (`id_lote`); o, en datos viejos, con motivo que empieza con "Producción combo" |
| Producción | naranja | salida con `id_movimiento_vianda` sin número de combo (un plato suelto) |
| Venta | azul | salida sin tanda, cuyo motivo dice "consumo", "produccion", "pedido" o "#" (los pedidos) |
| Descarte | rojo | cualquier otra salida |

Que una salida venga de la heladera se decide por la columna `id_movimiento_vianda` y **no por el texto del motivo**, porque el texto se puede escribir mal o cambiar.

**El agrupado** (`MovimientosStock.js:162-256`).
- Todas las salidas de un combo se muestran en **un** renglón: "Combo Mantenimiento #12", total de viandas, "viandas", "Producción de combo" y el botón Detalles. **No tiene botón de borrar.**
- Las de un plato suelto, igual: "Producción: 5 Berenjenas rellenas".
- Compras, ventas y descartes siguen de a uno.

**El detalle** (`MovimientosStock.js:311-425`):
- una **tarjeta por plato**, una al lado de la otra, con sus insumos y cantidades alineadas a la derecha;
- si el combo tiene más de un plato, una franja "**Total del combo**" con cada insumo sumado;
- al pie: "Cargado por <usuario> · <fecha y hora>".

Para sumar bien el total de viandas, cada plato se cuenta **una sola vez**: cada salida de insumo repite la cantidad de viandas de su tanda, así que si se sumaran todas las salidas, un plato de 5 viandas con 4 insumos contaría 20.

**Los filtros** (`MovimientosStock.js:460-508`). Primero se agrupa y después se filtra; así el detalle de un combo nunca queda incompleto.
- **Insumo**: un combo aparece si contiene ese insumo, y el insumo se resalta en amarillo en las tarjetas y en el total.
- **Tipo**: "Solo entradas" y "Solo salidas" miran la columna de la base; Compra, Venta, Descarte, Combo y Producción miran la etiqueta (`MovimientosStock.html:337-346`).
- **Fecha**: "Desde" se corrigió para usar la medianoche de Argentina (antes, por usar hora UTC, mostraba también movimientos de las 21 a 24 h del día anterior).

## 8. Decisiones que se tomaron y por qué

| Decisión | Por qué |
|---|---|
| **Un plato sin receta no se puede cargar** | Entrarían viandas a la heladera sin descontar ningún insumo, y el stock de insumos quedaría mal |
| **No se convierten unidades** (si la receta dice gramos, se resta en la unidad del insumo tal cual) | Es la misma regla que ya usaban los pedidos. Si la tanda convirtiera y los pedidos no, el mismo plato gastaría distinto según cómo se cargara. Se deja para cambiar todo junto |
| **No se puede borrar una salida que pertenece a una tanda** | Si se borrara, el insumo volvería al stock pero las viandas seguirían en la heladera |
| **El usuario sale del token**, no del navegador | Para que nadie pueda cargar a nombre de otro |
| **El combo es todo o nada** | Un combo a medias (3 platos cargados de 6) es difícil de notar y de corregir |
| **Bloquear filas siempre en el mismo orden** (platos → insumos, por `id`) | Para que dos cargas al mismo tiempo no se pisen ni se traben entre sí |
| **El combo reutiliza la función de un plato** | No copiar código: si se arregla algo en la carga de un plato, el combo lo hereda |
| **Solo el servidor puede ejecutar las funciones** | Para que no se puedan llamar desde afuera sin login |
| **El cocinero puede usar la Heladera** | Es quien cocina y carga las tandas |
| **Los planes del combo salen de los platos** (`GET /api/viandas-stock`) y no de `/api/planes` | `/api/planes` solo lo pueden usar el dueño y el administrador del sistema; así no hubo que abrir ese permiso |
| **Calcular antes de confirmar, y volver a verificar en la base** | Mostrar qué se va a gastar, pero sin confiar en un cálculo que puede haber quedado viejo |
| **En pantalla nunca dice "lote"** | Es una palabra técnica; para la dueña es un "Combo #12" |
| **Los datos de prueba viejos no se tocaron** | Se muestran sin agrupar; no vale la pena corregirlos |

## 9. Lo que queda pendiente

1. **Que los pedidos descuenten de la heladera.** Es lo más importante (riesgo 1). Al vender, si hay viandas en heladera, restar de ahí (y anotar `cantidad_de_heladera`) en lugar de volver a descontar insumos.
2. **Órdenes de producción para los cocineros.** Hoy la carga se hace cuando ya se cocinó; no hay una lista de "esto hay que cocinar hoy" para el cocinero.
3. **Conversión de unidades** (g ↔ kg, ml ↔ l), cambiándola a la vez en los pedidos, en el cálculo previo y en la función SQL.
4. **Confirmar que exista `movimientos_stock.id_usuario`** en la base (riesgo 2).
5. **Guardar todo en git** (commit) y **ejecutar el SQL antes de subir el servidor** (riesgo 3).
6. **Mostrar el motivo escrito en Movimientos de Stock**: agregar `motivo` al `select` del servidor (riesgo 6).
7. **Una forma de anular una carga o un descarte equivocado**, que deshaga todo junto.
8. **Que el código viejo de stock reste en la base** en lugar de escribir el número final (riesgo 4).
9. **Separar la producción en el reporte de stock** (riesgo 5).
10. **Limitar o paginar desde el servidor** la historia de Movimientos de Stock (riesgo 9).
11. Detalles visuales: la flechita y el botón "Ocultar" iguales en las dos pantallas (riesgo 11).

## 10. Cómo probarlo a mano

Antes: ejecutar el SQL en el orden de la sección 4, reiniciar el servidor y tener al menos un plan con 2 o más platos con receta, y stock en sus insumos.

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 1 | Entrar como administrador y abrir **🧊 Heladera** en el menú | Dos columnas: platos con su cantidad en heladera y, a la derecha, "Últimos movimientos" |
| 2 | **Cargar un plato**: "+ Cargar un plato", elegir uno con receta, cantidad 2, "Calcular insumos" | Tabla con cada insumo: necesario (receta × 2), disponible y ✔. Se habilita "Confirmar tanda" |
| 3 | Cambiar la cantidad a 3 | "Confirmar" se deshabilita; hay que volver a calcular |
| 4 | Volver a 2, calcular y confirmar | El plato sube 2 viandas. En el panel aparece "+2 <plato>". En Gestión de Stock, los insumos bajaron exactamente lo calculado |
| 5 | **Combo y reparto**: "+ Cargar combo", elegir un plan, tocar **10** | Cada plato con receta recibe su parte (con 6 platos: 2, 2, 2, 2, 1, 1). Los platos sin receta, grises con "sin receta". Contador "Repartidas 10 de 10" en verde |
| 6 | Cambiar un plato de 2 a 3 | Contador en rojo: "Repartidas 11 de 10"; "Calcular insumos" deshabilitado |
| 7 | Bajar otro plato en 1 y tocar "Calcular insumos" | Contador en verde. La tabla muestra el total de insumos de todos los platos juntos |
| 8 | Confirmar el combo | Cada plato sube lo suyo. En el panel, **un** renglón "▸ +10 Combo <plan> #N"; "Detalles" muestra los platos |
| 9 | **Que no deje cargar si faltan insumos**: pedir 9999 viandas de un plato y calcular | El insumo que falta aparece en rojo con "Faltan …" y "Confirmar" queda deshabilitado |
| 10 | **Todo o nada**: calcular un combo con stock suficiente, bajar un insumo desde otra pestaña (Gestión de Stock) y recién ahí confirmar | Aparece "<plato>: No alcanzan los insumos…: <insumo> (faltan N). No se cargó ningún plato". Ningún plato ni insumo cambió |
| 11 | **Descartar**: en un plato con 2 viandas, intentar descartar 3, y después descartar 1 sin motivo | Los dos casos dan error |
| 12 | Descartar 1 con motivo "Vencida" | El plato queda en 1. En el panel, "−1" en rojo con el motivo. Los insumos no cambian |
| 13 | **Etiquetas**: abrir Movimientos de Stock | El combo, en un renglón violeta **🍱 Combo** "Combo <plan> #N". El plato suelto, en un renglón naranja **🧊 Producción** "Producción: 2 <plato>". Los pedidos siguen como Venta y las compras como Compra |
| 14 | **Detalle del combo**: tocar "Detalles" en el combo | Una tarjeta por plato con sus insumos, la franja "Total del combo" y el pie "Cargado por … · fecha". La flechita gira y el botón dice "Ocultar" |
| 15 | Intentar borrar una salida de tanda (los renglones agrupados no tienen botón; si queda alguna salida suelta de datos viejos, probar con esa) | El servidor responde "Esta salida pertenece a una tanda de viandas y no se puede borrar desde acá" |
| 16 | **Filtro por tipo y fecha**: elegir "Combo" y Desde = Hasta = hoy | Solo los combos de hoy |
| 17 | Elegir "Producción"; después "Solo salidas" | Solo los platos sueltos; después, todas las salidas, incluidos los combos |
| 18 | **Filtro por insumo**: escribir un insumo que use el combo | El combo sigue visible y, al abrir el detalle, el insumo aparece resaltado en amarillo. Con un insumo que el combo no usa, el combo desaparece |
| 19 | **Cocinero**: entrar con un usuario cocinero | Ve "🧊 Heladera" en el menú, el select de planes del combo se carga, y puede cargar un plato y un combo |
| 20 | **Celular**: achicar la ventana | En la Heladera el panel pasa abajo; en el detalle de Movimientos, las tarjetas quedan una debajo de la otra |
