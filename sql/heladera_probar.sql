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
