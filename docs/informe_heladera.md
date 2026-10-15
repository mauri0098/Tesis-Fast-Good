# Informe: la heladera hoy y cómo conectarla a los combos

> **Solo análisis.** Para escribirlo no se cambió código ni la base.
> Fecha: 15/10/2026 · Rama: `mejoras-fastgood`.
> Los números de los ejemplos (71 fideos, 21 berenjenas, pedido #500) son inventados para explicar.
> Los nombres de tablas, funciones y rutas son los reales.

---

## Antes de empezar: 5 palabras que se repiten

| Palabra | Qué quiere decir en este informe |
|---|---|
| **Heladera** | El número `productos.stock_heladera`: cuántas viandas terminadas hay de cada plato. |
| **Cuaderno** | La tabla `movimientos_viandas`. Cada vez que entra o sale una vianda se anota un renglón. |
| **Todo o nada** | Una función de la base que hace varias cosas juntas. Si una falla, se deshacen todas: nunca queda algo a medias. |
| **Candado** (`for update`) | Mientras una función usa la fila de un plato, otra que quiere ese mismo plato espera su turno. Así dos personas no pisan el mismo número. |
| **Reservadas** | Viandas que siguen en la heladera, pero ya son de un pedido que todavía no se entregó. Hoy no existen; aparecen cuando se conecten los combos (ver 5.4). |

---

## 1. Las tablas de la heladera

### 1.1 Qué guarda cada una

| Dónde | Qué guarda | Ejemplo |
|---|---|---|
| `productos.stock_heladera` | Cuántas viandas terminadas hay de ese plato: **un solo número por plato**. La base no deja que sea negativo (`check >= 0`). | fideos → 71 |
| `productos.stock_minimo` | Desde cuántas viandas para abajo la pantalla avisa "Bajo". Arrancó en 5 para todos los platos. Si vale 0, el plato queda "Sin control". **No hay ninguna pantalla para cambiarlo.** | fideos → 5 |
| `movimientos_viandas` (tabla) | El cuaderno: un renglón por cada entrada o salida. Columnas: plato, tipo, cantidad (+ entra / − sale, nunca 0), quién (obligatorio), pedido (opcional), motivo (texto libre) y fecha. | ver 1.4 |
| `movimientos_viandas.id_lote` y la secuencia `movimientos_viandas_lote_seq` | Un número para agrupar varias cargas hechas juntas. Solo lo usa `registrar_tanda_multiple`, que no llama nadie, así que hoy queda vacío. **No es una tabla de lotes.** | vacío |
| `ordenes_produccion` (tabla) | El "pedido a cocina": quién lo pidió, cuándo y para qué día. | #4 · Mauri · para el 16/10 |
| `orden_produccion_detalles` (tabla) | Cada plato de ese pedido a cocina: cantidad, cocinero, si ya está hecho y cuándo, y qué renglón del cuaderno generó. | fideos ×10 · Ana · hecho · renglón 120 |
| `movimientos_stock.id_movimiento_vianda` | Está en las salidas de **insumos** y dice a qué producción de viandas pertenecen. Así se sabe qué gastó cada tanda. | harina −2 kg → renglón 120 |
| `pedido_detalles.cantidad_de_heladera` | Cuántas viandas de ese renglón del pedido salieron de la heladera. **Hoy siempre 0.** | 0 |
| `pedido_detalles.listo` | Si el plato ya está listo. Lo marca la cocina ("✓ Listo"), o se pone solo cuando el pedido pasa a 3. | no |
| `pedido_detalles.personalizado` y `observaciones_plato` | Si el plato es personalizado, y su texto. | sí · "sin sal" |

### 1.2 Los 5 tipos de renglón del cuaderno

| Tipo | Signo | ¿Quién lo escribe hoy? | Ejemplo |
|---|---|---|---|
| `produccion` | + | `marcar_detalle_hecho` (la cocina toca "Hecho") | +10 fideos · "Pedido a cocina #4" |
| `descarte` | − | `registrar_descarte_vianda` (botón "Descartar") | −2 fideos · "vencidos" |
| `venta` | − | **Nadie todavía** | (va a ser) −6 fideos · pedido 500 |
| `devolucion` | + | **Nadie todavía** | (va a ser) +6 fideos · pedido 500 |
| `ajuste` | + o − | **Nadie** (no hay función) | (podría ser) −1 fideos · "conteo del viernes" |

La tabla ya acepta los 5 tipos y ya tiene la columna `id_pedido`, con índice para buscar rápido.
O sea, **el cuaderno ya está preparado para las ventas. Lo que falta es una función que las escriba.**

### 1.3 Cómo se relacionan (dibujo)

```
 ordenes_produccion          (pedido a cocina #4, para el 16/10)
        │  un pedido a cocina tiene varios platos
        ▼
 orden_produccion_detalles   (fideos ×10, hecho)
        │  id_movimiento_vianda = "este plato hecho generó el renglón 120"
        ▼
 movimientos_viandas         (renglón 120: produccion +10)  ──id_producto──►  productos (fideos)
        ▲                                                                     stock_heladera: 81
        │  id_movimiento_vianda = "estas salidas de insumos son de la producción 120"
 movimientos_stock           (harina −2 kg, salsa −1,5 l, ...: una por insumo de la receta)

 pedidos (#500)  ◄──id_pedido──  movimientos_viandas (venta −6)     ← esta flecha HOY no se usa
```

### 1.4 Ejemplo: cómo se llena y se vacía hoy

Tu prima ve que quedan pocos fideos.

**1. Producción → "Pedir a cocina": 10 fideos para el 16/10** (función `crear_orden_produccion`)
- `ordenes_produccion`: se crea el #4 (Mauri, para el 16/10).
- `orden_produccion_detalles`: fideos ×10, cocinera Ana, hecho = no.
- La heladera **no cambia** todavía: pedir no es cocinar.

**2. Ana termina y toca "Hecho"** (función `marcar_detalle_hecho`, todo o nada)
- `movimientos_viandas`: renglón 120 → `produccion`, +10, Ana, motivo "Pedido a cocina #4".
- `movimientos_stock`: una salida por cada insumo de la receta (ej. harina −2 kg), todas con `id_movimiento_vianda = 120`.
- `productos.stock_heladera` de fideos: 71 → **81**.
- `orden_produccion_detalles`: hecho = sí, con la fecha y `id_movimiento_vianda = 120`.
- Si un insumo no alcanzaba, se carga igual: el insumo queda en negativo y aparece un aviso.
  Si el plato no tiene receta, las viandas entran igual, con aviso.

**3. Dos días después se tiran 2: "Descartar"** (motivo obligatorio)
- `movimientos_viandas`: `descarte`, −2, motivo "vencidos".
- fideos: 81 → **79**. Los insumos no se tocan: ya se gastaron al cocinar.

Así queda el cuaderno de fideos:

| id | tipo | cantidad | id_pedido | quién | motivo |
|---|---|---|---|---|---|
| 120 | produccion | +10 | — | Ana | Pedido a cocina #4 |
| 121 | descarte | −2 | — | Mauri | vencidos |

### 1.5 La regla de oro

Si todo pasa por las funciones, se cumple esto:
**el `stock_heladera` de un plato es igual a la suma de todos sus renglones del cuaderno.**

Si alguien cambió el número a mano (por ejemplo, desde el editor de tablas de Supabase), deja de cuadrar.
Por eso el primer paso del plan (A0) es revisar si hoy cuadra.

### 1.6 Lo que la heladera NO guarda

- **No hay tabla de lotes.** "Lote" es solo el número `id_lote` de arriba, y no se usa.
- Cuenta por plato, no vianda por vianda: no sabe cuál es más vieja ni cuándo vence. Para los combos no hace falta.
- No sabe de qué pedido es cada vianda, porque hoy ningún pedido saca de la heladera.

---

## 2. Las funciones de la base que ya existen

| Función | Archivo | ¿Quién la llama? | Qué hace | Heladera | Insumos |
|---|---|---|---|---|---|
| `aplicar_produccion_viandas` | `stock_viandas_funciones.sql` | Solo otras funciones (es interna) | Registra N viandas cocinadas: anota un renglón `produccion`, descuenta los insumos de la receta (cada salida atada a ese renglón) y suma a la heladera. **Estricta:** si falta un insumo, no hace nada. **Flexible:** carga igual, deja el insumo en negativo y avisa. | +N | − receta × N |
| `marcar_detalle_hecho` | `Produccion.sql` | La ruta "Hecho" (cocina) | Le pone candado al renglón del pedido a cocina: si dos personas tocan "Hecho" a la vez, la segunda ve "ya estaba hecho". Después llama a la de arriba en modo **flexible** y marca el renglón como hecho. Funciona aunque el plato ya esté desactivado. | +N | − receta × N |
| `crear_orden_produccion` | `Produccion.sql` | La ruta "Pedir a cocina" | Crea el pedido a cocina con sus platos. Controla la fecha (no puede ser pasada), que los platos existan y estén activos, y las cantidades. El cocinero es el del plato o, si no tiene, el del plan. | no | no |
| `registrar_descarte_vianda` | `stock_viandas_funciones.sql` | La ruta "Descartar" | Le pone candado al plato, controla que alcance, anota un renglón `descarte` (−N) y resta. | −N | no |
| `registrar_tanda_viandas` | `stock_viandas_funciones.sql` | **Nadie** (la ruta `/tanda` ya no existe) | Carga una tanda suelta en modo **estricto**. Exige que el plato esté activo y tenga receta. | +N | − |
| `registrar_tanda_multiple` | `stock_viandas_funciones.sql` | **Nadie** | Carga varias tandas juntas (todo o nada), agrupadas con `id_lote`. ⚠ Acá "combo" quiere decir "varios platos cargados juntos", **no** los combos que se venden ahora. | +N | − |
| `crear_pedido_combos` | `pedido_combos_funciones.sql` | `POST /api/pedidos-combos` (web nueva) | Controla todo y guarda el pedido, sus combos y sus platos. **Hoy no toca la heladera:** deja `cantidad_de_heladera` en 0 y `listo` en no. | no (todavía) | no |

Lo que **no existe**: una función para `venta`, otra para `devolucion` y otra para `ajuste`.

Lo bueno que comparten todas:
- Son todo o nada.
- Usan candados siempre en el mismo orden: primero el plato, después los insumos, y cada grupo por número de id. Así dos funciones nunca se quedan esperándose una a la otra para siempre.
- Solo las puede ejecutar el servidor (`revoke` / `grant`).
- Devuelven `{ ok, error }` con mensajes claros.

---

## 3. Pantallas y rutas que hoy tocan la heladera

### 3.1 Pantallas

| Pantalla | Archivos | Qué hace con la heladera | Quién la ve |
|---|---|---|---|
| **Producción** | `heladera.html`, `heladera.js`, `pedidosCocina.js` | Tabla de platos activos con En stock, Mínimo y Estado (Sin stock / Bajo / Bien / Sin control), con filtros y la franja "Te faltan N platos". Botones: Pedir a cocina (y "Pedir los que faltan"), Pendientes de cocina y Descartar. Paneles "Hecho hoy" y "Últimos movimientos" (los últimos 50, sin número de pedido). Se actualiza sola cada 60 segundos. | Roles 6, 5 y 1; el 2 también entra, pero no puede pedir a cocina |
| **Tareas de Cocina** | `cocinero.html`, `cocinero.js`, `pedidosCocina.js` | Arriba, la sección **"Para stock"** (los pedidos a cocina pendientes), con el botón **Hecho**, que suma a la heladera. Abajo, los pedidos de clientes en estado 2, que no tocan la heladera. | Rol 2 (los roles 6, 5 y 1 solo miran) |
| **Movimientos de Stock** (insumos) | `MovimientosStock.html`, `MovimientosStock.js` | Muestra las salidas de insumos de cada producción, agrupadas ("Pedido a cocina #4", o "Producción" en las tandas viejas). Solo lee. | Roles 6, 5 y 1 |
| **Web de combos** | `index-combos.html`, `combosCatalogo.js`, `armarCombo.js` | Solo **lee**. De cada plato del menú recibe `disponibles` = lo que hay, con tope en la cantidad del combo, y no deja elegir más (salvo personalizado). | Pública |

Roles: 1 Administrador · 2 Cocinero · 5 Dueño · 6 Administrador del sistema.

### 3.2 Rutas del servidor

| Ruta | Roles | Qué hace | Función de la base |
|---|---|---|---|
| `GET /api/viandas-stock` | 6, 5, 1, 2 | Platos **activos** con su stock, mínimo y plan, y si tienen receta | — |
| `POST /api/viandas-stock/descarte` | 6, 5, 1, 2 | Descarta (el motivo es obligatorio, hasta 200 letras) | `registrar_descarte_vianda` |
| `POST /api/ordenes-produccion` | 6, 5, 1 | Crea un pedido a cocina | `crear_orden_produccion` |
| `GET /api/ordenes-produccion/pendientes` | 6, 5, 1, 2 | Platos pedidos a cocina sin hacer (el cocinero ve los suyos y los que no tienen cocinero) | — |
| `POST /api/ordenes-produccion/detalles/:id/hecho` | 6, 5, 1, 2 | Lo marca hecho: entran viandas, salen insumos | `marcar_detalle_hecho` |
| `GET /api/ordenes-produccion/hechos-hoy` | 6, 5, 1, 2 | Lo hecho hoy (hora de Argentina) y quién lo marcó | — |
| `GET /api/movimientos-viandas` | 6, 5, 1, 2 | Los últimos 50 renglones del cuaderno (**no trae `id_pedido`**) | — |
| `GET /api/movimientos-stock` | 6, 5, 1 | Los movimientos de insumos, cada uno con su producción de viandas | — |
| `GET /api/v1/combos` | Pública (con límite por IP) | Los combos para la web, con `disponibles` por plato | — |

### 3.3 Lo que hoy NO toca la heladera (y conviene saberlo)

| Qué | Qué hace hoy |
|---|---|
| Crear un pedido de combos (`crear_pedido_combos`) | Guarda el pedido, pero la heladera no baja. Todos los platos le aparecen a la cocina. |
| Crear un pedido viejo (`POST /api/pedidos`, la web vieja) | Lo mismo: no mira la heladera y la cocina cocina todo. |
| Pasar a 2 "En Preparación" | `verificarStockPedido` revisa que alcancen los **insumos** de TODO el pedido (receta × cantidad). Si no alcanzan, no deja pasar. |
| Pasar a 3 "Listo para Entregar" o a 4 "Entregado" | `descontarStockPedido` descuenta los **insumos** de TODO el pedido, una sola vez por pedido. Al pasar a 3 marca todos los platos como listos. |
| Anular (con PIN) | Solo cambia el estado a 5. No devuelve nada. |
| Tareas de Cocina (`/api/cocina/tareas`, `cocinero.js`) | No toca la heladera, pero **esconde los platos que tienen `listo` = sí**. Esto va a servir (ver 4 ✅ punto 9). |

**En resumen: hoy la heladera es una isla.** Entran viandas (producción) y salen (descarte), pero ningún pedido la toca.
Por eso el número de Producción no baja cuando se vende.

---

## 4. Qué está bien, qué está mal o sobra, y qué falta

### ✅ Está bien (se aprovecha tal cual)

1. La base no deja stock negativo (`check >= 0`). Aunque el código tuviera un error, nunca quedan −3 fideos.
2. El cuaderno ya acepta `venta`, `devolucion` y `ajuste`, y ya tiene la columna `id_pedido` con índice.
3. Todo lo que mueve la heladera está en funciones todo o nada, con candado y siempre en el mismo orden.
4. Solo el servidor puede ejecutar esas funciones (`revoke` / `grant`), y las tablas tienen RLS.
5. En todas las rutas el usuario sale del token, así que nadie puede firmar a nombre de otro.
6. La producción descuenta los insumos **una sola vez, al cocinar**, y deja anotado qué gastó cada tanda.
7. `pedido_detalles` ya tiene `cantidad_de_heladera`, `listo`, `personalizado` y `observaciones_plato`, así que **no hace falta ninguna columna nueva**.
8. La web ya limita lo que se elige con `disponibles`, y no muestra el stock real completo.
9. La cocina ya esconde los platos con `listo` = sí, tanto en `/api/cocina/tareas` como en `cocinero.js`.
   Si los platos de heladera nacen listos, la cocina ve solo los personalizados **sin cambiar la pantalla de cocina**.
10. Ya existe el usuario Consumidor Final. Sirve para firmar las ventas de los pedidos sin login, porque en el cuaderno quién es obligatorio.

### ⚠️ Está mal o sobra

| # | Qué | Por qué importa | Qué propongo |
|---|---|---|---|
| 1 | `verificarStockPedido` y `descontarStockPedido` (a través de `calcularConsumoPedido`) usan la cantidad **total** de cada plato | Con la heladera conectada, a las viandas de heladera se les descontarían los insumos **dos veces**: al cocinarlas y al pasar a 3. Y al pasar a 2 podrían frenar un pedido por "falta harina" aunque las viandas ya estén hechas. | **A1:** contar solo `cantidad − cantidad_de_heladera`. |
| 2 | `descontarStockPedido` no es todo o nada | Si falla a la mitad, quedan insumos descontados sin su movimiento. Además lee el stock y recién después escribe, así que dos cambios de estado al mismo tiempo pueden pisarse. | **C1** (opcional): pasarlo a una función de la base. |
| 3 | Para no descontar dos veces, busca el texto "pedido #100" en el motivo | Ese texto también está dentro de "pedido #1000". Si se procesa el #1000 antes que el #100, el #100 no descuenta nada. | **C1** también lo arregla. |
| 4 | Sus mensajes de error llevan el detalle interno de la base y se le muestran a tu prima | Va contra la regla del CLAUDE.md de no mostrar errores internos. | En **A1**, de paso (si me das el OK). |
| 5 | `console.log('[DEBUG RECETA]')` y `[STOCK DEBUG]` en `calcularConsumoPedido` | Llenan la consola del servidor en cada cambio de estado. | En **A1**, de paso (si me das el OK). |
| 6 | Un pedido Anulado (estado 5) se puede volver a mover a otro estado: la grilla muestra el selector y el servidor lo deja | Con la heladera conectada, las viandas ya volvieron pero el pedido "revive", y los números dejan de cuadrar. | **A3:** que 5 sea final en el servidor. **B2:** que la grilla ni lo ofrezca. |
| 7 | `GET /api/viandas-stock` solo trae platos activos | Si se desactiva un plato que tiene viandas en la heladera, desaparece de Producción y esas viandas no se pueden ni descartar. | **B5** |
| 8 | No hay pantalla para cambiar el mínimo de cada plato (todos tienen 5) | Con combos de 10 viandas, 5 es poco: el aviso "Bajo" llega tarde. | **B4** |
| 9 | `registrar_tanda_viandas`, `registrar_tanda_multiple`, `id_lote` y su secuencia no los usa nadie | No hacen daño (solo el servidor puede llamarlas), pero confunden, y ahí "combo" significa otra cosa. | Dejarlas: no se borra nada sin preguntarte. Marcarlas "sin uso" en los comentarios (**B9**). |
| 10 | Un comentario viejo en `stock_viandas_funciones.sql` nombra la ruta `/tanda`, y `docs/informe_stock_viandas.md` describe rutas que ya no existen | Confunden al leer. | **B9:** actualizarlos. |

### ❌ Falta para conectar los combos

1. **`crear_pedido_combos`** tiene que:
   - controlar que alcance la heladera;
   - descontar;
   - anotar la `venta`;
   - en los platos de heladera, poner `cantidad_de_heladera` = cantidad y `listo` = sí.
2. **Anular** tiene que devolver las viandas en los estados 1, 2 y 3. Va a ser una función nueva, todo o nada.
3. **`calcularConsumoPedido`** tiene que restar `cantidad_de_heladera`.
4. Un pedido anulado no puede cambiar más de estado.
5. Hay que decidir quién pasa a "Listo" un pedido que es **todo de heladera**, porque la cocina no lo va a ver (**Pregunta 1**).
6. Al final, las pantallas: ver las reservadas, las ventas y devoluciones con su pedido, etc. (sección 6).

---

## 5. El circuito completo con la heladera conectada

### 5.1 Dibujo

```
  LLENAR LA HELADERA (ya existe)
  ──────────────────────────────
  Producción: "Pedir a cocina" ──► Cocina: "Hecho"  (marcar_detalle_hecho)
                                     │  insumos: − receta × 10   ◄── la ÚNICA vez para estas viandas
                                     │  cuaderno: produccion +10
                                     ▼
              ┌──────────────────────────────────────────┐
  descarte ◄──┤  HELADERA  (productos.stock_heladera)    │◄── devolución (+)
    (−)       │  = viandas LIBRES para vender            │    al anular en 1, 2 o 3
              └────────────────────┬─────────────────────┘
                                   │  venta (−) AL CREAR el pedido
                                   ▼
  VENDER (lo nuevo)
  ─────────────────
  Web: el cliente arma el combo ──► crear_pedido_combos (todo o nada)
                                      ├─ plato normal ──► sale de la heladera
                                      │                   cantidad_de_heladera = cantidad · listo = sí
                                      └─ personalizado ─► NO sale de la heladera
                                                          cantidad_de_heladera = 0 · listo = no ──► cocina

  ESTADOS DEL PEDIDO
  ──────────────────
  1 Pendiente ──► 2 En Preparación ──► 3 Listo para Entregar ──► 4 Entregado
                    │                    │
                    │ revisa insumos     │ descuenta insumos SOLO de los personalizados
                    │ SOLO de los        │ (cantidad − cantidad_de_heladera)
                    │ personalizados     │
                    ▼
          Tareas de Cocina ve SOLO los personalizados
          (un pedido todo de heladera no aparece → Pregunta 1)

  ANULAR (con PIN)
  ────────────────
  en 1, 2 o 3  ──► las viandas vuelven a la heladera (devolución +)
  en 4         ──► no vuelve nada (ya se entregaron)
  5 Cancelado  ──► es final: no vuelve a otro estado
```

### 5.2 Ejemplo con números: pedido #500

Un cliente sin login compra un **PRUEBA Mantenimiento x10** ($137.000):
6 fideos + 3 berenjenas rellenas + 1 fideos "sin sal".

**Lo que guardaría `pedido_detalles`:**

| Plato | cantidad | cantidad_de_heladera | listo | personalizado | texto |
|---|---|---|---|---|---|
| fideos | 6 | 6 | sí | no | — |
| berenjenas rellenas | 3 | 3 | sí | no | — |
| fideos | 1 | 0 | no | sí | sin sal |

**Lo que anotaría el cuaderno** (un renglón por plato; si el plato está en dos combos del pedido, se suma):

| tipo | plato | cantidad | id_pedido | quién | motivo |
|---|---|---|---|---|---|
| venta | fideos | −6 | 500 | Consumidor Final | Pedido #500 |
| venta | berenjenas rellenas | −3 | 500 | Consumidor Final | Pedido #500 |

**Paso a paso:**

| Momento | Fideos libres | Berenjenas libres | Insumos | La cocina ve |
|---|---|---|---|---|
| Antes | 71 | 21 | — | — |
| Se crea el #500 (estado 1) | **65** | **18** | nada | nada (está en 1) |
| Pasa a 2 | 65 | 18 | revisa la receta de 1 fideos | "1 fideos ⚠ sin sal" |
| La cocina toca ✓ Listo → pasa a 3 | 65 | 18 | **− receta de fideos × 1** | nada |
| Pasa a 4 | 65 | 18 | nada (ya se descontó) | — |
| *Si en vez de eso se anulaba en 1, 2 o 3* | *71 (+6)* | *21 (+3)* | *nada* | — |

Cómo sale el "× 1" de los insumos: se toma cada renglón y se hace `cantidad − cantidad_de_heladera`.
Da 6 − 6 = 0, 3 − 3 = 0 y 1 − 0 = **1**. Solo el fideos "sin sal" gasta insumos.

**El mismo pedido, hoy (sin conectar) y conectado:**

| | Hoy (sin conectar) | Conectado |
|---|---|---|
| La heladera al crear el pedido | no baja (71 y 21) | baja (65 y 18) |
| La cocina ve | los 10 platos | solo el personalizado |
| Insumos al pasar a 3 | receta × 10 | receta × 1 |
| Si las 9 viandas en realidad salieron de la heladera | sus insumos se cuentan **2 veces** (al cocinarlas y al pasar a 3) | **1 sola vez** (al cocinarlas) |

### 5.3 Quién descuenta qué y cuándo (la prueba de que nada se descuenta dos veces)

| Momento | Heladera | Insumos |
|---|---|---|
| La cocina toca "Hecho" (producción) | **+N** | **− receta × N** ← la única vez para esas viandas |
| El cliente crea el pedido | **−** los platos normales (`venta`) | nada |
| Pasa a 2 | nada | solo **revisa** los personalizados |
| Pasa a 3 o 4 | nada | **−** receta × personalizados (una sola vez) |
| Se anula en 1, 2 o 3 | **+** lo que se llevó (`devolucion`) | nada (lo cocinado no se "descocina") |
| Se anula en 4 | nada | nada |
| Descartar | **−N** | nada |

Cada vianda gasta sus insumos **una sola vez**:
- si es de heladera, al cocinarla para la heladera;
- si es personalizada, cuando el pedido pasa a 3 o 4.

### 5.4 Libres y reservadas

Con la regla "se descuenta al crear el pedido", el número `stock_heladera` cambia de significado:
- **Hoy** quiere decir "cuántas hay en la heladera".
- **Conectado** va a querer decir "cuántas hay **libres para vender**".

Las 6 del pedido #500 siguen en la heladera hasta que se entregan, pero ya no se cuentan:

```
  Heladera de verdad (fideos): 71
  ├── 65 libres      → stock_heladera (lo que ven la web y Producción)
  └──  6 reservadas  → pedido #500 (en estado 1, 2 o 3)
```

Para saber las reservadas de un plato, se suma `cantidad_de_heladera` de los pedidos en estado 1, 2 o 3. No hace falta ninguna columna nueva.

**Por qué importa:** tu prima cuenta la heladera y ve 71, pero la pantalla dice 65.
Si "corrige" a 71, esas 6 quedan contadas dos veces.
Por eso, en las pantallas, **lo primero es mostrar las reservadas (B1)**, y el Ajuste, si se hace, va después (B10).

### 5.5 Casos raros que ya pensé

| Caso | Qué pasaría |
|---|---|
| Dos clientes compran las últimas 3 viandas al mismo tiempo | Por el candado del plato, el segundo espera. Después ve que no alcanza y recibe un mensaje claro, sin que nada quede guardado a medias. Además la base nunca deja negativo. |
| El mismo plato en dos combos del pedido (8 + 8 fideos) | Se suman (16) para controlar y para descontar. |
| Se anula dos veces | La segunda vez dice "ya está anulado". Además, lo que se devuelve sale del cuaderno de ese pedido (ventas − devoluciones), así que nunca se puede devolver de más. |
| Un pedido que nunca se paga | Sus viandas quedan reservadas hasta que alguien lo anule. Conviene anular los pendientes viejos; la ventana de B6 ayuda a encontrarlos. |
| Se rompe una vianda reservada | Para el pedido se usa una libre y se registra un descarte de 1. Si no hay libres, se pide a cocina. |
| Pedidos de la web vieja (hasta el paso 17) | No tocan la heladera, igual que hoy (`cantidad_de_heladera` = 0): la cocina hace todo y los insumos se descuentan al pasar a 3 o 4. Todo lo nuevo funciona con los dos tipos de pedido. |
| Pedidos de combos de prueba creados antes de conectar | Quedan como "todo a cocina" (0). Si se anulan, no devuelven nada, porque nunca sacaron de la heladera. |
| Personalizado de un plato sin stock | Se puede (lo decidiste vos): un personalizado no mira la heladera. |

---

## 6. Pantallas que habría que cambiar (al final)

Antes, una buena noticia: **el aviso de stock bajo ya va a funcionar solo.**
Como las ventas bajan el número, "Bajo", "Sin stock" y "Te faltan N platos" van a aparecer cuando se venda.
Lo que falta es poder cambiar el mínimo (B4).

| # | Pantalla | Qué cambiar | Para qué | Qué toca | Importancia |
|---|---|---|---|---|---|
| B1 | Producción (tabla) | "En stock" pasa a llamarse "Libres", y se agregan las columnas "Reservadas" y el total "En heladera" | Que el conteo de la heladera de verdad cuadre con la pantalla | `/api/viandas-stock` + `heladera.js` | **Alta** |
| B2 | Consultar Pedidos | En Detalles, cada plato con "🧊 heladera" o "👩‍🍳 cocina". Una marca "Todo de heladera". Sin selector de estado si está anulado. Al anular, un mensaje como "Volvieron 9 viandas a la heladera". | Tu prima sabe qué pedidos no esperan a la cocina y no puede revivir un anulado | `/api/pedidos` (+ `cantidad_de_heladera`) + `ListarPedidos.js` | **Alta** |
| B3 | Producción (Últimos movimientos) | Filtro por tipo (Producción / Ventas / Devoluciones / Descartes) y "ver más". El número de pedido ya se va a ver en el motivo (A4). | Con ventas, 50 renglones se llenan en un día | `/api/movimientos-viandas` + `heladera.js` | Media |
| B4 | Producción | Cambiar el mínimo de cada plato | Hoy todos tienen 5 y no hay dónde cambiarlo | ruta nueva + `heladera.js` | Media |
| B5 | Producción | Mostrar los platos desactivados que todavía tienen viandas | Hoy desaparecen de la pantalla | `/api/viandas-stock` | Media |
| B6 | Producción | Al tocar "Reservadas": qué pedidos las tienen (número, cliente, estado y fecha de entrega) | Saber quién se llevó cada vianda y encontrar pedidos viejos sin pagar | ruta nueva + `heladera.js` | Media |
| B7 | Web del cliente | Si el servidor dice "no alcanza", volver a pedir los combos para mostrar lo que queda | Si no, el armado sigue mostrando números viejos | `pedidoCombos.js` | Media |
| B8 | Combos (panel) | En "Menú", cuántas libres tiene cada plato. En la lista, un aviso "no alcanza para armar". | Tu prima ve si un combo se puede vender | `/api/combos/:id/menu` + `gestionCombos.js` | Baja |
| B9 | Documentación | Actualizar `informe_stock_viandas.md` y los comentarios viejos; marcar "sin uso" las funciones de tanda | Que no confundan | `docs/`, comentarios en `sql/` | Baja |
| B10 | Producción (opcional) | Botón "Ajustar" para cargar un conteo físico | Corregir diferencias | función nueva + ruta + pantalla | Baja, y **siempre después de B1** |
| — | Tareas de Cocina | Nada | Los platos de heladera nacen listos y no aparecen | — | — |
| — | Movimientos de Stock | Nada | Las ventas de heladera no mueven insumos | — | — |
| — | Reportes | Nada obligatorio. Opcional: vendidas de heladera contra cocinadas a pedido. | — | — | — |

---

## 7. El plan en pasos chicos

**La idea:** primero se preparan las piezas que hoy no cambian nada.
El último paso (A4) es el "interruptor": desde ahí, la web nueva saca de la heladera.
Así nunca hay un rato en que la heladera descuente sin que anular devuelva, ni con insumos descontados dos veces.

Cada paso sigue la forma de siempre: te muestro el plan → me das el OK → lo hago → te lo explico → frenamos.

### Fase A: conectar la heladera (sin tocar pantallas)

| Paso | Qué | Archivos | ¿Cambia algo hoy? |
|---|---|---|---|
| **A0** | Revisar la base (solo lectura) | `sql/heladera_revisar.sql` (nuevo; lo corrés vos) | No |
| **A1** | `calcularConsumoPedido` cuenta solo lo que cocina la cocina | `server.js` | No (hoy todo tiene 0) |
| **A2** | Función nueva `anular_pedido_con_devolucion`: devuelve en 1, 2 y 3 | `sql/anular_pedido_con_devolucion.sql` (nuevo; lo corrés vos) | No (todavía no hay ventas para devolver) |
| **A3** | La ruta Anular usa `anular_pedido_con_devolucion`, y un anulado no cambia más de estado | `server.js` | Solo el bloqueo del anulado |
| **A4** | `crear_pedido_combos` con heladera: **el interruptor** | `sql/pedido_combos_funciones.sql` + `sql/pedido_combos_probar.sql` (los corrés vos) | **Sí:** desde acá la web nueva descuenta |
| **A5** | Prueba completa en la base real | lista de pruebas + SQL de lectura | Pedidos de prueba |

**A0. Revisar la base (solo lectura).** Responde 5 preguntas:
1. ¿Cuadra el `stock_heladera` de cada plato con la suma de su cuaderno? (regla de oro, 1.5)
2. ¿Cuántos renglones hay de cada tipo? ¿Alguno tiene `id_pedido`?
3. ¿Qué funciones de la heladera están instaladas de verdad en la base? Así sabemos si coinciden con `sql/`.
4. ¿Hay platos desactivados con viandas?
5. ¿Hay pedidos de combos de prueba abiertos (estados 1 a 3)? Conviene anularlos antes de A5.
   Si no, al pasarlos a 3 descontarían insumos reales de los 10 platos.

**A1. `calcularConsumoPedido` (server.js).**
- Cambia 2 o 3 líneas: lee también `cantidad_de_heladera` y usa `cantidad − cantidad_de_heladera`.
- Con eso se arreglan juntas `verificarStockPedido` (al pasar a 2) y `descontarStockPedido` (al pasar a 3 o 4), sin tocarlas.
- Hoy no cambia nada, porque todos los pedidos tienen 0.
- De paso, si me das el OK: sacar los `console.log` de debug y cambiar los mensajes que muestran el detalle de la base.
- *Seguridad:* el cálculo sale de la base, no de lo que manda el navegador.

**A2. `anular_pedido_con_devolucion(p_id_pedido, p_id_usuario)`: función nueva, todo o nada.**
1. Le pone candado al pedido. Si no existe → error. Si ya está en 5 → "El pedido ya está anulado".
2. Si está en 1, 2 o 3: mira el cuaderno de ese pedido (ventas − devoluciones) por plato.
   A esos platos les pone candado (por id) y anota un renglón `devolucion` (+) con quién anuló y el motivo "Anulación del pedido #N".
   Después suma esas viandas a la heladera.
3. Si está en 4: no devuelve nada.
4. Pasa el pedido a 5 y devuelve cuántas viandas volvieron.
- Sirve para pedidos viejos y nuevos: los viejos no tienen ventas en el cuaderno, así que no devuelven nada, igual que hoy.
- *Seguridad:* todo o nada (nunca "anulado pero sin devolver"); candado contra dos anulaciones a la vez; `revoke`/`grant` para que solo la llame el servidor; RLS sin cambios.

**A3. Rutas (server.js).**
- `POST /api/pedidos/:id/anular`:
  - Sigue igual: el PIN, los roles y el límite de intentos.
  - Cambia la parte de "leer y actualizar": ahora llama a `anular_pedido_con_devolucion`.
  - El usuario sale del token.
  - La respuesta dice cuántas viandas volvieron.
- `PUT /api/pedidos/:id/estado`: si el pedido está en 5 → "Un pedido anulado no cambia de estado".
- *Seguridad:* el PIN se sigue controlando en el servidor; un anulado no se puede "revivir" ni desde la grilla ni mandando el pedido a mano.

**A4. `crear_pedido_combos` con heladera: el interruptor.**
- Mismas entradas y misma salida, así que **`server.js` no cambia**.
- PARTE 1 (controla, no escribe):
  1. Suma por plato las viandas normales (no personalizadas) de todos los combos del pedido.
  2. Les pone candado a esos platos, por id.
  3. Si a alguno no le alcanza, devuelve un mensaje como: "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12."
- PARTE 2 (guarda): todo lo de hoy, y además:
  - Por cada plato normal: resta de la heladera y anota un renglón `venta` (−) con el `id_pedido`, el usuario del pedido (el cliente, o Consumidor Final) y el motivo "Pedido #N". Con ese motivo, el panel de Producción ya muestra el número sin cambiar la pantalla.
  - Platos normales: `cantidad_de_heladera` = cantidad y `listo` = sí.
  - Personalizados: 0 y no, como hoy.
- Pruebas en `pedido_combos_probar.sql`: casos que fallan sin escribir nada ("más de lo que hay", "el mismo plato en dos combos que juntos pasan lo que hay"), y el caso bueno comentado.
- *Seguridad:* la base vuelve a controlar el stock aunque la web ya lo haya hecho (no se confía en el navegador). El candado evita vender dos veces la misma vianda. Si algo falla, no se guarda nada.

**A5. Prueba completa en la base real** (pedidos con el nombre "PRUEBA – NO PREPARAR"):
1. Mirar cuántos fideos hay en Producción (por ejemplo, 71).
2. Desde la web nueva, armar un PRUEBA x10 con 9 fideos + 1 fideos "sin sal".
   → Producción muestra 62, y en Últimos movimientos aparece "−9 fideos · Venta · Pedido #N".
3. Pasarlo a 2: Tareas de Cocina muestra solo "1 fideos ⚠".
4. Pedir más de lo que hay → sale un mensaje claro y no se guarda nada.
5. Anular el pedido (en 1 o 2) → vuelve a 71 y aparece un renglón Devolución.
   Anular otra vez → "ya está anulado". Mover el anulado de estado → no deja.
6. Pasar a 3 un pedido **sin** personalizados → en Movimientos de Stock no aparece ningún consumo de insumos.
- ⚠ Las pruebas tocan la heladera real por un rato. Conviene hacerlas cuando tu prima no esté cargando, y **anular siempre los pedidos de prueba al final**.
- El paso a 3 se prueba con un pedido sin personalizados, así no se descuentan insumos reales.

### Fase B: pantallas (cuando la Fase A ande)

En este orden: **B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 → B10 (opcional)**. Están en la tabla de la sección 6.

Todo esto tiene que estar listo **antes del paso 17** (cuando la web nueva reemplaza a la vieja), porque ahí empiezan las ventas reales.

### Fase C: opcionales (no hacen falta para la heladera)

- **C1.** Pasar `descontarStockPedido` a una función de la base. Así sería todo o nada, sin carreras entre dos cambios de estado, y sin buscar texto en el motivo (arregla los puntos 2 y 3 de ⚠️).
- **C2.** Que un pedido todo de heladera pase solo a "Listo para Entregar" (si en la Pregunta 1 elegís la opción b).
- **C3.** Las funciones viejas de tanda quedan como están, con un comentario "sin uso" (B9).

---

## 8. Preguntas para vos (antes de A1)

1. **Pedido todo de heladera:** nadie en la cocina lo va a ver. Si queda en 2, tampoco aparece en Envíos, que muestra solo 3 y 4. ¿Quién lo pasa a "Listo para Entregar"?
   - **a)** Tu prima, a mano en Consultar Pedidos: lo pasa a 2 (confirmando el pago, como siempre) y después a 3.
     **Recomendado para empezar:** no hay que programar nada, y en B2 se le marca "Todo de heladera".
   - **b)** Automático: al pasar a 2, si no hay nada para cocinar, salta a 3 (C2).
2. **¿Un pedido Anulado puede volver a otro estado?** Recomiendo que **no** (5 es final). Si se anuló por error, se carga de nuevo.
3. **En A1, ¿aprovecho** para sacar los `console.log` de debug y cambiar los mensajes que muestran el detalle de la base?
4. **Pruebas de A5 en la base real:** tocan la heladera real un rato. ¿Está bien hacerlas cuando tu prima no esté cargando?
5. **Funciones viejas** (tanda, tanda múltiple, `id_lote`): ¿quedan como están? Recomiendo que sí, marcadas "sin uso".
