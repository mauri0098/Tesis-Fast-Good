-- ============================================================================
-- armado_pedidos.sql — La marca de "✓ Pedido armado" (pantalla Armado de pedidos, 26/10)
--
-- Lo corre Mauri en el SQL Editor de Supabase, una sola vez. Se puede correr de nuevo sin problema
-- ("if not exists": si ya está, no hace nada).
-- SOLO AGREGA: dos columnas nuevas en pedidos (vacías) y un índice. No borra ni cambia nada de lo que hay.
--
-- Qué es "armado": el armador puso todas las viandas del pedido en su bandeja. Es una MARCA aparte:
-- los 5 estados (1 Registrado · 2 En preparación · 3 Listo · 4 Entregado · 5 Cancelado) no cambian.
--   armado_en  vacío → el pedido todavía no se armó
--   armado_en  con fecha y hora → se armó en ese momento, y armado_por dice quién (sale del token, en el servidor)
-- La escribe POST /api/pedidos/:id/armado (server.js) y la lee GET /api/armado.
-- ============================================================================

alter table pedidos                                              -- en la tabla de pedidos...
  add column if not exists armado_en timestamptz;                -- ...cuándo se armó la bandeja (vacío = sin armar)

alter table pedidos                                              -- en la tabla de pedidos...
  add column if not exists armado_por uuid                       -- ...quién la armó (el id del usuario)...
    references usuarios(id)                                      -- ...que tiene que ser un usuario que existe...
    on delete set null;                                          -- ...y si algún día se borra ese usuario, el pedido sigue armado, sin nombre

comment on column pedidos.armado_en is                           -- la explicación que se ve en Supabase
  'Armado de pedidos: cuándo se armó la bandeja. Vacío = sin armar. No cambia el estado del pedido.';
comment on column pedidos.armado_por is                          -- la explicación que se ve en Supabase
  'Armado de pedidos: el usuario que armó la bandeja (sale del token en POST /api/pedidos/:id/armado).';

create index if not exists idx_pedidos_fecha_entrega             -- un índice (no cambia lo guardado): hace rápida...
  on pedidos (fecha_entrega);                                    -- ...la búsqueda por día de entrega (Armado y Envíos)

notify pgrst, 'reload schema';                                   -- recargar la lista de columnas de la API (si no, no ve las nuevas)
