-- =====================================================
-- INSUMOS DE UN PEDIDO — descontar_insumos_pedido (paso H8, parada 3B: el arreglo C1)
--   Bloque 1: columna nueva movimientos_stock.id_pedido (solo se AGREGA: los renglones viejos quedan vacíos)
--   Bloque 2: la función descontar_insumos_pedido
--
-- QUÉ HACE: cuando un pedido pasa a 3 (Listo para Entregar) o a 4 (Entregado), descuenta DE UNA SOLA VEZ
--   los insumos de lo que cocinó la cocina: receta × (cantidad − cantidad_de_heladera) de cada plato.
--   Las viandas de la heladera no cuentan: gastaron sus insumos cuando se produjeron (paso H1).
--   Ej: 8 fideos de heladera + 2 fideos "sin sal" → la cocina cocina 2 → 600 g de harina integral y 4 huevos.
--
-- Reemplaza a lo que hacía descontarStockPedido en server.js, que:
--   - para saber si ya había descontado buscaba "contiene 'pedido #500'" → también encontraba el #5000,
--     y un movimiento cargado a mano con "pedido #012" en el motivo hacía que el #12 no descuente nunca;
--   - restaba insumo por insumo (si fallaba en el medio, quedaba a medias);
--   - no guardaba quién lo hizo.
-- Ahora: todo o nada, con candado al pedido y a los insumos, y cada renglón queda atado al pedido (id_pedido).
--
-- CONVIVE CON RENDER (rama Rodriguez) hasta el merge: el servidor viejo sigue descontando con su código
-- y, para no descontar dos veces, busca el texto del motivo. Por eso esta función escribe EL MISMO motivo
-- ("Consumo por producción pedido #005") y, para saber si ya se descontó, mira id_pedido O ese texto EXACTO.
--
-- Cómo usarlo: Supabase → SQL Editor → pegá el bloque 1 (de "begin;" a "commit;") → Run, y después el bloque 2.
-- Los dos se pueden correr más de una vez ("if not exists" y "create or replace").
-- Nunca los dos signos de pesos juntos adentro del código de la función (ni en comentarios).
-- =====================================================


-- =====================================================
-- BLOQUE 1 — La columna id_pedido en la libreta de insumos (movimientos_stock)
-- No borra ni cambia nada: agrega una columna vacía, un índice y su cartel.
-- El servidor viejo (Render) no la conoce y la deja vacía: no le molesta.
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

alter table movimientos_stock                          -- la libreta de insumos...
  add column if not exists id_pedido integer           -- ...tiene una columna nueva: de qué pedido es el renglón (vacía en los viejos)
  references pedidos(id);                              -- tiene que ser un pedido que exista

create index if not exists idx_mov_stock_pedido        -- un índice (no cambia lo guardado): hace rápida la búsqueda...
  on movimientos_stock(id_pedido);                     -- ...de los renglones de un pedido ("¿ya se descontó?")

comment on column movimientos_stock.id_pedido is       -- el cartel de la columna (se lee en Supabase)
  'USAR (paso H8, parada 3B). El pedido cuyos platos cocinados gastaron este insumo. La llena descontar_insumos_pedido. Vacía en los renglones viejos y en los del servidor viejo (Render): esos se reconocen por el motivo exacto "Consumo por producción pedido #005".';

commit;                                                -- cierra el bloque y confirma todo


-- =====================================================
-- BLOQUE 2 — descontar_insumos_pedido(p_id_pedido, p_id_usuario)
--
-- QUÉ HACE: descuenta los insumos de lo que cocinó la cocina para un pedido, una sola vez, todo junto.
-- ENTRADA:  p_id_pedido  = el pedido que pasa a 3 o 4
--           p_id_usuario = quién lo pasa (lo pone el SERVIDOR: sale del token)
-- SALIDA:   { "ok": true,  "ya_descontado": false, "insumos": 2 }  → descontó 2 insumos
--           { "ok": true,  "ya_descontado": true,  "insumos": 0 }  → ya estaba descontado: no hizo nada
--           { "ok": false, "error": "mensaje claro" }              → no guardó nada
-- EJEMPLO:  pedido #250 con 8 fideos de heladera + 2 fideos "sin sal" (receta: 300 g de harina integral y 2 huevos)
--           → harina integral −600 g, huevo −4 u, 2 renglones "salida" con id_pedido 250 y motivo
--             "Consumo por producción pedido #250" → { ok: true, ya_descontado: false, insumos: 2 }
--           Si se vuelve a llamar → { ok: true, ya_descontado: true, insumos: 0 } (no descuenta dos veces).
--           Si hay 2 huevos → { ok: false, error: 'Stock insuficiente de "Huevo": se necesitan 4, hay 2 disponibles' }
-- La llama: server.js, descontarStockPedido (al pasar a 3 o 4: PUT /api/pedidos/:id/estado y el ✓ Listo de la cocina).
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

create or replace function descontar_insumos_pedido(   -- crea la función (o la reemplaza si ya existe)
  p_id_pedido  integer,                                -- el pedido que pasa a 3 o 4
  p_id_usuario uuid                                    -- quién lo pasa: lo pone el SERVIDOR (sale del token)
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_pedido  record;                                    -- el pedido leído de la base (número y estado)
  v_motivo  text;                                      -- el texto del motivo, igual al de antes: "Consumo por producción pedido #005"
  v_falta   record;                                    -- el primer insumo al que no le alcanza (si hay alguno)
  v_insumo  record;                                    -- un insumo a descontar: cuánto hace falta y en qué unidad
  v_insumos integer := 0;                              -- cuántos insumos se descontaron (arranca en 0)
begin                                                  -- empieza el código

  -- ===================================================
  -- PARTE 1: CONTROLES Y CANDADOS (no escribe nada)
  -- ===================================================

  -- PASO 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que cambia el estado del pedido');  -- ...se corta acá
  end if;                                              -- fin del paso 1

  -- PASO 2. CANDADO al pedido. Si dos personas lo pasan a 3 a la vez, la segunda espera acá y después
  --         lo encuentra ya descontado. Si alguien lo está anulando, esta función espera a que termine.
  select id, id_estado                                 -- número y estado del pedido
    into v_pedido                                      -- se guardan en v_pedido
    from pedidos                                       -- de la tabla de pedidos
   where id = p_id_pedido                              -- el pedido pedido
     for update;                                       -- con candado

  if not found then                                    -- si no existe...
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');  -- ...se corta acá
  end if;                                              -- fin de "no existe"
  if v_pedido.id_estado = 5 then                       -- si está anulado...
    return jsonb_build_object('ok', false, 'error', 'Un pedido anulado no descuenta insumos');  -- ...se corta acá
  end if;                                              -- fin del paso 2

  -- PASO 3. El motivo, con el número escrito como lo escribía el servidor: con ceros adelante hasta 3 cifras.
  --         Ej: 5 → "#005", 50 → "#050", 500 → "#500", 5000 → "#5000".
  --         Ojo: lpad CORTA el texto si es más largo (lpad de '5000' a 3 da '500'): por eso solo se usa debajo de 100.
  v_motivo := 'Consumo por producción pedido #'        -- el texto de siempre...
              || case when p_id_pedido < 100           -- "case when" = "según sea": con 1 o 2 cifras...
                      then lpad(p_id_pedido::text, 3, '0')  -- ...se completa con ceros (ej: 5 → 005)
                      else p_id_pedido::text end;      -- ...con 3 cifras o más, tal cual (ej: 250)

  -- PASO 4. ¿Ya se descontó? Por id_pedido (los renglones de esta función) o por el motivo EXACTO
  --         (los del servidor viejo de Render y los de antes). Exacto = el #500 nunca encuentra al #5000.
  if exists (select 1                                  -- ¿hay algún renglón...
               from movimientos_stock                  -- ...en la libreta de insumos...
              where id_pedido = p_id_pedido)           -- ...atado a este pedido?
     or exists (select 1                               -- ¿o algún renglón...
                  from movimientos_stock               -- ...en la libreta de insumos...
                 where motivo = v_motivo) then         -- ...con este motivo exacto?
    return jsonb_build_object('ok', true, 'ya_descontado', true, 'insumos', 0);  -- ya estaba: no se hace nada
  end if;                                              -- fin del paso 4

  -- PASO 5. CANDADO a los insumos que se van a usar, en orden de número (como en las otras funciones):
  --         si dos pedidos o una producción usan el mismo insumo, uno espera al otro en vez de trabarse.
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from insumos                                      -- de la tabla de insumos
    where id in (select rec.id_insumo                  -- los insumos de la receta...
                   from pedido_detalles det            -- ...de los platos del pedido...
                   join producto_insumo rec on rec.id_producto = det.id_producto  -- ...(cada plato con su receta)...
                  where det.id_pedido = p_id_pedido    -- ...de este pedido...
                    and det.cantidad - coalesce(det.cantidad_de_heladera, 0) > 0)  -- ...que cocina la cocina
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado

  -- PASO 6. ¿Alcanzan? Se busca el PRIMER insumo (en orden de número) que no alcanza. Si hay uno, se corta
  --         con el mismo mensaje de antes y no se guarda nada.
  --         Por insumo: suma de receta × viandas que cocina la cocina, de todos los platos del pedido.
  select ins.id,                                       -- número del insumo
         coalesce(ins.nombre, ins.id::text) as nombre, -- su nombre (si no tiene, su número, como antes)
         coalesce(ins.stock_actual, 0) as disponible,  -- cuánto hay (vacío = 0)
         sum(coalesce(rec.cantidad_necesaria, 0)       -- cuánto hace falta: receta...
             * (det.cantidad - coalesce(det.cantidad_de_heladera, 0))) as necesario  -- ...× viandas que cocina la cocina
    into v_falta                                       -- se guarda en v_falta
    from pedido_detalles det                           -- los platos del pedido...
    join producto_insumo rec on rec.id_producto = det.id_producto  -- ...con la receta de cada uno...
    join insumos ins on ins.id = rec.id_insumo         -- ...y cada insumo de la receta
   where det.id_pedido = p_id_pedido                   -- solo este pedido
     and det.cantidad - coalesce(det.cantidad_de_heladera, 0) > 0  -- solo lo que cocina la cocina (ej: los 2 "sin sal")
   group by ins.id, ins.nombre, ins.stock_actual       -- un renglón por insumo (si está en varios platos, se suma)
  having coalesce(ins.stock_actual, 0)                 -- se queda solo con los que tienen menos...
         < sum(coalesce(rec.cantidad_necesaria, 0)     -- ...de lo que hace falta
               * (det.cantidad - coalesce(det.cantidad_de_heladera, 0)))
   order by ins.id                                     -- el de número más chico primero (el mismo que avisaba antes)
   limit 1;                                            -- solo el primero

  if found then                                        -- si a alguno no le alcanza...
    return jsonb_build_object('ok', false, 'error',    -- ...se corta con el mismo mensaje de antes:
      'Stock insuficiente de "' || v_falta.nombre      -- de qué insumo,
      || '": se necesitan ' || trim_scale(v_falta.necesario::numeric)   -- cuánto hace falta (trim_scale saca los ceros de más: 600.00 → 600)
      || ', hay ' || trim_scale(v_falta.disponible::numeric) || ' disponibles');  -- y cuánto hay
  end if;                                              -- fin del paso 6

  -- ===================================================
  -- PARTE 2: GUARDAR (todo pasó los controles)
  -- Si algo falla desde acá, Postgres deshace todo lo que hizo la función.
  -- ===================================================

  -- PASO 7. Por cada insumo: se resta del stock y se anota su salida, atada al pedido.
  for v_insumo in                                      -- recorre los insumos a descontar, uno por vuelta:
    select ins.id,                                     -- número del insumo
           ins.unidad_medida,                          -- su unidad (g, ml, u)
           sum(coalesce(rec.cantidad_necesaria, 0)     -- cuánto hace falta: receta...
               * (det.cantidad - coalesce(det.cantidad_de_heladera, 0))) as necesario  -- ...× viandas que cocina la cocina
      from pedido_detalles det                         -- los platos del pedido...
      join producto_insumo rec on rec.id_producto = det.id_producto  -- ...con su receta...
      join insumos ins on ins.id = rec.id_insumo       -- ...y cada insumo
     where det.id_pedido = p_id_pedido                 -- solo este pedido
       and det.cantidad - coalesce(det.cantidad_de_heladera, 0) > 0  -- solo lo que cocina la cocina
     group by ins.id, ins.unidad_medida                -- un renglón por insumo
     order by ins.id                                   -- en el mismo orden que los candados
  loop                                                 -- empieza la vuelta
    if v_insumo.necesario <= 0 then                    -- un insumo con 0 en la receta...
      continue;                                        -- ...no genera movimiento: saltea este y sigue con el siguiente
    end if;                                            -- fin de "0 en la receta"

    update insumos                                     -- tabla de insumos
       set stock_actual = coalesce(stock_actual, 0) - v_insumo.necesario  -- ej: harina 8700 − 600 = 8100
     where id = v_insumo.id;                           -- solo este insumo

    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_pedido)  -- libreta de insumos, columnas:
    values (v_insumo.id,                               -- qué insumo
            'salida',                                  -- salió
            v_insumo.necesario,                        -- cuánto (ej: 600)
            v_insumo.unidad_medida,                    -- en qué unidad (ej: g)
            v_motivo,                                  -- el mismo texto de antes (ej: "Consumo por producción pedido #250")
            now(),                                     -- cuándo
            p_id_usuario,                              -- quién pasó el pedido a 3 o 4
            p_id_pedido);                              -- de qué pedido: así la próxima vez se sabe que ya se descontó

    v_insumos := v_insumos + 1;                        -- un insumo más descontado
  end loop;                                            -- fin del paso 7

  -- PASO 8. Listo: cuántos insumos se descontaron (0 si todo salía de la heladera o los platos no tienen receta)
  return jsonb_build_object(                           -- respuesta:
    'ok',            true,                             -- salió bien
    'ya_descontado', false,                            -- se descontó ahora
    'insumos',       v_insumos                         -- cuántos insumos (ej: 2)
  );                                                   -- fin de la respuesta
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: Postgres deja ejecutar cualquier función nueva a todo el mundo.
-- Se le saca el permiso a los de afuera (anon y authenticated) y queda solo service_role (server.js).
revoke execute on function descontar_insumos_pedido(integer, uuid)  -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                    -- ...a todos los de afuera
grant execute on function descontar_insumos_pedido(integer, uuid)   -- da el permiso de ejecutarla...
  to service_role;                                     -- ...solo al servidor

comment on function descontar_insumos_pedido(integer, uuid) is  -- el cartel "USAR" (como las otras 4, paso H7)
  'USAR. INSUMOS DE UN PEDIDO (paso H8, parada 3B): al pasar a 3 o 4 descuenta una sola vez receta × (cantidad − cantidad_de_heladera), todo junto, con id_pedido. Ya descontado = id_pedido o motivo exacto. La llama descontarStockPedido (server.js).';

commit;                                                -- cierra el bloque y confirma todo

-- Si al pasar un pedido a 3 aparece "Could not find the function descontar_insumos_pedido", Supabase todavía
-- no la "vio": corré solo esta línea (le avisa que recargue la lista de funciones).
-- notify pgrst, 'reload schema';
