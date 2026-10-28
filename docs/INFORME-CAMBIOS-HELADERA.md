# Informe: todo lo que cambió en la heladera (pasos H1 a H9)

> Rama `mejoras-fastgood` · 15/10/2026 (actualizado el 17/10/2026).
> **H1 a H6: probados** (H4, H5 y H6 desde la web). Desde el 15/10 la heladera está conectada a la web nueva.
> **H7** (marcas "NO USAR" / "USAR"): bloque 4 corrido y la 4A dio 12 filas en "sí". La prueba completa en la web se salteó (decisión tuya).
> **H8** (pantallas, Parte 1): paradas 1, 2 y 3 (3A, 3B y 3C) **escritas**. El 16/10: SQL corrido y **test HELADERA 40/40**
> por las rutas, contra la base real (pedidos de prueba #11 y #12, anulados; la heladera quedó igual). Falta mirar las pantallas.
> **H9** (Parte 2: el estilo nuevo del CLAUDE.md en todo lo de H8, en las rutas y en las funciones de la base, **sin cambiar
> lo que hacen**): escrito, comparado (lo viejo contra lo nuevo, miles de casos, ver la sección 9) y con el SQL corrido.
> **Pantalla 1, paso 1** (16/10): la web nueva (`index-combos.html`) con el diseño de la maqueta y nombres claros en español
> (sección 13). Comprobado que se ve igual con los nombres nuevos y test HELADERA 40/40. Falta el recorrido a mano.
> **Pantalla 1, paso 2 y diseño final** (16/10): la web nueva es `index.html` (`/`) (13.9) y quedó igual al diseño final v5,
> con animaciones y login en ventana (13.10 y 13.11). Test HELADERA 40/40 en cada cambio. Falta el recorrido a mano.
> **Limpieza** (17/10): se borró el código viejo que no se usaba (10 archivos de código, 27 imágenes, 8 funciones y 24 reglas
> de CSS sueltas) y el index quedó con 1 HTML y 1 CSS (`index.css`, que une `index-combos.css` e `index-final.css`).
> Comparado antes y después: se ve igual (sección 14). Pedido de prueba #30 y test 40/40.
> **Index final** (17/10, `diseno-index-final2/`): `index.css` ordenado (perillas + secciones); en compu, primero las
> tarjetas de categoría y después sus combos, con la tarjeta nueva y "✨ Armalo por mí"; en el celu, el flujo de la
> referencia (pantallas que entran desde la derecha, armado a pantalla completa, datos en una hoja con los días como
> botones). 3 columnas nuevas (SQL que corriste vos) y 5 rutas GET que las mandan. Pedidos de prueba #34, #35 y #38 y
> test 40/40 (#36 y #37), todos anulados (sección 15).
> **Panel con el diseño final** (27/10, `diseno-panel-final/`): el molde en `global.css` y la barra de arriba, Producción
> con "Pedir a cocina" y Consultar Pedidos como las capturas. Solo HTML, CSS y JS para mostrar; sin cambios en el servidor ni
> en la base. Pedido de prueba #58 (Consultar) y los del test (#59 y #60), todos anulados; test HELADERA 37/40: los 3 que
> fallan son por la fecha de la compu, que no coincide con la de la base (sección 19).
> **Cambio chico** (27/10): Consultar Pedidos vuelve a 11 columnas (con Acciones fija a la derecha) y Producción con Plato
> fijo y Plan pegada (sección 20). Test HELADERA 37/40, por la misma fecha.
> **Este informe se actualiza con cada cambio nuevo** (código, SQL, pantallas), con el mismo formato (regla del 15/10).
> Los ejemplos usan tus datos: **fideos con 71 viandas**, el combo de prueba "PRUEBA Mantenimiento x10" y la
> receta de fideos que mostró la prueba de H3: **300 g de harina integral y 2 huevos por vianda**.
> En los `.sql` cada línea tiene su comentario. Acá va el código importante, sin todos los comentarios.

---

## 0. Resumen

### La idea en una frase
Antes, la heladera era una isla: entraban viandas (producción) y salían (descarte), pero ningún pedido la tocaba.
Ahora **cada vez que entra o sale una vianda, UNA función de la base hace todo junto (o no hace nada)**
y lo anota en el cuaderno (`movimientos_viandas`).

### Las 4 acciones

```
                         PRODUCIR  (la cocina toca "Hecho" en un pedido a cocina)
                         producir_viandas
                         heladera +N  ·  insumos − receta × N
                                      │
                                      ▼
  DESCARTAR ◄────────  HELADERA  (productos.stock_heladera)  ◄────────  DEVOLVER
  descartar_viandas    = las viandas LIBRES para vender                 anular_pedido_con_devolucion
  heladera −N                         │                                 (anular en 1, 2 o 3: vuelve lo que se llevó)
  (con motivo)                        ▼
                         VENDER  (el cliente compra en la web nueva)
                         crear_pedido_combos
                         heladera − platos normales (los personalizados NO)
```

| Acción | Cuándo pasa | Función de la base | Heladera | Insumos | Renglón del cuaderno | Paso |
|---|---|---|---|---|---|---|
| PRODUCIR | La cocina toca "Hecho" | `producir_viandas` | + N | − receta × N | `produccion` (+) | H3 |
| VENDER | El cliente crea un pedido de combos | `crear_pedido_combos` | − los platos normales | nada | `venta` (−) | H6 |
| DEVOLVER | Se anula un pedido en 1, 2 o 3 | `anular_pedido_con_devolucion` | + lo que se llevó | nada | `devolucion` (+) | H4 |
| DESCARTAR | Se tiran viandas (motivo obligatorio) | `descartar_viandas` | − N | nada | `descarte` (−) | H2 |

Las 4 funciones siguen las mismas reglas: **todo o nada**, **candado** a lo que tocan (siempre en el mismo orden),
**solo las puede ejecutar el servidor** (`revoke`/`grant`) y buscan las tablas solo en `public` (`search_path`).

Alrededor de las 4 acciones cambiaron estas piezas de `server.js` y de la grilla:

| Pieza | Qué hace ahora | Paso |
|---|---|---|
| `calcularConsumoPedido` | Los insumos de un pedido se cuentan solo con lo que cocina la cocina: cantidad − cantidad_de_heladera | H1 |
| Errores de stock | Mensajes simples (409 = falta un insumo, 500 = error interno), sin detalles de la base | H1 |
| Login | El log ya no guarda emails | H1 |
| `PUT /estado` y `cambiarEstadoPedido` | Un pedido anulado no cambia más de estado; los datos que llegan se controlan | H4 |
| `PUT /estado` | De 1 a 2, si el pedido no tiene nada para cocinar, salta directo a 3 | H5 |
| Grilla (`ListarPedidos.js`) | No deja mover un anulado; muestra el estado que guardó el servidor | H4, H5 |
| Marcas en la base y en los `.sql` | Las funciones viejas dicen "NO USAR" y las 4 nuevas "USAR" (solo comentarios: no cambia lo que hacen) | H7 |
| Pantalla Producción (`heladera.js` reescrito + `pedirCocina.js` nuevo) | Libres, reservadas y en heladera; el mínimo se cambia desde la tabla; "Últimos movimientos" con filtro por tipo y "Ver más" | H8 |
| `GET /api/viandas-stock`, `PUT /api/viandas-stock/:id/minimo` (nueva) y `GET /api/movimientos-viandas` | Traen las reservadas · cambian el mínimo (roles 6, 5 y 1) · filtran el cuaderno, de a 50 | H8 |
| Consultar Pedidos (`ListarPedidos.js` reescrito + `pagoPedido.js` nuevo) y las rutas de pago | Un anulado no se cobra ni cambia de estado (pantalla y servidor: 409); "Volvieron 10 viandas a la heladera"; el aviso del pago dice el estado que quedó | H8 (parada 2) |
| Tareas de Cocina (`pedidosCocina.js`) y la web nueva | "Hecho" muestra el motivo real de la base; si no alcanzan las viandas, la web vuelve a pedir los combos | H8 (parada 3A) |
| `descontar_insumos_pedido` (función nueva) + `movimientos_stock.id_pedido` (columna nueva) | Los insumos de un pedido se descuentan todo junto, una sola vez, atados al pedido y con quién fue (arreglo C1) | H8 (parada 3B) |
| Movimientos de Stock (`GET /api/movimientos` nueva + la tabla de `movimientosStockNuevo.js`) | Insumos y viandas en una sola lista, una fila por cosa que pasó, con su Detalle | H8 (parada 3C) |
| El estilo nuevo (CLAUDE.md, "sin if anidados") | Todo lo de H8, las rutas y las funciones de la base, escrito con `switch`, tablas, `\|\|` y "salir temprano". Hace exactamente lo mismo | H9 |

### Cada vianda gasta sus insumos UNA sola vez

| Si la vianda... | sus insumos se descuentan... |
|---|---|
| sale de la heladera | cuando se produjo (la cocina tocó "Hecho") |
| es personalizada ("sin sal") | cuando el pedido pasa a 3 o 4 |

### Un pedido de fideos de punta a punta

Pedido: 1 combo con 8 fideos + 2 fideos "sin sal", y otro combo con 10 fideos.

| Momento | Heladera (fideos) | Insumos | Cuaderno | Estado | La cocina ve |
|---|---|---|---|---|---|
| Antes | 71 | — | — | — | — |
| El cliente lo compra (H6) | **53** (salen 18) | nada | `venta` −18 | 1 | nada |
| Pasa a 2 (H5: tiene personalizados, queda en 2) | 53 | se revisan los de 2 viandas | — | 2 | "2 fideos ⚠ sin sal" |
| La cocina toca ✓ Listo → pasa a 3 | 53 | − receta × 2 (600 g de harina, 4 huevos) | — | 3 | nada |
| *Si en vez de eso se anulaba en 1, 2 o 3 (H4)* | *71* | *nada* | *`devolucion` +18* | *5* | — |

Y un pedido de **10 fideos sin personalizar**, al pasar de 1 a 2, **salta directo a 3** (H5): no hay nada para cocinar.

---

## Palabras que se repiten (y cosas no básicas, con ejemplo)

| Palabra | Qué quiere decir |
|---|---|
| **Heladera** | El número `productos.stock_heladera`: cuántas viandas **libres** hay de cada plato. Desde H6, las vendidas que todavía no se entregaron ya no cuentan. |
| **Cuaderno** | La tabla `movimientos_viandas`: un renglón por cada entrada (+) o salida (−) de viandas. |
| **`cantidad_de_heladera`** | En cada plato de un pedido (`pedido_detalles`): cuántas de sus viandas salieron de la heladera. 0 si es personalizado. |
| **`listo`** | En cada plato de un pedido: si ya está listo. La cocina solo ve los que no están listos. |
| **Todo o nada** | Una función de la base corre entera en una sola transacción: si algo falla, Postgres deshace todo lo que hizo. |

**SQL**

- **`for update` (candado).** Lee una fila y le pone candado hasta que termine la función. Si otra función quiere esa misma fila, espera.
  ```sql
  select stock_heladera from productos where id = 7 for update;   -- los fideos, con candado
  ```
  Ej: dos clientes compran las últimas 12 viandas a la vez. El primero pone el candado, ve 12, se lleva 10 y quedan 2.
  El segundo esperó; cuando entra, ve 2 y recibe "No quedan suficientes viandas".
- **`perform 1 ... for update`.** Igual que arriba, pero sin traer nada: solo pone los candados.
- **`group by` + `sum`.** Junta las filas del mismo grupo y las suma.
  ```
  platos del pedido          group by plato + sum(cantidad)
   fideos      8              fideos      18
   fideos     10       →      berenjenas   3
   berenjenas  3
  ```
- **`having`.** Filtra DESPUÉS de agrupar. `where` filtra filas sueltas; `having` filtra los grupos ya sumados.
  ```
  cuaderno del pedido #250        sumado por plato              having sum(cantidad) < 0
   fideos     venta      −10       fideos     −10 + 10 = 0       fideos: no (ya se devolvió)
   fideos     devolucion +10   →   berenjenas −3            →    berenjenas: sí → vuelven 3
   berenjenas venta      −3
  ```
- **`coalesce(a, b)`.** Da `a`, y si `a` está vacío (null), da `b`. Ej: `coalesce(null, 0)` → 0 · `coalesce(5, 0)` → 5.
- **`jsonb_array_elements(lista)`.** Abre una lista JSON en filas, una por elemento.
  Ej: `[{"cantidad": 8}, {"cantidad": 10}]` → 2 filas: `{"cantidad": 8}` y `{"cantidad": 10}`.
- **`jsonb_agg(...)`.** Lo contrario: junta filas en una lista. Ej: las filas 8 y 10 → `[8, 10]`.
- **`returning ... into`.** Después de guardar, devuelve cómo quedó. Ej: `update ... set stock_heladera = 71 − 2 returning stock_heladera` → 69.
- **`revoke` / `grant`.** Quién puede ejecutar una función. `revoke ... from public, anon, authenticated` = nadie de afuera
  (ni con la clave pública que tiene el navegador); `grant ... to service_role` = solo el servidor.
- **`set search_path = public`.** La función busca las tablas solo en la carpeta `public`: nadie puede meter una tabla falsa
  con el mismo nombre en otra carpeta.
- **`raise exception` (en las pruebas).** Corta con un error a propósito: Postgres deshace todo lo que hizo el bloque.
- **`comment on ... is '...'`.** Guarda un texto pegado a una función, columna o secuencia. No cambia lo que hace.
  Ej: `comment on function marcar_detalle_hecho(integer, uuid) is 'NO USAR…';` → esa función queda con ese cartel.
  Si después se vuelve a crear la función con `create or replace`, el cartel queda.
- **`obj_description(...)` / `col_description(...)`.** Leen ese texto. Ej: `obj_description(<la función producir_viandas>, 'pg_proc')`
  → `'USAR. PRODUCIR (paso H3)…'`. Si no tiene comentario, dan vacío (null).

**JavaScript**

- **`a ?? b`.** Da `a`, y si `a` es null o undefined, da `b`. Ej: `null ?? 0` → 0 · `5 ?? 0` → 5 · `0 ?? 7` → 0 (el 0 se respeta).
- **`.neq('id_estado', 5)`** (Supabase). "Solo las filas donde `id_estado` es distinto de 5".
- **`.maybeSingle()`** (Supabase). "Espero una fila o ninguna": si no hay ninguna, `data` viene vacío (null) sin error.
  `.single()` en cambio da error si no hay exactamente una (y eso terminaba en un 500).
- **`includes`.** ¿Está en la lista? Ej: `[1, 2, 3, 4].includes(2)` → true · `[1, 2, 3, 4].includes(7)` → false.
- **`forEach`.** Recorre una lista, uno por uno.
- **`some`** (en la ruta de combos; no cambió). ¿Al menos uno cumple?
  Ej: `[{ personalizado: null }, { personalizado: 'sin sal' }].some(p => p.personalizado)` → true.
- **`flatMap`** (ídem). Junta las listas de adentro en una sola.
  Ej: `[{ platos: [fideos, berenjenas] }, { platos: [arroz] }].flatMap(c => c.platos)` → `[fideos, berenjenas, arroz]`.

**Nuevos en H8 (pantalla Producción y sus rutas)**

- **`pedidos!inner ( id_estado )` + `.in('pedidos.id_estado', [1, 2, 3])`** (Supabase). Trae cada renglón de
  `pedido_detalles` con el estado de su pedido, y **solo** los renglones cuyo pedido está en 1, 2 o 3 (`!inner` = "si el
  pedido no cumple, el renglón no viene"). Ej: fideos ×10 del pedido #251 (estado 2) → viene; fideos ×8 del #240 (estado 4) → no.
- **`.gt('cantidad_de_heladera', 0)`** (Supabase). "Mayor que 0" (*greater than*). Ej: 10 → viene · 0 → no.
- **`.range(50, 99)`** (Supabase). Del renglón 50 al 99, contando desde 0: o sea, del 51.º al 100.º.
- **`.update({ … }).eq(…).select(…).maybeSingle()`** (Supabase). Cambia la fila y devuelve cómo quedó (o nada, si no
  había ninguna fila que cumpliera). Ej: mínimo 5 → 100 de los fideos → `{ id: 7, stock_minimo: 100 }`.
- **`Object.keys(objeto)`** / **`Object.values(objeto)`**. Las claves / lo que hay adentro, en una lista.
  Ej: `Object.keys({ 7: 3, 3: 0 })` → `['3', '7']` · `Object.values({ 3: {…}, 5: {…} })` → `[{…}, {…}]`.
- **`URLSearchParams`**. Arma la parte de la dirección que va después del `?`.
  Ej: `{ desde: '50' }` y después `set('tipo', 'venta')` → `"desde=50&tipo=venta"`.
- **`classList.toggle('activo', condición)`**. Pone la clase si la condición es true y la saca si es false.
  Ej: `boton.classList.toggle('activo', 'venta' === 'venta')` → el botón queda marcado.
- **`Promise.all([a, b, c])`**. Espera a que terminen las tres cosas (se hacen a la vez).
  Ej: después de descartar, `Promise.all([cargarPlatos(true), cargarMovimientos(false)])`.
- **`hidden`**. Esconde un elemento. Ej: `botonVerMas.hidden = true` → "Ver más" no se ve.
- **`padStart(2, '0')`**. Completa con ceros adelante. Ej: `'7'.padStart(2, '0')` → `'07'`.
- **`%` (el resto) y `Math.floor`**. `10 % 6` → 4 · `Math.floor(10 / 6)` → 1. "Repartir 10 entre 6" → base 1 y sobran 4: 2, 2, 2, 2, 1, 1.
- **`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`**. La fecha de hoy en Argentina como
  `AAAA-MM-DD` (el formato `en-CA` escribe así), sin importar en qué país está el servidor. Ej: → `'2026-10-15'`.
- **`localeCompare(otro, 'es')`**. Compara dos textos como el diccionario (para ordenar). Ej: `'berenjenas'.localeCompare('fideos', 'es')` → negativo (va antes).

**Nuevos en H8 (paradas 2 y 3) y en H9 (el estilo nuevo)**

- **`a || b` (valor por defecto).** Da `a`, y si `a` está vacío (`''`, `null`, `undefined`, `0`), da `b`.
  Ej: `pedido.cliente_direccion || '-'` → `'Calle 1'` o, si no tiene, `'-'`. Reemplaza a `let x = '-'; if (…) x = …;`.
- **`a ? b : c` (ternario simple).** "Si `a`, `b`; si no, `c`". Solo de un nivel y nunca adentro del HTML.
  Ej: `const textoPagado = pedido.pagado ? 'PAGADO' : 'PENDIENTE';`
- **`?.` ("si existe…").** `pedido.usuarios?.nombre` = el nombre del usuario si vino `usuarios`; si no, `undefined` (sin romper).
  Ej: `document.querySelector('input[name="pago"]:checked')?.value || ''` → el valor marcado, o `''` si no hay ninguno.
- **`switch (x) { case …: … break; }` ("según sea").** Compara una misma variable contra varios valores fijos.
  Ej: `switch (mov.origen) { case 'compra': referencia = 'Compra #2'; break; case 'venta': … }`. Si un `case` termina
  con `return`, no hace falta `break` (el `return` ya sale).
- **Tabla (objeto) en vez de `if / else if`.** Ej: `MENSAJE_VACIO[modo]` con `{ hoy: 'No hay pedidos para producir hoy', … }`.
- **`find` sobre una lista de controles `{ estaMal, mensaje }`.** El primero que está mal da el error (como un "si no, si no").
  Ej: `[{ estaMal: true, mensaje: 'Escribí tu apellido.' }, { estaMal: false, … }].find(c => c.estaMal)` → el primero.
- **`some` / `every`.** ¿AL MENOS UNO cumple? / ¿TODOS cumplen? Ej: `[venta, venta].every(m => m.tipo === 'venta')` → true.
- **`concat`.** Junta dos listas en una nueva. Ej: `[fideos].concat([arroz, tarta])` → `[fideos, arroz, tarta]`.
- **`Array.from(lista)`.** Convierte la lista de la pantalla (`querySelectorAll`) en una lista común, para usar `some`.
- **`DocumentFragment`.** Un "tbody vacío en memoria": se arma el renglón y su Detalle ahí, y se pegan juntos en la tabla.
- **`while (condición) { … }` ("mientras").** Repite mientras se cumpla. No es recorrer una lista: se usa cuando no se
  sabe cuántas vueltas hacen falta. Ej: traer de a 1000 renglones hasta que vengan menos de 1000.
- **`/^Consumo por producción pedido #(\d+)$/.exec(texto)`.** Busca el texto entero (`^` y `$`) y saca el número.
  Ej: `'Consumo por producción pedido #005'` → `['…', '005']`; `'… pedido #005 (a mano)'` → `null`.
- **SQL `case when p_id_pedido < 100 then lpad(…, 3, '0') else p_id_pedido::text end`.** El número con 3 cifras como mínimo,
  igual que `padStart(3, '0')` de JavaScript: 5 → `'005'` · 250 → `'250'` · 5000 → `'5000'`. (Solo `lpad` cortaría el 5000 a `'500'`.)
- **SQL `trim_scale(numero)`.** Saca los ceros de más después de la coma. Ej: `600.000` → `600`.
- **Supabase `.select('id', { count: 'exact', head: true })`** (en el test). Solo cuenta las filas, sin traerlas.

---

## 1. H1: los insumos de un pedido salen solo de lo que cocina la cocina (server.js)

### 1.1 `calcularConsumoPedido`

| Archivo | `server.js:162` |
|---|---|
| Función | `calcularConsumoPedido(pedidoId)` |
| La usan | `verificarStockPedido` (al pasar a 2) y `descontarStockPedido` (al pasar a 3 o 4) |

**ANTES**
```js
.select('id_producto, cantidad')                                   // no leía cantidad_de_heladera
...
for (const detalle of detalles) {
  ...
  for (const r of insumosDelProducto) {
    console.log('[DEBUG RECETA]', r);                              // log de prueba en cada cambio de estado
    const totalNecesario = cantidadReceta * Number(detalle.cantidad);   // ← TODAS las viandas del plato
```

**AHORA**
```js
.select('id_producto, cantidad, cantidad_de_heladera')
...
for (const detalle of detalles) {
  // Lo que cocina la cocina: el total menos lo que salió de la heladera (vacío cuenta como 0)
  const cantidadACocinar = Number(detalle.cantidad) - Number(detalle.cantidad_de_heladera ?? 0);
  if (cantidadACocinar <= 0) continue;          // todo sale de la heladera: se saltea este plato
  ...
    const totalNecesario = cantidadReceta * cantidadACocinar;     // ← solo lo que cocina la cocina
```

**Por qué.** Las viandas de la heladera ya gastaron sus insumos cuando se produjeron. Si se contaba la cantidad total,
al pasar a 3 se descontaban **otra vez** (doble descuento). Y al pasar a 2 podía frenar un pedido por "falta harina"
aunque las viandas ya estuvieran hechas. De paso se sacaron dos `console.log` de prueba.

| ENTRADA | SALIDA |
|---|---|
| El número de pedido | Si alcanza: `{ consumo, stockMap, nombreMap }` (`consumo` = cuánto hace falta de cada insumo). Si no alcanza: `{ status: 409, error: 'Stock insuficiente de "Huevo": …' }`. Si falló la base: `{ status: 500, error: mensaje simple }` |

**Ejemplo.** Pedido de 1 combo: 8 fideos de heladera + 2 fideos "sin sal".

| | ANTES | AHORA |
|---|---|---|
| Viandas que se cuentan | 8 + 2 = 10 | (8 − 8) + (2 − 0) = **2** |
| Harina integral (300 g por vianda) | 3000 g | 600 g |
| Huevo (2 por vianda) | 20 | 4 |

Las 8 de heladera ya gastaron sus 2400 g y sus 16 huevos cuando la cocina tocó "Hecho".

| Se conecta con | |
|---|---|
| Pantallas | Consultar Pedidos (cambiar estado y "Confirmar pago"), Tareas de Cocina (✓ Listo) |
| Rutas | `PUT /api/pedidos/:id/estado`, `GET /api/pedidos/:id/verificar-stock`, `PUT /api/pedidos/:id/listo-cocinero` |
| Tablas | `pedido_detalles`, `producto_insumo`, `insumos` (y `movimientos_stock` al descontar) |

### 1.2 Errores simples: `verificarStockPedido`, `descontarStockPedido`, `cambiarEstadoPedido` y `GET verificar-stock`

**ANTES:** devolvían un texto con el detalle de la base, y ese texto llegaba a la pantalla. Todo error era 409.
```js
return { error: `Error al leer detalles del pedido: ${errDetalles.message}` };
return `Error inesperado al verificar stock: ${error.message}`;
...
if (errorStock) return { status: 409, error: errorStock };      // en cambiarEstadoPedido
...
res.json(errorStock ? { ok: false, error: errorStock } : { ok: true });   // en GET verificar-stock
```

**AHORA:** devuelven `{ status, error }`. 409 = falta un insumo (el mensaje dice cuál); 500 = falló algo interno
(el detalle va solo al log del servidor).
```js
return { status: 500, error: MENSAJE_ERROR_INTERNO };
return { status: 409, error: `Stock insuficiente de "${nombreMap[idNum]}": se necesitan ${cantidadRequerida}, hay ${stockActualNum} disponibles` };
...
if (errorStock) return errorStock;     // ya viene armado: { status: 409 o 500, error }
...
if (!errorStock) return res.json({ ok: true });                                   // alcanza
if (errorStock.status === 500) return res.status(500).json({ error: errorStock.error });
res.json({ ok: false, error: errorStock.error });                                // falta un insumo
```

**Por qué.** Regla del CLAUDE.md: no mostrar errores internos ni detalles de la base. Además, "se cayó la base" no es
lo mismo que "falta harina", y ahora la pantalla los puede distinguir.

| ENTRADA | SALIDA |
|---|---|
| El número de pedido | `null` si todo bien, o `{ status, error }` |

**Ejemplo.** Si no alcanzan los huevos para los 2 "sin sal": 409 `Stock insuficiente de "Huevo": se necesitan 4, hay -35 disponibles`
(Huevo hoy está en −35). La grilla muestra el aviso amarillo y el pedido no cambia de estado.
Si se corta la conexión con la base: 500 con el mensaje simple, y el detalle en el log.

Se conecta con lo mismo que 1.1.

### 1.3 Login sin email en los logs

| Archivo | `server.js:339` (`POST /api/login`) |
|---|---|

**ANTES**
```js
console.log('=== LOGIN INTENTADO ===');
console.log('Identificador recibido:', identificador);
console.log('Usuario no encontrado:', identificador);
console.log('Contraseña inválida para:', identificador);
```
**AHORA**
```js
console.log('Login fallido'); // sin datos: el log no guarda emails ni dice si el usuario existe
console.log('Login fallido'); // mismo texto: no se distingue "no existe" de "contraseña mal"
```

**Por qué.** El log de Render guardaba emails. Y con "no encontrado" vs. "contraseña inválida", quien viera el log podía
saber qué emails tienen cuenta.

| ENTRADA | SALIDA |
|---|---|
| Usuario y contraseña | No cambia: 401 "Usuario o contraseña incorrectos" si está mal |

**Ejemplo.** Alguien prueba `juan@x.com` con una clave mala: la pantalla dice "Usuario o contraseña incorrectos" y el log, solo "Login fallido".

Se conecta con: `login.html` → `POST /api/login` → tabla `usuarios`.

---

## 2. H2: DESCARTAR con `descartar_viandas`

### 2.1 Función de la base `descartar_viandas` (nueva)

| Archivo | `sql/heladera.sql`, bloque 1 (líneas 37–131) |
|---|---|
| Reemplaza a | `registrar_descarte_vianda` (`sql/stock_viandas_funciones.sql`), que queda "NO USAR" |

**ANTES** (`registrar_descarte_vianda`): el motivo podía quedar vacío y no controlaba el usuario.
```sql
-- (no controlaba el usuario ni el motivo)
select id, nombre, stock_heladera into v_producto from productos where id = p_id_producto for update;
...
'En la heladera hay ' || v_producto.stock_heladera || ' viandas de "' || v_producto.nombre || '": no se pueden descartar ' || p_cantidad
...
values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, nullif(trim(p_motivo), ''))   -- motivo vacío → null
```

**AHORA** (`descartar_viandas`)
```sql
-- 1. el usuario tiene que venir
if p_id_usuario is null then return jsonb_build_object('ok', false, 'error', 'Falta el usuario que descarta'); end if;
-- 2. cantidad entera mayor a 0
-- 3. motivo obligatorio y hasta 200 caracteres (la base lo vuelve a controlar)
v_motivo := btrim(coalesce(p_motivo, ''), E' \t\r\n');     -- saca espacios, tabs y saltos de línea de los bordes
if v_motivo = '' then ... 'El motivo es obligatorio'
if char_length(v_motivo) > 200 then ... 'El motivo admite hasta 200 caracteres'
-- 4. candado al plato (no hace falta que esté activo)
select id, nombre, stock_heladera into v_plato from productos where id = p_id_producto for update;
-- 5. no más de las libres
'En la heladera hay ' || v_plato.stock_heladera || ' viandas de «' || v_plato.nombre || '»: no se pueden descartar ' || p_cantidad
-- 6. renglón "descarte" (−) y 7. restar
insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)
values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, v_motivo) returning id into v_id_movimiento;
update productos set stock_heladera = stock_heladera - p_cantidad where id = p_id_producto
returning stock_heladera into v_stock_heladera;
```
(`btrim` ejemplo: `"  vencidos \n"` → `"vencidos"`.)

**Por qué.** El motivo es obligatorio por regla del negocio, y la base lo vuelve a controlar: aunque alguien llamara la
función sin pasar por el servidor, no se guarda un descarte sin motivo. Es una función **nueva** (no se cambió la vieja)
porque Render todavía usa la vieja hasta el merge.

| ENTRADA | SALIDA |
|---|---|
| `p_id_producto`, `p_cantidad`, `p_id_usuario` (sale del token), `p_motivo` | `{ ok: true, id_movimiento, stock_heladera }` o `{ ok: false, error }` (no se guardó nada) |

**Ejemplo** (prueba 1B de H2): descartar 2 fideos con motivo "vencidos".

| | antes | después |
|---|---|---|
| fideos (heladera) | 71 | 69 |
| cuaderno | — | `descarte` −2 · "vencidos" |
| insumos | — | no cambian (ya se gastaron al cocinar) |

Descartar 999 → `{ ok: false, error: "En la heladera hay 71 viandas de «fideos»: no se pueden descartar 999" }`.

| Se conecta con | |
|---|---|
| Pantalla | Producción (`heladera.html` / `heladera.js`) → botón "Descartar" |
| Ruta | `POST /api/viandas-stock/descarte` |
| Tablas | `productos.stock_heladera`, `movimientos_viandas` |

### 2.2 Ruta `POST /api/viandas-stock/descarte` (`server.js:2529`)

**ANTES:** `supabase.rpc('registrar_descarte_vianda', { ... })` · **AHORA:** `supabase.rpc('descartar_viandas', { ... })`, con los mismos parámetros.
La ruta ya controlaba plato, cantidad y motivo (obligatorio, hasta 200), y el usuario sale del token.

| ENTRADA | SALIDA |
|---|---|
| Body `{ id_producto, cantidad, motivo }` | `{ mensaje: 'Descarte registrado', id_movimiento, stock_heladera }` · 400 dato inválido · 409 no se pudo (mensaje de la base) · 500 error interno |

---

## 3. H3: PRODUCIR con `producir_viandas`

### 3.1 Función de la base `producir_viandas` (nueva)

| Archivo | `sql/heladera.sql`, bloque 2 (líneas 155–319) |
|---|---|
| Reemplaza a | `marcar_detalle_hecho` (`sql/Produccion.sql`) + `aplicar_produccion_viandas` (`sql/stock_viandas_funciones.sql`), que quedan "NO USAR" |

**ANTES:** dos funciones, una adentro de la otra.
```
ruta "Hecho" ──► marcar_detalle_hecho(renglón, usuario)
                   1. candado al renglón del pedido a cocina (si ya está hecho: "Este plato ya estaba marcado como hecho")
                   2. candado al plato
                   3. aplicar_produccion_viandas(plato, cantidad, usuario, motivos, false)   ◄── otra función
                        a. ¿tiene receta? (si no: aviso)
                        b. candado a los insumos
                        c. ¿alcanza cada insumo? (modo flexible: avisa y carga igual)
                        d. renglón "produccion" +N
                        e. una salida por insumo, atada al renglón
                        f. heladera + N
                   4. el renglón del pedido a cocina queda hecho
```

**AHORA:** una sola función con los mismos pasos.
```
ruta "Hecho" ──► producir_viandas(renglón, usuario)
                   1. el usuario tiene que venir
                   2. candado al renglón del pedido a cocina (si ya está hecho: mismo mensaje)
                   3. candado al plato
                   4. candado a los insumos de la receta, por número
                   5. ¿tiene receta? (si no: aviso, y entran igual)
                   6. renglón "produccion" +N  ("Pedido a cocina #9")
                   7. por cada insumo: si no alcanza → aviso (queda en negativo); resta; salida atada al renglón 6
                   8. heladera + N
                   9. el renglón del pedido a cocina queda hecho (con id_movimiento_vianda)
```
El paso 7, en código:
```sql
for v_insumo in
  select ins.id, ins.nombre, ins.unidad_medida,
         coalesce(ins.stock_actual, 0) as disponible,
         sum(coalesce(rec.cantidad_necesaria, 0)) * v_detalle.cantidad as necesario   -- receta × viandas
    from producto_insumo rec
    join insumos ins on ins.id = rec.id_insumo
   where rec.id_producto = v_detalle.id_producto
   group by ins.id, ins.nombre, ins.unidad_medida, ins.stock_actual    -- si un insumo está 2 veces en la receta, se suma
   order by ins.id
loop
  if v_insumo.necesario <= 0 then continue; end if;                    -- 0 en la receta: no genera movimiento
  if v_insumo.disponible < v_insumo.necesario then                     -- no alcanza: se carga IGUAL y se avisa
    v_avisos := v_avisos || jsonb_build_object('tipo', 'insumo_corto', ..., 'falta', v_insumo.necesario - v_insumo.disponible);
  end if;
  update insumos set stock_actual = coalesce(stock_actual, 0) - v_insumo.necesario where id = v_insumo.id;
  insert into movimientos_stock (..., motivo, ..., id_movimiento_vianda)
  values (..., 'Producción pedido a cocina #9: 2 fideos', ..., v_id_movimiento);   -- atada al renglón "produccion"
end loop;
```

**Por qué.** Una acción = una función: más fácil de leer y de probar. Da **los mismos textos, avisos y respuesta**, y llena
`id_movimiento_vianda` igual, así "Hecho hoy" y Movimientos de Stock se ven igual que antes.
Única diferencia (aceptada): con un insumo en 0 en la receta que ya está en negativo, la vieja avisaba "Faltaron…" y la nueva no.

| ENTRADA | SALIDA |
|---|---|
| `p_id_detalle` (el renglón del pedido a cocina), `p_id_usuario` (sale del token) | `{ ok: true, id_movimiento, stock_heladera, avisos: [...] }` o `{ ok: false, error }`: "Falta el usuario que marca el plato", "El plato del pedido no existe", "Este plato ya estaba marcado como hecho" |

**Ejemplo** (prueba 2B real): pedido a cocina #9, 2 fideos → "Hecho".

| | antes | después |
|---|---|---|
| fideos (heladera) | 71 | **73** |
| Harina integral | 8700 g | 8100 g (−600 = 300 × 2) |
| Huevo | −35 | −39 (−4 = 2 × 2) → aviso `insumo_corto` "falta 39" |
| cuaderno | — | renglón 18: `produccion` +2 · "Pedido a cocina #9" |
| pedido a cocina | pendiente | hecho, con `id_movimiento_vianda` = 18 |

| Se conecta con | |
|---|---|
| Pantallas | Tareas de Cocina (sección "Para stock") y Producción ("Pendientes de cocina") → botón "Hecho". Después se ve en "Hecho hoy", "Últimos movimientos" y Movimientos de Stock ("Pedido a cocina #9: 2 fideos") |
| Ruta | `POST /api/ordenes-produccion/detalles/:id/hecho` |
| Tablas | `orden_produccion_detalles`, `productos`, `producto_insumo`, `insumos`, `movimientos_viandas`, `movimientos_stock` |

### 3.2 Ruta "Hecho" (`server.js:2683`)

**ANTES:** `supabase.rpc('marcar_detalle_hecho', { ... })` · **AHORA:** `supabase.rpc('producir_viandas', { ... })`, con los mismos parámetros.
La ruta sigue controlando que el número sea un entero mayor a 0 y que un cocinero (rol 2) marque solo lo suyo.

---

## 4. H4: DEVOLVER y "anulado es final"

### 4.1 Función de la base `anular_pedido_con_devolucion` (nueva)

| Archivo | `sql/heladera.sql`, bloque 3 (líneas 344–453) |
|---|---|
| Reemplaza a | El "leer y actualizar" que hacía la ruta anular |

**ANTES** (en la ruta, en dos pasos, sin devolver nada):
```js
const { data: pedido } = await supabase.from('pedidos').select('id, id_estado').eq('id', id).maybeSingle();
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.id_estado === 5) return res.status(409).json({ error: 'El pedido ya está anulado' });
await supabase.from('pedidos').update({ id_estado: 5 }).eq('id', id).select().single();
```

**AHORA** (todo junto, en la base):
```sql
-- 1. el usuario tiene que venir
-- 2. candado al pedido. No existe → "El pedido no existe". En 5 → "El pedido ya está anulado"
select id, id_estado into v_pedido from pedidos where id = p_id_pedido for update;
-- 3. en 1, 2 o 3: candado a los platos que tienen algo para devolver, por número
-- 4. por plato: lo que falta devolver = −(ventas + devoluciones) de ESTE pedido en el cuaderno
if v_pedido.id_estado in (1, 2, 3) then
  for v_plato in
    select mov.id_producto, -sum(mov.cantidad) as cantidad      -- ventas negativas → ej: −(−10 + 0) = 10
      from movimientos_viandas mov
     where mov.id_pedido = p_id_pedido and mov.tipo in ('venta', 'devolucion')
     group by mov.id_producto
    having sum(mov.cantidad) < 0                                -- solo los que tienen algo para devolver
     order by mov.id_producto
  loop
    insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)
    values (v_plato.id_producto, p_id_usuario, p_id_pedido, 'devolucion', v_plato.cantidad,
            'Anulación del pedido #' || p_id_pedido);
    update productos set stock_heladera = stock_heladera + v_plato.cantidad where id = v_plato.id_producto;
    v_total := v_total + v_plato.cantidad;
  end loop;
end if;
-- 5. el pedido pasa a 5 (en 4 también, pero sin devolver)
update pedidos set id_estado = 5 where id = p_id_pedido;
-- 6. cuántas viandas volvieron
return jsonb_build_object('ok', true, 'viandas_devueltas', v_total);
```

**Por qué.** Anular y devolver tienen que pasar juntos: nunca "anulado pero sin devolver". Lo que vuelve sale del cuaderno
de ese pedido (ventas + devoluciones), así **nunca vuelve más de lo que se llevó**, aunque alguien lo saque de 5 y lo vuelva
a anular. En 4 no vuelve nada: las viandas se fueron con el cliente. No toca insumos (lo cocinado no se "descocina")
ni `pedido_detalles`.

| ENTRADA | SALIDA |
|---|---|
| `p_id_pedido`, `p_id_usuario` (quién anula: sale del token) | `{ ok: true, viandas_devueltas: 10 }` o `{ ok: false, error }`: "Falta el usuario que anula el pedido", "El pedido no existe", "El pedido ya está anulado" |

**Ejemplo.** El pedido #250 compró 10 fideos: renglón `venta` −10 y la heladera bajó de 71 a 61.

| Se anula en... | Cuenta en el cuaderno | Heladera | Renglón nuevo | Estado | Responde |
|---|---|---|---|---|---|
| 3 | −10 → vuelven 10 | 61 → **71** | `devolucion` +10 · "Anulación del pedido #250" | 5 | `viandas_devueltas: 10` |
| otra vez | — | 71 | — | 5 | "El pedido ya está anulado" |
| lo sacan de 5 y lo anulan de nuevo | −10 + 10 = 0 → nada | 71 | — | 5 | `viandas_devueltas: 0` |
| 4 (entregado) | no se mira | 61 | — | 5 | `viandas_devueltas: 0` |

Los pedidos de la web vieja, y los de combos de antes de H6, no tienen ventas: se anulan sin devolver nada, igual que antes
(así se anularon #5 y #6).

| Se conecta con | |
|---|---|
| Pantalla | Consultar Pedidos → botón "Anular" (pide el PIN) |
| Ruta | `POST /api/pedidos/:id/anular` |
| Tablas | `pedidos`, `movimientos_viandas`, `productos.stock_heladera` |

### 4.2 Ruta anular (`server.js:1611`)

**ANTES**
```js
const id = parseInt(req.params.id);            // acepta "12abc" (lo lee como 12)
if (!Number.isInteger(id)) ...
// PIN → leer el pedido → 404 / 409 → update a 5 → { mensaje: 'Pedido anulado correctamente', pedido: data }
```
**AHORA**
```js
const id = Number(req.params.id);              // "12abc" → NaN → 400
if (!Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE) return res.status(400).json({ error: 'ID de pedido inválido' });
// PIN (igual) → la función de la base, con el usuario del token
const { data, error } = await supabase.rpc('anular_pedido_con_devolucion', { p_id_pedido: id, p_id_usuario: req.usuario.id });
if (error) return errorInterno(res, error);
if (!data || !data.ok) {                       // no se hizo nada: no existe o ya estaba anulado
  let mensaje = 'No se pudo anular el pedido';
  if (data && data.error) mensaje = data.error;
  return res.status(409).json({ error: mensaje });   // "no existe" ahora es 409 (antes 404)
}
let mensaje = 'Pedido anulado correctamente';
if (data.viandas_devueltas === 1) mensaje = 'Pedido anulado. Volvió 1 vianda a la heladera.';
if (data.viandas_devueltas > 1) mensaje = `Pedido anulado. Volvieron ${data.viandas_devueltas} viandas a la heladera.`;
res.json({ mensaje, viandas_devueltas: data.viandas_devueltas });
```
**Igual que antes:** el límite de intentos (10 fallidos cada 15 minutos), los roles 6, 5 y 1, y el PIN comparado en tiempo constante.

| ENTRADA | SALIDA |
|---|---|
| El número de pedido en la ruta y `{ pin }` en el body | `{ mensaje, viandas_devueltas }` · 400 número inválido · 403 PIN incorrecto · 409 no se pudo (mensaje de la base) · 500 error interno |

### 4.3 `PUT /api/pedidos/:pedidoId/estado` (`server.js:1449`): datos controlados y anulado final

**ANTES**
```js
const { pedidoId } = req.params;                 // sin controlar
const nuevoEstado = parseInt(estado_id);         // si no venía: NaN, y a la base llegaba un estado vacío
... .single();                                   // si el pedido no existía: error 500
// no miraba si estaba en 5: un anulado se podía "revivir" desde la grilla
```
**AHORA**
```js
const pedidoId = Number(req.params.pedidoId);
const nuevoEstado = Number(req.body?.estado_id);
if (!Number.isInteger(pedidoId) || pedidoId <= 0 || pedidoId > ENTERO_MAXIMO_BASE) → 400 'ID de pedido inválido'
if (nuevoEstado === 5)                                                           → 403 'usá "Anular"' (igual que antes)
const estadoValido = [1, 2, 3, 4].includes(nuevoEstado); if (!estadoValido)     → 400 'Estado inválido'
... .maybeSingle(); if (!pedidoActual)                                           → 404 'Pedido no encontrado'
if (pedidoActual.id_estado === 5)                                                → 409 'Un pedido anulado no cambia de estado'
```

**Por qué.** Un anulado ya devolvió sus viandas: si "revive", esas viandas quedan contadas dos veces (en la heladera y en el
pedido). El control está ANTES de revisar o descontar insumos. Y un pedido mal armado ya no llega a la base.

### 4.4 `cambiarEstadoPedido` (`server.js:1380`)

**ANTES:** `.update({ id_estado: nuevoEstado }).eq('id', pedidoId).select().single();`

**AHORA**
```js
.update({ id_estado: nuevoEstado })
.eq('id', pedidoId)
.neq('id_estado', 5)          // solo si NO está anulado
.select()
.maybeSingle();               // si no cambió ninguna fila, data viene vacío
...
if (!data) return { status: 409, error: 'Un pedido anulado no cambia de estado' };   // se corta antes de marcar los platos listos
```

**Por qué.** Por si alguien anula el pedido justo en el medio (entre que la ruta lo leyó y este update): no lo revive.

| ENTRADA | SALIDA |
|---|---|
| El número de pedido y el estado nuevo | `{ status: 200, pedido }` o `{ status, error }` (409 falta un insumo o está anulado, 500 error interno) |

### 4.5 Grilla de Consultar Pedidos (`ListarPedidos.js`)

| Función | ANTES | AHORA |
|---|---|---|
| `crearFilaPedido` (línea 166) | El select de un anulado mostraba todos los estados: se podía elegir 1 a 4 | `if (estadoActualId === ESTADO_CANCELADO) selectEstado.disabled = true;` (gris, no se abre) |
| `confirmarAnulacion` (línea 863) | `pedido.id_estado = data.pedido.id_estado;` | `pedido.id_estado = ESTADO_CANCELADO;` (la respuesta nueva ya no trae el pedido) |

Probado en la web: #5 y #6 quedaron "Cancelado", con el botón "Anulado" gris y sin poder anularse otra vez.

---

## 5. H5: un pedido sin nada para cocinar pasa directo a 3

### 5.1 `PUT /api/pedidos/:pedidoId/estado` (`server.js:1449`, parte nueva)

**ANTES:** `const resultado = await cambiarEstadoPedido(pedidoId, nuevoEstado);`

**AHORA**
```js
let estadoFinal = nuevoEstado;
if (pedidoActual.id_estado === 1 && nuevoEstado === 2) {
  const { data: detalles, error: errDetalles } = await supabase
    .from('pedido_detalles').select('cantidad, cantidad_de_heladera').eq('id_pedido', pedidoId);
  if (errDetalles) return errorInterno(res, errDetalles);

  // Cuántas viandas cocina la cocina: cantidad − cantidad_de_heladera (vacío = 0), igual que calcularConsumoPedido
  let viandasACocinar = 0;
  (detalles || []).forEach(detalle => {
    const aCocinar = Number(detalle.cantidad) - Number(detalle.cantidad_de_heladera ?? 0);
    if (aCocinar > 0) viandasACocinar = viandasACocinar + aCocinar;
  });

  // Salta solo si tiene platos y la cocina no tiene nada que hacer
  const tienePlatos = Array.isArray(detalles) && detalles.length > 0;
  if (tienePlatos && viandasACocinar === 0) estadoFinal = 3;
}
const resultado = await cambiarEstadoPedido(pedidoId, estadoFinal);
```

**Por qué.** Un pedido todo de heladera nace con todos sus platos listos: la cocina no lo ve, así que nadie lo pasaría a 3,
y Envíos solo muestra 3 y 4. Se hace al pasar **de 1 a 2** porque ahí tu prima confirma el pago. Pasa por el mismo
`cambiarEstadoPedido` (no descuenta insumos porque no hay nada para cocinar, marca los platos listos y respeta el
"anulado es final"). Si alguien lo vuelve a mano de 3 a 2, queda en 2.

| ENTRADA | SALIDA |
|---|---|
| Igual que antes: el número de pedido y `{ estado_id }` | Igual que antes: `{ mensaje, pedido }`. Si saltó, `pedido.id_estado` es 3 |

**Ejemplos**

| Pedido | Cuenta | Al pasar de 1 a 2 queda en |
|---|---|---|
| 10 fideos de heladera | 10 − 10 = 0 | **3** |
| 8 fideos de heladera + 2 "sin sal" | 0 + (2 − 0) = 2 | 2 (la cocina ve los 2 "sin sal") |
| Un pedido de la web vieja (10 fideos) | 10 − 0 = 10 | 2, como siempre |
| Un pedido sin platos | no tiene platos | 2 (no salta) |

| Se conecta con | |
|---|---|
| Pantalla | Consultar Pedidos: select de 1 a 2, o "Confirmar pago" |
| Ruta | `PUT /api/pedidos/:id/estado` → `cambiarEstadoPedido(…, 3)` → `descontarStockPedido` (no descuenta nada) |
| Tablas | `pedido_detalles` (lee), `pedidos.id_estado` = 3, `pedido_detalles.listo` = true |
| Después | Aparece en Envíos (si es Delivery); no aparece en Tareas de Cocina |

**Probado en la web (15/10):** pedido de 10 fideos → la heladera bajó 10; al pasarlo de 1 a 2 saltó solo a "Listo para Entregar";
anulado → volvieron 10.

### 5.2 Grilla: `cambiarEstadoPedido` (`ListarPedidos.js:203`)

**ANTES**
```js
selectEstado.dataset.estadoActual = nuevoId;
pedido.id_estado = nuevoId;                 // guardaba el estado ELEGIDO
aplicarColorEstado(selectEstado, nuevoId);
```
**AHORA**
```js
let estadoGuardado = nuevoId;
if (data.pedido && data.pedido.id_estado) estadoGuardado = data.pedido.id_estado;   // el que GUARDÓ el servidor

selectEstado.value = estadoGuardado;
selectEstado.dataset.estadoActual = estadoGuardado;
pedido.id_estado = estadoGuardado;
aplicarColorEstado(selectEstado, estadoGuardado);

if (estadoGuardado !== nuevoId) {
  const idFormatted = '#' + String(pedido.id).padStart(3, '0');
  mostrarExito(`Pedido ${idFormatted}: todo sale de la heladera, pasó directo a Listo para Entregar.`);
}
```

**Por qué.** Si el servidor lo dejó en 3, la grilla tiene que mostrar 3 y no el 2 que se eligió.

| ENTRADA | SALIDA |
|---|---|
| El pedido, su select, el estado elegido y el anterior | `true` si se guardó (y la fila muestra el estado guardado), `false` si no (el select vuelve al anterior) |

---

## 6. H6: VENDER desde la heladera con `crear_pedido_combos`

### 6.1 Función de la base `crear_pedido_combos` (cambiada)

| Archivo | `sql/pedido_combos_funciones.sql` (la función va de la línea 45 a la 375; para instalarla se corre de la 43 a la 389) |
|---|---|
| La llama | `POST /api/pedidos-combos` (`server.js:969`), que es lo que usa la web nueva |

**ANTES**
```sql
-- SIN HELADERA por ahora: no toca stock_heladera ni movimientos_viandas y deja cantidad_de_heladera en 0.
insert into pedido_detalles (..., personalizado, observaciones_plato, cantidad_de_heladera)
values (..., (v_plato_json->>'personalizado') is not null, v_plato_json->>'personalizado', 0);   -- listo quedaba en false
```

**AHORA:** los controles 1 a 10 de siempre, y después:

```sql
-- PARTE 1 (controla, no escribe)

-- 11. LISTA DE VENTAS: por plato, las viandas NORMALES sumando TODOS los combos del pedido
select coalesce(jsonb_agg(jsonb_build_object('id_producto', t.id_producto, 'cantidad', t.cantidad)
                order by t.id_producto), '[]'::jsonb)
  into v_ventas
  from (select (pla.value->>'id_producto')::integer            as id_producto,
               sum((pla.value->>'cantidad')::integer)::integer as cantidad
          from jsonb_array_elements(v_combos_listos) com,         -- cada combo...
               jsonb_array_elements(com.value->'platos') pla      -- ...y cada plato de ese combo
         where pla.value->>'personalizado' is null                -- solo los normales
         group by (pla.value->>'id_producto')::integer) t;
-- Ej: [8 fideos + 2 "sin sal"] y [10 fideos] → [{ "id_producto": 7, "cantidad": 18 }]

-- 12. CANDADO a TODOS los platos del pedido (normales y personalizados), en orden de número
perform 1 from productos
 where id in (select (pla.value->>'id_producto')::integer
                from jsonb_array_elements(v_combos_listos) com, jsonb_array_elements(com.value->'platos') pla)
 order by id
   for update;

-- 13. ¿Alcanza? Plato por plato
for v_venta_json in select value from jsonb_array_elements(v_ventas) loop
  select nombre, stock_heladera into v_stock from productos where id = (v_venta_json->>'id_producto')::integer;
  if v_stock.stock_heladera < (v_venta_json->>'cantidad')::integer then
    return jsonb_build_object('ok', false, 'error',
      'No quedan suficientes viandas de «' || v_stock.nombre || '»: pediste ' || (v_venta_json->>'cantidad')
      || ' y quedan ' || v_stock.stock_heladera);
  end if;
end loop;

-- PARTE 2 (guarda)

-- 14. la cabecera del pedido (igual que antes)
-- 15. cada combo y sus platos: ¿sale de la heladera?
if v_plato_json->>'personalizado' is null then   -- normal: sale de la heladera y nace listo
  v_de_heladera := (v_plato_json->>'cantidad')::integer;
  v_listo := true;
else                                              -- personalizado: lo cocina la cocina
  v_de_heladera := 0;
  v_listo := false;
end if;
insert into pedido_detalles (..., cantidad_de_heladera, listo) values (..., v_de_heladera, v_listo);

-- 16. VENTAS: un renglón por plato (sumado) y la heladera baja
for v_venta_json in select value from jsonb_array_elements(v_ventas) loop
  insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)
  values ((v_venta_json->>'id_producto')::integer, p_id_usuario, v_id_pedido, 'venta',
          -((v_venta_json->>'cantidad')::integer), 'Pedido #' || v_id_pedido);
  update productos set stock_heladera = stock_heladera - (v_venta_json->>'cantidad')::integer
   where id = (v_venta_json->>'id_producto')::integer;
end loop;

-- 17. la respuesta (igual que antes)
```

**Por qué.** Es **el interruptor**: desde acá, lo que compra el cliente sale de la heladera.
- Se suma por plato entre todos los combos: dos combos de 8 fideos no pasan si quedan 12, aunque cada uno solo entraría.
- La base vuelve a controlar el stock aunque la web ya lo limite: quien arme un pedido a mano (desde la consola) no puede
  comprar viandas que no hay.
- **Candado a todos los platos, también a los personalizados:** si no, un pedido nuevo y una anulación podían quedarse
  esperándose uno al otro. Con candados siempre en el mismo orden (por número de plato), uno espera al otro y listo.
- Un solo renglón de venta por plato (−18, no −8 y −10): anular devuelve justo eso.
- Firma la venta el usuario del pedido (el del token o "Consumidor Final"), que lo elige el servidor, nunca el navegador.
- Mismas entradas y misma salida: `server.js` no cambió (solo sus comentarios).

| ENTRADA | SALIDA |
|---|---|
| Igual que antes: el usuario (lo pone el servidor), los datos del cliente, la fecha, el pago, la entrega, el barrio, las observaciones y `p_combos` = `[{ id_combo, platos: [{ producto_id, cantidad, personalizado }] }]` | Igual que antes: `{ ok: true, id_pedido, total, combos }`. Nuevo error posible: `{ ok: false, error: "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12" }` (no se guardó nada) |

**Ejemplo: fideos 71 → 53.** El cliente compra, sin iniciar sesión, 2 combos "PRUEBA Mantenimiento x10":
combo 1 = 8 fideos + 2 fideos "sin sal"; combo 2 = 10 fideos.

| Paso | Qué pasa | Resultado |
|---|---|---|
| 1–10 | Los controles de siempre (combos activos, platos del menú, suma justa 10 + 10, texto "sin sal") | pasan |
| 11 | Lista de ventas: fideos normales = 8 + 10 (los 2 "sin sal" no cuentan) | `[{ fideos, 18 }]` |
| 12 | Candado a fideos | nadie más toca fideos hasta que termine |
| 13 | ¿Alcanza? 71 ≥ 18 | sí |
| 14 | Cabecera del pedido | pedido #N, estado 1, total = precio × 2 |
| 15 | Platos | `8` → de heladera 8, listo sí · `2 "sin sal"` → de heladera 0, listo no · `10` → de heladera 10, listo sí |
| 16 | Venta | cuaderno: `venta` −18 · "Pedido #N" · Consumidor Final · heladera 71 − 18 = **53** |
| 17 | Respuesta | `{ ok: true, id_pedido: N, total, combos }` → la web muestra "¡Recibimos tu pedido #N!" |

Si en vez de 71 hubiera 12: en el paso 13 corta con "No quedan suficientes viandas de «fideos»: pediste 18 y quedan 12",
y no se guarda nada (ni el pedido, ni la venta, ni la heladera).

| Se conecta con | |
|---|---|
| Pantallas | Web nueva (`index-combos.html`: `combosCatalogo.js`, `armarCombo.js`, `carritoCombos.js`, `pedidoCombos.js`). Si sale el error, `pedidoCombos.js` lo muestra tal cual (es un 400) |
| Ruta | `POST /api/pedidos-combos` (controla los datos del cliente; con `some` y `flatMap` mira la forma de los combos, ver arriba) |
| Tablas | `pedidos`, `pedido_combos`, `pedido_detalles`, `productos.stock_heladera`, `movimientos_viandas` |
| Después | El catálogo (`GET /api/v1/combos`, "disponibles" = lo que hay, con tope en la cantidad del combo) baja solo. Producción muestra "Venta −18 · Pedido #N". La cocina ve solo los personalizados. Al pasar de 1 a 2, H5 decide si salta a 3. Anular devuelve las 18 (H4) |

**Probado en la web (15/10):** todo volvió a los números del principio.

| Prueba | Qué pasó |
|---|---|
| 8 fideos + 2 "sin sal" | La heladera bajó 8 (los "sin sal" no). Al pasarlo a 2 frenó con "Stock insuficiente" por el Huevo en −35: es lo esperado, porque en 2 se revisan los insumos de lo que cocina la cocina (2 "sin sal" × 2 huevos = 4). Anulado → volvieron 8 |
| 10 fideos (con H5) | Bajó 10 y al pasar de 1 a 2 saltó solo a 3. Anulado → volvieron 10 |
| Dos ventanas comprando canelones a la vez | La primera se creó; la segunda dio "No quedan suficientes viandas de «canelones»… quedan 6" y no se creó (el candado y el control del paso 13 funcionando). La primera se anuló |

### 6.2 `server.js`: solo comentarios

La ruta `POST /api/pedidos-combos` ya no dice "SIN HELADERA". Su código no cambió: el `ok: false` de la base
(incluido el "No quedan suficientes viandas…") ya se respondía como 400 con el mensaje de la base.

---

## 7. H7: marcas "NO USAR" y "USAR"

### 7.1 Comentarios en la base (`sql/heladera.sql`, bloque 4, líneas 473–515)

| Archivo | `sql/heladera.sql`, bloque 4 |
|---|---|
| Qué es | 12 comentarios (`comment on`): "NO USAR" en 5 funciones viejas, 2 columnas y 1 secuencia; "USAR" en las 4 funciones nuevas |

**ANTES:** las funciones viejas y las nuevas estaban instaladas una al lado de la otra, sin nada que dijera cuál usar
(`marcar_detalle_hecho` y `producir_viandas` hacen casi lo mismo y se veían igual).

**AHORA**
```sql
-- las viejas: "NO USAR"
comment on function marcar_detalle_hecho(integer, uuid) is
  'NO USAR en código nuevo (paso H7). La reemplaza producir_viandas (sql/heladera.sql). La sigue usando el servidor viejo (rama Rodriguez) hasta el merge: no borrar.';
comment on column movimientos_viandas.id_lote is
  'NO USAR (paso H7). Solo lo llenaba registrar_tanda_multiple (sin uso). Los renglones nuevos lo dejan vacío.';
-- ... (y el resto, ver la tabla)

-- las nuevas: "USAR"
comment on function producir_viandas(integer, uuid) is
  'USAR. PRODUCIR (paso H3): la cocina toca "Hecho" en un pedido a cocina. Heladera +N, insumos − receta × N (la única vez para esas viandas) y renglón "produccion". La llama POST /api/ordenes-produccion/detalles/:id/hecho.';
```

| Cosa | Marca | Por qué queda |
|---|---|---|
| `marcar_detalle_hecho` | NO USAR → `producir_viandas` | La usa Render (servidor viejo) hasta el merge |
| `aplicar_produccion_viandas` | NO USAR → `producir_viandas` | La llama `marcar_detalle_hecho` por dentro |
| `registrar_descarte_vianda` | NO USAR → `descartar_viandas` | La usa Render hasta el merge |
| `registrar_tanda_viandas` | NO USAR (sin uso) | No se borra nada sin preguntar |
| `registrar_tanda_multiple` | NO USAR (sin uso; "combo" = varios platos cargados juntos) | Ídem |
| `movimientos_viandas.id_lote` y `movimientos_viandas_lote_seq` | NO USAR (sin uso) | Ídem |
| `orden_produccion_detalles.id_pedido_detalle` | NO USAR (0 renglones la usan) | Ídem |
| `producir_viandas`, `crear_pedido_combos`, `anular_pedido_con_devolucion`, `descartar_viandas` | USAR: PRODUCIR / VENDER / DEVOLVER / DESCARTAR, con qué ruta la llama | Son las que se usan |

**Por qué.** Para que nadie (vos, otro chat o Claude Code) use una función vieja en código nuevo. Se marcan en vez de
borrarse: regla del CLAUDE.md, y el servidor de Render todavía usa dos de ellas.

| ENTRADA | SALIDA |
|---|---|
| Nada | Nada: solo queda un texto guardado en cada cosa. No cambia lo que hacen las funciones, no toca datos y no hace falta reiniciar el servidor |

**Ejemplo con fideos.** La cocina toca "Hecho" en un pedido a cocina de 2 fideos: sigue pasando lo mismo (71 → 73).
El servidor nuevo llama a `producir_viandas` (que dice "USAR") y el de Render a `marcar_detalle_hecho` (que dice "NO USAR…
la sigue usando el servidor viejo hasta el merge"): las dos andan. Si un día alguien abre `marcar_detalle_hecho`, el
comentario le dice cuál usar.

| Se conecta con | |
|---|---|
| Pantallas y rutas | Ninguna cambia |
| Se lee con | `sql/heladera_probar.sql`, parte 4A, y `sql/heladera_revisar.sql` (pregunta 2, columna "comentario") |

### 7.2 Comprobación 4A (`sql/heladera_probar.sql`, líneas 538–584)

Una consulta que solo lee: busca las 9 funciones, las 2 columnas y la secuencia, y muestra su comentario.

| ENTRADA | SALIDA |
|---|---|
| Nada | Una tabla de 12 filas: tipo, nombre, cómo tiene que empezar el comentario ("USAR" o "NO USAR"), el comentario y `esta_bien` ("sí" si empieza bien) |

Ejemplo de una fila: `función · producir_viandas · USAR · USAR. PRODUCIR (paso H3)… · sí`.
Si una dice "(sin comentario)", el bloque 4 no se corrió o falló.

### 7.3 Comentarios en los `.sql` viejos (no hay que correr nada)

| Archivo | Qué se agregó |
|---|---|
| `sql/Produccion.sql` | Arriba de `marcar_detalle_hecho`: "⚠ NO USAR en código nuevo… la reemplaza producir_viandas" |
| `sql/stock_viandas_funciones.sql` | Arriba de todo: "TODAS las funciones de este archivo quedan NO USAR", y una línea arriba de cada función |
| `sql/stock_viandas_lotes.sql` | Arriba de todo: la secuencia y `id_lote` quedan "NO USAR" |
| `sql/heladera_revisar.sql` | Los comentarios de la pregunta 2 ya no dicen que las funciones nuevas "no tendrían que estar" (eso era antes de H2). La consulta no cambió |

Y se corrigió el comentario viejo que nombraba una ruta que ya no existe:

**ANTES**
```
-- Las llama el servidor con supabase.rpc(...):
--   POST /api/viandas-stock/tanda    → registrar_tanda_viandas
--   POST /api/viandas-stock/descarte → registrar_descarte_vianda
```
**AHORA**
```
-- Las llamaba el servidor con supabase.rpc(...):
--   POST /api/viandas-stock/tanda    → registrar_tanda_viandas   (esa ruta ya no existe)
--   POST /api/viandas-stock/descarte → registrar_descarte_vianda (el servidor nuevo usa descartar_viandas)
```

**Por qué.** Quien abra el archivo ve enseguida que no tiene que usarlas. Son comentarios del archivo: no van a la base
y no hay que correr nada.

### 7.4 Documentos (solo texto)

`docs/informe_heladera.md` ahora describe cómo quedó todo (cada problema con "✅ Hx" o pendiente, y las preguntas
contestadas). `docs/ESTADO-PROYECTO.md` y `docs/CONTEXTO-COMPLETO.md` ya no dicen que la heladera falta ni "SIN HELADERA".

---

## 8. H8: las pantallas, con las reglas del CLAUDE.md (Parte 1)

H8 iba en **tres paradas**, probando en la web después de cada una. El 16/10 cambió el plan: **todo de una vez**
(paradas 2 y 3, y la Parte 2 de H9), con un test por las rutas al final.

| Parada | Pantalla | Estado |
|---|---|---|
| 1 | Producción (`heladera.html`) | ✍ escrita (y pasada al estilo nuevo en H9), falta probar en la web |
| 2 | Consultar Pedidos (`ConsultarPedidos.html`) — sección 8.2 | ✍ escrita, falta probar |
| 3 | Ampliada el 16/10: **3A** Tareas de Cocina y la web nueva (8.3) · **3B** los insumos de un pedido en una función de la base, con `id_pedido` (arreglo C1, 8.4) · **3C** Movimientos de Stock con todo junto (8.5) | ✍ escrita, falta correr el SQL de 3B, el test y probar |

En cada parada pasan dos cosas:
1. **El código se reescribe con las reglas del CLAUDE.md**: pocas funciones, cada una con un trabajo entero; `forEach`
   para recorrer; nada de `? :` adentro del HTML; `escHtml` en todo lo que viene de la base; un comentario en cada línea;
   y arriba de cada función, qué hace, su ENTRADA y su SALIDA.
2. **Se agregan las cosas nuevas de H8.**

### 8.1 Parada 1: Producción

**No hay SQL para correr.** Solo hay que reiniciar el servidor (cambió `server.js`) y recargar la página.

| Archivo | Qué cambió |
|---|---|
| `frontend/src/js/heladera.js` | Reescrito: de **54 funciones a 12**. Columnas nuevas, mínimo editable, filtros en "Últimos movimientos" y "Ver más" |
| `frontend/src/js/pedirCocina.js` | **Nuevo.** La ventana "Pedir a cocina", que antes estaba adentro de `heladera.js`, en 7 funciones. Hace lo mismo que antes |
| `frontend/pages/heladera.html` | 8 columnas (cada título nuevo explica qué es al pasar el mouse), el lugar de los filtros de movimientos y de "Ver más", los `onclick` con los nombres nuevos y el `<script>` de `pedirCocina.js` |
| `frontend/src/css/heladera.css` | Al final: las columnas grises, el casillero del mínimo con su ✓, los filtros de movimientos y "Ver más" |
| `server.js` | **Cambian:** `GET /api/viandas-stock` (trae las reservadas) y `GET /api/movimientos-viandas` (filtro y "Ver más"). **Nueva:** `PUT /api/viandas-stock/:id/minimo`. **Solo las reglas** (hacen exactamente lo mismo): `leerItemsViandas`, `POST /api/ordenes-produccion` y `GET /api/ordenes-produccion/hechos-hoy` |

#### 8.1.1 Las funciones de antes y las de ahora

`heladera.js` tenía 54 funciones, muchas de 3 líneas que se usaban una sola vez. Ahora son 19 (12 + 7) y cada una hace
un trabajo entero:

| Ahora | Archivo | Qué hace | Junta lo que hacían antes |
|---|---|---|---|
| `iniciarProduccion` | heladera.js | Al abrir: engancha botones y filtros, hace la primera carga y recarga cada 60 s | el arranque, `iniciarFiltro`, `iniciarModalPedido`, `puedePedir`, `mostrarBotonPedir`, `iniciarActualizacionAutomatica`, `hayVentanaAbierta` y el "cerrar al tocar afuera" |
| `estadoDelPlato` | heladera.js | La regla del estado: sin stock / bajo / bien / sin control | `estadoStock` (la misma regla) |
| `cargarPlatos` | heladera.js | Pide los platos y dibuja la tabla | `fetchPlatos` |
| `renderizarTabla` | heladera.js | Los botones de estado, la franja "Te faltan…" y la tabla | `aplicarFiltro`, `contarEstados`, `renderizarFiltrosEstado`, `actualizarAvisoFaltantes`, `compararEstado`, `faltaPlato`, `etiquetaEstado`, `renderizarPlatos`, `crearFilaPlato` |
| `guardarMinimo` | heladera.js | Cambia el mínimo de un plato | **nueva** |
| `cargarMovimientos` | heladera.js | "Últimos movimientos" con filtro y "Ver más" | `fetchHistorial`, `renderizarHistorial`, `crearRenglonMovimiento`, `cantidadConSigno`, `fechaCorta` |
| `cargarHechosHoy` | heladera.js | "Hecho hoy" | `fetchHechosHoy`, `renderizarHechosHoy`, `horaCorta` |
| `cargarPendientesCocina` | heladera.js | Los pendientes, el número del botón y abrir la ventana | `fetchPendientes`, `abrirModalPendientes` |
| `abrirDescarte` | heladera.js | Abre "Descartar" con los datos del plato | `abrirModalDescarte` |
| `confirmarDescarte` | heladera.js | Controla y manda el descarte | `confirmarDescarte`, `leerCantidad`, `mostrarErrorModal` |
| `cerrarVentana` | heladera.js | Cierra cualquiera de las 3 ventanas | `cerrarModalPedido`, `cerrarModalPendientes`, `cerrarModalDescarte` |
| `mostrarToast` | heladera.js | El aviso flotante | `mostrarToast` (igual) |
| `abrirPedirACocina` | pedirCocina.js | Abre "Pedir a cocina": fecha, "Mostrar" y lista limpia | `abrirModalPedido`, `planesConPlatos`, `agregarOpcion` |
| `platosDelFiltro` | pedirCocina.js | Los platos que se ven con "Mostrar", ordenados | `platosVisiblesPedido`, `compararPlatosPedido` |
| `renderizarListaPedido` | pedirCocina.js | La lista con −, casillero y + | `renderizarListaPedido`, `pintarFilaPedido`, `cambiarCantidadPedido`, `filtroEsPlan`, `alCambiarPlanPedido` |
| `leerCantidadPedida` | pedirCocina.js | Lo escrito en un plato, como número | `cantidadAPedir` |
| `actualizarTotalPedido` | pedirCocina.js | "Total: N viandas en M platos" y si se puede enviar | `actualizarResumenPedido` |
| `cargaRapida` | pedirCocina.js | "A cada uno", "Repartir" y "Limpiar" | `pedidoACadaUno`, `pedidoRepartir`, `pedidoLimpiar`, `leerCargaRapida`, `partesIguales` |
| `enviarPedidoACocina` | pedirCocina.js | Manda el pedido a cocina | `enviarPedido`, `itemsDelPedido` |

En H9 (sección 9) se sumaron 3 funciones con el estilo nuevo: `crearFilaPlato` y `fechaYHoraCortas` en `heladera.js`
(ahora 14) y `alCambiarCantidad` en `pedirCocina.js` (ahora 8). Ver 9.3.

**Por qué se separó `pedirCocina.js`.** "Pedir a cocina" es una ventana entera, con su lista, su filtro y su carga rápida
(casi la mitad del archivo viejo). Separada, cada archivo se lee de una vez. Las dos comparten `todosPlatos` y
`estadoDelPlato`, que están en `heladera.js` (se carga antes).

Los `onclick` del HTML cambiaron de nombre:

| Botón | ANTES | AHORA |
|---|---|---|
| "+ Pedir a cocina" y "Pedir los que faltan" | `abrirModalPedido()` | `abrirPedirACocina()` |
| "A cada uno" / "Repartir" / "Limpiar" | `pedidoACadaUno()` / `pedidoRepartir()` / `pedidoLimpiar()` | `cargaRapida('cada')` / `cargaRapida('repartir')` / `cargaRapida('limpiar')` |
| "Enviar a cocina" | `enviarPedido()` | `enviarPedidoACocina()` |
| "Pendientes de cocina" | `abrirModalPendientes()` | `cargarPendientesCocina(true)` |
| La × y "Cancelar" de las ventanas | `cerrarModalPedido()`, `cerrarModalPendientes()`, `cerrarModalDescarte()` | `cerrarVentana('modalPedido')`, `cerrarVentana('modalPendientes')`, `cerrarVentana('modalDescarte')` |

#### 8.1.2 Las viandas reservadas (`GET /api/viandas-stock` y 3 columnas)

| Archivo | `server.js` (ruta `GET /api/viandas-stock`) y `heladera.js` (`renderizarTabla`) |
|---|---|
| Qué es | La tabla muestra, por plato: **Libres** (se pueden vender), **Reservadas** (ya son de un pedido que no se entregó) y **En heladera** (las dos juntas: lo que hay de verdad) |

**ANTES** (servidor): solo mandaba `stock_heladera`.
```js
const resultado = (data || []).map(p => {
  ...
  return { id: p.id, nombre: p.nombre, stock_heladera: Number(p.stock_heladera || 0), stock_minimo: ..., ... };
});
```
**ANTES** (pantalla): 6 columnas: Plato · Plan · Stock · Mínimo · Estado · Acciones.

**AHORA** (servidor): una segunda consulta trae las reservadas, y se suman por plato.
```js
// 2. Las reservadas: los platos de pedidos en 1, 2 o 3 que salieron de la heladera.
//    Se suma cantidad_de_heladera (NO cantidad): un personalizado tiene 0, porque no salió de la heladera.
const { data: renglones, error: errRenglones } = await supabase
  .from('pedido_detalles')
  .select('id_producto, cantidad_de_heladera, pedidos!inner ( id_estado )')
  .gt('cantidad_de_heladera', 0)              // solo los que sacaron viandas de la heladera
  .in('pedidos.id_estado', [1, 2, 3]);        // de pedidos que no se entregaron ni se anularon

// 3. Las reservadas de cada plato: { id_producto: viandas }. Ej: renglones de 8 y de 10 fideos → { 7: 18 }
const reservadasPorPlato = {};
(renglones || []).forEach(renglon => {
  const yaSumadas = reservadasPorPlato[renglon.id_producto] || 0;
  reservadasPorPlato[renglon.id_producto] = yaSumadas + Number(renglon.cantidad_de_heladera);
});

// 4. Un objeto por plato
const libres = Number(plato.stock_heladera || 0);
const reservadas = reservadasPorPlato[plato.id] || 0;
resultado.push({ ..., stock_heladera: libres, reservadas: reservadas, en_heladera: libres + reservadas, ... });
```
**AHORA** (pantalla): 8 columnas: Plato · Plan · **Libres** · **Reservadas** · **En heladera** · Mínimo · Estado · Acciones.
```js
<td class="celda-stock">${Number(plato.stock_heladera)}</td>      // Libres (en negrita: es la que manda)
<td class="celda-secundaria">${Number(plato.reservadas)}</td>      // Reservadas (en gris)
<td class="celda-secundaria">${Number(plato.en_heladera)}</td>     // En heladera (en gris)
```

**Por qué.** Desde H6, una vianda vendida sale de `stock_heladera` en el momento de la compra, pero sigue en la heladera
de verdad hasta que se entrega. Sin estas columnas, quien cuenta la heladera ve 71 viandas y la pantalla dice 61.
Ahora se ven las dos cosas: 61 libres + 10 reservadas = 71 en la heladera.

**Por qué `cantidad_de_heladera` y no `cantidad`.** Las reservadas son las viandas que **salieron de la heladera** y
todavía están ahí. Un personalizado ("sin sal") tiene `cantidad_de_heladera` = 0: no salió de la heladera (lo cocina la
cocina), así que no reserva nada. Los pedidos de la web vieja también tienen 0. Los estados 4 (entregado: la vianda ya se
fue) y 5 (anulado: las viandas volvieron a las libres, H4) no cuentan.

**El estado (Sin stock / Bajo / Bien) y "Descartar" siguen mirando solo las LIBRES**: las reservadas ya son de alguien.

| ENTRADA | SALIDA |
|---|---|
| Nada (el usuario logueado, con rol 6, 5, 1 o 2) | Un objeto por plato activo: `{ id, nombre, stock_heladera (las libres), reservadas, en_heladera, stock_minimo, id_plan, plan_nombre, plan_activo, tiene_receta }`. 500 con un mensaje simple si falla la base |

**Ejemplo con fideos** (empieza con 71 libres):

| Momento | Libres | Reservadas | En heladera |
|---|---|---|---|
| Antes | 71 | 0 | 71 |
| Un cliente compra 10 fideos (estado 1) | 61 | 10 | 71 |
| Pasa a 2 y salta solo a 3 (H5) | 61 | 10 | 71 |
| Se entrega (4) | 61 | 0 | **61** (se fueron) |
| *Si en vez de entregarse se anulaba (5, H4)* | *71* | *0* | *71* |

Y un pedido de 8 fideos + 2 "sin sal": libres 63, **reservadas 8** (los 2 "sin sal" los cocina la cocina).

| Se conecta con | |
|---|---|
| Pantalla | Producción: la tabla (y `abrirDescarte`, que avisa cuántas reservadas no se pueden descartar) |
| Ruta | `GET /api/viandas-stock` (roles 6, 5, 1 y 2) |
| Tablas | `productos` (`stock_heladera`, `stock_minimo`), `planes`, `producto_insumo`, `pedido_detalles` (`cantidad_de_heladera`), `pedidos` (`id_estado`) |

**Seguridad.** Las reservadas las calcula el servidor desde la base, nunca la pantalla. La consulta usa `.gt` e `.in`
(son parámetros, no texto pegado: nadie puede meter SQL). En la pantalla, cada número pasa por `Number()` y cada texto
por `escHtml`: si un plato se llamara `<script>…`, se ve como texto y no se ejecuta (protege de XSS).

#### 8.1.3 El mínimo se cambia desde la tabla (`PUT /api/viandas-stock/:id/minimo` y `guardarMinimo`)

| Archivo | `server.js` (ruta nueva) y `heladera.js` (`renderizarTabla` + `guardarMinimo`) |
|---|---|
| Qué es | En la columna Mínimo, los roles 6, 5 y 1 ven un casillero con ✓. El cocinero ve solo el número |

**ANTES.** El mínimo de un plato se veía en la tabla, pero no se podía cambiar desde ninguna pantalla (solo en la base).

**AHORA** (servidor)
```js
const ROLES_CAMBIAN_MINIMO = [6, 5, 1];
const MINIMO_MAXIMO = 9999;

app.put('/api/viandas-stock/:id/minimo', requireAuth, requireRol(...ROLES_CAMBIAN_MINIMO), async (req, res) => {
  const idProducto = Number(req.params.id);                           // el plato, de la dirección
  if (!Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'ID de plato inválido' });
  }
  const minimo = leerCantidadViandas(req.body?.stock_minimo, true);   // entero >= 0, o null
  if (minimo === null || minimo > MINIMO_MAXIMO) {
    return res.status(400).json({ error: `El mínimo tiene que ser un número entero de 0 a ${MINIMO_MAXIMO}` });
  }
  const { data, error } = await supabase
    .from('productos')
    .update({ stock_minimo: minimo })   // cambia el mínimo...
    .eq('id', idProducto)               // ...de este plato...
    .eq('activo', true)                 // ...solo si está activo...
    .select('id, stock_minimo')         // ...y devuelve cómo quedó
    .maybeSingle();                     // una fila o ninguna
  if (error) return errorInterno(res, error);
  if (!data) return res.status(404).json({ error: 'El plato no existe o está desactivado' });
  res.json({ mensaje: 'Mínimo actualizado', id: data.id, stock_minimo: data.stock_minimo });
});
```
**AHORA** (pantalla): el casillero se arma ANTES del HTML, con un `if` (nada de `? :` adentro):
```js
let celdaMinimo = String(Number(plato.stock_minimo));     // el cocinero solo ve el número...
if (puedeAdministrar) {                                    // ...los que administran lo pueden cambiar
  celdaMinimo = `
    <div class="minimo-editar">
      <input type="number" class="input-minimo" min="0" max="9999" step="1" value="${Number(plato.stock_minimo)}"
             aria-label="Mínimo de ${escHtml(plato.nombre)}">
      <button type="button" class="btn-guardar-minimo" title="Guardar el mínimo">✓</button>
    </div>`;
}
```
y `guardarMinimo` controla el número (entero de 0 a 9999), lo manda con `PUT` y, si sale bien, redibuja la tabla en la
misma página (el plato puede cambiar de estado) y avisa "Mínimo de «fideos»: 100". Se guarda con ✓ o con Enter.

**Por qué.** El mínimo decide si un plato está Bajo, la franja "Te faltan…" y qué se le pide a la cocina; hasta ahora
solo se cambiaba en la base. Roles 6, 5 y 1 porque son los que piden a cocina (el cocinero cocina lo que le piden).

| | ENTRADA | SALIDA |
|---|---|---|
| Ruta | El número de plato en la dirección y `{ stock_minimo }` en el body | `{ mensaje: 'Mínimo actualizado', id, stock_minimo }` · 400 si un dato está mal · 404 si el plato no existe o está desactivado · 401/403 sin login o sin permiso · 500 error interno |
| `guardarMinimo` | `idProducto` y el casillero (`input`) | Nada: si sale bien, cambia el mínimo en `todosPlatos`, redibuja y avisa; si no, avisa el error y deja el casillero para corregir |

**Ejemplo con fideos** (61 libres, mínimo 5 → "Bien"): escribís 100 y tocás ✓ →
`PUT /api/viandas-stock/7/minimo` con `{ stock_minimo: 100 }` → la fila pasa a **Bajo** (61 < 100), aparece la franja
"Te faltan 1 plato: 1 bajo" y el aviso "Mínimo de «fideos»: 100". Lo volvés a 5 → "Bien" otra vez.
Con 0 → "Sin control" (nunca falta).

| Control de seguridad | Qué protege, y de qué |
|---|---|
| `requireAuth` | Sin login → 401. Nadie de internet puede cambiar mínimos |
| `requireRol(6, 5, 1)` | Un cocinero que llame a la ruta desde la consola del navegador → 403. La pantalla le esconde el casillero, pero el que decide es el servidor |
| Número de plato entero > 0 | Rechaza `7abc`, `-1` o `1.5` con 400, antes de tocar la base |
| Mínimo entero de 0 a 9999 | Rechaza `"abc"`, `2.5`, `-3` o `99999999` con 400: lo que queda en la base siempre tiene sentido |
| `.eq('id', …)` y `.eq('activo', true)` | Son parámetros, no texto pegado: no se puede meter SQL (inyección). Y un plato desactivado no se toca |
| `errorInterno` | Si falla la base, la pantalla ve un mensaje simple y el detalle va al log del servidor |
| `escHtml` en el `aria-label` | El nombre del plato va adentro de un atributo: si tuviera comillas o `<`, no rompe el HTML (XSS) |

| Se conecta con | |
|---|---|
| Pantalla | Producción: la columna Mínimo (✓ o Enter → `guardarMinimo`) |
| Ruta | `PUT /api/viandas-stock/:id/minimo` (nueva) |
| Tabla | `productos.stock_minimo` (solo ese número: no toca la heladera ni el cuaderno) |
| Después | `estadoDelPlato`, la franja "Te faltan…", los botones de estado y "Pedir a cocina" usan el mínimo nuevo |

La recarga automática (cada 60 s) **no** recarga mientras el cursor está en un casillero de mínimo, para no borrar lo que
estás escribiendo. Si escribís un número y no tocás ✓ ni Enter, no se guarda.

#### 8.1.4 "Últimos movimientos": filtro por tipo y "Ver más" (`GET /api/movimientos-viandas` y `cargarMovimientos`)

**ANTES** (servidor): siempre los últimos 50, de todos los tipos.
```js
app.get('/api/movimientos-viandas', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_viandas')
    .select('id, tipo, cantidad, motivo, fecha, productos ( nombre ), usuarios ( nombre, apellido )')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  ...
  const resultado = (data || []).map(m => { ... });
```
**AHORA** (servidor): `?tipo=` y `?desde=` (los dos opcionales), y de a 50.
```js
const TIPOS_MOVIMIENTO_VIANDA = ['produccion', 'venta', 'devolucion', 'descarte', 'ajuste'];
const MOVIMIENTOS_POR_PAGINA = 50;

// 1. El tipo: vacío (todos) o uno de la lista cerrada
let tipo = '';
if (req.query.tipo != null && req.query.tipo !== '') {
  tipo = String(req.query.tipo);
  if (!TIPOS_MOVIMIENTO_VIANDA.includes(tipo)) return res.status(400).json({ error: 'Tipo de movimiento inválido' });
}
// 2. Desde: cuántos saltear (entero >= 0; vacío = 0)
let desde = 0;
if (req.query.desde != null && req.query.desde !== '') {
  desde = leerCantidadViandas(req.query.desde, true);
  if (desde === null) return res.status(400).json({ error: 'El valor de "desde" es inválido' });
}
// 3. La consulta
let consulta = supabase.from('movimientos_viandas').select('...')
  .order('fecha', { ascending: false })
  .order('id', { ascending: false })
  .range(desde, desde + MOVIMIENTOS_POR_PAGINA - 1);   // Ej: (50, 99) → del 51.º al 100.º
if (tipo) consulta = consulta.eq('tipo', tipo);       // solo ese tipo, si se eligió uno
```
**AHORA** (pantalla): arriba de la lista, los botones **Todos · Producción · Ventas · Devoluciones · Descartes**; abajo,
**"Ver más"** (aparece solo si llegaron 50, porque puede haber más).
```js
const parametros = new URLSearchParams({ desde: String(movimientosMostrados) });  // cuántos saltear
if (tipoMovimientos) parametros.set('tipo', tipoMovimientos);                     // y el tipo, si se eligió
const respuesta = await apiFetch('/api/movimientos-viandas?' + parametros.toString());
...
movimientosMostrados = movimientosMostrados + movimientos.length;
botonVerMas.hidden = movimientos.length < MOVIMIENTOS_POR_PAGINA;   // llegaron menos de 50 = no hay más
```

**Por qué.** Desde H6 cada compra de la web anota una "Venta" en el cuaderno: los 50 últimos se llenan de ventas y una
producción o un descarte de ayer ya no se ve. Con el filtro se ve un solo tipo, y con "Ver más" se va más atrás.
"Ajuste" lo acepta el servidor, pero no tiene botón (todavía no hay ajustes).

| | ENTRADA | SALIDA |
|---|---|---|
| Ruta | `?tipo=` (vacío = todos) y `?desde=` (vacío = 0) | Hasta 50 renglones `[{ id, tipo, cantidad, motivo, fecha, plato_nombre, usuario_nombre }]` · 400 si `tipo` o `desde` son inválidos · 500 |
| `cargarMovimientos(agregar)` | `false` = empezar de nuevo (al abrir y al tocar un filtro) · `true` = "Ver más" | Nada: dibuja (o agrega abajo) los renglones, marca el filtro elegido y muestra u oculta "Ver más" |

**Ejemplo con fideos.** Tocás **Ventas** → `GET /api/movimientos-viandas?desde=0&tipo=venta` → el renglón
"−10 fideos" / "Venta · 15/10 18:40 · Consumidor Final" / "Pedido #251". Tocás **Producción** → "+2 fideos" /
"Producción · 15/10 14:32 · …" / "Pedido a cocina #9". Si hay más de 50, "Ver más" pide `?desde=50` y agrega del 51 al 100.

| Control de seguridad | Qué protege, y de qué |
|---|---|
| `tipo` de una lista cerrada (5 tipos) | Lo que llega en la dirección nunca se pega en la consulta: si no es uno de los 5 → 400. Nadie puede meter SQL ni pedir tipos inventados |
| `desde` entero >= 0 | Rechaza `-5`, `abc` o `1.5` con 400 |
| De a 50 (`range`) | Nadie puede pedir el cuaderno entero de una vez (miles de renglones): protege al servidor y a la base de una sobrecarga |
| `escHtml` en cada texto (plato, motivo, usuario) | Un motivo de descarte como `<img onerror=…>` se ve como texto y no se ejecuta (XSS) |

| Se conecta con | |
|---|---|
| Pantalla | Producción: el panel "Últimos movimientos" |
| Ruta | `GET /api/movimientos-viandas` (roles 6, 5, 1 y 2) |
| Tablas | `movimientos_viandas` (el cuaderno), `productos` (el nombre), `usuarios` (quién) |
| Se recarga | Al abrir, al tocar un filtro y después de descartar |

#### 8.1.5 "Descartar": solo las libres

| | ANTES | AHORA |
|---|---|---|
| Arriba de la ventana | "fideos — en stock: 61 viandas" | "fideos — libres: 61 (las 10 reservadas no se pueden descartar)" |
| Si pedís más | "No podés descartar más viandas de las que hay en stock." | "No podés descartar más viandas de las libres." |
| Al terminar | "Descarte registrado. En stock: 59 viandas." y la tabla volvía a la página 1 | "Descarte registrado. Libres: 59." y la tabla se queda en la misma página |

La base ya lo controlaba desde H2 (`descartar_viandas`: "En la heladera hay 61 viandas de «fideos»: no se pueden
descartar 70"). La pantalla ahora lo explica antes de que pase.

#### 8.1.6 Cómo se escribió: las reglas del CLAUDE.md, con ejemplos

| Regla | ANTES | AHORA |
|---|---|---|
| Recorrer con `forEach` (sin `some`) | `return [...document.querySelectorAll('.modal')].some(m => m.style.display === 'block');` | `let hayVentanaAbierta = false;` y `forEach(ventana => { if (ventana.style.display === 'block') hayVentanaAbierta = true; })` |
| Recorrer con `forEach` (sin `for` con contador) | `for (let i = 0; i < cantidadPlatos; i++) { let parte = base; if (i < sobrante) parte = base + 1; … }` (en `partesIguales`) | `visibles.forEach((plato, posicion) => { let parte = base; if (posicion < sobrante) parte = base + 1; … })` (adentro de `cargaRapida`) |
| Armar el HTML con `forEach` | `lista.innerHTML = hechos.map(h => { … }).join('');` | `let html = '';` · `hechos.forEach(hecho => { … html += …; });` · `lista.innerHTML = html;` |
| Nada de trucos | `mostrarErrorModal('dError', data.error \|\| 'No se pudo registrar el descarte.');` | `let mensaje = 'No se pudo registrar el descarte.';` · `if (datos.error) mensaje = datos.error;` |
| Lo corto que se usa una vez, adentro | `hoyEnArgentina()` y `diaSiguiente()` (servidor); `fechaCorta`, `horaCorta` y `cantidadConSigno` (pantalla) | Adentro de la ruta `hechos-hoy`, de `cargarMovimientos` y de `cargarHechosHoy` |
| `forEach` también en el servidor | `leerItemsViandas`: `for (const item of items) { … return { error }; }` y `Object.entries(…).map(…).filter(…).sort(…)` | `items.forEach(…)` con `let error = null` (con el primer error, los demás renglones se saltean) y `Object.keys(…).forEach(…)`. Se comparó la vieja con la nueva en 21 casos: dan lo mismo |

**Ojo: el 16/10 cambiaron las reglas** (sección "Estilo" del CLAUDE.md): ahora sí van `some`, `||` y el ternario simple
fuera del HTML, y nunca un `if` adentro de otro. Cómo quedó esta pantalla con eso está en la sección 9.3.

#### 8.1.7 Qué probar en la web (parada 1)

Reiniciar el servidor y recargar Producción con Ctrl+F5. Probar cuando tu prima no esté cargando. Los pedidos de prueba
se crean y se anulan solo desde el servidor nuevo.

| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís Producción como admin | 8 columnas: Plato · Plan · Libres · Reservadas · En heladera · Mínimo · Estado · Acciones. Sin pedidos de la web nueva sin entregar: Reservadas 0 y En heladera = Libres |
| 2 | En la web nueva comprás 10 fideos y recargás Producción | fideos: Libres 61 · Reservadas 10 · En heladera 71 |
| 3 | Mínimo de fideos: 100 y ✓ | Pasa a "Bajo", aparece "Te faltan…" y el aviso "Mínimo de «fideos»: 100" |
| 4 | Mínimo: `abc`, `2.5` o `-3`, y ✓ | Aviso rojo "El mínimo tiene que ser un número entero de 0 a 9999." y no cambia nada |
| 5 | Mínimo de fideos otra vez en 5, con Enter | Vuelve a "Bien" |
| 6 | "Descartar" en fideos: abrís y Cancelar (sin descartar) | "fideos — libres: 61 (las 10 reservadas no se pueden descartar)" |
| 7 | Últimos movimientos: Ventas, Producción, Devoluciones, Descartes y Todos | Cada filtro muestra solo ese tipo. En Ventas, arriba: "−10 fideos · Venta · … · Pedido #N" |
| 8 | "Ver más" (si aparece) | Agrega los 50 siguientes abajo. Si no aparece, es que hay menos de 50 de ese tipo |
| 9 | Anulás el pedido de prueba (Consultar Pedidos) y recargás Producción | fideos: Libres 71 · Reservadas 0 · En heladera 71. En Devoluciones: "+10 fideos" |
| 10 | "+ Pedir a cocina": abrís, probás "Mostrar", −, +, "A cada uno", "Repartir" y "Limpiar" | Igual que antes. Cerrás con la × **sin enviar** (producir, solo con comida real) |
| 11 | "Pendientes de cocina" y "Hecho hoy" | Igual que antes; el botón dice "Pendientes de cocina (N)" |
| 12 | Entrás como cocinero | Ve el mínimo como número (sin casillero), sin "+ Pedir a cocina" ni la franja "Te faltan…" |
| 13 | (Opcional) En la consola, como cocinero: `apiFetch('/api/viandas-stock/7/minimo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_minimo: 3 }) }).then(r => r.status)` | `403` (el número de plato no importa: el permiso se mira antes) |

---

### 8.2 Parada 2: Consultar Pedidos

**SQL: no hace falta.** Reiniciar el servidor (cambió `server.js`) y recargar con Ctrl+F5.

| Archivo | Qué cambió |
|---|---|
| `frontend/src/js/ListarPedidos.js` | Reescrito: de **37 funciones a 13**. La grilla, sus filtros, el estado, el Detalle y Anular |
| `frontend/src/js/pagoPedido.js` | **Nuevo**: las ventanas "Pago del Pedido" y "Confirmar Pago", en 5 funciones (antes estaban adentro de `ListarPedidos.js`) |
| `frontend/pages/ConsultarPedidos.html` | Los `onclick` con los nombres nuevos, el botón "Pago" gris cuando está apagado y el `<script>` de `pagoPedido.js` |
| `server.js` | `PUT /pagado`, `PUT /transferencia-confirmada` y `PUT /pago`: un anulado → 409; el número de pedido se controla entero; se guarda solo si no está anulado. `GET /api/pedidos`, `GET …/verificar-stock` y `PUT …/estado`: lo mismo de antes, ordenado en pasos |

#### 8.2.1 Las funciones de antes y las de ahora

| Ahora | Archivo | Qué hace | Junta lo que hacían antes |
|---|---|---|---|
| `iniciarConsultarPedidos` | ListarPedidos.js | Al abrir: buscador, fechas, teclas (Escape cierra, Enter en el PIN anula), estados y pedidos | los 3 `DOMContentLoaded`, `fetchEstados`, `fetchPedidos`, `iniciarFiltro` y el `keydown` |
| `renderizarPedidos` | ListarPedidos.js | El título, el filtro (fechas + buscador) y la tabla de a 15 | `renderizarPedidos`, `filtrarPedidos`, `actualizarTituloListado` |
| `crearFilaPedido` | ListarPedidos.js | La fila de un pedido, con sus botones | `crearFilaPedido` |
| `aplicarFechas` | ListarPedidos.js | "Aplicar" o "Ver todos" | `aplicarFiltroFechas`, `verTodosLosPedidos` |
| `alCambiarEstado` | ListarPedidos.js | Cambió el select: si hace falta, primero los insumos y "¿ya pagó?" | la mitad de `cambiarEstadoPedido` y `verificarStockPedido` (los de la pantalla) |
| `guardarEstado` | ListarPedidos.js | Manda el estado y muestra el que quedó guardado | la otra mitad de `cambiarEstadoPedido` (pantalla) |
| `pintarEstado` | ListarPedidos.js | El color del select | `aplicarColorEstado` |
| `abrirDetalles` | ListarPedidos.js | La ventana Detalle (combos y platos) | `abrirModalDetalles` |
| `abrirAnular` | ListarPedidos.js | La ventana Anular (pide el PIN) | `abrirModalAnular`, `ocultarErrorAnular` |
| `confirmarAnulacion` | ListarPedidos.js | Manda la anulación y avisa cuántas viandas volvieron | `confirmarAnulacion`, `mostrarErrorAnular` |
| `cerrarVentana` | ListarPedidos.js | Cierra cualquiera de las 4 ventanas ("Confirmar Pago" cerrada = "No, todavía no pagó") | `cerrarModalDetalles`, `cerrarModalPago`, `cerrarModalAnular`, `cancelarConfirmarPago` |
| `mostrarCartel` | ListarPedidos.js | El aviso verde (salió bien) o amarillo (atención) | `mostrarExito`, `mostrarAlerta`, `mostrarAlertaStock` |
| `formatearPrecio` | ListarPedidos.js | `137000` → `"$ 137.000"` | `formatPrecio` y las cuentas sueltas con `Intl.NumberFormat` |
| `abrirPago` | pagoPedido.js | Abre "Pago del Pedido" con el método guardado (un anulado, no) | `abrirModalPago` |
| `mostrarOpcionesPago` | pagoPedido.js | La opción del método y, en el Mixto, cuánto falta | `actualizarSubopcionesPago`, `actualizarSumaMixto`, `metodoPagoSeleccionado` |
| `guardarPago` | pagoPedido.js | Controla y manda el pago | `guardarPago`, `armarPagoDesdeModal`, `mostrarErrorPago`, `ocultarErrorPago` |
| `abrirConfirmarPago` | pagoPedido.js | "¿Ya pagó?" antes de pasar a En Preparación | `abrirModalConfirmarPago` |
| `responderConfirmarPago` | pagoPedido.js | "Sí" (cambia el estado y registra el pago) o "No" (el select vuelve) | `aceptarConfirmarPago`, `cancelarConfirmarPago` |

Son 13 en `ListarPedidos.js` (más de 8) porque la pantalla tiene la grilla, sus filtros y 4 ventanas.

#### 8.2.2 Un pedido anulado no se cobra (pantalla y servidor)

**ANTES.** Desde H4 un anulado tenía el select apagado y "Anulado" en gris, pero **"Pago" seguía andando**, y el
servidor lo dejaba cobrar:
```js
app.put('/api/pedidos/:id/pagado', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const { id } = req.params;                 // "12abc" llegaba a la base tal cual
  const { pagado } = req.body;
  if (pagado) { /* buscaba el pedido solo para el control del Mixto */ }
  const { data, error } = await supabase.from('pedidos').update({ pagado: Boolean(pagado) }).eq('id', id).select().single();
  ...
```
**AHORA** (servidor; lo mismo en `/transferencia-confirmada` y en `/pago`):
```js
const id = Number(req.params.id);                                 // "12abc" → NaN
const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });
...                                                               // se lee el pedido
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.id_estado === ESTADO_ANULADO) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });
...
const { data, error } = await supabase.from('pedidos').update({ pagado: pagado })
  .eq('id', id)
  .neq('id_estado', ESTADO_ANULADO)                               // solo si no lo anularon justo en el medio
  .select().maybeSingle();
if (!data) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });
```
**AHORA** (pantalla): en la fila, `const pagoApagado = anulado ? 'disabled title="Un pedido anulado no se cobra"' : '';`,
y `abrirPago` tampoco abre la ventana de un anulado ("Un pedido anulado no se puede cobrar.").

| Ruta | ENTRADA | SALIDA |
|---|---|---|
| `PUT /api/pedidos/:id/pagado` | número de pedido y `{ pagado }` | `{ mensaje, pedido }` · 400 número inválido · 404 no existe · 409 anulado o Mixto sin transferencia · 500 |
| `PUT /api/pedidos/:id/transferencia-confirmada` | número de pedido | `{ mensaje, pedido }` · 400 · 404 · 409 anulado o no es Mixto · 500 |
| `PUT /api/pedidos/:id/pago` | número de pedido y `{ metodo_pago, montos… }` | `{ mensaje, pedido }` · 400 datos o montos · 404 · 409 anulado · 500 |

**Ejemplo con fideos.** El pedido #250 (10 fideos) se anuló: volvieron sus 10 viandas. Si alguien lo marcaba "pagado",
la caja decía que entró plata de un pedido que no existe más. Ahora: "Pago" gris, y si igual se llama a la ruta
(por ejemplo desde la consola) → 409 "Un pedido anulado no se puede cobrar".

| Control de seguridad | Qué protege, y de qué |
|---|---|
| Número de pedido entero > 0 | `12abc`, `-1` o `1.5` → 400 antes de tocar la base (antes `parseInt('12abc')` daba 12: se cobraba el #12) |
| 409 si está anulado | Que no se registre plata de un pedido anulado (errores o trampas en la caja) |
| `.neq('id_estado', 5)` en el `update` | Si dos personas lo tocan a la vez (una anula y la otra cobra), el cobro no pisa la anulación |
| `requireAuth` + `requireRol` | Igual que antes: sin login 401, sin el rol 403 |

#### 8.2.3 "Volvieron 10 viandas a la heladera" y el aviso del pago

| | ANTES | AHORA |
|---|---|---|
| Al anular | "✓ Pedido #250 anulado correctamente." | "✓ Pedido #250 anulado. Volvieron 10 viandas a la heladera." (1 → "Volvió 1 vianda…"; 0 → solo "anulado") |
| Si el estado cambió pero falló el registro del pago | "El pedido pasó a En Preparación, pero no se pudo marcar como pagado. HTTP 500" | "El pedido pasó a **Listo para Entregar**, pero no se pudo marcar como pagado." (el estado que quedó de verdad, y sin el detalle interno) |

El número de viandas lo manda el servidor (`viandas_devueltas`, de la base): la pantalla no lo calcula.

#### 8.2.4 Qué probar en la web (parada 2)

| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís Consultar Pedidos | Igual que antes: el título "Producción de hoy…", los filtros, la tabla de a 15 |
| 2 | Un pedido de prueba en Transferencia, de 1 a 2 | "¿Ya pagó?". "No" → el select vuelve. "Sí" → queda en 2 (o salta a 3 si es todo de heladera) y PAGADO |
| 3 | Anulás un pedido de prueba con 10 viandas de heladera | "Pedido #N anulado. Volvieron 10 viandas a la heladera." y en Producción vuelven las 10 |
| 4 | En el anulado | Select apagado, "Pago" gris (no abre) y "Anulado" gris |
| 5 | Escape con una ventana abierta | Se cierra (si es "Confirmar Pago", cuenta como "No") |

---

### 8.3 Parada 3A: Tareas de Cocina y la web nueva

**SQL: no hace falta.**

| Archivo | Qué cambió |
|---|---|
| `frontend/src/js/pedidosCocina.js` | Reescrito: de **11 funciones a 3** (`conPlural`, `cargarPendientes`, `marcarHecho`). Lo usan Producción y Tareas de Cocina |
| `frontend/src/js/combosCatalogo.js` | `cargarCombos(mantenerCategoria)`: al recargar se queda en la categoría elegida si todavía tiene combos |
| `frontend/src/js/pedidoCombos.js` | Si el servidor dice "No quedan suficientes viandas…", vuelve a pedir los combos |

#### 8.3.1 "Hecho": el motivo de verdad

**ANTES** (`marcarDetalleHecho`): con un 409 decía siempre "Ya estaba marcado", aunque el motivo fuera otro
(por ejemplo "El pedido a cocina no existe").
**AHORA** (`marcarHecho`): el resultado sale de una tabla, con el mensaje de la base:
```js
const RESULTADOS = {
  ok:        { tipo: frases.length > 0 ? 'aviso' : 'ok', mensaje: '✓ ' + texto + ': hecho.', detalles: frases },
  rechazado: { tipo: 'info',  mensaje: datos.error || 'Ya estaba marcado.', detalles: [] },   // el motivo de verdad
  error:     { tipo: 'error', mensaje: datos.error || 'No se pudo marcar el plato como hecho.', detalles: [] }
};
let clave = 'error';
if (respuesta.status === 409) clave = 'rechazado';
if (respuesta.ok) clave = 'ok';
resultado = RESULTADOS[clave];
```
Los clics en "Hecho" se escuchan **una sola vez sobre toda la lista** (`lista.addEventListener('click', …)` y
`evento.target.closest('.btn-hecho')`): así sirven también para los platos que aparecen al recargar.

| | ENTRADA | SALIDA |
|---|---|---|
| `cargarPendientes(idContenedor, opciones)` | dónde se dibuja y, la primera vez, `{ conBotonHecho, recargar }` | la lista de pendientes (o null si falló); en pantalla, una tarjeta por cocinero |
| `marcarHecho(idContenedor, evento)` | la lista y el clic | nada: pregunta, marca (POST …/hecho), muestra el resultado arriba de la lista y recarga |

**Ejemplo con fideos.** "¿Marcar 2 fideos como hecho?" → Sí → verde "✓ 2 fideos: hecho." · con un insumo corto,
amarillo "Faltaron 39 u de Huevo" · si otra persona ya lo había marcado, gris con el mensaje de la base.

#### 8.3.2 La web nueva vuelve a pedir los combos cuando no alcanzan las viandas

**ANTES.** Si otro cliente se llevaba las últimas viandas mientras armabas el combo, salía "No quedan suficientes
viandas de «fideos»: pediste 16 y quedan 12" pero el menú seguía mostrando lo de antes.
**AHORA** (`confirmarPedido` en `pedidoCombos.js`):
```js
// startsWith = "empieza con". Ej: 'No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12' → sí
const faltanViandas = !resultado.ok && resultado.error.startsWith('No quedan suficientes viandas');
if (faltanViandas) cargarCombos(true);    // combosCatalogo.js: recarga, en la misma categoría
```
y en `combosCatalogo.js`:
```js
const sigueLaElegida = mantenerCategoria && combosDisponibles.some(combo => combo.categoria.id === categoriaElegida);
categoriaElegida = sigueLaElegida ? categoriaElegida : combosDisponibles[0].categoria.id;   // si no, la del primer combo
```
El mensaje lo arma la base (`crear_pedido_combos`): la web no decide nada, solo recarga para mostrar lo que queda.

---

### 8.4 Parada 3B: los insumos de un pedido, en una función de la base (arreglo C1)

**SQL: sí.** `sql/insumos_pedido.sql`, bloques 1 y 2 (ver la lista al final, en HELADERA-AVANCE).

| Archivo | Qué cambió |
|---|---|
| `sql/insumos_pedido.sql` | **Nuevo.** Bloque 1: columna `movimientos_stock.id_pedido` (solo se agrega). Bloque 2: función `descontar_insumos_pedido` |
| `sql/insumos_pedido_probar.sql` | **Nuevo.** A: 3 casos que fallan · B: caso de mentira (descuenta, "ya descontado", convive con Render) · C: comprobar |
| `server.js` | `descontarStockPedido(pedidoId, idUsuario)` llama a la función de la base. `cambiarEstadoPedido` le pasa quién cambia el estado (del token). `calcularConsumoPedido` ya no está: su cuenta quedó en `verificarStockPedido` (solo lee) y en la base (descuenta) |

**ANTES** (`descontarStockPedido`, en el servidor, en pasos sueltos):
```js
const motivoBase = `pedido #${String(pedidoId).padStart(3, '0')}`;
// "¿Ya se descontó?": busca el texto ADENTRO del motivo
const { data: movPrevio } = await supabase.from('movimientos_stock').select('id').ilike('motivo', `%${motivoBase}%`).limit(1);
if (movPrevio && movPrevio.length > 0) return null;
...
for (const [keyId, totalRaw] of Object.entries(consumo)) {
  await supabase.from('insumos').update({ stock_actual: nuevoStock }).eq('id', idNum);   // uno por uno
  movimientosAInsertar.push({ id_insumo: idNum, tipo: 'salida', cantidad: cantidadRequerida, motivo: `Consumo por producción ${motivoBase}`, fecha: fechaHora });
}
await supabase.from('movimientos_stock').insert(movimientosAInsertar);
```
Tres problemas: (1) buscar "pedido #500" **adentro** del motivo también encuentra "pedido #5000", y un movimiento a mano
con "pedido #012" hacía que el #12 no descuente nunca; (2) si fallaba en el medio, quedaba **a medias** (unos insumos
descontados y otros no); (3) no guardaba **quién** fue.

**AHORA** (servidor):
```js
const { data, error } = await supabase.rpc('descontar_insumos_pedido', {
  p_id_pedido:  pedidoId,
  p_id_usuario: idUsuario                                         // del token, nunca del body
});
if (error) { console.error(...); return { status: 500, error: MENSAJE_ERROR_INTERNO }; }
if (!data || !data.ok) return { status: 409, error: data?.error || 'No se pudieron descontar los insumos del pedido' };
return null;
```
**AHORA** (base, `descontar_insumos_pedido`, en 8 pasos):
```sql
-- PASO 3: el motivo de siempre, con 3 cifras como mínimo (igual que padStart de JavaScript)
v_motivo := 'Consumo por producción pedido #' || case when p_id_pedido < 100 then lpad(p_id_pedido::text, 3, '0') else p_id_pedido::text end;
-- PASO 4: ¿ya se descontó? Por id_pedido (los nuevos) o por el motivo EXACTO (los viejos y los de Render)
if exists (select 1 from movimientos_stock where id_pedido = p_id_pedido or motivo = v_motivo) then
  return jsonb_build_object('ok', true, 'ya_descontado', true, 'insumos', 0);
end if;
-- PASO 5: candado a los insumos que se van a tocar, en orden de número (for update)
-- PASO 6: el primero que no alcanza → { ok: false, error: 'Stock insuficiente de "Huevo": se necesitan 4, hay 2 disponibles' }
-- PASO 7: resta cada insumo y anota su renglón "salida" con id_pedido e id_usuario
```
Antes de todo eso: sin usuario → error; candado al pedido; si no existe → "El pedido no existe"; si está anulado →
"Un pedido anulado no descuenta insumos".

| | ENTRADA | SALIDA |
|---|---|---|
| `descontar_insumos_pedido(p_id_pedido, p_id_usuario)` | el pedido que pasa a 3 o 4 y quién lo pasa | `{ ok: true, ya_descontado: false, insumos: 2 }` · `{ ok: true, ya_descontado: true, insumos: 0 }` · `{ ok: false, error }` (sin guardar nada) |
| `descontarStockPedido(pedidoId, idUsuario)` | ídem | null si salió bien (o ya estaba) · `{ status: 409, error }` · `{ status: 500, error }` |

**Ejemplo con fideos.** Pedido #250 con 8 fideos de heladera + 2 "sin sal" (receta: 300 g de harina integral y 2 huevos).
Pasa a 3 → la cocina cocinó 2 → harina −600 g, huevo −4 u, 2 renglones "salida" con `id_pedido = 250` y el motivo
"Consumo por producción pedido #250". Pasa a 4 → `ya_descontado: true`: no descuenta otra vez. Con solo 2 huevos →
"Stock insuficiente de "Huevo": se necesitan 4, hay 2 disponibles" y **no se toca nada** (ni la harina).

**Convive con Render** (rama Rodriguez, hasta el merge): el servidor viejo sigue descontando con su código y busca
el motivo. Por eso la función escribe **el mismo motivo**, y para "ya descontado" mira `id_pedido` **o** ese texto exacto.

| Control de seguridad | Qué protege, y de qué |
|---|---|
| Todo o nada (una función de la base) | Que un pedido quede con la mitad de los insumos descontados si algo falla en el medio |
| `for update` al pedido y a los insumos (en orden) | Dos personas pasando el mismo pedido a 3 a la vez: la segunda espera y ve "ya descontado" (no se descuenta dos veces) |
| `id_pedido` + motivo **exacto** | El #5 no se confunde con el #50 ni con el #5000, ni con un motivo escrito a mano |
| Usuario del token (`req.usuario.id`) | Queda anotado quién fue, y nadie puede firmar con otro usuario mandándolo en el body |
| `revoke … from public, anon, authenticated` + `grant … to service_role` | Solo el servidor la puede ejecutar: nadie desde el navegador con la clave pública |
| `set search_path = public` | Nadie puede meter una tabla falsa con el mismo nombre en otra carpeta |
| Un anulado no descuenta | Que se gasten insumos de un pedido que no se va a entregar |

| Se conecta con | |
|---|---|
| La llama | `cambiarEstadoPedido` (al pasar a 3 o 4): `PUT /api/pedidos/:id/estado` y el ✓ Listo del cocinero |
| Tablas | `pedidos` (candado y estado), `pedido_detalles`, `producto_insumo` (receta), `insumos` (resta), `movimientos_stock` (renglones con `id_pedido`) |
| La lee | `GET /api/movimientos` (8.5): agrupa "Cocina de un pedido" por `id_pedido` (o por el motivo exacto) |

---

### 8.5 Parada 3C: Movimientos de Stock con todo junto

**SQL:** el bloque 1 de `sql/insumos_pedido.sql` (la ruta nueva lee `movimientos_stock.id_pedido`).

| Archivo | Qué cambió |
|---|---|
| `server.js` | **Nueva:** `GET /api/movimientos?desde=&hasta=`, con `nombreDeUsuario`, `traerTodasLasFilas` y `armarMovimientos`. Solo lee |
| `frontend/src/js/movimientosStockNuevo.js` | La parte de la tabla, reescrita (5 funciones). **El modal "Registrar compra" no se tocó** |
| `frontend/pages/MovimientosStockNuevo.html` | Filtros "Todo / Insumos / Viandas" y "Entradas / Salidas", buscador "insumo o plato", 9 columnas |
| `frontend/src/css/movimientosStockNuevo.css` | Motivo pasó a la columna 8; títulos y datos del Detalle |
| `frontend/src/js/roles.js` | Menú: la nueva se llama "📋 Movimientos de Stock" y la vieja "Movimientos (viejo)" (queda hasta que ande "− Registrar salida") |

**ANTES.** La pantalla nueva mostraba solo los **insumos** (`GET /api/movimientos-stock`, como mucho 1000 renglones):
las compras agrupadas ("Compra #2" con Detalles) y cada salida suelta. Las viandas no aparecían.

**AHORA.** Una fila por cada cosa que pasó, insumos y viandas juntos, del más nuevo al más viejo:

| Origen | Tipo | Referencia | Motivo | El Detalle muestra |
|---|---|---|---|---|
| Compra | ▲ | Compra #N | el escrito | insumos, cantidad y vencimiento |
| Producción | ▲ | Pedido a cocina #N (las de antes: "Tanda vieja") | "Producción de viandas" | quién lo pidió, quién marcó Hecho, las viandas que entraron y los insumos que se usaron |
| Venta | ▼ | Pedido #N | "Pedido #N" | el cliente y los platos que salieron |
| Devolución | ▲ | Pedido #N anulado | "Anulación del pedido #N" | los platos que volvieron |
| Descarte | ▼ | — | el escrito | el motivo y los platos |
| Cocina de un pedido | ▼ | Pedido #N | "Consumo por producción pedido #N" | los insumos que gastaron los personalizados |
| Ajuste | ▲ / ▼ | — | el escrito | el motivo y qué |

Columnas: Fecha y hora · Origen · Referencia · Tipo · Resumen ("6 insumos", "2 viandas · 2 insumos") · Usuario ·
Proveedor (solo compras; si no, "—") · Motivo · Detalle (Ver / Ocultar).

**Cómo se juntan** (`armarMovimientos`, sin `forEach` adentro de otro): un objeto `{ clave: movimiento }` y cada renglón
se suma al suyo. Compra → `id_compra` · Producción → el renglón de viandas (sus insumos lo traen en `id_movimiento_vianda`) ·
Venta y devolución → el pedido (con la misma hora) · Cocina → `id_pedido`, o el motivo exacto · Descarte y ajuste → uno por renglón.
```js
const motivoDePedido = /^Consumo por producción pedido #(\d+)$/.exec(fila.motivo || '');
const pedidoDelMotivo = motivoDePedido ? Number(motivoDePedido[1]) : null;   // '005' → 5
const idPedido = fila.id_pedido || pedidoDelMotivo;                          // primero id_pedido; si no, el del motivo
let datos = null;                                                            // el primero que corresponde, en este orden:
if (fila.id_compra) datos = { clave: 'compra-' + fila.id_compra, origen: 'compra', tipo: 'entrada', numero: fila.id_compra };
if (!datos && fila.id_movimiento_vianda) datos = { clave: 'produccion-' + fila.id_movimiento_vianda, origen: 'produccion', … };
if (!datos && idPedido) datos = { clave: 'cocina-' + idPedido + '-' + fila.fecha, origen: 'cocina', tipo: 'salida', numero: idPedido };
if (!datos) datos = { clave: 'ajuste-insumo-' + fila.id, origen: 'ajuste', … };                      // lo cargado a mano
```
**Trae TODO entre las fechas** (`traerTodasLasFilas`): de a 1000 renglones (lo máximo que manda Supabase), con un
`while`, hasta que vengan menos de 1000. Si pasa de 20.000 → 400 "Hay demasiados movimientos en esas fechas: elegí menos días".

**Los filtros (decisión 4): un movimiento se ve si ALGUNA de sus partes coincide.** Cada movimiento tiene sus partes:
viandas y/o insumos, cada una con su lado. En una producción, las viandas **entran** y los insumos **salen**:
```js
const tipoInsumos = mov.origen === 'produccion' ? 'salida' : mov.tipo;
if (mov.viandas.length > 0) mov.partes.push({ que: 'viandas', tipo: mov.tipo, nombres: platos });
if (mov.insumos.length > 0) mov.partes.push({ que: 'insumos', tipo: tipoInsumos, nombres: insumos });
...
const visibles = listaMovimientos.filter(mov => mov.partes.some(parte => {
  const coincideQue = que === 'todo' || parte.que === que;
  const coincideTipo = tipo === '' || parte.tipo === tipo;
  const coincideTexto = texto === '' || parte.nombres.includes(texto);
  return coincideQue && coincideTipo && coincideTexto;
}));
```
Así el "Hecho" de 2 fideos aparece con "Viandas + Entradas" y con "Insumos + Salidas", pero no con "Insumos + Entradas".
Las fechas arrancan en **los últimos 30 días**; al cambiarlas se piden de nuevo al servidor.

| | ENTRADA | SALIDA |
|---|---|---|
| `GET /api/movimientos` | `?desde=` y `?hasta=` (opcionales, días de Argentina, los dos incluidos) | `[{ clave, origen, tipo, fecha, numero, usuario, proveedor, motivo, cliente, pidio, insumos, viandas }]` · 400 fecha inválida, "desde" mayor que "hasta" o demasiados · 500 |
| `traerMovimientos()` | (lee las fechas de arriba) | la lista con sus partes, o `[]` y el problema en `errorMovimientos` |
| `filtrarMovimientos()` | (lee los filtros) | nada: dibuja los que pasan |
| `renderizarMovimientos(movimientos)` | los que pasaron | nada: la tabla de a 15 (o "No hay movimientos", o el problema en rojo) |
| `crearRenglon(mov)` | un movimiento | el renglón y su Detalle, juntos (DocumentFragment) |
| `htmlDetalle(mov)` | un movimiento | el HTML de adentro del Detalle, según el origen |

**Ejemplo con fideos** (15/10): "15/10/2026 14:32 · Producción · Pedido a cocina #9 · ▲ Entrada · 2 viandas · 2 insumos ·
Ana López · — · Producción de viandas · [Ver]" → Detalle: "Lo pidió: Mauri Rodriguez · Marcó Hecho: Ana López ·
Viandas que entraron a la heladera: fideos 2 · Insumos que se usaron: Harina integral 600 g, Huevo 4 u".
Y la venta del #250: "Venta · Pedido #250 · ▼ Salida · 10 viandas · … · Pedido #250" → "Cliente: PRUEBA – NO PREPARAR · fideos 10".

| Control de seguridad | Qué protege, y de qué |
|---|---|
| `requireAuth` + `requireRol(6, 5, 1)` | Sin login 401; el cocinero 403 (como la pantalla vieja) |
| Fechas `AAAA-MM-DD` que existan (`leerFechaPara`) | `2026-02-30` o texto raro → 400; nunca se pega texto en la consulta (`.gte` / `.lt` son parámetros) |
| Tope de 20.000 renglones | Nadie puede hacer que el servidor traiga la base entera de una vez (sobrecarga) |
| Solo lee | La ruta no cambia nada en la base |
| `escHtml` en todo lo que va al HTML | Un proveedor o un cliente con `<script>` se ve como texto (XSS) |

---

## 9. H9 (Parte 2): el estilo nuevo, sin cambiar lo que hace nada

### 9.1 La regla (CLAUDE.md, sección "Estilo", desde el 16/10)

- NUNCA un `if` adentro de otro. Máximo un nivel.
- Valores por defecto con `||`: `const direccion = pedido.cliente_direccion || '-';` (nada de `let` + `if`).
- `switch` ("según sea") cuando se compara una misma variable contra varios valores, cada `case` con su comentario y su `break`.
- Tablas (objetos) en vez de `if / else if` para elegir un texto, un color o un valor: `MENSAJE_VACIO[modo]`, `COLORES_ESTADO[estado]`.
- Salir temprano: los "no" arriba con `return` y lo importante abajo, sin `else`.
- Ternario simple, de un nivel, solo FUERA del HTML. Nunca uno adentro de otro ni adentro de un template.
- Si una condición mezcla varias cosas, primero se guarda en una variable con nombre (`const faltaEfectivo = a && !b;`).
- Nombres en español, comentario en cada línea, ENTRADA / SALIDA y un ejemplo arriba de cada función.

En la parte "Cómo recorrer listas…" del CLAUDE.md, el renglón viejo ("calculalo antes con if/else") quedó así:
"Nada de `? :` adentro de los template strings. Calculá eso antes en una variable (ver "Estilo" arriba).
Ej: `const claseElegido = cantidad > 0 ? ' plato--elegido' : '';`".

### 9.2 Cómo se comprobó que hace lo mismo

Cada archivo se corrió **viejo y nuevo con los mismos datos de mentira** (una página o una base inventada, en la
computadora: nada contra la base real) y se compararon **todos** los resultados: lo que se dibuja, lo que se manda al
servidor, los avisos y los datos que quedan.

| Qué | Cómo | Casos | Resultado |
|---|---|---|---|
| `ListarPedidos.js` + `pagoPedido.js` | La pantalla entera: buscar, fechas, cambiar estados, "¿ya pagó?", pagos, anular, Escape… | 20.000 | iguales |
| `pedidosCocina.js` | Dibujar pendientes, "Hecho" (verde, amarillo, gris, rojo), recargar, cerrar el aviso | 8.000 | iguales |
| `pedidoCombos.js` | Abrir, validar, confirmar (1.004 llegaron al servidor), WhatsApp, fecha, cerrar | 8.000 | iguales |
| `heladera.js` + `pedirCocina.js` | Filtros, páginas, mínimo (110 guardados), descarte (28), pedir a cocina (772), recargas | 6.000 | iguales |
| `verificarStockPedido` (servidor) | La cuenta de insumos | 3.000 | iguales |
| `POST /api/pedidos-combos` (VENDER) | Todos los controles hasta la base | 6.000 | iguales |
| Rutas de Consultar Pedidos + `cambiarEstadoPedido` | Base de mentira | 20.000 + 5.000 | iguales |
| Ruta anular | Base de mentira | 5.000 | iguales |
| Rutas de Producción (8 rutas) | Base de mentira | 20.000 | iguales (salvo el cambio a propósito del descarte, ver 9.6) |
| `armarMovimientos` + `GET /api/movimientos` | Versión 1 contra versión 2 | 20.000 + 64 | iguales |
| Funciones de la base | Comparación de texto: en descartar y producir solo cambiaron comentarios; anular y vender, revisadas a mano y con sus pruebas de mentira | — | ver 9.5 |

Además: cada `.js` pasó `node --check` (sintaxis) y un buscador de "if adentro de if" y de `else`.

### 9.3 Las pantallas: antes y ahora (ejemplos)

**Valores por defecto** (`crearFilaPedido`)
```js
// ANTES
let cliente = 'Anónimo';
if (pedido.cliente_nombre) {
  cliente = pedido.cliente_nombre;
} else if (pedido.usuarios && pedido.usuarios.nombre) {
  cliente = pedido.usuarios.nombre;
}
// AHORA
const cliente = pedido.cliente_nombre || pedido.usuarios?.nombre || 'Anónimo';
```
**`switch` según el método de pago** (`crearFilaPedido`)
```js
// ANTES
if (metodo === 'Mixto' && pedido.transferencia_confirmada && !pedido.pagado) { detallePago = '…Efectivo pendiente…'; }
else if (metodo === 'Mixto') { detallePago = '💵 … 🏦 …'; }
else if (metodo === 'Efectivo' && pedido.pago_anticipado) { detallePago = '…Pago anticipado…'; }
// AHORA
switch (metodo) {
  case 'Mixto': {                                                // según sea Mixto
    const faltaEfectivo = pedido.transferencia_confirmada && !pedido.pagado;
    detallePago = faltaEfectivo ? '…Efectivo pendiente…' : '💵 … 🏦 …';
    break;
  }
  case 'Efectivo':                                               // según sea Efectivo
    detallePago = pedido.pago_anticipado ? '…Pago anticipado…' : '';
    break;
}
```
**Tabla en vez de `if / else if`** (`abrirPago`, en `pagoPedido.js`)
```js
// ANTES
let opcion = 'Efectivo'; let tipoTarjeta = null;
if (guardado.startsWith('Tarjeta')) { opcion = 'Tarjeta'; tipoTarjeta = guardado.replace('Tarjeta ', ''); }
else if (['Efectivo', 'Transferencia', 'Mixto'].includes(guardado)) { opcion = guardado; }
// AHORA (OPCION_DE_METODO y TIPO_DE_TARJETA son dos tablas arriba del archivo)
const opcion = OPCION_DE_METODO[guardado] || 'Efectivo';         // 'Tarjeta Crédito' → 'Tarjeta'
const tipoTarjeta = TIPO_DE_TARJETA[guardado] || null;           // 'Tarjeta Crédito' → 'Crédito'
```
**El primer control que falla, sin `else if`** (`validarFormulario` en `pedidoCombos.js` y `confirmarDescarte` en `heladera.js`)
```js
// ANTES
if (fecha === '') { errores['err-fecha'] = 'Elegí la fecha de entrega.'; }
else if (!esDiaHabil(parseFechaLocal(fecha))) { errores['err-fecha'] = 'Ese día no entregamos…'; }
else if (fecha < inputFecha.min) { errores['err-fecha'] = 'La primera fecha posible es el …'; }
// AHORA: cada campo con su lista de controles { estaMal, mensaje }; vale el PRIMERO que está mal
'err-fecha': [
  { estaMal: fecha === '', mensaje: 'Elegí la fecha de entrega.' },
  { estaMal: !esDiaHabil(parseFechaLocal(fecha)), mensaje: 'Ese día no entregamos (feriado o fin de semana). Elegí otro.' },
  { estaMal: fecha < inputFecha.min, mensaje: 'La primera fecha posible es el ' + primeraFecha + '.' }
],
...
const controlQueFalla = controles[idError].find(control => control.estaMal);   // find = el primero que está mal
```
**Una función adentro de otra, afuera** (`heladera.js` y `pedirCocina.js`)

| ANTES | AHORA | Por qué |
|---|---|---|
| `crearPaginacion({ …, funcionRenderFila: plato => { …60 líneas… } })` | `funcionRenderFila: crearFilaPlato` y la función aparte | Afuera puede "salir temprano": `if (!puedeAdministrar) return fila;` (antes era un `if` grande con otro `if` adentro) |
| `const alCambiar = () => { … };` adentro de `renderizarListaPedido` | `alCambiarCantidad(idProducto, input, fila)` aparte | Lo usan el casillero y los botones − / + |
| Dos bloques iguales `let fecha = '-'; if (movimiento.fecha) { …5 líneas… }` | `fechaYHoraCortas(texto)` → `{ dia: '15/10', hora: '18:40' }` o null | Se usaba en "Últimos movimientos" y en "Hecho hoy" |

**`switch` con `return`** (`platosDelFiltro` en `pedirCocina.js`)
```js
switch (filtro) {
  case 'faltan': return estado === 'sin' || estado === 'bajo';   // según sea "Los que faltan"
  case 'sin':    return estado === 'sin';                        // según sea "Sin stock"
  case 'bajo':   return estado === 'bajo';                       // según sea "Bajos"
  case '':       return true;                                    // según sea "Todos los planes"
  default:       return plato.id_plan === Number(filtro);        // si no, es un plan
}
```

| Archivo | Funciones | Nuevas en H9 |
|---|---|---|
| `ListarPedidos.js` | 13 | — |
| `pagoPedido.js` | 5 | tablas `OPCION_DE_METODO` y `TIPO_DE_TARJETA` |
| `pedidosCocina.js` | 3 | tabla `RESULTADOS` adentro de `marcarHecho` |
| `pedidoCombos.js` | 8 | — (los controles del formulario pasaron a una lista `{ estaMal, mensaje }`) |
| `heladera.js` | 14 | `crearFilaPlato`, `fechaYHoraCortas` |
| `pedirCocina.js` | 8 | `alCambiarCantidad` |
| `combosCatalogo.js` | 3 | — (solo lo de 3A: `some` en vez de un `if` adentro de otro) |
| `movimientosStockNuevo.js` | 11 del modal + 5 de la tabla | la tabla entera es nueva (8.5) |

### 9.4 Las rutas de `server.js`: antes y ahora (ejemplos)

**"Solo se consulta si hace falta"** (`cambiarEstadoPedido`)
```js
// ANTES (un if adentro de otro)
if (nuevoEstado === 2) {
  const errorStock = await verificarStockPedido(pedidoId);
  if (errorStock) return errorStock;
}
if (nuevoEstado === 3 || nuevoEstado === 4) {
  const errorStock = await descontarStockPedido(pedidoId, idUsuario);
  if (errorStock) return errorStock;
}
// AHORA
const errorInsumos = nuevoEstado === 2 ? await verificarStockPedido(pedidoId) : null;
if (errorInsumos) return errorInsumos;
const pasaA3o4 = nuevoEstado === 3 || nuevoEstado === 4;
const errorDescuento = pasaA3o4 ? await descontarStockPedido(pedidoId, idUsuario) : null;
if (errorDescuento) return errorDescuento;
```
**El mensaje de la anulación** (ruta anular)
```js
// ANTES (let + if)
let mensaje = 'Pedido anulado correctamente';
if (data.viandas_devueltas === 1) mensaje = 'Pedido anulado. Volvió 1 vianda a la heladera.';
if (data.viandas_devueltas > 1) mensaje = `Pedido anulado. Volvieron ${data.viandas_devueltas} viandas a la heladera.`;
// AHORA
const conViandas = devueltas === 1 ? 'Pedido anulado. Volvió 1 vianda a la heladera.' : `Pedido anulado. Volvieron ${devueltas} viandas a la heladera.`;
const mensaje = devueltas >= 1 ? conViandas : 'Pedido anulado correctamente';
```
**VENDER** (`POST /api/pedidos-combos`): los controles quedaron uno debajo del otro, cada uno con su nombre
(`cantidadInvalida`, `hayComboMalArmado`, `faltaNombre`…), con `forEach` y `concat` en vez de `for`; el usuario
`leerToken(req)?.id || ID_CONSUMIDOR_FINAL`; y `?? null` para lo opcional. Mismas entradas, mismos mensajes (6.000 casos iguales).

Siguen con el estilo de antes, porque no son de este paso (no se tocaron): el login, el catálogo viejo, `/api/cocina/tareas`,
productos, insumos, recetas, compras, reportes, planes, combos (el armado) y usuarios.

### 9.5 Las funciones de la base

| Función | Archivo | Qué cambió |
|---|---|---|
| `descartar_viandas` | `sql/heladera.sql`, bloque 1 | Arriba: QUÉ HACE / ENTRADA / SALIDA / EJEMPLO. Los pasos se llaman "PASO 1…". Solo comentarios |
| `producir_viandas` | bloque 2 | Ídem. Solo comentarios |
| `anular_pedido_con_devolucion` | bloque 3 | Ídem, y la devolución en pasos: PASO 3 arma la lista de lo que vuelve (`jsonb_agg` del `group by … having`), PASO 4 pone los candados, PASO 5 devuelve. Mismo resultado |
| `crear_pedido_combos` | `sql/pedido_combos_funciones.sql` | Ídem, y el control del texto personalizado (PASO 9) y la cuenta de heladera (PASO 15) sin `if` adentro de otro. Mismos mensajes |
| `descontar_insumos_pedido` | `sql/insumos_pedido.sql`, bloque 2 | Nueva (8.4), ya escrita así |

Ejemplo (PASO 9 de `crear_pedido_combos`):
```sql
-- ANTES: dos if adentro de otro, y un elsif
v_texto := null;
v_tipo := coalesce(jsonb_typeof(v_plato_json->'personalizado'), 'null');
if v_tipo = 'string' then
  v_texto := btrim(v_plato_json->>'personalizado', E' \t\r\n');
  if v_texto = '' then return …'no puede estar vacío'; end if;
  if char_length(v_texto) > 150 then return …'admite hasta 150 caracteres'; end if;
elsif v_tipo <> 'null' then
  return …'Hay un plato con datos inválidos en «…»';
end if;
-- AHORA: uno debajo del otro (el orden de las preguntas no cambia el resultado: un texto nunca es "otra cosa")
v_tipo := coalesce(jsonb_typeof(v_plato_json->'personalizado'), 'null');      -- 'string', 'null' u otro
if v_tipo not in ('string', 'null') then return …'Hay un plato con datos inválidos en «…»'; end if;
v_texto := case when v_tipo = 'string' then btrim(v_plato_json->>'personalizado', E' \t\r\n') else null end;
if v_texto = '' then return …'no puede estar vacío'; end if;
if char_length(v_texto) > 150 then return …'admite hasta 150 caracteres'; end if;
```

### 9.6 Lo único que cambia a propósito

| Dónde | ANTES | AHORA | Por qué |
|---|---|---|---|
| `POST /api/viandas-stock/descarte` con `id_producto` −3 o 0 | llegaba a la base → 409 "El plato no existe" | 400 "ID de plato inválido" sin ir a la base | La regla de validar cada dato (enteros mayores a 0) |
| Rutas de pago (parada 2) | ver 8.2.2 | 400 / 404 / 409 | ídem, y "un anulado no se cobra" |

Todo lo demás de H9 responde exactamente lo mismo que antes.

### 9.7 Lo que quedó con el estilo de antes, a propósito

| Qué | Por qué |
|---|---|
| El modal "Registrar compra" de `movimientosStockNuevo.js` (2 `else`: en `mostrarCantidad` y en `renderizarInsumosModal`) | Decisión 1 del 16/10: el modal no se toca |
| El test viejo de `tests/test_e2e.js` (un `if / else` en `main`) | No es de este paso; la sección HELADERA nueva sí sigue el estilo |
| `roles.js` | Solo cambiaron los dos renglones del menú |

---

## 10. Las pruebas

| Archivo | Pruebas | Qué prueban |
|---|---|---|
| `sql/heladera_probar.sql` | 1A, 1B, 1C | DESCARTAR (H2) ✅ |
| | 2A, 2B, 2C | PRODUCIR (H3) ✅ |
| | 3A, 3B, 3C | DEVOLVER (H4); H4 se probó desde la web ✅ |
| `sql/pedido_combos_probar.sql` | 6A, 6B, 6C | VENDER (H6): no alcanza; vende 18, los "sin sal" no salen, 100 "sin sal" se pueden pedir, y anular devuelve 18. H5 y H6 se probaron desde la web ✅ |
| `sql/heladera_probar.sql` | 4A | Las marcas de H7 (solo lee) |
| `sql/heladera_revisar.sql` | todo (solo lee) | Las funciones instaladas con su comentario y si la heladera cuadra con el cuaderno (H0 y H7) |
| `sql/insumos_pedido_probar.sql` | A, B, C | `descontar_insumos_pedido` (H8, 3B): A = 3 casos que fallan (sin usuario, no existe, anulado); B = de mentira: descuenta 600 g de harina y 4 huevos, la segunda vez "ya descontado", un renglón viejo con el motivo exacto también cuenta como descontado, y un anulado no descuenta; C = que B no dejó nada |
| `sql/heladera_probar.sql` 3A–3C y `sql/pedido_combos_probar.sql` 6A–6C | (otra vez, después de H9) | Que `anular_pedido_con_devolucion` y `crear_pedido_combos`, ordenadas en H9, siguen dando lo mismo |
| `tests/test_e2e.js heladera` | sección HELADERA (por las rutas, contra la base real) | Vender (la heladera baja, las reservadas suben), no alcanza (mensaje y no crea nada), todo de heladera salta a 3, con personalizado queda en 2, filtros de "Últimos movimientos", Movimientos de Stock todo junto, el mínimo (400 con datos malos, 403 al cocinero), anular devuelve, un anulado no cambia ni se cobra (409), y `descontar_insumos_pedido` en sus casos que no descuentan. Al final anula sus pedidos y comprueba la heladera. **16/10: 40/40** ✅ (berenjenas rellenas 21 → 11 → 3 → 21; pedidos #11 y #12 anulados) |
| (en la computadora, sin la base) | comparaciones de H9 | Lo viejo contra lo nuevo con datos de mentira: ver 9.2 |
| (en la web) | Paradas 1, 2 y 3 de H8 | Las listas de 8.1.7 y 8.2.4, y la de HELADERA-AVANCE |

Los casos "de mentira" (1B, 2B, 3B, 6A, 6B y la B de insumos) terminan con un error a propósito: Postgres deshace todo y
no queda nada guardado. Lo único que no vuelve son los números de id (se saltean).

**Por qué "ya descontado" (con insumos de verdad) se prueba en SQL y no en el test.** Para que un pedido descuente insumos
tiene que tener personalizados y pasar a 3 o 4, y la regla del test es no hacer eso nunca contra la base real (gastaría
harina y huevos de verdad). La parte B de `sql/insumos_pedido_probar.sql` lo hace adentro de un bloque que se deshace
solo. El test sí prueba el camino de la ruta con un pedido sin personalizados (pasa a 3, la función corre y no descuenta nada).

---

## 11. Funciones viejas que quedan "NO USAR"

No se borra nada (regla del CLAUDE.md). En H7 quedaron marcadas "NO USAR" en el `.sql` y en la base (`comment on function`
/ `comment on column`, ver la sección 7). **Ojo:** el servidor de Render (rama Rodriguez) todavía usa dos de ellas hasta el merge: no se tocan.

| Función o columna | Archivo | La reemplaza | ¿Alguien la usa hoy? |
|---|---|---|---|
| `marcar_detalle_hecho` | `sql/Produccion.sql` | `producir_viandas` (H3) | **Sí: Render** (el "Hecho" del servidor viejo), hasta el merge |
| `aplicar_produccion_viandas` | `sql/stock_viandas_funciones.sql` | `producir_viandas` (H3) | Sí, por dentro: la llama `marcar_detalle_hecho` (Render) y `registrar_tanda_viandas` |
| `registrar_descarte_vianda` | `sql/stock_viandas_funciones.sql` | `descartar_viandas` (H2) | **Sí: Render** (el "Descartar" del servidor viejo), hasta el merge |
| `registrar_tanda_viandas` | `sql/stock_viandas_funciones.sql` | (nada: la ruta `/tanda` ya no existe) | No |
| `registrar_tanda_multiple` | `sql/stock_viandas_funciones.sql` | (nada) | No |
| `movimientos_viandas.id_lote` y la secuencia `movimientos_viandas_lote_seq` | `sql/stock_viandas_lotes.sql` | (nada) | No (solo la usaba `registrar_tanda_multiple`) |
| `orden_produccion_detalles.id_pedido_detalle` | (está en la base) | (nada) | No (H0: 0 renglones la usan) |

Las que **siguen en uso** y no se reemplazaron: `crear_orden_produccion` ("Pedir a cocina") y `crear_pedido_combos`
(cambiada en H6 y ordenada en H9, no reemplazada).

### 11.1 Código de las pantallas y del servidor que se reemplazó en H8 y H9

Esto es código (no la base): se reescribió adentro de los mismos archivos. No se borró ningún archivo.

| Qué | Dónde estaba | Lo reemplaza |
|---|---|---|
| `calcularConsumoPedido` | `server.js` | La cuenta quedó en `verificarStockPedido` (al pasar a 2, solo lee) y en `descontar_insumos_pedido` (al pasar a 3 o 4, en la base) |
| El descuento insumo por insumo de `descontarStockPedido` (`.ilike('motivo', '%pedido #005%')`) | `server.js` | `descontar_insumos_pedido` (8.4) |
| 37 funciones de `ListarPedidos.js` | `ListarPedidos.js` | 13 en `ListarPedidos.js` + 5 en `pagoPedido.js` (8.2.1) |
| 11 funciones de `pedidosCocina.js` | `pedidosCocina.js` | 3 (8.3) |
| 14 funciones de la tabla de `movimientosStockNuevo.js` (`agruparCompras`, `dibujarCompra`, `coincideTipo`…) | `movimientosStockNuevo.js` | 5 (8.5). El modal de compra quedó igual |
| `GET /api/movimientos-stock` | `server.js` | **Sigue**: la usa la página vieja ("Movimientos (viejo)"). La nueva usa `GET /api/movimientos` |

---

## 12. Ajustes después de probar a mano (16/10)

Después de probar todo a mano salieron 8 cosas para cambiar. Se investigaron primero (causa, archivos, SQL y prueba) y se
hacen **de a una, con freno después de cada una**, en este orden: 8 (cocina) → 2 (orden) → 6 (filtro de fecha) →
7 (filtros en Combos) → 5 (menos columnas) → 3 (repetidos) → 4 (hora real de las compras) → 1 (registrar salidas).

### 12.1 Cocina: el plato primero, el plan entre paréntesis (punto 8)

**Qué se encontró.** El pedido a cocina **ya se guarda por plato**: `crear_orden_produccion` (`sql/Produccion.sql`) guarda un
renglón de `orden_produccion_detalles` por plato, con su cantidad y su cocinero (el del plato o, si no tiene, el del plan).
El pedido a cocina #10 de Marta es "20 × Plato de prueba (MANTENIMIENTO)". Y también **se mostraba por plato**, pero con el
plan pegado al nombre, igual de fuerte: "20 Plato de prueba MANTENIMIENTO". Como el plato se llama "Plato de prueba", la única
palabra concreta parecía el plan.

| Dónde | ANTES | AHORA |
|---|---|---|
| Para stock (Tareas de Cocina) y Pendientes de cocina (Producción) | `20  berenjenas rellenas MANTENIMIENTO` | `20  berenjenas rellenas (MANTENIMIENTO)` |
| Hecho hoy (Producción) | `09:03 · 20 · Plato de prueba · MANTENIMIENTO · Marta Garcia` | `09:03 · 20 · Plato de prueba (MANTENIMIENTO) · Marta Garcia` |

**ANTES** (`cargarPendientes`, en `pedidosCocina.js`):
```js
const plan = detalle.plan ? '<span class="pend-plan">' + escHtml(detalle.plan) + '</span>' : '';
...
<div class="pend-plato">${escHtml(detalle.plato)} ${plan}</div>
```
**AHORA:**
```js
// El plan va entre paréntesis después del plato, en gris: así se lee primero QUÉ plato es.
// Ej: plato 'berenjenas rellenas' y plan 'MANTENIMIENTO' → "berenjenas rellenas (MANTENIMIENTO)"
const plan = detalle.plan ? ' <span class="pend-plan">(' + escHtml(detalle.plan) + ')</span>' : '';
...
<div class="pend-plato">${escHtml(detalle.plato)}${plan}</div>
```
Y en `cargarHechosHoy` (`heladera.js`): `' <span class="hh-plan">· ' + plan` pasó a `' <span class="hh-plan">(' + plan + ')'`.
El CSS no cambió: el plato ya estaba en negrita y el plan en gris.

| Función | Qué hace | ENTRADA | SALIDA | Cambió |
|---|---|---|---|---|
| `cargarPendientes` (pedidosCocina.js) | Pide los pedidos a cocina sin hacer y los dibuja, una tarjeta por cocinero | dónde dibujar y, la primera vez, `{ conBotonHecho, recargar }` | la lista (o null); en pantalla, los renglones | Solo el texto del plan |
| `cargarHechosHoy` (heladera.js) | Pide y dibuja "Hecho hoy" | nada | nada (la lista en pantalla) | Solo el texto del plan |

**Seguridad.** Igual que antes: el plato y el plan vienen de la base y pasan por `escHtml` (un nombre con `<script>` se ve como
texto). **Sin SQL. Sin cambios en el servidor.**

**Se conecta con:** Tareas de Cocina ("Para stock", `cocinero.html`) y Producción ("Pendientes de cocina" y "Hecho hoy",
`heladera.html`), con las rutas `GET /api/ordenes-produccion/pendientes` y `…/hechos-hoy`, que no cambiaron.

---

## 13. Pantalla 1 (Index, la web nueva) — paso 1: cómo se ve (16/10)

**Qué se pidió.** Cambiar SOLO cómo se ve `index-combos.html`, con el diseño de `docs/diseno-index/`. No cambia nada de
los datos, las rutas, las validaciones ni lo que se manda al servidor. El index viejo todavía no se reemplaza (eso es el paso 2).
Decisiones del 16/10: 1) el logo de siempre (`logo.webp`) · 2) los textos de hoy; los de la maqueta solo donde hoy no hay
nada · 3) el formulario en el orden de la maqueta · 4) la tarjeta del combo sin "Menú: …". Sin "Ofertas del día"; combos en
tarjetas (2 por fila en el celu, 4 en la compu); categorías una debajo de la otra en el celu.
Y las reglas nuevas del CLAUDE.md (16/10, 10:17): **nombres claros en español** en ids, clases, funciones y variables
(un combo es `tarjeta-combo`, no `oferta`), el mismo nombre en HTML, JS y CSS, y **CSS solo en su archivo** (nada de `<style>`
ni `style=""` en el HTML).

### 13.1 Qué archivos cambiaron
| Archivo | Qué cambió |
|---|---|
| `frontend/index-combos.html` | El marcado de la maqueta con nombres claros: encabezado, portada con la foto en tarjeta, los 3 pasos, categorías, combos, Dónde estamos, Preguntas (`<details>`), pie y los 3 modales. Mismos campos del formulario (mismos `name`, `value`, `maxlength`, `inputmode`). Letra Figtree. Ya no carga `global.css`. Sin `<style>` ni `style=""` |
| `frontend/src/css/index-combos.css` | Reescrito: la hoja de la maqueta (`estilos.css` v5) con los nombres en español, sin las partes que la página no usa, y al final los agregados (personalizar un plato, fotos de verdad, el botón de sesión de `auth.js`, etc.) |
| `frontend/src/js/combosCatalogo.js` | `cargarCombos` (+ "Combos desde $…"), `renderizarCategorias`, `renderizarCombos` |
| `frontend/src/js/armarCombo.js` | `renderizarMenuCombo` (y los ids que usan `abrirModalCombo`, `cerrarModalCombo` y los clics) |
| `frontend/src/js/carritoCombos.js` | `renderizarCarrito` (y los ids de los clics) |
| `frontend/src/js/pedidoCombos.js` | `abrirFinalizarPedido` (antes `abrirCheckout`) y `mostrarConfirmacion`; `cargarBarrios` y `validarFormulario` solo cambian nombres |

**No se tocó:** `server.js`, `sql/`, `auth.js` (es de la Pantalla 2), `api.js`, `fechas.js`, `escape.js`, ni lo que arma y
manda el pedido (`armarPedido`, `enviarPedido`, `armarMensajeWhatsApp` quedan iguales). Ninguna función nueva.

### 13.2 Las funciones: antes y ahora
Ejemplos con el combo de prueba «PRUEBA Mantenimiento x10» ($ 137.000, de MANTENIMIENTO, categoría "Viandas Saludables").

**`cargarCombos(mantenerCategoria)`** (combosCatalogo.js) — trae los combos del servidor y dibuja categorías y tarjetas.
- ENTRADA: `false` al abrir la página, `true` al recargar porque no alcanzaron las viandas. SALIDA: nada (dibuja).
- Cambió: escribe "Combos desde $…" en la portada con el precio más bajo (solo para mostrar). El texto viene de la maqueta
  (hoy no había nada ahí, decisión 2).
```js
const precios = combosDisponibles.map(combo => Number(combo.precio));          // [137000, 100000, 160000]
const precioMasBajo = Math.min(...precios);                                       // 100000
document.getElementById('combos-desde-precio').textContent = '$ ' + precioMasBajo.toLocaleString('es-AR');
document.getElementById('combos-desde').hidden = false;                           // estaba escondido
```
- Se conecta: la llama el arranque de la página y `confirmarPedido` (cuando "No quedan suficientes viandas…"); llama a
  `GET /api/v1/combos`, `renderizarCategorias` y `renderizarCombos`.

**`renderizarCategorias()`** — un botón por categoría; la elegida, verde con la ✓.
- ENTRADA: nada (usa `combosDisponibles` y `categoriaElegida`). SALIDA: nada (dibuja en `#lista-categorias`).
- ANTES: `let claseActiva = ''; if (esLaElegida) claseActiva = ' categoria-btn--activa';` y `class="categoria-btn${claseActiva}"`.
- AHORA: `class="boton-categoria"` con `aria-pressed="true"` en la elegida (el CSS la pinta y muestra la ✓, y los lectores de
  pantalla dicen "presionado"). Se fue el `let` + `if`.
- Se conecta: la llaman `cargarCombos` y el clic en una categoría; ese clic llama a `renderizarCombos`.

**`renderizarCombos()`** — el título de la categoría y una tarjeta por combo.
- ENTRADA: nada. SALIDA: nada (dibuja en `#combos`).
- ANTES: `let imagen = IMAGEN_POR_DEFECTO; if (platoConImagen) { imagen = … }`, la línea "Menú: fideos · canelones" y la
  tarjeta `combo-tarjeta`.
- AHORA: título (`<h3>` con la categoría) + la bajada de la maqueta ("Elegí la cantidad y armá tus platos. **Mismo precio**
  aunque personalices.") + `grilla-combos` con tarjetas `tarjeta-combo`: foto, "MANTENIMIENTO · 10 viandas", el nombre,
  "$ 137.000  $ 13.700 c/u" y "Armar combo". Sin "Menú:" (decisión 4).
```js
const imagen = platoConImagen?.imagen || IMAGEN_POR_DEFECTO;                      // la foto de un plato, o el logo
const claseLogo = imagen === IMAGEN_POR_DEFECTO ? ' foto-logo' : '';              // el logo se ve entero
const precioPorVianda = Math.round(precio / combo.cantidad);                      // 137000 / 10 = 13700
```
- Si una categoría quedara sin combos, sale temprano (`return`). Se conecta: el botón "Armar combo" lo escucha `armarCombo.js`.

**`renderizarMenuCombo()`** (armarCombo.js) — dibuja los platos del combo, "3 de 10", "Te faltan 7" y la barra.
- ENTRADA: nada (usa lo que se está armando). SALIDA: nada (dibuja y prende o apaga "Agregar al pedido").
- Lo que hace es igual (mismos topes, mismos textos: "Quedan 6", "Sin stock · podés pedirlo personalizado", "¡Combo completo!",
  la nota de los personalizados). Cambió cómo se dibuja y cómo está escrito:

| ANTES | AHORA |
|---|---|
| `let apagadoSumar = ''; if (!puedeSumar) apagadoSumar = 'disabled';` (5 veces, con `let` + `if`) | `const apagadoSumar = puedeSumar ? '' : 'disabled';` |
| Aviso de stock con `if … else if` | Dos variables con nombre: `sinStock` y `quedanPocas`, cada una con su ternario |
| `personalizados.forEach` **adentro** del `forEach` de los platos | Primero un objeto `{ idPlato: html }` con los renglones personalizados, después un solo recorrido |
| Campo "Personalizar" con `if / else` | `const personalizar = estaPersonalizando ? campoPersonalizar : botonPersonalizar;` |
| Botones `−` `+` de texto | Botones redondos de la maqueta con ícono (el `+` verde) |
| La barra: `style.width = '70%'` | `style.transform = 'scaleX(0.7)'` (así la anima el CSS de la maqueta) y la clase `progreso-completo` con el combo justo |

- Se conecta: la llaman `abrirModalCombo`, `cambiarCantidadPlato`, `agregarPlatoPersonalizado`, `cambiarCantidadPersonalizado`,
  los clics de "Personalizar" / "Cancelar" y la tecla Escape.

**`renderizarCarrito()`** (carritoCombos.js) — dibuja "Mi pedido", el total, el número del botón y "Finalizar pedido".
- ENTRADA: nada (usa `carritoCombos`). SALIDA: nada.
- ANTES: un `forEach` de platos adentro del `forEach` de combos, con `let` + `if`; el combo con un ✕ para quitarlo.
- AHORA: los platos con `map` + `join` (como en `pedidoCombos.js`), cada combo como `combo-del-pedido`: nombre y precio,
  un plato por renglón ("1 × canelones · ⚠ sin sal"), "$ 13.700 c/u" y "Quitar". Carrito vacío: el ícono de la bolsa y el texto
  de siempre ("Todavía no agregaste combos.").
```js
const viandas = Number(combo.cantidad) || 0;                       // si alguien tocó el carrito guardado y no está: 0
const tieneViandas = viandas > 0;
const textoPorVianda = tieneViandas ? '$ ' + Math.round(precio / viandas).toLocaleString('es-AR') + ' c/u' : '';
```
- Se conecta: la llaman `cargarCarrito`, `quitarDelCarrito`, `abrirMiPedido` y `confirmarPedido` (al vaciar el carrito).

**`abrirFinalizarPedido()`** (pedidoCombos.js, antes `abrirCheckout`: "checkout" es inglés) — prepara y abre "Finalizar pedido".
- ENTRADA: nada. SALIDA: nada (el modal abierto con resumen, total, fecha mínima y los datos de la sesión).
- Igual que antes en todo lo que hace (fecha mínima, datos de la sesión, barrio). Cambió el resumen: cada combo es un
  `resumen-combo` (nombre y precio arriba, los platos abajo), el total se escribe en los 3 lugares donde se ve, y el resumen
  va **abierto en compu** (fijo a la derecha) y **cerrado en el celu** (se abre al tocarlo):
```js
document.getElementById('resumen-pedido').open = window.matchMedia('(min-width: 900px)').matches;   // compu → true
```
- Se conecta: la llama el botón "Finalizar pedido" de "Mi pedido"; llama a `cargarBarrios` y a `fechas.js`.

**`mostrarConfirmacion(respuesta, datos)`** — dibuja "¡Recibimos tu pedido #N!".
- ENTRADA: lo que devolvió el servidor y los datos del formulario. SALIDA: nada (la vista de confirmación).
- Mismos textos. AHORA con el diseño de la maqueta: la ✓ grande, el título, "Para terminar, mandanos el resumen por WhatsApp
  y te confirmamos.", Fecha de entrega / Entrega / Forma de pago (en compu, en 3 columnas), el alias si es transferencia,
  el resumen con el total y el botón verde "Enviar por WhatsApp" con su ícono. El enlace de WhatsApp se sigue poniendo aparte
  (`.href`), igual que antes.
- Se conecta: la llama `confirmarPedido`; llama a `armarMensajeWhatsApp`.

**`cargarBarrios()` y `validarFormulario()`** — solo nombres: `select` → `campoBarrio`, `inputFecha` → `campoFecha` y los ids
(`ck-…` → `campo-…`, `err-…` → `error-…`). Los mismos controles, en el mismo orden, con los mismos mensajes.

### 13.3 Los nombres: antes → ahora
Regla del CLAUDE.md: todo en español y diciendo qué es; el mismo nombre en los 3 lados. Se cambió en **todos** los archivos que
los usan (el HTML, el CSS y los 4 JS; ningún otro archivo los usa). Quedan como estaban, a propósito:
- `auth-btn-container`, `auth-dropdown` y `login-btn-header`: los arma `auth.js`, que comparten otras pantallas → Pantalla 2.
- Los que ya eran claros: `contenedor`, `icono`, `foto`, `logo`, `encabezado`, `portada`, `pasos`, `seccion`, `titulo-seccion`,
  `progreso`, `plato`, `nota`, `total`, `vista`, `campos`, `campo`, `opcional`, `opciones`, `opcion`, `resumen`, `acordeon`;
  los ids `modal-combo`, `modal-pedido`, `lista-categorias`, los de las secciones (`inicio`, `categorias`, `combos`,
  `donde-estamos`, `preguntas`, `contenido`) y los de los íconos (`icono-…`).
- Los `data-accion` (`armar-combo`, `sumar`, `restar`, `quitar-combo`…): ya eran claros.

Funciones y variables: `abrirCheckout` → `abrirFinalizarPedido` · `inputFecha` → `campoFecha` · `select` → `campoBarrio`.

**Ids:**

| id antes | id ahora |
|---|---|
| `btn-mi-pedido` | `boton-mi-pedido` |
| `contador` | `contador-combos` |
| `portada-desde` | `combos-desde` |
| `portada-precio` | `combos-desde-precio` |
| `t-categorias` | `titulo-categorias` |
| `t-donde` | `titulo-donde` |
| `t-preguntas` | `titulo-preguntas` |
| `mc-cat` | `modal-combo-categoria` |
| `mc-titulo` | `modal-combo-titulo` |
| `mc-progreso` | `modal-combo-progreso` |
| `mc-cuenta` | `modal-combo-cuenta` |
| `mc-falta` | `modal-combo-falta` |
| `mc-barra` | `modal-combo-barra` |
| `mc-relleno` | `modal-combo-relleno` |
| `mc-platos` | `lista-platos` |
| `mc-agregar` | `boton-agregar-combo` |
| `mc-salir` | `aviso-salir` |
| `mc-salir-texto` | `aviso-salir-texto` |
| `mc-texto-personalizado` | `texto-personalizado` |
| `mp-titulo` | `modal-pedido-titulo` |
| `mp-cuerpo` | `modal-pedido-combos` |
| `mp-total` | `modal-pedido-total` |
| `mp-finalizar` | `boton-finalizar-pedido` |
| `modal-checkout` | `modal-finalizar` |
| `ck-titulo` | `modal-finalizar-titulo` |
| `ck-vista-form` | `vista-formulario` |
| `form-pedido` | `formulario-pedido` |
| `ck-resumen` | `resumen-pedido` |
| `ck-resumen-cant` | `resumen-cantidad` |
| `ck-resumen-total` | `resumen-total-titulo` |
| `ck-resumen-lista` | `resumen-lista` |
| `ck-resumen-cuenta` | `resumen-total` |
| `ck-nombre` | `campo-nombre` |
| `ck-apellido` | `campo-apellido` |
| `ck-telefono` | `campo-telefono` |
| `ck-email` | `campo-email` |
| `ck-direccion` | `campo-direccion` |
| `ck-grupo-barrio` | `grupo-barrio` |
| `ck-barrio` | `campo-barrio` |
| `ck-fecha` | `campo-fecha` |
| `ck-fecha-aviso` | `fecha-aviso` |
| `ck-fecha-ayuda` | `fecha-primera-posible` |
| `ck-transf` | `alias-transferencia` |
| `ck-observaciones` | `campo-observaciones` |
| `ck-total` | `total-a-pagar` |
| `ck-confirmar` | `boton-confirmar-pedido` |
| `ck-vista-ok` | `vista-confirmacion` |
| `ok-cuerpo` | `confirmacion-contenido` |
| `ok-whatsapp` | `boton-whatsapp` |
| `err-nombre` | `error-nombre` |
| `err-apellido` | `error-apellido` |
| `err-telefono` | `error-telefono` |
| `err-email` | `error-email` |
| `err-direccion` | `error-direccion` |
| `err-entrega` | `error-entrega` |
| `err-barrio` | `error-barrio` |
| `err-fecha` | `error-fecha` |
| `err-pago` | `error-pago` |
| `err-observaciones` | `error-observaciones` |
| `err-envio` | `error-envio` |

**Clases:**

| Clase antes | Clase ahora |
|---|---|
| **Encabezado, portada y pasos** | |
| `.saltar` | `.saltar-al-contenido` |
| `.btn` | `.boton` |
| `.btn--primario` | `.boton-principal` |
| `.btn--secundario` | `.boton-secundario` |
| `.btn--grande` | `.boton-grande` |
| `.btn--ancho` | `.boton-ancho` |
| `.btn--pedido` | `.boton-mi-pedido` |
| `.btn-cerrar` | `.boton-cerrar` |
| `.contador` | `.contador-combos` |
| `.logo__img` | `.logo-imagen` |
| `.encabezado__fila` | `.encabezado-fila` |
| `.encabezado__acciones` | `.encabezado-botones` |
| `.nav` | `.menu-principal` |
| `.portada__grid` | `.portada-columnas` |
| `.portada__texto` | `.portada-texto` |
| `.portada__acento` | `.palabra-verde` |
| `.clave` | `.palabra-verde` |
| `.portada__bajada` | `.portada-subtitulo` |
| `.portada__lugar` | `.portada-lugar` |
| `.portada__acciones` | `.portada-botones` |
| `.portada__dato` | `.combos-desde` |
| `.portada__contacto` | `.portada-contacto` |
| `.portada__foto` | `.portada-foto` |
| `.portada__media` | `.portada-marco` |
| `.portada__img` | `.portada-imagen` |
| `.portada__etiqueta` | `.portada-etiqueta` |
| `.pasos-franja` | `.franja-pasos` |
| `.pasos__num` | `.pasos-numero` |
| `.seccion--tinte` | `.seccion-fondo-verde` |
| `.icono-wa` | `.icono` |
| **Categorías y tarjetas de combos** | |
| `.categorias` | `.lista-categorias` |
| `.chip` | `.boton-categoria` |
| `.chip__marca` | `.boton-categoria-tilde` |
| `.combos-zona` | `.zona-combos` |
| `.combos-grid` | `.grilla-combos` |
| `.oferta` | `.tarjeta-combo` |
| `.oferta__media` | `.tarjeta-combo-foto` |
| `.oferta__texto` | `.tarjeta-combo-datos` |
| `.oferta__plan` | `.tarjeta-combo-plan` |
| `.oferta__precios` | `.tarjeta-combo-precios` |
| `.oferta__acciones` | `.tarjeta-combo-boton` |
| `.aviso-vacio` | `.aviso-combos` |
| `.foto--logo` | `.foto-logo` |
| **Modales y armar combo** | |
| `.hoja` | `.modal` |
| `.hoja--pedido` | `.modal-pedido` |
| `.hoja--completa` | `.modal-finalizar` |
| `.hoja__cab` | `.modal-encabezado` |
| `.hoja__sup` | `.modal-categoria` |
| `.hoja__cuerpo` | `.modal-contenido` |
| `.hoja__pie` | `.modal-pie` |
| `.hoja__botones` | `.dos-botones` |
| `.progreso__texto` | `.progreso-texto` |
| `.progreso__barra` | `.progreso-barra` |
| `.completo` | `.progreso-completo` |
| `.salir` | `.aviso-salir` |
| `.platos` | `.lista-platos` |
| `.elegido` | `.plato-elegido` |
| `.plato__info` | `.plato-datos` |
| `.plato__quedan` | `.plato-quedan` |
| `.plato__quedan--sin` | `.plato-sin-stock` |
| `.plato__extra` | `.plato-personalizados` |
| `.personalizado` | `.renglon-personalizado` |
| `.personalizado__texto` | `.renglon-personalizado-texto` |
| `.personalizar` | `.personalizar-plato` |
| `.enlace` | `.boton-enlace` |
| `.cantidad` | `.selector-cantidad` |
| `.cantidad__btn` | `.boton-cantidad` |
| `.cantidad__btn--mas` | `.boton-sumar` |
| `.cantidad__num` | `.numero-cantidad` |
| **Mi pedido** | |
| `.item` | `.combo-del-pedido` |
| `.item__fila` | `.nombre-y-precio` |
| `.item__nombre` | `.combo-nombre` |
| `.item__precio` | `.combo-precio` |
| `.item__detalle` | `.combo-platos` |
| `.item__acciones` | `.combo-acciones` |
| `.item__unidad` | `.combo-precio-vianda` |
| `.quitar` | `.boton-quitar` |
| `.vacio` | `.pedido-vacio` |
| `.vacio__icono` | `.pedido-vacio-icono` |
| **Finalizar pedido y confirmación** | |
| `.checkout__cuerpo` | `.finalizar-contenido` |
| `.checkout__grid` | `.finalizar-columnas` |
| `.checkout__pie` | `.finalizar-pie` |
| `.checkout__total` | `.finalizar-total` |
| `.checkout__error` | `.finalizar-error` |
| `.resumen__cab` | `.resumen-titulo` |
| `.resumen__cant` | `.resumen-cantidad` |
| `.resumen__lado` | `.resumen-derecha` |
| `.resumen__flecha` | `.resumen-flecha` |
| `.resumen__contenido` | `.resumen-contenido` |
| `.resumen__items` | `.resumen-lista` |
| `.resumen__item` | `.resumen-combo` |
| `.resumen__cuentas` | `.resumen-cuentas` |
| `.resumen__total` | `.resumen-renglon-total` |
| `.bloque` | `.grupo-campos` |
| `.campo__ayuda` | `.campo-ayuda` |
| `.campo__error` | `.campo-error` |
| `.campos-dos` | `.campos-lado-a-lado` |
| `.input` | `.casillero` |
| `.subcampos` | `.grupo-barrio` |
| `.opciones--2` | `.opciones-dos-columnas` |
| `.opcion__input` | `.opcion-radio` |
| `.opcion__caja` | `.opcion-tarjeta` |
| `.opcion__marca` | `.opcion-circulo` |
| `.opcion__cuerpo` | `.opcion-textos` |
| `.opcion__titulo` | `.opcion-titulo` |
| `.opcion__texto` | `.opcion-detalle` |
| `.ok` | `.confirmacion` |
| `.ok__marca` | `.confirmacion-tilde` |
| `.ok__datos` | `.confirmacion-datos` |
| **Dónde estamos, preguntas, pie y WhatsApp** | |
| `.donde` | `.donde-columnas` |
| `.donde__datos` | `.donde-lista` |
| `.donde__item` | `.donde-dato` |
| `.enlace-dato` | `.enlace-subrayado` |
| `.preguntas` | `.preguntas-columnas` |
| `.acordeon__item` | `.pregunta` |
| `.acordeon__boton` | `.pregunta-titulo` |
| `.acordeon__signo` | `.pregunta-signo` |
| `.acordeon__respuesta` | `.pregunta-respuesta` |
| `.pie` | `.pie-de-pagina` |
| `.pie__grid` | `.pie-columnas` |
| `.pie__marca` | `.pie-marca` |
| `.pie__col` | `.pie-columna` |
| `.pie__copia` | `.pie-derechos` |
| `.wa-flotante` | `.whatsapp-flotante` |

**Se sacaron del HTML:** el `<style>` del encabezado (pasó al CSS: el `body` escondido hasta que carga), `style="position:absolute"`
de la lista de íconos (ahora clase `lista-iconos`), `style="position:relative;"` de `#auth-btn-container` (ahora en el CSS),
el texto "Fast Good" escondido al lado del logo (`logo__vacio`: nunca se veía) y el id `mp-pie` (nadie lo usaba).

**Se sacaron del CSS (nadie las usaba en esta página):** `.solo-lector`, `.btn--texto`, `.contador.salta`, `.logo__vacio`,
`.nav a.activo`, `.portada__vacia`, `.bajada-seccion`, `.tarjeta…` (platos sueltos), `.oferta__desc` (sello), los precios
tachados (`s`), `.opcion__input:checked + .chip`, `.bloque.invalido`, `.input[aria-invalid]`, `.acordeon__pregunta`,
`[aria-expanded]` del acordeón viejo, `.acordeon__respuesta[hidden]`, `h2:focus` / `h3:focus`, `.ok h4`, `.vacio h3`,
`.vacio .btn`, `.salir p strong` y `.oferta h3` (estaba pisada por `.zona-combos h3`: no hacía nada).

### 13.4 Cómo se comprobó que se ve igual y que anda igual
- **Se ve igual:** un script abre la página en un Chrome sin ventana (perfil temporal, sin tocar el tuyo) y recorre 14 pasos en
  celu (390 px) y 13 en compu (1440 px): portada, Mi pedido vacío, armar el combo (vacío, personalizando, 8 de 10, completo,
  "¿Salir?"), Mi pedido, Finalizar (vacío, con errores, Retiro + Transferencia, resumen abierto en el celu) y la confirmación
  **dibujada con datos de mentira**. En cada paso guarda la captura y, de cada elemento visible, su posición, tamaño y ~60
  estilos. Se corrió con los nombres de la maqueta y con los nuevos: **todo igual**. Lo único distinto: el nombre de 2 zonas
  de la grilla del encabezado (`nav` → `menu`, `acciones` → `botones`, mismo lugar) y ruido de la propia captura, comprobado
  repitiendo (las dos corridas del "antes" también difieren entre sí en esas capturas; la barra de progreso terminando su
  animación: con 3 segundos más de espera, idéntica).
- **No se manda nada:** el script nunca toca "Confirmar pedido" y además corta cualquier pedido a `/api/pedidos-combos`.
  Errores en la consola del navegador: ninguno.
- `node --check` en los 4 JS: bien. Lo nuevo sin `if` adentro de otro `if`.
- **Test HELADERA: 40/40, dos veces** (10:33 con los nombres de la maqueta y 13:44 con los nuevos): pedidos de prueba
  "PRUEBA – NO PREPARAR" #15 y #16 en la primera y dos más en la segunda, todos anulados; la heladera quedó igual.

### 13.5 Seguridad (qué protege cada cosa)
- **`escHtml` en todo lo que viene de la base** antes del `innerHTML`: nombres de combos, planes, categorías y platos,
  descripciones, el texto personalizado, la dirección… Protege de **XSS**: si alguien carga un plato llamado
  `<img src=x onerror=…>`, se ve como texto y no se ejecuta.
- **`textContent`** para "Combos desde", los totales, "3 de 10" y "Te faltan 7": se muestran como texto, nunca como HTML.
- **"$… c/u" y "Combos desde" son solo para mostrar:** el total que se cobra lo calcula el servidor desde la base. Protege de
  que alguien **cambie precios en el navegador** (en el carrito guardado): vería otro número, pero paga el del servidor.
- **El carrito guardado se lee igual que antes** (`cargarCarrito` no cambió) y el "c/u" se calcula solo si la cantidad es un
  número mayor a 0: un carrito tocado a mano no rompe la página (nada de "NaN" ni división por cero).
- **Lo que se manda al servidor no cambió** (`armarPedido` y `enviarPedido` iguales): el servidor sigue controlando todo
  (precios, cantidades, que el combo sume justo, límite de pedidos por IP).
- El enlace de WhatsApp se sigue poniendo con `.href` aparte: ningún texto del mensaje puede romper el HTML.

### 13.6 Qué quedó para después
- `if` adentro de `if` y `else` viejos, **fuera de lo que dibuja**: `agregarPlatoPersonalizado` y los clics de `armarCombo.js`,
  y los clics de `carritoCombos.js`. Se pasan al estilo nuevo cuando digas (este paso es solo cómo se ve).
- `auth.js` (Pantalla 2): el nombre del usuario sin `escHtml`, sus estilos escritos en la etiqueta (acá se pisan con
  `!important`) y sus nombres en inglés (`auth-btn-container`, `login-btn-header`, `auth-dropdown`).
- **Pregunta abierta:** el nombre del combo en la tarjeta sale grande, como en la maqueta (lo agarra `.zona-combos h3`). En el
  celular, con nombres largos como "MANTENIMIENTO - PRUEBA 20", la palabra se parte en dos renglones (antes quedaba cortada en
  el borde; se arregló con `overflow-wrap: anywhere`). Opción: 16 px, la medida que la maqueta tenía escrita para las tarjetas
  (`.oferta h3`) y que quedaba pisada.

### 13.7 Arreglo visual (16/10, tarde): tarjetas de combos y foto de la portada
**Qué se pidió:** solo lo visual (regla del CLAUDE.md), dos cosas. 1) Las tarjetas de combos como las de la referencia
(`docs/diseno-index/estilos.css`, que ahora es la versión v4, regla `.combo` en compu). 2) La foto de la portada:
`viandaprincipal2` (las viandas sobre la mesa de madera) con `srcset` de 900, 1600 y la original. Esto también responde la
pregunta abierta de 13.6: el nombre va a 18 px.

**1) Las tarjetas.** Cambió solo el HTML que arma `renderizarCombos` (combosCatalogo.js) y el CSS de las tarjetas.

| | ANTES | AHORA |
|---|---|---|
| Arriba del nombre | "MANTENIMIENTO · 20 viandas" en verde | No está (se sacó) |
| Nombre | El tamaño grande del título de la zona (`.zona-combos h3` también lo agarraba) | 18 px, peso 700, texto oscuro (`tarjeta-combo-nombre`). `.zona-combos h3` pasó a `.zona-combos > h3`: solo el título de la zona |
| Precio | 19 px, con "$ 13.700 c/u" al lado | 26 px, peso 800, verde (`tarjeta-combo-precio`) y abajo, en gris chico, "$ 13.700 por vianda" (`tarjeta-combo-por-vianda`) |
| Botón | "Armar combo" | "Armar combo ›" (con la flechita `icono-der`), a todo el ancho y abajo de todo: las tarjetas de una fila tienen el mismo alto y los botones quedan alineados |
| Borde y mouse | Al pasar el mouse, borde verde y sombra | Borde finito gris; al pasar el mouse, sombra suave (como la referencia) |
| Por fila | 2 en celu, 4 en compu | 1 en celu (a lo ancho), 2 en tablet (640 px o más), 3 como máximo en compu (900 px o más) |
| Destacado | — | Listas pero sin usar (no hay un dato que diga cuál es): `tarjeta-combo-destacada` (borde naranja de 2 px) y la pastilla `tarjeta-combo-sello` ("Más elegido", arriba a la izquierda sobre la foto) |

```js
// renderizarCombos: lo que cambió del HTML de cada tarjeta
<h3 class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</h3>
<p class="tarjeta-combo-precios">
  <strong class="tarjeta-combo-precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</strong>
  <span class="tarjeta-combo-por-vianda">$ ${escHtml(precioPorVianda.toLocaleString('es-AR'))} por vianda</span>
</p>
<button … data-accion="armar-combo" …>Armar combo <svg class="icono" aria-hidden="true"><use href="#icono-der"></use></svg></button>
```
- `renderizarCombos`: ENTRADA nada (usa `combosDisponibles` y `categoriaElegida`) → SALIDA nada (dibuja en `#combos`).
  Se conecta igual que antes: la llaman `cargarCombos` y el clic en una categoría; el botón lo escucha `armarCombo.js`
  (el clic en la flechita también sirve: se busca el botón con `closest`).
- **Nombres:** no se renombró nada que use el JS. Clases nuevas: `tarjeta-combo-nombre`, `tarjeta-combo-precio`,
  `tarjeta-combo-por-vianda`, `tarjeta-combo-destacada` y `tarjeta-combo-sello`. Se fue `tarjeta-combo-plan` (la línea
  verde). El "c/u" de "Mi pedido" no cambió (no es la tarjeta).

**2) La foto de la portada** (`index-combos.html`, solo la `<img>`): antes `bannerpro4.png` (7,4 MB); ahora
`viandaprincipal2-1600.jpg` con `srcset` de `viandaprincipal2-900.jpg 900w`, `-1600.jpg 1600w` y `viandaprincipal2.jpg 3168w`
(la original, 4,3 MB) y `sizes="(min-width: 768px) 55vw, 100vw"`. El navegador baja la que le alcanza: comprobado, el celu
(1x) baja la de 900 px (0,1 MB) y uno de alta densidad (3x) la de 1600 px (0,3 MB); la compu, la de 900 px, y con pantalla
retina la de 1600 px. El encuadre (lado derecho de la foto) y el texto alternativo son los de antes.

**Cómo se comprobó:**
- Las capturas de las tarjetas: 3 por fila en compu, 2 en tablet, 1 en celu, con los botones alineados.
- El mismo recorrido de 27 pasos de 13.4, comparado por zonas contra cómo estaba antes del cambio: los modales, el encabezado,
  la portada y todo lo que está después de las tarjetas, **iguales**. Lo único distinto fuera de las tarjetas fueron
  números de captura (la página quedó más alta).
- Errores en la consola: ninguno. `node --check`: bien. Sin `if` anidados.
- **Test HELADERA: 40/40** (pedidos de prueba #19 y #20, anulados; la heladera quedó igual).

**Seguridad:** el nombre del combo y los precios siguen pasando por `escHtml` (protege de XSS: un nombre con `<script>` se ve
como texto). "Por vianda" es solo para mostrar: el precio que se cobra lo calcula el servidor desde la base.

### 13.8 La web nueva con el estilo general de la v4 (16/10, tarde)
**Qué se pidió:** solo HTML y CSS, con la referencia `docs/diseno-index-v4/diseno-index-v4/` (`index.html` y `estilos.css`),
sin renombrar nada que use el JS y sin "Ofertas del día".

| # | Pedido | Qué se hizo |
|---|---|---|
| 1 | Estilo general v4 | `index-combos.css` con los colores, sombras y tamaños de la v4 (comparado regla por regla con un script: quedan solo las diferencias nuestras a propósito). Fondo blanco, una línea finita entre secciones, botones de 48 px (56 px el de la portada), casilleros de 50 px, bordes de 1,5 px, foco naranja con Tab, encabezado blanco sin desenfoque, − / + blanco con borde. Las secciones ya no llevan `seccion-fondo-verde` (se sacó del HTML y del CSS) |
| 2 | "Fast Good" y los pasos | "Fast Good" más grande (hasta 96 px) y los 3 pasos con el número en un círculo de 44 px (48 px en compu) |
| 3 | Arriba de las tarjetas | "Combos Viandas Saludables" y "Elegís la cantidad y después armás tus platos. Podés repetir." (en el HTML que arma `renderizarCombos`) |
| 4 | Descripción del plato | **No hizo falta tocar nada:** el dato llega (`descripcion` en `/api/v1/combos`) y `renderizarMenuCombo` ya la muestra debajo del nombre cuando tiene texto. Hoy los 4 platos la tienen vacía |
| 5 | Mapa | Dónde estamos: los datos en una sola lista a la izquierda y un recuadro gris que dice "mapa" a la derecha (debajo, en el celular) |
| 6 | Las 8 preguntas de la v4 | **No se pudo:** la v4 las arma desde `app.js`, que no está en la carpeta (solo están `index.html` y `estilos.css`). Quedan las 4 de hoy, en 2 columnas en compu |

La foto de la portada quedó como en la `index.html` de la v4: `sizes` con 56vw, `width`/`height` reales y `fetchpriority="high"`.
**Comprobado:** los 27 pasos del recorrido sin errores en la consola, las capturas en celu y en compu, y **test HELADERA 40/40**
(pedidos de prueba #21 y #22, anulados). **Seguridad:** el nombre de la categoría del título pasa por `escHtml`.

### 13.9 Pantalla 1, paso 2: la web nueva es LA web (16/10)
| Qué | ANTES | AHORA |
|---|---|---|
| `localhost:3000/` | El index viejo (platos sueltos y carrito viejo) | La web nueva: `index-combos.html` pasó a llamarse `index.html`. El viejo quedó guardado como `index-viejo.html` (sin usar, no se borró). `server.js` no cambió: ya mandaba `/` a `index.html` |
| Personal con sesión que entra a la web | (solo en el viejo) roles 6, 5 y 1 saltaban a su pantalla | Igual en la web nueva: el mismo bloque, copiado tal cual al script del final de `index.html` |
| `cerrarSesion()` (`auth.js`) | `location.href = 'index.html'` (desde `/pages/` buscaba `/pages/index.html`) | `location.href = '/'`: la web, desde cualquier pantalla |
| Cerrar sesión en las pantallas de `/pages/` (`adminSidebar.js`) | Sin `auth.js` en la página: borraba la sesión e iba a `login.html` | Borra la sesión y va a `/` (la web) |
| Comentarios | "index-combos.html" | "index.html" (en `index-combos.css` y los 4 JS; los nombres de archivo de CSS y JS no cambiaron) |

El login no cambió: `login.html` y `auth.js` mandan a cada rol a su pantalla con la tabla de `roles.js`
(6 y 5 → `admin.html`, 1 → Consultar Pedidos, 2 → Tareas de Cocina, 3 → Envíos, 4 → `index.html`, que ahora es la web nueva).
El ✕ y el fondo de `login.html` ya apuntaban a `index.html`: ahora muestran la web nueva.

**Comprobado:** recorrido en Chrome sin ventana, 13/13: `/` abre la web nueva y arma un combo (sin confirmar la compra);
`index-combos.html` da 404; "Iniciar Sesión" → login; login admin → panel; admin con sesión en `/` → panel; cerrar sesión
desde el panel y desde `/pages/ConsultarPedidos.html` → la web; cliente (sesión simulada: no hay usuario cliente en el `.env`)
se queda en la web con su nombre y al cerrar sesión vuelve a "Iniciar Sesión"; cocinero (simulado) en `/` se queda en la web.
Sin errores en la consola. **Test HELADERA 40/40** (pedidos de prueba #23 y #24, anulados).

**Archivos del index viejo que quedan sin usar (no se borraron, esperan el OK):** `index-viejo.html`, `src/js/index.js`,
`src/js/carrito.js`, `src/js/animations.js`, `pages/formulario.html` + `src/js/formulario.js` (los abría el carrito viejo),
`src/js/funciones.js` (solo lo usaban el viejo y `formulario.html`) y las imágenes `vianda 1.png`, `sinGluten.png`,
`pastel.png` y `combo.png`. Siguen en uso: `global.css`, `global.js`, `index.css` y `carrito.css` (los carga el panel).

### 13.10 Ajustes visuales (v5), animaciones y login en ventana (16/10)
- **Letra y títulos (v5):** "Fast Good" min(19cqi, 5.25rem) en #3a4640 con "Good" en #1d7a34; el texto de abajo en #4b574e, peso 500;
  títulos de sección clamp(1.75rem, 7vw, 2.5rem), -0.03em, #3a4640, con la palabra destacada en #1d7a34; textos comunes
  (`--texto-suave`) en #4b574e; botones de 44 px y letra de 15 px (el de la portada, 50 px).
- **Fondo verde clarito** (#e7f1e4, de borde a borde) solo en Categorías y en Preguntas: vuelve la clase `seccion-fondo-verde`
  en esas dos secciones. Las tarjetas y las categorías no elegidas van en blanco; la elegida sigue verde.
- **Tarjetas (v5):** 2 por fila en el celu, 3 en tablet (768 px o más), 4 en compu (1024 px o más); borde #d9e3d6, radio 16 px,
  foto 16/10; padding 12/14/14; nombre de 16 px; precio de 19 px en #1d7a34; "por vianda" de 14 px; botón de 44 px; hover con
  borde #2faa4b y sombra.
- **Animaciones:** la portada entra de a uno (0,06 s entre cada uno); las secciones aparecen al bajar (`revelar` / `visible`,
  con IntersectionObserver, en el script del final de `index.html`); el contador de "Mi pedido" salta al agregar un combo
  (`contador-salta`, en `agregarAlCarrito`). Las ventanas que suben, "Mi pedido" de costado, los botones que se achican y el +
  que gira ya estaban. Con `prefers-reduced-motion` no se anima nada (el script tampoco esconde las secciones).
  (En 13.11 esto pasó a `animaciones-index.js`: salieron el IntersectionObserver del script y el `contador-salta`.)
- **Iniciar sesión en ventana** (`modal-login` en `index.html`): Email, Contraseña e "Ingresar". Usa **la misma función** de
  `login.html` (`manejarLogin`, de `auth.js`, sin cambios): por eso los campos tienen sus ids (`username`, `password`,
  `loginError`, `loadingSpinner`) y el botón la clase `login-btn`. El botón "Iniciar Sesión" (lo arma `auth.js` como link a
  `login.html`) ahora abre la ventana; sin JavaScript sigue yendo a `login.html`. Clave mal → "Usuario o contraseña
  incorrectos" en rojo (el texto lo manda el servidor). "Olvidé mi contraseña" y "Crear cuenta" llevan a `login.html#recuperar` y
  `login.html#registro`: se agregaron 2 líneas a `login.html` que abren esa parte según el `#` (sin `#`, igual que siempre).
- **Comprobado:** recorrido 8/8 (las secciones aparecen, el fondo verde solo en las dos, el contador salta, la ventana abre con el
  foco en Email, la clave mal muestra el error en rojo, el admin entra al panel, los dos links abren su parte de `login.html`
  y `login.html` sola sigue entrando al panel). Sin errores en la consola. **Test HELADERA 40/40** (pedidos de prueba #25 y #26,
  anulados).

### 13.11 Pantalla 1: el diseño final (v5) de `docs/diseno-final-index/`, con animaciones (16/10)
**Qué se pidió:** seguir al pie de la letra `docs/diseno-final-index/diseno-final-index/PROMPT.md`. La web tiene que quedar
igual a `referencia.html` (capturas a 1440 y 390 px), con sus animaciones. **Es solo visual:** no cambia cómo funciona nada,
ni los campos del formulario, ni los datos que vienen del servidor. Nada de SQL y sin commit.

**Tus decisiones del Paso 0 (16/10):**
| # | La duda | Lo que decidiste |
|---|---|---|
| 1 | El PROMPT dice "copiar tal cual", con los nombres de la maqueta (`combo`, `combo__cta`, `hoja`…), y el CLAUDE.md pide nombres claros en español | **A:** los mismos valores, con nuestros nombres. La tabla "maqueta → nuestro" está en 13.11.8 |
| 2 | Las demoras `style="--d: …"` que pide el PROMPT (el CLAUDE.md no deja poner `style=""` sueltos) | **A:** van en el CSS (`index-final.css`, parte 5) |
| 3 | El nombre de la tarjeta: el PROMPT pide "{cantidad} viandas {categoría}" | **A:** queda el nombre del combo que viene de la base (`combo.nombre`) |
| 4 | Qué foto lleva cada tarjeta. No hay ninguna categoría "Mantenimiento": es el **plan** de los 3 combos | **A:** 1) plan Mantenimiento → COMBO MANTENIMIENTO · 2) categoría con "saludable" → COMBO SALUDABLE · 3) la foto de hoy. Y versiones livianas de 1200 px, en archivos aparte |
| 5 | `index-combos.css` tenía cambios nuestros encima de la v5 (los de 13.10) | **Sí:** volver a la v5, igual a la referencia |
| 6 | El pedido de prueba completo (Paso 6.7) | **Sí:** retiro, efectivo y sin personalizados; después anularlo y comprobar que la heladera quede igual |
| — | Mi IntersectionObserver de 13.10 y el salto del contador en `agregarAlCarrito` | **OK a sacarlos:** ahora los hace `animaciones-index.js` |

#### 13.11.1 Qué hice | archivo | resultado (lo que pide el Paso 6.8 del PROMPT)
| Paso del PROMPT | Qué hice | Archivo | Resultado |
|---|---|---|---|
| 1. CSS y letra | Copié `index-final.css` con los mismos valores y nuestros nombres, y lo linkeé como el **último** CSS. Figtree ya estaba (línea 10) y no se duplicó | `src/css/index-final.css` (nuevo), `index.html` | Se carga último y gana sobre `index-combos.css` |
| 1b. Volver a la v5 (decisión 5) | `index-combos.css` volvió a ser la v5 de `estilos.css`, con nuestros nombres: 78 reglas con los valores de la v5 y 23 retoques a mano. Salieron los agregados de 13.10 que la v5 no tiene (como el bloque verde) y los que ahora trae `index-final.css` | `src/css/index-combos.css` | Comparado regla por regla con `estilos.css`: quedan 3 diferencias, a propósito (13.11.3) |
| 2. Estructura y títulos | Ya estaba igual que la referencia: el orden de las secciones, sin Ofertas, los mismos títulos y "Combos {categoría}" con su texto. El orden es encabezado, portada con los 3 pasos, Categorías con fondo verde, Dónde estamos, Preguntas con fondo verde, pie y WhatsApp | `index.html` (sin cambios en este paso) | Igual a `referencia.html` |
| 3. Tarjeta de combo | Template nuevo. La tarjeta entera es el botón, con los mismos `data-accion="armar-combo"` y `data-id-combo`. Adentro van los datos (nombre, precio, "por vianda" y "Armar combo ›") y la foto. Todas van en `<div class="grilla-combos">` | `src/js/combosCatalogo.js` (`renderizarCombos`) | 3 por fila en compu y 1 en celu. El clic abre "Armar combo" igual que antes |
| 3. "Más elegido" | No marqué ninguno: el sistema no tiene un dato para saber cuál es | — | Lo aviso en 13.11.7. El estilo queda listo |
| 3b. Fotos | Las fotos están en `frontend/src/assets/img/` como `COMBO MANTENIMIENTO.jpeg` y `COMBO SALUDABLE.jpeg` (no se renombraron ni se tocaron). Hice `combo-mantenimiento-1200.jpg` y `combo-saludable-1200.jpg`. La tarjeta elige la foto con la regla de la decisión 4 | `src/js/combosCatalogo.js`, `src/assets/img/` | Hoy los 3 combos son del plan MANTENIMIENTO, así que los 3 muestran COMBO MANTENIMIENTO. La web baja 178 KB en lugar de 3,2 MB (las 3 tarjetas usan la misma foto) |
| 4. Platos de "Armar combo" | Ya estaban en ese orden (foto → `plato-datos` con nombre y descripción → `selector-cantidad`), así que no toqué el JS | — | En compu, el nombre queda centrado entre la foto y el − / +. En celu, el − / + va abajo de la descripción |
| 5. Animaciones | Copié `animaciones-index.js` (solo cambia `.contador` → `.contador-combos`) y lo cargué al final, después de los otros scripts. Puse la clase `revelar` en los 9 lugares que dice el PROMPT. Saqué mi IntersectionObserver del script del final de `index.html` y el salto de `agregarAlCarrito` | `src/js/animaciones-index.js` (nuevo), `index.html`, `combosCatalogo.js`, `carritoCombos.js` | Las secciones aparecen al bajar y el contador salta cuando cambia el número |
| 5. Ventanas | Revisé las ventanas: "Armar combo" y "Finalizar pedido" son `<dialog class="modal">` y "Mi pedido" es `<dialog class="modal modal-pedido">`. Son `hoja` y `hoja hoja--pedido` con nuestros nombres | `index.html` (sin cambios) | Suben al abrirse y, en compu, "Mi pedido" entra de costado, como la referencia |
| 6.1 Igual a las capturas | Saqué capturas a 1440 y 390 px y las comparé con `ref-compu.png`, `ref-celu.png`, `armar-compu.png` y `armar-celu.png` | — | Iguales, salvo los datos del sistema (13.11.7) |
| 6.2 Scroll de costado | Medí el ancho de la página | — | 390 de 390 y 1440 de 1440: no hay scroll de costado |
| 6.3 Aparecer al bajar | Probé los 11 elementos `revelar` (3 son tarjetas) | — | Al cargar esperan y al bajar aparecen todos. Al cambiar de categoría, las tarjetas nuevas también aparecen de a una |
| 6.4 Sin movimiento | Probé con `prefers-reduced-motion: reduce` | — | No hay clase `js`, no queda nada escondido y las animaciones duran 0,01 ms (o sea, no se mueve nada) |
| 6.5 Consola | Miré los errores al cargar y al usar la página | — | Ninguno. Solo aparecen los 2 de la prueba de la clave mal, que son a propósito |
| 6.6 Test | Corrí `node tests/test_e2e.js heladera` | — | **40/40** (pedidos de prueba #28 y #29, anulados; la heladera quedó igual) |
| 6.7 Pedido de prueba | Hice un pedido completo desde la web: combo → 10 fideos → Mi pedido → Finalizar → Confirmar | — | Pedido **#27**, "PRUEBA – NO PREPARAR". Lo anulé y la heladera quedó igual (13.11.5) |
| Lo que pediste además | Probé el login en ventana, "✎ Personalizar" y el carrito | — | Andan los tres (13.11.5) |

No se tocaron `server.js`, `sql/`, `armarCombo.js`, `pedidoCombos.js` ni `auth.js`. Tampoco los campos del formulario ni lo que
se manda al servidor.

#### 13.11.2 Las funciones: antes y ahora
**`renderizarCombos`** (`combosCatalogo.js`). Cambió solo el HTML que arma.
- **Qué hace:** dibuja el título "Combos {categoría}", el texto de abajo y una tarjeta por cada combo de la categoría elegida.
- **ENTRADA:** nada (usa `combosDisponibles` y `categoriaElegida`). **SALIDA:** nada (escribe el HTML en `#combos`).

| | ANTES (13.10) | AHORA |
|---|---|---|
| La tarjeta | `<article class="tarjeta-combo">`, con un botón "Armar combo" adentro | `<button class="tarjeta-combo revelar">`: **la tarjeta entera es el botón** (como la referencia), con los mismos `data-accion="armar-combo"` y `data-id-combo` |
| Lo de adentro | Foto, nombre, precios y botón | Primero los datos (nombre, precio, "por vianda" y "Armar combo ›") y después la foto. `index-final.css` sube la foto arriba de todo |
| "Armar combo ›" | Un `<button class="boton boton-principal">` aparte | Un `<span class="tarjeta-combo-boton" aria-hidden="true">`: se ve como un botón, pero lo que se toca es la tarjeta entera |
| La foto | La del primer plato con foto. Si ninguno tenía, el logo | La regla de la decisión 4: plan Mantenimiento → COMBO MANTENIMIENTO, categoría "saludable" → COMBO SALUDABLE, después la del primer plato y, si no hay ninguna, el recuadro gris "foto del combo" (lo pide el PROMPT) |
| Texto de la foto para los lectores de pantalla (`alt`) | `alt=""` | `alt="Combo {categoría}"` (lo pide el PROMPT) |
| Animación | — | `revelar` en el título, en el texto y en cada tarjeta |

```js
// AHORA: la foto (la primera que corresponda) y la tarjeta
const esPlanMantenimiento = String(combo.plan || '').toLowerCase().includes('mantenimiento');
const esCategoriaSaludable = String(combo.categoria.nombre || '').toLowerCase().includes('saludable');
const platoConImagen = combo.menu.find(plato => plato.imagen);   // el primer plato con foto, o undefined
const fotosPosibles = [
  esPlanMantenimiento ? FOTO_COMBO_MANTENIMIENTO : '',
  esCategoriaSaludable ? FOTO_COMBO_SALUDABLE : '',
  platoConImagen?.imagen || ''
];
const foto = fotosPosibles.find(posible => posible !== '');   // la primera que no está vacía; undefined si no hay ninguna
const tieneFoto = foto !== undefined;
const fotoHtml = tieneFoto ? imagenHtml : recuadroHtml;        // la <img> o el recuadro "foto del combo"

html += `
  <button type="button" class="tarjeta-combo revelar" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
    <span class="tarjeta-combo-datos">
      <span class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</span>
      <span class="tarjeta-combo-precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
      <span class="tarjeta-combo-por-vianda">$ ${escHtml(precioPorVianda.toLocaleString('es-AR'))} por vianda</span>
      <span class="tarjeta-combo-boton" aria-hidden="true">Armar combo<svg class="icono"><use href="#icono-der"></use></svg></span>
    </span>
    <span class="tarjeta-combo-foto">${fotoHtml}</span>
  </button>`;
```
- **Por qué así:** en la referencia la tarjeta entera es el botón, así que se puede tocar en cualquier lado. Las fotos posibles
  van en una lista ordenada y `find` se queda con la primera que no está vacía. Así no hace falta un `if` adentro de otro `if`
  (regla del CLAUDE.md), y para cambiar el orden alcanza con mover un renglón.
- **Ejemplo:** "PRUEBA Mantenimiento x10" es del plan MANTENIMIENTO, de la categoría "Viandas Saludables", cuesta $ 137.000 y
  trae 10 viandas. Entonces `fotosPosibles` = [mantenimiento, saludable, la foto del plato] y gana COMBO MANTENIMIENTO. La
  tarjeta dice "$ 137.000" y "$ 13.700 por vianda".
- **Cómo se conecta:**
  - La llaman `cargarCombos` (al abrir la página y al recargar) y el clic en una categoría (en `renderizarCategorias`).
  - El clic en la tarjeta lo escucha `armarCombo.js` con `closest('[data-accion="armar-combo"]')`, sin cambios: encuentra la
    tarjeta aunque se toque la foto o el precio.
  - `animaciones-index.js` ve las tarjetas nuevas y les pone `visible` cuando entran en la pantalla.

**`iniciarAnimacionesIndex`** (nuevo, en `animaciones-index.js`). Es el de la carpeta, copiado tal cual.
- **Qué hace:** prende las animaciones de la página. Los `revelar` aparecen cuando llegan a la pantalla y el contador de
  "Mi pedido" salta cuando cambia.
- **ENTRADA:** nada. **SALIDA:** nada (pone la clase `js` en `<html>`, `visible` en cada `revelar` que entra en la pantalla y
  `salta` en el contador cuando cambia su número).
- Adentro tiene **`observarNuevos`**, que empieza a mirar los `revelar` que todavía no se vieron, también los que se dibujan
  después.
- **Cómo funciona, paso a paso:**
  1. Si la persona pidió "sin movimiento" en su equipo (`prefers-reduced-motion`) o el navegador es muy viejo, sale sin hacer
     nada y todo se ve quieto.
  2. Pone la clase `js` en `<html>`. Recién ahí el CSS esconde los `revelar` (`.js .revelar { opacity: 0 }`), así que sin
     JavaScript nunca quedan escondidos.
  3. Un **IntersectionObserver** (un "vigía de la pantalla") avisa cuando un `revelar` entra en la pantalla. Ahí le pone
     `visible` y lo deja de mirar.
  4. Un **MutationObserver** (un "vigía de cambios") avisa cuando se dibuja algo nuevo, por ejemplo las tarjetas al tocar
     otra categoría, y vuelve a llamar a `observarNuevos`.
  5. Otro MutationObserver mira el número de `.contador-combos`. Si cambió, saca y vuelve a poner `salta`. El
     `void contador.offsetWidth` del medio hace que la animación arranque de nuevo cada vez.
- **Ejemplo:** abrís la página y bajás hasta "Dónde estamos": el título recibe `visible` y aparece suave. Tocás "Agregar al
  pedido": el contador pasa de 0 a 1 y salta.
- **Por qué así:** el PROMPT dice "copialo tal cual". Solo cambié el nombre del contador (`.contador` → `.contador-combos`,
  por la regla "Nombres claros") y agregué arriba la lista de funciones (regla del CLAUDE.md).
- **Cómo se conecta:**
  - Se carga al final de `index.html`, después de los otros scripts.
  - No llama a ninguna función nuestra y no toca datos: solo pone clases.
  - Lo que hace cada clase está en `index-final.css` (parte 4) y en `index-combos.css`.

**`agregarAlCarrito`** (`carritoCombos.js`). Volvió a como era antes de 13.10.
- **Qué hace:** suma un combo armado al carrito.
- **ENTRADA:** `comboArmado`. **SALIDA:** nada (lo agrega a `carritoCombos`, lo guarda y abre "Mi pedido").
- **ANTES (13.10):** después de abrir "Mi pedido", le ponía la clase `contador-salta` al contador.
  **AHORA:** `carritoCombos.push(comboArmado); guardarCarrito(); abrirMiPedido();`, como siempre.
- **Por qué:** el salto ahora lo hace `animaciones-index.js` cada vez que cambia el número, así que también salta al quitar
  un combo. Si quedaban los dos, había dos códigos para lo mismo.
- **Cómo se conecta:** igual que siempre. La llama `confirmarCombo` (de `armarCombo.js`) y ella llama a `guardarCarrito` y
  `abrirMiPedido`.

**El script del final de `index.html`.** Salió el bloque del IntersectionObserver de 13.10, que hacía lo mismo que
`animaciones-index.js`: con los dos, cada `revelar` se miraba dos veces. El resto del script no cambió (el botón de sesión,
el salto del personal a su panel, el menú de sesión, el login en ventana y `cargada`).

**Nombres nuestros que cambiaron en este paso (antes → ahora):**
| Antes (13.10) | Ahora | Archivos |
|---|---|---|
| `contador-salta` (la ponía `agregarAlCarrito`) | `salta` (la pone `animaciones-index.js`) | `index-final.css`, `animaciones-index.js`, `carritoCombos.js` (salió) |
| `<article class="tarjeta-combo">` | `<button class="tarjeta-combo revelar">` (el mismo nombre; ahora la tarjeta es el botón) | `combosCatalogo.js` y los dos CSS |
| `div.tarjeta-combo-boton` con un `button.boton.boton-principal` adentro | `span.tarjeta-combo-boton` (el mismo nombre; ya no es un botón aparte) | `combosCatalogo.js` y los dos CSS |
| `p.tarjeta-combo-precios` | Ya no está: el precio y "por vianda" van directo en `tarjeta-combo-datos` | `combosCatalogo.js` y `index-combos.css` |
| `h3.tarjeta-combo-nombre`, `strong.tarjeta-combo-precio`, `div.tarjeta-combo-datos`, `div.tarjeta-combo-foto` | `span.` con los mismos nombres (dentro de un botón solo puede ir texto y cosas como `span`) | `combosCatalogo.js` |

Revisado en todos los archivos de `frontend/`: no queda ningún `contador-salta` ni `tarjeta-combo-precios`.

#### 13.11.3 Los CSS
**`index-final.css`** (nuevo, se carga último):
| Parte | Qué hace |
|---|---|
| 1. Tarjetas grandes | 3 por fila en compu. Si se agregan combos, se achican solas (mínimo 260 px) y bajan a la fila de abajo. En celu, 1 por fila. Foto arriba en 16/10, nombre de 20 px, precio de 28 px y el botón verde "Armar combo ›" de 48 px |
| 1b. Encabezado en celu | En 400 px o menos se achican los espacios para que entren el logo, "Iniciar Sesión" y "Mi pedido" sin scroll de costado |
| 2. Categorías en celu | Una debajo de la otra, a todo el ancho y de 52 px de alto |
| 3. Platos de "Armar combo" | Nombre y descripción centrados. En el celu (menos de 520 px), el − / + va abajo del texto y no abajo de la foto |
| 4. Animaciones | Solo si no se pidió "sin movimiento": la portada entra de a uno, los `revelar` aparecen subiendo (0,6 s), el contador salta y la respuesta de una pregunta se abre suave |
| 5. Demoras (`--d`) | Las que la referencia pone en el HTML: 0,05 s para las categorías y el texto de los combos, 0,08 s para Dónde estamos y Preguntas, y cada tarjeta 0,08 s más que la anterior |

```css
/* Parte 5: la referencia lo escribe en el HTML (style="--d: .08s"); acá va en el CSS, con los mismos valores */
.lista-categorias.revelar, .zona-combos > p.revelar { --d: .05s; }
.donde-columnas.revelar, .preguntas-columnas.revelar { --d: .08s; }
.grilla-combos > :nth-child(2) { --d: .08s; }    /* la 2.ª tarjeta */
.grilla-combos > :nth-child(3) { --d: .16s; }    /* la 3.ª, y así hasta la 12.ª (.88s) */
.grilla-combos > :nth-child(n+13) { --d: .96s; } /* de la 13.ª en adelante */
```
`:nth-child(3)` quiere decir "el tercer hijo". Por ejemplo, en una categoría con 3 combos, la 1.ª tarjeta aparece enseguida,
la 2.ª a los 0,08 s y la 3.ª a los 0,16 s.

**`index-combos.css`** volvió a la v5. Comparado regla por regla con `estilos.css` (pasado a nuestros nombres), quedan 3
diferencias, las tres a propósito:
1. `body` empieza escondido hasta que carga todo el CSS, y el script del final le pone `cargada`. Es de la Pantalla 1, paso 1:
   evita ver la página "desarmada" un instante.
2. `.portada-imagen` tiene los mismos valores que la v5, pero en una regla sola. En la v5 está junto con `portada__vacia`, que
   nosotros no tenemos.
3. En compu, el resumen de "Finalizar pedido" tiene `pointer-events: none`. Nuestro resumen es un `<details>` que en compu va
   siempre abierto, y esto evita que un clic lo cierre.

Las demás diferencias que marca el script son de escritura: la misma regla con los selectores juntos o separados, con el mismo
resultado (comprobado con las capturas). También hay una regla de la v5 que no usamos (`.zona-combos > p strong`). Se agregó
una regla nuestra, `.grilla-combos .tarjeta-combo-foto img.foto-logo { object-fit: contain; }`: si una foto no carga, aparece
el logo entero y no recortado.

#### 13.11.4 Las fotos livianas
| Archivo | Medida | Peso | ¿La usa la web? |
|---|---|---|---|
| `COMBO MANTENIMIENTO.jpeg` (la original, sin tocar) | 2752 × 1536 | 3,2 MB | No |
| `combo-mantenimiento-1200.jpg` (nueva) | 1200 × 670 | 178 KB | Sí |
| `COMBO SALUDABLE.jpeg` (la original, sin tocar) | 2752 × 1536 | 2,9 MB | No |
| `combo-saludable-1200.jpg` (nueva) | 1200 × 670 | 158 KB | Sí, cuando haya un combo de una categoría "saludable" que no sea del plan Mantenimiento |

Las hice con un script de PowerShell: achica a 1200 px de ancho, mantiene la proporción y guarda en JPEG con calidad 82. Si
el archivo nuevo ya existe, no lo pisa. 1200 px alcanza para la tarjeta más grande en una pantalla de alta densidad, y cada
foto pesa unas 18 veces menos. Las dos constantes de arriba de `combosCatalogo.js` (`FOTO_COMBO_MANTENIMIENTO` y
`FOTO_COMBO_SALUDABLE`) dicen qué archivo se usa.

#### 13.11.5 Cómo se comprobó
Usé un Chrome sin ventana, con un perfil temporal (sin tocar el tuyo), a 1440 y a 390 px. Estas pruebas **no mandan pedidos**:
cortan cualquier envío a `/api/pedidos-combos`.
- **Capturas:** la página, "Armar combo", las tarjetas y "Mi pedido", en compu y en celu. Iguales a las de la carpeta, salvo
  los datos del sistema (13.11.7).
- **Scroll de costado:** 390 de 390 y 1440 de 1440.
- **`revelar`:**
  - Al cargar, `js` está en `<html>` y los 11 esperan. Al bajar aparecen todos (ninguno queda sin aparecer).
  - Al tocar otra categoría, en compu las 3 tarjetas aparecen de a una (0 / 0,08 / 0,16 s).
  - En el celu va una por fila. La primera prueba automática dio ❌ porque miraba sin bajar: la 2.ª y la 3.ª estaban debajo
    de la pantalla y por eso esperaban, que es lo correcto. Una segunda prueba que baja hasta cada tarjeta lo confirmó: cada
    una aparece cuando llega a la pantalla (sí/sí/no → sí/sí/sí).
- **Sin movimiento** (`prefers-reduced-motion: reduce`): sin la clase `js`, 0 escondidos y la portada en 0,01 ms.
- **Ventanas:** "Armar combo" abre (es un `dialog.modal`, con la animación de subir).
- **"✎ Personalizar":** "sin sal (prueba)" agrega su renglón "⚠ sin sal (prueba)" y cuenta "2 de 10".
- **Carrito:**
  - Al agregar, el contador pasa a 1 y salta.
  - "Mi pedido" muestra "PRUEBA Mantenimiento x10 · $ 137.000 · 9 × fideos · 1 × berenjenas rellenas · ⚠ sin sal (prueba) ·
    $ 13.700 c/u · Quitar".
  - "Quitar" lo saca ("Todavía no agregaste combos.").
- **Login en ventana:** con la clave mal aparece "Usuario o contraseña incorrectos" en rojo. Como admin, entra a `/admin.html`.
- **Fotos:** las 3 tarjetas muestran `combo-mantenimiento-1200.jpg`.
- **Consola:** sin errores al cargar ni al usar la página. Solo aparecen los 2 avisos de la prueba de la clave mal, a propósito:
  el 401 de `/api/login` y el `console.error` de `manejarLogin`.
- **Nombres de los 3 lados** (un script que cruza HTML, JS y CSS):
  - No falta en el HTML ningún id que busque el JS.
  - Las únicas clases del CSS sin usar son `tarjeta-combo-destacada` y `tarjeta-combo-sello`, que están listas para "Más
    elegido".
  - `cargada` y `show` también aparecen sin usar, pero no es cierto: las ponen el script del final y `auth.js`, que el script
    no lee.
- **`node --check`** en los 7 JS que se tocaron en la Pantalla 1: bien.

**El pedido de prueba #27** (Paso 6.7), hecho desde la web como un cliente:
| # | Qué se hizo | Qué pasó |
|---|---|---|
| 1 | Tocar la tarjeta "PRUEBA Mantenimiento x10" | Se abre "Armar combo" con ese nombre |
| 2 | 10 × fideos con el + (de la heladera, sin personalizar) | "10 de 10 · ¡Combo completo!" |
| 3 | "Agregar al pedido" | Mi pedido: "PRUEBA Mantenimiento x10 · $ 137.000 · 10 × fideos · $ 13.700 c/u" |
| 4 | "Finalizar pedido" con nombre "PRUEBA –", apellido "NO PREPARAR", Retiro en local, Efectivo y la primera fecha posible | Fecha 20/10/2026 y total $ 137.000 |
| 5 | "Confirmar pedido" | "¡Recibimos tu pedido #27!" |
| 6 | Mirar la heladera con el pedido hecho | fideos: de 40 libres / 11 reservadas a 30 libres / 21 reservadas |
| 7 | Anular el #27 (con el PIN del `.env`, sin mostrarlo) | 200: "Pedido anulado. Volvieron 10 viandas a la heladera." |
| 8 | Mirar la heladera al final | **Igual que al empezar** ✅, y sin errores en la consola |

**Test HELADERA: 40/40** (pedidos de prueba #28 y #29, anulados). La heladera quedó igual: fideos 40 libres / 11 reservadas y
canelones 6 / 0.

#### 13.11.6 Seguridad (qué protege cada cosa)
- **`escHtml` en todo lo que va al `innerHTML` de la tarjeta:** el nombre del combo, el de la categoría (en el título y en el
  `alt` de la foto), el id y la dirección de la foto. La dirección puede venir de la base, porque es la imagen de un plato.
  Protege de **XSS**, que es cuando alguien mete código en un dato para que se ejecute en el navegador del cliente. Por ejemplo,
  un plato llamado `<img src=x onerror=…>` se ve como texto y no se ejecuta.
- **Los precios de la tarjeta son solo para mostrar** ("$ 137.000" y "por vianda"): el total que se cobra lo calcula el
  servidor desde la base. Protege de que alguien **cambie el precio en el navegador**: vería otro número, pero paga el del
  servidor.
- **Lo que se manda al servidor no cambió:** `armarPedido`, `enviarPedido`, el formulario y sus controles quedaron iguales. El
  servidor sigue revisando todo: precios, cantidades, que el combo sume justo y el límite de pedidos por IP.
- **`animaciones-index.js` solo pone clases:** no lee ni manda datos y no usa `innerHTML`, así que no abre ninguna puerta nueva.
- **El pedido de prueba** se anuló con el usuario y el PIN del `.env`, que no se mostraron en ningún lado.

#### 13.11.7 Lo que NO quedó igual a la referencia, y por qué
| Qué | En la referencia | En la nuestra | Por qué |
|---|---|---|---|
| Los nombres | `combo`, `combo__cta`, `hoja`, `chip`, `.contador`… | `tarjeta-combo`, `tarjeta-combo-boton`, `modal`, `boton-categoria`, `.contador-combos`… (tabla 13.11.8) | Decisión 1, por la regla "Nombres claros". Los valores son los mismos |
| Las demoras de las tarjetas | `style="--d: …"` en cada tarjeta, sin tope | En el CSS con `:nth-child`. Iguales hasta la 12.ª; de la 13.ª en adelante, todas 0,96 s | Decisión 2: el CLAUDE.md no deja usar `style=""`. Hoy hay 3 combos por categoría |
| El nombre de la tarjeta | "10 viandas Mantenimiento" ({cantidad} viandas {categoría}) | El nombre del combo que viene de la base ("PRUEBA Mantenimiento x10") | Decisión 3 |
| "Más elegido" | Un combo con borde naranja y la pastilla "Más elegido" | No se marca ninguno (el estilo está listo) | El sistema no tiene un dato para saber cuál es, y no se inventó |
| "Seguir armando" | — | No hace falta | No hay combos a medio armar: si se cierra "Armar combo", lo elegido se pierde (con aviso) |
| Las fotos | El recuadro gris "foto del combo" y un + redondo | Hoy las 3 tarjetas muestran COMBO MANTENIMIENTO | Decisión 4: los 3 combos son del plan MANTENIMIENTO. COMBO SALUDABLE queda lista |
| El logo | Un recuadro con el texto "Fast Good" (`logo__vacio`) | La imagen del logo | Es el logo de la marca |
| Los textos de la portada | "Viandas caseras congeladas, hechas con ingredientes frescos." | Los nuestros: "Viandas caseras y saludables, hechas con ingredientes frescos.", el lugar, el contacto (WhatsApp e Instagram) y "Entregamos a las 48 hs hábiles" | Son los textos de hoy, y el PROMPT dice que se quedan como están |
| El menú de arriba | 3 links (Categorías, Combos y Contacto), con "Categorías" marcado como `activo` | 4 links (también "Preguntas") y ninguno marcado | El link "Preguntas" ya estaba. Marcar el link de la sección que se está viendo es algo nuevo (hay que seguir el scroll) |
| Dónde estamos | Un solo "Cómo llegar", debajo del mapa | Cada sucursal tiene su "Cómo llegar", y el mapa es el recuadro gris | Son los datos de hoy. El mapa de verdad está en "Ideas para después" |
| Preguntas frecuentes | 6 preguntas ("¿Cuánto duran en el freezer?", "¿Cómo se calientan?", "¿Qué días entregan?"…) con la respuesta sin escribir ("[respuesta]") | Las 4 nuestras, con sus respuestas, en `<details>` (se abren aunque no haya JavaScript) | Son las de hoy y el PROMPT dice que se quedan como están. Además, las de la referencia no traen respuesta |
| El pie | De ejemplo | El nuestro, con el copyright | Son datos del sistema |
| Lo nuestro que la referencia no tiene | — | "✎ Personalizar", el login en ventana, la página escondida hasta que carga el CSS (`cargada`) y el resumen fijo de "Finalizar pedido" en compu | Ya existían. Se dejaron como estaban |
| Reglas que no van | `.combo__mas` (el + redondo) y `.logo__vacio` | No están | Nuestra tarjeta no tiene el + y nuestro logo es la imagen |
| Un `!important` | — | En el relleno de "Iniciar Sesión" en celus chicos (400 px o menos) | `auth.js` le escribe estilos en la etiqueta (`style=""`), y solo así se pisan. Lleva el mismo valor que la referencia. Se arregla en la Pantalla 2 (Login) |
| La consola | Sin errores | Sin errores al cargar. Solo los 2 de la prueba de la clave mal | Son a propósito: el servidor contesta 401 y `manejarLogin` lo anota |

#### 13.11.8 Nombres: maqueta → nuestro (las clases de `referencia.html`, `referencia-armar-combo.html`, `index-final.css` y `animaciones-index.js`)
"Igual" quiere decir que la clase ya se llamaba así en la nuestra. "No va" quiere decir que la nuestra no tiene esa parte (está
explicado en 13.11.7). La tabla completa de la v5 (124 clases y 60 ids) está en 13.3.

| Maqueta (diseño final) | Nuestro |
|---|---|
| `acordeon` | igual (`acordeon`) |
| `acordeon__boton` | `pregunta-titulo` (el `<summary>`) |
| `acordeon__item` | `pregunta` |
| `acordeon__pregunta` | no va: las preguntas son `<details>` |
| `acordeon__respuesta` | `pregunta-respuesta` |
| `acordeon__signo` | `pregunta-signo` |
| `activo` | no va: ningún link del menú se marca (haría falta seguir el scroll) |
| `btn` | `boton` |
| `btn--ancho` | `boton-ancho` |
| `btn--grande` | `boton-grande` |
| `btn--pedido` | `boton-mi-pedido` |
| `btn--primario` | `boton-principal` |
| `btn--secundario` | `boton-secundario` |
| `btn--texto` | `#auth-btn-container .login-btn-header` (lo arma auth.js) |
| `btn-cerrar` | `boton-cerrar` |
| `cantidad` | `selector-cantidad` |
| `cantidad__btn` | `boton-cantidad` |
| `cantidad__btn--mas` | `boton-sumar` |
| `cantidad__num` | `numero-cantidad` |
| `categorias` | `lista-categorias` |
| `chip` | `boton-categoria` |
| `chip__marca` | `boton-categoria-tilde` |
| `clave` | `palabra-verde` |
| `combo` | `tarjeta-combo` |
| `combo--destacado` | `tarjeta-combo-destacada` |
| `combo__cta` | `tarjeta-combo-boton` |
| `combo__info` | `tarjeta-combo-datos` |
| `combo__mas` | no va: nuestra tarjeta no tiene el + redondo |
| `combo__media` | `tarjeta-combo-foto` |
| `combo__nombre` | `tarjeta-combo-nombre` |
| `combo__precio` | `tarjeta-combo-precio` |
| `combo__sello` | `tarjeta-combo-sello` |
| `combo__unidad` | `tarjeta-combo-por-vianda` |
| `combos` | `grilla-combos` |
| `combos-zona` | `zona-combos` |
| `contador` | `contador-combos` |
| `contenedor` | igual (`contenedor`) |
| `donde` | `donde-columnas` |
| `donde__datos` | `donde-lista` |
| `donde__item` | `donde-dato` |
| `donde__llegar` | no va: cada sucursal tiene su "Cómo llegar" |
| `donde__mapa` | no hace falta: el recuadro `.mapa` va directo en `.donde-columnas` |
| `elegido` | `plato-elegido` |
| `encabezado` | igual (`encabezado`) |
| `encabezado__acciones` | `encabezado-botones` |
| `encabezado__fila` | `encabezado-fila` |
| `enlace-dato` | `enlace-subrayado` |
| `foto` | igual (`foto`) |
| `hoja` | `modal` |
| `hoja--completa` | `modal-finalizar` ("Finalizar pedido") |
| `hoja--pedido` | `modal-pedido` ("Mi pedido") |
| `hoja__cab` | `modal-encabezado` |
| `hoja__cuerpo` | `modal-contenido` |
| `hoja__pie` | `modal-pie` |
| `hoja__sup` | `modal-categoria` |
| `icono` | igual (`icono`) |
| `icono-wa` | `icono` |
| `js` | igual (`js`) |
| `logo` | igual (`logo`) |
| `logo--pie` | no hace falta (no tenía estilo) |
| `logo__vacio` | no va: el logo es la imagen |
| `mapa` | igual (`mapa`) |
| `nav` | `menu-principal` |
| `pasos` | igual (`pasos`) |
| `pasos-franja` | `franja-pasos` |
| `pasos__num` | `pasos-numero` |
| `pie` | `pie-de-pagina` |
| `pie__col` | `pie-columna` |
| `pie__grid` | `pie-columnas` |
| `pie__marca` | `pie-marca` |
| `plato` | igual (`plato`) |
| `plato__info` | `plato-datos` |
| `platos` | `lista-platos` |
| `portada` | igual (`portada`) |
| `portada__acciones` | `portada-botones` |
| `portada__acento` | `palabra-verde` |
| `portada__bajada` | `portada-subtitulo` |
| `portada__contacto` | `portada-contacto` |
| `portada__dato` | `combos-desde` |
| `portada__etiqueta` | `portada-etiqueta` |
| `portada__foto` | `portada-foto` |
| `portada__grid` | `portada-columnas` |
| `portada__lugar` | `portada-lugar` |
| `portada__media` | `portada-marco` |
| `portada__texto` | `portada-texto` |
| `portada__vacia` | no va: la portada tiene foto |
| `preguntas` | `preguntas-columnas` |
| `progreso` | igual (`progreso`) |
| `progreso__barra` | `progreso-barra` |
| `progreso__texto` | `progreso-texto` |
| `revelar` | igual (`revelar`) |
| `salta` | igual (`salta`) |
| `seccion` | igual (`seccion`) |
| `seccion--tinte` | `seccion-fondo-verde` |
| `titulo-seccion` | igual (`titulo-seccion`) |
| `visible` | igual (`visible`) |
| `wa-flotante` | `whatsapp-flotante` |

---

## 14. Limpieza del código viejo y el index con un solo CSS (17/10)
**Qué se pidió:** borrar solo lo que se demuestra que no se usa (plan del Paso 0, aprobado), sin cambiar cómo funciona ni
cómo se ve. Además, que el index quede con **1 HTML y 1 CSS**: `index.html` + `index.css`. Nada de SQL y sin commit.
Todo lo borrado está en git (commit `ff20b99`), así que se puede recuperar.

**Tus decisiones sobre lo dudoso (17/10):**
| # | Lo dudoso | Decisión |
|---|---|---|
| 1 | La carpeta de referencia `docs/diseno-final-index/` | Borrarla y corregir los comentarios que la nombran |
| 2 | Las fotos originales `COMBO MANTENIMIENTO.jpeg` y `COMBO SALUDABLE.jpeg` | Borrarlas: la web usa las versiones `-1200` |
| 3 | El estilo de "Más elegido" | Dejarlo |
| 4 | El carrito escondido de `admin.html` | Sacarlo, y después borrar `carrito.css` y el `index.css` viejo si quedan sin uso |
| 5 | Las fotos de los platos desactivados | Dejarlas |

### 14.1 Cómo se demostró que algo no se usa
- **El nombre, en todo el repo:**
  - todos los HTML, JS y CSS, también los `url()` de los CSS y los `onclick="…"`;
  - `server.js`: `express.static`, la ruta `/` y las demás rutas;
  - `tests/` y el menú del panel (`roles.js` y `adminSidebar.js`).
  Los comentarios no cuentan: un nombre que solo aparece en un comentario no es un uso.
- **Páginas en uso:** las 12 del menú (`roles.js`), `index.html` y `login.html`. Lo que solo usaban `index-viejo.html` y
  `formulario.html` cuenta como "sin uso".
- **Nombres que el código arma pegando texto:** se revisaron uno por uno y esas reglas **se dejaron**.
  - Ej: `'aviso-hecho aviso-hecho--' + resultado.tipo` arma `aviso-hecho--ok`, `--aviso`, `--info` y `--error`.
  - Al revés: `` `plato${claseElegido}` `` solo arma `plato` y `plato-elegido`, nunca `plato-card`.
- **Funciones en cadena:** si A solo la llama B, y a B no la llama nadie, se van las dos.
  Ej: `abrirSidebar` solo la llamaba `openSidebar`, y a `openSidebar` no la llamaba nadie.
- **Imágenes:** además, la historia de git y las fotos de los productos de la base, leídas con las rutas GET de la app
  (sin SQL). Las fotos de los 4 platos activos están en Supabase Storage, no en la carpeta del front.

### 14.2 Archivos borrados
| Archivo | Por qué no se usaba |
|---|---|
| `index-viejo.html` | Nadie lo abre: no está en el menú, y `/` manda a `index.html` |
| `pages/formulario.html`, `src/css/formulario.css`, `src/js/formulario.js` | Al formulario viejo solo lo abría `carrito.js`, que era del index viejo |
| `src/js/index.js`, `carrito.js`, `animations.js` | Solo los cargaba `index-viejo.html` |
| `src/js/funciones.js` | Solo lo cargaban `index-viejo.html` y `formulario.html` |
| `src/css/carrito.css` y el `src/css/index.css` viejo | Solo los cargaba `admin.html`, para el carrito escondido. Sin el carrito, no tocaban nada de esa página (14.5) |
| `src/css/index-combos.css` e `index-final.css` | Se unieron en el `index.css` nuevo (14.6) |
| 27 imágenes (52,9 MB) | `vianda 1.png`, `sinGluten.png`, `pastel.png` y `combo.png`: solo `index-viejo.html`. `bannerpro4.png`: solo la regla `.hero`, sin uso. `1.webp` a `7.webp`, `barbacoa`, `hamburguesaLenteja`, `lasagnaCarne`, `milaNapo`, `pastelCalabaza`, `planDescenso`, `planVeggie` y `polloDisco`: los usaba una página que se borró en abril (commit `568afd5`), o nunca nadie. `bannerpro2`, `bannerrrrrrrr` y `medinabanner` (3): ningún código. Las 2 fotos originales de los combos: decisión 2 |
| `docs/diseno-final-index/` (10 archivos, 0,8 MB) | Era solo de referencia (decisión 1) |

En la carpeta `img/` quedan 6 imágenes, todas en uso: `logo.webp`, las 3 de `viandaprincipal2` y las 2 `combo-…-1200.jpg`.
El front pasó de 100 archivos a 62.

### 14.3 Funciones borradas (8)
| Función | Archivo | Qué hacía (entrada → salida) | Por qué se fue |
|---|---|---|---|
| `verificarAutenticacion()` | `auth.js` | nada → si no había `usuario_id` guardado, mandaba a `login.html` | Nadie la llamaba. Lo que protege las pantallas es `guard.js` |
| `obtenerRolUsuario()` | `auth.js` | nada → el rol guardado (un número) o `null` | Solo la llamaba `esAdmin` |
| `esAdmin()` | `auth.js` | nada → `true` si el rol era 1 | Nadie la llamaba |
| `armarResumenReceta(insumos)` | `generarReceta.js` | la lista de insumos → un texto como "harina 300 g, huevos 2 u … (+2)" | Nadie la llamaba (y su clase `.receta-resumen` tampoco tenía uso) |
| `abrirSidebar()`, `cerrarSidebar()` | `global.js` | nada → abrían o cerraban el menú lateral viejo (`#sidebar`) | Solo las llamaban `openSidebar` y `closeSidebar`, y el `#sidebar` ya no existe en ninguna página |
| `openSidebar()`, `closeSidebar()` | `global.js` | Lo mismo, con nombre en inglés | Nadie las llamaba |

- **Conexiones:** ninguna, porque nadie las llamaba.
- **Lo que sigue en uso en `global.js`:** las funciones de los modales. `admin.html` usa `openModal`, `closeModal`,
  `openContactModal` y `closeContactModal` (Contacto y Sucursales), y esas llaman a `abrirModalSucursales`,
  `cerrarModalSucursales`, `abrirModalContacto` y `cerrarModalContacto`.
- `auth.js`, `global.js` y `generarReceta.js` no tienen una lista de funciones arriba, así que no hubo renglón que sacar. Al
  encabezado de `global.js` sí se le sacó "Sidebar".
- **Después de borrar:** el script encuentra 281 funciones y todas se usan.

### 14.4 Reglas de CSS borradas
| Dónde | Reglas | Quién las usaba |
|---|---|---|
| `global.css` | `.grid` (×2), `.card.animate-hidden`, `.card.revealed`, `#cart-count.cart-pulse` con su `@keyframes cart-pulse-anim`, `.close-btn` y `.sidebar-nav` | El index viejo (`index-viejo.html`, `animations.js` y `carrito.js`) |
| `cocinero.css` | `.badge-contador.badge-activo`, `ul.platos-list` (×2) y `.fila-saliendo` | Nadie |
| `ConsultarPedidos.css` | `ul.ingredientes-list`, `.badge-status`, `.bg-reg`, `.bg-prep` y `.bg-listo` | Nadie (no hay ningún `'bg-' + algo`) |
| `stock.css` | `.btn-merma` y `.modal-tabs` (×2) | Nadie |
| `generarReceta.css` | `.receta-resumen` | Nadie |
| El `<style>` de `admin.html` | `.btn-export2` (×2), `.kpi-card.alerta.alerta-activa .kpi-valor` y `.kpi-valor.negativo` | Nadie (`reportes.js` nunca pone esas clases) |
| `carrito.css` y el `index.css` viejo | Los dos enteros (14.5) | El carrito escondido de `admin.html` y el index viejo |

- **Se dejaron a propósito:**
  - "Más elegido" (`tarjeta-combo-destacada` y `tarjeta-combo-sello`), por la decisión 3;
  - las clases que arma el código: `aviso-hecho--…`, `aviso-cocina--…`, `pend-…`, `estado-3/4`, `badge-estado-…` y
    `detalle-…`.
- **Comprobado después:** volví a correr la búsqueda. Las únicas reglas sin uso que quedan son las 3 de "Más elegido".

### 14.5 `admin.html` sin el carrito escondido
| | ANTES | AHORA |
|---|---|---|
| El carrito "🛒 Cambios Pendientes" | Un panel escondido afuera de la pantalla, a la derecha (`right: -380px`), con "Guardar" y "Cerrar". "Cerrar" llamaba a `cerrarCarrito()`, que en esta página no existe: era de `carrito.js`, que `admin.html` no carga | No está |
| Los CSS que carga | `global.css`, `carrito.css`, el `index.css` del index viejo y `adminSidebar.css` | `global.css` y `adminSidebar.css` |
| Cómo se ve | Una sombra casi invisible en el borde derecho: era la sombra del carrito escondido, que asomaba (hasta 22 de 255 en el celu y 2 de 255 en la compu) | Lo mismo, sin esa sombra |

- **Por qué:** sin el carrito, ninguna regla de `carrito.css` ni del `index.css` viejo tocaba algo de la página. Lo que
  quedaba del `index.css` viejo (`.section > p[style]` y `.panel-vacio`) usa clases que `admin.html` no tiene.
- **Comprobado:** En Chrome sin ventana, a 1440 y a 390 px, "antes" contra "después":
  - **Lo único distinto** son los 5 elementos del carrito (el `div#carrito`, su título, su lista y los 2 botones) y esa
    sombra del borde.
  - **Todo lo demás está idéntico** (posición, tamaño y estilos), también con Contacto y Sucursales abiertos.
  - **Sigue andando igual:** Contacto y Sucursales abren y cierran, los números dan "28 · 14% · Bella Vista" y cargan los 4
    gráficos.

### 14.6 El index con 1 HTML y 1 CSS
| | ANTES | AHORA |
|---|---|---|
| CSS del index | `index-combos.css` (747 renglones) e `index-final.css` (101), dos `<link>` | `index.css` (859 renglones), un solo `<link>` |
| Qué hay adentro | — | **Parte 1** = lo que era `index-combos.css`. **Parte 2** = lo que era `index-final.css`. Mismos valores y mismo orden, así que gana lo mismo que antes. Solo cambian el encabezado y 3 comentarios que nombraban `index-final.css` |
| La letra Figtree | Su `<link>` a Google | Igual, su `<link>` a Google: no es un archivo nuestro |
| ¿Otra pantalla carga `index.css`? | — | No. `login.html` muestra el index de fondo en un `<iframe>`: es la página entera, no la hoja |

- **Reglas compartidas para copiar:** no hubo, porque el index nunca cargó `global.css` ni otro CSS compartido.
- **Comprobado que son las mismas reglas:** sin comentarios ni espacios, `index.css` es idéntico a `index-combos.css` +
  `index-final.css` del commit `ff20b99`.
- **Lo que se probó y se descartó:** traer la letra con `@import` adentro de `index.css`, para que la página pidiera una
  sola hoja.
  - Con `@import`, la hoja de la letra llega más tarde.
  - El subtítulo de la portada tiene `max-width: 30ch`. `ch` es el ancho del "0" en la letra que se está usando, y el
    navegador lo midió con la letra de reserva (Arial): 333 px en vez de 385,8 px.
  - Resultado: cortaba en otro lugar ("…hechas / con ingredientes frescos.") y no se veía igual.
  - Por eso la letra queda en su `<link>`, con un comentario en `index.html` que lo explica.

### 14.7 Comentarios corregidos (no cambian nada)
| Archivo | Antes | Ahora |
|---|---|---|
| `animaciones-index.js` | "Es docs/diseno-final-index/animaciones-index.js tal cual" | "Es el animaciones-index.js del diseño final tal cual (su carpeta de referencia se borró el 17/10: está en git)" + "Lo que hace cada clase está en index.css" |
| `combosCatalogo.js` | "index-final.css pone la foto arriba", "…está en index-final.css" y las fotos originales "quedan sin tocar" | "index.css (parte 2)…" y "las originales se borraron el 17/10: están en git" |
| `fechas.js` | "Lo usan formulario.js … y ListarPedidos.js" | "Lo usan pedidoCombos.js …, ListarPedidos.js …, otras pantallas del panel y server.js" |
| `pedidoCombos.js` (2) | "el formulario viejo (pages/formulario.html + formulario.js)" | Lo mismo + "borrados el 17/10" |
| `global.css` (2) | "GRID + TARJETAS" y "animations.js aplica el reveal en index.html" | "TARJETAS" y "visibles por defecto" |
| `index.html` | Los comentarios de los dos `<link>` (nombraban `docs/diseno-index` y `docs/diseno-final-index`) | Uno solo: "UNA sola hoja, index.css" + el de la letra |

`server.js` no se tocó (es solo lectura): dos comentarios todavía dicen `index-combos.html` (líneas 554 y 912) y uno
`index.js` (línea 724).

### 14.8 Cómo se comprobó
Las capturas se hicieron con un Chrome sin ventana y un perfil temporal (sin tocar el tuyo). El "antes" se armó
sirviéndole al navegador las versiones del commit `ff20b99` de cada archivo que cambió o se borró, sin tocar el repo. Las
tandas corrieron una atrás de otra y esperando a que llegaran los datos.

En una primera tanda, con las 4 corridas en paralelo, algunas pantallas todavía no tenían sus datos, y el subtítulo de la
portada salió distinto por el `@import` (ver 14.6). Esa tanda se descartó.

| Prueba | Cómo | Resultado |
|---|---|---|
| El index se ve igual | Recorrido de 15 pasos a 1440 y a 390 px: portada, página entera, Mi pedido, Armar combo (vacío, personalizando, 8 de 10, completo, "¿Salir?"), Mi pedido con el combo, Finalizar (vacío, con errores, retiro + transferencia, resumen abierto en el celu), la confirmación dibujada con datos de mentira y el login en ventana. En cada paso se guardó la captura y la posición, el tamaño y unos 70 estilos de cada elemento | **1440:** igual. Hubo 2 capturas con diferencias invisibles (en una foto de plato, como mucho 11 tonos de 255; en otra, 4 píxeles) y un paso con las respuestas de Preguntas en otro momento de su animación (abajo de la pantalla, no sale en la captura). **390:** posiciones y estilos idénticos en los 14 pasos. En 2 o 3 capturas de "Armar combo" el texto sale 1 píxel más arriba: la ventana queda en y = 351,23 y Chrome redondea distinto al dibujarla. Medido: todo está en el mismo lugar al 1/64 de píxel, y las capturas que cambian no son siempre las mismas |
| Una sola hoja | Lo que pide la página al cargar | Antes pedía `index-combos.css` + `index-final.css`; ahora pide `index.css` (más la hoja de la letra de Google) |
| El panel se ve igual | Las 12 pantallas del menú y `login.html`, a 1440 y a 390 px | Las 11 pantallas que no son `admin.html`: **idénticas píxel por píxel** y en estilos. `admin.html`: lo de 14.5. `login.html`: diferencias de 3 tonos de 255 como mucho en el index que muestra de fondo (no se ven) |
| Sin errores ni imágenes rotas | La consola, los pedidos que fallan (400 o más) y las imágenes con `src` que no cargan, en las 14 páginas, antes y después | Ninguno, salvo el 404 de `/favicon.ico`, igual que antes (14.10) |
| Lo que no se usa | Los scripts del Paso 0, otra vez | 281 funciones, todas en uso. Las únicas reglas sin uso son las 3 de "Más elegido". No queda ningún archivo del front sin uso |
| `node --check` | Los 29 JS | Bien |
| Pedido de prueba | Desde la web: "PRUEBA Mantenimiento x10" → 10 × fideos → Mi pedido → Finalizar ("PRUEBA – NO PREPARAR", retiro, efectivo, sin personalizados) → Confirmar → anular (con el PIN del `.env`, sin mostrarlo) | **#30.** Fideos: de 40 libres / 11 reservadas a 30 / 21. "Pedido anulado. Volvieron 10 viandas a la heladera." La heladera quedó igual y no hubo errores en la consola |
| Test HELADERA | `node tests/test_e2e.js heladera` | **40/40** (pedidos de prueba #31 y #32, anulados; la heladera quedó igual) |

### 14.9 Seguridad (qué protege)
- **Menos código viejo, menos lugares para un error o un ataque.**
  - Se fue el formulario viejo (`formulario.html` + `formulario.js`): mandaba pedidos a `POST /api/pedidos`. Esa ruta
    sigue en el servidor, con su límite por IP y sus controles, y la usan los tests.
  - Se fue el carrito viejo (`carrito.js`), que guardaba precios en el navegador.
  - Ninguno de los dos se podía abrir desde la web, pero estaban publicados: cualquiera los podía pedir por su dirección.
- **El botón "Cerrar" de `admin.html`** llamaba a una función que no existía en esa página: ya no está.
- **No se agregó código nuevo.** Lo que se manda al servidor quedó igual, y `escHtml` sigue igual en todos lados.
- **No se ejecutó nada en la base.** Las fotos de los productos se leyeron con las rutas GET de la app.

### 14.10 Lo que quedó sin tocar (para después)
- ~~**`favicon.ico` da 404:** 10 pantallas del panel no tienen `<link rel="icon">`, así que el navegador pide `/favicon.ico`
  y no existe.~~ → **Arreglado el 17/10 (14.11).**
- **`server.js`:** los comentarios viejos de 14.7.
- **`<style>` adentro del HTML:** `admin.html` y varias pantallas del panel lo tienen (regla del CLAUDE.md). Se pasa a su
  `.css` cuando se llegue a cada pantalla.
- **`docs/diseno-index-v4/`:** es una carpeta vacía y no está en git.
- **Historia:** las secciones viejas de este informe (13.x) siguen nombrando `index-combos.css`, `index-final.css` y
  `docs/diseno-final-index/`. Es lo que se hizo en ese momento.

### 14.11 El ícono en las pantallas del panel (17/10)
**Qué se pidió:** agregar el renglón del ícono a las pantallas que no lo tenían, con el mismo logo que usa el index. Nada más.

| | ANTES | AHORA |
|---|---|---|
| 10 pantallas del panel: `AsignarCocinero`, `ConsultarPedidos`, `Envios`, `MovimientosStock`, `MovimientosStockNuevo`, `combos`, `generarReceta`, `gestionUsuarios`, `heladera` y `stock` | Sin `<link rel="icon">`. El navegador pedía `/favicon.ico`, que no existe, y daba **404** | Un renglón abajo del `<title>`, igual al de `cocinero.html`: `<link rel="icon" href="../src/assets/img/logo.webp" type="image/webp"/>` |

- **Por qué así:** es el mismo logo que ya usan el index, el login, `admin.html` y Tareas de Cocina. Desde `/pages/` la
  dirección empieza con `../`.
- **Qué cambia:** solo el ícono de la pestaña del navegador; la página se ve igual. Ahora las 14 páginas tienen su ícono.
- **Cómo se agregó:** con un script que respeta los saltos de línea de Windows de esos archivos y que no toca una página
  si no tiene un solo `<title>` o si ya tiene ícono. En git, cada página cambia en 1 renglón.
- **Comprobado** (Chrome sin ventana, a 1440 y a 390 px):
  - las 12 pantallas del menú y `login.html`: el ícono responde 200 en todas, y no hay ningún error ni ningún 404;
  - el index: pide `index.css` y el ícono responde 200. Abrí "Armar combo" en cada categoría, "Mi pedido" y el login:
    25 pedidos de red, ningún error, ningún 404 y ninguna imagen rota.
- **Aviso (no es por este cambio):** durante la prueba cambiaron los combos de la base. Aparecieron "Combo semanal" (#4 de
  5 viandas y #5 de 10, plan PROMO SEMANAL, categoría "Combos Saludables", que ahora sale primera), y ya no aparece
  "Prueba no usar". Por la regla de las fotos (13.11), esos combos nuevos muestran la foto "combo saludable".

## 15. Pantalla 1: el index final de `diseno-index-final2/` — celu con flujo y compu con tarjeta nueva (17/10)
**Qué se pidió** (`diseno-index-final2/PROMPT.md`, "al pie de la letra"):
- que el index quede **igualito** a las referencias, en el celu (390 px) y en la compu (1440 px), con las animaciones;
- que siga siendo **1 HTML + 1 CSS**, con `index.css` ordenado: perillas arriba y secciones comentadas;
- sin cambiar lo que se manda al servidor y sin inventar datos;
- cambios de JS chicos y explicados, y sin commit.

**Tus decisiones (17/10):**
| # | Tema | Decisión |
|---|---|---|
| 1 | "Iniciar sesión" en el celu | A: chiquito, al lado de "Mi pedido" |
| 2 | Insignias de la portada del celu | "✓ Caseras", "⚡ Listas en 5 min" y "🛵 Entregas en 48 hs hábiles" |
| 3 | "Cómo funciona" | A: los textos de la referencia (🥗 Elegís · ✋ Armás · 🛵 Recibís) |
| 4 | La fecha de entrega en el celu | A: los próximos 5 días como botones, con el primero ya elegido |
| 5 | Orden de los campos de "Finalizar pedido" | A: el de hoy, con el estilo de la referencia |
| 6 | "✨ Armalo por mí" | B: también en compu |
| 7 | Una parada | Después del CSS ordenado y la compu, capturas a 1440 px. Respuesta: "OK a la compu" |
| — | "HASTA X% OFF" y "X% OFF" | No van: se sacaron del todo, también el estilo |
| — | Datos que faltaban | 3 columnas nuevas con SQL, que corriste vos: "Más elegido", y la foto y la frase de la categoría |
| — | Panel para cargar esos datos | No por ahora: queda pendiente. Se cargan desde Supabase |
| — | La compu, después de ver las capturas | Igual que en el celu, **primero las categorías**. Una tarjeta por categoría, con la misma plantilla de la tarjeta de combo. Al tocarla se ven sus combos, con "‹ Todas las categorías" para volver. La tarjeta de categoría se hace **una sola vez** (una función y un HTML) y el celu usa la misma |

### 15.1 Qué archivos cambiaron
| Archivo | Qué cambió |
|---|---|
| `sql/combos_categorias_extra.sql` (nuevo) | Las 3 columnas nuevas (15.2). Lo corriste vos |
| `server.js` | 5 rutas GET mandan los datos nuevos (15.3). Solo lectura |
| `frontend/index.html` | Las cosas nuevas de la pantalla (15.5 y 15.6), sin renombrar nada: <br>· categorías y zona de combos; <br>· "Cómo funciona" y las insignias del celu; <br>· el encabezado y el resumen del armado en el celu; <br>· "✨ Armalo por mí"; <br>· el título, los íconos, la ayuda del retiro, los días y el total del botón de "Finalizar pedido" |
| `frontend/src/css/index.css` | Ordenado (15.4), la compu (15.5), el celu (15.6) y las animaciones (15.8). Pasó de 859 a 1236 renglones |
| `combosCatalogo.js` | La tarjeta de categoría, la foto compartida y el ir y volver entre categorías y combos |
| `armarCombo.js` | "Armalo por mí", y el encabezado y los textos del celu |
| `carritoCombos.js` | En el celu, "Mandar pedido" va directo a "Finalizar pedido" |
| `pedidoCombos.js` | Los días como botones, el total adentro del botón y volver a las categorías después de la confirmación |

No cambió: lo que se manda al servidor (`armarPedido`, `validarFormulario`, `enviarPedido`), `fechas.js`, `auth.js`,
`animaciones-index.js`, `tests/` ni las otras pantallas.

### 15.2 SQL: `sql/combos_categorias_extra.sql` (nuevo; lo corriste el 17/10 y salieron los 3 renglones)
| Tabla | Columna nueva | Tipo | Para qué | Si está vacía |
|---|---|---|---|---|
| `combos` | `destacado` | sí / no, obligatoria, empieza en "no" (`boolean not null default false`) | "Más elegido": pastilla naranja y botón naranja | `false` → sin pastilla |
| `categorias` | `imagen` | texto, puede ir vacía | la foto de la tarjeta de la categoría | la foto de su primer combo, con la regla de siempre |
| `categorias` | `descripcion` | texto, puede ir vacía | la frase debajo del nombre | sin frase |

- **Cómo está hecho:**
  - solo agrega (`add column if not exists`), todo junto (`begin … commit`), con un comentario en cada renglón y sin `$$`;
  - el RLS queda como estaba;
  - `notify pgrst`, para que la API vea las columnas enseguida;
  - al final, una consulta que solo lee y muestra las 3 columnas.
- **Hoy en la base:** los 4 combos tienen `destacado` en "no", y las 4 categorías no tienen foto ni frase. Por eso la web
  muestra las fotos con la regla de siempre y ninguna pastilla.

### 15.3 `server.js`: las rutas GET mandan los datos nuevos
Solo lectura, con los mismos permisos y los mismos controles.

| Ruta | Quién la usa | Antes | Ahora |
|---|---|---|---|
| `GET /api/v1/combos` | la web (pública, con su límite de 60 por minuto por IP) | cada combo: `id`, `nombre`, `cantidad`, `precio`, `plan`, `categoria: { id, nombre }` y `menu` | además `destacado` (`true`/`false`) y `categoria: { id, nombre, imagen, descripcion }` |
| `GET /api/v1/catalogo` | pública | categorías con `id` y `nombre` | además `imagen` y `descripcion` |
| `GET /api/v1/categorias` | pública | `id, nombre` | `id, nombre, imagen, descripcion` |
| `GET /api/combos` | el panel (`requireAuth` + `requireRol(6, 5)`) | — | además `destacado` |
| `GET /api/combos/:id/menu` | el panel (`requireAuth` + `requireRol(6, 5)`) | `id, nombre, cantidad` | además `destacado` |

- **`destacado: combo.destacado === true`:** si la columna viniera vacía o con otra cosa, sale `false`.
- **Comprobado** en el servidor de prueba:
  - las rutas del panel sin sesión siguen dando 401;
  - con un id que no es un número, 400, como antes.
- **⚠ Hay que reiniciar tu servidor del puerto 3000** para que mande estos datos. Sin reiniciar, la web anda igual: toma
  "sin foto, sin frase, sin destacado".

### 15.4 `index.css` ordenado
- **Arriba, las perillas:** un bloque `:root`, cada perilla con su comentario en criollo ("si la subís, …").
  - Tamaños: los títulos, los botones y los espacios.
  - Las tarjetas: el ancho mínimo (el de combo y el de categoría), la separación, lo redondeado, la forma de la foto, el
    nombre, el precio y el alto de "¡Lo quiero!".
  - Velocidades: aparecer al bajar, la demora entre tarjetas, las ventanas, las pantallas y la hoja del celu, el latido y
    el brillo.
  - Los colores.
  - Debajo, las perillas que cambian en el celu.
- **Después, 12 secciones comentadas:**
  - 0 Base · 1 Encabezado · 2 Portada · 3 Categorías · 4 Tarjeta de combo · 5 Pantallas del celu;
  - 6 Armar combo · 7 Mi pedido y Finalizar · 8 Dónde estamos · 9 Preguntas · 10 Pie · 11 Animaciones.
  - Lo del celu de cada parte va al final de su sección, en un bloque "Celu (como la referencia)". Así le gana a lo de
    arriba sin trucos.
- **Comprobado que ordenarlo no cambió nada** (antes de los cambios de diseño):
  - sin comentarios ni espacios, las reglas eran las mismas: solo cambiaron números por su perilla, y se juntaron reglas
    iguales;
  - el recorrido de 15 pasos, a 1440 y a 390 px, dio los mismos estilos, salvo dos "ruidos" que ya conocíamos (14.6 y
    14.8): el subtítulo de la portada medido con la letra de reserva, y una respuesta de Preguntas a mitad de su animación.

### 15.5 Compu (768 px o más)
| | ANTES (git) | AHORA |
|---|---|---|
| Sección Categorías | Fondo verde clarito y título "Categorías" | Fondo blanco y "Elegí tu **categoría**". Los títulos de sección quedan un poco más chicos, como la referencia (36 px en vez de 40) |
| Categorías | Una pastilla por categoría y, debajo, los combos de la elegida | **Una tarjeta por categoría**, de a 3 por fila como máximo (ninguna más angosta que 340 px; con 1 o 2 categorías, cada una mide lo mismo que con 3). Lleva: <br>· la foto, con el nombre encima en blanco (y la frase, si tiene); <br>· "N combos"; <br>· abajo, "DESDE", el precio del combo más barato y "o $ … por vianda" (el menor); <br>· "Ver combos →", con el estilo de "¡Lo quiero!" |
| Al tocar una categoría | Se pintaba la pastilla y cambiaban los combos de abajo | Las categorías se esconden y en el mismo lugar aparecen sus combos, con "‹ Todas las categorías" arriba para volver. El "atrás" del navegador también vuelve |
| Tarjeta de combo | Foto arriba, nombre, precio, "$ … por vianda" y "Armar combo ›" | Como la referencia: <br>· foto grande con el nombre en blanco encima y "N viandas"; <br>· "Más elegido" solo si el combo es destacado; <br>· abajo, el precio grande y "$ … por vianda"; <br>· "¡Lo quiero! →": pastilla verde con degradé, la flecha en un círculo blanco, late y la cruza un brillo. <br>El destacado va en naranja |
| Armar combo | — | Arriba de los platos, "✨ Armalo por mí" (decisión 6B). Lo demás, igual |
| Lo demás | — | Igual. Comparado elemento por elemento contra la compu que aprobaste: el encabezado, la portada, Dónde estamos, Preguntas, el pie, Armar, Mi pedido, Finalizar y el login quedaron idénticos |

- **Los links "Combos"** del menú y del pie llevaban a la zona de combos (`#combos`). Esa zona ahora está escondida hasta
  que se toca una categoría, así que ahora llevan a `#categorias`.
- **Con 2 combos** (cada categoría hoy tiene 2), las tarjetas de combo miden lo mismo que con 3. Es lo que ya estaba
  aprobado.

### 15.6 Celu (menos de 768 px): el flujo de la referencia
| Pantalla | Cómo es ahora | Cómo se hizo |
|---|---|---|
| Encabezado | Una fila blanca de 58 px: el logo, "Iniciar Sesión" chiquito y "Mi pedido" (decisión 1A). El menú no se ve: a cada parte se llega bajando | CSS |
| Portada | Compacta: <br>· el lugar en una pastilla; <br>· "Fast Good" de 44 px; <br>· la bajada; <br>· las insignias (decisión 2). <br>No van la foto, "Pedir ahora", el contacto ni los 3 pasos | CSS. Las insignias se agregaron al HTML: en compu no se ven |
| Categorías | "ELEGÍ TU CATEGORÍA" como rótulo, con una raya hasta el borde, y debajo **las mismas tarjetas de categoría** de compu, una por fila. Solo cambia el tamaño: nombre de 19 px, precio de 22 px y foto más apaisada. Abajo, "Cómo funciona" (decisión 3) | CSS. "Cómo funciona" se agregó al HTML: en compu no se ve |
| Combos de la categoría | "Ver combos →" abre una pantalla blanca que **entra desde la derecha**. Tiene: <br>· una barra con "‹" y el nombre de la categoría; <br>· "¿CUÁNTAS VIANDAS?"; <br>· las tarjetas de combo, con "¡Lo quiero!". <br>La "‹" o el "atrás" del celu vuelven a las categorías | Es **la misma zona de combos** de compu: el CSS la pone encima de toda la página (`position: fixed`) |
| Armar | Pantalla completa que también entra desde la derecha: <br>· arriba, "‹ Armá tu combo"; <br>· un recuadro verde clarito con la foto, el nombre y el precio; <br>· "ELEGÍ TUS 10 PLATOS · PODÉS REPETIR" y "✨ Armalo por mí"; <br>· los platos: foto chica · nombre · − N +; <br>· fija abajo, la barra con "Tus platos · 2 de 10", el progreso y "Elegí 8 platos más". <br>Con el combo completo dice "¡Listo! Ya podés mandarlo" y "Mandar pedido · $ 137.000" | Es la **misma ventana** de compu (`#modal-combo`) con otro CSS. El progreso pasa abajo de los platos con `order` |
| Mandar pedido | Agrega el combo y abre "Finalizar pedido" directo. "Mi pedido" sigue en el encabezado, para sumar otro combo | `agregarAlCarrito` (15.7) |
| Datos | Una **hoja que sube desde abajo**, con la rayita gris arriba y el título "¿Cómo te lo **damos**?": <br>· los mismos campos y en el mismo orden (decisión 5A), con rótulos chicos y casilleros de 50 px; <br>· Envío/Retiro y Efectivo/Transferencia como **botones partidos**; con Retiro, debajo dice dónde se retira; <br>· la fecha: los próximos **5 días hábiles como botones**, con el primero elegido (decisión 4A); <br>· "Confirmar pedido · $ 137.000", a todo el ancho | Es la **misma ventana** de compu. Los radios de siempre siguen adentro de los botones partidos. Los días escriben la fecha en el campo de fecha de siempre (15.7) |
| ¡Pedido listo! | El mensaje de hoy ("¡Recibimos tu pedido #N!", la fecha de entrega, la entrega, el pago, el resumen y WhatsApp), con la ✓ grande que **aparece con rebote**. Detrás quedan otra vez las categorías | CSS, y `volverACategorias` |

### 15.7 Las funciones: antes y ahora
Ejemplos con «PRUEBA Mantenimiento x10» ($ 137.000, plan MANTENIMIENTO, categoría "Viandas Saludables"; su menú:
berenjenas rellenas, canelones y fideos).

**`combosCatalogo.js`** (de 3 a 5 funciones)

**`cargarCombos(mantenerCategoria)`** — trae los combos y dibuja las categorías.
- ENTRADA: `false` al abrir la página, `true` al recargar porque no alcanzaron las viandas. SALIDA: nada (dibuja).
- **Antes:** arrancaba mostrando la primera categoría, con sus combos.
- **Ahora:** arranca en las categorías, con ninguna abierta (`categoriaElegida = null`). Al recargar, se queda en la que
  estaba abierta si todavía tiene combos. Los avisos ("Cargando combos...", "No pudimos cargar los combos…") van donde están
  las categorías, porque los combos arrancan escondidos.
```js
const sigueLaElegida = mantenerCategoria && combosDisponibles.some(combo => combo.categoria.id === categoriaElegida);
categoriaElegida = sigueLaElegida ? categoriaElegida : null;   // si no, ninguna: las categorías
```
- **Se conecta:** la llaman el arranque de la página y `confirmarPedido` (con "No quedan suficientes viandas…"). Llama a
  `GET /api/v1/combos`, a `renderizarCategorias` y a `renderizarCombos`.

**`armarFotoTarjeta(combo, fotoPropia, textoAlternativo)`** — NUEVA. Arma el HTML de la foto de una tarjeta.
- ENTRADA: el combo del que sale la foto, una foto propia que va primero (la de la categoría, o `null`) y el texto para
  lectores de pantalla. SALIDA: el HTML de la imagen, o el recuadro gris "foto del combo" si no hay ninguna.
- **La regla** es la de siempre (13.11), con un paso nuevo adelante. Gana la primera que corresponda:

  | Orden | Foto |
  |---|---|
  | 0 | La foto propia (la de la categoría) |
  | 1 | Plan Mantenimiento → "combo mantenimiento" |
  | 2 | Categoría con "saludable" → "combo saludable" |
  | 3 | La del primer plato que tenga una |
  | 4 | Ninguna → el recuadro gris "foto del combo" |

  Si la imagen no carga, se cambia por el logo una sola vez.
- **Ej:** "Viandas Saludables", sin foto propia, con un primer combo de plan MANTENIMIENTO → la foto "combo mantenimiento".
- **Por qué:** antes la regla estaba adentro de `renderizarCombos`. Ahora la usan 3 lugares: la tarjeta de categoría, la de
  combo y el recuadro del armado en el celu. Así está una sola vez.
- **Se conecta:** la llaman `renderizarCategorias`, `renderizarCombos` y `abrirModalCombo`. Pasa por `escHtml` la dirección de
  la foto y el texto.

**`renderizarCategorias()`** — REESCRITA: antes dibujaba pastillas, ahora tarjetas.
- ENTRADA: nada (usa `combosDisponibles`). SALIDA: nada (dibuja en `#lista-categorias` una tarjeta por categoría que tiene
  combos, en el orden en que vienen).
- **Paso 1:** junta los combos por categoría en un objeto, para no recorrer los combos adentro de las categorías:
  `{ 4: [combo semanal x5, combo semanal x10], 1: [MANTENIMIENTO - PRUEBA 20, PRUEBA Mantenimiento x10] }`.
- **Paso 2:** por cada categoría calcula "DESDE" (el precio más bajo), "o $ … por vianda" (el menor por vianda; puede
  ser de otro combo) y "1 combo" / "N combos". La frase va solo si la categoría tiene una.
```js
const precios = combosDeLaCategoria.map(combo => Number(combo.precio));                                  // [100000, 137000]
const preciosPorVianda = combosDeLaCategoria.map(combo => Math.round(Number(combo.precio) / combo.cantidad)); // [5000, 13700]
const desde = Math.min(...precios);                // 100000 → "DESDE $ 100.000"
const desdePorVianda = Math.min(...preciosPorVianda);   // 5000 → "o $ 5.000 por vianda"
```
- **El HTML es el de la tarjeta de combo:** las mismas clases `tarjeta-combo-…`, más `tarjeta-categoria`, y dos piezas
  nuevas, `tarjeta-categoria-desde` y `tarjeta-combo-descripcion`. Es una sola función y un solo HTML para compu y celu.
- **Seguridad:** el nombre, la frase y la foto de la base pasan por `escHtml`.
- **Se conecta:** la llama `cargarCombos`. Al tocar una tarjeta (`data-accion="ver-combos"`) se abren sus combos (el clic,
  más abajo).

**`renderizarCombos()`** — los combos de la categoría elegida.
- ENTRADA: nada (usa `categoriaElegida`). SALIDA: nada.
- **Nuevo 1:** le pone o le saca a `#categorias` la clase `mostrando-combos`. Con la clase, se ven los combos; sin la
  clase, las categorías. Qué hace cada pantalla con esa clase lo decide el CSS: en compu, los combos reemplazan a las
  categorías; en el celu, entran como pantalla aparte.
```js
const hayCombos = combosDeLaCategoria.length > 0;                                        // null → 0 combos → false
document.getElementById('categorias').classList.toggle('mostrando-combos', hayCombos);
if (!hayCombos) return;
```
- **Nuevo 2:** arriba de los combos dibuja la barra: "‹ Todas las categorías" (en el celu solo la "‹", con el nombre de la
  categoría al lado) y el rótulo "¿Cuántas viandas?" (solo celu). La foto, con `armarFotoTarjeta`.
- **Igual que antes:** el título, la bajada, la tarjeta, el precio, "Más elegido" y `escHtml`.
- **Se conecta:** la llaman `cargarCombos`, el clic en una categoría y `volverACategorias`. Las tarjetas de combo
  ("¡Lo quiero!") las sigue escuchando `armarCombo.js`, en el mismo `#combos`.

**`volverACategorias()`** — NUEVA. Esconde los combos y vuelve a mostrar las categorías.
- ENTRADA: nada. SALIDA: nada (`categoriaElegida = null` y `renderizarCombos()`, que saca la clase).
- **Se conecta:** la llaman la "‹", el "atrás" del navegador y `mostrarConfirmacion`.

**Los clics, al cargar la página** (antes había una sola línea: `cargarCombos(false)`):
- **Tocar una tarjeta de categoría:** `categoriaElegida = su id`, `renderizarCombos()` y se anota un paso en el historial
  del navegador (`history.pushState({ pantalla: 'combos' }, '')`).
  - **Por qué:** así el "atrás" del celu (o del navegador) vuelve a las categorías, en lugar de salir de la página.
- **"‹ Todas las categorías":** `volverACategorias()` y, si el último paso del historial es el de la categoría, lo saca
  (`history.back()`).
- **`popstate`** (el "atrás"): si se volvió a un paso de antes de abrir la categoría, `volverACategorias()`.
- **Al recargar la página estando en los combos:** el navegador se acuerda del paso. Se borra
  (`history.replaceState(null, '')`), porque la página arranca en las categorías.
- **Todos se escuchan en el contenedor** (`closest`), porque las tarjetas se vuelven a dibujar.

**`armarCombo.js`**

**`armarloPorMi()`** — NUEVA. "✨ Armalo por mí" completa el combo solo.
- ENTRADA: nada (usa el combo que se está armando). SALIDA: nada (suma viandas y vuelve a dibujar). No llama al servidor.
- **Cómo reparte:** da vueltas por el menú, en orden, y en cada vuelta suma 1 a cada plato con **la misma función del +**
  (`cambiarCantidadPlato`). Así respeta "lo que queda" de cada plato y la cantidad del combo. Si en una vuelta entera no
  pudo sumar nada, para.
- **Si ya había platos elegidos**, completa lo que falta.
- **Ej. real** (topes: berenjenas 10, canelones 6, fideos 10): desde 0 → 4 berenjenas, 3 canelones y 3 fideos = 10 de 10.
  Con 1 berenjena y 1 canelón ya elegidos → 4, 4 y 2.
```js
let sumoEnLaVuelta = true;
while (totalElegido < comboEnArmado.cantidad && sumoEnLaVuelta) {
  sumoEnLaVuelta = false;
  comboEnArmado.menu.forEach(plato => {
    const yaEstaCompleto = totalElegido >= comboEnArmado.cantidad;
    if (yaEstaCompleto) return;                    // return = saltear este plato
    const antes = totalElegido;
    cambiarCantidadPlato(plato.id, 1);             // la misma función del +
    if (totalElegido > antes) sumoEnLaVuelta = true;
  });
}
```
- **Se conecta:** la llama el botón `data-accion="armar-por-mi"` (en el mismo `addEventListener` de la ventana). Con el
  combo completo, `renderizarMenuCombo` apaga el botón.

**`abrirModalCombo(idCombo)`**
- **Nuevo:** completa el recuadro del celu.
  - la foto, con `armarFotoTarjeta`, que ya pasa por `escHtml`;
  - el nombre y el precio, con `textContent`;
  - "Elegí tus 10 platos · podés repetir".
- **Lo demás, igual:** los topes, el encabezado y la ventana.

**`renderizarMenuCombo()`**
- **Nuevo 1:** el texto del progreso y el del botón salen de una tabla, según la pantalla:
  - compu: "Te faltan 7" / "¡Combo completo!", y "Agregar al pedido" (lo de siempre);
  - celu: "Tus platos" / "¡Listo! Ya podés mandarlo", y "Elegí 7 platos más" / "Mandar pedido · $ 137.000".
- **Nuevo 2:** apaga "✨ Armalo por mí" con el combo completo.
- **Igual que antes:** los platos, los topes y los personalizados.
```js
const esCelu = window.matchMedia('(max-width: 767px)').matches;   // celu de 390 px → true
const textos = textosPorPantalla[esCelu ? 'celu' : 'compu'];     // (en el código, en dos pasos: pantalla y textos)
const textoFalta = completo ? textos.completo : textos.falta;
document.getElementById('boton-agregar-combo').textContent = completo ? textos.botonCompleto : textos.boton;
```

**`carritoCombos.js`**

**`agregarAlCarrito(comboArmado)`** — suma el combo armado.
- ENTRADA: el combo armado. SALIDA: nada.
- **Antes:** guardaba y abría "Mi pedido".
- **Ahora:** en compu, igual. En el celu, "Mandar pedido" va directo a "Finalizar pedido": `renderizarCarrito()` (el número
  del ícono) + `abrirFinalizarPedido()`, saliendo temprano con `return`, sin `else`.
- **Se conecta:** la llama `confirmarCombo` (armarCombo.js). Llama a `abrirFinalizarPedido` (pedidoCombos.js, que se carga
  después: recién se usa al tocar el botón, cuando ya están todos los archivos).

**`pedidoCombos.js`**

**`renderizarDiasEntrega()`** — NUEVA. Los próximos 5 días de entrega como botones (se ven en el celu).
- ENTRADA: nada. Usa la fecha mínima que puso `abrirFinalizarPedido`: 2 días hábiles, o 3 si hay personalizados.
- SALIDA: nada. Dibuja un botón por día hábil, desde el primero posible. En el celu, si la fecha elegida no es uno de esos
  días (o no hay ninguna), elige el primero (decisión 4A). En compu no toca la fecha.
- **Usa las funciones de `fechas.js`** (`sumarDiasHabiles`, `fechaLocalISO`, `fechaDDMMAAAA`): saltea los fines de semana y
  los feriados igual que el control de la fecha.
- **Ej. real** (hoy sábado 17/10): primera fecha posible martes 20/10 → [Mar 20 ✓] [Mié 21] [Jue 22] [Vie 23] [Lun 26], y
  el campo de fecha en `'2026-10-20'`.
- **El valor que se manda es el mismo de siempre:** el botón escribe `'AAAA-MM-DD'` en el campo de fecha (`#campo-fecha`).
  Ese campo es el que controla `validarFormulario` y el que va al servidor.
- **Cada botón:** `aria-pressed` (el elegido; los lectores de pantalla dicen "presionado") y `aria-label` con el día entero
  ("martes 20/10/2026").
- **Se conecta:** la llaman `abrirFinalizarPedido` y el clic en un día. Ese clic escribe la fecha, borra el error de la
  fecha y la vuelve a llamar.

**`abrirFinalizarPedido()`**
- **Nuevo:** escribe el total también adentro del botón (`#total-en-boton`: en el celu, "Confirmar pedido · $ 137.000") y
  llama a `renderizarDiasEntrega()`.
- **Lo demás, igual.**

**`confirmarPedido(evento)`** — 2 renglones.
- "Enviando pedido..." y "Confirmar pedido" se escriben en el texto del botón (`#boton-confirmar-texto`) y no en el botón
  entero. Si no, se borraba el total que va al lado.
- **Igual que antes:** apaga el botón mientras se envía, para que un doble clic no cree dos pedidos.

**`mostrarConfirmacion(respuesta, datos)`** — 1 renglón.
- Al final llama a `volverACategorias()`: detrás de "¡Recibimos tu pedido!" quedan las categorías (en el celu se cierra la
  pantalla de combos). Así "Volver al inicio" vuelve al inicio.

### 15.8 Animaciones
| Animación | Dónde | Cuándo |
|---|---|---|
| Portada que entra, secciones que aparecen al bajar, el contador de "Mi pedido" que salta | Todo | Las de antes, sin cambios |
| Latido y brillo de "¡Lo quiero!" y "Ver combos" | Las tarjetas | Sin parar |
| Tarjetas que aparecen de a una | Categorías y combos | Al llegar a la pantalla. Cada una espera 0,08 s más que la anterior |
| Pantalla que entra desde la derecha (0,4 s) | Celu: los combos y el armado | Al abrirse |
| Hoja que sube desde abajo (0,45 s) | Celu: "Finalizar pedido" | Al abrirse |
| La ✓ con rebote (crece de 0, se pasa un poquito y vuelve) | La confirmación (celu y compu; antes daba un salto) | Al aparecer |
| Al pasar el mouse: la tarjeta sube, la foto se acerca y la flecha se corre | Las tarjetas (solo con mouse: en el celu, después de tocar, quedaba pegado) | Al pasar el mouse |

**Con "sin movimiento"** (`prefers-reduced-motion`) no se mueve nada:
- todo dura casi 0;
- el latido y el brillo no están;
- las secciones y las tarjetas se ven sin animar.

Comprobado en el celu y en la compu (15.9).

### 15.9 Cómo se comprobó
Todo con Chrome sin ventana y perfiles temporales (sin tocar el tuyo), contra una copia del servidor nueva (puerto 3001)
y la base real. El "antes" se armó sirviéndole al navegador los archivos del index tal como están en git.

| Prueba | Cómo | Resultado |
|---|---|---|
| Compu, 1440 px | Recorrido: página entera, categorías, mouse encima, tocar una, "‹ Todas las categorías", el "atrás" del navegador, armar, Armalo por mí, Mi pedido, Finalizar | Anda todo. Las tarjetas de categoría miden 363 px (las de 3 por fila), sin errores en la consola |
| Celu, 390 px | Recorrido: inicio, Ver combos (entra desde la derecha), el "atrás" del celu, armar (0, 2 y 10 de 10), Armalo por mí, Mandar pedido, datos (los días, Retiro, Confirmar vacío), cerrar, "‹", Mi pedido | Anda todo. Datos vacíos → los 4 errores de siempre, sin mandar nada. Los días: Mar 20 ✓, Mié 21, Jue 22, Vie 23 y Lun 26 |
| Contra la referencia | Imágenes "referencia \| nuestra" de las 5 pantallas del celu y del armado en compu | En `diseno-index-final2/capturas-finales/comparaciones/`. Lo que no quedó igual, en 15.11 |
| Que lo demás no cambió | Elemento por elemento (posición, tamaño y unos 65 estilos), en 15 pasos, la compu aprobada contra la de ahora | **1440:** encabezado, portada, Dónde estamos, Preguntas, pie, Armar, Mi pedido, Finalizar y login, idénticos. **390:** Dónde estamos, pie, Mi pedido y login, idénticos. Cambian, a propósito, el encabezado, la portada, las categorías, el armado y Finalizar. Ruido: una respuesta de Preguntas a mitad de su animación |
| Sin scroll de costado | 14 anchos: 320, 360, 390, 412, 600, 767, 768, 900, 1024, 1131, 1132, 1280, 1440 y 1920 px, con las categorías, los combos, el armado y Finalizar abiertos | En ninguno. A 320 px, el título de Finalizar se achica y los botones de entrega van en 2 renglones |
| Pedidos de prueba de verdad | "PRUEBA – NO PREPARAR", Retiro y Efectivo, sin personalizados. Después anulados, con el PIN del `.env` sin mostrarlo | **#34**, celu, con Armalo por mí (4 berenjenas, 3 canelones y 3 fideos). **#35**, compu (5 berenjenas y 5 fideos). **#38**, celu, para la captura final. Los 3 con entrega el 20/10/2026, anulados ("Volvieron 10 viandas a la heladera"). La heladera quedó igual que al empezar |
| Test HELADERA | `node tests/test_e2e.js heladera`, contra el servidor con el `server.js` nuevo | **40/40**: pedidos #36 y #37, anulados; la heladera quedó igual |
| Login | "Iniciar Sesión", la clave mal y la clave bien (admin), en celu y compu | Se abre la ventana, aparece "Usuario o contraseña incorrectos" y el admin va a su panel. La ventana del login está igual que antes |
| ✎ Personalizar | "sin sal" en un plato, en celu y compu | Aparece el renglón "⚠ sin sal" con su − y + y la nota de +1 día hábil. El − lo saca |
| Sin movimiento | `prefers-reduced-motion: reduce`, en celu y compu | Se ve todo sin animar (15.8) |
| "Más elegido" | SIMULADO: el navegador recibe `destacado = true` en el combo #1. La base no se toca | La pastilla naranja, el borde y el botón naranja, en celu y compu |
| Consola | En todas las pruebas | Sin errores. Lo único: el aviso que escribe `auth.js` cuando probé a propósito la clave mal |
| `node --check` | Los 4 JS cambiados | Bien |

- **Lo que apareció en las pruebas** (no son errores del código nuevo):
  - **La base tardó 20 s una vez.** La primera consulta de los combos tardó 20 s; después, medio segundo. Pasó dos veces,
    con la base "fría". Mientras tanto, la página muestra "Cargando combos...".
  - **El primer pedido de prueba del 3001 dio 500, "Bloqueado por política CORS".** El servidor solo acepta pedidos que
    vienen de las direcciones permitidas (`localhost:3000` y la de `CORS_ORIGIN`), y mi copia corría en el 3001. No se
    creó nada. Se arrancó la copia con la variable `CORS_ORIGIN=http://localhost:3001`, sin tocar el código ni el
    `.env`.
- **Los pedidos de prueba que se hicieron**, todos anulados (estado 5):
  - #34, #35 y #38, por la web;
  - #36 y #37, del test.

  El #33 ("PRUEBA 77 Federico Medina") no es de estas pruebas y no se tocó.
- **Capturas** en `diseno-index-final2/capturas-finales/`:
  - `comparaciones/` (14 imágenes);
  - `celu-390/` y `compu-1440/`;
  - `antes-git/`;
  - `otros-anchos/`.

### 15.10 Seguridad (qué protege cada cosa)
- **El pedido que se manda no cambió:**
  - `armarPedido`, `validarFormulario` y `enviarPedido` son los mismos;
  - la fecha es el mismo `'AAAA-MM-DD'`, y el servidor la vuelve a controlar (día hábil y mínimo);
  - los precios y el total siguen saliendo de la base: los de la pantalla son solo para mostrar.

  Protege de que alguien cambie precios o fechas desde el navegador.
- **`escHtml` en todo lo que viene de la base y va al `innerHTML`:** el nombre y la frase de la categoría, la dirección de
  su foto (que va adentro de un atributo), los nombres y los precios de los combos. El recuadro del armado usa
  `textContent`.
  - Protege de que un texto cargado en la base (por ejemplo, la frase de una categoría) se ejecute como código en el
    navegador de un cliente (XSS).
  - Los días y sus nombres los arma el JS: no vienen de la base.
- **`server.js`, solo lectura:**
  - con las funciones de Supabase (`.select`), sin pegar texto en el SQL;
  - las rutas del panel siguen con `requireAuth` + `requireRol(6, 5)`;
  - la pública de combos sigue con su límite por IP.

  `destacado` solo puede salir `true` o `false`.
- **Los datos nuevos los carga solo quien entra a Supabase:** el navegador no puede marcar un combo como "Más elegido"
  (no hay ruta que lo cambie).
- **El historial del navegador** solo guarda `{ pantalla: 'combos' }`, sin datos.
- **El SQL solo agrega columnas,** con el RLS como estaba.

### 15.11 Lo que no quedó igual a la referencia (y por qué)
| Dónde | Referencia | Nuestra | Por qué |
|---|---|---|---|
| Encabezado del celu | "Fast Good" escrito y "💬 WhatsApp" | El logo, "Iniciar Sesión" y "Mi pedido" | Decisión 1A. WhatsApp sigue flotante, abajo a la derecha |
| Textos y datos | "Sierras Chicas", "congeladas", "Plan descenso de peso", "$ 137.000"… | Los nuestros: "Nueva Córdoba y Villa Allende", la bajada de siempre, las insignias de la decisión 2, y los combos y precios de la base | La referencia tiene datos de relleno: no se inventan datos |
| Título de las categorías en el celu | "CATEGORÍAS" | "ELEGÍ TU CATEGORÍA" (el mismo título de la sección, como rótulo) | Es el título que ya tenía la sección |
| "% OFF" | "HASTA 23% OFF", "12% OFF" | No está | Tu decisión: no va |
| Fotos | La misma foto de ejemplo | La regla de siempre: hoy "combo saludable" y "combo mantenimiento" | Las categorías todavía no tienen foto propia (se cargan desde Supabase) |
| "N combos" / "N viandas" | Arriba a la derecha | Arriba a la izquierda, y "Más elegido" a la derecha | En la referencia iban a la derecha porque a la izquierda estaba el "% OFF". Es la tarjeta que aprobaste en compu |
| Frase de la categoría | "Bajá de peso comiendo rico" | Sin frase | Las categorías no tienen frase en la base. Va sola cuando se cargue |
| Platos del armado | Una línea por plato | Debajo de cada uno, "✎ Personalizar" (y "Quedan 6" cuando hay pocas), así que los renglones son más altos. Sin segunda línea si el plato no tiene descripción | Personalizar es nuestra función (la referencia no la tiene). Las descripciones de los platos están vacías en la base |
| Platos que aparecen de a uno | Sí | No | La lista se vuelve a dibujar con cada + o −: la animación se repetiría en cada toque |
| Datos: los campos | Solo el texto gris adentro ("Nombre") | Un rótulo chico arriba de cada casillero | El texto gris desaparece al escribir y no lo leen bien los lectores de pantalla. Además, son los campos de hoy (decisión 5A) |
| Datos: el orden | Entrega, nombre, teléfono, dirección y barrio, día, pago | El de hoy: Tus datos (con Email opcional y Dirección), Tipo de entrega, Barrio, Fecha, Pago y Observaciones; arriba, el resumen plegable y la ✕ | Decisión 5A |
| Datos: entrega | "🛵 Delivery" / "🏠 Retiro" | "🛵 Envío a domicilio" / "🏠 Retiro en el local". Con Retiro, dice dónde se retira | Los textos de hoy. Los valores que se mandan son los mismos ("Delivery" / "Retiro en local") |
| Datos: Dirección con Retiro | Se esconde | Se ve | Hoy es obligatoria también con Retiro (`validarFormulario` y el servidor). Queda anotado como pendiente |
| Datos: los días | Incluía un sábado | Solo días hábiles; debajo, el aviso de las 48 hs y la primera fecha posible | Los mismos días que acepta el servidor |
| Datos: la hoja | Más baja; el botón al final | Más alta (más campos), con el botón fijo abajo | Hay más campos |
| ¡Pedido listo! | "¡Pedido listo!", "Llega el martes 20" y "Hacer otro pedido" | El mensaje de hoy: "¡Recibimos tu pedido #N!", la fecha, la entrega, el pago, el resumen, "Enviar por WhatsApp" y "Volver al inicio" | El PROMPT pide el mensaje de éxito de hoy |
| Botones redondos chicos | 38 y 34 px | Iguales, con un área invisible de 44 a 48 px para el dedo | Más fáciles de tocar, sin que se vean distintos |
| Compu | Pastillas de categoría arriba de los combos | Primero las tarjetas de categoría | Lo pediste después de ver la compu |

### 15.12 Pendientes (anotados, no hechos)
- **Panel para cargar "Más elegido" y la foto y la frase de cada categoría.** Por ahora se cargan desde Supabase:
  - `combos.destacado` = true;
  - `categorias.imagen` = la dirección de la foto;
  - `categorias.descripcion` = la frase.
- **La dirección es obligatoria también con Retiro** (`validarFormulario` y el servidor). Habría que decidir si con
  Retiro va vacía.
- **Reiniciar tu servidor del 3000** para que mande los datos nuevos (15.3).
- **`server.js`, ya anotado en 14.7:** dos comentarios todavía dicen `index-combos.html` y uno `index.js`.
- **Nuevo:** cuando el servidor rechaza un pedido por CORS, contesta 500 ("error interno") en vez de 403 ("no permitido").
  No cambia nada para el cliente (la web ve "No pudimos enviar tu pedido…"), pero el registro lo anota como error del
  servidor. Se mira con la seguridad del servidor.

### 15.13 Fondo blanco y verdes más intensos (18/10)
**Qué se pidió:**
- un cambio SOLO en `index.css`, con las perillas;
- sin tocar el encabezado, el HTML ni el JS;
- **todo el fondo blanco**, menos el encabezado, que queda como está;
- **el verde un poco más intenso** en todo lo que hoy es verde;
- los textos verdes sobre blanco tienen que seguir dando 4,5:1 o más.

**Tus decisiones** (las pregunté porque chocaban dos pedidos):
- **El verde principal:** el `#13893a` que pediste da **4,4996:1** con el blanco: no llega a 4,5 por cuatro diezmilésimas. Y
  da 4,0:1 con el verde clarito. Elegiste "dos verdes":
  - **`#12893a`** para los botones y lo verde grande: a la vista es igual, porque cambia 1 en el rojo, y da 4,50:1;
  - una perilla nueva, **`--verde-texto: #127f36`**, para los textos verdes chicos.
- **"Mi pedido"**, que es un botón verde del encabezado, toma el verde nuevo. El fondo y todo lo demás del encabezado quedan
  igual.

| Perilla | ANTES | AHORA | Dónde se ve |
|---|---|---|---|
| `--verde-fuerte` (verde principal) | `#1d7a34` | `#12893a` | Botones, "Good" y los títulos en verde, precios, "Ver combos" / "¡Lo quiero!" (la punta oscura del degradé y la flecha), íconos, bordes de lo elegido, el día elegido |
| `--verde-texto` (nueva) | — | `#127f36` | Textos verdes chicos: "$ … por vianda", "Combos desde", "Quedan 6", "✎ Personalizar", "✨ Armalo por mí", "¡Combo completo!", la pastilla del lugar, el precio del recuadro del armado, el total del resumen, los títulos y links verdes al pasar el mouse |
| `--verde` (marca y acentos) | `#2faa4b` | `#26b04f` | Barras de progreso, bordes al pasar el mouse, la punta clara de "¡Lo quiero!", el aro del foco y el borde de "Armalo por mí" |
| `--verde-hondo` (hover) | `#186a2c` | `#0f7330` | Los botones al pasar el mouse |
| `--verde-claro` | `#e7f1e4` | `#e8f5eb` | Fondos chicos: la pastilla del lugar, el recuadro del armado, lo elegido, los íconos |
| `--tinte` | `#e7f1e4` | `var(--verde-claro)` (el mismo) | Recuadros chicos: notas, el resumen, el barrio, el botón ✕, el fondo de − / + |
| `--fondo` | `#f3f6f1` (gris verdoso) | `#ffffff` | Toda la página: portada, los 3 pasos, Dónde estamos y el pie |
| `--fondo-encabezado` (nueva) | — | `#f3f6f1` | El fondo del encabezado en compu: el de siempre (antes tomaba `--fondo`; así no cambia) |

**Las reglas que cambiaron** (todas en `index.css`):
- **Preguntas** (`.seccion-fondo-verde`): de `var(--tinte)` a `var(--fondo)`, o sea blanca. El nombre de la clase lo usa el
  HTML, así que se dejó, con un comentario.
- **El encabezado:** `color-mix(… var(--fondo) 88% …)` pasó a `var(--fondo-encabezado)`. Se ve igual.
- **Los verdes escritos a mano pasaron a las perillas:**
  - el degradé de "¡Lo quiero!": de `#2faa4b → #1e8538` a `var(--verde) → var(--verde-fuerte)`;
  - la flecha: de `#1e8538` a `var(--verde-fuerte)`;
  - las sombras (`rgb(30 133 56 / .6)` en el botón y en el latido, `rgb(29 122 52 / .3)` en `--sombra-accion`);
  - el aro del latido (`rgb(47 170 75 / …)`);
  - el borde de los casilleros al escribir (`rgb(47 170 75 / .22)` y `rgb(40 167 69 / .15)`).

  Ahora son `color-mix(in srgb, var(--verde…) X%, transparent)`: "ese verde con X % de opacidad". Si se cambia una
  perilla, cambian también las sombras.
- **19 reglas** de texto verde chico pasaron de `--verde-fuerte` a `--verde-texto`. Los textos grandes (de 18,66 px en
  negrita o de 24 px para arriba), los íconos, los bordes y los fondos siguen con `--verde-fuerte`.
- **No se tocó:** el HTML, el JS, el naranja ni los grises. El recuadro gris del "mapa" y el de las fotos sin foto siguen
  grises: son recuadros, no fondos de sección.

**Cómo se comprobó** (Chrome sin ventana, a 390 y a 1440 px, contra la copia del servidor en el 3001, porque el 3000 no
estaba prendido):
| Prueba | Resultado |
|---|---|
| Fondos | `html`, `body`, portada, Categorías, Dónde estamos, Preguntas y pie, blancos. El encabezado, igual que antes: blanco en el celu y `#f3f6f1` (88 %) en compu |
| Contraste de cada texto verde que se ve, medido contra el fondo que tiene realmente detrás (inicio, combos, armar, armar completo y Finalizar) | **114 textos, todos pasan.** Los más justos: <br>· la pastilla del lugar y el precio del recuadro del armado (celu), 4,54:1 sobre el verde clarito (pide 4,5); <br>· "Quedan 6" sobre el plato elegido, 4,81; <br>· el total del resumen (20 px, grande), 4,01 (pide 3). <br>Los textos chicos sobre blanco dan 5,1:1, y los grandes ("Good", precios), 4,5:1 |
| Al pasar el mouse (no se mide solo) | Los textos verdes chicos sobre el verde clarito dan 4,54:1, por cuenta |
| Capturas antes / después | En `diseno-index-final2/capturas-fondo-blanco-y-verdes/`: 12 comparaciones, más las capturas sueltas y la lista de los 114 contrastes |
| Sin scroll de costado y consola sin errores | Bien, en celu y compu |

**Para tener en cuenta** (no son textos verdes, así que no estaban en el pedido): con el verde de marca más intenso, bajan
un poco dos cosas que ya estaban justas.
| Qué | Antes | Ahora | Pide |
|---|---|---|---|
| El aro verde que marca dónde estás con el teclado (`:focus-visible`, `--verde`) | 3,01:1 | 2,84:1 | 3:1 |
| La letra blanca de "¡Lo quiero!" sobre la punta clara del degradé | 3,01:1 | 2,84:1 | 4,5:1 (la punta oscura da 4,50) |

Si querés, se arregla con una perilla: el aro del foco con `--verde-fuerte`, y el degradé de `--verde-fuerte` a
`--verde-hondo`.

### 15.14 La foto nueva de la portada (18/10)
**Qué pasaba:** pusiste una foto nueva, `src/assets/img/portada-vianda.jpg` (2752 × 1536, 3,1 MB), y en `index.html`
cambiaste la portada para que la use. Pero no se veía, por tres cosas:
- el HTML decía `portada-viandas` (en plural) y el archivo es `portada-vianda` (en singular);
- pedía las versiones `-900` y `-1600`, que no existían;
- tenía las medidas de la foto vieja (3168 × 1344).

| | ANTES | AHORA |
|---|---|---|
| Archivos | Solo `portada-vianda.jpg` | Además `portada-vianda-900.jpg` (900 × 502, 116 KB) y `portada-vianda-1600.jpg` (1600 × 893, 309 KB), hechas de la original (JPEG calidad 82, igual que las fotos de los combos). La original no se tocó |
| `index.html` | `portada-viandas…` (no existe), `3168w`, `width="3168" height="1344"`, `src` = la original | `portada-vianda…` (como se llama el archivo), `2752w`, `width="2752" height="1536"`, `src` = la de 1600 (por si el navegador no entiende `srcset`) y el comentario al día |
| CSS | — | Nada: con el encuadre de siempre (marco 3:2 en compu y la foto apoyada a la derecha) entran todas las bandejas |

**Comprobado** en tu servidor del 3000:
- a 1440, 1024 y 768 px la foto carga y elige la de 900 px, que pesa 117 KB (el marco mide como mucho 590 px);
- sin errores ni 404.

En el celu la foto no se ve (la portada es compacta), pero el navegador igual baja la de 900 px. Pasaba lo mismo con la
foto vieja.

**Quedan sin uso** `viandaprincipal2.jpg`, `-900` y `-1600` (4,7 MB): el index ya no las nombra (solo
`docs/maqueta-index.html`, que es de referencia). No se borraron: decidís vos.

### 15.15 Portada nueva de la compu: la foto que se funde con el blanco (19/10)
**Qué se pidió** (`diseno-portada/PROMPT.md`): la portada de la compu igual a la referencia, con sus animaciones, y el
encabezado blanco en compu y en el celu. La portada del celu queda como estaba. Solo cosas visuales, sin JS.

**Tus decisiones (19/10):**
| # | Tema | Decisión |
|---|---|---|
| 1 | Dónde arranca la foto | Valen los números del PROMPT: 34 %, `object-position: 80% 50%` y el fundido hasta el 36 %. La referencia y la captura de la carpeta son de una versión anterior (28 %) |
| 2 | La foto | `foto-portada.webp` copiada como `portada-vianda.webp` (1920 × 1072, 255 KB). Se borraron `portada-vianda.jpg` (3,1 MB) y las versiones `-900` y `-1600` |
| 3 | El texto nuevo | "Fast & Good" y la bajada nueva van en compu y en celu. La pastilla del lugar: la nueva en compu y la de antes en el celu |
| 4 | El link "activo" del menú | Sin JS: el verde clarito sale solo al pasar el mouse |
| 5 | "Combos desde $…" | Escondido en compu. Sigue en el HTML, porque lo completa el JS |
| 6 | El menú | Quedan los 4 links |
| — | El logo del encabezado | Escrito: "Fast" en gris y "& Good" en verde. El pie sigue con la imagen |

| Qué | Archivo y lugar | ANTES | AHORA |
|---|---|---|---|
| Referencia fuera de git | `.gitignore` | — | `diseno-portada/` |
| Foto | `src/assets/img/` | `portada-vianda.jpg` y sus versiones `-900` y `-1600` | Solo `portada-vianda.webp` (255 KB) |
| Encabezado | `index.css`, sección 1 | Fondo gris verdoso un poco transparente con desenfoque, borde de 1 px, 64 px de alto | **Blanco** con una línea de 1 px hecha con sombra (`--encabezado-linea`), 68 px de alto en compu. Sigue pegado arriba (`sticky`, capa 10, por encima de la foto). Links en gris; al pasar el mouse, verde clarito con letra verde. "Iniciar sesión" en negrita. "Mi pedido", igual |
| Logo | `index.html` + `index.css`, secciones 0 y 1 | La imagen `logo.webp` | Escrito, `.logo-texto`: "Fast" en `--titulo-suave` y "& Good" en `--verde-fuerte`, 900, 24 px (21 px en el celu) |
| Texto de la portada | `index.html` | "Fast Good", "Viandas caseras y saludables, hechas con ingredientes frescos.", "Pedir ahora", "Combos desde…" y la etiqueta "Entregamos a las 48 hs hábiles" en la foto | En este orden: la pastilla del lugar (2 textos, el CSS muestra el de cada pantalla), "Fast & Good", "Viandas saludables, caseras y congeladas. Elegís tu combo y te lo llevamos.", "Pedir ahora" + **"Ver categorías"** (nuevo, lleva a `#categorias` igual que "Pedir ahora"), WhatsApp e Instagram. **Sin** la etiqueta de las 48 hs |
| Portada en compu | `index.css`, sección 2 | Dos columnas: texto y foto en tarjeta redondeada (3:2). Los 3 pasos en una franja abajo | Una franja de 640 px (`--portada-alto`). El texto a la izquierda, adelante. La foto en posición absoluta, desde `--portada-foto-desde` (34 %) hasta el borde derecho y de arriba a abajo, sin bordes, con `cover` y `80% 50%` |
| Fundido | `index.css`, sección 2 | — | `.portada-foto::before`: del blanco de la página a transparente, hasta `--portada-fundido` (36 %). Los pasos del medio van al 25 % y al 61 % de ese largo (con 36 %: 9 % y 22 %, como el PROMPT), así siguen a la perilla |
| "⚡ Listas en 5 minutos" | `index.html` + `index.css`, sección 2 | — | Pastilla blanca arriba a la derecha de la foto (28 px de arriba, 32 px de la derecha), 15 px en negrita, "5 minutos" en verde. Solo compu |
| Pasos | `index.css`, sección 2 | Franja de lado a lado debajo de la portada | La misma lista, ahora como pastilla blanca chiquita abajo a la derecha de la foto (22 px y 28 px), de 11 px, con números en círculos de 16 px y flechas "→" puestas con `::after`. En el celu siguen sin verse |
| Compus medianas | `index.css`, `:root` + sección 2 | — | De 768 a 1199 px: foto desde el 40 % y título de 68 px. De 768 a 1023 px: foto desde el 50 %, título de 56 px, el texto en una columna de 380 px y la pastilla del lugar un poco más chica (si no, se partía en dos renglones) |
| Animaciones | `index.css`, sección 11 | El texto entraba subiendo 16 px | Solo compu, una vez al cargar: <br>1. el texto sube 20 px de a uno (0,8 s, con 0,07 s de diferencia); <br>2. la foto entra desde la derecha a los 0,15 s (1,4 s: de `opacity 0`, `translateX(120px)` y `clip-path: inset(0 0 0 40%)` a todo visible); <br>3. el zoom 1.12 → 1 (2,2 s); <br>4. los pasos a los 1,1 s y "Listas" a los 1,25 s (suben 12 px, 0,7 s). <br>Con "reducir movimiento" no se anima nada |

**Perillas nuevas** (`:root`):
- `--portada-alto: 640px`
- `--portada-foto-desde: 34%`
- `--portada-fundido: 36%`
- `--titulo-portada-compu: 84px`
- `--encabezado-linea: #e3e9e1`

`--fondo-encabezado` pasó a `#ffffff`.

**Lo que no quedó igual a la referencia:**
- **Corrido 20 px:** el texto de la portada arranca 20 px más a la derecha, porque nuestro contenedor mide 1200 px y el de
  la referencia 1240. Así queda alineado con el resto de la página.
- **Más aire debajo:** "Elegí tu categoría" queda más abajo que en la referencia, porque esa sección sigue como estaba.
- **"Iniciar Sesión"** sale con S mayúscula, porque ese texto lo escribe `auth.js`.
- **Sin link activo:** el menú no marca la sección que se está mirando (decisión 4).

**Cómo se comprobó** (Chrome sin ventana, contra la copia del servidor en el 3001):
| Prueba | Resultado |
|---|---|
| 1440 px, lado a lado con la referencia | Igual, salvo lo de arriba |
| Que nada se pise (1440, 1280, 1024 y 768) | El texto queda sobre la parte blanca del fundido y no hay scroll de costado |
| Celu, 390 px | Igual que antes, salvo el encabezado blanco con el logo escrito, "Fast & Good" y la bajada nueva |
| Animación | A los 0,7 s la foto entra "destapándose" desde la derecha; al final, todo en su lugar |
| Reducir movimiento | Sin animación, todo quieto y en su lugar |
| Botones y Mi pedido | "Pedir ahora" y "Ver categorías" llevan a `#categorias`; "Mi pedido" abre el carrito |
| Consola | Sin errores |

Las capturas están en `diseno-portada/capturas/`, que no se sube a git.

**Ajustes (19/10):**
- La animación de la foto se probó más lenta y hacia la derecha, y **después se volvió a como estaba**: entra desde la
  derecha (`translateX(120px)` y `clip-path: inset(0 0 0 40%)`), `--portada-foto-duracion: 1.4s`, zoom de 2,2 s y las
  pastillas a los 1,1 s y 1,25 s.
- Degradé blanco abajo de la foto (`--portada-fundido-abajo: 30px`).
- El logo del encabezado es la imagen redonda (40 px en compu, 34 px en el celu) + "Fast & Good" escrito.
- En celus de 400 px o menos, el encabezado lleva márgenes de 12 px; de 380 px o menos, "Iniciar sesión" va en dos renglones.
- `auth.js`: solo el texto "Iniciar Sesión" → "Iniciar sesión".

---

## 16. Panel: menú nuevo, `global.css` con el estilo del index y Consultar Pedidos (19/10, `diseno-panel-v2/`)
**Qué se pidió** (`diseno-panel-v2/PROMPT.md` y tus respuestas del 19/10):
- un menú lateral nuevo para todas las pantallas del panel;
- Consultar Pedidos igual a la referencia (filtros, botones de estado, tabla y las 4 ventanas);
- `global.css` con el estilo del index, para las 13 pantallas que lo cargan (las 12 del panel y el login).

Solo cambia cómo se ve. Todo funciona igual que antes, salvo lo que decidiste: el menú agrupado, los botones de estado,
una sola fecha, y sin pie ni emojis. No se tocó `server.js`, `sql/`, `roles.js`, `guard.js`, `fechas.js` ni el index.

### 16.1 Tus decisiones (19/10)
| # | Tema | Decisión |
|---|---|---|
| 1 | Pantallas que no estaban en la referencia | "Inicio" arriba de todo, sin grupo. "Asignar Cocineros" en Cocina. "Movimientos (viejo)" fuera del menú (se sigue pudiendo abrir con su dirección) |
| 2 | "Pedir a cocina" y "Compras" | Afuera del menú hasta que tengan su propia pantalla (hoy son ventanas de Producción y de Movimientos de Stock) |
| 3 | Nombres | Los de hoy, sin el emoji, cada uno en el grupo que mejor le queda |
| 4 | El renglón "Producción de hoy (…) — pedidos con entrega el …" | Primero, chiquito y gris debajo de los filtros. Después, en el ajuste de la tarde (16.12), **se sacó** |
| 5 | "Mostrando X de Y pedidos" | Opción nueva en `paginacion.js`. Las otras pantallas no la usan y funcionan igual |
| 6 | `global.css` | Sigue en las 13 pantallas, con el estilo del index (letra Figtree). Las variables en inglés no cambian de nombre, solo de valor, y al lado van las perillas nuevas en español. Sin el pie "©". El login cambia sin tocar su HTML ni su lógica. Los `<style>` de las otras pantallas no se tocan |
| 7 | Ajuste de la tarde | Los títulos de todas las tablas en verde, sin franja ni mayúsculas. Las celdas a 15 px. En Consultar Pedidos, cada celda con su clase `col-…` (16.12) |

### 16.2 Qué archivos cambiaron
| Tipo | Archivo | Qué cambió |
|---|---|---|
| — | `.gitignore` | `diseno-panel-v2/` (la referencia y las capturas no se suben) |
| HTML | `admin.html` y las 11 pantallas de `pages/` | **Sin el pie "©"** (eran 12 pies, no 11: también lo tenía `admin.html`). El `<link>` de la letra Figtree. En 8 de ellas Poppins sigue cargada, porque su CSS propio (o los gráficos de `reportes.js`, en Inicio) todavía la usa |
| HTML | `login.html` | Solo el `<link>` de la letra: Poppins → Figtree |
| HTML | `pages/ConsultarPedidos.html` | Ver 16.5. Mismos ids que antes |
| CSS | `src/css/global.css` | Reescrito por secciones con el estilo nuevo (16.4) |
| CSS | `src/css/menuPanel.css` | **Nuevo**: el menú (16.3) |
| CSS | `src/css/ConsultarPedidos.css` | Reescrito: solo lo de esta pantalla (16.5) y una regla para Asignar Cocineros en el celu |
| CSS | `src/css/adminSidebar.css` | Ya no se carga (lo cargaba `adminSidebar.js`). El archivo quedó, sin borrar |
| JS | `src/js/adminSidebar.js` | El HTML del menú, los grupos y la barra del celu (16.6) |
| JS | `src/js/ListarPedidos.js` | Lo que dibuja: estados, fila, Detalles, títulos de las ventanas, avisos (16.6) |
| JS | `src/js/pagoPedido.js` | 3 renglones: "Pedido #N" en Pago y en Confirmar pago, y "Suma correcta" (16.6) |
| JS | `src/js/paginacion.js` | La opción nueva "Mostrando X de Y" (16.6) |

### 16.3 El menú (`adminSidebar.js` + `menuPanel.css`)
| Qué | ANTES | AHORA |
|---|---|---|
| Arriba | "📊 Panel Admin" en blanco sobre verde | El logo redondo de 38 px, "Fast **& Good**" ("& Good" en verde) y la etiqueta "PANEL" |
| Fondo | Degradé verde de 250 px | Blanco, de 265 px (el ancho de la referencia a 1440), con una línea finita a la derecha |
| Links | Los 12 de `roles.js`, en su orden, con emoji | Agrupados (tabla `MENU_PANEL`), con íconos de línea. La pantalla actual, en pastilla verde con letra blanca; al pasar el mouse, verde suave |
| Grupos | — | El título de un grupo sale antes de su primera pantalla: si el rol no ve ninguna, no sale |
| Abajo | "Usuario: -" y el ID, y "🚪 Cerrar Sesión" | Un círculo verde con la inicial, el nombre y el rol (de `roles.js`), y un botón redondo de salir. En las 11 pantallas de `pages/` antes salía "-" en el nombre (16.6) |
| Menos de 900 px | Debajo de 768 px: un ☰ verde flotante | Una barra blanca arriba con el ☰ y el logo. El ☰ abre el menú desde la izquierda, con lo oscuro detrás (tocarlo lo cierra) |
| Permisos | `FG_ROLES.pantallasDelRol` | **Igual**: el menú solo dibuja lo que `roles.js` deja. `guard.js` sigue bloqueando las direcciones |

**El menú de cada rol, grupo por grupo** (probado entrando a las 13 pantallas con cada uno):
| Rol | Menú |
|---|---|
| 6 Administrador del sistema · 5 Dueño | Inicio · **PEDIDOS** Consultar Pedidos · **REPARTO** Envíos del Día · **COCINA** Tareas de Cocina, Producción, Asignar Cocineros · **STOCK** Movimientos de Stock, Gestión de Stock · **CATÁLOGO** Combos, Generar Receta · **ADMINISTRACIÓN** Gestión de Usuarios |
| 1 Administrador | **PEDIDOS** Consultar Pedidos · **REPARTO** Envíos del Día · **COCINA** Tareas de Cocina, Producción · **STOCK** Movimientos de Stock, Gestión de Stock |
| 2 Cocinero | **COCINA** Tareas de Cocina, Producción |
| 3 Repartidor | **REPARTO** Envíos del Día |
| 4 Consumidor final | No entra al panel (`guard.js` lo manda al index, como antes) |

"Movimientos (viejo)" no está en el menú, pero los roles 6, 5 y 1 la siguen abriendo con su dirección. Cualquier otra
pantalla que no le toca a un rol lo manda a su pantalla principal, igual que antes.

### 16.4 `global.css`
**Secciones:** 0 Perillas · 1 Base · 2 Título de cada pantalla · 3 Pie · 4 Secciones y tarjetas · 5 Botones · 6 Casilleros y
etiquetas · 7 Ventanas · 8 Tablas · 9 Paginación · 10 Utilidades y menú viejo · 11 Animaciones · 12 Celular.

**Las variables de antes, en inglés** (siguen con el mismo nombre; ahora toman el valor de las perillas nuevas):
| Variable | ANTES | AHORA |
|---|---|---|
| `--color-primary` | `#28a745` | `var(--verde-principal)` = `#12893a` |
| `--color-primary-dark` | `#388E3C` | `var(--verde-hondo)` = `#0f7330` |
| `--color-primary-glass` | `rgba(40, 167, 69, 0.97)` | `rgb(18 137 58 / .97)` |
| `--color-secondary` | `#ff9800` | `var(--naranja)` = `#ff9800` (igual) |
| `--color-accent` | `#00ff22` | `var(--verde-marca)` = `#26b04f` |
| `--color-bg` | `#f8f9fa` | `var(--fondo)` = `#ffffff` |
| `--color-text` | `#2a2a2a` | `var(--texto)` = `#111a14` |
| `--color-muted` | `#9e9e9e` | `var(--texto-apagado)` = `#5f6b63` |
| `--color-overlay` | `rgba(0, 0, 0, 0.52)` | `var(--fondo-ventana)` = `rgb(14 20 26 / .5)` |
| `--font-main` | `'Poppins', sans-serif` | `var(--fuente)` = Figtree (la del index) |
| `--radius-sm` / `-md` / `-pill` | 6 / 14 / 30 px | 12 / 16 / 999 px |
| sombras | grises | `--sombra-suave` (la del index) y `--sombra-ventana` |

**Qué cambia en las otras pantallas** (sin tocar sus HTML ni sus CSS):
- la letra Figtree;
- el título grande y gris oscuro, sobre el blanco: ya no hay barra verde, y el logo del título no se ve porque está en el menú;
- sin pie;
- las ventanas `.modal` con la caja blanca redondeada y la X en un círculo verde suave;
- la paginación en circulitos;
- las tablas `.standard-table` y `.grilla-fg` con los títulos verdes y las celdas de 15 px (16.12);
- el login con la letra y los verdes nuevos.

**Lo que NO cambió, por el CSS propio o el `<style>` de cada pantalla** (se arregla al rediseñar cada una):
- **Letra Poppins** en lo que su CSS escribe con Poppins: los botones y casilleros de Gestión de Stock, Combos, Generar
  Receta, Gestión de Usuarios, Tareas de Cocina y Producción, el select de Asignar Cocineros y los gráficos de Inicio.
- **Colores propios:** los botones de cada pantalla (Editar verde, Eliminar rojo, "+ Incorporar nuevo insumo" azul, etc.),
  las tarjetas de números de Inicio, las tarjetas de Envíos y las de Tareas de Cocina.
- **El botón naranja "Iniciar Sesión" del login:** `login.css` lo pinta con `--color-secondary`, que es el naranja de siempre.
- **El ancho del contenido:** varias pantallas tienen su contenido centrado de 1300 px como máximo (su CSS), así que en
  pantallas muy anchas el título no queda justo alineado con lo de abajo.
- **"Movimientos (viejo)":** sus ventanas son de su `<style>`.

### 16.5 Consultar Pedidos
**HTML (`ConsultarPedidos.html`), mismos ids que antes:**
- **Arriba:** solo el título "Administración de Pedidos" (sin el logo, que ahora está en el menú).
- **Barra de filtros:**
  - "Buscar", con la lupa adentro y el texto "Nombre o N° de pedido";
  - **una sola** "Fecha de entrega" (`FechaDesde`). `FechaHasta` sigue en el HTML, escondida (`hidden`);
  - "Aplicar" (verde) y "Ver todos" (blanco con borde): son los mismos botones, con las clases nuevas.
- **La tarjeta de la tabla:**
  - arriba, los 6 botones de estado (`#filtros-estado`): cada uno con su puntito de color y su cantidad;
  - la tabla de siempre adentro de `.caja-tabla`, que es la que se mueve de costado si no entra;
  - abajo, "Mostrando X de Y pedidos" (`#resumenPaginacion`) y los números de página.
- **Las 11 columnas, las mismas:** cada `<th>` tiene su clase `col-…`.
- **Ventanas:** las mismas 4, con las piezas nuevas de `global.css` (`ventana`, `ventana-cabecera`, `boton-cerrar`…).
  - Arriba del título, un renglón chiquito: "Realizado el …" en Detalles, y "Pedido #N" en Pago, Confirmar pago y Anular.
  - Los métodos de pago, sin emoji.
  - Mixto: los dos montos uno al lado del otro.
  - Confirmar pago y Anular: los botones uno debajo del otro.
  - "Anular pedido", "PIN de autorización" y "Confirmar anulación" en minúscula.
  - El aviso de Anular: "Esta acción no se puede deshacer. Si el pedido no se entregó, las viandas vuelven a la heladera."
- **Fuera del HTML:**
  - el `<style>` del final se pasó a `ConsultarPedidos.css`;
  - también el `<style>` de arriba ("no mostrar la página hasta que cargue");
  - se sacó el `style="display:none"` del texto Mixto de Confirmar pago (`abrirConfirmarPago` lo decide antes de abrir).

**CSS (`ConsultarPedidos.css`):** secciones 0 Perillas · 1 Mostrar la página cuando terminó de cargar · 2 El contenido ·
3 Barra de filtros · 4 Tarjeta y botones de estado · 5 Tabla · 6 Pie de la tabla · 7 Ventanas · 8 Avisos flotantes ·
9 Pantallas medianas y celular. Este archivo también lo carga Asignar Cocineros: por eso lo general de las tablas pasó a
`global.css`, y queda una sola regla para ella (su tabla mide 1000 px en el celu, como antes).

### 16.6 Las funciones: antes y ahora (JS, línea por línea)
**`adminSidebar.js`** (corre al leerse; arma el menú):
| Líneas | ANTES | AHORA | Por qué |
|---|---|---|---|
| 1–12 | Sin encabezado | La lista de funciones (CLAUDE.md) | Regla de cada archivo JS |
| 19–25 | Cargaba `adminSidebar.css` | Carga `menuPanel.css` | El estilo nuevo |
| 33–46 | — | `MENU_PANEL`: ruta, grupo, ícono y nombre de cada pantalla, en orden | Los grupos y los nombres sin emoji, en una tabla |
| 48–62 | — | `ICONOS_MENU`: los dibujos de los íconos | Íconos de línea |
| 64–82 | `pantallasDelRol(rol).map(…)` con el texto con emoji | Un objeto `{ ruta: pantalla }` con las del rol y un `forEach` sobre `MENU_PANEL`: si el rol no la ve, la saltea; el título del grupo va antes de su primera pantalla | Mismos permisos; un grupo vacío no muestra su título; sin forEach adentro de otro |
| 84–114 | El HTML con "📊 Panel Admin", el ID y "🚪 Cerrar Sesión" | El logo, los links y abajo la inicial, el nombre y el rol. Siguen `admin-sidebar`, `sidebarUserName` y `sidebarLogoutBtn` | La referencia |
| 121–128 | Marcaba el link actual con `active` | Igual, y además `aria-current="page"` | Para los lectores de pantalla |
| 132–147 | El ☰ suelto en la página | El mismo ☰ (con `aria-expanded`), adentro de una barra con el logo, arriba del contenido | La barra de menos de 900 px |
| 149–154 | `toggleAdminSidebar` | Igual, y actualiza `aria-expanded` | Para los lectores de pantalla |
| 163–171 | Cerrar sesión | **Igual** | — |
| 175–180 | `cargarDatosUsuario` usaba `obtenerDatosUsuario` (de `auth.js`, que solo está en Inicio): en las otras 11 decía "-" | Lee el nombre que guardó `auth.js` en el navegador (`usuario_nombre`, el mismo dato) y escribe la inicial | Que el nombre salga en todas |

- **`toggleAdminSidebar(abrir)`**
  - **Qué hace:** abre o cierra el menú en las pantallas chicas.
  - **ENTRADA:** `true` (abrir), `false` (cerrar) o nada (lo contrario de cómo está).
  - **SALIDA:** pone o saca `abierta` en el menú y `visible` en lo oscuro, y deja `aria-expanded` en "true" o "false".
  - **Ejemplo:** en el celu, tocar ☰ → el menú entra desde la izquierda; tocar lo oscuro → se va.
  - **Se conecta con:** el ☰, lo oscuro y cada link del menú.
- **`cargarDatosUsuario()`**
  - **ENTRADA:** nada (lee `usuario_nombre` del navegador).
  - **SALIDA:** el nombre y su inicial abajo del menú.
  - **Ejemplo:** "Mauricio" → "M" en el círculo verde y "Mauricio" al lado.
  - **Se conecta con:** lo que guarda `manejarLogin` (`auth.js`) al iniciar sesión.

**`ListarPedidos.js`:**
| Función (líneas) | ANTES | AHORA | Por qué |
|---|---|---|---|
| Variables (31, 40–53) | `hoyISO`; `COLORES_ESTADO` = `{ bg, color }` | `filtroEstado` (nueva); `COLORES_ESTADO` = el nombre de la clase de color (ej. `estado-registrado`); `TEXTO_PASTILLA_METODO` (nueva, "Tarjeta Débito" → "Tarjeta"). `hoyISO` se sacó (era solo para el renglón de "Producción de hoy") | Los colores van en el CSS; el filtro de estados |
| `iniciarConsultarPedidos` (84–91, 118–119) | — | Un solo "escuchador" para los 6 botones de estado: cambia `filtroEstado` y dibuja desde la página 1. El error del servidor, con la clase `texto-error` en vez de un `style` | Los botones de estado; nada de `style=""` |
| `renderizarPedidos` (132–175) | Escribía el renglón "Producción de hoy…" (34 líneas); pasaba `visibles` a la tabla | Sin el renglón. Después del filtro de fecha y buscador llama a `renderizarFiltrosEstado(visibles)`, deja solo los del estado elegido (`delEstado`) y pasa `contenedorResumen` y `nombreDatos`. El mensaje vacío tiene un caso más: "No hay pedidos con ese estado" | Las cantidades salen de la misma lista que se ve, así siempre cuadran |
| `renderizarFiltrosEstado` (186–208) | — | **Nueva** (abajo) | — |
| `crearFilaPedido` (213–336) | "Detalles" en la columna Viandas; método + "PAGADO/PENDIENTE"; estilos escritos en las celdas | Solo el HTML de la fila: la cantidad de viandas (y "⚠ N personalizados"), "Delivery · barrio" o "Retiro en local" debajo de la dirección, la pastilla de pago con su detalle, Detalles en Acciones, la clase `col-…` en cada celda, `fila-cancelada` en los anulados y el nombre del select para los lectores de pantalla | La referencia |
| `aplicarFechas` (364) | — | `inputHasta.value = inputDesde.value;` | Una sola fecha, con el filtro de siempre |
| `pintarEstado` (491–494) | Escribía el fondo y la letra en el select | Le pone la clase de su color | Los colores en el CSS, como perillas |
| `abrirDetalles` (512–582) | "Detalle del Pedido #N"; una tabla con "Cantidad / Plato / Precio unitario" | "Pedido #N", la fecha con " · " antes de la hora, un recuadro por combo con su precio y sus platos, los sueltos en su recuadro y el Total abajo | La referencia |
| `abrirAnular` (594) | Título "Anular Pedido #N" | "Pedido #N" arriba del título fijo "Anular pedido" | La referencia |
| `confirmarAnulacion` (663) | "Confirmar Anulación" | "Confirmar anulación" | Igual al texto del botón |
| `mostrarCartel` (720–724) | El aviso amarillo con los estilos escritos en el JS | Las clases `cartel-alerta`, `cartel-alerta-titulo` y `cartel-alerta-cerrar` (estilo en el CSS) | Nada de estilos sueltos |

- **`renderizarFiltrosEstado(pedidos)`** (nueva)
  - **Qué hace:** escribe en cada botón de estado cuántos pedidos hay y marca en verde el elegido.
  - **ENTRADA:** los pedidos que pasaron el filtro de fecha y el buscador (todavía sin el filtro de estado).
  - **SALIDA:** nada. Cambia los números, la clase `boton-estado-elegido` y `aria-pressed`.
  - **Por qué así:** se cuentan con un `forEach` en un objeto (`{ todos: 3, 1: 2, 4: 1 }`), sin rutas nuevas. Los botones ya están en el HTML (`data-estado`).
  - **Ejemplo:** con fecha 21/10 → "Todos 5 · Registrado 1 · Cancelado 4", y los demás en 0.
  - **Se conecta con:** la llama `renderizarPedidos` cada vez que dibuja la tabla.

**`pagoPedido.js`:** línea 68, `abrirPago`, escribe "Pedido #N" (antes, el título "Pago del Pedido #N"). Línea 128,
`mostrarOpcionesPago`: "Suma correcta: $ 20.000" (antes "✓ La suma coincide con el total"). Línea 237, `abrirConfirmarPago`:
"Pedido #N" arriba de "Confirmar pago" (nuevo).

**`paginacion.js`:** líneas 13–17 (cómo se usa), 29–30 (las opciones `contenedorResumen = null` y `nombreDatos`), 94 (borra
el resumen), 103–104 (las filas de la página en una variable: el mismo `slice` de antes) y 109–111 (escribe "Mostrando X de Y
…"). **Sin `contenedorResumen` hace exactamente lo de antes:** probado en Gestión de Stock, Producción, Generar Receta y las dos
de Movimientos (mismos botones, la página 2 anda y no aparece ningún "Mostrando").

### 16.7 Perillas nuevas
- **`global.css`, colores:**
  - `--verde-principal`, `--verde-texto`, `--verde-hondo`, `--verde-marca` y `--verde-suave`;
  - `--titulo`, `--texto`, `--texto-gris` y `--texto-apagado`;
  - `--borde-gris`, `--linea-suave`, `--gris-boton` y `--fondo`;
  - `--naranja`, `--rojo`, `--rojo-suave`, `--rojo-texto` y `--fondo-ventana`.
- **`global.css`, tamaños, letra y sombras:**
  - `--alto-boton`, `--alto-boton-chico` y `--espacio-pantalla`;
  - `--radio-pastilla`, `--radio-casillero`, `--radio-tarjeta` y `--radio-ventana`;
  - `--titulo-pantalla`, `--fuente`, `--sombra-suave` y `--sombra-ventana`.
- **`global.css`, tablas (16.12):**
  - `--fondo-titulos-tabla`, `--color-titulos-tabla`, `--letra-titulos-tabla` y `--linea-titulos-tabla`;
  - `--letra-celdas-tabla`, `--celda-alto`, `--celda-espacio`, `--linea-renglones-tabla` y `--fila-encima`.
- **`menuPanel.css`:** `--menu-ancho` (265 px), `--menu-alto-link`, `--menu-icono`, `--menu-logo`, `--menu-barra-alto` y `--menu-duracion`.
- **`ConsultarPedidos.css`:**
  - los colores de cada estado (`--estado-…-fondo`, `-letra` y `-punto`);
  - las pastillas suaves: `--naranja-suave`, `--azul-suave`, `--verde-pastilla`, `--apagado-letra` y `--aviso-personalizado`;
  - la letra de las columnas: `--letra-numero`, `--letra-destacada`, `--letra-contacto`, `--letra-dato-chico`, `--letra-pastillas` y `--alto-pastillas`;
  - los anchos: `--tabla-ancho-minimo`, `--ancho-minimo-cliente`, `--ancho-minimo-direccion` y `--ancho-minimo-contacto`;
  - `--fila-cancelada-opacidad`, `--alto-boton-estado` y `--radio-recuadro`.

### 16.8 Cómo se comprobó
Todo con Chrome sin ventana, contra la copia del servidor en el 3001. El navegador solo dejaba pasar los cambios al pedido
de prueba: cualquier otro se cortaba, y no hubo ninguno.
| Prueba | Resultado |
|---|---|
| Las 13 pantallas, a 1440 y 390 px, antes y después | Abren todas con el menú nuevo, sin pie, sin scroll de costado y sin errores en la consola. El contenido empieza donde termina el menú |
| Los 6 roles | Cada uno ve su menú (16.3); lo que no le toca lo manda a su pantalla principal. El 4 (consumidor final) va al index desde cualquier pantalla del panel |
| ☰ a 390 px | Abre y cierra (también tocando lo oscuro); la página no se mueve de costado |
| Cerrar sesión | Desde una pantalla de `pages/` y desde Inicio: vuelve a `/` sin la sesión |
| Consultar Pedidos, solo leyendo (21 pruebas) | Al abrir, la fecha del próximo día hábil. Fecha 21/10, buscar por nombre y por número, buscar algo que no existe, "Ver todos" y cada estado: las cantidades de los botones suman "Todos" y coinciden con la lista. Página 2, ›, ‹ y los avisos: todo bien |
| Consultar Pedidos con el pedido de prueba **#039** "PRUEBA – NO PREPARAR" (Combo semanal x5, retiro, Transferencia, entrega 21/10) | Detalles, Pago (Mixto, "Suma correcta", Cancelar no manda nada), Confirmar pago ("No" vuelve a Registrado; "Sí, ya pagó" lo dejó en Listo para Entregar y cobrado), Guardar el pago, Anular (PIN corto: error; el del `.env`: "Volvieron 5 viandas a la heladera") y la fila apagada. La heladera quedó igual |
| Las ventanas a 390 px | Entran y se ven bien |
| Anchos 1280, 1024 y 1920 | 1920 entra entera; 1440, 1280 y 1024 se mueven de costado solo adentro de la tabla |
| Test HELADERA | **40/40** dos veces (#040, #041 y después #042, #043). Los 5 pedidos de prueba quedaron anulados |

**Capturas:** `diseno-panel-v2/capturas/` (no se sube a git):
- las 13 pantallas a 1440 y 390 (`final-…`);
- `comparaciones/` (antes | después, referencia | nuestra, y las 13 a 390);
- `ventanas/`;
- el menú abierto a 390 y el menú de cada rol.

### 16.9 Seguridad (qué protege cada cosa)
- **Lo que viene de la base** pasa por `escHtml` o va con `textContent`. Así un nombre, una dirección o un "sin sal" con
  `<script>` se muestra como texto y no se ejecuta (XSS). Vale para: nombre, dirección, teléfono, mail, barrio, combos,
  platos, método de pago y personalizados. El nombre del menú también va con `textContent`.
- **Las cantidades de los estados** se cuentan en la pantalla con los pedidos que ya llegaron de `GET /api/pedidos`. Esa ruta
  sigue con `requireAuth` + `requireRol`: no hay rutas nuevas, así que no se abrió ninguna puerta.
- **El menú solo ordena las pantallas.** `guard.js` bloquea las direcciones, y la protección de verdad sigue en el servidor:
  token + rol en cada ruta. Un usuario que se cambie el rol en el navegador ve otro menú, pero el servidor le contesta
  según su token.
- **Pago y anulación:** los controla el servidor como antes (el total de la base, y el PIN, que no está en el frontend).
- **Las pruebas:** el PIN, el usuario y la clave salen del `.env` y no se mostraron. Se usó un solo pedido de prueba y no se
  tocó ningún pedido real.

### 16.10 Lo que no quedó igual a la referencia (y por qué)
- **El menú:**
  - los nombres son los de hoy ("Envíos del Día", "Gestión de Usuarios", "Generar Receta"…);
  - están "Inicio" y "Asignar Cocineros";
  - no están "Pedir a cocina", "Compras" ni "Productos" (decisiones 1 a 3);
  - el rol dice "Administrador del sistema" (el nombre de `roles.js`) y baja en 2 renglones; la referencia dice "Admin del sistema".
- **Los títulos de la tabla:** verdes, sin mayúsculas y más grandes, como pediste en el ajuste (16.12). La referencia los
  tiene grises, en mayúscula y de 12 px.
- **A 1440 la tabla no entra:**
  - con los datos reales y la letra nueva, la tabla mide unos 1420 px y la tarjeta 1094;
  - se mueve de costado adentro de su tarjeta, y "Acciones" queda a la derecha (hay que mover la tabla para verla);
  - la de la referencia tampoco entraba: medía 1264 px en 1109, y cortaba "Acciones";
  - a 1920 entra entera;
  - para que entre a 1440 habría que achicar cosas (ver 16.11).
- **La fecha de entrega con el año** ("20/10/2026"): la referencia muestra "16/10". Es el dato tal cual se mostraba.
- **"Mostrando 1 de 1 pedidos":** con uno solo, la palabra queda en plural.
- **El aviso de Anular:** dice "Si el pedido no se entregó, las viandas vuelven a la heladera". La referencia dice que vuelven
  siempre, pero un pedido entregado no devuelve viandas.
- **Mixto:** el "$" queda adentro del casillero, como antes; la referencia lo pone en el texto gris.

### 16.11 Avisos
- **El pedido #013 (no es de prueba nuestro) cambió de "Entregado" a "Listo para Entregar"** entre las 10:50 y las 11:33 del
  19/10. Ese rato yo solo estaba escribiendo archivos, sin pedirle nada al servidor, y el servidor no tiene tareas
  automáticas. Fijate si fueron vos o tu prima desde la app.
- **Producción:**
  - su tabla es angosta (comparte la pantalla con "Últimos movimientos");
  - con la letra y el aire nuevos, "MANTENIMIENTO" baja en 3 renglones (antes, en 2);
  - se arregla al rediseñar esa pantalla, o bajando `--celda-espacio`.
- **`roles.js` sigue con los textos con emoji** (`menu`): el menú ya no los usa (usa `MENU_PANEL`). No se tocó.
- **`adminSidebar.css` no se usa más:** queda sin borrar, para decidir.
- **Para que la tabla entre a 1440:**
  - la fecha como la referencia (20/10), los botones de Acciones en dos renglones, celdas con menos aire o volver a la
    letra de 14 px;
  - aun juntando las tres primeras, sigue sin entrar;
  - la otra opción es dejar "Acciones" siempre a la vista, pegada a la derecha, pero tapa "Costo" y "Estado" hasta que se
    mueve la tabla.

### 16.12 Ajuste (19/10, tarde): sin el renglón "Producción de hoy", títulos de tabla verdes y letra más grande
- **Se sacó el renglón "Producción de hoy…":** su `<h2 id="tituloListado">` del HTML, la parte "1. El título" de
  `renderizarPedidos` (34 líneas), `hoyISO` y su regla `.titulo-listado`. El filtro de fecha queda igual.
- **Las tablas del panel** (`.standard-table` y `.grilla-fg`), en `global.css`:
  - títulos con fondo blanco, verde `#127f36`, 14,5 px y negrita 800, sin mayúsculas, con una línea de 2 px `#cfe5d5`;
  - celdas de 15 px, con 15 px de aire arriba y abajo y 12 px a los costados, y la línea `#edf1ec` entre renglones;
  - al pasar el mouse, `#f6faf6`.
- **En Consultar Pedidos**, cada celda con su clase `col-…`:
  - N° verde de 15,5 px;
  - Entrega, Cliente, Viandas y Costo en negro y negrita; Cliente y Costo de 16 px;
  - Teléfono y Mail de 13,5 px, en gris;
  - Estado, la pastilla de pago y los botones de 13,5 px y 35 px de alto.
- **Ajuste (19/10, noche):** solo las perillas de `global.css`: títulos de las tablas de 14,5 a **15,5 px** (`--letra-titulos-tabla`) y celdas de 15 a **13,5 px** (`--letra-celdas-tabla`). Vale para todas las tablas del panel. Capturas: `diseno-panel-v2/capturas/letra-1440-…`. La tabla de Consultar Pedidos sigue sin entrar entera a 1366/1440: queda el scroll de costado adentro de la tabla (decisión del usuario).

---

## 17. Producción y panel nuevos (`diseno-produccion/`) — Paso 1: el panel (20/10)
**Qué se pidió:** el menú lateral y la barra de arriba como el diseño, y la letra Inter en el panel. El index no se toca.

| Archivo | Qué cambió |
|---|---|
| `.gitignore` | `diseno-produccion/` |
| `src/js/adminSidebar.js` | Solo el HTML que arma, más la función nueva `achicarMenu` (abajo). Los permisos siguen saliendo de `roles.js` |
| `src/css/menuPanel.css` | Reescrito: menú de 264 px, menú achicado de 76 px, barra de arriba y celu |
| `src/css/global.css` | `--fuente: "Inter", …` (antes Figtree) y 2 comentarios |
| `login.html`, `admin.html` y las 11 de `pages/` | El link de Google Fonts: Figtree → Inter (400;500;600;700;800). Poppins sigue donde el CSS propio la usa |

**El menú:**
- logo redondo, "Fast & Good" y PANEL;
- la lista **sin títulos de grupo** (los grupos se separan con 10 px de aire: clase `menu-link-grupo-nuevo`);
- íconos de línea más finos;
- la pantalla actual con fondo verde suave y letra verde;
- abajo el avatar, el nombre, el rol (con "…" si no entra) y salir;
- la flechita del borde para achicarlo.
Las mismas pantallas y nombres de hoy, con "Inicio" arriba; sin Pedir a cocina, Compras ni Productos.

**El globito de Tareas de Cocina:** `#menuContadorCocina`, preparado y **escondido** (`hidden`). No se le pide nada al
servidor. Para usarlo: escribir el número y sacarle el `hidden`.

**La barra de arriba** (en todas las pantallas del panel):
- blanca, con una línea finita;
- a la izquierda, el buscador "Buscar… Ctrl K", **solo visual** (no busca y Ctrl K no hace nada);
- a la derecha, el avatar con la inicial (`#barraAvatar`, lo escribe `cargarDatosUsuario`);
- en menos de 900 px, el ☰ a la izquierda.
Lleva las clases `barra-menu-celu` (el nombre de antes) y `barra-panel` (el estilo).

**`achicarMenu(achicar)`** (nueva, `adminSidebar.js`):
- **Qué hace:** achica el menú a solo íconos (76 px) o lo vuelve a su ancho (264 px). Solo en compu.
- **ENTRADA:** `true` (achicar), `false` (agrandar) o nada (lo contrario de cómo está).
- **SALIDA:** pone o saca `menu-achicado` en el `<body>` (el CSS cambia `--menu-ancho` y se corren la barra y el
  contenido), cambia el texto del botón y guarda la elección en el navegador (`menu_achicado`). Si no se puede guardar,
  el menú anda igual.
- **Ejemplo:** tocar la flechita → solo íconos; abrir otra pantalla → sigue achicado; tocarla otra vez → vuelve.
- **Se conecta con:** la flechita `#menuBotonAchicar`. Al abrir cada pantalla se llama con lo que estaba guardado.

`cargarDatosUsuario` además escribe la inicial en el avatar de la barra.

**Comprobado** (copia del servidor en el 3001, cortando todo lo que no fuera GET):
- las 13 pantallas a 1440 y 390 px: menú, barra y contenido en su lugar, sin scroll de costado y sin errores;
- menú achicado (76 px) que se acuerda al cambiar de pantalla;
- en el celu, el ☰ abre el menú entero (272 px) aunque en compu estuviera achicado, y lo oscuro lo cierra;
- la barra del celu entra a 360 y 390 px;
- los roles 1, 2, 3 y 5 ven su menú y abren solo lo suyo;
- el panel con Inter y el index con Figtree;
- test 40/40.
Capturas: `diseno-produccion/capturas/paso1/`.


## 18. Producción con el diseño nuevo (21/10, `diseno-produccion/`)
**Qué se pidió:** pasar a la pantalla real el diseño aprobado de Producción (la pantalla y sus 5 ventanas), con estas
excepciones: el menú y la barra de arriba quedan como están, los títulos de las tablas siguen el estilo de `global.css`,
"Libres" se llama "Disponibles", y el celu se arma aparte (el del diseño estaba roto).
Lo de los días 20/10 y 21/10 a la mañana (Producción "Paso 2", los ajustes de la tabla y los nombres Disponibles / Total)
no se anotó acá por la regla de los cambios de diseño; esta vez se anota porque lo pediste.

### 18.1 Tus decisiones (21/10)
1. **Letra:** queda **Inter** en el panel (no se carga Figtree; el index sigue con Figtree).
2. Dos clases que eran solo de CSS se renombraron para llevarlas a `global.css`: `ventana-produccion` → `ventana-panel` y
   `buscador-platos` → `buscador-tabla`. El JS no las usaba.
3. Las flechas de orden: quedan las 5 de hoy (Plato, Plan, Estado, Disponibles y Total).
4. **Motivo del descarte:** una lista con un primer renglón "Elegí el motivo" (Vencido, En mal estado, Envase roto,
   Error de carga, Otro). Si no se elige, el error dice "Elegí el motivo.".
5. Lo nuevo: **sí** a "Pedir a cocina" en el menú ⋯ (abre la ventana con ese plato ya buscado). **No** al botón ⇅
   "Ordenar por", **no** a la fecha "20 oct 2026", y **por ahora no** a la inicial del cocinero ni a los textos
   "Para hoy · Pedido a cocina #N" (están en `pedidosCocina.js`, que es compartido con Tareas de Cocina).
6. La tabla: si no entraba en 1440, Plato baja a **27 %** y los títulos siguen con el estilo de `global.css`. No entraba
   (con 29 % faltaban unos 12 px y se cortaban Disponibles, Reservadas y Total), así que quedó en 27 %.
7. La pestaña "Sin mínimo" queda como hoy (aparece solo si hay platos sin mínimo).

### 18.2 Qué archivos cambiaron
| Archivo | Qué cambió |
|---|---|
| `pages/heladera.html` | El título (sin las migas, con la bajada nueva y los 4 botones a la derecha); la tarjeta con la barra (pestañas, buscador y "Plan") y los filtros elegidos adentro; "Pedir a cocina" en el menú ⋯; el Motivo como lista; las 2 clases renombradas; `paginacion-con-palabras`; `panel-lateral` en el panel de movimientos |
| `src/css/global.css` | Perillas nuevas (sección 0) y la sección 13 nueva con las piezas que se repiten. **No cambia ninguna otra pantalla**: cada pieza tiene su clase propia |
| `src/css/heladera.css` | Reescrito: solo lo propio de Producción. Sin `!important`, sin `:has()`, sin `:where()` |
| `src/js/heladera.js` | 7 líneas que hacen algo (más comentarios): ver 18.4 |
| `src/js/pedirCocina.js` | `abrirPedirACocina` recibe un plato opcional: ver 18.4 |

No cambió: `server.js`, las rutas, `sql/`, `pedidosCocina.js`, `paginacion.js`, ningún id, ninguna validación, ni lo que se
manda al servidor.

### 18.3 HTML (`heladera.html`)
| Antes | Ahora | Por qué |
|---|---|---|
| Migas "Cocina › Producción", título y frase; "+ Pedir a cocina" solo a la derecha | Título "Producción", la bajada "Controlá las viandas que hay en la heladera…" y a la derecha **los 4 botones**: Pendientes de cocina, Hecho hoy, Últimos movimientos y + Pedir a cocina (`div.botones-cabecera`) | Como el diseño. Los botones son los mismos (mismos ids y `onclick`), solo cambiaron de lugar |
| Pestañas, buscador y "Filtros" sueltos arriba de la tabla | Adentro de la tarjeta, en `div.barra-tarjeta`: las pestañas a la izquierda y el buscador con "Plan" a la derecha (`div.filtros-tarjeta`). Los chips de los planes, debajo, también adentro | Como el diseño |
| Botón "Filtros" | El mismo botón (`#btnFiltroPlan`) dice "Plan" | Como el diseño |
| Menú ⋯: Ver movimientos · Descartar | Ver movimientos · **Pedir a cocina** (`#menuFilaPedir`, escondido para el cocinero) · Descartar | Aprobado (18.1, punto 5) |
| `<input id="dMotivo" type="text">` | `<select id="dMotivo">` con "Elegí el motivo" (vacío) y los 5 motivos | Aprobado (18.1, punto 4). El JS lo lee igual (`.value.trim()`) y el servidor recibe el texto igual que antes |
| `class="… ventana-produccion"` (4 ventanas) | `class="… ventana-panel"` | Aprobado (18.1, punto 2): ahora está en `global.css` |
| `label.buscador-platos` | `label.buscador-tabla` | Ídem |
| `<div id="paginacion" class="paginacion">` | `class="paginacion paginacion-con-palabras"` | "‹ Anterior 1 Siguiente ›" de `global.css` sin tocar `paginacion.js` (las otras pantallas siguen con los circulitos) |
| `<aside class="panel-movimientos">` | `class="panel-lateral panel-movimientos"` | El panel que entra por la derecha está en `global.css` |
| Ícono `icono-chevron-derecha` (de las migas) | Sacado | Ya no se usaba |

### 18.4 JS, línea por línea
**`heladera.js`**
| Dónde | Antes | Ahora | Por qué |
|---|---|---|---|
| `iniciarProduccion`, paso 1 | — | `document.getElementById('menuFilaPedir').hidden = !puedeAdministrar;` | "Pedir a cocina" del ⋯ solo para los roles 6, 5 y 1 (igual que "+ Pedir a cocina"). **Seguridad:** es solo para que no se vea; el servidor igual revisa el rol en `POST /api/ordenes-produccion` |
| `iniciarProduccion`, paso 5 | 2 opciones del menú | 3ª opción: busca el plato del menú (`find`), cierra el menú y llama `abrirPedirACocina(plato.nombre)` | Lo nuevo aprobado |
| `renderizarTabla`, pestañas | `className = 'btn-filtro-estado pestana-estado'` | `… + ' pestana-' + opcion.valor` (ej: `pestana-bajo`) | Solo para mostrar: la pestaña elegida toma el color de su estado |
| `renderizarTabla`, pestañas | `innerHTML = texto + cantidad` | `const puntito = …` (vacío en "Todos") y `innerHTML = puntito + texto + cantidad` | Solo para mostrar: el puntito de color del diseño. Texto nuestro y número: sin datos de la base |
| `renderizarFiltroPlan` | — | `btnFiltroPlan.classList.toggle('con-filtros', hayElegidos)` | Solo para mostrar: "Plan" con borde verde si hay planes elegidos |
| `confirmarDescarte` | `'Escribí el motivo del descarte.'` | `'Elegí el motivo.'` | El motivo ahora se elige de una lista. El control es el mismo (`!motivo`) |
| Comentarios | "dos opciones", "el motivo, vacío" | "tres opciones", "Elegí el motivo (la opción vacía)" | Que digan lo que pasa |

**`pedirCocina.js` — `abrirPedirACocina(nombrePlato)`**
- **Antes:** `abrirPedirACocina()` sin datos: arrancaba con "Sin stock" y "Bajos" si faltaba algo, y Buscar vacío.
- **Ahora:**
  - **Qué hace:** lo mismo, y si se le pasa un plato, abre con ese plato ya buscado.
  - **ENTRADA:** `nombrePlato`, opcional. Sin nada lo llaman "+ Pedir a cocina" y la ventana Pendientes (en el HTML se
    llama `abrirPedirACocina()`, así que llega vacío).
  - **SALIDA:** la ventana abierta. Con un plato: Buscar = su nombre y la pestaña "Todos" (para verlo esté como esté).
  - **Por qué:** se arrancaba en "Sin stock + Bajos": un plato "Bien" no se vería. Cambian 3 líneas:
    `const platoBuscado = nombrePlato || '';`, `const arrancaConFaltantes = faltan > 0 && !platoBuscado;` y
    `pBuscar.value = platoBuscado`.
  - **Ejemplo:** ⋯ de canelones → "Pedir a cocina" → la ventana con "canelones" en Buscar y solo esa fila.
  - **Se conecta con:** `iniciarProduccion` (la opción del ⋯), el botón de arriba y la ventana Pendientes. Lo que manda
    al servidor (`enviarPedidoACocina`) no cambió.

### 18.5 CSS
**`global.css`, sección 13 (nueva).** Cada pieza con su clase: una pantalla la usa solo si pone esa clase.
| Pieza | Clases |
|---|---|
| Botones de arriba (blanco con número y el verde) | `boton-ventana`, `cantidad-ventana`, `boton-pedir-cocina`, `icono-boton` |
| Pestañas de estado (con puntito y número; la elegida con el color de su estado) | `pestanas-estado`, `pestana-estado`, `pestana-todos/-sin/-bajo/-bien/-sincontrol`, `punto-pestana`, `cantidad-pestana` |
| Buscador de una tarjeta | `buscador-tabla` (con `icono-lupa` y `atajo-teclado` adentro) |
| Pastillas de estado | `etiqueta-estado`, `estado-bien/-bajo/-sin/-sincontrol` (el `.punto-estado` se escribe adentro de `.etiqueta-estado`, porque Consultar Pedidos tiene otro `.punto-estado`) |
| Filtros elegidos | `chip-filtro`, `quitar-chip`, `boton-limpiar-todo` |
| Ventanas nuevas | `ventana-panel`, `cabecera-ventana`, `icono-ventana`, `icono-ventana-peligro`, `textos-ventana`, `frase-ventana`, `boton-cerrar-ventana`, `cuerpo-ventana`, `pie-ventana`, `botones-ventana`; y `.btn-cancelar`, `.btn-confirmar`, `.boton-peligro` y `.modal-error` **solo adentro de `.ventana-panel`** (las otras pantallas tienen los suyos) |
| Panel que entra por la derecha | `panel-lateral` (y su animación) |
| Paginación con palabras | `paginacion-con-palabras` |
| Celu | Las ventanas nuevas a pantalla completa, y su cuerpo mide lo que tiene adentro (sin hueco entre el contenido y los botones) |

**`heladera.css` (reescrito):**
- perillas propias (sección 0);
- el título y los 4 botones;
- la tarjeta con su barra;
- la tabla: anchos, colores de fila y números (15 px semibold, ✎ a la izquierda);
- el menú ⋯;
- lo de adentro de cada ventana: Pedir a cocina, Pendientes (con reglas `.modal-pendientes …`), Hecho hoy, el panel de
  movimientos y Descartar;
- el aviso flotante;
- el celu.

**Cosas que se sacaron:**
- `[hidden] { display: none !important; }` → ahora va una regla `[hidden]` chiquita por cada clase que lo necesita;
- `.pie-movimientos:has(…)` → "Ver más" lleva su propio margen y el pie no ocupa lugar cuando está escondido;
- `:where(…) svg` → cada ícono tiene su tamaño.

La tabla ya no pisa los títulos: toma los de `global.css` (verdes, 15,5 px, línea verde de 2 px). La de "Pedir a cocina"
usa las mismas perillas.

### 18.6 Perillas nuevas
**`global.css` (sección 0, "Piezas del panel nuevo"):**
| Perilla | Valor | Para qué |
|---|---|---|
| `--borde-casillero` | `#d9e1d7` | borde de casilleros y botones de las ventanas |
| `--gris-encima` | `#f4f7f3` | fondo de los botones blancos al pasar el mouse |
| `--texto-suave` | `#7a857d` | ejemplos de los casilleros, "Ctrl K", números de las pestañas |
| `--icono-suave` | `#8a948d` | la ⓘ, el ✎ y la X |
| `--verde-borde` | `#cfe7d6` | borde verde clarito |
| `--alto-boton-panel` | `40px` | alto de los botones de arriba |
| `--alto-control-panel` | `34px` | alto del buscador y de "Plan" |
| `--radio-boton-panel` | `12px` | esquinas de botones, casilleros y menús |
| `--radio-chico` | `10px` | esquinas de pestañas, buscador y "Plan" |
| `--sombra-chica`, `--sombra-tarjeta-panel` | — | la sombrita de los botones y la de la tarjeta de la tabla |
| `--fondo-ventana-panel` | `rgba(40,44,41,.72)` | lo oscuro detrás de las ventanas nuevas |
| `--ancho-panel-lateral` | `460px` | ancho del panel de la derecha |
| `--estado-bien/-bajo/-sin/-nada-fondo/-letra/-punto/-borde` | — | los colores de cada estado (pastillas y pestañas) |

**`heladera.css` (sección 0):**
| Perilla | Valor | Para qué |
|---|---|---|
| `--prod-tabla-ancho-minimo` | `1088px` | lo más angosta que queda la tabla (si no entra, se mueve de costado adentro de su tarjeta) |
| `--prod-ancho-plato` | `27%` | ancho de Plato |
| `--prod-ancho-plan / -estado / -disponibles / -reservadas / -total / -minimo / -menu` | 160 / 106 / 152 / 134 / 100 / 86 / 54 px | lo justo para cada título |
| `--prod-fila-alto` | `10px` | aire arriba y abajo de cada fila |
| `--prod-letra-numeros`, `--prod-color-numeros` | `15px`, `#26312a` | Disponibles, Reservadas, Total y Mínimo |
| `--prod-fila-bajo / -sin (+ -encima)`, `--prod-fila-encima` | amarillo / rojo suaves | el fondo de las filas |

### 18.7 Cómo se comprobó
Con la copia del servidor en el 3001 y un Chrome sin ventana. **Nada llegó a la base:** cada POST y PUT se atajó en el
navegador, se guardó lo que la pantalla iba a mandar y se le contestó una respuesta falsa. "Pendientes de cocina" se probó
con una lista falsa de 2 platos "PRUEBA – NO PREPARAR". Así no se tocó ningún pedido real, ni los 9 del 08/10, ni insumos ni
viandas de verdad.

34 de 34 controles bien y consola sin errores:
- **1440:**
  - los 4 botones arriba, sin migas, las pestañas con puntito, el buscador y "Plan" adentro de la tarjeta;
  - los títulos verdes de `global.css` y la letra Inter;
  - ningún `style=""` y sin `stock.css`;
  - la tabla entera, sin scroll de costado, y ningún ícono sin tamaño.
- **Pestañas, orden y ayudas:**
  - pestaña "Bien" con su color;
  - ordenar por Disponibles (sube y baja) y el orden se mantiene al recargar;
  - el cartelito de la ⓘ.
- **Plan:** tildar uno → el chip adentro de la tarjeta y el botón marcado; su ✕ lo saca.
- **Lo que la pantalla manda** (atajado), lo mismo que antes:
  - **Mínimo:** ✎ → 7 → Enter → `PUT /api/viandas-stock/3/minimo {"stock_minimo":7}`.
  - **⋯ → Pedir a cocina:** abre con el plato buscado y en "Todos"; + + → Enviar →
    `POST /api/ordenes-produccion {"fecha_para":"2026-10-22","items":[{"id_producto":2,"cantidad":2}]}`, y la ventana se cierra.
  - **Descartar:**
    - el Motivo es la lista y arranca en "Elegí el motivo";
    - sin elegir → "Elegí el motivo." y no manda nada;
    - con "Vencido" → `POST /api/viandas-stock/descarte {"id_producto":3,"cantidad":1,"motivo":"Vencido"}`.
  - **Pendientes:** tarjetas por cocinero, sin la línea de resumen; "Hecho" → `POST /api/ordenes-produccion/detalles/990001/hecho` (plato falso).
- **Hecho hoy, movimientos y búsqueda:**
  - "Hecho hoy" → "Ver movimientos" abre el panel;
  - el filtro Ventas y "Ver movimientos del plato" muestran solo eso;
  - buscar algo que no existe → "No hay platos" con "Limpiar filtros".
- **1280 y 1024:** la página sin scroll de costado y los botones de arriba enteros. La tabla se mueve de costado adentro
  de su tarjeta (151 y 407 px).
- **Cocinero:** sin "+ Pedir a cocina", sin ✎ y sin "Pedir a cocina" en el ⋯.
- **390 (celu):**
  - el título arriba y los 4 botones en 2 columnas;
  - las pestañas, el buscador y "Plan" uno debajo del otro, del ancho de la tarjeta;
  - la tabla con scroll adentro y la página sin scroll de costado;
  - las 5 ventanas a pantalla completa.
- `node tests/test_e2e.js heladera`: **40/40**.

Capturas: `diseno-produccion/capturas-resultado/` (1440 y 390: la pantalla y cada ventana).

### 18.8 Seguridad (qué protege cada cosa)
- Los nombres de los platos y de los planes siguen pasando por `escHtml` antes del `innerHTML`, también en el buscado de
  "Pedir a cocina" (va con `.value`, que no interpreta HTML). Protege de que alguien guarde código en un nombre y se
  ejecute en el panel (XSS).
- "Pedir a cocina" del ⋯ se esconde para el cocinero, pero eso es solo lo que se ve. El que decide es el servidor: la ruta
  sigue con `requireAuth` + `requireRol` y vuelve a controlar platos, cantidades y fecha. Protege de alguien que se
  saltee la pantalla y mande el pedido a mano.
- El Motivo ahora es una lista, pero el servidor lo sigue validando como antes (texto no vacío, hasta 200 caracteres).
  Protege de alguien que mande otro texto a mano.

### 18.9 Lo que no quedó igual al diseño (y por qué)
- **Letra Inter** (decisión tuya). En el diseño también es Inter: el pedido decía Figtree, pero quedó Inter.
- **Menú y barra de arriba:** los nuestros (excepción).
- **Títulos de las tablas:** verdes, 15,5 px y con línea verde (los de `global.css`, excepción). El diseño los tiene grises y
  chicos sobre una franja gris. Por eso Plato quedó en 27 % y no en 29 %.
- **Números:** 15 px semibold todos iguales (excepción); en el diseño son de 14 px normales.
- **Flechas de orden** en 5 títulos (decisión tuya); el diseño solo la tiene en Plato.
- **Sin el botón ⇅ "Ordenar por"** (decisión tuya).
- **"Para cuándo"** es el campo de fecha del navegador (22/10/2026), no "20 oct 2026" con ícono (decisión tuya).
- **Pendientes:**
  - sin la inicial del cocinero;
  - con "para el 21/10 HOY · pedido #6" y el plan entre paréntesis, en vez de "Para hoy · Pedido a cocina #6";
  - cada tarjeta dice "1 plato · 3 viandas".
  Es lo que arma `pedidosCocina.js`, compartido (decisión tuya). Los renglones de "hoy" y "atrasado" siguen pintados de
  amarillo y rojo clarito, como antes.
- **"Mostrando 4 de 4 platos"** sin los números en negrita: el texto lo escribe `paginacion.js` (compartido) como texto
  común.
- **La descripción chiquita debajo del plato** no se ve: hoy ningún plato tiene descripción cargada. Las filas quedan más
  bajas que en el diseño.
- **Los planes en mayúsculas** ("MANTENIMIENTO"): vienen así de la base.
- **"Ctrl K"** del buscador: de adorno (como el de la barra de arriba).
- **"Pedir a cocina" en el ⋯:** no está en la referencia (la pediste vos). Va entre "Ver movimientos" y la raya de "Descartar".
- **Celu:** armado aparte, como pediste (el del diseño estaba roto).

**Ajuste (21/10, noche):** los títulos de TODAS las tablas del panel quedaron como el diseño de Producción (franja `#f5f7f4`, letra `#4a564d` de 12,5 px y peso 500, `.015em`, aire 9/18 px con la perilla nueva `--aire-titulos-tabla`, línea de 1 px `#e6ebe4`; flechitas de 13 px grises), solo con las perillas de `global.css` (secciones 0 y 8), y Plato volvió a 29 % porque ahora entra todo en 1440.

## 19. Panel con el diseño final (27/10, `diseno-panel-final/`): el molde, Producción y Consultar Pedidos
**Qué se pidió:** pasar al panel real el diseño final de `diseno-panel-final/` (las 6 capturas y `PROMPT.md`): primero el
molde común en `global.css` y la barra de arriba (parte A), después Producción con "Pedir a cocina" (parte B) y después
Consultar Pedidos (parte C). Todo de corrido, sin esperar, cambiando lo mínimo: JS solo para mostrar algo, sin tocar datos,
rutas, validaciones, `server.js` ni `sql/`. El plan está en `diseno-panel-final/PLAN.md` (su sección 8 dice lo que cambió
al programar). Sin commit.

### 19.1 Choques con el CLAUDE.md (y qué se hizo)
1. El CLAUDE.md dice "de a un paso chico y frenar"; el pedido dice "todo de corrido, sin esperarme": se siguió el pedido.
2. El CLAUDE.md dice que en los cambios de diseño no se actualizan el INFORME ni el AVANCE y no se sacan capturas; el pedido
   pide las tres cosas: se siguió el pedido.
3. El pedido dice "test completo (`node tests/test_e2e.js`)", pero el mismo test avisa que sin "heladera" no se corre
   contra la base real (crea un producto, pasa pedidos a 3 y 4 y gasta insumos). Se corrió `node tests/test_e2e.js heladera`.

### 19.2 Qué archivos cambiaron
| Archivo | Tipo | Qué cambió |
|---|---|---|
| `.gitignore` | — | `diseno-panel-final/` (las capturas y las referencias no se suben) |
| `pages/heladera.html` | HTML | La bajada nueva, Estado después de Total, el pie adentro de la tarjeta y la ventana "Pedir a cocina" (19.3) |
| `pages/ConsultarPedidos.html` | HTML | La bajada, la barra de filtros en 3 partes con la lista de Estado y la tabla en 9 columnas (19.3) |
| `src/css/global.css` | CSS | El molde: perillas (19.6), título y bajada, tablas, pie "Mostrando X de Y", páginas y la sección 13 (19.5) |
| `src/css/menuPanel.css` | CSS | Sección 5: la barra de arriba ("Panel / pantalla" y la fecha). El menú no se tocó |
| `src/css/heladera.css` | CSS | Secciones 0, 3 a 6 (con la 6b nueva), 9 y 15 reescritas; `.quitar-chip` vino de global |
| `src/css/ConsultarPedidos.css` | CSS | Secciones 0, 2 a 6 y 9 reescritas. Las ventanas (7) y los avisos (8), igual |
| `src/css/movimientosStockNuevo.css` | CSS | Los títulos y las celdas de su tabla con las perillas del molde (antes: franja verde propia) |
| `src/js/adminSidebar.js` | JS | La barra de arriba (19.4) |
| `src/js/paginacion.js` | JS | "Mostrando" con los números en negrita (19.4) |
| `src/js/heladera.js` | JS | El orden de las columnas, Total en negrita, el "—" y el plan elegido en el botón (19.4) |
| `src/js/pedirCocina.js` | JS | Las pestañas con puntito, "10 viandas" y "Para el miércoles 28/10" (19.4) |
| `src/js/ListarPedidos.js` | JS | La fila en 9 celdas, `colspan` 9 y la lista de Estado (19.4) |

**No cambió:** `server.js`, las rutas, `sql/`, la base, lo que se manda al servidor, las validaciones, ningún id, ninguna
función renombrada, el menú de la izquierda y las ventanas (salvo "Pedir a cocina", que tenía diseño nuevo).

### 19.3 HTML
**`heladera.html` (Producción)**
| Antes | Ahora | Por qué |
|---|---|---|
| Bajada "Controlá las viandas que hay en la heladera, cuáles ya están reservadas para pedidos…" | "Controlá las viandas de la heladera, cuáles están reservadas y pedile a la cocina lo que falta.", con la clase del molde `bajada-pantalla` | El texto del diseño |
| Botón "Plan", su menú y "Limpiar filtro" | Los mismos, con una clase más del molde (`boton-filtro`, `menu-filtro`, `limpiar-filtro`) y el "·" en su propia cajita (`separador-filtro`) | Que tomen el molde y se lea "Plan · Mantenimiento" |
| Títulos: Plato · Plan · Estado · Disponibles · Reservadas · Total · Mínimo | Plato · Plan · Disponibles · Reservadas · Total · **Estado** · Mínimo | El orden del diseño |
| El pie ("Mostrando…" y las páginas) afuera de la tarjeta, con `paginacion-con-palabras` | Adentro de la tarjeta, con la pieza del molde `pie-tabla`; `#paginacion` solo con `paginacion` | Como el diseño. "Anterior / Siguiente" ahora las pone global en todas las pantallas |
| Los ••• con círculos de 1,6 | Círculos de 2,4 | El ••• del diseño |
| "Pedir a cocina": 3 casilleros sueltos | Cada uno en su cajita (`caja-control`) con 📅, ▾ o lupa. Mismos ids | Los campos del diseño |
| Pestañas y "Cargar rápido a los que se ven", sueltos arriba de la tabla | Adentro de la tarjeta de la tabla (`tarjeta-tabla-pedido` > `barra-tabla-pedido`); dice "Cargar rápido:" (lo de "a los que se ven" quedó en el `title`) | Como el diseño |
| "Enviar a cocina", solo texto | Con el ícono del avioncito | El diseño (el JS solo lo prende y apaga: nunca cambia su texto) |
| `#modalPedido` con `modal` | `modal fondo-ventana-pedido` | Lo de atrás más clarito, como la captura |

**`ConsultarPedidos.html`**
| Antes | Ahora | Por qué |
|---|---|---|
| Solo el título | El título y la bajada "Buscá, filtrá y gestioná los pedidos de los clientes: estado, pago y detalle." | El diseño |
| "Buscar" y "Fecha de entrega" con su nombre arriba, Aplicar y Ver todos | Una barra de 38 px en 3 partes: 🔍 Buscar · 📅 "Entrega: …" · 🕒 "Estado: …", y al lado Aplicar y Ver todos. Mismos ids (`CampoBusqueda`, `FechaDesde`, `FechaHasta`, `btnAplicarFechas`, `btnVerTodos`) | El diseño |
| `#FechaDesde` | Con `required` y al lado el texto "Cualquier día", que solo se ve con la fecha vacía | Que diga "Cualquier día" sin JS. No hay formulario: `required` no cambia nada más |
| Los 6 botones de estado en una fila arriba de la tabla | Los mismos 6 botones (con su `data-estado`, sus clics y sus cantidades) adentro de la lista que abre "Estado", con `data-nombre` | La lista del diseño; elegir uno hace lo mismo que antes |
| Tabla de 11 columnas | 9: Pedido · Cliente · Dirección · Teléfono · Viandas · Costo · Pago · Estado · Acciones | El diseño |
| Los dibujos ✓ y billete (de la pastilla de pago) | Sacados; nuevos: calendario, reloj y ▾ | La pastilla de pago ya no está |

### 19.4 JS, línea por línea (los números de línea son los de ahora)
**`adminSidebar.js`: la barra blanca de arriba** (corre sola al abrir cada pantalla del panel)
| Línea | Antes | Ahora | Por qué |
|---|---|---|---|
| 50–51 | — | `DIAS_SEMANA` y `MESES_ANIO` | Para "Martes 27 de octubre" |
| 166–169 | — | `pantallaActual` (la de esta página en `MENU_PANEL`, con `find`), `nombrePantalla` y `fechaDeHoy` | "Panel / Producción" y la fecha |
| 172–178 | El buscador (de adorno) y el círculo "M" | "Panel" / el nombre (con `textContent`) y la fecha. Una pantalla que no está en el menú muestra solo "Panel" | El diseño no tiene buscador ni avatar |
| 244–245 (sacadas) | Escribían la inicial en el avatar | — | El avatar ya no existe (si no, daba error) |
- **ENTRADA:** la página abierta (`paginaActual`) y la fecha de la compu. **SALIDA:** la barra "Panel / Producción ·
  Martes 27 de octubre". **Ej:** `heladera.html` → "Panel / Producción". **Se conecta con** `MENU_PANEL`, la misma lista del
  menú. Los textos son nuestros y van con `textContent`.

**`paginacion.js`: `crearPaginacion` → `renderizar`**
| Línea | Antes | Ahora | Por qué |
|---|---|---|---|
| 108–117 | `textContent = 'Mostrando 4 de 4 platos'` | Dos `<strong>` armados con `createElement` y `append` | El diseño tiene los números en negrita. Sin `innerHTML`: nada se interpreta como HTML |
Solo cambia en Producción y Consultar (las que le pasan dónde va el resumen).

**`heladera.js`**
| Línea | Función | Antes | Ahora | Por qué |
|---|---|---|---|---|
| 393 | `renderizarFiltroPlan` | `className = 'opcion-plan'` | `'opcion-plan opcion-filtro'` | El estilo del molde |
| 402 | `renderizarFiltroPlan` | — | `opcion.classList.toggle('opcion-elegida', casilla.checked)` | El ✓ y el fondo de la elegida |
| 414–416 | `renderizarFiltroPlan` | El botón decía cuántos planes ("1") | Dice el plan ("MANTENIMIENTO", que el CSS muestra "Mantenimiento") o "2 planes" | "Plan · Mantenimiento" |
| 490, 492, 498 | `crearFilaPlato` | El mínimo como número (0) | `textoMinimo`: "—" si es 0 | El diseño. El casillero para editarlo sigue con 0 |
| 510–515 | `crearFilaPlato` | Estado era la 3ª celda | Va después de Total; Total lleva `numero-total` | El orden del diseño y Total en negrita |
| 257, 287–288, 362–366, 478–479, 501–502 | — | Comentarios viejos | Comentarios al día | Que digan lo que pasa |
Las ENTRADAS y SALIDAS no cambian: `renderizarFiltroPlan` dibuja el menú y el botón; `crearFilaPlato(plato)` devuelve la fila.

**`pedirCocina.js`**
| Línea | Función | Antes | Ahora | Por qué |
|---|---|---|---|---|
| 32–33 | — | `MESES_CORTOS` | `DIAS_SEMANA` | Para "Para el miércoles 28/10" |
| 165–171 | `renderizarPestanasPedido` | `className = 'pestana-pedido'` y el texto | `+ ' pestana-estado pestana-' + valor` y el puntito (menos en "Todos") | Las pestañas del molde, como las de la pantalla |
| 316–322 | `actualizarTotalPedido` | Cada renglón: el nombre, el plan y "× 10" | El nombre y abajo "10 viandas" (`conPlural`); sin `const plan` | El diseño |
| 342–348 | `actualizarTotalPedido` | "Para 28 oct 2026" | "Para el miércoles 28/10" (`new Date(año, mes − 1, día).getDay()`) | El diseño |
Lo que se manda al servidor (`enviarPedidoACocina`) no cambió.

**`ListarPedidos.js`**
| Línea | Función | Antes | Ahora | Por qué |
|---|---|---|---|---|
| 93 | `iniciarConsultarPedidos` (2b) | — | Al elegir un estado, `mostrarListaEstados(false)` | La lista se cierra |
| 96–103 | `iniciarConsultarPedidos` (2c) | — | El botón "Estado" abre o cierra la lista; un clic afuera la cierra | La lista desplegable es nueva |
| 105–108 | `iniciarConsultarPedidos` (3) | Escape cerraba las ventanas | Además cierra la lista | Ídem |
| 132 y 183 | `iniciarConsultarPedidos`, `renderizarPedidos` | `colspan="11"` | `colspan="9"` | 9 columnas |
| 208–221 | `renderizarFiltrosEstado` | Contaba y marcaba el elegido | Además anota su nombre (`data-nombre`) y lo escribe en la barra; `con-filtro` si no es "Todos" | "Estado: Registrado" en verde |
| 224–236 | **`mostrarListaEstados` (nueva)** | — | `hidden` de la lista y `aria-expanded` del botón | Ver abajo |
| 251–252 | `crearFilaPedido` | La fecha "19/10/2026" en su propia columna | "19/10" debajo del N° (`slice(0, 5)`); la fecha entera en el `title` | El diseño |
| 254–256 | `crearFilaPedido` | `'-'` si no hay dato | `'—'` | El diseño |
| 258 | `crearFilaPedido` | `clasePagado` e `iconoPagado` (la pastilla) | Sacadas; queda `textoPagado` (el cartelito al pasar el mouse) | La pastilla de pago ya no está |
| 290–299 | `crearFilaPedido` | Anulado: la pastilla gris sin detalle | Anulado: sin detalle. Si ya pagó: "✓ Cobrado" / "✓ Débito" en verde (`pago-cobrado`) | El diseño |
| 325–346 | `crearFilaPedido` | 11 celdas | 9; las de 2 renglones con `dato-principal` y `dato-chico`; Estado en su cajita con la ▾ | El diseño |
| 348–357 | `crearFilaPedido` | Cliente en `cells[2]`, dirección `[3]`, teléfono `[4]`, mail `[5]` | Cliente y mail en `cells[1]`, dirección `[2]`, teléfono `[3]`; `title` con el texto entero | Las celdas se movieron |
| 378 | `crearFilaPedido` | `cells[8].appendChild(select)` | `cells[7].firstElementChild.prepend(select)` | El select va en su cajita, antes de la ▾ (así la ▾ toma su color) |

**`mostrarListaEstados` (nueva)**
- **Qué hace:** abre o cierra la lista de "Estado" de la barra de filtros.
- **ENTRADA:** `abrir` (true o false). **SALIDA:** nada; la lista se ve o no (`hidden`) y el botón dice si está abierta
  (`aria-expanded`, para los lectores de pantalla).
- **Por qué así:** se usa en 4 lugares (el botón, elegir un estado, un clic afuera y Escape); así no se repiten 2 líneas.
- **Ej:** `mostrarListaEstados(true)` → debajo de "Estado: Todos ▾" se ve Todos 59 · ● Registrado 1 · …
- **Se conecta con:** la llaman los escuchadores de `iniciarConsultarPedidos`. No llama a nadie.

**`crearFilaPedido` (cambiada)**
- **Qué hace:** arma la fila de un pedido, ahora en 9 celdas.
- **ENTRADA:** el pedido (como lo manda `GET /api/pedidos`). **SALIDA:** el `<tr>` con sus botones andando.
- **Ej:** #058 / 02/11 · PRUEBA – NO PREPARAR / — · PRUEBA (no entregar) / Retiro en local · 0 · 5 · $ 20.000 ·
  Transferencia / Sin confirmar · [Registrado ▾] · [Detalles] [Pago] [Anular].
- **Se conecta con:** la llama `crearPaginacion` por cada pedido de la página; llama a `pintarEstado`, `alCambiarEstado`,
  `abrirDetalles`, `abrirPago` y `abrirAnular`, igual que antes.

**`renderizarFiltrosEstado` (cambiada):** la misma ENTRADA (los pedidos que pasaron la fecha y el buscador); además escribe
el nombre del elegido en la barra. Ej: "Registrado" → "Estado: Registrado" en verde. La llama `renderizarPedidos`.

### 19.5 CSS
- **`global.css` (el molde):**
  - sección 0: perillas (19.6);
  - sección 2: el título (28 px, 700, `#3a4640`) y la bajada (`bajada-pantalla`, 14,5 px gris);
  - sección 8: la tarjeta de la tabla (radio 12, borde `#e9ece8`); títulos de 12 px, 600, en MAYÚSCULA y sin franja; filas
    de 60 px (64 con 2 renglones) y letra de 14,5; las celdas de 2 renglones (`dato-principal`, `dato-chico`); el pie
    adentro de la tarjeta (`pie-tabla`, los números en negrita);
  - sección 9: las páginas "‹ Anterior · 1 · Siguiente ›" (32 px, radio 8, la actual verde), para todas las pantallas;
  - sección 13: botones de arriba (38 px), pestañas (28 px, puntito de 6, la elegida gris y en negrita), buscador (32 px),
    pastillas (24 px, sin punto), el botón de filtro (con algo elegido: verde suave) y su menú (`menu-filtro`,
    `opcion-filtro`, `opcion-elegida` con ✓, `limpiar-filtro`);
  - las ventanas quedaron como estaban (sus esquinas y botones no tomaron los radios nuevos).
- **`menuPanel.css`:** la barra de 56 px con "Panel / pantalla" y la fecha (en el celu la fecha no se ve). El menú, igual.
- **`heladera.css`:** los colores de cada estado (pastillas, puntitos y filas); los anchos de la tabla (más angostos hasta
  1400 px); el plan en minúscula con la primera en mayúscula; las flechitas de ordenar escondidas hasta pasar el mouse; el
  ✎ y el ••• verde; la ventana "Pedir a cocina" entera con los valores del diseño; el celu.
- **`ConsultarPedidos.css`:** la barra en 3 partes con "Cualquier día"; la lista de Estado; la tabla de 9 columnas con "…";
  el select de estado como pastilla con su ▾ del color de su estado (`field-sizing: content`: del ancho del elegido); las 3
  pastillas de Acciones; los cancelados en gris con el costo tachado; el celu (la barra en 3 renglones). La regla del celu
  de Asignar Cocineros (que también carga este archivo) sigue igual.
- **`movimientosStockNuevo.css`:** sus títulos y celdas con las perillas del molde.

Sin `!important`, sin `:has()`, sin `nth-child`, sin anidar; un `[hidden]` por clase donde hace falta.

### 19.6 Perillas
**`global.css`**
| | Perillas |
|---|---|
| Nuevas | `--linea-tabla` #e9ece8 · `--fila-bajo` #fffaf0 · `--fila-sin` #fff7f6 · `--alto-fila` 60px · `--alto-barra` 56px · `--alto-pestana` 28px · `--radio-pestana` 7px · `--fondo-pestana-elegida` #eef1ee · `--fondo-cantidad` #eef1ee · `--fondo-opcion-elegida` #f3f8f4 · `--verde-borde-filtro` #bfe0c8 · `--sombra-menu` · `--rojo-borde` #f5c9c4 · `--rojo-error` #9b1f16 |
| Cambiadas | `--radio-tarjeta` 16→12 · `--titulo-pantalla` 36→28 · `--borde-casillero` #d9e1d7→#dde2dc · `--texto-suave` #7a857d→#8a948d · `--alto-boton-panel` 40→38 · `--alto-control-panel` 34→32 · `--radio-boton-panel` 12→9 · `--radio-chico` 10→8 · `--fondo-titulos-tabla` #f5f7f4→blanco · `--color-titulos-tabla` → #3a4640 · `--letra-titulos-tabla` 12,5→12 · `--aire-titulos-tabla` 9/18→13/18 · `--linea-titulos-tabla` y `--linea-renglones-tabla` → #e9ece8 · `--letra-celdas-tabla` 13,5→14,5 · `--celda-alto` 15→13 · `--celda-espacio` 12→18 · `--sombra-tarjeta-panel` (un borde finito y casi nada de sombra) |
| Sacadas | `--estado-bien/-bajo/-sin/-nada` × `-fondo/-letra/-punto/-borde` (16): cada pantalla pone sus colores (Producción, en heladera.css) |

**`heladera.css`**
| | Perillas |
|---|---|
| Nuevas | `--prod-bien/-bajo/-sin/-nada-fondo` y `-letra` (las 4 pastillas) · `--prod-punto-sin/-bajo/-bien/-nada` · `--prod-fila-con-pedido` #f6fbf7 |
| Cambiadas | anchos: Plan 160→170, Disponibles 142→140, Reservadas 128→138, Total 102→96, Estado 106→140, Mínimo 82→100, ••• 54→60; `--prod-tabla-ancho-minimo` 1090→1044; `--prod-fila-bajo-encima` y `--prod-fila-sin-encima` (nuevos tonos) |
| Sacadas | `--prod-ancho-plato` (Plato se queda con lo que sobra), `--prod-fila-alto`, `--prod-letra-numeros`, `--prod-color-numeros`, `--prod-fila-encima` (ahora la de global) |

**`ConsultarPedidos.css`**
| | Perillas |
|---|---|
| Nuevas | `--accion-detalles/-pago/-anular/-anulado-fondo` y `-letra` · `--letra-personalizados` · `--alto-barra-filtros` 38 · `--radio-barra-filtros` 10 · `--ancho-parte-filtro` 210 · `--ancho-lista-estados` 230 · `--ancho-pedido/-direccion/-telefono/-viandas/-costo/-pago/-estado/-acciones` (74/142/104/78/98/118/158/204) · `--alto-fila-pedidos` 64 · `--letra-celdas-pedidos` 14 · `--alto-estado` 26 · `--alto-acciones` 28 |
| Cambiadas | los 15 colores `--estado-…` (los del diseño) y `--tabla-ancho-minimo` 1240→1096 |
| Sacadas | `--azul-suave`, `--azul-letra`, `--verde-pastilla`, `--apagado-letra`, `--letra-numero`, `--letra-destacada`, `--letra-contacto`, `--letra-dato-chico`, `--letra-pastillas`, `--alto-pastillas`, `--ancho-minimo-cliente/-direccion/-contacto`, `--fila-cancelada-opacidad`, `--alto-boton-estado` |

### 19.7 Reglas viejas que se sacaron
- **`global.css`:**
  - `.paginacion-con-palabras …` (8 reglas: pasaron a ser las de `.paginacion` de siempre) y `.paginacion-flecha`;
  - `.pestana-todos/-sin/-bajo/-bien/-sincontrol.activo` y `.pestana-estado.activo .cantidad-pestana` (la elegida ya no
    toma el color de su estado);
  - `.pestana-… .punto-pestana` y `.estado-bien/-bajo/-sin/-sincontrol` (con su `.punto-estado`): pasaron a heladera.css;
  - `.chip-filtro` y `.boton-limpiar-todo` (la fila de filtros elegidos no está en el diseño); `.quitar-chip` pasó a
    heladera.css (lo usa la ✕ de "Plato: X" en "Últimos movimientos").
- **`menuPanel.css`:** `.barra-buscador`, `.barra-icono-lupa`, `.barra-buscador-campo`, `.barra-atajo`, `.barra-espacio`,
  `.barra-avatar`.
- **`heladera.css`:** el estilo propio de `boton-filtros`, `menu-filtro-plan`, `opcion-plan`, `boton-limpiar-plan`,
  `campo-buscar-plan`, `cabecera-frase`, `pie-produccion`, `resumen-platos`, `pestana-pedido`, `pestanas-pedido`,
  `item-resumen-plan` y `control-pedido input/select` (ahora los da el molde o `caja-control`).
- **`ConsultarPedidos.css`:** la barra vieja (`.etiqueta-buscar`, `.caja-buscar`, `.icono-lupa`, `.campo-buscar`,
  `.filtro-fecha`); la pastilla de pago (`.pastilla-pago`, `.pago-por-cobrar`, `.pago-anulado`, `.icono-pago`); su
  `.dato-chico`, su `.pie-tabla` y `.paginacion-pedidos` (ahora del molde); los anchos mínimos de las columnas; y
  `.fila-cancelada { opacity }` (ahora el texto va en gris).

### 19.8 Cómo se comprobó
Con la copia del servidor en el 3001 y un Chrome sin ventana.
- **Todas las pantallas del panel** (13, con el login) a 1440, 1280, 1024 y 390: ninguna con scroll de costado salvo Tareas
  de Cocina a 390, que ya era así antes de esta parte (su tabla mide 592 px y los títulos "Cliente" y "Platos" se pisan: se
  arregla cuando se rediseñe esa pantalla); ningún ícono sin tamaño, la consola sin errores y la barra "Panel / [pantalla]"
  con la fecha en todas.
- **Producción: 51 de 51 controles.** Lo que escribe en la base se atajó en el navegador (no llegó): `PUT …/3/minimo
  {"stock_minimo":7}`, `POST /api/ordenes-produccion`, `POST /api/viandas-stock/descarte` y `POST …/detalles/990001/hecho`
  (un plato falso: los 9 pedidos a cocina del 08/10 no se tocaron). Se probó: la barra, el título, los 4 botones de 38 px;
  las pestañas (la elegida gris); el orden de las columnas y sus estilos (títulos 12/600/MAYÚSCULA, filas de 60, Plan
  "Mantenimiento" sin punto, Total 600, números 400, Estado al medio, ••• verde); el pie con negrita; las flechitas (solo con
  el mouse); ordenar; la ⓘ; "Plan" (menú de 220 px con ✓, "Plan · Mantenimiento", "Limpiar filtro"); el mínimo; el •••;
  "Pedir a cocina" vacía (1220 × 760, campos de 38, barra adentro de la tarjeta, "Para el miércoles 28/10", "Enviar"
  apagado con ícono) y con platos ("10 viandas", total, fila verde clarito, − n + verde); Cargar rápido; Descartar;
  Pendientes; Hecho hoy; Últimos movimientos (también "Plato: canelones ✕"); la tabla vacía; 1280 (entra entera) y 1024 (se
  mueve 219 px adentro de su tarjeta); el cocinero; el celu. Con **datos de ejemplo** (los 8 platos de la captura,
  inventados en el navegador, sin tocar la base): las filas Bajo `#fffaf0` y Sin stock `#fff7f6`, las 4 pastillas, el "—"
  gris y los puntitos de las pestañas.
- **Consultar Pedidos: con UN pedido "PRUEBA – NO PREPARAR" (#58)**, creado por la ruta de la web (Transferencia,
  "Combo semanal" con 5 berenjenas rellenas). Se probó: la barra (38 px, partes de 210), "Cualquier día" con "Ver todos", las
  9 columnas, la tabla entera a 1440, las páginas, la lista de Estado (sus cantidades suman el total), elegir "Registrado"
  (se cierra y la barra dice "Estado: Registrado" en verde), Escape y clic afuera, Entrega + Aplicar, buscar; con el pedido de
  prueba: pasar a "En preparación" → "Confirmar pago" → "No, todavía no pagó" (vuelve y no manda nada) → otra vez → "Sí, ya
  pagó" (todo salía de la heladera: quedó en "Listo para Entregar" y "✓ Cobrado"), Detalles, Pago (Cancelar: no manda nada),
  Anular con el PIN del `.env` (sin mostrarlo). Lo único que llegó a la base: `PUT /api/pedidos/58/estado`,
  `PUT /api/pedidos/58/pagado` y `POST /api/pedidos/58/anular`. Al final el #58 quedó anulado y **la heladera quedó igual que
  al empezar**. Ningún pedido real se tocó (la prueba cortaba cualquier escritura que no fuera del #58).
  27 de 29 controles bien; los 2 que no daban se arreglaron y se volvieron a mirar sin escribir en la base: las filas medían
  66 px (ahora 64) y en el celu "Aplicar" y "Ver todos" no eran del mismo ancho (ahora 175 y 175).
- **`node tests/test_e2e.js heladera`: 37 de 40** (crea y anula solo sus pedidos de prueba, #59 y #60; al final la heladera
  quedó igual). Los 3 que fallan son "Movimientos de Stock: la venta de A / la venta de D
  / la devolución de A": buscan los movimientos **de hoy** con la fecha de esta compu (27/10), pero la base les pone la fecha
  de su propio reloj (los pedidos #59 y #60 del test quedaron con `fecha_pedido` 2026-10-22). Pidiendo el 22/10 están los 3
  y son los correctos: venta de A, salida, "PRUEBA – NO PREPARAR", 5 berenjenas; venta de D, 3 berenjenas (lo que salió de
  la heladera); devolución de A, entrada, 5. No tiene que ver con el diseño (no se tocó `server.js` ni `sql/`). Con la fecha
  de la compu igual a la de la base, esos 3 tendrían que dar bien (no se volvió a correr: cada corrida crea pedidos de
  prueba en la base).

### 19.9 Seguridad (qué protege cada cosa)
- Lo que viene de la base sigue entrando con `textContent` o `escHtml`: cliente, mail, dirección, forma de entrega y
  teléfono con `textContent`; el `title` con la propiedad `.title`; la fecha de entrega con `escHtml` también adentro del
  atributo. Protege de que alguien escriba código en su nombre o su dirección en la web y se ejecute en el panel (XSS).
- Lo nuevo que se escribe con `innerHTML` son textos nuestros (el puntito, "10 viandas" con un número de `conPlural`), sin
  datos de la base sin escapar.
- La barra de arriba: el nombre de la pantalla sale de nuestra lista `MENU_PANEL` y va con `textContent`.
- No cambió ninguna ruta ni ningún control del servidor: el estado, el pago y la anulación los sigue controlando el servidor
  (`requireAuth` + `requireRol`; el PIN se revisa en el servidor). Mostrar o esconder algo en la pantalla no da permisos.
- En la prueba, el PIN salió del `.env` y no se mostró en ningún lado.

### 19.10 Lo que no quedó igual al diseño (y por qué)
1. **La ⓘ** de Disponibles, Reservadas y Total (el pedido dice que queda): esas columnas son más anchas (140, 138 y 96 px en
   vez de 118, 118 y 90) y Plato más angosta (253 px a 1440 en vez de 316).
2. **La barra de scroll de Windows** (15 px): todo queda 15 px más a la izquierda y la bajada de Producción entra en 3
   renglones en vez de 2.
3. **Los nombres de los platos en minúscula** ("berenjenas rellenas"): así están cargados. Los planes sí se ven
   "Mantenimiento" (el pedido lo pide).
4. **La pestaña "Sin mínimo"** aparece si hay un plato sin mínimo (como hoy, decisión del 21/10).
5. **El "—" del mínimo con ✎** para quien administra (si no, no se le podría poner un mínimo).
6. **Las flechitas de ordenar**: invisibles; aparecen al pasar el mouse.
7. **"‹ Anterior" y "Siguiente ›"** en gris clarito cuando no hay otra página (en la captura están oscuros).
8. **Los números de "Pendientes de cocina" y "Hecho hoy"** son los de verdad (hoy, 0).
9. **El desplegable "Plan" de "Pedir a cocina"** sigue en mayúsculas: es un `<select>` y el CSS no puede cambiar eso.
10. **Las fechas** ("Para cuándo" y "Entrega") son el campo del navegador (dd/mm/aaaa). Un clic en el campo abre el calendario.
11. **Los nombres del select de Estado** ("En Preparación", "Listo para Entregar") vienen así de la base.
12. **Al abrir Consultar, "Entrega"** muestra el próximo día hábil (la lógica de siempre: lo que se cocina hoy); "Cualquier
    día" aparece con "Ver todos".
13. **Dirección:** se ve la dirección que cargó el cliente y abajo cómo se entrega ("Delivery · Centro" o "Retiro en local"),
    los datos de siempre (en el diseño, "Retiro en local / Villa Allende").
14. **Acciones mide 204 px** en vez de 200 (con "Anulado", faltaban 2 px).
15. **1280 y 1024:** Consultar se mueve de costado adentro de su tarjeta (159 y 415 px); Producción entra entera a 1280 y a
    1024 se mueve 219 px. A 1440 las dos entran enteras.
16. **Las 4 ventanas de Consultar en el celu:** una tarjeta que entra entera, no a pantalla completa (duda 12).
17. **"⚠ 2 personalizados"** sale un poquito de su columna (igual que en el diseño).
18. **Pantallas que no se rediseñaron:** las tablas de Generar Receta y Movimientos de Stock ya se movían de costado adentro
    de su caja, y la de Tareas de Cocina en el celu ya se salía (de antes). Toman el molde nuevo, pero su armado sigue igual.

### 19.11 Dudas y qué se decidió (siempre lo que no cambia lógica ni datos)
1. **Test completo o `heladera`:** el completo escribe en la base real → `heladera`.
2. **La fila de filtros elegidos ("Plan: X ✕", "Limpiar todo"):** no está en el diseño → escondida con CSS; el botón dice
   "Plan · Mantenimiento" y su menú tiene "Limpiar filtro". El JS que la arma no se tocó.
3. **"Buscar plan…" y la cantidad de platos de cada plan:** no están en el diseño → escondidos con CSS.
4. **El aviso "N platos están abajo del mínimo" de "Pedir a cocina":** no está en el diseño → escondido con CSS (volverlo
   es sacar una regla).
5. **Las flechitas de ordenar:** se puede seguir ordenando; se ven solo al pasar el mouse (también la de la columna elegida,
   porque de entrada se ordena por Estado y el diseño no tiene flechita ahí).
6. **"Entrega: Cualquier día":** `required` + CSS, sin JS.
7. **El mínimo "—":** con su ✎ para quien administra.
8. **La barra de arriba (56 px) y la fila del logo del menú (64 px):** el menú no se toca; las dos líneas quedan a 8 px.
9. **"Texto gris" #5f6b63:** es `--texto-apagado`. `--texto-gris` (#4a564d) lo usa el menú y no se cambió.
10. **Los planes en mayúsculas:** "Mantenimiento" con CSS en la tabla, el menú y "Pedir a cocina"; en el `<select>` no se puede.
11. **Las pantallas con `stock.css`** (Gestión de Stock, Combos): toman el molde de la tabla; su tarjeta queda como está.
12. **Las 4 ventanas de Consultar en el celu:** quedan como están (el punto 4 del pedido); a pantalla completa, "Confirmar
    pago" y "Anular" quedarían casi en blanco.
13. **El test 37/40:** la diferencia de fecha entre la compu y la base (19.8).
14. **Los nombres del select de Estado:** como vienen de la base.
15. **La bajada de Producción en 3 renglones:** por la barra de scroll de Windows; no se achicó la letra para forzar 2.

### 19.12 Capturas
En `diseno-panel-final/resultado/` (la carpeta no se sube):
- **Producción:** `1440-produccion`, `1440-produccion-plan-abierto`, `390-produccion`, `390-produccion-abajo`,
  `390-produccion-plan-abierto`, `1280-produccion`, `1024-produccion`; con datos de ejemplo: `1440-produccion-datos-ejemplo` y
  `1440-produccion-plan-abierto-datos-ejemplo`.
- **Pedir a cocina:** `1440-pedir-cocina-vacia`, `1440-pedir-cocina-con-platos`, `390-pedir-cocina-vacia`,
  `390-pedir-cocina-con-platos` (y `-abajo`); con datos de ejemplo: `1440-pedir-cocina-vacia-datos-ejemplo` y
  `1440-pedir-cocina-con-platos-datos-ejemplo`.
- **Consultar Pedidos:** `1440-consultar-pedidos`, `1440-consultar-estado-abierto` (con "Registrado" elegido) y
  `-estado-abierto-todos`, lo mismo a 1280, 1024 y 390; con el pedido de prueba: `1440-consultar-buscar-prueba`,
  `-confirmar-pago`, `-estado-cambiado`, `-detalles`, `-pago`, `-anular`, `-anulado` y `390-consultar-detalles`.
- **Las otras pantallas:** `otras-pantallas/` (1440 y 390 de Inicio, Envíos, Tareas de Cocina, Asignar Cocineros,
  Movimientos de Stock, Gestión de Stock, Combos, Generar Receta, Gestión de Usuarios y el login).

## 20. Cambio chico (27/10): Consultar Pedidos en 11 columnas y Producción con Plato fijo
**Qué se pidió:**
- **Consultar Pedidos:** volver a las 11 columnas de antes, en su orden, con el estilo nuevo: N° Pedido · Entrega · Cliente ·
  Dirección · Teléfono · Mail · Viandas · Costo · Estado · Método Pago · Acciones. Que ninguna columna quede gigante (más lugar
  para Dirección; Cliente y Mail chicas, con "…") y que, si a 1440 no entra, se mueva lo menos posible y Acciones quede fija a
  la derecha.
- **Producción:** Plato con un ancho fijo y Plan pegada al lado; lo que sobra en una pantalla grande, para las columnas de
  números.
- "Pedir a cocina" no se toca. Sin cambios en datos, rutas ni lógica. Sin commit.

**Por qué pasaba:** en las dos tablas había UNA columna sin ancho (Cliente en Consultar, Plato en Producción). En una pantalla
grande, esa columna se quedaba con todo el espacio que sobraba.

### 20.1 Qué archivos cambiaron
| Archivo | Tipo | Qué cambió |
|---|---|---|
| `pages/ConsultarPedidos.html` | HTML | Los 11 títulos en el orden de antes (Mail con la clase nueva `col-mail`, para su ancho); `colspan="11"` en "Cargando datos…" |
| `src/js/ListarPedidos.js` | JS | Solo `crearFilaPedido` (la fila en 11 celdas) y los dos `colspan` (20.2) |
| `src/css/ConsultarPedidos.css` | CSS | Los anchos de las 11 columnas (perillas), Acciones fija a la derecha, las celdas de un renglón con "…" (20.3) |
| `src/css/heladera.css` | CSS | Plato, Plan, Estado y ••• con ancho fijo; los números, sin ancho (20.3) |

No cambió: `server.js`, las rutas, `sql/`, lo que se manda al servidor, ningún id ni ninguna función nueva. "Pedir a cocina",
igual (su tabla mide lo mismo: 284 · 140 · 104 · 104 · 78 · 132 px).

### 20.2 JS: `ListarPedidos.js`, línea por línea
| Línea | Antes | Ahora | Por qué |
|---|---|---|---|
| 132 y 183 | `colspan="9"` | `colspan="11"` | Vuelven las 11 columnas |
| 240–246 | El comentario con la fila de 9 celdas | El comentario con la de 11 (y el ejemplo nuevo) | Que diga lo que hace |
| 321–346 | 9 celdas: N° con la fecha abajo, Cliente con el mail abajo, Pago antes de Estado | 11 celdas: N° solo; Entrega en su celda ("26/10"; la fecha entera en el `title`); Cliente solo el nombre; Mail en su celda (`col-contacto col-mail`); Estado y después Método Pago. Dirección, Viandas, Costo, Estado y Acciones, igual | El orden de antes |
| 349–358 | Cliente y mail en `cells[1]`, dirección `[2]`, teléfono `[3]` | Cliente `cells[2]`, dirección `[3]`, teléfono `[4]`, mail `[5]`; cada uno con `title` = el texto entero (por el "…") | Las celdas cambiaron de lugar |
| 379 | `cells[7]…prepend(select)` | `cells[8]…prepend(select)` | El select de estado va en la celda 9 |

**`crearFilaPedido` (cambiada)**
- **Qué hace:** arma la fila de un pedido, ahora en 11 celdas.
- **ENTRADA:** el pedido (como lo manda `GET /api/pedidos`). **SALIDA:** el `<tr>` con sus botones andando.
- **Ej:** #057 · 26/10 · MARTIN RO… · Mendiolaza, Prov… / Delivery · Ampliació… · 75494894 · mauriro… · 5 / ⚠ 1
  personalizado · $ 20.000 · [Entregado ▾] · Transferencia / ✓ Cobrado · [Detalles] [Pago] [Anular].
- **Se conecta con:** la llama `crearPaginacion` por cada pedido de la página; llama a `pintarEstado`, `alCambiarEstado`,
  `abrirDetalles`, `abrirPago` y `abrirAnular`, igual que antes. Lo del cliente sigue entrando con `textContent` (XSS).

### 20.3 CSS
**`ConsultarPedidos.css`**
- **Los anchos (perillas de la sección 0):**
  - fijos: N° 78 · Entrega 72 · Teléfono 100 · Viandas 100 · Costo 94 · Estado 156 · Método Pago 114 · Acciones 206 (en px);
  - Cliente, Dirección y Mail van en % (7,2 · 12 · 7,2): con la tabla en su ancho mínimo miden 90 · 150 · 90 px. En una
    pantalla grande, Chrome reparte lo que sobra entre las columnas de ancho fijo, así que todas crecen un poco y ninguna
    queda gigante. A 1920, por ejemplo: N° 91 · Cliente 114 · Dirección 189 · Mail 114 · Acciones 262.
  - `--tabla-ancho-minimo` 1.250 px. A 1440 la tarjeta mide 1.097, así que la tabla se mueve 153 px adentro de ella. Antes del
    diseño nuevo, con 11 columnas, se movía 143.
- **Acciones fija** (`position: sticky; right: 0`): queda pegada a la derecha de la tarjeta mientras lo demás se mueve, con
  fondo blanco y una línea con una sombrita a la izquierda (perilla `--sombra-acciones`). Al pasar el mouse por la fila, se
  pinta igual que la fila.
- **Las celdas:** N° en negrita; Entrega con cifras del mismo ancho; Cliente, Teléfono y Mail en un renglón con "…"; los
  cancelados en gris también en esas columnas.
- **"⚠ 2 personalizados":** con Viandas de 100 px baja a un segundo renglón, sin partir la palabra (lo pediste así). A 1920,
  "⚠ 1 personalizado" entra en uno.
- **Detalles · Pago · Anular:** padding de 9 a 8 px, así las 3 entran con "Anulado".
- **Acciones mide 206 px** (pediste ~190): las 3 pastillas con "Anulado" miden 186 px más el aire de los costados.

**`heladera.css`**
- **Fijas:** Plato 260 px · Plan 160 · Estado 140 · ••• 60 (hasta 1400 px: 200 · 140 · 116 · 56).
- **Los números (Disponibles, Reservadas, Total y Mínimo) no tienen ancho:** la tabla pasa a `table-layout: auto`, así cada
  una mide lo que su título (nunca menos, con su ⓘ) y se lleva una parte de lo que sobra.
  - A 1920: Plato 260 · Plan 160 · Disponibles 289 · Reservadas 288 · Total 199 · Mínimo 180.
  - A 1440 y a 1280 entra entera.
- **Para que Plato no se estire con un nombre largo:** el nombre y la descripción llevan `width: 0` + `min-width: 100%`. Miden
  lo que mide Plato y, si no entran, "…".
- **Lo mismo en el casillero del mínimo:** al editarlo no ensancha la columna (si no, la tabla se movía).
- **`--prod-tabla-ancho-minimo`** (1.080 px; 924 hasta 1400): más chico, la tabla se mueve adentro de su tarjeta, sin
  achicar Plato ni Estado.
- **Se sacaron** las perillas de ancho de los números (`--prod-ancho-disponibles`, `-reservadas`, `-total`, `-minimo`).

**Una aclaración del plan:** la prueba con una página aparte se había leído al revés. Chrome, con `table-layout: fixed`, le da
lo que sobra a las columnas en px (no a las de %). En Producción eso hacía crecer Plato. Por eso Producción pasó a
`table-layout: auto`. En Consultar el reparto entre todas las columnas sirve: ninguna queda gigante.

### 20.4 Cómo se comprobó (solo leyendo: lo que no fuera GET se cortaba en el navegador)
- **16 de 16 controles** a 1440, 1920, 1280, 1024 y 390:
  - las 11 columnas y sus celdas (N° en negrita, Entrega con el `title`, Cliente y Mail con "…", Método Pago después de
    Estado);
  - la tabla se mueve solo adentro de su tarjeta y Acciones queda en el mismo lugar con la tabla al principio y al final;
  - a 1920 entra entera;
  - la lista de Estado (las cantidades suman el total), las páginas;
  - Detalles, Pago y Anular se abren y se cancelan sin mandar nada.
- **Cambiar el estado:** se probó con el pedido #057. Lo que iba a mandar (`PUT /api/pedidos/57/estado {"estado_id":1}`) se
  cortó en el navegador: el select sigue andando con el pedido de su fila y, como se cortó, volvió a "Entregado". Después se
  miró en la base (solo leyendo): el #057 sigue en Entregado y cobrado.
- **Consola:** el único error es el que provoca la prueba al cortar ese PUT ("No se pudo cambiar el estado: Failed to fetch").
- **Producción:** Plato 260 (200 hasta 1400) y Plan pegada en todas las medidas; los títulos entran; a 1440 y 1280 entra
  entera, a 1024 y 390 se mueve adentro de su tarjeta.
- **`node tests/test_e2e.js heladera`: 37/40**, los mismos 3 de antes: la fecha de la compu (27/10) no es la de la base
  (22/10). Pedidos de prueba #61 y #62, anulados por el test; la heladera quedó igual.

### 20.5 Lo que hay que saber
- **En el celu**, Acciones también queda fija y ocupa más de la mitad del ancho (206 de 358 px). Lo demás se mueve en lo que
  queda. Si en el celu preferís que no quede fija, es sacar el `sticky` con una regla para menos de 768 px.
- **A 1440**, Cliente, Dirección y Mail quedan chicas y con "…" (90 · 150 · 90 px): es lo que entra con Acciones a la vista.
  El texto entero aparece al pasar el mouse.

**Capturas:** `diseno-panel-final/resultado/cambio-columnas/`: `1440-consultar-11-columnas`, `1440-consultar-11-columnas-movida`
(con la tabla al final: Acciones sigue en su lugar), `1440-produccion-columnas`, y las dos a 1920.
