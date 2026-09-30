# 🧪 Informe de Testing E2E — Fast Good (Migración Supabase)

**Fecha:** 23 de septiembre de 2026, 15:29 hs  
**Resultado:** ✅ **38/38 tests pasaron — 0 fallos — 0 warnings**

---

## Resumen Ejecutivo

Se ejecutaron pruebas automáticas end-to-end contra el servidor Express corriendo en `localhost:3000`, conectado al nuevo Supabase (`ilnhenuwspvfxtqxwyrh.supabase.co`). Las pruebas cubren el **flujo real completo** del sistema: login, catálogo, stock, recetas, pedidos, usuarios, reportes, envíos y cocina.

> **La migración está 100% operativa. Todas las tablas, relaciones y APIs responden correctamente.**

---

## Resultados por Módulo

### 1. Login / Autenticación (6/6 ✅)

| Test | Resultado |
|------|-----------|
| Login con `nombre_usuario` "mauro_admin" + contraseña "[REDACTADO]" | ✅ Token JWT generado |
| Login con contraseña incorrecta | ✅ Rechazado (401) |
| Login con usuario inexistente | ✅ Rechazado (401) |
| Login por email (`mauricio.test@fastgood.com`) | ✅ Funciona |
| Login con nombre_usuario "lucas" (admin) | ✅ rol=1 |
| Estructura de respuesta (id, nombre, email, id_rol) | ✅ Completa |

### 2. Catálogo — categorías, planes, productos (5/5 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/v1/categorias` | ✅ 4 categorías |
| `GET /api/v1/catalogo` (árbol completo) | ✅ 4 cats, 8 planes |
| `GET /api/v1/categorias/:id/planes` | ✅ 5 planes en cat #1 |
| `GET /api/v1/productos` (activos) | ✅ 4 productos |
| `GET /api/planes` | ✅ 8 planes activos |

### 3. Stock e Insumos (3/3 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/insumos` | ✅ 36 insumos |
| `GET /api/categorias-insumos` | ✅ 8 categorías |
| `GET /api/movimientos-stock` | ✅ 4 movimientos |

### 4. Recetas (2/2 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/recetas` | ✅ 1 producto con receta |
| Estructura de receta | ✅ "Pollito a la caserola con verduras al horno" — 1 insumo |

### 5. Crear Producto con Receta (2/2 ✅)

| Test | Resultado |
|------|-----------|
| `POST /api/productos/con-receta` | ✅ id=5, código=3 |
| Receta del producto creado existe en BD | ✅ 1 insumo asociado |

### 6. Flujo Completo de Pedido (6/6 ✅)

| Test | Resultado |
|------|-----------|
| Crear pedido (`POST /api/pedidos`) | ✅ pedido_id=4 |
| Pedido aparece en `GET /api/pedidos` | ✅ Encontrado |
| Cambiar estado → En Preparación (2) | ✅ id_estado=2 |
| Cambiar estado → Listo (3) — **descuenta stock** | ✅ id_estado=3, stock descontado |
| Marcar como pagado | ✅ pagado=true |
| Cambiar estado → Entregado (4) | ✅ id_estado=4 |

### 7. Estados (1/1 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/estados` | ✅ 5 estados: Registrado, En Preparación, Listo para Entregar, Entregado, Cancelado |

### 8. Cocineros (2/2 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/cocineros` | ✅ 3 cocineros |
| `GET /api/planes/cocineros` | ✅ 8 planes con asignación |

### 9. Gestión de Usuarios (1/1 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/usuarios` | ✅ 15 usuarios |

### 10. Registro de Usuario (2/2 ✅)

| Test | Resultado |
|------|-----------|
| `POST /api/register` (crear cuenta nueva) | ✅ Usuario creado |
| Login con usuario recién registrado | ✅ Token JWT generado |

### 11. Reportes (5/5 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/reportes/resumen` | ✅ OK |
| `GET /api/reportes/ingresos-por-dia` | ✅ OK |
| `GET /api/reportes/gastos-por-dia` | ✅ OK |
| `GET /api/reportes/productos-mas-vendidos` | ✅ OK |
| `GET /api/reportes/stock-movimientos` | ✅ OK |

### 12. Barrios y Envíos (2/2 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/barrios` | ✅ 60 barrios |
| `GET /api/envios` | ✅ 2 envíos |

### 13. Tareas de Cocina (1/1 ✅)

| Test | Resultado |
|------|-----------|
| `GET /api/cocina/tareas` | ✅ 0 tareas (correcto, no hay pedidos en estado 2) |

---

## Bugs Encontrados y Corregidos Durante el Testing

Se detectaron y corrigieron **5 bugs** relacionados con la migración de Supabase. Todos se debían al mismo problema raíz: **la columna de contraseña en la BD vieja se llamaba `contraseña` (con ñ), pero en la nueva se llama `contrasena` (sin ñ)**.

| # | Ruta afectada | Bug | Fix aplicado |
|---|--------------|-----|-------------|
| 1 | `POST /api/login` | Hacía `.select('contraseña')` → error 400 de Supabase. Buscaba solo por columna `nombre` (no por `nombre_usuario`). | Reescrito completo: busca por `nombre_usuario` → `email` → `nombre`, usa `.select('*')` y lee `usuario.contrasena`. |
| 2 | `POST /api/register` | `.insert({contraseña: hash})` → columna no existe | Cambiado a `contrasena: hash` |
| 3 | `POST /api/usuarios/crear` | `nuevoRegistro['contraseña'] = hash` → columna no existe | Cambiado a `'contrasena'` |
| 4 | `PUT /api/usuarios/:id` | `campos['contraseña'] = hash` → columna no existe | Cambiado a `'contrasena'` |
| 5 | `POST /api/recuperar-password` | `campoActualizar['contraseña'] = hash` → columna no existe | Cambiado a `'contrasena'` |

---

## ⚠️ Nota sobre la Contraseña del Usuario `mauro_admin`

El hash almacenado en la base de datos (`[REDACTADO]`) corresponde a la contraseña **[REDACTADO]**, **NO** a la que se pensaba originalmente. Esto fue verificado con `bcrypt.compare()`.

---

## Datos del Entorno Verificado

| Componente | Valor |
|------------|-------|
| Supabase URL | `https://ilnhenuwspvfxtqxwyrh.supabase.co` |
| Servidor | Express 5 en `localhost:3000` |
| Tablas verificadas | `usuarios`, `categorias`, `planes`, `productos`, `insumos`, `categorias_insumos`, `producto_insumo`, `pedidos`, `pedido_detalles`, `estados`, `barrios`, `movimientos_stock`, `pedido_cocineros` |
| Usuarios en BD | 15 |
| Categorías | 4 |
| Planes | 8 |
| Insumos | 36 |
| Barrios | 60 |
| Estados | 5 |

---

## Limpieza

Todos los datos de prueba creados durante el testing fueron eliminados automáticamente:

- 🗑️ Pedido de prueba → eliminado
- 🗑️ Producto de prueba → receta eliminada
- 🗑️ Usuario de prueba → eliminado


---

## 🔧 Fix: Eliminar receta desactiva el producto (soft delete)

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **7/7 verificaciones pasaron**

### Problema

Al eliminar un producto desde **Generar Receta**, `DELETE /api/recetas/:idProducto` solo borraba las filas de `producto_insumo`. El producto quedaba con `activo = true` y seguía apareciendo en el catálogo.

### Solución

En `server.js`, después de borrar la receta, el endpoint ahora hace `UPDATE productos SET activo = false WHERE id = :idProducto`.

El producto **no se borra** de la tabla `productos` (soft delete), para que los pedidos históricos no queden con un `id_producto` huérfano.

`GET /api/v1/catalogo` ya filtraba los productos por `activo`, así que no hubo que cambiarlo.

### Prueba

Se levantó una instancia del servidor con el código nuevo en `localhost:3001` y se probó con `fetch` contra la API, más una consulta directa a Supabase.

| # | Paso | Resultado |
|---|------|-----------|
| 1 | `POST /api/productos/con-receta` (plan 7, 1 insumo) | ✅ 200 — producto `id=7` creado |
| 2 | El producto aparece en `GET /api/v1/catalogo` | ✅ `true` |
| 3 | `DELETE /api/recetas/7` | ✅ 200 — "Receta eliminada y producto desactivado correctamente" |
| 4 | El producto aparece en `GET /api/v1/catalogo` | ✅ `false` (ya no aparece) |
| 5 | La fila sigue en la tabla `productos` | ✅ `{"id":7,"nombre":"_TEST_SOFT_DELETE_1790195270011","activo":false}` |
| 6 | Filas en `producto_insumo` para `id_producto=7` | ✅ 0 |
| 7 | El producto aparece en `GET /api/recetas` | ✅ `false` |

> **Nota:** el producto de prueba `id=7` (`_TEST_SOFT_DELETE_…`) quedó en la base con `activo = false`, porque este fix justamente evita borrar productos. Se puede borrar a mano desde Supabase si molesta.


---

## 📄 Paginación client-side en 4 pantallas

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **54/54 verificaciones pasaron**

### Qué se hizo

Se agregó paginación **en memoria** (15 registros por página) a Consultar Pedidos, Gestión de Stock, Generar Receta y Movimientos de Stock. El backend (`server.js`) no se tocó.

| Archivo | Cambio |
|---------|--------|
| `frontend/src/js/paginacion.js` | **Nuevo.** Función reutilizable `crearPaginacion({ datos, porPagina, contenedorTabla, contenedorPaginacion, funcionRenderFila, filaVacia, paginaInicial })`. Dibuja solo las filas de la página actual y los controles `[← Anterior] Página X de Y [Siguiente →]`. |
| `frontend/src/css/global.css` | Clases `.paginacion`, `.paginacion-btn` y `.paginacion-info`: botones verdes (`--color-primary`), gris cuando están deshabilitados, y el contenedor se oculta si no hay datos. |
| 4 HTML | Se agregó `<div id="paginacion" class="paginacion"></div>` debajo de la tabla y `<script src="../src/js/paginacion.js">` antes del script de la pantalla. |
| `stock.js`, `generarReceta.js`, `MovimientosStock.js` | La función de render pasa a llamar a `crearPaginacion`. El armado de cada fila se movió a una función propia (`crearFilaInsumo`, `crearFilaReceta`, `crearFilaMovimiento`). Los filtros no cambiaron: ya filtraban el array y llamaban al render, que ahora arranca en la página 1. |
| `ListarPedidos.js` | Además de lo anterior (`renderizarPedidos` + `crearFilaPedido`): el buscador ocultaba filas del DOM con `display:none`, y con paginación eso solo filtraba la página visible. Ahora filtra el array con el mismo criterio (nombre de cliente o N° de pedido) y vuelve a dibujar. Al cambiar el estado de un pedido también se actualiza `pedido.id_estado` en memoria, para que no vuelva al estado anterior al cambiar de página. Al eliminar un pedido se redibuja respetando el filtro y la página actual. |

**Orden de uso:** primero se filtra el array completo y después se pagina el resultado. Cualquier cambio de filtro vuelve a la página 1.

### Prueba

Script con Chrome headless (`puppeteer-core`), con sesión de admin inyectada en `localStorage`. Las páginas se cargaron desde el servidor real en `localhost:3000`.

- **Fase A — API simulada:** se interceptaron los `GET /api/*` y se devolvieron **40 registros** por pantalla, porque con los datos reales solo Stock pasa de 15.
- **Fase B — API real:** las 4 pantallas se cargaron contra el backend y la base reales.

#### Fase A — 40 registros simulados (13 pruebas en Pedidos y 11 en cada una de las otras pantallas)

| Verificación | Pedidos | Stock | Recetas | Movimientos |
|--------------|:-:|:-:|:-:|:-:|
| Carga inicial: 15 filas y "Página 1 de 3" | ✅ | ✅ | ✅ | ✅ |
| Página 1: Anterior deshabilitado, Siguiente habilitado | ✅ | ✅ | ✅ | ✅ |
| Siguiente verde `rgb(40,167,69)` y Anterior deshabilitado gris, desde el CSS global, sin estilos inline | ✅ | ✅ | ✅ | ✅ |
| Siguiente → "Página 2 de 3" con otras filas | ✅ | ✅ | ✅ | ✅ |
| Página intermedia: los dos botones habilitados | ✅ | ✅ | ✅ | ✅ |
| Última página: 10 filas y Siguiente deshabilitado | ✅ | ✅ | ✅ | ✅ |
| Anterior → vuelve a "Página 2 de 3" | ✅ | ✅ | ✅ | ✅ |
| Filtro aplicado desde la página 2 vuelve a la página 1 y pagina el resultado filtrado | ✅ (4 resultados → 1 de 1) | ✅ (20 → 1 de 2) | ✅ (20 → 1 de 2) | ✅ (20 → 1 de 2) |
| Filtro sin resultados: se muestra el mensaje vacío y se ocultan los controles | ✅ | ✅ | ✅ | ✅ |
| Limpiar filtros → "Página 1 de 3" | ✅ | ✅ | ✅ | ✅ |
| Un estado cambiado se mantiene después de cambiar de página y volver | ✅ | — | — | — |
| Eliminar en la página 3 mantiene la página (39 pedidos → 9 filas) | ✅ | — | — | — |
| Sin errores de JavaScript | ✅ | ✅ | ✅ | ✅ |

Filtros usados: Pedidos → buscador `"ana"`; Stock → Estado = "Bajo mínimo"; Recetas → Plan = "Plan A"; Movimientos → Tipo = "Solo entradas".

#### Fase B — datos reales (8 pruebas)

| Pantalla | Registros reales | Resultado |
|----------|-----------------:|-----------|
| Consultar Pedidos | 1 | ✅ 1 fila, "Página 1 de 1", sin errores de JS |
| Gestión de Stock | 36 | ✅ 15 filas, "Página 1 de 3", sin errores de JS |
| Generar Receta | 0 | ✅ Mensaje de tabla vacía, controles ocultos, sin errores de JS |
| Movimientos de Stock | 6 | ✅ 6 filas, "Página 1 de 1", sin errores de JS |

> **Nota:** en la prueba de la Fase A, los `PUT`/`DELETE` de Pedidos (cambio de estado y eliminar) también se interceptaron, así que **no se modificó la base de datos**.


---

## 🎨 Ajuste visual: paginación numérica compacta

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **78/78 verificaciones pasaron**

### Qué cambió

Los controles `[← Anterior] Página X de Y [Siguiente →]` se reemplazaron por una paginación numérica: `‹ 1 ... 4 5 6 ... 12 ›`. Solo cambió la parte visual. El corte de datos por página, los filtros y las 4 pantallas quedaron igual.

| Archivo | Cambio |
|---------|--------|
| `frontend/src/js/paginacion.js` | `crearControles()` dibuja las flechas `‹` `›` y los números. `numerosVisibles()` muestra como máximo 5 números: siempre la primera y la última página, y las 3 alrededor de la actual, con `...` en los huecos. Las flechas y los números tienen `aria-label`, y la página actual tiene `aria-current="page"`. |
| `frontend/src/css/global.css` | Se reemplazó el bloque de paginación por uno nuevo: botones de 30×30 px, fuente de 13px, `border-radius: 8px`, sin bordes. Los números van en gris claro (`#f0f0f0`), la página actual en verde (`--color-primary`) con texto blanco, y las flechas deshabilitadas en gris (`#cfcfcf`). |

### Prueba

Es el mismo script de la sección anterior, adaptado a los controles nuevos. Se agregaron chequeos visuales y un caso con 12 páginas.

| Grupo | Verificaciones | Resultado |
|-------|---------------:|-----------|
| Fase A — 4 pantallas con 40 registros simulados: navegación, filtros, estado vacío, click directo en un número, y colores/tamaños calculados (verde activo `rgb(40,167,69)`, gris `rgb(240,240,240)`, 30×30 px, 13px, centrado, sin estilos inline) | 62 | ✅ 62/62 |
| Fase A2 — 180 registros (12 páginas), máximo 5 números visibles | 8 | ✅ 8/8 |
| Fase B — 4 pantallas con datos reales, sin errores de JS | 8 | ✅ 8/8 |

Números que se ven con 12 páginas:

| Página actual | Controles |
|:-:|---|
| 1, 2, 3 | `‹ 1 2 3 4 ... 12 ›` |
| 5 | `‹ 1 ... 4 5 6 ... 12 ›` |
| 6 | `‹ 1 ... 5 6 7 ... 12 ›` |
| 10, 12 | `‹ 1 ... 9 10 11 12 ›` |

### Ajuste posterior: más chica y alineada a la derecha

Solo se cambió CSS (`global.css`, bloque de paginación). Los botones pasaron de 30×30 a **24×24 px**, la fuente de 13px a **11px** y la separación entre botones a **2px**. Los controles ahora están **alineados a la derecha** (`justify-content: flex-end`). También se achicaron las flechas (17px → 14px), los puntos suspensivos (13px → 11px) y el redondeo de los botones (8px → 6px). Se volvió a correr el test con los valores nuevos: ✅ **78/78**.


---

## 💳 Modal de pago en Consultar Pedidos (Efectivo / Transferencia / Mixto)

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **41/41 verificaciones pasaron** (9 de backend + 32 de interfaz) · ✅ sin regresiones en la paginación (78/78)  
**⚠️ Pendiente:** ejecutar `migracion_pago_mixto.sql` en Supabase. Hasta entonces el guardado real y `GET /api/pedidos` no funcionan con el código nuevo (ver abajo).

### Qué se hizo

| Archivo | Cambio |
|---------|--------|
| `migracion_pago_mixto.sql` | **Nuevo.** Agrega `monto_efectivo NUMERIC(10,2)` y `monto_transferencia NUMERIC(10,2)`. Habilita `'Mixto'` en `metodo_pago`: detecta si la columna es un ENUM (le agrega el valor) o texto con CHECK (reemplaza el CHECK). Agrega un CHECK para que los montos no sean negativos. Completa los pedidos existentes: Efectivo → todo en efectivo; Transferencia → todo por transferencia. Se puede ejecutar más de una vez. |
| `server.js` | `GET /api/pedidos` ahora devuelve `monto_efectivo` y `monto_transferencia`. **Nuevo `PUT /api/pedidos/:id/pago`**, protegido con `requireAuth` (JWT). Valida el método. Lee el `total` **desde la base** (no confía en el que manda el front). Con Efectivo o Transferencia calcula los montos solo; con Mixto exige que los dos montos sean mayores a 0 y que sumen exactamente el total (se compara en centavos). |
| `ConsultarPedidos.html` | HTML del modal `#modalPago`: total del pedido, 3 opciones de método y campos de montos que aparecen solo con Mixto, con un indicador en vivo de cuánto falta o sobra. Estilos en el `<style>` de la página, reutilizando `.modal-overlay` / `.modal-box` / `.modal-header` del modal de Detalles. |
| `ListarPedidos.js` | Botón azul **"Pago"** en Acciones, arriba de "Eliminar" (rojo). Para pedidos Mixto, la columna Método Pago muestra el desglose 💵 / 💳. Se agregaron las funciones del modal (`abrirModalPago`, `guardarPago`, etc.), que guardan con `fg_token`, actualizan el pedido en memoria y redibujan la página actual. Escape y click afuera cierran el modal. |

No se tocó la lógica de estados ni de stock, y el modal de pago es independiente del de Detalles.

### Pruebas de backend: `PUT /api/pedidos/:id/pago`

Se levantó una copia temporal del `server.js` nuevo en `localhost:3001` contra la base real. Todas las pruebas son de validación: se cortan **antes** de escribir, así que no modificaron datos.

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Login `mauro_admin` para obtener el token | ✅ 200 |
| 2 | Sin token | ✅ 401 "No autorizado" |
| 3 | Método inválido (`"Tarjeta"`) | ✅ 400 |
| 4 | ID no numérico (`/api/pedidos/abc/pago`) | ✅ 400 |
| 5 | Pedido inexistente (id 999999) | ✅ 404 |
| 6 | Mixto 5000 + 5000 con total 13741 | ✅ 400 "La suma de los montos ($10000) debe ser igual al total del pedido ($13741)." |
| 7 | Mixto con un monto en 0 | ✅ 400 |
| 8 | Mixto con un monto negativo | ✅ 400 |
| 9 | Mixto con un monto no numérico | ✅ 400 |

**Sin la migración:** un guardado válido devuelve `500 — Could not find the 'monto_efectivo' column`, y `GET /api/pedidos` devuelve `500 — column pedidos.monto_efectivo does not exist`. Es lo esperado: **hay que ejecutar el SQL antes de reiniciar el servidor**.

### Pruebas de interfaz (Chrome headless, API simulada)

Se usaron 20 pedidos simulados y los `PUT` se interceptaron, así que no se tocó la base.

| Grupo | Verificaciones |
|-------|----------------|
| Grilla | ✅ Botón "Pago" en las 15 filas de la página · ✅ "Pago" azul `rgb(13,110,253)` y "Eliminar" rojo `rgb(220,53,69)` · ✅ un pedido Mixto muestra el desglose · ✅ sin scroll horizontal a 1400px |
| Apertura | ✅ El modal abre con el título `Pago del Pedido #001`, el total y el método actual preseleccionado · ✅ con Efectivo los montos están ocultos · ✅ estilo del sistema (Poppins, borde redondeado de 10px, Guardar verde) |
| Mixto | ✅ Los campos aparecen al elegir Mixto · ✅ el indicador en vivo muestra "Faltan $2.000", "Te pasaste por $1.000" o "✓ La suma coincide" · ✅ si la suma no da el total, muestra error y **no envía nada** · ✅ con un monto vacío, muestra error y no envía nada · ✅ con decimales (6000,50 + 3999,50) guarda bien |
| Guardado | ✅ `PUT /api/pedidos/1/pago` con `{metodo_pago:"Mixto", monto_efectivo:6000.5, monto_transferencia:3999.5}` · ✅ lleva `Authorization: Bearer <token>` · ✅ el modal se cierra y la fila se actualiza · ✅ al reabrir, precarga el método Mixto y los montos · ✅ Transferencia envía solo el método y los montos los calcula el backend |
| Errores y cierre | ✅ Un error del servidor se muestra en el modal, que queda abierto, y el botón se vuelve a habilitar · ✅ Escape, click afuera y Cancelar cierran sin guardar |
| Convivencia | ✅ El modal de Detalles sigue funcionando por separado · ✅ el botón Pago funciona en la página 2 · ✅ sin errores de JavaScript |

### Pasos para ponerlo en marcha

1. Supabase → **SQL Editor** → pegar y ejecutar `migracion_pago_mixto.sql`.
2. Reiniciar el servidor (`node server.js`).
3. Recargar Consultar Pedidos con Ctrl+F5.

> **Nota:** los pedidos nuevos que se crean desde el formulario público todavía no cargan `monto_efectivo` / `monto_transferencia` (quedan en `NULL` hasta que se guarda el pago desde este modal). El modal y la grilla funcionan igual en ese caso.


---

## 💳 Modal de pago v2: Tarjeta (Débito / Crédito), pago anticipado y Mixto de 3 medios

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **46/46 verificaciones pasaron** (10 de backend + 36 de interfaz) · ✅ sin regresiones en la paginación (78/78)

### Estado de la base antes de empezar

Se verificó con una lectura que `pedidos` ya tiene `monto_efectivo`, `monto_transferencia`, `monto_tarjeta` y `pago_anticipado`. No se ejecutó ningún `ALTER TABLE`.

### Qué se hizo

| Archivo | Cambio |
|---------|--------|
| `server.js` | `GET /api/pedidos` agrega `monto_tarjeta` y `pago_anticipado`. `PUT /api/pedidos/:id/pago` acepta `Efectivo`, `Transferencia`, `Tarjeta Débito`, `Tarjeta Crédito` y `Mixto`. **Siempre escribe los tres montos**, con 0 en los que no corresponden, para que no queden valores viejos al cambiar de método. `pago_anticipado` solo puede quedar en `true` con Efectivo. En Mixto: un monto vacío cuenta como 0, ningún monto puede ser negativo, tiene que haber **al menos dos medios con monto mayor a 0**, y la suma tiene que dar el total (se compara en centavos). Si la base rechaza el método por un CHECK (error `23514`), devuelve 400 con un mensaje claro. |
| `ConsultarPedidos.html` | Hubo que tocarlo porque el HTML del modal está acá. Las opciones pasan a una grilla de 2×2 (Efectivo, Transferencia, Tarjeta, Mixto). Se agregaron las sub-opciones: checkbox "Pago anticipado" (Efectivo), Débito / Crédito (Tarjeta) y el tercer campo "Monto en tarjeta" (Mixto). Íconos: 💵 efectivo, 🏦 transferencia, 💳 tarjeta. |
| `ListarPedidos.js` | Se reescribió la sección del modal de pago. `actualizarSubopcionesPago()` muestra solo la sub-opción del método elegido, y `armarPagoDesdeModal()` valida y arma el pedido al servidor. Al reabrir, precarga lo guardado (`Tarjeta Crédito` → Tarjeta + Crédito, el checkbox de anticipado, los tres montos del Mixto). En la grilla, el Mixto muestra solo los medios con monto y el Efectivo anticipado muestra "Pago anticipado". |

No se tocó la lógica de estados ni de stock.

### Cómo se guarda cada caso

| Opción en el modal | `metodo_pago` | efectivo / transferencia / tarjeta | `pago_anticipado` |
|--------------------|---------------|------------------------------------|-------------------|
| Efectivo | `Efectivo` | total / 0 / 0 | el checkbox |
| Transferencia | `Transferencia` | 0 / total / 0 | false |
| Tarjeta + Débito | `Tarjeta Débito` | 0 / 0 / total | false |
| Tarjeta + Crédito | `Tarjeta Crédito` | 0 / 0 / total | false |
| Mixto | `Mixto` | lo cargado (suma = total, al menos 2 medios) | false |

### Pruebas de backend: copia del servidor en `:3001` contra la base real

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Login admin | ✅ token |
| 2 | `GET /api/pedidos` devuelve `monto_tarjeta` y `pago_anticipado` | ✅ 200 |
| 3 | Sin token | ✅ 401 |
| 4 | `"Tarjeta"` sin Débito/Crédito | ✅ 400 |
| 5 | `"Cheque"` | ✅ 400 |
| 6 | Mixto con un solo medio (1500 + 0 + 0) | ✅ 400 "…al menos dos medios de pago." |
| 7 | Mixto con monto negativo | ✅ 400 |
| 8 | Mixto con monto no numérico | ✅ 400 |
| 9 | Mixto de 3 medios que no suma el total (500 + 500 + 400 ≠ 1500) | ✅ 400 "La suma de los montos ($1400) debe ser igual al total del pedido ($1500)." |
| 10 | Guardado real con Efectivo en el pedido #6 | ✅ 200, escribe las 4 columnas |

> **⚠️ Incidente en la prueba #10 (ya corregido):** la prueba #10 se planeó para no cambiar nada: guardar Efectivo en el pedido #6, que en una lectura anterior figuraba como Efectivo. Pero para ese momento el pedido #6 ya estaba guardado como **Transferencia** (0 / 1500 / 0), así que la prueba **lo cambió a Efectivo**. Se restauró enseguida con un `PATCH` a sus valores anteriores (`metodo_pago='Transferencia'`, `monto_efectivo=0`, `monto_transferencia=1500`, `monto_tarjeta=0`, `pago_anticipado=false`) y se verificó con una lectura. No se tocaron el estado (`id_estado=2`), `pagado` ni ninguna otra columna.
>
> **No se probó contra la base real** que `metodo_pago` acepte `'Tarjeta Débito'` / `'Tarjeta Crédito'`, porque habría que modificar un pedido real (Supabase ignora `Prefer: tx=rollback`, así que la escritura no se puede deshacer sola). Si existe el CHECK que ponía `migracion_pago_mixto.sql` (`Efectivo`, `Transferencia`, `Mixto`), guardar Tarjeta va a devolver el error 400 del CHECK. Se puede verificar en el SQL Editor con:
> ```sql
> SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
>  WHERE conrelid = 'public.pedidos'::regclass AND contype = 'c';
> ```

### Pruebas de interfaz (Chrome headless, API simulada, 36 verificaciones)

| Grupo | Verificaciones |
|-------|----------------|
| Grilla | ✅ Efectivo anticipado muestra "Pago anticipado" (y el común no) · ✅ muestra "Tarjeta Crédito" · ✅ Mixto con los 3 montos 💵 🏦 💳 · ✅ un Mixto viejo (tarjeta `null`) muestra solo los medios con monto |
| Sub-opciones dinámicas | ✅ 4 opciones · ✅ Efectivo → solo el checkbox · ✅ Transferencia → nada · ✅ Tarjeta → solo Débito/Crédito · ✅ Mixto → los 3 montos · ✅ al volver a Efectivo se oculta Mixto · ✅ estilo del sistema (opción verde `rgb(40,167,69)`, bordes de 8px, Poppins, checkbox verde) |
| Efectivo | ✅ Envía `pago_anticipado: true` al marcarlo y `false` al desmarcarlo · ✅ precarga el checkbox al reabrir |
| Tarjeta | ✅ Precarga Tarjeta + Crédito · ✅ sin elegir Débito/Crédito muestra error y no guarda · ✅ envía `"Tarjeta Débito"` / `"Tarjeta Crédito"` y la fila se actualiza |
| Transferencia | ✅ Envía solo el método |
| Mixto | ✅ Precarga los 3 montos · ✅ indicador en vivo ("Faltan $1.000", "coincide") · ✅ si la suma no da el total, error y no guarda · ✅ con un solo medio, error y no guarda · ✅ 3 medios con decimales (2500,25 + 4000 + 3499,75) · ✅ 2 medios, con el campo vacío enviado como 0 · ✅ un Mixto viejo precarga el campo de tarjeta vacío |
| General | ✅ Escape cierra el modal · ✅ sin errores de JavaScript |


---

## 🔧 Corrección: Mixto solo combina efectivo y transferencia

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **44/44 verificaciones pasaron** (9 de backend + 35 de interfaz) · ✅ sin regresiones en la paginación (78/78) · ✅ **no se escribió nada en la base real**

### Qué cambió respecto de la versión anterior

La tarjeta sale de la opción Mixto. Efectivo (con pago anticipado), Transferencia y Tarjeta (Débito / Crédito) quedan igual.

| Archivo | Cambio |
|---------|--------|
| `server.js` | En `PUT /api/pedidos/:id/pago`, Mixto vuelve a exigir **efectivo y transferencia, los dos mayores a 0**, que sumen el total. Si llega un `monto_tarjeta` distinto de 0 en un Mixto, devuelve **400** ("El pago mixto solo puede combinar efectivo y transferencia (sin tarjeta)") en vez de ignorarlo en silencio. Con Mixto, `monto_tarjeta` se guarda en 0. |
| `ConsultarPedidos.html` | Se quitó el campo "Monto en tarjeta" del bloque Mixto. Hubo que tocar este archivo porque el HTML del modal está acá. |
| `ListarPedidos.js` | `CAMPOS_MIXTO` pasa a tener 2 campos. La validación del Mixto pide los dos montos mayores a 0 y que sumen el total, y el pago se envía como `{metodo_pago:'Mixto', monto_efectivo, monto_transferencia}`. En la grilla, el Mixto muestra 💵 efectivo y 🏦 transferencia. |

### Cómo se guarda cada caso

| Opción | `metodo_pago` | efectivo / transferencia / tarjeta | `pago_anticipado` |
|--------|---------------|------------------------------------|-------------------|
| Efectivo | `Efectivo` | total / 0 / 0 | el checkbox |
| Transferencia | `Transferencia` | 0 / total / 0 | false |
| Tarjeta + Débito | `Tarjeta Débito` | 0 / 0 / total | false |
| Tarjeta + Crédito | `Tarjeta Crédito` | 0 / 0 / total | false |
| Mixto | `Mixto` | lo cargado / lo cargado / **0** (efectivo + transferencia = total) | false |

### Pruebas de backend: copia en `:3001`, **solo validaciones** (se rechazan antes de escribir)

| # | Caso (pedido #6, total $1500) | Resultado |
|---|-------------------------------|-----------|
| 1 | Login admin | ✅ |
| 2 | Sin token | ✅ 401 |
| 3 | Mixto con tarjeta (500 + 500 + tarjeta 500) | ✅ 400 "El pago mixto solo puede combinar efectivo y transferencia (sin tarjeta)." |
| 4 | Mixto solo con efectivo (1500 + 0) | ✅ 400 |
| 5 | Mixto sin el campo transferencia | ✅ 400 |
| 6 | Mixto con monto negativo | ✅ 400 |
| 7 | Mixto que no suma el total (1000 + 400) | ✅ 400 "La suma de los montos ($1400) debe ser igual al total del pedido ($1500)." |
| 8 | `"Tarjeta"` sin Débito/Crédito | ✅ 400 |
| 9 | La base quedó igual antes y después de las pruebas (se comparó con `GET /api/pedidos`) | ✅ |

### Pruebas de interfaz (Chrome headless, API simulada, 35 verificaciones)

Se repitieron las verificaciones de Efectivo, Transferencia y Tarjeta de la versión anterior (todas ✅). Las de Mixto cambiaron:

- ✅ Al elegir Mixto aparecen **solo** "Monto en efectivo" y "Monto en transferencia"; no hay campo de tarjeta en el modal.
- ✅ Al reabrir, precarga los dos montos (7000 / 3000) · ✅ indicador en vivo ("coincide" / "Faltan $1.000").
- ✅ Si la suma no da el total, muestra error y no guarda · ✅ con un solo monto, muestra error y no guarda.
- ✅ Envía `{"metodo_pago":"Mixto","monto_efectivo":6000.5,"monto_transferencia":3999.5}`, sin `monto_tarjeta`.
- ✅ La grilla muestra 💵 / 🏦 sin 💳 · ✅ un pedido con Tarjeta que pasa a Mixto arranca con los montos vacíos · ✅ sin errores de JavaScript.


---

## ✅ Verificación general del sistema (cierre de la sesión)

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **12/12 endpoints OK** · ✅ **10/10 pruebas del modal de pago contra la base real** · ✅ **13/13 páginas cargan sin errores** · ⚠️ **1 problema pendiente** en Envíos del Día (no es una rotura, pero muestra mal los métodos de pago nuevos)

En esta verificación no se modificó código. El servidor en `:3000` estaba corriendo la versión actual (arrancó a las 19:14:46; la última modificación de `server.js` fue a las 19:11:25).

### 1. Archivos modificados en la sesión

- `frontend/src/js/paginacion.js` (**nuevo**) → función reutilizable `crearPaginacion()`: corta los datos de a 15 y dibuja los controles numéricos `‹ 1 … 4 5 6 … 12 ›`.
- `frontend/src/css/global.css` → se agregaron al final los estilos `.paginacion`, `.paginacion-btn`, `.paginacion-flecha` y `.paginacion-puntos` (botones de 24×24 px, fuente de 11px, alineados a la derecha, página activa en verde).
- `frontend/pages/ConsultarPedidos.html` → `<div id="paginacion">` y script de paginación. HTML y estilos del modal de pago: 4 opciones, checkbox de pago anticipado, Débito/Crédito, montos del Mixto. Botón azul "Pago" y columna Acciones apilada.
- `frontend/pages/stock.html` → `<div id="paginacion">` y script de paginación.
- `frontend/pages/generarReceta.html` → `<div id="paginacion">` y script de paginación.
- `frontend/pages/MovimientosStock.html` → `<div id="paginacion">` y script de paginación.
- `frontend/src/js/ListarPedidos.js` → paginación (el buscador pasó de ocultar filas a filtrar el array). El estado del pedido se actualiza también en memoria. Eliminar un pedido mantiene la página. Botón "Pago" y todo el modal de pago (Efectivo con anticipado / Transferencia / Tarjeta Débito-Crédito / Mixto efectivo + transferencia). Desglose del pago en la columna Método Pago.
- `frontend/src/js/stock.js` → `renderizarInsumos` pagina; la fila pasó a `crearFilaInsumo()`.
- `frontend/src/js/generarReceta.js` → `renderizarRecetas` pagina; la fila pasó a `crearFilaReceta()`.
- `frontend/src/js/MovimientosStock.js` → `renderTabla` pagina; la fila pasó a `crearFilaMovimiento()`.
- `server.js` → `GET /api/pedidos` devuelve `monto_efectivo`, `monto_transferencia`, `monto_tarjeta` y `pago_anticipado`. **Nuevo `PUT /api/pedidos/:id/pago`** (con `requireAuth`) para los 5 métodos; valida contra el total de la base.
- `migracion_pago_mixto.sql` (**nuevo**) → script para agregar `monto_efectivo` / `monto_transferencia` y habilitar `'Mixto'`. Las columnas finalmente se crearon en Supabase por otra vía; `monto_tarjeta` y `pago_anticipado` también se agregaron fuera de esta sesión.
- `INFORME_TEST_E2E.md` → secciones de resultados de cada cambio.

> **Aclaración:** `server.js`, `stock.html`, `stock.js`, `generarReceta.html` y `generarReceta.js` **ya tenían cambios sin commitear antes de esta sesión** (por ejemplo, el soft delete de recetas y el cambio de `idFormatted` a `codigo`). El `git diff` de esos archivos incluye esos cambios previos, además de los de esta sesión.
>
> **Datos:** el pedido real #6 se modificó una vez por error en una prueba y se restauró enseguida (ver la sección "Modal de pago v2"). Los pedidos de prueba de esta verificación se crearon y se borraron.

### 2. Verificación de endpoints (servidor real en `:3000`)

| Endpoint | Resultado |
|----------|-----------|
| `GET /api/v1/catalogo` | ✅ 200 — 4 categorías |
| `GET /api/pedidos` | ✅ 200 — 2 pedidos |
| `GET /api/insumos` | ✅ 200 — 36 insumos |
| `GET /api/recetas` | ✅ 200 — 1 receta |
| `GET /api/movimientos-stock` | ✅ 200 — 8 movimientos |
| `GET /api/estados` | ✅ 200 — 5 estados |
| `GET /api/cocineros` | ✅ 200 — 3 cocineros |
| `GET /api/barrios` | ✅ 200 — 60 barrios |
| `GET /api/envios` | ✅ 200 — 1 envío |
| `GET /api/cocina/tareas` | ✅ 200 — 1 tarea |
| `GET /api/reportes/resumen` | ✅ 200 — `{"ingresos":15241,"gastos":0,"ganancia":15241,"cantidad_pedidos":2}` |
| `POST /api/login` (mauro_admin / [REDACTADO]) | ✅ 200 — devuelve `token` y `usuario` |

### 3. Modal de pago: `PUT /api/pedidos/:id/pago` contra la base real

Para no tocar pedidos de clientes, se creó un **pedido de prueba** (#9, `_TEST_PAGO_VERIFICACION`, total $1500, producto 11). Se le aplicó cada método y **después de cada PUT se releyó desde `GET /api/pedidos`** para confirmar lo guardado. Al final se borró.

| Método | Resultado | Quedó en la base (efectivo / transferencia / tarjeta, anticipado) |
|--------|-----------|-------------------------------------------------------------------|
| Efectivo sin pago anticipado | ✅ 200 | `Efectivo` · 1500 / 0 / 0 · false |
| Efectivo con pago anticipado | ✅ 200 | `Efectivo` · 1500 / 0 / 0 · **true** |
| Transferencia | ✅ 200 | `Transferencia` · 0 / 1500 / 0 · false |
| Tarjeta Débito | ✅ 200 | `Tarjeta Débito` · 0 / 0 / 1500 · false |
| Tarjeta Crédito | ✅ 200 | `Tarjeta Crédito` · 0 / 0 / 1500 · false |
| Mixto (1000 efectivo + 500 transferencia) | ✅ 200 | `Mixto` · 1000 / 500 / 0 · false |
| Mixto con tarjeta (control negativo) | ✅ 400 | "El pago mixto solo puede combinar efectivo y transferencia (sin tarjeta)." |
| Borrar el pedido de prueba | ✅ 200 | ya no aparece en `GET /api/pedidos` |
| Pedidos reales #1 y #6 sin cambios | ✅ | se sacó una foto de los datos antes y después, y son idénticas |

Con esto queda confirmado que **la base acepta `Tarjeta Débito` y `Tarjeta Crédito`**: no quedó ningún CHECK que los bloquee.

### 4. ¿Se rompió algo?

Se revisó qué otras partes usan lo que se modificó:

| Qué se tocó | Quién más lo usa | Verificación | Resultado |
|-------------|------------------|--------------|-----------|
| `global.css` (clases nuevas) | Las 12 páginas del sistema | Se buscaron otros usos de `paginacion`: no hay. Se cargaron todas las páginas en Chrome contra el servidor real (solo GET, cualquier otro método bloqueado). | ✅ 13/13 páginas sin errores de JS ni respuestas ≥ 400 (index, login, admin, viandas, formulario, las 4 paginadas, asignar cocinero, envíos, cocinero, usuarios) |
| Funciones globales nuevas | Otros scripts de la misma página | Se buscó cada nombre (`crearPaginacion`, `abrirModalPago`, `aCentavos`, etc.) en todo el frontend | ✅ Sin choques: cada una existe en un solo archivo |
| `GET /api/pedidos` (campos nuevos) | `reportes.js` (panel admin: KPIs, gráficos, exportar CSV) | `admin.html` cargó sin errores. El CSV solo usa `metodo_pago` como texto, y los valores nuevos no tienen comas. | ✅ Sin impacto |
| Valores nuevos de `metodo_pago` | `Envios.js` (tarjetas de envío y hoja de ruta) | Se simuló `/api/envios` con un pedido de cada método | ⚠️ **Muestra mal los métodos nuevos**, ver abajo |
| `POST /api/pedidos` (formulario público) | `formulario.js` | No se modificó; el formulario sigue ofreciendo Efectivo / Transferencia | ✅ Sin impacto |
| Paginación en las 4 pantallas | — | Test de regresión | ✅ 78/78 |

#### ⚠️ Problema pendiente: Envíos del Día

`Envios.js` (líneas 325 y 466) decide la etiqueta con `metodo_pago.includes('transfer')`: todo lo demás se muestra como efectivo.

| `metodo_pago` | Envíos muestra |
|---------------|----------------|
| Efectivo | 💵 Efectivo ✅ |
| Transferencia | 💳 Transferencia ✅ |
| Tarjeta Débito | 💵 Efectivo ❌ |
| Tarjeta Crédito | 💵 Efectivo ❌ |
| Mixto | 💵 Efectivo ❌ (tampoco muestra cuánto cobrar en efectivo) |

**Riesgo:** el repartidor podría intentar cobrar en efectivo un pedido que ya se pagó con tarjeta, o cobrar el total de un Mixto cuando solo corresponde la parte en efectivo. No rompe nada técnicamente, pero conviene corregirlo antes de usar los métodos nuevos en producción. No se modificó porque esta verificación era de solo lectura.

#### Otros datos a tener en cuenta

- El pedido **#1** (Efectivo, total $13.741) tiene `monto_efectivo = 0`, porque las columnas se crearon con valor por defecto 0 y ese pedido no se completó. Se corrige abriendo su modal de pago y guardando.
- Los pedidos nuevos que llegan desde el formulario público quedan con los montos en 0 hasta que se guarda el pago desde el modal.


---

## 🚚 Fix: Envíos del Día muestra bien los métodos de pago nuevos

**Fecha:** 23 de septiembre de 2026  
**Resultado:** ✅ **17/17 verificaciones pasaron** · resuelve el ⚠️ pendiente de la verificación general

### Problema

`Envios.js` decidía la etiqueta con `metodo_pago.includes('transfer')` en dos lugares: la card (`buildCard`) y la hoja de ruta imprimible (`buildPrintRow`). Todo lo que no era transferencia se mostraba como "💵 Efectivo", incluidos Tarjeta Débito, Tarjeta Crédito y Mixto.

### Solución (solo `frontend/src/js/Envios.js`)

Nueva función `infoMetodoPago(metodo)`, compartida por las dos vistas. Devuelve la etiqueta de la card, la etiqueta corta de la hoja de ruta y el estilo:

| `metodo_pago` | Card | Hoja de ruta | Color |
|---------------|------|--------------|-------|
| Efectivo (o vacío / desconocido) | 💵 Efectivo | 💵 Efect. | verde (clase `.efectivo` existente) |
| Transferencia | 🏦 Transferencia | 🏦 Transf. | azul (clase `.transferencia` existente) |
| Tarjeta Débito | 💳 Tarjeta Débito | 💳 Débito | violeta (`style` en línea) |
| Tarjeta Crédito | 💳 Tarjeta Crédito | 💳 Crédito | violeta (`style` en línea) |
| Mixto | 💵🏦 Mixto | 💵🏦 Mixto | amarillo (`style` en línea) |

- Se mantiene la tolerancia del código anterior: no distingue mayúsculas y reconoce "credito" / "debito" sin tilde.
- Tarjeta y Mixto llevan el color en `style` porque en `Envios.html` solo existen `.badge-pago.efectivo` y `.badge-pago.transferencia`, y la consigna era tocar solo `Envios.js`.
- Transferencia cambió de 💳 a 🏦, para que 💳 quede reservado para tarjeta (igual que en Consultar Pedidos).
- No se tocó la lógica de estados, de stock ni el botón Cobrado.

### Prueba (Chrome headless, `/api/envios` simulado con un envío real clonado)

| Caso | Card | Hoja de ruta |
|------|------|--------------|
| Efectivo | ✅ 💵 Efectivo (verde) | ✅ 💵 Efect. |
| Transferencia | ✅ 🏦 Transferencia (azul) | ✅ 🏦 Transf. |
| Tarjeta Débito | ✅ 💳 Tarjeta Débito (violeta) | ✅ 💳 Débito |
| Tarjeta Crédito | ✅ 💳 Tarjeta Crédito (violeta) | ✅ 💳 Crédito |
| Mixto | ✅ 💵🏦 Mixto (amarillo) | ✅ 💵🏦 Mixto |
| `transferencia` (minúscula) | ✅ 🏦 Transferencia | ✅ 🏦 Transf. |
| `tarjeta credito` (sin tilde) | ✅ 💳 Tarjeta Crédito | ✅ 💳 Crédito |
| `null` | ✅ 💵 Efectivo | ✅ 💵 Efect. |
| Sin errores de JavaScript | ✅ | |

> **Limitación:** en un Mixto, Envíos no puede mostrar cuánto cobrar en efectivo, porque `GET /api/envios` no devuelve `monto_efectivo` ni `monto_transferencia`. Para mostrarlo hay que agregar esos dos campos al `.select()` de `/api/envios` en `server.js`.

---

## 🔒 Anulación de pedidos con PIN (reemplaza al botón Eliminar)

**Fecha:** 24 de septiembre de 2026  
**Resultado:** ✅ **31/31 pruebas pasaron** (10 de API + 21 de interfaz)

En Consultar Pedidos, el botón **Eliminar** borraba el pedido de la base sin pedir ninguna autorización. Ahora ese botón se llama **Anular**: abre un modal que pide un PIN, el PIN se valida en el servidor y el pedido **no se borra**, solo pasa a estado 5 (Cancelado).

### Cambios

| Archivo | Cambio |
|---------|--------|
| `.env` | `ADMIN_PIN=[REDACTADO]` (el `.env` está en `.gitignore`: hay que agregarlo a mano en cada máquina) |
| `server.js` | Nuevo `POST /api/pedidos/:id/anular` con `requireAuth`. Compara el PIN con `crypto.timingSafeEqual`. Si es correcto, `id_estado = 5`. El `DELETE /api/pedidos/:id` **se dejó igual** |
| `ConsultarPedidos.html` | Modal `#modalAnular`: título, advertencia, campo `type="password"` (4 dígitos), botones Cancelar (gris) y Confirmar Anulación (rojo). Mismo estilo que el modal de Pago. También se agregó el aviso de éxito `.toast-exito` |
| `ListarPedidos.js` | El botón pasa de "Eliminar" a "Anular". Si el pedido ya está cancelado se muestra "Anulado" deshabilitado. Se agregó la lógica del modal (`abrirModalAnular`, `cerrarModalAnular`, `confirmarAnulacion`, `mostrarExito`) y se quitó `eliminarPedido()`, que ya no se usaba |

### Respuestas del endpoint

| Caso | HTTP | Respuesta |
|------|------|-----------|
| Sin token | 401 | No autorizado |
| ID no numérico | 400 | ID de pedido inválido |
| PIN incorrecto, vacío o de otro largo | 403 | PIN incorrecto (no se modifica nada) |
| Pedido inexistente | 404 | Pedido no encontrado |
| Pedido ya anulado | 409 | El pedido ya está anulado |
| Falta `ADMIN_PIN` en el `.env` | 500 | El PIN de autorización no está configurado en el servidor |
| PIN correcto | 200 | Pedido anulado correctamente (`id_estado = 5`) |

### Prueba de API (servidor temporal en :3001 con pedidos de prueba, eliminados al terminar)

| Test | Resultado |
|------|-----------|
| Sin token | ✅ 401, estado sin cambios |
| PIN `0000` | ✅ 403 "PIN incorrecto", estado sin cambios |
| Sin PIN | ✅ 403, estado sin cambios |
| PIN incorrecto (`[REDACTADO]`) | ✅ 403, estado sin cambios |
| ID `abc` | ✅ 400 |
| Pedido inexistente | ✅ 404 |
| PIN correcto (`[REDACTADO]`) | ✅ 200, estado = 5 |
| Anular dos veces | ✅ 409 |
| El pedido sigue existiendo | ✅ |
| `DELETE /api/pedidos/:id` sigue funcionando | ✅ 200 (se usó para limpiar) |

### Prueba de interfaz (Chrome headless)

| Test | Resultado |
|------|-----------|
| El botón dice "Anular", es rojo y no queda ningún "Eliminar" | ✅ |
| El modal se abre con el título "Anular Pedido #020" | ✅ |
| Campo PIN `type="password"`, `maxlength=4`, con foco al abrir | ✅ |
| Texto de advertencia "Esta acción es irreversible..." | ✅ |
| Fuente Poppins | ✅ |
| Cancelar cierra el modal sin anular | ✅ |
| Al reabrir, el campo PIN está vacío | ✅ |
| PIN de 2 dígitos → "El PIN debe tener 4 dígitos." (no llega al servidor) | ✅ |
| PIN incorrecto → "PIN incorrecto", el modal sigue abierto, estado sin cambios | ✅ |
| PIN correcto (con Enter) → se cierra el modal | ✅ |
| Aviso "✓ Pedido #020 anulado correctamente." | ✅ |
| Estado en la base = 5 | ✅ |
| La grilla se refresca: estado CANCELADO y botón "Anulado" deshabilitado | ✅ |
| Se conservan el filtro de búsqueda y la página actual | ✅ |
| Sin errores de JavaScript | ✅ |

### Pendientes / observaciones

- **Reiniciar el servidor** para que tome el endpoint nuevo y el `ADMIN_PIN`.
- **Stock:** anular no devuelve al stock los insumos ya descontados (pedidos que llegaron a estado 3 o 4). Es el mismo comportamiento que tiene hoy pasar un pedido a "Cancelado" desde el select de estado.
- **Fuerza bruta:** un PIN de 4 dígitos tiene 10.000 combinaciones y no hay límite de intentos. Lo mitiga que el endpoint exige estar logueado. Si hace falta, se puede agregar un bloqueo después de N intentos fallidos.
- El `DELETE /api/pedidos/:id` sigue disponible **sin autenticación**. Ya no lo usa el frontend, pero cualquiera que conozca la URL puede llamarlo.

---

## 💰 Confirmación de pago al pasar un pedido a "En Preparación"

**Fecha:** 24 de septiembre de 2026  
**Resultado:** ✅ **24/24 pruebas pasaron** (Chrome headless contra el servidor real en :3000)

Antes, cambiar un pedido a **En Preparación** (estado 2) lo hacía avanzar aunque el cliente todavía no hubiera transferido. Ahora, si el pago es Transferencia, Tarjeta Débito, Tarjeta Crédito o Mixto, primero se pregunta si el cliente ya pagó. En Efectivo avanza directo, porque se cobra al entregar.

Solo se tocó el frontend. No se modificaron `server.js` ni el descuento de stock.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `ConsultarPedidos.html` | Modal `#modalConfirmarPago`: título "Confirmar Pago", texto con el método en negrita, botones "No, todavía no pagó" (gris) y "Sí, ya pagó" (verde). Usa los estilos de los otros modales (`.btn-pago-cancelar` / `.btn-pago-guardar`) |
| `ListarPedidos.js` | El `fetch` del cambio de estado pasó, sin cambios, a la función `cambiarEstadoPedido()`, que ahora devuelve `true` o `false`. El listener del select abre el modal antes de llamar al servidor cuando el nuevo estado es 2, el método no es Efectivo y el pedido no está pagado. Funciones nuevas: `abrirModalConfirmarPago`, `cancelarConfirmarPago` y `aceptarConfirmarPago` |

### Comportamiento

- **"No, todavía no pagó"** (también la ✕, Escape o un clic afuera del modal): se cierra el modal, el select vuelve al estado anterior y no se llama al servidor.
- **"Sí, ya pagó"**: primero `PUT /api/pedidos/:id/estado` con `{ estado_id: 2 }`. Solo si sale bien, `PUT /api/pedidos/:id/pagado` con `{ pagado: true }`. Después se redibuja la grilla y la columna muestra PAGADO. Si el cambio de estado falla (por ejemplo, 409 por stock), no se marca como pagado.
- **Efectivo** o método vacío: pasa directo, como antes.
- **Pedido ya marcado como pagado:** pasa directo, sin volver a preguntar.
- **Pasar a cualquier otro estado:** no pregunta.

### Pruebas

| Test | Resultado |
|------|-----------|
| Transferencia → estado 2 abre el modal | ✅ |
| Con el modal abierto no se hace ninguna llamada al servidor | ✅ |
| Título "Confirmar Pago" y el texto con el método | ✅ |
| Botón gris "No, todavía no pagó" y botón verde "Sí, ya pagó", en Poppins | ✅ |
| "No" → se cierra, el select vuelve a Registrado, la base no cambia | ✅ |
| Tarjeta Débito → el modal muestra "Tarjeta Débito" | ✅ |
| "Sí" → en la base: estado 2 y `pagado = true` | ✅ |
| "Sí" → las llamadas son `PUT /estado` y después `PUT /pagado` | ✅ |
| "Sí" → la grilla muestra En Preparación y PAGADO | ✅ |
| Tarjeta Crédito → abre el modal; la ✕ cancela | ✅ |
| Mixto → abre el modal; Escape y clic afuera cancelan; clic adentro no cierra | ✅ |
| Mixto cancelado → la base no cambia | ✅ |
| Efectivo → sin modal, pasa a estado 2, no se marca como pagado | ✅ |
| Transferencia ya pagada → sin modal, pasa directo | ✅ |
| Transferencia a otro estado (Cancelado) → sin modal | ✅ |
| Sin errores de JavaScript | ✅ |

Los 6 pedidos de prueba se crearon para el test y se borraron al terminar.

### Observaciones

- En el Mixto, "Sí, ya pagó" marca todo el pedido como pagado, incluida la parte en efectivo, que en realidad se cobra al entregar. Hoy el sistema tiene un solo campo `pagado` por pedido, así que no se puede marcar solo la parte de transferencia.
- Si `PUT /pagado` falla después de cambiar el estado, aparece un aviso: el pedido queda En Preparación pero sin marcar como pagado. Como la grilla no tiene botón para marcarlo a mano, en ese caso hay que corregirlo desde la base.

---

## 👨‍🍳 Cocinero por plato (en lugar de por plan)

**Fecha:** 24 de septiembre de 2026  
**Resultado:** ✅ **28/28 pruebas pasaron** (16 de API + 12 de interfaz en Chrome headless)

Antes, cada cocinero estaba asignado a un **plan** y veía todos sus platos. Ahora cada **plato** (`productos.id_cocinero`) puede tener su propio cocinero. Si un plato no tiene cocinero, lo ve el principal o el suplente de su plan, que quedan como respaldo.

- La columna `productos.id_cocinero` ya existía, así que no se corrió ningún `ALTER TABLE`. No hubo que migrar datos.
- No se tocaron las columnas de cocinero de `planes`, el botón "Listo", el flujo de estados, el stock ni los pagos.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `server.js` | Nueva función `platoEsDelCocinero(producto, cocineroId)`: el plato es del cocinero si lo tiene asignado o, cuando no tiene cocinero propio, si es el principal o suplente del plan |
| `server.js` | **Nuevo** `GET /api/productos/cocineros`: platos activos con `codigo_plato`, `nombre`, `plan`, `id_cocinero`, `cocinero`, `cocinero_plan`, `cocinero_efectivo` y `origen` (`producto` / `plan` / `null`), ordenados por plan y código |
| `server.js` | **Nuevo** `PUT /api/productos/:id/cocinero` con `requireAuth`: body `{ id_cocinero }` (uuid o `null`). Valida que el usuario exista y tenga rol 2 |
| `server.js` | **Cambia** `GET /api/cocina/tareas`: cocinero → sus platos → pedidos en estado 2. Cada detalle lleva `id_producto` y `es_mio`. El filtro se hace en JS y el `cocinero_id` ya no se mete en el texto de `.or()`. Sin `cocinero_id` (modo admin) devuelve todo con `es_mio: true` |
| `AsignarCocinero.html` | La grilla pasa de planes a platos: Código, Plato, Plan, Cocinero y Acción. Se agregan un buscador y un aviso de platos que no ve ningún cocinero, y los anchos de columna se ajustaron para que entre el texto del select |
| `AsignarCocinero.js` | Se reescribió para la grilla por plato. Si el plato no tiene cocinero propio, la opción vacía dice *"Sin asignar — usa el del plan (Nombre)"* en gris, o *"el plan tampoco tiene cocinero"* en amarillo. Un asignado que ya no es cocinero se muestra como *"(ya no es cocinero)"*. Guarda con el token del admin |
| `cocinero.js` | Después de traer las tareas se quedan solo los detalles con `es_mio`. La tabla y el resumen de porciones muestran solo los platos del cocinero. El botón "Listo para entregar" no se tocó |

Endpoints que quedan como estaban: `GET /api/cocineros`, `GET /api/planes/cocineros` y `PUT /api/planes/:id/cocinero`. Este último sigue sirviendo para definir el respaldo del plan.

### Escenario de prueba

Se usaron los platos reales POLLO (#11, plan Descenso de Peso) y fideos (#17, plan Mantenimiento) y un pedido de prueba con POLLO x2 y fideos x3 en estado 2 (pasar a estado 2 no descuenta stock).

- POLLO quedó asignado a **Juan**.
- fideos quedó sin cocinero propio. Su plan tiene a **Marta** de principal y, solo durante la prueba, a **Mariela** de suplente.

### Pruebas de API

| Test | Resultado |
|------|-----------|
| PUT sin token | ✅ 401 |
| PUT con un admin (rol 1) como cocinero | ✅ 400 "El usuario elegido no es un cocinero" |
| PUT con un `id_cocinero` que no es UUID | ✅ 400 |
| PUT con id de producto inválido / inexistente | ✅ 400 / 404 |
| PUT POLLO → Juan; PUT fideos → `null` | ✅ 200 |
| GET productos/cocineros: POLLO `origen=producto` (Juan), fideos `origen=plan` (Marta), solo activos | ✅ |
| **Juan** ve el pedido: POLLO `es_mio=true`, fideos `es_mio=false` | ✅ |
| **Marta** (principal del plan) ve el pedido: fideos `es_mio=true`, POLLO `false` | ✅ |
| **Mariela** (suplente del plan) ve fideos por respaldo, POLLO no | ✅ |
| Un usuario sin platos → lista vacía | ✅ |
| Sin `cocinero_id` (modo admin) → todo con `es_mio=true` | ✅ |
| `cocinero_id` manipulado (`<uuid>,id_cocinero.is.null`) no altera el filtro → vacío | ✅ |

### Pruebas de interfaz (Chrome headless)

| Test | Resultado |
|------|-----------|
| Grilla con columnas Código, Plato, Plan, Cocinero y Acción | ✅ |
| Fila POLLO: código 4, plan Descenso de Peso, select en "juan cocinero alvarez" | ✅ |
| Fila fideos: "Sin asignar — usa el del plan (Marta Garcia)" | ✅ |
| El buscador filtra por nombre | ✅ |
| Guardar desde la UI (fideos → Juan) queda en la base y el botón muestra "Guardado" | ✅ |
| Guardar "Sin asignar" vuelve a `null` y el plato usa el cocinero del plan | ✅ |
| Pantalla de Juan: en el pedido ve **solo POLLO x2** | ✅ |
| Pantalla de Juan: el resumen suma solo sus porciones | ✅ |
| Pantalla de Marta: en el pedido ve **solo fideos x3** | ✅ |
| Pantalla de Marta: el resumen suma solo sus porciones | ✅ |
| Botón "Listo para entregar" sin cambios | ✅ |
| Sin errores de JavaScript | ✅ |

Al terminar, POLLO y fideos quedaron otra vez sin cocinero, se restauró el suplente del plan Mantenimiento (vacío) y se borró el pedido de prueba. Se verificó en la base.

### Pendientes / observaciones

- **Reiniciar el servidor** para que tome los endpoints nuevos (las pruebas corrieron en una copia en :3001).
- **Botón "Listo":** todavía pasa el pedido entero a estado 3. Si un pedido tiene platos de dos cocineros, el primero que termina lo marca listo aunque el otro no haya terminado. Queda para el próximo cambio.
- **Códigos repetidos:** los planes no tienen `codigo_plan`, así que hay códigos repetidos entre planes (por ejemplo, "4" es POLLO y también un producto de prueba). La columna Plan los distingue.
- **Productos de prueba:** hay 5 productos `_TEST_…` activos en Antojos Saludables que aparecen en la grilla. Conviene desactivarlos.
- **Permisos del PUT:** `PUT /api/productos/:id/cocinero` exige estar logueado pero no verifica que quien asigna sea admin. Hoy la pantalla solo es accesible para admins (guard.js).

---

## 🔎 Verificación del estado actual (antes del próximo cambio)

**Fecha:** 28 de septiembre de 2026  
**Resultado:** ✅ **36/36 pruebas de API pasaron** contra el servidor real en :3000. No se modificó código.

### 1. Archivos del cambio "cocinero por plato" (sin commitear)

| Archivo | Qué hace |
|---------|----------|
| `server.js` | `platoEsDelCocinero()`, `GET /api/productos/cocineros`, `PUT /api/productos/:id/cocinero` (con token, valida rol 2) y `GET /api/cocina/tareas` filtrado por plato con `es_mio` |
| `AsignarCocinero.html` | La grilla pasa de planes a platos (Código, Plato, Plan, Cocinero, Acción), con buscador y aviso de platos sin cocinero |
| `AsignarCocinero.js` | Carga y guarda el cocinero de cada plato. Si no tiene, muestra el cocinero del plan que lo va a ver |
| `cocinero.js` | En cada pedido muestra solo los platos con `es_mio` (tabla y resumen de porciones) |

En el mismo working tree también quedan sin commitear los cambios anteriores de pagos: `ListarPedidos.js` y `ConsultarPedidos.html` (modal de confirmación de pago y anulación con PIN) y, en `server.js`, `POST /api/pedidos/:id/anular`.

### 2. Base de datos

| Chequeo | Resultado |
|---------|-----------|
| `productos.id_cocinero` | ✅ Existe |
| `pedido_detalles.listo` | ❌ **No existe** (columnas: id, id_pedido, id_producto, cantidad, precio_unitario, subtotal, observaciones_plato) |
| Productos activos `_TEST_…` | ✅ Ninguno. Los 11 `_TEST_` que hay están con `activo = false` |

Estado de las asignaciones al empezar (se tomó como base y se respetó): POLLO (#11) tiene asignado a **juan cocinero alvarez**, fideos (#17) no tiene cocinero y usa el del plan, que es **Marta**. Los 8 planes tienen a Marta de principal y a nadie de suplente. *El informe anterior decía que POLLO quedó sin cocinero; se asignó después, seguramente desde la pantalla.*

### 3. Servidor y endpoints

El servidor de :3000 (PID 22180) arrancó el 28/09 a las 16:00:39 y `server.js` se modificó por última vez el 24/09 a las 19:47:09, así que **tiene el código actual**.

| Endpoint | Resultado |
|----------|-----------|
| `GET /api/productos/cocineros` | ✅ 200. fideos→Marta (plan), POLLO→Juan (producto) |
| `GET /api/cocina/tareas` sin `cocinero_id` | ✅ 200. Pedido #33, todo con `es_mio=true` |
| `GET /api/cocina/tareas?cocinero_id=<Juan>` | ✅ 200. #33 con POLLO `es_mio=true` |
| `GET /api/pedidos` / `v1/catalogo` / `recetas` / `insumos` | ✅ 200 (5 / 4 / 2 / 36 filas) |
| `POST /api/login` mauro_admin / [REDACTADO] | ✅ 200 con token. Con contraseña incorrecta devuelve 401 |

### 4. Flujo de cocineros

Pedido de prueba #34 con POLLO x2 y fideos x3, pasado a estado 2.

| Test | Resultado |
|------|-----------|
| Juan ve POLLO y no fideos; Marta ve fideos (por el plan) y no POLLO; Mariela no ve el pedido | ✅ |
| PUT sin token → 401; PUT con un admin como cocinero → 400 | ✅ |
| fideos → Mariela: Mariela ve fideos y no POLLO; Marta deja de ver el pedido; Juan sigue viendo solo POLLO | ✅ |
| `productos/cocineros` muestra fideos con `origen=producto` (Mariela) | ✅ |
| fideos → `null`: lo vuelve a ver Marta (principal del plan) y Mariela deja de verlo | ✅ |

**Restauración verificada en la base:** POLLO sigue con Juan, fideos quedó en `null`, el pedido #34 se borró y el #33 sigue en estado 2. Como el pedido #34 nunca pasó a estado 3 o 4, no se descontó stock. El único rastro es que la secuencia de IDs avanzó: el próximo pedido va a ser el #35.

### 5. Pagos y anulación

| Test | Resultado |
|------|-----------|
| `PUT /pago` sin token → 401; con método inválido → 400; Mixto que no suma el total → 400 | ✅ |
| `PUT /pago` Mixto 4000 + 6000 = 10000 → 200; Transferencia → 200 con los montos recalculados | ✅ |
| Confirmación de pago: estado 2 + `PUT /pagado true` → 200 | ✅ |
| Anular sin token → 401; con PIN incorrecto → 403; pedido inexistente → 404 | ✅ |
| Anular con el PIN correcto → 200 y estado 5; anular otra vez → 409; el pedido anulado sale de cocina | ✅ |
| Front: `node --check` sin errores en los 3 JS, y todos los `onclick` de ConsultarPedidos apuntan a funciones que existen | ✅ |

Los modales se verificaron por API y con revisión estática. **No se probaron haciendo clic en un navegador** en esta verificación.

### Pendiente / a tener en cuenta

- **Botón "Listo":** sigue pasando el pedido entero a estado 3. `pedido_detalles.listo` no existe, así que el "listo por plato" está todo por hacer (columna + endpoint + UI).
- **Endpoints sin `requireAuth`:** `PUT /api/pedidos/:id/pagado`, `PUT /api/pedidos/:id/estado` y `DELETE /api/pedidos/:id`. El DELETE sigue habilitado aunque la UI ya anula en lugar de borrar, así que se puede saltear el PIN llamándolo directo.
- **`PUT /api/productos/:id/cocinero`:** pide estar logueado pero no verifica que quien asigna sea admin.
- **Mixto:** "Sí, ya pagó" marca todo el pedido como pagado, incluida la parte en efectivo.
- **Cambios sin commitear:** todo lo anterior sigue en el working tree de la rama `Rodriguez`.

---

## ✅ "Listo" por cocinero (cada uno marca solo sus platos)

**Fecha:** 28 de septiembre de 2026  
**Resultado:** ✅ **41/41 pruebas pasaron** (29 de API y 12 de interfaz en Chrome headless)

Antes, el botón "Listo" de la pantalla de cocina pasaba el pedido entero a estado 3 aunque otro cocinero no hubiera terminado. Ahora cada cocinero marca `pedido_detalles.listo = true` solo en sus platos, y el pedido pasa a **Listo para Entregar** recién cuando todos sus platos están listos.

- La columna `pedido_detalles.listo` ya existía, así que no se corrió ningún `ALTER TABLE`.
- No se tocaron `descontarStockPedido`, los pagos ni la anulación.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `server.js` | **Nueva** función `cambiarEstadoPedido(pedidoId, nuevoEstado)`, extraída de `PUT /api/pedidos/:pedidoId/estado`. Hace lo mismo que antes: descuenta el stock al pasar a 3 o 4 y, si falta, devuelve 409 sin cambiar nada. Además, al pasar a 3 marca todos los platos del pedido con `listo = true` |
| `server.js` | `PUT /api/pedidos/:pedidoId/estado` ahora usa esa función. La respuesta es la misma que antes |
| `server.js` | **Nuevo** `PUT /api/pedidos/:id/listo-cocinero` con `requireAuth`. El cocinero sale de `req.usuario.id` (JWT) y se ignora cualquier `cocinero_id` que mande el front. Usa `platoEsDelCocinero()` para decidir qué platos marcar. Si todos quedan listos, llama a `cambiarEstadoPedido(id, 3)` |
| `server.js` | `GET /api/cocina/tareas`: con `cocinero_id`, solo trae los pedidos donde ese cocinero tiene platos con `listo = false`. Cada detalle devuelve también `listo`. Sin `cocinero_id` (modo admin) no cambia |
| `cocinero.html` | Modal de confirmación con las clases `.modal`/`.modal-content` del sistema. Reemplaza al `confirm()` del navegador |
| `cocinero.css` | Estilos del modal y de los avisos flotantes (éxito, info y error), con el mismo estilo que los de Consultar Pedidos |
| `cocinero.js` | La pantalla muestra solo los platos propios que no están listos. El botón abre el modal, llama a `listo-cocinero` con el token y muestra el aviso que corresponde. Ya no usa `alert()` ni `confirm()` |

**Respuestas de `PUT /api/pedidos/:id/listo-cocinero`:**

| Caso | Respuesta |
|------|-----------|
| Faltan platos de otros cocineros | 200 `{ completo: false, platos_pendientes, mensaje: "Tus platos quedaron listos. Faltan platos de otros cocineros." }` |
| Estaban todos | 200 `{ completo: true, mensaje: "Pedido completo, pasó a Listo para Entregar.", pedido }` |
| Falta stock | 409 `{ completo: false, platos_listos: true, error: "<detalle>", mensaje: "...Avisale al administrador." }`. Los platos quedan listos y el pedido sigue en 2 |
| Otros | 401 sin token · 403 si el cocinero no tiene platos en el pedido · 404 si no existe · 409 si el pedido no está en estado 2 |

### Pruebas de API

Se usaron POLLO (#11, asignado a Juan) y fideos (#17, sin cocinero propio, lo ve Marta por el plan). El stock inicial era carne molida 2250 y harina integral 500. POLLO x1 + fideos x1 consume 1750 de carne y 500 de harina, así que alcanza. POLLO x2 + fideos x1 necesita 3250 de carne, así que falta.

| Test | Resultado |
|------|-----------|
| Juan y Marta ven el pedido. `tareas` devuelve `listo` en cada detalle | ✅ |
| Sin token → 401. Mariela, sin platos en el pedido → 403. Pedido inexistente → 404 | ✅ |
| Juan manda `cocinero_id` = Marta en la query y el body: se ignora y se marca solo POLLO | ✅ |
| **Juan marca listo** → POLLO queda listo y fideos no; respuesta con `completo=false`, 1 plato pendiente y el mensaje pedido | ✅ |
| → el pedido sigue en estado 2 y **no se descontó stock** (sin movimientos, stock igual) | ✅ |
| → Juan ya no lo ve; Marta lo sigue viendo, con fideos pendiente | ✅ |
| Juan aprieta otra vez → sigue en 2 | ✅ |
| **Marta marca listo** → `completo=true`, el pedido pasa a **3** y todos los detalles quedan listos | ✅ |
| → **stock descontado una sola vez**: 2 movimientos, carne −1750 y harina −500 | ✅ |
| → Marta ya no lo ve. Si aprieta otra vez: 409 y ningún descuento nuevo | ✅ |
| **Falta stock:** el segundo cocinero recibe 409 con `platos_listos` y el aviso *"Stock insuficiente de 'carne molida': se necesitan 3250, hay 2250"* | ✅ |
| → el pedido sigue en 2, con todos los platos listos y el stock sin tocar | ✅ |
| → ningún cocinero lo ve; en modo admin (sin `cocinero_id`) sigue apareciendo | ✅ |
| **Admin pasa a 3 desde la grilla** (`PUT /estado`) → 200, todos los detalles con `listo=true` y stock descontado una vez | ✅ |
| Admin pasa a 3 un pedido sin stock → 409, igual que antes | ✅ |

### Pruebas de interfaz (Chrome headless, `cocinero.html`)

| Test | Resultado |
|------|-----------|
| Juan ve en el pedido **solo POLLO**, y Marta **solo fideos** | ✅ |
| El botón abre el modal del sistema: *"¿Tus platos del pedido #N están listos?"* | ✅ |
| Cancelar cierra el modal y no cambia nada | ✅ |
| Juan confirma → aviso azul *"Tus platos quedaron listos. Faltan platos de otros cocineros."* | ✅ |
| → la fila desaparece, el pedido sigue en 2 y al recargar Juan ya no lo ve | ✅ |
| Marta confirma → aviso verde *"Pedido completo, pasó a Listo para Entregar."* y el pedido pasa a 3 | ✅ |
| No aparece ningún `alert()` ni `confirm()` del navegador | ✅ |
| Sin errores de JavaScript | ✅ |

**Entorno de prueba:** el :3000 tiene el código anterior y no se reinició. Las pruebas corrieron en una instancia aparte en :3001, contra la misma base, levantada con un preload que cambia el puerto. Los tokens de los cocineros se firmaron con el `JWT_SECRET` del `.env`. Como el CORS de `server.js` solo acepta el origen `localhost:3000` y Chrome manda `Origin` en los PUT, el preload traduce el Origin de 3001 a 3000. Esto afecta solo a la prueba: en :3000 no pasa.

**Restauración verificada:** se borraron los pedidos de prueba #35–#40 y sus movimientos de stock, el stock volvió a 500/2250 y no quedan detalles con `listo=true`. Las asignaciones de cocineros no se tocaron.

### Pendiente / a tener en cuenta

- **Reiniciar el servidor de :3000** para que tome el endpoint nuevo. Hasta entonces, el botón "Listo" de la pantalla de cocina va a fallar (404).
- **Pedido trabado por stock:** queda en estado 2 con todos los platos listos y ningún cocinero lo ve. Lo resuelve el admin pasándolo a 3 desde Consultar Pedidos cuando haya stock. La grilla del admin todavía no marca que ese pedido está esperando stock.
- **Volver de 3 a 2:** si el admin devuelve un pedido a "En Preparación", los platos siguen con `listo=true` y ningún cocinero lo ve. Si eso tiene que pasar, habría que resetear `listo` al volver a 2.
- **Dos cocineros al mismo tiempo:** si los últimos dos cocineros aprietan Listo en el mismo instante, los dos pueden intentar pasar el pedido a 3. `descontarStockPedido` es idempotente (revisa `movimientos_stock`), pero no está protegido contra dos llamadas simultáneas. Lo mismo ya pasaba con `PUT /estado`.
- **Pedido #33:** figura ahora en estado 5 (Anulado). En la verificación anterior estaba en 2. Estas pruebas no lo tocaron.

---

## 📦 Verificación de stock al pasar a "En Preparación"

**Fecha:** 28 de septiembre de 2026  
**Resultado:** ✅ **26/26 pruebas pasaron** (14 de API y 12 de interfaz en Chrome headless, sobre `ConsultarPedidos.html`)

Antes, el stock recién se miraba al pasar a estado 3, así que el admin podía mandar a cocina un pedido sin stock. Ahora, al pasar a estado 2, se **verifica** que el stock alcance para todos los platos, **sin descontar**. Si no alcanza, el pedido no pasa: la respuesta es 409 con el mismo mensaje de siempre y no hay forma de forzarlo. El descuento real sigue ocurriendo al pasar a 3 (o 4), como antes.

No se tocaron los pagos, la anulación ni el "listo" por cocinero.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `server.js` | **Nueva** función interna `calcularConsumoPedido(pedidoId)`. Son los pasos 1 a 5 que estaban en `descontarStockPedido` (detalles, recetas, consumo por insumo, stock actual y pre-flight check), movidos sin cambios. Solo lee y devuelve `{ error }` o `{ consumo, stockMap, nombreMap }` |
| `server.js` | **Nueva** función `verificarStockPedido(pedidoId)`: devuelve `null` si alcanza o el mensaje *"Stock insuficiente de 'X': se necesitan N, hay M disponibles"* si no. Solo lee |
| `server.js` | `descontarStockPedido` ahora usa `calcularConsumoPedido`, así el cálculo no está duplicado. La idempotencia (paso 0) y el descuento con sus movimientos (pasos 6 y 7) no cambiaron |
| `server.js` | `cambiarEstadoPedido`: si `nuevoEstado === 2`, llama a `verificarStockPedido` y, si falta stock, devuelve 409 sin cambiar el estado |
| `server.js` | **Nuevo** `GET /api/pedidos/:id/verificar-stock` con `requireAuth`. Devuelve `{ ok: true }` o `{ ok: false, error }` (400 si el id es inválido, 404 si el pedido no existe) |
| `ListarPedidos.js` | Cuando se elige "En Preparación" con un pago que no es en efectivo y el pedido no está pagado, primero se llama a `/verificar-stock`. Si falta stock, aparece el aviso de stock de siempre (`mostrarAlertaStock`), el select vuelve al estado anterior y **no se abre el modal de pago**. Si la consulta falla (sesión vencida o sin conexión), el modal se abre igual, porque el servidor vuelve a verificar al guardar |

¿Por qué hay una función interna además de `verificarStockPedido`? `descontarStockPedido` necesita el consumo calculado para descontarlo, no solo saber si alcanza. Por eso las dos usan `calcularConsumoPedido`, y `verificarStockPedido` queda como una capa fina que devuelve `null` o el mensaje.

### Pruebas de API

Stock de prueba: carne molida 2250 y harina 500. POLLO usa 1500 de carne; fideos, 250 de carne y 500 de harina.

| Test | Resultado |
|------|-----------|
| `verificar-stock`: sin token → 401 · id inválido → 400 · inexistente → 404 | ✅ |
| `verificar-stock` con stock suficiente → `{ ok: true }` | ✅ |
| `verificar-stock` sin stock → `{ ok: false, error: "Stock insuficiente de \"carne molida\": se necesitan 3000, hay 2250 disponibles" }` | ✅ |
| Verificar no toca el stock ni crea movimientos | ✅ |
| **Pedido con stock → pasa a 2 sin descontar stock** (0 movimientos, stock igual) | ✅ |
| **Pedido sin stock, Efectivo → 409** con el mismo mensaje; **sigue en 1** y sin movimientos | ✅ |
| Regresión del listo por cocinero: el primero marca → sigue en 2 y sin descuento; el segundo marca → pasa a 3 y **descuenta una sola vez** (carne −1750, harina −500) | ✅ |
| Pasar a 4 después → ningún descuento nuevo | ✅ |
| **Admin 2 → 3 desde la grilla → descuenta una sola vez**, como antes | ✅ |

### Pruebas de interfaz (Chrome headless, `ConsultarPedidos.html`)

| Test | Resultado |
|------|-----------|
| **Transferencia sin stock** → se llama a `/verificar-stock` y **sale el aviso de stock** con el mensaje del servidor | ✅ |
| → **no aparece el modal "Confirmar Pago"** | ✅ |
| → el select vuelve a Registrado (1) y el pedido sigue en 1 | ✅ |
| **Efectivo sin stock** → sale el aviso de stock (lo dispara el 409 del servidor) y no se llama a `/verificar-stock` | ✅ |
| → el select vuelve a 1 y el pedido sigue en 1 | ✅ |
| **Transferencia con stock** → abre "Confirmar Pago" como siempre, sin aviso de stock | ✅ |
| → "Sí, ya pagó" pasa el pedido a 2 y lo marca pagado, sin descontar stock | ✅ |
| No aparece ningún `alert()` ni `confirm()` del navegador | ✅ |
| Sin errores de JavaScript | ✅ |

**Entorno de prueba:** igual que en la prueba anterior, se usó una instancia aparte en :3001 con el código nuevo, sin reiniciar la de :3000. `ListarPedidos.js` llama a `http://localhost:3000` con la URL escrita en el código, así que la página se abrió con origen :3000 y Chrome (por CDP) redirigió sus requests a :3001.

**Datos:** desde la prueba anterior el stock real había cambiado a carne 2000 y harina 0, por el pedido real #042 que pasó a 3. Además, POLLO se reasignó a **Mariela**. Por eso la prueba puso el stock de carne y harina en 2250/500 y al terminar lo devolvió a **2000/0**. Se borraron los pedidos de prueba #43–#57 y sus movimientos. Los pedidos reales #41 y #42 y las asignaciones de cocineros no se tocaron.

### Pendiente / a tener en cuenta

- **Reiniciar el servidor de :3000** para que tome estos cambios y los del "listo" por cocinero.
- **La verificación no reserva stock.** Mira el stock actual, que todavía no descontó los pedidos que ya están en estado 2. Dos pedidos pueden pasar a 2 cada uno por su lado aunque juntos no alcancen, y el segundo recién va a chocar con el 409 al pasar a 3. Para evitarlo, habría que restar lo que ya comprometen los pedidos en estado 2.
- **Volver de 3 a 2:** si el admin devuelve a "En Preparación" un pedido que ya descontó, la verificación le exige de nuevo todo el stock del pedido y puede bloquear la vuelta.
- **Pedido real #041 trabado:** está en estado 2 con todos sus platos listos, pero no puede pasar a 3 porque lleva fideos (500 de harina) y hay 0 de harina. Es el caso del pendiente anterior: lo resuelve el admin cuando cargue harina.

---

## 🧑‍🍳 Cocinero desde Generar Receta

**Fecha:** 28 de septiembre de 2026  
**Resultado:** ✅ **32/32 pruebas pasaron** (14 de API y 18 de interfaz en Chrome headless, sobre `generarReceta.html` y `AsignarCocinero.html`)

El cocinero de un plato ahora también se asigna al crear o editar la receta, sin ir a Asignar Cocineros. Las dos pantallas escriben en la misma columna, `productos.id_cocinero`, que ya existía: no se corrió ningún `ALTER TABLE`. No se tocaron el stock, los pedidos ni los pagos, ni la lógica de crear, editar o borrar recetas, más allá de agregar el cocinero.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `server.js` | **Nueva** función `validarCocinero(idCocinero)`: devuelve `null` si el usuario existe y tiene rol 2, o `{ status, error }` si no. Se extrajo de `PUT /api/productos/:id/cocinero`, que ahora la usa (mismas respuestas que antes) |
| `server.js` | `POST /api/productos/con-receta`: acepta `id_cocinero` (opcional). Si viene, se valida con `validarCocinero` **antes** de crear nada y se guarda en el producto. Sin `id_cocinero` queda `null` (usa el cocinero del plan) |
| `server.js` | **Nuevo** middleware `requireAuthSiHayCocinero`: `con-receta` pide token **solo cuando viene `id_cocinero`**. Reutiliza `requireAuth`. Así, asignar cocinero siempre exige sesión (igual que el PUT) y crear una receta sin cocinero funciona como antes |
| `server.js` | `GET /api/recetas`: devuelve también `id_cocinero` y `cocinero_nombre` (nombre y apellido, o `null`). Se trae con `cocinero:usuarios!id_cocinero(...)`, un join que nombra explícitamente la FK |
| `generarReceta.html` | Select **Cocinero** debajo de precio y descuento, en la parte compartida del modal (aparece al crear y al editar). Columna **Cocinero** en la grilla (5ª) y `colspan` 8 → 9 |
| `generarReceta.css` | Los anchos de columna se alinearon con las 9 columnas reales (el CSS ya decía "9 columnas" con un "ID" que la grilla no tiene) y se agregó el estilo gris de "Del plan" |
| `generarReceta.js` | **Nueva** `cargarCocinerosEnSelect()`: lee `GET /api/cocineros`, primera opción *"Sin asignar (usa el del plan)"*, y precarga el cocinero al editar. Si el asignado ya no es cocinero, lo muestra como *"(ya no es cocinero)"*, igual que Asignar Cocineros |
| `generarReceta.js` | **Crear:** manda `id_cocinero` en el mismo `POST /con-receta`, con el token |
| `generarReceta.js` | **Editar:** después de guardar la receta (sin cambios en esa parte), si el cocinero cambió llama a `PUT /api/productos/:id/cocinero` con el token (**nueva** `guardarCocineroDelPlato()`). Si falla, el modal queda abierto con *"La receta se guardó, pero no se pudo asignar el cocinero: …"* |
| `generarReceta.js` | Grilla: muestra el nombre del cocinero, o *"Del plan"* en gris |

### Pruebas de API

| Test | Resultado |
|------|-----------|
| `GET /api/recetas` trae `id_cocinero` y `cocinero_nombre` (POLLO → "mariela flores", fideos → `null`) | ✅ |
| Crear con cocinero **sin token** → 401, no crea nada | ✅ |
| Crear con un **admin (rol 1)** como cocinero → **400** *"El usuario elegido no es un cocinero"*, no crea nada | ✅ |
| Crear con un `id_cocinero` que no es UUID → 400, no crea nada | ✅ |
| **Crear con cocinero Juan** → 200, `id_cocinero = Juan` | ✅ |
| **Crear sin cocinero** (y sin token) → 200, `id_cocinero = null`, igual que antes | ✅ |
| `GET /api/recetas`: la de Juan trae su nombre y la otra `null` ("Del plan") | ✅ |
| `GET /api/productos/cocineros` (Asignar Cocineros) muestra lo mismo: Juan con origen *producto* y Marta con origen *plan* | ✅ |
| **Pedido con los dos platos en estado 2 → Juan ve su plato** y no el otro; Marta (cocinera del plan) ve el que no tiene cocinero | ✅ |
| `PUT /api/productos/:id/cocinero` con un admin → 400; con un id que no es UUID → 400; sin token → 401 (sin cambios) | ✅ |

### Pruebas de interfaz (Chrome headless)

| Test | Resultado |
|------|-----------|
| La grilla tiene la columna "Cocinero": POLLO muestra "mariela flores" y fideos "Del plan" en gris | ✅ |
| Modal nuevo: primera opción *"Sin asignar (usa el del plan)"* y después solo los cocineros (Juan, Mariela, Marta; ningún admin) | ✅ |
| **Crear desde la UI con Juan** → el plato queda con Juan, el cocinero viaja en el mismo `POST /con-receta` y la grilla lo muestra | ✅ |
| **Crear desde la UI sin cocinero** → `id_cocinero = null` y la grilla dice "Del plan" | ✅ |
| **Editar:** el select viene precargado con el cocinero actual | ✅ |
| Editar sin cambiar el cocinero → guarda la receta y **no** llama al PUT de cocinero | ✅ |
| **Editar cambiando a Mariela** → `PUT /api/productos/:id/cocinero` y queda en la base | ✅ |
| **Editar asignando un admin** (opción forzada en el select) → el servidor responde **400**, el modal queda abierto con *"La receta se guardó, pero no se pudo asignar el cocinero: El usuario elegido no es un cocinero"* y el plato sigue con Mariela | ✅ |
| **Asignar Cocineros** muestra el cambio hecho en Generar Receta (Mariela), y el plato sin cocinero como *"Sin asignar — usa el del plan (Marta Garcia)"* | ✅ |
| Al revés: un cambio hecho en Asignar Cocineros se ve en la grilla de Generar Receta | ✅ |
| No aparece ningún `alert()` ni `confirm()` del navegador | ✅ |
| Sin errores de JavaScript | ✅ |

**Entorno de prueba:** otra vez se usó una instancia aparte en :3001, sin tocar la de :3000. Las páginas se abrieron con origen :3000 y Chrome (por CDP) redirigió sus requests a :3001, porque `AsignarCocinero.js` tiene `http://localhost:3000` escrito en el código.

**Limpieza verificada:** se borraron de verdad (no con soft delete) los productos de prueba #19–#22, sus recetas y el pedido de prueba #59. Las asignaciones de POLLO y fideos, el stock (carne 2000, harina 0) y los pedidos reales (#41, #42, #58) no se tocaron.

### Pendiente / a tener en cuenta

- **Reiniciar el servidor de :3000** para que tome estos cambios (y los anteriores).
- **Editar guarda en dos pasos** (`POST /api/recetas` y después `PUT .../cocinero`). Si el segundo falla, la receta ya quedó guardada y se avisa en el modal. No hay una transacción que junte los dos.
- **Crear o editar recetas sin sesión:** `POST /api/recetas`, `POST /con-receta` sin cocinero y `DELETE /api/recetas/:id` siguen sin pedir token (era así antes). Solo se exige sesión cuando se asigna un cocinero.
- **El filtro por nombre de la grilla** no se vuelve a aplicar después de guardar: se muestran todas las recetas hasta que se vuelve a escribir en el buscador. Era así antes.

---

## 💵🏦 Pago Mixto: transferencia confirmada ≠ pedido cobrado

**Fecha:** 28 de septiembre de 2026  
**Resultado:** ✅ **36/36 pruebas pasaron** (13 de API y 23 de interfaz en Chrome headless, sobre `ConsultarPedidos.html` y `Envios.html`)

Antes, al confirmar el pago de un pedido **Mixto** en el modal "Confirmar Pago", se marcaba `pagado = true` para todo el pedido, aunque el efectivo recién se cobra al entregar. Ahora:

- `pagado = true` significa que el pedido está **totalmente** cobrado.
- `transferencia_confirmada = true` significa que llegó la parte por transferencia. La columna ya existía (`boolean NOT NULL default false`), así que no se corrió ningún `ALTER TABLE`.

| Método | Al confirmar en "Confirmar Pago" | Al marcar **Cobrado** en Envíos |
|--------|----------------------------------|---------------------------------|
| Efectivo | (no hay modal) | `pagado = true` |
| Transferencia / Tarjeta | `pagado = true` (igual que antes) | — |
| **Mixto** | **solo** `transferencia_confirmada = true`; `pagado` sigue en `false` | `pagado = true` (solo si la transferencia está confirmada) |

No se tocaron el stock, los estados, los cocineros, la anulación ni la forma en que el modal de Pago guarda los montos.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `server.js` | `GET /api/pedidos` devuelve además `transferencia_confirmada` (los montos ya estaban). `GET /api/envios` devuelve además `monto_efectivo`, `monto_transferencia`, `transferencia_confirmada` y `pago_anticipado` |
| `server.js` | **Nuevo** `PUT /api/pedidos/:id/transferencia-confirmada` con `requireAuth`: pone `transferencia_confirmada = true` y **no toca `pagado`**. Solo lo acepta si el pedido es Mixto (409 si no); 400 si el id es inválido, 404 si no existe |
| `server.js` | `PUT /api/pedidos/:id/pagado`: con `pagado: true`, un Mixto con `transferencia_confirmada = false` → **409** *"No se puede marcar como cobrado: la transferencia de este pedido Mixto todavía no fue confirmada. Confirmala desde Consultar Pedidos."* Ahora también responde 404 si el pedido no existe. Poner `pagado: false` (deshacer) no tiene restricción |
| `ConsultarPedidos.html` | El modal "Confirmar Pago" tiene dos textos: el de siempre (Transferencia / Tarjeta) y el del Mixto, *"¿Confirmás que el cliente ya transfirió $X? El efectivo ($Y) se cobra al entregar."* |
| `ListarPedidos.js` | `abrirModalConfirmarPago` muestra el texto que corresponde. `aceptarConfirmarPago`: si es Mixto llama a `/transferencia-confirmada` en lugar de `/pagado`. Si falla, muestra un aviso del sistema en lugar del `alert()` |
| `ListarPedidos.js` | Para decidir si abre el modal, en un Mixto se mira `transferencia_confirmada` y no `pagado`. Si no, un Mixto ya confirmado que se vuelve a pasar a "En Preparación" preguntaría otra vez por la transferencia |
| `ListarPedidos.js` | Grilla: un Mixto con la transferencia confirmada y sin cobrar muestra *"Transferencia ✓ · Efectivo pendiente $Y"* (en tres líneas para que entre en la columna) y **PENDIENTE** |
| `ListarPedidos.js` | `mostrarAlertaStock` pasa a usar una nueva `mostrarAlerta(titulo, mensaje)` (mismo aviso, con título variable). El aviso de stock no cambia |
| `Envios.js` | **Nueva** `infoCobro(p)`: qué tiene que cobrar el repartidor. La usan la tarjeta y la hoja imprimible |
| `Envios.js` | Botón **Cobrado**: si el servidor rechaza (409), muestra el motivo con un aviso del sistema (**nuevo** `mostrarAviso`) en lugar del `alert()`. Si sale bien, redibuja la tarjeta |
| `Envios.html` | Estilos del bloque de cobro (amarillo = cobrar, verde = no cobrar, rojo = alerta), del aviso y de la columna de pago de la hoja imprimible |

**Qué muestra Envíos** (tarjeta y columna "Pago" de la hoja imprimible):

| Pedido | Texto |
|--------|-------|
| Efectivo | **Cobrar en efectivo: $total** |
| Efectivo con pago anticipado | Pago anticipado, no cobrar *(agregado: si no, se le pediría al cliente que pague dos veces)* |
| Mixto | **Cobrar en efectivo: $monto_efectivo**, y abajo *"Transferencia ya recibida: $monto_transferencia"* |
| Mixto con la transferencia sin confirmar | Cobrar en efectivo: $monto_efectivo, y abajo *"⚠ Transferencia sin confirmar: $monto_transferencia"* |
| Transferencia / Tarjeta pagado | **Ya pagado, no cobrar** |
| Transferencia / Tarjeta sin pago confirmado | ⚠ Pago sin confirmar, no cobrar · *Consultá con el local antes de entregar* *(agregado: para no afirmar "ya pagado" cuando la base dice que no)* |

### Pruebas de API

| Test | Resultado |
|------|-----------|
| `transferencia-confirmada`: sin token → 401 · id inválido → 400 · inexistente → 404 · pedido Transferencia → 409 | ✅ |
| `PUT /pagado true` en un Mixto **sin** transferencia confirmada → **409** con el mensaje | ✅ |
| `transferencia-confirmada` en el Mixto → 200: `transferencia_confirmada = true` y `pagado` sigue en `false` | ✅ |
| `PUT /pagado true` en un Mixto **con** la transferencia confirmada → 200 | ✅ |
| `PUT /pagado false` (deshacer) → 200 · `PUT /pagado true` en Transferencia → 200 · pedido inexistente → 404 | ✅ |
| `GET /api/pedidos` y `GET /api/envios` traen los campos nuevos | ✅ |

### Pruebas de interfaz (Chrome headless)

**Pedido Mixto de $10.000 (6.000 en efectivo + 4.000 por transferencia):**

| Test | Resultado |
|------|-----------|
| Pasar a "En Preparación" → el modal dice *"¿Confirmás que el cliente ya transfirió $ 4.000? El efectivo ($ 6.000) se cobra al entregar."* | ✅ |
| "Sí, ya pagó" → **estado 2, `transferencia_confirmada = true`, `pagado = false`** | ✅ |
| → llama a `/transferencia-confirmada` y **no** a `/pagado` | ✅ |
| → la grilla dice *"Transferencia ✓ · Efectivo pendiente $ 6.000"* y **PENDIENTE** | ✅ |
| Volver a 1 y pasar otra vez a 2 → no vuelve a preguntar por la transferencia | ✅ |
| **Envíos: "Cobrar en efectivo: $6.000"** y *"Transferencia ya recibida: $4.000"* (tarjeta y hoja imprimible) | ✅ |
| **Cobrado en Envíos → `pagado = true`** y el botón dice "✓ Cobrado" | ✅ |
| De vuelta en Consultar Pedidos: muestra el desglose y **PAGADO** | ✅ |

**Otros casos:**

| Test | Resultado |
|------|-----------|
| **Transferencia pura:** el modal tiene el texto de siempre; "Sí, ya pagó" → `pagado = true`, la grilla dice PAGADO | ✅ |
| → **Envíos: "Ya pagado, no cobrar"** (tarjeta y hoja imprimible) | ✅ |
| **Efectivo:** pasa a 2 sin modal · **Envíos: "Cobrar en efectivo: $10.000"** (tarjeta y hoja imprimible) · Cobrado → `pagado = true` | ✅ |
| Mixto con la transferencia **sin confirmar** en Envíos: avisa *"⚠ Transferencia sin confirmar"*. Cobrado → aviso del sistema con el 409 y sigue "✗ Sin cobrar" | ✅ |
| No aparece ningún `alert()` ni `confirm()` del navegador · sin errores de JavaScript · el stock no se tocó | ✅ |

**Entorno de prueba:** otra vez se usó una instancia aparte en :3001 (el :3000 no se reinició), con las páginas abiertas en origen :3000 y sus requests redirigidos a :3001. Para que los pedidos aparecieran en Envíos (estado 3), se pasaron a 3 **directamente en la base**: así no se disparó el descuento de stock, que no es parte de esta prueba. Se borraron los pedidos de prueba (#62–#91). Hubo varias corridas: una primera tuvo 3 fallos por los tiempos de espera de la prueba (no del código) y se corrigió para esperar a que la base tuviera el valor esperado.

### Pendiente / a tener en cuenta

- **Reiniciar el servidor de :3000** para que tome estos cambios (y los anteriores).
- **Dato real a revisar — pedido #061:** es Mixto ($2.000 en efectivo + $500 por transferencia), está en "Listo para Entregar" y figura con `pagado = true` y `transferencia_confirmada = false`. Seguramente se confirmó con el comportamiento viejo, antes de que se cobrara el efectivo. Si el efectivo todavía no se cobró, la corrección sería:
  ```sql
  UPDATE pedidos SET pagado = false, transferencia_confirmada = true WHERE id = 61;
  ```
  No se aplicó: es un dato real y lo decide el administrador.
- **Cambiar el método o los montos después de confirmar:** si un Mixto ya confirmado se cambia en el modal de Pago a otro método o a otros montos, `transferencia_confirmada` queda en `true`. No se tocó, porque la consigna era no cambiar cómo guarda el modal de Pago.
- **`PUT /api/pedidos/:id/pagado` sigue sin pedir token** (lo usa el botón Cobrado de Envíos, que tampoco lo manda). El control nuevo del Mixto aplica igual.
- **`alert()` que quedan:** en el cambio de estado de Envíos y de Consultar Pedidos (errores que no son de stock). No se tocaron porque esta tarea no cubre los estados.
- **Detalles visuales que ya estaban:** la columna Fecha de Consultar Pedidos muestra un día menos (la fecha se interpreta en UTC) y la etiqueta "EN PREPARACIÓN" se corta.

---

## 📅 Pedidos del día de producción (48 hs hábiles)

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **22/22 pruebas pasaron** (Chrome headless, sobre `formulario.html` y `ConsultarPedidos.html`)

**Regla de negocio:** el cliente pide un día, se cocina el día hábil siguiente y se entrega el día hábil después. Ejemplo: se pide el martes 29, se cocina el miércoles 30 y se entrega el jueves 1. Son días hábiles de lunes a viernes, salteando los `FERIADOS`.

No se tocaron el stock, los pagos, los cocineros, los estados, `server.js` ni la barra de anuncio del inicio.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `frontend/src/js/fechas.js` | **Nuevo**, compartido. Contiene `FERIADOS` (movido desde formulario.js, sin cambios) y `esDiaHabil` (movida), más cuatro funciones nuevas: `fechaLocalISO` (Date → `YYYY-MM-DD` local), `parseFechaLocal` (`YYYY-MM-DD` → Date local), `sumarDiasHabiles` y `proximoDiaHabil`. Todo con fecha **local**, sin `toISOString()` |
| `formulario.js` | `calcularPrimeraFechaDisponible()` ahora es `sumarDiasHabiles(hoy, 2)`. Se sacó el `do/while` que sumaba un día hábil de más (el martes dejaba elegir desde el viernes). `FERIADOS` y `esDiaHabil` ya no están acá: vienen de `fechas.js` |
| `formulario.html` / `formulario.css` | Cartel debajo del campo de fecha: *"🕒 Tu pedido se elabora el día hábil siguiente al que lo hacés y se entrega al otro día hábil (48 hs hábiles). Ejemplo: si pedís un martes, se cocina el miércoles y te llega el jueves."* Tiene el mismo estilo (verde claro con borde) que el resumen del pedido. Se carga `fechas.js` |
| `ConsultarPedidos.html` / `.css` | Título arriba de la grilla, botones **Aplicar** y **Ver todos** junto a las fechas, y carga de `fechas.js` |
| `ListarPedidos.js` | Los filtros Desde / Hasta **ahora filtran por `fecha_entrega`**, y se aplican con el botón **Aplicar**: cambiar una fecha sin apretarlo no filtra. Al abrir, ambos vienen con el **próximo día hábil** y el filtro ya aplicado |
| `ListarPedidos.js` | Título: *"Producción de hoy — entregas del jueves 01/10/2026"* al abrir; *"Pedidos con entrega del X al Y"* si se aplica otro rango (o *"desde el X"* / *"hasta el Y"* si falta una punta); *"Todos los pedidos"* con **Ver todos** |
| `ListarPedidos.js` | Si "Desde" es posterior a "Hasta", sale un aviso del sistema y se mantiene el filtro anterior. Los pedidos sin fecha de entrega no entran en un rango, pero sí en "Ver todos" |
| `ListarPedidos.js` | La búsqueda por nombre y la paginación trabajan sobre lo filtrado (`filtrarPedidos()` combina las dos cosas) |
| `ListarPedidos.js` | **Corrección:** la columna **Fecha** mostraba la fecha de entrega **un día antes** (se leía como UTC; ítem C-08 de la revisión). Ahora se lee como fecha local. Sin esto, el título decía "entregas del 01/10" y las filas "30/09" |

### Pruebas

Se simuló "hoy" en distintos días a las **22 h, hora de Córdoba**, justo cuando un cálculo en UTC ya pasó al día siguiente.

**Formulario del cliente:**

| Test | Resultado |
|------|-----------|
| Pedido un **martes 29/09** → primera fecha **jueves 01/10** | ✅ |
| Pedido un **jueves 01/10** → primera fecha **lunes 05/10** | ✅ |
| Pedido un **viernes 02/10** → primera fecha **martes 06/10** | ✅ |
| Pedido un sábado 03/10 → martes 06/10 · pedido un miércoles 30/09 → viernes 02/10 | ✅ |
| El **cartel** aparece justo debajo del campo de fecha, visible y con el texto pedido | ✅ |

**Consultar Pedidos** (con pedidos de prueba con entrega el jueves 01/10, el viernes 02/10, el lunes 05/10 y uno sin fecha):

| Test | Resultado |
|------|-----------|
| **Miércoles 30/09:** Desde y Hasta vienen con el **jueves 01/10**, y el título dice *"Producción de hoy — entregas del jueves 01/10/2026"* | ✅ |
| → el filtro **ya está aplicado**: solo aparecen entregas del 01/10, la misma cantidad que en la base | ✅ |
| → la columna Fecha muestra 01/10/2026 (antes mostraba 30/09) | ✅ |
| Cambiar una fecha **sin** apretar Aplicar no cambia el listado | ✅ |
| **Aplicar** 01/10 → 02/10: jueves y viernes sí, lunes no, con la cantidad correcta; el título cambia a *"Pedidos con entrega del jueves 01/10/2026 al viernes 02/10/2026"* | ✅ |
| La búsqueda por nombre funciona dentro del rango | ✅ |
| Desde posterior a Hasta → aviso del sistema, el filtro no cambia | ✅ |
| **Ver todos** → fechas vacías, título "Todos los pedidos", todos los pedidos (incluido el sin fecha) y paginación de 15 por página | ✅ |
| **Viernes 02/10:** muestra la producción del **lunes 05/10** | ✅ |
| No aparece ningún `alert()` · sin errores de JavaScript | ✅ |

**Entorno:** instancia aparte en :3001 (el :3000 no se tocó). Se borraron los pedidos de prueba (#101–#104).

### A tener en cuenta

- **La producción del día incluye pedidos anulados** (estado 5): en la prueba aparecieron #017 y #027, que están cancelados. No se cocinan, pero figuran en la lista. Excluirlos es un cambio de una línea en `filtrarPedidos()`; no se hizo porque la consigna era no tocar estados.
- **La fecha mínima del formulario se controla solo en el navegador.** El servidor acepta cualquier `fecha_entrega` en `POST /api/pedidos`. Para que la regla de 48 hs sea obligatoria, habría que validarla también en el servidor.
- **`FERIADOS` está vacío** (todas las fechas comentadas): hoy solo se saltean sábados y domingos. Hay que descomentar los feriados del año.
- **Quedan `toISOString()` para calcular "hoy"** en otras pantallas que esta tarea no cubre: `Envios.js:227`, `reportes.js:33-34` y `stock.js:225` (C-08 de la revisión). Podrían usar `fechaLocalISO()` de `fechas.js`.

---

## 📅 Consultar Pedidos: columnas "Pedido" / "Entrega" y día de producción en el título

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **17/17 pruebas pasaron** (Chrome headless con fechas simuladas y zona horaria de Córdoba)

**Regla:** un pedido se cocina el día hábil anterior a su fecha de entrega, salteando fines de semana y `FERIADOS`. La grilla muestra cuándo se hizo el pedido y cuándo se entrega; el día de producción no va en una columna, lo explica el título.

> **Versión intermedia descartada.** En una versión anterior de este ajuste se había agregado una columna "Producción", y la vista de entrada filtraba por "producción = hoy". Esa versión no se commiteó y se reemplazó por esta. La prueba de esa versión mostró algo que sigue vigente: con `FERIADOS` vacío, el lunes 12/10 cuenta como día hábil, así que la entrega del martes 13/10 se produce el **lun 12/10** y no el vie 09/10. Con el 12/10 cargado como feriado da vie 09/10 (verificado). Ver "A tener en cuenta".

No se tocaron el stock, los pagos, los cocineros, los estados ni `server.js`.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `fechas.js` | **Nuevas:** `diaHabilAnterior(fecha)` (el día de producción de una entrega), `fechaDiaCorto(fecha)` (formato "lun 28/09") y `fechaDeTimestamp(texto)` (lee `fecha_pedido`; si viniera sin zona horaria lo toma como UTC, porque `new Date()` lo tomaría como hora local) |
| `ConsultarPedidos.html` | La columna "Fecha" pasa a ser dos: **Pedido** (`fecha_pedido`) y **Entrega** (`fecha_entrega`), en ese orden. La grilla queda con 12 columnas |
| `ListarPedidos.js` | Las dos fechas se muestran como "lun 28/09". **Pedido** es el día **local** del timestamp (un pedido hecho a las 22 h no pasa al día siguiente). **Entrega** va en negrita. Se ajustaron los índices de las celdas (cliente, dirección, teléfono, mail, estado) y el `colspan` |
| `ListarPedidos.js` | Filtro de entrada (misma lógica que antes): entregas del **próximo día hábil**, ahora **sin los cancelados**. Con un rango aplicado o con "Ver todos", los cancelados sí aparecen |
| `ListarPedidos.js` | **Título:** al abrir, *"Producción de hoy (mar 29/09) — pedidos con entrega el mié 30/09"*. Con un rango, *"Pedidos con entrega del X al Y — se producen del [hábil anterior a X] al [hábil anterior a Y]"*, o *"Pedidos con entrega el X — se producen el Y"* si es un solo día. Con "Ver todos", *"Todos los pedidos"*. El día de producción sale de `diaHabilAnterior` (sin duplicar lógica) |
| `ListarPedidos.js` | **Agregado:** si se abre un sábado, domingo o feriado, el título no dice "Producción de hoy", porque ese día no se cocina: *"Hoy (sáb 17/10) no se produce — pedidos con entrega el lun 19/10, se producen el vie 16/10"* |

### Pruebas

| Test | Resultado |
|------|-----------|
| **Martes 29/09 al abrir:** título *"Producción de hoy (mar 29/09) — pedidos con entrega el mié 30/09"*; Desde y Hasta = 30/09 y solo entregas del 30/09 | ✅ |
| → sin los cancelados: un pedido cancelado con entrega 30/09 no aparece | ✅ |
| Columnas en orden: N° Pedido, **Pedido**, **Entrega**, Cliente… (12 columnas, sin "Producción" ni "Fecha") | ✅ |
| **Pedido hecho el lun 28/09 a las 22 h** (guardado como 29/09 01:00 UTC) → columna Pedido **"lun 28/09"**, Entrega "mié 30/09"; las demás celdas en su lugar | ✅ |
| Un timestamp sin zona horaria también se lee como UTC → "lun 28/09" | ✅ |
| Aplicar 30/09 → 30/09: *"Pedidos con entrega el mié 30/09 — se producen el mar 29/09"* | ✅ |
| **Viernes 16/10 al abrir:** *"Producción de hoy (vie 16/10) — pedidos con entrega el lun 19/10"*, con el pedido del 19/10 | ✅ |
| **Aplicar 19/10 → 20/10:** *"Pedidos con entrega del lun 19/10 al mar 20/10 — se producen del vie 16/10 al lun 19/10"* | ✅ |
| Solo "Desde" 19/10: *"… desde el lun 19/10 — se producen desde el vie 16/10"* | ✅ |
| "Ver todos": *"Todos los pedidos"*, con los cancelados | ✅ |
| Sábado 17/10 al abrir: el título aclara que ese día no se produce | ✅ |
| No aparece ningún `alert()` · sin errores de JavaScript | ✅ |

**Entorno:** instancia aparte en :3001. Se borraron los pedidos de prueba (#106–#109 de la versión descartada y #111–#114 de esta).

### A tener en cuenta

- **`FERIADOS` sigue vacío:** hoy solo se saltean sábados y domingos, así que el lunes 12/10 cuenta como hábil. Falta decidir si se activan los feriados de 2026 en `fechas.js`, y después cargar los de cada año.
- **La vista de entrada no incluye entregas en fin de semana:** muestra las entregas del próximo día hábil. Si hubiera un pedido viejo con entrega un sábado, no aparece en la producción del viernes; aparece con "Aplicar" o "Ver todos". El formulario ya no deja elegir sábados ni domingos.

---

## 🧹 Fase 1A — Bugs de frontend (C-04, C-05, C-06, C-08 de la revisión)

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **29/29 pruebas pasaron** (6 de API y 23 de interfaz en Chrome headless)

No se tocó la lógica de pedidos, stock, pagos, cocineros ni la vista de producción del día. En `server.js` solo se tocó `GET /api/pedidos`.

### Cambios

| # | Archivo | Cambio |
|---|---------|--------|
| C-06 | `ListarPedidos.js`, `stock.js`, `AsignarCocinero.js`, `formulario.js` | `http://localhost:3000/api/...` → `/api/...` (19 llamadas; con las 3 constantes de abajo son 22 líneas en los 7 archivos) |
| C-06 | `Envios.js`, `MovimientosStock.js`, `reportes.js` | Se eliminó `const API = 'http://localhost:3000'` y `${API}/api/...` pasó a ser `/api/...`. Ya no queda ninguna URL fija en el frontend |
| C-05 | `reportes.js` | Se borraron los tres bloques `// MOCK DATA`: evolución por día (valores con `Math.random()`), estados (distribución de ejemplo) y barrios (ranking de ejemplo). **Nueva** `marcarSinDatos(canvasId, sinDatos)`: si un gráfico no tiene datos, oculta el lienzo y muestra *"Sin datos para el período"* en su lugar. Se aplica a los 4 gráficos, también a "Top productos", que antes quedaba en blanco sin explicación |
| C-05 | `admin.html` | Estilo del aviso `.chart-sin-datos` y carga de `fechas.js` |
| C-04 | `server.js` → `GET /api/pedidos` | Acepta `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (opcionales) y filtra por `fecha_pedido`. Sin parámetros devuelve todo, como antes (Consultar Pedidos no cambia). Un formato inválido responde 400. **Los días son de Argentina** (`-03:00`): `fecha_pedido` está en UTC, y un pedido de las 22 h del 30/09 (01:00 UTC del 01/10) cuenta en septiembre |
| C-08 | `reportes.js` | El filtro por defecto (del 1° del mes a hoy) usa `fechaLocalISO`. El gráfico de evolución y el CSV agrupan por el **día local** de `fecha_pedido` (`fechaLocalISO(fechaDeTimestamp(...))`) en lugar de cortar el texto UTC |
| C-08 | `Envios.js` / `Envios.html` | "Hoy" usa `fechaLocalISO` (antes `toISOString()`: a partir de las 21 h mostraba los envíos de mañana). Se carga `fechas.js` |

Se reutilizaron `fechaLocalISO` y `fechaDeTimestamp` de `fechas.js`; no se crearon funciones de fecha nuevas.

### Pruebas

**`GET /api/pedidos`:**

| Test | Resultado |
|------|-----------|
| Sin parámetros devuelve todos, como antes | ✅ |
| Septiembre: entran los pedidos del 29/09 a las 22:00 y del 30/09 a las 23:30 (hora AR); no entran el del 01/10 a las 00:30 ni uno de agosto | ✅ |
| Octubre: entra el del 01/10 a las 00:30 y no el del 30/09 a las 23:30 | ✅ |
| Un período sin pedidos devuelve `[]`; una fecha con formato inválido responde 400 | ✅ |

**Interfaz** (las páginas se sirvieron desde `:3001`, sin redirección: una llamada a `localhost:3000` se habría notado):

| Test | Resultado |
|------|-----------|
| **Las 10 pantallas** cargan sin errores y **ninguna llama a localhost:3000**: admin (reportes), Consultar Pedidos, Stock, Movimientos de Stock, Asignar Cocineros, Envíos, Generar Receta, Gestión de Usuarios, Cocina y el formulario público | ✅ |
| **Reportes con un período sin pedidos** (enero 2030): los 4 gráficos dicen *"Sin datos para el período"* y el KPI de pedidos queda en 0; no hay números al azar | ✅ |
| **Reportes con septiembre 2026:** solo pedidos de septiembre (en hora AR), el KPI coincide con la API y los gráficos vuelven a mostrarse | ✅ |
| Reportes abierto a las 22 h del 29/09: el filtro por defecto va del 01/09 al **29/09** (antes daba 30/09) | ✅ |
| No quedan `Math.random` ni bloques `MOCK` en `reportes.js` | ✅ |
| **Consultar Pedidos igual que antes:** vista de producción del día, Aplicar y Ver todos | ✅ |
| **Envíos del Día a las 22 h del 29/09** muestra la fecha 29/09 y busca los envíos de ese día | ✅ |
| No aparece ningún `alert()` | ✅ |

**Entorno:** instancia aparte en :3001. Se borraron los pedidos de prueba (#125–#128).

### A tener en cuenta

- **Reportes: "Top productos" usa otro corte horario.** `GET /api/reportes/productos-mas-vendidos` todavía corta los días en UTC (`'T00:00:00'`), no en hora de Argentina. En los bordes del período (pedidos entre las 21 h y la medianoche) puede no coincidir con el resto del panel. No se tocó porque la consigna limitaba `server.js` a `GET /api/pedidos`.
- **Quedan `toISOString()` en otras pantallas:** `stock.js:225` (fecha por defecto del alta de insumo) y `MovimientosStock.js` (fecha del movimiento). Esta fase no las cubría.
- **`GET /api/pedidos` sigue sin pedir login** (ver la parte de seguridad de `REVISION_CODIGO.md`).

---

## 🧹 Fase 1A — Pendientes resueltos

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **7/7 pruebas pasaron**

| Archivo | Cambio |
|---------|--------|
| `server.js` → `GET /api/reportes/productos-mas-vendidos` | Corta los días en **hora de Argentina** (`-03:00`), reutilizando la constante `OFFSET_ARGENTINA` de `GET /api/pedidos`. Antes cortaba en UTC (`'T00:00:00'`), así que el panel de reportes mezclaba dos cortes horarios |
| `stock.js` / `stock.html` | La `fecha_ingreso` de un insumo nuevo usa `fechaLocalISO(new Date())` (antes `toISOString()`: después de las 21 h quedaba con la fecha de mañana). Se carga `fechas.js` |
| `MovimientosStock.js` / `MovimientosStock.html` | La fecha y hora precargadas del movimiento (`setFechaActual`) se arman con `fechaLocalISO` más la hora local, en lugar del truco `toISOString()` + desfase horario (daba lo mismo, pero ahora es explícito). Se carga `fechas.js` |

**Un `toISOString()` que se dejó a propósito:** `MovimientosStock.js:278`, `fecha: new Date(fecha).toISOString()`. Convierte la fecha y hora que eligió el usuario (hora local) en un instante UTC para guardarlo en la base, que guarda timestamps con zona. Es el uso correcto: con `fechaLocalISO` se perderían la hora y la zona.

| Test | Resultado |
|------|-----------|
| Top productos: un pedido del 30/09 a las 23:30 (hora AR, 02:30 UTC del 01/10) cuenta en el **30/09** | ✅ |
| Top productos: un pedido del 01/10 a las 00:30 (hora AR) cuenta en el **01/10**, y el de las 23:30 no | ✅ |
| Top productos y `GET /api/pedidos` dan el mismo total en 4 rangos (mismo corte horario) | ✅ |
| Movimientos de Stock a las 22:05 del 29/09: la fecha precargada es `2026-09-29T22:05` · sin errores | ✅ |
| Stock: un insumo dado de alta a las 22:00 del 29/09 queda con `fecha_ingreso` **2026-09-29** (antes 30/09) · sin errores | ✅ |

Se borraron los pedidos (#129, #130) y el insumo de prueba.

---

## 💰 Fase 1B — Precios y total calculados en el servidor (C-01, C-02 de la revisión)

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **24/24 pruebas pasaron** (18 de API y 6 de interfaz en Chrome headless)

**Antes:**
- **C-01:** el navegador calculaba el total y el servidor lo guardaba sin revisarlo. Se podía mandar `total: 1` desde la consola, o se guardaba un precio viejo si el carrito había quedado abierto.
- **C-02:** el total se guardaba con descuento y el `precio_unitario` de cada renglón sin descuento, así que no cerraban entre sí y "Top productos" mostraba ventas infladas.

**Ahora el servidor es el único que decide los precios:** el navegador solo dice qué productos y cuántos. Lo que ve el cliente en pantalla no cambió.

No se tocaron el stock, los pagos, los cocineros, los estados, el catálogo ni el carrito.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `fechas.js` | Al final, `module.exports` con las funciones de días hábiles y feriados, para que **el servidor reutilice el mismo archivo** (en el navegador esa línea no hace nada). No se duplicó la lógica |
| `server.js` | **Nueva** `precioFinal(producto)`: precio × (1 − descuento/100) con `Math.round`, igual que `precioEfectivo` de `index.js`; sin descuento, el precio tal cual. Es la única regla de precio del servidor |
| `server.js` | **Nueva** `hoyArgentina()`: "hoy" en hora de Argentina. Si el servidor corre en UTC (lo normal en un hosting), a las 22 h su "hoy" ya sería mañana y rechazaría la primera fecha que el formulario deja elegir |
| `server.js` → `POST /api/pedidos` | **Valida todo antes de guardar:** que haya platos; producto entero; cantidad entera entre 1 y 100; que el producto exista, esté activo y tenga precio; fecha de entrega obligatoria, **día hábil** y **al menos 48 hs hábiles después de hoy** (`sumarDiasHabiles(hoyArgentina(), 2)`, la misma regla que el formulario). Si algo falla, responde 400 con un mensaje claro y no guarda nada |
| `server.js` → `POST /api/pedidos` | `precio_unitario = precioFinal(producto)` y `total = Σ cantidad × precio_unitario`. **Se ignora el `total` del body.** Antes, un producto inexistente se guardaba con precio $0 |
| `server.js` → `POST /api/pedidos` | La respuesta devuelve `total` y los renglones (`items`: nombre, cantidad, precio cobrado y subtotal). Si falla el guardado de los renglones, se borra el pedido recién creado para no dejarlo vacío |
| `formulario.js` | El mensaje de WhatsApp usa el **total y los renglones que devuelve el servidor** (antes, los del carrito). Si solo se cambiaba el total, con un precio desactualizado los renglones no habrían sumado el total del mensaje |
| `tests/test_e2e.js` | Mandaba `fecha_entrega` = hoy, que ahora se rechaza. Pasa a mandar la primera fecha válida, calculada con `fechas.js` |

### Pruebas

Productos usados: POLLO $1.500 (sin descuento), fideos $15.000 con 10% ($13.500) y pollo con papas $5.000 con 10% ($4.500).

**Precios y total:**

| Test | Resultado |
|------|-----------|
| **Sin descuento:** POLLO × 2 → total $3.000, `precio_unitario` $1.500 | ✅ |
| **Con 10% de descuento:** `precio_unitario` fideos $13.500 y pollo con papas $4.500 | ✅ |
| → total 13.500 + 2 × 4.500 = **$22.500**, igual a la suma de los renglones | ✅ |
| **Mandando `total: 1` a mano** se guarda el total real, $22.500 | ✅ |
| La respuesta trae los renglones con el precio cobrado | ✅ |
| **La página muestra lo mismo que se guarda:** la tarjeta de fideos en el inicio dice "$ 13500" (tachado $ 15000) = `precio_unitario` guardado | ✅ |

**Validaciones (todas responden 400 y no guardan nada):**

| Test | Resultado |
|------|-----------|
| **Producto inactivo** → *"El plato "pepe" ya no está disponible. Sacalo del carrito y volvé a intentar."* | ✅ |
| **Producto inexistente** → *"El producto 99999 no existe"* | ✅ |
| **Cantidad 0, negativa, con decimales o mayor a 100** → *"La cantidad de cada plato tiene que ser un número entero entre 1 y 100"* (con 100 se acepta) | ✅ |
| Pedido sin platos | ✅ |
| **Fecha antes de las 48 hs hábiles** (pedido el martes 29/09 con entrega el miércoles 30/09) → *"La primera fecha de entrega disponible es el 01/10/2026 (48 hs hábiles)"* | ✅ |
| **Fecha en sábado o domingo** → *"La fecha de entrega tiene que ser un día hábil…"* | ✅ |
| Sin fecha de entrega | ✅ |
| Ninguno de esos pedidos quedó guardado | ✅ |

**Formulario → WhatsApp** (con un carrito "viejo" que tenía fideos a $99.999 en el `localStorage`):

| Test | Resultado |
|------|-----------|
| **El mensaje muestra el total real, $22.500** (no los $108.999 del carrito viejo) | ✅ |
| Los renglones también usan el precio real: "1x fideos: $13.500" y "2x pollo con papas: $9.000" | ✅ |
| El pedido quedó guardado con total $22.500 · sin errores de JavaScript | ✅ |

**Entorno:** instancia aparte en :3001. Se borraron todos los pedidos de prueba. `tests/test_e2e.js` no se corrió en esta fase (pasa pedidos a "Listo" y descuenta stock real); solo se verificó que compila.

### A tener en cuenta

- **El carrito puede mostrar un precio viejo:** si un precio cambió mientras el carrito estaba abierto, el cliente ve el viejo hasta que confirma. El pedido se cobra al precio vigente y el mensaje de WhatsApp muestra ese precio. Si hace falta, el formulario podría avisar la diferencia antes de enviar.
- **La página `viandasSaludables.html` sigue mostrando el precio sin descuento** (usa `/api/v1/productos`, que no trae `descuento`). Ahora se cobra con descuento, así que el cliente pagaría menos de lo que vio. La página no está enlazada desde ningún lado (C-13).
- **`FERIADOS` sigue vacío:** el servidor valida con la misma lista que el formulario, así que los feriados se agregan en un solo lugar (`fechas.js`) y aplican a los dos.
- **`usuario_id` todavía lo decide el body** (P0-7 de la revisión, parte de seguridad).

---

## 🚦 Límite de intentos por IP (P1-8 de la revisión)

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **15/15 pruebas pasaron**

Se instaló `express-rate-limit` 8.7.0 (compatible con Express 5). Cada endpoint tiene su propio contador por IP; al superarlo responde **429** con `{ error: "<mensaje>" }` y el header `RateLimit`.

| Endpoint | Límite | Qué cuenta | Mensaje |
|----------|--------|------------|---------|
| `POST /api/login` | 10 cada 15 min | **solo los fallidos** | *"Demasiados intentos de inicio de sesión fallidos. Esperá unos minutos y volvé a intentar."* |
| `POST /api/register` | 10 cada 15 min | todos | *"Demasiados intentos de registro seguidos…"* |
| `POST /api/recuperar-password` | 10 cada 15 min | todos | *"Demasiadas solicitudes de recuperación de contraseña…"* |
| `POST /api/pedidos/:id/anular` | 10 cada 15 min | **solo los fallidos** | *"Demasiados intentos de anulación fallidos…"* |
| `POST /api/pedidos` | 5 cada 10 min | todos | *"Hiciste demasiados pedidos seguidos, esperá unos minutos."* |

**Por qué en login y anular cuentan solo los fallidos:** el objetivo es frenar a quien prueba contraseñas o PINs. Si contaran también los exitosos, un admin que anula 11 pedidos seguidos quedaría bloqueado 15 minutos. Se cambia con `soloFallidos: false` en `server.js`.

El frontend no se tocó: login, recuperar contraseña, anular y el formulario del pedido ya muestran el `error` que devuelve el servidor.

### Pruebas

| Test | Resultado |
|------|-----------|
| **Login:** 12 logins correctos seguidos → todos 200 (no cuentan); 10 con clave incorrecta → 401; el **intento 11 → 429**, aunque la clave sea correcta | ✅ |
| → el header informa el límite (`"10-in-15min"; q=10; w=900`) | ✅ |
| Los contadores son independientes: con el login bloqueado, `/api/register` sigue respondiendo | ✅ |
| **Registro:** 10 intentos → 400 (datos faltantes, no se crea ningún usuario); el **11 → 429** | ✅ |
| **Recuperar contraseña:** 10 solicitudes con un email inexistente → 404 (no se cambia ninguna contraseña ni se manda mail); la **11 → 429** | ✅ |
| **Anular:** 10 intentos con PIN incorrecto → 403; el **11 → 429**, aunque el PIN sea correcto | ✅ |
| **Pedidos:** 5 pedidos seguidos se crean; el **sexto → 429** con *"Hiciste demasiados pedidos seguidos, esperá unos minutos."* y no se guarda | ✅ |
| El resto de la API no tiene límite (30 llamadas seguidas a `GET /api/estados` → 200) | ✅ |

**Entorno:** instancia aparte en :3001; los contadores se reinician al apagarla. Se borraron los 5 pedidos de prueba.

### A tener en cuenta

- **Al publicarlo detrás de un proxy** (Nginx, Render, Railway…) hay que agregar `app.set('trust proxy', 1)`. Si no, todos los clientes llegan con la IP del proxy y comparten un mismo contador: con 5 pedidos de cualquier cliente, se bloquearía a todos. Quedó anotado en el comentario del código. No se activó ahora porque sin proxy permitiría falsear la IP con el header `X-Forwarded-For`.
- **Los contadores están en memoria:** se reinician al reiniciar el servidor, y no se comparten si algún día corren varias instancias (para eso habría que usar un store compartido como Redis).
- **Una misma conexión comparte el límite:** varias personas detrás de una misma IP pública (por ejemplo, una oficina) comparten los 5 pedidos cada 10 minutos.
- **Pruebas automáticas:** los scripts de prueba que crean más de 5 pedidos seguidos contra el mismo servidor ahora reciben 429. Hay que espaciarlos o correrlos contra una instancia recién levantada.
- **`npm audit` informa vulnerabilidades anteriores a este cambio** (no vienen de `express-rate-limit`): `nodemailer` alta (dependencia directa, se usa en recuperar contraseña), `qs` moderada y `body-parser` baja (estas dos a través de Express). Conviene actualizarlas en una tarea aparte.

---

## 👥 Roles y pantallas por rol

**Fecha:** 29 de septiembre de 2026 · **Rama:** Rodriguez  
**Resultado:** ✅ **39/39 pruebas pasaron** (35 de la prueba general y 4 de Tareas de Cocina con un pedido real)

Roles (ya existían en la base, no se corrió SQL): **1** Administrador · **2** Cocinero · **3** Repartidor · **4** Consumidor final · **5** Dueño · **6** Administrador del sistema.

| Pantalla | Roles | | Rol | Pantalla principal (al loguearse) |
|----------|-------|-|-----|-----------------------------------|
| Reportes (`admin.html`, "Inicio") | 6, 5 | | 6, 5 | Reportes (`admin.html`) |
| Consultar Pedidos | 6, 5, 1 | | 1 | **Consultar Pedidos** |
| Tareas de Cocina | 2; y 6, 5, 1 solo para ver | | 2 | Tareas de Cocina |
| Gestión de Stock · Movimientos de Stock | 6, 5, 1 | | 3 | Envíos del Día |
| Generar Receta · Asignar Cocineros · Gestión de Usuarios | 6, 5 | | 4 | Catálogo (`index.html`) |
| Envíos del Día | 6, 5, 1, 3 | | | |

**Decisión:** el "panel admin" (`admin.html`) es la pantalla de Reportes, que solo ven 6 y 5. Por eso la pantalla principal del **rol 1** es **Consultar Pedidos** (acordado con Mauri).

Esto ordena **las pantallas**. La protección de los datos en el servidor (JWT y rol en cada endpoint) queda para un paso posterior.

### Cambios

| Archivo | Cambio |
|---------|--------|
| **`roles.js` (nuevo)** | La **única tabla de permisos** del frontend: nombres de los roles, qué roles ven cada pantalla (en el orden del menú) y la pantalla principal de cada rol. La usan `guard.js`, el menú, el login y Gestión de Usuarios |
| `guard.js` | Cada pantalla se valida contra la tabla. Sin sesión → login; con un rol que no corresponde → su pantalla principal. Se sacaron el menú que se le inyectaba al cocinero (buscaba un `<nav>` en el header que ninguna página tiene, así que nunca se mostraba) y `cerrarSesionCocinero`, que solo usaba ese menú |
| 8 pantallas internas | Cargan `roles.js` antes de `guard.js` |
| `admin.html` | **Ahora carga `guard.js`** (no lo tenía). Se sacó su chequeo propio, que solo dejaba entrar al rol 1 |
| `adminSidebar.js` | El menú lateral se arma con la tabla: solo las pantallas del rol |
| `auth.js` · `login.html` | Después del login, cada rol va a su pantalla principal. Antes los roles 3, 5 y 6 recibían *"No tienes permisos de acceso"* |
| `index.html` | Si un usuario con rol 6, 5 o 1 entra al catálogo con sesión activa, va a su pantalla principal (antes solo el rol 1, y lo mandaba a `admin.html`) |
| `cocinero.js` / `cocinero.css` | **Solo lectura para 6, 5 y 1:** ven las tareas de toda la cocina (sin filtro de cocinero) y, en lugar del botón "Listo", *"Solo lectura"*. El cocinero sigue viendo solo sus platos con el botón |
| `gestionUsuarios.html` / `.js` / `.css` | Los tres `<select>` de rol (filtro, crear, editar) se arman desde `roles.js` con los 6 roles. **En crear y editar, el rol 6 aparece solo si el usuario logueado es rol 6.** Etiquetas de color para los 6 roles. Crear y editar mandan el token |
| `server.js` | **Nueva** `leerToken(req)`: lee el token sin cortar la request. `requireAuth` ahora la usa, así no hay dos verificaciones |
| `server.js` | **Nueva** `validarAsignacionDeRol(req, idRol)`: el rol tiene que existir en la tabla `roles` (400 si no), y **solo un token con rol 6 puede asignar el rol 6** (403). Se usa en crear y en editar usuario |
| `server.js` → `PUT /api/usuarios/:id` | **Además:** un usuario rol 6 solo lo puede modificar otro rol 6. Si no, un rol 5 le podría bajar el rol o cambiarle la contraseña al administrador del sistema. Si el usuario no existe, 404 (antes 500) |
| `server.js` → `POST /api/register` | **Ya forzaba el rol 4** (guarda `id_rol: 4` fijo y no lee el del body). Se agregó un comentario que lo aclara |
| Login | **Verificado sin cambios:** devuelve `usuario.id_rol` y el token incluye `{ id, rol }` |

### Pruebas

Se crearon usuarios temporales de los 6 roles (y se borraron al final).

| Test | Resultado |
|------|-----------|
| El login devuelve `id_rol` y el token incluye el mismo `rol` | ✅ |
| **Registrarse mandando `id_rol: 1` en el body → queda con rol 4** | ✅ |
| **Un rol 5 no puede crear un usuario rol 6** → 403 · sin token tampoco → 403 | ✅ |
| **Un rol 5 no puede subir a nadie a rol 6** (editar) → 403, y el rol queda igual | ✅ |
| Un rol 5 no puede modificar a un Administrador del sistema (bajarle el rol) → 403 | ✅ |
| Un rol 5 sí puede crear un Administrador (rol 1) · un rol 6 sí puede asignar el rol 6 | ✅ |
| Rol inexistente (99) → 400 *"El rol elegido no existe"* · editar un usuario inexistente → 404 | ✅ |
| Sin sesión, `admin.html` (que antes no tenía guard) manda al login | ✅ |
| **Cada rol, al loguearse, cae en su pantalla principal** (6 y 5 → Reportes · 1 → Consultar Pedidos · 2 → Tareas de Cocina · 3 → Envíos · 4 → catálogo) | ✅ (6/6) |
| **El menú muestra solo las pantallas del rol** (6 y 5: 9 · 1: 5 · 2: Tareas de Cocina · 3: Envíos del Día) | ✅ (5/5) |
| **Escribiendo la URL de cada una de las 9 pantallas**, cada rol entra a las suyas y las demás lo mandan a su pantalla principal | ✅ (6 roles × 9 pantallas) |
| Gestión de Usuarios: el filtro tiene los 6 roles; crear/editar incluyen el rol 6 para un rol 6 y no para un rol 5; la grilla muestra los nombres nuevos | ✅ |
| **Tareas de Cocina con un pedido real en preparación:** el rol 1 lo ve (tareas sin filtro), sin botón "Listo" y con *"Solo lectura"*; el cocinero del plato lo ve con el botón y pide solo sus tareas | ✅ |
| Sin errores de JavaScript | ✅ |

La primera versión de la prueba de Tareas de Cocina pasó sin probar nada (no había pedidos en preparación) y se repitió con un pedido real. En la segunda, un error de la prueba (buscaba a Mariela como cocinera del POLLO, que hoy está asignado a juan) se corrigió.

**Entorno:** instancia aparte en :3001. Se borraron los usuarios de prueba (8) y los pedidos de prueba.

### A tener en cuenta

- **La protección real de los datos todavía no está:** el guard y el menú ordenan lo que ve cada rol, pero la API sigue abierta (por ejemplo, `GET /api/usuarios` o `DELETE /api/usuarios/:id` responden sin login). Es el paso posterior, con JWT y rol en cada endpoint.
- **Borrar un Administrador del sistema:** `DELETE /api/usuarios/:id` no tiene todavía la regla "solo un rol 6 puede tocar a un rol 6". Entra con la protección de rutas.
- **El rol del menú sale del `localStorage`:** si alguien lo cambia a mano, ve más pantallas (sin datos, una vez protegida la API). Por eso la protección tiene que estar en el servidor.
- **Tareas de Cocina:** el cocinero perdió el acceso a Gestión de Stock, Generar Receta y Movimientos de Stock, que tenía antes, porque la tabla nueva solo le da Tareas de Cocina.
- **Código muerto en `index.html`:** hay un segundo login (`manejarLoginModal`) que manda al rol 1 a `index-admin.html`, una página que no existe, y usa un modal (`#loginModal`) que tampoco existe. No se tocó; se puede borrar.
- **`cerrarSesion()` de `auth.js` no borra `fg_token`** (se va al cerrar sesión, pero el token queda en el navegador hasta que vence). Conviene borrarlo en el paso de seguridad.

---

## 🔐 Fase 2A — JWT y roles en todos los endpoints (P0-1, P0-2, P0-3 y P1-11 de la revisión)

**Fecha:** 30/09/2026 · **Rama:** Rodriguez · **Entorno:** instancia aparte en :3001 (misma base). En cada prueba se crea un usuario por rol (`_test_2a_*`) y se borra al final.

### Paso 0 — Preparación (sin proteger nada)

- `requireRol(...roles)` en `server.js`: va después de `requireAuth` y responde **403** si el rol del token no está en la lista.
- `apiFetch()` en `frontend/src/js/api.js` (nuevo), incluido en las 9 pantallas internas después de `guard.js`: agrega `Authorization: Bearer <fg_token>` y, si el servidor responde **401**, borra la sesión y manda al login.
- 43 llamadas `fetch` → `apiFetch` en 9 archivos. Quedan con `fetch` solo las públicas (login, register, recuperar-password, POST /api/pedidos, /api/v1/*, /api/barrios).

| Test | Resultado |
|------|-----------|
| Cada pantalla con cada rol que la puede ver (6 roles, 26 combinaciones): sin errores JS, sin alert, sin respuestas ≥ 400 y **toda llamada no pública con token** | ✅ 26/26 |
| `apiFetch` agrega el header · con token inválido (401) borra la sesión y manda a `login.html` | ✅ 2/2 |
| Consultar Pedidos: filtros, paginación, Detalles, Pago, Anular | ✅ 10/10 |

### Grupo 1 — Usuarios (roles 6 y 5)

`GET /api/usuarios`, `POST /api/usuarios/crear`, `PUT /api/usuarios/:id`, `DELETE /api/usuarios/:id` → `requireAuth, requireRol(6, 5)`. En el DELETE, **a un rol 6 solo lo borra otro rol 6** (403 si no).

| Test | Resultado |
|------|-----------|
| Sin token: listar, crear, editar y borrar → **401** (y no se borra nada) | ✅ 5/5 |
| Roles 1, 2, 3 y 4: listar, crear, editar y borrar → **403** (y nadie crea ni borra) | ✅ 5/5 |
| Rol 5: lista, crea, edita y borra un usuario → **200** · crear un rol 6 → 403 (regla anterior) | ✅ 5/5 |
| **Rol 5 borra a un rol 6 → 403** (el usuario sigue) · rol 6 borra a otro rol 6 → 200 | ✅ 2/2 |
| Pantalla Gestión de Usuarios con rol 5 y 6: carga la lista | ✅ 2/2 |
| **Desde la pantalla**, con rol 5 y con rol 6: crear, editar y borrar un usuario | ✅ 6/6 |
| `tests/test_e2e.js` (ahora con el token de `TEST_ADMIN_USER` en todas las llamadas) | ✅ 37/37 |

`tests/test_e2e.js`: el login del admin ya estaba; ahora ese token va en todas las llamadas, y la URL se puede cambiar con `TEST_BASE_URL` (por defecto sigue siendo `http://localhost:3000`).

### Grupo 2 — Pedidos (roles 6, 5 y 1; pagado y estado también el 3)

- `GET /api/pedidos`, `PUT /:id/pago`, `PUT /:id/transferencia-confirmada`, `GET /:id/verificar-stock`, `POST /:id/anular` → `requireAuth, requireRol(6, 5, 1)`.
- `PUT /:id/pagado` → `requireRol(6, 5, 1, 3)`. `PUT /:pedidoId/estado` → `requireRol(6, 5, 1, 3)`, y **el rol 3 solo puede pasar a 4 (Entregado)**: cualquier otro `estado_id` → 403.
- **Eliminados:** `DELETE /api/pedidos/:id` (la pantalla anula en vez de borrar) y `GET /api/pedidos/:id/cocineros` (usaba la tabla `pedido_cocineros`, que ya no existe).
- `POST /api/pedidos` sigue público.
- `tests/test_e2e.js`: la limpieza borraba los pedidos de prueba con el DELETE eliminado; ahora los borra directo en la base.

| Test | Resultado |
|------|-----------|
| `POST /api/pedidos` sin token → 200 · **desde el formulario web sin sesión**: crea el pedido y abre WhatsApp, sin llamar nada que pida token | ✅ 3/3 |
| Sin token: los 7 endpoints → **401** | ✅ |
| Roles 2 y 4: los 7 endpoints → **403** · Rol 3: listar, pago, transferencia, verificar stock y anular → 403 | ✅ 3/3 |
| **Rol 3 pasa un pedido a En Preparación → 403** · ninguno de esos intentos cambió el pedido | ✅ 2/2 |
| Rol 1: `GET /api/pedidos` y verificar stock → 200 · roles 5 y 6 → 200 | ✅ 4/4 |
| `DELETE /api/pedidos/:id` → 404 (el pedido sigue) · `GET /api/pedidos/:id/cocineros` → 404 | ✅ 2/2 |
| **Consultar Pedidos con rol 1, desde la pantalla:** Pago (pasar a Mixto) · En Preparación confirmando la transferencia del Mixto · En Preparación de una Transferencia (queda pagada) · Anular con PIN | ✅ 4/4 |
| En esa pantalla: sin errores JS, sin respuestas con error, todas las llamadas con token | ✅ |
| Recorrido de todas las pantallas con los 6 roles | ✅ 26/26 |
| `tests/test_e2e.js` | ✅ 37/37 |

Los pedidos de prueba (`_TEST_2A_`) se borraron. Ninguno llegó a Listo ni a Entregado, así que no se descontó stock.

### Grupo 3 — Stock, movimientos e insumos

- `GET /api/insumos`, `GET /api/categorias-insumos`, `GET/POST/DELETE /api/movimientos-stock` → `requireAuth, requireRol(6, 5, 1)`.
- `POST /api/insumos`, `PUT /api/insumos/:id`, `DELETE /api/insumos/:id` → `requireAuth, requireRol(6, 5)` (el acceso del rol 1 con PIN va en un paso posterior).
- Todo sobre un insumo de prueba (`_TEST_2A_INSUMO`, borrado al final con sus movimientos): el stock real no se tocó.

| Test | Resultado |
|------|-----------|
| Sin token: los 8 endpoints → **401** | ✅ |
| Roles 2, 3 y 4: los 8 endpoints → **403** · ninguno de esos intentos cambió el insumo ni sus movimientos | ✅ 4/4 |
| **Rol 1** lee insumos, categorías y movimientos → 200 · **registra un movimiento → 200** (el stock sube) · lo borra → 200 (el stock vuelve) | ✅ 5/5 |
| **Rol 1 edita, crea o borra un insumo → 403** (el insumo queda igual) | ✅ |
| **Rol 5 edita un insumo → 200** · rol 6 también · rol 5 crea el insumo de prueba → 200 | ✅ 3/3 |
| Pantalla Movimientos de Stock con rol 1: registrar una entrada y borrarla | ✅ 2/2 |
| Pantalla Gestión de Stock con rol 1: la lista carga; al guardar una edición el servidor responde 403 y la pantalla muestra *"Error al guardar. Intentá de nuevo."* (no se rompe) | ✅ |
| Pantalla Gestión de Stock con rol 5: edita el insumo | ✅ |
| Recorrido de todas las pantallas con los 6 roles | ✅ 26/26 |
| `tests/test_e2e.js` | ✅ 37/37 |

En la primera corrida fallaron 4 pruebas de pantalla por errores de la prueba, no del sistema: el insumo de prueba usaba la unidad "kg", que la pantalla no ofrece (solo g, ml y u), y un valor de stock esperado no contaba una edición anterior. Se corrigieron y se repitió todo.

**A tener en cuenta:** el rol 1 sigue viendo los botones Editar, Eliminar y "Nuevo insumo" en Gestión de Stock. Si los usa, el servidor responde 403 y la pantalla muestra un error genérico. Se resuelve con el paso del PIN.

### Grupo 4 — Recetas, productos, cocineros, planes y reportes (roles 6 y 5)

- `GET/POST /api/recetas`, `DELETE /api/recetas/:idProducto`, `POST /api/productos/con-receta`, `POST /api/productos/:id/imagen`, `GET /api/planes/:id/siguiente-codigo`, `GET /api/cocineros`, `GET /api/productos/cocineros`, `PUT /api/productos/:id/cocinero`, `GET /api/planes`, `GET /api/planes/cocineros`, `PUT /api/planes/:id/cocinero` y los 5 `GET /api/reportes/*` → `requireAuth, requireRol(6, 5)`.
- `POST /api/productos/con-receta`: antes pedía sesión solo si venía un cocinero (`requireAuthSiHayCocinero`, que se borró). Ahora la pide siempre.
- **Eliminado:** `GET /api/productos-test` (endpoint de prueba que nadie usaba).

| Test | Resultado |
|------|-----------|
| Sin token: los 17 endpoints → **401** | ✅ |
| **Roles 1**, 2, 3 y 4: los 17 endpoints → **403** · ninguno de esos intentos creó, cambió ni borró nada | ✅ 5/5 |
| Rol 5: los 11 GET → 200 · crea un plato con receta, edita la receta, asigna cocinero al plato, guarda el cocinero del plan (el mismo que tenía), borra la receta → **200** | ✅ 6/6 |
| Rol 5, imagen: pasa la autorización (sin imagen → 400 de validación, no 401/403) · rol 6: los 11 GET → 200 | ✅ 2/2 |
| **Generar Receta** con rol 5 y 6, desde la pantalla: crear un plato (categoría, plan, código automático, insumo), editarlo y borrarlo, sin errores y todo con token | ✅ 6/6 |
| **Asignar Cocineros** con rol 5 y 6: asignar y desasignar el cocinero de un plato | ✅ 2/2 |
| **Reportes** con rol 5 y 6: indicadores y 4 gráficos | ✅ 2/2 |
| Recorrido de todas las pantallas con los 6 roles | ✅ 26/26 |
| `tests/test_e2e.js` | ✅ 37/37 |

Los platos de prueba (`_TEST_2A_PLATO_*`) se borraron. El cocinero del plan 1 se guardó con el mismo valor que tenía, así que no cambió.

### Grupo 5 — Cocina y envíos

- `GET /api/cocina/tareas` y `PUT /api/pedidos/:id/listo-cocinero` → `requireAuth, requireRol(2, 6, 5, 1)`. **Con rol 2 el cocinero sale del token** (`req.usuario.id`): se ignora el `cocinero_id` de la URL.
- `GET /api/envios` → `requireAuth, requireRol(6, 5, 1, 3)`.
- Datos de prueba: un plato `_TEST_2A_PLATO_COCINA` del cocinero de prueba, **sin receta**, para que "Listo" y "Entregado" no descuenten stock real, y 3 pedidos `_TEST_2A_`. Se borró todo al final.

| Test | Resultado |
|------|-----------|
| Sin token: tareas, listo-cocinero y envíos → **401** | ✅ |
| **Cocinero:** ve el pedido que tiene un plato suyo y no el que es solo de otro cocinero · dentro del pedido, su plato es `es_mio` y el ajeno no | ✅ 2/2 |
| **Cocinero pidiendo `?cocinero_id=` de OTRO cocinero → igual ve solo lo suyo** | ✅ |
| Rol 1 ve todas las tareas · roles 5 y 6 → 200 · roles 3 y 4: tareas y listo-cocinero → 403 | ✅ 4/4 |
| **Pantalla Tareas de Cocina (cocinero):** ve solo su pedido; marca "Listo" → su plato queda listo, el ajeno no, y el pedido sigue En Preparación | ✅ 2/2 |
| **Repartidor:** `GET /api/envios` → 200 · roles 1, 5 y 6 → 200 · **cocinero → 403** · consumidor → 403 · **repartidor en `/api/pedidos` → 403** | ✅ 7/7 |
| **Repartidor pasa el pedido a Cancelado, Listo, En Preparación o Registrado → 403** (el pedido no cambia) | ✅ |
| **Pantalla Envíos (repartidor):** ve el envío, lo marca "Cobrado" (200) y lo pasa a **Entregado (200)**, sin descontar stock | ✅ 3/3 |
| Pantalla Envíos: el repartidor intenta volverlo a Listo → 403, el pedido sigue Entregado, sin errores JS | ✅ |
| Recorrido de todas las pantallas con los 6 roles | ✅ 26/26 |
| `tests/test_e2e.js` | ✅ 37/37 |

**A tener en cuenta:** en Envíos, el select de estado le muestra al repartidor todos los estados. Si elige uno que no sea Entregado, el servidor responde 403 y la pantalla muestra *"No se pudo actualizar el estado. Intentá de nuevo."*. Se podría mostrar solo "Entregado" para el rol 3; no se hizo porque en este paso no se cambia la lógica.

### Grupo 6 — Auxiliares y barrido final

- `GET /api/estados` → `requireAuth, requireRol(6, 5, 1, 3)` (lo usan Consultar Pedidos y Envíos). `GET /api/categorias-insumos` ya había quedado en el Grupo 3, y `GET /api/cocineros` y `GET /api/planes` en el Grupo 4.
- `cerrarSesion()` (`auth.js`) ahora borra también `fg_token`.

| Test | Resultado |
|------|-----------|
| **Las 52 rutas de `server.js`** (leídas del código): 12 son de la lista de públicas y 40 tienen `requireAuth` + `requireRol` con exactamente los roles de la matriz. Ninguna queda abierta fuera de la lista | ✅ |
| No hay `app.use()` que exponga rutas de API (solo cors, express.json y los archivos estáticos) · los endpoints eliminados ya no están | ✅ 2/2 |
| **En vivo: 40 endpoints × (sin token + 6 roles) = 229 llamadas.** Sin token → 401, rol fuera de la lista → 403, roles de la lista en los GET → pasan | ✅ |
| Públicos sin token: catálogo (`/api/v1/*`) y barrios → 200 · login → 200 · recuperar-password no pide sesión | ✅ 3/3 |
| **`POST /api/register` con `id_rol: 1` → queda con rol 4** | ✅ |
| **Recorrido en el navegador con los 6 roles:** cada rol usa sus pantallas sin errores y con token en todo; las 9 pantallas probadas con cada rol, y las que no le corresponden lo mandan a su pantalla principal | ✅ 6/6 |
| **Un rol 1 que se pone `usuario_rol=6` a mano** entra a Gestión de Usuarios, pero la API responde 403 y no ve ningún usuario | ✅ |
| `cerrarSesion()` en `index.html` y `admin.html` borra `fg_token` · el botón "Cerrar sesión" del menú lateral también | ✅ 3/3 |

En la primera corrida falló una prueba de la prueba: se pidió `/api/v1/productos/1`, que es un producto inactivo, y el catálogo responde 404 para los inactivos (es su lógica). Se repitió con un producto activo → 200.

### Regresión final (servidor con los 6 grupos aplicados)

| Prueba | Resultado |
|------|-----------|
| Grupo 1 (API + pantalla) | ✅ 19/19 · 6/6 |
| Grupo 2 (API + pedido web) | ✅ 18/18 · 2/2 |
| Grupo 3 | ✅ 18/18 |
| Grupo 4 | ✅ 24/24 |
| Grupo 5 | ✅ 22/22 |
| Grupo 6 | ✅ 18/18 |
| `apiFetch` · Consultar Pedidos funcional | ✅ 2/2 · 10/10 |
| `tests/test_e2e.js` | ✅ 37/37 |

**Datos de prueba:** al final no quedó ningún usuario, pedido, plato, insumo ni movimiento de prueba (`_test_2a_*` / `_TEST_2A_*`). No se descontó stock real.

**Para correr el E2E contra el servidor protegido:** `node tests/test_e2e.js` (usa `TEST_ADMIN_USER` y `TEST_ADMIN_PASS` del `.env`). El servidor de `:3000` tiene que reiniciarse para tomar los cambios.

### A tener en cuenta

- **El servidor de :3000 sigue con el código viejo** hasta que se reinicie. Mientras tanto, la API sigue abierta ahí.
- **Rate limit en las pruebas:** `limitePedidos` (5 cada 10 min) y `limiteAnular` cuentan también los intentos rechazados por 401/403, porque van antes que `requireAuth`. En uso normal no afecta.
- **Envíos:** el repartidor ve todos los estados en el select, pero solo puede guardar Entregado (ver Grupo 5).
- **Gestión de Stock con rol 1:** ve los botones de alta, edición y baja, pero reciben 403 hasta el paso del PIN (ver Grupo 3).
