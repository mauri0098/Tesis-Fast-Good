
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
//                       vacía el carrito y muestra la confirmación (si no, muestra el error; si el error es
//                       "No quedan suficientes viandas…", además vuelve a pedir los combos: paso H8)
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
// ENTRADA: nada (usa carritoCombos, el carrito de carritoCombos.js)
// SALIDA:  nada (la ventana "Finalizar pedido" abierta: resumen, total, fecha mínima y los datos de la sesión)
// Ej: carrito con "Mantenimiento x10" (8 fideos + 2 fideos "sin sal") → "(1 combo)", total $ 137.000
//     y la primera fecha posible a 3 días hábiles (uno más por el "sin sal")
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
      const aclaracion = plato.personalizado ? ' (' + escHtml(plato.personalizado) + ')' : '';  // solo el personalizado
      return escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre) + aclaracion;
    }).join(', ');

    html += `
      <div class="resumen__combo">
        <p><strong>${escHtml(combo.nombre)}</strong> · $ ${escHtml(precio.toLocaleString('es-AR'))}</p>
        <p class="resumen__platos">${platosTexto}</p>
      </div>`;
  });
  document.getElementById('ck-resumen-lista').innerHTML = html;

  const textoCantidad = carritoCombos.length === 1 ? '1 combo' : carritoCombos.length + ' combos';  // ej: "3 combos"
  document.getElementById('ck-resumen-cant').textContent = '(' + textoCantidad + ')';
  document.getElementById('ck-resumen-total').textContent = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('ck-total').textContent = '$ ' + total.toLocaleString('es-AR');

  // 2. Fecha mínima: 2 días hábiles, o 3 si hay algún plato personalizado.
  //    flatMap junta en una sola lista los platos de todos los combos.
  //    Ejemplo: entra [{ platos: [fideos x3] }, { platos: [fideos x2 "sin sal"] }] → sale [fideos x3, fideos x2 "sin sal"]
  //    some responde true si AL MENOS UNO cumple: [fideos x3, fideos x2 "sin sal"] → true
  const platosDelCarrito = carritoCombos.flatMap(combo => combo.platos);
  const hayPersonalizado = platosDelCarrito.some(plato => plato.personalizado);
  const diasHabiles = hayPersonalizado ? DIAS_HABILES_CON_PERSONALIZADO : DIAS_HABILES_ENTREGA;
  const aclaracionPersonalizado = hayPersonalizado ? ' (un día hábil más por los platos personalizados)' : '';

  const inputFecha = document.getElementById('ck-fecha');
  inputFecha.min = fechaLocalISO(sumarDiasHabiles(new Date(), diasHabiles));
  // Si había una fecha elegida que ya no alcanza, se borra
  const fechaQueNoAlcanza = inputFecha.value !== '' && inputFecha.value < inputFecha.min;
  if (fechaQueNoAlcanza) inputFecha.value = '';
  document.getElementById('ck-fecha-ayuda').textContent =
    'La primera fecha posible es el ' + fechaDDMMAAAA(parseFechaLocal(inputFecha.min)) + aclaracionPersonalizado + '.';

  // 3. Si el cliente inició sesión, se completan solos los campos vacíos con sus datos.
  //    Los mismos 5 campos que completa el formulario viejo (preLlenarFormulario).
  const usuarioId = localStorage.getItem('usuario_id');     // lo guarda el login (null si no inició sesión)
  const datosDeSesion = {
    'ck-nombre':    localStorage.getItem('usuario_nombre') || '',
    'ck-apellido':  localStorage.getItem('usuario_apellido') || '',
    'ck-email':     localStorage.getItem('usuario_email') || '',
    'ck-telefono':  localStorage.getItem('usuario_telefono') || '',
    'ck-direccion': localStorage.getItem('usuario_direccion') || ''
  };
  // Object.keys da la lista de nombres de un objeto. Sin sesión, la lista queda vacía y no se completa nada.
  // Ejemplo: { 'ck-nombre': 'Ana', 'ck-email': '' } → ['ck-nombre', 'ck-email']
  const camposACompletar = usuarioId ? Object.keys(datosDeSesion) : [];
  camposACompletar.forEach(idCampo => {
    const campo = document.getElementById(idCampo);
    // Si el campo ya tiene algo escrito, no se pisa: return = saltear este y seguir con el siguiente
    if (campo.value) return;
    campo.value = datosDeSesion[idCampo];
  });

  // 4. Errores limpios, el barrio visible solo si está elegido el envío, y la lista de barrios
  document.querySelectorAll('#form-pedido .campo__error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  // ?. = "si hay una opción marcada, su valor" (sin ninguna marcada da undefined: no es envío)
  const entregaElegida = document.querySelector('#form-pedido input[name="entrega"]:checked');
  const conEnvio = entregaElegida?.value === ENTREGA_ENVIO;
  document.getElementById('ck-grupo-barrio').hidden = !conEnvio;
  cargarBarrios();

  // 5. Se muestra el formulario (no la confirmación) y se abre la ventana
  document.getElementById('ck-vista-form').hidden = false;
  document.getElementById('ck-vista-ok').hidden = true;
  document.getElementById('modal-checkout').showModal();
}

// ── Pide los barrios al servidor y llena el select (una sola vez) ─────────
// ENTRADA: nada
// SALIDA:  nada (el select "Barrio" con una opción por barrio). Si ya estaban cargados no hace nada;
//          si falla, escribe un aviso debajo del campo.
// Ej: GET /api/barrios → [{ id: 3, nombre: 'Centro' }] → una opción "Centro" con valor 3
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
// ENTRADA: nada (lee los campos del formulario)
// SALIDA:  { nombre, apellido, direccion, telefono, email, fecha, metodoPago, tipoEntrega, barrioId, observaciones }
//          con los datos limpios, o null si algún campo está mal (y escribe el error debajo de ese campo)
// Ej: Nombre "Ana", Apellido vacío y un sábado de fecha → null, y debajo: "Escribí tu apellido."
//     y "Ese día no entregamos (feriado o fin de semana). Elegí otro."
function validarFormulario() {
  const formulario = document.getElementById('form-pedido');

  // 1. Se lee cada campo (Nombre, Apellido, Dirección, Teléfono y Email sin espacios de más, como en el viejo)
  const nombre = document.getElementById('ck-nombre').value.trim();
  const apellido = document.getElementById('ck-apellido').value.trim();
  const direccion = document.getElementById('ck-direccion').value.trim();
  const telefono = document.getElementById('ck-telefono').value.trim();
  const email = document.getElementById('ck-email').value.trim();            // opcional: si no se escribe va ''
  const inputFecha = document.getElementById('ck-fecha');
  const fecha = inputFecha.value;                                            // 'AAAA-MM-DD', o '' si no eligió
  // Método de Pago y Tipo de Entrega: la opción marcada (vienen elegidos Efectivo y Delivery, como en el viejo).
  // ?. = "si hay una marcada, su valor"; || '' = si no hay ninguna, vacío
  const metodoPago = formulario.querySelector('input[name="pago"]:checked')?.value || '';
  const tipoEntrega = formulario.querySelector('input[name="entrega"]:checked')?.value || '';
  const observaciones = document.getElementById('ck-observaciones').value;   // opcional: va tal cual se escribió

  // 2. Las cuentas que usan los controles de abajo
  // Email: si se escribe, tiene que tener la forma algo@algo.algo (el viejo también lo controla:
  // su campo es type="email"). Ejemplo: 'ana@mail.com' → sí · 'ana@mail' → no
  const emailConForma = email.length <= LARGO_MAXIMO.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailMalEscrito = email !== '' && !emailConForma;
  // Barrio: obligatorio SOLO con envío a domicilio. Con retiro va null.
  const conEnvio = tipoEntrega === ENTREGA_ENVIO;
  const barrioElegido = Number(document.getElementById('ck-barrio').value);   // sin elegir: '' → 0
  const barrioValido = Number.isInteger(barrioElegido) && barrioElegido > 0;
  const faltaBarrio = conEnvio && !barrioValido;
  const vaConBarrio = conEnvio && barrioValido;
  const barrioId = vaConBarrio ? barrioElegido : null;
  // La primera fecha posible (la puso abrirCheckout), para el mensaje. Ej: '2026-10-20' → '20/10/2026'
  const primeraFecha = fechaDDMMAAAA(parseFechaLocal(inputFecha.min));

  // 3. Los controles de cada campo, en orden: { estaMal, mensaje }.
  //    De cada campo vale el PRIMERO que está mal (como un "si no, si no").
  //    Ej: Apellido vacío → 'Escribí tu apellido.' (el del largo ya no cuenta)
  const controles = {
    'err-nombre': [
      { estaMal: nombre === '', mensaje: 'Escribí tu nombre.' }
    ],
    // Nombre y Apellido juntos ("Nombre Apellido") son cliente_nombre: entre los dos, hasta 100 caracteres
    'err-apellido': [
      { estaMal: apellido === '', mensaje: 'Escribí tu apellido.' },
      { estaMal: (nombre + ' ' + apellido).length > LARGO_MAXIMO.nombreCompleto,
        mensaje: 'Nombre y apellido juntos: hasta ' + LARGO_MAXIMO.nombreCompleto + ' caracteres.' }
    ],
    // Dirección: obligatoria siempre, como en el viejo (aunque sea retiro en el local)
    'err-direccion': [
      { estaMal: direccion === '', mensaje: 'Escribí tu dirección.' },
      { estaMal: direccion.length > LARGO_MAXIMO.direccion, mensaje: 'Hasta ' + LARGO_MAXIMO.direccion + ' caracteres.' }
    ],
    // Teléfono: obligatorio, como en el viejo
    'err-telefono': [
      { estaMal: telefono === '', mensaje: 'Escribí tu teléfono.' },
      { estaMal: telefono.length > LARGO_MAXIMO.telefono, mensaje: 'Hasta ' + LARGO_MAXIMO.telefono + ' caracteres.' }
    ],
    'err-email': [
      { estaMal: emailMalEscrito, mensaje: 'Revisá el email (o dejalo vacío).' }
    ],
    // Fecha: obligatoria, día hábil y no antes de la fecha mínima
    'err-fecha': [
      { estaMal: fecha === '', mensaje: 'Elegí la fecha de entrega.' },
      { estaMal: !esDiaHabil(parseFechaLocal(fecha)), mensaje: 'Ese día no entregamos (feriado o fin de semana). Elegí otro.' },
      { estaMal: fecha < inputFecha.min, mensaje: 'La primera fecha posible es el ' + primeraFecha + '.' }
    ],
    'err-pago': [
      { estaMal: metodoPago === '', mensaje: 'Elegí el método de pago.' }
    ],
    'err-entrega': [
      { estaMal: tipoEntrega === '', mensaje: 'Elegí el tipo de entrega.' }
    ],
    'err-barrio': [
      { estaMal: faltaBarrio, mensaje: 'Seleccioná tu barrio.' }
    ],
    'err-observaciones': [
      { estaMal: observaciones.length > LARGO_MAXIMO.observaciones, mensaje: 'Hasta ' + LARGO_MAXIMO.observaciones + ' caracteres.' }
    ]
  };

  // 4. Se borran los errores anteriores y se escribe, debajo de cada campo, su primer control que falla
  formulario.querySelectorAll('.campo__error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  let hayErrores = false;
  // Object.keys da la lista de nombres del objeto. Ej: { 'err-nombre': [...], 'err-pago': [...] } → ['err-nombre', 'err-pago']
  Object.keys(controles).forEach(idError => {
    // find = el primer control que está mal (o undefined si están todos bien).
    // Ej: [{ estaMal: true, mensaje: 'Escribí tu apellido.' }, { estaMal: false, … }] → el primero
    const controlQueFalla = controles[idError].find(control => control.estaMal);
    // Este campo está bien: return = saltear este y seguir con el siguiente
    if (!controlQueFalla) return;
    document.getElementById(idError).textContent = controlQueFalla.mensaje;
    hayErrores = true;
  });

  // 5. Con algún error no se sigue; si están todos bien, los datos limpios
  if (hayErrores) return null;
  return { nombre, apellido, direccion, telefono, email, fecha, metodoPago, tipoEntrega, barrioId, observaciones };
}

// ── Junta el carrito y los datos en el pedido que se manda al servidor ────
// ENTRADA: datos = lo que devolvió validarFormulario
// SALIDA:  el pedido para POST /api/pedidos-combos (sin precios, sin total y sin usuario)
// Ej: carrito [Mantenimiento x10 con 8 fideos + 2 fideos "sin sal"] + datos de Ana López →
//     { combos: [{ id_combo: 1, platos: [{ producto_id: 5, cantidad: 8, personalizado: null },
//                                        { producto_id: 5, cantidad: 2, personalizado: 'sin sal' }] }],
//       cliente_nombre: 'Ana López', ... }
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
// ENTRADA: evento = el "submit" del formulario
// SALIDA:  nada. Si salió bien: carrito vacío, formulario limpio y la confirmación a la vista.
//          Si no: el mensaje debajo del botón (y si faltan viandas, los combos se vuelven a pedir).
// Ej: pide 16 fideos y quedan 12 → "No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12"
//     y el menú se recarga mostrando que quedan 12
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

  // Si no alcanzan las viandas de un plato (otro cliente se las llevó), se vuelven a pedir los combos
  // (combosCatalogo.js), en la misma categoría: así el menú muestra lo que queda al armar el combo de nuevo.
  // startsWith = "empieza con". Ej: 'No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12' → sí
  const faltanViandas = !resultado.ok && resultado.error.startsWith('No quedan suficientes viandas');
  if (faltanViandas) cargarCombos(true);

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
// ENTRADA: pedido = lo que armó armarPedido
// SALIDA:  { ok: true, respuesta } con lo que devolvió el servidor, o { ok: false, error: 'mensaje para el cliente' }
// Ej: 200 → { ok: true, respuesta: { id_pedido: 251, total: 137000, combos: [...] } }
//     400 → { ok: false, error: 'No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12' }
//     500 o sin internet → { ok: false, error: 'No pudimos enviar tu pedido. Probá de nuevo en unos minutos.' }
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
    if (respuesta.ok) return { ok: true, respuesta: cuerpo };

    // 400 (algún dato mal, un combo que ya no está) o 429 (demasiados pedidos seguidos):
    // el servidor manda un mensaje pensado para el cliente
    const esErrorConAviso = respuesta.status === 400 || respuesta.status === 429;
    const traeMensaje = esErrorConAviso && cuerpo.error;
    if (traeMensaje) return { ok: false, error: cuerpo.error };

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
// ENTRADA: respuesta = lo que devolvió el servidor (id_pedido, total, combos con sus platos)
//          datos     = lo que devolvió validarFormulario
// SALIDA:  nada (la vista "¡Recibimos tu pedido #N!" con el botón de WhatsApp)
// Ej: { id_pedido: 251, total: 137000, combos: [Mantenimiento x10: 8 fideos + 2 fideos (sin sal)] }
//     → "¡Recibimos tu pedido #251!", "Total: $ 137.000"
function mostrarConfirmacion(respuesta, datos) {
  // Combos con sus platos: nombres y precios que guardó el servidor (los de la base)
  let combosHtml = '';
  respuesta.combos.forEach(combo => {
    const precio = Number(combo.precio).toLocaleString('es-AR');

    // map arma una lista nueva con un <li> por plato y join la une en un solo texto.
    // Ejemplo: entra [{ cantidad: 8, nombre: 'fideos' }, { cantidad: 2, nombre: 'fideos', personalizado: 'sin sal' }]
    //          sale  '<li>8 × fideos</li><li>2 × fideos (sin sal)</li>'
    const platosHtml = combo.platos.map(plato => {
      const aclaracion = plato.personalizado ? ' (' + escHtml(plato.personalizado) + ')' : '';  // solo el personalizado
      return '<li>' + escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre) + aclaracion + '</li>';
    }).join('');

    combosHtml += `
      <div class="confirmacion__combo">
        <p><strong>${escHtml(combo.nombre)}</strong> · $ ${escHtml(precio)}</p>
        <ul>${platosHtml}</ul>
      </div>`;
  });

  // Entrega, fecha, total y (si es transferencia) el alias
  const conEnvio = datos.tipoEntrega === ENTREGA_ENVIO;
  const textoEntrega = conEnvio ? 'Envío a domicilio: ' + datos.direccion : 'Retiro en el local';
  const fechaEntrega = fechaDDMMAAAA(parseFechaLocal(datos.fecha));
  const total = Number(respuesta.total).toLocaleString('es-AR');
  const conTransferencia = datos.metodoPago === 'Transferencia';
  const notaTransferencia = conTransferencia ? '<p class="nota">Alias: ' + escHtml(ALIAS_TRANSFERENCIA) + '</p>' : '';

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
// ENTRADA: respuesta = lo que devolvió el servidor · datos = lo que devolvió validarFormulario
// SALIDA:  el enlace 'https://wa.me/5493512294243?text=...' con el mensaje adentro
// Ej: pedido #251 → '...Pedido: #251 ... 1x PRUEBA Mantenimiento x10: $137.000\n   - 8 fideos\n   - 2 fideos (sin sal)...'
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
      const aclaracion = plato.personalizado ? ' (' + plato.personalizado + ')' : '';   // solo el personalizado
      return '   - ' + plato.cantidad + ' ' + plato.nombre + aclaracion;
    }).join('\n');

    lineasCombos += '1x ' + combo.nombre + ': $' + Number(combo.precio).toLocaleString('es-AR') + '\n' + lineasPlatos + '\n';
  });

  // Igual que el viejo: el alias solo con transferencia, y la dirección solo con delivery
  const conTransferencia = datos.metodoPago === 'Transferencia';
  const lineaAlias = conTransferencia ? '► ALIAS: ' + ALIAS_TRANSFERENCIA + '\n\n' : '\n';
  const conEnvio = datos.tipoEntrega === ENTREGA_ENVIO;
  const lineaEntrega = conEnvio ? 'Entrega: Delivery\nDirección: ' + datos.direccion : 'Entrega: Retiro en local';

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
    const diaSinEntrega = campoFecha.value !== '' && !esDiaHabil(parseFechaLocal(campoFecha.value));
    if (diaSinEntrega) {
      document.getElementById('err-fecha').textContent = 'Ese día no entregamos (feriado o fin de semana). Elegí otro.';
      campoFecha.value = '';
    }
  });

  // Cerrar: con la ✕, "Volver al inicio" o un clic en el fondo oscuro (la ventana misma)
  ventana.addEventListener('click', evento => {
    const tocoCerrar = evento.target.closest('[data-accion="cerrar"]') !== null;   // closest = el botón, o null
    const hayQueCerrar = evento.target === ventana || tocoCerrar;
    if (hayQueCerrar) ventana.close();
  });
});





