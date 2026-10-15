// ── Estado reactivo del módulo ────────────────────────────────────────────────
// Se declara fuera de DOMContentLoaded para que marcarListo() también acceda.
let _tareasActivas = [];

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
    const obsPedido = _normObs(pedido.observaciones);
    (pedido.pedido_detalles || []).forEach(det => {
      const nombre = det?.productos?.nombre;
      if (!nombre || nombre === '—') return;

      // Plato personalizado (de un combo): su texto va primero, y si el pedido además tiene
      // observaciones se suman. Ej: "sin sal" + "sin cebolla" → "sin sal · sin cebolla".
      // Así el resumen separa "fideos" de "fideos ⚠ sin sal".
      let obs = obsPedido;
      if (det.personalizado && det.observaciones_plato && det.observaciones_plato.trim() !== '') {
        obs = det.observaciones_plato.trim();
        if (obsPedido !== _OBS_STD) {
          obs = obs + ' · ' + obsPedido;
        }
      }

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
           <span class="resumen-card-obs-icon">⚠</span>${escHtml(obs)}
         </div>`
      : '';
    return `
      <div class="${cardClass}">
        <div class="resumen-card-info">
          <div class="resumen-card-nombre">${escHtml(nombre)}</div>
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

  // ── Helpers ──────────────────────────────────────────────────────────────
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

  // ── 2. Renderizar filas: una por pedido ───────────────────────────────────
  // Nº Pedido · Entrega · Cliente · Platos (botón Detalles) · Observaciones · Acción (Listo).
  // Cada fila lleva data-pedido-id: así confirmarListo y quitarPedidoDeLaTabla siguen apagando
  // el botón y sacando el pedido, igual que antes.
  tbody.innerHTML = '';

  enPrep.forEach(pedido => {
    const idPedido = Number(pedido.id);

    // Fecha de entrega: llega como "AAAA-MM-DD". Se lee con fechas.js (parseFechaLocal): con
    // new Date() se tomaría en hora UTC y en Argentina mostraría el día anterior.
    let fechaEntrega = '—';
    if (pedido.fecha_entrega) {
      fechaEntrega = fechaDDMMAAAA(parseFechaLocal(pedido.fecha_entrega));
    }

    // Botón Detalles: con ⚠ si algún plato del pedido es personalizado, para que el cocinero lo abra.
    // some responde true si AL MENOS UNO cumple: [{ personalizado: false }, { personalizado: true }] → true
    const tienePersonalizado = (pedido.pedido_detalles || []).some(det => det.personalizado);
    let textoDetalles = 'Detalles';
    if (tienePersonalizado) {
      textoDetalles = 'Detalles ⚠';
    }

    // Botón "✓ Listo" del pedido (marca listos TODOS los platos de este cocinero en el pedido,
    // como siempre). La administración solo mira.
    let accion = `<button class="btn-listo" onclick="marcarListo(${idPedido}, this)">✓ Listo para entregar</button>`;
    if (soloLectura) {
      accion = '<span class="solo-lectura">Solo lectura</span>';
    }

    // El cliente y las observaciones los escribe el cliente desde la web: escHtml
    const tr = document.createElement('tr');
    tr.dataset.pedidoId = pedido.id;
    tr.innerHTML = `
      <td><strong>#${idPedido}</strong></td>
      <td>${escHtml(fechaEntrega)}</td>
      <td>${escHtml(pedido.cliente_nombre || 'Sin nombre')}</td>
      <td><button class="btn-detalles" onclick="abrirDetallesPedido(${idPedido})">${textoDetalles}</button></td>
      <td>${escHtml(pedido.observaciones || 'Sin observaciones')}</td>
      <td>${accion}</td>
    `;
    tbody.appendChild(tr);
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

// ── Ventana "Platos del pedido" (botón Detalles) ─────────────────────────────
// Muestra los platos que ya tiene la pantalla en memoria (_tareasActivas): los mismos que ve
// cada cocinero (los suyos sin terminar) o, para la administración, todos. No pide nada al servidor.
window.abrirDetallesPedido = function (pedidoId) {
  // find devuelve el pedido con ese número, o undefined si ya no está (por ejemplo, ya se marcó listo)
  const pedido = _tareasActivas.find(p => Number(p.id) === Number(pedidoId));
  if (!pedido) return;

  // Una fila por plato: código, plato con su ⚠ personalizado y cantidad.
  // Todo lo que viene de la base pasa por escHtml (el texto personalizado lo escribe el cliente).
  let html = '';
  (pedido.pedido_detalles || []).forEach(det => {
    const codigo = det?.productos?.codigo_plato || '—';
    const nombre = det?.productos?.nombre || '—';

    let avisoPersonalizado = '';
    if (det.personalizado && det.observaciones_plato) {
      avisoPersonalizado = `<br><span class="plato-especial">⚠ ${escHtml(det.observaciones_plato)}</span>`;
    }

    html += `
      <tr>
        <td><strong>${escHtml(codigo)}</strong></td>
        <td>${escHtml(nombre)}${avisoPersonalizado}</td>
        <td>x${escHtml(det.cantidad)}</td>
      </tr>`;
  });

  document.getElementById('modalPlatosTitulo').textContent = `Platos del pedido #${Number(pedido.id)}`;
  document.getElementById('modalPlatosBody').innerHTML = html;
  document.getElementById('modalPlatos').style.display = 'block';
};

// Cierra la ventana de platos. Si viene de un clic, solo cuando el clic fue en el fondo oscuro
// (igual que cerrarModalListo); con la ✕, "Cerrar" o Escape se llama sin evento y cierra siempre.
window.cerrarDetallesPedido = function (e) {
  const modal = document.getElementById('modalPlatos');
  if (e && e.target !== modal) return;
  modal.style.display = 'none';
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.cerrarDetallesPedido();
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
