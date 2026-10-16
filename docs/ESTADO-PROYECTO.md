# Estado del proyecto Fast Good (para retomar en otra cuenta / otro chat)

Última actualización: 15/10/2026. Leer junto con `CLAUDE.md` (reglas de trabajo) y los informes de `docs/`.

## Qué es
Fast Good: sistema de gestión de viandas para el negocio de mi prima (Villa Allende / Nueva Córdoba, Córdoba; ~400–500 viandas por día). Fue mi tesis de Analista en Sistemas (IES 21, aprobada con 9) y ahora es producción real.
- Repo GitHub: `mauri0098/Tesis-Fast-Good`. Web: https://tesis-fast-good.onrender.com (Render plan free).
- Reemplaza el WhatsApp + Excel que usa hoy mi prima. Hoy el sistema todavía no se usa en el día a día.
- Presupuesto aceptado por mi prima: módulos nuevos (compras ✅, combos, stock de viandas en heladera, pedidos a cocina, etc.).
- Ideas a futuro: PWA / app, pasar el backend a MVC de a poco, frontend a React, carga desde Excel, tabla de clientes/empresas (ej. Shell pide por WhatsApp con PIN).
- Stack: Node/Express (`server.js`), HTML/CSS/JS vanilla, Supabase Postgres con RLS, login propio con JWT (tabla `usuarios`, NO usa auth.users).
- Roles: 6 admin sistema, 5 dueño, 1 administrador, 2 cocinero, 3 repartidor, 4 consumidor.
- Ramas: **Rodriguez** = producción (Render la despliega sola). **mejoras-fastgood** = desarrollo. Se trabaja SIEMPRE en mejoras-fastgood y se mergea a Rodriguez solo cuando está probado.
- La base es la REAL. Claude Code no ejecuta SQL: lo escribe en `sql/` y yo lo corro en Supabase.

## Cómo me gusta trabajar
- Español argentino, simple, directo, paso a paso. Siempre ENTRADA / SALIDA.
- SQL con comentario en cada línea.
- Claude Code: un paso chico por vez, plan antes, explica cada función. Modo Manual.
- Funciones pocas y enteras (no funcioncitas), `forEach` para recorrer, nada de `? :` dentro de templates, `escHtml` siempre.
- Prompts etiquetados: 🟢 NORMAL (Effort High) / 🔴 MODO POTENTE (Effort Max) para lo delicado (base, pedidos, stock).
- Cuando me trabo, prefiero pistas o esqueleto; código completo solo si lo pido.
- Me gustan los Word / diagramas para entender (DER, recorridos).

## Decisiones de negocio (COMBOS) — ya acordadas
- Se vende solo por combos. Combo = 1 plan + cantidad (>0) + precio. Menú del combo en `combo_productos`, platos de CUALQUIER plan.
- El cliente elige platos del menú, repitiendo, hasta justo la cantidad. Varios combos por pedido, todo junto.
- Personalizado ("sin sal"): mismo precio, va a cocina, +1 día hábil, se puede pedir aunque no haya stock. Texto en `pedido_detalles.observaciones_plato`, `personalizado = true`.
- `precio_unitario` = precio del combo / cantidad (solo para reportes).
- Cantidad de un combo vendido NO se cambia: se crea otro y se desactiva el viejo. Nada se borra, se desactiva.
- Estados (no cambiar): 1 Registrado, 2 En Preparación, 3 Listo para Entregar, 4 Entregado, 5 Cancelado.
- Cocinero es por plato (`productos.id_cocinero`); `planes.id_cocinero` es respaldo.
- Pago: Efectivo / Transferencia (sin 10% ni Mercado Pago por ahora). Retiro sin elegir local (igual que el formulario viejo).
- Pedidos sin sesión van al usuario "Consumidor Final" (id `b344f2e8-cd3c-42af-953c-7d97cada6c63`, rol 4, nadie puede entrar). NO borrarlo. Antes iban al admin `d9b1ae00…` (Fede).

## Qué está HECHO (en mejoras-fastgood)
- Compras de insumos (pantalla + `registrar_compra`) y Movimientos de stock nuevo.
- Fase 0 de limpieza.
- Tablas de combos: `combos`, `combo_productos`, `pedido_combos` + columnas nuevas en `pedido_detalles`.
- Web nueva `frontend/index-combos.html` (en paralelo al index viejo, que NO se tocó):
  - `combosCatalogo.js` (catálogo), `armarCombo.js` (modal X de N + personalizar), `carritoCombos.js` (carrito en localStorage), `pedidoCombos.js` (formulario igual al viejo + envío + WhatsApp).
- Rutas: `GET /api/v1/combos` (pública), `POST /api/pedidos-combos` (pública, limitePedidos).
- Función de base `crear_pedido_combos` (todo o nada) — con heladera desde el paso H6.
- Cocina: ve personalizados (⚠), una fila por pedido con botón "Detalles".
- Consultar Pedidos: Detalles agrupado por combo.
- Panel "🍱 Combos" (roles 6 y 5): crear/editar/activar combos y armar el menú. Rutas `/api/combos…`.
- **Heladera conectada (pasos H0 a H7, 15/10).** Avance en `docs/HELADERA-AVANCE.md`; cada cambio en `docs/INFORME-CAMBIOS-HELADERA.md`; cómo funciona en `docs/informe_heladera.md`.
  - 4 acciones, una función de la base cada una (todo o nada, con candado): PRODUCIR `producir_viandas`, VENDER `crear_pedido_combos`, DEVOLVER `anular_pedido_con_devolucion`, DESCARTAR `descartar_viandas`.
  - Crear un pedido de combos descuenta `stock_heladera` + movimiento `venta`; `cantidad_de_heladera` = cantidad (0 si personalizado). Si no alcanza: "No quedan suficientes viandas…" y no se guarda nada.
  - Los platos de heladera nacen `listo = true` → la cocina solo ve personalizados. Un pedido sin nada para cocinar pasa solo a 3 al moverlo de 1 a 2.
  - Anular devuelve viandas (solo en 1, 2 y 3) con movimiento `devolucion`. Un anulado (5) no cambia más de estado.
  - Insumos de los pedidos = (cantidad − cantidad_de_heladera) × receta (sin doble descuento). Errores simples (409/500); login sin emails en el log.
  - Funciones viejas marcadas "NO USAR" (no se borran: Render todavía usa `marcar_detalle_hecho` y `registrar_descarte_vianda` hasta el merge).

## Qué FALTA (en orden)
1. **Heladera, lo que queda** (ver `docs/HELADERA-AVANCE.md`):
   - H7: la prueba completa en la web (después de cargar la compra de huevos).
   - H8: pantallas (reservadas, filtros de movimientos, mínimo editable, platos desactivados con viandas, "Volvieron N viandas", botón Pago en anulados, etc.).
   - H9: repasar el código de la heladera con las reglas de CLAUDE.md (sin cambiar lo que hace). H10: Word con el recorrido completo y el DER.
   - Antes de producción: pasar `descontarStockPedido` a una función de la base (hoy busca "pedido #N" en el texto y no es todo o nada).
2. **CSS / detalles**: emprolijar web nueva, cómo se ven los personalizados en el modal, el texto que se borra al tocar otro +/−, la fecha "a. m.hs" del WhatsApp.
3. **Reemplazar el index** por `index-combos.html` (y la redirección de admins).
4. **Pasar a Rodriguez**: desactivar combo PRUEBA (id 1) y "Prueba no usar", anular/limpiar pedidos de prueba, backup, merge, deploy.
   Hasta el merge, los pedidos de combos de prueba se manejan solo desde el servidor nuevo (Render anula sin devolver viandas).

## Pendientes sueltos
- Render: el auto-deploy no anda desde el 30/9 (hacer Manual Deploy y revisar Settings → Auto-Deploy).
- Preguntar a mi prima: 10% por transferencia, máximo de personalizados por combo, preguntas frecuentes.
- Datos de prueba a limpiar: compras #1–3, pedido a cocina #6 (fideos), combo PRUEBA, insumo "prueba", pedidos PRUEBA (ya anulados).
- Huevo estaba en −35: cargar la compra que falta (si no, un pedido con personalizados que llevan huevo no pasa a 2).
- Más adelante: monitor de caída (UptimeRobot) y Sentry; backups; Render pago.
