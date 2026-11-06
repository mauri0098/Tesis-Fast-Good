// ============================================================================
// controlador.combos.js — lo que hace cada ruta del módulo COMBOS.
// QUÉ VA: leer y validar req (params, query, body), tomar el usuario de req.usuario (nunca del body),
//         llamar al modelo y decidir qué responder (200, 201, 400, 404, 409, 500).
// QUÉ NO VA: supabase.from(...) ni supabase.rpc(...): eso es del modelo.
// Funciones: se listan acá cuando se mude el módulo.
// ============================================================================

const modelo = require('./modelo.combos');

async function listarCombos(req, res) {
  try {
    // 1. Esperamos a que el modelo traiga la materia prima (datos crudos) de la base de datos
    const combosCrudos = await modelo.traerCombosPanel();

    // 2. Procesamos y limpiamos los datos (cinta de montaje)
    const combosListos = combosCrudos.map(combo => { // SE RECORRE CON UN MAP PARA IR FORMATEANDO CADA COMBO
      
      // Cuenta los platos que pertenecen al combo Y que se siguen cocinando
      const platosEnMenu = (combo.combo_productos || []).filter(item => 
        item.activo && item.productos?.activo // pregunta si el plato pertenece al combo y si está activo
      ).length;
        
      // Lee cuántas veces se vendió (si nunca se vendió o vino nulo, pone 0)
      const vecesVendido = Number(combo.pedido_combos?.[0]?.count) || 0;

      // ========================================================================
      // MAGIA DE LA CLAVE FORÁNEA (Foreign Key):
      // Como un combo pertenece a un ÚNICO plan, Supabase hace el JOIN 
      // automático en la base de datos comparando los IDs. 
      // Por eso NO manda un array [], sino un único objeto {}. 
      // Como es uno solo, NO hace falta recorrerlo con un map o for.
      // ========================================================================
      let plan = null;
      let planActivo = false;
      
      // Solo preguntamos: "¿Supabase trajo la caja de este plan asignado?"
      if (combo.planes) {
        plan = combo.planes.nombre;                 // Sacamos el nombre directo
        planActivo = Boolean(combo.planes.activo);  // Forzamos a que sea un true/false puro
      }

      // Este return es solo para el map: le entrega el objeto formateado para guardarlo en combosListos
      return {
        id:             combo.id,
        nombre:         combo.nombre,
        id_plan:        combo.id_plan,
        plan:           plan,
        plan_activo:    planActivo,
        cantidad:       combo.cantidad,
        precio:         Number(combo.precio),
        activo:         combo.activo,
        destacado:      combo.destacado === true, // "Más elegido"
        platos_en_menu: platosEnMenu,
        veces_vendido:  vecesVendido
      };
    }); // Cierre del map
    
    // 3. Despachamos el producto terminado por la red hacia el frontend
    res.json(combosListos);

  } catch (error) {
    console.error('Error al listar combos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listarCombos };