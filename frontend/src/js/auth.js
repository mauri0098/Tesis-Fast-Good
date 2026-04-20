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

    // Redirigir según rol
    if (data.usuario.id_rol === 1) {
      // Admin
      window.location.href = 'admin.html';
    } else {
     // Si entra alguien que no es admin (ej: un cliente por error)
      mostrarError('loginError', 'No tienes permisos de administrador.');
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
 * Cierra la sesión del usuario
 */
function cerrarSesion() {
  // Limpiar localStorage
  localStorage.removeItem('usuario_id');
  localStorage.removeItem('usuario_nombre');
  localStorage.removeItem('usuario_rol');
  localStorage.removeItem('usuario_email');

  // Redirigir siempre a la vidriera pública
  window.location.href = 'index.html';
}