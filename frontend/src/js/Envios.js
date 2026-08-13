// ============================================================
// Envios.js — Gestión de envíos del día agrupados por barrio
// ============================================================

const API = 'http://localhost:3000';

let todosEnvios = [];
let todosEstados = [];

// ════════════════════════════════════════════════════════════════
// MÓDULO: Hoja de Ruta Optimizada
// Algoritmo Vecino Más Cercano + Fórmula de Haversine
// Sin dependencias externas. 100% cliente.
// ════════════════════════════════════════════════════════════════

// ── Punto de origen: local Fast Good, Ituzaingó 431 ──────────
const ORIGEN_FG = {
  lat: -31.42491,
  lng: -64.18567,
  nombre: 'Local Fast Good — Ituzaingó 431'
};

// ── Diccionario de coordenadas aproximadas por barrio ─────────
// Se usa cuando el pedido no tiene GPS exacto cargado.
const BARRIOS_CBA = {
  'Nueva Córdoba':               { lat: -31.4217, lng: -64.1842 },
  'Centro':                      { lat: -31.4131, lng: -64.1813 },
  'General Paz':                 { lat: -31.4050, lng: -64.1997 },
  'Alberdi':                     { lat: -31.4152, lng: -64.2080 },
  'Alto Alberdi':                { lat: -31.4261, lng: -64.2131 },
  'Alta Córdoba':                { lat: -31.3944, lng: -64.1889 },
  'Cofico':                      { lat: -31.4001, lng: -64.1897 },
  'Güemes':                      { lat: -31.4269, lng: -64.1966 },
  'Pueyrredón':                  { lat: -31.4072, lng: -64.1843 },
  'Observatorio':                { lat: -31.4228, lng: -64.1931 },
  'Parque República':            { lat: -31.4011, lng: -64.1783 },
  'Independencia':               { lat: -31.4167, lng: -64.1869 },
  'La France':                   { lat: -31.4050, lng: -64.1656 },
  'San Martín':                  { lat: -31.4167, lng: -64.1667 },
  'Yofre':                       { lat: -31.4272, lng: -64.1547 },
  'Yofre Norte':                 { lat: -31.4197, lng: -64.1547 },
  'Yofre Sur':                   { lat: -31.4347, lng: -64.1547 },
  'San Vicente':                 { lat: -31.4378, lng: -64.1530 },
  'Bajo Grande':                 { lat: -31.4564, lng: -64.1547 },
  'Santa Isabel':                { lat: -31.4506, lng: -64.1881 },
  'Villa El Libertador':         { lat: -31.4733, lng: -64.1897 },
  'Buen Pastor':                 { lat: -31.4350, lng: -64.1950 },
  'Talleres':                    { lat: -31.4072, lng: -64.2064 },
  'Villa Páez':                  { lat: -31.4261, lng: -64.2211 },
  'Bimaco':                      { lat: -31.4000, lng: -64.1990 },
  'Palermo':                     { lat: -31.3878, lng: -64.1881 },
  'Maipú':                       { lat: -31.3736, lng: -64.1897 },
  'Juniors':                     { lat: -31.3944, lng: -64.2131 },
  'Rogelio Martínez':            { lat: -31.3706, lng: -64.1733 },
  'Barrio Jardín':               { lat: -31.3789, lng: -64.1856 },
  'Jardín':                      { lat: -31.3789, lng: -64.1856 },
  'Alta Gracia':                 { lat: -31.3789, lng: -64.1856 },
  'Cerro de las Rosas':          { lat: -31.3675, lng: -64.2014 },
  'Villa Belgrano':              { lat: -31.3561, lng: -64.2153 },
  'Colinas de Vélez Sársfield':  { lat: -31.3833, lng: -64.2153 },
  'Los Boulevares':              { lat: -31.3406, lng: -64.2242 },
  'Argüello':                    { lat: -31.3319, lng: -64.2314 },
  'Villa Rivera Indarte':        { lat: -31.3519, lng: -64.2394 },
  'Alta Córdoba Norte':          { lat: -31.3850, lng: -64.1889 },
  'Margarita Weiss':             { lat: -31.4100, lng: -64.2100 },
  'Villa Allende':               { lat: -31.2972, lng: -64.2942 },
  'Mendiolaza':                  { lat: -31.2806, lng: -64.3117 },
  'Unquillo':                    { lat: -31.2361, lng: -64.3169 },
  'La Calera':                   { lat: -31.3456, lng: -64.3369 },
};

// ── Haversine: distancia en km entre dos puntos GPS ───────────
function haversine(lat1, lng1, lat2, lng2) {
  const R     = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Resolver coordenadas de un pedido ─────────────────────────
// Prioridad 1: GPS exacto en el objeto (campos lat / lng)
// Prioridad 2: Diccionario de barrios (BARRIOS_CBA) con búsqueda flexible
function getCoords(pedido) {
  if (pedido.lat != null && pedido.lng != null) {
    return { lat: Number(pedido.lat), lng: Number(pedido.lng) };
  }
  const barrio = pedido.barrios?.nombre;
  if (!barrio) return null;
  const norm = s =>
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[̀-ͯ]/g, '')
     .trim();
  const key = norm(barrio);
  const match = Object.entries(BARRIOS_CBA).find(([k]) => {
    const nk = norm(k);
    return nk === key || nk.includes(key) || key.includes(nk);
  });
  return match ? match[1] : null;
}

// ── Algoritmo Vecino Más Cercano ──────────────────────────────
// Ordena `pedidos` comenzando desde ORIGEN_FG.
// Pedidos sin coordenadas van al final (no se pueden ubicar).
function nearestNeighbor(pedidos) {
  const conCoords  = pedidos.filter(p => getCoords(p) !== null);
  const sinCoords  = pedidos.filter(p => getCoords(p) === null);
  const ruta       = [];
  const pendientes = [...conCoords];
  let posActual    = ORIGEN_FG;

  while (pendientes.length > 0) {
    let minDist = Infinity, minIdx = 0;
    pendientes.forEach((p, i) => {
      const c = getCoords(p);
      const d = haversine(posActual.lat, posActual.lng, c.lat, c.lng);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    const sig = pendientes.splice(minIdx, 1)[0];
    const coords = getCoords(sig);
    ruta.push({ pedido: sig, distancia: minDist, coords });
    posActual = coords;
  }

  sinCoords.forEach(p => ruta.push({ pedido: p, distancia: null, coords: null }));
  return ruta;
}

// ── Render del Timeline de Ruta Optimizada ────────────────────
function renderHojaRuta(envios) {
  const body = document.getElementById('hojaRutaBody');
  if (!body) return;

  if (!envios.length) {
    body.innerHTML = '<p class="ruta-sin-datos">Buscá envíos para calcular la ruta optimizada.</p>';
    return;
  }

  const ruta      = nearestNeighbor(envios);
  const totalKm   = ruta.reduce((s, r) => s + (r.distancia || 0), 0);
  const minEst    = Math.ceil(totalKm / 30 * 60); // ~30 km/h ciudad

  // Nodo origen
  const origenNode = `
    <div class="tl-stop">
      <div class="tl-dot tl-dot-origen">🏠</div>
      <div class="tl-card tl-origen">
        <div class="tl-label">Punto de partida</div>
        <div class="tl-nombre">${ORIGEN_FG.nombre}</div>
        <div class="tl-info"><span>📍 Ituzaingó 431, Nueva Córdoba</span></div>
      </div>
    </div>`;

  // Nodos de paradas
  const paradasHTML = ruta.map(({ pedido: p, distancia, coords }, idx) => {
    const num    = String(p.id).padStart(3, '0');
    const barrio = p.barrios?.nombre || 'Sin barrio';
    const dir    = p.cliente_direccion || '—';
    const tel    = p.cliente_telefono  || '—';

    // Origen del link de Maps: último punto con coordenadas conocidas
    let origCoords = ORIGEN_FG;
    for (let i = idx - 1; i >= 0; i--) {
      if (ruta[i].coords) { origCoords = ruta[i].coords; break; }
    }

    const mapsUrl = coords
      ? `https://www.google.com/maps/dir/?api=1&origin=${origCoords.lat},${origCoords.lng}&destination=${coords.lat},${coords.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir + ', Córdoba, Argentina')}`;

    const distHtml = distancia !== null
      ? `<div class="tl-dist">📏 ~${distancia.toFixed(1)} km desde parada anterior</div>`
      : `<div class="tl-dist warn">⚠️ Sin coordenadas — dirección estimada</div>`;

    const dotClass  = coords ? 'tl-dot-parada' : 'tl-dot-sincrd';
    const cardClass = coords ? ''               : ' tl-sincrd';

    return `
      <div class="tl-stop">
        <div class="tl-dot ${dotClass}">${idx + 1}</div>
        <div class="tl-card${cardClass}">
          <div class="tl-label">Parada ${idx + 1} · Pedido #${num}</div>
          <div class="tl-nombre">${barrio} — ${p.cliente_nombre || '—'}</div>
          <div class="tl-info">
            <span>📍 ${dir}</span>
            <span>📞 ${tel}</span>
          </div>
          ${distHtml}
          <a class="btn-maps" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
            🧭 Iniciar navegación
          </a>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="ruta-stats">
      <span>📦 ${ruta.length} entrega${ruta.length !== 1 ? 's' : ''}</span>
      <span>📏 ~${totalKm.toFixed(1)} km estimados</span>
      <span>🕐 ~${minEst} min en ciudad</span>
    </div>
    <div class="timeline">
      ${origenNode}
      ${paradasHTML}
    </div>`;
}

// ── Toggle visibilidad del panel ──────────────────────────────
function toggleHojaRuta() {
  const body = document.getElementById('hojaRutaBody');
  const btn  = document.getElementById('btnToggleRuta');
  if (!body) return;
  const visible = body.classList.toggle('visible');
  if (btn) btn.textContent = visible ? '▲ Ocultar' : '▼ Ver ruta';
}

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
    renderHojaRuta(todosEnvios);
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
window.buscarEnvios     = buscarEnvios;
window.limpiarFecha     = limpiarFecha;
window.cambiarEstado    = cambiarEstado;
window.togglePagado     = togglePagado;
window.imprimirHojaRuta = imprimirHojaRuta;
window.toggleHojaRuta   = toggleHojaRuta;
