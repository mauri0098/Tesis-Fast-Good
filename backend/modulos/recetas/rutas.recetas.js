// ============================================================================
// rutas.recetas.js — las direcciones del módulo RECETAS (pantalla: generarReceta.html).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 9 rutas que va a tener (hoy en server.js):
//   GET /api/recetas
//   POST /api/recetas
//   DELETE /api/recetas/:idProducto
//   POST /api/productos/:id/imagen
//   GET /api/planes
//   GET /api/planes/:id/siguiente-codigo
//   PUT /api/planes/:id/abreviatura
//   POST /api/productos/con-receta
//   PUT /api/productos/:id/plan
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
