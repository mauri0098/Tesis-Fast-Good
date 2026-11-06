# Informe del MVC y la mudanza del front (rama mvc_fastgood)

Acá va todo lo del MVC del servidor y de la mudanza del front: qué se movió, a dónde, y las pruebas.
Lo de la heladera y los combos sigue en INFORME-CAMBIOS-HELADERA.md.

**La regla de todo este trabajo: mover NO es cambiar.** Cada ruta tiene que responder exactamente lo mismo que antes.

**Las pruebas de cada paso:**
- `node tests/test_e2e.js heladera` tiene que dar 61/61.
- Siguen siendo 89 rutas: 76 con requireAuth y 13 públicas.

**Quién hace qué:**
- Claude hace la base común (backend/config, backend/middlewares, backend/utils) y la mudanza del front.
- Los módulos (backend/modulos/) los escribe el usuario a mano.
- Antes de cada módulo, Claude da una guía.
- Después, Claude lo revisa y corre las pruebas, sin corregir el código.

---

## Paso 1: las carpetas de backend/ (05/11/2026)

### Qué se hizo
- Se creó `backend/` con `config/`, `middlewares/`, `utils/` y `modulos/` (17 módulos con `rutas.X.js`, `controlador.X.js` y `modelo.X.js`).
  Son 61 archivos vacíos, cada uno con un comentario arriba de qué va y qué no va. En cada `rutas.X.js` están anotadas
  las rutas que va a recibir (suman las 89).
- `config/supabaseClient.js` → `backend/config/supabaseClient.js` (sin cambios adentro). La carpeta `config/` se borró.
- `server.js`, renglón 49: `require('./config/supabaseClient')` → `require('./backend/config/supabaseClient')`.
- `tests/test_e2e.js`, renglón 23: `'..', 'config', 'supabaseClient'` → `'..', 'backend', 'config', 'supabaseClient'`.

### Antes de empezar: datos para la prueba
La prueba de base daba 2 de 3: faltaban viandas de "PRUEBA fideos" en la heladera.
Se hizo por las rutas de la web (sin SQL) el pedido a cocina #35, con 12 "PRUEBA fideos", y se marcó "Hecho" el renglón #46.
Quedó anotado en la lista de datos de prueba para borrar, en INFORME-CAMBIOS-HELADERA.md.

### Pruebas
| Control | Antes | Después |
|---|---|---|
| test heladera | 61/61 | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 | 76 / 13 |

---

## Paso 2: la base común (05/11/2026)

### Qué se movió y a dónde
Cada pedazo se copió tal cual de server.js con un script. El script confirmaba que cada renglón de inicio y de fin
fuera el planeado. Después se borró de server.js, y arriba de server.js quedó un `require` por archivo.
server.js pasó de 5693 a 5245 renglones.

| Archivo nuevo | Qué tiene | Venía de server.js (renglones de antes) |
|---|---|---|
| backend/config/cors.js | `origenesPermitidos`, `opcionesCors` | 21–42 |
| backend/middlewares/limites.js | `limitador` y los 6 límites | 56–102 |
| backend/middlewares/auth.js | `leerToken`, `requireAuth`, `requireRol` | 104–137 |
| backend/middlewares/manejadorErrores.js | `manejadorErrores` | 5671–5685 |
| backend/utils/errores.js | `MENSAJE_ERROR_INTERNO`, `mensajeInterno`, `errorInterno` | 139–148 |
| backend/utils/constantes.js | `METODOS_PAGO`, `ESTADO_ANULADO`, `ESTADO_POR_ARMAR`, `OFFSET_ARGENTINA`, `BUCKET_IMAGENES_PRODUCTOS`, `EXTENSIONES_IMAGEN`, `TAMANIO_MAX_IMAGEN`, `ENTERO_MAXIMO_BASE` | 850, 1215–1219, 2349–2351, 2724 |
| backend/utils/validaciones.js | `leerFechaPara`, `leerPeriodo` (con `MAXIMO_DIAS_PERIODO` y `MILISEGUNDOS_POR_DIA`), `leerIdPlan` | 2974–2981, 3713–3714, 3717–3757, 4451–4456 |
| backend/utils/cuentasInsumos.js | `calcularFaltantes`, `unirConY`, `convertirACantidadBase`, `FACTOR_UNIDAD`, `FAMILIA_UNIDAD` | 193–231, 273–278, 2430–2454 |
| backend/utils/platosDelCocinero.js | `platoEsDelCocinero`, `platoSinCocinero`, `platoVisibleParaCocinero` | 737–744, 2983–2995 |
| backend/utils/listaMovimientos.js | `nombreDeUsuario`, `origenDeRenglonStock`, `armarMovimientos` | 3429–3439, 3496–3526, 3528–3649 |

### Las dos únicas cosas que cambiaron de forma
Hoy no tenían nombre, y hacía falta dárselo para poder compartirlas.
- **opcionesCors**
  - *Antes:* el objeto estaba escrito adentro de `app.use(cors({ … }))`.
  - *Ahora:* es `const opcionesCors = { … }` en cors.js, y en server.js queda `app.use(cors(opcionesCors))`. El contenido es el mismo.
- **manejadorErrores**
  - *Antes:* era `app.use((err, req, res, next) => { … })`, una función sin nombre.
  - *Ahora:* es `function manejadorErrores(err, req, res, next)`, y en server.js queda `app.use(manejadorErrores)` como último app.use.
  - *Por qué los 4 datos de entrada:* así Express reconoce que es un manejador de errores.

### Qué protege cada pieza
- **CORS:** que otro sitio web use la API desde el navegador de alguien con la sesión abierta.
- **Los límites:** la fuerza bruta de claves y PIN, y la carga masiva de pedidos falsos.
- **requireAuth y requireRol:** que alguien sin login, o con otro rol, use el panel.
- **errorInterno y manejadorErrores:** que se filtren detalles de la base o del código.
- **Las validaciones:** que entren fechas que no existen, números truchos o períodos enormes.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 |
| Funciones mudadas que siguen en server.js (código repetido) | ninguna |
| Nombres que server.js usa y ya no existen | ninguno |
| Los 10 archivos nuevos cargan | sí |

Además se probó a mano, contra una copia del servidor en el 3001:

| Prueba | Resultado |
|---|---|
| JSON roto | 400 "El contenido enviado no es un JSON válido" |
| Sitio no permitido | 500 con mensaje simple (igual que antes) |
| Sitio permitido | 200 |
| Panel sin token | 401 |
| Catálogo | sigue con su límite de 60 por minuto |

**Corrección (05/11, antes de F1): las pruebas del paso 2 se repitieron.**
- *Qué pasó:* la primera vez, el servidor de prueba del paso 1 había quedado prendido en el 3001, y las pruebas le pegaron a
  ese servidor viejo. Lo delató el log: el error de CORS apuntaba a `server.js:39`, donde estaba CORS antes de la mudanza.
- *Qué se hizo:* se apagó y se repitió todo con un servidor nuevo. Esta vez el error de CORS apunta a `backend/config/cors.js:28`,
  o sea que sí contestaba el código nuevo. Resultado: 61/61 y las mismas respuestas a mano. El paso 2 está bien.
- *Para que no se repita:* los servidores de prueba arrancan con la marca `--prueba3001` y se apagan buscando esa marca.
  Antes de cada prueba se confirma en el log qué servidor contesta.

---

# FASE 2: la mudanza del front

**La regla:** solo cambian direcciones. No se toca ninguna función, id, clase, ni lo que se manda al servidor.
Las direcciones nuevas son absolutas: empiezan con "/", que es la raíz de la web (la carpeta frontend/), y sirven desde cualquier carpeta.

**El orden, de a un paso por vez (se frena después de cada uno):**
- F1 compartido/
- F2 Stock: movimientos, compras y stock
- F3 Cocina: cocina, heladera y cocineros
- F4 Pedidos y reparto: pedidos, envíos y armado
- F5 Catálogo: combos, planesCategorias y recetas
- F6 Usuarios e Inicio
- F7 Las piezas de la tienda y del login (index.html y login.html NO se mueven)
- F8 Cierre: los .md a docs/, el .sql a sql/, y revisar que no quede ningún ../src/ ni pages/ en frontend/
- **F9 Limpieza de CSS, pantalla por pantalla.** En cada pantalla:
  1. Fotos de antes, en compu y celu.
  2. La lista de lo que sobra: reglas repetidas de global.css, clases que no usa ningún HTML ni JS, y los `<style>` adentro del HTML.
  3. Freno y espero el OK del usuario.
  4. Se borra lo que sobra.
  5. Fotos de después: tienen que quedar iguales.
  
  Ahí se resuelven también ConsultarPedidos.css, combos.css y stock.css (hoy en compartido/, con nombre de una sola pantalla).

**Las pruebas de cada paso:**
- El test heladera: 61/61.
- El conteo de rutas: 76 con requireAuth y 13 públicas.
- El **control de archivos faltantes**: un script lee cada HTML y le pide al servidor cada archivo que carga
  (`src` y `href`), y además revisa en el disco las direcciones que arman los JS (roles.js, adminSidebar.js, api.js,
  guard.js, los links y los logos). Tiene que dar 0 faltantes.
- El recorrido a mano del usuario, en celu y compu.

Antes de mover nada (05/11) se borraron a mano la pantalla vieja de movimientos (`pages/MovimientosStock.html` y
`src/js/MovimientosStock.js`) y `src/css/adminSidebar.css`, que no cargaba nadie.

## F1: frontend/compartido/ (05/11/2026)

### Qué se movió
Son 17 archivos que usan varias pantallas. Pasaron de `frontend/src/js/` y `frontend/src/css/` a `frontend/compartido/`:
- **11 JS:** roles, guard, api, escape, auth, fechas, paginacion, global, adminSidebar, stockCompartido y pedidosCocina.
- **6 CSS:** global, menuPanel, pedidosCocina, stock, combos y ConsultarPedidos.

### Qué direcciones cambiaron
- **En las 16 HTML:** cambiaron 125 renglones, solo los que cargan esos 17 archivos.
  Ej: `<script src="../src/js/api.js">` → `<script src="/compartido/api.js">`.
- **roles.js, `base()`**
  - *Antes:* `'../'` si la pantalla estaba en `pages/` y `'./'` si no.
  - *Ahora:* siempre `'/'`.
  - *Quién la usa:* guard.js, para mandar al login o a la pantalla principal. guard.js no se tocó.
- **api.js, la redirección cuando la sesión vence (401)**
  - *Antes:* calculaba `'../'` o `'./'` + `'login.html'`.
  - *Ahora:* `window.location.replace('/login.html')`.
- **adminSidebar.js**
  - *Antes:* calculaba `enSubpagina` y la `base`, y el CSS del menú estaba en `src/css/menuPanel.css`.
  - *Ahora:* `const base = '/'` y el CSS está en `compartido/menuPanel.css`. También se actualizó el comentario de arriba.
- **fechas.js, que también lo usa el servidor:**
  - `server.js` 35: `./frontend/src/js/fechas.js` → `./frontend/compartido/fechas.js`.
  - `backend/utils/validaciones.js` 10: `../../frontend/src/js/fechas.js` → `../../frontend/compartido/fechas.js`.
  - `tests/test_e2e.js` 21: `'frontend', 'src', 'js', 'fechas.js'` → `'frontend', 'compartido', 'fechas.js'`.

No hay funciones nuevas. La única función que cambió por dentro es `base()` de roles.js: ahora devuelve siempre "/".

### Pruebas
| Control | Antes | Después |
|---|---|---|
| test heladera | 61/61 | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos pedidos, 46 direcciones de los JS) | 0 | 0 |
| Direcciones viejas de los 17 archivos que quedan en el código | — | ninguna |
| `/src/js/api.js` (el lugar viejo) | 200 | 404 (ya no está ahí) |

## F2: Stock (movimientos, compras y stock) (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| pages/MovimientosStockNuevo.html, src/css/movimientosStockNuevo.css, src/js/movimientosStockNuevo.js | pantallas/movimientos/ |
| pages/compras.html, src/css/compras.css, src/js/compras.js, src/js/registrarCompra.js | pantallas/compras/ |
| pages/stock.html, src/js/stock.js | pantallas/stock/ |

stock.css no se movió: está en compartido/ porque también lo usan combos y planesCategorias. Se resuelve en F9.

### Qué direcciones cambiaron
Fueron 24 cambios exactos. Un script frenaba si el texto viejo no aparecía justo las veces esperadas.
- **En las 3 HTML movidas:**
  - El logo pasó a `/src/assets/img/logo.webp`.
  - Sus CSS y JS pasaron a `/pantallas/<pantalla>/…`.
  - El botón "+ Registrar compra" de Movimientos pasó a `/pantallas/compras/compras.html?compra=1`.
- **roles.js:** las 3 rutas de la tabla de permisos, más el ejemplo del comentario de `base()`.
- **adminSidebar.js:** los 3 links del menú del grupo Stock.
- **admin.html 145:** el link "Gestionar stock" del Inicio.
- **reportes.js 433:** el link "y N más en Gestión de Stock" del Inicio.
- **pedirCocina.js 419:** el link "Ir a Compras" del aviso de faltantes de Producción.
  - *Antes:* `compras.html?compra=1`, una dirección relativa: "el archivo que está al lado mío".
  - *Ahora:* es absoluta.
  - *Por qué en este paso:* si heladera se mudaba antes que compras, este link se habría roto en el medio.
- **El comentario de arriba de compras.js, registrarCompra.js y movimientosStockNuevo.js:** dice dónde está su pantalla.

Queda un comentario viejo en `server.js` ("pages/compras.html", en la sección de Compras). Se corrige cuando el usuario haga el módulo compras.

No hay funciones nuevas ni cambiadas: solo direcciones.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones viejas de estas 3 pantallas en el código | ninguna (solo el comentario de server.js) |
| `/pantallas/stock/stock.html` · `/pages/stock.html` | 200 · 404 |

## F3: Cocina (cocina, heladera y cocineros) (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| pages/cocinero.html, src/css/cocinero.css, src/js/cocinero.js | pantallas/cocina/ |
| pages/heladera.html, src/css/heladera.css, src/js/heladera.js, src/js/pedirCocina.js | pantallas/heladera/ |
| pages/AsignarCocinero.html, src/js/AsignarCocinero.js | pantallas/cocineros/ |

No se movieron, porque son compartidos y quedan en compartido/:
- pedidosCocina.js y pedidosCocina.css, que los usan Tareas de Cocina y Producción.
- ConsultarPedidos.css, que lo usa también Asignar Cocineros.

### Qué direcciones cambiaron
Fueron 24 cambios exactos, cada uno con la cantidad de veces esperada.
- **En las 3 HTML movidas:** el logo pasó a `/src/assets/img/logo.webp` y sus CSS y JS a `/pantallas/<pantalla>/…`.
- **roles.js:** las 3 rutas de la tabla de permisos, más la pantalla principal del cocinero (rol 2 → `pantallas/cocina/cocinero.html`).
- **adminSidebar.js:** los 3 links del menú del grupo Cocina, más la clave del contador de Tareas de Cocina.
- **admin.html:** el link 90 ("Ver cocina") y el 162 ("Planificar cocina").
- **reportes.js 477:** el link "y N más en Producción".
- **El comentario de arriba de cocinero.css, cocinero.js, heladera.css, heladera.js y pedirCocina.js:** dice dónde está su pantalla.

El link "Ir a Compras" de pedirCocina.js ya era absoluto desde F2, así que no se rompió con la mudanza.
No hay funciones nuevas ni cambiadas: solo direcciones.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones viejas de estas 3 pantallas en el código | ninguna |
| `/pantallas/cocina/cocinero.html` · `/pages/cocinero.html` | 200 · 404 |

## F4: Pedidos y reparto (pedidos, envíos y armado) (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| pages/ConsultarPedidos.html, src/js/ListarPedidos.js, src/js/pagoPedido.js | pantallas/pedidos/ |
| pages/Envios.html, src/js/Envios.js | pantallas/envios/ |
| pages/armadoPedidos.html, src/css/armadoPedidos.css, src/js/armadoPedidos.js | pantallas/armado/ |

ConsultarPedidos.css queda en compartido/, porque lo usa también Asignar Cocineros. Se resuelve en F9.

### Qué direcciones cambiaron
Fueron 18 cambios exactos, cada uno con la cantidad de veces esperada.
- **En las 3 HTML movidas:** el logo pasó a `/src/assets/img/logo.webp` y sus CSS y JS a `/pantallas/<pantalla>/…`.
- **roles.js:** las 3 rutas de la tabla de permisos, más las pantallas principales:
  - rol 1 (Administrador) → `pantallas/pedidos/ConsultarPedidos.html`
  - rol 3 (Repartidor) → `pantallas/envios/Envios.html`
- **adminSidebar.js:** los 3 links del menú (grupos Pedidos y Reparto), más el ejemplo de un comentario.
- **admin.html 74:** el link "Ver pedidos" del Inicio.
- **El comentario de arriba de ConsultarPedidos.css y de ListarPedidos.js:** dice dónde está su pantalla.

No hay funciones nuevas ni cambiadas: solo direcciones.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones viejas de estas 3 pantallas en el código | ninguna |
| `/pantallas/pedidos/ConsultarPedidos.html` · `/pages/ConsultarPedidos.html` | 200 · 404 |

## F5: Catálogo (combos, planesCategorias y recetas) (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| pages/combos.html, src/js/gestionCombos.js | pantallas/combos/ |
| pages/planesCategorias.html, src/css/planesCategorias.css, src/js/planesCategorias.js | pantallas/planesCategorias/ |
| pages/generarReceta.html, src/css/generarReceta.css, src/js/generarReceta.js | pantallas/recetas/ |

combos.css y stock.css quedan en compartido/, porque los usan Combos y Planes y categorías (stock.css también Gestión de Stock).
Se resuelve en F9.

### Qué direcciones cambiaron
Fueron 26 cambios exactos, cada uno con la cantidad de veces esperada.
- **En las 3 HTML movidas:** el logo (el ícono y la imagen) y sus CSS y JS.
- **roles.js y adminSidebar.js:** las 3 pantallas del grupo Catálogo.
- **El comentario de arriba de combos.css, planesCategorias.css, planesCategorias.js, gestionCombos.js y generarReceta.js:** dice dónde está su pantalla.
- **planesCategorias.js, la función `direccionDeFoto`.** Es el único cambio adentro de una función en F5.
  - *Qué hace:* adapta la dirección de una foto de plan o categoría, tal como está guardada en la base, para usarla desde esta pantalla.
  - *Antes:* cambiaba el `./` del principio por `../`, que sirve desde `pages/`.
  - *Ahora:* lo cambia por `/`, que sirve desde cualquier carpeta.
  - *Entrada y salida:* recibe la dirección guardada y devuelve la que sirve. Ej: `'./src/assets/img/combo-saludable-1200.jpg'` → `'/src/assets/img/combo-saludable-1200.jpg'`. Una dirección `https://…` (foto subida a Supabase) queda igual.
  - *Quién la llama:* `armarFotoLista`, que dibuja la foto de cada fila de las listas.
  - En la misma `armarFotoLista`, el logo de respaldo (cuando una foto no carga) pasó de `'../src/assets/img/logo.webp'` a `'/src/assets/img/logo.webp'`.

Quedan 2 comentarios viejos en `server.js` ("pages/planesCategorias.html" y "pages/combos.html").
Se corrigen cuando el usuario haga esos módulos.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones viejas de estas 3 pantallas en el front | ninguna |
| `/pantallas/combos/combos.html` · `/pages/combos.html` | 200 · 404 |
| **Las fotos reales de la base, pasadas por `direccionDeFoto` y pedidas al servidor** | 6 de 7 cargan (ver abajo) |

**La foto que no carga YA estaba rota antes de la mudanza:**
- *Cuál es:* la categoría 1 ("Viandas Saludables") tiene `./src/assets/img/BANNER-AQUI.jpg`.
- *De dónde sale:* `BANNER-AQUI.jpg` es el nombre de ejemplo de `sql/categoria_banner_viandas_saludables.sql`, que dice que hay que cambiarlo por el nombre real antes de correrlo.
- *Por qué no la rompió la mudanza:* el archivo no existe ni existió nunca en git, y con la función vieja daba el mismo 404.
- *Qué se ve hoy:* esa tarjeta muestra el logo en vez de la foto. Quedó como pendiente.

## F6: Usuarios e Inicio (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| pages/gestionUsuarios.html, src/css/gestionUsuarios.css, src/js/gestionUsuarios.js | pantallas/usuarios/ |
| admin.html (estaba en la raíz), src/css/admin.css, src/js/reportes.js | pantallas/inicio/ |

`pages/` quedó vacía: se borra en F8. En `src/` quedan solo las piezas de la tienda y del login (van en F7) y las imágenes.

### Qué direcciones cambiaron
Fueron 13 cambios exactos, cada uno con la cantidad de veces esperada.
- **En las 2 HTML movidas:** el logo pasó a `/src/assets/img/logo.webp` y sus CSS y JS a `/pantallas/<pantalla>/…`.
  admin.html usaba direcciones desde la raíz (`./src/…` y `src/js/…`). Ahora son absolutas como las demás.
- **roles.js:** las 2 rutas de la tabla de permisos, más la pantalla principal de los roles 6 (Administrador del sistema)
  y 5 (Dueño) → `pantallas/inicio/admin.html`.
- **adminSidebar.js:** los links "Inicio" y "Gestión de Usuarios" del menú.
- **El comentario de arriba de admin.css y de reportes.js:** dice dónde está su pantalla.

No hay funciones nuevas ni cambiadas: solo direcciones.

**Lo que se revisó y NO hizo falta cambiar:**
- *guard.js y el resaltado del menú:* reconocen la pantalla solo por el nombre del archivo (`admin.html`). La carpeta no les importa.
- *El salto al Inicio después del login (auth.js) y desde el index (si ya tenía sesión):* ponen la dirección de roles.js
  delante de la raíz (`login.html` e `index.html` están ahí). Por eso dan `/pantallas/inicio/admin.html`.
- *Los links de admin.html y reportes.js a otras pantallas:* ya eran absolutos desde F2–F4.
- *Los CSS:* ninguno usa `url(…)` ni `@import`, así que moverlos no rompe nada adentro.

Quedan 2 comentarios que nombran `admin.html` sin carpeta: el de adminSidebar.js (renglón 242) sigue siendo cierto. El de
global.css ("las 11 pantallas de pages/") se corrige en F8.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas `/api` con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones viejas de estas 2 pantallas en el front, los tests y server.js | ninguna |
| `/pantallas/inicio/admin.html` · `/admin.html` | 200 · 404 |
| `/pantallas/usuarios/gestionUsuarios.html` · `/pages/gestionUsuarios.html` | 200 · 404 |

*Sobre el conteo:* son 90 rutas en total, pero `app.get('/')` (server.js 5132, que manda el index.html) no es de la API.
Las 76/13 de siempre cuentan solo las que empiezan con `/api`.

## F7: La tienda y el login (05/11/2026)

### Qué se movió
| Antes | Ahora |
|---|---|
| src/css/index.css y los 5 JS de la web: renderizadoCatalogo.js, carritoCombos.js, armarCombo.js, pedidoCombos.js, animaciones-index.js | pantallas/tienda/ |
| src/css/login.css | pantallas/login/ |

index.html y login.html **se quedan en la raíz**:
- *index.html:* es la puerta de la web, y la base guarda las fotos con `./src/assets/img/…`, pensadas desde ahí.
- *login.html:* es adonde mandan guard.js y api.js cuando no hay sesión (`/login.html`).

En `src/` quedan solo las imágenes (`src/assets/img/`). `src/css/` y `src/js/` quedaron vacías: se borran en F8.

### Qué direcciones cambiaron
Fueron 7 cambios exactos, cada uno con la cantidad de veces esperada.
- **index.html:** su CSS (`/pantallas/tienda/index.css`) y los 5 `<script>` de la web (`/pantallas/tienda/…`).
- **login.html:** su CSS (`/pantallas/login/login.css`).

No hay funciones nuevas ni cambiadas: solo direcciones.

**Lo que se revisó y NO hizo falta cambiar:**
- *Las imágenes de index.html y login.html (`./src/assets/img/…`):* las páginas no se movieron, así que siguen sirviendo.
- *`IMAGEN_POR_DEFECTO` de renderizadoCatalogo.js (`'./src/assets/img/logo.webp'`) y las fotos de la base:* el navegador toma
  una dirección relativa desde la PÁGINA (index.html), no desde el archivo JS. Como index.html no se movió, siguen sirviendo.
- *Los CSS:* ninguno usa `url(…)` ni `@import`.

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas `/api` con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Direcciones `src/js` o `src/css` en el front, los tests y server.js | ninguna |
| `/pantallas/tienda/index.css` · `/src/css/index.css` | 200 · 404 |
| `/pantallas/login/login.css` · `/src/css/login.css` | 200 · 404 |
| La raíz `/` manda el index nuevo · `/login.html` · `/api/v1/combos` | sí · 200 · 200 |
| Fotos de las rutas públicas del catálogo, tomadas desde index.html | 2 fotos: 1 subida a Supabase y 1 local, que no carga: el `BANNER-AQUI.jpg` de antes (pendiente 5) |

## F8: Cierre de la mudanza (05/11/2026)

### Qué se movió
| Antes (en la raíz) | Ahora |
|---|---|
| EXPLICACION_COCINEROS_Y_STOCK.md, INFORME_TEST_E2E.md, REVISION_CODIGO.md | docs/ |
| migracion_pago_mixto.sql | sql/ |

CLAUDE.md **se queda en la raíz**: es donde lo lee Claude Code.
Ningún código nombraba estos archivos, solo otros .md. INFORME_TEST_E2E.md nombra a REVISION_CODIGO.md, y ahora están en la misma carpeta.

Se borraron las 3 carpetas que quedaron vacías: `frontend/pages/`, `frontend/src/css/` y `frontend/src/js/`.

### Qué textos cambiaron
Fueron 4 cambios exactos. Son comentarios y una regla del CLAUDE.md: no cambió código.
- **CLAUDE.md 62** (Refactor de JavaScript): "de a UN archivo del front (frontend/src/js/)" → "(frontend/pantallas/ o frontend/compartido/)".
- **global.css 3:** decía "La cargan admin.html, login.html y las 11 pantallas de pages/". Ahora dice "La cargan login.html y todas las
  pantallas del panel (frontend/pantallas/)". No lleva número, así no vuelve a quedar viejo cuando se sume una pantalla.
- **auth.js 207:** el ejemplo de por qué se sale a `/` pasó de `/pages/` a `/pantallas/stock/`.
- **planesCategorias.js 9:** la lista de funciones de arriba decía que `direccionDeFoto` sirve "desde pages/".
  Ahora dice "desde cualquier pantalla". Se había pasado en F5.

**Lo que se dejó a propósito:** pedidoCombos.js 22 dice que el formulario viejo era `pages/formulario.html`, borrado el 17/10.
Es historia y es cierta.

### El control final del front
| Qué se buscó en frontend/ | Resultado |
|---|---|
| `../` (direcciones relativas hacia atrás) | ninguna (solo coinciden bytes sueltos adentro de 2 fotos .jpg) |
| `pages/` | solo el comentario histórico de pedidoCombos.js |
| `src/js` o `src/css` | ninguna |
| Direcciones a `src/` que no son imágenes | ninguna |

### Cómo quedó el front
```
frontend/
  index.html, login.html      ← se quedan en la raíz
  compartido/                 ← lo que usan varias pantallas (17 archivos: roles, guard, api, escape, auth, fechas,
                                 paginacion, global.js, adminSidebar, stockCompartido, pedidosCocina.js y 6 CSS)
  pantallas/                  ← una carpeta por pantalla, con su HTML, su CSS y su JS
    armado  cocina  cocineros  combos  compras  envios  heladera  inicio  login
    movimientos  pedidos  planesCategorias  recetas  stock  tienda  usuarios
  src/assets/img/             ← las imágenes (la base guarda './src/assets/img/…')
```

### Pruebas
| Control | Resultado |
|---|---|
| test heladera | 61/61 |
| Rutas `/api` con requireAuth / públicas | 76 / 13 |
| Archivos faltantes (16 HTML, 182 archivos, 46 direcciones de los JS) | 0 |
| Fotos del panel (`direccionDeFoto`) | 6 de 7 cargan (la que falta es el banner, pendiente 5) |
| Fotos de la web | la única de la carpeta del proyecto es el mismo banner |

---

## Pendientes para DESPUÉS del MVC
1. **CORS bloqueado responde 500 y debería ser 403.**
   - *Hoy:* un sitio no permitido recibe "Error interno del servidor" (500), porque el error de CORS cae en el manejador de errores.
   - *Por qué no se arregla ahora:* mover no es cambiar. Durante el MVC queda igual.
   - *Después:* responder 403 "Origen no permitido", que dice la verdad y no parece una falla del servidor.
2. **`GET /api/v1/productos/:id` es pública y no tiene límite por IP.** Solo `/api/v1/combos` lo tiene, y la regla del CLAUDE.md
   dice que las públicas lo llevan.
3. **El test heladera tendría que crear sus propias viandas al arrancar.** Hoy depende de lo que haya en la heladera:
   el 05/11 dio 2 de 3 porque faltaban "PRUEBA fideos", y hubo que hacer a mano el pedido a cocina #35.
4. **El código mudado tiene cosas que la regla de estilo prohíbe:** `||`, `?.`, `if` de una línea y un `if` adentro de otro.
   Se copiaron igual; ordenarlas es otro paso.
5. **La foto de la categoría "Viandas Saludables" no existe.** En la base dice `./src/assets/img/BANNER-AQUI.jpg`, que es el nombre
   de ejemplo del SQL. Hay que copiar el banner real a `frontend/src/assets/img/` y cambiar ese dato en la base (lo corre el usuario),
   o subir la foto desde la pantalla Planes y categorías.
6. **Las direcciones viejas de las pantallas dan 404 cuando esto llegue a producción.**
   - *El problema:* si alguien guardó un acceso directo (ej: el cocinero, `/pages/cocinero.html` en el celu, o la dueña,
     `/admin.html`), va a ver "Cannot GET".
   - *Lo que sigue andando:* entrar por el login, porque lleva a la dirección nueva.
   - *Qué decidir:* avisar que vuelvan a guardar el acceso después de entrar por el login, o que server.js mande cada dirección
     vieja a la nueva. Eso es un cambio del servidor y va después del MVC.
