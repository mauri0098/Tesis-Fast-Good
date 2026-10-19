// ============================================================================
// ListarPedidos.js — Pantalla Consultar Pedidos (pages/ConsultarPedidos.html)
//
// Funciones:
//   iniciarConsultarPedidos → al abrir: engancha el buscador, las fechas, los estados y las teclas, y carga estados y pedidos
//   renderizarPedidos       → el filtro (fecha + buscador + estado) y la tabla de a 15
//   renderizarFiltrosEstado → escribe en los botones de estado cuántos pedidos hay de cada uno y marca el elegido
//   crearFilaPedido         → arma la fila de un pedido (la llama crearPaginacion por cada pedido de la página)
//   aplicarFechas           → "Aplicar" (la fecha de entrega) o "Ver todos"
//   alCambiarEstado         → cambió el select de estado: si hace falta, pregunta si ya pagó; si no, guarda
//   guardarEstado           → manda el estado nuevo (PUT /api/pedidos/:id/estado) y muestra el que quedó guardado
//   pintarEstado            → pinta el select con el color de su estado
//   abrirDetalles           → la ventana "Detalles" (un recuadro por combo con sus platos, y el total)
//   abrirAnular             → la ventana "Anular pedido" (pide el PIN)
//   confirmarAnulacion      → manda la anulación (POST /api/pedidos/:id/anular) y avisa cuántas viandas volvieron
//   cerrarVentana           → cierra una ventana (si es "Confirmar pago", cuenta como "No, todavía no pagó")
//   mostrarCartel           → un aviso flotante: verde (salió bien) o amarillo (atención)
//   formatearPrecio         → un número como precio. Ej: 137000 → "$ 137.000"
// Son 14 porque la pantalla tiene la grilla, sus filtros (fecha, buscador y estados) y 4 ventanas
// (Detalles, Pago, Confirmar pago y Anular).
// El pago (ventanas "Pago del Pedido" y "Confirmar Pago") está aparte, en pagoPedido.js.
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion) y fechas.js.
// Todo texto que viene de la base pasa por escHtml (o va con textContent).
// ============================================================================

let todosPedidos = [];                 // todos los pedidos que mandó el servidor (el filtro trabaja sobre esta lista)
let estadoOptions = [];                // los estados posibles: [{ id, nombre }] (para el select de cada fila)
let paginacionPedidos = null;          // lo que devuelve crearPaginacion: sirve para saber en qué página está la tabla
let filtroFechas = { modo: 'todos', desde: '', hasta: '' };  // 'hoy' (al abrir), 'entrega' ("Aplicar") o 'todos'
let filtroEstado = 'todos';            // el botón de estado elegido arriba de la tabla: 'todos' o el número del estado ('1' a '5')
let pedidoAnularId = null;             // el pedido que se está anulando (mientras la ventana está abierta)

const ESTADO_EN_PREPARACION = 2;       // "En Preparación"
const ESTADO_CANCELADO = 5;            // "Cancelado" (anulado): no cambia más de estado ni se cobra
// Con estos métodos, antes de preparar se confirma que el cliente pagó (el efectivo se cobra al entregar)
const METODOS_PAGO_PREVIO = ['Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Mixto'];

// La clase del color del select de cada estado (los colores están en ConsultarPedidos.css)
const COLORES_ESTADO = {
  1: 'estado-registrado',       // Registrado: azul
  2: 'estado-en-preparacion',   // En Preparación: naranja
  3: 'estado-listo',            // Listo para Entregar: verde claro
  4: 'estado-entregado',        // Entregado: verde fuerte
  5: 'estado-cancelado'         // Cancelado: rojo claro
};

// Lo que dice la pastilla de Método Pago: con tarjeta, solo "Tarjeta" (el tipo va abajo, en el detalle chiquito).
// Los demás métodos dicen su nombre tal cual.
const TEXTO_PASTILLA_METODO = {
  'Tarjeta Débito':  'Tarjeta',
  'Tarjeta Crédito': 'Tarjeta'
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
// Ej: un viernes abre con los pedidos que se entregan el lunes (la fecha de entrega dice el 19/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
async function iniciarConsultarPedidos() {
  // 1. El buscador: al escribir se filtra y se vuelve a la página 1
  document.getElementById('CampoBusqueda').addEventListener('input', () => renderizarPedidos(1));

  // 2. Al abrir: los pedidos con entrega el próximo día hábil, que son los que se cocinan hoy
  const hoy = new Date();                                          // hoy, en la computadora
  const proximo = fechaLocalISO(proximoDiaHabil(hoy));             // el próximo día hábil (fechas.js)
  document.getElementById('FechaDesde').value = proximo;           // las fechas muestran ese día
  document.getElementById('FechaHasta').value = proximo;
  filtroFechas = { modo: 'hoy', desde: proximo, hasta: proximo };  // el modo "producción de hoy"
  document.getElementById('btnAplicarFechas').addEventListener('click', () => aplicarFechas('aplicar'));  // "Aplicar"
  document.getElementById('btnVerTodos').addEventListener('click', () => aplicarFechas('todos'));        // "Ver todos"

  // 2b. Los botones de estado de arriba de la tabla: filtran la lista y se vuelve a la página 1.
  //     Un solo "escuchador" para los 6 botones (closest = el botón tocado, o null si se tocó entre dos botones)
  document.getElementById('filtros-estado').addEventListener('click', evento => {
    const boton = evento.target.closest('.boton-estado');
    if (!boton) return;                                            // se tocó entre los botones: nada
    filtroEstado = boton.dataset.estado;                           // 'todos', '1', '2'… (el data-estado del HTML)
    renderizarPedidos(1);
  });

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
    document.getElementById('pedidosBody').innerHTML =             // ...y en la tabla, un mensaje simple (en rojo: texto-error)
      '<tr><td colspan="11" class="loading-text texto-error">Error al conectar con el servidor</td></tr>';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarPedidos → filtra los pedidos y arma la tabla de a 15
// ENTRADA: pagina: en qué página arrancar (1 al filtrar; la misma después de guardar un pago o anular)
// SALIDA:  nada (los botones de estado, cuántos hay de cada uno; la tabla, los pedidos que pasan el filtro de
//          fechas, el buscador y el estado elegido; abajo, "Mostrando X de Y pedidos")
// Ej: modo "hoy" con entrega el 19/10 → solo los pedidos con entrega ese día, sin los anulados.
//     Con "Registrado" elegido, de esos, solo los registrados.
// ─────────────────────────────────────────────────────────────────────────────
function renderizarPedidos(pagina) {
  const modo = filtroFechas.modo;                                  // 'hoy', 'entrega' o 'todos'
  const desde = filtroFechas.desde;                                // 'AAAA-MM-DD' o ''
  const hasta = filtroFechas.hasta;                                // 'AAAA-MM-DD' o ''

  // 1. Los pedidos que se ven: por fecha de entrega (según el modo) y por nombre del cliente o número de pedido
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

  // 2. Los botones de estado: cuántos hay de cada uno entre estos pedidos (así las cantidades cuadran con la lista).
  //    Si hay un estado elegido, solo quedan los de ese estado (sin estado = 1, Registrado, como en el select)
  renderizarFiltrosEstado(visibles);
  const hayEstadoElegido = filtroEstado !== 'todos';
  const delEstado = hayEstadoElegido ? visibles.filter(pedido => String(pedido.id_estado || 1) === filtroEstado) : visibles;

  // 3. El mensaje si no hay ninguno: con algo en el buscador, uno propio; con un estado elegido, otro; si no, el del modo
  const hayBusqueda = textoBuscado.trim() !== '';
  let mensajeVacio = MENSAJE_VACIO[modo];
  if (hayEstadoElegido) mensajeVacio = 'No hay pedidos con ese estado';
  if (hayBusqueda) mensajeVacio = 'No se encontraron pedidos con ese nombre';

  // 4. La tabla, de a 15 por página. crearPaginacion (paginacion.js) llama a crearFilaPedido una vez por fila.
  paginacionPedidos = crearPaginacion({
    datos: delEstado,                                              // los pedidos que se ven
    porPagina: 15,                                                 // de a 15
    contenedorTabla: document.getElementById('pedidosBody'),       // donde van las filas
    contenedorPaginacion: document.getElementById('paginacion'),   // donde van los números de página
    funcionRenderFila: crearFilaPedido,                            // cómo se arma cada fila
    filaVacia: '<tr><td colspan="11" class="loading-text">' + escHtml(mensajeVacio) + '</td></tr>',  // si no hay ninguno
    paginaInicial: pagina,                                         // en qué página arranca
    contenedorResumen: document.getElementById('resumenPaginacion'),  // donde va "Mostrando X de Y pedidos"
    nombreDatos: 'pedidos'                                         // cómo se llaman en ese texto
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarFiltrosEstado → los botones de estado de arriba de la tabla: cuántos pedidos hay de cada estado
//                           y cuál está elegido (en verde)
// ENTRADA: pedidos: los que pasaron el filtro de fechas y el buscador (todavía sin filtrar por estado)
// SALIDA:  nada (escribe el número de cada botón y marca el elegido)
// Ej: hoy hay 3 pedidos, 2 registrados y 1 entregado → "Todos 3" · "Registrado 2" · "Entregado 1" · los demás 0
// La llama renderizarPedidos cada vez que dibuja la tabla. Los botones ya están en el HTML (data-estado="todos", "1"…).
// ─────────────────────────────────────────────────────────────────────────────
function renderizarFiltrosEstado(pedidos) {
  // 1. Cuántos hay de cada estado, en un objeto. Ej: { todos: 3, 1: 2, 4: 1 }
  const cantidades = { todos: pedidos.length };
  pedidos.forEach(pedido => {
    const estado = pedido.id_estado || 1;                          // sin estado = Registrado (como en el select)
    cantidades[estado] = (cantidades[estado] || 0) + 1;            // uno más de ese estado
  });

  // 2. Cada botón: su número y si es el elegido
  document.querySelectorAll('.boton-estado').forEach(boton => {
    const clave = boton.dataset.estado;                            // 'todos', '1', '2'…
    const elegido = clave === filtroEstado;
    boton.querySelector('.cantidad-estado').textContent = cantidades[clave] || 0;  // si no hay ninguno, 0
    boton.classList.toggle('boton-estado-elegido', elegido);       // toggle(clase, sí/no): la pone si es sí y la saca si es no
    boton.setAttribute('aria-pressed', String(elegido));           // para los lectores de pantalla: apretado o no
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaPedido → arma la fila de un pedido
// ENTRADA: pedido (como lo manda GET /api/pedidos)
// SALIDA:  la fila (<tr>) lista para la tabla, con sus botones enganchados
// Ej: #250 · 19/10/2026 · PRUEBA – NO PREPARAR · Ituzaingó 431 / Delivery · Centro · … · 10 / ⚠ 2 personalizados ·
//     $ 137.000 · [Registrado] · [Efectivo] / Cobra al entregar · [Detalles] [Pago] [Anular]
//     Si está anulado: la fila apagada con el costo tachado, el select y "Pago" apagados, y "Anulado" en gris.
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
  const clasePagado = pedido.pagado ? 'pago-cobrado' : 'pago-por-cobrar';            // la pastilla: verde si ya pagó, naranja si falta
  const textoPagado = pedido.pagado ? 'Pagado' : 'Pendiente de pago';                // el cartelito al pasar el mouse por la pastilla
  const iconoPagado = pedido.pagado ? 'icono-cobrado' : 'icono-por-cobrar';          // ✓ si ya pagó; el billete si falta
  const textoMetodo = TEXTO_PASTILLA_METODO[metodo] || metodo;                       // ej: 'Tarjeta Débito' → 'Tarjeta'

  // a. Debajo del método, el detalle chiquito, según sea el método
  let detallePago = '';
  switch (metodo) {
    case 'Mixto': {                                                // según sea Mixto: los dos montos
      const faltaEfectivo = pedido.transferencia_confirmada && !pedido.pagado;   // la transferencia llegó; falta cobrar el efectivo
      detallePago = faltaEfectivo
        ? 'Transferencia ✓ · Efectivo pendiente ' + formatearPrecio(pedido.monto_efectivo || 0)
        : 'Efectivo ' + formatearPrecio(pedido.monto_efectivo || 0) + ' · Transf. ' + formatearPrecio(pedido.monto_transferencia || 0);
      break;
    }
    case 'Efectivo': {                                             // según sea Efectivo: se cobra al entregar, o se pagó antes
      const cobraAlEntregar = !pedido.pagado && !pedido.pago_anticipado;
      if (cobraAlEntregar) detallePago = 'Cobra al entregar';
      if (pedido.pago_anticipado) detallePago = 'Pago anticipado';
      break;
    }
    case 'Transferencia':                                          // según sea Transferencia: si todavía no se confirmó
      detallePago = pedido.pagado ? '' : 'Sin confirmar';
      break;
    case 'Tarjeta Débito':                                         // según sea tarjeta de débito
      detallePago = 'Débito';
      break;
    case 'Tarjeta Crédito':                                        // según sea tarjeta de crédito
      detallePago = 'Crédito';
      break;
  }

  // b. Un pedido anulado no se cobra ni se anula otra vez: "Pago" apagado y "Anulado" en gris.
  //    Su pastilla de pago va en gris, sin ícono ni detalle.
  const anulado     = pedido.id_estado === ESTADO_CANCELADO;
  const pagoApagado = anulado ? 'disabled title="Un pedido anulado no se cobra"' : '';
  const botonAnular = anulado
    ? '<button type="button" class="btn-eliminar" disabled>Anulado</button>'
    : '<button type="button" class="btn-eliminar btn-anular">Anular</button>';
  let clasePastilla = clasePagado;
  let iconoPastilla = '<svg class="icono-pago" aria-hidden="true"><use href="#' + iconoPagado + '"></use></svg>';
  if (anulado) {
    clasePastilla = 'pago-anulado';
    iconoPastilla = '';
    detallePago = '';
  }
  const detalleHTML = detallePago ? '<span class="dato-chico">' + escHtml(detallePago) + '</span>' : '';

  // c. Las viandas: cuántas son en total y cuántas personalizadas (se suman las cantidades de los platos)
  //    Ej: 8 fideos + 2 fideos "sin sal" → 10 viandas y "⚠ 2 personalizados"
  let totalViandas = 0;
  let viandasPersonalizadas = 0;
  (pedido.pedido_detalles || []).forEach(detalle => {
    const cantidad = Number(detalle.cantidad) || 0;
    totalViandas = totalViandas + cantidad;
    if (detalle.personalizado) viandasPersonalizadas = viandasPersonalizadas + cantidad;
  });
  const palabraPersonalizado = viandasPersonalizadas === 1 ? 'personalizado' : 'personalizados';
  const avisoPersonalizados = viandasPersonalizadas > 0
    ? '<span class="dato-chico aviso-personalizados">⚠ ' + escHtml(viandasPersonalizadas) + ' ' + palabraPersonalizado + '</span>'
    : '';

  // d. Debajo de la dirección, cómo se entrega: "Delivery · Centro" o "Retiro en local" (los pedidos viejos no lo tienen)
  const barrio = pedido.barrios?.nombre || '';                     // ?. = "si vino el barrio, su nombre"
  const conBarrio = pedido.tipo_entrega === 'Delivery' && barrio !== '';
  let textoEntrega = pedido.tipo_entrega || '';
  if (conBarrio) textoEntrega = 'Delivery · ' + barrio;

  // 2. La fila. Cada celda lleva la clase de su columna (col-…: el color y el tamaño están en ConsultarPedidos.css).
  //    Las celdas con lo que escribió el cliente quedan vacías y se llenan abajo con textContent.
  const fila = document.createElement('tr');
  fila.innerHTML = `
    <td class="col-numero">${escHtml(numero)}</td>
    <td class="col-entrega">${escHtml(entrega)}</td>
    <td class="col-cliente"><strong></strong></td>
    <td class="col-direccion"><span></span><span class="dato-chico"></span></td>
    <td class="col-contacto"></td>
    <td class="col-contacto"></td>
    <td class="col-viandas">${escHtml(totalViandas)}${avisoPersonalizados}</td>
    <td class="col-costo">${escHtml(formatearPrecio(pedido.total))}</td>
    <td class="col-estado"></td>
    <td class="col-pago">
      <span class="pastilla-pago ${clasePastilla}" title="${textoPagado}">${iconoPastilla}${escHtml(textoMetodo)}</span>
      ${detalleHTML}
    </td>
    <td class="col-acciones">
      <div class="acciones-pedido">
        <button type="button" class="btn-detalles">Detalles</button>
        <button type="button" class="btn-pago" ${pagoApagado}>Pago</button>
        ${botonAnular}
      </div>
    </td>`;

  // 3. Lo que escribió el cliente va con textContent: se muestra como texto y nunca se ejecuta (XSS)
  fila.cells[2].firstElementChild.textContent = cliente;           // columna 3: nombre del cliente
  fila.cells[3].firstElementChild.textContent = direccion;         // columna 4: dirección…
  fila.cells[3].lastElementChild.textContent = textoEntrega;       // …y abajo, cómo se entrega
  fila.cells[3].lastElementChild.hidden = textoEntrega === '';     // sin forma de entrega (pedidos viejos) no ocupa lugar
  fila.cells[4].textContent = telefono;                            // columna 5: teléfono
  fila.cells[5].textContent = email;                               // columna 6: email
  fila.classList.toggle('fila-cancelada', anulado);                // anulado: la fila apagada y el costo tachado (CSS)

  // 4. El select de estado
  const estadoActual = pedido.id_estado || 1;                      // el estado del pedido (1 si no tiene)
  const select = document.createElement('select');
  select.className = 'select-estado';
  select.setAttribute('aria-label', 'Estado del pedido ' + numero);  // para los lectores de pantalla
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
// ENTRADA: modo: 'aplicar' (la fecha de entrega escrita) o 'todos' ("Ver todos": sin fechas)
// SALIDA:  nada (cambia filtroFechas y vuelve a dibujar desde la página 1; si Desde > Hasta, avisa y no filtra)
// En la pantalla hay una sola fecha ("Fecha de entrega" = Desde): Hasta, que no se ve, toma la misma.
// Así se usa el mismo filtro de siempre, con un solo día.
// Ej: fecha de entrega 20/10 → la tabla muestra solo los pedidos con entrega el 20/10/2026
// ─────────────────────────────────────────────────────────────────────────────
function aplicarFechas(modo) {
  const inputDesde = document.getElementById('FechaDesde');        // el casillero "Fecha de entrega"
  const inputHasta = document.getElementById('FechaHasta');        // el casillero "Hasta" (escondido)
  inputHasta.value = inputDesde.value;                             // una sola fecha: Hasta = Desde

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
// SALIDA:  nada (le pone al select la clase de su color; los colores están en ConsultarPedidos.css).
//          Ej: 2 → "select-estado estado-en-preparacion" (naranja) · 5 → "select-estado estado-cancelado" (rojo claro)
// La usan crearFilaPedido, alCambiarEstado, guardarEstado y responderConfirmarPago (pagoPedido.js).
// ─────────────────────────────────────────────────────────────────────────────
function pintarEstado(select, estadoId) {
  const claseColor = COLORES_ESTADO[estadoId] || COLORES_ESTADO[1];  // si el estado no está en la tabla, el de Registrado
  select.className = 'select-estado ' + claseColor;                  // la clase de siempre + la de su color
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirDetalles → la ventana "Detalles": un recuadro por combo con su precio y sus platos, los platos sueltos y el total
// ENTRADA: pedidoId
// SALIDA:  nada (llena la ventana y la abre)
// Ej: #250 → arriba "Realizado el 15/10/2026 · 18:40" y "Pedido #250"; un recuadro "PRUEBA Mantenimiento x10  $ 137.000"
//     con "8 fideos" y "2 fideos  ⚠ sin sal"; abajo "Total  $ 137.000"
// Los platos de un combo van sin precio (el que se cobra es el del combo). Los pedidos viejos (platos sueltos),
// con su precio unitario.
// ─────────────────────────────────────────────────────────────────────────────
function abrirDetalles(pedidoId) {
  const pedido = todosPedidos.find(p => p.id === pedidoId);        // find = el pedido con ese número (o undefined)
  if (!pedido) return;                                             // si no está, no hace nada

  // 1. El título y cuándo se hizo (fecha_pedido está en UTC: se muestra con la hora de la computadora).
  //    replace(' ', ' · ') cambia el espacio entre la fecha y la hora por un puntito. Ej: "15/10/2026 18:40" → "15/10/2026 · 18:40"
  document.getElementById('modalTitulo').textContent = 'Pedido #' + String(pedidoId).padStart(3, '0');
  const realizado = pedido.fecha_pedido ? fechaHoraDDMMAAAA(fechaDeTimestamp(pedido.fecha_pedido)).replace(' ', ' · ') : '—';
  document.getElementById('modalFechaPedido').textContent = realizado;

  // 2. Sin platos: un renglón que lo dice
  const cuerpoTabla = document.getElementById('modalDetallesBody');  // donde van los recuadros
  const detalles = pedido.pedido_detalles || [];                   // los platos del pedido
  if (detalles.length === 0) {
    cuerpoTabla.innerHTML = '<p class="detalle-vacio">Sin detalles</p>';
    document.getElementById('modalDetalles').classList.add('visible');
    return;
  }

  // 3. Los renglones de cada plato, ya armados: los de un combo juntos en { id_pedido_combo: '<div>…' },
  //    y los sueltos aparte. (Así no hace falta un forEach adentro de otro.)
  const filasPorCombo = {};                                        // { id_pedido_combo: renglones de sus platos }
  let filasSueltas = '';                                           // los platos sin combo (pedidos viejos)
  detalles.forEach(detalle => {                                    // por cada plato...
    const nombrePlato = detalle.productos?.nombre || 'Producto';   // ?. = "si vino el plato, su nombre"
    const esSuelto = detalle.id_pedido_combo == null;              // sin combo = de un pedido viejo
    const precio = detalle.precio_unitario != null ? formatearPrecio(detalle.precio_unitario) : '-';
    if (esSuelto) {                                                // ...sin combo: con su precio unitario
      filasSueltas += `
        <div class="linea-plato">
          <span><strong>${escHtml(detalle.cantidad)}</strong> ${escHtml(nombrePlato)}</span>
          <span class="precio-plato">${escHtml(precio)}</span>
        </div>`;
      return;                                                      // (return = este plato ya está: seguir con el siguiente)
    }
    const tieneTexto = detalle.personalizado && detalle.observaciones_plato;  // ...de un combo, ¿es personalizado?
    const marcaPersonalizado = tieneTexto ? '<span class="plato-personalizado">⚠ ' + escHtml(detalle.observaciones_plato) + '</span>' : '';  // el texto lo escribió el cliente: escHtml
    filasPorCombo[detalle.id_pedido_combo] = (filasPorCombo[detalle.id_pedido_combo] || '') + `
      <div class="linea-plato">
        <span><strong>${escHtml(detalle.cantidad)}</strong> ${escHtml(nombrePlato)}</span>${marcaPersonalizado}
      </div>`;
  });

  // 4. Cada combo comprado (en el orden en que se guardó): un recuadro con su nombre y precio, y adentro sus platos
  const combos = (pedido.pedido_combos || []).slice();             // slice = una copia (para ordenar sin tocar el pedido)
  combos.sort((a, b) => a.id - b.id);                              // por número, de menor a mayor
  let html = '';
  combos.forEach(combo => {                                        // por cada combo...
    const nombreCombo = combo.combos?.nombre || 'Combo';
    html += `
      <div class="recuadro-combo">
        <div class="cabecera-combo">
          <span>${escHtml(nombreCombo)}</span>
          <span class="precio-combo">${escHtml(formatearPrecio(combo.precio))}</span>
        </div>
        <div class="platos-combo">${filasPorCombo[combo.id] || ''}</div>
      </div>`;                                                     // ...y adentro sus platos (los del paso 3)
  });

  // 5. Los platos sueltos (pedidos viejos, sin combo), en su propio recuadro
  const haySueltos = filasSueltas !== '';
  if (haySueltos) {
    html += `
      <div class="recuadro-combo">
        <div class="cabecera-combo"><span>Platos sueltos</span></div>
        <div class="platos-combo">${filasSueltas}</div>
      </div>`;
  }

  // 6. El total del pedido, abajo de todo
  html += `
    <div class="total-detalle">
      <span>Total</span>
      <span>${escHtml(formatearPrecio(pedido.total))}</span>
    </div>`;

  cuerpoTabla.innerHTML = html;
  document.getElementById('modalDetalles').classList.add('visible');  // se abre
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirAnular → abre la ventana "Anular pedido", que pide el PIN
// ENTRADA: pedidoId
// SALIDA:  nada (la ventana abierta, con "Pedido #N" arriba del título, el PIN vacío y el cursor ahí)
// ─────────────────────────────────────────────────────────────────────────────
function abrirAnular(pedidoId) {
  pedidoAnularId = pedidoId;                                       // el pedido que se anula
  document.getElementById('anularNumero').textContent = 'Pedido #' + String(pedidoId).padStart(3, '0');  // arriba del título
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
    boton.textContent = 'Confirmar anulación';
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
    cartel.className = 'toast-exito';                              // el estilo está en ConsultarPedidos.css
    cartel.textContent = '✓ ' + mensaje;
    document.body.appendChild(cartel);
    setTimeout(() => cartel.remove(), 4000);                       // a los 4 segundos se va
    return;
  }

  // 2. Amarillo: "atención", con título y una × para cerrarlo
  document.getElementById('alertaStock')?.remove();                // si había una, se saca
  const alerta = document.createElement('div');
  alerta.id = 'alertaStock';
  alerta.className = 'cartel-alerta';                              // el estilo está en ConsultarPedidos.css
  alerta.innerHTML = `
    <strong class="cartel-alerta-titulo"></strong>
    <span></span>
    <button type="button" class="cartel-alerta-cerrar" aria-label="Cerrar">×</button>`;
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
