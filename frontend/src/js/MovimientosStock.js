// ============================================================
// MovimientosStock.js — Registro de entradas y salidas de stock
// ============================================================

const API = 'http://localhost:3000';

let todosMovimientos = [];
let tipoActual = 'entrada'; // 'entrada' | 'salida'

// ── Inicialización ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Fecha/hora actual en el input del modal
  setFechaActual();
  cargarInsumos();
  cargarMovimientos();
});

function setFechaActual() {
  const ahora = new Date();
  // Formato requerido por datetime-local: YYYY-MM-DDTHH:MM
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  document.getElementById('inputFecha').value = local;
}

// ── Carga de datos ────────────────────────────────────────────
async function cargarMovimientos() {
  const tbody = document.getElementById('tablaBody');
  try {
    const res = await fetch(`${API}/api/movimientos-stock`);
    if (!res.ok) throw new Error('Error al obtener movimientos');
    todosMovimientos = await res.json();
    renderTabla(todosMovimientos);
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="color:#d32f2f;">Error al conectar con el servidor</td></tr>`;
  }
}

async function cargarInsumos() {
  try {
    const res = await fetch(`${API}/api/insumos`);
    if (!res.ok) return;
    const insumos = await res.json();
    const select = document.getElementById('selectInsumo');
    select.innerHTML = '<option value="">Seleccioná un insumo...</option>';
    insumos.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.nombre} (Stock: ${i.stock_actual} ${i.unidad_medida})`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error al cargar insumos:', e);
  }
}

// ── Render de tabla ───────────────────────────────────────────
function renderTabla(movimientos) {
  const tbody = document.getElementById('tablaBody');

  if (!movimientos.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No hay movimientos registrados todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  movimientos.forEach(m => {
    const tr = document.createElement('tr');
    tr.className = m.tipo === 'entrada' ? 'fila-entrada' : 'fila-salida';
    tr.dataset.tipo   = m.tipo;
    tr.dataset.insumo = (m.insumos?.nombre || '').toLowerCase();
    tr.dataset.fecha  = m.fecha || '';

    const fecha = m.fecha
      ? new Date(m.fecha).toLocaleString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : '-';

    const badgeClass = m.tipo === 'entrada' ? 'badge-entrada' : 'badge-salida';
    const badgeLabel = m.tipo === 'entrada' ? '▲ Entrada' : '▼ Salida';

    tr.innerHTML = `
      <td>${fecha}</td>
      <td><strong>${m.insumos?.nombre || '-'}</strong></td>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
      <td>${Number(m.cantidad).toLocaleString('es-AR')}</td>
      <td>${m.insumos?.unidad_medida || '-'}</td>
      <td style="color:var(--color-muted); font-size:0.83rem;">${m.motivo || '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Filtros ───────────────────────────────────────────────────
function aplicarFiltros() {
  const textoInsumo = document.getElementById('filtroInsumo').value.toLowerCase();
  const tipo        = document.getElementById('filtroTipo').value;
  const desde       = document.getElementById('filtroDesde').value;
  const hasta       = document.getElementById('filtroHasta').value;

  const filtrados = todosMovimientos.filter(m => {
    const nombreOk = !textoInsumo || (m.insumos?.nombre || '').toLowerCase().includes(textoInsumo);
    const tipoOk   = !tipo || m.tipo === tipo;
    const fechaMov = m.fecha ? new Date(m.fecha) : null;
    const desdeOk  = !desde || (fechaMov && fechaMov >= new Date(desde));
    const hastaOk  = !hasta || (fechaMov && fechaMov <= new Date(hasta + 'T23:59:59'));
    return nombreOk && tipoOk && desdeOk && hastaOk;
  });

  renderTabla(filtrados);
}

// ── Modal ─────────────────────────────────────────────────────
function abrirModal(tipo) {
  tipoActual = tipo;
  const esEntrada = tipo === 'entrada';

  document.getElementById('modalTitulo').textContent  = esEntrada ? 'Registrar Entrada' : 'Registrar Salida';
  document.getElementById('notaSalida').style.display = esEntrada ? 'none' : 'block';

  const btn = document.getElementById('btnConfirmar');
  btn.textContent = esEntrada ? 'Confirmar Entrada' : 'Confirmar Salida';
  btn.className   = `btn-confirmar ${tipo}`;

  document.getElementById('modalError').classList.remove('visible');
  document.getElementById('inputCantidad').value = '';
  document.getElementById('inputMotivo').value   = '';
  setFechaActual();

  document.getElementById('modalMovimiento').classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modalMovimiento').classList.remove('visible');
}

function cerrarModalSiOverlay(e) {
  if (e.target === document.getElementById('modalMovimiento')) cerrarModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});

// ── Guardar movimiento ────────────────────────────────────────
async function guardarMovimiento() {
  const id_insumo = document.getElementById('selectInsumo').value;
  const cantidad  = document.getElementById('inputCantidad').value;
  const motivo    = document.getElementById('inputMotivo').value.trim();
  const fecha     = document.getElementById('inputFecha').value;
  const errorEl   = document.getElementById('modalError');

  errorEl.classList.remove('visible');

  if (!id_insumo) { mostrarError('Seleccioná un insumo.'); return; }
  if (!cantidad || Number(cantidad) <= 0) { mostrarError('Ingresá una cantidad válida mayor a 0.'); return; }

  const btn = document.getElementById('btnConfirmar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const res = await fetch(`${API}/api/movimientos-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_insumo: Number(id_insumo),
        tipo: tipoActual,
        cantidad: Number(cantidad),
        motivo: motivo || null,
        fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString()
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarError(data.error || 'Error al guardar el movimiento.');
      return;
    }

    cerrarModal();
    // Refrescar insumos (para que el dropdown tenga stock actualizado)
    await cargarInsumos();
    await cargarMovimientos();

  } catch (e) {
    mostrarError('No se pudo conectar con el servidor.');
  } finally {
    btn.disabled    = false;
    btn.textContent = tipoActual === 'entrada' ? 'Confirmar Entrada' : 'Confirmar Salida';
  }
}

function mostrarError(msg) {
  const el = document.getElementById('modalError');
  el.textContent = msg;
  el.classList.add('visible');
}
