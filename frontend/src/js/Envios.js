// ============================================================
// Envios.js — Gestión de envíos del día agrupados por barrio
// ============================================================

const API = 'http://localhost:3000';

let todosEnvios = [];
let todosEstados = [];

// ── Inicialización ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setFechaHoy();
  await Promise.all([cargarEstados(), buscarEnvios()]);
});

function setFechaHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  document.getElementById('filtroFecha').value = hoy;
}

// ── Carga de estados ──────────────────────────────────────────
async function cargarEstados() {
  try {
    const res = await fetch(`${API}/api/estados`);
    if (!res.ok) return;
    todosEstados = await res.json();
  } catch (e) {
    console.error('Error al cargar estados:', e);
  }
}

// ── Búsqueda de envíos ────────────────────────────────────────
async function buscarEnvios() {
  const fecha = document.getElementById('filtroFecha').value;
  const contenido = document.getElementById('contenidoEnvios');
  contenido.innerHTML = '<div class="loading-msg">Cargando envíos...</div>';

  try {
    const url = fecha ? `${API}/api/envios?fecha=${fecha}` : `${API}/api/envios`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al obtener envíos');
    todosEnvios = await res.json();

    actualizarStats(todosEnvios);
    renderEnvios(todosEnvios);
  } catch (e) {
    contenido.innerHTML = `<div class="empty-state"><p style="color:#d32f2f;">Error al conectar con el servidor</p></div>`;
  }
}

function limpiarFecha() {
  document.getElementById('filtroFecha').value = '';
  buscarEnvios();
}

// ── Stats ──────────────────────────────────────────────────────
function actualizarStats(envios) {
  document.getElementById('statTotal').textContent     = envios.length;
  document.getElementById('statListos').textContent    = envios.filter(e => e.id_estado === 3).length;
  document.getElementById('statEntregado').textContent = envios.filter(e => e.id_estado === 4).length;
}

// ── Agrupar por barrio (compartido entre pantalla e impresión) ─
function agruparPorBarrio(envios) {
  const grupos = {};
  envios.forEach(p => {
    const nombre = p.barrios?.nombre || 'Sin barrio asignado';
    const clave  = p.barrio_id || 'sin_barrio';
    if (!grupos[clave]) grupos[clave] = { nombre, pedidos: [] };
    grupos[clave].pedidos.push(p);
  });
  return Object.values(grupos).sort((a, b) => {
    if (a.nombre === 'Sin barrio asignado') return 1;
    if (b.nombre === 'Sin barrio asignado') return -1;
    return a.nombre.localeCompare(b.nombre);
  });
}

// ── Render agrupado por barrio (vista pantalla) ───────────────
function renderEnvios(envios) {
  const contenido = document.getElementById('contenidoEnvios');

  if (!envios.length) {
    const fecha = document.getElementById('filtroFecha').value;
    const msg = fecha
      ? `No hay envíos listos para el ${formatFecha(fecha)}.`
      : 'No hay envíos en estado "Listo para Entregar".';
    contenido.innerHTML = `<div class="empty-state"><p>🚗 ${msg}</p></div>`;
    return;
  }

  contenido.innerHTML = '';
  agruparPorBarrio(envios).forEach(grupo => {
    const div = document.createElement('div');
    div.className = 'grupo-barrio';
    div.innerHTML = `
      <div class="grupo-titulo">
        <span>📍 ${grupo.nombre}</span>
        <span class="grupo-count">${grupo.pedidos.length} pedido${grupo.pedidos.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="cards-grid">
        ${grupo.pedidos.map(p => buildCard(p)).join('')}
      </div>
    `;
    contenido.appendChild(div);
  });
}

// ── Construir card HTML ───────────────────────────────────────
function buildCard(p) {
  const estadoId     = p.id_estado || 3;
  const estadoNombre = p.estados?.nombre || 'Listo para Entregar';
  const pagado       = Boolean(p.pagado);
  const esTrans      = (p.metodo_pago || '').toLowerCase().includes('transfer');
  const totalFmt     = Number(p.total).toLocaleString('es-AR', { minimumFractionDigits: 0 });

  const badgeEstadoClass = `badge-estado-${estadoId}`;
  const badgePagoClass   = esTrans ? 'transferencia' : 'efectivo';
  const badgePagoLabel   = esTrans ? '💳 Transferencia' : '💵 Efectivo';

  const itemsHtml = (p.pedido_detalles || [])
    .map(d => `<div class="card-item-linea">${d.cantidad}× ${d.productos?.nombre || '—'}</div>`)
    .join('');

  const obsHtml = p.observaciones
    ? `<div class="card-obs">💬 ${p.observaciones}</div>`
    : '';

  const fechaHtml = p.fecha_entrega
    ? `<div class="card-dato"><span class="icono">📅</span>${formatFecha(p.fecha_entrega)}</div>`
    : '';

  const opcionesEstado = todosEstados
    .map(e => `<option value="${e.id}" ${e.id === estadoId ? 'selected' : ''}>${e.nombre}</option>`)
    .join('');

  return `
    <div class="pedido-card estado-${estadoId}" id="card-${p.id}">

      <!-- Top bar: número + estado -->
      <div class="card-topbar">
        <span class="card-num">#${String(p.id).padStart(3, '0')}</span>
        <span class="badge-estado ${badgeEstadoClass}">${estadoNombre}</span>
      </div>

      <!-- Cuerpo -->
      <div class="card-body">
        <div class="card-nombre">${p.cliente_nombre || '—'}</div>

        <div class="card-dato"><span class="icono">📍</span>${p.cliente_direccion || '—'}</div>
        <div class="card-dato"><span class="icono">📞</span>${p.cliente_telefono || '—'}</div>
        ${fechaHtml}

        <hr class="card-sep" />

        <div class="card-items">
          ${itemsHtml || '<em style="color:#999;">Sin items</em>'}
        </div>

        ${obsHtml}
      </div>

      <!-- Footer: total + pagado + estado -->
      <div class="card-footer">
        <div class="card-total-wrap">
          <span class="card-total">$${totalFmt}</span>
          <span class="badge-pago ${badgePagoClass}">${badgePagoLabel}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.4rem;">
          <button
            class="btn-pagado ${pagado ? 'pagado' : 'no-pagado'}"
            data-pagado="${pagado}"
            onclick="togglePagado(${p.id}, this)">
            ${pagado ? '✓ Cobrado' : '✗ Sin cobrar'}
          </button>
          <select class="estado-select" onchange="cambiarEstado(${p.id}, this.value, this)">
            ${opcionesEstado}
          </select>
        </div>
      </div>

    </div>
  `;
}

// ── Toggle pagado ─────────────────────────────────────────────
async function togglePagado(pedidoId, btn) {
  const actual     = btn.dataset.pagado === 'true';
  const nuevoPagado = !actual;
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/pedidos/${pedidoId}/pagado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: nuevoPagado })
    });
    if (!res.ok) throw new Error('Error al actualizar');

    btn.dataset.pagado = String(nuevoPagado);
    btn.className      = `btn-pagado ${nuevoPagado ? 'pagado' : 'no-pagado'}`;
    btn.textContent    = nuevoPagado ? '✓ Cobrado' : '✗ Sin cobrar';

    const p = todosEnvios.find(e => e.id === pedidoId);
    if (p) p.pagado = nuevoPagado;

  } catch (e) {
    alert('No se pudo actualizar el estado de pago.');
  } finally {
    btn.disabled = false;
  }
}

// ── Cambiar estado ─────────────────────────────────────────────
async function cambiarEstado(pedidoId, nuevoEstadoId, selectEl) {
  selectEl.disabled = true;
  try {
    const res = await fetch(`${API}/api/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_id: Number(nuevoEstadoId) })
    });
    if (!res.ok) throw new Error('Error al actualizar');

    const card = document.getElementById(`card-${pedidoId}`);
    if (card) {
      // Actualizar clase border
      card.className = `pedido-card estado-${nuevoEstadoId}`;

      // Actualizar badge estado en topbar
      const badge = card.querySelector('.badge-estado');
      const estado = todosEstados.find(e => e.id === Number(nuevoEstadoId));
      if (badge && estado) {
        badge.className = `badge-estado badge-estado-${nuevoEstadoId}`;
        badge.textContent = estado.nombre;
      }
    }

    const p = todosEnvios.find(e => e.id === pedidoId);
    if (p) p.id_estado = Number(nuevoEstadoId);
    actualizarStats(todosEnvios);

  } catch (e) {
    alert('No se pudo actualizar el estado. Intentá de nuevo.');
  } finally {
    selectEl.disabled = false;
  }
}

// ── Vista compacta para impresión ────────────────────────────
function buildPrintRow(p) {
  const num     = String(p.id).padStart(3, '0');
  const items   = (p.pedido_detalles || []).map(d => `${d.cantidad}× ${d.productos?.nombre || '—'}`).join(' · ');
  const total   = Number(p.total).toLocaleString('es-AR', { minimumFractionDigits: 0 });
  const esTrans = (p.metodo_pago || '').toLowerCase().includes('transfer');
  const pago    = esTrans ? 'Trans.' : 'Efect.';
  const cobrado = p.pagado ? '✓ COB' : '☐ COB';
  const cobClass = p.pagado ? 'si' : 'no';
  const obsRow  = p.observaciones
    ? `<div class="pr-obs">⚠️ ${p.observaciones}</div>` : '';

  return `
    <div class="print-row">
      <span class="pr-check">☐</span>
      <span class="pr-num">#${num}</span>
      <span class="pr-cliente">${p.cliente_nombre || '—'}</span>
      <span class="pr-dir">📍 ${p.cliente_direccion || '—'}</span>
      <span class="pr-tel">📞 ${p.cliente_telefono || '—'}</span>
      <span class="pr-total">$${total}</span>
      <span class="pr-pago">${pago}</span>
      <span class="pr-cobrado ${cobClass}">${cobrado}</span>
      <span class="pr-items">${items}</span>
      ${obsRow}
    </div>
  `;
}

function generarVistaImpresion() {
  const fecha  = document.getElementById('filtroFecha').value;
  const grupos = agruparPorBarrio(todosEnvios);

  const thead = `
    <div class="print-thead">
      <span></span>
      <span>#</span>
      <span>Cliente</span>
      <span>Dirección</span>
      <span>Teléfono</span>
      <span>Total</span>
      <span>Pago</span>
      <span>Cobro</span>
    </div>`;

  let html = '';
  grupos.forEach(grupo => {
    html += `
      <div class="print-grupo">
        <div class="print-grupo-titulo">📍 ${grupo.nombre} — ${grupo.pedidos.length} pedido${grupo.pedidos.length !== 1 ? 's' : ''}</div>
        ${thead}
        ${grupo.pedidos.map(p => buildPrintRow(p)).join('')}
      </div>
    `;
  });

  document.getElementById('printContent').innerHTML = html;

  // Actualizar cabecera
  document.getElementById('printFechaHeader').textContent =
    `Fecha de entrega: ${fecha ? formatFecha(fecha) : 'Todos los envíos'}`;
  document.getElementById('printTotalHeader').textContent =
    `${todosEnvios.length} envío${todosEnvios.length !== 1 ? 's' : ''} · ${grupos.length} barrio${grupos.length !== 1 ? 's' : ''}`;
}

// ── Imprimir Hoja de Ruta ──────────────────────────────────────
function imprimirHojaRuta() {
  generarVistaImpresion();
  window.print();
}

// Limpiar la vista de impresión después de cerrar el diálogo
window.addEventListener('afterprint', () => {
  document.getElementById('printContent').innerHTML = '';
});

// ── Utilidades ─────────────────────────────────────────────────
function formatFecha(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr.includes('T') ? fechaStr : fechaStr + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Exponer funciones globales ────────────────────────────────
window.buscarEnvios    = buscarEnvios;
window.limpiarFecha    = limpiarFecha;
window.cambiarEstado   = cambiarEstado;
window.togglePagado    = togglePagado;
window.imprimirHojaRuta = imprimirHojaRuta;
