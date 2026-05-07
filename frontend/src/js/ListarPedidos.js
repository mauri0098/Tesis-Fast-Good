let todosPedidos = []; // guarda todos los pedidos para poder filtrarlos

document.addEventListener('DOMContentLoaded', () => {
  fetchPedidos();
  iniciarFiltro();
});

async function fetchEstados() {
  const response = await fetch('http://localhost:3000/api/estados');
  const data = await response.json();
  return data;
}

const coloresEstado = {
  1: { bg: '#e2e3e5', color: '#383d41' },
  2: { bg: '#fff3cd', color: '#856404' },
  3: { bg: '#d4edda', color: '#155724' },
  4: { bg: '#28a745', color: '#ffffff' },
  5: { bg: '#f8d7da', color: '#721c24' }
};

function aplicarColorEstado(select, estadoId) {
  const c = coloresEstado[estadoId] || coloresEstado[1];
  select.style.backgroundColor = c.bg;
  select.style.color = c.color;
}

async function fetchPedidos() {
  const tbody = document.getElementById('pedidosBody');

  try {
    const estadoOptions = await fetchEstados();
    const response = await fetch('http://localhost:3000/api/pedidos');
    const data = await response.json();

    todosPedidos = data; // guardamos para que el filtro los pueda usar
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="loading-text">No hay pedidos registrados</td></tr>';
      return;
    }

    data.forEach(pedido => {
      const tr = document.createElement('tr');

      // 1. N° Pedido
      const idFormatted = '#' + String(pedido.id).padStart(3, '0');

      // 2. Fecha
      const fecha = new Date(pedido.fecha_entrega || pedido.fecha_pedido).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      // 3. Cliente
      const cliente = pedido.cliente_nombre || pedido.usuarios?.nombre || 'Anónimo';

      // 4. Dirección
      const direccion = pedido.cliente_direccion || '-';

      // 5. & 6. Contacto
      const telefono = pedido.cliente_telefono || '-';
      const email = pedido.cliente_email || '-';

      // 7. Viandas → botón que abre modal con el detalle
      const viandasHtml = `<button class="btn-detalles" onclick="abrirModalDetalles(${pedido.id})">Detalles</button>`;

      // 8. Costo
      const costo = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(pedido.total);

      // 10. Método Pago
      const metodo = pedido.metodo_pago || 'Efectivo';
      const isPaid = pedido.pagado;
      const pagoHtml = `
        <div class="pago-info">
          <span class="metodo-tag">${metodo}</span>
          <span class="${isPaid ? 'status-paid' : 'status-pending'}">
            ${isPaid ? 'PAGADO' : 'PENDIENTE'}
          </span>
        </div>
      `;

      // Armar fila — las celdas con datos del usuario quedan vacías y se llenan abajo con textContent
      tr.innerHTML = `
        <td style="font-weight:bold">${idFormatted}</td>
        <td>${fecha}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td>${viandasHtml}</td>
        <td style="font-weight:700">${costo}</td>
        <td></td>
        <td>${pagoHtml}</td>
        <td><button class="btn-eliminar" onclick="eliminarPedido(${pedido.id}, this)">Eliminar</button></td>
      `;

      // Celdas con datos ingresados por el usuario público — se usan textContent para evitar XSS
      const strong = document.createElement('strong');
      strong.textContent = cliente;       // columna 3: nombre del cliente
      tr.cells[2].appendChild(strong);

      tr.cells[3].textContent = direccion; // columna 4: dirección
      tr.cells[4].textContent = telefono;  // columna 5: teléfono
      tr.cells[5].textContent = email;     // columna 6: email

      // 9. Select Estado
      const estadoActualId = pedido.id_estado || 1;
      const selectEstado = document.createElement('select');
      selectEstado.className = 'select-estado';
      selectEstado.dataset.estadoActual = estadoActualId;

      estadoOptions.forEach(op => {
        const option = document.createElement('option');
        option.value = op.id;
        option.textContent = op.nombre;
        if (op.id === estadoActualId) option.selected = true;
        selectEstado.appendChild(option);
      });

      aplicarColorEstado(selectEstado, estadoActualId);

      selectEstado.addEventListener('change', async () => {
        const nuevoId = parseInt(selectEstado.value);
        const anteriorId = parseInt(selectEstado.dataset.estadoActual);

        try {
          const res = await fetch(`http://localhost:3000/api/pedidos/${pedido.id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado_id: nuevoId })
          });

          if (!res.ok) throw new Error('Error al actualizar');

          selectEstado.dataset.estadoActual = nuevoId;
          aplicarColorEstado(selectEstado, nuevoId);
        } catch (err) {
          alert('No se pudo actualizar el estado. Intentá de nuevo.');
          selectEstado.value = anteriorId;
          aplicarColorEstado(selectEstado, anteriorId);
        }
      });

      tr.cells[8].appendChild(selectEstado);
      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="11" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// ── MODAL DETALLES ────────────────────────────────────────────
const formatPrecio = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0
}).format(n);

function abrirModalDetalles(pedidoId) {
  const pedido = todosPedidos.find(p => p.id === pedidoId);
  if (!pedido) return;

  document.getElementById('modalTitulo').textContent =
    `Detalle del Pedido #${String(pedidoId).padStart(3, '0')}`;

  const tbody = document.getElementById('modalDetallesBody');
  tbody.innerHTML = '';

  const detalles = pedido.pedido_detalles || [];

  if (detalles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:1rem;">Sin detalles</td></tr>';
  } else {
    detalles.forEach(d => {
      const tr = document.createElement('tr');
      const precio = d.precio_unitario != null ? formatPrecio(d.precio_unitario) : '-';
      tr.innerHTML = `
        <td class="col-cant">${d.cantidad}</td>
        <td>${d.productos?.nombre || 'Producto'}</td>
        <td class="col-precio">${precio}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('modalDetalles').classList.add('visible');
}

function cerrarModalDetalles(e) {
  if (!e || e.target === document.getElementById('modalDetalles')) {
    document.getElementById('modalDetalles').classList.remove('visible');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modalDetalles')?.classList.remove('visible');
});
// ─────────────────────────────────────────────────────────────

function iniciarFiltro() {
  const FiltradodeProductos = document.getElementById('CampoBusqueda');
  const FechaDesde = document.getElementById('FechaDesde');
  const FechaHasta = document.getElementById('FechaHasta');
  if (!FiltradodeProductos) return;

  FiltradodeProductos.addEventListener('input', () => {
    const TextoDeBusqueda = FiltradodeProductos.value.toLowerCase();

    // filtra el array de pedidos por nombre de cliente o por número de pedido
    const ProductosFiltrados = todosPedidos.filter(pedido =>
      pedido.cliente_nombre.toLowerCase().includes(TextoDeBusqueda) ||
      pedido.id.toString().includes(TextoDeBusqueda)
    );

    // muestra u oculta cada fila según si pasó el filtro
    const tbody = document.getElementById('pedidosBody');
    const filas = Array.from(tbody.querySelectorAll('tr:not(.no-results-row)'));

    const noResultRow = tbody.querySelector('.no-results-row');
    if (noResultRow) noResultRow.remove();

    const idsFiltrados = ProductosFiltrados.map(p => p.id);
    let visibles = 0;

    filas.forEach(fila => {
      const celdaId = fila.cells?.[0];
      if (!celdaId) return;
      // el id en la celda está como "#001", lo convertimos a número
      const idFila = parseInt(celdaId.textContent.replace('#', ''));
      if (idsFiltrados.includes(idFila)) {
        fila.style.display = '';
        visibles++;
      } else {
        fila.style.display = 'none';
      }
    });

    if (visibles === 0 && TextoDeBusqueda !== '') {
      const tr = document.createElement('tr');
      tr.className = 'no-results-row';
      tr.innerHTML = `<td colspan="11" class="loading-text">No se encontraron pedidos con ese nombre</td>`;
      tbody.appendChild(tr);
    }
  });

}

// ── ELIMINAR PEDIDO ───────────────────────────────────────────
async function eliminarPedido(pedidoId, btn) {
  const idFormatted = '#' + String(pedidoId).padStart(3, '0');
  const confirmar = confirm(`¿Estás seguro de que querés eliminar el Pedido ${idFormatted}?\nEsta acción no se puede deshacer.`);
  if (!confirmar) return;

  btn.disabled = true;
  btn.textContent = 'Eliminando...';

  try {
    const res = await fetch(`http://localhost:3000/api/pedidos/${pedidoId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al eliminar');
    }

    todosPedidos = todosPedidos.filter(p => p.id !== pedidoId);
    btn.closest('tr').remove();
  } catch (err) {
    alert('No se pudo eliminar el pedido. Intentá de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Eliminar';
  }
}
// ─────────────────────────────────────────────────────────────


