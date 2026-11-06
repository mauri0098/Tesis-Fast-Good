// ============================================================================
// modelo.combos.js — las consultas a la base del módulo COMBOS.
// QUÉ VA: SOLO supabase.from / supabase.rpc / supabase.storage. Devuelve { data, error }.
// QUÉ NO VA: req, res, códigos (400, 500…) ni mensajes para el usuario.
// Funciones: se listan acá cuando se mude el módulo.
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================

const supabase = require('../../config/supabaseClient');   // ← está adentro de config/

// Le sacamos la palabra "export"
async function traerCombosPanel() { 
   const { data, error } = await supabase
   .from('combos')
   .select(` 
      id,
      nombre,
      id_plan,
      cantidad,
      precio,
      activo,
      destacado,
      planes ( nombre, activo ),
      combo_productos ( activo, productos ( activo ) ),
      pedido_combos ( count )
    `) // <- Arreglado acá: cierre del select con backtick
    .order('nombre', { ascending: true });

    if (error) throw error;// Si hay un error, lo lanzamos para que el controlador lo maneje y devuelva un 500 al cliente
    return data || []; // Es buena práctica agregar el || [] por si data viene nulo
}

module.exports = { traerCombosPanel };


