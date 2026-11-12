// ============================================================================
// rutas.catalogo.js — las direcciones del módulo CATÁLOGO (pantalla: la web del cliente, index.html).
// SOLO: la dirección ENTERA + la seguridad + qué función del controlador la atiende.
// Es pública (la ve el cliente sin iniciar sesión): no lleva requireAuth ni requireRol,
// pero sí limiteCatalogo (60 consultas por minuto por IP), para que nadie la llame sin parar.
// ============================================================================

const express = require('express');
const router = express.Router();
const { limiteCatalogo } = require('../../middlewares/limites');   // el límite de consultas por IP
const controlador = require('./controlador.catalogo');

router.get('/api/v1/combos', limiteCatalogo, controlador.listarCombos);   // los combos con su menú (lo usa la tienda)

module.exports = router;




