// ============================================================================
// rutas.cocina.js — las direcciones del módulo COCINA (pantalla: cocinero.html).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 2 rutas que va a tener (hoy en server.js):
//   GET /api/cocina/tareas
//   PUT /api/pedidos/:id/listo-cocinero
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
