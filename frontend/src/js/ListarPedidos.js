// ============================================================================
// ListarPedidos.js — Pantalla Consultar Pedidos (pages/ConsultarPedidos.html)
//
// Funciones:
//   iniciarConsultarPedidos → al abrir: engancha el buscador, las fechas y las teclas, y carga estados y pedidos
//   renderizarPedidos       → el título, el filtro (fechas + buscador) y la tabla de a 15
//   crearFilaPedido         → arma la fila de un pedido (la llama crearPaginacion por cada pedido de la página)
//   aplicarFechas           → "Aplicar" (el rango Desde / Hasta) o "Ver todos"
//   alCambiarEstado         → cambió el select de estado: si hace falta, pregunta si ya pagó; si no, guarda
//   guardarEstado           → manda el estado nuevo (PUT /api/pedidos/:id/estado) y muestra el que quedó guardado
//   pintarEstado            → pinta el select con el color de su estado
//   abrirDetalles           → la ventana "Detalle del Pedido" (combos y platos)
//   abrirAnular             → la ventana "Anular Pedido" (pide el PIN)
//   confirmarAnulacion      → manda la anulación (POST /api/pedidos/:id/anular) y avisa cuántas viandas volvieron
//   cerrarVentana           → cierra una ventana (si es "Confirmar Pago", cuenta como "No, todavía no pagó")
//   mostrarCartel           → un aviso flotante: verde (salió bien) o amarillo (atención)
//   formatearPrecio         → un número como precio. Ej: 137000 → "$ 137.000"
// Son 13 porque la pantalla tiene la grilla, sus filtros y 4 ventanas (Detalle, Pago, Confirmar Pago y Anular).
// El pago (ventanas "Pago del Pedido" y "Confirmar Pago") está aparte, en pagoPedido.js.
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion) y fechas.js.
// Todo texto que viene de la base pasa por escHtml (o va con textContent).
// ============================================================================

let todosPedidos = [];                 // todos los pedidos que mandó el servidor (el filtro trabaja sobre esta lista)
let estadoOptions = [];                // los estados posibles: [{ id, nombre }] (para el select de cada fila)
let paginacionPedidos = null;          // lo que devuelve crearPaginacion: sirve para saber en qué página está la tabla
let filtroFechas = { modo: 'todos', desde: '', hasta: '' };  // 'hoy' (al abrir), 'entrega' ("Aplicar") o 'todos'
let hoyISO = '';                       // la fecha de hoy, 'AAAA-MM-DD' (para el título)
let pedidoAnularId = null;             // el pedido que se está anulando (mientras la ventana está abierta)

const ESTADO_EN_PREPARACION = 2;       // "En Preparación"
const ESTADO_CANCELADO = 5;            // "Cancelado" (anulado): no cambia más de estado ni se cobra
// Con estos métodos, antes de preparar se confirma que el cliente pagó (el efectivo se cobra al entregar)
const METODOS_PAGO_PREVIO = ['Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Mixto'];

// El color del select de cada estado: fondo y letra
const COLORES_ESTADO = {
  1: { bg: '#e2e3e5', color: '#383d41' },   // Registrado: gris
  2: { bg: '#fff3cd', color: '#856404' },   // En Preparación: amarillo
  3: { bg: '#d4edda', color: '#155724' },   // Listo para Entregar: verde claro
  4: { bg: '#28a745', color: '#ffffff' },   // Entregado: verde
  5: { bg: '#f8d7da', color: '#721c24' }    // Cancelado: rojo claro
};

// El mensaje de la tabla vacía, según sea el modo del filtro de fechas
const MENSAJE_VACIO = {
  hoy:     'No hay pedidos para producir hoy',
  entrega: 'No hay pedidos con entrega en esas fechas',
  todos:   'No hay pedidos registrados'
};

document.addEventListener('DOMContentLoaded', iniciarConsultarPedidos);  // cuando la página terminó de cargar, arranca


// ─────────────────────────────────────────────────────────────────────────────
// iniciarConsultarPedidos → arranca la pantalla
// ENTRADA: nada (la llama el navegador cuando la página terminó de cargar)
// SALIDA:  nada (engancha el buscador, las fechas y las teclas, pide estados y pedidos y dibuja la tabla)
// Ej: un viernes abre con los pedidos que se entregan el lunes: "Producción de hoy (16/10/2026) — pedidos con entrega el 19/10/2026"
// ─────────────────────────────────────────────────────────────────────────────
async function iniciarConsultarPedidos() {
  // 1. El buscador: al escribir se filtra y se vuelve a la página 1
  document.getElementById('CampoBusqueda').addEventListener('input', () => renderizarPedidos(1));

  // 2. Al abrir: los pedidos con entrega el próximo día hábil, que son los que se cocinan hoy
  const hoy = new Date();                                          // hoy, en la computadora
  hoyISO = fechaLocalISO(hoy);                                     // 'AAAA-MM-DD' (fechas.js)
  const proximo = fechaLocalISO(proximoDiaHabil(hoy));             // el próximo día hábil (fechas.js)
  document.getElementById('FechaDesde').value = proximo;           // las fechas muestran ese día
  document.getElementById('FechaHasta').value = proximo;
  filtroFechas = { modo: 'hoy', desde: proximo, hasta: proximo };  // el modo "producción de hoy"
  document.getElementById('btnAplicarFechas').addEventListener('click', () => aplicarFechas('aplicar'));  // "Aplicar"
  document.getElementById('btnVerTodos').addEventListener('click', () => aplicarFechas('todos'));        // "Ver todos"

  // 3. Escape cierra la ventana que esté abierta; Enter en el PIN confirma la anulación
  document.addEventListener('keydown', evento => {                 // al apretar una tecla...
    if (evento.key !== 'Escape') return;                           // ...si no es Escape, nada
    ['modalDetalles', 'modalPago', 'modalAnular', 'modalConfirmarPago'].forEach(idVentana => {  // por cada ventana...
      const abierta = document.getElementById(idVentana).classList.contains('visible');
      if (abierta) cerrarVentana(idVentana);                       // ...si está abierta, se cierra
    });
  });
  document.getElementById('anularPin').addEventListener('keydown', evento => {  // en el casillero del PIN...
    if (evento.key === 'Enter') confirmarAnulacion();              // ...Enter = "Confirmar Anulación"
  });

  // 4. Los estados (para los selects) y los pedidos
  try {
    const respuestaEstados = await apiFetch('/api/estados');       // los estados
    if (!respuestaEstados.ok) throw new Error('HTTP ' + respuestaEstados.status);  // si el servidor dio error, va al catch
    estadoOptions = await respuestaEstados.json();                 // [{ id: 1, nombre: 'Registrado' }, …]

    const respuestaPedidos = await apiFetch('/api/pedidos');       // los pedidos
    if (!respuestaPedidos.ok) throw new Error('HTTP ' + respuestaPedidos.status);
    todosPedidos = await respuestaPedidos.json();                  // la lista completa

    renderizarPedidos(1);                                          // la tabla, desde la página 1
  } catch (error) {                                                // si no se pudo...
    console.error('No se pudieron cargar los pedidos:', error);    // ...el detalle va a la consola
    document.getElementById('pedidosBody').innerHTML =             // ...y en la tabla, un mensaje simple
      '<tr><td colspan="11" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarPedidos → dibuja el título, filtra los pedidos y arma la tabla de a 15
// ENTRADA: pagina: en qué página arrancar (1 al filtrar; la misma después de guardar un pago o anular)
// SALIDA:  nada (el título dice qué se ve; la tabla, los pedidos que pasan el filtro de fechas y el buscador)
// Ej: modo "hoy" con entrega el 19/10 → solo los pedidos con entrega ese día, sin los anulados
// ─────────────────────────────────────────────────────────────────────────────
function renderizarPedidos(pagina) {
  const modo = filtroFechas.modo;                                  // 'hoy', 'entrega' o 'todos'
  const desde = filtroFechas.desde;                                // 'AAAA-MM-DD' o ''
  const hasta = filtroFechas.hasta;                                // 'AAAA-MM-DD' o ''

  // 1. El título: qué se está mostrando (cada entrega se cocina el día hábil anterior: diaHabilAnterior de fechas.js)
  const hoyTexto     = fechaDDMMAAAA(parseFechaLocal(hoyISO));                                      // ej: "16/10/2026"
  const desdeTexto   = desde ? fechaDDMMAAAA(parseFechaLocal(desde)) : '';                          // ej: "19/10/2026"
  const hastaTexto   = hasta ? fechaDDMMAAAA(parseFechaLocal(hasta)) : '';
  const produceDesde = desde ? fechaDDMMAAAA(diaHabilAnterior(parseFechaLocal(desde))) : '';        // el día hábil anterior
  const produceHasta = hasta ? fechaDDMMAAAA(diaHabilAnterior(parseFechaLocal(hasta))) : '';
  const TITULOS = {                                                // los títulos posibles (el que va se elige abajo)
    hoy:   'Producción de hoy (' + hoyTexto + ') — pedidos con entrega el ' + desdeTexto,
    hoyNo: 'Hoy (' + hoyTexto + ') no se produce — pedidos con entrega el ' + desdeTexto + ', se producen el ' + produceDesde,
    unDia: 'Pedidos con entrega el ' + desdeTexto + ' — se producen el ' + produceDesde,
    rango: 'Pedidos con entrega del ' + desdeTexto + ' al ' + hastaTexto + ' — se producen del ' + produceDesde + ' al ' + produceHasta,
    desde: 'Pedidos con entrega desde el ' + desdeTexto + ' — se producen desde el ' + produceDesde,
    hasta: 'Pedidos con entrega hasta el ' + hastaTexto + ' — se producen hasta el ' + produceHasta,
    todos: ''                                                      // con "Ver todos" no hay título
  };
  // En "entrega", qué fechas se escribieron: solo hasta, solo desde, las dos, o las dos iguales (un solo día)
  const conLasDos = Boolean(desde && hasta);
  const unSoloDia = conLasDos && desde === hasta;
  let formaEntrega = 'hasta';                                      // solo "hasta"...
  if (desde) formaEntrega = 'desde';                               // ...solo "desde"...
  if (conLasDos) formaEntrega = 'rango';                           // ...las dos...
  if (unSoloDia) formaEntrega = 'unDia';                           // ...o un solo día
  let claveTitulo = 'todos';
  switch (modo) {
    case 'hoy':                                                    // según sea "producción de hoy": ¿hoy se trabaja?
      claveTitulo = esDiaHabil(parseFechaLocal(hoyISO)) ? 'hoy' : 'hoyNo';
      break;
    case 'entrega':                                                // según sea un rango de entregas: según qué fechas hay
      claveTitulo = formaEntrega;
      break;
  }
  const titulo = document.getElementById('tituloListado');         // el título de la lista
  titulo.textContent = TITULOS[claveTitulo];                       // textContent: se muestra como texto
  titulo.hidden = TITULOS[claveTitulo] === '';                     // sin título no ocupa lugar

  // 2. Los pedidos que se ven: por fecha de entrega (según el modo) y por nombre del cliente o número de pedido
  const textoBuscado = document.getElementById('CampoBusqueda').value;  // lo escrito en el buscador
  const texto = textoBuscado.toLowerCase();                        // en minúsculas, para comparar
  const visibles = todosPedidos.filter(pedido => {                 // filter = arma una lista nueva con los que cumplen
    const entrega   = pedido.fecha_entrega || '';                  // 'AAAA-MM-DD' se compara como texto
    const conFechas = modo !== 'todos';
    if (conFechas && !entrega) return false;                                   // con rango y sin fecha: no
    if (conFechas && desde && entrega < desde) return false;                   // antes de "desde": no
    if (conFechas && hasta && entrega > hasta) return false;                   // después de "hasta": no
    if (modo === 'hoy' && pedido.id_estado === ESTADO_CANCELADO) return false; // hoy no muestra anulados
    const nombre = (pedido.cliente_nombre || '').toLowerCase();
    return nombre.includes(texto) || String(pedido.id).includes(texto);        // coincide el nombre o el número
  });

  // 3. El mensaje si no hay ninguno (con algo en el buscador, uno propio; si no, el del modo)
  const hayBusqueda = textoBuscado.trim() !== '';
  const mensajeVacio = hayBusqueda ? 'No se encontraron pedidos con ese nombre' : MENSAJE_VACIO[modo];

  // 4. La tabla, de a 15 por página. crearPaginacion (paginacion.js) llama a crearFilaPedido una vez por fila.
  paginacionPedidos = crearPaginacion({
    datos: visibles,                                               // los pedidos que se ven
    porPagina: 15,                                                 // de a 15
    contenedorTabla: document.getElementById('pedidosBody'),       // donde van las filas
    contenedorPaginacion: document.getElementById('paginacion'),   // donde van los números de página
    funcionRenderFila: crearFilaPedido,                            // cómo se arma cada fila
    filaVacia: '<tr><td colspan="11" class="loading-text">' + escHtml(mensajeVacio) + '</td></tr>',  // si no hay ninguno
    paginaInicial: pagina                                          // en qué página arranca
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaPedido → arma la fila de un pedido
// ENTRADA: pedido (como lo manda GET /api/pedidos)
// SALIDA:  la fila (<tr>) lista para la tabla, con sus botones enganchados
// Ej: #250 · 19/10/2026 · PRUEBA – NO PREPARAR · … · [Detalles] · $ 137.000 · [Registrado] · Efectivo PENDIENTE · [Pago] [Anular]
//     Si está anulado: el select y "Pago" apagados, y "Anulado" en gris.
// ─────────────────────────────────────────────────────────────────────────────
function crearFilaPedido(pedido) {
  // 1. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
  const numero      = '#' + String(pedido.id).padStart(3, '0');                      // ej: "#005"
  const entrega     = pedido.fecha_entrega ? fechaDDMMAAAA(parseFechaLocal(pedido.fecha_entrega)) : '—';
  const cliente     = pedido.cliente_nombre || pedido.usuarios?.nombre || 'Anónimo'; // ?. = "si existe usuarios, su nombre"
  const direccion   = pedido.cliente_direccion || '-';
  const telefono    = pedido.cliente_telefono  || '-';
  const email       = pedido.cliente_email     || '-';
  const metodo      = pedido.metodo_pago       || 'Efectivo';                        // sin método = Efectivo
  const clasePagado = pedido.pagado ? 'status-paid' : 'status-pending';              // ternario simple, fuera del HTML
  const textoPagado = pedido.pagado ? 'PAGADO'      : 'PENDIENTE';

  // a. Debajo del método: el desglose del Mixto o "Pago anticipado", según sea el método
  let detallePago = '';
  switch (metodo) {
    case 'Mixto': {                                                // según sea Mixto
      const faltaEfectivo = pedido.transferencia_confirmada && !pedido.pagado;   // la transferencia llegó; falta cobrar el efectivo
      detallePago = faltaEfectivo
        ? '<span class="pago-detalle">Transferencia ✓ ·<br>Efectivo pendiente<br>' + formatearPrecio(pedido.monto_efectivo || 0) + '</span>'
        : '<span class="pago-detalle">💵 ' + formatearPrecio(pedido.monto_efectivo || 0) + '<br>🏦 ' + formatearPrecio(pedido.monto_transferencia || 0) + '</span>';
      break;
    }
    case 'Efectivo':                                               // según sea Efectivo
      detallePago = pedido.pago_anticipado ? '<span class="pago-detalle">Pago anticipado</span>' : '';
      break;
  }

  // b. Un pedido anulado no se cobra ni se anula otra vez: "Pago" apagado y "Anulado" en gris
  const anulado     = pedido.id_estado === ESTADO_CANCELADO;
  const pagoApagado = anulado ? 'disabled title="Un pedido anulado no se cobra"' : '';
  const botonAnular = anulado
    ? '<button type="button" class="btn-eliminar" disabled>Anulado</button>'
    : '<button type="button" class="btn-eliminar btn-anular">Anular</button>';

  // 2. La fila. Las celdas con lo que escribió el cliente quedan vacías y se llenan abajo con textContent.
  const fila = document.createElement('tr');
  fila.innerHTML = `
    <td style="font-weight:bold">${escHtml(numero)}</td>
    <td style="font-weight:600">${escHtml(entrega)}</td>
    <td><strong></strong></td>
    <td></td>
    <td></td>
    <td></td>
    <td><button type="button" class="btn-detalles">Detalles</button></td>
    <td style="font-weight:700">${escHtml(formatearPrecio(pedido.total))}</td>
    <td></td>
    <td>
      <div class="pago-info">
        <span class="metodo-tag">${escHtml(metodo)}</span>
        ${detallePago}
        <span class="${clasePagado}">${textoPagado}</span>
      </div>
    </td>
    <td>
      <div class="acciones-pedido">
        <button type="button" class="btn-pago" ${pagoApagado}>Pago</button>
        ${botonAnular}
      </div>
    </td>`;

  // 3. Lo que escribió el cliente va con textContent: se muestra como texto y nunca se ejecuta (XSS)
  fila.cells[2].firstElementChild.textContent = cliente;           // columna 3: nombre del cliente
  fila.cells[3].textContent = direccion;                           // columna 4: dirección
  fila.cells[4].textContent = telefono;                            // columna 5: teléfono
  fila.cells[5].textContent = email;                               // columna 6: email

  // 4. El select de estado
  const estadoActual = pedido.id_estado || 1;                      // el estado del pedido (1 si no tiene)
  const select = document.createElement('select');
  select.className = 'select-estado';
  select.dataset.estadoActual = estadoActual;                      // se guarda, para volver atrás si algo falla
  estadoOptions.forEach(estado => {                                // por cada estado...
    const esCanceladoAjeno = estado.id === ESTADO_CANCELADO && estado.id !== estadoActual;  // "Cancelado" solo en los anulados
    if (esCanceladoAjeno) return;                                  // (return = saltear: cancelar solo con "Anular", que pide el PIN)
    const opcion = document.createElement('option');               // ...una opción
    opcion.value = estado.id;
    opcion.textContent = estado.nombre;                            // textContent: el nombre se muestra como texto
    opcion.selected = estado.id === estadoActual;                  // la del pedido queda elegida
    select.appendChild(opcion);
  });
  pintarEstado(select, estadoActual);                              // su color
  select.disabled = anulado;                                       // un anulado no cambia más (el servidor también lo frena)
  select.addEventListener('change', () => alCambiarEstado(pedido, select));  // al elegir otro estado
  fila.cells[8].appendChild(select);                               // columna 9: estado

  // 5. Los botones de la fila (?. = "si existe el botón": un anulado no tiene "Anular")
  fila.querySelector('.btn-detalles').addEventListener('click', () => abrirDetalles(pedido.id));  // "Detalles"
  fila.querySelector('.btn-pago').addEventListener('click', () => abrirPago(pedido.id));          // "Pago" (pagoPedido.js)
  fila.querySelector('.btn-anular')?.addEventListener('click', () => abrirAnular(pedido.id));     // "Anular"

  return fila;                                                     // la fila terminada
}


// ─────────────────────────────────────────────────────────────────────────────
// aplicarFechas → el filtro de fechas de entrega
// ENTRADA: modo: 'aplicar' (el rango Desde / Hasta escrito) o 'todos' ("Ver todos": sin fechas)
// SALIDA:  nada (cambia filtroFechas y vuelve a dibujar desde la página 1; si Desde > Hasta, avisa y no filtra)
// Ej: Desde 19/10 y Hasta 23/10 → "Pedidos con entrega del 19/10/2026 al 23/10/2026 — se producen del 16/10/2026 al 22/10/2026"
// ─────────────────────────────────────────────────────────────────────────────
function aplicarFechas(modo) {
  const inputDesde = document.getElementById('FechaDesde');        // el casillero "Desde"
  const inputHasta = document.getElementById('FechaHasta');        // el casillero "Hasta"

  // 1. "Ver todos": se borran las fechas y se muestra todo
  if (modo === 'todos') {
    inputDesde.value = '';
    inputHasta.value = '';
    filtroFechas = { modo: 'todos', desde: '', hasta: '' };
    renderizarPedidos(1);
    return;
  }

  // 2. "Aplicar": Desde no puede ser después de Hasta ('AAAA-MM-DD' se compara como texto)
  const desde = inputDesde.value;
  const hasta = inputHasta.value;
  const fechasAlReves = Boolean(desde && hasta) && desde > hasta;
  if (fechasAlReves) {
    mostrarCartel('alerta', 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".', '⚠ Fechas inválidas');
    return;
  }

  // 3. Con alguna fecha, el rango; sin ninguna, todo
  const hayAlgunaFecha = Boolean(desde || hasta);
  filtroFechas = hayAlgunaFecha ? { modo: 'entrega', desde: desde, hasta: hasta } : { modo: 'todos', desde: '', hasta: '' };
  renderizarPedidos(1);
}


// ─────────────────────────────────────────────────────────────────────────────
// alCambiarEstado → se eligió otro estado en el select de un pedido
// ENTRADA: pedido y select (el de su fila)
// SALIDA:  nada. Si pasa a "En Preparación" con un pago que no es efectivo y todavía no se confirmó, primero
//          mira si alcanzan los insumos y después pregunta "¿ya pagó?" (pagoPedido.js). Si no, guarda directo.
// Ej: pedido por Transferencia de 1 a 2 → ventana "Confirmar Pago". Pedido en Efectivo de 1 a 2 → se guarda.
// ─────────────────────────────────────────────────────────────────────────────
async function alCambiarEstado(pedido, select) {
  const nuevoId = parseInt(select.value, 10);                      // el estado elegido
  const anteriorId = parseInt(select.dataset.estadoActual, 10);    // el que tenía

  // 1. ¿Hay que confirmar el pago antes? Con Transferencia o Tarjeta, el pago completo; con Mixto, la transferencia.
  const metodo = pedido.metodo_pago || 'Efectivo';                 // sin método = Efectivo
  const pagoPrevioConfirmado = metodo === 'Mixto' ? pedido.transferencia_confirmada : pedido.pagado;
  const hayQueConfirmar = nuevoId === ESTADO_EN_PREPARACION && METODOS_PAGO_PREVIO.includes(metodo) && !pagoPrevioConfirmado;
  if (!hayQueConfirmar) {                                          // si no hace falta confirmar nada...
    guardarEstado(pedido, select, nuevoId, anteriorId);            // ...se guarda directo
    return;
  }

  // 2. Primero los insumos: si no alcanzan, no tiene sentido preguntar por el pago.
  //    Si no se pudo consultar, se sigue: el servidor vuelve a controlar al guardar el estado.
  select.disabled = true;                                          // mientras se consulta, no se puede tocar
  let errorStock = null;                                           // el aviso de insumos (null = alcanza)
  try {
    const respuesta = await apiFetch(`/api/pedidos/${pedido.id}/verificar-stock`);  // ¿alcanzan?
    const datos = await respuesta.json().catch(() => ({}));        // la respuesta (si no es JSON, un objeto vacío)
    const noAlcanza = respuesta.ok && datos.ok === false;          // se pudo consultar y no alcanza
    errorStock = noAlcanza ? datos.error : null;
  } catch (error) {
    // Sin conexión: no se avisa nada acá. El servidor vuelve a controlar al guardar el estado.
  }
  select.disabled = false;
  if (errorStock) {                                                // si no alcanza...
    mostrarCartel('alerta', errorStock, '⚠ Stock insuficiente');    // ...se avisa
    select.value = anteriorId;                                     // ...y el select vuelve a como estaba
    pintarEstado(select, anteriorId);
    return;
  }

  // 3. Se pregunta si ya pagó (la ventana está en pagoPedido.js)
  abrirConfirmarPago(pedido, select, nuevoId, anteriorId);
}


// ─────────────────────────────────────────────────────────────────────────────
// guardarEstado → manda el estado nuevo de un pedido al servidor
// ENTRADA: pedido, select (el de su fila), nuevoId (el estado elegido) y anteriorId (el que tenía)
// SALIDA:  true si se guardó; false si no (avisa el motivo y el select vuelve al estado anterior)
// Ej: 10 fideos (todo de heladera) de 1 a 2 → el servidor lo deja en 3: el select muestra "Listo para Entregar"
//     y avisa "Pedido #250: todo sale de la heladera, pasó directo a Listo para Entregar."
// La usan alCambiarEstado y responderConfirmarPago (pagoPedido.js).
// ─────────────────────────────────────────────────────────────────────────────
async function guardarEstado(pedido, select, nuevoId, anteriorId) {
  try {
    // 1. Se manda (el servidor controla todo: el estado, los insumos y que no esté anulado)
    const respuesta = await apiFetch(`/api/pedidos/${pedido.id}/estado`, {
      method: 'PUT',                                               // PUT = cambiar algo que ya existe
      headers: { 'Content-Type': 'application/json' },             // se manda un JSON
      body: JSON.stringify({ estado_id: nuevoId })                 // el estado nuevo
    });
    const datos = await respuesta.json().catch(() => ({}));        // la respuesta (si no es JSON, un objeto vacío)

    // 2. No se pudo: se avisa el motivo (el del servidor, o uno por si no mandó ninguno) y el select vuelve atrás
    if (!respuesta.ok) {
      const mensaje = datos.error || 'No se pudo actualizar el estado. Intentá de nuevo.';
      const tituloAviso = mensaje.startsWith('Stock insuficiente') ? '⚠ Stock insuficiente' : '⚠ No se pudo cambiar el estado';  // startsWith = "empieza con"
      mostrarCartel('alerta', mensaje, tituloAviso);
      select.value = anteriorId;
      pintarEstado(select, anteriorId);
      return false;
    }

    // 3. El estado que quedó guardado. Casi siempre es el elegido, pero de 1 a 2, si el pedido no tiene nada
    //    para cocinar (todo sale de la heladera), el servidor lo deja directo en 3. (?. = "si vino el pedido")
    const estadoGuardado = datos.pedido?.id_estado || nuevoId;
    select.value = estadoGuardado;                                 // el select muestra el guardado
    select.dataset.estadoActual = estadoGuardado;                  // es el nuevo "anterior"
    pedido.id_estado = estadoGuardado;                             // así la fila sale bien si se vuelve a dibujar
    pintarEstado(select, estadoGuardado);
    const salto = estadoGuardado !== nuevoId;                      // ¿el servidor lo dejó en otro estado (3)?
    if (salto) mostrarCartel('exito', 'Pedido #' + String(pedido.id).padStart(3, '0') + ': todo sale de la heladera, pasó directo a Listo para Entregar.');
    return true;
  } catch (error) {                                                // si no hubo respuesta...
    console.error('No se pudo cambiar el estado:', error);
    mostrarCartel('alerta', 'No se pudo conectar con el servidor. Intentá de nuevo.', '⚠ No se pudo cambiar el estado');
    select.value = anteriorId;
    pintarEstado(select, anteriorId);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// pintarEstado → pinta el select con el color de su estado
// ENTRADA: select y estadoId (1 a 5)
// SALIDA:  nada (cambia el fondo y la letra del select). Ej: 2 → amarillo · 5 → rojo claro
// La usan crearFilaPedido, alCambiarEstado, guardarEstado y responderConfirmarPago (pagoPedido.js).
// ─────────────────────────────────────────────────────────────────────────────
function pintarEstado(select, estadoId) {
  const colores = COLORES_ESTADO[estadoId] || COLORES_ESTADO[1];   // si el estado no está en la tabla, gris
  select.style.backgroundColor = colores.bg;                       // el fondo
  select.style.color = colores.color;                              // la letra
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirDetalles → la ventana "Detalle del Pedido": cada combo con su precio y sus platos, y los platos sueltos
// ENTRADA: pedidoId
// SALIDA:  nada (llena la ventana y la abre)
// Ej: #250 → "PRUEBA Mantenimiento x10  $ 137.000" / "8  fideos" / "2  fideos ⚠ sin sal"
// Los platos de un combo van sin precio (el que se cobra es el del combo). Los pedidos viejos (platos sueltos),
// con su precio unitario.
// ─────────────────────────────────────────────────────────────────────────────
function abrirDetalles(pedidoId) {
  const pedido = todosPedidos.find(p => p.id === pedidoId);        // find = el pedido con ese número (o undefined)
  if (!pedido) return;                                             // si no está, no hace nada

  // 1. El título y cuándo se hizo (fecha_pedido está en UTC: se muestra con la hora de la computadora)
  document.getElementById('modalTitulo').textContent = 'Detalle del Pedido #' + String(pedidoId).padStart(3, '0');
  const realizado = pedido.fecha_pedido ? fechaHoraDDMMAAAA(fechaDeTimestamp(pedido.fecha_pedido)) : '—';  // ej: "15/10/2026 18:40"
  document.getElementById('modalFechaPedido').textContent = realizado;

  // 2. Sin platos: un renglón que lo dice
  const cuerpoTabla = document.getElementById('modalDetallesBody');  // donde van los renglones
  const detalles = pedido.pedido_detalles || [];                   // los platos del pedido
  if (detalles.length === 0) {
    cuerpoTabla.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:1rem;">Sin detalles</td></tr>';
    document.getElementById('modalDetalles').classList.add('visible');
    return;
  }

  // 3. Los renglones de cada plato, ya armados: los de un combo juntos en { id_pedido_combo: '<tr>…' },
  //    y los sueltos aparte. (Así no hace falta un forEach adentro de otro.)
  const filasPorCombo = {};                                        // { id_pedido_combo: renglones de sus platos }
  let filasSueltas = '';                                           // los platos sin combo (pedidos viejos)
  detalles.forEach(detalle => {                                    // por cada plato...
    const nombrePlato = detalle.productos?.nombre || 'Producto';   // ?. = "si vino el plato, su nombre"
    const esSuelto = detalle.id_pedido_combo == null;              // sin combo = de un pedido viejo
    const precio = detalle.precio_unitario != null ? formatearPrecio(detalle.precio_unitario) : '-';
    if (esSuelto) {                                                // ...sin combo: con su precio unitario
      filasSueltas += `
        <tr>
          <td class="col-cant">${escHtml(detalle.cantidad)}</td>
          <td>${escHtml(nombrePlato)}</td>
          <td class="col-precio">${escHtml(precio)}</td>
        </tr>`;
      return;                                                      // (return = este plato ya está: seguir con el siguiente)
    }
    const tieneTexto = detalle.personalizado && detalle.observaciones_plato;  // ...de un combo, ¿es personalizado?
    const marcaPersonalizado = tieneTexto ? ' <span class="plato-personalizado">⚠ ' + escHtml(detalle.observaciones_plato) + '</span>' : '';  // el texto lo escribió el cliente: escHtml
    filasPorCombo[detalle.id_pedido_combo] = (filasPorCombo[detalle.id_pedido_combo] || '') + `
      <tr class="fila-plato-combo">
        <td class="col-cant">${escHtml(detalle.cantidad)}</td>
        <td>${escHtml(nombrePlato)}${marcaPersonalizado}</td>
        <td class="col-precio"></td>
      </tr>`;
  });

  // 4. Cada combo comprado (en el orden en que se guardó): su nombre y precio, y debajo sus platos
  const combos = (pedido.pedido_combos || []).slice();             // slice = una copia (para ordenar sin tocar el pedido)
  combos.sort((a, b) => a.id - b.id);                              // por número, de menor a mayor
  let html = '';
  combos.forEach(combo => {                                        // por cada combo...
    const nombreCombo = combo.combos?.nombre || 'Combo';
    html += `
      <tr class="fila-combo">
        <td colspan="2">${escHtml(nombreCombo)}</td>
        <td class="col-precio">${escHtml(formatearPrecio(combo.precio))}</td>
      </tr>`;
    html += filasPorCombo[combo.id] || '';                         // ...y sus platos (los del paso 3)
  });
  html += filasSueltas;                                            // al final, los platos sueltos

  cuerpoTabla.innerHTML = html;
  document.getElementById('modalDetalles').classList.add('visible');  // se abre
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirAnular → abre la ventana "Anular Pedido", que pide el PIN
// ENTRADA: pedidoId
// SALIDA:  nada (la ventana abierta, con el PIN vacío y el cursor ahí)
// ─────────────────────────────────────────────────────────────────────────────
function abrirAnular(pedidoId) {
  pedidoAnularId = pedidoId;                                       // el pedido que se anula
  document.getElementById('anularTitulo').textContent = 'Anular Pedido #' + String(pedidoId).padStart(3, '0');
  const inputPin = document.getElementById('anularPin');
  inputPin.value = '';                                             // el PIN, vacío
  document.getElementById('anularError').classList.remove('visible');  // sin error
  document.getElementById('modalAnular').classList.add('visible');     // se abre
  inputPin.focus();                                                // el cursor en el PIN
}


// ─────────────────────────────────────────────────────────────────────────────
// confirmarAnulacion → manda la anulación con el PIN
// ENTRADA: nada (lee el PIN de la ventana y pedidoAnularId)
// SALIDA:  nada. Si sale bien: cierra, avisa cuántas viandas volvieron a la heladera y la fila queda "Anulado".
//          Si no: muestra el error en la ventana (ej: "PIN incorrecto").
// Ej: #005 con 10 fideos de heladera → "Pedido #005 anulado. Volvieron 10 viandas a la heladera."
// El PIN lo controla el servidor; acá solo se mira que tenga de 4 a 8 dígitos.
// ─────────────────────────────────────────────────────────────────────────────
async function confirmarAnulacion() {
  const pedido = todosPedidos.find(p => p.id === pedidoAnularId);  // el pedido que se anula
  if (!pedido) return;                                             // si no está, no hace nada

  const inputPin = document.getElementById('anularPin');
  const errorVentana = document.getElementById('anularError');
  const pin = inputPin.value.trim();                               // el PIN escrito, sin espacios en los bordes

  // 1. Control en la pantalla (el servidor lo vuelve a controlar): de 4 a 8 dígitos
  if (!/^\d{4,8}$/.test(pin)) {                                    // ^\d{4,8}$ = solo dígitos, de 4 a 8
    errorVentana.textContent = 'El PIN debe tener entre 4 y 8 dígitos.';
    errorVentana.classList.add('visible');
    inputPin.focus();
    return;
  }

  // 2. Se manda
  const boton = document.getElementById('anularConfirmar');
  boton.disabled = true;                                           // apagado: un doble clic no manda dos veces
  boton.textContent = 'Anulando...';
  errorVentana.classList.remove('visible');
  try {
    const respuesta = await apiFetch(`/api/pedidos/${pedido.id}/anular`, {
      method: 'POST',                                              // POST = hacer algo nuevo (la anulación)
      headers: { 'Content-Type': 'application/json' },             // se manda un JSON
      body: JSON.stringify({ pin: pin })                           // el PIN
    });
    const datos = await respuesta.json().catch(() => ({}));        // la respuesta (si no es JSON, un objeto vacío)

    if (!respuesta.ok) {                                           // si no se pudo: el motivo del servidor (ej: "PIN incorrecto")
      errorVentana.textContent = datos.error || 'No se pudo anular el pedido. Intentá de nuevo.';
      errorVentana.classList.add('visible');
      inputPin.value = '';                                         // el PIN se borra
      inputPin.focus();
      return;
    }

    // 3. Salió bien: el aviso dice cuántas viandas volvieron a la heladera (0 si estaba entregado)
    const numero = '#' + String(pedido.id).padStart(3, '0');
    const devueltas = Number(datos.viandas_devueltas || 0);
    const cuantas = devueltas === 1 ? 'Volvió 1 vianda a la heladera.' : `Volvieron ${devueltas} viandas a la heladera.`;
    const aviso = devueltas > 0 ? `Pedido ${numero} anulado. ${cuantas}` : `Pedido ${numero} anulado.`;
    cerrarVentana('modalAnular');
    mostrarCartel('exito', aviso);
    pedido.id_estado = ESTADO_CANCELADO;                           // el servidor ya lo pasó a 5
    renderizarPedidos(paginacionPedidos.paginaActual());           // se redibuja en la misma página
  } catch (error) {                                                // si no hubo respuesta...
    console.error('No se pudo anular el pedido:', error);
    errorVentana.textContent = 'No se pudo conectar con el servidor.';
    errorVentana.classList.add('visible');
  } finally {                                                      // pase lo que pase...
    boton.disabled = false;                                        // ...el botón vuelve a andar
    boton.textContent = 'Confirmar Anulación';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// cerrarVentana → cierra una ventana de la pantalla
// ENTRADA: idVentana ('modalDetalles', 'modalPago', 'modalConfirmarPago' o 'modalAnular') y, si se tocó el
//          fondo, el evento del clic (un clic adentro de la caja no la cierra)
// SALIDA:  nada. "Confirmar Pago" cerrada cuenta como "No, todavía no pagó" (el select vuelve a como estaba).
// ─────────────────────────────────────────────────────────────────────────────
function cerrarVentana(idVentana, evento) {
  const ventana = document.getElementById(idVentana);
  const clicAdentro = Boolean(evento) && evento.target !== ventana;  // se tocó adentro de la caja, no el fondo
  if (clicAdentro) return;                                         // no se cierra
  switch (idVentana) {
    case 'modalConfirmarPago':                                     // según sea "Confirmar Pago": cerrada = "No, todavía no pagó"
      responderConfirmarPago(false);                               // (pagoPedido.js; la cierra y vuelve el select)
      return;
    case 'modalPago':                                              // según sea "Pago": ya no hay pedido en la ventana
      pedidoPagoId = null;                                         // (pagoPedido.js)
      break;
    case 'modalAnular':                                            // según sea "Anular": se borra el PIN
      document.getElementById('anularPin').value = '';
      pedidoAnularId = null;
      break;
  }
  ventana.classList.remove('visible');                             // se esconde
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarCartel → un aviso flotante arriba a la derecha, que se va solo
// ENTRADA: tipo ('exito' = verde, 4 segundos · 'alerta' = amarillo con título y ×, 8 segundos),
//          mensaje y titulo (solo en las alertas)
// SALIDA:  nada (lo muestra; si había otro igual, lo reemplaza)
// Ej: mostrarCartel('exito', 'Pedido #005 anulado. Volvieron 10 viandas a la heladera.')
//     mostrarCartel('alerta', 'Stock insuficiente de "Huevo"…', '⚠ Stock insuficiente')
// Todo con textContent: lo que viene de la base no se interpreta como HTML.
// ─────────────────────────────────────────────────────────────────────────────
function mostrarCartel(tipo, mensaje, titulo) {
  // 1. Verde: "salió bien" (?.remove() = si había uno, se saca)
  if (tipo === 'exito') {
    document.getElementById('toastExito')?.remove();
    const cartel = document.createElement('div');
    cartel.id = 'toastExito';
    cartel.className = 'toast-exito';                              // el estilo está en ConsultarPedidos.html
    cartel.textContent = '✓ ' + mensaje;
    document.body.appendChild(cartel);
    setTimeout(() => cartel.remove(), 4000);                       // a los 4 segundos se va
    return;
  }

  // 2. Amarillo: "atención", con título y una × para cerrarlo
  document.getElementById('alertaStock')?.remove();                // si había una, se saca
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
    <strong style="display:block;margin-bottom:.35rem;"></strong>
    <span></span>
    <button type="button" aria-label="Cerrar" style="
      position:absolute; top:.5rem; right:.75rem;
      background:none; border:none; font-size:1.1rem;
      cursor:pointer; color:#856404; line-height:1;
    ">×</button>`;
  alerta.querySelector('strong').textContent = titulo;             // el título, como texto
  alerta.querySelector('span').textContent = mensaje;              // el mensaje, como texto
  alerta.querySelector('button').addEventListener('click', () => alerta.remove());  // la × lo cierra
  document.body.appendChild(alerta);
  setTimeout(() => alerta.remove(), 8000);                         // a los 8 segundos se va
}


// ─────────────────────────────────────────────────────────────────────────────
// formatearPrecio → un número como precio en pesos, sin decimales
// ENTRADA: un número (ej: 137000)
// SALIDA:  el texto (ej: "$ 137.000")
// La usan esta pantalla y pagoPedido.js.
// ─────────────────────────────────────────────────────────────────────────────
function formatearPrecio(numero) {
  // Intl.NumberFormat da el formato de un país: 'es-AR' + 'ARS' = pesos con punto de miles. Ej: 68500 → "$ 68.500"
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(numero);
}
