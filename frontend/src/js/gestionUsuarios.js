// Estado global
let todosUsuarios    = [];
let idUsuarioEditando = null;

// Mapa de roles → etiqueta visual y clase CSS
const CONFIG_ROLES = {
  1: { label: 'Admin',    clase: 'badge-admin'    },
  2: { label: 'Cocinero', clase: 'badge-cocinero' },
  4: { label: 'Usuario',  clase: 'badge-usuario'  }
};

// ==========================================
// INICIO
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  fetchUsuarios();
  iniciarFiltros();

  window.addEventListener('click', function (e) {
    if (e.target === document.getElementById('modalCrear'))  cerrarModalCrear();
    if (e.target === document.getElementById('modalEditar')) cerrarModalEditar();
  });
});

// ==========================================
// TRAER USUARIOS DEL SERVIDOR
// ==========================================
async function fetchUsuarios() {
  const tbody = document.getElementById('usuariosBody');
  try {
    const response = await fetch('/api/usuarios');
    const data     = await response.json();

    if (!response.ok) throw new Error(data.error || 'Error en el servidor');

    todosUsuarios = data;
    renderizarUsuarios(todosUsuarios);

  } catch (error) {
    console.error('Error al traer usuarios:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderizarUsuarios(usuarios) {
  const tbody = document.getElementById('usuariosBody');
  tbody.innerHTML = '';

  if (usuarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-text">No existen usuarios que cumplan los filtros especificados</td></tr>';
    return;
  }

  usuarios.forEach(function (u) {
    const tr = document.createElement('tr');

    // — ID (UUID truncado para no romper la celda) —
    const tdId = document.createElement('td');
    tdId.className   = 'td-id';
    tdId.textContent = u.id ? u.id.substring(0, 8) + '…' : '-';
    tdId.title       = u.id || '';  // tooltip con UUID completo al pasar el mouse

    // — Nombre y Apellido —
    const tdNombre = document.createElement('td');
    tdNombre.innerHTML = '<strong>' + escHtml(u.nombre || '') + '</strong> ' + escHtml(u.apellido || '');

    // — Nombre de Usuario —
    const tdUsername = document.createElement('td');
    tdUsername.textContent = u.nombre_usuario || '-';
    tdUsername.style.fontFamily = "'Courier New', monospace";
    tdUsername.style.fontSize   = '0.80rem';

    // — Email —
    const tdEmail = document.createElement('td');
    tdEmail.textContent = u.email || '-';
    tdEmail.style.fontSize = '0.80rem';

    // — Teléfono —
    const tdTel = document.createElement('td');
    tdTel.textContent = u.telefono || '-';

    // — Rol (badge de color) —
    const tdRol = document.createElement('td');
    const conf  = CONFIG_ROLES[u.id_rol] || { label: 'Rol ' + u.id_rol, clase: 'badge-usuario' };
    const span  = document.createElement('span');
    span.className   = 'badge-rol ' + conf.clase;
    span.textContent = conf.label;
    tdRol.appendChild(span);

    // — Acciones —
    const tdAcciones = document.createElement('td');
    tdAcciones.className = 'td-acciones';
    const grupo = document.createElement('div');
    grupo.className = 'acciones-grupo';

    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn-editar';
    btnEditar.textContent = 'Editar';
    btnEditar.onclick = function () { abrirModalEditar(u.id); };

    const btnBorrar = document.createElement('button');
    btnBorrar.className = 'btn-borrar';
    btnBorrar.textContent = 'Eliminar';
    btnBorrar.onclick = function () { eliminarUsuario(u.id, u.nombre, u.apellido); };

    grupo.appendChild(btnEditar);
    grupo.appendChild(btnBorrar);
    tdAcciones.appendChild(grupo);

    tr.appendChild(tdId);
    tr.appendChild(tdNombre);
    tr.appendChild(tdUsername);
    tr.appendChild(tdEmail);
    tr.appendChild(tdTel);
    tr.appendChild(tdRol);
    tr.appendChild(tdAcciones);
    tbody.appendChild(tr);
  });
}

// ==========================================
// FILTROS REACTIVOS
// ==========================================
function iniciarFiltros() {
  const filtroNombre = document.getElementById('filtroNombre');
  const filtroRol    = document.getElementById('filtroRol');

  function aplicarFiltros() {
    const texto = filtroNombre.value.toLowerCase();
    const rol   = filtroRol.value;

    const filtrados = todosUsuarios.filter(function (u) {
      const nombreCompleto = ((u.nombre || '') + ' ' + (u.apellido || '')).toLowerCase();
      const cumpleNombre   = nombreCompleto.includes(texto);
      const cumpleRol      = !rol || String(u.id_rol) === rol;
      return cumpleNombre && cumpleRol;
    });

    renderizarUsuarios(filtrados);
  }

  filtroNombre.addEventListener('input',  aplicarFiltros);
  filtroRol.addEventListener('change',    aplicarFiltros);
}

// ==========================================
// MODAL CREAR
// ==========================================
function abrirModalCrear() {
  ['uNombre', 'uApellido', 'uNombreUsuario', 'uEmail', 'uTelefono', 'uContrasena'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('uRol').value         = '';
  document.getElementById('uError').style.display = 'none';
  document.getElementById('modalCrear').style.display = 'block';
}

function cerrarModalCrear() {
  document.getElementById('modalCrear').style.display = 'none';
}

// ==========================================
// MODAL EDITAR
// ==========================================
function abrirModalEditar(id) {
  const u = todosUsuarios.find(function (u) { return u.id === id; });
  if (!u) return;
  idUsuarioEditando = id;

  document.getElementById('eNombre').value        = u.nombre         || '';
  document.getElementById('eApellido').value      = u.apellido        || '';
  document.getElementById('eNombreUsuario').value = u.nombre_usuario  || '';
  document.getElementById('eEmail').value         = u.email           || '';
  document.getElementById('eTelefono').value      = u.telefono        || '';
  document.getElementById('eContrasena').value    = '';
  document.getElementById('eRol').value       = u.id_rol    || 4;
  document.getElementById('eError').style.display = 'none';
  document.getElementById('modalEditar').style.display = 'block';
}

function cerrarModalEditar() {
  document.getElementById('modalEditar').style.display = 'none';
  idUsuarioEditando = null;
}

// ==========================================
// VALIDACIONES
// ==========================================
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mostrarError(elementId, texto) {
  const el = document.getElementById(elementId);
  el.textContent   = texto;
  el.style.display = 'block';
}

// ==========================================
// CREAR USUARIO → POST /api/usuarios/crear
// ==========================================
async function crearUsuario() {
  const nombre         = document.getElementById('uNombre').value.trim();
  const apellido       = document.getElementById('uApellido').value.trim();
  const nombre_usuario = document.getElementById('uNombreUsuario').value.trim();
  const email          = document.getElementById('uEmail').value.trim();
  const telefono       = document.getElementById('uTelefono').value.trim();
  const contrasena     = document.getElementById('uContrasena').value.trim();
  const idRol          = document.getElementById('uRol').value;

  if (!nombre || !apellido || !nombre_usuario || !email || !telefono || !contrasena || !idRol) {
    mostrarError('uError', 'Completá todos los campos obligatorios.');
    return;
  }

  if (!validarEmail(email)) {
    mostrarError('uError', 'El email no tiene un formato válido.');
    return;
  }

  const yaExiste = todosUsuarios.some(function (u) {
    return (u.nombre_usuario || '').trim().toLowerCase() === nombre_usuario.toLowerCase();
  });
  if (yaExiste) {
    mostrarError('uError', 'El nombre de usuario ya se encuentra registrado. Por favor, elegí uno diferente.');
    return;
  }

  try {
    const response = await fetch('/api/usuarios/crear', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nombre,
        apellido,
        nombre_usuario,
        email,
        telefono,
        contraseña: contrasena,
        id_rol: parseInt(idRol)
      })
    });

    const data = await response.json();
    if (!response.ok) {
      mostrarError('uError', data.error || 'Error en el servidor');
      return;
    }

    cerrarModalCrear();
    await fetchUsuarios();

  } catch (error) {
    console.error('Error al crear usuario:', error);
    mostrarError('uError', 'Error: ' + error.message);
  }
}

// ==========================================
// EDITAR USUARIO → PUT /api/usuarios/:id
// ==========================================
async function guardarEdicion() {
  const nombre         = document.getElementById('eNombre').value.trim();
  const apellido       = document.getElementById('eApellido').value.trim();
  const nombre_usuario = document.getElementById('eNombreUsuario').value.trim();
  const email          = document.getElementById('eEmail').value.trim();
  const telefono       = document.getElementById('eTelefono').value.trim();
  const contrasena     = document.getElementById('eContrasena').value.trim();
  const idRol          = document.getElementById('eRol').value;

  if (!nombre || !apellido || !nombre_usuario || !email || !idRol) {
    mostrarError('eError', 'Nombre, apellido, nombre de usuario, email y rol son obligatorios.');
    return;
  }

  if (!validarEmail(email)) {
    mostrarError('eError', 'El email no tiene un formato válido.');
    return;
  }

  const yaExiste = todosUsuarios.some(function (u) {
    return u.id !== idUsuarioEditando && (u.nombre_usuario || '').trim().toLowerCase() === nombre_usuario.toLowerCase();
  });
  if (yaExiste) {
    mostrarError('eError', 'El nombre de usuario ya se encuentra registrado. Por favor, elegí uno diferente.');
    return;
  }

  const payload = { nombre, apellido, nombre_usuario, email, telefono, id_rol: parseInt(idRol) };
  if (contrasena) payload.contraseña = contrasena;

  try {
    const response = await fetch('/api/usuarios/' + idUsuarioEditando, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      mostrarError('eError', data.error || 'Error en el servidor');
      return;
    }

    cerrarModalEditar();
    await fetchUsuarios();

  } catch (error) {
    console.error('Error al editar usuario:', error);
    mostrarError('eError', 'Error: ' + error.message);
  }
}

// ==========================================
// ELIMINAR USUARIO → DELETE /api/usuarios/:id
// ==========================================
async function eliminarUsuario(id, nombre, apellido) {
  const confirmar = confirm(
    '¿Eliminar al usuario "' + (nombre || '') + ' ' + (apellido || '') + '"?\nEsta acción no se puede deshacer.'
  );
  if (!confirmar) return;

  try {
    const response = await fetch('/api/usuarios/' + id, { method: 'DELETE' });
    const data     = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error en el servidor');
    await fetchUsuarios();
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    alert('Error al eliminar: ' + error.message);
  }
}

// ==========================================
// UTILIDAD: escape básico de HTML
// ==========================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
