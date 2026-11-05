// ============================================================================
// rutas.pagos.js — las direcciones del módulo PAGOS (pantalla: el modal de pago (pagoPedido.js) y Envíos).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 3 rutas que va a tener (hoy en server.js):
//   PUT /api/pedidos/:id/pagado
//   PUT /api/pedidos/:id/transferencia-confirmada
//   PUT /api/pedidos/:id/pago
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
