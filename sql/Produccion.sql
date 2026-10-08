-- =====================================================
-- PEDIDOS A COCINA (órdenes de producción) y STOCK MÍNIMO
-- Solo agrega cosas nuevas. No modifica ni borra nada existente.
-- =====================================================

begin;   -- todo junto: si algo falla, no se aplica nada

-- 1) STOCK MÍNIMO de cada plato
-- Es el número a partir del cual el sistema avisa que falta.
-- Arranca en 5 para todos. Después se cambia plato por plato.
alter table productos
  add column if not exists stock_minimo integer not null default 5
  check (stock_minimo >= 0);          -- no puede ser negativo

-- 2) EL PEDIDO A COCINA (la cabecera)
-- Una fila por cada vez que se toca "Pedir a cocina".
create table if not exists ordenes_produccion (
  id           serial primary key,                    -- número del pedido: 1, 2, 3...
  id_usuario   uuid not null references usuarios(id), -- quién lo pidió
  fecha_pedido timestamptz not null default now(),    -- cuándo lo pidió (se pone sola)
  fecha_para   date not null                          -- para qué día lo quiere
);

-- 3) LOS PLATOS DE CADA PEDIDO (el detalle)
-- Una fila por cada plato del pedido. Cada plato se marca hecho por separado.
create table if not exists orden_produccion_detalles (
  id                   serial primary key,

  -- A qué pedido pertenece.
  -- "on delete cascade" = si se borra el pedido, se borran solos sus platos.
  id_orden_produccion  integer not null references ordenes_produccion(id) on delete cascade,

  id_producto          integer not null references productos(id),   -- qué plato
  id_cocinero          uuid references usuarios(id),                -- quién lo cocina (puede quedar vacío)
  cantidad             integer not null check (cantidad > 0),       -- cuántas viandas

  hecho                boolean not null default false,              -- arranca en "no hecho"
  fecha_hecho          timestamptz,                                 -- vacío hasta que lo marcan

  -- La entrada al stock que generó este plato al marcarlo hecho.
  -- Vacío mientras está pendiente.
  id_movimiento_vianda integer references movimientos_viandas(id)
);

-- 4) ÍNDICES: hacen rápidas las búsquedas más comunes
create index if not exists idx_opd_orden    on orden_produccion_detalles(id_orden_produccion);  -- los platos de un pedido
create index if not exists idx_opd_hecho    on orden_produccion_detalles(hecho);                -- los pendientes
create index if not exists idx_opd_cocinero on orden_produccion_detalles(id_cocinero);          -- los de un cocinero

-- 5) SEGURIDAD: igual que el resto de las tablas, solo entra el servidor
alter table ordenes_produccion        enable row level security;
alter table orden_produccion_detalles enable row level security;

commit;   -- confirma todos los cambios


-- =====================================================
-- CREAR UN PEDIDO A COCINA — crear_orden_produccion
-- Agregado después: se puede ejecutar solo este bloque (de "begin" a "commit")
-- si las tablas de arriba ya están creadas.
-- =====================================================

begin;

-- -----------------------------------------------------
-- crear_orden_produccion
-- Se le pide a la cocina qué cocinar y para qué día.
-- p_items es una lista de { "id_producto": 12, "cantidad": 3 }.
-- Crea una fila en ordenes_produccion (el pedido) y una por plato en
-- orden_produccion_detalles. TODO O NADA: si algo falla, no queda nada guardado.
--
-- Cocinero de cada plato: el del plato (productos.id_cocinero); si no tiene,
-- el del plan (planes.id_cocinero); si tampoco, queda vacío.
-- Devuelve { ok: true, id_orden } o { ok: false, error }.
-- -----------------------------------------------------
create or replace function crear_orden_produccion(
  p_id_usuario uuid,
  p_fecha_para date,
  p_items      jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  -- "Hoy" con la hora de Argentina: la base trabaja en UTC y de 21 a 24 hs ya sería mañana
  v_hoy       date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_items     jsonb;    -- lista limpia: platos repetidos sumados
  v_id_malo   integer;  -- id de un plato que no existe
  v_nombre    text;     -- nombre de un plato inactivo
  v_id_orden  integer;  -- número del pedido creado
begin
  -- 1. Quién pide (sale del token en el servidor; nunca debería faltar)
  if p_id_usuario is null then
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que hace el pedido');
  end if;

  -- 2. La fecha: obligatoria y no anterior a hoy
  if p_fecha_para is null then
    return jsonb_build_object('ok', false, 'error', 'Elegí para qué día es el pedido');
  end if;
  if p_fecha_para < v_hoy then
    return jsonb_build_object('ok', false, 'error', 'La fecha del pedido no puede ser anterior a hoy');
  end if;

  -- 3. p_items tiene que ser una lista con al menos un plato.
  --    Son dos "if" separados: jsonb_array_length falla si no es una lista.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'La lista de platos es inválida');
  end if;
  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Pedí al menos un plato');
  end if;

  -- 4. Cada plato: un objeto con id_producto entero y cantidad entera MAYOR a 0.
  --    Mismo CASE que registrar_tanda_multiple: convierte a número recién
  --    después de comprobar que el valor es un número.
  if exists (
    select 1
      from jsonb_array_elements(p_items) e
     where case
             when jsonb_typeof(e) <> 'object' then true
             when coalesce(jsonb_typeof(e->'id_producto'), '') <> 'number' then true
             when coalesce(jsonb_typeof(e->'cantidad'), '') <> 'number' then true
             when (e->>'id_producto')::numeric <> trunc((e->>'id_producto')::numeric) then true
             when (e->>'cantidad')::numeric <> trunc((e->>'cantidad')::numeric) then true
             when (e->>'cantidad')::numeric <= 0 then true
             else false
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Cada plato tiene que tener una cantidad entera mayor a 0');
  end if;

  -- 5. Lista limpia: si un plato vino repetido, se suman sus cantidades
  select jsonb_agg(jsonb_build_object('id_producto', t.id_producto, 'cantidad', t.cantidad) order by t.id_producto)
    into v_items
    from (
      select (e->>'id_producto')::integer           as id_producto,
             sum((e->>'cantidad')::integer)::integer as cantidad
        from jsonb_array_elements(p_items) e
       group by 1
    ) t;

  -- 6. Cada plato tiene que existir...
  select (x->>'id_producto')::integer
    into v_id_malo
    from jsonb_array_elements(v_items) x
    left join productos p on p.id = (x->>'id_producto')::integer
   where p.id is null
   limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'El plato ' || v_id_malo || ' no existe');
  end if;

  -- ...y estar activo
  select p.nombre
    into v_nombre
    from jsonb_array_elements(v_items) x
    join productos p on p.id = (x->>'id_producto')::integer
   where p.activo is not true
   order by p.nombre
   limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'El plato "' || v_nombre || '" no está activo');
  end if;

  -- 7. La cabecera del pedido
  insert into ordenes_produccion (id_usuario, fecha_para)
  values (p_id_usuario, p_fecha_para)
  returning id into v_id_orden;

  -- 8. Un renglón por plato. El cocinero: el del plato o, si no tiene, el del plan.
  --    "left join planes" porque el plato puede no tener plan (el cocinero queda vacío).
  insert into orden_produccion_detalles (id_orden_produccion, id_producto, id_cocinero, cantidad)
  select v_id_orden,
         p.id,
         coalesce(p.id_cocinero, pl.id_cocinero),
         (x->>'cantidad')::integer
    from jsonb_array_elements(v_items) x
    join productos p    on p.id  = (x->>'id_producto')::integer
    left join planes pl on pl.id = p.id_plan
   order by p.id;

  return jsonb_build_object('ok', true, 'id_orden', v_id_orden);
end;
$$;

-- Permisos: igual que las funciones de stock de viandas, solo la ejecuta el servidor (service_role)
revoke execute on function crear_orden_produccion(uuid, date, jsonb) from public, anon, authenticated;
grant  execute on function crear_orden_produccion(uuid, date, jsonb) to service_role;

commit;


-- =====================================================
-- MARCAR HECHO UN PLATO DE UN PEDIDO A COCINA — marcar_detalle_hecho
-- Agregado después: se puede ejecutar solo este bloque (de "begin" a "commit").
-- Antes hay que ejecutar el primer bloque de sql/stock_viandas_funciones.sql,
-- que crea aplicar_produccion_viandas.
-- =====================================================

begin;

-- -----------------------------------------------------
-- marcar_detalle_hecho
-- La cocina terminó un plato del pedido: entran las viandas al stock, se descuentan
-- los insumos de la receta y el renglón queda hecho. TODO O NADA.
-- A diferencia de una tanda, NO frena: si un insumo no alcanza queda en negativo,
-- y si el plato no tiene receta entran las viandas igual. En los dos casos se avisa.
-- Se puede marcar aunque el plato se haya desactivado después de pedirlo.
-- Devuelve { ok: true, id_movimiento, stock_heladera, avisos } o { ok: false, error }.
-- -----------------------------------------------------
create or replace function marcar_detalle_hecho(
  p_id_detalle integer,
  p_id_usuario uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_detalle    record;
  v_plato      text;
  v_resultado  jsonb;
begin
  if p_id_usuario is null then
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario que marca el plato');
  end if;

  -- 1. Bloquear el renglón: si dos personas lo marcan a la vez, la segunda espera acá
  --    y después lo encuentra ya hecho. Ninguna otra función bloquea estos renglones,
  --    así que bloquearlo antes que el plato no puede trabar a nadie.
  select id, id_orden_produccion, id_producto, cantidad, hecho
    into v_detalle
    from orden_produccion_detalles
   where id = p_id_detalle
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El plato del pedido no existe');
  end if;
  if v_detalle.hecho then
    return jsonb_build_object('ok', false, 'error', 'Este plato ya estaba marcado como hecho');
  end if;

  -- 2. Bloquear el plato (mismo orden que las demás funciones: plato y después insumos).
  --    No se exige que esté activo.
  select nombre
    into v_plato
    from productos
   where id = v_detalle.id_producto
     for update;

  -- 3. Registrar en modo flexible (los insumos los bloquea aplicar_produccion_viandas, por id)
  v_resultado := aplicar_produccion_viandas(
    v_detalle.id_producto,
    v_detalle.cantidad,
    p_id_usuario,
    'Pedido a cocina #' || v_detalle.id_orden_produccion,
    'Producción pedido a cocina #' || v_detalle.id_orden_produccion || ': ' || v_detalle.cantidad || ' ' || v_plato,
    false
  );

  -- En modo flexible no debería volver ok: false; si pasara, no se marca nada
  if not coalesce((v_resultado->>'ok')::boolean, false) then
    return v_resultado;
  end if;

  -- 4. El renglón queda hecho, con la hora y la entrada de viandas que generó
  update orden_produccion_detalles
     set hecho                = true,
         fecha_hecho          = now(),
         id_movimiento_vianda = (v_resultado->>'id_movimiento')::integer
   where id = p_id_detalle;

  return jsonb_build_object(
    'ok',             true,
    'id_movimiento',  v_resultado->'id_movimiento',
    'stock_heladera', v_resultado->'stock_heladera',
    'avisos',         v_resultado->'avisos'
  );
end;
$$;

-- Permisos: solo la ejecuta el servidor (service_role)
revoke execute on function marcar_detalle_hecho(integer, uuid) from public, anon, authenticated;
grant  execute on function marcar_detalle_hecho(integer, uuid) to service_role;

commit;