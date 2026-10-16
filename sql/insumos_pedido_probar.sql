-- =====================================================
-- PRUEBAS de descontar_insumos_pedido (sql/insumos_pedido.sql, paso H8 parada 3B)
-- Correr DESPUÉS de los bloques 1 y 2 de sql/insumos_pedido.sql.
-- Seleccioná con el mouse UNA parte (de su primera línea a su "fin") y "Run".
--   A — casos que fallan (no escribe nada)
--   B — caso de mentira: descuenta de verdad adentro de un bloque y lo DESHACE al final
--   C — comprobar que B no dejó nada (solo lee)
-- Ninguna parte toca un pedido real de tu prima: B crea sus pedidos de prueba adentro del bloque
-- y Postgres los deshace al terminar (solo se saltean números de pedido).
-- =====================================================


-- -----------------------------------------------------
-- A. CASOS QUE FALLAN (no escribe nada). Tienen que salir 3 filas con coincide = "sí".
--    A1 sin usuario · A2 un pedido que no existe · A3 el pedido #5 (anulado en H4)
-- -----------------------------------------------------
select caso,                                           -- qué se prueba
       resultado,                                      -- lo que respondió la función
       esperado,                                       -- lo que tenía que responder
       case when resultado = esperado then 'sí' else 'NO' end as coincide  -- ¿coinciden?
  from (                                               -- las 3 pruebas, una por fila:
    select 'A1 sin usuario' as caso,                   -- 1) sin usuario
           descontar_insumos_pedido(5, null) ->> 'error' as resultado,  -- (corta antes de mirar el pedido)
           'Falta el usuario que cambia el estado del pedido' as esperado
    union all
    select 'A2 pedido que no existe',                  -- 2) un número de pedido que no existe
           descontar_insumos_pedido(2147483647, 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid) ->> 'error',
           'El pedido no existe'
    union all
    select 'A3 pedido anulado (#5)',                   -- 3) el #5, que quedó anulado en la prueba de H4
           descontar_insumos_pedido(5, 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid) ->> 'error',
           'Un pedido anulado no descuenta insumos'
  ) pruebas;                                           -- fin de la parte A


-- -----------------------------------------------------
-- B. CASO DE MENTIRA: descuenta, "ya descontado" y convive con Render. DESHACE todo al final.
--   B1) pedido con 8 fideos + 2 fideos "sin sal" → descuenta la receta × 2 (600 g de harina integral y 4 huevos)
--       y deja renglones con id_pedido. Si no alcanza (Huevo en negativo), B1 muestra el error "Stock insuficiente…".
--   B2) la segunda vez → ya_descontado: true y el stock no cambia otra vez.
--   B3) pedido con 10 fideos (todo de heladera) y un renglón "viejo" con el motivo exacto, como lo escribe
--       Render ("Consumo por producción pedido #N", sin id_pedido) → ya_descontado: true.
--   B4) anulado → "Un pedido anulado no descuenta insumos".
-- Tiene que salir un ERROR en rojo que empieza con "FIN DE LA PRUEBA (no quedó nada guardado)".
-- Lo comprobás con C.
-- -----------------------------------------------------
do $$                                                  -- bloque de prueba: corre todo junto, como una función que no se guarda
declare                                                -- variables del bloque:
  v_cliente   uuid := 'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid;  -- "Consumidor Final" (el que compra, como en la web)
  v_admin     uuid := 'd9b1ae00-fda5-4488-86b3-90d769b47a02'::uuid;  -- tu usuario admin (el que pasa el pedido a 3)
  v_fideos    integer;                                 -- número del plato "fideos"
  v_cantidad  integer;                                 -- viandas del combo de prueba (ej: 10)
  v_antes     text;                                    -- los insumos de la receta de fideos ANTES (nombre y stock)
  v_despues   text;                                    -- los mismos insumos DESPUÉS de B1
  v_despues2  text;                                    -- los mismos insumos DESPUÉS de B2 (tienen que ser iguales a v_despues)
  v_pedido_1  jsonb;                                   -- lo que devolvió crear el pedido de B1
  v_pedido_3  jsonb;                                   -- lo que devolvió crear el pedido de B3
  v_id_1      integer;                                 -- número del pedido de B1
  v_id_3      integer;                                 -- número del pedido de B3
  v_r1        jsonb;                                   -- B1: primera vez
  v_r2        jsonb;                                   -- B2: segunda vez
  v_r3        jsonb;                                   -- B3: con el renglón "viejo"
  v_r4        jsonb;                                   -- B4: anulado
  v_renglones text;                                    -- los renglones con id_pedido del pedido de B1
  v_insumo    integer;                                 -- un insumo cualquiera de la receta (para el renglón "viejo" de B3)
begin                                                  -- empieza el bloque
  select cp.id_producto into v_fideos                  -- busca el número de "fideos"...
    from combo_productos cp                            -- ...en el menú de los combos...
    join productos p on p.id = cp.id_producto          -- ...con su plato...
   where cp.id_combo = 1 and p.nombre = 'fideos';      -- ...del combo de prueba

  select cantidad into v_cantidad from combos where id = 1;  -- viandas del combo de prueba (ej: 10)

  select string_agg(ins.nombre || ' ' || trim_scale(coalesce(ins.stock_actual, 0)::numeric), ' · ' order by ins.id)  -- "Harina integral 8700 · Huevo 40"
    into v_antes                                       -- se guarda en v_antes
    from producto_insumo rec                           -- la receta...
    join insumos ins on ins.id = rec.id_insumo         -- ...con cada insumo
   where rec.id_producto = v_fideos;                   -- ...de fideos

  -- B1) pedido con 8 fideos + 2 "sin sal" (adentro del bloque: se deshace al final)
  v_pedido_1 := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,
                  'Efectivo', 'Retiro en local', null, 'PRUEBA C1 – se deshace sola',
                  jsonb_build_array(jsonb_build_object('id_combo', 1, 'platos', jsonb_build_array(
                    jsonb_build_object('producto_id', v_fideos, 'cantidad', v_cantidad - 2),            -- 8 de heladera
                    jsonb_build_object('producto_id', v_fideos, 'cantidad', 2, 'personalizado', 'sin sal')))));  -- 2 "sin sal"
  if not coalesce((v_pedido_1 ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido de B1 → %', v_pedido_1;  -- ...frena y muestra por qué
  end if;                                              -- fin de "no se pudo"
  v_id_1 := (v_pedido_1 ->> 'id_pedido')::integer;     -- el número del pedido de B1

  v_r1 := descontar_insumos_pedido(v_id_1, v_admin);   -- B1: primera vez

  select string_agg(ins.nombre || ' ' || trim_scale(coalesce(ins.stock_actual, 0)::numeric), ' · ' order by ins.id)
    into v_despues                                     -- los insumos después de B1
    from producto_insumo rec join insumos ins on ins.id = rec.id_insumo
   where rec.id_producto = v_fideos;

  select string_agg(format('%s −%s %s · "%s"', ins.nombre, trim_scale(mov.cantidad::numeric), coalesce(mov.unidad, ''), mov.motivo), ' | ' order by mov.id)
    into v_renglones                                   -- los renglones atados al pedido de B1
    from movimientos_stock mov
    join insumos ins on ins.id = mov.id_insumo
   where mov.id_pedido = v_id_1;

  -- B2) la segunda vez: ya_descontado, y el stock no cambia
  v_r2 := descontar_insumos_pedido(v_id_1, v_admin);
  select string_agg(ins.nombre || ' ' || trim_scale(coalesce(ins.stock_actual, 0)::numeric), ' · ' order by ins.id)
    into v_despues2
    from producto_insumo rec join insumos ins on ins.id = rec.id_insumo
   where rec.id_producto = v_fideos;

  -- B3) pedido con 10 fideos de heladera + un renglón "viejo" con el motivo exacto, como lo escribe Render
  v_pedido_3 := crear_pedido_combos(v_cliente, 'PRUEBA – NO PREPARAR', 'Prueba', '0', '', current_date + 7,
                  'Efectivo', 'Retiro en local', null, 'PRUEBA C1 – se deshace sola',
                  jsonb_build_array(jsonb_build_object('id_combo', 1, 'platos', jsonb_build_array(
                    jsonb_build_object('producto_id', v_fideos, 'cantidad', v_cantidad)))));
  if not coalesce((v_pedido_3 ->> 'ok')::boolean, false) then  -- si no se pudo crear...
    raise exception 'FIN DE LA PRUEBA: no se pudo crear el pedido de B3 → %', v_pedido_3;
  end if;
  v_id_3 := (v_pedido_3 ->> 'id_pedido')::integer;

  select min(id_insumo) into v_insumo from producto_insumo where id_producto = v_fideos;  -- un insumo de la receta
  insert into movimientos_stock (id_insumo, tipo, cantidad, motivo, fecha)  -- el renglón "viejo" (sin id_pedido ni usuario)
  values (v_insumo, 'salida', 1,
          'Consumo por producción pedido #' || case when v_id_3 < 100 then lpad(v_id_3::text, 3, '0') else v_id_3::text end,
          now());
  v_r3 := descontar_insumos_pedido(v_id_3, v_admin);   -- tiene que decir ya_descontado: true

  -- B4) anulado: se anula el pedido de B3 con la función de H4 y se prueba otra vez
  perform anular_pedido_con_devolucion(v_id_3, v_admin);
  v_r4 := descontar_insumos_pedido(v_id_3, v_admin);

  raise exception 'FIN DE LA PRUEBA (no quedó nada guardado) → insumos antes: % · B1) pedido #% → % · después: % · renglones: % · B2) % · después: % · B3) pedido #% con renglón viejo → % · B4) anulado → %',
    v_antes, v_id_1, v_r1, v_despues, v_renglones, v_r2, v_despues2, v_id_3, v_r3, v_r4;  -- frena A PROPÓSITO: Postgres deshace todo
end;                                                   -- fin del bloque
$$;                                                    -- fin del bloque de prueba


-- -----------------------------------------------------
-- C. COMPROBAR que B no dejó nada (solo lee). Las dos columnas tienen que dar 0.
--    (renglones_con_id_pedido da 0 solo mientras ningún pedido de verdad haya pasado a 3 o 4 con el servidor nuevo.)
-- -----------------------------------------------------
select (select count(*)                                -- cuántos pedidos...
          from pedidos                                 -- ...de la tabla de pedidos...
         where observaciones = 'PRUEBA C1 – se deshace sola') as pedidos_de_prueba,  -- ...son de B (tiene que dar 0)
       (select count(*)                                -- cuántos renglones...
          from movimientos_stock                       -- ...de la libreta de insumos...
         where id_pedido is not null) as renglones_con_id_pedido;  -- ...tienen pedido (tiene que dar 0 por ahora)
