// ============================================================================
// rutas.heladera.js — las direcciones del módulo HELADERA (pantalla: heladera.html y los pedidos a cocina).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 10 rutas que va a tener (hoy en server.js):
//   GET /api/viandas-stock
//   PUT /api/viandas-stock/:id/minimo
//   POST /api/viandas-stock/descarte
//   POST /api/ordenes-produccion
//   POST /api/pedir-cocina/faltantes
//   GET /api/ordenes-produccion/pendientes
//   POST /api/ordenes-produccion/detalles/:id/hecho
//   GET /api/ordenes-produccion/hechos-hoy
//   GET /api/ordenes-produccion/:id
//   GET /api/movimientos-viandas
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
