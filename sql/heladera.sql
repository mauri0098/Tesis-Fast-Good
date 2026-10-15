-- =====================================================
-- HELADERA — LAS 4 ACCIONES (una función de la base por acción)
--   Bloque 1: DESCARTAR → descartar_viandas             (paso H2)  ← ya está
--   Bloque 2: PRODUCIR  → producir_viandas              (paso H3, se agrega después)
--   Bloque 3: DEVOLVER  → anular_pedido_con_devolucion  (paso H4, se agrega después)
--   VENDER no está acá: va adentro de crear_pedido_combos (sql/pedido_combos_funciones.sql, paso H6).
--   Al final se agrega el bloque de marcas "NO USAR" (paso H7).
--
-- Las 4 acciones siguen las mismas reglas:
--   - TODO O NADA: cada función corre entera en una sola transacción. Si devuelve
--     { "ok": false, "error": "..." } es porque frenó ANTES de escribir: no se guardó nada.
--   - CANDADO: antes de tocar el número de un plato se bloquea su fila ("for update").
--     Si llegan dos acciones sobre el mismo plato a la vez, la segunda espera a la primera.
--   - Solo las puede ejecutar el servidor (revoke / grant, al final de cada bloque).
--   - "set search_path = public": buscan las tablas solo en la carpeta de la app.
--   - Nunca los dos signos de pesos juntos adentro del código (ni en comentarios).
--
-- Cómo usarlo: Supabase → SQL Editor → pegá SOLO el bloque del paso que estás haciendo
-- (de "begin;" a "commit;") → "Run". Cada bloque se puede correr más de una vez:
-- "create or replace" pisa la versión anterior.
-- =====================================================


-- =====================================================
-- BLOQUE 1 — DESCARTAR: descartar_viandas (paso H2)
-- Se tiran N viandas de un plato (vencidas, rotas, etc.).
-- Resta de la heladera y anota un renglón "descarte" en el cuaderno (movimientos_viandas).
-- NO toca insumos: ya se gastaron cuando se cocinaron esas viandas.
-- Solo se pueden tirar las viandas LIBRES (las que cuenta stock_heladera):
-- las que ya son de un pedido no están en ese número.
-- Reemplaza a registrar_descarte_vianda (que no exigía el motivo en la base).
--
-- Devuelve: { "ok": true, "id_movimiento": 122, "stock_heladera": 69 }
--        o: { "ok": false, "error": "mensaje claro" }   (no se guardó nada)
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

create or replace function descartar_viandas(          -- crea la función (o la reemplaza si ya existe)
  p_id_producto integer,                               -- qué plato
  p_cantidad    integer,                               -- cuántas viandas se tiran
  p_id_usuario  uuid,                                  -- quién descarta: lo pone el SERVIDOR (sale del token)
  p_motivo      text                                   -- por qué (obligatorio, hasta 200 caracteres)
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_motivo         text;                               -- el motivo sin espacios de más en los bordes
  v_plato          record;                             -- el plato leído de la base (id, nombre, stock_heladera)
  v_id_movimiento  integer;                            -- número del renglón nuevo del cuaderno
  v_stock_heladera integer;                            -- cuántas viandas quedan después de descartar
begin                                                  -- empieza el código

  -- ===================================================
  -- PARTE 1: CONTROLES (no escribe nada)
  -- ===================================================

  -- 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que descarta');  -- ...se corta acá
  end if;                                              -- fin del control 1

  -- 2. La cantidad: un entero mayor a 0
  if p_cantidad is null or p_cantidad <= 0 then        -- si no vino, es 0 o es negativa...
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');  -- ...se corta acá
  end if;                                              -- fin del control 2

  -- 3. El motivo: obligatorio y hasta 200 caracteres (el servidor ya lo controló; la base lo repite)
  v_motivo := btrim(coalesce(p_motivo, ''), E' \t\r\n');  -- saca espacios, tabs y saltos de línea de los bordes (si no vino, queda '')
  if v_motivo = '' then                                -- si quedó vacío...
    return jsonb_build_object('ok', false, 'error', 'El motivo es obligatorio');  -- ...se corta acá
  end if;                                              -- fin de "vacío"
  if char_length(v_motivo) > 200 then                  -- si tiene más de 200 caracteres...
    return jsonb_build_object('ok', false, 'error', 'El motivo admite hasta 200 caracteres');  -- ...se corta acá
  end if;                                              -- fin del control 3

  -- 4. El plato tiene que existir. "for update" = CANDADO: hasta que termine esta función,
  --    nadie más puede cambiar este plato (otro descarte, una venta, una producción).
  --    No se exige que esté activo: las viandas de un plato desactivado también se pueden tirar.
  select id, nombre, stock_heladera                    -- número, nombre y viandas libres del plato
    into v_plato                                       -- se guardan en v_plato
    from productos                                     -- de la tabla de platos
   where id = p_id_producto                            -- el plato pedido
     for update;                                       -- con candado

  if not found then                                    -- si no existe...
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');  -- ...se corta acá
  end if;                                              -- fin del control 4

  -- 5. No se pueden tirar más viandas de las que hay libres
  if v_plato.stock_heladera < p_cantidad then          -- si hay menos de las que se quieren tirar...
    return jsonb_build_object('ok', false, 'error',    -- ...se corta con este mensaje:
      'En la heladera hay ' || v_plato.stock_heladera || ' viandas de «' || v_plato.nombre  -- cuántas hay y de qué plato...
      || '»: no se pueden descartar ' || p_cantidad);  -- ...y cuántas se querían tirar
  end if;                                              -- fin del control 5

  -- ===================================================
  -- PARTE 2: GUARDAR (todo pasó los controles)
  -- Si algo falla desde acá, Postgres deshace todo lo que hizo la función.
  -- ===================================================

  -- 6. El renglón del cuaderno: "descarte", con cantidad NEGATIVA (salen viandas)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)  -- tabla del cuaderno, columnas:
  values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, v_motivo)            -- ej: fideos, Mauri, descarte, −2, "vencidos"
  returning id into v_id_movimiento;                   -- se guarda el número del renglón nuevo

  -- 7. Restar de la heladera
  update productos                                     -- tabla de platos
     set stock_heladera = stock_heladera - p_cantidad  -- ej: 71 − 2 = 69
   where id = p_id_producto                            -- solo este plato
  returning stock_heladera into v_stock_heladera;      -- se guarda cuántas quedaron

  -- 8. Listo: se devuelve el renglón nuevo y cuántas quedaron (lo mismo que devolvía registrar_descarte_vianda)
  return jsonb_build_object(                           -- respuesta:
    'ok',             true,                            -- salió bien
    'id_movimiento',  v_id_movimiento,                 -- número del renglón del cuaderno
    'stock_heladera', v_stock_heladera                 -- viandas que quedaron (la pantalla lo muestra)
  );                                                   -- fin de la respuesta
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: Postgres deja ejecutar cualquier función nueva a todo el mundo.
-- Se le saca el permiso a anon y authenticated (el acceso "de afuera") y queda solo service_role (server.js).
revoke execute on function descartar_viandas(integer, integer, uuid, text)  -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                    -- ...a todos los de afuera
grant execute on function descartar_viandas(integer, integer, uuid, text)   -- da el permiso de ejecutarla...
  to service_role;                                     -- ...solo al servidor

commit;                                                -- cierra el bloque y confirma todo

-- Si al descartar aparece "Could not find the function descartar_viandas", Supabase todavía
-- no la "vio": corré solo esta línea (le avisa que recargue la lista de funciones).
-- notify pgrst, 'reload schema';
