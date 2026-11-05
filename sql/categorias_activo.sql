-- =====================================================
-- CATEGORÍAS: SE PUEDEN DESACTIVAR (pantalla "Planes y categorías")
-- Las cosas no se borran, se desactivan. planes ya tiene su columna activo; a categorias le falta.
-- Solo AGREGA una columna. No borra ni renombra nada, y todas las categorías que ya existen arrancan activas.
-- Producción (rama Rodriguez) pide las columnas por nombre: esta columna nueva no le cambia nada.
-- Se puede correr dos veces: "if not exists" no repite la columna.
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

alter table public.categorias                                    -- la tabla de categorías
  add column if not exists activo boolean not null default true; -- true = activa (las que ya existen quedan activas)

commit;  -- se aplica todo junto

-- Le avisa a la API de Supabase que hay una columna nueva, para que el servidor la vea enseguida.
notify pgrst, 'reload schema';   -- recargar la lista de columnas de la API

-- COMPROBACIÓN (solo lee). Revisa lo que necesitan "Nuevo plan" y "Nueva categoría":
--   columna obligatoria → tendría que salir SOLO planes.nombre y categorias.nombre (si sale otra, avisame antes de crear)
--   contador de ids     → tiene que ser igual o mayor que el id más alto de esa tabla (si es menor, avisame antes de crear)
--   id más alto         → el número más alto que ya se usó en cada tabla
select 'columna obligatoria' as que,                             -- columnas que hay que mandar sí o sí
       table_name || '.' || column_name as detalle               -- tabla.columna
from information_schema.columns                                  -- la lista de columnas de la base
where table_schema = 'public'                                    -- solo nuestras tablas
  and table_name in ('planes', 'categorias')                     -- estas dos
  and is_nullable = 'NO'                                         -- no aceptan vacío…
  and column_default is null                                     -- …no tienen un valor inicial…
  and is_identity = 'NO'                                         -- …y la base no les da el número sola
union all                                                        -- y abajo, en la misma lista:
select 'contador de ids',                                        -- por qué número va cada contador
       sequencename || ': va por ' || coalesce(last_value::text, '(sin usar)')  -- ej: planes_id_seq: va por 8
from pg_sequences                                                -- la lista de contadores de la base
where schemaname = 'public'                                      -- solo los nuestros
  and sequencename in ('planes_id_seq', 'categorias_id_seq')     -- estos dos
union all                                                        -- y abajo:
select 'id mas alto',                                            -- el número más alto de planes
       'planes: ' || coalesce(max(id)::text, '0')                -- ej: planes: 8
from public.planes                                               -- de la tabla de planes
union all                                                        -- y abajo:
select 'id mas alto',                                            -- el número más alto de categorías
       'categorias: ' || coalesce(max(id)::text, '0')            -- ej: categorias: 5
from public.categorias;                                          -- de la tabla de categorías
