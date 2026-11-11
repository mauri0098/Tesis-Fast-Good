// ============================================================================
// modelo.catalogo.js — las consultas a la base del módulo CATÁLOGO.
// SOLO: supabase.from. Devuelve { data, error } tal cual. No conoce req ni res.
// Funciones:
//   traerCombosBD → los combos activos con su plan (y la categoría del plan) y su menú
// ============================================================================

const supabase = require('../../config/supabaseClient');   // la conexión a la base (está adentro de config/)

// traerCombosBD → los combos activos, por nombre, con su plan (y la categoría del plan) y su menú
// ENTRADA: nada · SALIDA: { data: [ { id: 9, nombre: "Keto x3", cantidad: 3, precio: "3000", destacado: false,
//          planes: { id: 9, activo: true, categorias: {…} }, combo_productos: [ { activo: true, productos: {…} } ] } ], error }
async function traerCombosBD() {
  return await supabase
    .from('combos')
    .select(`
      id,
      nombre,
      cantidad,
      precio,
      destacado,
      planes (
        id,
        nombre,
        activo,
        imagen,
        descripcion,
        categorias ( id, nombre, imagen, descripcion )
      ),
      combo_productos (
        activo,
        productos ( id, nombre, codigo_plato, descripcion, imagen, activo, stock_heladera )
      )
    `)
    .eq('activo', true)
    .order('nombre', { ascending: true });
}

module.exports = { traerCombosBD };
