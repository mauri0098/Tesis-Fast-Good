-- ============================================================================
-- PRUEBAS de sql/insumos_lotes_fifo.sql (FIFO de insumos por vencimiento, 28/10)
-- Correr DESPUÉS de sql/insumos_lotes_fifo.sql. Seleccioná con el mouse UNA parte (de su primera línea a su "fin")
-- y "Run".
--   A — caso de mentira: crea un insumo "PRUEBA FIFO", le hace compras y salidas, revisa cada paso y DESHACE todo
--   B — comprobar que A no dejó nada (solo lee)
--   C — revisar TODOS los insumos de verdad: saldos = stock y fecha de caducidad bien (solo lee)
-- Ninguna parte cambia un insumo de verdad: A trabaja con su propio insumo de prueba y Postgres lo deshace al final.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. CASO DE MENTIRA (lo deshace todo al final).
--   Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)" y abajo un renglón
--   por paso, cada uno con "sí". Si algún renglón dice "NO", copiámelo.
--   Los pasos (vencimientos contados desde hoy):
--     A1 alta del insumo con 0 → sin lotes y sin fecha de caducidad
--     A2 compra de 500 g que vence en 10 días → un lote de 500; caducidad = +10
--     A3 compra de 2000 g que vence en 30 días → caducidad sigue en +10 (el de 500 vence antes)
--     A4 compra de 300 g sin vencimiento → va al final del FIFO; caducidad sigue en +10
--     A5 TU CASO: salen 1500 g → el de 500 queda en 0, el de 2000 queda en 1000; caducidad = +30
--     A6 salen 1100 g → el de 2000 queda en 0 y el sin vencimiento en 200; caducidad vacía (el único con saldo no vence)
--     A7 salen 900 g → stock −700, todos los lotes en 0, caducidad vacía
--     A8 compra de 2000 g que vence en 60 días → stock 1300 y ese lote nace con 1300 (pagó la deuda de 700); caducidad +60
--     A9 se edita el stock a mano (+100, como Gestión de Stock) → un lote "ajuste" de 100 sin vencimiento; caducidad +60
--     A10 en cada paso: la suma de los saldos = el stock (o 0 si es negativo)
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin     uuid := 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid;   -- tu usuario admin (el que carga las compras)
  v_insumo    integer;                                 -- el insumo de prueba
  v_categoria integer;                                 -- una categoría cualquiera (el insumo necesita una)
  v_hoy       date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;   -- hoy en Argentina
  v_informe   text := '';                              -- un renglón por paso: "A5 … sí"
  v_lotes     text;                                    -- los saldos de los lotes, en orden FIFO (ej: "0 | 1000 | 300")
  v_caducidad date;                                    -- la fecha de caducidad del insumo
  v_stock     numeric;                                 -- el stock del insumo
  v_saldos    numeric;                                 -- la suma de los saldos
  v_compra    jsonb;                                   -- lo que devolvió registrar_compra
  v_bien      boolean;                                 -- si el paso salió como se esperaba
begin
  -- El insumo de prueba (en g, con 0 de stock), en una categoría que ya exista
  select id into v_categoria from categorias_insumos order by id limit 1;
  insert into insumos (nombre, stock_actual, stock_minimo, unidad_medida, activo, fecha_ingreso, id_categoria_insumo)
  values ('PRUEBA FIFO (se borra sola)', 0, 0, 'g', true, now(), v_categoria)
  returning id into v_insumo;

  -- A1. Alta con 0: sin lotes y sin fecha de caducidad
  select count(*)::text into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '0' and v_caducidad is null;
  v_informe := v_informe || E'\nA1 alta con 0 → sin lotes ni caducidad: ' || case when v_bien then 'sí' else 'NO (lotes ' || v_lotes || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  -- A2, A3, A4. Tres compras: 500 (vence +10), 2000 (vence +30) y 300 (sin vencimiento)
  v_compra := registrar_compra(v_admin, v_hoy, 'PRUEBA FIFO', jsonb_build_array(jsonb_build_object('id_insumo', v_insumo, 'cantidad', 500, 'fecha_vencimiento', (v_hoy + 10)::text)));
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := (v_compra->>'ok') = 'true' and v_lotes = '500' and v_caducidad = v_hoy + 10;
  v_informe := v_informe || E'\nA2 compra 500 (vence +10) → lote 500, caducidad +10: ' || case when v_bien then 'sí' else 'NO (' || coalesce(v_compra->>'error', '') || ' lotes ' || coalesce(v_lotes, '-') || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  v_compra := registrar_compra(v_admin, v_hoy, 'PRUEBA FIFO', jsonb_build_array(jsonb_build_object('id_insumo', v_insumo, 'cantidad', 2000, 'fecha_vencimiento', (v_hoy + 30)::text)));
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '500 | 2000' and v_caducidad = v_hoy + 10;
  v_informe := v_informe || E'\nA3 compra 2000 (vence +30) → lotes 500 | 2000, caducidad sigue +10: ' || case when v_bien then 'sí' else 'NO (lotes ' || coalesce(v_lotes, '-') || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  v_compra := registrar_compra(v_admin, v_hoy, 'PRUEBA FIFO', jsonb_build_array(jsonb_build_object('id_insumo', v_insumo, 'cantidad', 300)));
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '500 | 2000 | 300' and v_caducidad = v_hoy + 10;
  v_informe := v_informe || E'\nA4 compra 300 sin vencimiento → al final: 500 | 2000 | 300: ' || case when v_bien then 'sí' else 'NO (lotes ' || coalesce(v_lotes, '-') || ')' end;

  -- A5. TU CASO: salen 1500 (como lo hace producir_viandas: baja el stock). El de 500 se vacía y del siguiente salen 1000
  update insumos set stock_actual = stock_actual - 1500 where id = v_insumo;
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '0 | 1000 | 300' and v_caducidad = v_hoy + 30;
  v_informe := v_informe || E'\nA5 salen 1500 → 0 | 1000 | 300 y caducidad pasa a +30: ' || case when v_bien then 'sí' else 'NO (lotes ' || coalesce(v_lotes, '-') || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  -- A6. Salen 1100: se vacía el de 2000 (le quedaban 1000) y del sin vencimiento salen 100
  update insumos set stock_actual = stock_actual - 1100 where id = v_insumo;
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '0 | 0 | 200' and v_caducidad is null;
  v_informe := v_informe || E'\nA6 salen 1100 → 0 | 0 | 200 y caducidad vacía: ' || case when v_bien then 'sí' else 'NO (lotes ' || coalesce(v_lotes, '-') || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  -- A7. Salen 900 (hay 200): el stock queda en −700 y todos los lotes en 0
  update insumos set stock_actual = stock_actual - 900 where id = v_insumo;
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select stock_actual, fecha_caducidad::date into v_stock, v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '0 | 0 | 0' and v_stock = -700 and v_caducidad is null;
  v_informe := v_informe || E'\nA7 salen 900 → stock −700, lotes 0 | 0 | 0: ' || case when v_bien then 'sí' else 'NO (stock ' || v_stock || ', lotes ' || coalesce(v_lotes, '-') || ')' end;

  -- A8. Compra de 2000 (vence +60) con el stock en −700: el lote nace con 1300 (se paga la deuda)
  v_compra := registrar_compra(v_admin, v_hoy, 'PRUEBA FIFO', jsonb_build_array(jsonb_build_object('id_insumo', v_insumo, 'cantidad', 2000, 'fecha_vencimiento', (v_hoy + 60)::text)));
  select string_agg(cantidad_restante::numeric(12,0)::text, ' | ' order by fecha_vencimiento nulls last, fecha_ingreso, id) into v_lotes from lotes_insumo where id_insumo = v_insumo;
  select stock_actual, fecha_caducidad::date into v_stock, v_caducidad from insumos where id = v_insumo;
  v_bien := v_stock = 1300 and v_lotes = '0 | 0 | 1300 | 0' and v_caducidad = v_hoy + 60;
  v_informe := v_informe || E'\nA8 compra 2000 con −700 → stock 1300, el lote nuevo con 1300, caducidad +60: ' || case when v_bien then 'sí' else 'NO (stock ' || v_stock || ', lotes ' || coalesce(v_lotes, '-') || ', caducidad ' || coalesce(v_caducidad::text, '-') || ')' end;

  -- A9. Se edita el stock a mano (+100, como Gestión de Stock): un lote "ajuste" de 100 sin vencimiento
  update insumos set stock_actual = stock_actual + 100 where id = v_insumo;
  select count(*)::text into v_lotes from lotes_insumo where id_insumo = v_insumo and origen = 'ajuste' and cantidad_restante = 100 and fecha_vencimiento is null;
  select fecha_caducidad::date into v_caducidad from insumos where id = v_insumo;
  v_bien := v_lotes = '1' and v_caducidad = v_hoy + 60;
  v_informe := v_informe || E'\nA9 stock editado +100 → lote "ajuste" de 100, caducidad sigue +60: ' || case when v_bien then 'sí' else 'NO (ajustes ' || v_lotes || ')' end;

  -- A10. La regla: suma de saldos = stock (o 0 si es negativo)
  select coalesce(sum(cantidad_restante), 0) into v_saldos from lotes_insumo where id_insumo = v_insumo;
  select stock_actual into v_stock from insumos where id = v_insumo;
  v_bien := v_saldos = greatest(v_stock, 0);
  v_informe := v_informe || E'\nA10 suma de saldos = stock: ' || case when v_bien then 'sí' else 'NO (saldos ' || v_saldos || ', stock ' || v_stock || ')' end;

  -- Fin: un error a propósito DESHACE todo lo de arriba (el insumo de prueba, sus compras, movimientos y lotes)
  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado)%', v_informe;
end;
$$;
-- fin de la parte A


-- ----------------------------------------------------------------------------
-- B. ¿QUEDÓ ALGO DE A? (solo lee). Tienen que salir 3 ceros.
-- ----------------------------------------------------------------------------
select (select count(*) from insumos where nombre = 'PRUEBA FIFO (se borra sola)') as insumos_de_prueba,   -- 0
       (select count(*) from compras where proveedor = 'PRUEBA FIFO')                  as compras_de_prueba,   -- 0
       (select count(*) from lotes_insumo l
          left join insumos i on i.id = l.id_insumo
         where i.id is null)                                                          as lotes_sueltos;      -- 0
-- fin de la parte B


-- ----------------------------------------------------------------------------
-- C. TODOS LOS INSUMOS DE VERDAD (solo lee): un renglón por insumo, con "coincide" = sí en todos.
--    saldos = la suma de lo que les queda a sus lotes · tiene_que_ser = el stock (o 0 si es negativo)
--    caducidad_esperada = el vencimiento más próximo entre sus lotes con saldo
--    Arriba de todo salen los que NO coinciden (si hay alguno, copiámelo)
-- ----------------------------------------------------------------------------
select i.id,                                             -- número del insumo
       i.nombre,                                         -- su nombre
       coalesce(i.stock_actual, 0)                         as stock,
       coalesce(s.saldos, 0)                               as saldos,
       greatest(coalesce(i.stock_actual, 0), 0)            as tiene_que_ser,
       i.fecha_caducidad::date                             as caducidad,
       s.caducidad_esperada,
       case when coalesce(s.saldos, 0) = greatest(coalesce(i.stock_actual, 0), 0)
             and i.fecha_caducidad::date is not distinct from s.caducidad_esperada
            then 'sí' else 'NO' end                        as coincide
  from insumos i
  left join (select id_insumo,                           -- por insumo: la suma de los saldos y el vencimiento más próximo
                    sum(cantidad_restante) as saldos,
                    min(fecha_vencimiento) filter (where cantidad_restante > 0) as caducidad_esperada
               from lotes_insumo
              group by id_insumo) s on s.id_insumo = i.id
 order by coincide asc, i.nombre;                        -- "NO" va antes que "sí": los que fallan, arriba
-- fin de la parte C
