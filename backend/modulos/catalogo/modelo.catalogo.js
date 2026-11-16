// ============================================================================
// modelo.catalogo.js — las consultas a la base del módulo CATÁLOGO.
// SOLO: supabase.from. Devuelve { data, error } tal cual. No conoce req ni res.
// Funciones:
//   traerPlanesBD → (16/11) los planes activos, con lo que muestra su tarjeta
//   traerCombosBD → los combos activos con su plan y su menú
// ============================================================================

const supabase = require('../../config/supabaseClient');   // la conexión a la base (está adentro de config/)

// traerPlanesBD → los planes ACTIVOS, por id (el orden de las tarjetas), con sus combos y el menú de cada combo
// (el menú hace falta para saber si el combo se puede vender: tiene que tener al menos un plato para elegir)
// ENTRADA: nada · SALIDA: { data: [ { id: 2, nombre: "MANTENIMIENTO", imagen: "https://…", descripcion: null,
//          combos: [ { cantidad: 10, activo: true, combo_productos: [ { activo: true, productos: { activo: true, imagen: "https://…" } } ] } ] } ], error }
// (la imagen del plato: si el plan no tiene foto, su tarjeta usa la del primer plato con foto)
async function traerPlanesBD() {
  return await supabase
    .from('planes')
    .select(`
      id,
      nombre,
      imagen,
      descripcion,
      combos (
        cantidad,
        activo,
        combo_productos (
          activo,
          productos ( activo, imagen )
        )
      )
    `)
    .eq('activo', true)
    .order('id', { ascending: true });
}

// traerCombosBD → los combos activos, por nombre, con su plan y su menú
// ENTRADA: nada · SALIDA: { data: [ { id: 9, nombre: "Keto x3", cantidad: 3, precio: "3000", destacado: false,
//          planes: { id: 9, activo: true, … }, combo_productos: [ { activo: true, productos: {…} } ] } ], error }
async function traerCombosBD() {
  return await supabase
    .from('combos')
    .select(`
      id,
      nombre,
      cantidad,
      precio,
      destacado,
      imagen,
      planes (
        id,
        nombre,
        activo,
        imagen,
        descripcion
      ),
      combo_productos (
        activo,
        productos ( id, nombre, codigo_plato, descripcion, imagen, activo, stock_heladera )
      )
    `)
    .eq('activo', true)
    .order('nombre', { ascending: true });
}

module.exports = { traerPlanesBD, traerCombosBD };
