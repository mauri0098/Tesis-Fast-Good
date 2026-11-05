// ============================================================================
// rutas.pedidos.js — las direcciones del módulo PEDIDOS (pantalla: ConsultarPedidos.html y la web).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 7 rutas que va a tener (hoy en server.js):
//   POST /api/pedidos
//   POST /api/pedidos-combos
//   GET /api/pedidos
//   GET /api/pedidos/:id/verificar-stock
//   PUT /api/pedidos/:pedidoId/estado
//   POST /api/pedidos/:id/anular
//   GET /api/estados
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
