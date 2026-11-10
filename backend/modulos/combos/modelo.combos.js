// ============================================================================
// modelo.combos.js — las consultas a la base del módulo COMBOS (el COCINERO).
// QUÉ VA: SOLO supabase.from / supabase.rpc / supabase.storage. Devuelve { data, error }.
// QUÉ NO VA: req, res, códigos (400, 500…) ni mensajes para el usuario.
// Funciones:
//   traerCombosPanel       → trae todos los combos (activos e inactivos) con su plan, su menú y cuántas veces se vendió.
//   actualizarEstadoComboBD → pone un combo en activo = true o false y lo devuelve.
//   quitarProductoDelComboBD → pone en activo = false el renglón de ese plato en el menú del combo.
//   traerComboBD            → un combo por su id (o null).
//   traerPlanBD             → un plan por su id, con activo (o null).
//   crearComboBD            → guarda un combo nuevo, activo.
//   contarVentasComboBD     → cuántas veces se vendió un combo.
//   editarComboBD           → cambia nombre, plan, cantidad y precio.
//   traerMenuDelComboBD     → los platos activos del menú de un combo.
//   traerPlatosActivosBD    → todos los platos activos (para agregar al menú).
//   traerPlatoBD            → un plato por su id, con activo (o null).
//   agregarProductoAlComboBD → agrega (o reactiva) un plato en el menú.
// ============================================================================

const supabase = require('../../config/supabaseClient');   // ← está adentro de config/

// ----------------------------------------------------------------------------
// traerCombosPanel → trae todos los combos para la tabla del panel, ordenados por nombre.
// ENTRADA: nada
// SALIDA:  { data, error } tal cual lo devuelve Supabase.
//   Ej bien: { data: [{ id: 1, nombre: 'Keto x10', planes: { nombre: 'Keto', activo: true },
//                       combo_productos: [{ activo: true, productos: { activo: true } }],
//                       pedido_combos: [{ count: 3 }], ... }], error: null }
//   Ej mal:  { data: null, error: { message: '...', code: '...' } }
// Lo llama: listarCombos (controlador.combos.js).
// ----------------------------------------------------------------------------
async function traerCombosPanel() {
  // ⏸ FRENO DE MANO (el 2º): el cocinero espera a la despensa (Supabase, otra compu en internet).
  //    Supabase NUNCA hace throw: siempre devuelve la bandeja { data, error }.
  //    La pasamos tal cual al controlador: el que decide qué responder (200 o 500) es él.
  return await supabase
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
    `)
    .order('nombre', { ascending: true });
}

//Cambiar estado de combo (activo o inactivo) para que no se pueda vender
// ENTRADA: idCombo (número ya controlado) y activo (true o false)
// SALIDA:  { data, error }. data = el combo actualizado, o null si ese id no existe.
//   Ej: (7, false) → { data: { id: 7, nombre: '10 viandas sin gluten', ..., activo: false }, error: null }
// Lo llama: actualizarEstadoCombo (controlador.combos.js).
async function actualizarEstadoComboBD(idCombo, activo) { // <-- ¡Acá agregamos "activo"!
  return await supabase
    .from('combos')
    .update({ activo: activo })
    .eq('id', idCombo)
    .select('id, nombre, id_plan, cantidad, precio, activo')
    .maybeSingle();
}


//funcion quitar plato del menu de un combo
// Solo toca el renglón ACTIVO de ese combo y ese plato (hay uno solo, por la regla de la tabla).
// ENTRADA: idCombo e idProducto (números ya controlados)
// SALIDA:  { data, error }. data = { id } del renglón que se quitó, o null si ese plato no estaba en el menú.
//   Ej: (7, 12) → { data: { id: 40 }, error: null }
// Lo llama: quitarProductoDelCombo (controlador.combos.js).
async function quitarProductoDelComboBD(idCombo, idProducto) {
  return await supabase
    .from('combo_productos')
    .update({ activo: false })
    .eq('id_combo', idCombo)
    .eq('id_producto', idProducto)
    .eq('activo', true)
    .select('id')
    .maybeSingle();
}


// ----------------------------------------------------------------------------
// traerComboBD → un combo por su id (lo usan editar, ver menú y agregar al menú).
// ENTRADA: idCombo · SALIDA: { data, error }. data = { id, nombre, cantidad, destacado } o null si no existe.
//   Ej: (7) → { data: { id: 7, nombre: '10 viandas sin gluten', cantidad: 10, destacado: false }, error: null }
// ----------------------------------------------------------------------------
async function traerComboBD(idCombo) {
  return await supabase
    .from('combos')
    .select('id, nombre, cantidad, destacado')
    .eq('id', idCombo)
    .maybeSingle();
}

// traerPlanBD → un plan por su id, para ver si existe y está activo (crear y editar combo).
// ENTRADA: idPlan · SALIDA: { data, error }. data = { id, activo } o null si no existe.
async function traerPlanBD(idPlan) {
  return await supabase
    .from('planes')
    .select('id, activo')
    .eq('id', idPlan)
    .maybeSingle();
}

// crearComboBD → guarda un combo nuevo, ya activo.
// ENTRADA: datos { nombre, id_plan, cantidad, precio } (ya controlados)
// SALIDA:  { data, error }. data = el combo creado.
async function crearComboBD(datos) {
  return await supabase
    .from('combos')
    .insert({
      nombre:   datos.nombre,
      id_plan:  datos.id_plan,
      cantidad: datos.cantidad,
      precio:   datos.precio,
      activo:   true
    })
    .select('id, nombre, id_plan, cantidad, precio, activo')
    .single();
}

// contarVentasComboBD → cuántas veces se vendió un combo (renglones de pedido_combos).
// { count: 'exact', head: true } = "contame las filas, pero no me las traigas" (más rápido).
// ENTRADA: idCombo · SALIDA: { count, error }. Ej: (9) → { count: 60, error: null }
async function contarVentasComboBD(idCombo) {
  return await supabase
    .from('pedido_combos')
    .select('id', { count: 'exact', head: true })
    .eq('id_combo', idCombo);
}

// editarComboBD → cambia nombre, plan, cantidad y precio de un combo.
// ENTRADA: idCombo y datos { nombre, id_plan, cantidad, precio } (ya controlados)
// SALIDA:  { data, error }. data = el combo actualizado, o null si ese id no existe.
async function editarComboBD(idCombo, datos) {
  return await supabase
    .from('combos')
    .update({
      nombre:   datos.nombre,
      id_plan:  datos.id_plan,
      cantidad: datos.cantidad,
      precio:   datos.precio
    })
    .eq('id', idCombo)
    .select('id, nombre, id_plan, cantidad, precio, activo')
    .maybeSingle();
}

// traerMenuDelComboBD → los renglones ACTIVOS del menú de un combo, con su plato y el plan del plato.
//   productos!inner      → trae SOLO los renglones que tienen plato (así el controlador no tiene que preguntar)
//   ...planes ( plan:nombre ) → el plan viene "aplanado" como texto: plan: 'SIN TACC' (en vez de planes: { nombre })
// ENTRADA: idCombo
// SALIDA:  { data, error }. Ej: data = [{ id_producto: 6, productos: { id: 6, nombre: 'Tarta', codigo_plato: 'S1',
//                                         activo: true, plan: 'SIN TACC' } }]
async function traerMenuDelComboBD(idCombo) {
  return await supabase
    .from('combo_productos')
    .select('id_producto, productos!inner ( id, nombre, codigo_plato, activo, ...planes ( plan:nombre ) )')
    .eq('id_combo', idCombo)
    .eq('activo', true);
}

// traerPlatosActivosBD → todos los platos activos, de cualquier plan, ordenados por nombre (para elegir cuál agregar).
// ...planes ( plan:nombre ) → el plan viene como texto (igual que en traerMenuDelComboBD).
// ENTRADA: nada · SALIDA: { data, error }. Ej: data = [{ id: 9, nombre: 'Arroz', codigo_plato: 'M2', plan: 'MANTENIMIENTO' }]
async function traerPlatosActivosBD() {
  return await supabase
    .from('productos')
    .select('id, nombre, codigo_plato, ...planes ( plan:nombre )')
    .eq('activo', true)
    .order('nombre', { ascending: true });
}

// traerPlatoBD → un plato por su id, para ver si existe y está activo (agregar al menú).
// ENTRADA: idProducto · SALIDA: { data, error }. data = { id, nombre, activo } o null si no existe.
async function traerPlatoBD(idProducto) {
  return await supabase
    .from('productos')
    .select('id, nombre, activo')
    .eq('id', idProducto)
    .maybeSingle();
}

// agregarProductoAlComboBD → agrega un plato al menú, o lo vuelve a activar si ya había estado.
// upsert = "insert o update" en UNA instrucción: la tabla no deja repetir (id_combo, id_producto),
// así que si el renglón no existe lo crea, y si existía (sacado) lo pone en activo = true.
// ENTRADA: idCombo e idProducto · SALIDA: { data, error } (solo importa error).
async function agregarProductoAlComboBD(idCombo, idProducto) {
  return await supabase
    .from('combo_productos')
    .upsert(
      { id_combo: idCombo, id_producto: idProducto, activo: true },
      { onConflict: 'id_combo,id_producto' }
    );
}

module.exports = {
  traerCombosPanel, actualizarEstadoComboBD, quitarProductoDelComboBD,
  traerComboBD, traerPlanBD, crearComboBD, contarVentasComboBD, editarComboBD,
  traerMenuDelComboBD, traerPlatosActivosBD, traerPlatoBD, agregarProductoAlComboBD
};
  
  
