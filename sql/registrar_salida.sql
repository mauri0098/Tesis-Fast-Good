-- ============================================================================
-- registrar_salida.sql — Movimientos de Stock, paso 3: la ventana "Registrar salida"
--
-- QUÉ AGREGA (no borra ni renombra nada):
--   1. La columna movimientos_stock.id_salida_manual: un mismo número para los renglones de una misma salida.
--      Así una salida de 3 insumos se ve como UNA fila en Movimientos de Stock. Vacía en todo lo que ya existe.
--   2. La función registrar_salida: guarda una salida de uno o varios insumos, todo o nada.
--
-- ORDEN: primero se corre este archivo y DESPUÉS se reinicia el servidor. Al revés, Movimientos de Stock da error,
--        porque el servidor nuevo pide una columna que todavía no existe.
-- Lo corre Mauri en el SQL Editor de Supabase. Se puede correr más de una vez.
-- El servidor viejo (Render, rama Rodriguez) no usa esta columna ni esta función: sigue igual.
--
-- EJEMPLO: "2 kg de carne, Vencido", con 5 kg en stock. El servidor ya pasó 2 kg a 2000 g y llama con:
--   p_id_usuario = el del token · p_motivo = 'Vencido' · p_items = [{ "id_insumo": 7, "cantidad": 2000 }]
--   → guarda una salida de 2000 g con motivo "Vencido" y deja el stock en 3000
--   → el disparador lotes_insumo_fifo descuenta 2000 g de los lotes, empezando por el que vence antes
--   → devuelve { "ok": true, "insumos": 1 }
--   Si solo hay 1500 g → { "ok": false, "error": "No alcanza ..." } y no guarda nada.
-- ============================================================================


-- 1. LA COLUMNA NUEVA
alter table movimientos_stock                          -- la libreta de insumos
  add column if not exists id_salida_manual uuid;      -- el número de la salida (vacío en lo demás). "if not exists": se puede correr dos veces

comment on column movimientos_stock.id_salida_manual is  -- el cartel de la columna (se lee en Supabase)
  'Paso 3 de Movimientos de Stock. El mismo número en todos los renglones de una salida manual (registrar_salida). Vacía en compras, producción, pedidos y salidas viejas.';


-- 2. LA FUNCIÓN
create or replace function registrar_salida(           -- crea la función (o la reemplaza)
  p_id_usuario uuid,                                   -- quién la registra: lo pone el servidor (sale del token)
  p_motivo     text,                                   -- el motivo, ya escrito por el servidor. Ej: "Vencido" u "Otro: se cayó"
  p_items      jsonb                                   -- la lista: [{ id_insumo, cantidad }], con la cantidad en la unidad del insumo
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_item           jsonb;                              -- un renglón de la lista
  v_id_malo        integer;                            -- id de un insumo que no existe
  v_faltante       record;                             -- datos de un insumo sin stock suficiente
  v_nombre         text;                               -- nombre de un insumo inactivo
  v_insumo         record;                             -- datos del insumo de un renglón
  v_id_salida      uuid;                               -- el número de esta salida, igual en todos sus renglones
begin                                                  -- empieza el código
  -- 1. Quién la registra (sale del token en el servidor; nunca debería faltar)
  if p_id_usuario is null then                         -- ¿falta el usuario? SÍ: vino vacío · NO: vino del token
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que registra la salida');  -- se corta acá
  end if;                                              -- fin del paso 1

  -- 2. El motivo: obligatorio y corto
  if p_motivo is null or trim(p_motivo) = '' or length(p_motivo) > 120 then  -- ¿vacío o muy largo? SÍ: "" · NO: "Vencido"
    return jsonb_build_object('ok', false, 'error', 'El motivo es inválido');  -- se corta acá
  end if;                                              -- fin del paso 2

  -- 3. p_items tiene que ser una lista con al menos un insumo. Son dos "if" separados: jsonb_array_length falla si no es una lista
  if p_items is null or jsonb_typeof(p_items) <> 'array' then  -- ¿no es una lista? SÍ: vacío o un texto · NO: [ ... ]
    return jsonb_build_object('ok', false, 'error', 'La lista de insumos es inválida');  -- se corta acá
  end if;                                              -- fin de "no es una lista"
  if jsonb_array_length(p_items) = 0 then              -- ¿la lista está vacía? SÍ: [] · NO: tiene un insumo
    return jsonb_build_object('ok', false, 'error', 'Cargá al menos un insumo');  -- se corta acá
  end if;                                              -- fin del paso 3

  -- 4. Revisar renglón por renglón: id_insumo entero y cantidad mayor a 0
  for v_item in select * from jsonb_array_elements(p_items)  -- recorre los renglones, uno por vuelta
  loop                                                 -- empieza la vuelta
    if jsonb_typeof(v_item) <> 'object'                -- ¿el renglón no es un objeto...
       or coalesce(jsonb_typeof(v_item->'id_insumo'), '') <> 'number'  -- ...o el insumo no es un número...
       or coalesce(jsonb_typeof(v_item->'cantidad'), '') <> 'number' then  -- ...o la cantidad no es un número? SÍ: "hola" · NO: 2000
      return jsonb_build_object('ok', false, 'error', 'Cada renglón tiene que tener un insumo y una cantidad');  -- se corta acá
    end if;                                            -- fin del control de tipos

    if (v_item->>'id_insumo')::numeric <> trunc((v_item->>'id_insumo')::numeric) then  -- ¿el id tiene decimales? SÍ: 4.5 · NO: 4
      return jsonb_build_object('ok', false, 'error', 'El id del insumo es inválido');  -- se corta acá
    end if;                                            -- fin del control del id

    if (v_item->>'cantidad')::numeric <= 0 then        -- ¿la cantidad es 0 o menos? SÍ: -5 · NO: 2000
      return jsonb_build_object('ok', false, 'error', 'Las cantidades tienen que ser mayores a 0');  -- se corta acá
    end if;                                            -- fin del control de la cantidad
  end loop;                                            -- fin del paso 4

  -- 5. Un insumo no puede venir dos veces: se saltearía el control de stock (2 renglones de 3 kg con 5 kg en stock)
  if (select count(*) from jsonb_array_elements(p_items) x)  -- ¿cuántos renglones hay...
     <> (select count(distinct (x->>'id_insumo')::integer) from jsonb_array_elements(p_items) x) then  -- ...distinto de cuántos insumos? SÍ: el 7 dos veces · NO: 7 y 8
    return jsonb_build_object('ok', false, 'error', 'Hay un insumo repetido');  -- se corta acá
  end if;                                              -- fin del paso 5

  -- 6. Bloquear los insumos de la lista, ordenados por id: dos salidas a la vez no se pisan el stock ni se traban
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from insumos                                      -- de la tabla de insumos
    where id in (select (x->>'id_insumo')::integer from jsonb_array_elements(p_items) x)  -- los de la lista
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado hasta que termine la transacción

  -- 7. Cada insumo tiene que existir...
  select (x->>'id_insumo')::integer                    -- el id del renglón
    into v_id_malo                                     -- se guarda en v_id_malo
    from jsonb_array_elements(p_items) x               -- los renglones de la lista
    left join insumos i on i.id = (x->>'id_insumo')::integer  -- cada uno con su insumo (si tiene)
   where i.id is null                                  -- se queda con los que no encontraron insumo
   limit 1;                                            -- alcanza con el primero

  if found then                                        -- ¿hay alguno que no existe? SÍ: id 999 · NO: todos existen
    return jsonb_build_object('ok', false, 'error', 'El insumo ' || v_id_malo || ' no existe');  -- se corta acá
  end if;                                              -- fin de "no existe"

  -- ...estar activo...
  select i.nombre                                      -- el nombre del insumo
    into v_nombre                                      -- se guarda en v_nombre
    from jsonb_array_elements(p_items) x               -- los renglones de la lista
    join insumos i on i.id = (x->>'id_insumo')::integer  -- cada uno con su insumo
   where i.activo is not true                          -- se queda con los que no están activos
   order by i.nombre                                   -- en orden de nombre
   limit 1;                                            -- alcanza con el primero

  if found then                                        -- ¿hay alguno inactivo? SÍ: un insumo desactivado · NO: todos activos
    return jsonb_build_object('ok', false, 'error', 'El insumo "' || v_nombre || '" no está activo');  -- se corta acá
  end if;                                              -- fin de "no está activo"

  -- ...y tener stock suficiente. Se mira con el candado puesto: nadie lo puede cambiar entre este control y el descuento
  select i.nombre,                                     -- el nombre del insumo
         i.unidad_medida,                              -- su unidad
         coalesce(i.stock_actual, 0) as hay,           -- cuánto hay (vacío = 0)
         (x->>'cantidad')::numeric as pide             -- cuánto quieren sacar
    into v_faltante                                    -- se guarda en v_faltante
    from jsonb_array_elements(p_items) x               -- los renglones de la lista
    join insumos i on i.id = (x->>'id_insumo')::integer  -- cada uno con su insumo
   where (x->>'cantidad')::numeric > coalesce(i.stock_actual, 0)  -- se queda con los que piden más de lo que hay
   order by i.nombre                                   -- en orden de nombre
   limit 1;                                            -- alcanza con el primero

  if found then                                        -- ¿alguno pide de más? SÍ: 2000 con 1500 en stock · NO: a todos les alcanza
    return jsonb_build_object('ok', false, 'error',    -- se corta acá, sin haber guardado nada. Ej de mensaje:
      'No alcanza "' || v_faltante.nombre || '": hay ' || trim_scale(v_faltante.hay) || ' ' || v_faltante.unidad_medida  -- No alcanza "Carne": hay 1500 g
      || ' y querés sacar ' || trim_scale(v_faltante.pide) || ' ' || v_faltante.unidad_medida);  -- y querés sacar 2000 g
  end if;                                              -- fin del paso 7

  -- 8. El número de esta salida: el mismo en todos sus renglones
  v_id_salida := gen_random_uuid();                    -- un número único, que arma la base

  -- 9. Por cada renglón: una SALIDA en movimientos_stock y restar del stock
  for v_item in select * from jsonb_array_elements(p_items)  -- recorre los renglones, uno por vuelta
  loop                                                 -- empieza la vuelta
    select id, unidad_medida                           -- número y unidad del insumo
      into v_insumo                                    -- se guardan en v_insumo
      from insumos                                     -- de la tabla de insumos
     where id = (v_item->>'id_insumo')::integer;       -- el insumo de este renglón

    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_salida_manual)  -- libreta de insumos, columnas:
    values (                                           -- los valores, en el mismo orden:
      v_insumo.id,                                     -- qué insumo
      'salida',                                        -- salió
      (v_item->>'cantidad')::numeric,                  -- cuánto (ej: 2000)
      v_insumo.unidad_medida,                          -- en qué unidad (ej: g)
      trim(p_motivo),                                  -- por qué (ej: "Vencido")
      now(),                                           -- la hora real: así sale primera en Movimientos de Stock
      p_id_usuario,                                    -- quién la registró
      v_id_salida                                      -- de qué salida es este renglón
    );                                                 -- fin de los valores

    -- Restar del stock. El disparador lotes_insumo_fifo descuenta de los lotes, primero el que vence antes
    update insumos                                     -- tabla de insumos
       set stock_actual = coalesce(stock_actual, 0) - (v_item->>'cantidad')::numeric  -- ej: 5000 − 2000 = 3000
     where id = v_insumo.id;                           -- solo este insumo
  end loop;                                            -- fin del paso 9

  return jsonb_build_object('ok', true, 'insumos', jsonb_array_length(p_items));  -- salió bien: cuántos insumos salieron
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: se le saca el permiso a los de afuera y queda solo service_role (server.js)
revoke execute on function registrar_salida(uuid, text, jsonb) from public, anon, authenticated;  -- nadie de afuera la llama directo
grant  execute on function registrar_salida(uuid, text, jsonb) to service_role;                   -- solo el servidor
