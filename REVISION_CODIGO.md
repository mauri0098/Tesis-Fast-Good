# Revisión de código — Fast Good

**Fecha:** 28 de septiembre de 2026 · **Alcance:** `server.js` (2.332 líneas) y los 22 archivos de `frontend/src/js/` (≈6.100 líneas). También se miraron los HTML donde hacía falta y los archivos sueltos de la raíz del repo.
**Método:** lectura completa de `server.js`, lectura dirigida del frontend, cruce de cada endpoint con las llamadas del frontend y consultas de solo lectura a la base para confirmar hallazgos. No se modificó nada.

> Parte del código revisado (cocinero por plato, "listo" por cocinero, verificación de stock, cocinero en recetas y pago Mixto) lo escribí yo en sesiones anteriores. Lo revisé con el mismo criterio que el resto; donde tiene problemas, figuran abajo.

## Resumen en cinco líneas

1. Los flujos principales **funcionan**; se probaron de punta a punta en las sesiones anteriores.
2. **Hay bugs reales que hoy dan resultados incorrectos:** el dashboard de reportes ignora el filtro de fechas y muestra datos inventados, los precios con descuento no coinciden entre el total y los renglones, y "hoy" se calcula en UTC.
3. **Integridad de datos:** ninguna operación de varios pasos es atómica. El stock se actualiza con "leer, calcular, escribir", que pierde actualizaciones si hay dos operaciones simultáneas.
4. **Para producción:** el frontend tiene `http://localhost:3000` escrito en 7 archivos, así que en un servidor real esas pantallas no andan.
5. **Seguridad:** hoy **cualquier persona sin login puede crearse un usuario administrador**. Es lo primero a resolver.

---

# PARTE 1 — CALIDAD DEL CÓDIGO

## Tabla de hallazgos

| ID | Hallazgo | Gravedad |
|----|----------|----------|
| C-01 | El total del pedido lo calcula el navegador y el servidor lo guarda tal cual | **Alta** |
| C-02 | Descuentos: el total, los renglones y las dos páginas del catálogo usan precios distintos | **Alta** |
| C-03 | Stock: actualizaciones no atómicas, pérdida de actualizaciones e idempotencia frágil | **Alta** |
| C-04 | Reportes: el filtro de fechas no se aplica a los pedidos | **Alta** |
| C-05 | Reportes: datos aleatorios cuando no hay datos | **Alta** |
| C-06 | `http://localhost:3000` escrito en 7 archivos del frontend | **Alta** |
| C-07 | Operaciones de dos pasos sin rollback (pedido, receta, producto) | **Alta** |
| C-08 | "Hoy" calculado en UTC: Envíos y reportes cambian de día a las 21 h | Media |
| C-09 | Recuperar contraseña: se pierde el acceso si falla el mail y el texto del mail es falso | Media |
| C-10 | Login por `nombre` (no es único) y con `ilike` (acepta comodines) | Media |
| C-11 | Errores de Supabase que se ignoran y devuelven "0" o "vacío" como si fueran datos | Media |
| C-12 | Código duplicado (código de plato, avisos, formato, manejo de errores) | Media |
| C-13 | Código muerto: 11 endpoints, una página entera y archivos sueltos | Media |
| C-14 | Inconsistencias de API (rutas, parámetros, formatos, números mágicos) | Media |
| C-15 | Pedidos públicos asignados a un usuario administrador real | Media |
| C-16 | Dos formas de cambiar el stock: una deja registro y otra no | Media |
| C-17 | Funciones y archivos demasiado grandes | Baja |
| C-18 | Detalles varios (logs de depuración, orden del archivo, botón que se rompe con apóstrofos) | Baja |

---

## C-01 · El total del pedido lo manda el navegador — **Alta**

**Dónde:** `server.js:658-731` (`POST /api/pedidos`) y `frontend/src/js/formulario.js:249` (`calcularTotalPedido`).

**Qué pasa:** el servidor busca el precio real de cada producto para `precio_unitario` (`server.js:712-719`), pero guarda `pedidos.total` tal como viene en el body. Ese total sale del carrito guardado en `localStorage`. Si el carrito quedó con un precio viejo (por ejemplo, el admin cambió el precio ayer), el pedido se guarda con el total viejo. Y cualquiera puede mandar `total: 1`. El total es lo que usan el cobro, el pago Mixto (que valida contra `total`) y los reportes de ingresos.

**Qué haría:** que el servidor calcule el total con los precios de la base (con descuento, ver C-02) e ignore el del cliente. Si el cliente manda uno y no coincide, se le avisa "los precios cambiaron".

## C-02 · Descuentos: tres precios distintos para el mismo plato — **Alta**

**Dónde:**
- `frontend/src/js/index.js:54-57` y `:128`: la página de inicio mete en el carrito el precio **con** descuento.
- `server.js:712-719`: `precio_unitario` se guarda **sin** descuento.
- `server.js:512-535`: `/api/v1/productos*` ni siquiera devuelve `descuento`, así que `viandasSaludables.html` (vía `productos.js`) carga el precio **sin** descuento.

**Qué pasa:** en un pedido con descuento, `total` ≠ suma de `cantidad × precio_unitario`. "Productos más vendidos" (`server.js:1866`) calcula los ingresos con `precio_unitario`, así que los infla. Y según la página desde la que se compra, el cliente paga distinto.

**Qué haría:** una sola función en el servidor, `precioFinal(producto)`, que aplique el descuento; usarla para `precio_unitario` y para el total. El front solo muestra.

## C-03 · Stock: actualizaciones no atómicas — **Alta**

**Dónde:**
- `server.js:164-233` `descontarStockPedido`: actualiza cada insumo con un `UPDATE` separado (línea 191) y **después** inserta los movimientos (línea 219).
- `server.js:1687-1751` `POST /api/movimientos-stock`: inserta el movimiento y después actualiza el stock.
- `server.js:1754-1804` `DELETE /api/movimientos-stock/:id`: borra el movimiento y después revierte el stock.

**Qué pasa:**
1. **Actualización perdida:** todas leen `stock_actual`, calculan en JavaScript y escriben el resultado. Si dos operaciones sobre el mismo insumo se cruzan (dos cocineros cierran pedidos, o el admin carga una entrada mientras se descuenta un pedido), una pisa a la otra y el stock queda mal sin que nadie se entere.
2. **Fallos a mitad de camino:** si en `descontarStockPedido` falla el tercer `UPDATE`, los dos primeros insumos ya se descontaron y no hay movimientos registrados. Como la idempotencia mira los movimientos, al reintentar **descuenta otra vez** esos dos insumos.
3. **Idempotencia por texto** (`server.js:166-172`): busca `ilike '%pedido #100%'`. Cuando existan los pedidos #1000 a #1009, el #100 va a creer que ya descontó. Además, si alguien borra desde Movimientos de Stock un movimiento "Consumo por producción pedido #X", el pedido vuelve a quedar "sin descontar" y se descuenta de nuevo al pasar a 4.

**Qué haría:** pasar estas operaciones a funciones de Postgres (`supabase.rpc('descontar_stock_pedido', ...)`), que corren en una transacción, con `UPDATE insumos SET stock_actual = stock_actual - $1` (atómico) y un `CHECK (stock_actual >= 0)`. Para la idempotencia, una columna `movimientos_stock.id_pedido` (o `pedidos.stock_descontado boolean`) en lugar de buscar texto.

## C-04 · Reportes: el filtro de fechas no filtra — **Alta**

**Dónde:** `frontend/src/js/reportes.js:52` llama a `/api/pedidos?desde=...&hasta=...`, pero `server.js:733-774` (`GET /api/pedidos`) no lee `req.query`.

**Qué pasa:** los KPI (total de pedidos, % entregados, barrio top) y los gráficos de evolución, estados y barrios muestran **todos los pedidos de la historia**, aunque el admin elija un mes. Solo "top productos" respeta el filtro, así que en el mismo panel conviven números de períodos distintos.

**Qué haría:** que `GET /api/pedidos` acepte `desde` y `hasta` (como ya hacen los endpoints de reportes, `server.js:1827-1828`), o crear `/api/reportes/pedidos`.

## C-05 · Reportes: datos inventados — **Alta**

**Dónde:** `frontend/src/js/reportes.js:119-126`, `:178` y `:235` (bloques `// ── MOCK DATA ──`).

**Qué pasa:** si el período no tiene pedidos, los gráficos muestran valores **aleatorios** (`Math.random()`) y barrios de ejemplo, sin ningún aviso. En producción, el dueño vería ventas que no existen.

**Qué haría:** borrar los bloques de datos de ejemplo y mostrar "Sin datos para el período".

## C-06 · `localhost:3000` escrito en el código — **Alta (para producción)**

**Dónde:**
- `ListarPedidos.js` (8 veces) y `stock.js` (6).
- `AsignarCocinero.js` (3) y `formulario.js` (2).
- `Envios.js:5`, `MovimientosStock.js:5` y `reportes.js:5` (`const API = 'http://localhost:3000'`).

**Qué pasa:** en un servidor real, esas pantallas llaman a `localhost` **de la computadora del usuario** y no funcionan. Además, el proyecto tiene tres estilos distintos: URL completa, constante `API` y ruta relativa (`generarReceta.js`, `cocinero.js`, `gestionUsuarios.js`, `auth.js`).

**Qué haría:** usar siempre rutas relativas (`fetch('/api/...')`). El frontend lo sirve el mismo Express, así que no hace falta el dominio.

## C-07 · Operaciones de dos pasos sin rollback — **Alta**

| Dónde | Qué puede quedar a medias |
|-------|---------------------------|
| `server.js:678-729` `POST /api/pedidos` | Se inserta el pedido; si falla el insert de `pedido_detalles` (línea 722), queda un **pedido sin platos**. Ese pedido pasa la verificación de stock (no consume nada) y le llega a la cocina vacío |
| `server.js:1513-1558` `POST /api/recetas` | Actualiza precio, **borra la receta** (1534) y después inserta la nueva (1542). Si falla el insert, el producto queda **sin receta**: no descuenta stock y desaparece de Generar Receta (que solo lista productos con receta) |
| `server.js:2083-2088` `POST /api/productos/con-receta` | El rollback manual (`delete` del producto) no revisa su propio error. El comentario de la línea 2003 dice "de forma atómica" y no lo es |
| `server.js:1786-1798` `DELETE /api/movimientos-stock/:id` | Borra el movimiento; si falla la reversión del stock, el stock queda mal y sin registro |
| `generarReceta.js` (editar receta + cocinero) | Guarda la receta y después el cocinero con otro request. Si falla el segundo, se avisa (diseño conocido) |

**Qué haría:** lo mismo que en C-03, funciones de Postgres con transacción (`crear_pedido`, `reemplazar_receta`, `crear_producto_con_receta`). Es el cambio con más impacto en integridad.

## C-08 · "Hoy" en UTC — **Media**

**Dónde:**
- `Envios.js:227` (`new Date().toISOString().slice(0, 10)`).
- `reportes.js:33-34`.
- `ListarPedidos.js:70` (`new Date(pedido.fecha_entrega)`).

**Qué pasa:** `toISOString()` devuelve la fecha en UTC, así que en Argentina a partir de las 21 h "hoy" pasa a ser mañana. **Envíos del Día**, abierto a la noche, muestra los envíos del día siguiente. Al revés, `new Date('2026-09-28')` se interpreta como medianoche UTC y en la grilla de Consultar Pedidos la fecha de entrega aparece **un día antes** (se vio en las pruebas: el 28/09 aparece como 27/09).

**Qué haría:** una función `hoyLocal()` que arme `YYYY-MM-DD` con `getFullYear/getMonth/getDate`, y formatear las fechas de solo día agregando `'T00:00:00'` (como ya hace `Envios.js:627`).

## C-09 · Recuperar contraseña — **Media** (también figura en seguridad)

**Dónde:** `server.js:2242-2325`.

**Qué pasa:** la contraseña se reemplaza **antes** de mandar el mail (2272). Si Gmail falla, el usuario queda con una contraseña que nunca recibió (la respuesta de 2323 lo reconoce). El mail dice *"Tu contraseña anterior sigue siendo válida solo si no hiciste esta solicitud"* (2310), y es falso: la anterior ya se borró. La clave se genera con `Math.random()` (2263), que no es criptográficamente seguro.

**Qué haría:** ver S-06. Es un flujo para rehacer: token de un solo uso con vencimiento y la contraseña se cambia recién cuando el usuario usa el link.

## C-10 · Login — **Media**

**Dónde:** `server.js:264-306`.

**Qué pasa:**
- **Tres consultas en cascada:** por `nombre_usuario`, después por `email` y después por `nombre`. `nombre` no es único (hay dos "oscar" en la tabla), así que se toma el primero que aparezca.
- **Comodines:** `ilike` interpreta `%` y `_`. Con `%` como usuario se prueba la contraseña contra "el primer usuario de la tabla".
- **Errores ignorados:** si una consulta falla, se registra y se sigue como si no existiera.
- **Doble nombre de columna:** tolera `contrasena` y `contraseña` (314), resto de una migración vieja.

**Qué haría:** login solo por `nombre_usuario` o `email`, con coincidencia exacta sin distinguir mayúsculas (guardar en minúsculas y usar `eq`). Si la consulta falla, responder 500. Borrar el soporte a `contraseña`.

## C-11 · Errores que se tragan en silencio — **Media**

| Dónde | Qué pasa |
|-------|----------|
| `server.js:1817` `/api/reportes/resumen` | `const [{ data: pedidos }, { data: movs }] = ...` descarta `error`: si Supabase falla, informa **ingresos = 0** como si fuera real (hoy no lo usa nadie, ver C-13) |
| `server.js:1855` `/productos-mas-vendidos` | El error de la primera consulta se ignora: si falla, devuelve `[]` ("no se vendió nada") |
| `server.js:1190` `/api/planes/cocineros` | Si falla la consulta de usuarios, devuelve los planes sin nombres de cocinero |
| `server.js:368` y `:2123` (registro y alta de usuario) | Si falla el chequeo de email duplicado, se crea igual |
| `server.js:275-305` (login) | Ver C-10 |
| `ListarPedidos.js:241` `verificarStockPedido` (front) | `catch { return null }` es **a propósito** (el servidor vuelve a verificar), y está comentado. Está bien así |

El resto del servidor revisa `error` de forma bastante consistente, y los `.catch` del frontend casi siempre muestran algo al usuario.

## C-12 · Código duplicado — **Media**

| Qué | Dónde | Qué haría |
|-----|-------|-----------|
| Cálculo del próximo `codigo_plato` | `server.js:1967-2001` (`/siguiente-codigo`) y `server.js:2021-2046` (dentro de `con-receta`), idénticos | Una función `siguienteCodigoPlato(idPlan)`. Además, dos altas simultáneas pueden obtener el mismo código (no hay restricción `UNIQUE`) |
| Avisos flotantes (toasts) | **5 versiones:** `mostrarAlerta`/`mostrarExito` (ListarPedidos), `mostrarAviso` (cocinero.js), `mostrarAviso` (Envios.js), `mostrarToast` (stock.js) y `mostrarError` en 4 archivos con firmas distintas | Un `avisos.js` compartido, cargado en todas las páginas de administración |
| Formateo de fechas y precios | `formatFecha` en Envios.js y cocinero.js, `formatPrecio` en ListarPedidos y formatos armados a mano en varios lugares | Un `formato.js` compartido |
| Nombre completo del usuario | `[nombre, apellido].filter(Boolean).join(' ')` en server.js, AsignarCocinero.js y generarReceta.js | Menor. Puede quedar |
| Carrito | `carrito.js` delega en `funciones.js` (`gestionarCarrito`) y `formulario.js` recalcula el total por su cuenta (`calcularTotalPedido`) | Una sola función de total (y que el servidor sea la fuente de verdad, C-01) |

## C-13 · Código muerto — **Media**

**Endpoints que ningún archivo del frontend llama:**

| Endpoint | Línea | Comentario |
|----------|-------|------------|
| `GET /api/productos-test` | 406 | Resto de pruebas. Borrar |
| `GET /api/pedidos/:id/cocineros` | 631 | Usa la tabla `pedido_cocineros`, reemplazada por la asignación por plato. Borrar (y la tabla, si no tiene datos) |
| `GET /api/planes/cocineros` | 1182 | La pantalla vieja de asignación por plan |
| `PUT /api/planes/:id/cocinero` | 1206 | Define el cocinero "de respaldo" del plan, pero **ninguna pantalla lo usa**: hoy solo se cambia desde la base. Decidir: pantalla o borrar |
| `GET /api/planes` | 1956 | Sin uso |
| `DELETE /api/pedidos/:id` | 1141 | La UI anula (estado 5) en vez de borrar. **Peligroso** además de muerto (S-03) |
| `GET /api/reportes/resumen`, `/ingresos-por-dia`, `/gastos-por-dia`, `/stock-movimientos` | 1810-1887 | El dashboard calcula todo en el navegador con `/api/pedidos`. Además, `/stock-movimientos` suma cantidades de unidades distintas (g + kg + u), un número sin sentido |
| `GET /api/v1/productos`, `/v1/productos/:id`, `/v1/planes/:id/productos` | 498-535 | Solo los usa `productos.js`, de una página que no se enlaza desde ningún lado (abajo) |

**Frontend muerto:**
- **Página huérfana:** `pages/viandasSaludables.html` no se enlaza desde ningún HTML ni JS. Arrastra con ella `productos.js` y `viandasSaludables.js`, y además cobra sin descuento (C-02).
- **Campo que nunca se completa:** `formulario.js:258` manda `observaciones_plato`, pero el carrito nunca lo completa y el servidor tampoco lo guarda. Hay 0 renglones con ese dato en la base.

**Archivos sueltos en la raíz del repo:**

| Archivo | Qué hacer |
|---------|-----------|
| `C:Temppedidos_debug.json` | **Borrar ya: tiene datos reales de clientes** (nombres, teléfonos, emails) y está versionado en git (ver S-10) |
| `test_hash.js` | Borrar |
| `migrarPasswords.js` | Migración de una sola vez, ya ejecutada. Mover a `scripts/` o borrar |
| `test_e2e.js` | Útil, pero tiene la contraseña del admin escrita. Moverlo a `tests/` y leer las credenciales de `.env` |
| `INSTRUCCIONES_LOGIN.md` | **Desactualizado:** explica guardar contraseñas en texto plano en una columna `contraseña`. Borrar o reescribir |
| `node_modules/` | **1.285 archivos versionados en git** aunque `.gitignore` los excluye (se subieron antes). `git rm -r --cached node_modules` |

## C-14 · Inconsistencias — **Media**

- **Rutas:** conviven `/api/v1/...` y `/api/...`. `POST /api/usuarios/crear` tiene un verbo en la URL, mientras que `POST /api/insumos` no. El mismo parámetro se llama `:id`, `:pedidoId` (`/estado`) o `:idProducto` (`/recetas`).
- **Validación de ids:** unos endpoints hacen `parseInt` y responden 400; otros pasan el texto crudo a Supabase y responden 500 si no es un número (`/pagado`, `/estado`, `DELETE /pedidos/:id`, insumos, usuarios, `/productos/:id/imagen`).
- **"No encontrado":** unos usan `.maybeSingle()` y responden 404; otros usan `.single()` y responden 500 (por ejemplo `PUT /api/insumos/:id`), o convierten cualquier error en 404 (`POST /api/movimientos-stock`, línea 1701).
- **Respuestas:** los listados devuelven un array suelto, las escrituras `{ mensaje, <objeto> }` y `verificar-stock` `{ ok }`. Los errores sí son consistentes (`{ error }`), pero muchos devuelven `error.message` de Postgres tal cual al navegador.
- **Nombres del estado 1:** la base dice "Registrado", `reportes.js:18` dice "Pendiente" y la grilla usa "PENDIENTE" para el **pago**. Hay dos significados distintos para la misma palabra.
- **Números mágicos:** los estados (1 a 5) y los roles (1, 2, 4) están escritos como números en servidor y frontend (`[3, 4].includes(...)`, `id_rol === 2`, `id_estado !== 2`). Una constante `ESTADOS = { REGISTRADO: 1, ... }` compartida los haría legibles.

## C-15 · Pedidos públicos asignados a un admin — **Media**

**Dónde:** `server.js:675`: `const finalUserId = usuario_id || 'd9b1ae00-…'; // "Consumidor Final"`.

**Qué pasa:** ese UUID es el usuario **Marcos Medina Carranza, rol 1 (admin)**. Todos los pedidos sin login quedan a nombre de un administrador real. Si ese usuario se borra, la FK rompe los pedidos públicos o los arrastra, según cómo esté definida.

**Qué haría:** crear un usuario "Consumidor Final" sin permisos (o permitir `id_usuario = NULL`) y leer su id de `.env`.

## C-16 · Dos formas de cambiar el stock — **Media**

**Dónde:** `PUT /api/insumos/:id` (`server.js:1379-1409`) acepta `stock_actual` y lo escribe directo.

**Qué pasa:** el resto del sistema cambia el stock con movimientos que quedan registrados (`movimientos_stock`). Por este endpoint el stock cambia **sin dejar rastro**, y los reportes de movimientos y la trazabilidad dejan de cerrar.

**Qué haría:** sacar `stock_actual` de ese endpoint. Los ajustes van por un movimiento de tipo "ajuste" con su motivo.

## C-17 · Funciones y archivos grandes — **Baja**

- **`server.js` hace de todo:** 2.332 líneas con autenticación, catálogo, pedidos, stock, recetas, reportes, envíos, usuarios y mails. Para mantenerlo conviene dividirlo en `routes/pedidos.js`, `routes/stock.js`, etc., y dejar la lógica compartida (`cambiarEstadoPedido`, stock) en `services/`.
- **Funciones más largas:** `POST /api/login` (116 líneas y tres consultas), `POST /api/recuperar-password` (91, con el HTML del mail adentro; conviene pasarlo a una plantilla), `POST /api/productos/con-receta` (89) y `PUT /api/pedidos/:id/pago` (84; larga pero clara).
- **Archivos del frontend:** `ListarPedidos.js` (736 líneas) maneja la grilla y cinco modales; `generarReceta.js` tiene 921.

## C-18 · Detalles — **Baja**

- **Logs de depuración:** `server.js:107` (`[DEBUG RECETA]`) y `:143` (`[STOCK DEBUG]`) escriben una línea por insumo y por pedido. El login escribe en consola el usuario de cada intento (256-257), un dato personal en los logs.
- **Orden del archivo:** `POST /api/recuperar-password` (2242) está definido **después** de `express.static` y del título "SERVER". Funciona, pero confunde. `PORT = 3000` está fijo (2327), y convendría `process.env.PORT`.
- **Botón que se rompe:** en `MovimientosStock.js:172`, el nombre del insumo se mete entre comillas simples dentro de un `onclick`. Un insumo llamado *Dulce d'leche* rompe el botón Eliminar.
- **Código de la primera etapa:** comentarios con errores de tipeo ("credeceales", línea 1) y comentarios "👉" en el código, que conviven con código más prolijo de etapas posteriores.

### Lo que está bien

Para ser justos, hay partes sólidas:
- `cambiarEstadoPedido` centraliza los cambios de estado.
- `PUT /pago` trabaja en centavos y valida contra el total de la base.
- La anulación compara el PIN en tiempo constante.
- El código más nuevo usa `textContent` para los datos de usuarios.
- Casi todos los errores responden con el mismo formato `{ error }`.
- Hay pruebas de punta a punta documentadas.

---

# PARTE 2 — SEGURIDAD (lo que falta implementar)

Ordenado por prioridad. **P0** = antes de exponerlo a internet; **P1** = antes de tener usuarios reales; **P2** = para mejorar.

### P0-1 · Cualquiera puede crear un administrador o cambiarle la contraseña

- **Qué es:** `POST /api/usuarios/crear` (2114), `PUT /api/usuarios/:id` (2165), `DELETE /api/usuarios/:id` (2207) y `GET /api/usuarios` (2101) **no piden login**. El alta acepta cualquier `id_rol`.
- **Por qué importa:** con un solo request anónimo alguien se crea un usuario con `id_rol: 1`, inicia sesión y controla todo. O le cambia la contraseña al admin. Es una toma total del sistema.
- **Cómo se resuelve:** `requireAuth` + un middleware nuevo `requireRol(1)` en los cuatro.

### P0-2 · No existe control de rol en ningún endpoint

- **Qué es:** el JWT trae `rol`, pero `req.usuario.rol` **no se lee en ninguna parte** del servidor. Además, `POST /api/register` (359) es público y entrega usuarios de rol 4 que pueden iniciar sesión, así que `requireAuth` por sí solo no alcanza: **cualquier cliente registrado** pasa `requireAuth` y puede anular pedidos (si sabe el PIN), confirmar transferencias, cambiar el método de pago, asignar cocineros o dar de alta insumos.
- **Por qué importa:** la separación admin / cocinero / cliente hoy existe solo en el frontend (`guard.js`), que es un archivo que el usuario controla.
- **Cómo se resuelve:** `function requireRol(...roles)` que responda 403 si `req.usuario.rol` no está en la lista. Después hay que armar la matriz de endpoints:
  - admin: usuarios, stock, recetas, pedidos y reportes;
  - cocinero: `cocina/tareas` y `listo-cocinero`;
  - público: login, register, catálogo y `POST /api/pedidos`.

### P0-3 · Endpoints que modifican datos sin `requireAuth`

| Endpoint | Línea | Riesgo |
|----------|-------|--------|
| `PUT /api/pedidos/:pedidoId/estado` | 981 | Cambiar el estado de cualquier pedido (y disparar el descuento de stock) |
| `PUT /api/pedidos/:id/pagado` | 776 | Marcar como cobrado cualquier pedido |
| `DELETE /api/pedidos/:id` | 1141 | **Borrar pedidos de verdad**, salteando la anulación con PIN |
| `PUT /api/insumos/:id` · `DELETE /api/insumos/:id` | 1379 · 1412 | Poner cualquier stock o borrar insumos |
| `POST /api/movimientos-stock` · `DELETE .../:id` | 1687 · 1754 | Mover el stock y los costos (reportes de gastos) |
| `POST /api/recetas` · `DELETE /api/recetas/:id` | 1513 · 1561 | Cambiar precios y recetas, o desactivar productos |
| `POST /api/productos/con-receta` (sin cocinero) | 2012 | Crear productos en el catálogo público |
| `POST /api/productos/:id/imagen` | 1588 | Reemplazar la foto de cualquier producto del catálogo |
| `PUT /api/planes/:id/cocinero` | 1206 | Reasignar cocineros (sin validar que lo sean) |
| Usuarios (ver P0-1) | 2114-2217 | — |

**Públicos por diseño** (se quedan así, pero con validación y límite de requests): `POST /api/login`, `POST /api/register`, `POST /api/pedidos` y `POST /api/recuperar-password`.

- **Cómo se resuelve:** `requireAuth` + `requireRol(...)` en todos. En el frontend, mandar siempre `Authorization` (hoy lo mandan solo las llamadas nuevas).

### P0-4 · La base está abierta para la clave pública de Supabase

- **Qué es:** el servidor usa `SUPABASE_ANON_KEY` (`config/supabaseClient.js`), y con esa clave se puede leer, insertar, modificar y borrar en todas las tablas (se comprobó en las pruebas). Las políticas de RLS están abiertas o desactivadas.
- **Por qué importa:** la clave anónima de Supabase está pensada para ser pública (no es un secreto). Quien la obtenga, o quien tenga acceso a otro proyecto que la use, puede ir **directo a la base** salteando todo el servidor, incluido cualquier control de rol que se agregue.
- **Cómo se resuelve:** usar la clave `service_role` **solo en el servidor** (nunca en el frontend) y activar RLS en todas las tablas **sin** políticas para el rol `anon`, de modo que solo el servidor pueda operar. Hoy la clave anónima no aparece en el frontend: bien.

### P0-5 · XSS guardado: el formulario público puede ejecutar código en las pantallas de administración

- **Qué es:** nombre, dirección, teléfono y observaciones que escribe cualquier cliente en el formulario público se insertan con `innerHTML` **sin escapar** en:
  - Envíos: `Envios.js:186`, `:387`, `:409-412` y `:533-541` (tarjetas y hoja de ruta);
  - Cocina: `cocinero.js:195`.

  También `MovimientosStock.js:167-172`. El nombre de producto sin escapar en `index.js` y `funciones.js` lo carga el admin, así que es de menor riesgo.
- **Por qué importa:** un pedido con `<img src=x onerror="...">` en el nombre ejecuta JavaScript en el navegador del admin o del cocinero cuando abren la pantalla. Como el token está en `localStorage` (`fg_token`), ese código puede **robar la sesión del administrador**.
- **Cómo se resuelve:** escapar todo dato de usuario (`textContent` o una función `escapar()` como la `_esc` de `cocinero.js`). La grilla de Consultar Pedidos ya lo hace bien y sirve de modelo. Como segunda capa, un `Content-Security-Policy` (ver P2).

### P0-6 · Recuperar contraseña permite bloquear cuentas ajenas

- **Qué es:** `POST /api/recuperar-password` (2242) **cambia la contraseña** de inmediato con solo saber el email. Además:
  - responde 404 si el email no existe (permite averiguar quién tiene cuenta);
  - usa `ilike` (con `%` como email se resetea el primer usuario);
  - genera la clave con `Math.random()`;
  - no tiene límite de intentos.
- **Por qué importa:** cualquiera puede dejar sin acceso al administrador (o a todos) en cualquier momento.
- **Cómo se resuelve:**
  - generar un token con `crypto.randomBytes`, guardarlo **hasheado** con vencimiento (30 min) y mandar un link;
  - la contraseña se cambia **recién** cuando el usuario usa el link;
  - responder siempre "si el email existe, te mandamos un correo";
  - comparar el email exacto y limitar la cantidad de pedidos por IP.

### P0-7 · Precios y usuario del pedido los decide el cliente

- **Qué es:** `POST /api/pedidos` guarda el `total` y el `usuario_id` que manda el body (C-01) y no valida `items` (cantidades negativas o cero, productos inactivos o inexistentes: `precioMap[...] ?? 0` guarda precio 0).
- **Por qué importa:** pedidos a $1, pedidos a nombre de otro usuario y cantidades negativas que, al descontar stock, **suman** stock.
- **Cómo se resuelve:** total calculado en el servidor, `id_usuario` sacado del token (o "consumidor final" si no hay sesión), y validar `cantidad` (entero entre 1 y un máximo razonable) y que el producto exista y esté activo.

### P1-8 · Login y PIN sin límite de intentos

- **Qué es:** ni `/api/login` ni la anulación con PIN limitan los intentos. El PIN tiene **4 dígitos** (10.000 combinaciones).
- **Por qué importa:** con cualquier token (por ejemplo, el de un cliente registrado, ver P0-2) se prueba el PIN entero en minutos. Las contraseñas se pueden adivinar por fuerza bruta.
- **Cómo se resuelve:** `express-rate-limit` en login, register, recuperar-password y anular (por IP y por usuario); bloqueo temporal tras N fallos; PIN más largo o, mejor, que anular exija rol admin **y** el PIN.

### P1-9 · Credenciales débiles y secretos cortos

- **Qué es:**
  - el usuario `mauro_admin` tiene contraseña `123`, escrita en `test_e2e.js` y en los informes;
  - `JWT_SECRET` tiene 19 caracteres;
  - `ADMIN_PIN` es de 4 dígitos;
  - las altas y el registro no exigen ningún largo mínimo de contraseña.
- **Por qué importa:** un secreto de JWT corto se puede adivinar por fuerza bruta a partir de un token, y quien lo adivine fabrica tokens de admin.
- **Cómo se resuelve:** `JWT_SECRET` de 64 bytes aleatorios (`crypto.randomBytes(64).toString('hex')`), rotar todas las contraseñas de prueba antes de producción, exigir un mínimo de 8 caracteres y sacar las credenciales de los archivos del repo.

### P1-10 · Datos personales y archivos sensibles en git

- **Qué es:**
  - `C:Temppedidos_debug.json` tiene pedidos reales con nombre, teléfono, dirección y email de clientes, y está en el historial de git;
  - también están versionados `test_e2e.js` (con credenciales) e `INSTRUCCIONES_LOGIN.md`.
- **Por qué importa:** si el repo es público, o se comparte, se filtran datos de terceros.
- **Cómo se resuelve:** borrar el archivo **y limpiarlo del historial** (`git filter-repo`); si el repo estuvo público, considerar filtrados los datos. Revisar que `.env` nunca se haya subido (hoy no está versionado: bien).

### P1-11 · Lecturas públicas de datos personales

- **Qué es:** sin login se puede leer:
  - `GET /api/pedidos` (todos los clientes: nombre, dirección, teléfono y email) y `GET /api/envios`;
  - `GET /api/usuarios` (emails de todo el personal);
  - `GET /api/cocina/tareas` (el cocinero va en la URL);
  - `GET /api/movimientos-stock` y los reportes de ventas.
- **Por qué importa:** es la base de clientes completa, disponible para cualquiera.
- **Cómo se resuelve:** `requireAuth` + rol en todos los GET que no sean el catálogo. En `cocina/tareas`, tomar el cocinero del token, como ya hace `listo-cocinero`.

### P1-12 · Validación de datos de entrada

- **Qué es:**
  - ids sin validar en varios endpoints (C-14);
  - `POST /api/movimientos-stock` acepta cantidades negativas (una "salida" negativa **suma** stock) y cualquier valor en `tipo` (todo lo que no es `'entrada'` se trata como salida);
  - `PUT /api/insumos/:id` acepta cualquier stock;
  - `POST /api/productos/:id/imagen` arma la ruta del archivo con el `id` sin validar;
  - el alta de usuarios no valida el formato del email ni que `id_rol` sea un rol existente.
- **Cómo se resuelve:** validar cada body con un esquema (`zod` o `joi`) o, como mínimo, con funciones de validación comunes: enteros positivos, enums para `tipo`, `metodo_pago` y `rol`, largos máximos de texto.

### P2-13 · Configuración del servidor para producción

- **CORS** (`server.js:9`): solo acepta localhost. Hay que agregar el dominio real, o sacarlo si el front se sirve desde el mismo Express.
- **HTTPS obligatorio:** el token viaja en un header.
- **`helmet`:** headers de seguridad y CSP.
- **Tamaño del body:** `express.json({ limit: '6mb' })` aplica a **todas** las rutas (línea 26). Ponerle 6 MB solo a la de imágenes y 100 KB al resto.
- **Mensajes de error:** no devolver `error.message` de Postgres al navegador; loguearlo y responder un mensaje genérico.
- **Puerto y logs:** `PORT` desde el entorno, y sacar de los logs usuarios y datos personales.

### P2-14 · Token en `localStorage` y protección solo en el frontend

- **Qué es:** el token vive en `localStorage` (expuesto a cualquier XSS, ver P0-5) y el control de acceso a páginas es `guard.js`, en el navegador. `admin.html` (el dashboard de reportes) **ni siquiera carga `guard.js`**.
- **Cómo se resuelve:** mientras el servidor valide rol en cada endpoint (P0-2), el guard es solo comodidad. Agregarlo igual en `admin.html`. A futuro, cookie `httpOnly` + `SameSite=Strict` en lugar de `localStorage`.

---

# VEREDICTO

### ¿El código funciona bien y está ordenado?

**Funciona en los flujos principales, pero no está ordenado de forma pareja.** Se nota que se hizo en varias etapas:
- **Código de la primera etapa:** catálogo, stock, usuarios y reportes. Es más frágil: errores ignorados, URLs fijas, sin validaciones.
- **Código de las etapas nuevas:** pedidos, cocina y pagos. Es más prolijo y está probado.

El problema no es que esté "mal escrito", sino que **no hay criterios comunes**:
- tres maneras de llamar a la API;
- cinco versiones del aviso flotante;
- validación de ids en unos endpoints sí y en otros no;
- lógica de negocio (precios, fechas, estados) repartida entre el navegador y el servidor.

Hay además un puñado de **bugs que hoy dan números incorrectos** (reportes, descuentos, fecha en UTC) y **ninguna operación de varios pasos es atómica**, que es el riesgo de fondo para los datos.

### Qué arreglaría sí o sí antes de producción (sin contar seguridad)

1. **URLs relativas** en todo el frontend (C-06). Sin esto, no anda fuera de la máquina local.
2. **Precio y total calculados en el servidor**, con descuento, y una sola fuente de verdad (C-01, C-02).
3. **Reportes:** que el filtro de fechas filtre y sacar los datos inventados (C-04, C-05).
4. **Stock y pedidos atómicos** con funciones de Postgres (transacción + `UPDATE ... SET stock = stock - x`) e idempotencia por columna, no por texto (C-03, C-07).
5. **Fecha local** en Envíos, reportes y grilla (C-08).
6. **Limpieza del repo:** sacar `pedidos_debug.json` (datos reales), `node_modules`, `test_hash.js`, la página huérfana y los endpoints muertos (C-13).
7. **Sacar `stock_actual` de `PUT /api/insumos/:id`** para que todo cambio de stock deje registro (C-16).

### Lo mínimo de seguridad para subirlo a un servidor

Si hubiera que elegir **lo mínimo indispensable**:

1. **Rol en el servidor:** `requireAuth` + `requireRol` en **todos** los endpoints que no sean públicos por diseño, empezando por usuarios (P0-1, P0-2, P0-3). Esto solo ya cierra la toma total del sistema.
2. **Supabase cerrado:** clave `service_role` en el servidor y RLS activado sin acceso para `anon` (P0-4). Si no, lo anterior se puede saltear.
3. **Escapar datos del formulario público** en Envíos y en cocina (P0-5).
4. **Recuperar contraseña con token** en lugar de cambiarla directamente (P0-6), o desactivarlo hasta tenerlo.
5. **Total calculado en el servidor** y validación de `items` en `POST /api/pedidos` (P0-7).
6. **Límite de intentos** en login, PIN y recuperación; `JWT_SECRET` largo; contraseñas de prueba rotadas (P1-8, P1-9).
7. **HTTPS, CORS con el dominio real** y sacar los datos personales del historial de git (P1-10, P2-13).

Con estos siete puntos resueltos, el sistema se puede subir a un servidor con un riesgo razonable para una primera versión. El resto de la lista (validación completa, `helmet`, cookies `httpOnly`, dividir `server.js`) puede ir en una segunda etapa.
