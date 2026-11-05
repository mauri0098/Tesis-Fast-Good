-- ============================================================================
-- anular_por_armar.sql — Que "Anular" devuelva las viandas también en "Por armar" (05/11)
--
-- Lo corre Mauri en el SQL Editor de Supabase.
-- Hoy anular_pedido_con_devolucion devuelve las viandas a la heladera solo si el pedido está en 1, 2 o 3.
-- Con el estado nuevo 6 "Por armar" (sql/estado_por_armar.sql) hay que sumarle el 6: si no, anular un
-- pedido "Por armar" lo pasa a Cancelado pero sus viandas NO vuelven a la heladera.
--
-- El único cambio va a ser una línea:   in (1, 2, 3)   →   in (1, 2, 3, 6)
-- La función se arma con la que está HOY en la base (PARTE 1), no con la copia vieja de sql/heladera.sql.
--
-- Tiene 3 partes (se puede correr el archivo entero; Supabase muestra solo el resultado de la última consulta):
--   PARTE 1 (solo lee): la función como está hoy. Es de donde salió la PARTE 2.
--   PARTE 2 (cambia):   la misma función con el 6 agregado y los mismos permisos.
--   PARTE 3 (solo lee): cómo quedó. Mauri le pasa a Claude lo que sale.
-- ============================================================================


-- PARTE 1 (solo lee): la función como está hoy en la base, entera
-- OJO: el SQL Editor de Supabase muestra solo el resultado de la ÚLTIMA consulta. Para ver la función,
-- seleccioná SOLO la línea de abajo y tocá "Run" (corre solo lo seleccionado).
select pg_get_functiondef('anular_pedido_con_devolucion'::regproc);  -- el texto completo de la función (sale en una sola celda)

-- Si la de arriba da "more than one function named...", hay dos con el mismo nombre: corré esta en su lugar,
-- que busca la que recibe (número de pedido, usuario):
-- select pg_get_functiondef('anular_pedido_con_devolucion(integer, uuid)'::regprocedure);

-- Quién la puede ejecutar hoy (solo lee). Tiene que salir solo service_role (y postgres, el dueño).
select grantee,                                                -- quién tiene el permiso
       privilege_type                                          -- qué permiso (EXECUTE = ejecutarla)
  from information_schema.routine_privileges                   -- de la lista de permisos de las funciones...
 where routine_name = 'anular_pedido_con_devolucion';          -- ...solo los de esta función


-- PARTE 2 (cambia): la misma función que está HOY en la base (la de la PARTE 1), con un solo cambio en el PASO 3:
--   in (1, 2, 3)  →  in (1, 2, 3, 6)
-- "create or replace" la reemplaza: no borra datos ni cambia su nombre. Todo junto o nada (begin / commit).
begin;                                                 -- abre el bloque: todo lo de abajo se aplica junto o no se aplica nada

CREATE OR REPLACE FUNCTION public.anular_pedido_con_devolucion(p_id_pedido integer, p_id_usuario uuid)  -- la reemplaza: mismo nombre y mismos datos de entrada
 RETURNS jsonb                 -- devuelve un JSON: { ok, ... }
 LANGUAGE plpgsql              -- está escrita en plpgsql (SQL con if, for y variables)
 SET search_path TO 'public'   -- busca las tablas SIEMPRE en public (seguridad)
AS $function$                                                  -- desde acá hasta el cierre de abajo es el código de la función
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
  if v_pedido.id_estado in (1, 2, 3, 6) then           -- si todavía no se entregó...
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
$function$;

-- PERMISOS: los mismos de hoy. Solo la ejecuta el servidor (service_role): así nadie puede llamarla directo con la
-- clave pública de la web y anular pedidos sin pasar por el PIN.
revoke execute on function anular_pedido_con_devolucion(integer, uuid)  -- saca el permiso de ejecutarla...
  from public, anon, authenticated;                    -- ...a todos los de afuera
grant execute on function anular_pedido_con_devolucion(integer, uuid)   -- da el permiso de ejecutarla...
  to service_role;                                     -- ...solo al servidor

commit;                                                -- cierra el bloque y confirma todo


-- PARTE 3 (solo lee): cómo quedó. Tiene que salir: tiene_el_6 = true · pueden_ejecutarla = postgres, service_role
select (pg_get_functiondef('anular_pedido_con_devolucion'::regproc) like '%in (1, 2, 3, 6)%') as tiene_el_6,  -- ¿ya tiene el 6?
       (select string_agg(grantee, ', ' order by grantee)      -- quiénes la pueden ejecutar, separados por coma
          from information_schema.routine_privileges           -- de la lista de permisos de las funciones...
         where routine_name = 'anular_pedido_con_devolucion') as pueden_ejecutarla;  -- ...solo los de esta función
