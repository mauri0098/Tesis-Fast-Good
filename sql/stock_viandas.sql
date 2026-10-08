-- =====================================================
-- STOCK DE VIANDAS EN HELADERA
-- Agrega lo necesario para guardar viandas ya cocinadas.
-- Solo agrega cosas: no borra ni cambia datos existentes.
-- =====================================================

-- "begin" abre un bloque: todo lo de abajo se aplica junto.
-- Si algo falla, no se aplica nada y la base queda como estaba.
begin;

-- 1) PRODUCTOS: columna nueva "stock_heladera"
-- Guarda cuántas viandas terminadas hay de cada plato.
-- "integer" = número entero. "default 0" = todos arrancan en 0.
-- "check (>= 0)" = la base no deja que quede en negativo.
alter table productos
  add column if not exists stock_heladera integer not null default 0
  check (stock_heladera >= 0);

-- 3) TABLA NUEVA: movimientos_viandas
-- Cada fila es una entrada o salida de viandas de la heladera.
create table if not exists movimientos_viandas (
  -- Número único de cada movimiento. Se pone solo (1, 2, 3...).
  id          serial primary key,

  -- De qué plato es. Obligatorio. Tiene que existir en productos.
  id_producto integer not null references productos(id),

  -- Quién lo cargó. Obligatorio. Tiene que existir en usuarios.
  id_usuario  uuid    not null references usuarios(id),

  -- Por qué pedido fue. Opcional: queda vacío en las tandas,
  -- descartes y ajustes, que no vienen de ningún pedido.
  id_pedido   integer references pedidos(id),

  -- Qué tipo de movimiento es. Solo acepta estas cinco palabras.
  tipo        varchar(20) not null
              check (tipo in ('produccion', 'venta', 'devolucion', 'descarte', 'ajuste')),

  -- Cuántas viandas. Positivo = entran, negativo = salen.
  -- No puede ser 0, porque no sería un movimiento.
  cantidad    integer not null check (cantidad <> 0),

  -- Texto libre para aclarar algo. Opcional.
  motivo      text,

  -- Fecha y hora. Se pone sola con el momento actual.
  fecha       timestamptz not null default now()
);

-- 4) MOVIMIENTOS_STOCK: columna nueva "id_movimiento_vianda"
-- Dice qué tanda provocó esa salida de insumos.
-- Opcional: las compras y los movimientos viejos quedan vacíos.
alter table movimientos_stock
  add column if not exists id_movimiento_vianda integer references movimientos_viandas(id);

-- 5) ÍNDICES
-- No cambian nada de lo que se guarda. Hacen que las búsquedas
-- por plato, por pedido y por tanda sean rápidas.
create index if not exists idx_mov_viandas_producto on movimientos_viandas(id_producto);
create index if not exists idx_mov_viandas_pedido   on movimientos_viandas(id_pedido);
create index if not exists idx_mov_stock_mov_vianda on movimientos_stock(id_movimiento_vianda);

-- 6) SEGURIDAD
-- Bloquea el acceso directo desde afuera a la tabla nueva.
-- Solo el servidor (server.js) puede leerla y escribirla.
alter table movimientos_viandas enable row level security;

-- "commit" cierra el bloque y confirma todos los cambios.
commit;