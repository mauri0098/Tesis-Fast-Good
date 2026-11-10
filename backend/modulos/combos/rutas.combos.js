// ============================================================================
// rutas.combos.js — las direcciones del módulo COMBOS (la RECEPCIONISTA).
// QUÉ VA: SOLO la dirección + el patovica (requireAuth / requireRol) + qué función del controlador atiende.
// QUÉ NO VA: lógica, consultas a la base ni res.status (eso es del controlador).
// Rutas:
//   GET /api/combos            → listarCombos          · solo roles 6 (Admin. del sistema) y 5 (Dueño)
//   POST /api/combos           → crearCombo            · solo roles 6 y 5
//   PUT /api/combos/:id/activo → actualizarEstadoCombo · solo roles 6 y 5
//   PUT /api/combos/:id        → editarCombo           · solo roles 6 y 5
//   GET /api/combos/:id/menu   → verMenuCombo          · solo roles 6 y 5
//   POST /api/combos/:id/menu  → agregarProductoAlCombo · solo roles 6 y 5
//   PUT /api/combos/:id/menu/:idProducto/quitar → quitarProductoDelCombo · solo roles 6 y 5
// ============================================================================

const express = require('express');
const router = express.Router();
const { requireAuth, requireRol } = require('../../middlewares/auth');   // ← "require", con s en middlewares
const controlador = require('./controlador.combos');

// El pedido pasa en fila, de izquierda a derecha:
//   requireAuth   → ¿trae token válido? NO: 401 y no sigue (frena al que no inició sesión)
//   requireRol    → ¿es rol 6 o 5?      NO: 403 y no sigue (frena, por ejemplo, al cocinero)
//   listarCombos  → el controlador arma la respuesta

//Ruta listar combos
router.get('/api/combos', requireAuth, requireRol(6, 5), controlador.listarCombos);
//ruta para crear un combo
router.post('/api/combos', requireAuth, requireRol(6, 5), controlador.crearCombo);
//ruta para Activar o desactivar combos
router.put('/api/combos/:id/activo', requireAuth, requireRol(6, 5), controlador.actualizarEstadoCombo);
//ruta para editar un combo
router.put('/api/combos/:id', requireAuth, requireRol(6, 5), controlador.editarCombo);

//ruta para ver el menu de un combo (y los platos que se pueden agregar)
router.get('/api/combos/:id/menu', requireAuth, requireRol(6, 5), controlador.verMenuCombo);
//ruta para agregar un plato al menu de un combo
router.post('/api/combos/:id/menu', requireAuth, requireRol(6, 5), controlador.agregarProductoAlCombo);
//ruta para quitar un plato del menu de un combo
router.put('/api/combos/:id/menu/:idProducto/quitar', requireAuth, requireRol(6, 5), controlador.quitarProductoDelCombo);

module.exports = router;




