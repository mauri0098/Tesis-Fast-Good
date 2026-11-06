const express = require('express');
const router = express.Router();
const { requireAuth, requireRol } = require('../../middlewares/auth');   // ← "require", con s en middlewares
const controlador = require('./controlador.combos');

router.get('/api/combos', requireAuth, requireRol(6, 5), controlador.listarCombos);
// ← la dirección ENTERA: si ponés '/' es la página de inicio

module.exports = router;






