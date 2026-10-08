-- =====================================================
-- STOCK DE VIANDAS EN HELADERA — FUNCIONES
-- Ejecutar en Supabase → SQL Editor DESPUÉS de stock_viandas.sql
-- (usa la columna productos.stock_heladera y la tabla movimientos_viandas).
-- Se puede ejecutar más de una vez: "create or replace" pisa la versión anterior.
--
-- Las llama el servidor con supabase.rpc(...):
--   POST /api/viandas-stock/tanda    → registrar_tanda_viandas
--   POST /api/viandas-stock/descarte → registrar_descarte_vianda
--
-- Cada función corre entera dentro de una sola transacción: si algo falla
-- a la mitad, no queda nada a medio guardar.
-- Las dos devuelven un JSON:
--   { "ok": true, ... }                si se registró
--   { "ok": false, "error": "...", ... } si no se hizo nada
-- =====================================================

begin;

-- -----------------------------------------------------
-- registrar_tanda_viandas
-- Se cocinó una tanda de N viandas de un plato: descuenta los insumos de la
-- receta y suma las viandas a la heladera.
--
-- OJO, UNIDADES: igual que calcularConsumoPedido en server.js, NO convierte
-- unidades. Resta cantidad_necesaria × N tal cual de insumos.stock_actual
-- (producto_insumo.unidad_medida se ignora). Así una tanda y un pedido
-- calculan lo mismo. Si algún día se agrega la conversión, hay que cambiarla
-- en los dos lugares a la vez.
-- -----------------------------------------------------
create or replace function registrar_tanda_viandas(
  p_id_producto integer,
  p_cantidad    integer,
  p_id_usuario  uuid,
  p_motivo      text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_producto        record;
  v_insumo          record;
  v_faltantes       jsonb := '[]'::jsonb;
  v_cant_receta     integer;
  v_id_movimiento   integer;
  v_stock_heladera  integer;
  v_motivo_insumos  text;
begin
  -- 1. La cantidad tiene que ser un entero mayor a 0
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');
  end if;

  -- 2. El plato tiene que existir y estar activo.
  --    "for update" bloquea la fila del plato hasta que termine la transacción:
  --    si llegan dos tandas del mismo plato a la vez, la segunda espera a la primera.
  select id, nombre, activo, stock_heladera
    into v_producto
    from productos
   where id = p_id_producto
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');
  end if;
  if not v_producto.activo then
    return jsonb_build_object('ok', false, 'error', 'El plato "' || v_producto.nombre || '" no está activo');
  end if;

  -- 3. Sin receta no hay tanda: entrarían viandas sin gastar ningún insumo
  select count(*) into v_cant_receta
    from producto_insumo
   where id_producto = p_id_producto;

  if v_cant_receta = 0 then
    return jsonb_build_object('ok', false, 'error', 'El plato "' || v_producto.nombre || '" no tiene receta cargada');
  end if;

  -- 4. Bloquear los insumos de la receta, SIEMPRE ordenados por id.
  --    Si dos tandas de platos distintos comparten insumos, las dos los bloquean
  --    en el mismo orden: una espera a la otra en lugar de trabarse entre sí.
  perform 1
     from insumos
    where id in (select id_insumo from producto_insumo where id_producto = p_id_producto)
    order by id
      for update;

  -- 5. Pre-chequeo: ¿alcanza cada insumo? (receta × cantidad de viandas)
  --    Si un insumo aparece dos veces en la receta, se suman sus cantidades.
  --    No se toca nada todavía: si falta algo, se devuelve la lista y listo.
  for v_insumo in
    select i.id,
           i.nombre,
           coalesce(i.stock_actual, 0)                             as disponible,
           sum(coalesce(pi.cantidad_necesaria, 0)) * p_cantidad    as necesario
      from producto_insumo pi
      join insumos i on i.id = pi.id_insumo
     where pi.id_producto = p_id_producto
     group by i.id, i.nombre, i.stock_actual
     order by i.id
  loop
    if v_insumo.disponible < v_insumo.necesario then
      v_faltantes := v_faltantes || jsonb_build_object(
        'id_insumo',  v_insumo.id,
        'nombre',     v_insumo.nombre,
        'necesario',  v_insumo.necesario,
        'disponible', v_insumo.disponible,
        'falta',      v_insumo.necesario - v_insumo.disponible
      );
    end if;
  end loop;

  if jsonb_array_length(v_faltantes) > 0 then
    return jsonb_build_object(
      'ok',        false,
      'error',     'No alcanzan los insumos para esta tanda',
      'faltantes', v_faltantes
    );
  end if;

  -- 6. Registrar la tanda en movimientos_viandas (cantidad positiva = entran)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)
  values (p_id_producto, p_id_usuario, 'produccion', p_cantidad, nullif(trim(p_motivo), ''))
  returning id into v_id_movimiento;

  -- 7. Descontar cada insumo y dejar su salida en movimientos_stock,
  --    apuntando a la tanda que la provocó (id_movimiento_vianda).
  --    La unidad que se guarda es la del insumo: la cantidad ya está en esa unidad.
  v_motivo_insumos := 'Producción tanda: ' || p_cantidad || ' ' || v_producto.nombre;

  for v_insumo in
    select pi.id_insumo                                            as id,
           i.unidad_medida,
           sum(coalesce(pi.cantidad_necesaria, 0)) * p_cantidad    as necesario
      from producto_insumo pi
      join insumos i on i.id = pi.id_insumo
     where pi.id_producto = p_id_producto
     group by pi.id_insumo, i.unidad_medida
     order by pi.id_insumo
  loop
    -- Un insumo que no se gasta (cantidad 0 en la receta) no genera movimiento
    if v_insumo.necesario <= 0 then
      continue;
    end if;

    update insumos
       set stock_actual = stock_actual - v_insumo.necesario
     where id = v_insumo.id;

    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_movimiento_vianda)
    values (v_insumo.id, 'salida', v_insumo.necesario, v_insumo.unidad_medida, v_motivo_insumos, now(), p_id_usuario, v_id_movimiento);
  end loop;

  -- 8. Sumar las viandas a la heladera
  update productos
     set stock_heladera = stock_heladera + p_cantidad
   where id = p_id_producto
  returning stock_heladera into v_stock_heladera;

  return jsonb_build_object(
    'ok',             true,
    'id_movimiento',  v_id_movimiento,
    'stock_heladera', v_stock_heladera
  );
end;
$$;

-- -----------------------------------------------------
-- registrar_descarte_vianda
-- Se tiran N viandas de la heladera (vencidas, rotas, etc.).
-- Solo resta de la heladera: los insumos ya se gastaron al cocinar la tanda.
-- -----------------------------------------------------
create or replace function registrar_descarte_vianda(
  p_id_producto integer,
  p_cantidad    integer,
  p_id_usuario  uuid,
  p_motivo      text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_producto        record;
  v_id_movimiento   integer;
  v_stock_heladera  integer;
begin
  -- 1. La cantidad tiene que ser un entero mayor a 0
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser un número entero mayor a 0');
  end if;

  -- 2. El plato tiene que existir. Se bloquea su fila para que dos descartes
  --    (o un descarte y una tanda) no lean el mismo stock_heladera a la vez.
  select id, nombre, stock_heladera
    into v_producto
    from productos
   where id = p_id_producto
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');
  end if;

  -- 3. No se puede descartar más de lo que hay en la heladera
  if v_producto.stock_heladera < p_cantidad then
    return jsonb_build_object(
      'ok',    false,
      'error', 'En la heladera hay ' || v_producto.stock_heladera || ' viandas de "' || v_producto.nombre
               || '": no se pueden descartar ' || p_cantidad
    );
  end if;

  -- 4. Registrar el descarte (cantidad negativa = salen)
  insert into movimientos_viandas (id_producto, id_usuario, tipo, cantidad, motivo)
  values (p_id_producto, p_id_usuario, 'descarte', -p_cantidad, nullif(trim(p_motivo), ''))
  returning id into v_id_movimiento;

  -- 5. Restar de la heladera
  update productos
     set stock_heladera = stock_heladera - p_cantidad
   where id = p_id_producto
  returning stock_heladera into v_stock_heladera;

  return jsonb_build_object(
    'ok',             true,
    'id_movimiento',  v_id_movimiento,
    'stock_heladera', v_stock_heladera
  );
end;
$$;

-- -----------------------------------------------------
-- PERMISOS
-- Postgres deja ejecutar cualquier función nueva a todo el mundo.
-- Se le saca el permiso a anon y authenticated (el acceso "de afuera")
-- y se deja solo a service_role, que es la clave que usa server.js.
-- -----------------------------------------------------
revoke execute on function registrar_tanda_viandas(integer, integer, uuid, text)   from public, anon, authenticated;
revoke execute on function registrar_descarte_vianda(integer, integer, uuid, text) from public, anon, authenticated;
grant  execute on function registrar_tanda_viandas(integer, integer, uuid, text)   to service_role;
grant  execute on function registrar_descarte_vianda(integer, integer, uuid, text) to service_role;

commit;


-- =====================================================
-- CARGA POR COMBO — registrar_tanda_multiple
-- Agregado después: se puede ejecutar solo este bloque (de "begin" a "commit")
-- si las dos funciones de arriba ya están creadas.
-- Antes hay que ejecutar sql/stock_viandas_lotes.sql (secuencia y columna id_lote).
-- =====================================================

begin;

-- -----------------------------------------------------
-- registrar_tanda_multiple
-- Se cocinó un combo: varias tandas de distintos platos a la vez.
-- p_items es una lista de { "id_producto": 12, "cantidad": 3 }.
--
-- TODO O NADA: si a un plato no le alcanzan los insumos, no se carga ninguno
-- y se devuelve qué plato falló y qué le falta.
--
-- No repite la lógica de una tanda: por cada plato llama a registrar_tanda_viandas.
-- Como todo pasa en la misma transacción, el segundo plato ya ve el stock que
-- dejó el primero (si comparten un insumo, se calcula con lo que quedó).
-- Mismo aviso de unidades que registrar_tanda_viandas: NO convierte unidades.
--
-- MOTIVO: registrar_tanda_viandas deja las salidas de insumos con el motivo
-- "Producción tanda: N plato". Acá, después de cada plato, se cambia ese motivo por
-- "Producción combo <plan>: N plato", para que Movimientos de Stock pueda
-- distinguir un combo de un plato suelto.
--
-- AGRUPAR: cada carga toma un número de movimientos_viandas_lote_seq y todos sus
-- movimientos de viandas quedan con ese id_lote. Así las pantallas muestran el
-- combo en un solo renglón. Las salidas de insumos se agrupan a través de
-- id_movimiento_vianda (no llevan columna propia).
-- -----------------------------------------------------
create or replace function registrar_tanda_multiple(
  p_items      jsonb,
  p_id_usuario uuid,
  p_motivo     text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_items      jsonb;                 -- lista limpia: sin ceros y sin platos repetidos
  v_item       record;
  v_resultado  jsonb;                 -- lo que devuelve registrar_tanda_viandas para un plato
  v_fallo      jsonb := null;         -- detalle del plato que falló (sobrevive al rollback)
  v_cargados   jsonb := '[]'::jsonb;  -- platos cargados, para la respuesta
  v_total      integer := 0;
  v_plato      text;                  -- nombre del plato (para el motivo de combo)
  v_plan       text;                  -- nombre del plan del plato (para el motivo de combo)
  v_lote       integer;               -- número que agrupa todos los movimientos de esta carga
begin
  -- 1. p_items tiene que ser una lista
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'La lista de platos es inválida');
  end if;

  -- 2. Cada item: un objeto con id_producto entero y cantidad entera >= 0.
  --    Se usa CASE para que las conversiones a número se hagan recién después
  --    de comprobar que el valor es un número.
  if exists (
    select 1
      from jsonb_array_elements(p_items) e
     where case
             when jsonb_typeof(e) <> 'object' then true
             when coalesce(jsonb_typeof(e->'id_producto'), '') <> 'number' then true
             when coalesce(jsonb_typeof(e->'cantidad'), '') <> 'number' then true
             when (e->>'id_producto')::numeric <> trunc((e->>'id_producto')::numeric) then true
             when (e->>'cantidad')::numeric <> trunc((e->>'cantidad')::numeric) then true
             when (e->>'cantidad')::numeric < 0 then true
             else false
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Cada plato tiene que tener una cantidad entera mayor o igual a 0');
  end if;

  -- 3. Lista limpia: se suman los platos repetidos y se ignoran los que quedan en 0
  select coalesce(
           jsonb_agg(jsonb_build_object('id_producto', t.id_producto, 'cantidad', t.cantidad) order by t.id_producto),
           '[]'::jsonb)
    into v_items
    from (
      select (e->>'id_producto')::integer          as id_producto,
             sum((e->>'cantidad')::integer)::integer as cantidad
        from jsonb_array_elements(p_items) e
       group by 1
      having sum((e->>'cantidad')::integer) > 0
    ) t;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Cargá al menos un plato con cantidad mayor a 0');
  end if;

  -- 4a. Número de esta carga. Si después falla y se deshace, el número queda
  --     salteado (las secuencias no vuelven atrás): no importa, solo agrupa.
  v_lote := nextval('movimientos_viandas_lote_seq');

  -- 4. Bloqueos, en el mismo orden que registrar_tanda_viandas: primero los platos
  --    y después los insumos, los dos ordenados por id. Con el mismo orden en todas
  --    las cargas, ninguna se queda esperando a otra que a su vez la espera a ella.
  --    Se bloquea acá, fuera del paso 5, para que los bloqueos sigan tomados
  --    aunque el paso 5 se deshaga.
  perform 1
     from productos
    where id in (select (x->>'id_producto')::integer from jsonb_array_elements(v_items) x)
    order by id
      for update;

  perform 1
     from insumos
    where id in (
            select pi.id_insumo
              from producto_insumo pi
             where pi.id_producto in (select (x->>'id_producto')::integer from jsonb_array_elements(v_items) x)
          )
    order by id
      for update;

  -- 5. Cargar plato por plato. Este bloque tiene su propio "exception": si un plato
  --    falla, se lanza un error con el código FGT01 y Postgres deshace TODO lo que
  --    hizo el bloque (los platos anteriores incluidos). Las variables no se deshacen,
  --    así que v_fallo conserva el detalle para devolverlo.
  begin
    for v_item in
      select (x->>'id_producto')::integer as id_producto,
             (x->>'cantidad')::integer    as cantidad
        from jsonb_array_elements(v_items) x
       order by 1
    loop
      v_resultado := registrar_tanda_viandas(v_item.id_producto, v_item.cantidad, p_id_usuario, p_motivo);

      if not coalesce((v_resultado->>'ok')::boolean, false) then
        v_fallo := v_resultado || jsonb_build_object(
          'id_producto', v_item.id_producto,
          'plato',       (select nombre from productos where id = v_item.id_producto)
        );
        raise exception 'Falló la carga de un plato del combo' using errcode = 'FGT01';
      end if;

      -- Motivo de combo en las salidas de insumos de este plato. Está dentro del
      -- mismo bloque: si después falla otro plato, este cambio también se deshace.
      -- Sin plan, queda "Producción combo: N plato".
      select p.nombre, pl.nombre
        into v_plato, v_plan
        from productos p
        left join planes pl on pl.id = p.id_plan
       where p.id = v_item.id_producto;

      update movimientos_stock
         set motivo = 'Producción combo' || coalesce(' ' || v_plan, '') || ': ' || v_item.cantidad || ' ' || v_plato
       where id_movimiento_vianda = (v_resultado->>'id_movimiento')::integer;

      -- El movimiento de viandas de este plato queda con el número de la carga
      update movimientos_viandas
         set id_lote = v_lote
       where id = (v_resultado->>'id_movimiento')::integer;

      v_cargados := v_cargados || jsonb_build_object(
        'id_producto',    v_item.id_producto,
        'cantidad',       v_item.cantidad,
        'id_movimiento',  v_resultado->'id_movimiento',
        'stock_heladera', v_resultado->'stock_heladera'
      );
      v_total := v_total + v_item.cantidad;
    end loop;
  exception
    when sqlstate 'FGT01' then
      return v_fallo;
  end;

  return jsonb_build_object(
    'ok',      true,
    'id_lote', v_lote,
    'total',   v_total,
    'items',   v_cargados
  );
end;
$$;

-- Permisos: igual que las otras dos, solo la puede ejecutar el servidor (service_role)
revoke execute on function registrar_tanda_multiple(jsonb, uuid, text) from public, anon, authenticated;
grant  execute on function registrar_tanda_multiple(jsonb, uuid, text) to service_role;

commit;

-- Seguridad: las funciones buscan las tablas siempre en la carpeta public
alter function registrar_tanda_viandas(integer, integer, uuid, text)   set search_path = public;
alter function registrar_descarte_vianda(integer, integer, uuid, text) set search_path = public;
alter function registrar_tanda_multiple(jsonb, uuid, text)             set search_path = public;