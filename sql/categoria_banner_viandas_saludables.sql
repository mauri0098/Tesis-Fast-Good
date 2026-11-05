-- =====================================================
-- VIANDAS SALUDABLES: LA FOTO DE SU TARJETA (el banner triple de Deportivo, Veggie y Kids)
-- Solo le pone foto a esta categoría. Las demás no se tocan y siguen sin foto. No se renombra nada.
-- Se puede correr dos veces: "imagen is null" no pisa una foto ya cargada.
--
-- ATENCIÓN, ANTES DE CORRERLO: el banner NO está en frontend/src/assets/img.
--   1. Copiá el archivo a frontend/src/assets/img
--   2. Cambiá BANNER-AQUI.jpg, acá abajo, por su nombre real
-- Producción también lee esta columna: mientras el archivo no exista allá, su tarjeta muestra el logo.
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

update public.categorias                                -- en la tabla de categorías…
set imagen = './src/assets/img/BANNER-AQUI.jpg'         -- …guarda esta foto (cambiar por el nombre real del banner)…
where nombre = 'Viandas Saludables'                     -- …solo en esta categoría…
  and imagen is null;                                   -- …sin pisar una foto ya cargada

commit;  -- se aplica todo junto

-- COMPROBACIÓN (solo lee): Viandas Saludables con el banner y las demás categorías sin foto
select id,                                              -- el número de la categoría
       nombre,                                          -- su nombre
       imagen                                           -- su foto (null = usa la del primer plato)
from public.categorias                                  -- de la tabla de categorías
order by id;                                            -- en orden
