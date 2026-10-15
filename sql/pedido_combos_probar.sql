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
-- No toca la heladera (todavía no está conectada), así que no hay nada más que deshacer.
-- Para correrlo: sacale el "-- " del principio a cada línea de abajo, seleccioná solo esas líneas y "Run".
-- Si preferís no crear pedidos ahora, lo probamos de punta a punta en el paso 13.
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
