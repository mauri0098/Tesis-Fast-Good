-- =====================================================
-- HELADERA — LAS 4 ACCIONES (una función de la base por acción)
--   Bloque 1: DESCARTAR → descartar_viandas             (paso H2)  ← ya está
--   Bloque 2: PRODUCIR  → producir_viandas              (paso H3)  ← ya está
--   Bloque 3: DEVOLVER  → anular_pedido_con_devolucion  (paso H4)  ← ya está
--   VENDER no está acá: va adentro de crear_pedido_combos (sql/pedido_combos_funciones.sql, paso H6).
--   Bloque 4: marcas "NO USAR" (las viejas) y "USAR" (las nuevas) (paso H7)  ← ya está
--   Los insumos de un pedido (al pasar a 3 o 4) están en sql/insumos_pedido.sql (paso H8, parada 3B).
--
-- Paso H9 (refactor para entender): cada función tiene arriba QUÉ HACE, ENTRADA, SALIDA y un ejemplo con
-- fideos, y adentro PASO 1, PASO 2… Lo que hacen NO cambió: mismas entradas, mismas salidas, mismos mensajes.
-- El único cambio de forma: anular_pedido_con_devolucion arma la lista de lo que vuelve UNA vez (v_devuelve)
-- en lugar de repetir la misma consulta para los candados y para devolver.
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
-- BLOQUE 1 — DESCARTAR: descartar_viandas (paso H2, ordenada en H9)
--
-- QUÉ HACE: se tiran N viandas de un plato (vencidas, rotas, etc.). Resta de la heladera y anota un
--           renglón "descarte" en el cuaderno (movimientos_viandas). NO toca insumos: ya se gastaron
--           cuando se cocinaron. Solo se pueden tirar las viandas LIBRES (las que cuenta stock_heladera):
--           las reservadas ya son de un pedido y no están en ese número.
-- ENTRADA:  p_id_producto = qué plato · p_cantidad = cuántas (entero mayor a 0)
--           p_id_usuario  = quién descarta (lo pone el SERVIDOR: sale del token)
--           p_motivo      = por qué (obligatorio, hasta 200 caracteres)
-- SALIDA:   { "ok": true, "id_movimiento": 122, "stock_heladera": 69 }
--           o { "ok": false, "error": "mensaje claro" }   (no se guardó nada)
-- EJEMPLO:  fideos con 71 libres, 2 "vencidas" → renglón "descarte" −2 → { ok: true, stock_heladera: 69 }
--           fideos con 71 libres, 80           → 'En la heladera hay 71 viandas de «fideos»: no se pueden descartar 80'
-- La llama: POST /api/viandas-stock/descarte (server.js). Reemplaza a registrar_descarte_vianda.
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

  -- PASO 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que descarta');  -- ...se corta acá
  end if;                                              -- fin del paso 1

  -- PASO 2. La cantidad: un entero mayor a 0
  if p_cantidad is null or p_cantidad <= 0 then        -- si no vino, es 0 o es negativa...
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');  -- ...se corta acá
  end if;                                              -- fin del paso 2

  -- PASO 3. El motivo: obligatorio y hasta 200 caracteres (el servidor ya lo controló; la base lo repite)
  v_motivo := btrim(coalesce(p_motivo, ''), E' \t\r\n');  -- saca espacios, tabs y saltos de línea de los bordes (si no vino, queda '')
  if v_motivo = '' then                                -- si quedó vacío...
    return jsonb_build_object('ok', false, 'error', 'El motivo es obligatorio');  -- ...se corta acá
  end if;                                              -- fin de "vacío"
  if char_length(v_motivo) > 200 then                  -- si tiene más de 200 caracteres...
    return jsonb_build_object('ok', false, 'error', 'El motivo admite hasta 200 caracteres');  -- ...se corta acá
  end if;                                              -- fin del paso 3

  -- PASO 4. El plato tiene que existir. "for update" = CANDADO: hasta que termine esta función,
  --    nadie más puede cambiar este plato (otro descarte, una venta, una producción).
  --    No se exige que esté activo: las viandas de un plato desactivado también se pueden tirar.
  select id, nombre, stock_heladera                    -- número, nombre y viandas libres del plato
    into v_plato                                       -- se guardan en v_plato
    from productos                                     -- de la tabla de platos
   where id = p_id_producto                            -- el plato pedido
     for update;                                       -- con candado

  if not found then                                    -- si no existe...
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');  -- ...se corta acá
  end if;                                              -- fin del paso 4

  -- PASO 5. No se pueden tirar más viandas de las que hay libres
  if v_plato.stock_heladera < p_cantidad then          -- si hay menos de las que se quieren tirar...
    return jsonb_build_object('ok', false, 'error',    -- ...se corta con este mensaje:
      'En la heladera hay ' || v_plato.stock_heladera || ' viandas de «' || v_plato.nombre  -- cuántas hay y de qué plato...
      || '»: no se pueden descartar ' || p_cantidad);  -- ...y cuántas se querían tirar
  end if;                                              -- fin del paso 5

  -- ===================================================
  -- PARTE 2: GUARDAR (todo pasó los controles)
  -- Si algo falla desde acá, Postgres deshace todo lo que hizo la función.
  -- ===================================================

  -- PASO 6. El renglón del cuaderno: "descarte", con cantidad NEGATIVA (salen viandas)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)  -- tabla del cuaderno, columnas:
  values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, v_motivo)            -- ej: fideos, Mauri, descarte, −2, "vencidos"
  returning id into v_id_movimiento;                   -- se guarda el número del renglón nuevo

  -- PASO 7. Restar de la heladera
  update productos                                     -- tabla de platos
     set stock_heladera = stock_heladera - p_cantidad  -- ej: 71 − 2 = 69
   where id = p_id_producto                            -- solo este plato
  returning stock_heladera into v_stock_heladera;      -- se guarda cuántas quedaron

  -- PASO 8. Listo: se devuelve el renglón nuevo y cuántas quedaron (lo mismo que devolvía registrar_descarte_vianda)
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


-- =====================================================
-- BLOQUE 2 — PRODUCIR: producir_viandas (paso H3, ordenada en H9)
--
-- QUÉ HACE: la cocina terminó un plato de un pedido a cocina y toca "Hecho":
--             - entran N viandas a la heladera (renglón "produccion" en el cuaderno),
--             - se descuentan los insumos de la receta × N: es la ÚNICA vez que esas viandas gastan insumos,
--             - el renglón del pedido a cocina queda hecho.
--           NO frena si falta un insumo: las viandas ya están cocinadas. El insumo queda en negativo
--           (la señal de que falta cargar una compra) y se avisa. Sin receta, entran igual y se avisa.
-- ENTRADA:  p_id_detalle = el renglón del pedido a cocina que se terminó
--           p_id_usuario = quién toca "Hecho" (lo pone el SERVIDOR: sale del token)
-- SALIDA:   { "ok": true, "id_movimiento": 140, "stock_heladera": 73,
--             "avisos": [ { "tipo": "insumo_corto", "nombre": "Huevo", "falta": 39, ... } ] }
--           o { "ok": false, "error": "mensaje claro" }   (no se guardó nada)
-- EJEMPLO:  "Pedido a cocina #9: 2 fideos" (receta: 300 g de harina integral y 2 huevos) →
--           fideos 71 → 73, harina integral −600 g, huevo −4 u, renglón "produccion" +2 "Pedido a cocina #9".
--           Si ya estaba hecho → 'Este plato ya estaba marcado como hecho'.
-- La llama: POST /api/ordenes-produccion/detalles/:id/hecho (server.js).
-- Reemplaza a marcar_detalle_hecho + aplicar_produccion_viandas (dos funciones → una), con los
-- mismos textos y los mismos enlaces, así "Hecho hoy" y Movimientos de Stock se ven igual que antes.
-- No mira id_pedido_detalle: nadie la usa (lo mostró el paso H0).
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

create or replace function producir_viandas(           -- crea la función (o la reemplaza si ya existe)
  p_id_detalle integer,                                -- el renglón del pedido a cocina que se terminó
  p_id_usuario uuid                                    -- quién toca "Hecho": lo pone el SERVIDOR (sale del token)
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_detalle        record;                             -- el renglón del pedido a cocina (pedido, plato, cantidad, si está hecho)
  v_plato          text;                               -- el nombre del plato
  v_cant_receta    integer;                            -- cuántos insumos tiene la receta del plato
  v_insumo         record;                             -- un insumo de la receta: cuánto hay y cuánto hace falta
  v_avisos         jsonb := '[]'::jsonb;               -- avisos para la pantalla (lista vacía al empezar)
  v_id_movimiento  integer;                            -- número del renglón nuevo del cuaderno
  v_stock_heladera integer;                            -- cuántas viandas hay después de producir
begin                                                  -- empieza el código

  -- ===================================================
  -- PARTE 1: CONTROLES Y CANDADOS (no escribe nada)
  -- ===================================================

  -- PASO 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que marca el plato');  -- ...se corta acá
  end if;                                              -- fin del paso 1

  -- PASO 2. CANDADO al renglón del pedido a cocina. Si dos personas tocan "Hecho" a la vez,
  --    la segunda espera acá y después lo encuentra ya hecho.
  select id, id_orden_produccion, id_producto, cantidad, hecho  -- número, pedido a cocina, plato, viandas y si está hecho
    into v_detalle                                     -- se guardan en v_detalle
    from orden_produccion_detalles                     -- de la tabla de platos de los pedidos a cocina
   where id = p_id_detalle                             -- el renglón pedido
     for update;                                       -- con candado

  if not found then                                    -- si no existe...
    return jsonb_build_object('ok', false, 'error', 'El plato del pedido no existe');  -- ...se corta acá
  end if;                                              -- fin de "no existe"
  if v_detalle.hecho then                              -- si ya estaba hecho...
    return jsonb_build_object('ok', false, 'error', 'Este plato ya estaba marcado como hecho');  -- ...se corta acá (no se suma dos veces)
  end if;                                              -- fin del paso 2

  -- PASO 3. CANDADO al plato (siempre primero el plato y después los insumos, como en todas las funciones).
  --    No se exige que esté activo: se puede marcar aunque lo hayan desactivado después de pedirlo.
  select nombre                                        -- el nombre del plato
    into v_plato                                       -- se guarda en v_plato
    from productos                                     -- de la tabla de platos
   where id = v_detalle.id_producto                    -- el plato del renglón
     for update;                                       -- con candado

  if not found then                                    -- si el plato no existe (no debería pasar)...
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');  -- ...se corta acá
  end if;                                              -- fin del paso 3

  -- PASO 4. CANDADO a los insumos de la receta, ordenados por número: si dos producciones
  --    comparten un insumo, una espera a la otra en vez de trabarse las dos.
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from insumos                                      -- de la tabla de insumos
    where id in (select id_insumo                      -- los insumos...
                   from producto_insumo                -- ...de la receta...
                  where id_producto = v_detalle.id_producto)  -- ...de este plato
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado

  -- PASO 5. ¿Tiene receta? Si no tiene, NO frena: las viandas entran igual (sin gastar insumos) y se avisa.
  select count(*)                                      -- cuenta los insumos...
    into v_cant_receta                                 -- ...y lo guarda en v_cant_receta
    from producto_insumo                               -- ...de la tabla de recetas...
   where id_producto = v_detalle.id_producto;          -- ...de este plato
  if v_cant_receta = 0 then                            -- si no tiene receta...
    v_avisos := v_avisos || jsonb_build_object(        -- ...se agrega un aviso:
      'tipo',    'sin_receta',                         -- de este tipo
      'mensaje', 'El plato no tiene receta: entraron las viandas sin descontar insumos');  -- con este texto (el mismo de antes)
  end if;                                              -- fin del paso 5

  -- ===================================================
  -- PARTE 2: GUARDAR
  -- Si algo falla desde acá, Postgres deshace todo lo que hizo la función.
  -- ===================================================

  -- PASO 6. El renglón del cuaderno: "produccion", con cantidad POSITIVA (entran viandas)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)  -- tabla del cuaderno, columnas:
  values (v_detalle.id_producto,                       -- el plato
          p_id_usuario,                                -- quién tocó "Hecho"
          'produccion',                                -- el tipo
          v_detalle.cantidad,                          -- cuántas entran (ej: +2)
          'Pedido a cocina #' || v_detalle.id_orden_produccion)  -- ej: "Pedido a cocina #9" (el mismo texto de antes)
  returning id into v_id_movimiento;                   -- se guarda el número del renglón nuevo

  -- PASO 7. Los insumos: por cada uno de la receta se resta receta × viandas y se anota su salida
  for v_insumo in                                      -- recorre los insumos de la receta, uno por vuelta:
    select ins.id,                                     -- número del insumo
           ins.nombre,                                 -- su nombre (para el aviso)
           ins.unidad_medida,                          -- su unidad (g, ml, u)
           coalesce(ins.stock_actual, 0) as disponible,  -- cuánto hay (vacío = 0)
           sum(coalesce(rec.cantidad_necesaria, 0)) * v_detalle.cantidad as necesario  -- cuánto hace falta: receta × viandas
      from producto_insumo rec                         -- la receta...
      join insumos ins on ins.id = rec.id_insumo       -- ...con cada insumo
     where rec.id_producto = v_detalle.id_producto     -- solo la receta de este plato
     group by ins.id, ins.nombre, ins.unidad_medida, ins.stock_actual  -- si un insumo está dos veces en la receta, se suma
     order by ins.id                                   -- siempre en el mismo orden
  loop                                                 -- empieza la vuelta
    if v_insumo.necesario <= 0 then                    -- un insumo con 0 en la receta...
      continue;                                        -- ...no genera movimiento: saltea este y sigue con el siguiente
    end if;                                            -- fin de "0 en la receta"

    if v_insumo.disponible < v_insumo.necesario then   -- si no alcanza, se descuenta IGUAL (queda en negativo) y se avisa:
      v_avisos := v_avisos || jsonb_build_object(      -- se agrega un aviso
        'tipo',       'insumo_corto',                  -- de este tipo (la pantalla lo muestra como "Faltaron 2 kg de Pollo")
        'id_insumo',  v_insumo.id,                     -- qué insumo
        'nombre',     v_insumo.nombre,                 -- su nombre
        'unidad',     v_insumo.unidad_medida,          -- su unidad
        'necesario',  v_insumo.necesario,              -- cuánto hacía falta
        'disponible', v_insumo.disponible,             -- cuánto había
        'falta',      v_insumo.necesario - v_insumo.disponible);  -- cuánto faltó
    end if;                                            -- fin de "no alcanza"

    update insumos                                     -- tabla de insumos
       set stock_actual = coalesce(stock_actual, 0) - v_insumo.necesario  -- ej: harina 5000 − 200 = 4800
     where id = v_insumo.id;                           -- solo este insumo

    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_movimiento_vianda)  -- libreta de insumos, columnas:
    values (v_insumo.id,                               -- qué insumo
            'salida',                                  -- salió
            v_insumo.necesario,                        -- cuánto (ej: 200)
            v_insumo.unidad_medida,                    -- en qué unidad (ej: g)
            'Producción pedido a cocina #' || v_detalle.id_orden_produccion  -- por qué: "Producción pedido a cocina #9: 2 fideos"...
              || ': ' || v_detalle.cantidad || ' ' || v_plato,               -- ...(el mismo texto de antes)
            now(),                                     -- cuándo
            p_id_usuario,                              -- quién
            v_id_movimiento);                          -- atada al renglón del paso 6: así se sabe qué gastó esta producción
  end loop;                                            -- fin de los insumos

  -- PASO 8. Sumar las viandas a la heladera
  update productos                                     -- tabla de platos
     set stock_heladera = stock_heladera + v_detalle.cantidad  -- ej: 71 + 2 = 73
   where id = v_detalle.id_producto                    -- solo este plato
  returning stock_heladera into v_stock_heladera;      -- se guarda cuántas hay ahora

  -- PASO 9. El renglón del pedido a cocina queda hecho, con la hora y el renglón del cuaderno que generó
  update orden_produccion_detalles                     -- tabla de platos de los pedidos a cocina
     set hecho                = true,                  -- hecho
         fecha_hecho          = now(),                 -- ahora
         id_movimiento_vianda = v_id_movimiento        -- el renglón "produccion" (lo usan "Hecho hoy" y Movimientos de Stock)
   where id = p_id_detalle;                            -- solo este renglón

  -- PASO 10. Listo: lo mismo que devolvía marcar_detalle_hecho
  return jsonb_build_object(                           -- respuesta:
    'ok',             true,                            -- salió bien
    'id_movimiento',  v_id_movimiento,                 -- número del renglón del cuaderno
    'stock_heladera', v_stock_heladera,                -- viandas que hay ahora
    'avisos',         v_avisos                         -- avisos (lista vacía si no faltó nada)
  );                                                   -- fin de la respuesta
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: igual que en el bloque 1, solo la ejecuta el servidor (service_role)
revoke execute on function producir_viandas(integer, uuid)  -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                    -- ...a todos los de afuera
grant execute on function producir_viandas(integer, uuid)   -- da el permiso de ejecutarla...
  to service_role;                                     -- ...solo al servidor

commit;                                                -- cierra el bloque y confirma todo

-- Si al tocar "Hecho" aparece "Could not find the function producir_viandas", Supabase todavía
-- no la "vio": corré solo esta línea (le avisa que recargue la lista de funciones).
-- notify pgrst, 'reload schema';


-- =====================================================
-- BLOQUE 3 — DEVOLVER: anular_pedido_con_devolucion (paso H4, ordenada en H9)
--
-- QUÉ HACE: anula un pedido (el PIN lo controla el servidor ANTES de llamarla):
--             - si está en 1, 2 o 3, vuelven a la heladera las viandas que sacó (renglón "devolucion"),
--             - si está en 4 (entregado), no vuelve nada: las viandas se fueron con el cliente,
--             - el pedido pasa a 5 (Cancelado). Un pedido en 5 no se puede anular otra vez.
--           Lo que vuelve sale del CUADERNO de ese pedido: sus ventas (negativas) + sus devoluciones (positivas).
--           Así nunca vuelve más de lo que se llevó, aunque alguien lo saque de 5 y lo vuelva a anular.
--           NO toca insumos (lo cocinado no se "descocina") ni pedido_detalles.
--           Los personalizados no tienen renglón "venta" (no salen de la heladera): no vuelven.
--           Los pedidos de la web vieja, y los de combos de antes de H6, no tienen ventas: se anulan sin
--           devolver nada.
-- ENTRADA:  p_id_pedido  = el pedido que se anula
--           p_id_usuario = quién anula (lo pone el SERVIDOR: sale del token)
-- SALIDA:   { "ok": true, "viandas_devueltas": 10 }
--           o { "ok": false, "error": "mensaje claro" }   (no se guardó nada)
-- EJEMPLO:  pedido #250 en 2 con 8 fideos de heladera + 2 "sin sal" → vuelven 8: fideos 63 → 71,
--           renglón "devolucion" +8 "Anulación del pedido #250", pedido en 5 → { ok: true, viandas_devueltas: 8 }.
--           Otra vez → 'El pedido ya está anulado'. En 4 (entregado) → { ok: true, viandas_devueltas: 0 }.
-- La llama: POST /api/pedidos/:id/anular (server.js, con PIN).
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

create or replace function anular_pedido_con_devolucion(  -- crea la función (o la reemplaza si ya existe)
  p_id_pedido  integer,                                -- el pedido que se anula
  p_id_usuario uuid                                    -- quién anula: lo pone el SERVIDOR (sale del token)
)                                                      -- fin de lo que recibe
returns jsonb                                          -- devuelve un JSON: { ok, ... }
language plpgsql                                       -- está escrita en plpgsql (SQL con if, for y variables)
set search_path = public                               -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                  -- desde acá hasta el cierre de abajo es el código de la función
declare                                                -- variables de la función:
  v_pedido   record;                                   -- el pedido leído de la base (número y estado)
  v_devuelve jsonb := '[]'::jsonb;                     -- LO QUE VUELVE: [{ id_producto, cantidad }], un renglón por plato (vacía al empezar)
  v_renglon  jsonb;                                    -- un renglón de v_devuelve
  v_total    integer := 0;                             -- cuántas viandas volvieron en total (arranca en 0)
begin                                                  -- empieza el código

  -- ===================================================
  -- PARTE 1: CONTROLES Y CANDADOS (no escribe nada)
  -- ===================================================

  -- PASO 1. El usuario tiene que venir (lo pone el servidor)
  if p_id_usuario is null then                         -- si no vino...
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que anula el pedido');  -- ...se corta acá
  end if;                                              -- fin del paso 1

  -- PASO 2. CANDADO al pedido. Si dos personas lo anulan a la vez, la segunda espera acá y después
  --         lo encuentra en 5. Mientras se anula, nadie más le puede cambiar el estado.
  select id, id_estado                                 -- número y estado del pedido
    into v_pedido                                      -- se guardan en v_pedido
    from pedidos                                       -- de la tabla de pedidos
   where id = p_id_pedido                              -- el pedido que se anula
     for update;                                       -- con candado

  if not found then                                    -- si no existe...
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');  -- ...se corta acá
  end if;                                              -- fin de "no existe"
  if v_pedido.id_estado = 5 then                       -- si ya está anulado...
    return jsonb_build_object('ok', false, 'error', 'El pedido ya está anulado');  -- ...se corta acá (no devuelve dos veces)
  end if;                                              -- fin del paso 2

  -- PASO 3. LA LISTA DE LO QUE VUELVE (una sola vez; la usan los pasos 4 y 5). Solo en 1, 2 o 3:
  --         en 4 (entregado) queda vacía, porque las viandas se fueron con el cliente.
  --         Por plato: las ventas (negativas) + las devoluciones (positivas) del cuaderno de ESTE pedido,
  --         solo los que tienen algo para devolver. Ej: fideos −10 + 0 = −10 → vuelven 10.
  --         Si alguien ya lo había anulado y "revivido", la cuenta da 0 y no vuelve nada otra vez.
  if v_pedido.id_estado in (1, 2, 3) then              -- si todavía no se entregó...
    select coalesce(jsonb_agg(jsonb_build_object(      -- arma la lista...
             'id_producto', t.id_producto,             -- ...con cada plato...
             'cantidad',    t.cantidad)                -- ...y cuántas viandas vuelven...
             order by t.id_producto),                  -- ...ordenada por número de plato (el orden de los candados)...
           '[]'::jsonb)                                -- ...(vacía si no hay nada para devolver)
      into v_devuelve                                  -- y la guarda en v_devuelve
      from (select mov.id_producto,                    -- el plato
                   -sum(mov.cantidad) as cantidad      -- cuántas vuelven: las ventas son negativas, ej: −(−10 + 0) = 10
              from movimientos_viandas mov             -- del cuaderno
             where mov.id_pedido = p_id_pedido         -- de este pedido
               and mov.tipo in ('venta', 'devolucion') -- sus ventas y devoluciones
             group by mov.id_producto                  -- plato por plato
            having sum(mov.cantidad) < 0) t;           -- solo los que tienen algo para devolver
  end if;                                              -- fin del paso 3

  -- PASO 4. CANDADO a los platos de la lista, ordenados por número: el mismo orden que las otras
  --         funciones, así ninguna se traba con otra. Con la lista vacía no pone ningún candado.
  perform 1                                            -- no hace falta traer nada, solo poner los candados
     from productos                                    -- de la tabla de platos
    where id in (select (ren.value ->> 'id_producto')::integer  -- los platos...
                   from jsonb_array_elements(v_devuelve) ren)   -- ...de la lista de lo que vuelve
    order by id                                        -- siempre en el mismo orden
      for update;                                      -- con candado

  -- ===================================================
  -- PARTE 2: GUARDAR
  -- Si algo falla desde acá, Postgres deshace todo lo que hizo la función.
  -- ===================================================

  -- PASO 5. Devolver, plato por plato de la lista (en 4 la lista está vacía: no vuelve nada)
  for v_renglon in select value from jsonb_array_elements(v_devuelve) loop  -- cada plato que vuelve, uno por vuelta
    -- 5a. El renglón del cuaderno: "devolucion", con cantidad POSITIVA (vuelven viandas)
    insert into movimientos_viandas (id_producto, id_usuario, id_pedido, tipo, cantidad, motivo)  -- tabla del cuaderno, columnas:
    values ((v_renglon ->> 'id_producto')::integer,    -- el plato
            p_id_usuario,                              -- quién anuló
            p_id_pedido,                               -- de qué pedido (así la próxima cuenta ya lo resta)
            'devolucion',                              -- el tipo
            (v_renglon ->> 'cantidad')::integer,       -- cuántas vuelven (ej: +10)
            'Anulación del pedido #' || p_id_pedido);  -- ej: "Anulación del pedido #250"

    -- 5b. Sumar las viandas a la heladera
    update productos                                   -- tabla de platos
       set stock_heladera = stock_heladera + (v_renglon ->> 'cantidad')::integer  -- ej: 61 + 10 = 71
     where id = (v_renglon ->> 'id_producto')::integer;  -- solo este plato

    v_total := v_total + (v_renglon ->> 'cantidad')::integer;  -- se suma al total de viandas que volvieron
  end loop;                                            -- fin del paso 5

  -- PASO 6. El pedido pasa a 5 (Cancelado)
  update pedidos                                       -- tabla de pedidos
     set id_estado = 5                                 -- Cancelado
   where id = p_id_pedido;                             -- solo este pedido

  -- PASO 7. Listo: cuántas viandas volvieron (0 si estaba en 4 o si no había sacado de la heladera)
  return jsonb_build_object(                           -- respuesta:
    'ok',                true,                         -- salió bien
    'viandas_devueltas', v_total                       -- viandas que volvieron a la heladera
  );                                                   -- fin de la respuesta
end;                                                   -- fin del código de la función
$$;                                                    -- fin de la función

-- PERMISOS: igual que en los bloques 1 y 2, solo la ejecuta el servidor (service_role)
revoke execute on function anular_pedido_con_devolucion(integer, uuid)  -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                    -- ...a todos los de afuera
grant execute on function anular_pedido_con_devolucion(integer, uuid)   -- da el permiso de ejecutarla...
  to service_role;                                     -- ...solo al servidor

commit;                                                -- cierra el bloque y confirma todo

-- Si al anular aparece "Could not find the function anular_pedido_con_devolucion", Supabase todavía
-- no la "vio": corré solo esta línea (le avisa que recargue la lista de funciones).
-- notify pgrst, 'reload schema';


-- =====================================================
-- BLOQUE 4 — MARCAS "NO USAR" y "USAR" (paso H7)
-- Solo guarda COMENTARIOS pegados a funciones, columnas y una secuencia ("comment on ... is '...'").
-- Un comentario no cambia lo que hace la función ni toca ningún dato: el servidor viejo de Render
-- (rama Rodriguez) sigue andando igual. Tampoco hace falta reiniciar el servidor.
-- En Supabase se ve al mirar la función o la columna. Lo comprobás con la parte 4A de
-- sql/heladera_probar.sql y con sql/heladera_revisar.sql.
-- Nada se borra: las viejas quedan, marcadas. Dos de ellas las sigue usando el servidor viejo
-- hasta el merge (marcar_detalle_hecho y registrar_descarte_vianda), y aplicar_produccion_viandas
-- la llama marcar_detalle_hecho por dentro.
-- Si se vuelve a correr una función con "create or replace", su comentario NO se pierde.
-- =====================================================

begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

-- ---------- LAS VIEJAS: "NO USAR" ----------

comment on function marcar_detalle_hecho(integer, uuid) is  -- el "Hecho" viejo de la cocina
  'NO USAR en código nuevo (paso H7). La reemplaza producir_viandas (sql/heladera.sql). La sigue usando el servidor viejo (rama Rodriguez) hasta el merge: no borrar.';

comment on function aplicar_produccion_viandas(integer, integer, uuid, text, text, boolean) is  -- la interna de producción vieja
  'NO USAR (paso H7). Era de uso interno de marcar_detalle_hecho y registrar_tanda_viandas. La reemplaza producir_viandas. No borrar: la sigue llamando marcar_detalle_hecho (servidor viejo).';

comment on function registrar_descarte_vianda(integer, integer, uuid, text) is  -- el descarte viejo
  'NO USAR en código nuevo (paso H7). La reemplaza descartar_viandas (sql/heladera.sql). La sigue usando el servidor viejo (rama Rodriguez) hasta el merge: no borrar.';

comment on function registrar_tanda_viandas(integer, integer, uuid, text) is  -- carga de una tanda suelta (sin uso)
  'NO USAR (paso H7). Sin uso: la ruta /api/viandas-stock/tanda ya no existe. Las viandas entran con producir_viandas (pedido a cocina). No borrar sin preguntar.';

comment on function registrar_tanda_multiple(jsonb, uuid, text) is  -- carga de varias tandas juntas (sin uso)
  'NO USAR (paso H7). Sin uso. Ojo: acá "combo" quiere decir "varios platos cargados juntos", no los combos que se venden. No borrar sin preguntar.';

comment on column movimientos_viandas.id_lote is       -- el número de "lote" del cuaderno (sin uso)
  'NO USAR (paso H7). Solo lo llenaba registrar_tanda_multiple (sin uso). Los renglones nuevos lo dejan vacío.';

comment on sequence movimientos_viandas_lote_seq is    -- la secuencia que numeraba los lotes (sin uso)
  'NO USAR (paso H7). Solo la usaba registrar_tanda_multiple (sin uso).';

comment on column orden_produccion_detalles.id_pedido_detalle is  -- columna vieja de los pedidos a cocina (sin uso)
  'NO USAR (paso H7). Ningún renglón la usa (revisado en el paso H0) y producir_viandas no la mira.';

-- ---------- LAS NUEVAS: "USAR" ----------

comment on function producir_viandas(integer, uuid) is  -- PRODUCIR
  'USAR. PRODUCIR (paso H3): la cocina toca "Hecho" en un pedido a cocina. Heladera +N, insumos − receta × N (la única vez para esas viandas) y renglón "produccion". La llama POST /api/ordenes-produccion/detalles/:id/hecho.';

comment on function crear_pedido_combos(uuid, text, text, text, text, date, text, text, integer, text, jsonb) is  -- VENDER
  'USAR. VENDER (paso H6): guarda un pedido de combos. Los platos normales salen de la heladera (renglón "venta", cantidad_de_heladera = cantidad, listo = true); los personalizados no. Si no alcanza, no guarda nada. La llama POST /api/pedidos-combos.';

comment on function anular_pedido_con_devolucion(integer, uuid) is  -- DEVOLVER
  'USAR. DEVOLVER (paso H4): anula un pedido. En 1, 2 o 3 vuelven a la heladera las viandas que sacó (renglón "devolucion"); en 4 no vuelve nada. Lo pasa a 5. La llama POST /api/pedidos/:id/anular (con PIN).';

comment on function descartar_viandas(integer, integer, uuid, text) is  -- DESCARTAR
  'USAR. DESCARTAR (paso H2): se tiran viandas con motivo obligatorio. Heladera −N y renglón "descarte". No toca insumos. La llama POST /api/viandas-stock/descarte.';

commit;                                                -- cierra el bloque y confirma todo
