-- =====================================================================================================
-- LIMPIAR EL CATÁLOGO (13/11/2026) · BORRA DE VERDAD (los datos son de prueba) · YA CORRIDO por Mauri el 13/11
-- Revisado en el chat con las consultas de mirar (resultados reales de la base).
--
-- Quedó:   la categoría 4 "Combo saludable"
--          los planes 1 PLAN DESCENSO DE PESO, 2 MANTENIMIENTO, 6 SIN TACC, 7 ANTOJOS SALUDABLES, 8 PROMO SEMANAL
--          el plan 9 PRUEBA DESACTIVADO: sus 6 platos están usados en pedidos, heladera y recetas de prueba,
--          y en la base todo plato TIENE que tener plan (productos.id_plan no puede quedar vacío).
--          Se borra junto con sus platos en la limpieza grande de pedidos.
-- Se borró: las categorías 1, 2, 3 y 5 · los planes 3 PLAN DEPORTIVO, 4 PLAN VEGGIE, 5 PLAN KIDS
--           · TODOS los combos, con su menú y su parte en los pedidos de prueba.
--
-- Las relaciones que hay en la base (revisado): planes → categorias · productos → planes · combos → planes
--   · combo_productos → combos · pedido_combos → combos · pedido_detalles → pedido_combos
-- Es TODO O NADA: si algo falla, no cambia nada.
-- =====================================================================================================
begin;                                                               -- empieza: si algo falla, no se aplica nada

-- 1) Control: la categoría y los 5 planes que se quedan tienen que existir. Si falta alguno, FRENA.
do $$
begin
  if (select count(*) from categorias where id = 4) <> 1 then        -- ¿falta la categoría 4? SÍ: frena · NO: sigue
    raise exception 'No está la categoría 4 (Combo saludable): no se borra nada';
  end if;
  if (select count(*) from planes where id in (1, 2, 6, 7, 8)) <> 5 then   -- ¿falta alguno de los 5 planes? SÍ: frena
    raise exception 'Falta alguno de los planes 1, 2, 6, 7 u 8: no se borra nada';
  end if;
end
$$;

-- 2) COMBOS (todos). De abajo hacia arriba: primero lo que apunta al combo, al final el combo.
delete from pedido_detalles where id_pedido_combo is not null;       -- los platos de los pedidos que eran de un combo
delete from pedido_combos;                                           -- los combos comprados en los pedidos
delete from combo_productos;                                         -- el menú de cada combo
delete from combos;                                                  -- los combos

-- 3) PLANES: se borran 3, 4 y 5 (no tienen platos). El 9 PRUEBA tiene platos usados: queda desactivado.
delete from planes where id in (3, 4, 5);                            -- se borran los 3 planes sin platos
update planes set activo = false where id = 9;                       -- PRUEBA: desactivado (no se ve ni se vende)

-- 4) CATEGORÍAS: se borran 1, 2, 3 y 5
update planes set id_categoria = null                                -- los planes que estaban en esas categorías
 where id_categoria in (1, 2, 3, 5);                                 -- (ANTOJOS y PRUEBA) quedan "sin categoría"
delete from categorias where id in (1, 2, 3, 5);                     -- se borran las 4 categorías

commit;                                                              -- se guarda todo junto

-- 5) Cómo quedó (para mirar)
select 'categoría' as que, id, nombre, activo from categorias        -- quedó: Combo saludable
union all
select 'plan', id, nombre, activo from planes                        -- quedaron: los 5 activos y PRUEBA desactivado
union all
select 'combo', id, nombre, activo from combos                       -- quedó vacío
order by que, id;                                                    -- ordenado
