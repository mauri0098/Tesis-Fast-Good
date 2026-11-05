/**
 * guard.js — Control de acceso por rol a las pantallas internas.
 * Se incluye al principio del <body> de cada pantalla interna, DESPUÉS de roles.js
 * (que tiene la tabla de qué rol ve qué pantalla).
 * Corre síncronamente: si el usuario no tiene permiso, redirige antes de que
 * el resto del HTML se renderice.
 *
 * Esto solo ordena las pantallas: quien conoce la API puede llamarla igual.
 * La protección real de los datos está en el servidor.
 */
(function () {
  var usuarioId  = localStorage.getItem('usuario_id');
  var usuarioRol = parseInt(localStorage.getItem('usuario_rol') || '0', 10);
  var pagActual  = window.location.pathname.split('/').pop() || '';
  var base       = FG_ROLES.base();

  // 1. Sin sesión → login
  if (!usuarioId) {
    window.location.replace(base + 'login.html');
    return;
  }

  // 2. Pantalla que no le corresponde a su rol → su pantalla principal
  if (!FG_ROLES.puedeVer(usuarioRol, pagActual)) {
    window.location.replace(base + FG_ROLES.pantallaPrincipal(usuarioRol));
  }
})();
