-- =====================================================
-- PLANES: GUARDAR LA FOTO QUE CADA UNO USA HOY
-- Hoy la web elige la foto con reglas en el JS (armarFotoTarjeta): plan "mantenimiento" o categoría "saludable".
-- Al dejar de usar las categorías esas reglas se van, así que la foto de cada plan se guarda en planes.imagen
-- y la web se sigue viendo igual.
--   plan 2                → la foto "combo mantenimiento"
--   planes 3, 4, 5, 7 y 8 → la foto "combo saludable"
--   planes 1 y 6          → no se tocan: siguen en null y usan la foto de su primer plato
-- Necesita antes: planes_foto_y_frase.sql (crea la columna planes.imagen).
-- Solo llena planes.imagen. No borra ni renombra nada, y no cambia ninguna otra columna.
-- Se puede correr dos veces: "imagen is null" no pisa una foto ya cargada.
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

-- 1) MANTENIMIENTO: la foto "combo mantenimiento"
update public.planes                                             -- en la tabla de planes…
set imagen = './src/assets/img/combo-mantenimiento-1200.jpg'     -- …guarda esta foto…
where id = 2                                                     -- …en MANTENIMIENTO…
  and imagen is null;                                            -- …sin pisar una foto ya cargada

-- 2) LOS QUE HOY SON "SALUDABLE" POR SU CATEGORÍA: la foto "combo saludable"
-- 3 Deportivo, 4 Veggie y 5 Kids (Viandas Saludables) · 7 Antojos (Pastelería Saludable) · 8 Promo (Combo saludable)
update public.planes                                             -- en la tabla de planes…
set imagen = './src/assets/img/combo-saludable-1200.jpg'         -- …guarda esta foto…
where id in (3, 4, 5, 7, 8)                                      -- …en estos 5 planes…
  and imagen is null;                                            -- …sin pisar una foto ya cargada

commit;  -- se aplica todo junto

-- 3) COMPROBACIÓN (solo lee): tienen que salir 8 renglones
--    1 PLAN DESCENSO DE PESO · null
--    2 MANTENIMIENTO         · ./src/assets/img/combo-mantenimiento-1200.jpg
--    3 PLAN DEPORTIVO        · ./src/assets/img/combo-saludable-1200.jpg
--    4 PLAN VEGGIE           · ./src/assets/img/combo-saludable-1200.jpg
--    5 PLAN KIDS             · ./src/assets/img/combo-saludable-1200.jpg
--    6 SIN TACC              · null
--    7 ANTOJOS SALUDABLES    · ./src/assets/img/combo-saludable-1200.jpg
--    8 PROMO SEMANAL         · ./src/assets/img/combo-saludable-1200.jpg
select id     as id_plan,         -- el número del plan
       nombre as plan,            -- su nombre
       imagen as foto_del_plan    -- la foto guardada (null = usa la de su primer plato)
from public.planes                -- de la tabla de planes
order by id;                      -- en orden
