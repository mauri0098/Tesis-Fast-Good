-- =====================================================
-- USUARIO "CONSUMIDOR FINAL"
-- A nombre de este usuario se guardan los pedidos de clientes SIN sesión.
-- Hasta ahora se guardaban a nombre del usuario admin d9b1ae00-... (server.js lo
-- llamaba "Consumidor Final", pero es el admin).
--
-- Se crea IGUAL que crea usuarios la app (POST /api/register): una fila en la tabla
-- public.usuarios, con rol 4 (Consumidor final) y la contraseña cifrada con bcrypt
-- en la columna "contrasena". La app no usa el sistema de usuarios de Supabase (auth.users).
--
-- NADIE puede iniciar sesión con este usuario: su contraseña es el cifrado de una clave
-- al azar que no se guardó en ningún lado. El email termina en ".invalid", un dominio
-- reservado que no existe: no le llega ningún mail.
-- IMPORTANTE: no le cambien la contraseña ni lo borren desde Gestión de Usuarios.
--
-- Cómo usarlo, en dos partes (Supabase → SQL Editor):
--   PARTE A (solo lectura): pegá solo la Parte A → "Run" → pasame la tabla.
--   PARTE B (crea el usuario): recién cuando revisemos la Parte A.
-- =====================================================


-- -----------------------------------------------------
-- PARTE A — SOLO LECTURA (no cambia nada)
-- Responde: ¿usuarios depende de auth.users? ¿qué columnas son obligatorias?
-- ¿existe el rol 4? ¿quién es d9b1ae00? ¿ya hay algún "Consumidor Final"? ¿el id nuevo está libre?
-- -----------------------------------------------------
select 1                                               as orden,    -- sección 1: columnas
       'columna'::text                                 as seccion,  -- qué se mira
       column_name::text                               as nombre,   -- nombre de la columna
       data_type                                                    -- tipo (uuid, text, integer...)
         || case when is_nullable = 'YES'                           -- ¿puede quedar vacía?
                 then ' · puede quedar vacía'                       -- sí
                 else ' · obligatoria'                              -- no
            end                                                     -- fin del "case"
         || coalesce(' · por defecto: ' || column_default, '')      -- valor que toma si no se manda
                                                       as detalle   -- todo junto en un texto
  from information_schema.columns                      -- catálogo de columnas (solo lectura)
 where table_schema = 'public'                         -- tablas de la app
   and table_name = 'usuarios'                         -- solo usuarios

union all                                              -- junta con la sección siguiente

select 2,                                              -- sección 2: restricciones
       'restriccion',                                  -- (si dependiera de auth.users, acá diría "REFERENCES auth.users")
       con.conname::text,                              -- nombre de la restricción
       pg_get_constraintdef(con.oid)                   -- la regla escrita como la entiende Postgres
  from pg_constraint con                               -- catálogo de restricciones
 where con.conrelid = 'public.usuarios'::regclass      -- solo las de la tabla usuarios

union all                                              -- junta con la sección siguiente

select 3,                                              -- sección 3: triggers (código que la base corre sola al guardar)
       'trigger',                                      -- qué se mira
       tri.trigger_name::text,                         -- nombre del trigger
       tri.action_timing || ' ' || tri.event_manipulation || ' → ' || tri.action_statement  -- cuándo corre y qué ejecuta
  from information_schema.triggers tri                 -- catálogo de triggers
 where tri.event_object_schema = 'public'              -- tablas de la app
   and tri.event_object_table = 'usuarios'             -- solo usuarios

union all                                              -- junta con la sección siguiente

select 4,                                              -- sección 4: el rol 4 existe
       'rol 4',                                        -- qué se mira
       'roles.id = 4',                                 -- el rol "Consumidor final"
       'existe'                                        -- si esta fila aparece, existe
  from roles                                           -- tabla de roles
 where id = 4                                          -- el 4

union all                                              -- junta con la sección siguiente

select 5,                                              -- sección 5: quién es d9b1ae00 (el que usaba server.js)
       'usuario d9b1ae00',                             -- qué se mira
       coalesce(nombre, '') || ' ' || coalesce(apellido, ''),  -- su nombre
       'rol ' || id_rol                                -- su rol (1, 5 o 6 = administración)
  from usuarios                                        -- tabla de usuarios
 where id = 'd9b1ae00-fda5-4488-86b3-90d769b47a02'     -- ese id

union all                                              -- junta con la sección siguiente

select 6,                                              -- sección 6: usuarios que ya se parezcan a "Consumidor Final"
       'parecido a Consumidor Final',                  -- (para no crear uno repetido)
       coalesce(nombre, '') || ' ' || coalesce(apellido, ''),  -- su nombre
       'id ' || id || ' · rol ' || id_rol              -- su id y su rol
  from usuarios                                        -- tabla de usuarios
 where nombre ilike '%consumidor%'                     -- nombre parecido
    or email ilike 'consumidor%'                       -- o email parecido

union all                                              -- junta con la sección siguiente

select 7,                                              -- sección 7: el id elegido para el usuario nuevo
       'id nuevo',                                     -- qué se mira
       'b344f2e8-cd3c-42af-953c-7d97cada6c63',         -- el id que va a tener
       case when exists (select 1 from usuarios where id = 'b344f2e8-cd3c-42af-953c-7d97cada6c63')  -- ¿ya lo usa alguien?
            then 'YA EXISTE'                           -- sí (no hace falta crearlo)
            else 'libre'                               -- no (se puede crear)
       end                                             -- fin del "case"

order by 1, 3;                                         -- por sección y por nombre


-- -----------------------------------------------------
-- PARTE B — CREA EL USUARIO (correr solo después de revisar la Parte A)
-- Es una sola instrucción: o se crea entero o no se crea.
-- Si ya existe (por id o por email), no hace nada: se puede correr dos veces sin duplicarlo.
-- Al final muestra cómo quedó (tiene que salir UNA fila).
-- -----------------------------------------------------
insert into usuarios (id, nombre, apellido, email, contrasena, telefono, direccion, id_rol)  -- las mismas columnas que usa POST /api/register, más el id
select 'b344f2e8-cd3c-42af-953c-7d97cada6c63'::uuid,  -- id fijo: el mismo que va a usar server.js
       'Consumidor',                                   -- nombre
       'Final',                                        -- apellido
       'consumidor.final@fastgood.invalid',            -- email que no existe (.invalid): no le llega ningún mail
       '$2b$10$xvwbcXa3W09Rj/EsYnAfb.lt2rJRsxy5bWCv2YZjtgtxJNr3N5zfq',  -- cifrado bcrypt de una clave al azar que nadie conoce
       null,                                           -- sin teléfono
       null,                                           -- sin dirección
       4                                               -- rol 4 = Consumidor final (el que da el registro público)
 where not exists (                                    -- solo si todavía no existe...
         select 1                                      -- (no importa qué devuelve, solo si hay algo)
           from usuarios                               -- ...en usuarios...
          where id = 'b344f2e8-cd3c-42af-953c-7d97cada6c63'  -- ...con ese id...
             or email ilike 'consumidor.final@fastgood.invalid'  -- ...o con ese email
       );

select id, nombre, apellido, email, id_rol             -- muestra cómo quedó el usuario
  from usuarios                                        -- tabla de usuarios
 where id = 'b344f2e8-cd3c-42af-953c-7d97cada6c63';    -- el nuevo
