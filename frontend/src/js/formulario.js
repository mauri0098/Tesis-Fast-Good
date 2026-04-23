// ============================================================================
// FORMULARIO DE ENTREGA - Gestión de Pedidos
// ============================================================================
// Este archivo gestiona:
// 1. Lectura del carrito desde localStorage
// 2. Validación de datos del cliente
// 3. Envío del pedido al servidor
// 4. Guardado de la comanda para cocina
// ============================================================================

// ============================================================================
// 1. INICIALIZACIÓN - Cuando carga la página
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Vincular evento submit del formulario
  vincularFormulario();

  // Mostrar resumen del carrito en la página
  mostrarResumenCarrito();
});

// ============================================================================
// 2. FUNCIONES DE INICIALIZACIÓN
// ============================================================================

/**
 * Vincula el evento submit del formulario a la función de envío
 */
function vincularFormulario() {
  const formulario = document.getElementById('pedidoForm');

  if (formulario) {
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault(); // Evita recarga de página
      enviarFormulario();
    });
  }
}

/**
 * Muestra un resumen visual del carrito en la página
 */
function mostrarResumenCarrito() {
  const carritoGuardado = obtenerCarritoDeStorage();
  const elementoResumen = document.getElementById('resumenPedido');

  if (!elementoResumen) {
    return;
  }

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
// 3. FUNCIONES DE localStorage
// ============================================================================

/**
 * Obtiene el carrito guardado en localStorage
 * @returns {array} Array de items del carrito
 */
function obtenerCarritoDeStorage() {
  const carritoJSON = localStorage.getItem('FG_CARRITO_ACTUAL') || '[]';
  return JSON.parse(carritoJSON);
}

/**
 * Guarda la comanda para que cocina pueda verla
 * @param {object} pedidoCreado - Datos del pedido creado en servidor
 * @param {array} carrito - Items del carrito
 */
function guardarComandaParaCocina(pedidoCreado, carrito) {
  const comanda = {
    id: pedidoCreado.id,
    items: carrito.map(item => ({
      nombre: item.nombre,
      producto_id: item.producto_id,
      cantidad: item.cantidad
    }))
  };

  localStorage.setItem('pedidoFastGood', JSON.stringify(comanda));
}

/**
 * Limpia el carrito del localStorage después de crear el pedido
 */
function limpiarCarritoDeStorage() {
  localStorage.removeItem('FG_CARRITO_ACTUAL');
}

// ============================================================================
// 4. FUNCIONES DE VALIDACIÓN
// ============================================================================

/**
 * Obtiene los datos del formulario del cliente
 * @returns {object} Objeto con los datos completados
 */
/**
 * Obtiene los datos del formulario del cliente
 * @returns {object} Objeto con los datos completados
 */
function obtenerDatosFormulario() {
  const inputFecha = document.getElementById('fecha') || document.getElementById('fecha_entrega');
  const inputPago = document.getElementById('metodo_pago') || document.getElementById('metodoPago');
  const inputEntrega = document.getElementById('tipoEntrega');

  return {
    nombre: document.getElementById('nombre').value.trim(),
    apellido: document.getElementById('apellido').value.trim(),
    direccion: document.getElementById('direccion').value.trim(),
    telefono: document.getElementById('telefono').value.trim(),
    email: document.getElementById('email').value.trim(),
    fechaEntrega: inputFecha ? inputFecha.value : '',
    metodoPago: inputPago ? inputPago.value : 'Efectivo',
    tipoEntrega: inputEntrega ? inputEntrega.value : 'Delivery',
    observaciones: document.getElementById('observaciones').value
  };
}
/**
 * Valida que el carrito no esté vacío
 * @param {array} carrito - Items del carrito
 * @returns {boolean} True si es válido
 */
function validarCarritoNoVacio(carrito) {
  if (carrito.length === 0) {
    alert('El pedido está vacío.');
    return false;
  }
  return true;
}

/**
 * Valida que los datos obligatorios estén completos
 * @param {object} datos - Datos del formulario
 * @returns {boolean} True si es válido
 */
function validarDatosObligatorios(datos) {
  const { nombre, apellido, direccion, telefono, fechaEntrega } = datos;

  if (!nombre || !apellido || !direccion || !telefono || !fechaEntrega) {
    alert('Completá todos los datos obligatorios.');
    return false;
  }

  return true;
}

// ============================================================================
// 5. FUNCIONES DE CÁLCULO
// ============================================================================

/**
 * Calcula el total del pedido multiplicando precio × cantidad
 * @param {array} carrito - Items del carrito
 * @returns {number} Total en pesos
 */
function calcularTotalPedido(carrito) {
  return carrito.reduce((acumulador, item) => {
    return acumulador + (item.precio * item.cantidad);
  }, 0);
}

/**
 * Prepara los items para enviar al servidor
 * @param {array} carrito - Items del carrito
 * @returns {array} Items con estructura para servidor
 */
function prepararItemsParaServidor(carrito) {
  return carrito.map(item => ({
    producto_id: item.producto_id,
    cantidad: item.cantidad,
    observaciones_plato: item.observaciones || null
  }));
}

/**
 * Arma el objeto pedido con toda la información
 * @param {object} datos - Datos del cliente
 * @param {array} carrito - Items del carrito
 * @param {string} usuarioId - ID del usuario
 * @returns {object} Objeto pedido listo para enviar
 */
function armarObjetoPedido(datos, carrito, usuarioId) {
  const total = calcularTotalPedido(carrito);
  const items = prepararItemsParaServidor(carrito);

  return {
    usuario_id: usuarioId,
    total: total,
    observaciones: datos.observaciones,
    items: items,
    cliente_nombre: `${datos.nombre} ${datos.apellido}`,
    cliente_direccion: datos.direccion,
    cliente_telefono: datos.telefono,
    cliente_email: datos.email,
    fecha_entrega: datos.fechaEntrega,
    metodo_pago: datos.metodoPago,
    tipo_entrega: datos.tipoEntrega
  };
}

// ============================================================================
// 6. FUNCIONES DE SERVIDOR
// ============================================================================

/**
 * Envía el pedido al servidor mediante fetch
 * @param {object} pedido - Objeto con los datos del pedido
 * @returns {Promise} Respuesta del servidor
 */
async function enviarPedidoAlServidor(pedido) {
  const respuesta = await fetch('http://localhost:3000/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido)
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos.error || 'Error al crear el pedido');
  }

  return datos;
}

/**
 * Limpia el formulario después de envío exitoso
 */
function limpiarFormulario() {
  document.getElementById('pedidoForm').reset();
}

// ============================================================================
// 7. WHATSAPP - Armar y enviar mensaje
// ============================================================================


/**
 * Función principal que coordina todo el proceso de crear un pedido
 * 1. Valida datos
 * 2. Calcula totales
 * 3. Envía al servidor
 * 4. Guarda comanda para cocina
 * 5. Limpia localStorage
 */
async function enviarFormulario() {
  const GUEST_UUID = 'd9b1ae00-fda5-4488-86b3-90d769b47a02';
  const usuarioId = localStorage.getItem('usuario_id') || GUEST_UUID;

const WHATSAPP_NUMERO = '5493512294243'; // Villa Allende: 0351 229-4243
const EMAIL_NEGOCIO = 'tesisfastgood@gmail.com';
const ALIAS_TRANSFERENCIA = 'FAST.GOOD.VA cuenta a nombre de Fast and Good VA SRL';

function redirigirAWhatsApp(pedidoId, datos, carrito) {
  const ahora = new Date();
  const fechaFormateada = ahora.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  }) + 'hs';

  const total = calcularTotalPedido(carrito);
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
// 8. FUNCIÓN PRINCIPAL - Enviar Formulario
// ============================================================================

async function enviarFormulario() {
  const usuarioId = 'd9b1ae00-fda5-4488-86b3-90d769b47a02'; // Consumidor Final


  const carrito = obtenerCarritoDeStorage();
  const datos = obtenerDatosFormulario();

  if (!validarCarritoNoVacio(carrito)) return;
  if (!validarDatosObligatorios(datos)) return;

  const pedido = armarObjetoPedido(datos, carrito, usuarioId);

  try {
    const respuestaServidor = await enviarPedidoAlServidor(pedido);
    const pedidoId = respuestaServidor.pedido?.id || '—';

    guardarComandaParaCocina(respuestaServidor.pedido, carrito);
    limpiarCarritoDeStorage();
    limpiarFormulario();

    // Redirigir a WhatsApp con el resumen del pedido
    redirigirAWhatsApp(pedidoId, datos, carrito);

  } catch (error) {
    alert('❌ ' + error.message);
  }
}

// ============================================================================
// 9. EXPORTAR FUNCIONES PARA HTML
// ============================================================================

window.enviarFormulario = enviarFormulario;``}
