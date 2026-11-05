// ============================================================================
// rutas.catalogo.js — las direcciones del módulo CATÁLOGO (pantalla: la web del cliente (index.html)).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 8 rutas que va a tener (hoy en server.js):
//   GET /api/v1/catalogo
//   GET /api/v1/categorias
//   GET /api/v1/categorias/:id/planes
//   GET /api/v1/planes/:id/productos
//   GET /api/v1/productos
//   GET /api/v1/productos/:id
//   GET /api/v1/combos
//   GET /api/barrios
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
