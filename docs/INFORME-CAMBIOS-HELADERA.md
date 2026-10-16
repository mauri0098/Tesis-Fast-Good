# Informe: todo lo que cambió en la heladera (pasos H1 a H8)

> Rama `mejoras-fastgood` · 15/10/2026.
> **H1 a H6: probados** (H4, H5 y H6 desde la web). Desde el 15/10 la heladera está conectada a la web nueva.
> **H7** (marcas "NO USAR" / "USAR"): bloque 4 corrido y la 4A dio 12 filas en "sí". La prueba completa en la web se salteó (decisión tuya).
> **H8** (pantallas, Parte 1): parada 1 (Producción) escrita, falta probarla en la web. Siguen la parada 2 (Consultar Pedidos) y la 3 (cocina y web nueva).
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

H8 va en **tres paradas**. Después de cada una se prueba en la web, y recién ahí se sigue.

| Parada | Pantalla | Estado |
|---|---|---|
| 1 | Producción (`heladera.html`) | ✍ escrita, falta probar en la web |
| 2 | Consultar Pedidos (`ConsultarPedidos.html`) | ⏭ después de probar la 1 |
| 3 | Ampliada el 16/10, en tres partes: **3A** Tareas de Cocina (`pedidosCocina.js`) y la web nueva (`index-combos.html`) · **3B** los insumos de un pedido en una función de la base, con `id_pedido` (arreglo C1) · **3C** Movimientos de Stock con todo junto (insumos y viandas) | ⏭ plan mostrado, esperando OK; va después de probar la 2 |

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

## 9. Las pruebas

| Archivo | Pruebas | Qué prueban |
|---|---|---|
| `sql/heladera_probar.sql` | 1A, 1B, 1C | DESCARTAR (H2) ✅ |
| | 2A, 2B, 2C | PRODUCIR (H3) ✅ |
| | 3A, 3B, 3C | DEVOLVER (H4); H4 se probó desde la web ✅ |
| `sql/pedido_combos_probar.sql` | 6A, 6B, 6C | VENDER (H6): no alcanza; vende 18, los "sin sal" no salen, 100 "sin sal" se pueden pedir, y anular devuelve 18. H5 y H6 se probaron desde la web ✅ |
| `sql/heladera_probar.sql` | 4A | Las marcas de H7 (solo lee) |
| `sql/heladera_revisar.sql` | todo (solo lee) | Las funciones instaladas con su comentario y si la heladera cuadra con el cuaderno (H0 y H7) |
| (en la web) | Parada 1 de H8 | Producción: la lista de la sección 8.1.7 |

Los casos "de mentira" (1B, 2B, 3B, 6A, 6B) terminan con un error a propósito: Postgres deshace todo y no queda nada guardado.
Lo único que no vuelve son los números de id (se saltean).

---

## 10. Funciones viejas que quedan "NO USAR"

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
(cambiada en H6, no reemplazada).
