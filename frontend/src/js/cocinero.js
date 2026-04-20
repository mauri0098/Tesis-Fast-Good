document.addEventListener('DOMContentLoaded', async () => {

  const tbody          = document.getElementById('tablaTareas');
  const contadorBadge  = document.getElementById('contador-badge');

  // ── Recetas del localStorage (cargadas por generarReceta.js) ──────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatFecha(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function setVacio(msg) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${msg}</td></tr>`;
    contadorBadge.textContent = '0';
  }

  // ── 1. Traer todos los pedidos ────────────────────────────────────────────
  let pedidos;
  try {
    const res = await fetch('/api/pedidos');
    pedidos = await res.json();
  } catch {
    setVacio('Error al cargar pedidos. Verificá que el servidor esté corriendo.');
    return;
  }

  // ── 2. Filtrar solo "En preparación" ─────────────────────────────────────
  const enPrep = pedidos.filter(p => p.id_estado === 2);

  if (enPrep.length === 0) {
    setVacio('No hay pedidos en preparación en este momento.');
    return;
  }

  contadorBadge.textContent = enPrep.length;

  // ── 3. Para cada pedido, traer sus cocineros asignados ───────────────────
  const pedidosConCocineros = await Promise.all(
    enPrep.map(async (p) => {
      try {
        const res = await fetch(`/api/pedidos/${p.id}/cocineros`);
        const cocineros = res.ok ? await res.json() : [];
        return { ...p, cocineros };
      } catch {
        return { ...p, cocineros: [] };
      }
    })
  );

  // ── 4. Renderizar filas ───────────────────────────────────────────────────
  tbody.innerHTML = '';

  pedidosConCocineros.forEach(pedido => {
    const detalles      = pedido.pedido_detalles || [];
    const cocineroNames = pedido.cocineros.length
      ? pedido.cocineros.map(c => c.nombre).join(', ')
      : '<span style="color:#aaa">Sin asignar</span>';
    const fecha = formatFecha(pedido.fecha_pedido);

    // Si el pedido no tiene productos, igual mostramos una fila
    const filas = detalles.length > 0 ? detalles : [null];

    filas.forEach(det => {
      const nombrePlato = det?.productos?.nombre || '—';
      const cantidad    = det ? `x${det.cantidad}` : '';

      const tr = document.createElement('tr');
      tr.dataset.pedidoId = pedido.id;
      tr.innerHTML = `
        <td><strong>#${pedido.id}</strong></td>
        <td>${fecha}</td>
        <td>
          <span class="plato-nombre">${nombrePlato}</span>
          <br><span class="plato-cant">${cantidad}</span>
        </td>
        <td>${cocineroNames}</td>
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
    const filas = document.querySelectorAll(`tr[data-pedido-id="${pedidoId}"]`);
    filas.forEach(f => f.remove());

    // Actualizar badge contador
    const badge = document.getElementById('contador-badge');
    const actual = parseInt(badge.textContent) - 1;
    badge.textContent = actual;

    if (actual === 0) {
      const tbody = document.getElementById('tablaTareas');
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No hay pedidos en preparación en este momento.</td></tr>';
    }

  } catch {
    btnEl.disabled = false;
    btnEl.textContent = '✓ Listo para entregar';
    alert('Error al actualizar el estado. Intentá de nuevo.');
  }
};
