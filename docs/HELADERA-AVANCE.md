# Heladera — avance del refactor (17/10/2026)

Leer junto con `ESTADO-PROYECTO.md`, `CLAUDE.md` y `docs/informe_heladera.md`. Este archivo dice **dónde estamos parados** en la heladera.
Se actualiza al terminar cada paso: estado, resultados y el próximo prompt.

**REGLA (desde el 15/10):** todo lo que se cambie (código, SQL, pantallas) se agrega también a `docs/INFORME-CAMBIOS-HELADERA.md`,
con el mismo formato: antes / ahora, por qué, ENTRADA / SALIDA, ejemplo con fideos y conexiones (pantalla, ruta, tablas).

## La idea: 4 acciones, una función de la base por acción
Las tablas NO cambian. Se reordena el código.

| Acción | Cuándo | Heladera | Insumos | Función de la base |
|---|---|---|---|---|
| PRODUCIR | Cocina toca "Hecho" en un pedido a cocina | + N | − receta × N | `producir_viandas` (nueva) |
| VENDER | Se crea un pedido de combos | − platos normales | nada | adentro de `crear_pedido_combos` |
| DEVOLVER | Se anula un pedido en estado 1, 2 o 3 | + lo que se llevó | nada | `anular_pedido_con_devolucion` (nueva) |
| DESCARTAR | Se tiran viandas (motivo obligatorio) | − N | nada | `descartar_viandas` (nueva) ✅ |

Reglas de las 4: todo o nada, candado (`for update`) en orden por id, `set search_path = public`, `revoke` a public/anon/authenticated + `grant` a service_role, comentario en cada línea, nunca `$$` adentro.

Se crean funciones NUEVAS (no se cambian las viejas) porque Render (rama Rodriguez) usa la misma base: las viejas tienen que seguir andando hasta el merge. Las viejas se marcan "NO USAR" en H7.

## Decisiones tomadas
1. Personalizados: no salen de la heladera (`cantidad_de_heladera` = 0, `listo` = false) y gastan insumos al pasar el pedido a 3.
2. Platos de heladera: `cantidad_de_heladera` = cantidad y `listo` = true → la cocina solo ve personalizados.
3. Insumos de los pedidos = receta × (`cantidad − cantidad_de_heladera`). NULL cuenta como 0.
4. "Nada para cocinar → 3": pasa **al moverlo a 2** (no al crearlo), porque 1→2 es cuando mi prima confirma el pago y Envíos muestra 3 y 4.
5. Anulado (5) es final: no cambia más de estado (servidor y grilla).
6. En estado 4, anular no devuelve viandas.
7. `producir_viandas` NO mira `id_pedido_detalle` (H0: ningún renglón lo usa).
8. NO USAR: comentario en el `.sql` + `comment on function` en la base.
9. Login: sin emails en los logs, "Login fallido" igual en los dos casos.
10. (H8) Reservadas = suma de `cantidad_de_heladera` (NO `cantidad`) de los pedidos en 1, 2 o 3. Los personalizados y los pedidos de la web vieja tienen 0; en 4 ya se entregaron y en 5 volvieron a las libres.
11. (H8) El mínimo de un plato se cambia desde Producción: roles 6, 5 y 1, entero de 0 a 9999 (0 = sin control). El cocinero lo ve, pero no lo cambia.
12. (H8) La Parte 1 va en tres paradas (Producción → Consultar Pedidos → cocina y web nueva), con prueba en la web después de cada una. Archivos nuevos: `pedirCocina.js` (parada 1) y `pagoPedido.js` (parada 2).
13. (16/10) **Cambio de plan: todo de una vez** (paradas 2 y 3 y la Parte 2 de H9), con un test por las rutas al final (`node tests/test_e2e.js heladera`), en vez de probar en la web después de cada parada.
14. (16/10) Parada 3: se reescribe la tabla de `movimientosStockNuevo.js` (el modal de compra NO se toca); C1 va como 3B; el menú: la nueva se llama "📋 Movimientos de Stock" y la vieja "Movimientos (viejo)" hasta que ande "− Registrar salida"; no se borran archivos.
15. (16/10) Filtros de Movimientos de Stock: un movimiento se ve si ALGUNA de sus partes coincide (una producción aparece en Viandas + Entradas y en Insumos + Salidas). Lo cargado a mano es "Ajuste"; las fechas arrancan en los últimos 30 días; una producción sin pedido a cocina es "Tanda vieja".
16. (16/10) **Estilo nuevo** (CLAUDE.md, sección "Estilo"): nunca un `if` adentro de otro, `||` para los valores por defecto, `switch` "según sea", tablas en vez de `if / else if`, salir temprano, ternario simple solo fuera del HTML, condiciones con nombre. Se aplicó a todo lo de este paso sin cambiar lo que hace (comparado lo viejo con lo nuevo).

## Resultados de H0 (revisión de la base, solo lectura)
- `id_pedido_detalle` existe, 0 renglones lo usan.
- Las 7 funciones de hoy instaladas (aplicar_produccion_viandas, crear_orden_produccion, crear_pedido_combos [11 parámetros, una sola], marcar_detalle_hecho, registrar_descarte_vianda, registrar_tanda_multiple, registrar_tanda_viandas). Ninguna ejecutable por anon ni authenticated.
- Todo cuadra: berenjenas rellenas 21, canelones 11, fideos 71 (cuaderno = 103).
- Cuaderno: solo "produccion", 15 renglones, 3 con id_lote (historia).
- Pedidos de combos #5 y #6 estaban abiertos → hay que anularlos (el #6 tiene 4 personalizadas: NO pasarlo a 3).
- Todos los platos activos tienen receta → la prueba real de PRODUCIR se saltea; queda solo la "de mentira".

## Pasos

| Paso | Qué | Estado |
|---|---|---|
| H0 | Revisar la base (`sql/heladera_revisar.sql`) | ✅ |
| H1 | `server.js`: insumos = cantidad − cantidad_de_heladera, errores `{ status, error }` (409 falta insumo / 500 interno), sin logs de debug, login sin email | ✅ probado con base falsa |
| H2 | DESCARTAR: bloque 1 de `sql/heladera.sql` + pruebas `sql/heladera_probar.sql` + 1 línea en la ruta de descarte | ✅ 1A 8/8 "sí", 1B 71→69 y se deshizo, 1C 71 con 0 renglones, consola 409 con « » |
| H3 | PRODUCIR: bloque 2 + pruebas 2A/2B/2C + 1 línea en la ruta "Hecho" | ✅ 2A 4/4 "sí"; 2B fideos 71→73, renglón 18 "produccion +2 · Pedido a cocina #9", Harina integral 8700→8100 (−600 g), Huevo −35→−39 (−4 u) con aviso `insumo_corto`, hecho: sí, y se deshizo; 2C fideos 71, insumos como antes, último pedido a cocina 8; consola 409 "El plato del pedido no existe" |
| H4 | DEVOLVER + anulado final (bloque 3, server.js, ListarPedidos.js) | ✅ probado en la web: bloque 3 instalado, servidor reiniciado, #5 y #6 anulados (quedan "Cancelado", botón "Anulado" gris, no deja anular otra vez). Commit "h4" |
| H5 | Nada para cocinar → 3 al pasar de 1 a 2 (server.js + ListarPedidos.js) | ✅ probado en la web: 10 fideos → bajó 10; de 1 a 2 saltó solo a "Listo para Entregar"; anulado → volvieron 10 |
| H6 | VENDER adentro de `crear_pedido_combos` (EL INTERRUPTOR). Candado a todos los platos del pedido, ordenados por id_producto | ✅ probado en la web: 8 fideos + 2 "sin sal" → bajó 8 (los "sin sal" no); anulado → volvieron 8. Dos ventanas con canelones: la segunda dio "No quedan suficientes viandas… quedan 6" y no creó el pedido. Todo volvió a los números del principio. Commit hecho |
| H7 | Prueba completa real + marcas NO USAR + actualizar `informe_heladera.md` | ✅ Bloque 4 corrido: la 4A dio 12 filas en "sí". La prueba completa en la web se salteó (decisión del usuario). ⚠ En git el último commit es `db441dc` "funcionan los combos" (H5 + H6): los archivos de H7 siguen sin commitear |
| **H8** | **Pantallas: `heladera.js`, `pedidosCocina.js`, `ListarPedidos.js` y sus rutas reescritos con mis reglas + reservadas, filtros de movimientos, mínimo editable, "Volvieron N viandas", recargar combos y Pago bloqueado en anulados** (el Word pasó a H10) | ✍ **Paradas 1, 2 y 3 (3A, 3B, 3C) escritas.** 16/10: SQL corrido (los 6 bloques: Success), compra de 60 huevos cargada, **test HELADERA 40/40** (pedidos de prueba #11 y #12 creados y anulados; la heladera quedó igual). Falta: mirar las pantallas (lista en "Después del SQL") |
| **H9** | **REFACTOR PARA ENTENDER (Parte 2): las 4 funciones de `heladera.sql`, `crear_pedido_combos` y las rutas de `server.js` que las llaman**, con las reglas de CLAUDE.md y ENTRADA/SALIDA arriba de cada función, sin cambiar lo que hacen (mismas entradas, salidas y mensajes) | ✍ **Escrito** con el estilo nuevo (también las pantallas de H8) y **comparado** lo viejo con lo nuevo (sección 9.2 del INFORME): todo igual. 16/10: SQL corrido; el test HELADERA pasó por las rutas nuevas (40/40) |
| H10 | RECORRIDO COMPLETO: un Word de punta a punta con fideos (producir → vender → cocina con personalizado → pasar a 3 → entregar/anular → descartar), con pantalla, ruta, función, tablas y números en cada paso, y el DER actualizado | |

**Orden para probar H4 → H6 (acordado el 15/10):** ✅ hecho (H4 probado → servidor con H5 → #5 y #6 anulados → SQL de H6 → pruebas en la web).
Desde el 15/10 **la heladera está conectada**: la web nueva saca de la heladera al vender y anular devuelve.

Commits: H1 + H2 en uno solo (`H1 + H2: insumos solo de cocina, errores simples, login sin email, descartar_viandas`).
H3: el código está en "avancess" (las pruebas no pidieron cambios); los resultados, en el commit del doc.
H4: commit "h4". H5 + H6: commit "funcionan los combos". H7: todavía sin commitear (está junto con la parada 1 de H8).
Informe de todo lo que cambió: `docs/INFORME-CAMBIOS-HELADERA.md` (se agrega cada cambio nuevo, ver la REGLA de arriba).

## H3 — revisión y resultado (15/10)
- `producir_viandas` hace lo mismo que `marcar_detalle_hecho` + `aplicar_produccion_viandas` (modo flexible): mismos textos, mismos errores y avisos, misma respuesta, mismo `id_movimiento_vianda` y mismos candados. En `server.js` solo cambió el nombre de la función.
- Única diferencia: con un insumo en 0 en la receta que ya está en negativo, la vieja avisaba "Faltaron…" y la nueva no. **Decisión: queda como está.**
- Probado el 15/10: resultados en la tabla de arriba.
- Ya estaba así antes (para H8): la pantalla muestra "Ya estaba marcado." con cualquier 409, aunque el error sea otro.

## H4 — qué se hizo y resultado (15/10)
- `sql/heladera.sql`, bloque 3: `anular_pedido_con_devolucion(p_id_pedido, p_id_usuario)`. En 1, 2 o 3 devuelve, plato por plato, −(ventas + devoluciones) de ese pedido en el cuaderno (renglón "devolucion" + "Anulación del pedido #N"); en 4 no devuelve; pasa a 5. Responde `{ ok, viandas_devueltas }`. Pruebas 3A, 3B y 3C en `sql/heladera_probar.sql` (no hizo falta correrlas: se probó desde la web).
- `server.js`: la ruta anular llama a la función (mismo PIN, roles y límite; id entero > 0); `PUT /estado` controla pedido y estado (400), 404 si no existe, 409 si está anulado; `cambiarEstadoPedido` no revive un anulado (`.neq('id_estado', 5)` + `.maybeSingle()`).
- `ListarPedidos.js`: un anulado tiene el select bloqueado.
- Probado en la web: #5 y #6 anulados, quedan "Cancelado", con el botón "Anulado" gris y sin poder anularse otra vez.

## H5 + H6 — qué se hizo y resultado (15/10)
Resultado en la web (15/10), todo volvió a los números del principio:
- **a.** 8 fideos + 2 "sin sal" → fideos bajó 8. Al pasarlo a 2 frenó con "Stock insuficiente" por el Huevo en −35:
  es lo esperado (los 2 "sin sal" necesitan 4 huevos y en 2 se revisan los insumos de lo que cocina la cocina).
  Por eso no se pudo ver la cocina con el personalizado: queda para H7, con la compra de huevos cargada. Anulado → volvieron 8.
- **b.** 10 fideos → bajó 10; de 1 a 2 saltó solo a "Listo para Entregar"; anulado → volvieron 10.
- **c.** Dos ventanas comprando canelones: la segunda dio "No quedan suficientes viandas… quedan 6" y no creó el pedido; el de la primera se anuló.

Qué se hizo:
- **H6, `sql/pedido_combos_funciones.sql`** (`crear_pedido_combos`, mismas entradas y salida):
  - Parte 1, controles nuevos: 11) lista de ventas: por plato, las viandas normales sumando todos los combos; 12) candado a TODOS los platos del pedido, en orden de número; 13) si no alcanza → "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12" (no se guarda nada).
  - Parte 2: platos normales con `cantidad_de_heladera = cantidad` y `listo = true`; personalizados con 0 y `false`; 16) por cada plato de la lista: renglón "venta" (−N) con el pedido, el usuario del pedido y "Pedido #N", y la heladera baja N.
- **Pruebas 6A, 6B y 6C** en `sql/pedido_combos_probar.sql` (opcionales: se deshacen solas).
- **H5, `server.js`, `PUT /estado`:** de 1 a 2, si el pedido tiene platos y ninguno va a la cocina (cantidad − cantidad_de_heladera = 0 en todos), queda en 3.
- **H5, `ListarPedidos.js`, `cambiarEstadoPedido`:** muestra el estado que guardó el servidor y, si saltó a 3, avisa "Pedido #N: todo sale de la heladera, pasó directo a Listo para Entregar."
- `server.js`: solo cambió el comentario de la ruta `POST /api/pedidos-combos` (ya no dice "SIN HELADERA"). Su código no cambia por H6.

Cómo se instaló: servidor reiniciado (H5) y `sql/pedido_combos_funciones.sql` corrido entero (líneas 43–389).
Las pruebas 6A, 6B y 6C de `sql/pedido_combos_probar.sql` quedan disponibles (se deshacen solas); no hizo falta correrlas.

## H7 — qué se hizo y cómo probarlo (15/10)
Decisiones: producir y descartar de verdad, **solo con comida real** (ya se probaron con 2B y 1B); "USAR" en las 4 funciones nuevas; también se actualizan ESTADO-PROYECTO y CONTEXTO-COMPLETO.

Qué se hizo:
- `sql/heladera.sql`, **bloque 4** (líneas 473–515): solo comentarios en la base (`comment on`). "NO USAR" en `marcar_detalle_hecho`, `aplicar_produccion_viandas`, `registrar_descarte_vianda`, `registrar_tanda_viandas`, `registrar_tanda_multiple`, `movimientos_viandas.id_lote`, `movimientos_viandas_lote_seq` y `orden_produccion_detalles.id_pedido_detalle`; "USAR" en las 4 nuevas. No cambia lo que hacen: Render sigue andando y no hace falta reiniciar.
- `sql/heladera_probar.sql`, **4A** (líneas 538–584): comprueba las 12 marcas (solo lee).
- Comentarios "NO USAR" en `sql/Produccion.sql`, `sql/stock_viandas_funciones.sql` (y se corrigió el comentario de la ruta `/tanda`) y `sql/stock_viandas_lotes.sql`; comentarios de `sql/heladera_revisar.sql` al día. No hay que correr nada de eso.
- Documentos: `informe_heladera.md` (cómo quedó todo), `ESTADO-PROYECTO.md`, `CONTEXTO-COMPLETO.md` y la sección 7 de `INFORME-CAMBIOS-HELADERA.md`.

Cómo probarlo, en orden:
1. Cargar la compra de huevos (Compras). En Stock, Huevo deja de estar en negativo. Anotar los números de partida: Producción (fideos, canelones) y Stock (harina integral, huevo).
2. Pruebas en la web ("PRUEBA – NO PREPARAR", Efectivo, cuando tu prima no esté cargando):

   | # | Qué hacés | Qué tiene que pasar |
   |---|---|---|
   | a | Web nueva: 1 combo con 8 fideos + 2 "sin sal" (Retiro) | Producción: fideos −8. Últimos movimientos: "Venta −8 · Pedido #A" |
   | b | Consultar Pedidos: #A de 1 a 2 | Ahora sí pasa (hay huevos) y queda en 2. Harina y huevo **no cambian** (en 2 solo se revisan) |
   | c | Tareas de Cocina (como admin y, si tenés, con un usuario cocinero) | #A aparece solo con "2 fideos ⚠ sin sal"; los 8 de heladera no aparecen |
   | d | ⚠ No tocar "✓ Listo" (gastaría 600 g de harina y 4 huevos reales). Anular #A | Fideos vuelve a su número. "Devolución +8 · Anulación del pedido #A". #A Cancelado y fuera de la cocina |
   | e | Web nueva: 1 combo con 10 fideos, **Delivery** con barrio | Producción −10 |
   | f | #B de 1 a 2 | Salta solo a "Listo para Entregar" con el cartel. En Envíos (fecha de entrega de #B) aparece #B. No está en la cocina, y en Movimientos de Stock no hay insumos nuevos |
   | g | ⚠ No marcarlo Entregado (anular en 4 no devuelve). Anular #B | +10 y sale de Envíos |
   | h | Web nueva: 1 combo con 10 canelones, todos "sin sal" (más de los que hay) | Se crea igual (un personalizado no mira la heladera) y canelones no cambia. Anularlo: no vuelve nada |
   | i | Al final | Producción y Stock iguales al paso 1 (salvo la compra de huevos); ningún pedido de prueba abierto |

3. Supabase → SQL Editor: **bloque 4 de `sql/heladera.sql`, de la línea 473 (`begin;`) a la 515 (`commit;`)** → Run.
4. `sql/heladera_probar.sql`, **4A (líneas 538–584)** → Run: 12 filas, todas con `esta_bien` = "sí".
5. `sql/heladera_revisar.sql` **entero** (solo lee) → Run: en la pregunta 2, cada función con su comentario ("NO USAR…" o "USAR…"; `crear_orden_produccion` sale "(sin comentario)", y está bien); en la 3, todos los platos "sí cuadra"; en la 5, ningún pedido de combos abierto.
6. Commit.

## H8 — parada 1 (Producción): qué se hizo y cómo probarlo (15/10)
Qué se hizo (detalle, con antes/ahora, en la sección 8.1 de `INFORME-CAMBIOS-HELADERA.md`):
- `heladera.js` reescrito con las reglas: de 54 funciones a 12. La ventana "Pedir a cocina" pasó a `pedirCocina.js` (nuevo, 7 funciones, hace lo mismo).
- Tabla con 8 columnas: Plato · Plan · **Libres** · **Reservadas** · **En heladera** · **Mínimo** (casillero con ✓ para roles 6, 5 y 1) · Estado · Acciones. El estado y "Descartar" miran solo las libres.
- "Últimos movimientos": filtros Todos / Producción / Ventas / Devoluciones / Descartes y "Ver más" (de a 50).
- "Descartar" dice "libres: N (las M reservadas no se pueden descartar)".
- `server.js`: `GET /api/viandas-stock` trae `reservadas` y `en_heladera`; **nueva** `PUT /api/viandas-stock/:id/minimo` (roles 6, 5 y 1; entero de 0 a 9999; plato activo); `GET /api/movimientos-viandas` con `?tipo=` (lista cerrada) y `?desde=`. `leerItemsViandas`, `POST /api/ordenes-produccion` y `GET …/hechos-hoy`: solo las reglas, hacen lo mismo (`leerItemsViandas` comparada con la vieja en 21 casos: iguales).
- `heladera.html` (8 columnas, filtros, "Ver más", `onclick` nuevos, script nuevo) y `heladera.css` (estilos nuevos al final).
- **No hay SQL para correr.** Solo reiniciar el servidor y recargar la página (Ctrl+F5).

Cómo probarlo (cuando tu prima no esté cargando; el pedido de prueba se crea y se anula solo desde el servidor nuevo):

| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís Producción como admin | 8 columnas. Sin pedidos de la web nueva sin entregar: Reservadas 0 y En heladera = Libres |
| 2 | Web nueva: comprás 10 fideos y recargás Producción | fideos: Libres 61 · Reservadas 10 · En heladera 71 (con 71 de partida) |
| 3 | Mínimo de fideos: 100 y ✓ | "Bajo", aparece "Te faltan…" y el aviso "Mínimo de «fideos»: 100" |
| 4 | Mínimo `abc`, `2.5` o `-3`, y ✓ | Aviso rojo "El mínimo tiene que ser un número entero de 0 a 9999." y no cambia nada |
| 5 | Mínimo de fideos otra vez en 5, con Enter | Vuelve a "Bien" |
| 6 | "Descartar" en fideos: abrís y Cancelar | "fideos — libres: 61 (las 10 reservadas no se pueden descartar)" |
| 7 | Filtros de "Últimos movimientos" | Cada uno muestra solo su tipo; en Ventas: "−10 fideos · Venta · … · Pedido #N" |
| 8 | "Ver más" (si aparece) | Agrega los 50 siguientes abajo (si no aparece, hay menos de 50) |
| 9 | Anulás el pedido de prueba y recargás Producción | fideos: Libres 71 · Reservadas 0 · En heladera 71; en Devoluciones "+10 fideos" |
| 10 | "+ Pedir a cocina": "Mostrar", −, +, "A cada uno", "Repartir", "Limpiar" | Igual que antes. Cerrar con la × **sin enviar** |
| 11 | "Pendientes de cocina" y "Hecho hoy" | Igual que antes; el botón dice "Pendientes de cocina (N)" |
| 12 | Como cocinero | El mínimo es un número (sin casillero), sin "+ Pedir a cocina" ni "Te faltan…" |
| 13 | (Opcional) Consola, como cocinero: `apiFetch('/api/viandas-stock/7/minimo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_minimo: 3 }) }).then(r => r.status)` | `403` |

## H8 paradas 2 y 3 + H9 — qué se hizo y cómo seguir (16/10)
Plan aprobado el 16/10 (decisiones 13 a 16). Detalle de todo, con antes/ahora, en las secciones 8.2 a 9 de `INFORME-CAMBIOS-HELADERA.md`.

| Parte | Qué se hizo | Archivos |
|---|---|---|
| Parada 2 | Consultar Pedidos reescrito (37 → 13 funciones) + `pagoPedido.js` nuevo (5). Un anulado no se cobra (Pago gris y rutas `/pagado`, `/transferencia-confirmada` y `/pago` → 409). "Volvieron N viandas a la heladera". El aviso del pago dice el estado que quedó | `ListarPedidos.js`, `pagoPedido.js` (nuevo), `ConsultarPedidos.html`, `server.js` |
| Parada 3A | `pedidosCocina.js` (11 → 3): "Hecho" muestra el motivo real de la base. La web nueva vuelve a pedir los combos si no alcanzan las viandas | `pedidosCocina.js`, `combosCatalogo.js`, `pedidoCombos.js` |
| Parada 3B (C1) | Columna `movimientos_stock.id_pedido` + función `descontar_insumos_pedido` (todo o nada, una sola vez, con quién fue, convive con Render). `server.js` la llama | `sql/insumos_pedido.sql` (nuevo), `sql/insumos_pedido_probar.sql` (nuevo), `server.js` |
| Parada 3C | `GET /api/movimientos` (insumos y viandas juntos, de a 1000 hasta tener todo) y la tabla nueva de Movimientos de Stock (9 columnas, Detalle Ver/Ocultar, filtros). Menú: "📋 Movimientos de Stock" (la nueva) y "Movimientos (viejo)" | `server.js`, `movimientosStockNuevo.js` (solo la tabla), `MovimientosStockNuevo.html`, `movimientosStockNuevo.css`, `roles.js` |
| H9 | Estilo nuevo en todo lo anterior + `heladera.js`, `pedirCocina.js`, las rutas y las funciones de la base, **sin cambiar lo que hacen** (lo único a propósito: el descarte con `id_producto` ≤ 0 da 400 antes de ir a la base) | todos los de arriba + `sql/heladera.sql` (bloques 1–3) y `sql/pedido_combos_funciones.sql` |
| Test | Sección HELADERA nueva en `tests/test_e2e.js` (corre sola con `node tests/test_e2e.js heladera`) | `tests/test_e2e.js` |

### El SQL, todo junto y en orden (Supabase → SQL Editor; cada bloque de `begin;` a `commit;` → Run)
| # | Archivo | Líneas | Qué hace | ¿Obligatorio? |
|---|---|---|---|---|
| 1 | `sql/insumos_pedido.sql`, bloque 1 | 34–46 | Columna nueva `movimientos_stock.id_pedido` (+ índice y cartel). Solo agrega | **Sí** (la usan el bloque 2 y `GET /api/movimientos`) |
| 2 | `sql/insumos_pedido.sql`, bloque 2 | 66–226 | Función `descontar_insumos_pedido` | **Sí** (sin ella, pasar un pedido a 3 o 4 da error) |
| 3 | `sql/heladera.sql`, bloque 1 | 47–141 | `descartar_viandas` ordenada (H9: solo comentarios) | Recomendado (deja la base igual que el archivo) |
| 4 | `sql/heladera.sql`, bloque 2 | 171–335 | `producir_viandas` ordenada (H9: solo comentarios) | Recomendado |
| 5 | `sql/heladera.sql`, bloque 3 | 365–479 | `anular_pedido_con_devolucion` ordenada (H9: la devolución en pasos, mismo resultado) | **Sí** (para tener lo de H9) |
| 6 | `sql/pedido_combos_funciones.sql` | 57–401 | `crear_pedido_combos` ordenada (H9: pasos 9 y 15 sin if adentro de if, mismos mensajes) | **Sí** (para tener lo de H9) |

El bloque 4 de `sql/heladera.sql` (las marcas de H7) **no** hace falta: los carteles quedan aunque la función se vuelva a crear.
Todo se puede correr más de una vez. Render (rama Rodriguez) sigue andando: no cambia ninguna entrada ni salida.

Pruebas en SQL (opcionales, se deshacen solas; seleccionar cada parte con el mouse → Run):
| Archivo | Parte | Líneas | Qué tiene que salir |
|---|---|---|---|
| `sql/insumos_pedido_probar.sql` | A | 13–33 | 3 filas con `coincide` = "sí" |
| | B | 36–135 | ERROR en rojo a propósito "FIN DE LA PRUEBA…" con: B1 descontó (o "Stock insuficiente…" si falta huevo), B2 `ya_descontado: true`, B3 `ya_descontado: true` (renglón viejo), B4 "Un pedido anulado no descuenta insumos" |
| | C | 138–147 | `0` y `0` |
| `sql/heladera_probar.sql` | 3A · 3B · 3C | 318–364 · 367–493 · 496–524 | Como en H4 (anular, después de H9) |
| `sql/pedido_combos_probar.sql` | 6A · 6B · 6C | 139–211 · 214–340 · 343–360 | Como en H6 (vender, después de H9) |

### Resultado del test HELADERA (16/10, 08:46): 40 pasaron, 0 fallaron, 0 avisos
Combo «PRUEBA Mantenimiento x10» y berenjenas rellenas (21 libres al empezar). Pedido **#11** (10 berenjenas) → libres
21→11, reservadas 0→10; "no alcanza" con 10 canelones (quedaban 6): 400 con el mensaje y ningún pedido nuevo; pedido
**#12** (8 berenjenas + 2 "sin sal (PRUEBA)") → libres 11→3, reservadas 10→18; #11 de 1 a 2 saltó a 3 (0 insumos
descontados); #12 de 1 a 2 quedó en 2 (alcanzaron los insumos, con la compra de huevos); filtros y Movimientos de Stock
con las ventas y la devolución; mínimo 400/403; anular #11 → volvieron 10 y #12 → volvieron 8; un anulado → 409 en estado,
pagado, pago, transferencia y anular otra vez; `descontar_insumos_pedido` sin usuario / no existe / anulado → sus mensajes.
Al final: berenjenas 21 libres y 0 reservadas, canelones 6 y 0 (igual que al empezar). Los dos pedidos se llaman
"PRUEBA – NO PREPARAR", con entrega el 22/10/2026, y quedaron Cancelados.

### Después del SQL
1. Reiniciar el servidor (siempre DESPUÉS del SQL). (16/10: ya estaba prendido desde las 08:40 con el código nuevo.)
2. `node tests/test_e2e.js heladera` (con el servidor prendido). Crea pedidos "PRUEBA – NO PREPARAR" y los anula; no marca
   Hecho, no descarta, no carga compras, no pasa a 3 o 4 nada con personalizados; guarda la heladera de los platos que usa y
   al final comprueba que quedó igual (si no, en rojo). Manda 3 pedidos por la web: para correrlo otra vez, esperar 10
   minutos o reiniciar el servidor. Correrlo cuando tu prima no esté cargando.
3. Mirar las pantallas (lista corta):

| Pantalla | Qué mirar (con los datos del test del 16/10) |
|---|---|
| Consultar Pedidos | "Ver todos" (o Desde y Hasta = 22/10): #11 y #12 "PRUEBA – NO PREPARAR", Cancelado (select rojo claro y apagado), "Pago" gris que no abre, "Anulado" gris. Detalles de #12: «PRUEBA Mantenimiento x10» con 8 berenjenas rellenas y 2 con "⚠ sin sal (PRUEBA)". Escape cierra la ventana. En "Producción de hoy" no aparecen (son del 22/10 y están anulados) |
| Producción | Berenjenas rellenas: 21 libres · 0 reservadas · 21 en heladera; canelones 6 · 0 · 6. Últimos movimientos: Ventas "−10 · Pedido #11" y "−8 · Pedido #12"; Devoluciones "+10 · Anulación del pedido #11" y "+8 · … #12". El resto, como en la parada 1 |
| Tareas de Cocina | #12 no aparece (está anulado). Lo demás, igual (no tocar "Hecho" sin comida real) |
| Web nueva | «PRUEBA Mantenimiento x10»: berenjenas rellenas deja elegir hasta 10 y canelones hasta 6 |
| 📋 Movimientos de Stock (menú) | Abre la página nueva con los últimos 30 días y 9 columnas: la compra de huevos (con "+ Registrar compra": Compra #N · ▲ · 1 insumo · Ver → Huevo 60 u con su vencimiento; si se cargó en la página vieja, sale como Ajuste ▲ con su motivo), las ventas de #11 y #12 (Venta · Pedido #011 / #012 · ▼ · 10 y 8 viandas) y sus devoluciones (Pedido #011 anulado · ▲). Filtros: Insumos → la compra; Viandas + Salidas → las 2 ventas; Viandas + Entradas → las 2 devoluciones; buscar "huevo" o "berenjenas". "Ver" / "Ocultar" con la flechita. "Movimientos (viejo)" sigue andando |

## Cómo se prueba cada paso SQL
1. Correr el bloque del paso en `sql/heladera.sql` (de `begin;` a `commit;`).
2. En `sql/heladera_probar.sql`, seleccionar con el mouse cada parte y Run:
   - Casos que fallan → columna `coincide` = "sí" en todas.
   - Caso "de mentira" → termina con un ERROR en rojo a propósito ("FIN DE LA PRUEBA…"); Postgres deshace todo.
   - Comprobar → que no quedó nada guardado.
3. Reiniciar el servidor (siempre DESPUÉS del SQL).
4. Prueba desde la consola del navegador, logueado como admin, que no guarde nada:
   - H2: descartar 999 → 409.
   - H3: `const r = await apiFetch('/api/ordenes-produccion/detalles/999999/hecho', { method: 'POST' }); console.log(r.status, await r.json());` → 409.
   - H4 y H5 + H6: se probaron (o se prueban) desde la web.
5. Commit.
Nota: cada caso de mentira gasta números de id que no vuelven (H2: renglón 17 del cuaderno; H3: renglón 18 y pedido a cocina #9; H4: 2 números de pedido y algunos del cuaderno; H6: 6A y 6B gastan hasta 4 números de pedido).

## Arreglar después de H7 (anotado, no meter antes)
- ✍ (escrito en H8, parada 3B, falta correr el SQL) `descontarStockPedido` controla "ya descontado" buscando el texto "pedido #500" en el motivo → también encuentra "pedido #5000". Y un movimiento cargado a mano con "pedido #012" en el motivo haría que el pedido #12 no descuente nunca → ahora `id_pedido` o el motivo exacto.
- ✍ (ídem) `descontarStockPedido` descuenta insumo por insumo (no todo o nada) y no guarda quién fue → ahora `descontar_insumos_pedido` en la base.
- Huevo está en −35 en la base real: falta cargar compras o hacer un ajuste. (La compra se carga antes de las pruebas de H7. Mientras siga en negativo, ningún pedido con personalizados que lleven huevo puede pasar a 2: lo mostró la prueba "a" de H6.)
- El aviso `insumo_corto` calcula "falta" = necesario − disponible. Con stock negativo se lee raro: la prueba de H3 usó 4 huevos y dijo "falta 39" (4 − (−35)).
- ✍ (H8, 3B) Choque raro (H4): si anulan un pedido justo mientras otro lo pasa a 3, no revive (por el `.neq`), pero los insumos de sus personalizados ya se descontaban → ahora `descontar_insumos_pedido` pone candado al pedido y no descuenta un anulado ("Un pedido anulado no descuenta insumos").
- ✍ (H8, parada 2) El cartel "Volvieron N viandas a la heladera" al anular.
- ✍ (H8, parada 2) Un pedido cancelado ya no se puede cobrar: "Pago" gris y las rutas `/pago`, `/pagado`, `/transferencia-confirmada` → 409.
- ✍ (H8, parada 2) Si al confirmar el pago el pedido salta a 3 y falla el registro del pago, el aviso dice el estado que quedó.
- ✍ (H8, parada 3A, B7) Si la web nueva recibe "No quedan suficientes viandas…", vuelve a pedir los combos.
- **Vencimiento de las viandas** (columna nueva): hoy solo tienen vencimiento los insumos de las compras (`movimientos_stock.fecha_vencimiento`). Anotado para más adelante: **NO hacerlo ahora**.
- Movimientos de Stock: en la página nueva, "− Registrar salida" todavía no hace nada (no tiene función). En la vieja, `POST /api/movimientos-stock` no guarda quién lo cargó ni es todo o nada, y `DELETE /api/movimientos-stock/:id` borra renglones (contra "se desactiva, no se borra"). `GET /api/movimientos-stock` trae como mucho 1000 renglones.
- **Pedir a cocina + Producción: poder CANCELAR un pedido a cocina pendiente** (anotado el 16/10), sin tocar la heladera ni los
  insumos (un pendiente todavía no produjo nada). Sirve para limpiar los **9 renglones pendientes para el 08/10** (de los pedidos
  a cocina #1, #3, #5, #6, #7 y #8: 8 de juan cocinero alvarez y 1 de Marta Garcia, todos "atrasado"), que **eran pruebas: no
  tocarlos hasta tener esto**.
  Idea a revisar cuando se haga (no está decidido): como las cosas se desactivan y no se borran, marcar el renglón como
  cancelado (columna nueva en `orden_produccion_detalles`, solo agregar), con quién y por qué, en una función de la base;
  que `GET /api/ordenes-produccion/pendientes` no lo muestre y que "Hecho" no lo acepte; botón "Cancelar" en "Pendientes de
  cocina" solo para los roles 6, 5 y 1 (el cocinero no cancela).
- **Consultar Pedidos trae como mucho 1000 pedidos** (límite de Supabase por consulta): `GET /api/pedidos` los ordena del más nuevo al más viejo, así que cuando haya más, los más viejos no se ven (salvo filtrando por fechas). Hace falta paginación más adelante (que el servidor mande de a una página). Lo mismo, mucho más lejos, para las reservadas de Producción: se suman como mucho 1000 renglones de pedidos sin entregar.

## Próximo prompt para Claude Code (🔴 MODO POTENTE, Effort Max)
**Pantalla 1 (17/10): paso 1, paso 2, diseño final y limpieza, escritos y comprobados.** Después de tu recorrido a mano
("Recorrido a mano", más abajo, con la compra de prueba y el cocinero), mandar:
```
Miré la web (Pantalla 1: diseño final v5 + limpieza, con index.css como único CSS) y el panel en celu y compu:
[qué se vio bien y qué no].
Recorrido a mano: [compra de prueba y cocinero: cómo salió].
Si algo falló, decime la causa y el plan, sin tocar nada sin mi OK. Si está todo bien, cerrá la Pantalla 1 en
docs/HELADERA-AVANCE.md y en el INFORME, decime qué commiteo y pasá al plan de la Pantalla 2 (Login). No hagas commit.
```

(Anterior, de H8 + H9.) El SQL está corrido y el test dio 40/40 (16/10). Después de mirar las pantallas (lista de "Después del SQL", punto 3), mandar:
```
Miré las pantallas de H8 + H9: [qué se vio bien y qué no, pantalla por pantalla].
Si algo falló, decime qué y por qué, y el plan para arreglarlo, sin tocar nada sin mi OK. Si está todo bien, cerrá H8 y
H9 en docs/HELADERA-AVANCE.md y en el INFORME, decime qué commiteo (archivos) y cuál es el paso que sigue. No hagas commit.
```
Si el chat se corta antes de correr el SQL, mandar este:
```
Estamos en H8 (paradas 1, 2 y 3) + H9: ya está todo escrito y comparado (ver docs/HELADERA-AVANCE.md, "H8 paradas 2 y 3
+ H9", y las secciones 8.2 a 9 de docs/INFORME-CAMBIOS-HELADERA.md). No lo vuelvas a escribir. Revisá los cambios
buscando errores y decime qué encontraste sin arreglar nada sin mi OK. No corras nada contra la base. No hagas commit.
```

## FORMA DE TRABAJAR DESDE EL 16/10: pantalla por pantalla, hasta dejar cada una terminada
En cada pantalla: 1) revisar · 2) plan · 3) arreglar de a un punto, con freno · 4) probar (test HELADERA 40/40 + recorrido a
mano) · 5) que quede UNA sola pantalla (la nueva reemplaza a la vieja; la vieja sale del menú y del código) · 6) commit (lo hace
el usuario). Recién ahí se pasa a la siguiente.

| # | Pantalla | Pendientes ya anotados que se hacen ahí | Estado |
|---|---|---|---|
| 1 | Index (web nueva) | Paso 1: cambiar solo cómo se ve `index-combos.html` con el diseño de `docs/diseno-index/`. Paso 2: reemplazar el index viejo. Diseño final: `docs/diseno-final-index/` | ✍ **Paso 1, paso 2 y diseño final hechos (16/10)**: la web nueva es `index.html` (`/`), igual al diseño final v5, con animaciones y login en ventana (INFORME 13.9 a 13.11). Login y cerrar sesión llevan a donde corresponde. Pedido de prueba #27 desde la web (anulado, la heladera quedó igual) y test 40/40. **Limpieza hecha (17/10)**: se borró el index viejo y todo lo que no se usaba, y el index quedó con 1 HTML + 1 CSS (`index.css`); se ve igual (INFORME 14). Falta: tu recorrido a mano (compra y cocinero) |
| 2 | Login | `auth.js` muestra el nombre del usuario sin `escHtml` (en el botón de sesión del encabezado) y trae estilos fijos de letra blanca (para el encabezado verde viejo), que en la web nueva se pisan desde `index-combos.css`. Sus nombres están en inglés (`auth-btn-container`, `login-btn-header`, `auth-dropdown`): pasarlos a español en todos los archivos que los usan | ⏭ |
| 3 | Consultar Pedidos | | ⏭ |
| 4 | Tareas de Cocina | (el punto 8 ya está escrito: el plato primero y el plan entre paréntesis) | ⏭ |
| 5 | Pedir a cocina + Producción | Cancelar un pedido a cocina pendiente (y limpiar los 9 de prueba del 08/10) | ⏭ |
| 6 | Movimientos de Stock + Compras | Puntos 1 a 6 de "Ajustes después de probar a mano" (salidas, orden, repetidos, hora real, columnas, filtro de fecha) | ⏭ |
| 7 | Combos | Punto 7 (filtros por plan y por nombre) | ⏭ |
| 8 | Productos y Recetas | | ⏭ |
| 9 | Envíos | | ⏭ |
| 10 | El resto | | ⏭ |

### Ideas para después (web nueva): están en la maqueta pero hoy no existen
Se dejaron afuera del paso 1 de la Pantalla 1 porque serían comportamiento nuevo o datos que no tenemos (decisión del 16/10):
- "Ofertas del día" (la tira de ofertas que se desliza).
- El sello "El más elegido" en un combo (habría que decidir cómo se elige: ¿el más vendido?).
- "Seguir armando · 4 de 10" en la tarjeta de un combo empezado (hoy, si se cierra el armado, se pierde).
- El mapa en "Dónde estamos".
- "Días y horarios" y "Zonas de entrega" (no están cargados en ningún lado).
- El botón flotante de WhatsApp que en el celular se esconde mientras se ven los botones de la portada.
- (Del diseño final, 16/10) Marcar en el menú de arriba la sección que se está viendo (el link "activo" de la referencia).
- (Del diseño final, 16/10) Las 6 preguntas frecuentes de la referencia ("¿Cuánto duran en el freezer?", "¿Cómo se
  calientan?", "¿Qué días entregan?"…): vienen sin respuesta, hay que escribirlas.

### Pantalla 1, paso 1 — qué se hizo y cómo mirarlo (16/10)
Detalle completo (funciones antes/ahora, lista de nombres "antes → ahora", prueba y seguridad) en la sección 13 de
`INFORME-CAMBIOS-HELADERA.md`.
- `index-combos.html` y `index-combos.css` con el diseño de la maqueta; los 4 JS cambian solo lo que dibujan
  (`cargarCombos`, `renderizarCategorias`, `renderizarCombos`, `renderizarMenuCombo`, `renderizarCarrito`,
  `abrirFinalizarPedido` —antes `abrirCheckout`— y `mostrarConfirmacion`). No se tocó `server.js`, `sql/` ni `auth.js`.
- **Nombres claros** (CLAUDE.md, 16/10 10:17): 124 clases y 60 ids pasados a español (ej. `oferta` → `tarjeta-combo`,
  `hoja__pie` → `modal-pie`, `ck-nombre` → `campo-nombre`, `err-fecha` → `error-fecha`). CSS solo en su archivo.
- **Comprobado:** capturas automáticas en 27 pasos (celu 390 px y compu 1440 px), con los nombres de la maqueta y con los
  nuevos: se ve igual. Test HELADERA 40/40 dos veces (10:33: pedidos de prueba #15 y #16; 13:44: dos más), todos anulados.
- **Pendiente:** `if` adentro de `if` y `else` viejos fuera de lo que dibuja (`agregarPlatoPersonalizado` y los clics de
  `armarCombo.js` y `carritoCombos.js`).
- ~~Pregunta abierta: el tamaño del nombre en la tarjeta~~ → resuelta con el arreglo visual de abajo (18 px).
- **Arreglo visual (16/10, tarde)** — detalle en la sección 13.7 del INFORME:
  - Tarjetas de combos como la referencia v4 (`docs/diseno-index/estilos.css`):
    - foto arriba en 16/10;
    - nombre de 18 px oscuro, sin la línea "MANTENIMIENTO · 20 viandas";
    - precio de 26 px en verde y "$ … por vianda" en gris;
    - "Armar combo ›" abajo de todo, alineado entre tarjetas;
    - 1 por fila en celu, 2 en tablet y 3 en compu;
    - destacado (`tarjeta-combo-destacada` + `tarjeta-combo-sello`) listo, sin usar.
  - Foto de la portada: `viandaprincipal2` con `srcset` 900 / 1600 / original.
  - Comprobado por zonas: fuera de las tarjetas y la foto, la página quedó igual.
  - Test 40/40 (pedidos de prueba #19 y #20, anulados).
- **Estilo general v4 (16/10, tarde)** — sección 13.8 del INFORME:
  - fondo blanco y líneas finitas entre secciones;
  - "Fast Good" grande y los 3 pasos en círculos;
  - "Combos [categoría]" con su texto arriba de las tarjetas;
  - el recuadro gris "mapa" en Dónde estamos;
  - test 40/40 (pedidos de prueba #21 y #22, anulados).
  - **Pendientes:** las 8 preguntas de la v4 (falta su `app.js`) y cargar las descripciones de los platos (hoy vacías).
- **Ajustes v5, animaciones y login en ventana (16/10)** — sección 13.10 del INFORME.
- **Diseño final v5 (16/10)** — sección 13.11 del INFORME, con la tabla "maqueta → nuestro":
  - `index-final.css` (nuevo, va último) y `index-combos.css` de vuelta a la v5;
  - tarjetas grandes: la tarjeta entera es el botón, 3 por fila en compu y 1 en celu, con la foto "combo mantenimiento"
    (versión liviana de 1200 px; las originales no se tocaron);
  - animaciones con `animaciones-index.js`: las secciones aparecen al bajar y el contador de "Mi pedido" salta;
  - comprobado a 1440 y 390 px: sin scroll de costado, bien con "sin movimiento", y andan el login en ventana,
    "✎ Personalizar" y el carrito;
  - pedido de prueba #27 desde la web (anulado, la heladera quedó igual) y test 40/40 (#28 y #29, anulados).
  - **Pendientes:** "Más elegido" (no hay un dato), las 6 preguntas de la referencia (vienen sin respuesta) y las
    descripciones de los platos (hoy vacías).
- **Limpieza (17/10)** — sección 14 del INFORME:
  - **Se borró lo que no se usaba** (comprobado buscando cada nombre en todo el repo, el servidor, los tests y el menú):
    - el index viejo (`index-viejo.html`, `index.js`, `carrito.js`, `animations.js`, `funciones.js`);
    - el formulario viejo (`formulario.html`, `.css` y `.js`);
    - 27 imágenes (52,9 MB), entre ellas las 2 fotos originales de los combos;
    - `docs/diseno-final-index/`;
    - 8 funciones (3 de `auth.js`, 1 de `generarReceta.js` y 4 de `global.js`) y 24 reglas de CSS sueltas.
  - **`admin.html`:** sin el carrito escondido ("Cambios Pendientes"). Por eso se borraron también `carrito.css` y el
    `index.css` viejo.
  - **El index con 1 HTML + 1 CSS:** `index.css` = lo que eran `index-combos.css` (parte 1) + `index-final.css` (parte 2),
    mismos valores y mismo orden. La letra Figtree sigue en su `<link>` de Google: con `@import` el subtítulo de la portada
    cortaba distinto.
  - **Comprobado antes y después, a 1440 y 390 px:**
    - el index se ve igual (solo diferencias de 1 píxel al dibujar texto en "Armar combo" en el celu);
    - las 11 pantallas del panel, idénticas píxel por píxel;
    - `admin.html`: solo sin el carrito y la sombra casi invisible que dejaba en el borde;
    - sin errores (el 404 del `favicon.ico`, que ya estaba, se arregló después: ver abajo);
    - pedido de prueba #30 (anulado, la heladera quedó igual) y test 40/40 (#31 y #32).
  - **Ícono (17/10)** — sección 14.11 del INFORME:
    - el renglón del logo, agregado a las 10 pantallas del panel que no lo tenían;
    - comprobado a 1440 y 390 px: las 14 páginas tienen su ícono (responde 200), sin errores y sin ningún 404.
  - **Aviso:** cambiaron los combos de la base. Ahora sale primero "Combo semanal" (#4 y #5, categoría "Combos
    Saludables", con la foto "combo saludable") y ya no aparece "Prueba no usar". El "PRUEBA Mantenimiento x10" (#1) sigue,
    en la categoría "Viandas Saludables".

**Recorrido a mano.** Ctrl+F5 en `http://localhost:3000/` (desde el paso 2, la web nueva es `index.html`). Para el celu: F12 → ícono del celular
(Ctrl+Shift+M) → ancho 390, o el celu de verdad en la misma red Wi-Fi con la IP de la compu en lugar de `localhost`.

En el celu (390 px):
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís la página | Logo, "Iniciar Sesión" y "Mi pedido 0" arriba, el menú debajo. "Fast Good" grande, "Pedir ahora" a todo el ancho, "Combos desde $ 100.000", WhatsApp e Instagram, la foto con "Entregamos a las 48 hs hábiles" y los 3 pasos |
| 2 | Bajás a Categorías | Las secciones aparecen suaves al bajar. Un botón por categoría, a todo el ancho; la elegida verde con ✓. Combos uno debajo del otro, a lo ancho: la foto "combo mantenimiento", nombre, precio grande en verde, "$ 13.700 por vianda" y "Armar combo ›". Se puede tocar en cualquier parte de la tarjeta |
| 3 | "Mi pedido" (vacío) | Sube desde abajo: bolsa + "Todavía no agregaste combos.", "Finalizar pedido" gris |
| 4 | "Armar combo" en «PRUEBA Mantenimiento x10» | Sube desde abajo: "0 de 10 · Te faltan 10", canelones con "Quedan 6", botones − / + redondos (el + verde) |
| 5 | Sumás platos | El plato se pone verde, la barra avanza, "Te faltan N" baja |
| 6 | "✎ Personalizar" en canelones, escribís "sin sal" y "Agregar" | Renglón "⚠ sin sal − 1 +" y la nota "Los platos personalizados se cocinan aparte…" |
| 7 | Completás 10 | "¡Combo completo!" en verde, los + se apagan, "Agregar al pedido" se prende |
| 8 | ✕ (o Escape) con platos elegidos | "Elegiste 10 de 10. Si salís, se pierde lo que elegiste." con "Salir" y "Seguir armando" → Seguir armando |
| 9 | "Agregar al pedido" | Mi pedido: nombre y precio, un plato por renglón ("1 × canelones · ⚠ sin sal"), "$ 13.700 c/u", "Quitar", total, y "Mi pedido 1" |
| 10 | "Finalizar pedido" | Pantalla completa. Resumen cerrado "(1 combo) $ 137.000": al tocarlo se abre. Tus datos (Nombre y Apellido lado a lado), Tipo de Entrega en tarjetas, Barrio, Fecha (primera posible un día hábil más por el "sin sal"), Método de Pago, Observaciones. Abajo, fijos: Total y "Confirmar pedido" |
| 11 | "Confirmar pedido" con todo vacío | Los errores en rojo debajo de cada campo (no se manda nada) |
| 12 | Retiro en el local + Transferencia | Se esconde el barrio; aparece "Alias: FAST.GOOD.VA (cuenta a nombre de Fast and Good VA SRL)." |
| 13 | (Opcional, cuando tu prima no esté cargando) Un pedido "PRUEBA – NO PREPARAR" de verdad, Retiro y Efectivo | La confirmación: ✓ grande, "¡Recibimos tu pedido #N!", fecha / entrega / pago, el resumen con el total y el botón verde "Enviar por WhatsApp" (abre WhatsApp con el mensaje; no hace falta mandarlo). **Después anulás #N en Consultar Pedidos** |
| 14 | Preguntas, Dónde estamos, pie | Una pregunta abierta a la vez (el + gira); sucursales con "Cómo llegar"; el pie en una columna; el botón flotante de WhatsApp |
| 15 | "Iniciar Sesión" | Se abre una ventana con Email y Contraseña. Con la clave mal, "Usuario o contraseña incorrectos" en rojo; con tu usuario, tu pantalla (admin → panel, cocinero → Tareas de Cocina) |

En la compu (pantalla completa):
| # | Qué mirás | Qué tiene que pasar |
|---|---|---|
| 1 | Encabezado | Una sola fila: logo, menú al medio, "Iniciar Sesión" y "Mi pedido" |
| 2 | Portada | Texto a la izquierda y foto a la derecha; "Pedir ahora" y "Combos desde" en la misma línea; los 3 pasos en fila |
| 3 | Categorías y combos | Categorías en fila; combos de a 3 por fila (2 si achicás la ventana a tamaño tablet), con los botones "Armar combo ›" a la misma altura; al pasar el mouse, borde verde, sombra y el botón más oscuro. Al tocar otra categoría, las tarjetas aparecen de a una |
| 4 | Armar combo | Modal centrado; el − N + a la derecha de cada plato |
| 5 | Mi pedido | Panel a la derecha, de todo el alto |
| 6 | Finalizar pedido | Modal grande: campos a la izquierda y resumen fijo a la derecha (no se cierra); Envío / Retiro y Efectivo / Transferencia de a dos |
| 7 | Confirmación (si hiciste el 13) | Fecha, entrega y pago en 3 columnas |
| 8 | Dónde estamos, Preguntas y pie | Dos columnas; preguntas en dos columnas; pie en 4 columnas |
| 9 | Iniciar sesión | Se abre en una ventana (como el 15 del celu). Después de entrar como cliente, el botón muestra tu nombre; el menú que abre lo dibuja `auth.js` (Pantalla 2) |

## Ajustes después de probar a mano (16/10) — de a uno, con freno
(Desde el 16/10 se hacen cuando se llega a su pantalla: ver la tabla de arriba.)
Detalle de cada uno en la sección 12 de `INFORME-CAMBIOS-HELADERA.md`. Decisiones del usuario (16/10): motivo de las salidas
con lista fija (Vencido / Roto / Se perdió / Otro, con detalle obligatorio si es Otro); compras viejas: mostrar la hora de carga
sin tocar datos (con `sql/revisar_compras.sql`, que corre el usuario); el filtro de fecha arranca en "Últimos 7 días"; "keto": olvidarlo.

| # | Punto | Qué se hace | SQL | Estado |
|---|---|---|---|---|
| 1 | 8. Cocina | El plato primero y el plan entre paréntesis: "20 berenjenas rellenas (MANTENIMIENTO)" (Para stock, Pendientes de cocina, Hecho hoy). Se guardaba y se mostraba ya por plato | No | ✍ escrito, falta mirar (Ctrl+F5) |
| 2 | 2. Orden | Desempate de movimientos con la misma hora: el más nuevo primero | No | ⏭ |
| 3 | 6. Filtro de fecha | Un desplegable: Hoy / Últimos 7 días / Este mes / Elegir fechas | No | ⏭ |
| 4 | 7. Combos | Filtros por plan y por nombre en la lista de combos y en el Menú | No | ⏭ |
| 5 | 5. Columnas | De 9 a 5 (+ Ver): Fecha y hora · Movimiento · Qué · Quién · Nota | No | ⏭ |
| 6 | 3. Repetidos | Se arregla con el 5, el 4 y el 1 (y sacar "Movimientos (viejo)" del menú) | No | ⏭ |
| 7 | 4. Hora real | `registrar_compra` guarda la hora real; las viejas se muestran con `compras.created_at` | Sí | ⏭ |
| 8 | 1. Salidas | Función nueva `registrar_salida_insumo`, ruta y ventana "− Registrar salida" | Sí | ⏭ |

Para mirar el 1 (punto 8): Ctrl+F5 en Tareas de Cocina ("Para stock") y en Producción ("Pendientes de cocina" y "Hecho hoy").
Después mandar: "Miré el punto 8: [cómo se ve]. Seguí con el punto 2."

## Cómo trabajamos (recordatorio)
- Claude Code escribe el código; el chat arma prompts, revisa planes y reportes, explica el código y dice cómo probar y cuándo commitear.
- Todo cambio (código, SQL, pantallas) se agrega también a `docs/INFORME-CAMBIOS-HELADERA.md` (ver la REGLA de arriba).
- Cada reporte de Claude Code se revisa buscando errores ANTES de dar el OK.
- Nunca pasar a 3 un pedido de prueba con personalizados, ni ninguno a 4.
- Probar cuando mi prima no esté cargando.
- Hasta el merge, los pedidos de combos de prueba se anulan y se mueven SOLO desde el servidor nuevo: Render (código viejo) anula sin devolver viandas y pasa a 3 con la fórmula vieja de insumos.
