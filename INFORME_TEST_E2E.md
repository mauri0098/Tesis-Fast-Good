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

---

## 🔒 Anulación de pedidos con PIN (reemplaza al botón Eliminar)

**Fecha:** 24 de septiembre de 2026  
**Resultado:** ✅ **31/31 pruebas pasaron** (10 de API + 21 de interfaz)

En Consultar Pedidos, el botón **Eliminar** borraba el pedido de la base sin pedir ninguna autorización. Ahora ese botón se llama **Anular**: abre un modal que pide un PIN, el PIN se valida en el servidor y el pedido **no se borra**, solo pasa a estado 5 (Cancelado).

### Cambios

| Archivo | Cambio |
|---------|--------|
| `.env` | `ADMIN_PIN=1234` (el `.env` está en `.gitignore`: hay que agregarlo a mano en cada máquina) |
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
| PIN `12345` | ✅ 403, estado sin cambios |
| ID `abc` | ✅ 400 |
| Pedido inexistente | ✅ 404 |
| PIN `1234` | ✅ 200, estado = 5 |
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
| `POST /api/login` mauro_admin / 123 | ✅ 200 con token. Con contraseña incorrecta devuelve 401 |

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
