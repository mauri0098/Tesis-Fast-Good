-- ============================================================================
-- compra_hora_real.sql — Movimientos de Stock, paso 1: la compra de HOY guarda la hora real
--
-- ANTES: registrar_compra guardaba SIEMPRE a las 12:00 (sql/insumos_lotes_fifo.sql, línea 217).
--        Una compra hecha a las 16:00 quedaba debajo de un "Hecho" de las 15:00.
-- AHORA: fecha elegida = hoy → la hora real · otro día → las 12:00 de ese día.
--        Ej: hoy 04/11 a las 16:20, fecha 04/11 → 04/11 16:20 · fecha 02/11 → 02/11 12:00
-- Eso vale para movimientos_stock.fecha y lotes_insumo.fecha_ingreso (timestamptz).
-- compras.fecha es DATE: guarda solo el día elegido. Ej: compra de hoy 04/11 a las 22:00 → 04/11, no 05/11.
-- CORREGIDO el 04/11: la primera versión guardaba la hora real también en compras.fecha. Si ya corriste esa, corré esta.
--
-- Es la misma función de sql/insumos_lotes_fifo.sql: cambia SOLO el paso 2 (y su variable v_hoy) y el paso 7.
-- No cambia lo que recibe ni lo que devuelve, así que server.js no se toca y Render sigue funcionando.
-- OJO: la base es la misma, entonces desde que se corre también vale para las compras de Render.
-- No modifica ninguna fila: las compras viejas quedan a las 12:00.
-- Lo corre Mauri en el SQL Editor de Supabase. Se puede correr más de una vez.
-- ============================================================================

create or replace function registrar_compra(           -- reemplaza la función que ya existe
  p_id_usuario uuid,                                   -- quién carga: lo pone el servidor (sale del token)
  p_fecha      date,                                   -- el día elegido (puede venir vacío)
  p_proveedor  text,                                   -- el proveedor (puede venir vacío)
  p_items      jsonb                                   -- la lista de insumos
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_hoy            date;                               -- NUEVO: el día de hoy en Argentina
  v_fecha          date;                               -- día de la compra (hoy si no viene)
  v_fecha_hora     timestamptz;                        -- CAMBIÓ: la hora real si es hoy; las 12 de Argentina si es otro día
  v_item           jsonb;                              -- un renglón de la lista
  v_vencimiento    date;                               -- vencimiento de un renglón (puede ser null)
  v_id_malo        integer;                            -- id de un insumo que no existe
  v_nombre         text;                               -- nombre de un insumo inactivo
  v_insumo         record;                             -- datos del insumo de un renglón
  v_id_compra      integer;                            -- número de la compra creada
  v_id_movimiento  bigint;                             -- el número de la entrada de cada renglón (para atarle su lote)
begin                                                  -- empieza el código
  -- 1. Quién carga (sale del token en el servidor; nunca debería faltar)
  if p_id_usuario is null then                         -- ¿falta el usuario? SÍ: vino vacío · NO: vino del token
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que carga la compra');  -- se corta acá
  end if;                                              -- fin del paso 1

  -- 2. La fecha, con el día de Argentina (la base trabaja en UTC y de 21 a 24 hs ya sería mañana)
  v_hoy := (now() at time zone 'America/Argentina/Buenos_Aires')::date;  -- NUEVO: hoy en Argentina. Ej: 2026-11-04
  v_fecha := coalesce(p_fecha, v_hoy);                 -- si no viene fecha, hoy

  if v_fecha = v_hoy then                              -- ¿la compra es de hoy? SÍ: hoy 04/11 y fecha 04/11 · NO: fecha 02/11
    v_fecha_hora := now();                             -- NUEVO: la hora real, así sale primera en Movimientos de Stock
  else                                                 -- si es de otro día...
    v_fecha_hora := (v_fecha + time '12:00') at time zone 'America/Argentina/Buenos_Aires';  -- ...las 12 de Argentina, como antes
  end if;                                              -- fin del paso 2

  -- 3. p_items tiene que ser una lista con al menos un insumo. Son dos "if" separados: jsonb_array_length falla si no es una lista
  if p_items is null or jsonb_typeof(p_items) <> 'array' then  -- ¿no es una lista? SÍ: vacío o un texto · NO: [ ... ]
    return jsonb_build_object('ok', false, 'error', 'La lista de insumos es inválida');  -- se corta acá
  end if;                                              -- fin de "no es una lista"
  if jsonb_array_length(p_items) = 0 then              -- ¿la lista está vacía? SÍ: [] · NO: tiene un insumo
    return jsonb_build_object('ok', false, 'error', 'Cargá al menos un insumo');  -- se corta acá
  end if;                                              -- fin del paso 3

  -- 4. Revisar renglón por renglón: id_insumo entero, cantidad mayor a 0 y fecha de vencimiento vacía o válida
  for v_item in select * from jsonb_array_elements(p_items)  -- recorre los renglones, uno por vuelta
  loop                                                 -- empieza la vuelta
    if jsonb_typeof(v_item) <> 'object'                -- ¿el renglón no es un objeto...
       or coalesce(jsonb_typeof(v_item->'id_insumo'), '') <> 'number'  -- ...o el insumo no es un número...
       or coalesce(jsonb_typeof(v_item->'cantidad'), '') <> 'number' then  -- ...o la cantidad no es un número? SÍ: "hola" · NO: 4
      return jsonb_build_object('ok', false, 'error', 'Cada renglón tiene que tener un insumo y una cantidad');  -- se corta acá
    end if;                                            -- fin del control de tipos

    if (v_item->>'id_insumo')::numeric <> trunc((v_item->>'id_insumo')::numeric) then  -- ¿el id tiene decimales? SÍ: 4.5 · NO: 4
      return jsonb_build_object('ok', false, 'error', 'El id del insumo es inválido');  -- se corta acá
    end if;                                            -- fin del control del id

    if (v_item->>'cantidad')::numeric <= 0 then        -- ¿la cantidad es 0 o menos? SÍ: 0 · NO: 500
      return jsonb_build_object('ok', false, 'error', 'Las cantidades tienen que ser mayores a 0');  -- se corta acá
    end if;                                            -- fin del control de la cantidad

    -- El vencimiento es opcional. Si viene, tiene que ser una fecha de verdad
    if coalesce(jsonb_typeof(v_item->'fecha_vencimiento'), 'null') <> 'null' then  -- ¿vino vencimiento? SÍ: "2026-12-31" · NO: null
      begin                                            -- bloque que puede fallar
        v_vencimiento := (v_item->>'fecha_vencimiento')::date;  -- intenta leerlo como fecha
      exception when others then                       -- si falla (ej: "hola" o "2026-02-31")...
        return jsonb_build_object('ok', false, 'error', 'Hay una fecha de vencimiento inválida');  -- ...se corta acá
      end;                                             -- fin del bloque que puede fallar
    end if;                                            -- fin del control del vencimiento
  end loop;                                            -- fin del paso 4

  -- 5. Bloquear los insumos de la lista, ordenados por id: dos cargas a la vez no se pisan el stock ni se traban
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from insumos                                      -- de la tabla de insumos
    where id in (select (x->>'id_insumo')::integer from jsonb_array_elements(p_items) x)  -- los de la lista
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado hasta que termine la transacción

  -- 6. Cada insumo tiene que existir...
  select (x->>'id_insumo')::integer                    -- el id del renglón
    into v_id_malo                                     -- se guarda en v_id_malo
    from jsonb_array_elements(p_items) x               -- los renglones de la lista
    left join insumos i on i.id = (x->>'id_insumo')::integer  -- cada uno con su insumo (si tiene)
   where i.id is null                                  -- se queda con los que no encontraron insumo
   limit 1;                                            -- alcanza con el primero

  if found then                                        -- ¿hay alguno que no existe? SÍ: id 999 · NO: todos existen
    return jsonb_build_object('ok', false, 'error', 'El insumo ' || v_id_malo || ' no existe');  -- se corta acá
  end if;                                              -- fin de "no existe"

  -- ...y estar activo
  select i.nombre                                      -- el nombre del insumo
    into v_nombre                                      -- se guarda en v_nombre
    from jsonb_array_elements(p_items) x               -- los renglones de la lista
    join insumos i on i.id = (x->>'id_insumo')::integer  -- cada uno con su insumo
   where i.activo is not true                          -- se queda con los que no están activos
   order by i.nombre                                   -- en orden de nombre
   limit 1;                                            -- alcanza con el primero

  if found then                                        -- ¿hay alguno inactivo? SÍ: un insumo desactivado · NO: todos activos
    return jsonb_build_object('ok', false, 'error', 'El insumo "' || v_nombre || '" no está activo');  -- se corta acá
  end if;                                              -- fin del paso 6

  -- 7. La cabecera de la compra. El proveedor vacío se guarda como null
  insert into compras (fecha, proveedor, id_usuario)   -- tabla de compras, columnas
  values (v_fecha, nullif(trim(p_proveedor), ''), p_id_usuario)  -- compras.fecha es DATE: va el día elegido (con la hora real, de 21 a 24 hs quedaría mañana). A quién y quién la cargó
  returning id into v_id_compra;                       -- se guarda el número de la compra

  -- 8. Por cada renglón: una ENTRADA en movimientos_stock, SU LOTE y sumar al stock
  for v_item in select * from jsonb_array_elements(p_items)  -- recorre los renglones, uno por vuelta
  loop                                                 -- empieza la vuelta
    -- La unidad del movimiento es la del insumo (la cantidad ya viene convertida)
    select id, unidad_medida                           -- número y unidad del insumo
      into v_insumo                                    -- se guardan en v_insumo
      from insumos                                     -- de la tabla de insumos
     where id = (v_item->>'id_insumo')::integer;       -- el insumo de este renglón

    -- El vencimiento ya se revisó en el paso 4; si no viene, queda null
    v_vencimiento := null;                             -- arranca vacío en cada vuelta
    if coalesce(jsonb_typeof(v_item->'fecha_vencimiento'), 'null') <> 'null' then  -- ¿vino vencimiento? SÍ: "2026-12-31" · NO: null
      v_vencimiento := (v_item->>'fecha_vencimiento')::date;  -- se lee como fecha
    end if;                                            -- fin del vencimiento

    -- El movimiento (los costos quedan vacíos). Se guarda su número para atarle el lote
    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_compra, fecha_vencimiento)  -- libreta de insumos, columnas:
    values (                                           -- los valores, en el mismo orden:
      v_insumo.id,                                     -- qué insumo
      'entrada',                                       -- entró
      (v_item->>'cantidad')::numeric,                  -- cuánto
      v_insumo.unidad_medida,                          -- en qué unidad
      'Compra #' || v_id_compra,                       -- el motivo. Ej: "Compra #11"
      v_fecha_hora,                                    -- cuándo (paso 2)
      p_id_usuario,                                    -- quién la cargó
      v_id_compra,                                     -- de qué compra
      v_vencimiento                                    -- cuándo vence (o null)
    )                                                  -- fin de los valores
    returning id into v_id_movimiento;                 -- se guarda el número de la entrada

    -- El lote de este renglón, con su vencimiento y todo su saldo. Va ANTES de sumar el stock: cuando el disparador
    -- compare, la suma ya da justo (si el stock estaba en negativo, el disparador le descuenta esa deuda)
    insert into lotes_insumo (id_insumo, id_movimiento, origen, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_restante)  -- tabla de lotes, columnas:
    values (v_insumo.id, v_id_movimiento, 'compra', v_fecha_hora, v_vencimiento,  -- qué insumo, qué entrada, el origen, cuándo y cuándo vence
            (v_item->>'cantidad')::numeric, (v_item->>'cantidad')::numeric);  -- cuánto entró y cuánto queda (al principio, lo mismo)

    -- Sumar al stock del insumo (el disparador sincroniza los lotes y la fecha de caducidad)
    update insumos                                     -- tabla de insumos
       set stock_actual = coalesce(stock_actual, 0) + (v_item->>'cantidad')::numeric  -- ej: 2000 + 500 = 2500
     where id = v_insumo.id;                           -- solo este insumo
  end loop;                                            -- fin del paso 8

  return jsonb_build_object('ok', true, 'id_compra', v_id_compra);  -- salió bien: el número de la compra
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: se le saca el permiso a los de afuera y queda solo service_role (server.js)
revoke execute on function registrar_compra(uuid, date, text, jsonb) from public, anon, authenticated;  -- nadie de afuera la llama directo
grant  execute on function registrar_compra(uuid, date, text, jsonb) to service_role;                   -- solo el servidor
