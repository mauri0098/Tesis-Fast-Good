/**
 * migrarPasswords.js
 * Ejecutar UNA SOLA VEZ: node migrarPasswords.js
 *
 * Recorre la tabla `usuarios` y convierte las contraseñas en texto plano
 * a hash bcrypt. Saltea las que ya empiecen con "$2" (ya hasheadas).
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function migrar() {
  console.log('Iniciando migración de contraseñas...\n');

  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('id, nombre');

  if (error) {
    console.error('Error al leer usuarios:', error.message);
    process.exit(1);
  }

  // Traer la columna contraseña por separado (bracket notation necesaria por la ñ)
  const { data: contrasenasData, error: errPass } = await supabase
    .from('usuarios')
    .select('id, contraseña');

  if (errPass) {
    console.error('Error al leer contraseñas:', errPass.message);
    process.exit(1);
  }

  const mapaContrasenas = {};
  (contrasenasData || []).forEach(u => { mapaContrasenas[u.id] = u['contraseña']; });

  let migrados  = 0;
  let salteados = 0;

  for (const usuario of usuarios || []) {
    const contrasenaActual = mapaContrasenas[usuario.id];

    // Saltear si ya está hasheada (bcrypt siempre empieza con $2b$ o $2a$)
    if (!contrasenaActual || String(contrasenaActual).startsWith('$2')) {
      console.log(`  ⏭  ${usuario.nombre} (id: ${usuario.id}) — ya hasheada, se saltea`);
      salteados++;
      continue;
    }

    const hash = await bcrypt.hash(contrasenaActual, 10);
    const actualizar = {};
    actualizar['contraseña'] = hash;

    const { error: errUpdate } = await supabase
      .from('usuarios')
      .update(actualizar)
      .eq('id', usuario.id);

    if (errUpdate) {
      console.error(`  ✗  Error al migrar ${usuario.nombre}:`, errUpdate.message);
    } else {
      console.log(`  ✓  ${usuario.nombre} (id: ${usuario.id}) — migrada`);
      migrados++;
    }
  }

  console.log(`\nMigración completa: ${migrados} migradas, ${salteados} salteadas.`);
}

migrar();
