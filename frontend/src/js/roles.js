// ============================================================================
// roles.js — Roles del sistema y qué pantalla ve cada uno.
// Es la ÚNICA tabla de permisos del frontend: la usan guard.js (bloquea la URL),
// adminSidebar.js (arma el menú), auth.js (a dónde va cada rol al loguearse)
// y gestionUsuarios.js (el select de roles).
// OJO: esto solo ordena las pantallas. La protección real de los datos tiene que
// estar en el servidor (JWT + rol en cada endpoint).
// ============================================================================

var FG_ROLES = (function () {
  var ROL = {
    ADMINISTRADOR: 1,   // del negocio, encargado del día a día
    COCINERO:      2,
    REPARTIDOR:    3,
    CONSUMIDOR:    4,
    DUENO:         5,
    SISTEMA:       6    // administrador del sistema: puede todo
  };

  var NOMBRES = {
    1: 'Administrador',
    2: 'Cocinero',
    3: 'Repartidor',
    4: 'Consumidor final',
    5: 'Dueño',
    6: 'Administrador del sistema'
  };

  // Pantallas internas, en el orden del menú. ruta = desde la raíz de frontend/.
  var PANTALLAS = [
    { ruta: 'admin.html',                   menu: '🏠 Inicio',               roles: [6, 5] },          // Reportes
    { ruta: 'pages/ConsultarPedidos.html',  menu: '🧾 Consultar Pedidos',    roles: [6, 5, 1] },
    { ruta: 'pages/cocinero.html',          menu: '🥗 Tareas de Cocina',     roles: [2, 6, 5, 1] },    // 6, 5 y 1 solo para ver
    { ruta: 'pages/stock.html',             menu: '📦 Gestión de Stock',     roles: [6, 5, 1] },
    { ruta: 'pages/generarReceta.html',     menu: '📝 Generar Receta',       roles: [6, 5] },
    { ruta: 'pages/MovimientosStock.html',  menu: '📋 Movimientos de Stock', roles: [6, 5, 1] },
    { ruta: 'pages/AsignarCocinero.html',   menu: '👨‍🍳 Asignar Cocineros',   roles: [6, 5] },
    { ruta: 'pages/Envios.html',            menu: '🚗 Envíos del Día',       roles: [6, 5, 1, 3] },
    { ruta: 'pages/gestionUsuarios.html',   menu: '👥 Gestión de Usuarios',  roles: [6, 5] }
  ];

  // Pantalla a la que va cada rol al loguearse (o si entra a una que no le corresponde)
  var PRINCIPAL = {
    6: 'admin.html',
    5: 'admin.html',
    1: 'pages/ConsultarPedidos.html',
    2: 'pages/cocinero.html',
    3: 'pages/Envios.html',
    4: 'index.html'
  };

  function archivo(ruta) { return ruta.split('/').pop(); }

  // null = pantalla que no está en la tabla (catálogo, formulario, login…): la ve cualquiera
  function rolesDe(nombreArchivo) {
    for (var i = 0; i < PANTALLAS.length; i++) {
      if (archivo(PANTALLAS[i].ruta) === nombreArchivo) return PANTALLAS[i].roles;
    }
    return null;
  }

  function puedeVer(rol, nombreArchivo) {
    var roles = rolesDe(nombreArchivo);
    return roles === null || roles.indexOf(rol) !== -1;
  }

  function pantallaPrincipal(rol) {
    return PRINCIPAL[rol] || 'index.html';
  }

  function pantallasDelRol(rol) {
    return PANTALLAS.filter(function (p) { return p.roles.indexOf(rol) !== -1; });
  }

  // Prefijo para armar links desde la página actual ('../' dentro de /pages/, './' en la raíz)
  function base() {
    return window.location.pathname.indexOf('/pages/') !== -1 ? '../' : './';
  }

  return {
    ROL: ROL, NOMBRES: NOMBRES,
    puedeVer: puedeVer, pantallaPrincipal: pantallaPrincipal, pantallasDelRol: pantallasDelRol, base: base
  };
})();
