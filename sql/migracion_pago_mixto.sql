-- ============================================================
-- Migración: pago mixto en pedidos
-- Ejecutar en Supabase → SQL Editor ANTES de reiniciar el servidor
-- con el código nuevo (GET /api/pedidos ya pide las columnas nuevas).
-- Se puede ejecutar más de una vez sin romper nada.
-- ============================================================

-- 1. Columnas nuevas con el desglose del pago
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS monto_efectivo      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monto_transferencia NUMERIC(10,2);

-- 2. Permitir 'Mixto' en metodo_pago
--    Sirve tanto si la columna es un ENUM como si es texto con un CHECK.
DO $$
DECLARE
  tipo_columna text;
  nombre_tipo  text;
  r            record;
BEGIN
  SELECT data_type, udt_name INTO tipo_columna, nombre_tipo
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'metodo_pago';

  -- 2a. Si es ENUM: agregar el valor nuevo
  IF tipo_columna = 'USER-DEFINED' THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', nombre_tipo, 'Mixto');
  ELSE
    -- 2b. Si es texto: reemplazar los CHECK que restringen metodo_pago
    FOR r IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.pedidos'::regclass
         AND contype  = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%metodo_pago%'
    LOOP
      EXECUTE format('ALTER TABLE pedidos DROP CONSTRAINT %I', r.conname);
    END LOOP;

    ALTER TABLE pedidos
      ADD CONSTRAINT pedidos_metodo_pago_check
      CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Mixto'));
  END IF;
END $$;

-- 3. Los montos no pueden ser negativos
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_montos_pago_check;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_montos_pago_check
  CHECK (COALESCE(monto_efectivo, 0) >= 0 AND COALESCE(monto_transferencia, 0) >= 0);

-- 4. Completar los pedidos existentes según su método actual
--    (sin método cargado se toma como Efectivo, igual que en la grilla)
UPDATE pedidos
   SET monto_efectivo      = CASE WHEN metodo_pago = 'Transferencia' THEN 0 ELSE total END,
       monto_transferencia = CASE WHEN metodo_pago = 'Transferencia' THEN total ELSE 0 END
 WHERE monto_efectivo IS NULL
   AND monto_transferencia IS NULL;
