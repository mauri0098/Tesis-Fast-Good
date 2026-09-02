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
  // Recibe 'YYYY-MM-DD' (fecha_entrega, sin hora) o un timestamp ISO completo.
  // Se arma la fecha con componentes locales (no Date(isoString) directo) para
  // que una columna `date` como fecha_entrega no se corra un día por husos horarios.
  function formatFecha(fechaStr) {
    if (!fechaStr) return '—';
    const [anio, mes, dia] = fechaStr.split('T')[0].split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function setVacio(msg) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${msg}</td></tr>`;
    contadorBadge.textContent = '0';
    _tareasActivas = [];
    construirResumen([]);
  }

  // ── Filtro de fecha activo ─────────────────────────────────────────────────
  // 'default' = ventana automática de 48hs (comportamiento del backend sin parámetros)
  // 'rango'   = fecha_entrega entre desde/hasta elegidos por el cocinero
  // 'todos'   = sin filtro de fecha (auditoría)
  let filtroActual = { modo: 'default', desde: '', hasta: '' };

  const inputDesde     = document.getElementById('fechaDesdeCocinero');
  const inputHasta     = document.getElementById('fechaHastaCocinero');
  const btnBuscar      = document.getElementById('btnBuscarTareas');
  const btnVerTodos    = document.getElementById('btnVerTodosTareas');

  // ── Traer y renderizar las tareas del cocinero logueado ───────────────────
  let cargando = false;

  async function cargarTareas() {
    if (cargando) return; // evita solapar refrescos si uno tarda más que el intervalo
    cargando = true;

    let enPrep;
    try {
      const params = new URLSearchParams();
      if (cocineroId) params.set('cocinero_id', cocineroId);

      if (filtroActual.modo === 'todos') {
        params.set('todos', 'true');
      } else if (filtroActual.modo === 'rango') {
        if (filtroActual.desde) params.set('desde', filtroActual.desde);
        if (filtroActual.hasta) params.set('hasta', filtroActual.hasta);
      }
      // modo 'default': no se agrega ningún parámetro de fecha —
      // el backend aplica la ventana automática de 48hs por su cuenta.

      const url = `/api/cocina/tareas?${params.toString()}`;
      const res = await fetch(url);
      enPrep = await res.json();

      if (!res.ok) {
        console.error('Error del servidor al traer tareas de cocina:', enPrep.error);
        setVacio(enPrep.error || 'Error al cargar pedidos. Intentá de nuevo.');
        return;
      }
    } catch {
      setVacio('Error al cargar pedidos. Verificá que el servidor esté corriendo.');
      return;
    } finally {
      cargando = false;
    }

    if (enPrep.length === 0) {
      const mensaje = filtroActual.modo === 'rango'
        ? 'No hay pedidos en preparación dentro del rango de fechas seleccionado.'
        : 'No hay pedidos en preparación en este momento.';
      setVacio(mensaje);
      return;
    }

    contadorBadge.textContent = enPrep.length;

    // Renderizar filas
    tbody.innerHTML = '';

    enPrep.forEach(pedido => {
      const detalles = pedido.pedido_detalles || [];
      const fecha    = formatFecha(pedido.fecha_entrega);

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
            <button class="btn-listo" onclick="marcarListo(${pedido.id}, this)">
              ✓ Listo para entregar
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });

    // Sincronizar estado y pintar panel de resumen
    _tareasActivas = enPrep;
    construirResumen(_tareasActivas);
  }

  // ── Botones de la barra de filtros ─────────────────────────────────────────
  if (btnBuscar) {
    btnBuscar.addEventListener('click', () => {
      filtroActual = {
        modo: 'rango',
        desde: inputDesde ? inputDesde.value : '',
        hasta: inputHasta ? inputHasta.value : ''
      };
      cargarTareas();
    });
  }

  if (btnVerTodos) {
    btnVerTodos.addEventListener('click', () => {
      if (inputDesde) inputDesde.value = '';
      if (inputHasta) inputHasta.value = '';
      filtroActual = { modo: 'todos', desde: '', hasta: '' };
      cargarTareas();
    });
  }

  await cargarTareas();

  // Refresco periódico para que los pedidos nuevos aparezcan sin recargar la página,
  // respetando el filtro de fecha activo (rango / ver todos / ventana automática).
  setInterval(cargarTareas, 30000);
});

// ── Cambiar estado del pedido a "Listo para entregar" ────────────────────────
window.marcarListo = async function (pedidoId, btnEl) {
  if (!confirm(`¿Marcar el pedido #${pedidoId} como "Listo para entregar"?`)) return;

  btnEl.disabled = true;
  btnEl.textContent = 'Actualizando...';

  try {
    const res = await fetch(`/api/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_id: 3 }) // 3 = Listo para entregar
    });

    if (!res.ok) throw new Error();

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

  } catch {
    btnEl.disabled = false;
    btnEl.textContent = '✓ Listo para entregar';
    alert('Error al actualizar el estado. Intentá de nuevo.');
  }
};
