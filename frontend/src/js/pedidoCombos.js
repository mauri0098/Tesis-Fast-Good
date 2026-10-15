
// ====================================================================
// PEDIDOCOMBOS.JS — Ventana "Finalizar pedido" de index-combos.html
//
// Funciones:
//   abrirCheckout     → arma el resumen, pone la fecha mínima, completa los datos de la sesión
//                       y abre la ventana con el formulario
//   cargarBarrios     → pide la lista de barrios al servidor (una sola vez) y llena el select
//   validarFormulario → controla cada campo, escribe los errores debajo y devuelve los datos limpios (o null)
//   armarPedido       → junta el carrito y los datos del formulario en el pedido que se manda al servidor
//   confirmarPedido   → lo que pasa al tocar "Confirmar pedido": valida, arma, manda, y si salió bien
//                       vacía el carrito y muestra la confirmación (si no, muestra el error)
//   enviarPedido      → manda el pedido a POST /api/pedidos-combos y traduce la respuesta a
//                       { ok: true, respuesta } o { ok: false, error: "mensaje para el cliente" }
//   mostrarConfirmacion  → dibuja "¡Recibimos tu pedido #N!" con lo que devolvió el servidor y el botón de WhatsApp
//   armarMensajeWhatsApp → arma el mensaje (mismo formato que el formulario viejo) y devuelve el enlace de WhatsApp
//
// Los campos son los mismos que el formulario viejo (pages/formulario.html + formulario.js)
// y el pedido se arma igual que ahí (cliente_nombre = "Nombre Apellido", etc.).
// Los controles de acá son una AYUDA: el servidor vuelve a controlar todo.
// El pedido NO lleva precios, total ni usuario: el servidor los saca de la base y del token.
// Necesita antes: escape.js (escHtml), fechas.js (días hábiles), api.js (apiFetch)
// y carritoCombos.js (carritoCombos, guardarCarrito, renderizarCarrito).
// ====================================================================

// Datos del negocio para el mensaje de WhatsApp (los mismos que usa el formulario viejo)
const WHATSAPP_NUMERO     = '5493512294243';
const EMAIL_NEGOCIO       = 'tesisfastgood@gmail.com';
const ALIAS_TRANSFERENCIA = 'FAST.GOOD.VA cuenta a nombre de Fast and Good VA SRL';

// Mensaje cuando el pedido no se pudo enviar por un problema del servidor o de internet
const MENSAJE_ERROR_ENVIO = 'No pudimos enviar tu pedido. Probá de nuevo en unos minutos.';

// Largos máximos (los mismos que controla el servidor y que acepta la base).
// nombreCompleto = Nombre + espacio + Apellido, que es lo que se guarda en cliente_nombre.
const LARGO_MAXIMO = {
  nombreCompleto: 100,
  telefono:        30,
  email:          100,
  direccion:      200,
  observaciones:  500
};

// Días hábiles mínimos para la entrega: 2 (48 hs hábiles), o 3 si hay algún plato personalizado
const DIAS_HABILES_ENTREGA = 2;
const DIAS_HABILES_CON_PERSONALIZADO = 3;

// Valores EXACTOS que acepta el servidor (los mismos que usa el formulario viejo)
const ENTREGA_ENVIO = 'Delivery';

// Para no pedir los barrios cada vez que se abre la ventana
let barriosCargados = false;

// ── Prepara y abre la ventana del formulario ──────────────────────────────
function abrirCheckout() {
  // Sin combos no hay nada que finalizar
  if (carritoCombos.length === 0) return;

  // Se cierra "Mi pedido" (la ventana del carrito)
  document.getElementById('modal-pedido').close();

  // 1. Resumen: cada combo con sus platos, y el total (solo para mostrar)
  let total = 0;
  let html = '';
  carritoCombos.forEach(combo => {
    const precio = Number(combo.precio) || 0;
    total = total + precio;

    // map arma una lista nueva con el texto de cada plato y join la une separada por comas.
    // Ejemplo: entra [{ cantidad: 3, nombre: 'fideos' }, { cantidad: 2, nombre: 'fideos', personalizado: 'sin sal' }]
    //          sale  '3 × fideos, 2 × fideos (sin sal)'
    const platosTexto = combo.platos.map(plato => {
      let texto = escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre);
      if (plato.personalizado) {
        texto = texto + ' (' + escHtml(plato.personalizado) + ')';
      }
      return texto;
    }).join(', ');

    html += `
      <div class="resumen__combo">
        <p><strong>${escHtml(combo.nombre)}</strong> · $ ${escHtml(precio.toLocaleString('es-AR'))}</p>
        <p class="resumen__platos">${platosTexto}</p>
      </div>`;
  });
  document.getElementById('ck-resumen-lista').innerHTML = html;

  let textoCantidad = carritoCombos.length + ' combos';
  if (carritoCombos.length === 1) textoCantidad = '1 combo';
  document.getElementById('ck-resumen-cant').textContent = '(' + textoCantidad + ')';
  document.getElementById('ck-resumen-total').textContent = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('ck-total').textContent = '$ ' + total.toLocaleString('es-AR');

  // 2. Fecha mínima: 2 días hábiles, o 3 si hay algún plato personalizado.
  //    flatMap junta en una sola lista los platos de todos los combos.
  //    Ejemplo: entra [{ platos: [fideos x3] }, { platos: [fideos x2 "sin sal"] }] → sale [fideos x3, fideos x2 "sin sal"]
  //    some responde true si AL MENOS UNO cumple: [fideos x3, fideos x2 "sin sal"] → true
  const platosDelCarrito = carritoCombos.flatMap(combo => combo.platos);
  const hayPersonalizado = platosDelCarrito.some(plato => plato.personalizado);

  let diasHabiles = DIAS_HABILES_ENTREGA;
  let aclaracionPersonalizado = '';
  if (hayPersonalizado) {
    diasHabiles = DIAS_HABILES_CON_PERSONALIZADO;
    aclaracionPersonalizado = ' (un día hábil más por los platos personalizados)';
  }

  const inputFecha = document.getElementById('ck-fecha');
  inputFecha.min = fechaLocalISO(sumarDiasHabiles(new Date(), diasHabiles));
  // Si había una fecha elegida que ya no alcanza, se borra
  if (inputFecha.value && inputFecha.value < inputFecha.min) {
    inputFecha.value = '';
  }
  document.getElementById('ck-fecha-ayuda').textContent =
    'La primera fecha posible es el ' + fechaDDMMAAAA(parseFechaLocal(inputFecha.min)) + aclaracionPersonalizado + '.';

  // 3. Si el cliente inició sesión, se completan solos los campos vacíos con sus datos.
  //    Los mismos 5 campos que completa el formulario viejo (preLlenarFormulario).
  if (localStorage.getItem('usuario_id')) {
    const datosDeSesion = {
      'ck-nombre':    localStorage.getItem('usuario_nombre') || '',
      'ck-apellido':  localStorage.getItem('usuario_apellido') || '',
      'ck-email':     localStorage.getItem('usuario_email') || '',
      'ck-telefono':  localStorage.getItem('usuario_telefono') || '',
      'ck-direccion': localStorage.getItem('usuario_direccion') || ''
    };
    // Object.keys da la lista de nombres de un objeto.
    // Ejemplo: { 'ck-nombre': 'Ana', 'ck-email': '' } → ['ck-nombre', 'ck-email']
    Object.keys(datosDeSesion).forEach(idCampo => {
      const campo = document.getElementById(idCampo);
      // Si el campo ya tiene algo escrito, no se pisa: return = saltear este y seguir con el siguiente
      if (campo.value) return;
      campo.value = datosDeSesion[idCampo];
    });
  }

  // 4. Errores limpios, el barrio visible solo si está elegido el envío, y la lista de barrios
  document.querySelectorAll('#form-pedido .campo__error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  const entregaElegida = document.querySelector('#form-pedido input[name="entrega"]:checked');
  let conEnvio = false;
  if (entregaElegida && entregaElegida.value === ENTREGA_ENVIO) conEnvio = true;
  document.getElementById('ck-grupo-barrio').hidden = !conEnvio;
  cargarBarrios();

  // 5. Se muestra el formulario (no la confirmación) y se abre la ventana
  document.getElementById('ck-vista-form').hidden = false;
  document.getElementById('ck-vista-ok').hidden = true;
  document.getElementById('modal-checkout').showModal();
}

// ── Pide los barrios al servidor y llena el select (una sola vez) ─────────
async function cargarBarrios() {
  if (barriosCargados) return;

  const select = document.getElementById('ck-barrio');
  try {
    const respuesta = await fetch('/api/barrios');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    const barrios = await respuesta.json();

    // Una opción por barrio. textContent muestra el nombre tal cual (no se ejecuta como HTML).
    barrios.forEach(barrio => {
      const opcion = document.createElement('option');
      opcion.value = barrio.id;
      opcion.textContent = barrio.nombre;
      select.appendChild(opcion);
    });
    barriosCargados = true;
  } catch (error) {
    // Al cliente, un mensaje simple; el detalle queda en la consola
    console.error('Error al cargar los barrios:', error);
    document.getElementById('err-barrio').textContent = 'No pudimos cargar los barrios. Probá de nuevo en un momento.';
  }
}

// ── Controla cada campo; devuelve los datos limpios o null si hay errores ──
function validarFormulario() {
  const formulario = document.getElementById('form-pedido');

  // Errores encontrados: { idDelParrafoDeError: mensaje }
  const errores = {};

  // Nombre y Apellido: obligatorios (como en el viejo, sin espacios de más).
  // Juntos ("Nombre Apellido") son cliente_nombre: entre los dos, hasta 100 caracteres.
  const nombre = document.getElementById('ck-nombre').value.trim();
  const apellido = document.getElementById('ck-apellido').value.trim();
  if (nombre === '') {
    errores['err-nombre'] = 'Escribí tu nombre.';
  }
  if (apellido === '') {
    errores['err-apellido'] = 'Escribí tu apellido.';
  } else if ((nombre + ' ' + apellido).length > LARGO_MAXIMO.nombreCompleto) {
    errores['err-apellido'] = 'Nombre y apellido juntos: hasta ' + LARGO_MAXIMO.nombreCompleto + ' caracteres.';
  }

  // Dirección: obligatoria siempre, como en el viejo (aunque sea retiro en el local)
  const direccion = document.getElementById('ck-direccion').value.trim();
  if (direccion === '') {
    errores['err-direccion'] = 'Escribí tu dirección.';
  } else if (direccion.length > LARGO_MAXIMO.direccion) {
    errores['err-direccion'] = 'Hasta ' + LARGO_MAXIMO.direccion + ' caracteres.';
  }

  // Teléfono: obligatorio, como en el viejo
  const telefono = document.getElementById('ck-telefono').value.trim();
  if (telefono === '') {
    errores['err-telefono'] = 'Escribí tu teléfono.';
  } else if (telefono.length > LARGO_MAXIMO.telefono) {
    errores['err-telefono'] = 'Hasta ' + LARGO_MAXIMO.telefono + ' caracteres.';
  }

  // Email: opcional. Si no se escribe va '' (vacío), como en el viejo.
  // Si se escribe, tiene que tener la forma algo@algo.algo (el viejo también lo controla:
  // su campo es type="email"). Ejemplo: 'ana@mail.com' → sí · 'ana@mail' → no
  const email = document.getElementById('ck-email').value.trim();
  if (email !== '') {
    if (email.length > LARGO_MAXIMO.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errores['err-email'] = 'Revisá el email (o dejalo vacío).';
    }
  }

  // Fecha: obligatoria, día hábil y no antes de la fecha mínima
  const inputFecha = document.getElementById('ck-fecha');
  const fecha = inputFecha.value;
  if (fecha === '') {
    errores['err-fecha'] = 'Elegí la fecha de entrega.';
  } else if (!esDiaHabil(parseFechaLocal(fecha))) {
    errores['err-fecha'] = 'Ese día no entregamos (feriado o fin de semana). Elegí otro.';
  } else if (fecha < inputFecha.min) {
    errores['err-fecha'] = 'La primera fecha posible es el ' + fechaDDMMAAAA(parseFechaLocal(inputFecha.min)) + '.';
  }

  // Método de Pago: obligatorio (viene elegido Efectivo, como en el viejo)
  let metodoPago = '';
  const pagoElegido = formulario.querySelector('input[name="pago"]:checked');
  if (pagoElegido) metodoPago = pagoElegido.value;
  if (metodoPago === '') {
    errores['err-pago'] = 'Elegí el método de pago.';
  }

  // Tipo de Entrega: obligatorio (viene elegido Delivery, como en el viejo)
  let tipoEntrega = '';
  const entregaElegida = formulario.querySelector('input[name="entrega"]:checked');
  if (entregaElegida) tipoEntrega = entregaElegida.value;
  if (tipoEntrega === '') {
    errores['err-entrega'] = 'Elegí el tipo de entrega.';
  }

  // Barrio de entrega: obligatorio SOLO con envío a domicilio. Con retiro va null.
  let barrioId = null;
  if (tipoEntrega === ENTREGA_ENVIO) {
    const barrioElegido = Number(document.getElementById('ck-barrio').value);
    if (!Number.isInteger(barrioElegido) || barrioElegido <= 0) {
      errores['err-barrio'] = 'Seleccioná tu barrio.';
    } else {
      barrioId = barrioElegido;
    }
  }

  // Observaciones: opcional. Va tal cual se escribió ('' si está vacío), como en el viejo.
  const observaciones = document.getElementById('ck-observaciones').value;
  if (observaciones.length > LARGO_MAXIMO.observaciones) {
    errores['err-observaciones'] = 'Hasta ' + LARGO_MAXIMO.observaciones + ' caracteres.';
  }

  // Se borran los errores anteriores y se escriben los nuevos debajo de cada campo.
  // Object.keys da la lista de nombres del objeto. Ejemplo: { 'err-nombre': '...', 'err-pago': '...' } → ['err-nombre', 'err-pago']
  formulario.querySelectorAll('.campo__error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  const idsConError = Object.keys(errores);
  idsConError.forEach(idError => {
    document.getElementById(idError).textContent = errores[idError];
  });

  if (idsConError.length > 0) return null;

  return { nombre, apellido, direccion, telefono, email, fecha, metodoPago, tipoEntrega, barrioId, observaciones };
}

// ── Junta el carrito y los datos en el pedido que se manda al servidor ────
function armarPedido(datos) {
  // De cada combo va solo su id y sus platos (id, cantidad y texto personalizado).
  // Nada de precios ni nombres: el servidor los saca de la base.
  // map arma una lista nueva transformando cada elemento.
  // Ejemplo: entra [{ id_combo: 1, nombre: 'PRUEBA', precio: 137000, platos: [{ producto_id: 5, nombre: 'fideos', cantidad: 3, personalizado: null }] }]
  //          sale  [{ id_combo: 1, platos: [{ producto_id: 5, cantidad: 3, personalizado: null }] }]
  const combos = carritoCombos.map(combo => {
    const platos = combo.platos.map(plato => {
      return { producto_id: plato.producto_id, cantidad: plato.cantidad, personalizado: plato.personalizado || null };
    });
    return { id_combo: combo.id_combo, platos: platos };
  });

  // Los datos del cliente, armados IGUAL que el formulario viejo (armarObjetoPedido de formulario.js).
  // Lo único distinto: en lugar de "items" (platos sueltos) van los "combos".
  return {
    observaciones:     datos.observaciones,
    combos:            combos,
    cliente_nombre:    `${datos.nombre} ${datos.apellido}`,
    cliente_direccion: datos.direccion,
    cliente_telefono:  datos.telefono,
    cliente_email:     datos.email,
    fecha_entrega:     datos.fecha,
    metodo_pago:       datos.metodoPago,
    tipo_entrega:      datos.tipoEntrega,
    barrio_id:         datos.barrioId
  };
}

// ── Al tocar "Confirmar pedido" ───────────────────────────────────────────
async function confirmarPedido(evento) {
  // El formulario no recarga la página
  evento.preventDefault();

  // Se borra el error de un envío anterior (validarFormulario también lo borra con los demás)
  const errorEnvio = document.getElementById('err-envio');
  errorEnvio.textContent = '';

  const datos = validarFormulario();
  if (!datos) return;

  const pedido = armarPedido(datos);

  // El botón se apaga mientras se envía: así un doble clic no crea dos pedidos
  const boton = document.getElementById('ck-confirmar');
  boton.disabled = true;
  boton.textContent = 'Enviando pedido...';

  const resultado = await enviarPedido(pedido);

  boton.disabled = false;
  boton.textContent = 'Confirmar pedido';

  // No salió: se muestra el mensaje y el carrito y el formulario quedan como estaban.
  // textContent lo muestra como texto, nunca como HTML.
  if (!resultado.ok) {
    errorEnvio.textContent = resultado.error;
    return;
  }

  // Salió bien: se vacía el carrito (también lo guardado en el navegador y el número del ícono)
  // con las funciones de carritoCombos.js, y se limpia el formulario
  carritoCombos = [];
  guardarCarrito();
  renderizarCarrito();
  document.getElementById('form-pedido').reset();

  mostrarConfirmacion(resultado.respuesta, datos);
}

// ── Manda el pedido al servidor y traduce la respuesta ────────────────────
async function enviarPedido(pedido) {
  try {
    // apiFetch (api.js) agrega el token si el cliente inició sesión: el servidor saca de ahí
    // a nombre de quién va el pedido. El navegador nunca manda el id del usuario.
    const respuesta = await apiFetch('/api/pedidos-combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
    const cuerpo = await respuesta.json();

    // 200: pedido creado
    if (respuesta.ok) {
      return { ok: true, respuesta: cuerpo };
    }

    // 400 (algún dato mal, un combo que ya no está) o 429 (demasiados pedidos seguidos):
    // el servidor manda un mensaje pensado para el cliente
    if ((respuesta.status === 400 || respuesta.status === 429) && cuerpo.error) {
      return { ok: false, error: cuerpo.error };
    }

    // Cualquier otro error (500): mensaje simple; el detalle queda en la consola
    console.error('Error al crear el pedido:', respuesta.status, cuerpo);
    return { ok: false, error: MENSAJE_ERROR_ENVIO };
  } catch (error) {
    // Sin internet o el servidor no contestó
    console.error('No se pudo enviar el pedido:', error);
    return { ok: false, error: MENSAJE_ERROR_ENVIO };
  }
}

// ── Dibuja la confirmación con lo que devolvió el servidor ────────────────
function mostrarConfirmacion(respuesta, datos) {
  // Combos con sus platos: nombres y precios que guardó el servidor (los de la base)
  let combosHtml = '';
  respuesta.combos.forEach(combo => {
    const precio = Number(combo.precio).toLocaleString('es-AR');

    // map arma una lista nueva con un <li> por plato y join la une en un solo texto.
    // Ejemplo: entra [{ cantidad: 8, nombre: 'fideos' }, { cantidad: 2, nombre: 'fideos', personalizado: 'sin sal' }]
    //          sale  '<li>8 × fideos</li><li>2 × fideos (sin sal)</li>'
    const platosHtml = combo.platos.map(plato => {
      let texto = escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre);
      if (plato.personalizado) {
        texto = texto + ' (' + escHtml(plato.personalizado) + ')';
      }
      return '<li>' + texto + '</li>';
    }).join('');

    combosHtml += `
      <div class="confirmacion__combo">
        <p><strong>${escHtml(combo.nombre)}</strong> · $ ${escHtml(precio)}</p>
        <ul>${platosHtml}</ul>
      </div>`;
  });

  // Entrega, fecha, total y (si es transferencia) el alias
  let textoEntrega = 'Retiro en el local';
  if (datos.tipoEntrega === ENTREGA_ENVIO) {
    textoEntrega = 'Envío a domicilio: ' + datos.direccion;
  }
  const fechaEntrega = fechaDDMMAAAA(parseFechaLocal(datos.fecha));
  const total = Number(respuesta.total).toLocaleString('es-AR');
  let notaTransferencia = '';
  if (datos.metodoPago === 'Transferencia') {
    notaTransferencia = `<p class="nota">Alias: ${escHtml(ALIAS_TRANSFERENCIA)}</p>`;
  }

  document.getElementById('ok-cuerpo').innerHTML = `
    <div class="confirmacion">
      <p class="confirmacion__titulo">¡Recibimos tu pedido <strong>#${escHtml(respuesta.id_pedido)}</strong>!</p>
      <p>Para terminar, mandanos el resumen por WhatsApp y te confirmamos.</p>
      ${combosHtml}
      <p class="confirmacion__total">Total: <strong>$ ${escHtml(total)}</strong></p>
      <p>Fecha de entrega: <strong>${escHtml(fechaEntrega)}</strong></p>
      <p>${escHtml(textoEntrega)}</p>
      <p>Forma de pago: ${escHtml(datos.metodoPago)}</p>
      ${notaTransferencia}
      <a class="btn btn--whatsapp btn--ancho" id="ok-whatsapp" target="_blank" rel="noopener">Enviar por WhatsApp</a>
    </div>`;

  // El enlace se pone aparte (no dentro del HTML de arriba): así ningún texto del mensaje puede romperlo
  document.getElementById('ok-whatsapp').href = armarMensajeWhatsApp(respuesta, datos);

  // Se pasa a la vista de confirmación
  document.getElementById('ck-vista-form').hidden = true;
  document.getElementById('ck-vista-ok').hidden = false;
}

// ── Arma el mensaje de WhatsApp (mismo formato que redirigirAWhatsApp del formulario viejo) ──
function armarMensajeWhatsApp(respuesta, datos) {
  // Fecha y hora de ahora, igual que el viejo (ej: "15/10/26, 06:30 p. m.hs")
  const fechaFormateada = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  }) + 'hs';

  const totalFormateado = Number(respuesta.total).toLocaleString('es-AR');

  // Cada combo con su precio y debajo sus platos. Ejemplo:
  //   1x PRUEBA Mantenimiento x10: $137.000
  //      - 8 fideos
  //      - 2 fideos (sin sal)
  let lineasCombos = '';
  respuesta.combos.forEach(combo => {
    // map arma una línea por plato y join las une con saltos de línea.
    // Ejemplo: [{ cantidad: 8, nombre: 'fideos' }] → '   - 8 fideos'
    const lineasPlatos = combo.platos.map(plato => {
      let linea = '   - ' + plato.cantidad + ' ' + plato.nombre;
      if (plato.personalizado) {
        linea = linea + ' (' + plato.personalizado + ')';
      }
      return linea;
    }).join('\n');

    lineasCombos += '1x ' + combo.nombre + ': $' + Number(combo.precio).toLocaleString('es-AR') + '\n' + lineasPlatos + '\n';
  });

  // Igual que el viejo: el alias solo con transferencia, y la dirección solo con delivery
  let lineaAlias = '\n';
  if (datos.metodoPago === 'Transferencia') {
    lineaAlias = '► ALIAS: ' + ALIAS_TRANSFERENCIA + '\n\n';
  }
  let lineaEntrega = 'Entrega: Retiro en local';
  if (datos.tipoEntrega === ENTREGA_ENVIO) {
    lineaEntrega = 'Entrega: Delivery\nDirección: ' + datos.direccion;
  }

  // Nuevo (el viejo no la tiene): la fecha de entrega elegida
  const fechaEntrega = fechaDDMMAAAA(parseFechaLocal(datos.fecha));

  const mensaje =
`¡Hola! Te paso el resumen de mi pedido

Pedido: #${respuesta.id_pedido}
Tienda: fastandgood
Fecha: ${fechaFormateada}
Nombre: ${datos.nombre} ${datos.apellido}
Teléfono: ${datos.telefono}

Forma de pago: ${datos.metodoPago}
Total: $${totalFormateado}
${lineaAlias}${lineaEntrega}
Fecha de entrega: ${fechaEntrega}

mail: ${EMAIL_NEGOCIO}

Mi pedido es

${lineasCombos}
TOTAL: $${totalFormateado}

Espero tu respuesta para confirmar mi pedido`;

  // encodeURIComponent convierte el texto para que viaje dentro del enlace sin romperlo
  // (ej: un "&" o un "#" en un nombre)
  return 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(mensaje);
}

// ── Al cargar la página: quién escucha qué ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ventana = document.getElementById('modal-checkout');
  const formulario = document.getElementById('form-pedido');

  // Botón "Finalizar pedido" de la ventana "Mi pedido" (carritoCombos.js)
  document.getElementById('mp-finalizar').addEventListener('click', abrirCheckout);

  // "Confirmar pedido"
  formulario.addEventListener('submit', confirmarPedido);

  // Tipo de Entrega: con envío se ve el barrio; con retiro se oculta (como en el viejo)
  formulario.querySelectorAll('input[name="entrega"]').forEach(opcion => {
    opcion.addEventListener('change', () => {
      document.getElementById('ck-grupo-barrio').hidden = opcion.value !== ENTREGA_ENVIO;
    });
  });

  // Pago: con transferencia se muestra el alias
  formulario.querySelectorAll('input[name="pago"]').forEach(opcion => {
    opcion.addEventListener('change', () => {
      document.getElementById('ck-transf').hidden = opcion.value !== 'Transferencia';
    });
  });

  // Fecha: si se elige un feriado o un fin de semana, se avisa y se borra
  document.getElementById('ck-fecha').addEventListener('change', evento => {
    const campoFecha = evento.target;
    document.getElementById('err-fecha').textContent = '';
    if (campoFecha.value && !esDiaHabil(parseFechaLocal(campoFecha.value))) {
      document.getElementById('err-fecha').textContent = 'Ese día no entregamos (feriado o fin de semana). Elegí otro.';
      campoFecha.value = '';
    }
  });

  // Cerrar: con la ✕, "Volver al inicio" o un clic en el fondo oscuro
  ventana.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-accion="cerrar"]');
    if (evento.target === ventana || boton) {
      ventana.close();
    }
  });
});
