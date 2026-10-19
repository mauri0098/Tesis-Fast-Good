// ============================================================================
// adminSidebar.js — El menú de la izquierda de todas las pantallas del panel
//
// Arma el menú (logo, links agrupados, usuario y cerrar sesión) y, para pantallas de menos
// de 900 px, la barra de arriba con el botón ☰. Corre apenas se lee (está al principio del <body>).
// Qué pantallas ve cada rol lo decide roles.js (la misma tabla que usa guard.js).
// El estilo está en src/css/menuPanel.css, que este archivo carga.
//
// Funciones:
//   toggleAdminSidebar → abre o cierra el menú en pantallas chicas (el ☰, lo oscuro de atrás o un link)
//   cargarDatosUsuario → escribe abajo del menú el nombre del usuario y su inicial
// ============================================================================

(function () {
  // Detecta si estamos dentro de /pages/ para armar las rutas correctamente
  const enSubpagina = window.location.pathname.includes('/pages/');
  const base = enSubpagina ? '../' : './';

  // Inyecta el CSS del menú si no está ya cargado
  if (!document.querySelector('link[href*="menuPanel.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'src/css/menuPanel.css';
    document.head.appendChild(link);
  }

  // Solo las pantallas que el rol puede usar (la tabla está en roles.js, la misma que usa guard.js)
  const usuarioRol = parseInt(localStorage.getItem('usuario_rol') || '0', 10);

  // El menú, en orden: a qué grupo va cada pantalla, con qué ícono y con qué nombre ('' = sin grupo, arriba de todo).
  // Los nombres son los de siempre, sin el emoji. "Movimientos (viejo)" no está: no sale en el menú,
  // pero se sigue pudiendo abrir (roles.js la deja entrar).
  const MENU_PANEL = [
    { ruta: 'admin.html',                       grupo: '',               icono: 'icono-menu-inicio',      nombre: 'Inicio' },
    { ruta: 'pages/ConsultarPedidos.html',      grupo: 'Pedidos',        icono: 'icono-menu-pedidos',     nombre: 'Consultar Pedidos' },
    { ruta: 'pages/Envios.html',                grupo: 'Reparto',        icono: 'icono-menu-envios',      nombre: 'Envíos del Día' },
    { ruta: 'pages/cocinero.html',              grupo: 'Cocina',         icono: 'icono-menu-cocina',      nombre: 'Tareas de Cocina' },
    { ruta: 'pages/heladera.html',              grupo: 'Cocina',         icono: 'icono-menu-heladera',    nombre: 'Producción' },
    { ruta: 'pages/AsignarCocinero.html',       grupo: 'Cocina',         icono: 'icono-menu-asignar',     nombre: 'Asignar Cocineros' },
    { ruta: 'pages/MovimientosStockNuevo.html', grupo: 'Stock',          icono: 'icono-menu-movimientos', nombre: 'Movimientos de Stock' },
    { ruta: 'pages/stock.html',                 grupo: 'Stock',          icono: 'icono-menu-stock',       nombre: 'Gestión de Stock' },
    { ruta: 'pages/combos.html',                grupo: 'Catálogo',       icono: 'icono-menu-combos',      nombre: 'Combos' },
    { ruta: 'pages/generarReceta.html',         grupo: 'Catálogo',       icono: 'icono-menu-receta',      nombre: 'Generar Receta' },
    { ruta: 'pages/gestionUsuarios.html',       grupo: 'Administración', icono: 'icono-menu-usuarios',    nombre: 'Gestión de Usuarios' }
  ];

  // Los dibujos de los íconos (de línea, del color de la letra). Cada link usa el suyo con <use href="#…">
  const ICONOS_MENU = `
    <svg class="menu-iconos" aria-hidden="true">
      <symbol id="icono-menu-inicio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"></path><path d="M5 10v10h5v-6h4v6h5V10"></path></symbol>
      <symbol id="icono-menu-pedidos" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 8h6M9 12h6M9 16h4"></path></symbol>
      <symbol id="icono-menu-envios" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="6" width="12" height="10" rx="1"></rect><path d="M14 9h4l3 3.5V16h-7z"></path><circle cx="7" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle></symbol>
      <symbol id="icono-menu-cocina" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z"></path><path d="M6 17h12"></path></symbol>
      <symbol id="icono-menu-heladera" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M5 10h14M9 5v2M9 13v3"></path></symbol>
      <symbol id="icono-menu-asignar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"></circle><path d="M3 20c0-3.3 2.7-6 6-6 1.6 0 3 .6 4.1 1.6"></path><path d="M15 17l2 2 4-4"></path></symbol>
      <symbol id="icono-menu-movimientos" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"></path></symbol>
      <symbol id="icono-menu-stock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"></path><path d="M3 7.5l9 4.5 9-4.5M12 12v9"></path></symbol>
      <symbol id="icono-menu-combos" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect></symbol>
      <symbol id="icono-menu-receta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l3 3v15H6z"></path><path d="M9 11h6M9 15h6"></path></symbol>
      <symbol id="icono-menu-usuarios" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"></circle><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6"></path></symbol>
      <symbol id="icono-menu-salir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"></path></symbol>
    </svg>`;

  // Las pantallas del rol en un objeto { ruta: pantalla }, para buscarlas sin recorrer la lista cada vez.
  // Ej: rol 3 (repartidor) → { 'pages/Envios.html': {…} }
  const pantallasDelRol = {};
  FG_ROLES.pantallasDelRol(usuarioRol).forEach(pantalla => {
    pantallasDelRol[pantalla.ruta] = pantalla;
  });

  // Los links, grupo por grupo. El título de cada grupo sale justo antes de su primera pantalla:
  // si el rol no ve ninguna pantalla de un grupo, ese título no sale.
  // Ej: rol 3 → solo "REPARTO" y "Envíos del Día"
  let navHTML = '';
  let grupoAnterior = '';
  MENU_PANEL.forEach(item => {
    if (!pantallasDelRol[item.ruta]) return;   // el rol no ve esta pantalla: return = saltear y seguir con la siguiente
    const empiezaGrupo = item.grupo !== '' && item.grupo !== grupoAnterior;   // primera pantalla de un grupo nuevo
    if (empiezaGrupo) navHTML += `<p class="menu-grupo">${item.grupo}</p>`;
    grupoAnterior = item.grupo;
    navHTML += `<a class="menu-link" href="${base + item.ruta}"><svg class="menu-icono" aria-hidden="true"><use href="#${item.icono}"></use></svg>${item.nombre}</a>`;
  });

  // El logo: va arriba del menú y en la barra de las pantallas chicas
  const logoHTML = `
    <div class="menu-logo">
      <img class="menu-logo-imagen" src="${base}src/assets/img/logo.webp" alt="" width="38" height="38">
      <span class="menu-logo-texto">Fast <span class="menu-logo-verde">&amp; Good</span></span>
      <span class="menu-etiqueta-panel">PANEL</span>
    </div>`;

  // El nombre del rol, de la tabla de roles.js. Ej: 6 → "Administrador del sistema"
  const nombreRol = FG_ROLES.NOMBRES[usuarioRol] || '';

  const sidebar = document.createElement('aside');
  sidebar.className = 'admin-sidebar menu-panel';
  sidebar.innerHTML = `
    ${ICONOS_MENU}
    ${logoHTML}
    <nav class="menu-links" aria-label="Menú del panel">
      ${navHTML}
    </nav>
    <div class="menu-usuario">
      <span class="menu-usuario-inicial" id="sidebarUserInicial" aria-hidden="true">-</span>
      <span class="menu-usuario-datos">
        <strong class="menu-usuario-nombre" id="sidebarUserName">-</strong>
        <span class="menu-usuario-rol">${nombreRol}</span>
      </span>
      <button type="button" class="sidebar-logout-btn menu-boton-salir" id="sidebarLogoutBtn" aria-label="Cerrar sesión" title="Cerrar sesión">
        <svg class="menu-icono" aria-hidden="true"><use href="#icono-menu-salir"></use></svg>
      </button>
    </div>
  `;

  // Inserta el menú como primer hijo del body
  document.body.insertBefore(sidebar, document.body.firstChild);

  // Agrega la clase de las páginas con menú (menuPanel.css)
  document.body.classList.add('admin-layout');

  // Resalta el link de la página actual (pastilla verde)
  const paginaActual = window.location.pathname.split('/').pop();
  sidebar.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href').endsWith(paginaActual)) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');   // para los lectores de pantalla: "es la página en la que estás"
    }
  });

  // Pantallas de menos de 900 px: lo oscuro que tapa el contenido con el menú abierto,
  // y la barra de arriba con el botón ☰ y el logo
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'sidebar-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Abrir menú');
  toggleBtn.setAttribute('aria-expanded', 'false');   // para los lectores de pantalla: el menú está cerrado
  toggleBtn.textContent = '☰';

  const barra = document.createElement('div');
  barra.className = 'barra-menu-celu';
  barra.innerHTML = logoHTML;                                // el mismo logo de arriba del menú
  barra.insertBefore(toggleBtn, barra.firstChild);           // el ☰ a la izquierda del logo
  document.body.insertBefore(barra, sidebar.nextSibling);    // la barra, arriba del contenido de la pantalla

  function toggleAdminSidebar(abrir) {
    const debeAbrir = typeof abrir === 'boolean' ? abrir : !sidebar.classList.contains('abierta');
    sidebar.classList.toggle('abierta', debeAbrir);
    overlay.classList.toggle('visible', debeAbrir);
    toggleBtn.setAttribute('aria-expanded', String(debeAbrir));   // abierto o cerrado, para los lectores de pantalla
  }

  toggleBtn.addEventListener('click', () => toggleAdminSidebar());
  overlay.addEventListener('click', () => toggleAdminSidebar(false));
  sidebar.querySelectorAll('nav a').forEach(a => {
    a.addEventListener('click', () => toggleAdminSidebar(false));
  });

  // Cierre de sesión — espera a que auth.js esté disponible
  document.getElementById('sidebarLogoutBtn').addEventListener('click', function () {
    if (typeof cerrarSesion === 'function') {
      cerrarSesion();
    } else {
      localStorage.clear();
      window.location.replace('/');   // a la web, igual que cerrarSesion() de auth.js
    }
  });

  // Escribe el nombre del usuario logueado y su inicial. Los dos salen de lo que guardó auth.js en el
  // navegador al iniciar sesión (el mismo dato que da obtenerDatosUsuario, que solo está en admin.html).
  // Ej: "Mauricio" → "M" en el círculo verde y "Mauricio" al lado
  function cargarDatosUsuario() {
    const nombre = localStorage.getItem('usuario_nombre') || '-';
    document.getElementById('sidebarUserName').textContent = nombre;                         // textContent: se muestra como texto
    document.getElementById('sidebarUserInicial').textContent = nombre.charAt(0).toUpperCase();  // charAt(0) = la primera letra
  }

  // Lo escribe al DOMContentLoaded (o enseguida, si la página ya cargó)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarDatosUsuario);
  } else {
    cargarDatosUsuario();
  }
})();
