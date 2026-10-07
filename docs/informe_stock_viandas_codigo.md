# Stock de viandas en heladera — Código comentado

> Complemento de [informe_stock_viandas.md](informe_stock_viandas.md). Acá está el código completo de las funciones SQL, los endpoints y las funciones principales de las pantallas.
>
> **Cómo leerlo:**
> - Cada bloque indica **archivo y líneas** (por ejemplo `server.js:2202-2237`), para buscarlo en Visual Studio con `Ctrl+G`.
> - El código está copiado tal cual. Los comentarios que terminan en **◀** los agregué solo en este informe para explicar lo que no es obvio; **no están en el archivo real**. Los demás comentarios sí son del código.
> - Los números de línea corresponden al 7/10/2026.

## Índice

- [Parte 1 — Las funciones SQL](#parte-1--las-funciones-sql)
  - [1.1 Lo que se creó en la base](#11-lo-que-se-creó-en-la-base)
  - [1.2 registrar_tanda_viandas](#12-registrar_tanda_viandas)
  - [1.3 registrar_descarte_vianda](#13-registrar_descarte_vianda)
  - [1.4 registrar_tanda_multiple](#14-registrar_tanda_multiple)
  - [1.5 Permisos](#15-permisos)
- [Parte 2 — El servidor](#parte-2--el-servidor)
- [Parte 3 — Las pantallas](#parte-3--las-pantallas)

---

# Parte 1 — Las funciones SQL

## 1.1 Lo que se creó en la base

### Tabla y columnas — `sql/stock_viandas.sql:15-61`

```sql
-- 1) PRODUCTOS: columna nueva "stock_heladera"
alter table productos
  add column if not exists stock_heladera integer not null default 0   -- ◀ "if not exists": si ya está, no hace nada (se puede correr dos veces)
  check (stock_heladera >= 0);                                         -- ◀ la base misma impide que quede negativo, aunque el código falle

-- 2) PEDIDO_DETALLES: columna nueva "cantidad_de_heladera"
alter table pedido_detalles
  add column if not exists cantidad_de_heladera integer not null default 0
  check (cantidad_de_heladera >= 0);                                   -- ◀ todavía no se usa: es para la etapa de pedidos

-- 3) TABLA NUEVA: movimientos_viandas
create table if not exists movimientos_viandas (
  id          serial primary key,                              -- ◀ serial = número automático 1, 2, 3…
  id_producto integer not null references productos(id),       -- ◀ "references" = clave foránea: el plato tiene que existir
  id_usuario  uuid    not null references usuarios(id),
  id_pedido   integer references pedidos(id),                  -- ◀ opcional; pensado para cuando se venda desde la heladera
  tipo        varchar(20) not null
              check (tipo in ('produccion', 'venta', 'devolucion', 'descarte', 'ajuste')),
  cantidad    integer not null check (cantidad <> 0),          -- ◀ + entra, − sale; 0 no sería un movimiento
  motivo      text,
  fecha       timestamptz not null default now()               -- ◀ timestamptz = fecha y hora con zona horaria
);

-- 4) MOVIMIENTOS_STOCK: columna nueva "id_movimiento_vianda"
alter table movimientos_stock
  add column if not exists id_movimiento_vianda integer references movimientos_viandas(id);  -- ◀ la unión "uno a muchos"
```

### Número de combo — `sql/stock_viandas_lotes.sql:15-31`

```sql
create sequence if not exists movimientos_viandas_lote_seq;    -- ◀ un contador: cada nextval() da el siguiente número

alter table movimientos_viandas
  add column if not exists id_lote integer;                     -- ◀ vacío (NULL) en platos sueltos y descartes

create index if not exists idx_mov_viandas_lote on movimientos_viandas(id_lote);  -- ◀ índice = búsqueda rápida por combo

revoke all   on sequence movimientos_viandas_lote_seq from public, anon, authenticated;  -- ◀ nadie de afuera puede pedir números
grant  usage on sequence movimientos_viandas_lote_seq to service_role;                   -- ◀ solo el servidor
```

## 1.2 `registrar_tanda_viandas`

`sql/stock_viandas_funciones.sql:31-166`. Carga N viandas de un plato.

### Bloque 1 — Firma y variables (líneas 31-48)

```sql
create or replace function registrar_tanda_viandas(    -- ◀ "or replace": si ya existe, la reemplaza por esta versión
  p_id_producto integer,                               -- ◀ prefijo p_ = parámetro (lo que recibe)
  p_cantidad    integer,
  p_id_usuario  uuid,
  p_motivo      text default null                      -- ◀ opcional: si no se manda, vale NULL
)
returns jsonb                                          -- ◀ devuelve un JSON, que el servidor recibe como objeto
language plpgsql                                       -- ◀ plpgsql = el lenguaje de funciones de Postgres (permite if, for, variables)
as $$
declare
  v_producto        record;                            -- ◀ prefijo v_ = variable; record = una fila entera
  v_insumo          record;
  v_faltantes       jsonb := '[]'::jsonb;              -- ◀ arranca como lista vacía
  v_cant_receta     integer;
  v_id_movimiento   integer;
  v_stock_heladera  integer;
  v_motivo_insumos  text;
begin
```

Los parámetros son lo que manda el servidor con `supabase.rpc('registrar_tanda_viandas', { p_id_producto, p_cantidad, p_id_usuario, p_motivo })`. Los nombres tienen que coincidir exactamente.

### Bloque 2 — Validaciones y bloqueo del plato (líneas 49-77)

```sql
  -- 1. La cantidad tiene que ser un entero mayor a 0
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');
  end if;                                              -- ◀ "return" termina la función acá: no se tocó nada

  -- 2. El plato tiene que existir y estar activo.
  --    "for update" bloquea la fila del plato hasta que termine la transacción:
  --    si llegan dos tandas del mismo plato a la vez, la segunda espera a la primera.
  select id, nombre, activo, stock_heladera
    into v_producto                                    -- ◀ guarda la fila leída en la variable
    from productos
   where id = p_id_producto
     for update;                                       -- ◀ BLOQUEO: otra transacción que quiera esta fila espera

  if not found then                                    -- ◀ "found" es falso si el select no encontró ninguna fila
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');
  end if;
  if not v_producto.activo then
    return jsonb_build_object('ok', false, 'error', 'El plato "' || v_producto.nombre || '" no está activo');
  end if;                                              -- ◀ || une textos (como + en JavaScript)

  -- 3. Sin receta no hay tanda: entrarían viandas sin gastar ningún insumo
  select count(*) into v_cant_receta
    from producto_insumo
   where id_producto = p_id_producto;

  if v_cant_receta = 0 then
    return jsonb_build_object('ok', false, 'error', 'El plato "' || v_producto.nombre || '" no tiene receta cargada');
  end if;
```

Primero se valida todo lo que puede fallar, sin modificar nada. Si algo está mal, la función devuelve `ok: false` y termina.

### Bloque 3 — Bloqueo de insumos en orden (líneas 79-86)

```sql
  -- 4. Bloquear los insumos de la receta, SIEMPRE ordenados por id.
  perform 1                                            -- ◀ "perform" = ejecutar un select sin guardar el resultado
     from insumos
    where id in (select id_insumo from producto_insumo where id_producto = p_id_producto)
    order by id                                        -- ◀ el orden en que se bloquean: siempre del id menor al mayor
      for update;                                      -- ◀ bloquea todos los insumos de la receta
```

Lo único que interesa de este select es el bloqueo. El `order by id` hace que todas las cargas bloqueen en el mismo orden y no se traben entre sí (ver la sección 5 del informe general).

### Bloque 4 — ¿Alcanza? (líneas 88-119)

```sql
  -- 5. Pre-chequeo: ¿alcanza cada insumo? (receta × cantidad de viandas)
  for v_insumo in                                      -- ◀ recorre fila por fila el resultado del select
    select i.id,
           i.nombre,
           coalesce(i.stock_actual, 0)                             as disponible,  -- ◀ coalesce: si es NULL, usa 0
           sum(coalesce(pi.cantidad_necesaria, 0)) * p_cantidad    as necesario    -- ◀ receta × viandas; sum por si el insumo está dos veces
      from producto_insumo pi                          -- ◀ "pi" es un apodo de la tabla para escribir menos
      join insumos i on i.id = pi.id_insumo            -- ◀ une cada renglón de la receta con su insumo
     where pi.id_producto = p_id_producto
     group by i.id, i.nombre, i.stock_actual           -- ◀ una fila por insumo
     order by i.id
  loop
    if v_insumo.disponible < v_insumo.necesario then
      v_faltantes := v_faltantes || jsonb_build_object(  -- ◀ agrega un elemento a la lista de faltantes
        'id_insumo',  v_insumo.id,
        'nombre',     v_insumo.nombre,
        'necesario',  v_insumo.necesario,
        'disponible', v_insumo.disponible,
        'falta',      v_insumo.necesario - v_insumo.disponible
      );
    end if;
  end loop;

  if jsonb_array_length(v_faltantes) > 0 then
    return jsonb_build_object(
      'ok',        false,
      'error',     'No alcanzan los insumos para esta tanda',
      'faltantes', v_faltantes                         -- ◀ la pantalla muestra "Carne (faltan 200)"
    );
  end if;
```

**No convierte unidades**: si la receta dice 200 y el insumo está en gramos, resta 200 gramos. Es la misma regla que usan los pedidos (`calcularConsumoPedido`, `server.js:188`).

### Bloque 5 — Anotar la tanda (líneas 121-124)

```sql
  -- 6. Registrar la tanda en movimientos_viandas (cantidad positiva = entran)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)
  values (p_id_producto, p_id_usuario, 'produccion', p_cantidad, nullif(trim(p_motivo), ''))  -- ◀ nullif: si el motivo es '' guarda NULL
  returning id into v_id_movimiento;                   -- ◀ devuelve el id que la base le asignó a la fila nueva
```

Se anota primero la tanda porque sus salidas de insumo necesitan su `id`.

### Bloque 6 — Descontar insumos y anotar salidas (líneas 126-152)

```sql
  v_motivo_insumos := 'Producción tanda: ' || p_cantidad || ' ' || v_producto.nombre;

  for v_insumo in
    select pi.id_insumo                                            as id,
           i.unidad_medida,
           sum(coalesce(pi.cantidad_necesaria, 0)) * p_cantidad    as necesario
      from producto_insumo pi
      join insumos i on i.id = pi.id_insumo
     where pi.id_producto = p_id_producto
     group by pi.id_insumo, i.unidad_medida
     order by pi.id_insumo
  loop
    -- Un insumo que no se gasta (cantidad 0 en la receta) no genera movimiento
    if v_insumo.necesario <= 0 then
      continue;                                        -- ◀ saltea al siguiente insumo
    end if;

    update insumos
       set stock_actual = stock_actual - v_insumo.necesario   -- ◀ resta sobre lo que haya AHORA, no escribe un número calculado antes
     where id = v_insumo.id;

    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_movimiento_vianda)
    values (v_insumo.id, 'salida', v_insumo.necesario, v_insumo.unidad_medida, v_motivo_insumos, now(), p_id_usuario, v_id_movimiento);
    --                                                                                                   ◀ id_usuario: columna que ningún SQL del proyecto crea (riesgo 2)
    --                                                                                                   ◀ v_id_movimiento: une esta salida con su tanda
  end loop;
```

### Bloque 7 — Sumar a la heladera (líneas 154-166)

```sql
  update productos
     set stock_heladera = stock_heladera + p_cantidad
   where id = p_id_producto
  returning stock_heladera into v_stock_heladera;      -- ◀ lee el valor nuevo para devolverlo

  return jsonb_build_object(
    'ok',             true,
    'id_movimiento',  v_id_movimiento,                 -- ◀ lo usa registrar_tanda_multiple para ponerle el número de combo
    'stock_heladera', v_stock_heladera                 -- ◀ la pantalla lo muestra: "En heladera: 12 viandas"
  );
end;
$$;
```

## 1.3 `registrar_descarte_vianda`

`sql/stock_viandas_funciones.sql:173-230`.

### Bloque 1 — Firma, validación y bloqueo (líneas 173-202)

```sql
create or replace function registrar_descarte_vianda(
  p_id_producto integer,
  p_cantidad    integer,
  p_id_usuario  uuid,
  p_motivo      text default null                      -- ◀ en la base es opcional; el servidor lo exige (leerMotivoVianda)
)
returns jsonb
language plpgsql
as $$
declare
  v_producto        record;
  v_id_movimiento   integer;
  v_stock_heladera  integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');
  end if;

  select id, nombre, stock_heladera
    into v_producto
    from productos
   where id = p_id_producto
     for update;                                       -- ◀ bloquea el plato: dos descartes a la vez no leen el mismo número

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');
  end if;
```

### Bloque 2 — Hay suficientes, anotar y restar (líneas 204-230)

```sql
  -- 3. No se puede descartar más de lo que hay en la heladera
  if v_producto.stock_heladera < p_cantidad then
    return jsonb_build_object(
      'ok',    false,
      'error', 'En la heladera hay ' || v_producto.stock_heladera || ' viandas de "' || v_producto.nombre
               || '": no se pueden descartar ' || p_cantidad
    );
  end if;

  -- 4. Registrar el descarte (cantidad negativa = salen)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)
  values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, nullif(trim(p_motivo), ''))  -- ◀ -p_cantidad: negativo
  returning id into v_id_movimiento;

  -- 5. Restar de la heladera
  update productos
     set stock_heladera = stock_heladera - p_cantidad  -- ◀ no toca insumos: ya se gastaron al cocinar
   where id = p_id_producto
  returning stock_heladera into v_stock_heladera;

  return jsonb_build_object(
    'ok',             true,
    'id_movimiento',  v_id_movimiento,
    'stock_heladera', v_stock_heladera
  );
end;
$$;
```

## 1.4 `registrar_tanda_multiple`

`sql/stock_viandas_funciones.sql:278-422`. Carga un combo: todo o nada.

### Bloque 1 — Firma y variables (líneas 278-296)

```sql
create or replace function registrar_tanda_multiple(
  p_items      jsonb,                                  -- ◀ [{ "id_producto": 7, "cantidad": 5 }, { "id_producto": 9, "cantidad": 5 }]
  p_id_usuario uuid,
  p_motivo     text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_items      jsonb;                 -- lista limpia: sin ceros y sin platos repetidos
  v_item       record;
  v_resultado  jsonb;                 -- lo que devuelve registrar_tanda_viandas para un plato
  v_fallo      jsonb := null;         -- detalle del plato que falló (sobrevive al rollback)
  v_cargados   jsonb := '[]'::jsonb;  -- platos cargados, para la respuesta
  v_total      integer := 0;
  v_plato      text;                  -- nombre del plato (para el motivo de combo)
  v_plan       text;                  -- nombre del plan del plato (para el motivo de combo)
  v_lote       integer;               -- número que agrupa todos los movimientos de esta carga
begin
```

### Bloque 2 — Validar y limpiar la lista (líneas 297-336)

```sql
  -- 1. p_items tiene que ser una lista
  if p_items is null or jsonb_typeof(p_items) <> 'array' then   -- ◀ jsonb_typeof dice qué es: 'array', 'object', 'number'…
    return jsonb_build_object('ok', false, 'error', 'La lista de platos es inválida');
  end if;

  -- 2. Cada item: un objeto con id_producto entero y cantidad entera >= 0.
  if exists (
    select 1
      from jsonb_array_elements(p_items) e             -- ◀ convierte la lista JSON en filas (una por plato)
     where case                                        -- ◀ CASE evalúa en orden: no convierte a número algo que no es número
             when jsonb_typeof(e) <> 'object' then true
             when coalesce(jsonb_typeof(e->'id_producto'), '') <> 'number' then true   -- ◀ e->'campo' = el valor de ese campo
             when coalesce(jsonb_typeof(e->'cantidad'), '') <> 'number' then true
             when (e->>'id_producto')::numeric <> trunc((e->>'id_producto')::numeric) then true  -- ◀ ¿tiene decimales?
             when (e->>'cantidad')::numeric <> trunc((e->>'cantidad')::numeric) then true
             when (e->>'cantidad')::numeric < 0 then true
             else false
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Cada plato tiene que tener una cantidad entera mayor o igual a 0');
  end if;

  -- 3. Lista limpia: se suman los platos repetidos y se ignoran los que quedan en 0
  select coalesce(
           jsonb_agg(jsonb_build_object('id_producto', t.id_producto, 'cantidad', t.cantidad) order by t.id_producto),
           '[]'::jsonb)                                -- ◀ jsonb_agg vuelve a armar una lista JSON con las filas
    into v_items
    from (
      select (e->>'id_producto')::integer          as id_producto,   -- ◀ e->>'campo' = el valor como texto; ::integer lo convierte
             sum((e->>'cantidad')::integer)::integer as cantidad
        from jsonb_array_elements(p_items) e
       group by 1                                      -- ◀ agrupa por la primera columna: un renglón por plato
      having sum((e->>'cantidad')::integer) > 0        -- ◀ having = filtro después de agrupar: saca los ceros
    ) t;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Cargá al menos un plato con cantidad mayor a 0');
  end if;
```

El servidor ya valida lo mismo (`leerItemsViandas`), pero la función también lo hace por si algún día se la llama desde otro lado.

### Bloque 3 — Número de combo y bloqueos (líneas 338-361)

```sql
  -- 4a. Número de esta carga. Si después falla y se deshace, el número queda
  --     salteado (las secuencias no vuelven atrás): no importa, solo agrupa.
  v_lote := nextval('movimientos_viandas_lote_seq');   -- ◀ pide el siguiente número: 12, 13, 14…

  -- 4. Bloqueos, en el mismo orden que registrar_tanda_viandas: primero los platos
  --    y después los insumos, los dos ordenados por id.
  --    Se bloquea acá, fuera del paso 5, para que los bloqueos sigan tomados
  --    aunque el paso 5 se deshaga.
  perform 1
     from productos
    where id in (select (x->>'id_producto')::integer from jsonb_array_elements(v_items) x)
    order by id
      for update;                                      -- ◀ todos los platos del combo

  perform 1
     from insumos
    where id in (
            select pi.id_insumo
              from producto_insumo pi
             where pi.id_producto in (select (x->>'id_producto')::integer from jsonb_array_elements(v_items) x)
          )
    order by id
      for update;                                      -- ◀ todos los insumos de todos los platos
```

**Por qué fuera del paso 5.** Si un bloqueo se toma dentro de un bloque que después se deshace, Postgres también suelta ese bloqueo. Tomándolos antes, siguen vigentes pase lo que pase.

### Bloque 4 — Cargar plato por plato, todo o nada (líneas 363-413)

```sql
  begin                                                -- ◀ sub-bloque: tiene su propio manejo de errores (exception)
    for v_item in
      select (x->>'id_producto')::integer as id_producto,
             (x->>'cantidad')::integer    as cantidad
        from jsonb_array_elements(v_items) x
       order by 1
    loop
      v_resultado := registrar_tanda_viandas(v_item.id_producto, v_item.cantidad, p_id_usuario, p_motivo);
      --             ◀ REUTILIZA la función de un plato. Como es la misma transacción,
      --               este plato ya ve el stock que dejaron los anteriores.

      if not coalesce((v_resultado->>'ok')::boolean, false) then
        v_fallo := v_resultado || jsonb_build_object(  -- ◀ || entre dos JSON los une: agrega id_producto y plato al error
          'id_producto', v_item.id_producto,
          'plato',       (select nombre from productos where id = v_item.id_producto)
        );
        raise exception 'Falló la carga de un plato del combo' using errcode = 'FGT01';
        --  ◀ lanza un error con un código propio. Salta directo al "exception" de abajo.
      end if;

      -- Motivo de combo en las salidas de insumos de este plato.
      select p.nombre, pl.nombre
        into v_plato, v_plan
        from productos p
        left join planes pl on pl.id = p.id_plan       -- ◀ left join: trae el plato aunque no tenga plan (v_plan queda NULL)
       where p.id = v_item.id_producto;

      update movimientos_stock
         set motivo = 'Producción combo' || coalesce(' ' || v_plan, '') || ': ' || v_item.cantidad || ' ' || v_plato
       where id_movimiento_vianda = (v_resultado->>'id_movimiento')::integer;
      --   ◀ si v_plan es NULL, ' ' || NULL da NULL y coalesce lo cambia por '': queda "Producción combo: 5 Tarta"

      -- El movimiento de viandas de este plato queda con el número de la carga
      update movimientos_viandas
         set id_lote = v_lote
       where id = (v_resultado->>'id_movimiento')::integer;

      v_cargados := v_cargados || jsonb_build_object(
        'id_producto',    v_item.id_producto,
        'cantidad',       v_item.cantidad,
        'id_movimiento',  v_resultado->'id_movimiento',
        'stock_heladera', v_resultado->'stock_heladera'
      );
      v_total := v_total + v_item.cantidad;
    end loop;
  exception
    when sqlstate 'FGT01' then                         -- ◀ atrapa SOLO nuestro error. Al llegar acá, Postgres ya deshizo
      return v_fallo;                                  --   todo lo del sub-bloque (los platos anteriores incluidos).
  end;                                                 --   Las variables NO se deshacen: v_fallo conserva el detalle.
```

**Cómo se logra el "todo o nada".** Un `begin … exception … end` funciona como un punto de guardado: si dentro ocurre un error que se atrapa en `exception`, la base vuelve al estado del `begin`. Cualquier otro error (por ejemplo, una columna que no existe) no se atrapa: sube y cancela la función entera, y el servidor responde 500. En los dos casos no queda nada a medias.

### Bloque 5 — Respuesta (líneas 415-422)

```sql
  return jsonb_build_object(
    'ok',      true,
    'id_lote', v_lote,                                 -- ◀ el servidor no lo reenvía: hoy la pantalla no lo usa
    'total',   v_total,                                -- ◀ "Combo registrado: 10 viandas cargadas en heladera."
    'items',   v_cargados
  );
end;
$$;
```

## 1.5 Permisos

`sql/stock_viandas_funciones.sql:238-241` y `:425-426`

```sql
revoke execute on function registrar_tanda_viandas(integer, integer, uuid, text)   from public, anon, authenticated;
revoke execute on function registrar_descarte_vianda(integer, integer, uuid, text) from public, anon, authenticated;
grant  execute on function registrar_tanda_viandas(integer, integer, uuid, text)   to service_role;
grant  execute on function registrar_descarte_vianda(integer, integer, uuid, text) to service_role;
-- ◀ Postgres deja ejecutar cualquier función nueva a todo el mundo ("public").
--   anon = quien entra con la clave pública de Supabase; authenticated = usuarios de Supabase Auth.
--   service_role = la clave secreta que usa server.js. Solo ella puede ejecutarlas.

revoke execute on function registrar_tanda_multiple(jsonb, uuid, text) from public, anon, authenticated;
grant  execute on function registrar_tanda_multiple(jsonb, uuid, text) to service_role;
```

---

# Parte 2 — El servidor

Todo el bloque está en `server.js:1940-2339`, bajo el título `API STOCK DE VIANDAS (HELADERA)`, más dos cambios en los endpoints de movimientos de stock.

## 2.1 Constantes y funciones de ayuda

### Constantes — `server.js:1947-1951`

```js
const ROLES_HELADERA = [6, 5, 1, 2]; // administradores, dueño y cocinero
const LARGO_MAXIMO_MOTIVO_VIANDA = 200;
const ENTERO_MAXIMO_BASE = 2147483647; // tope de una columna integer de Postgres
const MAXIMO_PLATOS_COMBO = 100;      // ◀ evita que manden una lista gigante
```

### `leerCantidadViandas` — `server.js:1955-1963`

```js
function leerCantidadViandas(valor, permitirCero) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;  // ◀ rechaza true, objetos, listas…
  if (String(valor).trim() === '') return null;                             // ◀ Number('') daría 0: hay que cortarlo antes
  const cantidad = Number(valor);
  let minimo = 1;
  if (permitirCero) minimo = 0;                                             // ◀ en los combos un plato puede ir en 0
  if (!Number.isInteger(cantidad) || cantidad < minimo || cantidad > ENTERO_MAXIMO_BASE) return null;  // ◀ sin decimales
  return cantidad;
}
```

### `leerItemsViandas` — `server.js:1968-2004`

```js
function leerItemsViandas(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'La lista de platos está vacía' };
  }
  if (items.length > MAXIMO_PLATOS_COMBO) {
    return { error: `Un combo admite hasta ${MAXIMO_PLATOS_COMBO} platos` };
  }

  const cantidadPorPlato = {};                         // ◀ { 7: 5, 9: 5 } — id del plato → cantidad
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { error: 'La lista de platos es inválida' };
    }
    const idProducto = Number(item.id_producto);
    if (!Number.isInteger(idProducto) || idProducto <= 0) {
      return { error: 'Hay un plato con un identificador inválido' };
    }
    const cantidad = leerCantidadViandas(item.cantidad, true);
    if (cantidad === null) {
      return { error: 'Cada cantidad tiene que ser un número entero mayor o igual a 0' };
    }
    cantidadPorPlato[idProducto] = (cantidadPorPlato[idProducto] || 0) + cantidad;  // ◀ si el plato viene repetido, suma
    if (cantidadPorPlato[idProducto] > ENTERO_MAXIMO_BASE) {
      return { error: 'La cantidad de un plato es demasiado grande' };
    }
  }

  const limpios = Object.entries(cantidadPorPlato)     // ◀ [['7', 5], ['9', 5]]
    .map(([id, cantidad]) => ({ id_producto: Number(id), cantidad }))
    .filter(i => i.cantidad > 0)                       // ◀ saca los platos en 0
    .sort((a, b) => a.id_producto - b.id_producto);

  if (limpios.length === 0) {
    return { error: 'Cargá al menos un plato con cantidad mayor a 0' };
  }
  return { items: limpios };
}
```

### `calcularInsumosTanda` — `server.js:2011-2078`

El cálculo previo que usan `/calculo` y `/calculo-multiple`. Solo lee.

```js
async function calcularInsumosTanda(items) {
  const ids = items.map(i => i.id_producto);
  const cantidadPorPlato = {};
  items.forEach(i => { cantidadPorPlato[i.id_producto] = i.cantidad; });

  // 1. Platos (para saber si existen y están activos) y sus recetas con el stock de cada insumo
  const [consultaPlatos, consultaReceta] = await Promise.all([   // ◀ las dos consultas al mismo tiempo
    supabase.from('productos').select('id, nombre, activo').in('id', ids),
    supabase
      .from('producto_insumo')
      .select('id_producto, id_insumo, cantidad_necesaria, insumos ( nombre, stock_actual, unidad_medida )')
      //                                                    ◀ "insumos ( … )" trae los datos del insumo unido por clave foránea
      .in('id_producto', ids)
  ]);
  if (consultaPlatos.error) return { errorBase: consultaPlatos.error };
  if (consultaReceta.error) return { errorBase: consultaReceta.error };

  const receta = consultaReceta.data || [];

  // 2. Problemas que impiden la carga: plato inexistente, inactivo o sin receta
  const platoPorId = {};
  (consultaPlatos.data || []).forEach(p => { platoPorId[p.id] = p; });
  const conReceta = new Set(receta.map(r => Number(r.id_producto)));  // ◀ Set = conjunto sin repetidos; .has() pregunta si está

  const problemas = [];
  const sinReceta = [];
  for (const id of ids) {
    const plato = platoPorId[id];
    if (!plato) {
      problemas.push(`El plato ${id} no existe`);
    } else if (!plato.activo) {
      problemas.push(`El plato "${plato.nombre}" no está activo`);
    } else if (!conReceta.has(id)) {
      sinReceta.push(`"${plato.nombre}"`);
    }
  }
  if (sinReceta.length === 1) {
    problemas.push(`El plato ${sinReceta[0]} no tiene receta cargada`);
  } else if (sinReceta.length > 1) {
    problemas.push(`Estos platos no tienen receta cargada: ${sinReceta.join(', ')}`);
  }

  // 3. Consumo total por insumo (si dos platos comparten un insumo, se suma)
  const porInsumo = {};
  for (const fila of receta) {
    const id = Number(fila.id_insumo);
    if (!porInsumo[id]) {
      let nombre = String(id);
      let disponible = 0;
      let unidad = null;
      if (fila.insumos) {
        nombre     = fila.insumos.nombre || nombre;
        disponible = Number(fila.insumos.stock_actual ?? 0);  // ◀ ?? = "si es null o undefined, usá 0" (no es un ternario)
        unidad     = fila.insumos.unidad_medida || null;
      }
      porInsumo[id] = { id_insumo: id, nombre, unidad_medida: unidad, necesario: 0, disponible };
    }
    porInsumo[id].necesario += Number(fila.cantidad_necesaria || 0) * cantidadPorPlato[Number(fila.id_producto)];
    //                         ◀ receta × viandas de ESE plato, sin convertir unidades
  }

  // 4. ¿Alcanza cada uno?
  const insumos = Object.values(porInsumo)
    .sort((a, b) => a.id_insumo - b.id_insumo)
    .map(i => ({ ...i, alcanza: i.disponible >= i.necesario }));  // ◀ ...i copia todos los campos y agrega "alcanza"

  const resultado = { alcanza: problemas.length === 0 && insumos.every(i => i.alcanza), insumos };
  if (problemas.length > 0) resultado.error = problemas.join('. ');
  return resultado;
}
```

### `leerMotivoVianda` — `server.js:2081-2090`

```js
function leerMotivoVianda(valor, obligatorio) {
  if (valor == null || (typeof valor === 'string' && valor.trim() === '')) {  // ◀ == null cubre null y undefined
    if (obligatorio) return { error: 'El motivo es obligatorio' };
    return { motivo: null };
  }
  if (typeof valor !== 'string' || valor.length > LARGO_MAXIMO_MOTIVO_VIANDA) {
    return { error: `El motivo admite hasta ${LARGO_MAXIMO_MOTIVO_VIANDA} caracteres` };
  }
  return { motivo: valor.trim() };
}
```

## 2.2 `GET /api/viandas-stock` — `server.js:2095-2124`

```js
app.get('/api/viandas-stock', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  //                          ◀ requireAuth: hay que estar logueado. requireRol(...): solo esos roles (el ... "abre" la lista)
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, codigo_plato, stock_heladera, id_plan, planes ( nombre, activo ), producto_insumo ( id_insumo )')
    //       ◀ producto_insumo ( id_insumo ): trae los renglones de la receta, solo para saber si tiene alguno
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);

  const resultado = (data || []).map(p => {
    let planNombre = null;
    let planActivo = false;
    if (p.planes) {
      planNombre = p.planes.nombre;
      planActivo = Boolean(p.planes.activo);
    }
    return {
      id:             p.id,
      nombre:         p.nombre,
      codigo_plato:   p.codigo_plato,
      stock_heladera: Number(p.stock_heladera || 0),
      id_plan:        p.id_plan,
      plan_nombre:    planNombre,
      plan_activo:    planActivo,                      // ◀ con esto la pantalla arma el select de planes del combo
      tiene_receta:   Array.isArray(p.producto_insumo) && p.producto_insumo.length > 0
    };
  });

  res.json(resultado);
});
```

## 2.3 `GET /api/viandas-stock/:idProducto/calculo` — `server.js:2130-2148`

```js
app.get('/api/viandas-stock/:idProducto/calculo', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const idProducto = Number(req.params.idProducto);    // ◀ :idProducto de la ruta
  if (!Number.isInteger(idProducto)) {
    return res.status(400).json({ error: 'ID de plato inválido' });
  }
  const cantidad = leerCantidadViandas(req.query.cantidad);  // ◀ ?cantidad=N de la URL
  if (cantidad === null) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0' });
  }

  try {
    // Mismo cálculo que el combo, con un solo plato
    const calculo = await calcularInsumosTanda([{ id_producto: idProducto, cantidad }]);
    if (calculo.errorBase) return errorInterno(res, calculo.errorBase);  // ◀ error de la base: 500 con mensaje genérico
    res.json(calculo);
  } catch (e) {
    errorInterno(res, e);
  }
});
```

## 2.4 `POST /api/viandas-stock/calculo-multiple` — `server.js:2153-2164`

```js
app.post('/api/viandas-stock/calculo-multiple', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const lectura = leerItemsViandas(req.body.items);
  if (lectura.error) return res.status(400).json({ error: lectura.error });  // ◀ 400 = el pedido vino mal

  try {
    const calculo = await calcularInsumosTanda(lectura.items);
    if (calculo.errorBase) return errorInterno(res, calculo.errorBase);
    res.json(calculo);                                 // ◀ no guarda nada: solo muestra
  } catch (e) {
    errorInterno(res, e);
  }
});
```

## 2.5 `POST /api/viandas-stock/tanda-multiple` — `server.js:2168-2198`

```js
app.post('/api/viandas-stock/tanda-multiple', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const lectura = leerItemsViandas(req.body.items);
  if (lectura.error) return res.status(400).json({ error: lectura.error });
  const lecturaMotivo = leerMotivoVianda(req.body.motivo, false);  // ◀ false = motivo opcional
  if (lecturaMotivo.error) return res.status(400).json({ error: lecturaMotivo.error });

  try {
    const { data, error } = await supabase.rpc('registrar_tanda_multiple', {  // ◀ rpc = ejecutar una función de la base
      p_items:      lectura.items,
      p_id_usuario: req.usuario.id,                    // ◀ del token, NUNCA del body
      p_motivo:     lecturaMotivo.motivo
    });

    if (error) return errorInterno(res, error);        // ◀ la función se rompió (ej. columna faltante): 500

    // ok: false = no se cargó ningún plato. Se devuelve cuál falló y qué le falta.
    if (!data || !data.ok) {
      let mensaje = 'No se pudo registrar el combo';
      let plato = null;
      let faltantes = [];
      if (data && data.error) mensaje = data.error;
      if (data && data.plato) plato = data.plato;
      if (data && data.faltantes) faltantes = data.faltantes;
      return res.status(409).json({ error: mensaje, plato, faltantes });  // ◀ 409 = conflicto con el estado actual del stock
    }

    res.json({ mensaje: 'Combo registrado', total: data.total, items: data.items });
  } catch (e) {
    errorInterno(res, e);
  }
});
```

## 2.6 `POST /api/viandas-stock/tanda` — `server.js:2202-2237`

```js
app.post('/api/viandas-stock/tanda', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const idProducto = Number(req.body.id_producto);
  if (!Number.isInteger(idProducto)) {
    return res.status(400).json({ error: 'ID de plato inválido' });
  }
  const cantidad = leerCantidadViandas(req.body.cantidad);
  if (cantidad === null) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0' });
  }
  const lecturaMotivo = leerMotivoVianda(req.body.motivo, false);
  if (lecturaMotivo.error) return res.status(400).json({ error: lecturaMotivo.error });

  try {
    const { data, error } = await supabase.rpc('registrar_tanda_viandas', {
      p_id_producto: idProducto,
      p_cantidad:    cantidad,
      p_id_usuario:  req.usuario.id,
      p_motivo:      lecturaMotivo.motivo
    });

    if (error) return errorInterno(res, error);

    // ok: false = no se hizo nada (falta algún insumo, plato sin receta, etc.)
    if (!data || !data.ok) {
      let mensaje = 'No se pudo registrar la tanda';
      let faltantes = [];
      if (data && data.error) mensaje = data.error;
      if (data && data.faltantes) faltantes = data.faltantes;
      return res.status(409).json({ error: mensaje, faltantes });
    }

    res.json({ mensaje: 'Tanda registrada', id_movimiento: data.id_movimiento, stock_heladera: data.stock_heladera });
  } catch (e) {
    errorInterno(res, e);
  }
});
```

## 2.7 `POST /api/viandas-stock/descarte` — `server.js:2241-2273`

```js
app.post('/api/viandas-stock/descarte', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const idProducto = Number(req.body.id_producto);
  if (!Number.isInteger(idProducto)) {
    return res.status(400).json({ error: 'ID de plato inválido' });
  }
  const cantidad = leerCantidadViandas(req.body.cantidad);
  if (cantidad === null) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0' });
  }
  const lecturaMotivo = leerMotivoVianda(req.body.motivo, true);  // ◀ true = en el descarte el motivo es obligatorio
  if (lecturaMotivo.error) return res.status(400).json({ error: lecturaMotivo.error });

  try {
    const { data, error } = await supabase.rpc('registrar_descarte_vianda', {
      p_id_producto: idProducto,
      p_cantidad:    cantidad,
      p_id_usuario:  req.usuario.id,
      p_motivo:      lecturaMotivo.motivo
    });

    if (error) return errorInterno(res, error);

    if (!data || !data.ok) {
      let mensaje = 'No se pudo registrar el descarte';
      if (data && data.error) mensaje = data.error;
      return res.status(409).json({ error: mensaje });
    }

    res.json({ mensaje: 'Descarte registrado', id_movimiento: data.id_movimiento, stock_heladera: data.stock_heladera });
  } catch (e) {
    errorInterno(res, e);
  }
});
```

## 2.8 `GET /api/movimientos-viandas` — `server.js:2278-2339`

```js
const COLUMNAS_MOVIMIENTOS_VIANDAS =
  'id, tipo, cantidad, motivo, fecha, id_lote, productos ( nombre, planes ( nombre ) ), usuarios ( nombre, apellido )';
//                                              ◀ plato → su plan (dos niveles de unión)

app.get('/api/movimientos-viandas', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_viandas')
    .select(COLUMNAS_MOVIMIENTOS_VIANDAS)
    .order('fecha', { ascending: false })              // ◀ más nuevo primero
    .order('id', { ascending: false })                 // ◀ si dos tienen la misma fecha, desempata por id
    .limit(50);

  if (error) return errorInterno(res, error);

  let filas = data || [];

  // Completar los combos cortados: se piden todos los movimientos de los combos que
  // aparecieron y se agregan los que no estaban entre los 50
  const lotes = [...new Set(filas.filter(m => m.id_lote != null).map(m => m.id_lote))];  // ◀ números de combo, sin repetir
  if (lotes.length > 0) {
    const { data: delCombo, error: errCombo } = await supabase
      .from('movimientos_viandas')
      .select(COLUMNAS_MOVIMIENTOS_VIANDAS)
      .in('id_lote', lotes);

    if (errCombo) return errorInterno(res, errCombo);

    const yaEstan = new Set(filas.map(m => m.id));
    const faltantes = (delCombo || []).filter(m => !yaEstan.has(m.id));  // ◀ solo los que quedaron afuera del límite de 50
    if (faltantes.length > 0) {
      filas = filas.concat(faltantes).sort((a, b) => {
        const porFecha = new Date(b.fecha) - new Date(a.fecha);
        if (porFecha !== 0) return porFecha;
        return b.id - a.id;
      });
    }
  }

  const resultado = filas.map(m => {
    let platoNombre = '-';
    let planNombre = null;
    if (m.productos) {
      platoNombre = m.productos.nombre;
      if (m.productos.planes) planNombre = m.productos.planes.nombre;
    }
    let usuarioNombre = '-';
    if (m.usuarios) usuarioNombre = [m.usuarios.nombre, m.usuarios.apellido].filter(Boolean).join(' ');
    //                              ◀ filter(Boolean) saca los vacíos: "Ana" si no tiene apellido
    return {
      id:             m.id,
      tipo:           m.tipo,
      cantidad:       m.cantidad,
      motivo:         m.motivo,
      fecha:          m.fecha,
      id_lote:        m.id_lote,
      plato_nombre:   platoNombre,
      plan_nombre:    planNombre,
      usuario_nombre: usuarioNombre
    };
  });

  res.json(resultado);
});
```

## 2.9 Cambios en los endpoints de movimientos de stock

### `GET /api/movimientos-stock` — `server.js:1774-1786`

```js
app.get('/api/movimientos-stock', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select(`
      id, tipo, cantidad, unidad, motivo, fecha, id_movimiento_vianda,
      insumos ( id, nombre, unidad_medida ),
      movimientos_viandas ( id_lote, cantidad, productos ( nombre, planes ( nombre ) ), usuarios ( nombre, apellido ) )
    `)
    //  ◀ movimientos_viandas ( … ): a través de id_movimiento_vianda trae la tanda de esa salida.
    //    Si la salida no viene de una tanda, llega null.
    //    Falta "motivo" acá: por eso el motivo escrito no se ve en la pantalla (riesgo 6).
    .order('fecha', { ascending: false });

  if (error) return errorInterno(res, error);
  res.json(data);
});
```

### `DELETE /api/movimientos-stock/:id` — `server.js:1894-1898` (lo agregado)

```js
    // Las salidas de una tanda de viandas no se borran sueltas: el insumo volvería
    // al stock pero las viandas seguirían en la heladera
    if (mov.id_movimiento_vianda) {
      return res.status(409).json({ error: 'Esta salida pertenece a una tanda de viandas y no se puede borrar desde acá' });
    }
```

---

# Parte 3 — Las pantallas

## 3.1 Heladera — `frontend/src/js/heladera.js`

### Variables de estado — líneas 9-13

```js
let todosPlatos = [];       // platos activos con su stock_heladera, plan y si tienen receta
let calculoVigente = null;  // { idProducto, cantidad } del último cálculo de un plato que alcanzó
let platoDescarte = null;   // plato que se está descartando
let platosCombo = [];       // platos del plan elegido en el combo: [{ plato, cantidad }]
let calculoComboVigente = null; // items [{ id_producto, cantidad }] del último cálculo de combo que alcanzó
// ◀ "Vigente" = el cálculo sigue valiendo. Cuando se cambia algo, vuelve a null y "Confirmar" se apaga.
```

### Al cambiar de plan — líneas 550-559

```js
function alCambiarPlanCombo() {
  const idPlan = Number(document.getElementById('cPlan').value);

  platosCombo = todosPlatos
    .filter(p => idPlan && p.id_plan === idPlan)       // ◀ solo los platos de ese plan
    .sort(compararPlatos)                              // ◀ por código en orden natural (PL2 antes que PL10)
    .map(plato => ({ plato, cantidad: 0 }));           // ◀ cada uno arranca en 0

  repartirCombo();
}
```

### El reparto — líneas 569-586

```js
function repartirCombo() {
  const total = leerCantidad('cCantidad');             // ◀ el casillero "Cantidad de viandas"; null si no es válido
  const conReceta = platosCombo.filter(pc => pc.plato.tiene_receta);  // ◀ los sin receta no participan

  platosCombo.forEach(pc => { pc.cantidad = 0; });     // ◀ empieza de cero cada vez

  if (total !== null && conReceta.length > 0) {
    const base = Math.floor(total / conReceta.length); // ◀ división entera: 10 / 6 = 1
    const sobrante = total % conReceta.length;         // ◀ resto: 10 % 6 = 4
    conReceta.forEach((pc, indice) => {                // ◀ indice = 0, 1, 2…
      pc.cantidad = base;
      if (indice < sobrante) pc.cantidad = base + 1;   // ◀ los 4 primeros reciben uno más → 2, 2, 2, 2, 1, 1
    });
  }

  renderizarPlatosCombo();                             // ◀ redibuja los casilleros con los valores nuevos
  actualizarContadorCombo();
}
```

### El casillero de cada plato — líneas 611-627 (dentro de `renderizarPlatosCombo`)

```js
    const input = fila.querySelector('input');
    input.value = pc.cantidad;
    if (!pc.plato.tiene_receta) {
      input.disabled = true;                           // ◀ plato sin receta: gris y no editable
    } else {
      input.addEventListener('input', () => {          // ◀ cada vez que se escribe en el casillero
        const valor = input.value.trim();
        const cantidad = Number(valor);
        if (valor === '' || !Number.isInteger(cantidad) || cantidad < 0) {
          pc.cantidad = null; // inválido: el contador lo marca y no deja calcular
        } else {
          pc.cantidad = cantidad;                      // ◀ guarda el valor en el estado, no solo en pantalla
        }
        actualizarContadorCombo();
      });
    }
```

### El contador "Repartidas X de Y" — líneas 635-672

```js
function actualizarContadorCombo() {
  invalidarCalculoCombo();                             // ◀ cualquier cambio anula el cálculo anterior y apaga "Confirmar"

  const contador = document.getElementById('cContador');
  const btnCalcular = document.getElementById('cCalcular');
  const total = leerCantidad('cCantidad');
  const conReceta = platosCombo.filter(pc => pc.plato.tiene_receta);

  btnCalcular.disabled = true;                         // ◀ se arranca suponiendo que está mal…
  contador.classList.add('no-coincide');               //   …y en rojo

  if (!document.getElementById('cPlan').value) {
    contador.textContent = '';
    return;
  }
  if (conReceta.length === 0) {
    contador.textContent = 'Este plan no tiene platos con receta cargada.';
    return;
  }
  if (total === null) {
    contador.textContent = 'Elegí la cantidad de viandas.';
    return;
  }
  if (conReceta.some(pc => pc.cantidad === null)) {    // ◀ some = "¿alguno cumple?"
    contador.textContent = 'Hay una cantidad inválida: tiene que ser un número entero mayor o igual a 0.';
    return;
  }

  const repartidas = conReceta.reduce((suma, pc) => suma + pc.cantidad, 0);  // ◀ reduce = sumar todos
  if (repartidas !== total) {
    contador.textContent = `Repartidas ${repartidas} de ${total}: la suma de los platos tiene que dar ${total}.`;
    return;
  }

  contador.textContent = `Repartidas ${repartidas} de ${total}`;
  contador.classList.remove('no-coincide');            // ◀ recién acá: verde…
  btnCalcular.disabled = false;                        //   …y se puede calcular
}
```

### Lo que se manda al servidor — líneas 675-679

```js
function itemsDelCombo() {
  return platosCombo
    .filter(pc => pc.plato.tiene_receta && pc.cantidad > 0)  // ◀ los platos en 0 no se mandan
    .map(pc => ({ id_producto: pc.plato.id, cantidad: pc.cantidad }));
}
```

### El cálculo de insumos — líneas 681-719

```js
async function calcularCombo() {
  invalidarCalculoCombo();

  const items = itemsDelCombo();
  if (items.length === 0) {
    mostrarErrorModal('cError', 'Cargá al menos un plato con cantidad mayor a 0.');
    return;
  }

  try {
    const res = await apiFetch('/api/viandas-stock/calculo-multiple', {  // ◀ apiFetch agrega el token del login
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json().catch(() => ({}));   // ◀ si la respuesta no es JSON, usa un objeto vacío

    if (!res.ok) {
      mostrarErrorModal('cError', data.error || 'No se pudo calcular el combo.');
      return;
    }

    renderizarCalculo(data, 'cCalculo');               // ◀ dibuja la tabla Insumo / Necesario / Disponible / Estado

    // Plato inactivo o sin receta: se muestra el motivo aunque los insumos alcancen
    if (data.error) {
      mostrarErrorModal('cError', data.error);
      return;
    }

    // Se guarda exactamente lo que se calculó: eso es lo que se confirma
    if (data.alcanza) {
      calculoComboVigente = items;                     // ◀ "foto" de lo calculado
      document.getElementById('cConfirmar').disabled = false;
    }
  } catch {
    mostrarErrorModal('cError', 'No se pudo conectar con el servidor.');
  }
}
```

### La confirmación — líneas 721-760

```js
async function confirmarCombo() {
  if (!calculoComboVigente) return;                    // ◀ sin cálculo vigente no se confirma nada

  const btn = document.getElementById('cConfirmar');
  btn.disabled = true; // evita doble click mientras se guarda

  try {
    const res = await apiFetch('/api/viandas-stock/tanda-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items:  calculoComboVigente,                   // ◀ se manda la "foto", no lo que haya en pantalla ahora
        motivo: document.getElementById('cMotivo').value.trim()
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 409: no se cargó ningún plato. Se dice cuál falló y qué insumos le faltan.
      let mensaje = data.error || 'No se pudo registrar el combo.';
      if (data.plato) mensaje = data.plato + ': ' + mensaje;
      if (data.faltantes && data.faltantes.length > 0) {
        const detalle = data.faltantes
          .map(f => f.nombre + ' (faltan ' + formatearNumero(f.falta) + ')')
          .join(', ');
        mensaje = mensaje + ': ' + detalle;
      }
      mostrarErrorModal('cError', mensaje + '. No se cargó ningún plato. Volvé a calcular.');
      calculoComboVigente = null;                      // ◀ obliga a recalcular con el stock nuevo
      return;
    }

    cerrarModalCombo();
    mostrarToast('Combo registrado: ' + data.total + ' viandas cargadas en heladera.', 'exito');
    await Promise.all([fetchPlatos(), fetchHistorial()]);  // ◀ recarga la tabla y el panel a la vez
  } catch {
    mostrarErrorModal('cError', 'No se pudo conectar con el servidor.');
    btn.disabled = false;
  }
}
```

### El panel de movimientos agrupado — líneas 143-180

```js
function agruparMovimientos(movimientos) {
  const renglones = [];
  const comboPorLote = {};                             // ◀ { 12: {…combo 12…} }

  movimientos.forEach(m => {
    if (m.id_lote == null) {                           // ◀ sin número de combo: renglón suelto
      renglones.push({ esCombo: false, mov: m });
      return;
    }

    let combo = comboPorLote[m.id_lote];
    if (!combo) {                                      // ◀ primera vez que aparece este combo: se crea su renglón
      combo = {
        esCombo: true,
        idLote:  m.id_lote,
        fecha:   m.fecha,
        usuario: m.usuario_nombre,
        total:   0,
        planes:  new Set(),
        platos:  []
      };
      comboPorLote[m.id_lote] = combo;
      renglones.push(combo);                           // ◀ queda en la posición del movimiento más nuevo
    }
    combo.total += Number(m.cantidad);
    combo.planes.add(m.plan_nombre || '');             // ◀ si al final hay más de un plan, se muestra "Combo #12"
    combo.platos.push({ nombre: m.plato_nombre, cantidad: Number(m.cantidad) });
  });

  return renglones;
}

function nombreCombo(planes, idLote) {
  const lista = [...planes];
  if (lista.length === 1 && lista[0]) return 'Combo ' + lista[0] + ' #' + idLote;
  return 'Combo #' + idLote;
}
```

## 3.2 Movimientos de Stock — `frontend/src/js/MovimientosStock.js`

### La clasificación — líneas 119-146

```js
function clasificarMovimiento(m) {
  if (m.tipo === 'entrada') {
    return { clave: 'compra', filaClass: 'fila-entrada', badgeClass: 'badge-compra', icono: '▲', label: 'Compra' };
  }
  // ◀ clave = lo que usa el filtro; filaClass y badgeClass = los colores; label = el texto que se ve

  // Salidas de la heladera: se reconocen por id_movimiento_vianda (la tanda que las provocó),
  // no por el texto. Es combo si su movimiento de viandas tiene número de carga (id_lote);
  // los combos viejos, sin ese número, se reconocen por el motivo "Producción combo ...".
  if (m.id_movimiento_vianda) {
    const motivoHeladera = (m.motivo || '').toLowerCase();
    if (idLoteDe(m) !== null || motivoHeladera.startsWith('producción combo')) {
      return { clave: 'combo', filaClass: 'fila-combo', badgeClass: 'badge-combo', icono: '🍱', label: 'Combo' };
    }
    return { clave: 'produccion', filaClass: 'fila-produccion', badgeClass: 'badge-produccion', icono: '🧊', label: 'Producción' };
  }

  // Lista blanca de señales inequívocas de consumo productivo automatizado.
  // Solo si el motivo contiene una de estas, la salida es "Venta".
  // Cualquier otra cosa (texto libre, errores tipográficos, campo vacío) → "Descarte".
  const PALABRAS_VENTA = ['consumo', 'produccion', 'pedido', '#'];  // ◀ los pedidos escriben "Consumo por producción pedido #012"
  const motivo  = (m.motivo || '').toLowerCase();
  const esVenta = PALABRAS_VENTA.some(kw => motivo.includes(kw));

  if (esVenta) {
    return { clave: 'venta',    filaClass: 'fila-venta',    badgeClass: 'badge-venta',    icono: '💰', label: 'Venta'    };
  }
  return   { clave: 'descarte', filaClass: 'fila-descarte', badgeClass: 'badge-descarte', icono: '✖', label: 'Descarte' };
}

function idLoteDe(m) {                                 // ◀ líneas 154-157
  if (m.movimientos_viandas && m.movimientos_viandas.id_lote != null) return m.movimientos_viandas.id_lote;
  return null;
}
```

El orden de las preguntas importa: primero "¿es entrada?", después "¿viene de una tanda?" y recién al final se mira el texto del motivo.

### El agrupado — líneas 162-256

```js
function agruparMovimientos(movimientos) {
  const renglones = [];
  const grupoPorClave = {};                            // ◀ { 'combo-12': {…}, 'tanda-60': {…} }

  movimientos.forEach(m => {
    const clasif = clasificarMovimiento(m);
    const mv = m.movimientos_viandas;                  // ◀ la tanda de esta salida (null si no viene de una tanda)

    // ¿A qué grupo pertenece? Sin grupo → renglón suelto
    let claveGrupo = null;
    if (m.id_movimiento_vianda && mv) {
      if (idLoteDe(m) !== null) {
        claveGrupo = 'combo-' + idLoteDe(m);           // ◀ todas las salidas del combo 12 → mismo grupo
      } else if (clasif.clave === 'produccion') {
        claveGrupo = 'tanda-' + m.id_movimiento_vianda; // ◀ plato suelto: un grupo por tanda
      }
    }
    if (claveGrupo === null) {                         // ◀ compras, ventas, descartes y combos viejos
      renglones.push({ esGrupo: false, mov: m });
      return;
    }

    let grupo = grupoPorClave[claveGrupo];
    if (!grupo) {
      let usuario = '-';
      if (mv.usuarios) usuario = [mv.usuarios.nombre, mv.usuarios.apellido].filter(Boolean).join(' ');
      grupo = {
        esGrupo:   true,
        claveGrupo,
        clave:     clasif.clave,   // 'combo' o 'produccion'
        clasif,
        idLote:    idLoteDe(m),
        fecha:     m.fecha,         // el primero que aparece es el más nuevo
        usuario,
        insumoPorClave: {},        // ◀ totales del grupo entero
        platoPorTanda:  {}         // ◀ un plato por tanda, cada uno con sus insumos
      };
      grupoPorClave[claveGrupo] = grupo;
      renglones.push(grupo);
    }

    // Insumo de esta salida
    let idInsumo = '';
    let nombreInsumo = '-';
    let unidad = m.unidad || '';
    if (m.insumos) {
      idInsumo = m.insumos.id;
      nombreInsumo = m.insumos.nombre || '-';
      if (!unidad) unidad = m.insumos.unidad_medida || '';
    }
    const claveInsumo = idInsumo + '|' + unidad;       // ◀ "5|g": mismo insumo y misma unidad → se suman

    // Total del grupo: el insumo se suma entre todos los platos (por insumo y unidad)
    if (!grupo.insumoPorClave[claveInsumo]) {
      grupo.insumoPorClave[claveInsumo] = { nombre: nombreInsumo, unidad, total: 0 };
    }
    grupo.insumoPorClave[claveInsumo].total += Number(m.cantidad);

    // Plato: uno por tanda (id_movimiento_vianda). La cantidad de viandas se toma una sola vez,
    // porque cada insumo la repite. Cada plato junta sus propios insumos, para su tarjeta.
    if (!grupo.platoPorTanda[m.id_movimiento_vianda]) {  // ◀ solo la PRIMERA salida de cada tanda crea el plato
      let plato = '-';
      let plan = '';
      if (mv.productos) {
        plato = mv.productos.nombre || '-';
        if (mv.productos.planes) plan = mv.productos.planes.nombre || '';
      }
      grupo.platoPorTanda[m.id_movimiento_vianda] = {
        nombre: plato,
        plan,
        cantidad: Number(mv.cantidad),                 // ◀ 5 viandas, contadas una vez (no una por insumo)
        insumoPorClave: {}
      };
      // Motivo escrito al cargar (se guarda en movimientos_viandas). En un combo es el mismo para todos los platos.
      if (mv.motivo && !grupo.motivoEscrito) grupo.motivoEscrito = mv.motivo;  // ◀ hoy nunca llega (riesgo 6)
    }
    const platoActual = grupo.platoPorTanda[m.id_movimiento_vianda];
    if (!platoActual.insumoPorClave[claveInsumo]) {
      platoActual.insumoPorClave[claveInsumo] = { nombre: nombreInsumo, unidad, total: 0 };
    }
    platoActual.insumoPorClave[claveInsumo].total += Number(m.cantidad);
  });

  // Listas finales (ordenadas por nombre) y total de viandas de cada grupo
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');  // ◀ orden alfabético en español (con tildes)
  renglones.forEach(r => {
    if (!r.esGrupo) return;
    r.insumos = Object.values(r.insumoPorClave).sort(porNombre);
    r.platos  = Object.values(r.platoPorTanda).sort(porNombre);
    r.platos.forEach(p => { p.insumos = Object.values(p.insumoPorClave).sort(porNombre); });
    r.total   = r.platos.reduce((suma, p) => suma + p.cantidad, 0);  // ◀ total = suma de los platos, no de las salidas
  });

  return renglones;
}
```

### Título y motivo del renglón — líneas 260-270 y 352-357

```js
function tituloGrupo(grupo) {
  if (grupo.clave === 'combo') {
    const planes = [...new Set(grupo.platos.map(p => p.plan))];  // ◀ planes distintos del combo
    let numero = '';
    if (grupo.idLote !== null) numero = ' #' + grupo.idLote;
    if (planes.length === 1 && planes[0]) return 'Combo ' + planes[0] + numero;  // ◀ "Combo Mantenimiento #12"
    return 'Combo' + numero;                                                    // ◀ "Combo #12"
  }
  const plato = grupo.platos[0];
  return 'Producción: ' + plato.cantidad + ' ' + plato.nombre;                  // ◀ "Producción: 5 Tarta"
}

function motivoGrupo(grupo) {
  let texto = 'Producción';
  if (grupo.clave === 'combo') texto = 'Producción de combo';
  if (grupo.motivoEscrito) texto += ' · ' + grupo.motivoEscrito;
  return texto;
}
```

### Las tarjetas del detalle — líneas 311-348

```js
function htmlTarjetaPlato(plato) {
  let textoViandas = plato.cantidad + ' viandas';
  if (plato.cantidad === 1) textoViandas = '1 vianda';

  const insumos = plato.insumos.map(i => {
    let clase = '';
    if (coincideConFiltro(i.nombre)) clase = 'insumo-resaltado';  // ◀ amarillo si es el insumo buscado
    return `
      <li class="${clase}">
        <span>${escHtml(i.nombre)}</span>
        <span class="cantidad-insumo">${escHtml(cantidadConUnidad(i.total, i.unidad))}</span>
      </li>`;
    //  ◀ escHtml: todo texto de la base se "escapa" para que no se ejecute como HTML (protección contra XSS)
  }).join('');

  return `
    <div class="tarjeta-plato">
      <div class="tarjeta-plato-titulo">
        <strong>${escHtml(plato.nombre)}</strong>
        <span class="tarjeta-plato-viandas">· ${escHtml(textoViandas)}</span>
      </div>
      <ul class="tarjeta-plato-insumos">${insumos}</ul>
    </div>`;
}

function htmlTotalCombo(grupo) {
  const etiquetas = grupo.insumos.map(i => {
    let clase = 'etiqueta-insumo';
    if (coincideConFiltro(i.nombre)) clase += ' insumo-resaltado';
    return `<span class="${clase}">${escHtml(i.nombre)} <b>${escHtml(cantidadConUnidad(i.total, i.unidad))}</b></span>`;
  }).join('');

  return `
    <div class="total-combo">
      <span class="total-combo-titulo">Total del combo</span>
      <div class="total-combo-etiquetas">${etiquetas}</div>
    </div>`;
}
```

### El renglón agrupado y su detalle — líneas 362-425

```js
function crearFilaGrupo(grupo) {
  const { filaClass, badgeClass, icono, label } = grupo.clasif;  // ◀ "desarma" el objeto en cuatro variables
  const fragmento = document.createDocumentFragment();           // ◀ contenedor invisible para devolver DOS filas juntas

  // Fila principal
  const tr = document.createElement('tr');
  tr.className = filaClass + ' fila-grupo';
  tr.innerHTML = `
    <td>${escHtml(formatearFechaMovimiento(grupo.fecha))}</td>
    <td><span class="flecha-grupo">▸</span> <strong>${escHtml(tituloGrupo(grupo))}</strong></td>
    <td><span class="badge ${badgeClass}">${icono} ${label}</span></td>
    <td>${Number(grupo.total).toLocaleString('es-AR')}</td>
    <td>viandas</td>
    <td style="color:var(--color-muted); font-size:0.83rem;">${escHtml(motivoGrupo(grupo))}</td>
    <td><button type="button" class="btn-detalles" aria-expanded="false">Detalles</button></td>
  `;
  // ◀ última columna: "Detalles" en lugar de "Eliminar". Los grupos no se pueden borrar.

  // Fila de detalle: una tarjeta por plato, el total del combo (si hay más de un plato)
  // y al pie quién lo cargó y cuándo. El color del borde depende de si es combo o producción.
  const tarjetas = grupo.platos.map(htmlTarjetaPlato).join('');

  let total = '';
  if (grupo.clave === 'combo' && grupo.platos.length > 1) total = htmlTotalCombo(grupo);

  const pie = 'Cargado por ' + grupo.usuario + ' · ' + formatearFechaMovimiento(grupo.fecha);

  const trDetalle = document.createElement('tr');
  trDetalle.className = 'fila-detalle-grupo';
  trDetalle.innerHTML = `
    <td colspan="7">
      <div class="detalle-grupo detalle-${grupo.clave}">
        <div class="tarjetas-platos">${tarjetas}</div>
        ${total}
        <div class="pie-detalle">${escHtml(pie)}</div>
      </div>
    </td>
  `;
  // ◀ colspan="7": la celda ocupa las 7 columnas de la tabla.
  //   detalle-combo / detalle-produccion define el color (violeta / naranja) en MovimientosStock.html.

  // Abrir / cerrar en el lugar: la flechita gira y el botón pasa a "Ocultar".
  const boton = tr.querySelector('.btn-detalles');
  const flecha = tr.querySelector('.flecha-grupo');

  function mostrarDetalle(abierto) {
    trDetalle.hidden = !abierto;                       // ◀ hidden = oculto
    boton.setAttribute('aria-expanded', String(abierto));  // ◀ para lectores de pantalla; el CSS también lo usa para el color
    if (abierto) {
      boton.textContent = 'Ocultar';
      flecha.classList.add('abierta');                 // ◀ la clase "abierta" la rota 90° con CSS
      gruposAbiertos.add(grupo.claveGrupo);            // ◀ se recuerda abierto al cambiar de página o filtro
    } else {
      boton.textContent = 'Detalles';
      flecha.classList.remove('abierta');
      gruposAbiertos.delete(grupo.claveGrupo);
    }
  }

  boton.addEventListener('click', () => mostrarDetalle(trDetalle.hidden));  // ◀ si está oculto, lo abre; si no, lo cierra
  mostrarDetalle(gruposAbiertos.has(grupo.claveGrupo));                       // ◀ estado inicial

  fragmento.appendChild(tr);
  fragmento.appendChild(trDetalle);
  return fragmento;
}
```

### Los filtros — líneas 460-508

```js
function aplicarFiltros() {
  const textoInsumo = document.getElementById('filtroInsumo').value.toLowerCase();
  const tipo        = document.getElementById('filtroTipo').value;
  const desde       = document.getElementById('filtroDesde').value;
  const hasta       = document.getElementById('filtroHasta').value;

  textoResaltado = textoInsumo;                        // ◀ lo usan las tarjetas para resaltar

  // Se filtran los renglones ya agrupados: así el detalle de un combo nunca queda incompleto
  const filtrados = renglonesPantalla.filter(r => {
    let nombresInsumo;
    let tipoBase;
    let claveTipo;
    let fechaTexto;
    if (r.esGrupo) {
      nombresInsumo = r.insumos.map(i => i.nombre.toLowerCase());  // ◀ todos los insumos del grupo
      tipoBase      = 'salida';
      claveTipo     = r.clave;
      fechaTexto    = r.fecha;
    } else {
      nombresInsumo = [(r.mov.insumos?.nombre || '').toLowerCase()];
      tipoBase      = r.mov.tipo;
      claveTipo     = clasificarMovimiento(r.mov).clave;
      fechaTexto    = r.mov.fecha;
    }

    // Insumo: un grupo pasa si contiene alguno que coincida
    const nombreOk = !textoInsumo || nombresInsumo.some(n => n.includes(textoInsumo));

    // Tipo: "entrada" / "salida" comparan la columna de la base; el resto
    // (compra, venta, descarte, combo, produccion) compara la etiqueta de la pantalla
    let tipoOk = true;
    if (tipo === 'entrada' || tipo === 'salida') {
      tipoOk = tipoBase === tipo;
    } else if (tipo) {
      tipoOk = claveTipo === tipo;
    }

    let fechaMov = null;
    if (fechaTexto) fechaMov = new Date(fechaTexto);
    // "Desde" a medianoche LOCAL (new Date('YYYY-MM-DD') la toma como UTC: 21 h del día anterior)
    const desdeOk  = !desde || (fechaMov && fechaMov >= parseFechaLocal(desde));  // ◀ parseFechaLocal viene de fechas.js
    const hastaOk  = !hasta || (fechaMov && fechaMov <= new Date(hasta + 'T23:59:59'));
    return nombreOk && tipoOk && desdeOk && hastaOk;   // ◀ tiene que cumplir los cuatro filtros
  });

  renderTabla(filtrados);                              // ◀ dibuja paginado de a 15 renglones
}
```
