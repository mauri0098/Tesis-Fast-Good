-- =====================================================
-- REVISAR LAS TABLAS DE COMBOS (SOLO LECTURA)
-- Esta consulta NO cambia nada: es un solo SELECT, que lee y muestra.
-- Sirve para saber cómo están armadas en la base las tablas que van a usar
-- los combos, antes de escribir la función que guarda el pedido.
--
-- Cómo usarla:
--   1. Supabase → SQL Editor → New query.
--   2. Pegá TODO este archivo y tocá "Run".
--   3. Sale UNA sola tabla de resultados. Copiala entera (botón de exportar →
--      "Copy as CSV" o "Copy as Markdown") y pasámela.
--   Si sale un error, pasame el mensaje: quiere decir que alguna columna
--   no se llama como pensamos (eso también es un dato útil).
--
-- Columnas del resultado:
--   orden   → número de sección, para que salgan agrupadas
--   seccion → qué se está mirando (columna, restricción, trigger, etc.)
--   tabla   → de qué tabla es
--   nombre  → nombre de la columna, de la restricción, del plato, etc.
--   detalle → la información en sí
-- =====================================================

-- "with" arma una lista auxiliar que se usa en toda la consulta
with tablas (nombre) as (                                   -- lista de tablas a revisar, con una columna "nombre"
  values ('combos'),                                        -- los combos ("Keto x10")
         ('combo_productos'),                               -- el menú de cada combo
         ('pedido_combos'),                                 -- cada combo comprado dentro de un pedido
         ('pedido_detalles'),                               -- cada plato de un pedido
         ('pedidos'),                                       -- la cabecera del pedido (cliente, fecha, total)
         ('movimientos_viandas')                            -- entradas y salidas de la heladera
)

-- 1) COLUMNAS: nombre, tipo, si es obligatoria y su valor por defecto
select 1                                                    as orden,    -- sección 1
       'columna'::text                                      as seccion,  -- qué se mira
       col.table_name::text                                 as tabla,    -- tabla de la columna
       col.column_name::text                                as nombre,   -- nombre de la columna
       col.data_type                                                     -- tipo (integer, numeric, text, boolean...)
         || case when col.data_type = 'numeric'                          -- si es numeric, se agrega su tamaño
                 then coalesce(' (' || col.numeric_precision || ',' || col.numeric_scale || ')', ' (sin tamaño fijo)')  -- ej: (10,2) = 10 dígitos, 2 decimales
                 else ''                                                 -- los demás tipos no llevan nada
            end                                                          -- fin del "case"
         || coalesce(' (máx. ' || col.character_maximum_length || ' letras)', '')  -- largo máximo, solo en los textos que tienen límite
         || case when col.is_nullable = 'YES'                            -- ¿puede quedar vacía?
                 then ' · puede quedar vacía'                            -- sí
                 else ' · obligatoria'                                   -- no
            end                                                          -- fin del "case"
         || coalesce(' · por defecto: ' || col.column_default, '')       -- valor que toma si no se manda nada
                                                            as detalle   -- todo lo anterior junto, en un solo texto
  from information_schema.columns col                       -- catálogo de columnas de la base (solo lectura)
 where col.table_schema = 'public'                          -- solo las tablas de la app
   and col.table_name::text in (select nombre from tablas)  -- solo las tablas de la lista de arriba

union all                                                   -- junta este resultado con el de la sección siguiente

-- 2) RESTRICCIONES: clave primaria, claves foráneas (a qué tabla apuntan), únicas y checks
select 2,                                                   -- sección 2
       'restriccion',                                       -- qué se mira
       cl.relname::text,                                    -- tabla
       con.conname::text,                                   -- nombre de la restricción
       pg_get_constraintdef(con.oid)                        -- la regla, escrita como la entiende Postgres
  from pg_constraint con                                    -- catálogo de restricciones
  join pg_class cl      on cl.oid = con.conrelid            -- la tabla a la que pertenece cada restricción
  join pg_namespace esq on esq.oid = cl.relnamespace        -- la carpeta (esquema) de esa tabla
 where esq.nspname = 'public'                               -- solo las tablas de la app
   and cl.relname::text in (select nombre from tablas)      -- solo las tablas de la lista

union all                                                   -- junta con la sección siguiente

-- 3) ÍNDICES ÚNICOS que no son restricciones (también impiden repetir valores)
select 3,                                                   -- sección 3
       'indice_unico',                                      -- qué se mira
       ind.tablename::text,                                 -- tabla
       ind.indexname::text,                                 -- nombre del índice
       ind.indexdef                                         -- cómo está definido
  from pg_indexes ind                                       -- catálogo de índices
 where ind.schemaname = 'public'                            -- solo las tablas de la app
   and ind.tablename::text in (select nombre from tablas)   -- solo las tablas de la lista
   and ind.indexdef like 'CREATE UNIQUE INDEX%'             -- solo los que no dejan repetir valores
   and not exists (                                         -- y que no estén ya en la sección 2
         select 1                                           -- (no importa qué devuelve, solo si existe)
           from pg_constraint con2                          -- catálogo de restricciones
          where con2.conname = ind.indexname                -- una restricción con el mismo nombre que el índice
       )                                                    -- fin del "not exists"

union all                                                   -- junta con la sección siguiente

-- 4) TRIGGERS: código que la base ejecuta sola al guardar (podría interferir con la función nueva)
select 4,                                                   -- sección 4
       'trigger',                                           -- qué se mira
       tri.event_object_table::text,                        -- tabla
       tri.trigger_name::text,                              -- nombre del trigger
       tri.action_timing || ' ' || tri.event_manipulation   -- cuándo corre (ej: AFTER INSERT)
         || ' → ' || tri.action_statement                   -- y qué ejecuta
  from information_schema.triggers tri                      -- catálogo de triggers
 where tri.event_object_schema = 'public'                   -- solo las tablas de la app
   and tri.event_object_table::text in (select nombre from tablas)  -- solo las tablas de la lista

union all                                                   -- junta con la sección siguiente

-- 5) RLS: si cada tabla tiene activada la protección por filas
select 5,                                                   -- sección 5
       'rls',                                               -- qué se mira
       cl.relname::text,                                    -- tabla
       'RLS',                                               -- siempre el mismo nombre
       case when cl.relrowsecurity                          -- ¿está activada?
            then 'activado'                                 -- sí
            else 'DESACTIVADO'                              -- no
       end                                                  -- fin del "case"
  from pg_class cl                                          -- catálogo de tablas
  join pg_namespace esq on esq.oid = cl.relnamespace        -- el esquema de la tabla
 where esq.nspname = 'public'                               -- solo las tablas de la app
   and cl.relkind = 'r'                                     -- solo tablas comunes (no índices ni vistas)
   and cl.relname::text in (select nombre from tablas)      -- solo las tablas de la lista

union all                                                   -- junta con la sección siguiente

-- 6) FUNCIONES que ya existen con "pedido" o "combo" en el nombre (para no repetir nombres)
select 6,                                                   -- sección 6
       'funcion',                                           -- qué se mira
       '(base)',                                            -- no es de una tabla
       fun.proname::text,                                   -- nombre de la función
       '(' || pg_get_function_identity_arguments(fun.oid) || ')'  -- qué datos recibe
  from pg_proc fun                                          -- catálogo de funciones
  join pg_namespace esq on esq.oid = fun.pronamespace       -- el esquema de la función
 where esq.nspname = 'public'                               -- solo las de la app
   and (fun.proname like '%pedido%'                         -- las que hablan de pedidos
        or fun.proname like '%combo%')                      -- o de combos

union all                                                   -- junta con la sección siguiente

-- 7) COMBOS cargados hoy (en activo: t = sí, f = no)
select 7,                                                   -- sección 7
       'combo',                                             -- qué se mira
       'combos',                                            -- tabla
       cmb.nombre::text,                                    -- nombre del combo
       format('id %s · plan %s · cantidad %s · precio %s · activo %s',  -- arma el texto (un dato vacío queda en blanco)
              cmb.id, pla.nombre, cmb.cantidad, cmb.precio, cmb.activo)  -- datos del combo y nombre de su plan
  from combos cmb                                           -- los combos
  left join planes pla on pla.id = cmb.id_plan              -- su plan (si no tiene, el combo sale igual)

union all                                                   -- junta con la sección siguiente

-- 8) MENÚ de cada combo: qué platos tiene y cuántas viandas hay en la heladera
select 8,                                                   -- sección 8
       'menu',                                              -- qué se mira
       'combo_productos',                                   -- tabla
       pro.nombre::text,                                    -- nombre del plato
       format('combo %s · en el menú: %s · plato activo: %s · heladera: %s · plan del plato: %s',  -- arma el texto
              cpr.id_combo, cpr.activo, pro.activo, pro.stock_heladera, pla.nombre)  -- datos del plato dentro del menú
  from combo_productos cpr                                  -- el menú de los combos
  join productos pro   on pro.id = cpr.id_producto          -- el plato
  left join planes pla on pla.id = pro.id_plan              -- el plan del plato (si no tiene, sale igual)

union all                                                   -- junta con la sección siguiente

-- 9) USO HOY de las columnas de pedido_detalles que podrían guardar lo personalizado
select 9,                                                   -- sección 9
       'uso',                                               -- qué se mira
       'pedido_detalles',                                   -- tabla
       'renglones: total / con observaciones_plato / con personalizado / con id_pedido_combo',  -- qué se cuenta
       format('%s / %s / %s / %s',                          -- los cuatro números separados por "/"
              count(*),                                     -- todos los renglones
              count(det.observaciones_plato),               -- los que tienen algo en observaciones_plato (count no cuenta los vacíos)
              count(det.personalizado),                     -- los que tienen algo en personalizado
              count(det.id_pedido_combo))                   -- los que pertenecen a un combo
  from pedido_detalles det                                  -- todos los platos de todos los pedidos

union all                                                   -- junta con la sección siguiente

-- 10) VALORES DISTINTOS que tiene hoy la columna personalizado (muestra cómo se usa)
select 10,                                                  -- sección 10
       'uso',                                               -- qué se mira
       'pedido_detalles',                                   -- tabla
       'valores distintos de personalizado',                -- qué se muestra
       string_agg(distinct coalesce(det.personalizado::text, '(vacío)'), ', ')  -- cada valor una sola vez, separados por coma
  from pedido_detalles det                                  -- todos los platos de todos los pedidos

union all                                                   -- junta con la sección siguiente

-- 11) Cuántos combos comprados hay guardados
select 11,                                                  -- sección 11
       'uso',                                               -- qué se mira
       'pedido_combos',                                     -- tabla
       'filas guardadas',                                   -- qué se cuenta
       count(*)::text                                       -- cantidad de filas
  from pedido_combos                                        -- los combos comprados

-- Orden final: por sección, después por tabla y por nombre
order by 1, 3, 4;                                           -- 1 = orden, 3 = tabla, 4 = nombre
