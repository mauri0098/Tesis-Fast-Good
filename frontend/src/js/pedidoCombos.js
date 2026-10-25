
// ====================================================================
// PEDIDOCOMBOS.JS — Ventana "Finalizar pedido" de index.html
//
// Funciones:
//   abrirFinalizarPedido → arma el resumen, pone la fecha mínima, completa los datos de la sesión
//                          y abre el modal "Finalizar pedido" con el formulario
//   renderizarDiasEntrega → dibuja los próximos 5 días de entrega como botones (se ven en el celu) y marca el elegido;
//                          el botón que se toca escribe su fecha en el campo de fecha de siempre
//   cargarBarrios     → pide la lista de barrios al servidor (una sola vez) y llena el select
//   validarFormulario → controla cada campo, escribe los errores debajo y devuelve los datos limpios (o null)
//   armarPedido       → junta el carrito y los datos del formulario en el pedido que se manda al servidor
//   confirmarPedido   → lo que pasa al tocar "Confirmar pedido": valida, arma, manda, y si salió bien
//                       vacía el carrito y muestra la confirmación (si no, muestra el error; si el error es
//                       "No quedan suficientes viandas…", además vuelve a pedir los combos: paso H8)
//   enviarPedido      → manda el pedido a POST /api/pedidos-combos y traduce la respuesta a
//                       { ok: true, respuesta } o { ok: false, error: "mensaje para el cliente" }
//   mostrarConfirmacion  → dibuja "¡Recibimos tu pedido #N!" con lo que devolvió el servidor y el botón de WhatsApp
//                          (y deja detrás las categorías: en el celu se cierra la pantalla de combos)
//   armarMensajeWhatsApp → arma el mensaje (mismo formato que el formulario viejo) y devuelve el enlace de WhatsApp
//
// Los campos son los mismos que el formulario viejo (pages/formulario.html + formulario.js, borrados el 17/10)
// y el pedido se arma igual que ahí (cliente_nombre = "Nombre Apellido", etc.).
// Los controles de acá son una AYUDA: el servidor vuelve a controlar todo.
// El pedido NO lleva precios, total ni usuario: el servidor los saca de la base y del token.
// Necesita antes: escape.js (escHtml), fechas.js (días hábiles), api.js (apiFetch),
// combosCatalogo.js (cargarCombos, volverACategorias) y carritoCombos.js (carritoCombos, guardarCarrito, renderizarCarrito).
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

// Las reglas de la fecha de entrega (HORA_CORTE = 21, DIAS_HABILES_ENTREGA = 0, DIAS_HABILES_CON_PERSONALIZADO = 2)
// y la cuenta de la primera fecha (primeraFechaEntrega) están en fechas.js (25/10): las mismas que controla el servidor.

// Valores EXACTOS que acepta el servidor (los mismos que usa el formulario viejo)
const ENTREGA_ENVIO = 'Delivery';

// Botones de días (celu): el nombre de cada día, según getDay() (0 = domingo … 6 = sábado).
// El corto se ve en el botón ("Mar"); el largo lo lee un lector de pantalla ("martes 21/10/2026")
const NOMBRES_DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const NOMBRES_DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Para no pedir los barrios cada vez que se abre la ventana
let barriosCargados = false;

// ── Prepara y abre la ventana del formulario ──────────────────────────────
// ENTRADA: nada (usa carritoCombos, el carrito de carritoCombos.js)
// SALIDA:  nada (la ventana "Finalizar pedido" abierta: resumen, total, fecha mínima y los datos de la sesión).
//          El resumen va abierto en compu (a la derecha) y cerrado en el celular (se abre al tocarlo).
// Ej: carrito con "Mantenimiento x10" (8 fideos + 2 fideos "sin sal") → "(1 combo)", total $ 137.000
//     y la primera fecha posible a 2 días hábiles (un día de producción en el medio, por el "sin sal")
function abrirFinalizarPedido() {
  // Sin combos no hay nada que finalizar
  if (carritoCombos.length === 0) return;

  // Se cierra "Mi pedido" (la ventana del carrito)
  document.getElementById('modal-pedido').close();

  // 1. Resumen: cada combo con su precio y sus platos, y el total (solo para mostrar)
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

    // Un renglón por combo: nombre y precio arriba, los platos debajo
    html += `
      <li class="resumen-combo">
        <div class="nombre-y-precio">
          <span>${escHtml(combo.nombre)}</span>
          <span>$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
        </div>
        <span class="resumen-platos">${platosTexto}</span>
      </li>`;
  });
  document.getElementById('resumen-lista').innerHTML = html;

  // La cantidad de combos y el total, en los 3 lugares donde se ven: el título del resumen,
  // el renglón "Total" del resumen y el pie, al lado de "Confirmar pedido"
  const textoCantidad = carritoCombos.length === 1 ? '1 combo' : carritoCombos.length + ' combos';  // ej: "3 combos"
  const textoTotal = '$ ' + total.toLocaleString('es-AR');                                           // ej: "$ 137.000"
  document.getElementById('resumen-cantidad').textContent = '(' + textoCantidad + ')';
  document.getElementById('resumen-total-titulo').textContent = textoTotal;
  document.getElementById('resumen-total').textContent = textoTotal;
  document.getElementById('total-a-pagar').textContent = textoTotal;
  document.getElementById('total-en-boton').textContent = textoTotal;   // en el celu: "Confirmar pedido · $ 137.000"

  // En compu el resumen va abierto (fijo, a la derecha); en el celular arranca cerrado y se abre al tocarlo.
  // matchMedia pregunta si la pantalla cumple esa medida. Ej: compu de 1440 px → true · celular de 390 px → false
  document.getElementById('resumen-pedido').open = window.matchMedia('(min-width: 900px)').matches;

  // 2. Fecha mínima (24/10): desde hoy si todo sale de la heladera, o 2 días hábiles si hay algún plato personalizado.
  //    flatMap junta en una sola lista los platos de todos los combos.
  //    Ejemplo: entra [{ platos: [fideos x3] }, { platos: [fideos x2 "sin sal"] }] → sale [fideos x3, fideos x2 "sin sal"]
  //    some responde true si AL MENOS UNO cumple: [fideos x3, fideos x2 "sin sal"] → true
  const platosDelCarrito = carritoCombos.flatMap(combo => combo.platos);
  const hayPersonalizado = platosDelCarrito.some(plato => plato.personalizado);

  // La primera fecha (25/10: primeraFechaEntrega, de fechas.js, con el día y la hora de Argentina y el corte de las 21).
  // Ej: hoy sábado y todo de heladera → el lunes · hoy martes con un "sin sal" → el jueves
  //     · hoy lunes a las 21:01, todo de heladera → el martes (pasoElCorte: true)
  // Es solo para ayudar al cliente: el que controla de verdad es el servidor (POST /api/pedidos-combos).
  const primera = primeraFechaEntrega(hayPersonalizado);          // { fecha, pasoElCorte }
  // Por qué no se puede antes (para el texto de abajo): por los personalizados, o porque pasó la hora de corte
  let aclaracionPersonalizado = '';
  if (hayPersonalizado) aclaracionPersonalizado = ' (por los platos personalizados: hay un día de producción en el medio)';
  if (primera.pasoElCorte) aclaracionPersonalizado = ' (los pedidos de la heladera hechos desde las ' + HORA_CORTE + ' h se entregan desde el próximo día hábil)';
  const campoFecha = document.getElementById('campo-fecha');
  campoFecha.min = fechaLocalISO(primera.fecha);
  // Si había una fecha elegida que ya no alcanza, se borra
  const fechaQueNoAlcanza = campoFecha.value !== '' && campoFecha.value < campoFecha.min;
  if (fechaQueNoAlcanza) campoFecha.value = '';
  document.getElementById('fecha-primera-posible').textContent =
    'La primera fecha posible es el ' + fechaDDMMAAAA(parseFechaLocal(campoFecha.min)) + aclaracionPersonalizado + '.';
  // En el celu, los 5 días como botones (desde la fecha mínima de recién)
  renderizarDiasEntrega();

  // 3. Si el cliente inició sesión, se completan solos los campos vacíos con sus datos.
  //    Los mismos 5 campos que completa el formulario viejo (preLlenarFormulario).
  const usuarioId = localStorage.getItem('usuario_id');     // lo guarda el login (null si no inició sesión)
  const datosDeSesion = {
    'campo-nombre':    localStorage.getItem('usuario_nombre') || '',
    'campo-apellido':  localStorage.getItem('usuario_apellido') || '',
    'campo-email':     localStorage.getItem('usuario_email') || '',
    'campo-telefono':  localStorage.getItem('usuario_telefono') || '',
    'campo-direccion': localStorage.getItem('usuario_direccion') || ''
  };
  // Object.keys da la lista de nombres de un objeto. Sin sesión, la lista queda vacía y no se completa nada.
  // Ejemplo: { 'campo-nombre': 'Ana', 'campo-email': '' } → ['campo-nombre', 'campo-email']
  const camposACompletar = usuarioId ? Object.keys(datosDeSesion) : [];
  camposACompletar.forEach(idCampo => {
    const campo = document.getElementById(idCampo);
    // Si el campo ya tiene algo escrito, no se pisa: return = saltear este y seguir con el siguiente
    if (campo.value) return;
    campo.value = datosDeSesion[idCampo];
  });

  // 4. Errores limpios, el barrio visible solo si está elegido el envío, y la lista de barrios
  document.querySelectorAll('#formulario-pedido .campo-error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  // ?. = "si hay una opción marcada, su valor" (sin ninguna marcada da undefined: no es envío)
  const entregaElegida = document.querySelector('#formulario-pedido input[name="entrega"]:checked');
  const conEnvio = entregaElegida?.value === ENTREGA_ENVIO;
  document.getElementById('grupo-barrio').hidden = !conEnvio;
  cargarBarrios();

  // 5. Se muestra el formulario (no la confirmación) y se abre la ventana
  document.getElementById('vista-formulario').hidden = false;
  document.getElementById('vista-confirmacion').hidden = true;
  document.getElementById('modal-finalizar').showModal();
}

// ── Los próximos 5 días de entrega como botones (se ven en el celu) ────────
// ENTRADA: nada (usa la fecha mínima que puso abrirFinalizarPedido en el campo de fecha: campoFecha.min)
// SALIDA:  nada (dibuja en #dias-entrega un botón por día hábil, desde el primero posible, y marca el elegido).
//          En el celu, si la fecha elegida no es uno de esos días (o todavía no hay), se elige el primero.
//          La fecha va al campo de fecha de siempre: es el que se controla y se manda (mismo valor 'AAAA-MM-DD').
// Ej: hoy sábado 17/10, primera fecha posible martes 20/10 → [Mar 20] [Mié 21] [Jue 22] [Vie 23] [Lun 26],
//     con "Mar 20" marcado y el campo de fecha en '2026-10-20'
function renderizarDiasEntrega() {
  const campoFecha = document.getElementById('campo-fecha');
  const primerDia = parseFechaLocal(campoFecha.min);   // ya es un día hábil (lo calculó abrirFinalizarPedido)

  // Los 5 días: el primero posible y los días hábiles que le siguen (salteando fines de semana y feriados).
  // map arma una lista nueva: por cada número n, el día hábil que está n días hábiles después del primero.
  // Ej: [0, 1, 2, 3, 4] con primer día martes 20/10 → [mar 20, mié 21, jue 22, vie 23, lun 26]
  const dias = [0, 1, 2, 3, 4].map(n => sumarDiasHabiles(primerDia, n));
  const fechasDeLosBotones = dias.map(dia => fechaLocalISO(dia));   // Ej: ['2026-10-20', '2026-10-21', …]

  // En el celu el primer día viene elegido (si la fecha de antes no es uno de estos 5). En compu no se toca:
  // ahí se elige con el campo de fecha, como siempre.
  // matchMedia pregunta si la pantalla cumple esa medida. Ej: celular de 390 px → true · compu de 1440 px → false
  const esCelu = window.matchMedia('(max-width: 767px)').matches;
  const estaEnLosBotones = fechasDeLosBotones.includes(campoFecha.value);   // includes = "está en la lista"
  const hayQueElegirElPrimero = esCelu && !estaEnLosBotones;
  if (hayQueElegirElPrimero) campoFecha.value = fechasDeLosBotones[0];

  // Un botón por día: "Mar" arriba y "21" abajo. El elegido va con aria-pressed="true" (el CSS lo pinta de verde
  // y los lectores de pantalla dicen "presionado"). Los textos los arma esta función: no vienen de la base.
  let html = '';
  dias.forEach((dia, indice) => {
    const fechaISO = fechasDeLosBotones[indice];
    const estaElegido = fechaISO === campoFecha.value;   // true o false
    const nombreCorto = NOMBRES_DIAS_CORTOS[dia.getDay()];
    const nombreLargo = NOMBRES_DIAS_LARGOS[dia.getDay()] + ' ' + fechaDDMMAAAA(dia);
    html += `
      <button type="button" class="dia-entrega" data-fecha="${fechaISO}" aria-pressed="${estaElegido}" aria-label="${nombreLargo}">
        <small>${nombreCorto}</small><b>${dia.getDate()}</b>
      </button>`;
  });
  document.getElementById('dias-entrega').innerHTML = html;
}

// ── Pide los barrios al servidor y llena el select (una sola vez) ─────────
// ENTRADA: nada
// SALIDA:  nada (el select "Barrio" con una opción por barrio). Si ya estaban cargados no hace nada;
//          si falla, escribe un aviso debajo del campo.
// Ej: GET /api/barrios → [{ id: 3, nombre: 'Centro' }] → una opción "Centro" con valor 3
async function cargarBarrios() {
  if (barriosCargados) return;

  const campoBarrio = document.getElementById('campo-barrio');
  try {
    const respuesta = await fetch('/api/barrios');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    const barrios = await respuesta.json();

    // Una opción por barrio. textContent muestra el nombre tal cual (no se ejecuta como HTML).
    barrios.forEach(barrio => {
      const opcion = document.createElement('option');
      opcion.value = barrio.id;
      opcion.textContent = barrio.nombre;
      campoBarrio.appendChild(opcion);
    });
    barriosCargados = true;
  } catch (error) {
    // Al cliente, un mensaje simple; el detalle queda en la consola
    console.error('Error al cargar los barrios:', error);
    document.getElementById('error-barrio').textContent = 'No pudimos cargar los barrios. Probá de nuevo en un momento.';
  }
}

// ── Controla cada campo; devuelve los datos limpios o null si hay errores ──
// ENTRADA: nada (lee los campos del formulario)
// SALIDA:  { nombre, apellido, direccion, telefono, email, fecha, metodoPago, tipoEntrega, barrioId, observaciones }
//          con los datos limpios, o null si algún campo está mal (y escribe el error debajo de ese campo)
// Ej: Nombre "Ana", Apellido vacío y un sábado de fecha → null, y debajo: "Escribí tu apellido."
//     y "Ese día no entregamos (feriado o fin de semana). Elegí otro."
function validarFormulario() {
  const formulario = document.getElementById('formulario-pedido');

  // 1. Se lee cada campo (Nombre, Apellido, Dirección, Teléfono y Email sin espacios de más, como en el viejo)
  const nombre = document.getElementById('campo-nombre').value.trim();
  const apellido = document.getElementById('campo-apellido').value.trim();
  const direccion = document.getElementById('campo-direccion').value.trim();
  const telefono = document.getElementById('campo-telefono').value.trim();
  const email = document.getElementById('campo-email').value.trim();            // opcional: si no se escribe va ''
  const campoFecha = document.getElementById('campo-fecha');
  const fecha = campoFecha.value;                                            // 'AAAA-MM-DD', o '' si no eligió
  // Método de Pago y Tipo de Entrega: la opción marcada (vienen elegidos Efectivo y Delivery, como en el viejo).
  // ?. = "si hay una marcada, su valor"; || '' = si no hay ninguna, vacío
  const metodoPago = formulario.querySelector('input[name="pago"]:checked')?.value || '';
  const tipoEntrega = formulario.querySelector('input[name="entrega"]:checked')?.value || '';
  const observaciones = document.getElementById('campo-observaciones').value;   // opcional: va tal cual se escribió

  // 2. Las cuentas que usan los controles de abajo
  // Email: si se escribe, tiene que tener la forma algo@algo.algo (el viejo también lo controla:
  // su campo es type="email"). Ejemplo: 'ana@mail.com' → sí · 'ana@mail' → no
  const emailConForma = email.length <= LARGO_MAXIMO.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailMalEscrito = email !== '' && !emailConForma;
  // Barrio: obligatorio SOLO con envío a domicilio. Con retiro va null.
  const conEnvio = tipoEntrega === ENTREGA_ENVIO;
  const barrioElegido = Number(document.getElementById('campo-barrio').value);   // sin elegir: '' → 0
  const barrioValido = Number.isInteger(barrioElegido) && barrioElegido > 0;
  const faltaBarrio = conEnvio && !barrioValido;
  const vaConBarrio = conEnvio && barrioValido;
  const barrioId = vaConBarrio ? barrioElegido : null;
  // La primera fecha posible (la puso abrirFinalizarPedido), para el mensaje. Ej: '2026-10-20' → '20/10/2026'
  const primeraFecha = fechaDDMMAAAA(parseFechaLocal(campoFecha.min));

  // 3. Los controles de cada campo, en orden: { estaMal, mensaje }.
  //    De cada campo vale el PRIMERO que está mal (como un "si no, si no").
  //    Ej: Apellido vacío → 'Escribí tu apellido.' (el del largo ya no cuenta)
  const controles = {
    'error-nombre': [
      { estaMal: nombre === '', mensaje: 'Escribí tu nombre.' }
    ],
    // Nombre y Apellido juntos ("Nombre Apellido") son cliente_nombre: entre los dos, hasta 100 caracteres
    'error-apellido': [
      { estaMal: apellido === '', mensaje: 'Escribí tu apellido.' },
      { estaMal: (nombre + ' ' + apellido).length > LARGO_MAXIMO.nombreCompleto,
        mensaje: 'Nombre y apellido juntos: hasta ' + LARGO_MAXIMO.nombreCompleto + ' caracteres.' }
    ],
    // Dirección: obligatoria siempre, como en el viejo (aunque sea retiro en el local)
    'error-direccion': [
      { estaMal: direccion === '', mensaje: 'Escribí tu dirección.' },
      { estaMal: direccion.length > LARGO_MAXIMO.direccion, mensaje: 'Hasta ' + LARGO_MAXIMO.direccion + ' caracteres.' }
    ],
    // Teléfono: obligatorio, como en el viejo
    'error-telefono': [
      { estaMal: telefono === '', mensaje: 'Escribí tu teléfono.' },
      { estaMal: telefono.length > LARGO_MAXIMO.telefono, mensaje: 'Hasta ' + LARGO_MAXIMO.telefono + ' caracteres.' }
    ],
    'error-email': [
      { estaMal: emailMalEscrito, mensaje: 'Revisá el email (o dejalo vacío).' }
    ],
    // Fecha: obligatoria, día hábil y no antes de la fecha mínima
    'error-fecha': [
      { estaMal: fecha === '', mensaje: 'Elegí la fecha de entrega.' },
      { estaMal: !esDiaHabil(parseFechaLocal(fecha)), mensaje: 'Ese día no entregamos (feriado o fin de semana). Elegí otro.' },
      { estaMal: fecha < campoFecha.min, mensaje: 'La primera fecha posible es el ' + primeraFecha + '.' }
    ],
    'error-pago': [
      { estaMal: metodoPago === '', mensaje: 'Elegí el método de pago.' }
    ],
    'error-entrega': [
      { estaMal: tipoEntrega === '', mensaje: 'Elegí el tipo de entrega.' }
    ],
    'error-barrio': [
      { estaMal: faltaBarrio, mensaje: 'Seleccioná tu barrio.' }
    ],
    'error-observaciones': [
      { estaMal: observaciones.length > LARGO_MAXIMO.observaciones, mensaje: 'Hasta ' + LARGO_MAXIMO.observaciones + ' caracteres.' }
    ]
  };

  // 4. Se borran los errores anteriores y se escribe, debajo de cada campo, su primer control que falla
  formulario.querySelectorAll('.campo-error').forEach(parrafo => {
    parrafo.textContent = '';
  });
  let hayErrores = false;
  // Object.keys da la lista de nombres del objeto. Ej: { 'error-nombre': [...], 'error-pago': [...] } → ['error-nombre', 'error-pago']
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

  // Los datos del cliente, armados IGUAL que el formulario viejo (armarObjetoPedido de formulario.js, ya borrado).
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
  const errorEnvio = document.getElementById('error-envio');
  errorEnvio.textContent = '';

  const datos = validarFormulario();
  if (!datos) return;

  const pedido = armarPedido(datos);

  // El botón se apaga mientras se envía: así un doble clic no crea dos pedidos.
  // Se cambia solo su texto (el span de adentro): al lado está el total, que en el celu se ve dentro del botón
  const boton = document.getElementById('boton-confirmar-pedido');
  const textoBoton = document.getElementById('boton-confirmar-texto');
  boton.disabled = true;
  textoBoton.textContent = 'Enviando pedido...';

  const resultado = await enviarPedido(pedido);

  boton.disabled = false;
  textoBoton.textContent = 'Confirmar pedido';

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
  document.getElementById('formulario-pedido').reset();

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
// SALIDA:  nada (la vista "¡Recibimos tu pedido #N!": la ✓ grande, fecha, entrega y pago, el resumen
//          y el botón de WhatsApp)
// Ej: { id_pedido: 251, total: 137000, combos: [Mantenimiento x10: 8 fideos + 2 fideos (sin sal)] }
//     → "¡Recibimos tu pedido #251!" y en el resumen "Total  $ 137.000"
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

    // Un renglón por combo: nombre y precio arriba, los platos debajo (uno por renglón)
    combosHtml += `
        <li class="resumen-combo">
          <div class="nombre-y-precio">
            <span>${escHtml(combo.nombre)}</span>
            <span>$ ${escHtml(precio)}</span>
          </div>
          <ul class="combo-platos">${platosHtml}</ul>
        </li>`;
  });

  // Entrega, fecha, total y (si es transferencia) el alias
  const conEnvio = datos.tipoEntrega === ENTREGA_ENVIO;
  const textoEntrega = conEnvio ? 'Envío a domicilio: ' + datos.direccion : 'Retiro en el local';
  const fechaEntrega = fechaDDMMAAAA(parseFechaLocal(datos.fecha));
  const total = Number(respuesta.total).toLocaleString('es-AR');
  const conTransferencia = datos.metodoPago === 'Transferencia';
  const notaTransferencia = conTransferencia ? '<p class="nota">Alias: ' + escHtml(ALIAS_TRANSFERENCIA) + '</p>' : '';

  // 29/10: el número se escribe "Pedido #015" (numeroPedido, de escape.js), como en todas las pantallas
  // confirmacion-datos: fecha, entrega y pago (en compu, en 3 columnas). El resumen, con el estilo del de "Finalizar pedido".
  document.getElementById('confirmacion-contenido').innerHTML = `
    <div class="confirmacion">
      <span class="confirmacion-tilde" aria-hidden="true"><svg class="icono"><use href="#icono-check"></use></svg></span>
      <h3>¡Recibimos tu ${escHtml(numeroPedido(respuesta.id_pedido, 'cliente'))}!</h3>
      <p>Para terminar, mandanos el resumen por WhatsApp y te confirmamos.</p>
      <dl class="confirmacion-datos">
        <div><dt>Fecha de entrega</dt><dd>${escHtml(fechaEntrega)}</dd></div>
        <div><dt>Entrega</dt><dd>${escHtml(textoEntrega)}</dd></div>
        <div><dt>Forma de pago</dt><dd>${escHtml(datos.metodoPago)}</dd></div>
      </dl>
      ${notaTransferencia}
      <div class="resumen">
        <ul class="resumen-lista">${combosHtml}
        </ul>
        <dl class="resumen-cuentas">
          <div class="resumen-renglon-total"><dt>Total</dt><dd>$ ${escHtml(total)}</dd></div>
        </dl>
      </div>
      <a class="boton boton-principal boton-grande" id="boton-whatsapp" target="_blank" rel="noopener">
        <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-whatsapp"></use></svg>
        Enviar por WhatsApp
      </a>
    </div>`;

  // El enlace se pone aparte (no dentro del HTML de arriba): así ningún texto del mensaje puede romperlo
  document.getElementById('boton-whatsapp').href = armarMensajeWhatsApp(respuesta, datos);

  // Se pasa a la vista de confirmación
  document.getElementById('vista-formulario').hidden = true;
  document.getElementById('vista-confirmacion').hidden = false;

  // Detrás de la confirmación quedan otra vez las categorías (en el celu se cierra la pantalla de combos):
  // así "Volver al inicio" vuelve al inicio. volverACategorias es de combosCatalogo.js
  volverACategorias();
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

${numeroPedido(respuesta.id_pedido, 'cliente')}
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
  const ventana = document.getElementById('modal-finalizar');
  const formulario = document.getElementById('formulario-pedido');

  // Botón "Finalizar pedido" de la ventana "Mi pedido" (carritoCombos.js)
  document.getElementById('boton-finalizar-pedido').addEventListener('click', abrirFinalizarPedido);

  // "Confirmar pedido"
  formulario.addEventListener('submit', confirmarPedido);

  // Tipo de Entrega: con envío se ve el barrio; con retiro se oculta (como en el viejo)
  formulario.querySelectorAll('input[name="entrega"]').forEach(opcion => {
    opcion.addEventListener('change', () => {
      document.getElementById('grupo-barrio').hidden = opcion.value !== ENTREGA_ENVIO;
    });
  });

  // Pago: con transferencia se muestra el alias
  formulario.querySelectorAll('input[name="pago"]').forEach(opcion => {
    opcion.addEventListener('change', () => {
      document.getElementById('alias-transferencia').hidden = opcion.value !== 'Transferencia';
    });
  });

  // Botones de días (celu): el que se toca escribe su fecha en el campo de fecha (el que se controla y se manda),
  // se borra el error de la fecha y se vuelven a dibujar para marcar el elegido.
  // Se escucha en el contenedor porque los botones se vuelven a dibujar (closest = el botón tocado)
  document.getElementById('dias-entrega').addEventListener('click', evento => {
    const botonDia = evento.target.closest('[data-fecha]');
    if (!botonDia) return;
    document.getElementById('campo-fecha').value = botonDia.dataset.fecha;
    document.getElementById('error-fecha').textContent = '';
    renderizarDiasEntrega();
  });

  // Fecha: si se elige un feriado o un fin de semana, se avisa y se borra
  document.getElementById('campo-fecha').addEventListener('change', evento => {
    const campoFecha = evento.target;
    document.getElementById('error-fecha').textContent = '';
    const diaSinEntrega = campoFecha.value !== '' && !esDiaHabil(parseFechaLocal(campoFecha.value));
    if (diaSinEntrega) {
      document.getElementById('error-fecha').textContent = 'Ese día no entregamos (feriado o fin de semana). Elegí otro.';
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





