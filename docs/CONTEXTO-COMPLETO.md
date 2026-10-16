# CONTEXTO COMPLETO — Fast Good (traspaso de la cuenta vieja a la nueva)

Este archivo junta TODO lo que se habló y decidió en la cuenta vieja, para que el chat nuevo siga igual.
Complementa a `ESTADO-PROYECTO.md` (resumen) y `CLAUDE.md` (reglas para Claude Code).
Fecha: 15/10/2026.

---

## 1. Quién soy y cómo trabajo con vos

- Soy Mauri (Mauricio Rodriguez), Analista en Sistemas (IES 21). Fast Good fue mi tesis (aprobada con 9) y ahora es el sistema real del negocio de viandas de mi prima.
- Hablo en español argentino, muchas veces por audio transcripto (escribo con errores, interpretá la intención).
- **Tu rol:** ser mi guía. Yo no le escribo código a mano casi nunca: Claude Code (extensión de VS Code) programa, y vos:
  1. me armás los prompts para Claude Code,
  2. revisás el plan que me devuelve ANTES de que yo dé el OK,
  3. revisás lo que hizo DESPUÉS (buscás bugs),
  4. me explicás el código para que lo entienda,
  5. me decís cómo probarlo y cuándo hacer commit.
- **Formato que me sirve:**
  - Corto, directo, paso a paso. Nada de párrafos largos.
  - Siempre ENTRADA / SALIDA.
  - Tablas y dibujitos con flechas (`→`, cajitas ASCII) para explicar recorridos.
  - Ejemplos con MIS datos (combo "PRUEBA Mantenimiento x10", fideos, canelones, berenjenas) o ejemplos tontos (la "verdulería": `["naranja","pera","manzana"]`).
  - Cuando pido "explicame el código": código completo con `//` en cada línea o por partes numeradas, marcando dónde NACE una variable, dónde SE USA y dónde TERMINA.
  - SQL siempre con comentario en cada línea.
  - Cuando me trabo escribiendo código yo: pistas o esqueleto. Código completo solo si lo pido ("HACELO", "pasame todo").
- **Lo que más me cuesta:**
  - Seguir el flujo de datos entre funciones: de dónde viene una variable, qué devuelve un `return`, qué es un parámetro.
  - Arrays dentro de objetos dentro de arrays (combos → platos), `for` anidados.
  - Métodos de arrays: `find`, `some`, `filter`, `map`, `flatMap`, `every` (me los explicás con la verdulería).
  - Funciones SQL largas: entiendo la idea (controla → guarda → todo o nada), pero me pierdo en el detalle.
  - HTML lo entiendo bien. CSS no me interesa aprender (lo hace Claude Code).
- **Estilo de código que pido** (también está en CLAUDE.md):
  - Pocas funciones, cada una con un trabajo ENTERO (ej: `renderizarCarrito` hace todo el render). Nada de "Frankenstein" de funcioncitas.
  - `forEach` para recorrer (no `for...of` ni `for` con contador). `find` para buscar uno, `filter` para varios.
  - Nada de `forEach` dentro de otro si se puede evitar (armar antes un objeto `{ id: valor }`).
  - Nada de `? :` (ternario) adentro de los template strings; usar `if/else` antes.
  - Si usa algo no básico (`flatMap`, `some`…), comentario con ejemplo de qué entra y qué sale.
  - `escHtml` en todo lo que va a `innerHTML`.
- **Modos de Claude Code:** modelo Opus (el más fuerte). Effort **High** para pasos normales (🟢) y **Max** para lo delicado (🔴: funciones de la base, pedidos, stock, rutas que crean pedidos). Siempre en modo **Manual** (aprueba cada cambio; se abre una pestaña "[Claude Code]" con el diff rojo/verde).
- Cuido el límite semanal de uso: no gastar Max en todo.

## 2. Cómo te paso lo de Claude Code (formato acordado)

- Te pego (o adjunto como .txt) **el texto tal cual** que me devuelve Claude Code: el PLAN antes de escribir, y el INFORME después ("Listo el paso X…").
- Cuando quiero que revises código de verdad, te pego **el archivo completo** (o la parte). Esto ya encontró bugs reales:
  - `topePorPlato` se calculaba pero no se usaba (armarCombo.js).
  - Un comentario SQL con `$$` adentro rompió la función (Postgres lo toma como cierre).
  - El "Consumidor Final" del servidor era en realidad mi usuario admin.
- Si te sirve, también te puedo pasar `git diff`. Está bien pedírmelo.
- Vos respondés: si está bien o no, qué decirle (prompt listo para pegar), y cómo probarlo.

## 3. Ejemplos REALES de prompts (copiar este formato)

### 🟢 Normal (Effort High)
```
Probado, anda. Seguí con el paso 15: en Consultar Pedidos, el modal Detalles agrupa los platos por combo (nombre del combo + precio, y debajo sus platos con el ⚠ del personalizado). Los pedidos viejos (sin id_pedido_combo) se ven igual que hoy. Mostrame el plan antes.
```

### 🟢 Respuesta a un plan
```
OK a todo: 1) se puede repetir el nombre; 2) límites ok; 3) "🍱 Combos" después de Generar Receta. Lo de la ventana de milisegundos dejalo así. Arrancá con el 16.1 y frená.
```

### 🔴 Modo potente (Effort Max)
```
Seguí con el paso 9: crear_pedido_combos en sql/. Pensá a fondo.
IMPORTANTE: no toques el index viejo ni POST /api/pedidos.
Sí tiene que: ser todo o nada; validar en la base (combo activo, plato en el menú de ese combo y activo, suma justa = cantidad del combo, texto personalizado no vacío y hasta 150); guardar pedidos + pedido_combos + pedido_detalles (precio_unitario = precio del combo / cantidad, personalizado, observaciones_plato); el total sale de combos.precio. Con revoke/grant.
Mostrame el plan antes de escribir y explicame el SQL con comentarios en cada línea.
```

### 🔴 Análisis sin tocar nada (el último que mandé)
```
Pensá a fondo. Antes de conectar la heladera, quiero ENTENDER qué tengo hoy. NO cambies nada, solo analizá y explicame:
1. Las tablas de la heladera ... 2. Las funciones de la base ... 3. Las pantallas y rutas ... 4. Qué está bien/mal/falta ... 5. El circuito completo con flechas ... 6. Qué PANTALLAS habría que cambiar ... 7. El plan en pasos chicos (pantallas AL FINAL).
Escribilo en docs/informe_heladera.md, en español simple, con tablas y ejemplos. Después frená.
```

**Patrón:** (1) qué probé y cómo salió, (2) qué paso sigue, (3) restricciones (no tocar X, no hacer commit), (4) "Mostrame el plan antes" o "Hacelo", (5) "frená".
Cuando hay que cambiar reglas: "Actualicé el CLAUDE.md: releelo completo".

## 4. Cómo trabajamos un paso (rutina)

1. Le mando el prompt → Claude Code devuelve PLAN.
2. Te paso el plan → vos revisás, contestás sus preguntas, me das el "OK, hacelo" listo.
3. Claude Code hace → devuelve INFORME (qué cambió, cómo lo probó, seguridad).
4. Yo pruebo en `localhost:3000` (te mando capturas).
5. **Commit** en GitHub Desktop (revisar que no aparezca `.env`), en mejoras-fastgood.
6. Siguiente paso.

Pruebas con la base real: pedidos de prueba con nombre "PRUEBA – NO PREPARAR". Se **anulan** con el PIN (devuelve las viandas a la heladera).
Nunca pasar a 3 uno con personalizados (descuenta insumos de verdad), ni ninguno a 4 (en 4, anular no devuelve las viandas).
Uno todo de heladera sí puede llegar a 3: no gasta insumos.

## 5. La base de datos (Supabase, base REAL)

> Lo marcado (?) no está confirmado. Para tener el esquema exacto, correr el SQL de la sección 10.

### Tablas y columnas

| Tabla | Columnas (las importantes) |
|---|---|
| **categorias** | id, nombre |
| **planes** | id, nombre, activo, id_categoria → categorias, id_cocinero → usuarios (respaldo), id_cocinero_suplente → usuarios, (codigo?) |
| **productos** (platos) | id, id_plan → planes, nombre, descripcion, imagen (URL bucket `imagenes-productos`), precio, (descuento?), activo, **id_cocinero → usuarios** (el cocinero es POR PLATO), **stock_heladera** (viandas LIBRES en la heladera: las vendidas no cuentan), codigo_plato (?), **stock_minimo** (default 5; no hay pantalla para cambiarlo) |
| **insumos** | id, nombre, unidad_medida (`g`, `ml`, `u`), stock_actual, stock_minimo, categoría, dias_duracion (para calcular vencimiento), activo |
| **producto_insumo** (receta) | id_producto → productos, id_insumo → insumos, cantidad necesaria |
| **movimientos_stock** (libreta de INSUMOS) | id, id_insumo, id_usuario, tipo (ENTRADA/SALIDA…), cantidad, motivo, fecha, id_compra → compras, fecha_vencimiento, (id_pedido?) |
| **compras** | id, id_usuario, fecha, proveedor |
| **usuarios** | id (uuid, `gen_random_uuid()`), nombre, apellido, email (único), contrasena (bcrypt, SIN ñ), telefono, direccion, id_rol → roles (default 4), nombre_usuario (único) |
| **roles** | 1 administrador, 2 cocinero, 3 repartidor, 4 consumidor final, 5 dueño, 6 admin sistema |
| **estados** | 1 Registrado, 2 En Preparación, 3 Listo para Entregar, 4 Entregado, 5 Cancelado |
| **barrios** | id, nombre |
| **pedidos** | id, id_usuario → usuarios, id_estado → estados (default 1), total numeric(10,2), cliente_nombre (200), cliente_direccion, cliente_telefono (30), cliente_email (100), fecha_pedido (default now), fecha_entrega (date), metodo_pago, tipo_entrega (default 'Delivery'), barrio_id → barrios, observaciones, pagado, pago_anticipado, monto_efectivo/tarjeta/transferencia, transferencia_confirmada |
| **pedido_detalles** | id, id_pedido → pedidos, id_producto → productos, cantidad (default 1), precio_unitario (10,2), subtotal (vacío), **listo** (default false), **personalizado** (bool, default false), **observaciones_plato** (texto del personalizado), **id_pedido_combo** → pedido_combos (null en pedidos viejos), **cantidad_de_heladera** (int, default 0, ≥0) |
| **combos** | id, id_plan → planes, nombre, cantidad (>0), precio (≥0), activo |
| **combo_productos** (menú) | id, id_combo → combos (on delete cascade), id_producto → productos, activo, UNIQUE(id_combo, id_producto) |
| **pedido_combos** | id, id_pedido → pedidos, id_combo → combos, precio (el que se cobró) |
| **movimientos_viandas** (libreta de la HELADERA) | id, id_producto → productos, id_usuario → usuarios, id_pedido → pedidos (lo llenan las ventas y devoluciones), id_lote (int SIN clave foránea; NO USAR), tipo CHECK in ('produccion','venta','devolucion','descarte','ajuste'), cantidad (≠0; + entra, − sale), motivo, fecha (default now) |
| **ordenes_produccion** / **orden_produccion_detalles** ("pedidos a cocina") | cabecera: id, id_usuario, fecha_pedido, fecha_para. Detalles: id, id_orden_produccion, id_producto, id_cocinero, cantidad, hecho, fecha_hecho, id_movimiento_vianda → movimientos_viandas, id_pedido_detalle (NO USAR: nadie la usa) |

RLS activado en todas. El servidor usa la `service_role` key.

### Relaciones en palabras (como me gusta)
- Una categoría tiene muchos planes; un plan es de una categoría.
- Un plan tiene muchos platos; un plato es de un plan.
- Un plato lo cocina un cocinero; un cocinero cocina muchos platos.
- Un plan tiene muchos combos; un combo es de un plan.
- Un combo tiene muchos renglones de menú (combo_productos); un plato puede estar en el menú de muchos combos (de cualquier plan).
- Un pedido tiene muchos combos comprados (pedido_combos); cada combo comprado tiene muchos platos (pedido_detalles).
- Un plato tiene muchos movimientos de heladera; un pedido puede tener movimientos de heladera (venta/devolución).
- Un plato tiene muchos insumos (receta) y un insumo está en muchos platos (producto_insumo).

### Usuarios importantes
- **Consumidor Final**: id `b344f2e8-cd3c-42af-953c-7d97cada6c63`, rol 4, email `consumidor.final@fastgood.invalid`, nadie puede entrar. Los pedidos sin sesión van a este usuario. NO BORRARLO.
- `d9b1ae00-fda5-4488-86b3-90d769b47a02` = mi usuario admin (Marcos Medina Carranza, "fede", rol 1). Antes los pedidos de invitados iban a este (error viejo, ya corregido para los nuevos).

### Funciones de la base (todas con revoke/grant solo service_role)
| Función | Qué hace |
|---|---|
| `registrar_compra` | Guarda una compra con sus renglones: compras + movimientos_stock ENTRADA + suma stock_actual. Todo o nada. |
| `crear_pedido_combos` | Parte 1 controla todo (combo activo de plan activo, plato en el menú y activo, enteros, suma justa, personalizado 1–150, **que alcancen las viandas de la heladera**). Parte 2 guarda pedidos + pedido_combos + pedido_detalles y **vende de la heladera** los platos normales (venta −, cantidad_de_heladera = cantidad, listo = true; personalizados 0 y false). Devuelve `{ok, id_pedido, total, combos}` o `{ok:false, error}` (ej. "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12"). |
| `producir_viandas` · `anular_pedido_con_devolucion` · `descartar_viandas` (`sql/heladera.sql`) | Las otras 3 acciones de la heladera: PRODUCIR ("Hecho" de la cocina), DEVOLVER (anular en 1, 2 o 3) y DESCARTAR (con motivo). Todo o nada, con candado. |
| `crear_orden_produccion` | "Pedir a cocina". |
| Viejas, marcadas "NO USAR" | `marcar_detalle_hecho`, `aplicar_produccion_viandas`, `registrar_descarte_vianda` (Render todavía usa la primera y la tercera hasta el merge), `registrar_tanda_viandas`, `registrar_tanda_multiple`. Detalle: `docs/informe_heladera.md` y `docs/INFORME-CAMBIOS-HELADERA.md`. |

### Unidades
La base guarda g / ml / u. La pantalla muestra kg / lts (≥1000). Servidor convierte al guardar (`convertirACantidadBase`), JS al mostrar (`mostrarCantidad`).

## 6. El código (mapa)

### Servidor (`server.js`)
- Middlewares: `requireAuth`, `requireRol(...)`, limitadores (`limitePedidos` 5 cada 10 min por IP, `limiteCatalogo` 60/min), `errorInterno`, `leerToken`, `leerFechaPara`, `hoyArgentina`, `fechas` (días hábiles y feriados).
- Rutas nuevas de combos:
  - `GET /api/v1/combos` (pública): combos activos de plan activo con su menú y `disponibles` (las viandas libres de la heladera, con tope = cantidad del combo).
  - `POST /api/pedidos-combos` (pública + limitePedidos): valida cliente/fecha (48 hs hábiles, 72 con personalizado), usuario del token o Consumidor Final, llama `crear_pedido_combos` (que también vende de la heladera; si no alcanza responde 400 con el mensaje).
  - Panel (roles 6, 5): `GET/POST /api/combos`, `PUT /api/combos/:id`, `PUT /api/combos/:id/activo`, `GET/POST /api/combos/:id/menu`, `PUT /api/combos/:id/menu/:idProducto/quitar`.
- Rutas viejas que importan: `POST /api/pedidos` (formulario viejo), `GET /api/pedidos` (Consultar Pedidos + Reportes), `GET /api/cocina/tareas`, `PUT /api/pedidos/:id/listo-cocinero` (marca listos TODOS los platos de ese cocinero en ese pedido), `POST /api/pedidos/:id/anular` (con PIN; devuelve las viandas con `anular_pedido_con_devolucion`), cambio de estado `PUT /api/pedidos/:id/estado` (estado 2 verifica insumos y 3/4 `descontarStockPedido` los descuenta, **solo de lo que cocina la cocina**: el doble descuento se arregló en H1; de 1 a 2, si no hay nada para cocinar, salta a 3; un anulado no cambia más), `POST /api/compras`.

### Web nueva del cliente (`frontend/index-combos.html`, en paralelo al index viejo)
| Archivo | Funciones |
|---|---|
| `combosCatalogo.js` | `cargarCombos`, `renderizarCategorias`, `renderizarCombos`. Variables: `combosDisponibles`, `categoriaElegida`, `IMAGEN_POR_DEFECTO`. |
| `armarCombo.js` | `abrirModalCombo` (calcula `topePorPlato` restando lo del carrito), `renderizarMenuCombo`, `cambiarCantidadPlato`, `agregarPlatoPersonalizado`, `cambiarCantidadPersonalizado`, `confirmarCombo` (arma `comboArmado`), `cerrarModalCombo`. Variables: `comboEnArmado` (el "molde" del servidor), `cantidadesElegidas` ({idPlato: cant}, la "libreta"), `personalizados`, `totalElegido`. |
| `carritoCombos.js` | `cargarCarrito`, `guardarCarrito` (localStorage `FG_CARRITO_COMBOS`), `agregarAlCarrito`, `quitarDelCarrito`, `renderizarCarrito`, `abrirMiPedido`. Variable `carritoCombos` (el array final). Ícono cuenta COMBOS. |
| `pedidoCombos.js` | El formulario (mismos campos que el viejo: Nombre, Apellido, Dirección, Teléfono, Email, Fecha, Pago, Entrega, Barrio, Observaciones). `abrirCheckout`, `cargarBarrios`, `validarFormulario` (devuelve `datos`), `armarPedido(datos)` (carrito + datos → pedido), `confirmarPedido` (valida → arma → `enviarPedido` → vacía carrito → `mostrarConfirmacion`), `enviarPedido`, `mostrarConfirmacion`, `armarMensajeWhatsApp` (botón, número 5493512294243, alias FAST.GOOD.VA). |
| Reusados sin tocar | `escape.js` (escHtml), `fechas.js`, `api.js` (apiFetch con token), `auth.js` (login), `roles.js`, `guard.js`, `adminSidebar.js`. |

### Panel
- `pages/combos.html` + `gestionCombos.js` (8 funciones: cargarCombos, renderizarCombos, abrirFormularioCombo, guardarCombo, cambiarEstadoCombo, abrirMenuCombo, agregarPlatoAlMenu, quitarPlatoDelMenu). Aviso "no se ve en la web (sin platos / plan desactivado)". Cantidad bloqueada si ya se vendió.
- `pages/cocinero.html` + `cocinero.js`: una fila por pedido (Nº, Entrega, Cliente, Platos [Detalles / Detalles ⚠], Observaciones, Acción [✓ Listo / Solo lectura]). Resumen del turno a la derecha separa "fideos" de "fideos ⚠ sin sal".
- `ListarPedidos.js` (`abrirModalDetalles`): Detalles agrupado por combo (combo + precio, platos sin precio, ⚠). Pedidos viejos igual que antes.
- Compras / Movimientos: `MovimientosStockNuevo.html` + `movimientosStockNuevo.js`.

### Links locales
`http://localhost:3000/index-combos.html` · `/login.html` · `/pages/cocinero.html` · `/pages/combos.html`.

## 7. Decisiones tomadas (incluye las que NO están en ESTADO)

- Combos de cualquier plan en el menú (el Recorrido v2 decía otra cosa: está viejo).
- Precio unitario = precio combo / cantidad (redondeado a centavos). En Detalles los platos de combo van SIN precio.
- Personalizado: texto 1–150, "sin sal" y "SIN SAL" se juntan, sin tope de stock, +1 día hábil.
- Fecha mínima: 2 días hábiles (3 con personalizado). Hoy jueves → lunes; con personalizado → martes.
- Barrio: queda (obligatorio solo con Delivery). Una vez dije sacarlo y después "no importa": se dejó.
- Retiro: sin elegir local. Pago: Efectivo/Transferencia, Efectivo y Delivery vienen elegidos.
- Nombre de combo se puede repetir. Viandas 1–100. Precio 0–9.999.999.
- Cocina: "Listo" es UNO por pedido (marca todos mis platos de ese pedido).
- **Heladera conectada (H5 + H6, 15/10)**: platos de heladera nacen `listo=true` → cocina SOLO ve personalizados; un pedido sin nada para cocinar pasa directo a 3 al moverlo de 1 a 2.
- Tareas de Cocina sigue sirviendo para: pedidos a cocina (producir para la heladera) + personalizados.
- Anular devuelve viandas solo en estados 1, 2, 3 (hecho en H4). Un anulado (5) no cambia más de estado.
- Personalizado SÍ descuenta insumos (se cocina). Viandas de heladera NO (ya se descontaron al producir).
- Nunca `$$` dentro de comentarios en funciones SQL.

## 8. Dónde quedé exactamente (actualizado el 15/10/2026, noche)

- Pasos 1 a 16 de combos: HECHOS y probados (paso 16 = panel Combos, 16.1 a 16.4).
- **Heladera: pasos H0 a H6 hechos y probados; la heladera está conectada a la web nueva.** H7 (marcas "NO USAR" + prueba completa en la web) está en curso.
- El paso que sigue y el próximo prompt están siempre en `docs/HELADERA-AVANCE.md`. Todo lo que cambió, en `docs/INFORME-CAMBIOS-HELADERA.md`.
- Puede haber commits sin push. **Antes de seguir: push de mejoras-fastgood** y en el Proyecto "Sync now".

## 9. Lo que falta (orden)

1. Heladera: terminar H7 (la prueba completa en la web) y después H8 (pantallas), H9 (repasar el código con las reglas) y H10 (Word del recorrido). Ver `docs/HELADERA-AVANCE.md`.
2. Antes de producción: pasar `descontarStockPedido` a una función de la base (hoy busca "pedido #N" en el texto y no es todo o nada).
3. CSS y detalles (personalizados en el modal, texto que se borra al tocar +/−, fecha "a. m.hs" del WhatsApp).
4. Reemplazar el index por `index-combos.html` (+ redirección de admins).
5. Pasar a Rodriguez: desactivar combos PRUEBA (id 1) y "Prueba no usar", limpiar pedidos/compras de prueba, backup, merge, Render (Manual Deploy; el auto-deploy no anda desde el 30/9).
6. Hablar con mi prima: 10% transferencia, máximo de personalizados, cancelar con personalizado ya cocinado, preguntas frecuentes.
7. Más adelante: monitor de caída (UptimeRobot), Sentry, backups, Render pago, PWA, MVC, React.

## 10. SQL para sacar el esquema real (solo lectura) — correr y pasarle el resultado al chat nuevo

```sql
-- A) TABLAS Y COLUMNAS
select table_name, column_name, data_type, is_nullable, column_default        -- tabla, columna, tipo, si puede ser vacía, valor por defecto
  from information_schema.columns                                              -- catálogo de columnas
 where table_schema = 'public'                                                 -- solo la app
 order by table_name, ordinal_position;                                        -- ordenado

-- B) CLAVES Y REGLAS (primarias, foráneas, únicas, checks)
select cl.relname as tabla, con.conname as nombre, pg_get_constraintdef(con.oid) as regla  -- tabla, nombre y la regla
  from pg_constraint con                                                       -- catálogo de restricciones
  join pg_class cl on cl.oid = con.conrelid                                    -- su tabla
  join pg_namespace n on n.oid = cl.relnamespace                               -- su esquema
 where n.nspname = 'public'                                                    -- solo la app
 order by 1, 2;                                                                -- ordenado

-- C) FUNCIONES (nombre, parámetros y código)
select p.proname as funcion,                                                   -- nombre
       pg_get_function_identity_arguments(p.oid) as parametros,                -- qué recibe
       pg_get_functiondef(p.oid) as codigo                                     -- el código completo
  from pg_proc p                                                               -- catálogo de funciones
  join pg_namespace n on n.oid = p.pronamespace                                -- su esquema
 where n.nspname = 'public'                                                    -- solo la app
 order by 1;                                                                   -- ordenado

-- D) RLS Y POLÍTICAS
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;  -- qué tablas tienen RLS
select tablename, policyname, cmd, roles, qual from pg_policies where schemaname = 'public' order by 1;  -- políticas
```
Correr de a una ("Run selected") y exportar cada resultado como CSV.
