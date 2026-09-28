# Cocineros por plato, "Listo" por cocinero y verificación de stock

Este documento explica tres cambios encadenados del sistema de pedidos de Fast Good:

1. **Cocinero por plato**: cada plato puede tener su propio cocinero, en lugar de uno por plan.
2. **"Listo" por cocinero**: cada cocinero marca solo sus platos, y el pedido avanza cuando están todos.
3. **Verificación de stock al pasar a En Preparación**: no se manda a cocina un pedido para el que no hay insumos.

Cada cambio se apoya en el anterior. El 2 usa la función `platoEsDelCocinero()` del 1, y el 3 agrega un control a la función `cambiarEstadoPedido()` del 2.

> **Estado en git:** los cambios 1 y 2 están en el commit `c402f4c` de la rama `Rodriguez`. El 3 todavía no está commiteado (`server.js` y `ListarPedidos.js`).
> Los números de línea corresponden a los archivos al momento de escribir este documento.

### Estados de un pedido (tabla `estados`)

| id | Nombre | Qué pasa con el stock |
|----|--------|-----------------------|
| 1 | Registrado | nada |
| 2 | En Preparación | se **verifica** (cambio 3) |
| 3 | Listo para Entregar | se **descuenta** |
| 4 | Entregado | se descuenta si no se había descontado (idempotente) |
| 5 | Cancelado | nada (lo usa la anulación con PIN) |

---

## 1. Cocinero por plato

### A. El problema

Antes, el cocinero se asignaba **por plan**: `planes.id_cocinero` (principal) y `planes.id_cocinero_suplente`. Un cocinero veía **todos los platos** de los planes que tenía asignados.

**Ejemplo:** el plan *Descenso de Peso* tiene POLLO y ENSALADA. Si Marta es la cocinera del plan, le tocan los dos platos. No había forma de decir "el POLLO lo hace Juan y la ENSALADA Marta". Además, en un pedido con platos de dos planes, cada cocinero veía el pedido completo, incluidos los platos que no le tocaban, y el resumen de porciones sumaba cosas que no tenía que cocinar.

Había también un problema técnico en `GET /api/cocina/tareas`: el `cocinero_id` que mandaba el navegador se metía directamente en el texto de un filtro de Supabase:

```js
.or(`id_cocinero.eq.${cocinero_id},id_cocinero_suplente.eq.${cocinero_id}`)
```

Si alguien mandaba un `cocinero_id` con comas y otras condiciones, podía agregar condiciones al filtro.

### B. La base de datos

**No se agregó ninguna columna ni se corrió ningún `ALTER TABLE`.** La columna `productos.id_cocinero` ya existía y estaba sin usar. Esto es lo que se verificó contra la base:

| Tabla | Columna | Tipo | ¿Puede ser NULL? | Relación |
|-------|---------|------|------------------|----------|
| `productos` | `id_cocinero` | `uuid` | **Sí** (NULL = "sin cocinero propio, usa el del plan") | FK → `usuarios.id` |

Las columnas del plan (`planes.id_cocinero`, `planes.id_cocinero_suplente`) **no se tocaron**. Ahora funcionan como *respaldo*.

SQL equivalente, por si hubiera que recrear la columna en otra base (por ejemplo, para la defensa):

```sql
-- productos.id_cocinero: cocinero asignado al plato (opcional)
ALTER TABLE productos
  ADD COLUMN id_cocinero uuid NULL
  REFERENCES usuarios(id);
```

> El nombre de la restricción y su comportamiento `ON DELETE` no se pueden ver con la clave pública de Supabase. Si se borra un usuario asignado a un plato, lo que pase depende de cómo se creó la FK. Hay que revisarlo en el panel de Supabase (Table editor → productos → id_cocinero).

**Relación que se crea:** un usuario (con rol cocinero) puede tener muchos platos, y un plato tiene como máximo un cocinero propio. Es una relación **uno a muchos** de `usuarios` a `productos`.

### C. El flujo

**Asignar un cocinero a un plato (admin):**

1. El admin abre **Asignar Cocineros** (`AsignarCocinero.html`).
2. El frontend llama en paralelo a `GET /api/productos/cocineros` (los platos) y `GET /api/cocineros` (los usuarios con rol 2).
3. El servidor devuelve cada plato activo con su cocinero propio, el cocinero de su plan y el **cocinero efectivo** (el propio si hay, si no el del plan).
4. La grilla muestra una fila por plato con un `<select>`. Si el plato no tiene cocinero propio, la opción vacía dice *"Sin asignar — usa el del plan (Marta Garcia)"*.
5. El admin elige a Juan y aprieta **Guardar** → `PUT /api/productos/11/cocinero` con `{ id_cocinero: "<uuid de Juan>" }` y el token.
6. El servidor verifica que Juan exista y tenga rol 2 → `UPDATE productos SET id_cocinero = '<Juan>' WHERE id = 11`.
7. **La base queda:** `productos(id=11).id_cocinero = <Juan>`.

**Qué ve cada cocinero en la cocina:**

1. Juan abre **Tareas de Cocina** (`cocinero.html`).
2. El frontend llama a `GET /api/cocina/tareas?cocinero_id=<Juan>`.
3. El servidor trae todos los productos con su plan, y con `platoEsDelCocinero()` arma la lista de platos de Juan.
4. Busca los pedidos en estado 2 que tengan alguno de esos platos y marca cada detalle con `es_mio: true/false`.
5. El frontend deja solo los detalles con `es_mio` → Juan ve **solo sus platos** dentro de cada pedido, y el resumen de porciones cuenta solo lo suyo.

### D. El código

#### `platoEsDelCocinero(producto, cocineroId)` — [server.js:545](server.js#L545)

```js
function platoEsDelCocinero(producto, cocineroId) {
  if (producto.id_cocinero) return producto.id_cocinero === cocineroId;
  const plan = producto.planes;
  return !!plan && (plan.id_cocinero === cocineroId || plan.id_cocinero_suplente === cocineroId);
}
```

- **Primera línea:** si el plato tiene cocinero propio, manda ese y **nada más**. El cocinero del plan ya no lo ve.
- **Si no tiene:** se usa el plan como respaldo, y le corresponde al principal **o** al suplente.
- `!!plan` cubre el caso de un producto sin plan: devuelve `false` en lugar de romper.

**Por qué así:** es la **única** regla de "¿de quién es este plato?" del sistema. La usan `GET /api/cocina/tareas` y `PUT /api/pedidos/:id/listo-cocinero` (cambio 2). Si mañana la regla cambia (por ejemplo, que el suplente deje de ver los platos), se toca en un solo lugar.

**Por qué el plan queda como respaldo:** así no hubo que migrar datos. Los planes ya tenían cocinero; si se hubiera exigido cocinero en cada plato, el día del cambio ningún cocinero habría visto nada hasta que el admin asignara todos los platos uno por uno.

#### `GET /api/cocina/tareas` — [server.js:556](server.js#L556)

```js
app.get('/api/cocina/tareas', async (req, res) => {
  const { cocinero_id } = req.query;
  let idsPedidos = null;      // null = sin filtro por cocinero
  let misProductos = null;    // Set de id_producto del cocinero

  if (cocinero_id) {
    // 1. Platos del cocinero. El filtro se hace en JS para no armar el filtro de Supabase con texto del cliente.
    const { data: productos, error: errProductos } = await supabase
      .from('productos')
      .select('id, id_cocinero, planes ( id_cocinero, id_cocinero_suplente )');

    if (errProductos) return res.status(500).json({ error: errProductos.message });

    misProductos = new Set(
      (productos || []).filter(p => platoEsDelCocinero(p, cocinero_id)).map(p => p.id)
    );
    if (misProductos.size === 0) return res.json([]);

    // 2. Pedidos que tienen al menos un plato de ese cocinero todavía sin terminar
    //    (los pedidos donde ya marcó todos sus platos como listos no se le muestran)
    const { data: detalles, error: errDetalles } = await supabase
      .from('pedido_detalles')
      .select('id_pedido')
      .in('id_producto', [...misProductos])
      .eq('listo', false);

    if (errDetalles) return res.status(500).json({ error: errDetalles.message });

    idsPedidos = [...new Set((detalles || []).map(d => d.id_pedido))];
    if (idsPedidos.length === 0) return res.json([]);
  }

  // 3. Traer pedidos en estado 2, con sus detalles
  let query = supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      observaciones,
      id_estado,
      pedido_detalles (
        id_producto,
        cantidad,
        precio_unitario,
        listo,
        productos ( nombre, codigo_plato )
      )
    `)
    .eq('id_estado', 2)
    .order('fecha_pedido', { ascending: true });

  if (idsPedidos !== null) {
    query = query.in('id', idsPedidos);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // 4. Marcar en cada detalle si el plato es del cocinero que consulta
  const resultado = (data || []).map(pedido => ({
    ...pedido,
    pedido_detalles: (pedido.pedido_detalles || []).map(det => ({
      ...det,
      es_mio: misProductos ? misProductos.has(det.id_producto) : true
    }))
  }));

  res.json(resultado);
});
```

- **Paso 1:** trae **todos** los productos con los cocineros de su plan (`planes ( ... )` es un *join* de Supabase por la FK `productos.id_plan`). Filtra en JavaScript con `platoEsDelCocinero()` y guarda los ids en un `Set`, que permite preguntar "¿este plato es mío?" de forma inmediata.
- **Paso 2:** busca en qué pedidos aparecen esos platos. El `.eq('listo', false)` lo agregó el **cambio 2**: los pedidos donde el cocinero ya terminó sus platos no se le muestran.
- **Paso 3:** trae esos pedidos, solo si están en estado 2, con todos sus detalles (también los de otros cocineros).
- **Paso 4:** agrega `es_mio` a cada detalle. El servidor devuelve el pedido completo y le dice al frontend cuáles platos son del cocinero.
- **Sin `cocinero_id`** (modo admin) devuelve todos los pedidos en estado 2 con `es_mio: true`.

**Por qué el filtro se hace en JavaScript y no en la consulta:** para no volver a meter texto del cliente dentro de un `.or(...)` de Supabase, que era el problema de la versión anterior. Traer todos los productos es barato: son decenas, no miles.

**Por qué se devuelve el pedido completo con `es_mio`, en lugar de solo los platos del cocinero:** porque el mismo endpoint sirve para el modo admin (que ve todo) y para el cocinero. Además, deja la puerta abierta a mostrar en gris los platos de otros si algún día se quiere.

#### `GET /api/productos/cocineros` — [server.js:1180](server.js#L1180)

```js
app.get('/api/productos/cocineros', async (req, res) => {
  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, codigo_plato, nombre, id_cocinero, planes ( id, nombre, id_cocinero, id_cocinero_suplente )')
    .eq('activo', true);

  if (error) return res.status(500).json({ error: error.message });

  const { data: usuarios, error: errUsuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido, id_rol');

  if (errUsuarios) return res.status(500).json({ error: errUsuarios.message });

  const mapaUsuarios = {};
  (usuarios || []).forEach(u => {
    mapaUsuarios[u.id] = { id: u.id, nombre: u.nombre, apellido: u.apellido, es_cocinero: u.id_rol === 2 };
  });
  const usuario = id => (id ? (mapaUsuarios[id] || null) : null);

  const resultado = (productos || []).map(p => {
    const cocinero     = usuario(p.id_cocinero);
    const cocineroPlan = usuario(p.planes?.id_cocinero);
    return {
      id:            p.id,
      codigo_plato:  p.codigo_plato,
      nombre:        p.nombre,
      plan:          p.planes ? { id: p.planes.id, nombre: p.planes.nombre } : null,
      id_cocinero:   p.id_cocinero,
      cocinero,                                   // el asignado al plato (o null)
      cocinero_plan: cocineroPlan,                // el principal del plan (respaldo)
      cocinero_efectivo: cocinero || cocineroPlan,
      origen: cocinero ? 'producto' : (cocineroPlan ? 'plan' : null)
    };
  });

  // Orden: por plan y, dentro del plan, por código (numérico si se puede: 2 antes que 10)
  resultado.sort((a, b) =>
    (a.plan?.nombre || '').localeCompare(b.plan?.nombre || '', 'es') ||
    String(a.codigo_plato || '').localeCompare(String(b.codigo_plato || ''), 'es', { numeric: true })
  );

  res.json(resultado);
});
```

- Trae los platos **activos** con su plan, y aparte todos los usuarios.
- `mapaUsuarios` es un diccionario `id → usuario` para no hacer una consulta por plato. Son 2 consultas en total, no 1 + N.
- Por cada plato arma: `cocinero` (el propio), `cocinero_plan` (el respaldo), `cocinero_efectivo` (el que realmente lo va a ver) y `origen` (`'producto'`, `'plan'` o `null` si nadie lo ve).
- Ordena por plan y por código con `numeric: true`, para que el código "2" quede antes que el "10".

**Por qué se calcula `cocinero_efectivo` en el servidor:** así la pantalla no repite la regla. La pantalla solo muestra lo que recibe; la regla vive en el servidor.

#### `PUT /api/productos/:id/cocinero` — [server.js:1226](server.js#L1226)

```js
app.put('/api/productos/:id/cocinero', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const idCocinero = req.body?.id_cocinero || null;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de producto inválido' });
  }

  // Si se asigna alguien, tiene que existir y ser cocinero (rol 2)
  if (idCocinero) {
    const { data: usuario, error: errUsuario } = await supabase
      .from('usuarios')
      .select('id, id_rol')
      .eq('id', idCocinero)
      .maybeSingle();

    // 22P02 = el texto no es un UUID válido
    if (errUsuario && errUsuario.code !== '22P02') return res.status(500).json({ error: errUsuario.message });
    if (!usuario || usuario.id_rol !== 2) {
      return res.status(400).json({ error: 'El usuario elegido no es un cocinero' });
    }
  }

  const { data, error } = await supabase
    .from('productos')
    .update({ id_cocinero: idCocinero })
    .eq('id', id)
    .select('id, codigo_plato, nombre, id_cocinero')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

  res.json({ mensaje: 'Cocinero del plato actualizado', producto: data });
});
```

- `requireAuth` exige un token válido: sin token, 401.
- `req.body?.id_cocinero || null` convierte `""` o `undefined` en `null`. **Mandar `null` quita el cocinero**, y el plato vuelve a usar el del plan.
- Antes de guardar, **valida que el elegido exista y sea cocinero (rol 2)**. Sin esto, se podría asignar un plato a un admin o a un cliente, y ese plato no le aparecería a nadie en la cocina.
- El error `22P02` es el que devuelve Postgres cuando el texto no es un UUID. Se trata como "no es un cocinero" (400) y no como un error del servidor (500).
- `.maybeSingle()` devuelve `null` si el producto no existe, y así se responde 404.

#### Frontend

- **[AsignarCocinero.js](frontend/src/js/AsignarCocinero.js):** `cargarDatos()` (línea 9) trae platos y cocineros. `crearFilaPlato()` (línea 49) arma cada fila con `textContent` en lugar de `innerHTML`, para que un nombre de plato con HTML no se ejecute (XSS). `guardarCocinero()` (línea 113) hace el `PUT` con `Authorization: Bearer <fg_token>`. `actualizarAviso()` (línea 93) muestra cuántos platos no ve **ningún** cocinero.
- **[cocinero.js:151-158](frontend/src/js/cocinero.js#L151-L158):** después de traer las tareas, se queda solo con los detalles `es_mio` (y, desde el cambio 2, `!listo`), y descarta los pedidos que quedan vacíos.

### E. Cómo se conecta con lo que ya existía

- **Planes:** siguen igual. `PUT /api/planes/:id/cocinero` sigue existiendo y sirve para definir el respaldo.
- **Estados:** la cocina sigue mostrando solo pedidos en estado 2.
- **Stock y pagos:** no se tocaron.
- **Cambio 2:** `platoEsDelCocinero()` es la base del "Listo" por cocinero.

### F. Limitaciones conocidas

- **`PUT /api/productos/:id/cocinero` no verifica que quien asigna sea admin.** Pide estar logueado, pero cualquier usuario con token podría llamarlo. Hoy la pantalla solo la ven los admins (lo controla `guard.js`), pero el endpoint no lo controla.
- **`GET /api/cocina/tareas` recibe el `cocinero_id` por la URL y no pide token.** Cualquiera puede ver las tareas de cualquier cocinero. Es solo lectura, pero lo correcto sería sacarlo del JWT, como en el cambio 2.
- **Códigos de plato repetidos entre planes:** no hay un código único global, así que la grilla usa la columna Plan para distinguirlos.
- **Plato sin cocinero y plan sin cocinero:** no lo ve nadie en la cocina. La pantalla de asignación lo avisa en amarillo.
- **Cocinero que cambia de rol:** el plato sigue asignado a esa persona. La pantalla lo muestra como *"(ya no es cocinero)"*, pero no lo reasigna solo.

---

## 2. "Listo" por cocinero

### A. El problema

El botón **"Listo para entregar"** de la pantalla de cocina hacía `PUT /api/pedidos/:id/estado` con `estado_id: 3`: pasaba **el pedido entero** a Listo para Entregar.

**Ejemplo:** el pedido #20 tiene K1 (lo cocina Marta) y K2 (lo cocina Juan). Juan termina K2 y aprieta Listo. El pedido pasa a estado 3 y desaparece de la pantalla de Marta **aunque ella todavía no terminó K1**. El repartidor se lleva un pedido incompleto, y además el stock se descontaba en ese momento, cuando el pedido todavía no estaba terminado.

Otros problemas del botón viejo:
- no pedía token, así que cualquiera podía pasar cualquier pedido a 3;
- usaba `confirm()` y `alert()` del navegador.

### B. La base de datos

**No se agregó ninguna columna.** `pedido_detalles.listo` ya existía. Verificado contra la base:

| Tabla | Columna | Tipo | ¿Puede ser NULL? | Default |
|-------|---------|------|------------------|---------|
| `pedido_detalles` | `listo` | `boolean` | **No** (`NOT NULL`) | `false` |

El estado "listo" vive **en cada renglón del pedido** (cada plato), no en el pedido. No crea relaciones nuevas: `pedido_detalles` ya estaba relacionada con `pedidos` (`id_pedido`) y con `productos` (`id_producto`).

SQL equivalente:

```sql
-- pedido_detalles.listo: el cocinero terminó este plato del pedido
ALTER TABLE pedido_detalles
  ADD COLUMN listo boolean NOT NULL DEFAULT false;
```

Al crear un pedido (`POST /api/pedidos`), los detalles se insertan sin `listo`, así que arrancan en `false` por el default.

### C. El flujo

Pedido #20 con K1 (Marta) y K2 (Juan), en estado 2.

**Juan aprieta Listo:**

1. En `cocinero.html`, Juan aprieta **✓ Listo para entregar** en la fila de K2.
2. `marcarListo()` abre el modal del sistema: *"¿Tus platos del pedido #20 están listos?"*.
3. Juan confirma → `confirmarListo()` → `PUT /api/pedidos/20/listo-cocinero` con `Authorization: Bearer <token de Juan>`. **No manda ningún id de cocinero.**
4. El servidor: `requireAuth` valida el token y deja `req.usuario = { id: <Juan>, rol: 2 }`.
5. Lee el pedido con sus detalles y los cocineros de cada plato. Verifica que esté en estado 2.
6. Con `platoEsDelCocinero()` separa los platos de Juan → `[K2]`.
7. `UPDATE pedido_detalles SET listo = true WHERE id IN (<K2>)`.
8. Cuenta los platos de otros que todavía no están listos → K1 → **1 pendiente**.
9. Responde `{ completo: false, platos_pendientes: 1, mensaje: "Tus platos quedaron listos. Faltan platos de otros cocineros." }`.
10. El frontend saca el pedido de la pantalla de Juan y muestra el aviso azul.
11. **La base queda:** K2 `listo = true`, K1 `listo = false`, pedido en **estado 2**, **stock sin tocar**.

**Marta aprieta Listo:**

1. Pasos 1 a 7 iguales → K1 `listo = true`.
2. Platos pendientes de otros → **0**.
3. El servidor llama a `cambiarEstadoPedido(20, 3)`, que:
   - llama a `descontarStockPedido(20)` → **descuenta el stock** y registra los movimientos;
   - hace `UPDATE pedidos SET id_estado = 3`;
   - hace `UPDATE pedido_detalles SET listo = true WHERE id_pedido = 20` (ya estaban, no cambia nada).
4. Responde `{ completo: true, mensaje: "Pedido completo, pasó a Listo para Entregar." }`.
5. El frontend muestra el aviso verde.
6. **La base queda:** los dos platos listos, pedido en **estado 3**, stock descontado **una vez**.

**Si al final falta stock:** los platos de Marta quedan listos, el pedido **sigue en estado 2**, la respuesta es 409 con `platos_listos: true` y el aviso amarillo dice que avise al administrador. Ningún cocinero lo ve más. El admin lo pasa a 3 desde Consultar Pedidos cuando haya stock.

**Si el admin pasa el pedido a 3 desde la grilla:** `PUT /estado` → `cambiarEstadoPedido(id, 3)` → también marca todos los detalles como listos, así la base queda coherente.

### D. El código

#### `cambiarEstadoPedido(pedidoId, nuevoEstado)` — [server.js:876](server.js#L876)

```js
async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
  if (nuevoEstado === 2) {
    const errorStock = await verificarStockPedido(pedidoId);
    if (errorStock) return { status: 409, error: errorStock };
  }

  if ([3, 4].includes(nuevoEstado)) {
    const errorStock = await descontarStockPedido(pedidoId);
    if (errorStock) return { status: 409, error: errorStock };
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ id_estado: nuevoEstado })
    .eq('id', pedidoId)
    .select()
    .single();

  if (error) return { status: 500, error: error.message };

  if (nuevoEstado === 3) {
    const { error: errListo } = await supabase
      .from('pedido_detalles')
      .update({ listo: true })
      .eq('id_pedido', pedidoId);

    // El estado ya cambió, que es lo importante: el pedido sale de cocina igual. Solo se registra.
    if (errListo) console.error('[ESTADO] no se pudieron marcar los platos como listos:', errListo);
  }

  return { status: 200, pedido: data };
}
```

> El primer bloque (`nuevoEstado === 2`) lo agregó el **cambio 3**. Se explica en esa sección.

- Es la lógica que antes estaba **dentro** del endpoint `PUT /api/pedidos/:pedidoId/estado`, movida a una función.
- **Pasar a 3 o 4:** primero intenta descontar el stock. Si falla, **no cambia el estado** y devuelve 409.
- **Si el descuento salió bien:** cambia el estado.
- **Al pasar a 3:** marca todos los platos como listos (tarea 4 del pedido original: cuando el admin pasa a 3, los detalles quedan coherentes).
- **Error al marcar los platos:** solo se registra en consola. El estado ya cambió y eso es lo que importa: un pedido en 3 no aparece en cocina aunque sus platos digan `listo = false`.
- **Devuelve un objeto `{ status, pedido | error }`** en lugar de responder directamente, porque la usan dos endpoints distintos y cada uno arma su respuesta.

**Por qué se extrajo a una función:** el "Listo" por cocinero tiene que pasar el pedido a 3 **exactamente igual** que el admin, con el mismo descuento de stock. Si se copiaba el código, la próxima vez que alguien cambiara la lógica de estados en un lugar, el otro quedaba desactualizado. Ahora hay una sola forma de cambiar el estado de un pedido.

#### `PUT /api/pedidos/:pedidoId/estado` (modificado) — [server.js:930](server.js#L930)

```js
    const resultado = await cambiarEstadoPedido(pedidoId, nuevoEstado);
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

    res.json({ mensaje: 'Estado actualizado', pedido: resultado.pedido });
```

Sigue leyendo el pedido para devolver 404 si no existe, y después delega todo en `cambiarEstadoPedido()`. La respuesta es la misma que antes, así que la grilla de Consultar Pedidos no tuvo que cambiar.

#### `PUT /api/pedidos/:id/listo-cocinero` (nuevo) — [server.js:964](server.js#L964)

```js
app.put('/api/pedidos/:id/listo-cocinero', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const cocineroId = req.usuario.id;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  try {
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select(`
        id,
        id_estado,
        pedido_detalles (
          id,
          listo,
          productos ( id_cocinero, planes ( id_cocinero, id_cocinero_suplente ) )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (errLectura) return res.status(500).json({ error: errLectura.message });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.id_estado !== 2) {
      return res.status(409).json({ error: 'El pedido ya no está En Preparación' });
    }

    const detalles = pedido.pedido_detalles || [];
    const mios = detalles.filter(d => d.productos && platoEsDelCocinero(d.productos, cocineroId));
    if (mios.length === 0) {
      return res.status(403).json({ error: 'No tenés platos asignados en este pedido' });
    }

    const { error: errListo } = await supabase
      .from('pedido_detalles')
      .update({ listo: true })
      .in('id', mios.map(d => d.id));

    if (errListo) return res.status(500).json({ error: errListo.message });

    // Platos de otros cocineros que todavía no están listos
    const idsMios = new Set(mios.map(d => d.id));
    const pendientes = detalles.filter(d => !idsMios.has(d.id) && !d.listo).length;

    if (pendientes > 0) {
      return res.json({
        completo: false,
        platos_pendientes: pendientes,
        mensaje: 'Tus platos quedaron listos. Faltan platos de otros cocineros.'
      });
    }

    const resultado = await cambiarEstadoPedido(id, 3);

    if (resultado.status === 409) {
      return res.status(409).json({
        completo: false,
        platos_listos: true,
        error: resultado.error,
        mensaje: 'Tus platos quedaron listos, pero el pedido no pudo pasar a Listo para Entregar por falta de stock. Avisale al administrador.'
      });
    }
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error, platos_listos: true });

    res.json({
      completo: true,
      mensaje: 'Pedido completo, pasó a Listo para Entregar.',
      pedido: resultado.pedido
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

Parte por parte:

- **`const cocineroId = req.usuario.id;`** — el cocinero sale del token, no del pedido del navegador (ver "por qué" más abajo).
- **La consulta** trae en un solo viaje el pedido, sus detalles, el producto de cada detalle y el plan del producto: todo lo que necesita `platoEsDelCocinero()`.
- **`id_estado !== 2` → 409:** un pedido que ya pasó a 3 (o se anuló) no se puede volver a marcar. También evita descontar stock dos veces si alguien aprieta dos veces.
- **`mios`:** los detalles que son de este cocinero. Si no tiene ninguno → **403**. Mariela no puede marcar como listo un pedido donde no tiene platos.
- **El `UPDATE`** marca solo esos detalles, por id (`.in('id', ...)`).
- **`pendientes`:** se cuenta en memoria con los datos que ya se leyeron. Los platos del cocinero se excluyen porque en la lectura todavía figuraban `listo = false`, aunque el `UPDATE` acaba de ponerlos en `true`.
- **Si faltan platos:** responde `completo: false` y termina. El pedido sigue en 2 y **no se toca el stock**.
- **Si no falta ninguno:** `cambiarEstadoPedido(id, 3)`, la misma función que usa el admin.
- **409 de stock:** se devuelve con `platos_listos: true`, para que el frontend sepa que los platos **sí** se guardaron y saque el pedido de la pantalla aunque haya error.

**Por qué el cocinero sale del JWT y no del frontend:** el token lo firma el servidor con `JWT_SECRET` al hacer login, así que nadie puede fabricar uno con el id de otro sin conocer ese secreto. Un `cocinero_id` en el body o en la URL, en cambio, lo puede escribir cualquiera con las herramientas del navegador. Si el servidor lo creyera, Juan podría marcar como listos los platos de Marta. En las pruebas, Juan mandó `cocinero_id = Marta` en la URL y en el body, y el servidor lo ignoró: marcó solo los platos de Juan.

**Por qué se marcan los platos antes de verificar el stock, y no al revés:** el cocinero **ya cocinó**. Si falta stock para cerrar el pedido, es un problema administrativo (alguien no cargó una entrada de insumos), no de la cocina. Si no se marcaran, el pedido le volvería a aparecer como pendiente y lo cocinaría otra vez.

#### Frontend — [cocinero.js](frontend/src/js/cocinero.js)

**`marcarListo()` y `cerrarModalListo()` (líneas 216-230):** abren y cierran el modal `#modalListo` de [cocinero.html:86](frontend/pages/cocinero.html#L86). Usa las clases `.modal`/`.modal-content` de `global.css`, las mismas del resto del sistema. Guardan en `_listoPendiente` qué pedido y qué botón se están confirmando. Se cierra con Cancelar, clic afuera o Escape.

**`confirmarListo()` (línea 236):**

```js
    const res = await fetch(`/api/pedidos/${pedidoId}/listo-cocinero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      }
    });
    const data = await res.json().catch(() => ({}));

    // Los platos quedaron listos en todos estos casos: se sacan de la pantalla
    if (res.ok || data.platos_listos) {
      quitarPedidoDeLaTabla(pedidoId);

      if (res.ok && data.completo) {
        mostrarAviso('exito', 'Pedido completo, pasó a Listo para Entregar.');
      } else if (res.ok) {
        mostrarAviso('info', 'Tus platos quedaron listos. Faltan platos de otros cocineros.');
      } else {
        // 409 por stock: el pedido sigue En Preparación hasta que lo resuelva el administrador
        mostrarAviso('error', data.mensaje || 'Tus platos quedaron listos, pero el pedido no pudo avanzar.', data.error);
      }
      return;
    }
```

- **No manda body:** el servidor no necesita nada más que el token.
- **Botones del pedido:** antes del `fetch` se deshabilitan **todos** los de ese pedido (hay uno por plato), para evitar dobles clics.
- **`res.ok || data.platos_listos`:** en los tres casos (completo, faltan otros, falta stock) los platos del cocinero quedaron guardados, así que el pedido se saca de su pantalla.
- **Errores reales** (401, 403, 500, sin conexión): se vuelven a habilitar los botones y se muestra el aviso de error.

**`mostrarAviso(tipo, mensaje, detalle)` (línea 303):** crea un aviso flotante (verde, azul o amarillo) con el mismo estilo que los de Consultar Pedidos. Usa `textContent` para no inyectar HTML. Los de error quedan hasta que se cierran; los demás se van solos a los 5 segundos. Reemplaza al `alert()`.

**Filtro de platos (línea 156):** `det.es_mio && !det.listo`. El cocinero ve solo sus platos pendientes.

### E. Cómo se conecta con lo que ya existía

- **Descuento de stock:** `descontarStockPedido()` no se tocó. Se llama desde `cambiarEstadoPedido()` al pasar a 3, igual que antes. Tiene idempotencia propia (revisa `movimientos_stock`), así que pasar a 3 y después a 4 no descuenta dos veces.
- **Estados:** el endpoint del admin (`PUT /estado`) y el de la cocina (`PUT /listo-cocinero`) pasan por la misma función.
- **Cambio 1:** usa `platoEsDelCocinero()` para decidir qué platos son de quién.
- **`GET /api/cocina/tareas`:** se le agregó `.eq('listo', false)` y el campo `listo` en la respuesta.
- **Pagos y anulación:** no se tocaron. Un pedido anulado (estado 5) no está en 2, así que `listo-cocinero` responde 409.

### F. Limitaciones conocidas

- **Pedido trabado por stock:** queda en estado 2 con todos los platos listos y ningún cocinero lo ve. En la grilla del admin figura como "En Preparación", **sin ninguna marca** de que está esperando stock. (Caso real al escribir esto: el pedido **#41** está así porque falta harina integral.)
- **Volver de 3 a 2:** si el admin devuelve un pedido a "En Preparación", los platos siguen con `listo = true` y **ningún cocinero lo ve**. Habría que poner `listo = false` al volver a 2.
- **Platos que no ve nadie:** si un plato no tiene cocinero propio ni cocinero en su plan, nadie lo puede marcar y el pedido nunca se completa desde la cocina. Lo tiene que pasar a 3 el admin.
- **Dos cocineros al mismo tiempo:** si los dos últimos aprietan Listo en el mismo instante, los dos pueden ver "0 pendientes" y llamar a `cambiarEstadoPedido(id, 3)`. La idempotencia de `descontarStockPedido` mira si ya hay movimientos, pero no está protegida contra dos llamadas simultáneas, así que en teoría podría descontar dos veces. (El mismo riesgo ya existía con `PUT /estado`.)
- **Admin en la pantalla de cocina:** si un admin aprieta Listo, recibe 403, porque no tiene platos asignados.
- **`PUT /api/pedidos/:pedidoId/estado` no pide token** (esto ya era así antes).

---

## 3. Verificación de stock al pasar a En Preparación

### A. El problema

El stock recién se miraba al pasar a **estado 3**, cuando el pedido ya estaba cocinado.

**Ejemplo:** hay 2250 g de carne molida. Entra un pedido con 2 POLLOS, que necesita 3000 g. El admin lo pasa a "En Preparación" sin problema, la cocina lo cocina (¿con qué carne?), y cuando se aprieta Listo el sistema dice *"Stock insuficiente de carne molida"* y el pedido queda trabado. El control llegaba tarde: cuando avisaba, la cocina ya había trabajado.

En pedidos con pago por transferencia o tarjeta pasaba algo más: el admin confirmaba el pago ("Sí, ya pagó") para un pedido que después no se podía preparar.

### B. La base de datos

**No hubo cambios en la base.** La verificación usa tablas que ya existían:

- `pedido_detalles` (qué platos y cuántos),
- `producto_insumo` (la receta: cuánto de cada insumo lleva un plato),
- `insumos` (`stock_actual`).

La verificación **solo lee**: no escribe en `insumos` ni en `movimientos_stock`.

### C. El flujo

**Pago en efectivo, sin stock:**

1. El admin, en **Consultar Pedidos**, cambia el select del pedido de "Registrado" a "En Preparación".
2. Como el pago es en efectivo, `ListarPedidos.js` llama directo a `PUT /api/pedidos/44/estado` con `{ estado_id: 2 }`.
3. El servidor → `cambiarEstadoPedido(44, 2)` → `verificarStockPedido(44)` → `calcularConsumoPedido(44)`.
4. `calcularConsumoPedido` lee los detalles y las recetas, calcula que hacen falta 3000 g de carne, lee que hay 2250 y devuelve `{ error: 'Stock insuficiente de "carne molida": se necesitan 3000, hay 2250 disponibles' }`.
5. `cambiarEstadoPedido` devuelve `{ status: 409, error }` **sin hacer el `UPDATE`**.
6. El endpoint responde **409**.
7. El frontend muestra el aviso amarillo de stock (`mostrarAlertaStock`) y vuelve el select a "Registrado".
8. **La base queda:** el pedido sigue en **estado 1**, sin cambios en el stock.

**Pago por transferencia, sin stock:**

1. El admin cambia el select a "En Preparación".
2. Como el pago no es en efectivo y el pedido no está pagado, **antes** de abrir "Confirmar Pago" el frontend llama a `GET /api/pedidos/46/verificar-stock` con el token.
3. El servidor → `verificarStockPedido(46)` → responde `{ ok: false, error: "Stock insuficiente de ..." }`.
4. El frontend muestra el aviso de stock, vuelve el select al estado anterior y **no abre el modal de pago**.
5. **La base queda:** sin cambios.

**Pago por transferencia, con stock:**

1. `GET /verificar-stock` → `{ ok: true }`.
2. Se abre "Confirmar Pago". El admin aprieta "Sí, ya pagó".
3. `PUT /estado` con `estado_id: 2` → `cambiarEstadoPedido` **vuelve a verificar**, porque el stock pudo cambiar mientras el modal estaba abierto → pasa a 2.
4. `PUT /pagado` → `pagado = true`.
5. **La base queda:** el pedido en **estado 2** y pagado, **sin descontar stock**. El descuento ocurre después, al pasar a 3.

### D. El código

#### `calcularConsumoPedido(pedidoId)` (nueva, interna) — [server.js:72](server.js#L72)

```js
async function calcularConsumoPedido(pedidoId) {
  const sinConsumo = { consumo: {}, stockMap: {}, nombreMap: {} };

  // 1. Productos y cantidades del pedido
  const { data: detalles, error: errDetalles } = await supabase
    .from('pedido_detalles')
    .select('id_producto, cantidad')
    .eq('id_pedido', pedidoId);

  if (errDetalles) {
    console.error('ERROR REAL DEL SERVIDOR [pedido_detalles]:', errDetalles);
    return { error: `Error al leer detalles del pedido: ${errDetalles.message}` };
  }
  if (!detalles || detalles.length === 0) return sinConsumo;

  // 2. Recetas desde producto_insumo — select(*) para no asumir nombre de columna
  const productIds = detalles.map(d => d.id_producto);
  const { data: recetas, error: errRecetas } = await supabase
    .from('producto_insumo')
    .select('*')
    .in('id_producto', productIds);

  if (errRecetas) {
    console.error('ERROR REAL DEL SERVIDOR [producto_insumo]:', errRecetas);
    return { error: `Error al leer recetas: ${errRecetas.message}` };
  }
  if (!recetas || recetas.length === 0) return sinConsumo;

  // 3. Consumo total por insumo (cantidad_receta × platos_pedidos)
  const consumo = {}; // { id_insumo: totalNecesario }
  for (const detalle of detalles) {
    const insumosDelProducto = recetas.filter(
      r => String(r.id_producto) === String(detalle.id_producto)
    );
    for (const r of insumosDelProducto) {
      console.log('[DEBUG RECETA]', r); // ← muestra los nombres reales de columnas en la terminal
      const cantidadReceta = Number(r.cantidad || r.cantidad_insumo || r.cantidad_necesaria || 0);
      const totalNecesario = cantidadReceta * Number(detalle.cantidad);
      consumo[r.id_insumo] = (consumo[r.id_insumo] || 0) + totalNecesario;
    }
  }

  const insumosIds = Object.keys(consumo).map(Number);
  if (insumosIds.length === 0) return sinConsumo;

  // 4. Stock actual desde insumos
  const { data: insumos, error: errInsumos } = await supabase
    .from('insumos')
    .select('id, nombre, stock_actual')
    .in('id', insumosIds);

  if (errInsumos) {
    console.error('ERROR REAL DEL SERVIDOR [insumos select]:', errInsumos);
    return { error: `Error al leer stock: ${errInsumos.message}` };
  }

  // Mapa de stock con clave y valor forzados a Number para eliminar ambigüedad de tipos
  const stockMap  = {}; // { id_num: stockActualNum }
  const nombreMap = {}; // { id_num: nombre }
  for (const fila of insumos) {
    const idNum          = Number(fila.id);
    stockMap[idNum]      = Number(fila.stock_actual ?? 0);
    nombreMap[idNum]     = fila.nombre || String(fila.id);
  }

  // 5. Pre-flight check: comparación estrictamente numérica, antes de tocar nada
  for (const [keyId, totalRaw] of Object.entries(consumo)) {
    const idNum              = Number(keyId);
    const stockActualNum     = stockMap[idNum] ?? 0;
    const cantidadRequerida  = Number(totalRaw);

    console.log(`[STOCK DEBUG] insumo ${idNum} | stock: ${stockActualNum} | requerido: ${cantidadRequerida}`);

    if (stockActualNum < cantidadRequerida) {
      return { error: `Stock insuficiente de "${nombreMap[idNum]}": se necesitan ${cantidadRequerida}, hay ${stockActualNum} disponibles` };
    }
  }

  return { consumo, stockMap, nombreMap };
}
```

**Este código no es nuevo:** son los pasos 1 a 5 que estaban dentro de `descontarStockPedido`, movidos sin cambiar la lógica. Solo cambió qué devuelve: antes devolvía un texto o `null`, ahora un objeto.

- **Paso 1:** qué platos tiene el pedido y cuántos de cada uno.
- **Paso 2:** las recetas de esos platos. `select('*')` y `r.cantidad || r.cantidad_insumo || r.cantidad_necesaria` están así porque en algún momento no se sabía cómo se llamaba la columna. Hoy es `cantidad_necesaria`.
- **Paso 3:** para cada insumo suma `cantidad de receta × cantidad de platos`. Ejemplo: POLLO x2 con 1500 g de carne cada uno → `consumo[33] = 3000`.
- **Paso 4:** el stock actual de esos insumos. Todo se convierte con `Number()` antes de comparar, para no comparar texto con número por accidente.
- **Paso 5:** si algún insumo no alcanza, devuelve el error con el nombre del **primer** insumo que falta.
- **Si todo alcanza:** devuelve el consumo y los mapas, porque `descontarStockPedido` los necesita para descontar.
- **`sinConsumo`:** si el pedido no tiene detalles o sus platos no tienen receta, no hay nada que verificar ni descontar. Devuelve un consumo vacío y la verificación pasa.

#### `verificarStockPedido(pedidoId)` (nueva) — [server.js:154](server.js#L154)

```js
async function verificarStockPedido(pedidoId) {
  try {
    const { error } = await calcularConsumoPedido(pedidoId);
    return error || null;
  } catch (error) {
    console.error('ERROR REAL DEL SERVIDOR en verificarStockPedido:', error);
    return `Error inesperado al verificar stock: ${error.message}`;
  }
}
```

Es una capa fina sobre `calcularConsumoPedido`: se queda con el error y descarta el consumo. Devuelve `null` si alcanza, o el mensaje si no. Es la misma convención que `descontarStockPedido`, así las dos se usan igual en `cambiarEstadoPedido`.

#### `descontarStockPedido(pedidoId)` (modificada) — [server.js:164](server.js#L164)

```js
async function descontarStockPedido(pedidoId) {
  try {
    const motivoBase = `pedido #${String(pedidoId).padStart(3, '0')}`;

    // 0. Idempotencia: si ya existe un movimiento para este pedido, no descontar de nuevo
    const { data: movPrevio, error: errCheck } = await supabase
      .from('movimientos_stock')
      .select('id')
      .ilike('motivo', `%${motivoBase}%`)
      .limit(1);

    if (errCheck) { /* ... */ }
    if (movPrevio && movPrevio.length > 0) {
      console.log(`[STOCK] Pedido #${pedidoId} ya fue procesado — omitiendo descuento.`);
      return null;
    }

    // 1–5. Consumo del pedido y pre-flight check (compartido con verificarStockPedido)
    const calculo = await calcularConsumoPedido(pedidoId);
    if (calculo.error) return calculo.error;

    const { consumo, stockMap, nombreMap } = calculo;
    if (Object.keys(consumo).length === 0) return null;

    // 6. Aplicar descuentos en insumos
    // 7. Registrar movimientos en movimientos_stock
    // (sin cambios)
```

- **Paso 0 (idempotencia):** si ya hay movimientos con "pedido #044" en el motivo, este pedido ya descontó y no se vuelve a hacer. Por eso pasar de 3 a 4 no descuenta dos veces.
- **Pasos 1 a 5:** ahora son una llamada a `calcularConsumoPedido`.
- **Pasos 6 y 7** (restar el stock de cada insumo y registrar los movimientos de salida): **sin cambios**.

**Por qué se separó `calcularConsumoPedido`:** la verificación (estado 2) y el descuento (estado 3) tienen que calcular **exactamente lo mismo**, así que el cálculo tenía que estar en un solo lugar. Había dos alternativas peores:
- **Copiar los pasos 1 a 5 en `verificarStockPedido`:** dos copias del mismo cálculo. Si mañana cambia cómo se calcula (por ejemplo, un factor de merma), alguien lo actualiza en una y se olvida de la otra, y el sistema deja pasar a 2 un pedido que después falla en 3.
- **Que `descontarStockPedido` llamara a `verificarStockPedido` y después recalculara:** consultaría la base dos veces, y seguiría habiendo dos cálculos.

Con la función interna que **devuelve los datos del cálculo**, cada una toma lo que necesita: la verificación, solo el error; el descuento, el consumo y los mapas.

#### Cambio en `cambiarEstadoPedido` — [server.js:877-880](server.js#L877-L880)

```js
  if (nuevoEstado === 2) {
    const errorStock = await verificarStockPedido(pedidoId);
    if (errorStock) return { status: 409, error: errorStock };
  }
```

Va **antes** del `UPDATE`: si falta stock, el pedido no cambia de estado. Como está en `cambiarEstadoPedido` y no en el endpoint, **cualquier camino** que pase un pedido a 2 queda cubierto.

#### `GET /api/pedidos/:id/verificar-stock` (nuevo) — [server.js:911](server.js#L911)

```js
app.get('/api/pedidos/:id/verificar-stock', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  const { data: pedido, error: errLectura } = await supabase
    .from('pedidos')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (errLectura) return res.status(500).json({ error: errLectura.message });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const errorStock = await verificarStockPedido(id);
  res.json(errorStock ? { ok: false, error: errorStock } : { ok: true });
});
```

- **Primero confirma que el pedido existe:** sin esto, un pedido inexistente no tiene detalles, `calcularConsumoPedido` devuelve consumo vacío y respondería `{ ok: true }`, que sería engañoso.
- **Stock insuficiente responde 200 con `ok: false`, no 409:** la consulta en sí salió bien; el resultado es "no alcanza". El 409 se reserva para cuando se **intenta** cambiar el estado y no se puede.

**Por qué existe este endpoint si `PUT /estado` ya verifica:** por el orden de la pantalla. Con transferencia o tarjeta, antes de cambiar el estado se abre "Confirmar Pago". Sin este endpoint, el admin confirmaría el pago y *después* recibiría el 409, después de haber confirmado un pago para un pedido que no se puede preparar. Este endpoint permite avisar **antes** del modal.

#### Frontend — [ListarPedidos.js](frontend/src/js/ListarPedidos.js)

**Evento `change` del select de estado (líneas 157-182):**

```js
    const metodo = pedido.metodo_pago || 'Efectivo';
    if (nuevoId === ESTADO_EN_PREPARACION && METODOS_PAGO_PREVIO.includes(metodo) && !pedido.pagado) {
      // Primero el stock: si no alcanza, no tiene sentido pedir la confirmación del pago
      selectEstado.disabled = true;
      const errorStock = await verificarStockPedido(pedido.id);
      selectEstado.disabled = false;

      if (errorStock) {
        mostrarAlertaStock(errorStock);
        selectEstado.value = anteriorId;
        aplicarColorEstado(selectEstado, anteriorId);
        return;
      }

      abrirModalConfirmarPago(pedido, selectEstado, nuevoId, anteriorId);
      return;
    }

    cambiarEstadoPedido(pedido, selectEstado, nuevoId, anteriorId);
```

- **Solo consulta antes** cuando va a aparecer el modal de pago: pago no en efectivo y pedido sin pagar.
- **Mientras consulta, deshabilita el select** para que no se pueda cambiar de nuevo.
- **Si falta stock:** muestra el mismo aviso que ya existía (`mostrarAlertaStock`), vuelve el select al estado anterior y no abre el modal.
- **Efectivo, o ya pagado:** va directo a `cambiarEstadoPedido`. Si falta stock, el 409 del servidor muestra el mismo aviso; eso ya lo manejaba la grilla.

**`verificarStockPedido(pedidoId)` del frontend (línea 227)** — es otra función, con el mismo nombre que la del servidor:

```js
async function verificarStockPedido(pedidoId) {
  try {
    const res = await fetch(`http://localhost:3000/api/pedidos/${pedidoId}/verificar-stock`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fg_token') }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? null : data.error;
  } catch {
    return null;
  }
}
```

**Por qué devuelve `null` (como si alcanzara) cuando la consulta falla:** si la sesión venció o se cortó la conexión, bloquear al admin no ayuda. Se deja seguir y se abre el modal, porque el servidor **vuelve a verificar** en `PUT /estado`. Si igual falta stock, ese 409 muestra el aviso. La consulta previa es una comodidad para el admin; la garantía está en el servidor.

### E. Cómo se conecta con lo que ya existía

- **Descuento de stock:** sigue ocurriendo **solo** al pasar a 3 o 4, con la misma idempotencia. El cálculo es literalmente el mismo código.
- **Estados:** la verificación vive en `cambiarEstadoPedido`, que es por donde pasan todos los cambios de estado (admin y cocina).
- **Pagos:** no se tocaron. Solo cambió el **orden** en la pantalla (primero stock, después el modal). `PUT /pagado` y el modal "Confirmar Pago" siguen igual.
- **"Listo" por cocinero:** no se tocó. Como el pedido ya pasó la verificación al entrar a 2, es menos probable que se trabe al llegar a 3.
- **Anulación:** no se tocó.

### F. Limitaciones conocidas

- **La verificación no reserva stock.** Compara contra el `stock_actual`, que todavía no descontó lo que van a consumir **los otros pedidos que ya están en estado 2**. Ejemplo: hay 2250 g de carne y dos pedidos de 1 POLLO (1500 g cada uno). Los dos pasan la verificación por separado y entran a 2, pero juntos necesitan 3000. El segundo recién choca al pasar a 3. Para resolverlo habría que restar el consumo de los pedidos en estado 2 que todavía no descontaron.
- **Volver de 3 a 2:** si el admin devuelve a "En Preparación" un pedido que ya descontó, la verificación pide otra vez todo el stock del pedido (como si no lo hubiera consumido) y puede bloquear la vuelta.
- **La verificación se hace dos veces por pedido** (al pasar a 2 y al descontar en 3). Es a propósito, porque el stock puede cambiar en el medio, pero implica leer la base dos veces.
- **Idempotencia por texto (preexistente):** `descontarStockPedido` busca movimientos con `ilike '%pedido #100%'`. Cuando los pedidos lleguen a 1000, el pedido #100 va a encontrar los movimientos del #1000 al #1009 y va a creer que ya descontó. Lo correcto sería una columna `id_pedido` en `movimientos_stock`.
- **Comentario desactualizado:** en [ListarPedidos.js:265](frontend/src/js/ListarPedidos.js#L265) dice *"se cambia el estado (con su descuento de stock)"*, pero pasar a 2 no descuenta (solo verifica).
- **`alert()` preexistentes** en `ListarPedidos.js` (líneas 205, 217 y 287), para errores que no son de stock.
- **Las URLs `http://localhost:3000` están escritas en el código** de `ListarPedidos.js`: si se cambia el puerto o se publica en otro dominio, hay que tocarlas.

---

## Recorrido completo de un pedido con dos platos de dos cocineros

Pedido **#20**: **K1** (lo cocina **Marta**, por el plan) y **K2** (lo cocina **Juan**, asignado al plato). Pago por **transferencia**.

```
 CLIENTE / ADMIN                SERVIDOR                                   BASE DE DATOS
 ───────────────                ────────                                   ─────────────

 1. Se registra el pedido
    POST /api/pedidos ───────►  inserta pedido y detalles ──────────────►  pedidos #20: estado 1
                                                                           K1 listo=false
                                                                           K2 listo=false
                                (el stock no se mira)

 2. Admin: select → "En Preparación"   (pago por transferencia, sin pagar)
    GET /verificar-stock ────►  verificarStockPedido(20)
                                  └─ calcularConsumoPedido ──────────────► lee detalles, recetas, insumos
                                ◄─ { ok: true }                            ░░ VERIFICA (solo lee) ░░
    se abre "Confirmar Pago"
    "Sí, ya pagó"
    PUT /estado {2} ─────────►  cambiarEstadoPedido(20, 2)
                                  ├─ verificarStockPedido(20) ───────────► ░░ VERIFICA otra vez ░░
                                  └─ UPDATE estado ──────────────────────► pedidos #20: estado 2
    PUT /pagado {true} ──────►  UPDATE pagado ───────────────────────────► pedidos #20: pagado=true
                                                                           stock SIN CAMBIOS

 3. Cocina
    Juan: GET /tareas ───────►  platoEsDelCocinero → K2 es_mio
          ve solo K2
    Marta: GET /tareas ──────►  platoEsDelCocinero → K1 es_mio
          ve solo K1

 4. Juan aprieta Listo
    PUT /listo-cocinero ─────►  cocinero = JWT (Juan)
    (token de Juan)             mios = [K2] ─────────────────────────────► K2 listo=true
                                pendientes de otros = 1 (K1)
                                ◄─ { completo: false }                     pedidos #20: estado 2
    aviso azul: "Faltan platos                                             stock SIN CAMBIOS
    de otros cocineros"

 5. Marta aprieta Listo
    PUT /listo-cocinero ─────►  cocinero = JWT (Marta)
    (token de Marta)            mios = [K1] ─────────────────────────────► K1 listo=true
                                pendientes de otros = 0
                                cambiarEstadoPedido(20, 3)
                                  └─ descontarStockPedido(20)
                                       ├─ ¿ya hay movimientos? no
                                       ├─ calcularConsumoPedido ─────────► ░░ VERIFICA ░░
                                       ├─ UPDATE insumos ────────────────► ██ DESCUENTA ██
                                       └─ INSERT movimientos_stock ──────► "Consumo por producción pedido #020"
                                  ├─ UPDATE estado ──────────────────────► pedidos #20: estado 3
                                  └─ UPDATE detalles listo=true ─────────► (ya estaban)
                                ◄─ { completo: true }
    aviso verde: "Pedido completo,
    pasó a Listo para Entregar"

 6. Admin: select → "Entregado"
    PUT /estado {4} ─────────►  cambiarEstadoPedido(20, 4)
                                  └─ descontarStockPedido(20)
                                       └─ ¿ya hay movimientos? SÍ → no hace nada
                                  └─ UPDATE estado ──────────────────────► pedidos #20: estado 4
                                                                           stock SIN CAMBIOS
```

**En resumen:**

| Momento | Stock |
|---------|-------|
| Se registra (estado 1) | No se mira |
| Pasa a En Preparación (estado 2) | **Se VERIFICA** (antes del modal de pago y otra vez al guardar). Si falta, no pasa |
| Un cocinero marca listo y faltan otros | No se toca |
| El último cocinero marca listo (pasa a 3) | **Se DESCUENTA** (con una última verificación antes) |
| Pasa a Entregado (estado 4) | No se vuelve a descontar (idempotencia) |

**Variantes:**
- **Pago en efectivo:** en el paso 2 no hay `GET /verificar-stock` ni modal. El `PUT /estado` verifica y, si falta stock, devuelve 409 con el aviso.
- **Falta stock en el paso 5:** K1 queda listo, el pedido sigue en 2 y Marta ve el aviso amarillo *"...Avisale al administrador"*. El admin lo pasa a 3 desde la grilla cuando cargue stock.

---

## Funciones y endpoints nuevos o modificados

| Nombre | Archivo | Cambio | Qué hace |
|--------|---------|--------|----------|
| `platoEsDelCocinero(producto, cocineroId)` | [server.js:545](server.js#L545) | 1 · nueva | Decide si un plato le toca a un cocinero: el propio del plato o, si no tiene, el principal o suplente del plan |
| `GET /api/productos/cocineros` | [server.js:1180](server.js#L1180) | 1 · nuevo | Lista los platos activos con su cocinero propio, el del plan, el efectivo y el origen |
| `PUT /api/productos/:id/cocinero` | [server.js:1226](server.js#L1226) | 1 · nuevo | Asigna o quita (`null`) el cocinero de un plato. Pide token y valida que sea rol 2 |
| `GET /api/cocina/tareas` | [server.js:556](server.js#L556) | 1 y 2 · modificado | Pedidos en estado 2 con platos pendientes del cocinero; cada detalle con `es_mio` y `listo` |
| `cambiarEstadoPedido(pedidoId, nuevoEstado)` | [server.js:876](server.js#L876) | 2 · nueva (3 · modificada) | Única forma de cambiar el estado: verifica stock en 2, descuenta en 3 y 4, y marca los platos listos en 3 |
| `PUT /api/pedidos/:pedidoId/estado` | [server.js:930](server.js#L930) | 2 · modificado | Ahora delega en `cambiarEstadoPedido`. La respuesta es la misma de antes |
| `PUT /api/pedidos/:id/listo-cocinero` | [server.js:964](server.js#L964) | 2 · nuevo | El cocinero del JWT marca sus platos como listos; si están todos, el pedido pasa a 3 |
| `calcularConsumoPedido(pedidoId)` | [server.js:72](server.js#L72) | 3 · nueva (interna) | Calcula el consumo de insumos del pedido y lo compara con el stock. Solo lee |
| `verificarStockPedido(pedidoId)` | [server.js:154](server.js#L154) | 3 · nueva | `null` si alcanza el stock, o el mensaje de stock insuficiente. No descuenta |
| `descontarStockPedido(pedidoId)` | [server.js:164](server.js#L164) | 3 · modificada | Usa `calcularConsumoPedido` para los pasos 1 a 5. El descuento y la idempotencia no cambiaron |
| `GET /api/pedidos/:id/verificar-stock` | [server.js:911](server.js#L911) | 3 · nuevo | `{ ok: true }` o `{ ok: false, error }`. Pide token |
| `cargarDatos`, `crearFilaPlato`, `guardarCocinero`, `actualizarAviso`… | [AsignarCocinero.js](frontend/src/js/AsignarCocinero.js) | 1 · reescrito | Grilla de asignación por plato, con buscador y aviso de platos sin cocinero |
| Filtro `es_mio && !listo` | [cocinero.js:156](frontend/src/js/cocinero.js#L156) | 1 y 2 · modificado | El cocinero ve solo sus platos pendientes |
| `marcarListo`, `cerrarModalListo`, `confirmarListo` | [cocinero.js:216-281](frontend/src/js/cocinero.js#L216-L281) | 2 · nuevas | Modal de confirmación y llamada a `listo-cocinero` con el token |
| `quitarPedidoDeLaTabla`, `mostrarAviso` | [cocinero.js:283](frontend/src/js/cocinero.js#L283), [cocinero.js:303](frontend/src/js/cocinero.js#L303) | 2 · nuevas | Saca el pedido de la pantalla y muestra el aviso flotante (reemplaza al `alert()`) |
| Modal `#modalListo` | [cocinero.html:86](frontend/pages/cocinero.html#L86) | 2 · nuevo | Confirmación con las clases `.modal` del sistema (reemplaza al `confirm()`) |
| `verificarStockPedido(pedidoId)` (frontend) | [ListarPedidos.js:227](frontend/src/js/ListarPedidos.js#L227) | 3 · nueva | Llama a `/verificar-stock`; si la consulta falla, deja seguir (el servidor verifica igual) |
| Evento `change` del select de estado | [ListarPedidos.js:157](frontend/src/js/ListarPedidos.js#L157) | 3 · modificado | Con pago no efectivo, verifica el stock antes de abrir "Confirmar Pago" |
