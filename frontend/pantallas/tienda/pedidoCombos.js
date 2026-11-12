// pedidoCombos.js — La ventana "Finalizar pedido": los datos del cliente, la fecha y el envío del pedido.
//
// Lo que hace el cliente          → la función
//   Toca "Finalizar pedido"       → abrirFinalizarPedido   (arma el resumen y abre la ventana)
//   Toca un día (celu)            → renderizarDiasEntrega  (dibuja los 5 días y marca el elegido)
//   Toca "Confirmar pedido"       → validarFormulario      (revisa los datos)
//                                 → enviarPedido           (manda el pedido al servidor)
//                                 → mostrarConfirmacion    (dibuja "¡Recibimos tu pedido!" y el WhatsApp)
//
// El pedido NO lleva precios, total ni usuario: el servidor los saca de la base y del token.

// Datos del negocio para el mensaje de WhatsApp
const WHATSAPP_NUMERO     = '5493512294243';
const EMAIL_NEGOCIO       = 'tesisfastgood@gmail.com';
const ALIAS_TRANSFERENCIA = 'FAST.GOOD.VA cuenta a nombre de Fast and Good VA SRL';
const MENSAJE_ERROR_ENVIO = 'No pudimos enviar tu pedido. Probá de nuevo en unos minutos.';
const ENTREGA_ENVIO = 'Delivery';

// Largos máximos (los mismos que controla el servidor)
const LARGO_MAXIMO = { nombreCompleto: 100, telefono: 30, email: 100, direccion: 200, observaciones: 500 };

// Los nombres de los días (0 = domingo … 6 = sábado): el corto va en el botón, el largo lo lee un lector de pantalla
const NOMBRES_DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const NOMBRES_DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ARMA el resumen del carrito, pone la primera fecha posible y ABRE la ventana.
function abrirFinalizarPedido() {
  if (carritoCombos.length === 0) {
    return;
  }
  document.getElementById('modal-pedido').close();

  // El resumen: un renglón por combo, con sus platos, y el total (solo para mostrar)
  let total = 0;
  let contenidoHTML = '';
  let todosLosPlatos = [];
  carritoCombos.forEach((combo) => {
    const precio = { true: 0, false: Number(combo.precio) }[isNaN(Number(combo.precio))];
    total = total + precio;
    todosLosPlatos = todosLosPlatos.concat(combo.platos);
    const platosTexto = combo.platos.map((plato) => {
      const aclaracion = { true: ' (' + escHtml(plato.personalizado) + ')', false: '' }[Boolean(plato.personalizado)];
      return escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre) + aclaracion;
    }).join(', ');
    contenidoHTML += `
      <li class="resumen-combo">
        <div class="nombre-y-precio">
          <span>${escHtml(combo.nombre)}</span>
          <span>$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
        </div>
        <span class="resumen-platos">${platosTexto}</span>
      </li>`;
  });
  document.getElementById('resumen-lista').innerHTML = contenidoHTML;

  const textoCantidad = { true: '1 combo', false: carritoCombos.length + ' combos' }[carritoCombos.length === 1];
  const textoTotal = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('resumen-cantidad').textContent = '(' + textoCantidad + ')';
  document.getElementById('resumen-total-titulo').textContent = textoTotal;
  document.getElementById('resumen-total').textContent = textoTotal;
  document.getElementById('total-a-pagar').textContent = textoTotal;
  document.getElementById('total-en-boton').textContent = textoTotal;
  document.getElementById('resumen-pedido').open = window.matchMedia('(min-width: 900px)').matches;

  // La primera fecha posible: hoy (todo de heladera) o 2 días hábiles (si hay algún personalizado)
  const hayPersonalizado = todosLosPlatos.filter((plato) => plato.personalizado).length > 0;
  const primera = primeraFechaEntrega(hayPersonalizado);
  let aclaracionFecha = { true: ' (por los platos personalizados: hay un día de producción en el medio)', false: '' }[hayPersonalizado];
  aclaracionFecha = { true: ' (los pedidos de la heladera hechos desde las ' + HORA_CORTE + ' h se entregan desde el próximo día hábil)', false: aclaracionFecha }[primera.pasoElCorte];
  const campoFecha = document.getElementById('campo-fecha');
  campoFecha.min = fechaLocalISO(primera.fecha);
  const fechaQueNoAlcanza = campoFecha.value !== '' && campoFecha.value < campoFecha.min;
  if (fechaQueNoAlcanza) {
    campoFecha.value = '';
  }
  document.getElementById('fecha-primera-posible').textContent =
    'La primera fecha posible es el ' + fechaDDMMAAAA(parseFechaLocal(campoFecha.min)) + aclaracionFecha + '.';
  renderizarDiasEntrega();

  // Si inició sesión, se completan solos los campos vacíos con sus datos
  const datosDeSesion = {
    'campo-nombre':    localStorage.getItem('usuario_nombre'),
    'campo-apellido':  localStorage.getItem('usuario_apellido'),
    'campo-email':     localStorage.getItem('usuario_email'),
    'campo-telefono':  localStorage.getItem('usuario_telefono'),
    'campo-direccion': localStorage.getItem('usuario_direccion')
  };
  const inicioSesion = localStorage.getItem('usuario_id') !== null;
  const camposACompletar = { true: Object.keys(datosDeSesion), false: [] }[inicioSesion];
  camposACompletar.forEach((idCampo) => {
    const campo = document.getElementById(idCampo);
    if (campo.value) {
      return;
    }
    campo.value = datosDeSesion[idCampo];
  });

  // Se abre la ventana, con el formulario limpio de errores
  document.querySelectorAll('#formulario-pedido .campo-error').forEach((parrafo) => {
    parrafo.textContent = '';
  });
  document.getElementById('vista-formulario').hidden = false;
  document.getElementById('vista-confirmacion').hidden = true;
  document.getElementById('modal-finalizar').showModal();
}

// DIBUJA los próximos 5 días de entrega como botones (en el celu) y marca el elegido.
function renderizarDiasEntrega() {
  const campoFecha = document.getElementById('campo-fecha');
  const primerDia = parseFechaLocal(campoFecha.min);
  const dias = [0, 1, 2, 3, 4].map((n) => sumarDiasHabiles(primerDia, n));
  const fechasDeLosBotones = dias.map((dia) => fechaLocalISO(dia));

  // En el celu, si la fecha elegida no es uno de esos 5 días, se elige el primero
  const esCelu = window.matchMedia('(max-width: 767px)').matches;
  const hayQueElegirElPrimero = esCelu && !fechasDeLosBotones.includes(campoFecha.value);
  if (hayQueElegirElPrimero) {
    campoFecha.value = fechasDeLosBotones[0];
  }

  let contenidoHTML = '';
  dias.forEach((dia, indice) => {
    const fechaISO = fechasDeLosBotones[indice];
    const estaElegido = fechaISO === campoFecha.value;
    const nombreCorto = NOMBRES_DIAS_CORTOS[dia.getDay()];
    const nombreLargo = NOMBRES_DIAS_LARGOS[dia.getDay()] + ' ' + fechaDDMMAAAA(dia);
    contenidoHTML += `
      <button type="button" class="dia-entrega" data-fecha="${fechaISO}" aria-pressed="${estaElegido}" aria-label="${nombreLargo}">
        <small>${nombreCorto}</small><b>${dia.getDate()}</b>
      </button>`;
  });
  document.getElementById('dias-entrega').innerHTML = contenidoHTML;
}

// REVISA cada campo del formulario. Devuelve los datos limpios, o null si hay algún error (y lo escribe debajo del campo).
function validarFormulario() {
  const formulario = document.getElementById('formulario-pedido');

  // Lo que escribió
  const nombre = document.getElementById('campo-nombre').value.trim();
  const apellido = document.getElementById('campo-apellido').value.trim();
  const direccion = document.getElementById('campo-direccion').value.trim();
  const telefono = document.getElementById('campo-telefono').value.trim();
  const email = document.getElementById('campo-email').value.trim();
  const campoFecha = document.getElementById('campo-fecha');
  const fecha = campoFecha.value;
  const observaciones = document.getElementById('campo-observaciones').value;
  const pagoMarcado = formulario.querySelector('input[name="pago"]:checked');
  const entregaMarcada = formulario.querySelector('input[name="entrega"]:checked');
  // ?. = "si hay una opción marcada, su valor"
  const metodoPago = { true: pagoMarcado?.value, false: '' }[pagoMarcado !== null];
  const tipoEntrega = { true: entregaMarcada?.value, false: '' }[entregaMarcada !== null];

  const emailConForma = email.length <= LARGO_MAXIMO.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailMalEscrito = email !== '' && !emailConForma;
  const primeraFecha = fechaDDMMAAAA(parseFechaLocal(campoFecha.min));

  // Los controles de cada campo, en orden: de cada campo se muestra el PRIMERO que está mal
  const controles = {
    'error-nombre': [
      { estaMal: nombre === '', mensaje: 'Escribí tu nombre.' }
    ],
    'error-apellido': [
      { estaMal: apellido === '', mensaje: 'Escribí tu apellido.' },
      { estaMal: (nombre + ' ' + apellido).length > LARGO_MAXIMO.nombreCompleto,
        mensaje: 'Nombre y apellido juntos: hasta ' + LARGO_MAXIMO.nombreCompleto + ' caracteres.' }
    ],
    'error-direccion': [
      { estaMal: direccion === '', mensaje: 'Escribí tu dirección.' },
      { estaMal: direccion.length > LARGO_MAXIMO.direccion, mensaje: 'Hasta ' + LARGO_MAXIMO.direccion + ' caracteres.' }
    ],
    'error-telefono': [
      { estaMal: telefono === '', mensaje: 'Escribí tu teléfono.' },
      { estaMal: telefono.length > LARGO_MAXIMO.telefono, mensaje: 'Hasta ' + LARGO_MAXIMO.telefono + ' caracteres.' }
    ],
    'error-email': [
      { estaMal: emailMalEscrito, mensaje: 'Revisá el email (o dejalo vacío).' }
    ],
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
    'error-observaciones': [
      { estaMal: observaciones.length > LARGO_MAXIMO.observaciones, mensaje: 'Hasta ' + LARGO_MAXIMO.observaciones + ' caracteres.' }
    ]
  };

  // Se escribe, debajo de cada campo, su primer error
  formulario.querySelectorAll('.campo-error').forEach((parrafo) => {
    parrafo.textContent = '';
  });
  let hayErrores = false;
  Object.keys(controles).forEach((idError) => {
    const controlQueFalla = controles[idError].find((control) => control.estaMal);
    if (controlQueFalla === undefined) {
      return;
    }
    document.getElementById(idError).textContent = controlQueFalla.mensaje;
    hayErrores = true;
  });

  if (hayErrores) {
    return null;
  }
  return { nombre, apellido, direccion, telefono, email, fecha, metodoPago, tipoEntrega, observaciones };
}

// MANDA el pedido al servidor (POST /api/pedidos-combos). Devuelve { ok: true, respuesta } o { ok: false, error }.
async function enviarPedido(datos) {
  // De cada combo va solo su número y sus platos: los precios los saca el servidor de la base
  const combos = carritoCombos.map((combo) => {
    const platos = combo.platos.map((plato) => {
      const personalizado = { true: plato.personalizado, false: null }[Boolean(plato.personalizado)];
      return { producto_id: plato.producto_id, cantidad: plato.cantidad, personalizado: personalizado };
    });
    return { id_combo: combo.id_combo, platos: platos };
  });
  const pedido = {
    observaciones:     datos.observaciones,
    combos:            combos,
    cliente_nombre:    `${datos.nombre} ${datos.apellido}`,
    cliente_direccion: datos.direccion,
    cliente_telefono:  datos.telefono,
    cliente_email:     datos.email,
    fecha_entrega:     datos.fecha,
    metodo_pago:       datos.metodoPago,
    tipo_entrega:      datos.tipoEntrega
  };

  try {
    const respuesta = await apiFetch('/api/pedidos-combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
    const cuerpo = await respuesta.json();
    if (respuesta.ok) {
      return { ok: true, respuesta: cuerpo };
    }
    // 400 (algún dato mal) o 429 (demasiados pedidos): el servidor manda un mensaje para el cliente
    const traeMensaje = (respuesta.status === 400 || respuesta.status === 429) && Boolean(cuerpo.error);
    if (traeMensaje) {
      return { ok: false, error: cuerpo.error };
    }
    console.error('Error al crear el pedido:', respuesta.status, cuerpo);
    return { ok: false, error: MENSAJE_ERROR_ENVIO };
  } catch (error) {
    console.error('No se pudo enviar el pedido:', error);
    return { ok: false, error: MENSAJE_ERROR_ENVIO };
  }
}

// DIBUJA "¡Recibimos tu pedido #N!" con lo que devolvió el servidor, y arma el botón de WhatsApp.
function mostrarConfirmacion(respuesta, datos) {
  const conEnvio = datos.tipoEntrega === ENTREGA_ENVIO;
  const conTransferencia = datos.metodoPago === 'Transferencia';
  const fechaEntrega = fechaDDMMAAAA(parseFechaLocal(datos.fecha));
  const total = Number(respuesta.total).toLocaleString('es-AR');

  // Los combos, para la pantalla (HTML) y para el WhatsApp (texto)
  let combosHtml = '';
  let lineasCombos = '';
  respuesta.combos.forEach((combo) => {
    const precio = Number(combo.precio).toLocaleString('es-AR');
    const platosHtml = combo.platos.map((plato) => {
      const aclaracion = { true: ' (' + escHtml(plato.personalizado) + ')', false: '' }[Boolean(plato.personalizado)];
      return '<li>' + escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre) + aclaracion + '</li>';
    }).join('');
    const lineasPlatos = combo.platos.map((plato) => {
      const aclaracion = { true: ' (' + plato.personalizado + ')', false: '' }[Boolean(plato.personalizado)];
      return '   - ' + plato.cantidad + ' ' + plato.nombre + aclaracion;
    }).join('\n');
    combosHtml += `
        <li class="resumen-combo">
          <div class="nombre-y-precio">
            <span>${escHtml(combo.nombre)}</span>
            <span>$ ${escHtml(precio)}</span>
          </div>
          <ul class="combo-platos">${platosHtml}</ul>
        </li>`;
    lineasCombos += '1x ' + combo.nombre + ': $' + precio + '\n' + lineasPlatos + '\n';
  });

  // La pantalla de confirmación
  const textoEntrega = { true: 'Envío a domicilio: ' + datos.direccion, false: 'Retiro en el local' }[conEnvio];
  const notaTransferencia = { true: '<p class="nota">Alias: ' + escHtml(ALIAS_TRANSFERENCIA) + '</p>', false: '' }[conTransferencia];
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

  // El mensaje de WhatsApp
  const fechaDeHoy = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
  }) + 'hs';
  const lineaAlias = { true: '► ALIAS: ' + ALIAS_TRANSFERENCIA + '\n\n', false: '\n' }[conTransferencia];
  const lineaEntrega = { true: 'Entrega: Delivery\nDirección: ' + datos.direccion, false: 'Entrega: Retiro en local' }[conEnvio];
  const mensaje =
`¡Hola! Te paso el resumen de mi pedido

${numeroPedido(respuesta.id_pedido, 'cliente')}
Tienda: fastandgood
Fecha: ${fechaDeHoy}
Nombre: ${datos.nombre} ${datos.apellido}
Teléfono: ${datos.telefono}

Forma de pago: ${datos.metodoPago}
Total: $${total}
${lineaAlias}${lineaEntrega}
Fecha de entrega: ${fechaEntrega}

mail: ${EMAIL_NEGOCIO}

Mi pedido es

${lineasCombos}
TOTAL: $${total}

Espero tu respuesta para confirmar mi pedido`;
  document.getElementById('boton-whatsapp').href = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(mensaje);

  // Se pasa a la confirmación, y detrás vuelven las tarjetas del inicio (volverAPlanes, de renderizadoCatalogo.js)
  document.getElementById('vista-formulario').hidden = true;
  document.getElementById('vista-confirmacion').hidden = false;
  volverAPlanes();
}


// Quién escucha los clics
document.addEventListener('DOMContentLoaded', () => {
  const ventana = document.getElementById('modal-finalizar');
  const formulario = document.getElementById('formulario-pedido');

  document.getElementById('boton-finalizar-pedido').addEventListener('click', abrirFinalizarPedido);

  // "Confirmar pedido": revisa, manda y muestra cómo salió
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const errorEnvio = document.getElementById('error-envio');
    errorEnvio.textContent = '';
    const datos = validarFormulario();
    if (datos === null) {
      return;
    }

    // El botón se apaga mientras se manda (así un doble clic no crea dos pedidos)
    const boton = document.getElementById('boton-confirmar-pedido');
    const textoBoton = document.getElementById('boton-confirmar-texto');
    boton.disabled = true;
    textoBoton.textContent = 'Enviando pedido...';
    const resultado = await enviarPedido(datos);
    boton.disabled = false;
    textoBoton.textContent = 'Confirmar pedido';

    // Salió mal: se muestra el mensaje (si faltan viandas, se vuelven a pedir los combos para ver lo que queda)
    if (!resultado.ok) {
      errorEnvio.textContent = resultado.error;
      const faltanViandas = resultado.error.startsWith('No quedan suficientes viandas');
      if (faltanViandas) {
        cargarCombos(true);
      }
      return;
    }

    // Salió bien: se vacía el carrito, se limpia el formulario y se muestra la confirmación
    carritoCombos = [];
    guardarCarrito();
    renderizarCarrito();
    formulario.reset();
    mostrarConfirmacion(resultado.respuesta, datos);
  });

  // Pago: con transferencia se muestra el alias
  formulario.querySelectorAll('input[name="pago"]').forEach((opcion) => {
    opcion.addEventListener('change', () => {
      document.getElementById('alias-transferencia').hidden = opcion.value !== 'Transferencia';
    });
  });

  // Los botones de días (celu): el que se toca escribe su fecha en el campo de fecha
  document.getElementById('dias-entrega').addEventListener('click', (evento) => {
    const botonDia = evento.target.closest('[data-fecha]');
    if (!botonDia) {
      return;
    }
    document.getElementById('campo-fecha').value = botonDia.dataset.fecha;
    document.getElementById('error-fecha').textContent = '';
    renderizarDiasEntrega();
  });

  // Fecha: si elige un feriado o un fin de semana, se avisa y se borra
  document.getElementById('campo-fecha').addEventListener('change', (evento) => {
    const campoFecha = evento.target;
    document.getElementById('error-fecha').textContent = '';
    const diaSinEntrega = campoFecha.value !== '' && !esDiaHabil(parseFechaLocal(campoFecha.value));
    if (diaSinEntrega) {
      document.getElementById('error-fecha').textContent = 'Ese día no entregamos (feriado o fin de semana). Elegí otro.';
      campoFecha.value = '';
    }
  });

  // Cerrar: la ✕, "Volver al inicio" o el fondo oscuro
  ventana.addEventListener('click', (evento) => {
    const hayQueCerrar = evento.target === ventana || evento.target.closest('[data-accion="cerrar"]') !== null;
    if (hayQueCerrar) {
      ventana.close();
    }
  });
});
