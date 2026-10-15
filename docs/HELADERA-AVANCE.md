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
| **H4** | **DEVOLVER + anulado final** (bloque 3, server.js, ListarPedidos.js) | ✍ escrito, **falta probar** (bloque 3 + 3A, 3B, 3C + consola + grilla: ver "H4 — qué se hizo y cómo probarlo") |
| H5 | Nada para cocinar → 3 al pasar a 2 (server.js + ListarPedidos.js) | |
| H6 | VENDER adentro de `crear_pedido_combos` (EL INTERRUPTOR). Candados ordenados por id_producto. Antes: anular pedidos de prueba abiertos | |
| H7 | Prueba completa real + marcas NO USAR + actualizar informe | |
| H8 | Rehacer el código de las pantallas de heladera (`heladera.js`, `pedidosCocina.js` y sus rutas) con mis reglas + cambios de pantalla (reservadas, filtros, mínimo editable) + Word con el recorrido completo | |

Commits: H1 + H2 en uno solo (`H1 + H2: insumos solo de cocina, errores simples, login sin email, descartar_viandas`).
H3: el código está en "avancess" (las pruebas no pidieron cambios); los resultados, en el commit del doc.
H4: un solo commit cuando esté probado. Mensaje sugerido: `H4: anular devuelve viandas (anular_pedido_con_devolucion) y anulado final`.

## H3 — revisión y resultado (15/10)
- `producir_viandas` hace lo mismo que `marcar_detalle_hecho` + `aplicar_produccion_viandas` (modo flexible): mismos textos, mismos errores y avisos, misma respuesta, mismo `id_movimiento_vianda` y mismos candados. En `server.js` solo cambió el nombre de la función.
- Única diferencia: con un insumo en 0 en la receta que ya está en negativo, la vieja avisaba "Faltaron…" y la nueva no. **Decisión: queda como está.**
- Probado el 15/10: resultados en la tabla de arriba.
- Ya estaba así antes (para H8): la pantalla muestra "Ya estaba marcado." con cualquier 409, aunque el error sea otro.

## H4 — qué se hizo y cómo probarlo (15/10)
Qué se hizo:
- `sql/heladera.sql`, bloque 3: `anular_pedido_con_devolucion(p_id_pedido, p_id_usuario)`. En 1, 2 o 3 devuelve, plato por plato, −(ventas + devoluciones) de ese pedido en el cuaderno (renglón "devolucion" + "Anulación del pedido #N"); en 4 no devuelve; pasa a 5. Responde `{ ok, viandas_devueltas }`.
- `sql/heladera_probar.sql`: 3A, 3B y 3C.
- `server.js`:
  - Ruta anular: llama a la función (mismo PIN, roles y límite; usuario del token; id con `Number`, entero, > 0 y ≤ `ENTERO_MAXIMO_BASE`). `ok: false` → 409 (antes "no existe" era 404 "Pedido no encontrado").
  - `PUT /estado`: pedido y estado controlados (400), 404 si no existe, 409 si está anulado.
  - `cambiarEstadoPedido`: `.neq('id_estado', 5)` + `.maybeSingle()`; si no cambió nada → 409 y corta antes de marcar los platos listos.
- `ListarPedidos.js`: un anulado tiene el select bloqueado; al anular, el estado queda en 5 sin leer la respuesta.

Cómo probarlo, en orden:
1. Supabase → SQL Editor: bloque 3 de `sql/heladera.sql` (de `begin;` a `commit;`, líneas 344–453) → Run.
2. En `sql/heladera_probar.sql`, seleccionar cada parte y Run:
   - **3A** (líneas 326–364): 4 filas, todas "sí".
   - **3B** (líneas 383–493): ERROR en rojo "FIN DE LA PRUEBA (no quedó nada guardado)…". Con fideos en 71 tiene que decir: antes 71 · con la venta 61 · 1) `{"ok": true, "viandas_devueltas": 10}` → 71 · estado 5 · renglón "tipo devolucion · cantidad 10 · motivo "Anulación del pedido #N"" · 2) `{"ok": false, "error": "El pedido ya está anulado"}` · 3) `{"ok": true, "viandas_devueltas": 0}` → 71 · 4) `{"ok": true, "viandas_devueltas": 0}` → 61 · estado 5.
   - **3C** (líneas 506–524): heladera_fideos igual al "antes" de 3B; pedidos_de_prueba, ventas_y_devoluciones y pedidos_sin_estado en 0. Anotar `pedido_anulado_para_la_consola`.
3. Reiniciar el servidor.
4. Consola del navegador, logueado como admin, en Consultar Pedidos (nada de esto guarda):
   - Anular un pedido que no existe (poné tu PIN en lugar de TU_PIN y no lo pegues en el chat):
     `const r = await apiFetch('/api/pedidos/2147483647/anular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: 'TU_PIN' }) }); console.log(r.status, await r.json());`
     → `409 { error: 'El pedido no existe' }` (el código viejo daba 404: así se ve que corre el nuevo).
   - Mover un anulado (usar SOLO el número de `pedido_anulado_para_la_consola` de 3C):
     `const r2 = await apiFetch('/api/pedidos/NUMERO/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_id: 1 }) }); console.log(r2.status, await r2.json());`
     → `409 { error: 'Un pedido anulado no cambia de estado' }`.
   - Estado inválido (con el mismo NUMERO):
     `const r3 = await apiFetch('/api/pedidos/NUMERO/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_id: 9 }) }); console.log(r3.status, await r3.json());`
     → `400 { error: 'Estado inválido' }`.
5. Grilla: un pedido anulado tiene el select de estado gris (no se puede abrir).
6. Opcional: si hay un pedido de prueba abierto ("PRUEBA – NO PREPARAR"), anularlo desde la grilla → "anulado correctamente" y queda con el select bloqueado (vuelven 0 viandas: no sacó de la heladera).
7. Commit.

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
   - H4: ver "H4 — qué se hizo y cómo probarlo".
5. Commit.
Nota: cada caso de mentira gasta números de id que no vuelven (H2: renglón 17 del cuaderno; H3: renglón 18 y pedido a cocina #9; H4: 2 números de pedido y algunos del cuaderno).

## Arreglar después de H7 (anotado, no meter antes)
- `descontarStockPedido` controla "ya descontado" buscando el texto "pedido #500" en el motivo → también encuentra "pedido #5000". Arreglar antes de producción.
- `descontarStockPedido` descuenta insumo por insumo (no todo o nada). Pasarlo a una función de la base como las otras.
- Huevo está en −35 en la base real: falta cargar compras o hacer un ajuste.
- El aviso `insumo_corto` calcula "falta" = necesario − disponible. Con stock negativo se lee raro: la prueba de H3 usó 4 huevos y dijo "falta 39" (4 − (−35)).
- Choque raro (H4): si anulan un pedido justo mientras otro lo pasa a 3, no revive (por el `.neq`), pero los insumos de sus personalizados ya se descontaron (se arregla junto con pasar `descontarStockPedido` a la base). En ese choque los mensajes dicen "Stock insuficiente" / "falta de stock" en vez de "anulado".
- El cartel "Volvieron N viandas a la heladera" queda para B2 (H8): la ruta anular ya devuelve `viandas_devueltas` y un `mensaje` con el número.

## Próximo prompt para Claude Code (🔴 MODO POTENTE, Effort Max)
Para mandar después de probar H4. Completá los [ ] con lo que dio cada prueba.
```
OK a H4: el bloque 3 corrió bien. 3A: 4 "sí". 3B: fideos [71] → con la venta [61] → 1) pedido #[N] anulado en 3: viandas_devueltas [10] → [71], estado 5, renglón "devolucion 10 · Anulación del pedido #[N]"; 2) "El pedido ya está anulado"; 3) [0] → [71]; 4) pedido #[M] entregado: [0] → [61], estado 5; y se deshizo. 3C: [71], 0, 0, 0. Consola: anular inexistente 409 "El pedido no existe"; mover el anulado 409; estado 9 → 400. Grilla: el anulado tiene el select bloqueado.
Seguí con H5 (nada para cocinar → 3 al pasar a 2). Primero mostrame el plan: al pasar un pedido a 2, si no tiene nada para cocinar (en todos sus platos cantidad − cantidad_de_heladera = 0, con NULL como 0), que pase directo a 3 con la lógica de siempre (descuento idempotente y platos listos). server.js y ListarPedidos.js (que la grilla muestre el estado que devuelve el servidor). Hoy no cambia nada: todos los pedidos tienen cantidad_de_heladera = 0. Explicámelo con ENTRADA y SALIDA. No hagas commit. Esperá mi OK.
```

## Cómo trabajamos (recordatorio)
- Claude Code escribe el código; el chat arma prompts, revisa planes y reportes, explica el código y dice cómo probar y cuándo commitear.
- Cada reporte de Claude Code se revisa buscando errores ANTES de dar el OK.
- Nunca pasar a 3 un pedido de prueba con personalizados, ni ninguno a 4.
- Probar cuando mi prima no esté cargando.
- Hasta el merge, los pedidos de combos de prueba se anulan y se mueven SOLO desde el servidor nuevo: Render (código viejo) anula sin devolver viandas y pasa a 3 con la fórmula vieja de insumos.
