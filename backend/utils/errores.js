// ============================================================================
// errores.js — el error interno: el detalle va a la consola del servidor y al navegador, un mensaje simple.
//   MENSAJE_ERROR_INTERNO → el texto que ve el usuario: "Error interno del servidor".
//   mensajeInterno → ENTRADA: el error · SALIDA: el texto simple (y anota el detalle en el log).
//   errorInterno   → ENTRADA: res y el error · SALIDA: responde 500 con el texto simple.
// Protege de que se filtren detalles de la base o del código (pistas para un atacante).
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

// Errores internos: el detalle va a la consola del servidor; al cliente, un mensaje genérico
// (no se filtran mensajes de la base ni stack traces).
const MENSAJE_ERROR_INTERNO = 'Error interno del servidor';
function mensajeInterno(err) {
  console.error('[ERROR INTERNO]', err);
  return MENSAJE_ERROR_INTERNO;
}
function errorInterno(res, err) {
  return res.status(500).json({ error: mensajeInterno(err) });
}

module.exports = { MENSAJE_ERROR_INTERNO, mensajeInterno, errorInterno };
