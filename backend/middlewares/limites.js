// ============================================================================
// limites.js — cuántas veces por IP se puede llamar a cada ruta (responde 429 si se pasa).
//   limitador → arma un límite. ENTRADA: { minutos, maximo, mensaje, soloFallidos } · SALIDA: el middleware.
//   limiteLogin, limiteRegistro, limiteRecuperarPassword, limiteAnular, limitePedidos, limiteCatalogo → los 6 límites.
// Protege de la fuerza bruta (probar miles de claves o PIN) y de la carga masiva de pedidos falsos.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

/* ======================================================
   LÍMITE DE INTENTOS POR IP (express-rate-limit)
   Frena la fuerza bruta (contraseñas, PIN) y la carga masiva de pedidos falsos.
   Cada endpoint tiene su propio contador. Superado el límite responde 429 con { error }.
   Si el servidor queda detrás de un proxy (Nginx, Render, etc.) hay que configurar
   app.set('trust proxy', 1): si no, todos los clientes comparten la IP del proxy.
   ====================================================== */
const { rateLimit } = require('express-rate-limit');

function limitador({ minutos, maximo, mensaje, soloFallidos = false }) {
  return rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: maximo,
    standardHeaders: 'draft-8', // informa el límite en el header RateLimit
    legacyHeaders: false,
    // soloFallidos: cuentan solo las respuestas de error (el objetivo es quien prueba claves, no el uso normal)
    skipSuccessfulRequests: soloFallidos,
    message: { error: mensaje }
  });
}

const limiteLogin = limitador({
  minutos: 15, maximo: 10, soloFallidos: true,
  mensaje: 'Demasiados intentos de inicio de sesión fallidos. Esperá unos minutos y volvé a intentar.'
});
const limiteRegistro = limitador({
  minutos: 15, maximo: 10,
  mensaje: 'Demasiados intentos de registro seguidos. Esperá unos minutos y volvé a intentar.'
});
const limiteRecuperarPassword = limitador({
  minutos: 15, maximo: 10,
  mensaje: 'Demasiadas solicitudes de recuperación de contraseña. Esperá unos minutos y volvé a intentar.'
});
const limiteAnular = limitador({
  minutos: 15, maximo: 10, soloFallidos: true,
  mensaje: 'Demasiados intentos de anulación fallidos. Esperá unos minutos y volvé a intentar.'
});
const limitePedidos = limitador({
  minutos: 10, maximo: 5,
  mensaje: 'Hiciste demasiados pedidos seguidos, esperá unos minutos.'
});
// Catálogo de combos (público): 60 consultas por minuto por IP. Sobra para una persona que navega
// la página; frena a quien la llama sin parar para saturar el servidor o copiar el catálogo.
const limiteCatalogo = limitador({
  minutos: 1, maximo: 60,
  mensaje: 'Demasiadas consultas seguidas. Esperá un momento y volvé a intentar.'
});

module.exports = { limiteLogin, limiteRegistro, limiteRecuperarPassword, limiteAnular, limitePedidos, limiteCatalogo };
