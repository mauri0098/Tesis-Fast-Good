-- =====================================================
-- PEDIDOS POR COMBO — FUNCIÓN crear_pedido_combos
-- Guarda un pedido de combos completo: pedidos + pedido_combos + pedido_detalles.
--
-- La va a llamar el servidor con supabase.rpc('crear_pedido_combos', {...})
-- desde la ruta nueva POST /api/pedidos-combos (paso 12). Nadie más puede llamarla.
--
-- TODO O NADA, en dos partes:
--   PARTE 1: controla TODO sin escribir nada. Si algo está mal devuelve
--            { "ok": false, "error": "mensaje claro" } y no se guardó nada.
--   PARTE 2: recién ahí escribe en las 3 tablas. Si algo falla en el medio,
--            Postgres deshace todo lo que escribió la función (corre entera
--            en una sola transacción) y el servidor recibe un error.
--
-- Qué controla la base: combo activo (y su plan activo, como el catálogo), plato en el
-- menú de ESE combo y activo, cantidades enteras > 0, suma justa = cantidad del combo,
-- texto personalizado no vacío y hasta 150 caracteres, entre 1 y 10 combos,
-- y que alcancen las viandas de la heladera.
-- Qué NO controla (lo controla el servidor, paso 12): los datos del cliente
-- (largos, método de pago, tipo de entrega, fecha hábil y feriados de fechas.js).
--
-- CON HELADERA (paso H6, ver docs/HELADERA-AVANCE.md):
--   - Los platos NORMALES salen de la heladera: se controla que alcancen (sumando todos los
--     combos del pedido), se restan de productos.stock_heladera y se anota un renglón "venta" (−)
--     en el cuaderno (movimientos_viandas) con el número de pedido. Nacen con
--     cantidad_de_heladera = cantidad y listo = true: la cocina no los ve.
--   - Los PERSONALIZADOS no salen de la heladera (los cocina la cocina): cantidad_de_heladera = 0
--     y listo = false. Se pueden pedir aunque no haya viandas.
--   - Si no alcanza: { "ok": false, "error": "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12" }
--     y no se guarda nada.
--   - Antes de guardar pone CANDADO a todos los platos del pedido (normales y personalizados),
--     en orden de número: dos clientes no se llevan la misma vianda, y no se traba con una anulación.
--
-- Devuelve: { "ok": true, "id_pedido": 215, "total": 137000,
--             "combos": [ { id_combo, nombre, precio, cantidad,
--                           platos: [ { id_producto, nombre, cantidad, personalizado } ] } ] }
--
-- Cómo usarlo: Supabase → SQL Editor → pegá este archivo (de "begin;" a "commit;") → "Run".
-- Se puede correr más de una vez: "create or replace" pisa la versión anterior.
-- =====================================================

-- "begin" abre un bloque: todo lo de abajo se aplica junto o no se aplica nada.
begin;

create or replace function crear_pedido_combos(       -- crea la función (o la reemplaza si ya existe)
  p_id_usuario        uuid,                            -- quién hace el pedido: lo pone el SERVIDOR (token o "Consumidor Final")
  p_cliente_nombre    text,                            -- "Nombre Apellido"
  p_cliente_direccion text,                            -- dirección escrita por el cliente
  p_cliente_telefono  text,                            -- teléfono
  p_cliente_email     text,                            -- email ('' si no lo escribió, como el formulario viejo)
  p_fecha_entrega     date,                            -- fecha de entrega (el servidor ya controló que sea hábil)
  p_metodo_pago       text,                            -- 'Efectivo' o 'Transferencia' (lo controla el servidor)
  p_tipo_entrega      text,                            -- 'Delivery' o 'Retiro en local' (lo controla el servidor)
  p_barrio_id         integer,                         -- barrio (puede venir vacío: null)
  p_observaciones     text,                            -- observaciones del pedido
  p_combos            jsonb                            -- [{ id_combo, platos: [{ producto_id, cantidad, personalizado }] }]
)
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for, variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare
  v_combo_json       jsonb;                            -- un combo del pedido, tal como llegó del servidor
  v_plato_json       jsonb;                            -- un plato de ese combo, tal como llegó
  v_combo            record;                           -- el combo leído de la base (id, nombre, cantidad, precio)
  v_nombre_plato     text;                             -- el nombre del plato leído de la base
  v_numero           numeric;                          -- un número del JSON, ANTES de convertirlo a entero
  v_tipo             text;                             -- el tipo de un dato del JSON ('string', 'number', 'null'...)
  v_id_combo         integer;                          -- id del combo, ya controlado
  v_id_producto      integer;                          -- id del plato, ya controlado
  v_cantidad         integer;                          -- cantidad de viandas de un plato, ya controlada
  v_texto            text;                             -- texto personalizado limpio (sin espacios de más), o null
  v_suma             integer;                          -- suma de las viandas de un combo
  v_platos_listos    jsonb;                            -- platos ya controlados de un combo
  v_combos_listos    jsonb   := '[]'::jsonb;           -- combos ya controlados (lista vacía al empezar)
  v_total            numeric := 0;                     -- total del pedido: suma de los precios de los combos
  v_combo_listo      jsonb;                            -- un combo ya controlado (en la parte 2)
  v_id_pedido        integer;                          -- id del pedido nuevo
  v_id_pedido_combo  integer;                          -- id de la fila nueva de pedido_combos
  v_precio_unitario  numeric;                          -- precio del combo dividido su cantidad
  v_ventas           jsonb   := '[]'::jsonb;           -- lo que sale de la heladera: [{ id_producto, cantidad }], un renglón por plato
  v_venta_json       jsonb;                            -- un renglón de v_ventas
  v_stock            record;                           -- un plato leído de la base al controlar la heladera (nombre y viandas libres)
  v_de_heladera      integer;                          -- viandas de un renglón que salen de la heladera (0 si es personalizado)
  v_listo            boolean;                          -- si un renglón nace listo (sí, si sale de la heladera)
begin

  -- ===================================================
  -- PARTE 1: CONTROLES (no escribe nada)
  -- ===================================================

  -- 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario del pedido');  -- ...se corta acá
  end if;                                              -- fin del control 1

  -- 2. p_combos tiene que ser una lista con entre 1 y 10 combos.
  --    Se controla en dos "if" separados: primero que sea una lista, y recién después
  --    se mide su largo (medir algo que no es una lista daría un error).
  if p_combos is null or jsonb_typeof(p_combos) <> 'array' then           -- si no es una lista...
    return jsonb_build_object('ok', false, 'error', 'El pedido tiene que tener entre 1 y 10 combos');  -- ...se corta
  end if;                                              -- fin de "es una lista"
  if jsonb_array_length(p_combos) < 1 or jsonb_array_length(p_combos) > 10 then  -- si tiene 0 o más de 10...
    return jsonb_build_object('ok', false, 'error', 'El pedido tiene que tener entre 1 y 10 combos');  -- ...se corta
  end if;                                              -- fin del control 2

  -- Se recorre cada combo del pedido ("value" es cada elemento de la lista)
  for v_combo_json in select value from jsonb_array_elements(p_combos) loop

    -- 3. id_combo: tiene que ser un número entero mayor a 0.
    --    Primero se mira el TIPO; recién si es un número se lee su valor. Así, si llega
    --    "abc" o 3.5, se responde con un mensaje claro en vez de cortarse con un error raro.
    v_numero := null;                                  -- arranca vacío
    if jsonb_typeof(v_combo_json->'id_combo') = 'number' then  -- si id_combo es un número...
      v_numero := (v_combo_json->>'id_combo')::numeric;        -- ...se lee su valor
    end if;                                            -- fin de leer el número
    if v_numero is null or v_numero <> trunc(v_numero) or v_numero < 1 or v_numero > 2147483647 then  -- vacío, con decimales, menor a 1 o gigante
      return jsonb_build_object('ok', false, 'error', 'Hay un combo con datos inválidos');  -- se corta
    end if;                                            -- fin del control 3
    v_id_combo := v_numero::integer;                   -- ya es seguro convertirlo a entero

    -- 4. El combo tiene que existir, estar activo y ser de un plan activo
    --    (la misma regla que usa el catálogo GET /api/v1/combos para mostrarlo)
    select c.id, c.nombre, c.cantidad, c.precio        -- datos del combo...
      into v_combo                                     -- ...guardados en v_combo
      from combos c                                    -- tabla de combos
      join planes pl on pl.id = c.id_plan              -- con su plan
     where c.id = v_id_combo                           -- el combo pedido
       and c.activo = true                             -- activo
       and pl.activo = true;                           -- y de un plan activo
    if not found then                                  -- si no apareció ninguno...
      return jsonb_build_object('ok', false, 'error',  -- ...se corta con este mensaje
        'El combo ' || v_id_combo || ' no existe o ya no está disponible');
    end if;                                            -- fin del control 4

    -- 5. platos: una lista con al menos 1 plato y no más platos que viandas tiene el combo
    --    (cada plato trae al menos 1 vianda: con más renglones que viandas, la suma no puede dar justo).
    if coalesce(jsonb_typeof(v_combo_json->'platos'), '') <> 'array' then  -- si "platos" no es una lista...
      return jsonb_build_object('ok', false, 'error', 'Hay un combo con datos inválidos');  -- ...se corta
    end if;                                            -- fin de "es una lista"
    if jsonb_array_length(v_combo_json->'platos') < 1                     -- sin platos...
       or jsonb_array_length(v_combo_json->'platos') > v_combo.cantidad then  -- ...o con demasiados renglones
      return jsonb_build_object('ok', false, 'error',  -- se corta con este mensaje
        '«' || v_combo.nombre || '» tiene que tener entre 1 y ' || v_combo.cantidad || ' platos');
    end if;                                            -- fin del control 5

    -- Se recorre cada plato de este combo
    v_suma := 0;                                       -- la suma de viandas arranca en 0
    v_platos_listos := '[]'::jsonb;                    -- la lista de platos controlados arranca vacía
    for v_plato_json in select value from jsonb_array_elements(v_combo_json->'platos') loop

      -- 6. producto_id: número entero mayor a 0 (mismo cuidado que con id_combo)
      v_numero := null;                                -- arranca vacío
      if jsonb_typeof(v_plato_json->'producto_id') = 'number' then  -- si es un número...
        v_numero := (v_plato_json->>'producto_id')::numeric;       -- ...se lee su valor
      end if;                                          -- fin de leer el número
      if v_numero is null or v_numero <> trunc(v_numero) or v_numero < 1 or v_numero > 2147483647 then  -- inválido
        return jsonb_build_object('ok', false, 'error',  -- se corta con este mensaje
          'Hay un plato con datos inválidos en «' || v_combo.nombre || '»');
      end if;                                          -- fin del control 6
      v_id_producto := v_numero::integer;              -- ya es seguro convertirlo a entero

      -- 7. cantidad: número entero mayor a 0 y no más que las viandas del combo
      v_numero := null;                                -- arranca vacío
      if jsonb_typeof(v_plato_json->'cantidad') = 'number' then  -- si es un número...
        v_numero := (v_plato_json->>'cantidad')::numeric;        -- ...se lee su valor
      end if;                                          -- fin de leer el número
      if v_numero is null or v_numero <> trunc(v_numero) or v_numero < 1 or v_numero > v_combo.cantidad then  -- inválida
        return jsonb_build_object('ok', false, 'error',  -- se corta con este mensaje
          'Hay una cantidad inválida en «' || v_combo.nombre || '»');
      end if;                                          -- fin del control 7
      v_cantidad := v_numero::integer;                 -- ya es seguro convertirla a entero

      -- 8. El plato tiene que estar en el menú de ESTE combo (renglón activo) y estar activo
      select pr.nombre                                 -- nombre del plato...
        into v_nombre_plato                            -- ...guardado en v_nombre_plato
        from combo_productos cp                        -- el menú de los combos
        join productos pr on pr.id = cp.id_producto    -- con el plato
       where cp.id_combo = v_combo.id                  -- del menú de este combo
         and cp.id_producto = v_id_producto            -- el plato pedido
         and cp.activo = true                          -- renglón del menú activo
         and pr.activo = true;                         -- plato activo
      if not found then                                -- si no está en el menú (o está desactivado)...
        select nombre into v_nombre_plato from productos where id = v_id_producto;  -- ...se busca su nombre para el mensaje
        return jsonb_build_object('ok', false, 'error',  -- se corta con este mensaje
          'El plato «' || coalesce(v_nombre_plato, 'N° ' || v_id_producto)          -- (si no existe, se muestra su número)
          || '» no está en el menú de «' || v_combo.nombre || '» o ya no está disponible');
      end if;                                          -- fin del control 8

      -- 9. Personalizado: puede no venir (o venir null). Si viene, tiene que ser un texto
      --    que, sin espacios de más, no quede vacío y tenga hasta 150 caracteres.
      v_texto := null;                                 -- arranca sin texto
      v_tipo := coalesce(jsonb_typeof(v_plato_json->'personalizado'), 'null');  -- si no vino el dato, cuenta como null
      if v_tipo = 'string' then                        -- si vino un texto...
        v_texto := btrim(v_plato_json->>'personalizado', E' \t\r\n');  -- ...se le sacan espacios, tabs y saltos de línea de los bordes
        if v_texto = '' then                           -- si quedó vacío...
          return jsonb_build_object('ok', false, 'error',  -- ...se corta con este mensaje
            'El texto personalizado de «' || v_nombre_plato || '» no puede estar vacío');
        end if;                                        -- fin de "vacío"
        if char_length(v_texto) > 150 then             -- si tiene más de 150 caracteres...
          return jsonb_build_object('ok', false, 'error',  -- ...se corta con este mensaje
            'El texto personalizado de «' || v_nombre_plato || '» admite hasta 150 caracteres');
        end if;                                        -- fin de "largo"
      elsif v_tipo <> 'null' then                      -- si vino otra cosa (un número, una lista...)
        return jsonb_build_object('ok', false, 'error',  -- se corta con este mensaje
          'Hay un plato con datos inválidos en «' || v_combo.nombre || '»');
      end if;                                          -- fin del control 9

      -- El plato pasó todos los controles: se suma y se guarda en la lista de platos listos
      v_suma := v_suma + v_cantidad;                   -- suma de viandas del combo
      v_platos_listos := v_platos_listos || jsonb_build_object(  -- se agrega al final de la lista:
        'id_producto',   v_id_producto,                -- id del plato
        'nombre',        v_nombre_plato,               -- nombre (sale de la base)
        'cantidad',      v_cantidad,                   -- cuántas viandas
        'personalizado', v_texto                       -- texto limpio, o null
      );
    end loop;                                          -- fin de los platos de este combo

    -- 10. La suma de las viandas tiene que ser JUSTO la cantidad del combo
    if v_suma <> v_combo.cantidad then                 -- si no da justo...
      return jsonb_build_object('ok', false, 'error',  -- ...se corta con este mensaje
        '«' || v_combo.nombre || '» tiene ' || v_suma || ' viandas y tienen que ser ' || v_combo.cantidad);
    end if;                                            -- fin del control 10

    -- El combo pasó todos los controles: su precio (de la BASE) se suma al total
    v_total := v_total + v_combo.precio;               -- el total sale solo de combos.precio
    v_combos_listos := v_combos_listos || jsonb_build_object(  -- se agrega a la lista de combos listos:
      'id_combo', v_combo.id,                          -- id del combo
      'nombre',   v_combo.nombre,                      -- nombre (sale de la base)
      'precio',   v_combo.precio,                      -- precio (sale de la base)
      'cantidad', v_combo.cantidad,                    -- viandas del combo (sale de la base)
      'platos',   v_platos_listos                      -- sus platos ya controlados
    );
  end loop;                                            -- fin de los combos del pedido

  -- 11. LISTA DE VENTAS: por plato, las viandas NORMALES (no personalizadas) sumando TODOS los
  --     combos del pedido. Los personalizados no salen de la heladera: no cuentan.
  --     Ej: combos [8 fideos + 2 fideos "sin sal"] y [10 fideos] → [{ "id_producto": 7, "cantidad": 18 }]
  --     (jsonb_array_elements abre una lista en filas, una por elemento: acá se abren los combos y,
  --      de cada combo, sus platos. "group by" junta las filas del mismo plato y "sum" las suma.)
  select coalesce(jsonb_agg(jsonb_build_object(        -- arma la lista...
           'id_producto', t.id_producto,               -- ...con cada plato...
           'cantidad',    t.cantidad)                  -- ...y cuántas viandas salen de la heladera...
           order by t.id_producto),                    -- ...ordenada por número de plato...
         '[]'::jsonb)                                  -- ...(lista vacía si todos son personalizados)
    into v_ventas                                      -- y la guarda en v_ventas
    from (select (pla.value->>'id_producto')::integer            as id_producto,  -- el plato
                 sum((pla.value->>'cantidad')::integer)::integer as cantidad      -- sus viandas normales, sumando todos los combos
            from jsonb_array_elements(v_combos_listos) com,      -- cada combo ya controlado...
                 jsonb_array_elements(com.value->'platos') pla   -- ...y cada plato de ese combo
           where pla.value->>'personalizado' is null             -- solo los platos normales
           group by (pla.value->>'id_producto')::integer) t;     -- un renglón por plato

  -- 12. CANDADO a TODOS los platos del pedido (normales y personalizados), en orden de número.
  --     "for update" = hasta que termine la función, nadie más puede cambiar esos platos.
  --     Si dos clientes compran las últimas viandas a la vez, el segundo espera acá y después
  --     ve cuántas quedaron. Los personalizados también llevan candado (aunque no salen de la
  --     heladera) para tomar los candados siempre en el mismo orden que anular_pedido_con_devolucion:
  --     así las dos funciones nunca se quedan esperándose una a la otra.
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from productos                                    -- de la tabla de platos
    where id in (select (pla.value->>'id_producto')::integer     -- los platos...
                   from jsonb_array_elements(v_combos_listos) com,      -- ...de cada combo...
                        jsonb_array_elements(com.value->'platos') pla)  -- ...del pedido
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado

  -- 13. ¿Alcanzan las viandas de la heladera? Plato por plato, en orden de número.
  --     Si a uno no le alcanza, se corta con un mensaje claro: todavía no se guardó nada.
  for v_venta_json in select value from jsonb_array_elements(v_ventas) loop  -- cada plato que sale de la heladera
    select nombre, stock_heladera                      -- su nombre y cuántas viandas libres tiene
      into v_stock                                     -- se guardan en v_stock
      from productos                                   -- de la tabla de platos
     where id = (v_venta_json->>'id_producto')::integer;  -- este plato (ya tiene candado)
    if v_stock.stock_heladera < (v_venta_json->>'cantidad')::integer then  -- si hay menos de las que se piden...
      return jsonb_build_object('ok', false, 'error',  -- ...se corta con este mensaje:
        'No quedan suficientes viandas de «' || v_stock.nombre  -- de qué plato,
        || '»: pediste ' || (v_venta_json->>'cantidad')         -- cuántas se pidieron
        || ' y quedan ' || v_stock.stock_heladera);             -- y cuántas hay (ej: "pediste 16 y quedan 12")
    end if;                                            -- fin de "no alcanza"
  end loop;                                            -- fin del control 13

  -- ===================================================
  -- PARTE 2: GUARDAR (todo pasó los controles)
  -- Desde acá, si algo falla, Postgres deshace todo lo que se escribió.
  -- Se usan SOLO los datos ya controlados (v_combos_listos y v_ventas), no lo que llegó.
  -- ===================================================

  -- 14. La cabecera del pedido (igual que el pedido viejo: estado 1 "Registrado", sin pagar)
  insert into pedidos (                                -- tabla de pedidos, columnas:
    id_usuario, id_estado, total,                      -- usuario, estado y total
    cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,  -- datos del cliente
    fecha_entrega, metodo_pago, observaciones,         -- entrega, pago y observaciones
    barrio_id, tipo_entrega, pagado                    -- barrio, tipo de entrega y si está pagado
  ) values (                                           -- valores, en el mismo orden:
    p_id_usuario, 1, v_total,                          -- estado 1 = Registrado; total calculado acá
    p_cliente_nombre, p_cliente_direccion, p_cliente_telefono, p_cliente_email,  -- tal como los mandó el servidor
    p_fecha_entrega, p_metodo_pago, p_observaciones,   -- tal como los mandó el servidor
    p_barrio_id,                                       -- barrio (o null)
    coalesce(nullif(p_tipo_entrega, ''), 'Delivery'),  -- si viene vacío, 'Delivery' (como el pedido viejo)
    false                                              -- todavía no está pagado
  )
  returning id into v_id_pedido;                       -- se guarda el id del pedido nuevo

  -- 15. Cada combo (pedido_combos) y sus platos (pedido_detalles)
  for v_combo_listo in select value from jsonb_array_elements(v_combos_listos) loop

    -- El combo comprado, con el precio que se cobró (por si después el combo cambia de precio)
    insert into pedido_combos (id_pedido, id_combo, precio)  -- tabla de combos comprados
    values (v_id_pedido,                               -- el pedido nuevo
            (v_combo_listo->>'id_combo')::integer,     -- el combo
            (v_combo_listo->>'precio')::numeric)       -- su precio de la base
    returning id into v_id_pedido_combo;               -- se guarda el id de esta fila

    -- Precio de cada vianda: precio del combo / cantidad del combo, redondeado a centavos
    -- (ej: 137000 / 10 = 13700.00). Lo usan el detalle del pedido y el reporte de más vendidos.
    v_precio_unitario := round((v_combo_listo->>'precio')::numeric / (v_combo_listo->>'cantidad')::integer, 2);

    -- Un renglón de pedido_detalles por cada plato del combo
    for v_plato_json in select value from jsonb_array_elements(v_combo_listo->'platos') loop
      -- ¿Sale de la heladera? Un plato normal sí (todas sus viandas) y nace listo: la cocina no lo ve.
      -- Un personalizado no (lo cocina la cocina): 0 de heladera y no listo.
      if v_plato_json->>'personalizado' is null then   -- si es un plato normal...
        v_de_heladera := (v_plato_json->>'cantidad')::integer;  -- ...todas sus viandas salen de la heladera
        v_listo := true;                               -- ...y ya está listo
      else                                             -- si es personalizado...
        v_de_heladera := 0;                            -- ...no sale de la heladera
        v_listo := false;                              -- ...y lo tiene que hacer la cocina
      end if;                                          -- fin de "¿sale de la heladera?"

      insert into pedido_detalles (                    -- tabla de platos del pedido, columnas:
        id_pedido, id_pedido_combo, id_producto, cantidad, precio_unitario,  -- a qué pedido y combo, qué plato, cuántos y a qué precio
        personalizado, observaciones_plato, cantidad_de_heladera, listo      -- si es personalizado, su texto, viandas de heladera y si está listo
      ) values (                                       -- valores, en el mismo orden:
        v_id_pedido,                                   -- el pedido nuevo
        v_id_pedido_combo,                             -- el combo al que pertenece
        (v_plato_json->>'id_producto')::integer,       -- el plato
        (v_plato_json->>'cantidad')::integer,          -- cuántas viandas
        v_precio_unitario,                             -- precio de cada vianda
        (v_plato_json->>'personalizado') is not null,  -- personalizado = sí si trae texto
        v_plato_json->>'personalizado',                -- el texto ("sin sal"), o null
        v_de_heladera,                                 -- viandas que salen de la heladera (ej: 8, o 0 si es personalizado)
        v_listo                                        -- sí, si sale de la heladera
      );
    end loop;                                          -- fin de los platos de este combo
  end loop;                                            -- fin de los combos

  -- 16. VENTAS: por cada plato de la lista del paso 11, se resta de la heladera y se anota un
  --     renglón "venta" en el cuaderno, con cantidad NEGATIVA (salen viandas).
  --     Un solo renglón por plato aunque esté en varios combos (ej: fideos −18, no −8 y −10).
  --     Si no hay platos normales, la lista está vacía y no se hace nada.
  for v_venta_json in select value from jsonb_array_elements(v_ventas) loop  -- cada plato que sale de la heladera
    insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)  -- tabla del cuaderno, columnas:
    values ((v_venta_json->>'id_producto')::integer,   -- el plato
            p_id_usuario,                              -- el usuario del pedido (el cliente, o "Consumidor Final")
            v_id_pedido,                               -- el pedido nuevo (así anular sabe qué devolver)
            'venta',                                   -- el tipo
            -((v_venta_json->>'cantidad')::integer),   -- cuántas salen, en negativo (ej: −18)
            'Pedido #' || v_id_pedido);                -- ej: "Pedido #250"

    update productos                                   -- tabla de platos
       set stock_heladera = stock_heladera - (v_venta_json->>'cantidad')::integer  -- ej: 71 − 18 = 53
     where id = (v_venta_json->>'id_producto')::integer;  -- solo este plato
  end loop;                                            -- fin de las ventas

  -- 17. Todo guardado: se devuelve el pedido con los nombres y precios de la BASE
  --     (los usa el mensaje de WhatsApp)
  return jsonb_build_object(                           -- respuesta:
    'ok',        true,                                 -- salió bien
    'id_pedido', v_id_pedido,                          -- número de pedido
    'total',     v_total,                              -- total calculado acá
    'combos',    v_combos_listos                       -- combos con sus platos
  );
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- -----------------------------------------------------
-- PERMISOS
-- Postgres deja ejecutar cualquier función nueva a todo el mundo.
-- Se le saca el permiso a anon y authenticated (el acceso "de afuera", con la clave
-- pública) y se deja solo a service_role, que es la clave que usa server.js.
-- -----------------------------------------------------
revoke execute on function crear_pedido_combos(uuid, text, text, text, text, date, text, text, integer, text, jsonb)
  from public, anon, authenticated;                    -- nadie de afuera puede llamarla
grant execute on function crear_pedido_combos(uuid, text, text, text, text, date, text, text, integer, text, jsonb)
  to service_role;                                     -- solo el servidor

-- "commit" cierra el bloque y confirma todo.
commit;

-- Si al llamarla desde el servidor aparece "Could not find the function crear_pedido_combos",
-- Supabase todavía no la "vio": corré solo esta línea (le avisa que recargue la lista de funciones).
-- notify pgrst, 'reload schema';
