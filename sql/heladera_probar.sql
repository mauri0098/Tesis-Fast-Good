-- =====================================================
-- PROBAR LAS FUNCIONES DE LA HELADERA (sql/heladera.sql)
-- Cada paso agrega acá sus pruebas. Cada parte se corre SOLA: seleccioná con el mouse
-- desde su título hasta su punto y coma final y tocá "Run" (Supabase corre solo lo seleccionado).
--
-- Dos tipos de prueba:
--   - CASOS QUE FALLAN: la función frena ANTES de escribir ({ "ok": false }). No guardan nada.
--   - CASO DE MENTIRA: hace la acción de verdad, mira cómo quedó y termina con un ERROR
--     A PROPÓSITO. Con ese error, Postgres deshace todo: no queda nada guardado.
--     El resultado se lee EN EL MENSAJE DEL ERROR (sale en rojo: es lo esperado).
--
-- Datos que usan: el plato "fideos" del combo de prueba 1 y tu usuario admin
-- (d9b1ae00-…, el de docs/CONTEXTO-COMPLETO.md).
-- =====================================================


-- =====================================================
-- BLOQUE 1 — DESCARTAR (paso H2). Correr DESPUÉS del bloque 1 de sql/heladera.sql.
-- =====================================================

-- -----------------------------------------------------
-- 1A. CASOS QUE FALLAN (no guardan nada)
-- Sale una tabla de 8 filas: en la columna "coincide" tiene que decir "sí" en todas.
-- -----------------------------------------------------
with datos as (                                        -- datos REALES que usan las pruebas
  select (select cp.id_producto                        -- el número de "fideos"...
            from combo_productos cp                    -- ...buscado en el menú de los combos
            join productos p on p.id = cp.id_producto  -- con su plato
           where cp.id_combo = 1                       -- del combo de prueba
             and p.nombre = 'fideos')     as fideos,   -- que se llama "fideos"
         'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid as usuario  -- tu usuario admin
),                                                     -- fin de "datos"
casos (orden, prueba, esperado, id_producto, cantidad, id_usuario, motivo) as (  -- cada prueba: número, qué prueba, error esperado y lo que se manda
  select 1, 'Cantidad 0',                              -- tirar 0 viandas
         'La cantidad tiene que ser un número entero mayor a 0',  -- error esperado
         fideos, 0, usuario, 'prueba'                  -- lo que se manda: plato, cantidad, usuario, motivo
    from datos                                         -- (de "datos" salen fideos y usuario)
  union all                                            -- junta con la prueba siguiente
  select 2, 'Cantidad negativa',                       -- tirar −3 viandas
         'La cantidad tiene que ser un número entero mayor a 0',  -- error esperado
         fideos, -3, usuario, 'prueba'                 -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 3, 'Motivo con solo espacios',                -- motivo "   "
         'El motivo es obligatorio',                   -- error esperado
         fideos, 1, usuario, '   '                     -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 4, 'Sin motivo',                              -- motivo vacío (null)
         'El motivo es obligatorio',                   -- error esperado
         fideos, 1, usuario, null                      -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 5, 'Motivo de 201 letras',                    -- motivo demasiado largo
         'El motivo admite hasta 200 caracteres',      -- error esperado
         fideos, 1, usuario, repeat('x', 201)          -- lo que se manda (201 equis)
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 6, 'Plato que no existe',                     -- plato 999999
         'El plato no existe',                         -- error esperado
         999999, 1, usuario, 'prueba'                  -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 7, 'Una vianda más de las que hay',           -- fideos: lo que hay + 1
         'En la heladera hay ' || pro.stock_heladera   -- error esperado, armado con lo que hay hoy...
           || ' viandas de «fideos»: no se pueden descartar ' || (pro.stock_heladera + 1),  -- ...ej: hay 71, se piden 72
         fideos, pro.stock_heladera + 1, usuario, 'prueba'  -- lo que se manda
    from datos                                         -- (de "datos")
    join productos pro on pro.id = datos.fideos        -- con el plato fideos, para saber cuántas hay
  union all                                            -- junta con la prueba siguiente
  select 8, 'Sin usuario',                             -- usuario vacío (null)
         'Falta el usuario que descarta',              -- error esperado
         fideos, 1, null::uuid, 'prueba'               -- lo que se manda
    from datos                                         -- (de "datos")
)                                                      -- fin de "casos"
select orden,                                          -- número de prueba
       prueba,                                         -- qué se prueba
       esperado,                                       -- el error que tiene que aparecer
       resultado,                                      -- lo que devolvió la función
       case when resultado ->> 'error' = esperado      -- ¿el error que devolvió es el esperado?
            then 'sí' else 'NO' end as coincide        -- tiene que decir "sí" en todas
  from (select casos.*,                                -- cada prueba...
               descartar_viandas(id_producto, cantidad, id_usuario, motivo) as resultado  -- ...con lo que devolvió la función
          from casos) pruebas                          -- (las pruebas ya corridas)
 order by orden;                                       -- en orden


-- -----------------------------------------------------
-- 1B. CASO DE MENTIRA: descarta 2 fideos y DESHACE todo
-- Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)".
-- En el mensaje: antes 71 · resultado {"ok": true, ..., "stock_heladera": 69} · después 69 ·
-- renglón "tipo descarte · cantidad -2".
-- Ese error es A PROPÓSITO: hace que Postgres deshaga el descarte. Lo comprobás con 1C.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_fideos    integer;                                 -- número del plato "fideos"
  v_antes     integer;                                 -- viandas antes de descartar
  v_resultado jsonb;                                   -- lo que devuelve descartar_viandas
  v_despues   integer;                                 -- viandas después de descartar
  v_renglon   text;                                    -- el renglón que anotó en el cuaderno
begin                                                  -- empieza el bloque
  select cp.id_producto                                -- busca el número de "fideos"...
    into v_fideos                                      -- ...y lo guarda en v_fideos
    from combo_productos cp                            -- en el menú de los combos
    join productos p on p.id = cp.id_producto          -- con su plato
   where cp.id_combo = 1                               -- del combo de prueba
     and p.nombre = 'fideos';                          -- que se llama "fideos"

  select stock_heladera into v_antes                   -- cuántas hay ANTES...
    from productos where id = v_fideos;                -- ...de fideos

  v_resultado := descartar_viandas(                    -- descarta DE VERDAD (al final se deshace):
    v_fideos,                                          -- fideos
    2,                                                 -- 2 viandas
    'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid,      -- tu usuario admin
    'PRUEBA – se deshace sola');                       -- motivo

  select stock_heladera into v_despues                 -- cuántas hay DESPUÉS...
    from productos where id = v_fideos;                -- ...de fideos

  select format('tipo %s · cantidad %s · motivo "%s"', tipo, cantidad, motivo)  -- arma el texto del renglón...
    into v_renglon                                     -- ...y lo guarda en v_renglon
    from movimientos_viandas                           -- del cuaderno
   where id = (v_resultado ->> 'id_movimiento')::integer;  -- el renglón que acaba de anotar

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → antes: % · resultado: % · después: % · renglón: %',  -- frena A PROPÓSITO...
    v_antes, v_resultado, v_despues, v_renglon;        -- ...mostrando lo que pasó; Postgres deshace todo el bloque
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- 1C. COMPROBAR que la prueba 1B no dejó nada (solo lee)
-- "heladera" tiene que ser la MISMA que antes de 1B (ej: 71) y "renglones_de_prueba" tiene que dar 0.
-- -----------------------------------------------------
select p.nombre,                                       -- el plato
       p.stock_heladera                as heladera,    -- cuántas hay ahora (igual que antes de 1B)
       (select count(*)                                -- cuántos renglones...
          from movimientos_viandas m                   -- ...del cuaderno...
         where m.id_producto = p.id                    -- ...de este plato...
           and m.motivo like 'PRUEBA%') as renglones_de_prueba  -- ...con motivo de prueba (tiene que dar 0)
  from productos p                                     -- de la tabla de platos
 where p.id = (select cp.id_producto                   -- solo fideos:
                 from combo_productos cp               -- buscado en el menú de los combos
                 join productos pr on pr.id = cp.id_producto  -- con su plato
                where cp.id_combo = 1                  -- del combo de prueba
                  and pr.nombre = 'fideos');           -- que se llama "fideos"


-- =====================================================
-- BLOQUE 2 — PRODUCIR (paso H3). Correr DESPUÉS del bloque 2 de sql/heladera.sql.
-- =====================================================

-- -----------------------------------------------------
-- 2A. CASOS QUE FALLAN (no guardan nada)
-- Sale una tabla de 4 filas: en la columna "coincide" tiene que decir "sí" en todas.
-- (La 4 usa un plato de pedido a cocina que YA está hecho. Si no hubiera ninguno, la 4 diría
-- "NO" con "El plato del pedido no existe": tampoco guarda nada, pero avisame.)
-- -----------------------------------------------------
with datos as (                                        -- datos REALES que usan las pruebas
  select (select id                                    -- un renglón de pedido a cocina...
            from orden_produccion_detalles             -- ...de la tabla de platos de los pedidos a cocina...
           where hecho                                 -- ...que YA está hecho (así la prueba no puede marcar uno pendiente)
           order by id                                 -- el de número más bajo
           limit 1)                       as renglon_hecho,  -- se llama renglon_hecho
         'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid as usuario  -- tu usuario admin
),                                                     -- fin de "datos"
casos (orden, prueba, esperado, id_detalle, id_usuario) as (  -- cada prueba: número, qué prueba, error esperado y lo que se manda
  select 1, 'Sin usuario',                             -- usuario vacío (null)
         'Falta el usuario que marca el plato',        -- error esperado
         renglon_hecho, null::uuid                     -- lo que se manda: renglón y usuario
    from datos                                         -- (de "datos" salen renglon_hecho y usuario)
  union all                                            -- junta con la prueba siguiente
  select 2, 'Renglón que no existe',                   -- renglón 999999
         'El plato del pedido no existe',              -- error esperado
         999999, usuario                               -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 3, 'Sin renglón (vacío)',                     -- renglón vacío (null)
         'El plato del pedido no existe',              -- error esperado
         null::integer, usuario                        -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 4, 'Renglón ya hecho',                        -- tocar "Hecho" dos veces
         'Este plato ya estaba marcado como hecho',    -- error esperado
         renglon_hecho, usuario                        -- lo que se manda
    from datos                                         -- (de "datos")
)                                                      -- fin de "casos"
select orden,                                          -- número de prueba
       prueba,                                         -- qué se prueba
       esperado,                                       -- el error que tiene que aparecer
       resultado,                                      -- lo que devolvió la función
       case when resultado ->> 'error' = esperado      -- ¿el error que devolvió es el esperado?
            then 'sí' else 'NO' end as coincide        -- tiene que decir "sí" en todas
  from (select casos.*,                                -- cada prueba...
               producir_viandas(id_detalle, id_usuario) as resultado  -- ...con lo que devolvió la función
          from casos) pruebas                          -- (las pruebas ya corridas)
 order by orden;                                       -- en orden


-- -----------------------------------------------------
-- 2B. CASO DE MENTIRA: pide a cocina 2 fideos, toca "Hecho" y DESHACE todo
-- Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)".
-- En el mensaje: heladera antes 71 · después 73 · el renglón "produccion 2" · cuánto bajó cada
-- insumo (la receta de fideos × 2) · el pedido a cocina quedó hecho · y el resultado de la función.
-- Ese error es A PROPÓSITO: Postgres deshace todo (el pedido a cocina, las viandas y los insumos).
-- Lo único que no vuelve atrás es el número del pedido a cocina: el próximo de verdad se lo saltea.
-- Lo comprobás con 2C.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_usuario       uuid := 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid;  -- tu usuario admin
  v_fideos        integer;                             -- número del plato "fideos"
  v_antes         integer;                             -- viandas de fideos ANTES
  v_insumos_antes jsonb;                               -- stock de cada insumo de la receta ANTES. Ej: { "10": 5000, "11": 2000 }
  v_orden         jsonb;                               -- lo que devuelve crear_orden_produccion
  v_id_detalle    integer;                             -- el renglón del pedido a cocina recién creado
  v_resultado     jsonb;                               -- lo que devuelve producir_viandas
  v_despues       integer;                             -- viandas de fideos DESPUÉS
  v_renglon       text;                                -- el renglón "produccion" del cuaderno
  v_insumos       text;                                -- cuánto bajó cada insumo
  v_pedido        text;                                -- cómo quedó el renglón del pedido a cocina
begin                                                  -- empieza el bloque
  select cp.id_producto                                -- busca el número de "fideos"...
    into v_fideos                                      -- ...y lo guarda en v_fideos
    from combo_productos cp                            -- en el menú de los combos
    join productos p on p.id = cp.id_producto          -- con su plato
   where cp.id_combo = 1                               -- del combo de prueba
     and p.nombre = 'fideos';                          -- que se llama "fideos"

  select stock_heladera into v_antes                   -- cuántas hay ANTES...
    from productos where id = v_fideos;                -- ...de fideos

  select jsonb_object_agg(ins.id, ins.stock_actual)    -- foto del stock de cada insumo de la receta, ANTES...
    into v_insumos_antes                               -- ...guardada en v_insumos_antes
    from insumos ins                                   -- de la tabla de insumos
   where ins.id in (select id_insumo                   -- solo los insumos...
                      from producto_insumo             -- ...de la receta...
                     where id_producto = v_fideos);    -- ...de fideos

  v_orden := crear_orden_produccion(                   -- 1. "Pedir a cocina" (la función de siempre):
    v_usuario,                                         -- quién pide
    current_date,                                      -- para hoy
    jsonb_build_array(jsonb_build_object('id_producto', v_fideos, 'cantidad', 2)));  -- 2 fideos

  if not coalesce((v_orden ->> 'ok')::boolean, false) then  -- si no se pudo crear el pedido a cocina...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido a cocina → %', v_orden;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"

  select id                                            -- el renglón de fideos...
    into v_id_detalle                                  -- ...guardado en v_id_detalle
    from orden_produccion_detalles                     -- de la tabla de platos de los pedidos a cocina
   where id_orden_produccion = (v_orden ->> 'id_orden')::integer;  -- del pedido a cocina recién creado

  v_resultado := producir_viandas(v_id_detalle, v_usuario);  -- 2. tocar "Hecho" (la función NUEVA)

  select stock_heladera into v_despues                 -- cuántas hay DESPUÉS...
    from productos where id = v_fideos;                -- ...de fideos

  select format('tipo %s · cantidad %s · motivo "%s"', tipo, cantidad, motivo)  -- arma el texto del renglón del cuaderno...
    into v_renglon                                     -- ...y lo guarda en v_renglon
    from movimientos_viandas                           -- del cuaderno
   where id = (v_resultado ->> 'id_movimiento')::integer;  -- el renglón que acaba de anotar

  select string_agg(format('%s %s → %s (bajó %s %s)',  -- por cada insumo: "harina 5000 → 4800 (bajó 200 g)"...
                           ins.nombre,                 -- el nombre
                           v_insumos_antes ->> ins.id::text,  -- cuánto había ANTES (de la foto)
                           ins.stock_actual,           -- cuánto hay AHORA
                           sal.cantidad,               -- cuánto salió
                           sal.unidad),                -- en qué unidad
                    ' · ' order by ins.id)             -- ...todos juntos, separados por " · "
    into v_insumos                                     -- y se guarda en v_insumos
    from movimientos_stock sal                         -- las salidas de insumos...
    join insumos ins on ins.id = sal.id_insumo         -- ...con su insumo...
   where sal.id_movimiento_vianda = (v_resultado ->> 'id_movimiento')::integer;  -- ...atadas a esta producción

  select format('pedido a cocina #%s · hecho: %s · renglón del cuaderno: %s',  -- arma el texto del renglón del pedido a cocina...
                id_orden_produccion,                   -- ...con su número...
                case when hecho then 'sí' else 'no' end,  -- ...si está hecho (escrito "sí" / "no")...
                id_movimiento_vianda)                  -- ...y el renglón del cuaderno que generó
    into v_pedido                                      -- ...y lo guarda en v_pedido
    from orden_produccion_detalles                     -- de la tabla de platos de los pedidos a cocina
   where id = v_id_detalle;                            -- el renglón de la prueba

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → heladera antes: % · después: % · renglón: % · insumos: % · % · resultado: %',  -- frena A PROPÓSITO...
    v_antes, v_despues, v_renglon, v_insumos, v_pedido, v_resultado;  -- ...mostrando lo que pasó; Postgres deshace todo el bloque
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- 2C. COMPROBAR que la prueba 2B no dejó nada (solo lee)
-- "heladera_fideos" tiene que ser la de "antes" en 2B (ej: 71), "insumos_de_fideos" tienen que tener
-- los números de "antes" de 2B, y "ultimo_pedido_a_cocina" tiene que ser MENOR que el número de 2B
-- (ese pedido a cocina se deshizo).
-- -----------------------------------------------------
select pro.stock_heladera                as heladera_fideos,   -- cuántas hay ahora (igual que "antes" en 2B)
       (select max(id)                                 -- el número más alto...
          from ordenes_produccion)       as ultimo_pedido_a_cocina,  -- ...de los pedidos a cocina que quedaron
       (select string_agg(ins.nombre || ' ' || ins.stock_actual || ' ' || coalesce(ins.unidad_medida, ''), ' · ' order by ins.id)  -- cada insumo: "harina 5000 g"
          from insumos ins                             -- de la tabla de insumos
         where ins.id in (select id_insumo             -- solo los insumos...
                            from producto_insumo       -- ...de la receta...
                           where id_producto = pro.id)) as insumos_de_fideos  -- ...de fideos
  from productos pro                                   -- de la tabla de platos
 where pro.id = (select cp.id_producto                 -- solo fideos:
                   from combo_productos cp             -- buscado en el menú de los combos
                   join productos pr on pr.id = cp.id_producto  -- con su plato
                  where cp.id_combo = 1                -- del combo de prueba
                    and pr.nombre = 'fideos');         -- que se llama "fideos"


-- =====================================================
-- BLOQUE 3 — DEVOLVER (paso H4). Correr DESPUÉS del bloque 3 de sql/heladera.sql.
-- =====================================================

-- -----------------------------------------------------
-- 3A. CASOS QUE FALLAN (no guardan nada)
-- Sale una tabla de 4 filas: en la columna "coincide" tiene que decir "sí" en todas.
-- Ninguna puede anular un pedido de verdad: usan un pedido que no existe (−1), uno vacío
-- o uno que YA está anulado. La 1 corta antes de mirar el pedido (porque no hay usuario).
-- (Si no hubiera ningún pedido anulado, la 4 diría "NO" con "El pedido no existe":
-- tampoco guarda nada, pero avisame.)
-- -----------------------------------------------------
with datos as (                                        -- datos REALES que usan las pruebas
  select (select id                                    -- un pedido...
            from pedidos                               -- ...de la tabla de pedidos...
           where id_estado = 5                         -- ...que YA está anulado (así la prueba no puede anular uno abierto)
           order by id                                 -- el de número más bajo
           limit 1)                       as pedido_anulado,  -- se llama pedido_anulado
         'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid as usuario  -- tu usuario admin
),                                                     -- fin de "datos"
casos (orden, prueba, esperado, id_pedido, id_usuario) as (  -- cada prueba: número, qué prueba, error esperado y lo que se manda
  select 1, 'Sin usuario',                             -- usuario vacío (null)
         'Falta el usuario que anula el pedido',       -- error esperado
         pedido_anulado, null::uuid                    -- lo que se manda: pedido y usuario
    from datos                                         -- (de "datos" salen pedido_anulado y usuario)
  union all                                            -- junta con la prueba siguiente
  select 2, 'Pedido que no existe',                    -- pedido −1 (los números de pedido son siempre positivos)
         'El pedido no existe',                        -- error esperado
         -1, usuario                                   -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 3, 'Sin pedido (vacío)',                      -- pedido vacío (null)
         'El pedido no existe',                        -- error esperado
         null::integer, usuario                        -- lo que se manda
    from datos                                         -- (de "datos")
  union all                                            -- junta con la prueba siguiente
  select 4, 'Pedido ya anulado',                       -- anular dos veces
         'El pedido ya está anulado',                  -- error esperado
         pedido_anulado, usuario                       -- lo que se manda
    from datos                                         -- (de "datos")
)                                                      -- fin de "casos"
select orden,                                          -- número de prueba
       prueba,                                         -- qué se prueba
       esperado,                                       -- el error que tiene que aparecer
       resultado,                                      -- lo que devolvió la función
       case when resultado ->> 'error' = esperado      -- ¿el error que devolvió es el esperado?
            then 'sí' else 'NO' end as coincide        -- tiene que decir "sí" en todas
  from (select casos.*,                                -- cada prueba...
               anular_pedido_con_devolucion(id_pedido, id_usuario) as resultado  -- ...con lo que devolvió la función
          from casos) pruebas                          -- (las pruebas ya corridas)
 order by orden;                                       -- en orden


-- -----------------------------------------------------
-- 3B. CASO DE MENTIRA: vende fideos, anula y DESHACE todo
-- VENDER todavía no existe (es el paso H6), así que la prueba hace a mano lo que va a hacer H6:
-- crea un pedido de prueba con crear_pedido_combos (la función de siempre), le anota la venta
-- en el cuaderno y la resta de la heladera. Después prueba 4 cosas:
--   1) anular en 3 (Listo para Entregar) → vuelven las 10 (ej: 61 → 71) y el pedido queda en 5
--   2) anular otra vez → "El pedido ya está anulado"
--   3) sacarlo de 5 a mano (como podría hacer el servidor viejo) y anular de nuevo → vuelven 0
--   4) otro pedido igual, pero ENTREGADO (4) → al anular vuelven 0 (la heladera queda en 61)
-- Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)".
-- Ese error es A PROPÓSITO: Postgres deshace todo (los 2 pedidos, las ventas, las devoluciones).
-- Los estados 3 y 4 se escriben directo en la tabla, adentro de este bloque: no pasan por el
-- servidor ni descuentan insumos, y se deshacen con el resto.
-- Lo único que no vuelve atrás son los números: se saltean 2 números de pedido (y algunos del cuaderno).
-- Lo comprobás con 3C.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_admin     uuid := 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid;  -- tu usuario admin (el que anula)
  v_cliente   uuid := 'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid;  -- "Consumidor Final" (el que compra, como en la web)
  v_fideos    integer;                                 -- número del plato "fideos"
  v_cantidad  integer;                                 -- viandas del combo de prueba (ej: 10)
  v_combos    jsonb;                                   -- el combo de prueba lleno de fideos, como lo manda el servidor
  v_pedido    jsonb;                                   -- lo que devuelve crear_pedido_combos
  v_id_1      integer;                                 -- número del pedido de prueba 1 (el que se anula en 3)
  v_id_2      integer;                                 -- número del pedido de prueba 2 (el entregado)
  v_antes     integer;                                 -- heladera de fideos al empezar (ej: 71)
  v_con_venta integer;                                 -- heladera después de la venta de mentira (ej: 61)
  v_r1        jsonb;                                   -- resultado de 1) anular en 3
  v_r2        jsonb;                                   -- resultado de 2) anular otra vez
  v_r3        jsonb;                                   -- resultado de 3) anular después de sacarlo de 5
  v_r4        jsonb;                                   -- resultado de 4) anular el entregado
  v_h1        integer;                                 -- heladera después de 1)
  v_h3        integer;                                 -- heladera después de 3)
  v_h4        integer;                                 -- heladera después de 4)
  v_renglon   text;                                    -- el renglón "devolucion" que anotó 1)
  v_estado_1  integer;                                 -- estado del pedido 1 después de 1)
  v_estado_2  integer;                                 -- estado del pedido 2 después de 4)
begin                                                  -- empieza el bloque
  select cp.id_producto                                -- busca el número de "fideos"...
    into v_fideos                                      -- ...y lo guarda en v_fideos
    from combo_productos cp                            -- en el menú de los combos
    join productos p on p.id = cp.id_producto          -- con su plato
   where cp.id_combo = 1                               -- del combo de prueba
     and p.nombre = 'fideos';                          -- que se llama "fideos"

  select cantidad into v_cantidad                      -- cuántas viandas tiene el combo de prueba...
    from combos where id = 1;                          -- ...el combo 1 (ej: 10)

  v_combos := jsonb_build_array(jsonb_build_object(    -- lo que se compra: el combo 1...
    'id_combo', 1,                                     -- (su número)
    'platos', jsonb_build_array(jsonb_build_object(    -- ...con un solo plato:
      'producto_id', v_fideos,                         -- fideos
      'cantidad',    v_cantidad))));                   -- todas las viandas del combo (ej: 10)

  select stock_heladera into v_antes                   -- cuántas hay ANTES...
    from productos where id = v_fideos;                -- ...de fideos

  -- PEDIDO 1: crearlo, venderle los fideos de mentira y pasarlo a 3
  v_pedido := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- el pedido (queda en 1)...
                                  'Efectivo', 'Retiro en local', null, 'PRUEBA H4 – se deshace sola', v_combos);  -- ...(mismos datos que en las pruebas de combos)
  if not coalesce((v_pedido ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido de prueba 1 → %', v_pedido;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"
  v_id_1 := (v_pedido ->> 'id_pedido')::integer;       -- el número del pedido nuevo

  insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)  -- VENTA DE MENTIRA (lo que va a hacer H6):
  values (v_fideos, v_cliente, v_id_1, 'venta', -v_cantidad, 'Pedido #' || v_id_1);  -- ej: fideos −10, "Pedido #250"
  update productos                                     -- sale de la heladera...
     set stock_heladera = stock_heladera - v_cantidad  -- ...ej: 71 − 10 = 61...
   where id = v_fideos                                 -- ...de fideos
  returning stock_heladera into v_con_venta;           -- ...y se guarda cuántas quedaron

  update pedidos set id_estado = 3 where id = v_id_1;  -- el pedido pasa a 3 (directo en la tabla: es de mentira)

  -- 1) ANULAR EN 3 (la función NUEVA): tienen que volver todas
  v_r1 := anular_pedido_con_devolucion(v_id_1, v_admin);  -- anula
  select stock_heladera into v_h1                      -- heladera después (ej: 71)...
    from productos where id = v_fideos;                -- ...de fideos
  select id_estado into v_estado_1                     -- estado después (tiene que ser 5)...
    from pedidos where id = v_id_1;                    -- ...del pedido 1
  select format('tipo %s · cantidad %s · motivo "%s"', tipo, cantidad, motivo)  -- arma el texto del renglón...
    into v_renglon                                     -- ...y lo guarda en v_renglon
    from movimientos_viandas                           -- del cuaderno
   where id_pedido = v_id_1                            -- de este pedido
     and tipo = 'devolucion';                          -- la devolución que acaba de anotar

  -- 2) ANULAR OTRA VEZ: tiene que decir "ya está anulado"
  v_r2 := anular_pedido_con_devolucion(v_id_1, v_admin);  -- anula de nuevo

  -- 3) SACARLO DE 5 A MANO y anular de nuevo: no tiene que volver nada (−10 + 10 = 0)
  update pedidos set id_estado = 2 where id = v_id_1;  -- lo "revive" (directo en la tabla)
  v_r3 := anular_pedido_con_devolucion(v_id_1, v_admin);  -- anula otra vez
  select stock_heladera into v_h3                      -- heladera después (tiene que seguir en 71)...
    from productos where id = v_fideos;                -- ...de fideos

  -- PEDIDO 2: crearlo, venderle los fideos de mentira y pasarlo a 4 (entregado)
  v_pedido := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,  -- otro pedido igual...
                                  'Efectivo', 'Retiro en local', null, 'PRUEBA H4 – se deshace sola', v_combos);  -- ...(queda en 1)
  if not coalesce((v_pedido ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido de prueba 2 → %', v_pedido;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"
  v_id_2 := (v_pedido ->> 'id_pedido')::integer;       -- el número del pedido nuevo

  insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)  -- VENTA DE MENTIRA:
  values (v_fideos, v_cliente, v_id_2, 'venta', -v_cantidad, 'Pedido #' || v_id_2);  -- ej: fideos −10
  update productos                                     -- sale de la heladera...
     set stock_heladera = stock_heladera - v_cantidad  -- ...ej: 71 − 10 = 61...
   where id = v_fideos;                                -- ...de fideos

  update pedidos set id_estado = 4 where id = v_id_2;  -- el pedido pasa a 4, entregado (directo en la tabla)

  -- 4) ANULAR EL ENTREGADO: no vuelve nada (la heladera sigue en 61)
  v_r4 := anular_pedido_con_devolucion(v_id_2, v_admin);  -- anula
  select stock_heladera into v_h4                      -- heladera después (ej: 61)...
    from productos where id = v_fideos;                -- ...de fideos
  select id_estado into v_estado_2                     -- estado después (tiene que ser 5)...
    from pedidos where id = v_id_2;                    -- ...del pedido 2

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → heladera antes: % · con la venta: % · 1) pedido #% anulado en 3: % → heladera % · estado % · renglón: % · 2) otra vez: % · 3) sacado de 5 y anulado: % → heladera % · 4) pedido #% entregado y anulado: % → heladera % · estado %',  -- frena A PROPÓSITO...
    v_antes, v_con_venta,                              -- ...mostrando: la heladera al empezar y con la venta,
    v_id_1, v_r1, v_h1, v_estado_1, v_renglon,         -- 1) pedido, resultado, heladera, estado y renglón,
    v_r2,                                              -- 2) resultado de anular otra vez,
    v_r3, v_h3,                                        -- 3) resultado y heladera,
    v_id_2, v_r4, v_h4, v_estado_2;                    -- 4) pedido, resultado, heladera y estado. Postgres deshace todo el bloque
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- 3C. COMPROBAR que la prueba 3B no dejó nada (solo lee)
-- "heladera_fideos" tiene que ser la de "antes" en 3B (ej: 71). Las otras tres columnas tienen que dar 0:
--   - pedidos_de_prueba: no quedó ningún pedido de 3B;
--   - ventas_y_devoluciones: el cuaderno no tiene ventas ni devoluciones (las de verdad llegan con H6);
--   - pedidos_sin_estado: no hay pedidos sin estado (si hubiera, el control nuevo de server.js
--     no los dejaría cambiar de estado: avisame).
-- La última columna no comprueba nada: es el número de un pedido que YA está anulado, para usarlo
-- en la prueba de la consola ("mover un anulado"). Así esa prueba nunca toca un pedido abierto.
-- -----------------------------------------------------
select pro.stock_heladera                as heladera_fideos,     -- cuántas hay ahora (igual que "antes" en 3B)
       (select count(*)                                -- cuántos pedidos...
          from pedidos                                 -- ...de la tabla de pedidos...
         where observaciones = 'PRUEBA H4 – se deshace sola') as pedidos_de_prueba,  -- ...son de 3B (tiene que dar 0)
       (select count(*)                                -- cuántos renglones...
          from movimientos_viandas                     -- ...del cuaderno...
         where tipo in ('venta', 'devolucion')) as ventas_y_devoluciones,  -- ...son ventas o devoluciones (tiene que dar 0)
       (select count(*)                                -- cuántos pedidos...
          from pedidos                                 -- ...de la tabla de pedidos...
         where id_estado is null)        as pedidos_sin_estado,  -- ...no tienen estado (tiene que dar 0)
       (select min(id)                                 -- el número más bajo...
          from pedidos                                 -- ...de la tabla de pedidos...
         where id_estado = 5)            as pedido_anulado_para_la_consola  -- ...de los que ya están anulados
  from productos pro                                   -- de la tabla de platos
 where pro.id = (select cp.id_producto                 -- solo fideos:
                   from combo_productos cp             -- buscado en el menú de los combos
                   join productos pr on pr.id = cp.id_producto  -- con su plato
                  where cp.id_combo = 1                -- del combo de prueba
                    and pr.nombre = 'fideos');         -- que se llama "fideos"


-- =====================================================
-- BLOQUE 4 — MARCAS "NO USAR" y "USAR" (paso H7). Correr DESPUÉS del bloque 4 de sql/heladera.sql.
-- =====================================================

-- -----------------------------------------------------
-- 4A. COMPROBAR LAS MARCAS (solo lee)
-- Sale una tabla de 12 filas: 9 funciones (5 viejas y 4 nuevas), 2 columnas y 1 secuencia.
-- En la columna "esta_bien" tiene que decir "sí" en todas: las 4 nuevas empiezan con "USAR"
-- y todas las demás con "NO USAR".
-- Si sale alguna con "(sin comentario)", el bloque 4 no se corrió (o falló): avisame.
-- -----------------------------------------------------
select tipo,                                           -- función, columna o secuencia
       nombre,                                         -- de qué cosa es la fila
       esperado,                                       -- cómo tiene que empezar su comentario
       comentario,                                     -- el comentario guardado en la base
       case when comentario like esperado || '%'       -- ¿empieza como tiene que empezar? (ej: "USAR. PRODUCIR…" empieza con "USAR")
            then 'sí' else 'NO' end as esta_bien       -- tiene que decir "sí" en todas
  from (
        -- las 9 funciones (5 viejas y 4 nuevas)
        select 'función'::text                         as tipo,        -- es una función
               fun.proname::text                       as nombre,      -- su nombre
               case when fun.proname in ('producir_viandas', 'crear_pedido_combos',             -- si es una de las 4 nuevas...
                                         'anular_pedido_con_devolucion', 'descartar_viandas')
                    then 'USAR'                        -- ...tiene que decir "USAR"
                    else 'NO USAR'                     -- las viejas, "NO USAR"
               end                                     as esperado,    -- cómo tiene que empezar
               coalesce(obj_description(fun.oid, 'pg_proc'), '(sin comentario)') as comentario  -- su comentario (si no tiene, lo dice)
          from pg_proc fun                             -- el catálogo de funciones de la base
          join pg_namespace esq on esq.oid = fun.pronamespace   -- con su carpeta (esquema)
         where esq.nspname = 'public'                  -- solo las de la app
           and fun.proname in ('marcar_detalle_hecho', 'aplicar_produccion_viandas',             -- las viejas...
                               'registrar_descarte_vianda', 'registrar_tanda_viandas', 'registrar_tanda_multiple',
                               'producir_viandas', 'crear_pedido_combos',                        -- ...y las nuevas
                               'anular_pedido_con_devolucion', 'descartar_viandas')
        union all                                      -- junta con las columnas
        -- las 2 columnas sin uso
        select 'columna',                              -- es una columna
               tab.relname || '.' || col.attname,      -- "tabla.columna"
               'NO USAR',                              -- tiene que decir "NO USAR"
               coalesce(col_description(tab.oid, col.attnum), '(sin comentario)')  -- su comentario
          from pg_attribute col                        -- el catálogo de columnas
          join pg_class tab on tab.oid = col.attrelid  -- con su tabla
          join pg_namespace esq on esq.oid = tab.relnamespace   -- y su carpeta
         where esq.nspname = 'public'                  -- solo las de la app
           and ((tab.relname = 'movimientos_viandas'       and col.attname = 'id_lote')            -- id_lote del cuaderno
             or (tab.relname = 'orden_produccion_detalles' and col.attname = 'id_pedido_detalle'))  -- la columna vieja de los pedidos a cocina
        union all                                      -- junta con la secuencia
        -- la secuencia sin uso
        select 'secuencia',                            -- es una secuencia
               sec.relname::text,                      -- su nombre
               'NO USAR',                              -- tiene que decir "NO USAR"
               coalesce(obj_description(sec.oid, 'pg_class'), '(sin comentario)')  -- su comentario
          from pg_class sec                            -- el catálogo de tablas y secuencias
          join pg_namespace esq on esq.oid = sec.relnamespace   -- con su carpeta
         where esq.nspname = 'public'                  -- de la app
           and sec.relname = 'movimientos_viandas_lote_seq'      -- esta secuencia
       ) marcas                                        -- (todas las marcas juntas)
 order by tipo, nombre;                                -- ordenadas por tipo y nombre
