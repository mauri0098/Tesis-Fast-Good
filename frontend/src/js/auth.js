// ====================================================================
// AUTH.JS - Lógica de Autenticación (Login/Logout)
// ====================================================================

/**
 * Maneja el envío del formulario de login
 */
async function manejarLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  // Limpiar errores previos
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('usernameError').classList.remove('show');
  document.getElementById('passwordError').classList.remove('show');

  // Validación básica
  if (!username || !password) {
    mostrarError('loginError', 'Usuario y contraseña son requeridos');
    return;
  }

  // Mostrar indicador de carga
  document.getElementById('loadingSpinner').classList.add('show');
  document.querySelector('.login-btn').disabled = true;

  try {
    // Llamar al servidor para validar credenciales
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nombre: username, contraseña: password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al iniciar sesión');
    }

    // Guardar datos de usuario en localStorage
    localStorage.setItem('usuario_id', data.usuario.id);
    localStorage.setItem('usuario_nombre', data.usuario.nombre);
    localStorage.setItem('usuario_rol', data.usuario.id_rol);
    localStorage.setItem('usuario_email', data.usuario.email);
    localStorage.setItem('usuario_apellido', data.usuario.apellido || '');
    localStorage.setItem('usuario_telefono', data.usuario.telefono || '');
    localStorage.setItem('usuario_direccion', data.usuario.direccion || '');

    // Redirigir según rol
    const rol = data.usuario.id_rol;
    if (rol === 1) {
      window.location.href = 'admin.html';
    } else if (rol === 4) {
      window.location.href = 'index.html';
    } else {
      mostrarError('loginError', 'No tienes permisos de acceso.');
    }

  } catch (error) {
    console.error('Error login:', error);
    mostrarError('loginError', error.message);
  } finally {
    document.getElementById('loadingSpinner').classList.remove('show');
    document.querySelector('.login-btn').disabled = false;
  }
}

/**
 * Maneja el envío del formulario de registro de nuevo usuario (rol 4)
 */
async function manejarRegistro(e) {
  e.preventDefault();

  const nombre = document.getElementById('reg-nombre').value.trim();
  const apellido = document.getElementById('reg-apellido').value.trim();
  const direccion = document.getElementById('reg-direccion').value.trim();
  const telefono = document.getElementById('reg-telefono').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const contraseña = document.getElementById('reg-password').value;

  document.getElementById('registroError').classList.remove('show');
  document.getElementById('registroExito').classList.remove('show');

  if (!nombre || !apellido || !direccion || !telefono || !email || !contraseña) {
    mostrarError('registroError', 'Todos los campos son requeridos');
    return;
  }

  document.getElementById('loadingRegistro').classList.add('show');
  document.querySelector('#registroForm .login-btn').disabled = true;

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, apellido, direccion, telefono, email, contraseña })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al crear la cuenta');
    }

    const exitoEl = document.getElementById('registroExito');
    exitoEl.textContent = '¡Cuenta creada exitosamente! Ya podés iniciar sesión.';
    exitoEl.classList.add('show');

    document.getElementById('registroForm').reset();

    setTimeout(() => {
      mostrarTab('login');
      exitoEl.classList.remove('show');
    }, 2500);

  } catch (error) {
    console.error('Error registro:', error);
    mostrarError('registroError', error.message);
  } finally {
    document.getElementById('loadingRegistro').classList.remove('show');
    document.querySelector('#registroForm .login-btn').disabled = false;
  }
}

/**
 * Muestra un mensaje de error en la página
 */
function mostrarError(elementId, mensaje) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = mensaje;
    errorElement.classList.add('show');
  }
}

/**
 * Verifica si el usuario está logueado
 * Si no, redirige al login
 */
function verificarAutenticacion() {
  const usuarioId = localStorage.getItem('usuario_id');
  
  if (!usuarioId) {
    // No hay sesión activa, redirigir al login
    window.location.href = 'login.html';
  }
}

/**
 * Obtiene el rol del usuario actual
 * Retorna: 1 (admin), 2 (usuario), null (no logueado)
 */
function obtenerRolUsuario() {
  const rol = localStorage.getItem('usuario_rol');
  return rol ? parseInt(rol) : null;
}

/**
 * Obtiene los datos del usuario logueado
 */
function obtenerDatosUsuario() {
  return {
    id: localStorage.getItem('usuario_id'),
    nombre: localStorage.getItem('usuario_nombre'),
    email: localStorage.getItem('usuario_email'),
    rol: parseInt(localStorage.getItem('usuario_rol') || '0')
  };
}

/**
 * Verifica si el usuario actual es admin
 */
function esAdmin() {
  return obtenerRolUsuario() === 1;
}

/**
 * Actualiza el botón del header según el estado de sesión.
 * Si hay sesión activa muestra el nombre + dropdown con Cerrar Sesión.
 * Si no, muestra el link a login.
 */
function actualizarBotonAuth() {
  const container = document.getElementById('auth-btn-container');
  if (!container) return;

  const usuarioId = localStorage.getItem('usuario_id');
  const usuarioNombre = localStorage.getItem('usuario_nombre');

  if (usuarioId && usuarioNombre) {
    container.innerHTML = `
      <button onclick="toggleDropdownAuth(event)" class="login-btn-header"
        style="background:none;color:white;border:1px solid white;cursor:pointer;font-family:var(--font-main);font-size:0.9rem;font-weight:600;padding:0.6rem 1.2rem;border-radius:var(--radius-sm);">
        👤 ${usuarioNombre}
      </button>
      <div id="auth-dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 6px);background:white;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);min-width:160px;z-index:1000;overflow:hidden;">
        <button onclick="cerrarSesion()"
          style="width:100%;padding:0.8rem 1.2rem;border:none;background:none;text-align:left;cursor:pointer;font-family:var(--font-main);font-size:0.9rem;color:#d32f2f;font-weight:600;">
          🚪 Cerrar Sesión
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="login.html" class="login-btn-header"
        style="background:none;color:white;border:1px solid white;">
        Iniciar Sesión
      </a>
    `;
  }
}

/**
 * Abre o cierra el dropdown del header
 */
function toggleDropdownAuth(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('auth-dropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * Cierra la sesión del usuario
 */
function cerrarSesion() {
  localStorage.removeItem('usuario_id');
  localStorage.removeItem('usuario_nombre');
  localStorage.removeItem('usuario_rol');
  localStorage.removeItem('usuario_email');
  localStorage.removeItem('usuario_apellido');
  localStorage.removeItem('usuario_telefono');
  localStorage.removeItem('usuario_direccion');

  window.location.href = 'index.html';
}