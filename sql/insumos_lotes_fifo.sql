-- ============================================================================
-- insumos_lotes_fifo.sql — LOTES DE INSUMOS Y DESCUENTO FIFO POR VENCIMIENTO (28/10)
--
-- Lo corre Mauri en Supabase → SQL Editor, ENTERO, una vez (se puede volver a correr: no duplica nada).
-- Va todo junto en una transacción (begin … commit): si algo falla, no queda nada a medias.
-- SOLO AGREGA: una tabla nueva (lotes_insumo), dos funciones, un disparador y la versión nueva de registrar_compra.
-- No borra ni cambia ningún dato que ya exista (salvo insumos.fecha_caducidad, que pasa a calcularse sola).
--
-- QUÉ RESUELVE
--   Cada entrada de un insumo (una compra, una entrada suelta) es un LOTE con su vencimiento y su saldo.
--   Cada salida (producir, personalizados, salida suelta, editar el stock) se descuenta de los lotes en orden FIFO:
--   primero el que vence antes; los que no tienen vencimiento, al final; si empatan, el que entró antes.
--   Ej: lote A vence el 05/11 con 500 g y lote B vence el 20/11 con 2000 g. Sale 1500 g →
--       A queda en 0, B queda en 1000 g, y insumos.fecha_caducidad pasa del 05/11 al 20/11.
--
-- LA REGLA QUE SIEMPRE SE CUMPLE (por insumo)
--   suma de cantidad_restante de sus lotes = stock_actual (o 0 si el stock está en negativo)
--   insumos.fecha_caducidad = el vencimiento más próximo entre sus lotes con saldo (vacía si no hay)
--
-- CÓMO SE CUMPLE EN TODOS LOS CAMINOS (sin tocar producir_viandas, descontar_insumos_pedido ni el servidor viejo)
--   Un disparador en insumos: cada vez que cambia stock_actual (o se crea un insumo), llama a sincronizar_lotes_insumo,
--   que compara el stock con la suma de los saldos y:
--     - si sobra saldo (salió algo) → descuenta la diferencia de los lotes, en orden FIFO;
--     - si falta saldo (entró algo sin lote) → crea un lote "ajuste" sin vencimiento;
--     - y escribe la fecha_caducidad del insumo.
--   registrar_compra crea el lote de cada compra (con su vencimiento) ANTES de sumar el stock: así, cuando corre el
--   disparador, la suma ya da justo y no crea un "ajuste".
--   Stock en negativo (las viandas "cociné igual"): todos sus lotes quedan en 0; la próxima compra nace descontando
--   esa deuda (ej: faltaban 700 g y entran 2000 g → el lote queda con 1300 g).
--
-- PARTES: 1. La tabla · 2. sincronizar_lotes_insumo · 3. El disparador · 4. registrar_compra con lotes
--         5. La carga inicial (los insumos que ya existen) · 6. Permisos y recarga de la API
-- Las pruebas están en sql/insumos_lotes_fifo_probar.sql (no guardan nada).
-- ============================================================================

begin;                                                   -- todo junto o nada


-- ----------------------------------------------------------------------------
-- 1. LA TABLA: un renglón por lote (lo que entró de una vez, con su vencimiento y lo que le queda)
-- ----------------------------------------------------------------------------
create table if not exists lotes_insumo (                -- crea la tabla (si ya existe, no hace nada)
  id                 serial primary key,                 -- número del lote
  id_insumo          integer not null                    -- de qué insumo es...
                     references insumos(id) on delete cascade,   -- ...(si alguna vez se borra el insumo, se van sus lotes)
  id_movimiento      bigint                              -- la entrada de movimientos_stock que lo creó (vacío si no hay)...
                     references movimientos_stock(id) on delete cascade,   -- ...(si se borra esa entrada, se va su lote)
  origen             text not null                       -- de dónde salió:
                     check (origen in ('compra', 'entrada', 'inicial', 'ajuste')),   -- compra · entrada suelta · stock de antes · ajuste
  fecha_ingreso      timestamptz not null default now(), -- cuándo entró (desempata el FIFO)
  fecha_vencimiento  date,                               -- cuándo vence (vacío = sin vencimiento: va al final del FIFO)
  cantidad_inicial   numeric not null                    -- cuánto entró, en la unidad del insumo (g, ml o u)...
                     check (cantidad_inicial > 0),       -- ...siempre más de 0
  cantidad_restante  numeric not null                    -- cuánto le queda (baja con cada salida)...
                     check (cantidad_restante >= 0 and cantidad_restante <= cantidad_inicial)   -- ...entre 0 y lo que entró
);

comment on table lotes_insumo is                         -- la explicación que se ve en Supabase
  'FIFO de insumos (28/10): un lote por entrada, con su vencimiento y su saldo. Lo mantiene el disparador de insumos '
  '(sincronizar_lotes_insumo) y registrar_compra. Suma de saldos = stock_actual (o 0 si es negativo).';

alter table lotes_insumo enable row level security;      -- RLS: solo el servidor (service_role) la lee y la escribe

create unique index if not exists idx_lotes_insumo_movimiento   -- una entrada crea a lo sumo un lote...
  on lotes_insumo (id_movimiento) where id_movimiento is not null;   -- ...(y así se encuentra rápido el lote de una entrada)

create index if not exists idx_lotes_insumo_fifo          -- un índice (no cambia lo guardado): hace rápido el FIFO...
  on lotes_insumo (id_insumo, fecha_vencimiento, fecha_ingreso, id)   -- ...en su orden...
  where cantidad_restante > 0;                           -- ...mirando solo los lotes que tienen saldo


-- ----------------------------------------------------------------------------
-- 2. sincronizar_lotes_insumo: deja los lotes de un insumo de acuerdo con su stock, y su fecha_caducidad
--    ENTRADA: p_id_insumo · SALIDA: nada (cambia lotes_insumo y insumos.fecha_caducidad)
--    Ej: stock 3000, lotes A 500 (vence 05/11) + B 2000 (vence 20/11) + C 300 (sin vencimiento) = 2800 → falta saldo:
--        crea un lote "ajuste" de 200 sin vencimiento · stock 1300 con esos lotes (3000) → sobra 1700: A 500 → 0,
--        B 2000 → 800 (le toma 1200) · fecha_caducidad = 20/11 (A ya no tiene saldo)
-- ----------------------------------------------------------------------------
create or replace function sincronizar_lotes_insumo(p_id_insumo integer)   -- crea la función (o la reemplaza)
returns void                                             -- no devuelve nada
language plpgsql                                         -- plpgsql: SQL con if, for y variables
set search_path = public                                 -- busca las tablas SIEMPRE en public (seguridad)
as $$
declare
  v_stock        numeric;                                -- el stock del insumo (vacío = 0)
  v_saldo        numeric;                                -- la suma de los saldos de sus lotes
  v_diferencia   numeric;                                -- stock (o 0 si es negativo) − saldo
  v_sacar        numeric;                                -- lo que falta descontar de los lotes (FIFO)
  v_lote         record;                                 -- un lote, en la vuelta del FIFO
  v_toma         numeric;                                -- lo que se le saca a ese lote
  v_vencimiento  date;                                   -- el vencimiento más próximo con saldo (o vacío)
begin
  -- 1. El stock del insumo (si el insumo no existe, no hay nada que hacer)
  select coalesce(stock_actual, 0) into v_stock from insumos where id = p_id_insumo;
  if not found then
    return;
  end if;

  -- 2. Cuánto suman los saldos y la diferencia con el stock (un stock negativo cuenta como 0: no hay lotes "en contra")
  select coalesce(sum(cantidad_restante), 0) into v_saldo from lotes_insumo where id_insumo = p_id_insumo;
  v_diferencia := greatest(v_stock, 0) - v_saldo;        -- > 0: entró algo sin lote · < 0: salió algo · 0: está justo

  -- 3. Entró algo sin lote (una entrada suelta, un stock editado a mano): un lote "ajuste" sin vencimiento
  if v_diferencia > 0 then
    insert into lotes_insumo (id_insumo, origen, fecha_vencimiento, cantidad_inicial, cantidad_restante)
    values (p_id_insumo, 'ajuste', null, v_diferencia, v_diferencia);   -- va al final del FIFO (sin vencimiento)
  end if;

  -- 4. Salió algo: se descuenta de los lotes con saldo, en orden FIFO. De cada lote se toma lo que se pueda
  --    (todo su saldo o lo que falte) y se sigue con el siguiente hasta completar.
  --    Ej: salen 1500 y el primero tiene 500 → ese queda en 0 y faltan 1000, que se sacan del siguiente.
  --    "for update" = esos lotes quedan bloqueados hasta el final (dos salidas a la vez no se pisan)
  v_sacar := greatest(-v_diferencia, 0);                 -- lo que hay que descontar (0 si no salió nada)
  for v_lote in
    select id, cantidad_restante
      from lotes_insumo
     where id_insumo = p_id_insumo
       and cantidad_restante > 0
     order by fecha_vencimiento asc nulls last,          -- 1º el que vence antes; los sin vencimiento, al final
              fecha_ingreso asc,                         -- 2º si empatan, el que entró antes
              id asc                                     -- 3º si siguen empatados, el número más bajo
       for update
  loop
    exit when v_sacar <= 0;                              -- ya se descontó todo: termina la vuelta
    v_toma := least(v_lote.cantidad_restante, v_sacar);  -- lo que se le saca a este lote (todo su saldo, o lo que falta)
    update lotes_insumo
       set cantidad_restante = cantidad_restante - v_toma
     where id = v_lote.id;
    v_sacar := v_sacar - v_toma;                         -- lo que todavía falta descontar
  end loop;

  -- 5. La fecha de caducidad del insumo: el vencimiento más próximo entre los lotes que todavía tienen saldo
  --    (vacía si no queda ninguno con vencimiento). Solo se escribe si cambió.
  select min(fecha_vencimiento) into v_vencimiento
    from lotes_insumo
   where id_insumo = p_id_insumo
     and cantidad_restante > 0;
  update insumos
     set fecha_caducidad = v_vencimiento
   where id = p_id_insumo
     and fecha_caducidad is distinct from v_vencimiento; -- "is distinct from" también compara bien con vacíos
end;
$$;

comment on function sincronizar_lotes_insumo(integer) is
  'FIFO (28/10): deja los lotes del insumo de acuerdo con su stock (descuenta FIFO por vencimiento o crea un lote '
  '"ajuste") y escribe insumos.fecha_caducidad. La llama el disparador de insumos; no hace falta llamarla a mano.';


-- ----------------------------------------------------------------------------
-- 3. EL DISPARADOR: cada vez que cambia stock_actual (o se crea un insumo), se sincronizan sus lotes
--    Así funciona en TODOS los caminos sin tocarlos: producir_viandas, descontar_insumos_pedido, las entradas y
--    salidas sueltas del servidor, editar el stock en Gestión de Stock y el servidor viejo (rama Rodriguez).
--    Un insumo nuevo con stock arranca con un lote "inicial" con la fecha de caducidad que se cargó.
--    Cambiar solo fecha_caducidad no lo dispara ("update of stock_actual"), así no se llama a sí mismo.
-- ----------------------------------------------------------------------------
create or replace function disparador_lotes_insumo()     -- la función que llama el disparador
returns trigger                                          -- es de un disparador
language plpgsql
set search_path = public
as $$
begin
  -- Un insumo nuevo con stock: su primer lote, con la fecha de caducidad que se cargó en el alta
  if tg_op = 'INSERT' and coalesce(new.stock_actual, 0) > 0 then
    insert into lotes_insumo (id_insumo, origen, fecha_vencimiento, cantidad_inicial, cantidad_restante)
    values (new.id, 'inicial', new.fecha_caducidad::date, new.stock_actual, new.stock_actual);
  end if;

  perform sincronizar_lotes_insumo(new.id);              -- los lotes, de acuerdo con el stock nuevo
  return null;                                           -- (en un disparador "after" no se usa lo que devuelve)
end;
$$;

drop trigger if exists lotes_insumo_fifo on insumos;     -- si ya estaba de una corrida anterior, se vuelve a crear igual
create trigger lotes_insumo_fifo                         -- el disparador:
  after insert or update of stock_actual on insumos      -- después de crear un insumo o de cambiar su stock_actual...
  for each row                                           -- ...por cada insumo tocado...
  execute function disparador_lotes_insumo();            -- ...sincroniza sus lotes


-- ----------------------------------------------------------------------------
-- 4. registrar_compra CON LOTES (28/10): igual que antes (sql/compras_funciones.sql), y además cada renglón crea su
--    lote con su vencimiento ANTES de sumar el stock. Lo único nuevo está en el paso 8 (marcado "28/10").
-- ----------------------------------------------------------------------------
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
  v_fecha          date;         -- día de la compra (hoy si no viene)
  v_fecha_hora     timestamptz;  -- ese día a las 12 hs de Argentina
  v_item           jsonb;        -- un renglón de la lista
  v_vencimiento    date;         -- vencimiento de un renglón (puede ser null)
  v_id_malo        integer;      -- id de un insumo que no existe
  v_nombre         text;         -- nombre de un insumo inactivo
  v_insumo         record;       -- datos del insumo de un renglón
  v_id_compra      integer;      -- número de la compra creada
  v_id_movimiento  bigint;       -- 28/10: el número de la entrada de cada renglón (para atarle su lote)
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

  -- 8. Por cada renglón: una ENTRADA en movimientos_stock, SU LOTE (28/10) y sumar al stock.
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

    -- El movimiento (los costos quedan vacíos). 28/10: se guarda su número para atarle el lote
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
    )
    returning id into v_id_movimiento;

    -- 28/10: el lote de este renglón, con su vencimiento y todo su saldo. Va ANTES de sumar el stock: cuando el
    -- disparador compare, la suma ya da justo (si el stock estaba en negativo, el disparador le descuenta esa deuda)
    insert into lotes_insumo (id_insumo, id_movimiento, origen, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_restante)
    values (v_insumo.id, v_id_movimiento, 'compra', v_fecha_hora, v_vencimiento,
            (v_item->>'cantidad')::numeric, (v_item->>'cantidad')::numeric);

    -- Sumar al stock del insumo (el disparador sincroniza los lotes y la fecha de caducidad)
    update insumos
       set stock_actual = coalesce(stock_actual, 0) + (v_item->>'cantidad')::numeric
     where id = v_insumo.id;
  end loop;

  return jsonb_build_object('ok', true, 'id_compra', v_id_compra);
end;
$$;


-- ----------------------------------------------------------------------------
-- 5. LA CARGA INICIAL: los lotes de los insumos que ya existen (solo de los que todavía no tienen ninguno)
--    El stock de hoy se reparte entre sus entradas, de la MÁS NUEVA a la más vieja: con FIFO, lo que queda es lo
--    último que entró. Cada entrada queda como lote con lo que le tocó (las más viejas, en 0: ya se usaron).
--    Lo que no cubren las entradas queda como lote "inicial" con la fecha de caducidad que tiene hoy el insumo.
--    Las cantidades de las entradas sueltas se pasan a la unidad del insumo (ej: 2 kg → 2000 g), como el servidor.
--    Ej: harina con stock 2500 g y entradas (de la más nueva) 2000 g, 1000 g, 3000 g → lotes 2000 (queda 2000),
--        1000 (queda 500), 3000 (queda 0).
-- ----------------------------------------------------------------------------
do $$
declare
  v_insumo      record;                                  -- un insumo sin lotes
  v_entrada     record;                                  -- una de sus entradas
  v_queda       numeric;                                 -- lo que falta repartir del stock
  v_factor_mov  numeric;                                 -- cuánto vale 1 de la unidad de la entrada (g = 1, kg = 1000…)
  v_factor_ins  numeric;                                 -- cuánto vale 1 de la unidad del insumo
  v_familia_mov text;                                    -- masa · volumen · unidad (de la entrada)
  v_familia_ins text;                                    -- masa · volumen · unidad (del insumo)
  v_cantidad    numeric;                                 -- la cantidad de la entrada, en la unidad del insumo
  v_toma        numeric;                                 -- lo que le toca a esa entrada del stock de hoy
begin
  for v_insumo in
    select i.id, coalesce(i.stock_actual, 0) as stock, lower(trim(coalesce(i.unidad_medida, ''))) as unidad,
           i.fecha_caducidad::date as caducidad, i.fecha_ingreso
      from insumos i
     where not exists (select 1 from lotes_insumo l where l.id_insumo = i.id)   -- solo los que no tienen lotes
     order by i.id
  loop
    v_queda := greatest(v_insumo.stock, 0);              -- lo que hay que repartir (un negativo cuenta como 0)

    -- Las unidades del insumo (las mismas tablas que FACTOR_UNIDAD y FAMILIA_UNIDAD del servidor)
    v_factor_ins := case v_insumo.unidad when 'g' then 1 when 'kg' then 1000 when 'ml' then 1 when 'lts' then 1000 when 'u' then 1 end;
    v_familia_ins := case v_insumo.unidad when 'g' then 'masa' when 'kg' then 'masa' when 'ml' then 'volumen' when 'lts' then 'volumen' when 'u' then 'unidad' end;

    -- Las entradas, de la más nueva a la más vieja
    for v_entrada in
      select m.id, coalesce(m.cantidad, 0) as cantidad, lower(trim(coalesce(m.unidad, ''))) as unidad,
             m.fecha, m.fecha_vencimiento, m.id_compra
        from movimientos_stock m
       where m.id_insumo = v_insumo.id
         and m.tipo = 'entrada'
       order by m.fecha desc nulls last, m.id desc
    loop
      -- La cantidad en la unidad del insumo. Si alguna unidad no se conoce o son de otra familia, queda como está
      -- (lo mismo que hace el servidor con convertirACantidadBase)
      v_factor_mov := case v_entrada.unidad when 'g' then 1 when 'kg' then 1000 when 'ml' then 1 when 'lts' then 1000 when 'u' then 1 end;
      v_familia_mov := case v_entrada.unidad when 'g' then 'masa' when 'kg' then 'masa' when 'ml' then 'volumen' when 'lts' then 'volumen' when 'u' then 'unidad' end;
      v_cantidad := v_entrada.cantidad;
      if v_factor_mov is not null and v_factor_ins is not null and v_familia_mov = v_familia_ins then
        v_cantidad := v_entrada.cantidad * v_factor_mov / v_factor_ins;   -- ej: 2 kg con el insumo en g → 2000
      end if;
      continue when v_cantidad <= 0;                     -- una entrada en 0 no es un lote: sigue con la siguiente

      v_toma := least(v_cantidad, v_queda);              -- lo que le toca del stock de hoy (0 si ya se repartió todo)
      insert into lotes_insumo (id_insumo, id_movimiento, origen, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_restante)
      values (v_insumo.id, v_entrada.id,
              case when v_entrada.id_compra is not null then 'compra' else 'entrada' end,   -- compra o entrada suelta
              coalesce(v_entrada.fecha, now()), v_entrada.fecha_vencimiento, v_cantidad, v_toma);
      v_queda := v_queda - v_toma;                       -- lo que falta repartir
    end loop;

    -- Lo que no cubren las entradas (stock cargado en el alta o editado a mano): un lote "inicial", con la fecha de
    -- caducidad que tiene hoy el insumo (así no se pierde). Es lo más viejo: entra con la fecha de alta del insumo
    if v_queda > 0 then
      insert into lotes_insumo (id_insumo, origen, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_restante)
      values (v_insumo.id, 'inicial', coalesce(v_insumo.fecha_ingreso::timestamptz, now()), v_insumo.caducidad, v_queda, v_queda);
    end if;
  end loop;
end;
$$;

-- Y la fecha de caducidad de todos los insumos, ya calculada con sus lotes (los que tienen stock 0 o negativo
-- quedan sin fecha: no tienen nada que venza)
select sincronizar_lotes_insumo(id) from insumos;


-- ----------------------------------------------------------------------------
-- 6. PERMISOS Y RECARGA: las funciones solo las ejecuta el servidor (service_role), como las demás
-- ----------------------------------------------------------------------------
revoke execute on function sincronizar_lotes_insumo(integer) from public, anon, authenticated;
grant  execute on function sincronizar_lotes_insumo(integer) to service_role;
revoke execute on function disparador_lotes_insumo() from public, anon, authenticated;
revoke execute on function registrar_compra(uuid, date, text, jsonb) from public, anon, authenticated;
grant  execute on function registrar_compra(uuid, date, text, jsonb) to service_role;

notify pgrst, 'reload schema';                           -- que la API vea la tabla nueva

commit;                                                  -- fin: se guarda todo junto
