// ============================================================================
// rutas.planesCategorias.js — las direcciones del módulo PLANES Y CATEGORÍAS (pantalla: planesCategorias.html).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 11 rutas que va a tener (hoy en server.js):
//   GET /api/categorias
//   POST /api/categorias
//   PUT /api/categorias/:id
//   PUT /api/categorias/:id/activo
//   POST /api/categorias/:id/imagen
//   GET /api/planes/todos
//   POST /api/planes
//   PUT /api/planes/:id
//   PUT /api/planes/:id/categoria
//   PUT /api/planes/:id/activo
//   POST /api/planes/:id/imagen
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
