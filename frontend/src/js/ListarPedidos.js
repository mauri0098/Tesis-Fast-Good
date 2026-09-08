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

// Formatea 'YYYY-MM-DD' (fecha_entrega, sin hora) o un timestamp ISO completo
// (fecha_pedido) usando componentes de fecha locales, para que una columna
// `date` sin hora no se corra un día por husos horarios al parsear con `new Date(string)`.
function formatFechaLocal(fechaStr) {
  if (!fechaStr) return '-';
  const [anio, mes, dia] = fechaStr.split('T')[0].split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
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
      tbody.innerHTML = '<tr><td colspan="12" class="loading-text">No hay pedidos registrados</td></tr>';
      return;
    }

    data.forEach(pedido => {
      const tr = document.createElement('tr');

      // 1. N° Pedido
      const idFormatted = '#' + String(pedido.id).padStart(3, '0');

      // 2. Fecha de Pedido (fecha desde) y 3. Fecha de Entrega (fecha hasta)
      const fechaPedido  = formatFechaLocal(pedido.fecha_pedido);
      const fechaEntrega = formatFechaLocal(pedido.fecha_entrega);

      // 4. Cliente
      const cliente = pedido.cliente_nombre || pedido.usuarios?.nombre || 'Anónimo';

      // 5. Dirección
      const direccion = pedido.cliente_direccion || '-';

      // 6. & 7. Contacto
      const telefono = pedido.cliente_telefono || '-';
      const email = pedido.cliente_email || '-';

      // 8. Viandas → botón que abre modal con el detalle
      const viandasHtml = `<button class="btn-detalles" onclick="abrirModalDetalles(${pedido.id})">Detalles</button>`;

      // 9. Costo
      const costo = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(pedido.total);

      // 11. Método Pago
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
        <td>${fechaPedido}</td>
        <td>${fechaEntrega}</td>
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
      strong.textContent = cliente;       // columna 4: nombre del cliente
      tr.cells[3].appendChild(strong);

      tr.cells[4].textContent = direccion; // columna 5: dirección
      tr.cells[5].textContent = telefono;  // columna 6: teléfono
      tr.cells[6].textContent = email;     // columna 7: email

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

          const data = await res.json();

          if (!res.ok) {
            // 409 = stock insuficiente: mostrar alerta con el cuello de botella
            if (res.status === 409) {
              mostrarAlertaStock(data.error);
            } else {
              alert('No se pudo actualizar el estado. Intentá de nuevo.');
            }
            selectEstado.value = anteriorId;
            aplicarColorEstado(selectEstado, anteriorId);
            return;
          }

          selectEstado.dataset.estadoActual = nuevoId;
          aplicarColorEstado(selectEstado, nuevoId);

          // Si el backend marcó el pedido como pagado (ej. transferencia al pasar
          // a "En Preparación"), refrescar la insignia de pago sin recargar toda la tabla.
          if (data.pedido && typeof data.pedido.pagado === 'boolean') {
            pedido.pagado = data.pedido.pagado;
            const celdaPago = tr.cells[10];
            const spanEstadoPago = celdaPago?.querySelector('.status-paid, .status-pending');
            if (spanEstadoPago) {
              spanEstadoPago.className = pedido.pagado ? 'status-paid' : 'status-pending';
              spanEstadoPago.textContent = pedido.pagado ? 'PAGADO' : 'PENDIENTE';
            }
          }
        } catch (err) {
          alert('No se pudo actualizar el estado. Intentá de nuevo.');
          selectEstado.value = anteriorId;
          aplicarColorEstado(selectEstado, anteriorId);
        }
      });

      tr.cells[9].appendChild(selectEstado);
      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="12" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
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

  function aplicarFiltros() {
    const TextoDeBusqueda = FiltradodeProductos.value.toLowerCase();
    const desde = FechaDesde.value; // 'YYYY-MM-DD' o ''
    const hasta = FechaHasta.value; // 'YYYY-MM-DD' o ''

    // filtra por nombre de cliente / N° pedido, por fecha de pedido (>= desde)
    // y por fecha de entrega (<= hasta). Comparación de strings 'YYYY-MM-DD':
    // funciona sin convertir a Date porque ese formato ordena lexicográficamente
    // igual que cronológicamente, evitando desfasajes de huso horario.
    const ProductosFiltrados = todosPedidos.filter(pedido => {
      const cumpleTexto =
        (pedido.cliente_nombre || '').toLowerCase().includes(TextoDeBusqueda) ||
        pedido.id.toString().includes(TextoDeBusqueda);

      const fechaPedidoSolo  = (pedido.fecha_pedido  || '').split('T')[0];
      const fechaEntregaSolo = (pedido.fecha_entrega || '').split('T')[0];

      const cumpleDesde = !desde || (fechaPedidoSolo  && fechaPedidoSolo  >= desde);
      const cumpleHasta = !hasta || (fechaEntregaSolo && fechaEntregaSolo <= hasta);

      return cumpleTexto && cumpleDesde && cumpleHasta;
    });

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

    const hayFiltroActivo = TextoDeBusqueda !== '' || desde !== '' || hasta !== '';
    if (visibles === 0 && hayFiltroActivo) {
      const tr = document.createElement('tr');
      tr.className = 'no-results-row';
      tr.innerHTML = `<td colspan="12" class="loading-text">No se encontraron pedidos que cumplan los filtros</td>`;
      tbody.appendChild(tr);
    }
  }

  FiltradodeProductos.addEventListener('input', aplicarFiltros);
  FechaDesde.addEventListener('change', aplicarFiltros);
  FechaHasta.addEventListener('change', aplicarFiltros);
}

// ── ALERTA DE STOCK INSUFICIENTE ─────────────────────────────
function mostrarAlertaStock(mensaje) {
  // Eliminar alerta previa si existe
  const anterior = document.getElementById('alertaStock');
  if (anterior) anterior.remove();

  const alerta = document.createElement('div');
  alerta.id = 'alertaStock';
  alerta.style.cssText = `
    position: fixed; top: 1.5rem; right: 1.5rem; z-index: 9999;
    background: #fff3cd; color: #856404;
    border: 1px solid #ffc107; border-left: 4px solid #e0a800;
    border-radius: 6px; padding: 1rem 1.25rem;
    max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,.15);
    font-size: 0.9rem; line-height: 1.5;
  `;
  alerta.innerHTML = `
    <strong style="display:block;margin-bottom:.35rem;">⚠ Stock insuficiente</strong>
    <span id="alertaStockMensaje"></span>
    <button onclick="this.parentElement.remove()" style="
      position:absolute; top:.5rem; right:.75rem;
      background:none; border:none; font-size:1.1rem;
      cursor:pointer; color:#856404; line-height:1;
    ">×</button>
  `;
  alerta.querySelector('#alertaStockMensaje').textContent = mensaje;
  alerta.style.position = 'fixed';
  document.body.appendChild(alerta);

  setTimeout(() => alerta.remove(), 8000);
}
// ─────────────────────────────────────────────────────────────

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


