-- ============================================================================
-- estado_por_armar.sql — El estado nuevo "Por armar" (05/11)
--
-- Lo corre Mauri en el SQL Editor de Supabase. Se puede correr dos veces: si "Por armar" ya está, no agrega nada.
-- SOLO AGREGA una fila a la tabla estados. No borra, no renombra y no cambia ninguna de las que ya están.
--
-- El recorrido de un pedido:
--   1 Registrado → 2 En Preparación → 6 Por armar → 3 Listo para entregar → 4 Entregado   (5 Cancelado: anulado)
-- Es el número 6 porque del 1 al 5 ya los usan los pedidos guardados (correrlos sería renombrar).
-- El orden en que se muestran lo pone el servidor (GET /api/estados), no el número.
--
-- Quién pone cada uno (server.js):
--   6 Por armar          → al confirmar (1 → 2) un pedido todo de heladera, o cuando la cocina toca "✓ Cocinado"
--                          y ya no queda ningún plato por hacer, o el administrador a mano (solo si no queda nada por cocinar)
--   3 Listo para entregar → solo el Armado (POST /api/pedidos/:id/armado), y solo desde 6
--
-- Tiene 3 partes. La 1 y la 3 solo LEEN: mandale a Claude lo que salga de las dos.
-- ============================================================================


-- PARTE 1 (solo lee): cómo es la tabla de estados. Si la parte 2 da error, esto dice por qué.
select column_name,                                            -- el nombre de cada columna
       is_nullable,                                            -- si puede quedar vacía (YES / NO)
       column_default,                                         -- su valor de arranque (si tiene)
       is_identity                                             -- si se numera sola (YES / NO)
  from information_schema.columns                              -- de la lista de columnas de todas las tablas...
 where table_name = 'estados'                                  -- ...solo las de la tabla estados...
 order by ordinal_position;                                    -- ...en el orden en que están en la tabla

select id, nombre                                              -- el número y el nombre de cada estado
  from estados                                                 -- de la tabla de estados
 order by id;                                                  -- del 1 en adelante: tienen que salir los 5 de siempre


-- PARTE 2 (agrega): la fila nueva, 6 "Por armar"
insert into estados (id, nombre)                               -- en la tabla de estados, el número y el nombre...
overriding system value                                        -- ...con el número que ponemos nosotros (6), aunque la tabla numere sola
select 6, 'Por armar'                                          -- ...la fila nueva: 6, "Por armar"
 where not exists (                                            -- ...solo si todavía no está:
   select 1                                                    --    (no hace falta traer nada, solo saber si hay)
     from estados                                              --    se busca en la tabla de estados...
    where id = 6                                               --    ...el número 6...
       or nombre = 'Por armar'                                 --    ...o el nombre "Por armar"
 );                                                            -- si ya estaba, no agrega nada

select id, nombre                                              -- cómo quedó la tabla
  from estados                                                 -- de la tabla de estados
 order by id;                                                  -- tienen que salir 6 filas (la última, 6 "Por armar")


-- PARTE 3 (solo lee): los pedidos que HOY están en 2 sin nada por cocinar.
-- Con el cambio, esos quedarían trabados (la cocina no los ve y el Armado solo arma en 6):
-- el administrador los pasa a mano a "Por armar" en Consultar pedidos.
-- Si alguno tiene armado_en con fecha (ya armado antes de la fase 0), avisale a Claude el número.
select ped.id,                                                 -- el número de pedido
       ped.fecha_entrega,                                      -- el día que se entrega
       ped.armado_en                                           -- la marca de armado (vacía = sin armar)
  from pedidos ped                                             -- de la tabla de pedidos
 where ped.id_estado = 2                                       -- los que están En Preparación...
   and not exists (                                            -- ...que NO tienen ningún plato...
     select 1                                                  --    (no hace falta traer nada, solo saber si hay)
       from pedido_detalles det                                --    de la tabla de platos de los pedidos...
      where det.id_pedido = ped.id                             --    ...de este pedido...
        and det.cantidad - coalesce(det.cantidad_de_heladera, 0) > 0  -- ...con viandas para la cocina (vacío cuenta como 0)...
        and det.listo is not true                              --    ...que todavía no estén listas
   )
 order by ped.id;                                              -- por número de pedido
