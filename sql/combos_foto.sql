-- =====================================================
-- FOTO DEL COMBO (13/11/2026)
-- combos.imagen → la dirección de la foto de la tarjeta del combo (como planes.imagen y categorias.imagen)
-- Vacía (null) = la web usa la foto del plan, y si no, la del primer plato con foto (como hasta hoy).
-- Solo AGREGA una columna. No modifica ni borra nada. El RLS queda como está.
-- "if not exists" = si la columna ya está, no hace nada (se puede correr dos veces sin problema).
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. DESPUÉS reiniciar el servidor.
-- =====================================================

alter table public.combos                                  -- a la tabla de combos…
  add column if not exists imagen text null;               -- …la columna de la foto (null = sin foto propia)

-- Para mirar que quedó: tiene que aparecer la columna "imagen" (tipo text)
select column_name, data_type                              -- el nombre y el tipo de la columna
from information_schema.columns                            -- de la lista de columnas de la base
where table_schema = 'public'                              -- en el esquema público
  and table_name = 'combos'                                -- de la tabla combos
  and column_name = 'imagen';                              -- la columna nueva
