/**
 * api.js — apiFetch(): fetch con la sesión del usuario.
 * Se usa para todos los endpoints que no son públicos.
 *
 * - Agrega el header Authorization: Bearer <fg_token>.
 * - Si el servidor responde 401 (sin sesión o token vencido), borra la sesión
 *   local y manda al login. La promesa queda sin resolver para que la pantalla
 *   no muestre errores mientras se va.
 * - Cualquier otra respuesta (incluido 403 "no tenés permiso") se devuelve igual
 *   que fetch(), para que cada pantalla la maneje como ya lo hacía.
 */
function apiFetch(url, opciones) {
  opciones = opciones || {};
  var headers = new Headers(opciones.headers || {});
  var token = localStorage.getItem('fg_token');
  if (token) headers.set('Authorization', 'Bearer ' + token);

  return fetch(url, Object.assign({}, opciones, { headers: headers })).then(function (res) {
    if (res.status !== 401) return res;

    ['fg_token', 'usuario_id', 'usuario_nombre', 'usuario_rol', 'usuario_email',
     'usuario_apellido', 'usuario_telefono', 'usuario_direccion'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    var base = window.location.pathname.indexOf('/pages/') !== -1 ? '../' : './';
    window.location.replace(base + 'login.html');
    return new Promise(function () {});
  });
}
