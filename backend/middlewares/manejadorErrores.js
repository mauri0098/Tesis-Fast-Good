// ============================================================================
// manejadorErrores.js — el último app.use de server.js: atrapa los errores que ninguna ruta atrapó.
//   manejadorErrores → ENTRADA: err, req, res, next (los 4: así Express sabe que es de errores)
//                      SALIDA: 413 si el cuerpo es muy grande · 400 si el JSON está roto · 500 con un mensaje simple.
// Protege de que el navegador reciba el detalle del error (stack trace).
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

const { MENSAJE_ERROR_INTERNO } = require('../utils/errores');   // el texto simple del 500

/* ======================================================
   MANEJADOR DE ERRORES (al final de todo)
   Errores no atrapados en las rutas (y los del parser de JSON): nunca devuelve el stack trace.
   ====================================================== */
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El contenido enviado no es un JSON válido' });
  }
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: MENSAJE_ERROR_INTERNO });
}

module.exports = { manejadorErrores };
