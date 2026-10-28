-- =====================================================
-- CÓDIGO DE PLATO (28/10) — abreviatura del plan + número del plato dentro del plan
--   Ej: MANTENIMIENTO = F → F1, F2, F3…  ·  PLAN DESCENSO DE PESO = K → K1, K2…  ·  SIN TACC = SG → SG1…
--
--   Bloque A: MIRAR (solo lee, no cambia nada). Corré A1 y pasame el resultado; A2 y A3 son el detalle.
--   Bloque B a E: TODO JUNTO, todo o nada (un solo begin … commit):
--     B. las abreviaturas de los 8 planes, con su control de formato y que no se repitan
--     C. el contador de cada plan (planes.ultimo_numero_plato): así un número nunca se vuelve a usar
--     D. los códigos de los platos que ya existen (los nombres NO se tocan)
--     E. que un código no se pueda repetir dentro de un plan
--   Bloque F: las 3 funciones de la base que usa el servidor (cada una todo o nada, solo para el servidor):
--     tomar_codigo_plato       → el próximo código de un plan (plato nuevo)
--     cambiar_plan_plato       → pasa un plato a otro plan, con su código nuevo (Editar receta)
--     cambiar_abreviatura_plan → cambia la abreviatura y los códigos de sus platos (F3 → M3)
--
-- Reglas:
--   - Solo AGREGA: columnas, controles, índices y funciones nuevas. No borra ni renombra nada.
--     Lo único que CAMBIA son los datos de dos columnas que ya existían y hoy están vacías o a medias:
--     planes.codigo_plan (hoy null en los 8) y productos.codigo_plato (hoy "1", "2", "3", sin letra).
--   - Los NOMBRES de los platos no se tocan.
--   - Las funciones: "set search_path = public" y solo las ejecuta el servidor (revoke / grant).
--   - Nunca los dos signos de pesos juntos adentro del código (ni en comentarios).
--
-- Cómo usarlo: Supabase → SQL Editor → pegá SOLO el bloque que vas a correr → "Run".
--   Orden: A1 (y si querés A2 y A3) → me pasás el resultado → B a E → F.
--   B a E y F se pueden volver a correr: lo que ya existe no se repite ("if not exists", "create or replace").
-- =====================================================


-- =====================================================
-- BLOQUE A — MIRAR (solo lee: se puede correr las veces que quieras)
-- =====================================================

-- A1. EL RESUMEN, en una sola fila: pasame esta fila.
select                                                                          -- una sola fila con todo lo que hay que saber:
  (select count(*) from productos)                               as platos_total,           -- cuántos platos hay (activos y desactivados)
  (select count(*) from productos where activo)                  as platos_activos,         -- cuántos están activos
  (select count(*) from productos where id_plan is null)         as platos_sin_plan,        -- cuántos no tienen plan (no se les puede armar código)
  (select count(*) from productos                                                            -- cuántos tienen el código escrito en el nombre…
     where nombre ~ '^\s*[A-Za-z]{1,4}\s*[0-9]+\s*-')            as codigo_en_el_nombre,    -- …tipo "F1 - Pollito" o "K1- Pollito"
  (select count(*) from productos where codigo_plato is null)    as sin_codigo,             -- cuántos no tienen código
  (select count(*) from productos where codigo_plato ~ '^[0-9]+$') as codigo_solo_numero,   -- cuántos tienen solo el número ("1", "2")
  (select count(*) from (                                                                   -- cuántos códigos están repetidos dentro de un plan:
     select id_plan, codigo_plato from productos                                            -- agrupa por plan y código…
     where codigo_plato is not null                                                         -- …(los vacíos no cuentan)…
     group by id_plan, codigo_plato having count(*) > 1) r)      as codigos_repetidos,      -- …y cuenta los grupos con más de uno
  (select count(*) from planes)                                  as planes_total,           -- cuántos planes hay
  (select count(*) from planes where codigo_plan is not null)    as planes_con_abreviatura, -- cuántos ya tienen abreviatura
  (select data_type || coalesce('(' || character_maximum_length || ')', '')                  -- de qué tipo es la columna del código del plan…
     from information_schema.columns                                                        -- …(se lee de la descripción de las tablas)…
     where table_schema = 'public' and table_name = 'planes' and column_name = 'codigo_plan') as tipo_codigo_plan,      -- …ej: "text"
  (select data_type || coalesce('(' || character_maximum_length || ')', '')                  -- y la del código del plato
     from information_schema.columns                                                        -- (lo mismo)
     where table_schema = 'public' and table_name = 'productos' and column_name = 'codigo_plato') as tipo_codigo_plato; -- ej: "text"

-- A2. LOS PLATOS, uno por fila (para mirar el detalle: no hace falta pasármelo si A1 da 0 en "codigo_en_el_nombre")
select                                                                          -- por cada plato:
  p.id,                                                                         -- su número
  pl.nombre        -                            as plan,                         -- el nombre de su plan
  p.activo,                                                                     -- si está activo
  p.codigo_plato                               as codigo_hoy,                   -- el código que tiene hoy
  substring(p.nombre from '^\s*([A-Za-z]{1,4}\s*[0-9]+)\s*-') as codigo_en_el_nombre,  -- el código escrito en el nombre (vacío si no tiene)
  p.nombre                                                                      -- el nombre (no se toca)
from productos p                                                                -- de la tabla de platos…
left join planes pl on pl.id = p.id_plan                                        -- …con su plan (left: también los que no tienen)
order by pl.nombre, p.id;                                                       -- por plan y por número

-- A3. LOS PLANES, uno por fila
select                                                                          -- por cada plan:
  pl.id,                                                                        -- su número
  pl.nombre,                                                                    -- su nombre
  pl.activo,                                                                    -- si está activo
  pl.codigo_plan                               as abreviatura_hoy,              -- la abreviatura de hoy (null = no tiene)
  (select count(*) from productos p where p.id_plan = pl.id) as platos          -- cuántos platos tiene (activos y desactivados)
from planes pl                                                                  -- de la tabla de planes
order by pl.id;                                                                 -- por número


-- =====================================================
-- BLOQUE B a E — TODO JUNTO (todo o nada: si algo falla, no queda guardado nada)
-- =====================================================
begin;                                                                          -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

-- ── B. LAS ABREVIATURAS ──────────────────────────────────────────────────────
-- Cada plan se busca por su número Y por su nombre: si alguno no coincide (ej: el plan 2 ya no se llama
-- MANTENIMIENTO), no se cambia y el control de abajo frena todo el bloque.
update planes set codigo_plan = 'F'  where id = 2 and upper(nombre) = 'MANTENIMIENTO';          -- Mantenimiento → F
update planes set codigo_plan = 'K'  where id = 1 and upper(nombre) = 'PLAN DESCENSO DE PESO';  -- Descenso de peso → K
update planes set codigo_plan = 'SG' where id = 6 and upper(nombre) = 'SIN TACC';               -- Sin TACC → SG
update planes set codigo_plan = 'D'  where id = 3 and upper(nombre) = 'PLAN DEPORTIVO';         -- Deportivo → D
update planes set codigo_plan = 'V'  where id = 4 and upper(nombre) = 'PLAN VEGGIE';            -- Veggie → V
update planes set codigo_plan = 'KI' where id = 5 and upper(nombre) = 'PLAN KIDS';              -- Kids → KI
update planes set codigo_plan = 'A'  where id = 7 and upper(nombre) = 'ANTOJOS SALUDABLES';     -- Antojos saludables → A
update planes set codigo_plan = 'P'  where id = 8 and upper(nombre) = 'PROMO SEMANAL';          -- Promo semanal → P

do $$                                                                           -- un pedacito de código para controlar:
declare                                                                         -- variables:
  v_con_abreviatura integer;                                                    -- cuántos de los 8 quedaron con su abreviatura
begin                                                                           -- empieza
  select count(*) into v_con_abreviatura                                        -- cuenta…
  from planes                                                                   -- …en los planes…
  where (id, codigo_plan) in ((2, 'F'), (1, 'K'), (6, 'SG'), (3, 'D'),          -- …los que quedaron con la abreviatura
                              (4, 'V'), (5, 'KI'), (7, 'A'), (8, 'P'));         --    que les tocaba
  if v_con_abreviatura <> 8 then                                                -- si no son los 8…
    raise exception 'Solo % de los 8 planes quedaron con su abreviatura: algún número o nombre de plan no coincide. No se guardó nada.', v_con_abreviatura;  -- …se frena y se deshace todo
  end if;                                                                       -- fin del control
end;                                                                            -- fin del pedacito
$$;                                                                             -- fin

-- El formato: de 1 a 4 letras en MAYÚSCULA, sin números (así "KI1" nunca se confunde con "K" + número).
-- Se agrega solo si todavía no existe (así el bloque se puede volver a correr).
do $$                                                                           -- un pedacito de código:
begin                                                                           -- empieza
  if not exists (select 1 from pg_constraint                                    -- si todavía no existe…
                 where conname = 'planes_codigo_plan_formato') then             -- …el control con este nombre…
    alter table planes                                                          -- …a la tabla de planes…
      add constraint planes_codigo_plan_formato                                 -- …se le agrega el control…
      check (codigo_plan is null or codigo_plan ~ '^[A-Z]{1,4}$');              -- …vacío, o de 1 a 4 letras mayúsculas
  end if;                                                                       -- fin
end;                                                                            -- fin del pedacito
$$;                                                                             -- fin

-- Que dos planes no tengan la misma abreviatura (sin importar mayúsculas). Los vacíos no cuentan.
create unique index if not exists planes_codigo_plan_unico                     -- un índice único (si no existe)…
  on planes (upper(codigo_plan));                                               -- …sobre la abreviatura en mayúscula

-- ── C. EL CONTADOR DE CADA PLAN ──────────────────────────────────────────────
-- El último número que se dio en ese plan. El próximo plato es ese + 1, y nunca baja:
-- si F3 se desactiva o se pasa a otro plan, el próximo plato nuevo de F es F4 (no otra vez F3).
alter table planes                                                              -- a la tabla de planes…
  add column if not exists ultimo_numero_plato integer not null default 0       -- …la columna nueva (empieza en 0)…
  check (ultimo_numero_plato >= 0);                                             -- …que nunca puede ser negativa

-- ── D. LOS CÓDIGOS DE LOS PLATOS QUE YA EXISTEN ──────────────────────────────
-- Por cada plan, en orden de número de plato (id), en 3 pasadas:
--   1. el que tiene en el NOMBRE un código de su mismo plan ("F1 - Pollito" en Mantenimiento) se queda con ese número;
--   2. el que ya tiene un código que es solo un número ("1") o el código de su plan ("F3") lo conserva (→ F1, F3);
--   3. al resto (o si su número ya lo tomó otro) le toca el siguiente número libre del plan.
-- Después, el contador de cada plan queda en su número más alto. Los platos sin plan no se tocan.
do $$                                                                           -- el código que arma los códigos:
declare                                                                         -- variables:
  v_plan   record;                                                              -- un plan (id, abreviatura)
  v_plato  record;                                                              -- un plato de ese plan
  v_partes text[];                                                              -- las partes del código leído: [letras, número]
  v_numero integer;                                                             -- el número que le tocaría al plato
  v_maximo integer;                                                             -- el número más alto que se dio en el plan
  v_mal    integer;                                                             -- cuántos platos quedaron mal (para el control final)
begin                                                                           -- empieza
  -- La lista de lo que se va a asignar (solo dura mientras corre el bloque)
  create temporary table codigos_nuevos (                                       -- una tabla de paso:
    id_producto integer primary key,                                            -- el plato (una sola vez cada uno)
    id_plan     integer not null,                                               -- su plan
    numero      integer not null,                                               -- el número que le toca
    unique (id_plan, numero)                                                    -- un número no se repite en un plan
  ) on commit drop;                                                             -- se borra sola al terminar el bloque

  for v_plan in select id, codigo_plan from planes where codigo_plan is not null order by id loop  -- por cada plan con abreviatura…

    -- Pasada 1: el código escrito en el nombre (solo si es de este mismo plan)
    for v_plato in select id, nombre from productos where id_plan = v_plan.id order by id loop   -- por cada plato del plan…
      v_partes := regexp_match(v_plato.nombre, '^\s*([A-Za-z]{1,4})\s*([0-9]+)\s*-');             -- lee "F1 -" del principio del nombre
      if v_partes is null or upper(v_partes[1]) <> v_plan.codigo_plan then continue; end if;      -- sin código, o de otro plan: sigue con el próximo
      v_numero := v_partes[2]::integer;                                                            -- el número escrito
      if v_numero < 1 then continue; end if;                                                       -- un 0 no vale: va a la pasada 3
      if exists (select 1 from codigos_nuevos where id_plan = v_plan.id and numero = v_numero) then continue; end if;  -- ya lo tomó otro: pasada 3
      insert into codigos_nuevos values (v_plato.id, v_plan.id, v_numero);                         -- se queda con ese número
    end loop;                                                                                      -- fin de la pasada 1

    -- Pasada 2: el código que ya tiene ("1" o "F1"), si es de este plan
    for v_plato in select id, codigo_plato from productos where id_plan = v_plan.id order by id loop  -- por cada plato del plan…
      if exists (select 1 from codigos_nuevos where id_producto = v_plato.id) then continue; end if;  -- ya tiene número (pasada 1): sigue
      v_partes := regexp_match(coalesce(v_plato.codigo_plato, ''), '^([A-Za-z]{0,4})([0-9]+)$');     -- lee "1" o "F1"
      if v_partes is null then continue; end if;                                                      -- no tiene un código así: pasada 3
      if v_partes[1] <> '' and upper(v_partes[1]) <> v_plan.codigo_plan then continue; end if;        -- trae letras de otro plan: pasada 3
      v_numero := v_partes[2]::integer;                                                               -- su número
      if v_numero < 1 then continue; end if;                                                          -- un 0 no vale: pasada 3
      if exists (select 1 from codigos_nuevos where id_plan = v_plan.id and numero = v_numero) then continue; end if;  -- ya lo tomó otro: pasada 3
      insert into codigos_nuevos values (v_plato.id, v_plan.id, v_numero);                            -- lo conserva
    end loop;                                                                                         -- fin de la pasada 2

    -- Pasada 3: a los que quedaron sin número, el siguiente libre (después del más alto del plan)
    select coalesce(max(numero), 0) into v_maximo from codigos_nuevos where id_plan = v_plan.id;    -- el más alto hasta ahora (0 si no hay)
    for v_plato in select id from productos where id_plan = v_plan.id order by id loop               -- por cada plato del plan…
      if exists (select 1 from codigos_nuevos where id_producto = v_plato.id) then continue; end if;  -- ya tiene número: sigue
      v_maximo := v_maximo + 1;                                                                       -- el siguiente libre
      insert into codigos_nuevos values (v_plato.id, v_plan.id, v_maximo);                            -- se lo lleva
    end loop;                                                                                         -- fin de la pasada 3

    -- El contador del plan queda en el más alto (nunca baja: si ya era mayor, se deja)
    update planes                                                                                    -- en el plan…
      set ultimo_numero_plato = greatest(ultimo_numero_plato, v_maximo)                              -- …el contador = el mayor de los dos
      where id = v_plan.id;                                                                          -- …de este plan
  end loop;                                                                                          -- fin de los planes

  -- Se guardan los códigos: abreviatura del plan + número (ej: "F" + 3 = "F3")
  update productos p                                                            -- en los platos…
    set codigo_plato = pl.codigo_plan || c.numero                               -- …el código armado…
    from codigos_nuevos c                                                       -- …con la lista de paso…
    join planes pl on pl.id = c.id_plan                                         -- …y la abreviatura de su plan…
    where p.id = c.id_producto;                                                 -- …para cada plato de la lista

  -- Control: todo plato con plan quedó con "abreviatura de su plan + número"
  select count(*) into v_mal                                                    -- cuenta…
  from productos p join planes pl on pl.id = p.id_plan                          -- …los platos con plan…
  where pl.codigo_plan is not null                                              -- …(con abreviatura)…
    and (p.codigo_plato is null                                                 -- …que quedaron sin código…
         or p.codigo_plato !~ ('^' || pl.codigo_plan || '[0-9]+$'));            -- …o con un código que no es el de su plan
  if v_mal > 0 then                                                             -- si hay alguno…
    raise exception '% platos quedaron sin su código. No se guardó nada.', v_mal;  -- …se frena y se deshace todo
  end if;                                                                       -- fin del control
end;                                                                            -- fin del código
$$;                                                                             -- fin

-- ── E. QUE UN CÓDIGO NO SE REPITA DENTRO DE UN PLAN ──────────────────────────
-- Como las abreviaturas no se repiten, tampoco se repiten los códigos en todo el sistema.
create unique index if not exists productos_codigo_plato_unico_por_plan        -- un índice único (si no existe)…
  on productos (id_plan, codigo_plato);                                         -- …plan + código

commit;                                                                         -- cierra el bloque y confirma todo

-- Para mirar cómo quedó (solo lee): corré de nuevo A2 y A3.


-- =====================================================
-- BLOQUE F — LAS FUNCIONES QUE USA EL SERVIDOR
-- =====================================================
begin;                                                                          -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

-- ─────────────────────────────────────────────────────────────────────────────
-- tomar_codigo_plato → el próximo código de un plan, para un plato NUEVO (Generar Receta → Nuevo producto)
-- ENTRADA: p_id_plan, el plan elegido
-- SALIDA:  { ok: true, codigo: 'F4' }  ·  { ok: false, error: '…' } si el plan no existe, está desactivado
--          o no tiene abreviatura (en ese caso no se cambia nada)
-- Ej: Mantenimiento con el contador en 3 → { ok: true, codigo: 'F4' } y el contador queda en 4.
-- Suma 1 y lee el número en UNA sola instrucción: si dos personas crean un plato a la vez, nunca
-- reciben el mismo número. Si después el plato no se guarda, ese número queda sin usar (no pasa nada).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function tomar_codigo_plato(                                  -- crea la función (o la reemplaza si ya existe)
  p_id_plan integer                                                             -- el plan
)                                                                               -- fin de lo que recibe
returns jsonb                                                                   -- devuelve un JSON: { ok, ... }
language plpgsql                                                                -- está escrita en plpgsql (SQL con if y variables)
set search_path = public                                                        -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                                           -- desde acá hasta el cierre de abajo es el código de la función
declare                                                                         -- variables:
  v_codigo text;                                                                -- el código que se da
begin                                                                           -- empieza el código
  update planes                                                                 -- en el plan…
    set ultimo_numero_plato = ultimo_numero_plato + 1                           -- …el contador sube 1…
    where id = p_id_plan                                                        -- …si es este plan…
      and activo                                                                -- …está activo…
      and codigo_plan is not null                                               -- …y tiene abreviatura…
    returning codigo_plan || ultimo_numero_plato into v_codigo;                 -- …y devuelve "abreviatura + número nuevo"

  if v_codigo is null then                                                      -- si no se cambió ningún plan…
    return jsonb_build_object('ok', false,                                      -- …no se pudo…
      'error', 'El plan no existe, está desactivado o no tiene abreviatura');   -- …con el motivo
  end if;                                                                       -- fin

  return jsonb_build_object('ok', true, 'codigo', v_codigo);                    -- listo: el código
end;                                                                            -- fin del código de la función
$$;                                                                             -- fin de la función

revoke execute on function tomar_codigo_plato(integer)                          -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                                             -- ...a todos los de afuera
grant execute on function tomar_codigo_plato(integer)                           -- da el permiso de ejecutarla...
  to service_role;                                                              -- ...solo al servidor

-- ─────────────────────────────────────────────────────────────────────────────
-- cambiar_plan_plato → pasa un plato a otro plan, con el código nuevo (Generar Receta → Editar)
-- ENTRADA: p_id_producto (el plato) y p_id_plan (el plan nuevo)
-- SALIDA:  { ok: true, codigo_anterior: 'F3', codigo_nuevo: 'K5' }
--          · { ok: false, error: '…' } si el plato no existe, el plan nuevo no existe / está desactivado /
--            no tiene abreviatura, o es el mismo plan (en esos casos no se cambia nada)
-- Ej: "Pollito" (F3) a Descenso de peso con el contador de K en 4 → { codigo_anterior: 'F3', codigo_nuevo: 'K5' }
-- Toca 2 tablas (el contador del plan y el plato): por eso es una función, todo o nada.
-- Lo guardado (pedidos, pedidos a cocina, heladera, menús de combos) apunta al número del plato, no al código:
-- no se rompe nada. El stock de la heladera es del plato y queda igual.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function cambiar_plan_plato(                                  -- crea la función (o la reemplaza si ya existe)
  p_id_producto integer,                                                        -- el plato
  p_id_plan     integer                                                         -- el plan nuevo
)                                                                               -- fin de lo que recibe
returns jsonb                                                                   -- devuelve un JSON: { ok, ... }
language plpgsql                                                                -- está escrita en plpgsql (SQL con if y variables)
set search_path = public                                                        -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                                           -- desde acá hasta el cierre de abajo es el código de la función
declare                                                                         -- variables:
  v_plato  record;                                                              -- el plato (id, id_plan, codigo_plato)
  v_codigo text;                                                                -- el código nuevo
begin                                                                           -- empieza el código
  -- PASO 1. El plato, con candado (si llegan dos cambios del mismo plato a la vez, el segundo espera)
  select id, id_plan, codigo_plato into v_plato                                 -- lee el plato…
    from productos where id = p_id_producto                                     -- …de este número…
    for update;                                                                 -- …y lo bloquea hasta terminar
  if not found then                                                             -- si no existe…
    return jsonb_build_object('ok', false, 'error', 'El plato no existe');      -- …no se hace nada
  end if;                                                                       -- fin
  if v_plato.id_plan = p_id_plan then                                           -- si es el mismo plan…
    return jsonb_build_object('ok', false, 'error', 'El plato ya es de ese plan');  -- …no hay nada que cambiar
  end if;                                                                       -- fin

  -- PASO 2. El código nuevo: el contador del plan nuevo sube 1 (en una sola instrucción, como tomar_codigo_plato)
  update planes                                                                 -- en el plan nuevo…
    set ultimo_numero_plato = ultimo_numero_plato + 1                           -- …el contador sube 1…
    where id = p_id_plan and activo and codigo_plan is not null                 -- …si existe, está activo y tiene abreviatura…
    returning codigo_plan || ultimo_numero_plato into v_codigo;                 -- …y devuelve el código nuevo
  if v_codigo is null then                                                      -- si no se pudo…
    return jsonb_build_object('ok', false,                                      -- …no se hace nada…
      'error', 'El plan nuevo no existe, está desactivado o no tiene abreviatura');  -- …con el motivo
  end if;                                                                       -- fin

  -- PASO 3. El plato pasa al plan nuevo con su código nuevo
  update productos                                                              -- en el plato…
    set id_plan = p_id_plan,                                                    -- …el plan nuevo…
        codigo_plato = v_codigo                                                 -- …y el código nuevo
    where id = p_id_producto;                                                   -- …de este plato

  return jsonb_build_object(                                                    -- listo: la respuesta
    'ok', true,                                                                 -- se hizo
    'codigo_anterior', v_plato.codigo_plato,                                    -- el código de antes (ej: F3)
    'codigo_nuevo', v_codigo                                                    -- el de ahora (ej: K5)
  );                                                                            -- fin de la respuesta
end;                                                                            -- fin del código de la función
$$;                                                                             -- fin de la función

revoke execute on function cambiar_plan_plato(integer, integer)                 -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                                             -- ...a todos los de afuera
grant execute on function cambiar_plan_plato(integer, integer)                  -- da el permiso de ejecutarla...
  to service_role;                                                              -- ...solo al servidor

-- ─────────────────────────────────────────────────────────────────────────────
-- cambiar_abreviatura_plan → cambia la abreviatura de un plan y los códigos de sus platos, con el mismo número
--                            (ventana "Abreviaturas de los planes" de Generar Receta)
-- ENTRADA: p_id_plan (el plan) y p_abreviatura (la nueva: de 1 a 4 letras; se pasa a mayúscula)
-- SALIDA:  { ok: true, abreviatura_anterior: 'F', abreviatura_nueva: 'M', platos_cambiados: 12 }
--          · { ok: false, error: '…' } si la abreviatura no tiene el formato, ya la usa otro plan o el plan
--            no existe (en esos casos no se cambia nada)
-- Ej: Mantenimiento de F a M → F1, F2, F3 pasan a M1, M2, M3 (el contador no cambia).
-- Toca 2 tablas (el plan y sus platos): por eso es una función, todo o nada.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function cambiar_abreviatura_plan(                            -- crea la función (o la reemplaza si ya existe)
  p_id_plan     integer,                                                        -- el plan
  p_abreviatura text                                                            -- la abreviatura nueva
)                                                                               -- fin de lo que recibe
returns jsonb                                                                   -- devuelve un JSON: { ok, ... }
language plpgsql                                                                -- está escrita en plpgsql (SQL con if y variables)
set search_path = public                                                        -- busca las tablas SIEMPRE en public (seguridad)
as $$                                                                           -- desde acá hasta el cierre de abajo es el código de la función
declare                                                                         -- variables:
  v_nueva    text;                                                              -- la abreviatura nueva, sin espacios y en mayúscula
  v_anterior text;                                                              -- la que tenía
  v_otro     text;                                                              -- el nombre del plan que ya la usa (si hay)
  v_cambiados integer;                                                          -- cuántos platos cambiaron de código
begin                                                                           -- empieza el código
  -- PASO 1. La abreviatura: de 1 a 4 letras (se pasa a mayúscula)
  v_nueva := upper(trim(coalesce(p_abreviatura, '')));                          -- sin espacios en los bordes y en mayúscula
  if v_nueva !~ '^[A-Z]{1,4}$' then                                             -- si no son de 1 a 4 letras…
    return jsonb_build_object('ok', false,                                      -- …no se hace nada…
      'error', 'La abreviatura tiene que tener de 1 a 4 letras, sin números');  -- …con el motivo
  end if;                                                                       -- fin

  -- PASO 2. El plan, con candado (si llegan dos cambios a la vez, el segundo espera)
  select codigo_plan into v_anterior                                            -- lee la abreviatura de hoy…
    from planes where id = p_id_plan                                            -- …de este plan…
    for update;                                                                 -- …y lo bloquea hasta terminar
  if not found then                                                             -- si no existe…
    return jsonb_build_object('ok', false, 'error', 'El plan no existe');      -- …no se hace nada
  end if;                                                                       -- fin

  -- PASO 3. Que no la use otro plan
  select nombre into v_otro                                                     -- busca el nombre…
    from planes                                                                 -- …de un plan…
    where upper(codigo_plan) = v_nueva and id <> p_id_plan                      -- …distinto, con la misma abreviatura
    limit 1;                                                                    -- (con uno alcanza)
  if v_otro is not null then                                                    -- si hay otro…
    return jsonb_build_object('ok', false,                                      -- …no se hace nada…
      'error', 'Esa abreviatura ya la usa el plan ' || v_otro);                 -- …y se dice cuál
  end if;                                                                       -- fin

  -- PASO 4. Se cambia la abreviatura del plan
  update planes set codigo_plan = v_nueva where id = p_id_plan;                 -- la nueva

  -- PASO 5. Los códigos de sus platos: la abreviatura nueva + el MISMO número (F3 → M3).
  --         Solo los que tienen un código "letras + número" (todos, después del bloque D)
  update productos                                                              -- en los platos…
    set codigo_plato = v_nueva || substring(codigo_plato from '([0-9]+)$')      -- …abreviatura nueva + su número…
    where id_plan = p_id_plan                                                   -- …de este plan…
      and codigo_plato ~ '^[A-Za-z]{0,4}[0-9]+$';                               -- …que tienen un código así
  get diagnostics v_cambiados = row_count;                                      -- cuántos se cambiaron

  return jsonb_build_object(                                                    -- listo: la respuesta
    'ok', true,                                                                 -- se hizo
    'abreviatura_anterior', v_anterior,                                         -- la de antes (ej: F)
    'abreviatura_nueva', v_nueva,                                               -- la de ahora (ej: M)
    'platos_cambiados', v_cambiados                                             -- cuántos platos cambiaron de código
  );                                                                            -- fin de la respuesta
end;                                                                            -- fin del código de la función
$$;                                                                             -- fin de la función

revoke execute on function cambiar_abreviatura_plan(integer, text)              -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                                             -- ...a todos los de afuera
grant execute on function cambiar_abreviatura_plan(integer, text)               -- da el permiso de ejecutarla...
  to service_role;                                                              -- ...solo al servidor

commit;                                                                         -- cierra el bloque y confirma todo
