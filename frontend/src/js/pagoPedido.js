// ============================================================================
// pagoPedido.js — El pago en Consultar Pedidos: las ventanas "Pago del Pedido" y "Confirmar Pago"
//
// Funciones:
//   abrirPago              → abre "Pago del Pedido" con el método guardado (un pedido anulado no se cobra)
//   mostrarOpcionesPago    → muestra la opción del método elegido y, en el Mixto, cuánto falta para el total
//   guardarPago            → controla lo elegido y lo manda (PUT /api/pedidos/:id/pago)
//   abrirConfirmarPago     → al pasar a En Preparación un pedido que no es en efectivo: "¿ya pagó?"
//   responderConfirmarPago → "Sí, ya pagó" (cambia el estado y registra el pago) o "No" (el select vuelve atrás)
//
// Usa de ListarPedidos.js (que se carga antes): todosPedidos, estadoOptions, paginacionPedidos, renderizarPedidos,
// guardarEstado, pintarEstado, mostrarCartel, formatearPrecio y ESTADO_CANCELADO.
// Los controles de acá son una AYUDA: el servidor vuelve a controlar todo con el total de la base.
// ============================================================================

let pedidoPagoId = null;               // el pedido de la ventana "Pago del Pedido" (mientras está abierta)
let confirmacionPago = null;           // { pedido, select, nuevoId, anteriorId } mientras "Confirmar Pago" está abierta

// Los dos montos del pago Mixto, en el mismo orden que monto_efectivo y monto_transferencia
const CAMPOS_MIXTO = ['pagoMontoEfectivo', 'pagoMontoTransferencia'];

// Qué opción se marca en la ventana según el método guardado (las dos tarjetas son la opción "Tarjeta")
const OPCION_DE_METODO = {
  'Efectivo':        'Efectivo',
  'Transferencia':   'Transferencia',
  'Tarjeta Débito':  'Tarjeta',
  'Tarjeta Crédito': 'Tarjeta',
  'Mixto':           'Mixto'
};

// El tipo de tarjeta de cada método con tarjeta (los otros no tienen)
const TIPO_DE_TARJETA = {
  'Tarjeta Débito':  'Débito',
  'Tarjeta Crédito': 'Crédito'
};

// Al elegir otro método, otro tipo de tarjeta o escribir un monto: se muestran sus opciones y la suma
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="metodoPago"]').forEach(radio => {     // los 4 métodos
    radio.addEventListener('change', mostrarOpcionesPago);
  });
  document.querySelectorAll('input[name="tipoTarjeta"]').forEach(radio => {    // débito o crédito
    radio.addEventListener('change', mostrarOpcionesPago);
  });
  CAMPOS_MIXTO.forEach(idCampo => {                                             // los dos montos del Mixto
    document.getElementById(idCampo).addEventListener('input', mostrarOpcionesPago);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// abrirPago → abre la ventana "Pago del Pedido"
// ENTRADA: pedidoId
// SALIDA:  nada (la ventana abierta con el total, el método guardado elegido y, si era Mixto, sus montos).
//          Si el pedido está anulado no se abre: avisa (el botón ya está apagado; esto es por las dudas).
// Ej: #250 en "Tarjeta Crédito" → queda elegida "Tarjeta" y el tipo "Crédito"
// ─────────────────────────────────────────────────────────────────────────────
function abrirPago(pedidoId) {
  const pedido = todosPedidos.find(p => p.id === pedidoId);        // find = el pedido con ese número (o undefined)
  if (!pedido) return;
  if (pedido.id_estado === ESTADO_CANCELADO) {                     // un anulado no se cobra (el servidor también lo frena)
    mostrarCartel('alerta', 'Un pedido anulado no se puede cobrar.', '⚠ Pedido anulado');
    return;
  }
  pedidoPagoId = pedidoId;                                         // el pedido de la ventana

  // 1. "Pedido #N" arriba del título, y el total (el total es solo para mostrar: el servidor usa el de la base)
  document.getElementById('pagoNumero').textContent = 'Pedido #' + String(pedidoId).padStart(3, '0');
  document.getElementById('pagoTotal').textContent = formatearPrecio(pedido.total);

  // 2. El método guardado, con las tablas de arriba. Sin método, Efectivo.
  //    Ej: 'Tarjeta Crédito' → opción "Tarjeta" y tipo "Crédito"
  const guardado = pedido.metodo_pago || 'Efectivo';
  const opcion = OPCION_DE_METODO[guardado] || 'Efectivo';         // la opción que queda elegida
  const tipoTarjeta = TIPO_DE_TARJETA[guardado] || null;           // 'Débito' o 'Crédito' (solo con tarjeta)
  document.querySelector(`input[name="metodoPago"][value="${opcion}"]`).checked = true;  // opcion es una de 4 palabras fijas
  document.querySelectorAll('input[name="tipoTarjeta"]').forEach(radio => {   // el tipo de tarjeta...
    radio.checked = radio.value === tipoTarjeta;                   // ...elegido si coincide
  });
  document.getElementById('pagoAnticipado').checked = opcion === 'Efectivo' && pedido.pago_anticipado === true;

  // 3. Si ya era Mixto, los montos guardados (los que están en 0 quedan vacíos)
  const montos = [pedido.monto_efectivo, pedido.monto_transferencia];  // en el mismo orden que CAMPOS_MIXTO
  CAMPOS_MIXTO.forEach((idCampo, posicion) => {                    // posicion = 0 el primero, 1 el segundo
    const tieneMonto = opcion === 'Mixto' && Number(montos[posicion]) > 0;
    document.getElementById(idCampo).value = tieneMonto ? montos[posicion] : '';
  });

  // 4. Las opciones del método elegido, y se abre
  mostrarOpcionesPago();
  document.getElementById('modalPago').classList.add('visible');
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarOpcionesPago → muestra solo la opción del método elegido y, en el Mixto, cuánto falta para el total
// ENTRADA: nada (lee la ventana: el método elegido y los montos)
// SALIDA:  nada. Efectivo → "Pago anticipado" · Tarjeta → Débito / Crédito · Mixto → los dos montos y la suma.
//          Además esconde el error de un intento anterior.
// Ej: Mixto de $ 137.000 con $ 68.500 + $ 60.000 → "Faltan $ 8.500 para llegar al total"
// ─────────────────────────────────────────────────────────────────────────────
function mostrarOpcionesPago() {
  // 1. El método elegido (?. = "si hay uno marcado, su valor"; si no, null)
  const opcion = document.querySelector('input[name="metodoPago"]:checked')?.value || null;

  // 2. Solo la opción de ese método (toggle(clase, sí/no): la pone si es sí y la saca si es no)
  document.getElementById('pagoSubEfectivo').classList.toggle('visible', opcion === 'Efectivo');
  document.getElementById('pagoSubTarjeta').classList.toggle('visible', opcion === 'Tarjeta');
  document.getElementById('pagoMixto').classList.toggle('visible', opcion === 'Mixto');
  document.getElementById('pagoError').classList.remove('visible');  // el error de antes se va

  // 3. En el Mixto: cuánto falta (o sobra) para llegar al total, en centavos (sin errores de redondeo)
  if (opcion !== 'Mixto') return;                                  // con otro método no hay suma
  const pedido = todosPedidos.find(p => p.id === pedidoPagoId);
  if (!pedido) return;
  const suma = document.getElementById('pagoSuma');                // el renglón de la suma
  const efectivo = document.getElementById('pagoMontoEfectivo').value;          // lo escrito (texto)
  const transferencia = document.getElementById('pagoMontoTransferencia').value;
  const sinNadaEscrito = efectivo === '' && transferencia === '';
  if (sinNadaEscrito) {                                            // sin nada escrito, sin suma
    suma.textContent = '';
    suma.className = 'pago-suma';
    return;
  }
  const cargado = Math.round(Number(efectivo || 0) * 100) + Math.round(Number(transferencia || 0) * 100);  // en centavos
  const diferencia = Math.round(Number(pedido.total) * 100) - cargado;  // lo que falta (negativo = sobra)
  if (diferencia === 0) {                                          // justo: en verde, con el total
    suma.textContent = 'Suma correcta: ' + formatearPrecio(pedido.total);
    suma.className = 'pago-suma ok';
    return;
  }
  suma.className = 'pago-suma falta';                              // no coincide: en naranja, cuánto falta o sobra
  suma.textContent = diferencia > 0
    ? 'Faltan ' + formatearPrecio(diferencia / 100) + ' para llegar al total'
    : 'Te pasaste por ' + formatearPrecio(-diferencia / 100);
}


// ─────────────────────────────────────────────────────────────────────────────
// guardarPago → controla lo elegido en "Pago del Pedido" y lo manda
// ENTRADA: nada (lee la ventana)
// SALIDA:  nada. Si sale bien: cierra y redibuja la fila. Si no: muestra el error en la ventana.
// Ej: Mixto de $ 137.000 con 68500 + 68500 → PUT /api/pedidos/250/pago { metodo_pago: 'Mixto', monto_efectivo: 68500, monto_transferencia: 68500 }
// ─────────────────────────────────────────────────────────────────────────────
async function guardarPago() {
  const pedido = todosPedidos.find(p => p.id === pedidoPagoId);
  if (!pedido) return;
  const errorVentana = document.getElementById('pagoError');       // donde se muestra el error

  // 1. Lo que se eligió y escribió en la ventana
  const opcion = document.querySelector('input[name="metodoPago"]:checked')?.value;        // el método
  const tipoTarjeta = document.querySelector('input[name="tipoTarjeta"]:checked')?.value;  // débito o crédito (o undefined)
  const efectivo = parseFloat(document.getElementById('pagoMontoEfectivo').value);         // en el Mixto
  const transferencia = parseFloat(document.getElementById('pagoMontoTransferencia').value);
  const montosInvalidos = isNaN(efectivo) || isNaN(transferencia) || efectivo <= 0 || transferencia <= 0;
  const sumaCentavos = Math.round(efectivo * 100) + Math.round(transferencia * 100);
  const sumaDistinta = sumaCentavos !== Math.round(Number(pedido.total) * 100);

  // 2. Lo que se manda y el error, según sea el método (los controles de acá son una ayuda: el servidor los repite)
  let cuerpo = null;
  let error = '';
  switch (opcion) {
    case 'Efectivo':                                               // según sea Efectivo: con o sin pago anticipado
      cuerpo = { metodo_pago: 'Efectivo', pago_anticipado: document.getElementById('pagoAnticipado').checked };
      break;
    case 'Transferencia':                                          // según sea Transferencia
      cuerpo = { metodo_pago: 'Transferencia' };
      break;
    case 'Tarjeta':                                                // según sea Tarjeta: hace falta elegir el tipo
      cuerpo = { metodo_pago: 'Tarjeta ' + tipoTarjeta };          // ej: 'Tarjeta Crédito'
      error = tipoTarjeta ? '' : 'Elegí si la tarjeta es de débito o de crédito.';
      break;
    default: {                                                     // si no, Mixto: los dos montos, que sumen justo el total
      const errorDeSuma = sumaDistinta
        ? 'La suma (' + formatearPrecio(sumaCentavos / 100) + ') no coincide con el total del pedido (' + formatearPrecio(pedido.total) + ').'
        : '';
      error = montosInvalidos ? 'Ingresá los dos montos. Los dos tienen que ser mayores a $0.' : errorDeSuma;  // primero, que estén los dos
      cuerpo = { metodo_pago: 'Mixto', monto_efectivo: efectivo, monto_transferencia: transferencia };
      break;
    }
  }
  if (error) {                                                     // si hay un problema, se muestra y no se manda
    errorVentana.textContent = error;
    errorVentana.classList.add('visible');
    return;
  }

  // 3. Se manda
  const boton = document.getElementById('pagoGuardar');
  boton.disabled = true;                                           // apagado mientras se guarda
  boton.textContent = 'Guardando...';
  errorVentana.classList.remove('visible');
  try {
    const respuesta = await apiFetch(`/api/pedidos/${pedido.id}/pago`, {
      method: 'PUT',                                               // PUT = cambiar algo que ya existe
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const datos = await respuesta.json().catch(() => ({}));        // la respuesta (si no es JSON, un objeto vacío)

    if (!respuesta.ok) {                                           // si no se pudo: el motivo del servidor (ej: 'Un pedido anulado no se puede cobrar')
      errorVentana.textContent = datos.error || 'No se pudo guardar el pago. Intentá de nuevo.';
      errorVentana.classList.add('visible');
      return;
    }

    // 4. Salió bien: se guarda en la lista lo que guardó el servidor y se redibuja la misma página
    pedido.metodo_pago = datos.pedido.metodo_pago;
    pedido.monto_efectivo = datos.pedido.monto_efectivo;
    pedido.monto_transferencia = datos.pedido.monto_transferencia;
    pedido.monto_tarjeta = datos.pedido.monto_tarjeta;
    pedido.pago_anticipado = datos.pedido.pago_anticipado;
    cerrarVentana('modalPago');
    renderizarPedidos(paginacionPedidos.paginaActual());
  } catch (error) {                                                // si no hubo respuesta...
    console.error('No se pudo guardar el pago:', error);
    errorVentana.textContent = 'No se pudo conectar con el servidor.';
    errorVentana.classList.add('visible');
  } finally {                                                      // pase lo que pase...
    boton.disabled = false;                                        // ...el botón vuelve a andar
    boton.textContent = 'Guardar';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirConfirmarPago → pregunta "¿ya pagó?" antes de pasar a En Preparación un pedido que no es en efectivo
// ENTRADA: pedido, select (el de su fila), nuevoId y anteriorId (los guarda hasta la respuesta)
// SALIDA:  nada (la ventana abierta: con Transferencia o Tarjeta pregunta por el pago completo; con Mixto,
//          solo por la transferencia, porque el efectivo se cobra al entregar)
// La llama alCambiarEstado (ListarPedidos.js), después de ver que alcanzan los insumos.
// ─────────────────────────────────────────────────────────────────────────────
function abrirConfirmarPago(pedido, select, nuevoId, anteriorId) {
  confirmacionPago = { pedido: pedido, select: select, nuevoId: nuevoId, anteriorId: anteriorId };  // hasta que responda

  // "Pedido #N" arriba del título
  document.getElementById('confirmarPagoNumero').textContent = 'Pedido #' + String(pedido.id).padStart(3, '0');

  // Cuál de los dos textos se ve ('' = se ve · 'none' = no se ve)
  const esMixto = pedido.metodo_pago === 'Mixto';
  document.getElementById('confirmarPagoTextoCompleto').style.display = esMixto ? 'none' : '';
  document.getElementById('confirmarPagoTextoMixto').style.display = esMixto ? '' : 'none';
  document.getElementById('confirmarPagoMetodo').textContent = pedido.metodo_pago;              // textContent: como texto
  document.getElementById('confirmarPagoTransferencia').textContent = formatearPrecio(pedido.monto_transferencia || 0);
  document.getElementById('confirmarPagoEfectivo').textContent = formatearPrecio(pedido.monto_efectivo || 0);
  document.getElementById('modalConfirmarPago').classList.add('visible');                       // se abre
  document.getElementById('confirmarPagoSi').focus();                                           // el cursor en "Sí"
}


// ─────────────────────────────────────────────────────────────────────────────
// responderConfirmarPago → la respuesta de "Confirmar Pago"
// ENTRADA: yaPago: true = "Sí, ya pagó" · false = "No, todavía no pagó" (también la ×, Escape o tocar afuera)
// SALIDA:  nada.
//          No: no se cambia nada y el select vuelve a como estaba.
//          Sí: se cambia el estado (con su control de insumos) y, si salió bien, se registra el pago:
//              Transferencia / Tarjeta → pagado = true · Mixto → solo transferencia_confirmada = true
//              (pagado sigue en false hasta que el repartidor cobre el efectivo).
// Ej: Transferencia de 1 a 2 → "Sí" → queda en 2 y PAGADO. Si saltó a 3 (todo de heladera) y falló el pago:
//     "El pedido pasó a Listo para Entregar, pero no se pudo marcar como pagado."
// ─────────────────────────────────────────────────────────────────────────────
async function responderConfirmarPago(yaPago) {
  if (!confirmacionPago) return;                                   // no había nada que responder
  const pedido = confirmacionPago.pedido;
  const select = confirmacionPago.select;
  const nuevoId = confirmacionPago.nuevoId;
  const anteriorId = confirmacionPago.anteriorId;
  confirmacionPago = null;                                         // ya se respondió
  document.getElementById('modalConfirmarPago').classList.remove('visible');  // se cierra

  // 1. "No, todavía no pagó": el select vuelve a como estaba
  if (!yaPago) {
    select.value = anteriorId;
    pintarEstado(select, anteriorId);
    return;
  }

  // 2. "Sí, ya pagó": primero el estado (el servidor controla los insumos y que no esté anulado)
  const cambio = await guardarEstado(pedido, select, nuevoId, anteriorId);
  if (!cambio) return;                                             // no se pudo: guardarEstado ya avisó

  // 3. Después se registra el pago: en el Mixto solo la transferencia; si no, el pago completo
  const esMixto = pedido.metodo_pago === 'Mixto';
  const ruta = esMixto ? `/api/pedidos/${pedido.id}/transferencia-confirmada` : `/api/pedidos/${pedido.id}/pagado`;
  const opciones = esMixto
    ? { method: 'PUT' }
    : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagado: true }) };
  const campoPagado = esMixto ? 'transferencia_confirmada' : 'pagado';  // qué dato del pedido queda en true
  try {
    const respuesta = await apiFetch(ruta, opciones);
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);  // si no se pudo, va al catch
    pedido[campoPagado] = true;                                    // ej: pedido.pagado = true
    renderizarPedidos(paginacionPedidos.paginaActual());           // la columna Método Pago muestra el pago
  } catch (error) {
    // El estado ya cambió: el aviso dice el estado que quedó guardado (de 1 a 2 puede haber saltado a 3)
    console.error('No se pudo registrar el pago:', error);
    const queFalto = esMixto ? 'no se pudo registrar la transferencia' : 'no se pudo marcar como pagado';
    const nombreEstado = estadoOptions.find(estado => estado.id === pedido.id_estado)?.nombre || 'En Preparación';  // find = el estado con ese número
    mostrarCartel('alerta', 'El pedido pasó a ' + nombreEstado + ', pero ' + queFalto + '.', '⚠ Pago sin registrar');
  }
}
