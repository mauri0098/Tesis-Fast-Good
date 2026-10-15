# Heladera — avance del refactor (15/10/2026)

Leer junto con `ESTADO-PROYECTO.md`, `CLAUDE.md` y `docs/informe_heladera.md`. Este archivo dice **dónde estamos parados** en la heladera.
Se actualiza al terminar cada paso: estado, resultados y el próximo prompt.

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
| **H5** | **Nada para cocinar → 3 al pasar de 1 a 2** (server.js + ListarPedidos.js) | ✍ escrito, **falta probar** (ver "H5 + H6 — qué se hizo y cómo probarlo") |
| **H6** | **VENDER adentro de `crear_pedido_combos` (EL INTERRUPTOR).** Candado a todos los platos del pedido, ordenados por id_producto | ✍ escrito, **falta correr el SQL y probar** (ver "H5 + H6 — qué se hizo y cómo probarlo") |
| H7 | Prueba completa real + marcas NO USAR + actualizar informe | |
| H8 | Rehacer el código de las pantallas de heladera (`heladera.js`, `pedidosCocina.js` y sus rutas) con mis reglas + cambios de pantalla (reservadas, filtros, mínimo editable) (el Word pasó a H10) | |
| H9 | REFACTOR PARA ENTENDER: repasar todo el código de la heladera (las funciones de `heladera.sql`, `crear_pedido_combos`, las rutas de `server.js` que las llaman, `heladera.js` y `pedidosCocina.js`) con las reglas de CLAUDE.md y ENTRADA/SALIDA arriba de cada función, sin cambiar lo que hace | |
| H10 | RECORRIDO COMPLETO: un Word de punta a punta con fideos (producir → vender → cocina con personalizado → pasar a 3 → entregar/anular → descartar), con pantalla, ruta, función, tablas y números en cada paso, y el DER actualizado | |

**Orden para probar H4 → H6 (acordado el 15/10):**
1. ✅ Probar H4.
2. Reiniciar el servidor con H5 (no cambia nada todavía: ningún pedido tiene viandas de heladera).
3. ✅ Anular los pedidos de prueba #5 y #6.
4. Recién ahí correr el SQL de H6 (el interruptor) y probar en la web.

Commits: H1 + H2 en uno solo (`H1 + H2: insumos solo de cocina, errores simples, login sin email, descartar_viandas`).
H3: el código está en "avancess" (las pruebas no pidieron cambios); los resultados, en el commit del doc.
H4: commit "h4".
H5 + H6: un solo commit cuando estén probados. Mensaje sugerido: `H5 + H6: vender desde la heladera y pedido sin nada para cocinar pasa a 3`.
Informe de todo lo que cambió (H1 a H6): `docs/INFORME-CAMBIOS-HELADERA.md`.

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

## H5 + H6 — qué se hizo y cómo probarlo (15/10)
Qué se hizo:
- **H6, `sql/pedido_combos_funciones.sql`** (`crear_pedido_combos`, mismas entradas y salida):
  - Parte 1, controles nuevos: 11) lista de ventas: por plato, las viandas normales sumando todos los combos; 12) candado a TODOS los platos del pedido, en orden de número; 13) si no alcanza → "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12" (no se guarda nada).
  - Parte 2: platos normales con `cantidad_de_heladera = cantidad` y `listo = true`; personalizados con 0 y `false`; 16) por cada plato de la lista: renglón "venta" (−N) con el pedido, el usuario del pedido y "Pedido #N", y la heladera baja N.
- **Pruebas 6A, 6B y 6C** en `sql/pedido_combos_probar.sql` (opcionales: se deshacen solas).
- **H5, `server.js`, `PUT /estado`:** de 1 a 2, si el pedido tiene platos y ninguno va a la cocina (cantidad − cantidad_de_heladera = 0 en todos), queda en 3.
- **H5, `ListarPedidos.js`, `cambiarEstadoPedido`:** muestra el estado que guardó el servidor y, si saltó a 3, avisa "Pedido #N: todo sale de la heladera, pasó directo a Listo para Entregar."
- `server.js`: solo cambió el comentario de la ruta `POST /api/pedidos-combos` (ya no dice "SIN HELADERA"). Su código no cambia por H6.

Cómo probarlo, en orden (cuando tu prima no esté cargando):
1. Reiniciar el servidor (entra H5).
2. Supabase → SQL Editor: todo `sql/pedido_combos_funciones.sql` (de `begin;` a `commit;`, **líneas 43–389**) → Run. Desde acá la web nueva saca de la heladera.
3. Opcional, en `sql/pedido_combos_probar.sql`: **6A** (líneas 146–211) → error rojo con "coincide: sí" en los 2; **6B** (líneas 228–340) → error rojo: antes 71 · A) heladera 53 · una venta −18 "Pedido #N" a nombre de Consumidor Final · platos "8 (de heladera 8, listo sí) | 2 sin sal (de heladera 0, listo no) | 10 (de heladera 10, listo sí)" · la cocina ve 1 · B) heladera 53 · ventas de B 0 · C) `{"ok": true, "viandas_devueltas": 18}` → 71; **6C** (líneas 348–360) → 71, 0, 0.
4. Pruebas en la web (con nombre "PRUEBA – NO PREPARAR", Retiro en local, Efectivo):
   - **a. Combo con personalizado:** 1 combo con 8 fideos + 2 fideos "sin sal" → en Producción, fideos baja 8 (71 → 63) y en Últimos movimientos aparece "Venta −8 · Pedido #N". En Consultar Pedidos, pasarlo de 1 a 2 → queda en 2. En Tareas de Cocina se ve solo "2 fideos ⚠ sin sal". **No pasarlo a 3** (gastaría insumos reales): anularlo → fideos vuelve a 71 y aparece "Devolución +8 · Anulación del pedido #N".
   - **b. Todo de heladera:** 1 combo con 10 fideos → fideos 71 → 61. Pasarlo de 1 a 2 → salta solo a "Listo para Entregar", con el cartel "todo sale de la heladera…". No aparece en Tareas de Cocina, y en Movimientos de Stock no hay insumos nuevos. Anularlo → 71.
   - **c. Pedir más de lo que hay:** con un plato que tenga pocas viandas (ej. 11), 2 combos con 10 de ese plato → al confirmar: "No quedan suficientes viandas de «…»: pediste 20 y quedan 11". No se crea el pedido y Producción no cambia. Si ningún plato tiene pocas, alcanza con la 6A.
   - **d. Al final:** Producción con los números del principio y ningún pedido de prueba abierto.
5. Commit.

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
- `descontarStockPedido` controla "ya descontado" buscando el texto "pedido #500" en el motivo → también encuentra "pedido #5000". Arreglar antes de producción.
- `descontarStockPedido` descuenta insumo por insumo (no todo o nada). Pasarlo a una función de la base como las otras.
- Huevo está en −35 en la base real: falta cargar compras o hacer un ajuste.
- El aviso `insumo_corto` calcula "falta" = necesario − disponible. Con stock negativo se lee raro: la prueba de H3 usó 4 huevos y dijo "falta 39" (4 − (−35)).
- Choque raro (H4): si anulan un pedido justo mientras otro lo pasa a 3, no revive (por el `.neq`), pero los insumos de sus personalizados ya se descontaron (se arregla junto con pasar `descontarStockPedido` a la base). En ese choque los mensajes dicen "Stock insuficiente" / "falta de stock" en vez de "anulado".
- El cartel "Volvieron N viandas a la heladera" queda para B2 (H8): la ruta anular ya devuelve `viandas_devueltas` y un `mensaje` con el número.
- Para H8: en Consultar Pedidos, un pedido cancelado sigue con el botón "Pago" activo. Revisar si se puede registrar un pago en un anulado (pantalla y rutas `/pago`, `/pagado`, `/transferencia-confirmada`).
- Para H8: si al confirmar el pago (paso de 1 a 2) el pedido salta a 3 y después falla el registro del pago, el aviso dice "El pedido pasó a En Preparación…" aunque quedó en 3.
- Para B7 (H8): si la web nueva recibe "No quedan suficientes viandas…", que vuelva a pedir los combos para mostrar lo que queda.

## Próximo prompt para Claude Code (🔴 MODO POTENTE, Effort Max)
Para mandar después de probar H5 + H6. Completá los [ ] con lo que pasó.
```
OK a H5 + H6: reinicié el servidor y corrí sql/pedido_combos_funciones.sql (líneas 43–389). Web: a) 8 fideos + 2 "sin sal" → fideos [71 → 63], venta −8; pasado a 2 quedó en 2 y la cocina vio solo los "sin sal"; anulado → [71]. b) 10 fideos → [61]; de 1 a 2 saltó a 3 con el cartel, no apareció en cocina ni gastó insumos; anulado → [71]. c) pedir de más → [mensaje] sin crear nada. [6A/6B/6C: resultados, si las corrí]. Hice commit.
Seguí con H7: marcas NO USAR (comentario en el .sql + comment on function / comment on column en la base) para las funciones viejas de la lista de docs/INFORME-CAMBIOS-HELADERA.md, sin borrar nada y sin romper Render (que todavía usa marcar_detalle_hecho y registrar_descarte_vianda), y actualizar docs/informe_heladera.md con cómo quedó todo. Primero mostrame el plan. No hagas commit.
```

## Cómo trabajamos (recordatorio)
- Claude Code escribe el código; el chat arma prompts, revisa planes y reportes, explica el código y dice cómo probar y cuándo commitear.
- Cada reporte de Claude Code se revisa buscando errores ANTES de dar el OK.
- Nunca pasar a 3 un pedido de prueba con personalizados, ni ninguno a 4.
- Probar cuando mi prima no esté cargando.
- Hasta el merge, los pedidos de combos de prueba se anulan y se mueven SOLO desde el servidor nuevo: Render (código viejo) anula sin devolver viandas y pasa a 3 con la fórmula vieja de insumos.
