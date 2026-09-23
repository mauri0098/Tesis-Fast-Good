let todosPedidos = []; // guarda todos los pedidos para poder filtrarlos
let estadoOptions = []; // estados posibles, para armar el select de cada fila
let paginacionPedidos = null; // control de paginación de la tabla

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
    estadoOptions = await fetchEstados();
    const response = await fetch('http://localhost:3000/api/pedidos');
    const data = await response.json();

    todosPedidos = data; // guardamos para que el filtro los pueda usar
    renderizarPedidos(todosPedidos);

  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="11" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// Dibuja la página indicada de la lista (ya filtrada) de pedidos
function renderizarPedidos(pedidos, pagina = 1) {
  const hayBusqueda = document.getElementById('CampoBusqueda')?.value.trim() !== '';
  const mensajeVacio = hayBusqueda ? 'No se encontraron pedidos con ese nombre' : 'No hay pedidos registrados';

  paginacionPedidos = crearPaginacion({
    datos: pedidos,
    porPagina: 15,
    contenedorTabla: document.getElementById('pedidosBody'),
    contenedorPaginacion: document.getElementById('paginacion'),
    funcionRenderFila: crearFilaPedido,
    filaVacia: `<tr><td colspan="11" class="loading-text">${mensajeVacio}</td></tr>`,
    paginaInicial: pagina
  });
}

function crearFilaPedido(pedido) {
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
  // Debajo del método: el desglose del Mixto (efectivo + transferencia) o si el efectivo fue anticipado
  let detallePago = '';
  if (metodo === 'Mixto') {
    detallePago = `<span class="pago-detalle">💵 ${formatPrecio(pedido.monto_efectivo || 0)}<br>🏦 ${formatPrecio(pedido.monto_transferencia || 0)}</span>`;
  } else if (metodo === 'Efectivo' && pedido.pago_anticipado) {
    detallePago = '<span class="pago-detalle">Pago anticipado</span>';
  }
  const pagoHtml = `
    <div class="pago-info">
      <span class="metodo-tag">${metodo}</span>
      ${detallePago}
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
    <td>
      <div class="acciones-pedido">
        <button class="btn-pago" onclick="abrirModalPago(${pedido.id})">Pago</button>
        <button class="btn-eliminar" onclick="eliminarPedido(${pedido.id}, this)">Eliminar</button>
      </div>
    </td>
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
      pedido.id_estado = nuevoId; // así la fila sale bien si se vuelve a dibujar al cambiar de página
      aplicarColorEstado(selectEstado, nuevoId);
    } catch (err) {
      alert('No se pudo actualizar el estado. Intentá de nuevo.');
      selectEstado.value = anteriorId;
      aplicarColorEstado(selectEstado, anteriorId);
    }
  });

  tr.cells[8].appendChild(selectEstado);
  return tr;
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
  if (e.key === 'Escape') {
    document.getElementById('modalDetalles')?.classList.remove('visible');
    document.getElementById('modalPago')?.classList.remove('visible');
  }
});
// ─────────────────────────────────────────────────────────────

// ── MODAL PAGO ────────────────────────────────────────────────
// Efectivo (con opción de pago anticipado) / Transferencia / Tarjeta (Débito o Crédito) / Mixto.
// Mixto = efectivo + transferencia (la tarjeta no entra); la suma tiene que dar exactamente
// el total (se compara en centavos).
let pedidoPagoId = null;

const aCentavos = n => Math.round(Number(n) * 100);

// Campos de montos del pago mixto, en el mismo orden que monto_efectivo / monto_transferencia
const CAMPOS_MIXTO = ['pagoMontoEfectivo', 'pagoMontoTransferencia'];

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="metodoPago"]').forEach(radio => {
    radio.addEventListener('change', actualizarSubopcionesPago);
  });
  document.querySelectorAll('input[name="tipoTarjeta"]').forEach(radio => {
    radio.addEventListener('change', ocultarErrorPago);
  });
  CAMPOS_MIXTO.forEach(id => document.getElementById(id)?.addEventListener('input', actualizarSumaMixto));
});

function abrirModalPago(pedidoId) {
  const pedido = todosPedidos.find(p => p.id === pedidoId);
  if (!pedido) return;

  pedidoPagoId = pedidoId;

  document.getElementById('pagoTitulo').textContent =
    `Pago del Pedido #${String(pedidoId).padStart(3, '0')}`;
  document.getElementById('pagoTotal').textContent = formatPrecio(pedido.total);

  // Preseleccionar el método actual: 'Tarjeta Débito' / 'Tarjeta Crédito' → opción Tarjeta + su tipo.
  // Sin método cargado se toma como Efectivo, igual que en la grilla.
  const guardado = pedido.metodo_pago || 'Efectivo';
  let opcion      = 'Efectivo';
  let tipoTarjeta = null;
  if (guardado.startsWith('Tarjeta')) {
    opcion      = 'Tarjeta';
    tipoTarjeta = guardado.replace('Tarjeta ', '');
  } else if (['Efectivo', 'Transferencia', 'Mixto'].includes(guardado)) {
    opcion = guardado;
  }

  document.querySelector(`input[name="metodoPago"][value="${opcion}"]`).checked = true;
  document.querySelectorAll('input[name="tipoTarjeta"]').forEach(r => { r.checked = r.value === tipoTarjeta; });
  document.getElementById('pagoAnticipado').checked = opcion === 'Efectivo' && pedido.pago_anticipado === true;

  // Si ya era mixto, precargar los montos guardados (los que están en 0 quedan vacíos)
  const esMixto = opcion === 'Mixto';
  const montos  = [pedido.monto_efectivo, pedido.monto_transferencia];
  CAMPOS_MIXTO.forEach((id, i) => {
    document.getElementById(id).value = esMixto && Number(montos[i]) > 0 ? montos[i] : '';
  });

  actualizarSubopcionesPago();
  document.getElementById('modalPago').classList.add('visible');
}

function cerrarModalPago(e) {
  if (!e || e.target === document.getElementById('modalPago')) {
    document.getElementById('modalPago').classList.remove('visible');
    pedidoPagoId = null;
  }
}

function metodoPagoSeleccionado() {
  return document.querySelector('input[name="metodoPago"]:checked')?.value;
}

// Muestra solo la sub-opción del método elegido:
// Efectivo → pago anticipado | Tarjeta → Débito / Crédito | Mixto → montos en efectivo y transferencia
function actualizarSubopcionesPago() {
  const opcion = metodoPagoSeleccionado();
  document.getElementById('pagoSubEfectivo').classList.toggle('visible', opcion === 'Efectivo');
  document.getElementById('pagoSubTarjeta').classList.toggle('visible', opcion === 'Tarjeta');
  document.getElementById('pagoMixto').classList.toggle('visible', opcion === 'Mixto');
  ocultarErrorPago();
  if (opcion === 'Mixto') actualizarSumaMixto();
}

// Indicador en vivo: cuánto falta (o sobra) para llegar al total
function actualizarSumaMixto() {
  const pedido = todosPedidos.find(p => p.id === pedidoPagoId);
  const suma   = document.getElementById('pagoSuma');
  if (!pedido) return;

  const valores = CAMPOS_MIXTO.map(id => document.getElementById(id).value);

  if (valores.every(v => v === '')) {
    suma.textContent = '';
    suma.className   = 'pago-suma';
    return;
  }

  const cargado    = valores.reduce((acc, v) => acc + aCentavos(v || 0), 0);
  const diferencia = aCentavos(pedido.total) - cargado;

  if (diferencia === 0) {
    suma.textContent = '✓ La suma coincide con el total';
    suma.className   = 'pago-suma ok';
  } else if (diferencia > 0) {
    suma.textContent = `Faltan ${formatPrecio(diferencia / 100)} para llegar al total`;
    suma.className   = 'pago-suma falta';
  } else {
    suma.textContent = `Te pasaste por ${formatPrecio(-diferencia / 100)}`;
    suma.className   = 'pago-suma falta';
  }
}

function mostrarErrorPago(mensaje) {
  const el = document.getElementById('pagoError');
  el.textContent = mensaje;
  el.classList.add('visible');
}

function ocultarErrorPago() {
  document.getElementById('pagoError').classList.remove('visible');
}

// Arma el cuerpo del PUT según la opción elegida. Devuelve null (y muestra el error) si algo no cierra.
function armarPagoDesdeModal(pedido) {
  const opcion = metodoPagoSeleccionado();

  if (opcion === 'Efectivo') {
    return { metodo_pago: 'Efectivo', pago_anticipado: document.getElementById('pagoAnticipado').checked };
  }

  if (opcion === 'Transferencia') {
    return { metodo_pago: 'Transferencia' };
  }

  if (opcion === 'Tarjeta') {
    const tipo = document.querySelector('input[name="tipoTarjeta"]:checked')?.value;
    if (!tipo) {
      mostrarErrorPago('Elegí si la tarjeta es de débito o de crédito.');
      return null;
    }
    return { metodo_pago: 'Tarjeta ' + tipo };
  }

  // Mixto: efectivo + transferencia, los dos obligatorios
  const [efectivo, transferencia] = CAMPOS_MIXTO.map(id => parseFloat(document.getElementById(id).value));

  if (isNaN(efectivo) || isNaN(transferencia) || efectivo <= 0 || transferencia <= 0) {
    mostrarErrorPago('Ingresá los dos montos. Los dos tienen que ser mayores a $0.');
    return null;
  }
  const sumaCent = aCentavos(efectivo) + aCentavos(transferencia);
  if (sumaCent !== aCentavos(pedido.total)) {
    mostrarErrorPago(`La suma (${formatPrecio(sumaCent / 100)}) no coincide con el total del pedido (${formatPrecio(pedido.total)}).`);
    return null;
  }

  return { metodo_pago: 'Mixto', monto_efectivo: efectivo, monto_transferencia: transferencia };
}

async function guardarPago() {
  const pedido = todosPedidos.find(p => p.id === pedidoPagoId);
  if (!pedido) return;

  const body = armarPagoDesdeModal(pedido);
  if (!body) return;

  const btn = document.getElementById('pagoGuardar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  ocultarErrorPago();

  try {
    const res = await fetch(`http://localhost:3000/api/pedidos/${pedido.id}/pago`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarErrorPago(res.status === 401
        ? 'Tu sesión expiró. Volvé a iniciar sesión.'
        : (data.error || 'No se pudo guardar el pago. Intentá de nuevo.'));
      return;
    }

    // Actualizar en memoria y redibujar la página actual
    pedido.metodo_pago         = data.pedido.metodo_pago;
    pedido.monto_efectivo      = data.pedido.monto_efectivo;
    pedido.monto_transferencia = data.pedido.monto_transferencia;
    pedido.monto_tarjeta       = data.pedido.monto_tarjeta;
    pedido.pago_anticipado     = data.pedido.pago_anticipado;

    cerrarModalPago();
    renderizarPedidos(filtrarPedidos(), paginacionPedidos.paginaActual());
  } catch (err) {
    mostrarErrorPago('No se pudo conectar con el servidor.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}
// ─────────────────────────────────────────────────────────────

function iniciarFiltro() {
  const FiltradodeProductos = document.getElementById('CampoBusqueda');
  const FechaDesde = document.getElementById('FechaDesde');
  const FechaHasta = document.getElementById('FechaHasta');
  if (!FiltradodeProductos) return;

  // al escribir se filtra y se vuelve a la página 1 del resultado
  FiltradodeProductos.addEventListener('input', () => {
    renderizarPedidos(filtrarPedidos());
  });

}

// filtra el array de pedidos por nombre de cliente o por número de pedido
function filtrarPedidos() {
  const TextoDeBusqueda = (document.getElementById('CampoBusqueda')?.value || '').toLowerCase();

  return todosPedidos.filter(pedido =>
    pedido.cliente_nombre.toLowerCase().includes(TextoDeBusqueda) ||
    pedido.id.toString().includes(TextoDeBusqueda)
  );
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
    // redibujar respetando el filtro y la página actual (si la página quedó vacía, va a la anterior)
    renderizarPedidos(filtrarPedidos(), paginacionPedidos.paginaActual());
  } catch (err) {
    alert('No se pudo eliminar el pedido. Intentá de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Eliminar';
  }
}
// ─────────────────────────────────────────────────────────────


