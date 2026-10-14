-- =====================================================
-- ACTIVAR EL COMBO DE PRUEBA
-- Activa el combo 1 ("PRUEBA Mantenimiento x10") para poder probar la web
-- nueva de combos (frontend/index-combos.html).
--
-- Qué cambia: SOLO la columna "activo" de esa fila (de f a t). No agrega ni borra nada.
-- A quién afecta: a nadie de la web actual. Ningún código lee la tabla combos
-- todavía; el único que lo va a mostrar es la ruta nueva GET /api/v1/combos.
--
-- Cómo usarlo: Supabase → SQL Editor → pegá este archivo → "Run".
-- Tiene que mostrar UNA fila con activo = true. Si muestra 0 filas, no cambió
-- nada (no hay un combo con ese id y ese nombre): avisame.
-- =====================================================

update combos                                      -- tabla de combos
   set activo = true                               -- lo activa
 where id = 1                                      -- solo el combo 1...
   and nombre = 'PRUEBA Mantenimiento x10'         -- ...y solo si es el de prueba (doble control para no tocar otro)
returning id, nombre, cantidad, precio, activo;    -- muestra cómo quedó la fila

-- AL TERMINAR LAS PRUEBAS: para desactivarlo, sacale el "-- " del principio a la línea
-- de abajo, seleccioná SOLO esa línea y tocá "Run" (corre solo lo seleccionado).
-- update combos set activo = false where id = 1 and nombre = 'PRUEBA Mantenimiento x10' returning id, nombre, activo;
