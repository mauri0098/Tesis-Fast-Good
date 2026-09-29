// ============================================================================
// FORMULARIO DE ENTREGA - Gestión de Pedidos
// ============================================================================

const WHATSAPP_NUMERO        = '5493512294243';
const EMAIL_NEGOCIO          = 'tesisfastgood@gmail.com';
const ALIAS_TRANSFERENCIA    = 'FAST.GOOD.VA cuenta a nombre de Fast and Good VA SRL';
const GUEST_UUID             = 'd9b1ae00-fda5-4488-86b3-90d769b47a02';

// ============================================================================
// 1. INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  vincularFormulario();
  mostrarResumenCarrito();
  preLlenarFormulario();
  cargarBarrios();
  toggleBarrio();
  configurarFechaMinima();
});

// ============================================================================
// 2. FECHAS HÁBILES (FERIADOS, esDiaHabil y sumarDiasHabiles vienen de fechas.js)
// ============================================================================

// 48 hs hábiles: el día hábil siguiente se cocina y el otro se entrega.
// Ej.: pedido el martes → se cocina el miércoles → primera entrega posible el jueves.
function calcularPrimeraFechaDisponible() {
  return fechaLocalISO(sumarDiasHabiles(new Date(), 2));
}

function configurarFechaMinima() {
  const inputFecha = document.getElementById('fecha') || document.getElementById('fecha_entrega');
  if (!inputFecha) return;

  inputFecha.min = calcularPrimeraFechaDisponible();

  inputFecha.addEventListener('change', () => {
    if (!inputFecha.value) return;
    if (!esDiaHabil(parseFechaLocal(inputFecha.value))) {
      alert('Esa fecha no está disponible (feriado o fin de semana). Por favor elegí otra.');
      inputFecha.value = '';
    }
  });
}

// ============================================================================
// 3. INICIALIZACIÓN DEL FORMULARIO
// ============================================================================

function preLlenarFormulario() {
  const usuarioId = localStorage.getItem('usuario_id');
  if (!usuarioId) return;

  const campos = {
    nombre:    localStorage.getItem('usuario_nombre')    || '',
    apellido:  localStorage.getItem('usuario_apellido')  || '',
    email:     localStorage.getItem('usuario_email')     || '',
    telefono:  localStorage.getItem('usuario_telefono')  || '',
    direccion: localStorage.getItem('usuario_direccion') || ''
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el && valor) el.value = valor;
  });
}

async function cargarBarrios() {
  try {
    const res = await fetch('http://localhost:3000/api/barrios');
    if (!res.ok) return;
    const barrios = await res.json();
    const select = document.getElementById('barrio');
    if (!select) return;
    barrios.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.nombre;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error al cargar barrios:', e);
  }
}

function toggleBarrio() {
  const tipo = document.getElementById('tipoEntrega')?.value;
  const grupo = document.getElementById('grupoBarrio');
  if (grupo) grupo.style.display = tipo === 'Delivery' ? 'block' : 'none';
}

window.toggleBarrio = toggleBarrio;

function vincularFormulario() {
  const formulario = document.getElementById('pedidoForm');
  if (!formulario) return;

  const btnSubmit = formulario.querySelector('button[type="submit"]');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    // Bloqueo inmediato para evitar doble envío
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Procesando pedido...';

    const exito = await enviarFormulario();

    if (!exito) {
      // Restaurar si falló la validación o hubo un error de red
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Finalizar Pedido';
    } else {
      btnSubmit.textContent = 'Redirigiendo a WhatsApp...';
    }
  });
}

function mostrarResumenCarrito() {
  const carritoGuardado = obtenerCarritoDeStorage();
  const elementoResumen = document.getElementById('resumenPedido');
  if (!elementoResumen) return;

  if (carritoGuardado.length > 0) {
    elementoResumen.innerHTML = '';
    carritoGuardado.forEach(item => {
      const elementoLista = document.createElement('li');
      elementoLista.textContent = `${item.nombre} × ${item.cantidad}`;
      elementoResumen.appendChild(elementoLista);
    });
  } else {
    elementoResumen.innerHTML = '<li>No hay elementos en tu carrito.</li>';
  }
}

// ============================================================================
// 4. localStorage
// ============================================================================

function obtenerCarritoDeStorage() {
  const carritoJSON = localStorage.getItem('FG_CARRITO_ACTUAL') || '[]';
  return JSON.parse(carritoJSON);
}

function guardarComandaParaCocina(pedidoCreado, carrito) {
  const comanda = {
    id: pedidoCreado.id,
    items: carrito.map(item => ({
      nombre:      item.nombre,
      producto_id: item.producto_id,
      cantidad:    item.cantidad
    }))
  };
  localStorage.setItem('pedidoFastGood', JSON.stringify(comanda));
}

function limpiarCarritoDeStorage() {
  localStorage.removeItem('FG_CARRITO_ACTUAL');
}

// ============================================================================
// 5. VALIDACIÓN
// ============================================================================

function obtenerDatosFormulario() {
  const inputFecha   = document.getElementById('fecha')      || document.getElementById('fecha_entrega');
  const inputPago    = document.getElementById('metodo_pago') || document.getElementById('metodoPago');
  const inputEntrega = document.getElementById('tipoEntrega');
  const barrioEl     = document.getElementById('barrio');

  return {
    nombre:       document.getElementById('nombre').value.trim(),
    apellido:     document.getElementById('apellido').value.trim(),
    direccion:    document.getElementById('direccion').value.trim(),
    telefono:     document.getElementById('telefono').value.trim(),
    email:        document.getElementById('email').value.trim(),
    fechaEntrega: inputFecha   ? inputFecha.value   : '',
    metodoPago:   inputPago    ? inputPago.value    : 'Efectivo',
    tipoEntrega:  inputEntrega ? inputEntrega.value : 'Delivery',
    barrioId:     barrioEl && barrioEl.value ? Number(barrioEl.value) : null,
    observaciones: document.getElementById('observaciones').value
  };
}

function validarCarritoNoVacio(carrito) {
  if (carrito.length === 0) {
    alert('El pedido está vacío.');
    return false;
  }
  return true;
}

function validarDatosObligatorios(datos) {
  const { nombre, apellido, direccion, telefono, fechaEntrega } = datos;
  if (!nombre || !apellido || !direccion || !telefono || !fechaEntrega) {
    alert('Completá todos los datos obligatorios.');
    return false;
  }
  return true;
}

// ============================================================================
// 6. CÁLCULO Y ARMADO DEL PEDIDO
// ============================================================================

function calcularTotalPedido(carrito) {
  return carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
}

function prepararItemsParaServidor(carrito) {
  return carrito.map(item => ({
    producto_id:         item.producto_id,
    cantidad:            item.cantidad,
    precio:              item.precio,
    observaciones_plato: item.observaciones || null
  }));
}

function armarObjetoPedido(datos, carrito, usuarioId) {
  return {
    usuario_id:       usuarioId,
    total:            calcularTotalPedido(carrito),
    observaciones:    datos.observaciones,
    items:            prepararItemsParaServidor(carrito),
    cliente_nombre:   `${datos.nombre} ${datos.apellido}`,
    cliente_direccion: datos.direccion,
    cliente_telefono:  datos.telefono,
    cliente_email:     datos.email,
    fecha_entrega:     datos.fechaEntrega,
    metodo_pago:       datos.metodoPago,
    tipo_entrega:      datos.tipoEntrega,
    barrio_id:         datos.barrioId || null
  };
}

// ============================================================================
// 7. SERVIDOR
// ============================================================================

async function enviarPedidoAlServidor(pedido) {
  const respuesta = await fetch('http://localhost:3000/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido)
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || 'Error al crear el pedido');
  return datos;
}

function limpiarFormulario() {
  document.getElementById('pedidoForm').reset();
}

// ============================================================================
// 8. WHATSAPP
// ============================================================================

function redirigirAWhatsApp(pedidoId, datos, carrito) {
  const ahora = new Date();
  const fechaFormateada = ahora.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  }) + 'hs';

  const total           = calcularTotalPedido(carrito);
  const totalFormateado = total.toLocaleString('es-AR');

  const lineasItems = carrito
    .map(item => `${item.cantidad}x ${item.nombre}: $${(item.precio * item.cantidad).toLocaleString('es-AR')}`)
    .join('\n');

  const lineaAlias = datos.metodoPago === 'Transferencia'
    ? `► ALIAS: ${ALIAS_TRANSFERENCIA}\n\n`
    : '\n';

  const lineaEntrega = datos.tipoEntrega === 'Delivery'
    ? `Entrega: Delivery\nDirección: ${datos.direccion}`
    : 'Entrega: Retiro en local';

  const mensaje =
`¡Hola! Te paso el resumen de mi pedido

Pedido: #${pedidoId}
Tienda: fastandgood
Fecha: ${fechaFormateada}
Nombre: ${datos.nombre} ${datos.apellido}
Teléfono: ${datos.telefono}

Forma de pago: ${datos.metodoPago}
Total: $${totalFormateado}
${lineaAlias}${lineaEntrega}

mail: ${EMAIL_NEGOCIO}

Mi pedido es

${lineasItems}

TOTAL: $${totalFormateado}

Espero tu respuesta para confirmar mi pedido`;

  const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

// ============================================================================
// 9. FUNCIÓN PRINCIPAL
// ============================================================================

// Retorna true en caso de éxito, false si falló validación o hubo error de red.
// vincularFormulario() usa este valor para decidir si restaurar el botón.
async function enviarFormulario() {
  const usuarioId = localStorage.getItem('usuario_id') || GUEST_UUID;

  const carrito = obtenerCarritoDeStorage();
  const datos   = obtenerDatosFormulario();

  if (!validarCarritoNoVacio(carrito))    return false;
  if (!validarDatosObligatorios(datos))   return false;

  const pedido = armarObjetoPedido(datos, carrito, usuarioId);

  try {
    const respuestaServidor = await enviarPedidoAlServidor(pedido);
    const pedidoId = respuestaServidor.pedido?.id || '—';

    guardarComandaParaCocina(respuestaServidor.pedido, carrito);
    limpiarCarritoDeStorage();
    limpiarFormulario();

    redirigirAWhatsApp(pedidoId, datos, carrito);
    return true;

  } catch (error) {
    alert('❌ ' + error.message);
    return false;
  }
}

window.enviarFormulario = enviarFormulario;
