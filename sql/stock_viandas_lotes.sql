-- =====================================================
-- STOCK DE VIANDAS — AGRUPAR LAS CARGAS DE COMBO
-- Ejecutar en Supabase → SQL Editor ANTES de volver a crear
-- registrar_tanda_multiple (bloque de combo de stock_viandas_funciones.sql),
-- porque la función nueva usa la secuencia y la columna de acá.
-- Solo agrega cosas: no borra ni cambia datos existentes.
-- Se puede ejecutar más de una vez sin romper nada.
-- =====================================================

begin;

-- 1) SECUENCIA para numerar cada carga de combo (1, 2, 3...).
--    Si una carga falla y se deshace, su número queda salteado: no importa,
--    solo sirve para agrupar.
create sequence if not exists movimientos_viandas_lote_seq;

-- 2) MOVIMIENTOS_VIANDAS: columna nueva "id_lote"
--    Todos los movimientos de una misma carga de combo llevan el mismo número.
--    Opcional: las cargas de un plato suelto, los descartes y los
--    movimientos viejos quedan vacíos.
alter table movimientos_viandas
  add column if not exists id_lote integer;

-- 3) ÍNDICE: búsquedas rápidas por combo
create index if not exists idx_mov_viandas_lote on movimientos_viandas(id_lote);

-- 4) PERMISOS de la secuencia: registrar_tanda_multiple corre con los permisos
--    de quien la llama (el servidor, con service_role), así que service_role
--    tiene que poder pedir números. Desde afuera (anon / authenticated), no.
revoke all   on sequence movimientos_viandas_lote_seq from public, anon, authenticated;
grant  usage on sequence movimientos_viandas_lote_seq to service_role;

commit;
