// ============================================================
// MovimientosStock.js — Registro de entradas y salidas de stock
// ============================================================

const API = 'http://localhost:3000';

let todosMovimientos = [];
let tipoActual = 'entrada'; // 'entrada' | 'salida'

// ── Inicialización ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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
      opt.dataset.unidad = i.unidad_medida || '';
      opt.textContent = `${i.nombre} (Stock: ${i.stock_actual} ${i.unidad_medida})`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error al cargar insumos:', e);
  }
}

// ── Sincronizar Unidad de Medida con el insumo seleccionado ───
// La unidad base del insumo se define en Alta de Insumos ("Gestión de Stock").
// Acá se permite elegir entre las unidades de la MISMA familia (ej: g/kg,
// ml/lts) para cargar cómodo según cómo venga el insumo (de proveedores en
// entradas, o para descartes/consumos manuales en salidas), pero nunca una
// unidad de otra familia (no se puede cargar "litros" de harina).
// Misma lógica para entrada y salida: el backend (POST /api/movimientos-stock,
// función convertirACantidadBase) convierte a la unidad base del insumo antes
// de aplicar el movimiento, sin importar el tipo.
function actualizarUnidadSegunInsumo() {
  const select = document.getElementById('selectInsumo');
  const opt    = select.selectedOptions[0];
  const unidadInsumo = opt ? (opt.dataset.unidad || '').toLowerCase().trim() : '';
  const selectUnidad = document.getElementById('inputUnidad');

  // Limpiamos las opciones actuales para reescribirlas según la familia de medida
  selectUnidad.innerHTML = '';

  if (!unidadInsumo) {
    selectUnidad.innerHTML = '<option value="">-</option>';
    selectUnidad.disabled = true;
    return;
  }

  selectUnidad.disabled = false;

  if (unidadInsumo === 'g' || unidadInsumo === 'kg') {
    selectUnidad.innerHTML = `
      <option value="g">g</option>
      <option value="kg">kg</option>
    `;
  } else if (unidadInsumo === 'ml' || unidadInsumo === 'lts' || unidadInsumo === 'litros') {
    selectUnidad.innerHTML = `
      <option value="ml">ml</option>
      <option value="lts">lts</option>
    `;
  } else if (unidadInsumo === 'u' || unidadInsumo === 'unidades') {
    selectUnidad.innerHTML = `<option value="u">u</option>`;
  } else {
    selectUnidad.innerHTML = `<option value="${unidadInsumo}">${unidadInsumo}</option>`;
  }

  // Mantenemos seleccionada la unidad base por defecto
  const unidadNormalizada = unidadInsumo === 'litros' ? 'lts' : (unidadInsumo === 'unidades' ? 'u' : unidadInsumo);
  if ([...selectUnidad.options].some(o => o.value === unidadNormalizada)) {
    selectUnidad.value = unidadNormalizada;
  }
}

// ── Clasificar movimiento por concepto de negocio ─────────────
// La BD solo conoce 'entrada' / 'salida'. Esta función traduce
// esos valores a los términos visuales Compra / Venta / Descarte
// leyendo el campo `motivo` para distinguir las salidas.
function clasificarMovimiento(m) {
  if (m.tipo === 'entrada') {
    return { filaClass: 'fila-entrada', badgeClass: 'badge-compra', icono: '▲', label: 'Compra' };
  }

  // Lista blanca de señales inequívocas de consumo productivo automatizado.
  // Solo si el motivo contiene una de estas, la salida es "Venta".
  // Cualquier otra cosa (texto libre, errores tipográficos, campo vacío) → "Descarte".
  const PALABRAS_VENTA = ['consumo', 'produccion', 'pedido', '#'];
  const motivo  = (m.motivo || '').toLowerCase();
  const esVenta = PALABRAS_VENTA.some(kw => motivo.includes(kw));

  if (esVenta) {
    return { filaClass: 'fila-venta',    badgeClass: 'badge-venta',    icono: '💰', label: 'Venta'    };
  }
  return   { filaClass: 'fila-descarte', badgeClass: 'badge-descarte', icono: '✖', label: 'Descarte' };
}

// ── Render de tabla ───────────────────────────────────────────
function renderTabla(movimientos) {
  const tbody = document.getElementById('tablaBody');

  if (!movimientos.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No hay movimientos registrados todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  movimientos.forEach(m => {
    const { filaClass, badgeClass, icono, label } = clasificarMovimiento(m);

    const tr = document.createElement('tr');
    tr.className      = filaClass;
    tr.dataset.tipo   = m.tipo;
    tr.dataset.insumo = (m.insumos?.nombre || '').toLowerCase();
    tr.dataset.fecha  = m.fecha || '';

    const fecha = m.fecha
      ? new Date(m.fecha).toLocaleString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : '-';

    const badgeLabel = `${icono} ${label}`;

    tr.innerHTML = `
      <td>${fecha}</td>
      <td><strong>${m.insumos?.nombre || '-'}</strong></td>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
      <td>${Number(m.cantidad).toLocaleString('es-AR')}</td>
      <td>${m.unidad || m.insumos?.unidad_medida || '-'}</td>
      <td style="color:var(--color-muted); font-size:0.83rem;">${m.motivo || '—'}</td>
      <td><button class="btn-eliminar" onclick="eliminarMovimiento(${m.id}, '${m.insumos?.nombre || ''}', '${m.tipo}')">✕ Eliminar</button></td>
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

  // Campo de costo oculto en la interfaz (se mantiene la lógica/payload interna)
  document.getElementById('grupoCosto').style.display        = 'none';
  document.getElementById('inputCostoUnit').value            = '';
  document.getElementById('costoTotalDisplay').style.display = 'none';

  const btn = document.getElementById('btnConfirmar');
  btn.textContent = esEntrada ? 'Confirmar Entrada' : 'Confirmar Salida';
  btn.className   = `btn-confirmar ${tipo}`;

  document.getElementById('modalError').classList.remove('visible');
  document.getElementById('inputCantidad').value = '';

  // Actualiza y bloquea/desbloquea el selector de unidades según corresponda
  actualizarUnidadSegunInsumo();
  document.getElementById('inputMotivo').value   = '';
  setFechaActual();

  document.getElementById('modalMovimiento').classList.add('visible');
}

function actualizarCostoTotal() {
  const cantidad = parseFloat(document.getElementById('inputCantidad').value) || 0;
  const costo    = parseFloat(document.getElementById('inputCostoUnit').value) || 0;
  const display  = document.getElementById('costoTotalDisplay');
  if (costo > 0 && cantidad > 0) {
    display.textContent   = `Costo total: $${(cantidad * costo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    display.style.display = 'block';
  } else {
    display.style.display = 'none';
  }
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
  const unidad    = document.getElementById('inputUnidad').value;
  const motivo    = document.getElementById('inputMotivo').value.trim();
  const fecha     = document.getElementById('inputFecha').value;
  const errorEl   = document.getElementById('modalError');

  errorEl.classList.remove('visible');

  if (!id_insumo) { mostrarError('Seleccioná un insumo.'); return; }
  if (!cantidad || Number(cantidad) <= 0) { mostrarError('Ingresá una cantidad válida mayor a 0.'); return; }

  const btn = document.getElementById('btnConfirmar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  const costoUnit = tipoActual === 'entrada'
    ? parseFloat(document.getElementById('inputCostoUnit').value) || null
    : null;

  try {
    const res = await fetch(`${API}/api/movimientos-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_insumo:     Number(id_insumo),
        tipo:          tipoActual,
        cantidad:      Number(cantidad),
        unidad:        unidad,
        motivo:        motivo || null,
        fecha:         fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        costo_unitario: costoUnit
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

// ── Eliminar movimiento ───────────────────────────────────────
async function eliminarMovimiento(id, nombreInsumo, tipo) {
  const tipoLabel = tipo === 'entrada' ? 'entrada' : 'salida';
  const confirmar = confirm(
    `¿Eliminar este registro de ${tipoLabel} de "${nombreInsumo}"?\n\nEsto revertirá el efecto sobre el stock del insumo.`
  );
  if (!confirmar) return;

  try {
    const res = await fetch(`${API}/api/movimientos-stock/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el movimiento.');
      return;
    }

    await cargarInsumos();
    await cargarMovimientos();
  } catch (e) {
    alert('No se pudo conectar con el servidor.');
  }
}
