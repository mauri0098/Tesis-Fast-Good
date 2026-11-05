// ============================================================================
// cors.js — qué sitios pueden llamar a la API desde el navegador.
//   origenesPermitidos → la lista: localhost:3000 (desarrollo) + los de CORS_ORIGIN del .env (el dominio publicado).
//   opcionesCors       → lo que se le pasa a cors() en server.js: deja pasar a los de la lista y frena al resto.
//                        ENTRADA: el origen de cada pedido · SALIDA: lo deja pasar o error "Bloqueado por política CORS".
// Protege de que otro sitio web use tu API desde el navegador de alguien que tiene la sesión abierta.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

// Orígenes permitidos: localhost (desarrollo) + los de CORS_ORIGIN (el dominio publicado; varios, separados por coma)
const origenesPermitidos = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.CORS_ORIGIN || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
];

const opcionesCors = {
  origin: function (origin, callback) {
    // Las peticiones sin origen (Postman, curl, mismo servidor) se permiten
    if (!origin) {
      callback(null, true);
      return;
    }

    if (origenesPermitidos.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por política CORS'));
    }
  }
};

module.exports = { opcionesCors };
