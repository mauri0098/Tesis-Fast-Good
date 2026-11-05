-- =====================================================
-- PLANES: FOTO Y FRASE PROPIAS
-- Para la web (index.html): los planes pasan a ser el nivel más alto, y cada tarjeta necesita su foto y su frase.
--   planes.imagen      → la foto de la tarjeta del plan (la dirección, como las fotos de los platos)
--   planes.descripcion → una frase corta debajo del nombre
-- Solo AGREGA 2 columnas y las llena. No borra ni renombra nada:
-- la tabla categorias y la columna planes.id_categoria se quedan (producción las sigue leyendo).
-- El RLS de planes queda como está.
-- Se puede correr dos veces: "if not exists" no repite la columna y "is null" no pisa lo que ya está cargado.
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

-- 1) FOTO DEL PLAN
-- La dirección (URL) de la foto. Vacía (null) = la web usa la foto de su primer plato.
alter table public.planes                                  -- la tabla de planes
  add column if not exists imagen text null;               -- null = sin foto propia

-- 2) FRASE DEL PLAN
-- Una frase corta que va debajo del nombre, en la tarjeta. Vacía (null) = la tarjeta va sin frase.
alter table public.planes                                  -- la tabla de planes
  add column if not exists descripcion text null;          -- null = sin frase

-- 3) COPIAR LA FOTO DE LA CATEGORÍA A SUS PLANES
-- Todos los planes de la categoría reciben su foto. Ej: Deportivo, Veggie y Kids arrancan con la misma,
-- hasta que cada uno tenga la suya.
update public.planes p                                     -- en cada plan…
set imagen = c.imagen                                      -- …copia la foto de su categoría…
from public.categorias c                                   -- …mirando la tabla de categorías…
where p.id_categoria = c.id                                -- …la que le corresponde…
  and p.imagen is null                                     -- …sin pisar una foto ya cargada…
  and c.imagen is not null;                                -- …y solo si la categoría tiene foto

-- 4) COPIAR LA FRASE DE LA CATEGORÍA, SOLO SI TIENE UN PLAN
-- Una frase pensada para un grupo de planes se leería mal en uno solo: esos planes quedan sin frase.
update public.planes p                                     -- en cada plan…
set descripcion = c.descripcion                            -- …copia la frase de su categoría…
from public.categorias c                                   -- …mirando la tabla de categorías…
where p.id_categoria = c.id                                -- …la que le corresponde…
  and p.descripcion is null                                -- …sin pisar una frase ya cargada…
  and c.descripcion is not null                            -- …si la categoría tiene frase…
  and (select count(*)                                     -- …y si, contando sus planes…
       from public.planes otro                             -- …en la misma tabla de planes…
       where otro.id_categoria = c.id) = 1;                -- …tiene uno solo

commit;  -- se aplica todo junto

-- 5) Le avisa a la API de Supabase que hay columnas nuevas, para que el servidor las vea enseguida.
--    No cambia nada de la base.
notify pgrst, 'reload schema';   -- recargar la lista de columnas de la API

-- 6) COMPROBACIÓN (solo lee): un renglón por plan, con su categoría, su foto y su frase.
--    Si la categoría tenía foto, el plan tiene la misma. La frase solo aparece si era el único plan de su categoría.
select p.id          as id_plan,            -- el número del plan
       p.nombre      as plan,               -- su nombre
       c.nombre      as categoria,          -- su categoría (sigue estando)
       p.imagen      as foto_del_plan,      -- la foto copiada (vacía si la categoría no tenía)
       p.descripcion as frase_del_plan      -- la frase copiada (vacía si no correspondía)
from public.planes p                                       -- de la tabla de planes
left join public.categorias c on c.id = p.id_categoria     -- con su categoría (left: también los que no tienen)
order by p.id;                                             -- en orden
