// ============================================================================
// rutas.usuarios.js — las direcciones del módulo USUARIOS (pantalla: gestionUsuarios.html).
// QUÉ VA: la dirección ENTERA, la seguridad (requireAuth, requireRol, límites) y qué función del controlador la atiende.
//         Una línea por ruta. Ej: router.get('/api/insumos', requireAuth, requireRol(6, 5, 1), controlador.listarInsumos);
// QUÉ NO VA: ni un if, ni supabase, ni req.body.
// Las fijas (ej: /pendientes) van ANTES que las de parámetro (ej: /:id).
// Las 4 rutas que va a tener (hoy en server.js):
//   GET /api/usuarios
//   POST /api/usuarios/crear
//   PUT /api/usuarios/:id
//   DELETE /api/usuarios/:id
// (Todavía vacío: se llena cuando se mude este módulo desde server.js.)
// ============================================================================
