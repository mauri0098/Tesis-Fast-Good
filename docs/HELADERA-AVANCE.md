# Heladera — avance del refactor (15/10/2026)

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
| **H8** | **Pantallas: `heladera.js`, `pedidosCocina.js`, `ListarPedidos.js` y sus rutas reescritos con mis reglas + reservadas, filtros de movimientos, mínimo editable, "Volvieron N viandas", recargar combos y Pago bloqueado en anulados** (el Word pasó a H10) | ✍ Parte 1 en 3 paradas. **Parada 1 (Producción): escrita, falta probar en la web** (ver "H8 — parada 1"). ⏭ Parada 2 (Consultar Pedidos). ⏭ Parada 3, ampliada el 16/10 (ver "H8 — parada 3"): 3A cocina y web nueva · 3B C1 (insumos de un pedido en una función de la base) · 3C Movimientos de Stock todo junto. Plan mostrado en el chat, esperando OK |
| **H9** | **REFACTOR PARA ENTENDER (Parte 2): las 4 funciones de `heladera.sql`, `crear_pedido_combos` y las rutas de `server.js` que las llaman**, con las reglas de CLAUDE.md y ENTRADA/SALIDA arriba de cada función, sin cambiar lo que hacen (mismas entradas, salidas y mensajes) | ⏭ después de probar la Parte 1 |
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

## H8 — parada 3: plan ampliado (16/10, esperando OK)
Pedido del usuario (16/10): **Movimientos de Stock muestra TODO junto**: insumos (`movimientos_stock`) y viandas
(`movimientos_viandas`), del más nuevo al más viejo, **una fila por movimiento** con botón Detalle (Ver/Ocultar), como hoy "Compra #2".
- Columnas: Fecha y hora · Origen · Referencia · Tipo (▲ Entrada / ▼ Salida) · Resumen ("6 insumos", "2 viandas · 2 insumos") · Usuario · Proveedor (solo compras; si no, "—") · Motivo · Detalle.
- Filtros: Todo / Insumos / Viandas, y Entradas / Salidas.
- Sin cambiar la base, salvo C1: solo la ruta y la pantalla.

| Origen | Tipo | Referencia | Qué muestra el Detalle |
|---|---|---|---|
| Compra | ▲ | Compra #N | insumos, cantidad y vencimiento (como hoy) |
| Producción | ▲ | Pedido a cocina #N | viandas que entraron + insumos que se usaron (unidos por `id_movimiento_vianda`), quién lo pidió y quién marcó Hecho. Motivo: "Producción de viandas" |
| Venta | ▼ | Pedido #N | cliente y platos que salieron de la heladera |
| Devolución | ▲ | Pedido #N anulado | platos que volvieron |
| Descarte | ▼ | — | platos y motivo |
| Cocina de un pedido | ▼ | Pedido #N | insumos que gastaron los personalizados |
| Ajuste | ▲ / ▼ | — | qué y por qué |

Plan propuesto (en el chat del 16/10), en tres paradas chicas, con prueba en la web después de cada una:
- **3A**: cocina y web nueva (lo que ya estaba): `pedidosCocina.js` y `GET …/pendientes` con las reglas; la web nueva vuelve a pedir los combos cuando sale "No quedan suficientes".
- **3B**: C1. Columna nueva `movimientos_stock.id_pedido` (solo agregar) y función de la base `descontar_insumos_pedido(p_id_pedido, p_id_usuario)`: todo o nada, con candado al pedido y a los insumos, no descuenta un anulado y guarda quién fue. Usa el mismo texto de motivo ("Consumo por producción pedido #005") para que Render siga viendo lo descontado hasta el merge. SQL nuevo: `sql/insumos_pedido.sql` y `sql/insumos_pedido_probar.sql`.
- **3C**: ruta nueva `GET /api/movimientos?desde=&hasta=` (junta las dos tablas y trae de a 1000 renglones hasta tener todo) y la tabla de `MovimientosStockNuevo.html` / `movimientosStockNuevo.js` (el modal "Registrar compra" no se toca).

Decisiones pendientes: OK para reescribir la parte de la tabla de `movimientosStockNuevo.js`; C1 sí o no; qué pasa con el menú al final.

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
- `descontarStockPedido` controla "ya descontado" buscando el texto "pedido #500" en el motivo → también encuentra "pedido #5000". Y un movimiento cargado a mano con "pedido #012" en el motivo haría que el pedido #12 no descuente nunca. Arreglar antes de producción → **propuesto para H8, parada 3B (C1)**.
- `descontarStockPedido` descuenta insumo por insumo (no todo o nada) y no guarda quién fue. Pasarlo a una función de la base como las otras → **parada 3B (C1)**.
- Huevo está en −35 en la base real: falta cargar compras o hacer un ajuste. (La compra se carga antes de las pruebas de H7. Mientras siga en negativo, ningún pedido con personalizados que lleven huevo puede pasar a 2: lo mostró la prueba "a" de H6.)
- El aviso `insumo_corto` calcula "falta" = necesario − disponible. Con stock negativo se lee raro: la prueba de H3 usó 4 huevos y dijo "falta 39" (4 − (−35)).
- Choque raro (H4): si anulan un pedido justo mientras otro lo pasa a 3, no revive (por el `.neq`), pero los insumos de sus personalizados ya se descontaron (se arregla junto con pasar `descontarStockPedido` a la base). En ese choque los mensajes dicen "Stock insuficiente" / "falta de stock" en vez de "anulado".
- El cartel "Volvieron N viandas a la heladera" queda para B2 (H8, **parada 2**): la ruta anular ya devuelve `viandas_devueltas` y un `mensaje` con el número.
- Para H8 (**parada 2**): en Consultar Pedidos, un pedido cancelado sigue con el botón "Pago" activo. Revisar si se puede registrar un pago en un anulado (pantalla y rutas `/pago`, `/pagado`, `/transferencia-confirmada`).
- Para H8 (**parada 2**): si al confirmar el pago (paso de 1 a 2) el pedido salta a 3 y después falla el registro del pago, el aviso dice "El pedido pasó a En Preparación…" aunque quedó en 3.
- Para B7 (H8, **parada 3**): si la web nueva recibe "No quedan suficientes viandas…", que vuelva a pedir los combos para mostrar lo que queda.
- **Vencimiento de las viandas** (columna nueva): hoy solo tienen vencimiento los insumos de las compras (`movimientos_stock.fecha_vencimiento`). Anotado para más adelante: **NO hacerlo ahora**.
- Movimientos de Stock: en la página nueva, "− Registrar salida" todavía no hace nada (no tiene función). En la vieja, `POST /api/movimientos-stock` no guarda quién lo cargó ni es todo o nada, y `DELETE /api/movimientos-stock/:id` borra renglones (contra "se desactiva, no se borra"). `GET /api/movimientos-stock` trae como mucho 1000 renglones.
- **Consultar Pedidos trae como mucho 1000 pedidos** (límite de Supabase por consulta): `GET /api/pedidos` los ordena del más nuevo al más viejo, así que cuando haya más, los más viejos no se ven (salvo filtrando por fechas). Hace falta paginación más adelante (que el servidor mande de a una página). Lo mismo, mucho más lejos, para las reservadas de Producción: se suman como mucho 1000 renglones de pedidos sin entregar.

## Próximo prompt para Claude Code (🔴 MODO POTENTE, Effort Max)
La parada 3 se amplió el 16/10 y su plan espera OK (ver "H8 — parada 3"): se puede contestar junto con el resultado de la parada 1.
Después de probar la parada 1 en la web (lista de "H8 — parada 1"), mandar este (cambiando los resultados):
```
Probé la parada 1 de H8 (Producción) en la web: [resultados de las pruebas 1 a 13, o qué falló].
Si algo falló, arreglalo primero y frená. Si está todo bien: actualizá docs/HELADERA-AVANCE.md y la sección 8.1 de
docs/INFORME-CAMBIOS-HELADERA.md con los resultados, y seguí con la PARADA 2 (Consultar Pedidos) del plan aprobado:
ListarPedidos.js reescrito con mis reglas + pagoPedido.js nuevo, el botón "Pago" apagado en los anulados (y las rutas
/pago, /pagado y /transferencia-confirmada que respondan 409 si el pedido está anulado), el cartel "Volvieron N viandas"
al anular, y PUT /estado + cambiarEstadoPedido con mis reglas. Explicame cada función con ENTRADA/SALIDA, decime qué
pruebo en la web y frená. Todo al INFORME-CAMBIOS-HELADERA.md. No hagas commit.
```
Si el chat se corta en el medio de la parada 1 (antes de probarla), mandar este:
```
Estamos en H8, Parte 1, parada 1 (Producción): ya está escrita (ver docs/HELADERA-AVANCE.md, "H8 — parada 1", y la
sección 8.1 de docs/INFORME-CAMBIOS-HELADERA.md). No la vuelvas a escribir. Revisá esos cambios buscando errores
(server.js: GET /api/viandas-stock, PUT /api/viandas-stock/:id/minimo, GET /api/movimientos-viandas; heladera.js,
pedirCocina.js, heladera.html, heladera.css) y decime qué encontraste sin arreglar nada sin mi OK. No hagas commit.
```

## Cómo trabajamos (recordatorio)
- Claude Code escribe el código; el chat arma prompts, revisa planes y reportes, explica el código y dice cómo probar y cuándo commitear.
- Todo cambio (código, SQL, pantallas) se agrega también a `docs/INFORME-CAMBIOS-HELADERA.md` (ver la REGLA de arriba).
- Cada reporte de Claude Code se revisa buscando errores ANTES de dar el OK.
- Nunca pasar a 3 un pedido de prueba con personalizados, ni ninguno a 4.
- Probar cuando mi prima no esté cargando.
- Hasta el merge, los pedidos de combos de prueba se anulan y se mueven SOLO desde el servidor nuevo: Render (código viejo) anula sin devolver viandas y pasa a 3 con la fórmula vieja de insumos.
