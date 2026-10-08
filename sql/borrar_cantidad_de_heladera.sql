-- =====================================================
-- BORRAR pedido_detalles.cantidad_de_heladera
-- Se creó en sql/stock_viandas.sql para una etapa que no se hizo: ningún archivo
-- la usa (revisado en mejoras-fastgood y en Rodriguez).
-- Su regla "check (>= 0)" se borra junto con la columna.
-- Si algo en la base dependiera de ella (por ejemplo una vista), Postgres rechaza
-- el borrado y no se pierde nada.
-- =====================================================

begin;

alter table pedido_detalles
  drop column if exists cantidad_de_heladera;

commit;
