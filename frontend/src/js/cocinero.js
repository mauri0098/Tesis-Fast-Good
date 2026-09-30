// ── Estado reactivo del módulo ────────────────────────────────────────────────
// Se declara fuera de DOMContentLoaded para que marcarListo() también acceda.
let _tareasActivas = [];

// ── Escape seguro para inserción de texto en innerHTML ────────────────────────
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Normalización de observaciones ────────────────────────────────────────────
// Vacíos, nulos y "sin observaciones" se tratan como la clave estándar.
const _OBS_STD = 'Sin observaciones';
function _normObs(obs) {
  if (!obs || obs.trim() === '' || obs.trim().toLowerCase() === 'sin observaciones') {
    return _OBS_STD;
  }
  return obs.trim();
}

// ── Construir / actualizar el panel de resumen del turno ──────────────────────
function construirResumen(tareas) {
  const panelBody = document.getElementById('panel-body');
  const elPlatos  = document.getElementById('resumen-total-platos');
  const elPorc    = document.getElementById('resumen-total-porciones');
  if (!panelBody) return;

  // Agrupar por (nombre de plato + observación normalizada).
  // Clave compuesta con separador improbable en datos reales.
  const grupos = {};
  tareas.forEach(pedido => {
    const obs = _normObs(pedido.observaciones);
    (pedido.pedido_detalles || []).forEach(det => {
      const nombre = det?.productos?.nombre;
      if (!nombre || nombre === '—') return;
      const clave = `${nombre}|||${obs}`;
      if (!grupos[clave]) grupos[clave] = { nombre, obs, cantidad: 0 };
      grupos[clave].cantidad += (det.cantidad || 0);
    });
  });

  const entradas       = Object.values(grupos);
  const platosUnicos   = new Set(entradas.map(e => e.nombre)).size;
  const totalPorciones = entradas.reduce((s, e) => s + e.cantidad, 0);

  if (elPlatos) elPlatos.textContent = platosUnicos;
  if (elPorc)   elPorc.textContent   = totalPorciones;

  if (entradas.length === 0) {
    panelBody.innerHTML = '<p class="panel-vacio">Sin tareas activas.</p>';
    return;
  }

  // Orden: por nombre de plato A→Z; dentro del mismo plato, estándar antes
  // que especiales; dentro del mismo grupo, mayor cantidad primero.
  entradas.sort((a, b) => {
    const nc = a.nombre.localeCompare(b.nombre, 'es');
    if (nc !== 0) return nc;
    const aEsp = a.obs !== _OBS_STD ? 1 : 0;
    const bEsp = b.obs !== _OBS_STD ? 1 : 0;
    if (aEsp !== bEsp) return aEsp - bEsp;
    return b.cantidad - a.cantidad;
  });

  panelBody.innerHTML = entradas.map(({ nombre, obs, cantidad }) => {
    const esEspecial = obs !== _OBS_STD;
    const cardClass  = esEspecial ? 'resumen-card resumen-card--especial' : 'resumen-card';
    const obsHTML    = esEspecial
      ? `<div class="resumen-card-obs">
           <span class="resumen-card-obs-icon">⚠</span>${_esc(obs)}
         </div>`
      : '';
    return `
      <div class="${cardClass}">
        <div class="resumen-card-info">
          <div class="resumen-card-nombre">${_esc(nombre)}</div>
          ${obsHTML}
        </div>
        <div class="resumen-card-right">
          <span class="resumen-card-cantidad">${cantidad}</span>
          <span class="resumen-card-label">porc.</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  const tbody          = document.getElementById('tablaTareas');
  const contadorBadge  = document.getElementById('contador-badge');
  const cocineroId     = localStorage.getItem('usuario_id');
  // El cocinero ve y marca sus platos. Administración (6, 5, 1) ve toda la cocina, solo para mirar.
  const soloLectura    = parseInt(localStorage.getItem('usuario_rol') || '0', 10) !== FG_ROLES.ROL.COCINERO;

  // ── Toggle del panel lateral ─────────────────────────────────────────────
  const panelEl   = document.getElementById('panel-resumen');
  const btnToggle = document.getElementById('btn-toggle-panel');
  if (btnToggle && panelEl) {
    btnToggle.addEventListener('click', () => {
      panelEl.classList.toggle('panel-colapsado');
    });
  }

  // ── Recetas del localStorage (cargadas por generarReceta.js) ────────────
  const recetas = JSON.parse(localStorage.getItem('FG_RECETAS') || '[]');

  function buscarReceta(nombreProducto) {
    const nombre = nombreProducto.toLowerCase();
    return recetas.find(r =>
      r.nombre.toLowerCase().includes(nombre) ||
      nombre.includes(r.nombre.toLowerCase())
    ) || null;
  }

  function renderReceta(nombreProducto) {
    const receta = buscarReceta(nombreProducto);
    if (!receta) {
      return `<span class="sin-receta">Sin receta cargada</span>`;
    }
    const items = receta.receta
      .map(i => `<span>${i.qty}${i.unit} ${i.insumo}</span>`)
      .join('');
    return `<div class="receta-text">${items}</div>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function formatFecha(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function setVacio(msg) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${msg}</td></tr>`;
    contadorBadge.textContent = '0';
    _tareasActivas = [];
    construirResumen([]);
  }

  // ── 1. Traer tareas filtradas por el cocinero logueado ───────────────────
  let enPrep;
  try {
    const url = cocineroId && !soloLectura
      ? `/api/cocina/tareas?cocinero_id=${encodeURIComponent(cocineroId)}`
      : '/api/cocina/tareas';
    const res = await apiFetch(url);
    enPrep = await res.json();

    // Cada cocinero ve solo sus platos pendientes dentro del pedido (es_mio lo marca el servidor).
    // Así la tabla y el resumen de porciones cuentan solo lo que le falta cocinar.
    enPrep = enPrep
      .map(pedido => ({
        ...pedido,
        pedido_detalles: (pedido.pedido_detalles || []).filter(det => det.es_mio && !det.listo)
      }))
      .filter(pedido => pedido.pedido_detalles.length > 0);
  } catch {
    setVacio('Error al cargar pedidos. Verificá que el servidor esté corriendo.');
    return;
  }

  if (enPrep.length === 0) {
    setVacio('No hay pedidos en preparación en este momento.');
    return;
  }

  contadorBadge.textContent = enPrep.length;

  // ── 2. Renderizar filas ───────────────────────────────────────────────────
  tbody.innerHTML = '';

  enPrep.forEach(pedido => {
    const detalles = pedido.pedido_detalles || [];
    const fecha    = formatFecha(pedido.fecha_pedido);

    const filas = detalles.length > 0 ? detalles : [null];

    filas.forEach(det => {
      const codigo   = det?.productos?.codigo_plato || '—';
      const nombre   = det?.productos?.nombre || '—';
      const cantidad = det ? `x${det.cantidad}` : '';

      const tr = document.createElement('tr');
      tr.dataset.pedidoId = pedido.id;
      tr.innerHTML = `
        <td><strong>#${pedido.id}</strong></td>
        <td>${fecha}</td>
        <td><strong>${codigo}</strong></td>
        <td>
          <span class="plato-nombre">${nombre}</span>
          <br><span class="plato-cant">${cantidad}</span>
        </td>
        <td>${pedido.observaciones || 'Sin observaciones'}</td>
        <td>
          ${soloLectura
            ? '<span class="solo-lectura">Solo lectura</span>'
            : `<button class="btn-listo" onclick="marcarListo(${pedido.id}, this)">
            ✓ Listo para entregar
          </button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  });

  // ── 3. Sincronizar estado y pintar panel de resumen ───────────────────────
  _tareasActivas = enPrep;
  construirResumen(_tareasActivas);
});

// ── Marcar como listos los platos del cocinero en un pedido ──────────────────
// Se marca solo lo del cocinero logueado (el servidor lo toma del token). El pedido pasa a
// "Listo para entregar" recién cuando todos sus platos, de todos los cocineros, están listos.
let _listoPendiente = null; // { pedidoId, btnEl } mientras el modal está abierto

window.marcarListo = function (pedidoId, btnEl) {
  _listoPendiente = { pedidoId, btnEl };
  document.getElementById('modalListoTexto').textContent =
    `¿Tus platos del pedido #${pedidoId} están listos?`;
  document.getElementById('modalListo').style.display = 'block';
  document.getElementById('modalListoConfirmar').focus();
};

// Cancelar, clic afuera o Escape: no se hace nada
window.cerrarModalListo = function (e) {
  const modal = document.getElementById('modalListo');
  if (e && e.target !== modal) return;
  modal.style.display = 'none';
  _listoPendiente = null;
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.cerrarModalListo();
});

window.confirmarListo = async function () {
  if (!_listoPendiente) return;
  const { pedidoId, btnEl } = _listoPendiente;
  window.cerrarModalListo();

  // Deshabilitar todos los botones de ese pedido (hay uno por plato)
  const botones = document.querySelectorAll(`tr[data-pedido-id="${pedidoId}"] .btn-listo`);
  botones.forEach(b => { b.disabled = true; });
  btnEl.textContent = 'Actualizando...';

  try {
    const res = await apiFetch(`/api/pedidos/${pedidoId}/listo-cocinero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      }
    });
    const data = await res.json().catch(() => ({}));

    // Los platos quedaron listos en todos estos casos: se sacan de la pantalla
    if (res.ok || data.platos_listos) {
      quitarPedidoDeLaTabla(pedidoId);

      if (res.ok && data.completo) {
        mostrarAviso('exito', 'Pedido completo, pasó a Listo para Entregar.');
      } else if (res.ok) {
        mostrarAviso('info', 'Tus platos quedaron listos. Faltan platos de otros cocineros.');
      } else {
        // 409 por stock: el pedido sigue En Preparación hasta que lo resuelva el administrador
        mostrarAviso('error', data.mensaje || 'Tus platos quedaron listos, pero el pedido no pudo avanzar.', data.error);
      }
      return;
    }

    const mensaje = res.status === 401
      ? 'Tu sesión expiró. Volvé a iniciar sesión.'
      : (data.error || 'No se pudo marcar como listo. Intentá de nuevo.');
    throw new Error(mensaje);

  } catch (err) {
    botones.forEach(b => { b.disabled = false; });
    btnEl.textContent = '✓ Listo para entregar';
    mostrarAviso('error', err.message || 'No se pudo conectar con el servidor.');
  }
};

function quitarPedidoDeLaTabla(pedidoId) {
  // Eliminar todas las filas de ese pedido de la tabla
  document.querySelectorAll(`tr[data-pedido-id="${pedidoId}"]`).forEach(f => f.remove());

  // Actualizar badge contador
  const badge  = document.getElementById('contador-badge');
  const actual = parseInt(badge.textContent) - 1;
  badge.textContent = actual;

  if (actual === 0) {
    document.getElementById('tablaTareas').innerHTML =
      '<tr class="empty-row"><td colspan="6">No hay pedidos en preparación en este momento.</td></tr>';
  }

  // Actualizar estado reactivo y refrescar panel lateral
  _tareasActivas = _tareasActivas.filter(p => String(p.id) !== String(pedidoId));
  construirResumen(_tareasActivas);
}

// Aviso flotante. tipo: 'exito' | 'info' | 'error'. detalle: texto secundario opcional.
function mostrarAviso(tipo, mensaje, detalle) {
  document.getElementById('avisoCocina')?.remove();

  const aviso = document.createElement('div');
  aviso.id = 'avisoCocina';
  aviso.className = `aviso-cocina aviso-cocina--${tipo}`;
  aviso.setAttribute('role', 'status');

  const texto = document.createElement('span');
  texto.textContent = (tipo === 'exito' ? '✓ ' : tipo === 'error' ? '⚠ ' : '') + mensaje;
  aviso.appendChild(texto);

  if (detalle) {
    const extra = document.createElement('span');
    extra.className = 'aviso-cocina-detalle';
    extra.textContent = detalle;
    aviso.appendChild(extra);
  }

  const cerrar = document.createElement('button');
  cerrar.className = 'aviso-cocina-cerrar';
  cerrar.textContent = '×';
  cerrar.onclick = () => aviso.remove();
  aviso.appendChild(cerrar);

  document.body.appendChild(aviso);
  // Los errores quedan hasta que se cierran; los demás se van solos
  if (tipo !== 'error') setTimeout(() => aviso.remove(), 5000);
}
