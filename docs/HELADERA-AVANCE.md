# Heladera — avance del refactor (15/10/2026)

Leer junto con `ESTADO-PROYECTO.md`, `CLAUDE.md` y `docs/informe_heladera.md`. Este archivo dice **dónde estamos parados** en la heladera.

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
| **H3** | **PRODUCIR**: bloque 2 + pruebas 2A/2B + 1 línea en la ruta "Hecho" | ⏭ SIGUE |
| H4 | DEVOLVER + anulado final (bloque 3, server.js, ListarPedidos.js) | |
| H5 | Nada para cocinar → 3 al pasar a 2 (server.js + ListarPedidos.js) | |
| H6 | VENDER adentro de `crear_pedido_combos` (EL INTERRUPTOR). Candados ordenados por id_producto. Antes: anular pedidos de prueba abiertos | |
| H7 | Prueba completa real + marcas NO USAR + actualizar informe | |
| H8 | Rehacer el código de las pantallas de heladera (`heladera.js`, `pedidosCocina.js` y sus rutas) con mis reglas + cambios de pantalla (reservadas, filtros, mínimo editable) + Word con el recorrido completo | |

Commit: H1 + H2 van en un solo commit (H1 no se había commiteado). Mensaje: `H1 + H2: insumos solo de cocina, errores simples, login sin email, descartar_viandas`.

## Cómo se prueba cada paso SQL
1. Correr el bloque del paso en `sql/heladera.sql` (de `begin;` a `commit;`).
2. En `sql/heladera_probar.sql`, seleccionar con el mouse cada parte y Run:
   - Casos que fallan → columna `coincide` = "sí" en todas.
   - Caso "de mentira" → termina con un ERROR en rojo a propósito ("FIN DE LA PRUEBA…"); Postgres deshace todo.
   - Comprobar → que no quedó nada guardado.
3. Reiniciar el servidor (siempre DESPUÉS del SQL).
4. Prueba desde la consola del navegador que no guarde nada (ej. descartar 999 → 409).
5. Commit.
Nota: cada caso de mentira gasta un número de id (ej. el renglón 17 se usó en la prueba de H2).

## Arreglar después de H7 (anotado, no meter antes)
- `descontarStockPedido` controla "ya descontado" buscando el texto "pedido #500" en el motivo → también encuentra "pedido #5000". Arreglar antes de producción.
- `descontarStockPedido` descuenta insumo por insumo (no todo o nada). Pasarlo a una función de la base como las otras.

## Próximo prompt para Claude Code (🔴 MODO POTENTE, Effort Max)
```
OK a H2: 1A todo "sí", 1B dio 71 → 69 y se deshizo, 1C quedó en 71 con 0 renglones, la consola dio 409 con « ». Hice un solo commit H1+H2.
Seguí con H3 (PRODUCIR): bloque 2 de heladera.sql con producir_viandas (no mira id_pedido_detalle), pruebas 2A (casos que fallan) y 2B (caso de mentira: crear un pedido a cocina de 2 fideos y tocar Hecho dentro del bloque; mostrar heladera antes/después, el renglón "produccion" y cuánto bajó cada insumo; después se deshace), y la línea de la ruta "Hecho". Explicámela con ENTRADA, SALIDA, paso a paso con fideos 71 → +2 → 73 y cómo baja cada insumo. No hagas commit. Esperá mi OK.
```

## Cómo trabajamos (recordatorio)
- Claude Code escribe el código; el chat arma prompts, revisa planes y reportes, explica el código y dice cómo probar y cuándo commitear.
- Cada reporte de Claude Code se revisa buscando errores ANTES de dar el OK.
- Nunca pasar a 3 un pedido de prueba con personalizados, ni ninguno a 4.
- Probar cuando mi prima no esté cargando.
