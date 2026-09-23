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
| Login con `nombre_usuario` "mauro_admin" + contraseña "123" | ✅ Token JWT generado |
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

El hash almacenado en la base de datos (`$2b$10$DaILwr26Drlge22RE5a0eeueM357/UPHOf7B8CEYR2rFZlSUMhoRe`) corresponde a la contraseña **`123`**, **NO** a `123456` como se pensaba originalmente. Esto fue verificado con `bcrypt.compare()`.

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
| `POST /api/login` (mauro_admin / 123) | ✅ 200 — devuelve `token` y `usuario` |

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
