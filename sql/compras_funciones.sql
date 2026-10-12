-- =====================================================
-- COMPRAS — registrar_compra
-- Ejecutar en Supabase → SQL Editor DESPUÉS de modificar las tablas
-- compras (id, fecha, proveedor, id_usuario, created_at) y
-- movimientos_stock (columnas id_compra y fecha_vencimiento).
-- Se puede ejecutar más de una vez: "create or replace" pisa la versión anterior.
--
-- La llama el servidor con supabase.rpc('registrar_compra', ...).
-- Corre entera dentro de una sola transacción: si algo falla
-- a la mitad, no queda nada a medio guardar.
-- =====================================================

begin;

-- -----------------------------------------------------
-- registrar_compra
-- Guarda una "carga de compra": varios insumos que llegaron juntos.
-- p_items es una lista de
--   { "id_insumo": 4, "cantidad": 2000, "fecha_vencimiento": "2026-12-31" }
-- (fecha_vencimiento puede faltar o venir en null).
--
-- Las cantidades llegan YA CONVERTIDAS a la unidad del insumo (las convierte
-- el servidor con convertirACantidadBase). Acá no se convierte nada.
--
-- Crea una fila en compras, una ENTRADA en movimientos_stock por insumo
-- y suma cada cantidad al stock_actual del insumo.
-- Devuelve { ok: true, id_compra } o { ok: false, error }.
-- -----------------------------------------------------
create or replace function registrar_compra(
  p_id_usuario uuid,
  p_fecha      date,
  p_proveedor  text,
  p_items      jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_fecha        date;         -- día de la compra (hoy si no viene)
  v_fecha_hora   timestamptz;  -- ese día a las 12 hs de Argentina
  v_item         jsonb;        -- un renglón de la lista
  v_vencimiento  date;         -- vencimiento de un renglón (puede ser null)
  v_id_malo      integer;      -- id de un insumo que no existe
  v_nombre       text;         -- nombre de un insumo inactivo
  v_insumo       record;       -- datos del insumo de un renglón
  v_id_compra    integer;      -- número de la compra creada
begin
  -- 1. Quién carga (sale del token en el servidor; nunca debería faltar)
  if p_id_usuario is null then
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que carga la compra');
  end if;

  -- 2. La fecha: si no viene, hoy con la hora de Argentina
  --    (la base trabaja en UTC y de 21 a 24 hs ya sería mañana).
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date);

  --    Se guarda a las 12 del mediodía de Argentina: si se guardara a las 0 hs
  --    en UTC, en Argentina se vería como el día anterior.
  v_fecha_hora := (v_fecha + time '12:00') at time zone 'America/Argentina/Buenos_Aires';

  -- 3. p_items tiene que ser una lista con al menos un insumo.
  --    Son dos "if" separados: jsonb_array_length falla si no es una lista.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'La lista de insumos es inválida');
  end if;
  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Cargá al menos un insumo');
  end if;

  -- 4. Revisar renglón por renglón: id_insumo entero, cantidad mayor a 0
  --    y fecha de vencimiento vacía o válida.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(jsonb_typeof(v_item->'id_insumo'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item->'cantidad'), '') <> 'number' then
      return jsonb_build_object('ok', false, 'error', 'Cada renglón tiene que tener un insumo y una cantidad');
    end if;

    if (v_item->>'id_insumo')::numeric <> trunc((v_item->>'id_insumo')::numeric) then
      return jsonb_build_object('ok', false, 'error', 'El id del insumo es inválido');
    end if;

    if (v_item->>'cantidad')::numeric <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Las cantidades tienen que ser mayores a 0');
    end if;

    -- El vencimiento es opcional. Si viene, tiene que ser una fecha de verdad
    -- (el "exception" atrapa textos como "hola" o "2026-02-31").
    if coalesce(jsonb_typeof(v_item->'fecha_vencimiento'), 'null') <> 'null' then
      begin
        v_vencimiento := (v_item->>'fecha_vencimiento')::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'Hay una fecha de vencimiento inválida');
      end;
    end if;
  end loop;

  -- 5. Bloquear los insumos de la lista, ordenados por id, hasta que termine
  --    la transacción. Así dos cargas a la vez no pisan el stock_actual
  --    una de la otra, y con el mismo orden ninguna se queda esperando a la otra.
  perform 1
     from insumos
    where id in (select (x->>'id_insumo')::integer from jsonb_array_elements(p_items) x)
    order by id
      for update;

  -- 6. Cada insumo tiene que existir...
  select (x->>'id_insumo')::integer
    into v_id_malo
    from jsonb_array_elements(p_items) x
    left join insumos i on i.id = (x->>'id_insumo')::integer
   where i.id is null
   limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'El insumo ' || v_id_malo || ' no existe');
  end if;

  -- ...y estar activo
  select i.nombre
    into v_nombre
    from jsonb_array_elements(p_items) x
    join insumos i on i.id = (x->>'id_insumo')::integer
   where i.activo is not true
   order by i.nombre
   limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'El insumo "' || v_nombre || '" no está activo');
  end if;

  -- 7. La cabecera de la compra. El proveedor vacío se guarda como null.
  insert into compras (fecha, proveedor, id_usuario)
  values (v_fecha_hora, nullif(trim(p_proveedor), ''), p_id_usuario)
  returning id into v_id_compra;

  -- 8. Por cada renglón: una ENTRADA en movimientos_stock y sumar al stock.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- La unidad del movimiento es la del insumo (la cantidad ya viene convertida)
    select id, unidad_medida
      into v_insumo
      from insumos
     where id = (v_item->>'id_insumo')::integer;

    -- El vencimiento ya se revisó en el paso 4; si no viene, queda null
    v_vencimiento := null;
    if coalesce(jsonb_typeof(v_item->'fecha_vencimiento'), 'null') <> 'null' then
      v_vencimiento := (v_item->>'fecha_vencimiento')::date;
    end if;

    -- El movimiento (los costos quedan vacíos)
    insert into movimientos_stock (id_insumo, tipo, cantidad, unidad, motivo, fecha, id_usuario, id_compra, fecha_vencimiento)
    values (
      v_insumo.id,
      'entrada',
      (v_item->>'cantidad')::numeric,
      v_insumo.unidad_medida,
      'Compra #' || v_id_compra,
      v_fecha_hora,
      p_id_usuario,
      v_id_compra,
      v_vencimiento
    );

    -- Sumar al stock del insumo
    update insumos
       set stock_actual = coalesce(stock_actual, 0) + (v_item->>'cantidad')::numeric
     where id = v_insumo.id;
  end loop;

  return jsonb_build_object('ok', true, 'id_compra', v_id_compra);
end;
$$;

-- Permisos: igual que las funciones de producción, solo la ejecuta el servidor (service_role)
revoke execute on function registrar_compra(uuid, date, text, jsonb) from public, anon, authenticated;
grant  execute on function registrar_compra(uuid, date, text, jsonb) to service_role;

commit;
