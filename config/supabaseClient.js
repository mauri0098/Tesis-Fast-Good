const { createClient } = require('@supabase/supabase-js');

// El servidor usa la clave service_role (saltea RLS). Es secreta: solo en el .env del servidor,
// nunca en el frontend ni en el repositorio. Con RLS activado y sin políticas para anon,
// la clave anon no puede leer ni escribir nada.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
