// ============================================================================
// rutas.combos.js — las direcciones del módulo COMBOS (pantalla: combos.html).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 7 rutas que va a tener (hoy en server.js):
//   GET /api/combos
//   POST /api/combos
//   PUT /api/combos/:id
//   PUT /api/combos/:id/activo
//   GET /api/combos/:id/menu
//   POST /api/combos/:id/menu
//   PUT /api/combos/:id/menu/:idProducto/quitar
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
