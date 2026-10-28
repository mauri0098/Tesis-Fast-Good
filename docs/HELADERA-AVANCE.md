# Heladera — avance del refactor (21/10/2026)

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
**Pantalla 3 (19/10): menú nuevo del panel, `global.css` y Consultar Pedidos (`diseno-panel-v2/`), escritos y comprobados.**
1. Hacé el "Recorrido a mano (panel, 19/10)" (más abajo), en celu y compu. No hace falta reiniciar el servidor.
2. Decidí qué hacer con la tabla a 1440 (no entra: INFORME 16.11).
3. Después mandá:
```
Miré el panel nuevo (menú, global.css y Consultar Pedidos, diseno-panel-v2) en celu y compu:
[qué se vio bien y qué no, pantalla por pantalla].
La tabla a 1440: [la dejo con el scroll de costado / quiero (decí cuál de las opciones de INFORME 16.11)].
Si algo falló, decime la causa y el plan, sin tocar nada sin mi OK. Si está todo bien, cerrá la Pantalla 3 en
docs/HELADERA-AVANCE.md y en el INFORME, decime qué commiteo (archivos) y pasá al plan de la pantalla que sigue.
No hagas commit.
```

(Anterior, de la Pantalla 1.)
**Pantalla 1 (17/10): paso 1, paso 2, diseño final, limpieza e index final (`diseno-index-final2/`), escritos y
comprobados.**
1. Reiniciá el servidor del puerto 3000 (por el `server.js` nuevo).
2. Hacé el "Recorrido a mano" del index final (más abajo), en celu y compu.
3. Después mandá:
```
Miré el index final (diseno-index-final2: categorías primero, celu con pantallas y hoja de datos) en celu y compu,
con el servidor reiniciado: [qué se vio bien y qué no, pantalla por pantalla].
Si algo falló, decime la causa y el plan, sin tocar nada sin mi OK. Si está todo bien, cerrá la Pantalla 1 en
docs/HELADERA-AVANCE.md y en el INFORME, decime qué commiteo (archivos) y pasá al plan de la Pantalla 2 (Login).
No hagas commit.
```

(Anterior, de la limpieza.)
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
| 1 | Index (web nueva) | Paso 1: cambiar solo cómo se ve `index-combos.html` con el diseño de `docs/diseno-index/`. Paso 2: reemplazar el index viejo. Diseño final: `docs/diseno-final-index/` | ✍ **Paso 1, paso 2 y diseño final hechos (16/10)**: la web nueva es `index.html` (`/`), igual al diseño final v5, con animaciones y login en ventana (INFORME 13.9 a 13.11). Login y cerrar sesión llevan a donde corresponde. Pedido de prueba #27 desde la web (anulado, la heladera quedó igual) y test 40/40. **Limpieza hecha (17/10)**: se borró el index viejo y todo lo que no se usaba, y el index quedó con 1 HTML + 1 CSS (`index.css`); se ve igual (INFORME 14). **Index final hecho (17/10, `diseno-index-final2/`)**: CSS ordenado; compu con las tarjetas de categoría primero y la tarjeta nueva; celu con el flujo de la referencia (INFORME 15). Pedidos de prueba #34, #35 y #38 y test 40/40, todos anulados. Falta: tu recorrido a mano (el nuevo, más abajo) y reiniciar el servidor |
| 2 | Login | `auth.js` muestra el nombre del usuario sin `escHtml` (en el botón de sesión del encabezado) y trae estilos fijos de letra blanca (para el encabezado verde viejo), que en la web nueva se pisan desde `index-combos.css`. Sus nombres están en inglés (`auth-btn-container`, `login-btn-header`, `auth-dropdown`): pasarlos a español en todos los archivos que los usan | ⏭ |
| 3 | Consultar Pedidos | (con el menú nuevo del panel y `global.css` al estilo del index, para las 13 pantallas que lo cargan) | ✍ **Hecho (19/10, `diseno-panel-v2/`)**: menú lateral nuevo en las 12 pantallas del panel, `global.css` con el estilo del index (también el login), Consultar Pedidos como la referencia (filtros con una sola fecha, botones de estado, tabla y las 4 ventanas) y, a la tarde, títulos de tabla verdes y letra más grande en todas las tablas (INFORME 16). Pedido de prueba #039 y test 40/40 dos veces (#040 a #043), todos anulados. Falta: tu recorrido a mano (el del panel, más abajo) · ✍ **Diseño final (27/10, `diseno-panel-final/`)**: la barra de filtros en 3 partes (Buscar · Entrega · Estado con su lista) y la tabla en 9 columnas, como las capturas 05 y 06. Pedido de prueba #58, anulado (INFORME 19). Falta: tu recorrido a mano (Pantalla 5, más abajo) |
| 4 | Tareas de Cocina | (el punto 8 ya está escrito: el plato primero y el plan entre paréntesis) | ⏭ |
| 5 | Pedir a cocina + Producción | Cancelar un pedido a cocina pendiente (y limpiar los 9 de prueba del 08/10) | ✍ **Paso 1 hecho (20/10, `diseno-produccion/`)**: menú lateral y barra de arriba nuevos para todo el panel (lista sin títulos, menú achicable, buscador solo visual, globito de Tareas de Cocina escondido) y letra Inter en el panel (el index sigue con Figtree). Test 40/40 (INFORME 17). Falta: tu prueba del Paso 1 y el Paso 2 (Producción) · ✍ **Diseño final (27/10, `diseno-panel-final/`)**: el molde en `global.css` para todo el panel, la barra "Panel / pantalla" con la fecha, y Producción y "Pedir a cocina" como las capturas 01 a 04 (INFORME 19). Falta: tu recorrido a mano (Pantalla 5, más abajo) |
| 6 | Movimientos de Stock + Compras | Puntos 1 a 6 de "Ajustes después de probar a mano" (salidas, orden, repetidos, hora real, columnas, filtro de fecha) | ⏭ |
| 7 | Combos | Punto 7 (filtros por plan y por nombre) | ⏭ |
| 8 | Productos y Recetas | | ⏭ |
| 9 | Envíos | | ⏭ |
| 10 | El resto | | ⏭ |

### Ideas para después (web nueva): están en la maqueta pero hoy no existen
Se dejaron afuera del paso 1 de la Pantalla 1 porque serían comportamiento nuevo o datos que no tenemos (decisión del 16/10):
- "Ofertas del día" (la tira de ofertas que se desliza).
- ~~El sello "El más elegido" en un combo~~ → **hecho el 17/10** (INFORME 15): sale si el combo tiene `destacado` = true.
  Se marca a mano desde Supabase.
- **(17/10) PENDIENTE: un panel para cargar "Más elegido", la foto y la frase de cada categoría.**
  - Hoy se cargan desde Supabase: `combos.destacado`, `categorias.imagen` y `categorias.descripcion`.
  - Sin foto, la tarjeta de la categoría usa la de su primer combo; sin frase, va sin frase.
- **(17/10) PENDIENTE: la dirección es obligatoria también con "Retiro en el local"** (`validarFormulario` y el servidor).
  - Por eso en el celu la Dirección se ve siempre.
  - Hay que decidir si con Retiro puede ir vacía. Si se cambia, se cambia en los dos lados.
- (17/10) Cuando el servidor rechaza un pedido por CORS, contesta 500 en vez de 403.
  - Para el cliente no cambia nada.
  - Se mira con la seguridad del servidor.
- "% OFF" en las tarjetas: **no va** (decisión del 17/10).
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
- **Index final (17/10, `diseno-index-final2/PROMPT.md`)** — sección 15 del INFORME:
  - **SQL** `sql/combos_categorias_extra.sql` (lo corriste vos): `combos.destacado`, `categorias.imagen` y
    `categorias.descripcion`. **`server.js`:** 5 rutas GET los mandan (solo lectura). **Hay que reiniciar el servidor.**
  - **`index.css` ordenado:** perillas comentadas arriba y 12 secciones (0 a 11). Comprobado que ordenarlo no cambió nada.
  - **Compu:**
    - primero las **tarjetas de categoría**, con la misma plantilla de la tarjeta de combo: foto, nombre, "N combos",
      "DESDE $…", "o $… por vianda" y "Ver combos →";
    - al tocar una, sus combos en el mismo lugar, con "‹ Todas las categorías";
    - la tarjeta de combo nueva ("¡Lo quiero!", que late y brilla; "Más elegido" en naranja si el combo es destacado);
    - "✨ Armalo por mí".
  - **Celu (el flujo de la referencia):**
    - encabezado de una fila y portada compacta con insignias;
    - las mismas tarjetas de categoría, y "Cómo funciona";
    - los combos en una pantalla que entra desde la derecha;
    - el armado a pantalla completa, con la barra fija abajo. "Mandar pedido · $…" abre "Finalizar pedido" directo;
    - los datos en una hoja que sube, con botones partidos y los 5 días hábiles como botones (el primero elegido);
    - la ✓ con rebote.
  - **Comprobado:**
    - 390 y 1440 px contra las referencias (imágenes lado a lado);
    - sin scroll de costado en 14 anchos (de 320 a 1920 px);
    - lo que no se tocó quedó idéntico;
    - login, Personalizar, Mi pedido y "sin movimiento" andan;
    - consola sin errores;
    - pedidos de prueba #34 (celu), #35 (compu) y #38 (celu) y test 40/40 (#36 y #37), todos anulados, con la heladera
      igual.
  - **Capturas:** `diseno-index-final2/capturas-finales/` (en `comparaciones/`, "referencia | nuestra" y "antes | después").
- **Fondo blanco y verdes más intensos (18/10)** — INFORME 15.13. Solo `index.css`, con las perillas:
  - todo el fondo blanco (el encabezado, igual);
  - verde principal `#12893a` (el `#13893a` pedido no llegaba a 4,5:1 por poquito);
  - textos verdes chicos con la perilla nueva `--verde-texto: #127f36`;
  - marca `#26b04f`, hover `#0f7330`, verde clarito `#e8f5eb`;
  - "Mi pedido" con el verde nuevo;
  - los verdes escritos a mano (degradé y sombras de "¡Lo quiero!", foco de los casilleros) pasaron a las perillas.
  - **Medido:** 114 textos verdes, todos con 4,5:1 o más (los grandes, 3:1 o más).
  - **Para decidir:** el aro del foco del teclado y la punta clara de "¡Lo quiero!" bajaron a 2,84:1 (antes 3,01).
  - **Capturas:** `diseno-index-final2/capturas-fondo-blanco-y-verdes/`.
- **Foto nueva de la portada (18/10)** — INFORME 15.14:
  - el HTML apunta a `portada-vianda` (el nombre del archivo), con su medida real (2752 × 1536);
  - versiones de 900 y 1600 px creadas al lado.
  - **Pendiente de decidir:** borrar las 3 `viandaprincipal2` (4,7 MB), que quedaron sin uso.
- **Portada nueva de la compu (19/10, `diseno-portada/`)** — INFORME 15.15:
  - encabezado blanco con el logo escrito "Fast & Good" (compu y celu);
  - en compu, la foto grande desde el 34 % con fundido blanco, "⚡ Listas en 5 minutos" y los pasos en pastillas;
  - las animaciones de la referencia;
  - la foto ahora es solo `portada-vianda.webp` (255 KB);
  - `diseno-portada/` está en el `.gitignore`;
  - el celu, igual (solo cambian el encabezado y los textos);
  - perillas nuevas: `--portada-alto`, `--portada-foto-desde`, `--portada-fundido` y `--titulo-portada-compu`.
  - **Ajustes (19/10):** la animación de la foto se probó más lenta y hacia la derecha y después volvió a como estaba (desde la derecha, 1,4 s); degradé abajo, logo imagen + texto e "Iniciar sesión" con minúscula (INFORME 15.15).

**Recorrido a mano (index final, 17/10).**
1. **Primero, reiniciá tu servidor** (el del puerto 3000), para que tome el `server.js` nuevo.
2. Después, Ctrl+F5 en `http://localhost:3000/`.
3. Para el celu: F12 → ícono del celular (Ctrl+Shift+M) → ancho 390. O el celu de verdad, en la misma red Wi-Fi, con la IP
   de la compu en lugar de `localhost`.

Las capturas de cada paso están en `diseno-index-final2/capturas-finales/`.

En el celu (390 px):
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís la página | **Arriba:** una sola fila blanca con el logo, "Iniciar Sesión" chiquito y "Mi pedido 0" (sin el menú). <br>**Portada:** la pastilla verde "Nueva Córdoba y Villa Allende, Córdoba", "Fast Good", la bajada y las insignias "✓ Caseras · ⚡ Listas en 5 min · 🛵 Entregas en 48 hs hábiles". <br>**Categorías:** "ELEGÍ TU CATEGORÍA" con una raya, y una tarjeta por categoría. |
| 2 | Mirás una tarjeta de categoría | La foto con el nombre en blanco, "2 combos", "DESDE $ 20.000", "o $ 4.000 por vianda" y "Ver combos →" verde, que late y lo cruza un brillo |
| 3 | Bajás | Debajo de las categorías, "CÓMO FUNCIONA": 🥗 Elegís · ✋ Armás · 🛵 Recibís. Después, Dónde estamos, Preguntas y el pie, como siempre. Las secciones aparecen suaves al bajar |
| 4 | "Ver combos" en "Viandas Saludables" | **Entra una pantalla desde la derecha**, con "‹ Viandas Saludables" arriba y "¿CUÁNTAS VIANDAS?". Los combos, uno debajo del otro, con "N viandas", el precio, "$ … por vianda" y "¡Lo quiero!" |
| 5 | La "‹", o el "atrás" del celu | Vuelve a las categorías, en el mismo lugar (no sale de la página) |
| 6 | Otra vez "Ver combos" y "¡Lo quiero!" en «PRUEBA Mantenimiento x10» | **Pantalla completa desde la derecha:** <br>· "‹ Armá tu combo"; <br>· el recuadro con la foto, el nombre y "$ 137.000"; <br>· "ELEGÍ TUS 10 PLATOS · PODÉS REPETIR" y "✨ Armalo por mí"; <br>· los platos (canelones con "Quedan 6"); <br>· fija abajo: "Tus platos · 0 de 10", la barra y el botón gris "Elegí 10 platos más" |
| 7 | Sumás 2 platos con el + | "2 de 10", la barra avanza y el botón dice "Elegí 8 platos más" |
| 8 | "✎ Personalizar" en canelones, escribís "sin sal" y "Agregar" | Renglón "⚠ sin sal − 1 +" y la nota "Los platos personalizados se cocinan aparte…". Sacalo con el − |
| 9 | "✨ Armalo por mí" | Completa hasta 10, repartiendo de a uno (canelones no pasa de 6). "¡Listo! Ya podés mandarlo", los + apagados y el botón verde **"Mandar pedido · $ 137.000"** |
| 10 | La "‹" con platos elegidos | "Elegiste 10 de 10. Si salís, se pierde lo que elegiste." → "Seguir armando" |
| 11 | "Mandar pedido · $ 137.000" | **Sube una hoja desde abajo:** la rayita gris, "¿Cómo te lo damos?" y el resumen "(1 combo) $ 137.000" (al tocarlo se abre). Después: <br>· TUS DATOS, con rótulos chicos y casilleros altos; <br>· TIPO DE ENTREGA: botón partido "🛵 Envío a domicilio / 🏠 Retiro en el local"; <br>· el barrio; <br>· la fecha: **5 botones de días hábiles**, el primero en verde; <br>· MÉTODO DE PAGO: "💵 Efectivo / 🏦 Transferencia"; <br>· Observaciones. <br>Abajo, fijo: "Confirmar pedido · $ 137.000". En el ícono, "Mi pedido 1" |
| 12 | Tocás otro día; después "Retiro" y "Transferencia" | El día tocado se pone verde. Con Retiro se esconde el barrio y aparece "Retirás en Ituzaingó 431 (Nueva Córdoba) o en 9 de Julio 179 (Villa Allende)". Con Transferencia aparece el alias |
| 13 | "Confirmar pedido" con todo vacío | Los errores en rojo debajo de cada campo (no se manda nada) |
| 14 | ✕ de la hoja y después "Mi pedido" | Se cierra la hoja y queda la pantalla de combos. "Mi pedido" muestra el combo (para sumar otro, "Seguir eligiendo") |
| 15 | (Opcional, cuando tu prima no esté cargando) Un pedido "PRUEBA – NO PREPARAR" de verdad, Retiro y Efectivo | La ✓ grande, verde, **aparece con un rebote**. Debajo: "¡Recibimos tu pedido #N!", la fecha, la entrega, el pago, el resumen y "Enviar por WhatsApp". "Volver al inicio" deja las categorías. **Después anulás #N en Consultar Pedidos** |
| 16 | "Iniciar Sesión" | La ventana de siempre, con Email y Contraseña. Con la clave mal, "Usuario o contraseña incorrectos"; con tu usuario, tu pantalla |

En la compu (pantalla completa):
| # | Qué mirás | Qué tiene que pasar |
|---|---|---|
| 1 | Encabezado y portada | Como siempre: una fila con el logo, el menú, "Iniciar Sesión" y "Mi pedido"; el texto a la izquierda y la foto a la derecha; los 3 pasos en fila |
| 2 | "Elegí tu categoría" (fondo blanco) | **Las tarjetas de categoría**, del ancho de 3 por fila (hoy son 2, a la izquierda): foto, nombre, "2 combos", "DESDE $ …", "o $ … por vianda" y "Ver combos →". Al pasar el mouse, la tarjeta sube, la foto se acerca y la flecha se corre |
| 3 | Tocás "Viandas Saludables" | Las categorías se van y en su lugar aparecen "‹ Todas las categorías", "Combos Viandas Saludables", la bajada y los 2 combos, que aparecen de a uno. Cada uno con "N viandas" y "¡Lo quiero! →" |
| 4 | "‹ Todas las categorías" (y otra vez, con el "atrás" del navegador) | Vuelven las categorías |
| 5 | Menú "Categorías" o "Combos" | Baja a "Elegí tu categoría" (si estaban abiertos los combos, vuelven las categorías) |
| 6 | "¡Lo quiero!" en «PRUEBA Mantenimiento x10» | La ventana centrada de siempre ("0 de 10 · Te faltan 10"), con **"✨ Armalo por mí"** arriba de los platos |
| 7 | "✨ Armalo por mí" | "10 de 10 · ¡Combo completo!" (4 berenjenas, 3 canelones y 3 fideos, si la heladera está como hoy); el botón queda apagado y "Agregar al pedido" prendido |
| 8 | "Agregar al pedido" | "Mi pedido" a la derecha, como siempre (en compu no va directo a Finalizar) |
| 9 | "Finalizar pedido" | La ventana grande de siempre (campos a la izquierda, resumen fijo a la derecha, la fecha con su campo) |
| 10 | Confirmación (solo si hacés un pedido de prueba también desde la compu, y lo anulás después) | La ✓ con rebote; fecha, entrega y pago en 3 columnas |
| 11 | "Más elegido" (opcional) | En Supabase, poné `destacado` = true en un combo y recargá: ese combo sale con la pastilla naranja "Más elegido", el borde naranja y "¡Lo quiero!" naranja. Después volvelo a false |

### Pantalla 3 (19/10): menú nuevo del panel, `global.css` y Consultar Pedidos — qué se hizo y cómo mirarlo
Detalle completo (decisiones, archivos, funciones antes/ahora línea por línea, perillas, pruebas, seguridad y lo que no
quedó igual) en la sección 16 de `INFORME-CAMBIOS-HELADERA.md`.
- **Menú lateral nuevo** (`adminSidebar.js` + `menuPanel.css`, nuevo) en las 12 pantallas:
  - logo, "Fast & Good" y la etiqueta PANEL;
  - grupos con íconos: Inicio · Pedidos · Reparto · Cocina · Stock · Catálogo · Administración;
  - abajo, la inicial, el nombre y el rol;
  - en menos de 900 px, una barra arriba con ☰;
  - los permisos, los mismos de `roles.js`. "Movimientos (viejo)" salió del menú, pero se puede abrir.
- **`global.css` con el estilo del index** (13 pantallas, también el login):
  - letra Figtree;
  - perillas en español (las de inglés cambian solo de valor);
  - el título grande sin barra verde, botones pastilla, ventanas blancas y paginación en circulitos;
  - sin el pie "©" (estaba en 12 pantallas, no en 11).
  - Los `<style>` y CSS propios de las otras pantallas no se tocaron: sus detalles se arreglan al rediseñar cada una.
- **Consultar Pedidos como la referencia:**
  - Buscar con lupa y **una sola fecha de entrega** (el filtro de siempre, con Desde = Hasta);
  - botones de estado con su cantidad, contados en la pantalla, sin rutas nuevas;
  - la tabla con las 11 columnas, las pastillas de estado y pago, y "⚠ N personalizados";
  - los cancelados apagados y con el costo tachado;
  - "Mostrando X de Y pedidos";
  - las 4 ventanas con el estilo nuevo. Sin el `<style>` ni los `style=""`.
- **Ajuste (19/10, tarde):**
  - se sacó el renglón "Producción de hoy…";
  - los títulos de **todas** las tablas del panel, en verde `#127f36`, 14,5 px, sin franja ni mayúsculas, con una línea de 2 px `#cfe5d5`;
  - las celdas de 15 px, con 15 y 12 px de aire;
  - en Consultar Pedidos, cada celda con su clase `col-…`: N° verde; Cliente y Costo de 16 px; Teléfono y Mail chicos y grises (INFORME 16.12).
- **Ajuste (19/10, noche):** títulos de las tablas a 15,5 px y celdas a 13,5 px (solo perillas de `global.css`); la tabla de Consultar Pedidos sigue con el scroll de costado en notebooks (decisión tuya).
- **Comprobado:**
  - las 13 pantallas a 1440 y 390 px y los 6 roles: sin errores, sin pie y sin scroll de costado;
  - 21 pruebas solo leyendo en Consultar Pedidos;
  - el pedido de prueba #039 de punta a punta (anulado, la heladera quedó igual);
  - test 40/40 dos veces (#040 a #043, anulados).
  - **Capturas:** `diseno-panel-v2/capturas/`.
- **Para decidir:**
  - a 1440 la tabla **no entra** con los datos reales y la letra nueva (mide unos 1420 px y la tarjeta 1094): se mueve de
    costado adentro de su tarjeta y "Acciones" queda a la derecha. Las opciones están en INFORME 16.11;
  - `adminSidebar.css` quedó sin uso (sin borrar);
  - el pedido #013 cambió de "Entregado" a "Listo para Entregar" el 19/10 entre las 10:50 y las 11:33, sin que lo tocaran
    las pruebas: fijate si fueron vos o tu prima.

**Recorrido a mano (panel, 19/10).** No hace falta reiniciar el servidor: solo cambiaron archivos del frontend. Ctrl+F5 en
cada pantalla, con tu usuario. Para el celu: F12 → ícono del celular (Ctrl+Shift+M) → ancho 390. Cambiar un estado, cobrar o
anular: **solo con un pedido "PRUEBA – NO PREPARAR"**.
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís cualquier pantalla del panel (compu) | El menú blanco a la izquierda: logo, "PANEL", los grupos y la pantalla actual en pastilla verde; abajo tu inicial, tu nombre y tu rol. Sin el pie "©" |
| 2 | Tocás cada link del menú | Abre cada pantalla y su link queda en verde. Todo anda como antes |
| 3 | Consultar Pedidos, al abrir | Sin el renglón "Producción de hoy"; la fecha de entrega con el próximo día hábil; los botones de estado con sus cantidades; los títulos de la tabla en verde |
| 4 | Escribís un nombre o un número en Buscar | La lista y las cantidades de los estados cambian juntas |
| 5 | Elegís una fecha y "Aplicar"; después "Ver todos" | Solo los pedidos con entrega ese día; con "Ver todos", todos (y la fecha queda vacía) |
| 6 | Tocás cada botón de estado | Queda verde; la lista muestra solo ese estado y "Mostrando X de Y" coincide con su número |
| 7 | Con "Ver todos", las páginas | ‹ 1 2 3 ›: cambia de página y dice "Mostrando 15 de N pedidos" |
| 8 | "Detalles" de un pedido | "Realizado el … · hora", "Pedido #N", un recuadro por combo con su precio y el Total. La X, Escape o tocar afuera la cierran |
| 9 | "Pago" de un pedido de prueba sin anular: Mixto con dos montos que sumen el total, y Cancelar | "Suma correcta: $ …" en verde. Cancelar no guarda nada |
| 10 | Un pedido anulado | La fila apagada, el costo tachado, el estado y "Pago" apagados, y "Anulado" en gris |
| 11 | Celu (390 px) | Arriba la barra con ☰ y el logo. El ☰ abre el menú y tocar lo oscuro lo cierra. La tabla se mueve de costado adentro de su tarjeta, y la página no |
| 12 | Otras pantallas con tablas (Gestión de Stock, Gestión de Usuarios, Combos…) | Andan como antes, con los títulos de la tabla en verde sin mayúsculas y la letra más grande |
| 13 | Login (`/login.html`) | La letra y los verdes nuevos; el botón "Iniciar Sesión" sigue naranja |
| 14 | El botón redondo de cerrar sesión, abajo del menú | Vuelve a la web sin la sesión |

### Pantalla 4 (21/10): Producción con el diseño nuevo — qué se hizo y cómo mirarlo
Detalle completo (decisiones, archivos, JS línea por línea, perillas, pruebas, seguridad y lo que no quedó igual) en la
sección 18 de `INFORME-CAMBIOS-HELADERA.md`.
- **Arriba:**
  - "Producción" con la bajada nueva;
  - a la derecha, los 4 botones: Pendientes de cocina (con su número), Hecho hoy (con su número), Últimos movimientos
    y + Pedir a cocina (verde).
- **La tarjeta:**
  - las pestañas Todos · Sin stock · Bajos · Bien, con puntito de color y cantidad; la elegida toma el color de su estado;
  - el buscador y "Plan" a la derecha, y los planes elegidos debajo, adentro de la tarjeta;
  - la tabla con los títulos verdes de `global.css` y Plato al 27 %.
- **Menú ⋯:** Ver movimientos del plato · **Pedir a cocina** (nuevo: abre la ventana con ese plato ya buscado; el cocinero
  no lo ve) · Descartar viandas.
- **Descartar:** el Motivo es una lista (Elegí el motivo · Vencido · En mal estado · Envase roto · Error de carga · Otro).
- **Lo que se repite en otras pantallas** pasó a `global.css` (sección 13). Ninguna otra pantalla cambia hasta que use
  esas clases.
- **Celu:**
  - título arriba y los 4 botones en 2 columnas;
  - pestañas, buscador y "Plan" uno debajo del otro;
  - la tabla con scroll adentro de su tarjeta;
  - las ventanas a pantalla completa.
- **Comprobado:**
  - 34 de 34 controles a 1440, 1280, 1024 y 390, y como cocinero;
  - lo que la pantalla manda (mínimo, pedido a cocina, descarte, Hecho) igual que antes, **atajado en el navegador: nada
    llegó a la base**;
  - Pendientes con una lista falsa "PRUEBA – NO PREPARAR";
  - test 40/40.
  - **Capturas:** `diseno-produccion/capturas-resultado/`.
- **Quedó para después:** la inicial del cocinero y los textos "Para hoy · Pedido a cocina #N" en Pendientes (se hacen con
  Tareas de Cocina, porque `pedidosCocina.js` es compartido).

**Recorrido a mano (Producción, 21/10).** No hace falta reiniciar el servidor: solo cambiaron archivos del frontend.
Ctrl+F5 en Producción, con tu usuario. Para el celu: F12 → ícono del celular (Ctrl+Shift+M) → ancho 390.
**Enviar a cocina, "Hecho" y "Confirmar descarte" escriben en la base de verdad:** hacelos solo con un plato de prueba (y
sabiendo que "Hecho" suma viandas y gasta insumos), o cancelá antes de confirmar.
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís Producción (compu) | "Producción" y la bajada a la izquierda; los 4 botones a la derecha con sus números; la tarjeta con las pestañas, el buscador y "Plan"; los títulos de la tabla en verde |
| 2 | Tocás "Bien", "Bajos" y "Todos" | La elegida se pinta con el color de su estado y la tabla muestra solo esos |
| 3 | Escribís en "Buscar plato…" | La tabla se filtra; con algo que no existe, "No hay platos para mostrar" y "Limpiar filtros" |
| 4 | "Plan" → tildás uno | Aparece "Plan: X ✕" adentro de la tarjeta y el botón con borde verde y un 1. El ✕ lo saca |
| 5 | Tocás "Disponibles" dos veces | Ordena de menos a más y al revés |
| 6 | Pasás el mouse por las ⓘ | Los cartelitos de Disponibles, Reservadas y Total |
| 7 | ✎ en Mínimo, cambiás el número y Enter (o Escape para no guardar) | Se guarda y avisa abajo (con Escape vuelve el de antes) |
| 8 | ⋯ de un plato → "Pedir a cocina" | Se abre la ventana con ese plato en Buscar y la pestaña "Todos". Cancelar |
| 9 | "+ Pedir a cocina" | La ventana con "N platos están abajo del mínimo" (si falta algo) y las pestañas Sin stock + Bajos elegidas; los títulos de su tabla en verde. Cancelar |
| 10 | ⋯ → "Descartar viandas" → "Confirmar descarte" sin elegir motivo | "Elegí el motivo." y no se descarta nada. Cancelar |
| 11 | "Pendientes de cocina", "Hecho hoy" y "Últimos movimientos" | Se abren como antes, con el estilo nuevo. "Ver movimientos" de Hecho hoy abre el panel de la derecha |
| 12 | Con un usuario cocinero | No ve "+ Pedir a cocina", ni ✎, ni "Pedir a cocina" en el ⋯ |
| 13 | Celu (390 px) | Título arriba, los 4 botones en 2 columnas, pestañas, buscador y Plan uno debajo del otro; la tabla se mueve de costado adentro de su tarjeta. Cada ventana ocupa toda la pantalla |
| 14 | Otra pantalla (Consultar Pedidos, Gestión de Stock) | Igual que antes |

### Pantalla 5 (27/10): el panel con el diseño final (`diseno-panel-final/`) — qué se hizo y cómo mirarlo
Detalle completo (archivos, HTML, JS línea por línea, perillas, reglas sacadas, pruebas, seguridad, lo que no quedó igual
y las dudas) en la sección 19 de `INFORME-CAMBIOS-HELADERA.md`. El plan: `diseno-panel-final/PLAN.md`. Las capturas:
`diseno-panel-final/resultado/`.
- **Todo el panel (el molde, en `global.css`):**
  - la barra de arriba: "Panel / [pantalla]" y la fecha de hoy (sin el buscador ni la "M");
  - el título de 28 px gris oscuro y la bajada gris;
  - las tablas: títulos de 12 px en MAYÚSCULA sin franja, filas de 60 px, líneas finitas, y el pie adentro de la tarjeta
    con "Mostrando **X** de **Y**" y "‹ Anterior · 1 · Siguiente ›".
- **Producción:**
  - las columnas Plato · Plan · Disponibles · Reservadas · Total · Estado · Mínimo · •••;
  - las pastillas y las filas con los colores del diseño; "—" en un plato sin mínimo; el ••• verde;
  - "Plan · Mantenimiento" con su menú (✓ y "Limpiar filtro");
  - "Pedir a cocina" como las capturas 03 y 04.
- **Consultar Pedidos:**
  - la bajada y una barra en 3 partes: Buscar · "Entrega: Cualquier día" · "Estado: Todos ▾" (con la lista y sus cantidades);
  - la tabla en 9 columnas, con 2 renglones por celda; Estado como pastilla con ▾; Detalles · Pago · Anular siempre a la
    vista; los anulados en gris con el costo tachado.
- **Comprobado:**
  - todas las pantallas a 1440, 1280, 1024 y 390, con la consola sin errores;
  - Producción 51/51, con lo que escribe atajado en el navegador (nada llegó a la base);
  - Consultar con un pedido de prueba (#58): cambió de estado, se cobró y se anuló; la heladera quedó igual;
  - test HELADERA **37/40**: los 3 que fallan son por la fecha. Esta compu dice 27/10 y la base guarda 22/10, y el test
    busca "los movimientos de hoy" con la fecha de la compu. Los movimientos están y son los correctos (INFORME 19.8).
- **Para mirar vos:** la fecha de la compu. Si está mal, la barra de arriba muestra otro día y ese test falla.

**Recorrido a mano (Pantalla 5, 27/10).** No hace falta reiniciar el servidor: solo cambiaron archivos del frontend.
Ctrl+F5 en cada pantalla, con tu usuario. Para el celu: F12 → ícono del celular (Ctrl+Shift+M) → ancho 390.
**Cambiar un estado, "Pago → Guardar", "Anular", "Enviar a cocina", "Hecho" y "Confirmar descarte" escriben en la base de
verdad:** hacelos solo con un pedido "PRUEBA – NO PREPARAR" (y anulalo al final), o cancelá antes de confirmar.
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Abrís cualquier pantalla del panel | Arriba, "Panel / [pantalla]" a la izquierda y la fecha de hoy a la derecha; el título más chico y gris oscuro |
| 2 | Producción | La bajada nueva; los 4 botones a la derecha; la tarjeta con las pestañas (con puntito de color), el buscador y "Plan"; Estado después de Total; los títulos en MAYÚSCULA; el pie adentro, con los números en negrita |
| 3 | Pestañas "Bien", "Bajos" y "Todos" | La elegida con fondo gris y en negrita; la tabla muestra solo esos |
| 4 | "Plan" → elegís un plan | El botón se pone verde y dice "Plan · Mantenimiento"; en el menú, la elegida con ✓; "Limpiar filtro" lo saca |
| 5 | Pasás el mouse por "Disponibles" y la tocás dos veces | Aparece la flechita; ordena de menos a más y al revés |
| 6 | ✎ en Mínimo, cambiás el número y Enter (o Escape) | Se guarda (con Escape, no). Un plato sin mínimo muestra "—" |
| 7 | ••• de un plato | Ver movimientos del plato · Pedir a cocina · Descartar viandas (como antes) |
| 8 | "+ Pedir a cocina" | El ícono, el título y la X redonda; los campos con 📅, ▾ y lupa; las pestañas y "Cargar rápido:" pegados arriba de la tabla; cada plato con su pastilla al lado; "Tu pedido" blanco con "Para el [día] dd/mm" |
| 9 | "+" en dos platos | La fila verde clarito y el número verde; en "Tu pedido", cada plato con "N viandas" y su X; "Enviar a cocina" se prende. Cancelar |
| 10 | Consultar Pedidos | La bajada; la barra en 3 partes con "Entrega: [el próximo día hábil]" y "Estado: Todos"; la tabla en 9 columnas |
| 11 | "Ver todos" | "Entrega: Cualquier día" y todos los pedidos; las páginas abajo |
| 12 | "Estado: Todos ▾" | Se abre la lista con el puntito y la cantidad de cada estado. Tocás "Registrado": se cierra, la barra dice "Estado: Registrado" en verde y la tabla muestra solo esos. Escape o un clic afuera la cierran |
| 13 | Elegís una fecha en "Entrega" y "Aplicar" | Solo los pedidos de ese día |
| 14 | Un pedido de prueba: Detalles, Pago (Cancelar) y Anular (Cancelar) | Las ventanas como antes |
| 15 | Un pedido anulado | Todo en gris, el costo tachado, "Pago" clarito y "Anulado" en gris |
| 16 | Celu (390 px) | Producción: el título arriba, los 4 botones en 2 columnas, los filtros uno debajo del otro, la tabla se mueve adentro de su tarjeta y "Pedir a cocina" a pantalla completa. Consultar: la barra en 3 renglones, Aplicar y Ver todos uno al lado del otro y la tabla se mueve adentro |
| 17 | Otras pantallas (Gestión de Stock, Usuarios, Combos, Movimientos de Stock…) | Andan como antes, con la barra nueva y los títulos de las tablas en MAYÚSCULA |

**Para commitear (lo hacés vos), después del recorrido:** `.gitignore`, `frontend/pages/heladera.html`,
`frontend/pages/ConsultarPedidos.html`, `frontend/src/css/global.css`, `frontend/src/css/menuPanel.css`,
`frontend/src/css/heladera.css`, `frontend/src/css/ConsultarPedidos.css`, `frontend/src/css/movimientosStockNuevo.css`,
`frontend/src/js/adminSidebar.js`, `frontend/src/js/paginacion.js`, `frontend/src/js/heladera.js`,
`frontend/src/js/pedirCocina.js`, `frontend/src/js/ListarPedidos.js` y los dos `docs/`. `diseno-panel-final/` no se sube.

### Pantalla 5, cambio chico (27/10): Consultar en 11 columnas y Producción con Plato fijo
Detalle en la sección 20 de `INFORME-CAMBIOS-HELADERA.md`. Capturas: `diseno-panel-final/resultado/cambio-columnas/`.
- **Consultar Pedidos:**
  - vuelven las 11 columnas de antes, con el estilo nuevo: N° Pedido · Entrega · Cliente · Dirección · Teléfono · Mail ·
    Viandas · Costo · Estado · Método Pago · Acciones;
  - Cliente y Mail chicas, con "…" (el texto entero, al pasar el mouse);
  - a 1440 la tabla se mueve 153 px adentro de su tarjeta y **Acciones queda fija a la derecha**; a 1920 entra entera y
    ninguna columna queda gigante.
- **Producción:**
  - Plato fijo (260 px) y Plan pegada;
  - lo que sobra en una pantalla grande va a las columnas de números;
  - "Pedir a cocina", igual.
- **Comprobado:**
  - 16/16 controles a 1440, 1920, 1280, 1024 y 390, solo leyendo. Cambiar un estado se probó con el #057: lo que iba a mandar
    se cortó en el navegador y el #057 sigue igual en la base;
  - test HELADERA 37/40, los mismos 3 por la fecha (pedidos #61 y #62, anulados por el test).

**Recorrido a mano (cambio chico, 27/10).** Ctrl+F5, con tu usuario.
| # | Qué hacés | Qué tiene que pasar |
|---|---|---|
| 1 | Consultar Pedidos → "Ver todos" | Las 11 columnas en el orden de antes; el N° en negrita; la fecha en Entrega; Cliente y Mail con "…" si son largos |
| 2 | Movés la tabla de costado (con la rueda + Shift, o la barrita de abajo de la tabla) | Lo demás se mueve y Acciones (Detalles · Pago · Anular) queda quieta a la derecha, con una línea a su izquierda |
| 3 | Pasás el mouse por un cliente o un mail cortado | Aparece entero |
| 4 | Un pedido con personalizados | "⚠ N personalizados" debajo de las viandas (puede ir en 2 renglones) |
| 5 | Producción en tu pantalla | Plan pegada a Plato; si la pantalla es grande, el espacio de más queda en Disponibles, Reservadas, Total y Mínimo |
| 6 | Celu (390 px) | Consultar: Acciones queda fija a la derecha (ocupa más de la mitad: decime si en el celu la preferís suelta). Producción: la tabla se mueve adentro de su tarjeta |

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
