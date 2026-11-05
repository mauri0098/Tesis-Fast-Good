// ============================================================================
// auth.js — revisa el token del login antes de dejar entrar a una ruta.
//   leerToken   → ENTRADA: req · SALIDA: { id, rol, iat, exp } si el token es válido, o null (no corta el pedido).
//   requireAuth → sin token válido responde 401; con token, guarda el usuario en req.usuario y deja seguir.
//   requireRol  → ENTRADA: los roles permitidos (ej: 6, 5) · SALIDA: el middleware que responde 403 a los demás.
// Protege de que alguien sin login, o con un rol que no corresponde, use el panel.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

const jwt = require('jsonwebtoken');                           // tokens de autenticación

/* ======================================================
   MIDDLEWARE DE AUTENTICACIÓN JWT
   Lee el token del header Authorization: Bearer <token>
   ====================================================== */
// Devuelve el payload del token ({ id, rol, iat, exp }) si viene uno válido, o null. No corta la request.
function leerToken(req) {
  const partes = (req.headers['authorization'] || '').split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') return null;
  try {
    return jwt.verify(partes[1], process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = leerToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.usuario = payload; // { id, rol, iat, exp }
  next();
}

// Va después de requireAuth: deja pasar solo a los roles de la lista (403 si no).
// Roles: 1 Administrador, 2 Cocinero, 3 Repartidor, 4 Consumidor final, 5 Dueño, 6 Administrador del sistema.
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(Number(req.usuario.rol))) {
      return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

module.exports = { leerToken, requireAuth, requireRol };
