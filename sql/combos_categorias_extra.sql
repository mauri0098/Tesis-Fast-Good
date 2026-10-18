-- =====================================================
-- COMBOS Y CATEGORÍAS: 3 COLUMNAS NUEVAS (17/10/2026)
-- Para la web (index.html):
--   combos.destacado       → ese combo lleva la pastilla naranja "Más elegido"
--   categorias.imagen      → la foto de la tarjeta de la categoría (la dirección, como las fotos de los platos)
--   categorias.descripcion → una frase corta debajo del nombre (ej: "Para toda la semana")
-- Solo AGREGA columnas. No modifica ni borra nada existente. El RLS queda como está.
-- "if not exists" = si la columna ya está, no hace nada (se puede correr dos veces sin problema).
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

-- 1) COMBO DESTACADO ("Más elegido")
-- Sí o no. Todos los combos que ya existen arrancan en "no" (false).
-- Por ahora se marca a mano desde Supabase (el panel para marcarlo queda para después).
alter table public.combos                                                -- la tabla de combos
  add column if not exists destacado boolean not null default false;    -- false = no destacado

-- 2) FOTO DE LA CATEGORÍA
-- La dirección (URL) de la foto. Vacía (null) = la web usa la foto de su primer combo, como hoy.
alter table public.categorias                                            -- la tabla de categorías
  add column if not exists imagen text null;                            -- null = sin foto propia

-- 3) DESCRIPCIÓN DE LA CATEGORÍA
-- Una frase corta que va debajo del nombre, en la tarjeta. Vacía (null) = la tarjeta va sin frase.
alter table public.categorias                                            -- la tabla de categorías
  add column if not exists descripcion text null;                       -- null = sin frase

commit;  -- se aplica todo junto

-- 4) Le avisa a la API de Supabase que hay columnas nuevas, para que el servidor las vea enseguida.
--    No cambia nada de la base.
notify pgrst, 'reload schema';   -- recargar la lista de columnas de la API

-- 5) COMPROBACIÓN (solo lee): tienen que salir 3 renglones
--    combos     · destacado   · boolean · NO  · false
--    categorias · descripcion · text    · YES · (vacío)
--    categorias · imagen      · text    · YES · (vacío)
select table_name     as tabla,            -- en qué tabla está
       column_name    as columna,          -- la columna nueva
       data_type      as tipo,             -- boolean (sí/no) o text (texto)
       is_nullable    as puede_ir_vacia,   -- NO para destacado; YES para las otras dos
       column_default as valor_inicial     -- false para destacado; vacío para las otras dos
from information_schema.columns                                                  -- la lista de columnas de la base
where table_schema = 'public'                                                    -- solo nuestras tablas
  and ((table_name = 'combos' and column_name = 'destacado')                     -- la de combos
    or (table_name = 'categorias' and column_name in ('imagen', 'descripcion'))) -- las 2 de categorías
order by table_name, column_name;                                                -- en orden
