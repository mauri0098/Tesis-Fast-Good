-- =====================================================
-- REVISAR LA HELADERA ANTES DE REHACERLA (SOLO LECTURA) — paso H0
-- Esta consulta NO cambia nada: es un solo SELECT, que lee y muestra.
-- Responde 6 preguntas antes de escribir las funciones nuevas:
--   1. ¿Existe orden_produccion_detalles.id_pedido_detalle? ¿Hay renglones pendientes con ese dato?
--   2. ¿Qué funciones de la heladera están instaladas, qué reciben y quién las puede ejecutar?
--   3. ¿El número de la heladera de cada plato cuadra con la suma de su cuaderno?
--   4. ¿Cuántos renglones hay de cada tipo en el cuaderno (movimientos_viandas)?
--   5. ¿Hay pedidos de combos abiertos (estados 1, 2 o 3)?
--   6. ¿Qué platos activos no tienen receta?
--
-- Cómo usarla:
--   1. Supabase → SQL Editor → New query.
--   2. Pegá TODO este archivo y tocá "Run".
--   3. Sale UNA sola tabla. Copiala entera ("Copy as CSV" o "Copy as Markdown") y pasámela.
--   Si sale un error, pasame el mensaje.
--
-- Columnas del resultado:
--   consulta → número de la pregunta (1 a 6), para que salgan agrupadas
--   seccion  → qué se está mirando (en la 3, si cuadra o no)
--   nombre   → de qué cosa es la fila (tabla, función, plato, tipo, pedido…)
--   detalle  → la información en sí
--
-- Cómo se lee una columna que quizás no existe (en la 1 y en la 4):
--   to_jsonb(fila) ->> 'columna' convierte la fila en un JSON y lee esa columna como texto.
--   Si la columna no existe, da vacío en vez de error. Así la consulta anda
--   aunque id_pedido_detalle o id_lote no estén en la base.
-- =====================================================

-- 1a) RESUMEN de id_pedido_detalle en los pedidos a cocina
select 1                                                                  as consulta,  -- pregunta 1
       'a. resumen'::text                                                 as seccion,   -- primero el resumen
       'orden_produccion_detalles'::text                                  as nombre,    -- la tabla que se mira
       format('existe la columna id_pedido_detalle: %s · renglones: %s · pendientes: %s · con id_pedido_detalle: %s · pendientes con id_pedido_detalle: %s',  -- arma el texto con los 5 datos
              case when exists (                                                         -- ¿está la columna en el catálogo?
                          select 1                                                       -- (no importa qué devuelve, solo si encuentra algo)
                            from information_schema.columns col                          -- catálogo de columnas de la base
                           where col.table_schema = 'public'                             -- de las tablas de la app
                             and col.table_name   = 'orden_produccion_detalles'          -- de esta tabla
                             and col.column_name  = 'id_pedido_detalle'                  -- con este nombre
                        )                                                                -- fin del "exists"
                   then 'sí'                                                             -- la encontró
                   else 'no'                                                             -- no está
              end,                                                                       -- fin del "case"
              count(*),                                                                  -- todos los renglones
              count(*) filter (where not det.hecho),                                     -- solo los que todavía no están hechos
              count(*) filter (where to_jsonb(det) ->> 'id_pedido_detalle' is not null), -- solo los que tienen el dato viejo lleno
              count(*) filter (where to_jsonb(det) ->> 'id_pedido_detalle' is not null   -- los que tienen el dato viejo lleno...
                                 and not det.hecho))                                     -- ...y además están pendientes
                                                                          as detalle    -- todo junto, en un texto
  from orden_produccion_detalles det                                      -- los platos de todos los pedidos a cocina

union all                                                                 -- junta con la parte siguiente

-- 1b) Los renglones que tienen id_pedido_detalle lleno (si no hay ninguno, no sale ninguna fila)
select 1,                                                                 -- pregunta 1
       'b. renglón con id_pedido_detalle',                                -- qué se mira
       'renglón ' || det.id,                                              -- el número del renglón
       format('pedido a cocina #%s · plato: %s · cantidad: %s · hecho: %s · id_pedido_detalle: %s · pedido del cliente: %s',  -- arma el texto
              det.id_orden_produccion,                                    -- de qué pedido a cocina es
              pro.nombre,                                                 -- el plato
              det.cantidad,                                               -- cuántas viandas
              case when det.hecho then 'sí' else 'no' end,                -- si ya está hecho
              to_jsonb(det) ->> 'id_pedido_detalle',                      -- el dato viejo
              pdet.id_pedido)                                             -- el pedido del cliente al que apunta (vacío si no lo encuentra)
  from orden_produccion_detalles det                                      -- los platos de los pedidos a cocina
  join productos pro                                                      -- con su plato
    on pro.id = det.id_producto                                           -- unidos por el número de plato
  left join pedido_detalles pdet                                          -- con el renglón del pedido del cliente, si lo encuentra
         on pdet.id = (to_jsonb(det) ->> 'id_pedido_detalle')::integer    -- el dato viejo, pasado a número
 where to_jsonb(det) ->> 'id_pedido_detalle' is not null                  -- solo los que tienen el dato lleno

union all                                                                 -- junta con la consulta siguiente

-- 2) FUNCIONES DE LA HELADERA: si están instaladas, qué reciben y quién las puede ejecutar.
--    Las 3 últimas de la lista son las nuevas: todavía NO tendrían que estar.
select 2,                                                                 -- pregunta 2
       'funcion',                                                         -- qué se mira
       esperada.nombre,                                                   -- el nombre que se busca
       case when fun.oid is null                                          -- ¿no la encontró?
            then 'NO está instalada'                                      -- no existe en la base
            else format('recibe: (%s) · anon la puede ejecutar: %s · authenticated la puede ejecutar: %s · comentario: %s',  -- arma el texto
                        pg_get_function_identity_arguments(fun.oid),      -- los tipos de datos que recibe, en orden
                        case when has_function_privilege('anon', fun.oid, 'execute')           -- ¿la web sin login la puede llamar directo?
                             then 'SÍ' else 'no' end,                                          -- tiene que decir "no"
                        case when has_function_privilege('authenticated', fun.oid, 'execute')  -- ¿un usuario de Supabase la puede llamar directo?
                             then 'SÍ' else 'no' end,                                          -- tiene que decir "no"
                        coalesce(obj_description(fun.oid, 'pg_proc'), '(sin comentario)'))     -- el comentario guardado en la base, si tiene
       end                                                                -- fin del "case"
  from (values ('aplicar_produccion_viandas'),                            -- la interna de producción (hoy la usa marcar_detalle_hecho)
               ('marcar_detalle_hecho'),                                  -- el "Hecho" de hoy
               ('registrar_descarte_vianda'),                             -- el "Descartar" de hoy
               ('registrar_tanda_viandas'),                               -- tanda suelta (nadie la usa)
               ('registrar_tanda_multiple'),                              -- tanda múltiple (nadie la usa)
               ('crear_orden_produccion'),                                -- el "Pedir a cocina" (queda igual)
               ('crear_pedido_combos'),                                   -- crear pedido de combos (ahí va VENDER)
               ('producir_viandas'),                                      -- NUEVA: no tendría que estar
               ('descartar_viandas'),                                     -- NUEVA: no tendría que estar
               ('anular_pedido_con_devolucion')                           -- NUEVA: no tendría que estar
       ) as esperada (nombre)                                             -- la lista se llama "esperada" y su columna "nombre"
  left join pg_proc fun                                                   -- catálogo de funciones ("left": la fila sale aunque no la encuentre)
         on fun.proname = esperada.nombre                                 -- misma función, por nombre
        and fun.pronamespace = 'public'::regnamespace                     -- y del esquema de la app (public)

union all                                                                 -- junta con la consulta siguiente

-- 3) ¿CUADRA? El número de la heladera de cada plato contra la suma de su cuaderno.
--    Salen solo los platos que tienen viandas o algún renglón en el cuaderno.
select 3,                                                                 -- pregunta 3
       case when pro.stock_heladera = coalesce(cua.suma, 0)               -- ¿el número es igual a la suma?
            then 'sí cuadra'                                              -- coinciden
            else 'NO cuadra'                                              -- no coinciden
       end,                                                               -- fin del "case"
       pro.nombre::text,                                                  -- el plato
       format('heladera: %s · suma del cuaderno: %s · diferencia: %s · plato activo: %s',  -- arma el texto
              pro.stock_heladera,                                         -- el número que guarda el plato
              coalesce(cua.suma, 0),                                      -- la suma de su cuaderno (0 si no tiene renglones)
              pro.stock_heladera - coalesce(cua.suma, 0),                 -- cuánto no explica el cuaderno
              case when pro.activo then 'sí' else 'no' end)               -- si el plato está activo
  from productos pro                                                      -- todos los platos
  left join (select mov.id_producto,                                      -- por cada plato...
                    sum(mov.cantidad) as suma                             -- ...la suma de sus renglones (+ entran, − salen)
               from movimientos_viandas mov                               -- el cuaderno de la heladera
              group by mov.id_producto                                    -- un resultado por plato
            ) cua                                                         -- este resumen se llama "cua" (cuaderno)
         on cua.id_producto = pro.id                                      -- unido con su plato
 where pro.stock_heladera <> 0                                            -- platos con viandas...
    or cua.suma is not null                                               -- ...o con algún renglón en el cuaderno

union all                                                                 -- junta con la consulta siguiente

-- 4) EL CUADERNO: cuántos renglones hay de cada tipo
select 4,                                                                 -- pregunta 4
       'tipo de renglón',                                                 -- qué se mira
       mov.tipo::text,                                                    -- produccion, venta, devolucion, descarte o ajuste
       format('renglones: %s · viandas: %s · con pedido: %s · con id_lote: %s · primero: %s · último: %s',  -- arma el texto
              count(*),                                                   -- cuántos renglones de este tipo
              sum(mov.cantidad),                                          -- cuántas viandas suman (+ entran, − salen)
              count(mov.id_pedido),                                       -- cuántos tienen pedido (count de una columna no cuenta los vacíos)
              count(*) filter (where to_jsonb(mov) ->> 'id_lote' is not null),  -- cuántos tienen id_lote lleno
              to_char(min(mov.fecha) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'),  -- el más viejo, en hora de Argentina
              to_char(max(mov.fecha) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'))  -- el más nuevo, en hora de Argentina
  from movimientos_viandas mov                                            -- el cuaderno de la heladera
 group by mov.tipo                                                        -- una fila por tipo

union all                                                                 -- junta con la consulta siguiente

-- 5) PEDIDOS DE COMBOS ABIERTOS: los que tienen algún combo y están en 1, 2 o 3
select 5,                                                                 -- pregunta 5
       'pedido de combos abierto',                                        -- qué se mira
       'pedido #' || ped.id,                                              -- el número de pedido
       format('estado: %s · cliente: %s · entrega: %s · combos: %s · viandas: %s · de heladera: %s · personalizadas: %s',  -- arma el texto
              est.nombre,                                                 -- el nombre del estado
              ped.cliente_nombre,                                         -- a nombre de quién está
              to_char(ped.fecha_entrega, 'DD/MM/YYYY'),                   -- para qué día
              (select count(*)                                            -- cuántos combos tiene
                 from pedido_combos pco                                   -- los combos comprados
                where pco.id_pedido = ped.id),                            -- de este pedido
              (select coalesce(sum(det.cantidad), 0)                      -- cuántas viandas en total
                 from pedido_detalles det                                 -- los platos
                where det.id_pedido = ped.id),                            -- de este pedido
              (select coalesce(sum(coalesce(det.cantidad_de_heladera, 0)), 0)  -- cuántas salieron de la heladera (vacío cuenta como 0)
                 from pedido_detalles det                                 -- los platos
                where det.id_pedido = ped.id),                            -- de este pedido
              (select coalesce(sum(det.cantidad), 0)                      -- cuántas son personalizadas
                 from pedido_detalles det                                 -- los platos
                where det.id_pedido = ped.id                              -- de este pedido
                  and det.personalizado))                                 -- que son personalizados
  from pedidos ped                                                        -- todos los pedidos
  left join estados est                                                   -- con el nombre de su estado
         on est.id = ped.id_estado                                        -- unido por el número de estado
 where ped.id_estado in (1, 2, 3)                                         -- solo los abiertos: Registrado, En Preparación, Listo para Entregar
   and exists (select 1                                                   -- y que tengan al menos un combo
                 from pedido_combos pco                                   -- los combos comprados
                where pco.id_pedido = ped.id)                             -- de este pedido

union all                                                                 -- junta con la consulta siguiente

-- 6) PLATOS ACTIVOS SIN RECETA (sirven para probar PRODUCIR sin gastar insumos)
select 6,                                                                 -- pregunta 6
       'plato activo sin receta',                                         -- qué se mira
       pro.nombre::text,                                                  -- el plato
       format('id: %s · plan: %s · heladera: %s',                         -- arma el texto
              pro.id,                                                     -- su número
              coalesce(pla.nombre, '(sin plan)'),                         -- su plan, si tiene
              pro.stock_heladera)                                         -- cuántas viandas tiene hoy
  from productos pro                                                      -- todos los platos
  left join planes pla                                                    -- con su plan, si tiene
         on pla.id = pro.id_plan                                          -- unido por el número de plan
 where pro.activo = true                                                  -- solo los activos
   and not exists (select 1                                               -- y que no tengan ningún insumo en la receta
                     from producto_insumo rec                             -- las recetas
                    where rec.id_producto = pro.id)                       -- de este plato

-- Orden final: por pregunta, después por sección y por nombre
order by 1, 2, 3;                                                         -- 1 = consulta, 2 = seccion, 3 = nombre
