-- =====================================================
-- PROBAR crear_pedido_combos SIN CREAR PEDIDOS
-- Correr DESPUÉS de sql/pedido_combos_funciones.sql.
--
-- Todas las pruebas de abajo tienen que FALLAR en la PARTE 1 (los controles):
-- devuelven { "ok": false, "error": "..." } y NO guardan nada en la base.
-- Usan el combo de prueba 1 ("PRUEBA Mantenimiento x10") y el usuario "Consumidor Final".
--
-- Cómo usarlo: Supabase → SQL Editor → pegá SOLO la consulta de "PRUEBAS QUE TIENEN QUE FALLAR"
-- (hasta el primer punto y coma) → "Run". Sale una tabla: comparás la columna "esperado"
-- con el "error" de la columna "resultado". Tienen que decir lo mismo.
--
-- Al final está la sección HELADERA (paso H6): 6A, 6B y 6C. 6A y 6B sí crean pedidos, pero
-- adentro de un bloque que termina con un ERROR A PROPÓSITO: Postgres deshace todo y no queda nada.
-- =====================================================

-- -----------------------------------------------------
-- PRUEBAS QUE TIENEN QUE FALLAR (no guardan nada)
-- -----------------------------------------------------
with ids as (                                          -- ids REALES de los platos, buscados por nombre
  select
    (select cp.id_producto                             -- el id de "fideos"...
       from combo_productos cp                         -- ...en el menú de los combos
       join productos p on p.id = cp.id_producto       -- con su plato
      where cp.id_combo = 1                            -- ...del combo de prueba
        and p.nombre = 'fideos')                as fideos,          -- se llama "fideos"
    (select p.id                                       -- un plato activo que NO está en el menú del combo 1
       from productos p                                -- de todos los platos
      where p.activo = true                            -- activo
        and p.id not in (select id_producto from combo_productos where id_combo = 1)  -- fuera del menú
      order by p.id                                    -- el de número más bajo
      limit 1)                                  as fuera_del_menu   -- (si no hay ninguno, la prueba 6 da "datos inválidos")
),
casos (orden, prueba, esperado, combos) as (           -- cada prueba: número, qué prueba, qué error se espera y los combos que se mandan
  select 1, 'Sin combos',                              -- lista vacía
         'El pedido tiene que tener entre 1 y 10 combos',
         '[]'::jsonb
  union all                                            -- junta con la prueba siguiente
  select 2, 'Combo que no existe',                     -- combo 999999
         'El combo 999999 no existe o ya no está disponible',
         jsonb_build_array(jsonb_build_object('id_combo', 999999,
           'platos', jsonb_build_array(jsonb_build_object('producto_id', fideos, 'cantidad', 10))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 3, 'id_combo con texto',                      -- id_combo = "abc"
         'Hay un combo con datos inválidos',
         jsonb_build_array(jsonb_build_object('id_combo', 'abc',
           'platos', jsonb_build_array(jsonb_build_object('producto_id', fideos, 'cantidad', 10))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 4, 'Suma 9 de 10',                            -- 9 fideos en un combo de 10
         '«PRUEBA Mantenimiento x10» tiene 9 viandas y tienen que ser 10',
         jsonb_build_array(jsonb_build_object('id_combo', 1,
           'platos', jsonb_build_array(jsonb_build_object('producto_id', fideos, 'cantidad', 9))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 5, 'Cantidad con decimales',                  -- 3.5 fideos
         'Hay una cantidad inválida en «PRUEBA Mantenimiento x10»',
         jsonb_build_array(jsonb_build_object('id_combo', 1,
           'platos', jsonb_build_array(jsonb_build_object('producto_id', fideos, 'cantidad', 3.5))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 6, 'Plato fuera del menú',                    -- 1 plato que no está en el menú + 9 fideos
         'El plato «(nombre del plato)» no está en el menú de «PRUEBA Mantenimiento x10» o ya no está disponible',
         jsonb_build_array(jsonb_build_object('id_combo', 1,
           'platos', jsonb_build_array(
             jsonb_build_object('producto_id', fuera_del_menu, 'cantidad', 1),
             jsonb_build_object('producto_id', fideos, 'cantidad', 9))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 7, 'Texto personalizado vacío',               -- 9 fideos + 1 fideos con texto "   "
         'El texto personalizado de «fideos» no puede estar vacío',
         jsonb_build_array(jsonb_build_object('id_combo', 1,
           'platos', jsonb_build_array(
             jsonb_build_object('producto_id', fideos, 'cantidad', 9),
             jsonb_build_object('producto_id', fideos, 'cantidad', 1, 'personalizado', '   '))))
    from ids
  union all                                            -- junta con la prueba siguiente
  select 8, 'Texto personalizado de 151',              -- 9 fideos + 1 fideos con 151 letras
         'El texto personalizado de «fideos» admite hasta 150 caracteres',
         jsonb_build_array(jsonb_build_object('id_combo', 1,
           'platos', jsonb_build_array(
             jsonb_build_object('producto_id', fideos, 'cantidad', 9),
             jsonb_build_object('producto_id', fideos, 'cantidad', 1, 'personalizado', repeat('x', 151)))))
    from ids
)
select orden,                                          -- número de prueba
       prueba,                                         -- qué se prueba
       esperado,                                       -- el error que tiene que aparecer
       crear_pedido_combos(                            -- se llama a la función con:
         'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid, -- usuario "Consumidor Final" (el mismo que usa server.js)
         'PRUEBA – NO PREPARAR',                       -- nombre del cliente
         'Prueba',                                     -- dirección
         '0',                                          -- teléfono
         '',                                           -- email
         current_date + 7,                             -- fecha de entrega (la base no la controla: lo hace el servidor)
         'Efectivo',                                   -- método de pago
         'Retiro en local',                            -- tipo de entrega
         null,                                         -- barrio
         '',                                           -- observaciones
         combos                                        -- los combos de cada prueba
       ) as resultado                                  -- lo que devolvió: tiene que ser { "ok": false, "error": ... }
  from casos                                           -- una fila por prueba
 order by orden;                                       -- en orden


-- -----------------------------------------------------
-- CASO BUENO (CREA UN PEDIDO REAL) — está desactivado a propósito
-- Crea el pedido "PRUEBA – NO PREPARAR" con 8 fideos + 2 fideos "sin sal" del combo 1.
-- Tiene que devolver { "ok": true, "id_pedido": ..., "total": 137000, ... }.
-- El pedido APARECE en Consultar Pedidos: anulalo enseguida con "Anular" (PIN).
-- Desde H6 SÍ saca de la heladera: los 8 fideos normales bajan de stock_heladera (los 2 "sin sal" no).
-- Al anularlo con "Anular" vuelven a la heladera.
-- Para correrlo: sacale el "-- " del principio a cada línea de abajo, seleccioná solo esas líneas y "Run".
-- Si preferís no crear pedidos de verdad, usá 6A y 6B (más abajo): se deshacen solas.
-- -----------------------------------------------------
-- select crear_pedido_combos(
--   'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid,
--   'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7, 'Efectivo', 'Retiro en local', null, '',
--   jsonb_build_array(jsonb_build_object('id_combo', 1, 'platos', jsonb_build_array(
--     jsonb_build_object('producto_id', (select cp.id_producto from combo_productos cp join productos p on p.id = cp.id_producto
--                                         where cp.id_combo = 1 and p.nombre = 'fideos'), 'cantidad', 8),
--     jsonb_build_object('producto_id', (select cp.id_producto from combo_productos cp join productos p on p.id = cp.id_producto
--                                         where cp.id_combo = 1 and p.nombre = 'fideos'), 'cantidad', 2, 'personalizado', 'sin sal')
--   )))
-- );


-- =====================================================
-- HELADERA (paso H6). Correr DESPUÉS de instalar sql/pedido_combos_funciones.sql con la heladera.
-- Cada parte se corre SOLA: seleccioná desde su título hasta su punto y coma final y "Run".
-- 6A y 6B crean pedidos DE VERDAD adentro de un bloque que termina con un ERROR A PROPÓSITO:
-- Postgres deshace todo (pedidos, ventas y heladera). El resultado se lee en el mensaje del error.
-- Aunque las corrieras antes de instalar H6, tampoco quedaría nada guardado.
-- Usan "fideos" del combo de prueba 1 y el usuario "Consumidor Final" (el de la web sin login).
-- Si fideos tiene 90 viandas o más, 6A no puede fallar: avisame.
-- =====================================================

-- -----------------------------------------------------
-- 6A. CASOS QUE FALLAN POR LA HELADERA (no queda nada guardado)
-- Tiene que salir un ERROR en rojo "FIN DE LA PRUEBA (no quedó nada guardado)" con "coincide: sí" en los 2:
--   1) 10 combos de 10 fideos (100 normales) → "No quedan suficientes viandas de «fideos»: pediste 100 y quedan 71"
--   2) 10 combos de 9 fideos + 1 fideos "sin sal" → "...pediste 90 y quedan 71" (los personalizados no cuentan)
-- Cada combo por separado entraría (10 o 9 de 71): falla porque se suman TODOS los combos del pedido.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_cliente    uuid := 'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid;  -- "Consumidor Final" (el que compra, como en la web)
  v_fideos     integer;                                -- número del plato "fideos"
  v_cantidad   integer;                                -- viandas del combo de prueba (ej: 10)
  v_heladera   integer;                                -- viandas de fideos que hay hoy (ej: 71)
  v_combos_1   jsonb;                                  -- caso 1: 10 combos llenos de fideos normales
  v_combos_2   jsonb;                                  -- caso 2: 10 combos con 9 normales + 1 "sin sal"
  v_r1         jsonb;                                  -- lo que devolvió el caso 1
  v_r2         jsonb;                                  -- lo que devolvió el caso 2
  v_esperado_1 text;                                   -- el error que tiene que dar el caso 1
  v_esperado_2 text;                                   -- el error que tiene que dar el caso 2
  v_coincide_1 text := 'NO';                           -- "sí" si el caso 1 dio el error esperado
  v_coincide_2 text := 'NO';                           -- "sí" si el caso 2 dio el error esperado
begin                                                  -- empieza el bloque
  select cp.id_producto                                -- busca el número de "fideos"...
    into v_fideos                                      -- ...y lo guarda en v_fideos
    from combo_productos cp                            -- en el menú de los combos
    join productos p on p.id = cp.id_producto          -- con su plato
   where cp.id_combo = 1                               -- del combo de prueba
     and p.nombre = 'fideos';                          -- que se llama "fideos"

  select cantidad into v_cantidad                      -- cuántas viandas tiene el combo de prueba...
    from combos where id = 1;                          -- ...el combo 1 (ej: 10)

  select stock_heladera into v_heladera                -- cuántas hay hoy...
    from productos where id = v_fideos;                -- ...de fideos (ej: 71)

  -- Caso 1: el combo 1 repetido 10 veces, cada uno con todas sus viandas de fideos normales.
  -- generate_series(1, 10) da 10 filas (1, 2, ..., 10): sirve para repetir el combo 10 veces,
  -- y jsonb_agg junta esas 10 filas en una sola lista. Ej: → [ {combo 1}, {combo 1}, ... (10 veces) ]
  select jsonb_agg(jsonb_build_object(                 -- la lista de combos...
           'id_combo', 1,                              -- ...el combo 1...
           'platos', jsonb_build_array(jsonb_build_object(  -- ...con un solo plato:
             'producto_id', v_fideos,                  -- fideos
             'cantidad',    v_cantidad))))             -- todas las viandas del combo (ej: 10)
    into v_combos_1                                    -- ...guardada en v_combos_1
    from generate_series(1, 10);                       -- 10 veces

  -- Caso 2: igual, pero cada combo con 1 fideos "sin sal" (ej: 9 normales + 1 personalizado)
  select jsonb_agg(jsonb_build_object(                 -- la lista de combos...
           'id_combo', 1,                              -- ...el combo 1...
           'platos', jsonb_build_array(                -- ...con dos renglones:
             jsonb_build_object('producto_id', v_fideos, 'cantidad', v_cantidad - 1),  -- fideos normales (ej: 9)
             jsonb_build_object('producto_id', v_fideos, 'cantidad', 1,                -- 1 fideos...
                                'personalizado', 'sin sal'))))                         -- ...personalizado
    into v_combos_2                                    -- ...guardada en v_combos_2
    from generate_series(1, 10);                       -- 10 veces

  v_esperado_1 := 'No quedan suficientes viandas de «fideos»: pediste ' || (10 * v_cantidad)  -- ej: pediste 100...
                  || ' y quedan ' || v_heladera;       -- ...y quedan 71
  v_esperado_2 := 'No quedan suficientes viandas de «fideos»: pediste ' || (10 * (v_cantidad - 1))  -- ej: pediste 90...
                  || ' y quedan ' || v_heladera;       -- ...y quedan 71

  v_r1 := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- caso 1...
                              'Efectivo', 'Retiro en local', null, 'PRUEBA H6 – se deshace sola', v_combos_1);  -- ...(mismos datos que las otras pruebas)
  v_r2 := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- caso 2...
                              'Efectivo', 'Retiro en local', null, 'PRUEBA H6 – se deshace sola', v_combos_2);  -- ...

  if v_r1 ->> 'error' = v_esperado_1 then v_coincide_1 := 'sí'; end if;  -- ¿el caso 1 dio el error esperado?
  if v_r2 ->> 'error' = v_esperado_2 then v_coincide_2 := 'sí'; end if;  -- ¿el caso 2 dio el error esperado?

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → 1) coincide: % · resultado: % · 2) coincide: % · resultado: %',  -- frena A PROPÓSITO...
    v_coincide_1, v_r1, v_coincide_2, v_r2;            -- ...mostrando lo que pasó; Postgres deshace todo el bloque
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- 6B. CASO DE MENTIRA: vende fideos de la heladera, anula y DESHACE todo
-- Crea 2 pedidos de verdad (adentro del bloque) y prueba 3 cosas:
--   A) [8 fideos + 2 fideos "sin sal"] + [10 fideos] → heladera 71 → 53 (salen 18: los "sin sal" no),
--      UN solo renglón "venta" −18 "Pedido #N" a nombre de Consumidor Final, y los 3 platos:
--      8 (de heladera 8, listo sí) | 2 sin sal (de heladera 0, listo no) | 10 (de heladera 10, listo sí).
--      La cocina ve 1 renglón: los 2 "sin sal".
--   B) 10 combos de 10 fideos "sin sal" (100 personalizados) → se puede aunque la heladera no alcance:
--      la heladera sigue en 53 y no hay ninguna venta de ese pedido.
--   C) anular el pedido A (la función de H4) → vuelven las 18 → heladera 71.
-- Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)".
-- Lo único que no vuelve atrás son los números: se saltean 2 números de pedido (y algunos del cuaderno).
-- Lo comprobás con 6C.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_cliente   uuid := 'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid;  -- "Consumidor Final" (el que compra)
  v_admin     uuid := 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid;  -- tu usuario admin (el que anula)
  v_fideos    integer;                                 -- número del plato "fideos"
  v_cantidad  integer;                                 -- viandas del combo de prueba (ej: 10)
  v_antes     integer;                                 -- heladera de fideos al empezar (ej: 71)
  v_combos_a  jsonb;                                   -- lo que compra el pedido A
  v_combos_b  jsonb;                                   -- lo que compra el pedido B
  v_a         jsonb;                                   -- lo que devolvió crear el pedido A
  v_b         jsonb;                                   -- lo que devolvió crear el pedido B
  v_id_a      integer;                                 -- número del pedido A
  v_id_b      integer;                                 -- número del pedido B
  v_h_a       integer;                                 -- heladera después de A (ej: 53)
  v_h_b       integer;                                 -- heladera después de B (ej: 53)
  v_venta_a   text;                                    -- los renglones "venta" de A (tiene que ser uno solo)
  v_platos_a  text;                                    -- los platos de A, con su heladera y si están listos
  v_cocina_a  integer;                                 -- cuántos renglones de A ve la cocina (los no listos)
  v_ventas_b  integer;                                 -- cuántos renglones "venta" tiene B (tiene que ser 0)
  v_anular    jsonb;                                   -- lo que devolvió anular A
  v_h_final   integer;                                 -- heladera después de anular A (ej: 71)
begin                                                  -- empieza el bloque
  select cp.id_producto                                -- busca el número de "fideos"...
    into v_fideos                                      -- ...y lo guarda en v_fideos
    from combo_productos cp                            -- en el menú de los combos
    join productos p on p.id = cp.id_producto          -- con su plato
   where cp.id_combo = 1                               -- del combo de prueba
     and p.nombre = 'fideos';                          -- que se llama "fideos"

  select cantidad into v_cantidad                      -- cuántas viandas tiene el combo de prueba...
    from combos where id = 1;                          -- ...el combo 1 (ej: 10)

  select stock_heladera into v_antes                   -- cuántas hay ANTES...
    from productos where id = v_fideos;                -- ...de fideos (ej: 71)

  -- A) PEDIDO A: un combo con 8 fideos + 2 "sin sal", y otro combo con 10 fideos
  v_combos_a := jsonb_build_array(                     -- la lista de combos del pedido A:
    jsonb_build_object('id_combo', 1, 'platos', jsonb_build_array(           -- combo 1:
      jsonb_build_object('producto_id', v_fideos, 'cantidad', v_cantidad - 2),  -- 8 fideos normales
      jsonb_build_object('producto_id', v_fideos, 'cantidad', 2,                -- 2 fideos...
                         'personalizado', 'sin sal'))),                         -- ...personalizados
    jsonb_build_object('id_combo', 1, 'platos', jsonb_build_array(           -- combo 2:
      jsonb_build_object('producto_id', v_fideos, 'cantidad', v_cantidad))));   -- 10 fideos normales

  v_a := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- crea el pedido A...
                             'Efectivo', 'Retiro en local', null, 'PRUEBA H6 – se deshace sola', v_combos_a);  -- ...
  if not coalesce((v_a ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido A → %', v_a;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"
  v_id_a := (v_a ->> 'id_pedido')::integer;            -- el número del pedido A

  select stock_heladera into v_h_a                     -- heladera después de A (ej: 71 − 18 = 53)...
    from productos where id = v_fideos;                -- ...de fideos

  select string_agg(format('tipo %s · cantidad %s · motivo "%s" · usuario %s',  -- cada renglón del cuaderno de A...
                           mov.tipo, mov.cantidad, mov.motivo,                  -- ...con su tipo, cantidad y motivo...
                           trim(coalesce(usu.nombre, '') || ' ' || coalesce(usu.apellido, ''))),  -- ...y a nombre de quién
                    ' | ' order by mov.id)             -- ...todos juntos, separados por " | "
    into v_venta_a                                     -- ...guardados en v_venta_a
    from movimientos_viandas mov                       -- del cuaderno
    join usuarios usu on usu.id = mov.id_usuario       -- con el usuario que lo firmó
   where mov.id_pedido = v_id_a;                       -- del pedido A

  select string_agg(format('%s%s (de heladera %s, listo %s)',  -- cada plato de A: "8 (de heladera 8, listo sí)"...
                           det.cantidad,                        -- ...cuántas viandas...
                           coalesce(' ' || det.observaciones_plato, ''),  -- ...su texto si es personalizado ("sin sal")...
                           det.cantidad_de_heladera,            -- ...cuántas salen de la heladera...
                           case when det.listo then 'sí' else 'no' end),  -- ...y si nace listo
                    ' | ' order by det.id)             -- ...todos juntos, separados por " | "
    into v_platos_a                                    -- ...guardados en v_platos_a
    from pedido_detalles det                           -- de los platos de los pedidos
   where det.id_pedido = v_id_a;                       -- del pedido A

  select count(*) into v_cocina_a                      -- cuántos renglones ve la cocina...
    from pedido_detalles                               -- ...de los platos...
   where id_pedido = v_id_a                            -- ...del pedido A...
     and listo = false;                                -- ...que no están listos (tiene que dar 1)

  -- B) PEDIDO B: 10 combos llenos de fideos "sin sal" (100 personalizados, más de los que hay)
  select jsonb_agg(jsonb_build_object(                 -- la lista de combos...
           'id_combo', 1,                              -- ...el combo 1...
           'platos', jsonb_build_array(jsonb_build_object(  -- ...con un solo renglón:
             'producto_id',   v_fideos,                -- fideos
             'cantidad',      v_cantidad,              -- todas las viandas del combo (ej: 10)
             'personalizado', 'sin sal'))))            -- personalizados
    into v_combos_b                                    -- ...guardada en v_combos_b
    from generate_series(1, 10);                       -- 10 veces (ver 6A)

  v_b := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- crea el pedido B...
                             'Efectivo', 'Retiro en local', null, 'PRUEBA H6 – se deshace sola', v_combos_b);  -- ...
  if not coalesce((v_b ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido B → %', v_b;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"
  v_id_b := (v_b ->> 'id_pedido')::integer;            -- el número del pedido B

  select stock_heladera into v_h_b                     -- heladera después de B (tiene que seguir igual)...
    from productos where id = v_fideos;                -- ...de fideos
  select count(*) into v_ventas_b                      -- cuántos renglones del cuaderno...
    from movimientos_viandas                           -- ...del cuaderno...
   where id_pedido = v_id_b;                           -- ...tiene el pedido B (tiene que dar 0)

  -- C) ANULAR A (la función de H4): tienen que volver las 18
  v_anular := anular_pedido_con_devolucion(v_id_a, v_admin);  -- anula el pedido A
  select stock_heladera into v_h_final                 -- heladera al final (ej: 53 + 18 = 71)...
    from productos where id = v_fideos;                -- ...de fideos

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → heladera antes: % · A) pedido #% → heladera % · venta: % · platos: % · la cocina ve: % renglón(es) · B) pedido #% (100 "sin sal") → heladera % · ventas de B: % · C) anular A: % → heladera %',  -- frena A PROPÓSITO...
    v_antes,                                           -- ...mostrando: la heladera al empezar,
    v_id_a, v_h_a, v_venta_a, v_platos_a, v_cocina_a,  -- A) pedido, heladera, venta, platos y lo que ve la cocina,
    v_id_b, v_h_b, v_ventas_b,                         -- B) pedido, heladera y ventas,
    v_anular, v_h_final;                               -- C) resultado de anular y heladera final. Postgres deshace todo el bloque
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- 6C. COMPROBAR que 6A y 6B no dejaron nada (solo lee)
-- "heladera_fideos" tiene que ser la de "antes" en 6B (ej: 71), y las otras dos columnas tienen que dar 0.
-- (ventas_y_devoluciones da 0 solo mientras no hayas hecho pedidos de combos de verdad desde la web.)
-- -----------------------------------------------------
select pro.stock_heladera                as heladera_fideos,     -- cuántas hay ahora (igual que "antes" en 6B)
       (select count(*)                                -- cuántos pedidos...
          from pedidos                                 -- ...de la tabla de pedidos...
         where observaciones = 'PRUEBA H6 – se deshace sola') as pedidos_de_prueba,  -- ...son de 6A o 6B (tiene que dar 0)
       (select count(*)                                -- cuántos renglones...
          from movimientos_viandas                     -- ...del cuaderno...
         where tipo in ('venta', 'devolucion')) as ventas_y_devoluciones  -- ...son ventas o devoluciones (tiene que dar 0)
  from productos pro                                   -- de la tabla de platos
 where pro.id = (select cp.id_producto                 -- solo fideos:
                   from combo_productos cp             -- buscado en el menú de los combos
                   join productos pr on pr.id = cp.id_producto  -- con su plato
                  where cp.id_combo = 1                -- del combo de prueba
                    and pr.nombre = 'fideos');         -- que se llama "fideos"
