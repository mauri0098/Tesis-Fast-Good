(function () {
  // Detecta si estamos dentro de /pages/ para armar las rutas correctamente
  const enSubpagina = window.location.pathname.includes('/pages/');
  const base = enSubpagina ? '../' : './';

  // Inyecta el CSS del sidebar si no está ya cargadoo
  if (!document.querySelector('link[href*="adminSidebar.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'src/css/adminSidebar.css';
    document.head.appendChild(link);
  }

  // soloAdmin: true → oculto en el sidebar cuando el usuario logueado es Cocinero.
  // Mismo criterio que la lista blanca de guard.js (PAGINAS_COCINERO): el
  // cocinero solo debe ver Tareas de Cocina, Gestión de Stock, Generar Receta
  // y Movimientos de Stock.
  const links = [
    { href: base + 'admin.html',                      label: '🏠 Inicio',               soloAdmin: true },
    { href: base + 'pages/ConsultarPedidos.html',      label: '🧾 Consultar Pedidos',    soloAdmin: true },
    { href: base + 'pages/cocinero.html',              label: '🥗 Tareas de Cocina'     },
    { href: base + 'pages/stock.html',                 label: '📦 Gestión de Stock'     },
    { href: base + 'pages/generarReceta.html',         label: '📝 Generar Receta'       },
    { href: base + 'pages/MovimientosStock.html',      label: '📋 Movimientos de Stock' },
    { href: base + 'pages/AsignarCocinero.html',       label: '👨‍🍳 Asignar Cocineros',   soloAdmin: true },
    { href: base + 'pages/Envios.html',                label: '🚗 Envíos del Día',       soloAdmin: true },
    { href: base + 'pages/gestionUsuarios.html',       label: '👥 Gestión de Usuarios',  soloAdmin: true },
  ];

  const ROL_COCINERO = 2;
  const usuarioRol   = parseInt(localStorage.getItem('usuario_rol') || '0', 10);
  const esCocinero   = usuarioRol === ROL_COCINERO;

  const linksVisibles = esCocinero ? links.filter(l => !l.soloAdmin) : links;

  const navHTML = linksVisibles
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join('\n      ');

  const sidebar = document.createElement('aside');
  sidebar.className = 'admin-sidebar';
  sidebar.innerHTML = `
    <h2>📊 Panel Admin</h2>
    <div class="user-info">
      <p><strong>Usuario:</strong></p>
      <p id="sidebarUserName">-</p>
      <p style="font-size:0.8rem;color:#ccc;margin-top:0.5rem;">
        ID: <span id="sidebarUserId">-</span>
      </p>
    </div>
    <nav>
      ${navHTML}
    </nav>
    <button class="sidebar-logout-btn" id="sidebarLogoutBtn">🚪 Cerrar Sesión</button>
  `;

  // Inserta el sidebar como primer hijo del body
  document.body.insertBefore(sidebar, document.body.firstChild);

  // Agrega la clase que activa el layout flex
  document.body.classList.add('admin-layout');

  // Resalta el link de la página actual
  const paginaActual = window.location.pathname.split('/').pop();
  sidebar.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href').endsWith(paginaActual)) {
      a.classList.add('active');
    }
  });

  // Botón hamburguesa + overlay para colapsar el sidebar en mobile.
  // Nuevo, no reemplaza ni toca ninguna lógica existente del sidebar.
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Abrir menú');
  toggleBtn.textContent = '☰';
  document.body.appendChild(toggleBtn);

  function toggleAdminSidebar(abrir) {
    const debeAbrir = typeof abrir === 'boolean' ? abrir : !sidebar.classList.contains('abierta');
    sidebar.classList.toggle('abierta', debeAbrir);
    overlay.classList.toggle('visible', debeAbrir);
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
      window.location.replace(base + 'login.html');
    }
  });

  // Rellena nombre e ID del usuario logueadoo
  function cargarDatosUsuario() {
    if (typeof obtenerDatosUsuario === 'function') {
      const usuario = obtenerDatosUsuario();
      const nameEl = document.getElementById('sidebarUserName');
      const idEl   = document.getElementById('sidebarUserId');
      if (nameEl) nameEl.textContent = usuario.nombre || '-';
      if (idEl)   idEl.textContent   = usuario.id     || '-';
    }
  }

  // Intenta cargar al DOMContentLoaded y, si auth.js no cargó todavía, reintenta una vez
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarDatosUsuario);
  } else {
    cargarDatosUsuario();
  }
})();
