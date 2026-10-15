# Informe: todo lo que cambió en la heladera (pasos H1 a H6)

> Rama `mejoras-fastgood` · 15/10/2026.
> **H1 a H4: probados. H5 y H6: escritos;** falta correr el SQL de H6 y probar en la web (ver `docs/HELADERA-AVANCE.md`).
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

### 6.2 `server.js`: solo comentarios

La ruta `POST /api/pedidos-combos` ya no dice "SIN HELADERA". Su código no cambió: el `ok: false` de la base
(incluido el "No quedan suficientes viandas…") ya se respondía como 400 con el mensaje de la base.

---

## 7. Las pruebas

| Archivo | Pruebas | Qué prueban |
|---|---|---|
| `sql/heladera_probar.sql` | 1A, 1B, 1C | DESCARTAR (H2) ✅ |
| | 2A, 2B, 2C | PRODUCIR (H3) ✅ |
| | 3A, 3B, 3C | DEVOLVER (H4); H4 se probó desde la web ✅ |
| `sql/pedido_combos_probar.sql` | 6A, 6B, 6C | VENDER (H6): no alcanza; vende 18, los "sin sal" no salen, 100 "sin sal" se pueden pedir, y anular devuelve 18 |

Los casos "de mentira" (1B, 2B, 3B, 6A, 6B) terminan con un error a propósito: Postgres deshace todo y no queda nada guardado.
Lo único que no vuelve son los números de id (se saltean).

---

## 8. Funciones viejas que quedan "NO USAR"

No se borra nada (regla del CLAUDE.md). En H7 se les pone la marca "NO USAR" en el `.sql` y en la base (`comment on function`
/ `comment on column`). **Ojo:** el servidor de Render (rama Rodriguez) todavía usa dos de ellas hasta el merge: no se tocan.

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
