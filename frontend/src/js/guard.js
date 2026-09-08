/**
 * guard.js — Control de acceso por rol para páginas interiores.
 * Se incluye como PRIMER script en <body> de cada pages/*.html.
 * Corre síncronamente: si el usuario no tiene permiso, redirige antes de que
 * el resto del HTML se renderice.
 *
 * Roles: 1 = Admin (acceso total) | 2 = Cocinero (solo sus 4 páginas)
 */
(function () {
  var ROL_ADMIN    = 1;
  var ROL_COCINERO = 2;

  // Páginas accesibles por el cocinero (nombre de archivo, case-sensitive)
  var PAGINAS_COCINERO = [
    'cocinero.html',
    'stock.html',
    'generarReceta.html',
    'MovimientosStock.html'
  ];

  var usuarioId  = localStorage.getItem('usuario_id');
  var usuarioRol = parseInt(localStorage.getItem('usuario_rol') || '0');
  var pagActual  = window.location.pathname.split('/').pop() || '';

  // ── 1. Sin sesión → login ──────────────────────────────────────────────
  if (!usuarioId) {
    window.location.replace('../login.html');
    return;
  }

  // ── 2. Cocinero en página prohibida → rebotar a su pantalla principal ──
  if (usuarioRol === ROL_COCINERO && PAGINAS_COCINERO.indexOf(pagActual) === -1) {
    window.location.replace('cocinero.html');
    return;
  }

  // ── 3. Función de logout disponible para el nav del cocinero ───────────
  window.cerrarSesionCocinero = function () {
    ['usuario_id', 'usuario_nombre', 'usuario_rol',
     'usuario_email', 'usuario_apellido', 'usuario_telefono', 'usuario_direccion'
    ].forEach(function (k) { localStorage.removeItem(k); });
    window.location.replace('../login.html');
  };

  // ── 4. Inyección dinámica del menú de navegación ───────────────────────
  //    Solo para cocineros; el admin mantiene su "Volver al Panel" sin cambios.
  if (usuarioRol !== ROL_COCINERO) return;

  document.addEventListener('DOMContentLoaded', function () {
    var navEl = document.querySelector('header nav');
    if (!navEl) return;

    var nombre = localStorage.getItem('usuario_nombre') || 'Cocinero';

    // Flex es necesario para que margin-left:auto funcione en el separador
    navEl.style.display     = 'flex';
    navEl.style.alignItems  = 'center';

    navEl.innerHTML =
      '<a href="cocinero.html"'      + (pagActual === 'cocinero.html'        ? ' class="nav-activo"' : '') + '>🥗 Cocina</a>' +
      '<a href="stock.html"'         + (pagActual === 'stock.html'           ? ' class="nav-activo"' : '') + '>📦 Stock</a>' +
      '<a href="generarReceta.html"' + (pagActual === 'generarReceta.html'   ? ' class="nav-activo"' : '') + '>📝 Recetas</a>' +
      '<a href="MovimientosStock.html"' + (pagActual === 'MovimientosStock.html' ? ' class="nav-activo"' : '') + '>📋 Mov. Stock</a>' +
      '<span style="' +
        'margin-left: auto;' +
        'padding: 0 1.25rem;' +
        'font-size: 0.82rem;' +
        'color: rgba(255,255,255,0.75);' +
        'border-left: 1px solid rgba(255,255,255,0.25);' +
        'border-right: 1px solid rgba(255,255,255,0.25);' +
        'white-space: nowrap;' +
      '">👤 ' + nombre + '</span>' +
      '<a href="#" onclick="cerrarSesionCocinero(); return false;" style="color:#ffcdd2; margin-left:0;">🚪 Salir</a>';
  });
})();
