-- ============================================================
-- Fast Good — Activar Row Level Security (RLS) en todas las tablas
-- ============================================================
-- Qué hace: activa RLS en cada tabla del sistema SIN crear políticas.
-- Sin políticas, los roles "anon" y "authenticated" de Supabase no pueden
-- leer ni escribir nada. El backend sigue funcionando porque usa la clave
-- service_role, que saltea RLS.
--
-- ANTES de ejecutarlo:
--   1. Poner SUPABASE_SERVICE_ROLE_KEY en el .env del servidor y reiniciarlo
--      (si el servidor sigue con la clave anon, deja de funcionar).
--   2. Ejecutarlo SOLO en la base nueva (la del .env de la rama Rodriguez),
--      nunca en la base vieja que usa submain.
-- Se ejecuta desde Supabase → SQL Editor.
-- ============================================================

ALTER TABLE public.barrios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_stock  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_detalles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_insumo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICACIÓN (después de ejecutar lo de arriba)
-- ============================================================

-- 1. Tablas del esquema public que todavía NO tienen RLS.
--    Tiene que devolver 0 filas. Si aparece alguna tabla que no está en la
--    lista de arriba, agregarle su ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 2. Políticas que ya existan en public. RLS activado NO alcanza si hay una
--    política que le da acceso a anon (por ejemplo, una "allow all" creada
--    antes). Si esta consulta devuelve políticas para anon o public,
--    revisarlas y borrarlas con: DROP POLICY "<nombre>" ON public.<tabla>;
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public';

-- 3. Storage: el bucket "imagenes-productos" se sube desde el servidor con
--    service_role. Revisar en Supabase → Storage → Policies que no haya
--    políticas que permitan a anon subir, pisar o borrar archivos
--    (la lectura pública de las imágenes del catálogo sí se necesita).
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';
