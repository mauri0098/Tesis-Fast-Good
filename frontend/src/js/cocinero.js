// ============================================================================
// cocinero.js — Tareas de Cocina (pages/cocinero.html): "Para stock" y "Pedidos de clientes"
//
// Funciones:
//   describirDia          → de una fecha 'AAAA-MM-DD' saca "25/10", si es hoy / mañana / atrasada / más adelante
//                           y el nombre de su pestaña ("Hoy", "Mañana", "Martes")
//   cargarParaStock       → pide los pedidos a cocina sin hacer (GET /api/ordenes-produccion/pendientes) y dibuja "Para stock"
//   dibujarTabla          → dibuja una de las dos tablas: las pestañas de días, el filtro (día + buscador) y las páginas.
//                           24/10, Pedidos de clientes: una pestaña por DÍA DE COCINA ("Lunes 26", con HOY; los días
//                           pasados en rojo con "· quedó N"), abre sola en hoy y el pie "Mostrando N viandas para cocinar hoy".
//                           25/10: también escribe el número del botón de la vista (los platos de hoy + los atrasados)
//   crearFilaStock        → una fila de "Para stock" (un plato de un pedido a cocina) con "Detalles" y "✓ Hecho"
//   crearFilaCliente      → una fila de "Pedidos de clientes" (29/10: un PLATO personalizado de un pedido) con
//                           "Detalles" y "✓ Listo para entregar". 24/10: Código · Vianda · Cantidad · Personalización · Estado
//   cambiarVista          → muestra "Para stock" o "Pedidos de clientes"
//   construirResumen      → arma el panel "Resumen del turno": los platos a cocinar hoy y el avance
//   abrirResumen          → abre ese panel (pide lo hecho hoy: GET /api/ordenes-produccion/hechos-hoy)
//   abrirPedidoCocina     → ventana "Detalles" de un pedido a cocina (GET /api/ordenes-produccion/:id, solo lee)
//   abrirDetallesPedido   → ventana "Detalles" de un pedido de cliente (con lo que ya tiene la pantalla)
//   cerrarDetallesPedido, cerrarModalListo, cerrarVentanaCocina → cierran las ventanas
//   marcarListo / confirmarListo → "Listo para entregar": pregunta y PUT /api/pedidos/:id/listo-cocinero
//   quitarPedidoDeLaTabla → saca de la tabla y del resumen un pedido que ya quedó listo
//   mostrarAviso          → el aviso flotante de arriba a la derecha
//
// 28/10 (código de plato): el código ("F3") con pastillaCodigo (escape.js) en las dos tablas, en las dos ventanas
// "Detalles" y en el resumen. El buscador también encuentra por código.
// 29/10 (para leer rápido): las dos grillas quedan Código · Plato · Cantidad · Estado · Fecha de entrega · botones.
// El número de pedido y la fecha del pedido van solo en "Detalles". Los números se escriben "Pedido #057" / "Cocina #112"
// (numeroPedido, de escape.js).
// 24/10 (Pedidos de clientes): cada personalizado se cocina el DÍA HÁBIL ANTERIOR a la entrega (diaHabilAnterior, de
// fechas.js). Las pestañas, el color, el orden y el Resumen van por ese día de cocina. La fila dice "Cocinar: mar 27/10"
// y "Entrega: 28/10", y "A cocinar: 1" / "De la heladera: 9" (este último, solo en la primera fila de cada pedido).
// 24/10 (más simple): en Pedidos de clientes la fila ya no dice el día ni las viandas de la heladera (están en "Detalles");
// la barra tiene una pestaña por día de cocina, cada día de la semana con su color.
// "✓ Hecho" lo hace marcarHecho (pedidosCocina.js, el mismo de Producción): no se toca.
// Necesita antes: roles.js, api.js, escape.js, fechas.js, paginacion.js y pedidosCocina.js.
// Todo lo que viene de la base pasa por escHtml (o se pone con textContent).
// ============================================================================

// ── Lo que la pantalla tiene en memoria ──────────────────────────────────────
// Se declara fuera de DOMContentLoaded para que las demás funciones también lo vean.
let _tareasActivas = [];          // los pedidos de clientes en preparación (con sus platos a cocinar)
let _platosParaStock = [];        // los platos de pedidos a cocina sin hacer
let _hechosHoy = [];              // lo que la cocina marcó "Hecho" hoy (para el resumen)

// El cocinero marca "Hecho" y "Listo". Administración (6, 5, 1) ve toda la cocina, solo para mirar.
const esCocinero = parseInt(localStorage.getItem('usuario_rol') || '0', 10) === FG_ROLES.ROL.COCINERO;

// Lo elegido en cada vista: el día (pestaña) y lo escrito en el buscador.
// 24/10: en clientes arranca vacío ('') = "todavía no se eligió": dibujarTabla abre solo en el día de hoy
const filtrosVista = {
  stock:    { dia: 'todos', texto: '' },
  clientes: { dia: '', texto: '' }
};

// Las páginas de cada tabla (lo que devuelve crearPaginacion): así una recarga no vuelve a la página 1
const paginacionVista = { stock: null, clientes: null };

// Dónde va cada cosa de cada vista y qué dice si no hay nada.
// idCantidad (25/10): el circulito del botón de la vista ("Para stock 2", "Pedidos de clientes 6"); lo escribe dibujarTabla
const VISTAS = {
  stock: {
    idDias: 'diasStock', idBuscar: 'buscarStock', idCuerpo: 'cuerpoParaStock',
    idPaginacion: 'paginacionStock', idResumen: 'resumenParaStock', idCantidad: 'cantidadParaStock',
    columnas: 6, nombreDatos: 'platos', vacio: 'No hay nada pendiente para stock.'
  },
  clientes: {
    idDias: 'diasClientes', idBuscar: 'buscarClientes', idCuerpo: 'tablaTareas',
    idPaginacion: 'paginacionClientes', idResumen: 'resumenClientes', idCantidad: 'contador-badge',
    columnas: 6, nombreDatos: 'platos', vacio: 'No hay pedidos en preparación en este momento.'
  }
};

const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NOMBRES_DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];   // para "Cocinar: mar 27/10" (24/10)

// El nombre de la pestaña de hoy, mañana y lo atrasado (lo que viene después lleva el nombre del día)
const ETIQUETAS_DIA = { atrasado: 'Atrasados', hoy: 'Hoy', manana: 'Mañana' };

// Un pedido sin fecha de entrega (no debería pasar): va a su propia pestaña
const SIN_FECHA = { clave: 'sin-fecha', etiqueta: 'Sin fecha', tipo: 'despues', diaMes: '—', diaCorto: '' };

// El puntito de color de cada día de la semana en las pestañas de Pedidos de clientes (24/10). La clave es getDay()
// (1 = lunes … 5 = viernes); los colores están en cocinero.css. Sábado y domingo no se cocina: no tienen
const CLASE_PUNTO_DIA = { 1: 'punto-lunes', 2: 'punto-martes', 3: 'punto-miercoles', 4: 'punto-jueves', 5: 'punto-viernes' };


// ─────────────────────────────────────────────────────────────────────────────
// describirDia → todo lo que la pantalla muestra de una fecha
// ENTRADA: fechaISO, 'AAAA-MM-DD' (la fecha de entrega, la de cocina o la de un pedido)
// SALIDA:  { clave, etiqueta, tipo, diaMes, diaCorto, diaSemana, diaLargo }
//          clave: la pestaña ('atrasado', 'hoy', 'manana' o la misma fecha) · etiqueta: su nombre
//          tipo: 'atrasado' | 'hoy' | 'manana' | 'despues' (el color) · diaMes: "25/10" · diaCorto (24/10): "mar"
//          24/10, para las pestañas de Pedidos de clientes: diaSemana: 0 (domingo) a 6 (sábado) · diaLargo: "Jueves 29"
// Ej (hoy 28/10): '2026-10-29' → { clave: 'manana', etiqueta: 'Mañana', tipo: 'manana', diaMes: '29/10', diaCorto: 'jue',
//                                  diaSemana: 4, diaLargo: 'Jueves 29' }
//                 '2026-11-03' → { clave: '2026-11-03', etiqueta: 'Martes', tipo: 'despues', diaMes: '03/11', diaCorto: 'mar', … }
// ─────────────────────────────────────────────────────────────────────────────
function describirDia(fechaISO) {
  const fecha = parseFechaLocal(fechaISO);                        // la fecha, a medianoche (fechas.js)
  const hoy = parseFechaLocal(fechaLocalISO(new Date()));         // hoy, a medianoche
  const distancia = Math.round((fecha - hoy) / 86400000);         // cuántos días faltan (86.400.000 ms = 1 día; negativo = ya pasó)
  const diaMes = String(fecha.getDate()).padStart(2, '0') + '/' + String(fecha.getMonth() + 1).padStart(2, '0');  // "25/10"

  // Qué tipo de día es (el último que se cumple gana)
  let tipo = 'despues';                                           // más adelante
  if (distancia === 1) tipo = 'manana';
  if (distancia === 0) tipo = 'hoy';
  if (distancia < 0) tipo = 'atrasado';

  // El nombre de la pestaña: "Hoy", "Mañana", "Atrasados" o el día de la semana (a más de 6 días, "03/11")
  const nombreDia = distancia <= 6 ? NOMBRES_DIAS[fecha.getDay()] : diaMes;
  const etiqueta = ETIQUETAS_DIA[tipo] || nombreDia;
  const clave = tipo === 'despues' ? fechaISO : tipo;             // lo atrasado va todo junto en una pestaña
  const diaLargo = NOMBRES_DIAS[fecha.getDay()] + ' ' + fecha.getDate();   // ej: "Jueves 29" (24/10)
  return {
    clave: clave, etiqueta: etiqueta, tipo: tipo, diaMes: diaMes, diaCorto: NOMBRES_DIAS_CORTOS[fecha.getDay()],
    diaSemana: fecha.getDay(), diaLargo: diaLargo
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarParaStock → pide los platos de pedidos a cocina que no están hechos y dibuja "Para stock"
// ENTRADA: nada
// SALIDA:  nada. Llena _platosParaStock y la tabla (con su número, 25/10: dibujarTabla). Deja todo listo para que
//          marcarHecho (pedidosCocina.js) encuentre el plato tocado y vuelva a llamar a esta función.
// Ej: [{ id: 21, id_orden: 112, fecha_para: '2026-10-29', plato: 'Canelones', cantidad: 12, … }] → 1 fila "#112 Canelones … 12 viandas"
// ─────────────────────────────────────────────────────────────────────────────
async function cargarParaStock() {
  // 1. Se piden los pendientes
  let pendientes = null;
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/pendientes');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);  // si el servidor dio error, va al catch
    pendientes = await respuesta.json();
  } catch (error) {                                               // si no se pudo...
    console.error('No se pudieron cargar los pendientes de cocina:', error);  // ...el detalle a la consola
    document.getElementById('cuerpoParaStock').innerHTML =
      '<tr><td colspan="6" class="loading-text texto-error">Error al cargar los pendientes de cocina</td></tr>';
    return;
  }

  // 2. A cada plato se le agrega su día y el texto donde busca el buscador; y se guardan por número
  const porId = {};                                               // { id del renglón: plato } (para "Hecho")
  pendientes.forEach(plato => {
    plato.dia = describirDia(plato.fecha_para);                   // "29/10", mañana…
    // Lo que encuentra el buscador: el número (aunque ya no se vea en la grilla), el código y el plato.
    // Ej: "#112 cocina #112 f3 canelones"
    plato.busqueda = ('#' + plato.id_orden + ' ' + numeroPedido(plato.id_orden, 'cocina') + ' ' + (plato.codigo_plato || '') + ' ' + (plato.plato || '')).toLowerCase();
    porId[plato.id] = plato;
  });

  // 3. Lo que necesita marcarHecho (pedidosCocina.js): si hay botón, qué recargar y los platos por número
  listasPendientes.listaParaStock = { conBotonHecho: esCocinero, recargar: cargarParaStock, porId: porId };

  // 4. Se guardan y se dibuja (también el resumen, por si está abierto). El número de "Para stock" lo escribe
  //    dibujarTabla (25/10: solo lo de hoy y lo atrasado)
  _platosParaStock = pendientes;
  dibujarTabla('stock');
  construirResumen(_tareasActivas);
}


// ─────────────────────────────────────────────────────────────────────────────
// dibujarTabla → dibuja una de las dos tablas con lo elegido en su barra
// ENTRADA: vista, 'stock' o 'clientes'
// SALIDA:  nada. Arma las pestañas (Todos · ● Hoy · ● Mañana · ● Martes…, una por cada día que aparece),
//          filtra por día y por lo escrito, y dibuja la página que corresponde con "Mostrando X de Y".
//          24/10, Pedidos de clientes: una pestaña por día de cocina con algo por hacer, en orden de fecha:
//          ● Viernes 23 · quedó 1 (un día que ya pasó: en rojo) · ● Lunes 26 HOY · ● Martes 27 · … · Todos (al final).
//          La primera vez (y cuando el día elegido se termina) abre sola en HOY; si hoy no hay nada, en el día atrasado;
//          si tampoco, en "Todos" con el cartelito gris "Hoy no hay nada para cocinar". El pie dice
//          "Mostrando 11 viandas para cocinar hoy" (las viandas de las filas que se ven, de todas las páginas).
// Ej: dibujarTabla('stock') con la pestaña "Hoy" elegida → solo los platos para hoy
// ─────────────────────────────────────────────────────────────────────────────
function dibujarTabla(vista) {
  const config = VISTAS[vista];
  const filtro = filtrosVista[vista];
  const esClientes = vista === 'clientes';

  // Pedidos de clientes (29/10): una fila por PLATO personalizado; las del mismo pedido quedan juntas (los pedidos ya
  // vienen ordenados por día de cocina). Cada fila sabe su pedido, su día de cocina, sus viandas y si la que sigue
  // es del mismo pedido (para la línea).
  // flatMap: [{ id: 57, pedido_detalles: [A, B] }] → [{ pedido: 57, det: A, sigueElMismo: true }, { pedido: 57, det: B, sigueElMismo: false }]
  const filasClientes = _tareasActivas.flatMap(pedido =>
    pedido.pedido_detalles.map((det, posicion) => ({
      pedido: pedido,                                             // el pedido de este plato
      det: det,                                                   // el plato
      dia: pedido.pestana,                                        // la pestaña de su DÍA DE COCINA (24/10: "Lunes 26")
      cantidad: Number(det.cantidad) || 0,                        // sus viandas (24/10: para "quedó N" y el pie)
      sigueElMismo: posicion < pedido.pedido_detalles.length - 1, // ¿la fila de abajo es del mismo pedido?
      busqueda: ('#' + pedido.id + ' ' + numeroPedido(pedido.id, 'cliente') + ' ' + (det?.productos?.codigo_plato || '') + ' '
        + (det?.productos?.nombre || '') + ' ' + (det.observaciones_plato || '')).toLowerCase()  // ej: "#57 pedido #057 f4 merluza sin sal"
    }))
  );

  const datos = vista === 'stock' ? _platosParaStock : filasClientes;   // los platos de cocina o los platos de clientes
  const crearFila = vista === 'stock' ? crearFilaStock : crearFilaCliente;

  // 1. Los días que aparecen, en orden (los datos ya vienen ordenados por fecha), y cuántas viandas tiene cada uno
  const dias = [];                                                // las pestañas, sin repetir
  const yaEsta = {};                                              // { clave: true } de las que ya están
  const viandasDelDia = {};                                       // { clave: viandas } (24/10: para "· quedó 1")
  datos.forEach(item => {
    viandasDelDia[item.dia.clave] = (viandasDelDia[item.dia.clave] || 0) + (Number(item.cantidad) || 0);
    if (yaEsta[item.dia.clave]) return;                           // ya tiene su pestaña (return = saltear y seguir)
    yaEsta[item.dia.clave] = true;
    dias.push(item.dia);
  });

  // 1b. (25/10) El circulito del botón de la vista: cuántas filas (platos) hay para HOY o ATRASADAS, lo que hay que
  //     hacer ya; los días que vienen no cuentan. Se escribe acá porque esta función se llama cada vez que algo cambia
  //     (al cargar, al marcar "✓ Hecho" o "✓ Listo", y cada 60 segundos en "Para stock").
  //     filter = las filas que cumplen. Ej (lunes 26): 1 del viernes + 5 de hoy + 2 de martes y jueves → 6
  const paraHacerYa = datos.filter(item => {
    const esDeHoyOAtrasado = item.dia.tipo === 'hoy' || item.dia.tipo === 'atrasado';
    return esDeHoyOAtrasado;
  });
  document.getElementById(config.idCantidad).textContent = paraHacerYa.length;

  // 2. El día elegido. Si todavía no se eligió ('') o ya no tiene nada (se terminó): en "Para stock", "Todos";
  //    en clientes (24/10), hoy; si hoy no hay nada, el primer día atrasado; si tampoco, "Todos".
  //    find = la primera pestaña que cumple, o undefined
  const pestanaHoy = dias.find(dia => dia.tipo === 'hoy');
  const pestanaAtrasada = dias.find(dia => dia.tipo === 'atrasado');
  let diaParaAbrir = 'todos';
  if (pestanaAtrasada) diaParaAbrir = pestanaAtrasada.clave;
  if (pestanaHoy) diaParaAbrir = pestanaHoy.clave;               // hoy gana
  const diaSinNada = filtro.dia !== 'todos' && !yaEsta[filtro.dia];  // no se eligió o el elegido ya no tiene nada
  if (diaSinNada) filtro.dia = esClientes ? diaParaAbrir : 'todos';

  // 3. Las pestañas: un día con su puntito de color, y "Todos" (en stock, al principio; en clientes, al final)
  const claseTodos = filtro.dia === 'todos' ? ' activo' : '';
  const claseDiaTodos = esClientes ? ' pestana-dia' : '';          // en clientes, "Todos" del mismo tamaño que los días (sin puntito)
  const pestanaTodos = '<button type="button" class="pestana-estado' + claseDiaTodos + claseTodos + '" data-dia="todos">Todos</button>';
  let htmlDias = esClientes ? '' : pestanaTodos;
  dias.forEach(dia => {
    const claseElegida = filtro.dia === dia.clave ? ' activo' : '';
    if (!esClientes) {                                            // "Para stock": como siempre (return = seguir con el siguiente)
      htmlDias += `
      <button type="button" class="pestana-estado${claseElegida}" data-dia="${escHtml(dia.clave)}">
        <span class="punto-pestana punto-${dia.tipo}"></span>${escHtml(dia.etiqueta)}
      </button>`;
      return;
    }
    // Pedidos de clientes (24/10): "● Lunes 26 HOY" o, si ya pasó, en rojo "● Viernes 23 · quedó 1"
    const esAtrasado = dia.tipo === 'atrasado';
    const claseAtrasado = esAtrasado ? ' pestana-atrasada' : '';
    const etiquetaHoy = dia.tipo === 'hoy' ? '<span class="etiqueta-hoy">HOY</span>' : '';
    const quedo = esAtrasado ? ' · quedó ' + viandasDelDia[dia.clave] : '';
    htmlDias += `
      <button type="button" class="pestana-estado pestana-dia${claseAtrasado}${claseElegida}" data-dia="${escHtml(dia.clave)}">
        <span class="punto-pestana ${dia.clasePunto}"></span>${escHtml(dia.etiqueta)}${quedo}${etiquetaHoy}
      </button>`;
  });
  if (esClientes) htmlDias += pestanaTodos;
  document.getElementById(config.idDias).innerHTML = htmlDias;

  // 4. Lo que se ve: el día elegido y lo escrito en el buscador (en minúscula: "Canel" encuentra "canelones")
  const texto = filtro.texto.trim().toLowerCase();
  const visibles = datos.filter(item => {
    const pasaDia = filtro.dia === 'todos' || item.dia.clave === filtro.dia;
    const pasaTexto = texto === '' || item.busqueda.includes(texto);
    return pasaDia && pasaTexto;
  });

  // 5. Las páginas (paginacion.js): la misma página en la que estaba (si ya no existe, la última).
  //    En clientes (24/10) el pie lo escribe el paso 6, no paginacion.js
  const mensajeVacio = datos.length > 0 ? 'No hay nada con ese filtro.' : config.vacio;
  const paginaAnterior = paginacionVista[vista] ? paginacionVista[vista].paginaActual() : 1;
  const contenedorResumen = esClientes ? null : document.getElementById(config.idResumen);
  paginacionVista[vista] = crearPaginacion({
    datos: visibles,
    porPagina: 15,
    contenedorTabla: document.getElementById(config.idCuerpo),
    contenedorPaginacion: document.getElementById(config.idPaginacion),
    funcionRenderFila: crearFila,
    filaVacia: '<tr class="empty-row"><td colspan="' + config.columnas + '" class="loading-text">' + mensajeVacio + '</td></tr>',
    paginaInicial: paginaAnterior,
    contenedorResumen: contenedorResumen,
    nombreDatos: config.nombreDatos
  });
  if (!esClientes) return;                                        // "Para stock" ya está

  // 6. Pedidos de clientes (24/10): el cartelito gris y el pie.
  //    a. "Hoy no hay nada para cocinar": hay pedidos, pero ninguno para hoy ni atrasado
  const sinNadaHoy = datos.length > 0 && !pestanaHoy && !pestanaAtrasada;
  document.getElementById('avisoSinHoy').hidden = !sinNadaHoy;

  //    b. "Mostrando 11 viandas para cocinar hoy": las viandas de lo que se ve y de qué día
  let viandasVisibles = 0;
  visibles.forEach(item => { viandasVisibles = viandasVisibles + item.cantidad; });
  const diaElegido = dias.find(dia => dia.clave === filtro.dia);  // la pestaña elegida (undefined en "Todos")
  const tipoElegido = diaElegido ? diaElegido.tipo : 'todos';
  const nombreElegido = diaElegido ? diaElegido.etiqueta.toLowerCase() : '';   // ej: "martes 27"
  const PARA_CUANDO = {                                           // lo que dice el final del pie, según el día elegido
    todos:    'para cocinar en total',
    hoy:      'para cocinar hoy',
    atrasado: 'sin hacer del ' + nombreElegido,
    manana:   'para cocinar el ' + nombreElegido,
    despues:  'para cocinar el ' + nombreElegido
  };
  const palabraViandas = viandasVisibles === 1 ? 'vianda' : 'viandas';
  const textoPie = 'Mostrando <strong>' + viandasVisibles + '</strong> ' + palabraViandas + ' ' + escHtml(PARA_CUANDO[tipoElegido]);
  document.getElementById(config.idResumen).innerHTML = datos.length > 0 ? textoPie : '';   // sin pedidos, el pie vacío
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaStock → la fila de un plato de un pedido a cocina
// ENTRADA: plato, uno de /pendientes (con su .dia, ver cargarParaStock)
// SALIDA:  el <tr>: Código · plato (plan) · "12 viandas" · Por hacer · fecha de entrega · botones
// Ej: { codigo_plato: 'F7', plato: 'Canelones', plan: 'Keto', cantidad: 12 } → "F7 | Canelones (Keto) | 12 viandas | Por hacer | 25/10"
// 29/10: el número del pedido a cocina y la fecha del pedido ya no van acá: están en "Detalles".
// "✓ Hecho" solo para el cocinero: lo escucha marcarHecho (pedidosCocina.js) por su clase btn-hecho y su data-id.
// ─────────────────────────────────────────────────────────────────────────────
function crearFilaStock(plato) {
  // Lo que va en la fila, calculado antes (nada de "? :" adentro del HTML)
  const idOrden = Number(plato.id_orden);
  const cantidad = Number(plato.cantidad);
  const palabraViandas = cantidad === 1 ? 'vianda' : 'viandas';
  const plan = plato.plan ? ' <span class="plan-plato">(' + escHtml(plato.plan) + ')</span>' : '';
  const botonHecho = esCocinero
    ? '<button type="button" class="btn-hecho boton-hecho" data-id="' + Number(plato.id) + '">✓ Hecho</button>'
    : '';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="col-codigo">${pastillaCodigo(plato.codigo_plato, '')}</td>
    <td class="celda-plato"><span class="nombre-plato">${escHtml(plato.plato)}</span>${plan}</td>
    <td><span class="pastilla-cantidad"><b>${cantidad}</b> ${palabraViandas}</span></td>
    <td class="col-estado"><span class="etiqueta-estado estado-por-hacer">Por hacer</span></td>
    <td><span class="pastilla-fecha fecha-${plato.dia.tipo}">${escHtml(plato.dia.diaMes)}</span></td>
    <td class="celda-botones">
      <div class="botones-fila">
        <button type="button" class="boton-detalles-cocina" onclick="abrirPedidoCocina(${idOrden})">Detalles</button>${botonHecho}
      </div>
    </td>`;
  return tr;
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaCliente → la fila de UN plato personalizado de un pedido de cliente (29/10: antes, una fila por pedido)
// ENTRADA: fila, una de las que arma dibujarTabla: { pedido, det, sigueElMismo }
// SALIDA:  el <tr>: Código · Vianda a cocinar · Cantidad · Personalización · Estado · botones
//          24/10 (más simple): el código en negrita, sin pastilla; "3 viandas" (el número en negrita); la etiqueta roja
//          ("SIN SAL") en su columna. Sin el día de cocina, la entrega ni las viandas de la heladera: están en "Detalles"
// Ej: plato F4 "Merluza con calabaza" sin lácteos, 1 vianda → "F4 | Merluza con calabaza | 1 vianda | SIN LÁCTEOS | Por hacer"
// El número de pedido va en "Detalles".
// Cada fila lleva data-pedido-id: así confirmarListo y quitarPedidoDeLaTabla encuentran TODAS las del pedido, igual que antes.
// ─────────────────────────────────────────────────────────────────────────────
function crearFilaCliente(fila) {
  const pedido = fila.pedido;
  const det = fila.det;
  const idPedido = Number(pedido.id);

  // Lo que va en la fila, calculado antes. El código, el plato y el texto personalizado vienen de la base: escHtml
  const codigo = det?.productos?.codigo_plato || '—';              // ?. = "si vino el producto, su código" (ej: "F4")
  const nombre = det?.productos?.nombre || '—';                    // ?. = "si vino el producto, su nombre"
  const cantidad = Number(det.cantidad);
  const palabraViandas = cantidad === 1 ? 'vianda' : 'viandas';
  const textoPersonalizado = det.observaciones_plato || 'personalizado';   // ej: "sin sal" (sin texto: "personalizado")
  const etiqueta = det.personalizado
    ? '<span class="etiqueta-personalizado">' + escHtml(textoPersonalizado) + '</span>'
    : '<span class="dato-vacio">—</span>';

  // "✓ Listo para entregar" (marca listos TODOS los platos de este cocinero en el pedido, como siempre: la confirmación
  // lo dice). La administración solo mira.
  const accion = esCocinero
    ? '<button type="button" class="btn-listo boton-listo" onclick="marcarListo(' + idPedido + ', this)">✓ Listo para entregar</button>'
    : '<span class="solo-lectura">Solo lectura</span>';

  const tr = document.createElement('tr');
  tr.dataset.pedidoId = pedido.id;
  if (fila.sigueElMismo) tr.classList.add('sigue-mismo-pedido');  // la línea de abajo, más suave: el plato de abajo es del mismo pedido
  tr.innerHTML = `
    <td class="col-codigo"><b class="codigo-texto">${escHtml(codigo)}</b></td>
    <td class="celda-vianda"><span class="nombre-plato dos-renglones">${escHtml(nombre)}</span></td>
    <td class="celda-cantidad"><b>${cantidad}</b> <span class="palabra-viandas">${palabraViandas}</span></td>
    <td class="celda-personalizacion">${etiqueta}</td>
    <td class="col-estado"><span class="etiqueta-estado estado-por-hacer">Por hacer</span></td>
    <td class="celda-botones">
      <div class="botones-fila">
        <button type="button" class="boton-detalles-cocina btn-detalles" onclick="abrirDetallesPedido(${idPedido})">Detalles</button>${accion}
      </div>
    </td>`;
  return tr;
}


// ─────────────────────────────────────────────────────────────────────────────
// cambiarVista → muestra una de las dos vistas y marca su botón
// ENTRADA: vista, 'stock' o 'clientes'
// SALIDA:  nada (se ve una sección y se esconde la otra; el botón elegido queda blanco con letra verde)
// Ej: cambiarVista('clientes') → se ve "Pedidos de clientes"
// ─────────────────────────────────────────────────────────────────────────────
function cambiarVista(vista) {
  const esStock = vista === 'stock';
  document.getElementById('vistaStock').hidden = !esStock;
  document.getElementById('vistaClientes').hidden = esStock;

  const botonStock = document.getElementById('botonVistaStock');
  const botonClientes = document.getElementById('botonVistaClientes');
  botonStock.classList.toggle('vista-elegida', esStock);         // toggle con true pone la clase; con false la saca
  botonClientes.classList.toggle('vista-elegida', !esStock);
  botonStock.setAttribute('aria-pressed', String(esStock));       // para los lectores de pantalla
  botonClientes.setAttribute('aria-pressed', String(!esStock));
}


// ─────────────────────────────────────────────────────────────────────────────
// construirResumen → arma el panel "Resumen del turno"
// ENTRADA: tareas, los pedidos de clientes (_tareasActivas). Usa también _platosParaStock y _hechosHoy.
// SALIDA:  nada. Escribe "Avance: 2 de 8 hechos", la barra y la lista "Platos a cocinar hoy":
//          primero lo de stock (lo hecho hoy, tachado y con ✓) y después los personalizados de clientes.
//          "Hoy": en stock, lo que es para hoy; en clientes (24/10), los que se COCINAN hoy (el día hábil anterior a la entrega).
// Ej: "☐ Canelones de verdura / para stock  12" · "☑ ~~Albóndigas~~ / para stock  10" · "☐ Pollo con arroz · SIN SAL / pedido #55  2"
// ─────────────────────────────────────────────────────────────────────────────
function construirResumen(tareas) {
  const panelBody = document.getElementById('panel-body');
  if (!panelBody) return;
  const hoy = fechaLocalISO(new Date());                          // hoy, 'AAAA-MM-DD'

  // 1. Lo de stock: lo pendiente para hoy y lo que ya se hizo hoy
  const renglones = [];                                           // { nombre, obs, origen, cantidad, hecho }
  _platosParaStock.forEach(plato => {
    if (plato.fecha_para !== hoy) return;                         // no es para hoy (return = saltear y seguir)
    renglones.push({ codigo: plato.codigo_plato, nombre: plato.plato, obs: '', origen: 'para stock', cantidad: plato.cantidad, hecho: false });
  });
  _hechosHoy.forEach(plato => {
    renglones.push({ codigo: plato.codigo_plato, nombre: plato.plato, obs: '', origen: 'para stock', cantidad: plato.cantidad, hecho: true });
  });
  // Por nombre de plato (sort compara de a dos: negativo = a va antes)
  renglones.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  // (28/10: cada renglón lleva también su código, para la pastillita: { codigo: 'F3', … })

  // 2. Los personalizados que se cocinan hoy (24/10: por día de cocina; antes, por fecha de entrega).
  //    flatMap: de cada pedido saca sus platos y los junta en una sola lista (así no hay un forEach adentro de otro).
  //    Ej: [{ id: 53, platos: [A, B] }, { id: 54, platos: [C] }] → [A (del 53), B (del 53), C (del 54)]
  const platosClientes = tareas.flatMap(pedido =>
    pedido.pedido_detalles.map(det => ({ det: det, idPedido: pedido.id, diaCocina: pedido.dia_cocina }))
  );
  platosClientes.forEach(item => {
    if (item.diaCocina !== hoy) return;                           // no se cocina hoy (return = saltear y seguir)
    renglones.push({
      codigo: item.det?.productos?.codigo_plato,
      nombre: item.det?.productos?.nombre || '—',
      obs: item.det.observaciones_plato || '',
      origen: numeroPedido(item.idPedido, 'cliente'),             // ej: "Pedido #055" (29/10)
      cantidad: item.det.cantidad,
      hecho: false
    });
  });

  // 3. El avance: cuántos renglones están hechos de todos (filter = los que cumplen)
  const hechos = renglones.filter(renglon => renglon.hecho).length;
  const porcentaje = renglones.length > 0 ? Math.round((hechos / renglones.length) * 100) : 0;
  document.getElementById('textoAvanceResumen').innerHTML = '<b>' + hechos + '</b> de ' + renglones.length + ' hechos';
  document.getElementById('barraAvanceResumen').style.width = porcentaje + '%';   // la barra verde (el ancho cambia con el avance)

  if (renglones.length === 0) {
    panelBody.innerHTML = '<p class="panel-vacio">No hay platos para cocinar hoy.</p>';
    return;
  }

  // 4. La lista: la casilla (con ✓ si está hecho), el plato (con su personalizado), de dónde es y cuántas
  let html = '';
  renglones.forEach(renglon => {
    const claseHecho = renglon.hecho ? ' renglon-hecho' : '';
    const casilla = renglon.hecho
      ? '<span class="casilla-resumen casilla-marcada"><svg aria-hidden="true"><use href="#icono-check"></use></svg></span>'
      : '<span class="casilla-resumen"></span>';
    const obs = renglon.obs ? ' · <span class="obs-resumen">' + escHtml(renglon.obs) + '</span>' : '';
    html += `
      <div class="renglon-resumen${claseHecho}">
        ${casilla}
        <div class="textos-renglon">
          <div class="nombre-renglon">${pastillaCodigo(renglon.codigo, renglon.nombre)}${escHtml(renglon.nombre)}${obs}</div>
          <div class="origen-renglon">${escHtml(renglon.origen)}</div>
        </div>
        <b class="cantidad-renglon">${Number(renglon.cantidad)}</b>
      </div>`;
  });
  panelBody.innerHTML = html;
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirResumen → abre el panel "Resumen del turno" (el botón de arriba a la derecha)
// ENTRADA: nada
// SALIDA:  nada. Abre el panel, escribe "Hoy, miércoles 28/10", pide lo hecho hoy y arma la lista.
//          Si lo hecho hoy no se pudo pedir, la lista sale igual (sin los tachados).
// ─────────────────────────────────────────────────────────────────────────────
async function abrirResumen() {
  const hoy = new Date();
  const diaHoy = describirDia(fechaLocalISO(hoy));               // para el "28/10"
  document.getElementById('fechaResumen').textContent = 'Hoy, ' + NOMBRES_DIAS[hoy.getDay()].toLowerCase() + ' ' + diaHoy.diaMes;
  document.getElementById('panel-body').innerHTML = '<p class="panel-vacio">Cargando...</p>';
  document.getElementById('fondoResumen').style.display = 'block';   // se abre

  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/hechos-hoy');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);  // si el servidor dio error, va al catch
    _hechosHoy = await respuesta.json();
  } catch (error) {
    console.error('No se pudo cargar lo hecho hoy:', error);     // el detalle a la consola
    _hechosHoy = [];                                              // la lista sale sin los hechos
  }
  construirResumen(_tareasActivas);
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirPedidoCocina → la ventana "Detalles" de un pedido a cocina (desde "Para stock")
// ENTRADA: idOrden, el número del pedido a cocina
// SALIDA:  nada. Abre la ventana y la llena con lo que manda GET /api/ordenes-produccion/:id (solo lee):
//          fecha de pedido · fecha de entrega · pidió · total, la tabla de sus platos (lo hecho, tachado) y el avance.
// Ej: abrirPedidoCocina(112) → "Pedido a cocina #112" · 24/10 · 25/10 · Mauri · 22 viandas · "1 de 2 platos hechos"
// ─────────────────────────────────────────────────────────────────────────────
async function abrirPedidoCocina(idOrden) {
  const numero = Number(idOrden);
  const cuerpo = document.getElementById('cuerpoPedidoCocina');
  document.getElementById('tituloPedidoCocina').textContent = numeroPedido(numero, 'cocina');   // ej: "Cocina #112" (29/10)
  cuerpo.innerHTML = '<p class="panel-vacio">Cargando...</p>';
  document.getElementById('modalPedidoCocina').style.display = 'block';   // se abre

  // 1. Se pide el pedido con todos sus platos
  let pedido = null;
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/' + numero);
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);  // si el servidor dio error, va al catch
    pedido = await respuesta.json();
  } catch (error) {
    console.error('No se pudo cargar el pedido a cocina:', error);   // el detalle a la consola
    cuerpo.innerHTML = '<p class="panel-vacio texto-error">No se pudo cargar el pedido a cocina.</p>';
    return;
  }

  // 2. Los datos de arriba, calculados antes
  const fechaPedido = pedido.fecha_pedido ? describirDia(fechaLocalISO(fechaDeTimestamp(pedido.fecha_pedido))).diaMes : '—';
  const fechaEntrega = describirDia(pedido.fecha_para).diaMes;
  const pidio = pedido.pidio || '—';

  // 3. Una fila por plato: lo hecho va tachado y con "Hecho" en verde
  let totalViandas = 0;
  let hechos = 0;
  let filas = '';
  pedido.platos.forEach(plato => {
    totalViandas = totalViandas + Number(plato.cantidad);
    if (plato.hecho) hechos = hechos + 1;
    const claseHecho = plato.hecho ? ' class="plato-hecho"' : '';
    const claseEstado = plato.hecho ? 'estado-hecho' : 'estado-por-hacer';
    const textoEstado = plato.hecho ? 'Hecho' : 'Por hacer';
    const palabraViandas = Number(plato.cantidad) === 1 ? 'vianda' : 'viandas';
    filas += `
      <tr>
        <td${claseHecho}>${pastillaCodigo(plato.codigo_plato, plato.plato)}${escHtml(plato.plato)}</td>
        <td class="cantidad-detalles"><b>${Number(plato.cantidad)}</b> <span>${palabraViandas}</span></td>
        <td class="estado-detalles"><span class="etiqueta-estado ${claseEstado}">${textoEstado}</span></td>
      </tr>`;
  });
  const palabraPlatos = pedido.platos.length === 1 ? 'plato hecho' : 'platos hechos';

  // 4. Todo junto: los 4 datos, la tabla y el avance
  cuerpo.innerHTML = `
    <div class="datos-detalles">
      <div class="dato-detalles"><span class="nombre-dato">Fecha de pedido</span><span class="valor-dato">${escHtml(fechaPedido)}</span></div>
      <div class="dato-detalles"><span class="nombre-dato">Fecha de entrega</span><span class="valor-dato">${escHtml(fechaEntrega)}</span></div>
      <div class="dato-detalles"><span class="nombre-dato">Pidió</span><span class="valor-dato">${escHtml(pidio)}</span></div>
      <div class="dato-detalles"><span class="nombre-dato">Total</span><span class="valor-dato">${conPlural(totalViandas, 'vianda', 'viandas')}</span></div>
    </div>
    <p class="titulo-seccion-ventana">Viandas que se pidieron</p>
    <div class="caja-tabla-detalles">
      <table class="tabla-detalles">
        <thead><tr><th>Plato</th><th class="cantidad-detalles">Cantidad</th><th class="estado-detalles">Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="fila-avance avance-pedido">
      <span class="nombre-avance">Avance del pedido</span>
      <span class="texto-avance"><b>${hechos}</b> de ${pedido.platos.length} ${palabraPlatos}</span>
    </div>
    <div class="barra-avance"><div id="barraAvancePedido" class="relleno-avance"></div></div>`;
  const porcentaje = Math.round((hechos / pedido.platos.length) * 100);   // el servidor nunca manda un pedido sin platos
  document.getElementById('barraAvancePedido').style.width = porcentaje + '%';
}


// ─────────────────────────────────────────────────────────────────────────────
// cerrarVentanaCocina → cierra la ventana del pedido a cocina o el panel del resumen
// ENTRADA: idVentana ('modalPedidoCocina' o 'fondoResumen') y, si viene de un clic, el evento
// SALIDA:  nada. Con un clic, cierra solo si fue en lo oscuro de atrás (no adentro de la caja);
//          con la ✕, "Cerrar" o Escape se llama sin evento y cierra siempre.
// ─────────────────────────────────────────────────────────────────────────────
function cerrarVentanaCocina(idVentana, evento) {
  const ventana = document.getElementById(idVentana);
  if (evento && evento.target !== ventana) return;               // el clic fue adentro: no se cierra
  ventana.style.display = 'none';
}


// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  const tbody          = document.getElementById('tablaTareas');
  const cocineroId     = localStorage.getItem('usuario_id');
  // El cocinero ve y marca sus platos. Administración (6, 5, 1) ve toda la cocina, solo para mirar.
  const soloLectura    = !esCocinero;

  // ── Las barras de las dos tablas: las pestañas de días y el buscador ──────
  // Un clic en una pestaña (closest = la pestaña tocada, o null) o algo escrito vuelven a dibujar esa tabla, desde la página 1
  ['stock', 'clientes'].forEach(vista => {
    const config = VISTAS[vista];
    document.getElementById(config.idDias).addEventListener('click', evento => {
      const pestana = evento.target.closest('[data-dia]');
      if (!pestana) return;                                       // se tocó entre las pestañas
      filtrosVista[vista].dia = pestana.dataset.dia;
      paginacionVista[vista] = null;                              // vuelve a la página 1
      dibujarTabla(vista);
    });
    document.getElementById(config.idBuscar).addEventListener('input', evento => {
      filtrosVista[vista].texto = evento.target.value;
      paginacionVista[vista] = null;
      dibujarTabla(vista);
    });
  });

  // "✓ Hecho" de "Para stock": el clic se escucha sobre la tabla entera, una sola vez (sirve para las filas nuevas).
  // Lo hace marcarHecho (pedidosCocina.js), el mismo de Producción.
  document.getElementById('cuerpoParaStock').addEventListener('click', evento => marcarHecho('listaParaStock', evento));

  // ── Helpers ──────────────────────────────────────────────────────────────
  // Sin pedidos o con error: la tabla vacía con el mensaje, el contador en 0 y el resumen sin clientes
  function setVacio(msg) {
    _tareasActivas = [];
    dibujarTabla('clientes');                                     // la barra con "Todos", la tabla vacía y el contador en 0 (25/10)
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="loading-text">${msg}</td></tr>`;
    construirResumen([]);
  }

  // ── 1. Traer tareas filtradas por el cocinero logueado ───────────────────
  let enPrep;
  try {
    const url = cocineroId && !soloLectura
      ? `/api/cocina/tareas?cocinero_id=${encodeURIComponent(cocineroId)}`
      : '/api/cocina/tareas';
    const res = await apiFetch(url);
    enPrep = await res.json();

    // Cada cocinero ve solo sus platos pendientes dentro del pedido (es_mio lo marca el servidor).
    // Así la tabla y el resumen cuentan solo lo que le falta cocinar.
    // Aparte se guardan los platos que salen de la heladera (los normales: nacen listos), para "Sale de la heladera"
    // en "Detalles". (24/10: ya no se cuentan sus viandas: la cajita "De la heladera" se sacó.)
    enPrep = enPrep
      .map(pedido => {
        const detalles = pedido.pedido_detalles || [];
        const platosStock = detalles.filter(det => !det.personalizado && det.listo);   // los que salen de la heladera
        return {
          ...pedido,
          platos_stock: platosStock,
          pedido_detalles: detalles.filter(det => det.es_mio && !det.listo)
        };
      })
      .filter(pedido => pedido.pedido_detalles.length > 0);
  } catch {
    setVacio('Error al cargar pedidos. Verificá que el servidor esté corriendo.');
    return;
  }

  if (enPrep.length === 0) {
    setVacio('No hay pedidos en preparación en este momento.');
    return;
  }

  // (25/10: el número de "Pedidos de clientes" ya no se escribe acá: lo escribe dibujarTabla, con lo de hoy y lo atrasado)

  // ── 2. El DÍA DE COCINA de cada pedido (24/10): el día hábil anterior a la entrega (diaHabilAnterior, de
  //       fechas.js: saltea sábados y domingos; los feriados de su lista, que hoy está vacía).
  //       Ej: entrega miércoles 28/10 → se cocina el martes 27/10 · entrega lunes 26/10 → el viernes 23/10.
  //       pedido.dia_cocina = 'AAAA-MM-DD' · pedido.dia = cómo se muestra (pestaña y color) · pedido.diaEntrega = la entrega.
  //       Sin fecha de entrega (no debería pasar): "Sin fecha". Lo que encuentra el buscador lo arma dibujarTabla.
  //       24/10: pedido.pestana = la pestaña de su día de cocina, una por fecha: { clave: '2026-10-26', etiqueta: 'Lunes 26',
  //       tipo: 'hoy', clasePunto: 'punto-lunes' }. Cada día pasado tiene la suya (no van todos juntos en "Atrasados").
  enPrep.forEach(pedido => {
    const diaCocina = pedido.fecha_entrega ? fechaLocalISO(diaHabilAnterior(parseFechaLocal(pedido.fecha_entrega))) : '';
    pedido.dia_cocina = diaCocina;
    pedido.dia = diaCocina ? describirDia(diaCocina) : SIN_FECHA;
    pedido.diaEntrega = pedido.fecha_entrega ? describirDia(pedido.fecha_entrega) : SIN_FECHA;
    pedido.pestana = {
      clave: diaCocina || SIN_FECHA.clave,                        // la fecha (o 'sin-fecha')
      etiqueta: pedido.dia.diaLargo || SIN_FECHA.etiqueta,        // "Lunes 26" (o "Sin fecha")
      tipo: pedido.dia.tipo,                                      // 'atrasado' (rojo), 'hoy' (con HOY), 'manana' o 'despues'
      clasePunto: CLASE_PUNTO_DIA[pedido.dia.diaSemana] || ''     // el color de su día de la semana (sin día: sin color)
    };
  });

  // ── 3. Ordenar por día de cocina (y número) ──
  // sort compara de a dos: negativo = a va antes. "AAAA-MM-DD" se compara como texto; sin fecha, al final.
  enPrep.sort((a, b) => {
    const fechaA = a.dia_cocina || '9999-12-31';
    const fechaB = b.dia_cocina || '9999-12-31';
    if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
    return Number(a.id) - Number(b.id);
  });

  // ── 4. Sincronizar estado, dibujar la tabla y pintar el panel de resumen ──
  _tareasActivas = enPrep;
  dibujarTabla('clientes');
  construirResumen(_tareasActivas);
});

// ── Marcar como listos los platos del cocinero en un pedido ──────────────────
// Se marca solo lo del cocinero logueado (el servidor lo toma del token). El pedido pasa a
// "Listo para entregar" recién cuando todos sus platos, de todos los cocineros, están listos.
let _listoPendiente = null; // { pedidoId, btnEl } mientras el modal está abierto

// 29/10: como cada plato tiene su fila, la pregunta dice claro que se marcan TODOS los platos de ese pedido.
// Ej: "¿Tus platos del Pedido #057 están listos? Esto marca los 2 platos del Pedido #057."
window.marcarListo = function (pedidoId, btnEl) {
  _listoPendiente = { pedidoId, btnEl };
  const pedido = _tareasActivas.find(p => Number(p.id) === Number(pedidoId));   // find: el pedido, o undefined
  const cuantos = pedido ? pedido.pedido_detalles.length : 0;     // sus platos a cocinar (los tuyos)
  const numero = numeroPedido(pedidoId, 'cliente');               // ej: "Pedido #057"
  const cuales = cuantos === 1 ? 'el plato' : 'los ' + cuantos + ' platos';   // "el plato" / "los 2 platos"
  document.getElementById('modalListoTexto').textContent =
    `¿Tus platos del ${numero} están listos? Esto marca ${cuales} del ${numero}.`;
  document.getElementById('modalListo').style.display = 'block';
  document.getElementById('modalListoConfirmar').focus();
};

// Cancelar, clic afuera o Escape: no se hace nada
window.cerrarModalListo = function (e) {
  const modal = document.getElementById('modalListo');
  if (e && e.target !== modal) return;
  modal.style.display = 'none';
  _listoPendiente = null;
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.cerrarModalListo();
});

// ── Ventana "Detalles" de un pedido de cliente ────────────────────────────────
// Muestra lo que la pantalla ya tiene en memoria (_tareasActivas): los platos que ve cada cocinero
// (los suyos sin terminar) o, para la administración, todos. No pide nada al servidor.
// 24/10: arriba Cocinar ("mar 27/10") · Entrega ("28/10"). Después "Se cocina aparte" (los personalizados, con su
// etiqueta y "Por hacer") y "Sale de la heladera" (con "ya está hecha").
// 24/10 (más simple): el título "Pedido" con el número en una pastilla verde ("#057"); el código en negrita, sin pastilla;
// solo 2 cajitas (se sacaron "A cocinar" y "De la heladera") y sin las observaciones.
window.abrirDetallesPedido = function (pedidoId) {
  // find devuelve el pedido con ese número, o undefined si ya no está (por ejemplo, ya se marcó listo)
  const pedido = _tareasActivas.find(p => Number(p.id) === Number(pedidoId));
  if (!pedido) return;
  const idPedido = Number(pedido.id);

  // Los personalizados: "P1  1 Canelones [SIN SAL]   Por hacer".
  // Todo lo que viene de la base pasa por escHtml (el texto personalizado lo escribe el cliente).
  let htmlPersonalizados = '';
  pedido.pedido_detalles.forEach(det => {
    const nombre = det?.productos?.nombre || '—';
    const codigo = det?.productos?.codigo_plato || '';            // ej: "P1" (sin código: nada)
    const etiqueta = det.observaciones_plato
      ? '<span class="etiqueta-personalizado">' + escHtml(det.observaciones_plato) + '</span>'
      : '';
    htmlPersonalizados += `
      <div class="renglon-detalles">
        <span class="plato-detalles"><b class="codigo-texto">${escHtml(codigo)}</b>${escHtml(det.cantidad)} ${escHtml(nombre)}${etiqueta}</span>
        <span class="etiqueta-estado estado-por-hacer">Por hacer</span>
      </div>`;
  });

  // Las viandas del stock: "F1  4 Fideos      ya está hecha" (salen de la heladera)
  let htmlStock = '';
  pedido.platos_stock.forEach(det => {
    const nombre = det?.productos?.nombre || '—';
    const codigo = det?.productos?.codigo_plato || '';
    htmlStock += `
      <div class="renglon-detalles">
        <span class="plato-detalles"><b class="codigo-texto">${escHtml(codigo)}</b>${escHtml(det.cantidad)} ${escHtml(nombre)}</span>
        <span class="ya-hecha">ya está hecha</span>
      </div>`;
  });
  const seccionStock = htmlStock
    ? '<p class="titulo-seccion-ventana">Sale de la heladera</p>' + htmlStock
    : '';

  // El título (24/10): "Pedido" y el número en su pastilla verde. Es un número (Number), no texto de la base
  const numero = '#' + String(idPedido).padStart(3, '0');         // ej: "#057"
  document.getElementById('modalPlatosTitulo').innerHTML = 'Pedido <span class="numero-detalles">' + numero + '</span>';

  // Las 2 cajitas de arriba: el día de cocina y la entrega
  const diaCocina = pedido.dia.diaCorto + ' ' + pedido.dia.diaMes;   // ej: "mar 27/10"
  document.getElementById('modalPlatosBody').innerHTML = `
    <div class="datos-detalles">
      <div class="dato-detalles"><span class="nombre-dato">Cocinar</span><span class="valor-dato">${escHtml(diaCocina)}</span></div>
      <div class="dato-detalles"><span class="nombre-dato">Entrega</span><span class="valor-dato">${escHtml(pedido.diaEntrega.diaMes)}</span></div>
    </div>
    <p class="titulo-seccion-ventana">Se cocina aparte</p>
    ${htmlPersonalizados}
    ${seccionStock}`;

  // "✓ Listo para entregar" de la ventana: solo el cocinero. Cierra esta ventana y pide la confirmación de siempre
  // (con el botón de la fila, así confirmarListo lo apaga igual que antes)
  const botonListo = document.getElementById('botonListoDetalles');
  botonListo.hidden = !esCocinero;
  botonListo.textContent = '✓ Listo para entregar';
  botonListo.onclick = () => {
    window.cerrarDetallesPedido();
    const botonFila = document.querySelector(`tr[data-pedido-id="${idPedido}"] .btn-listo`);
    window.marcarListo(idPedido, botonFila || botonListo);
  };

  document.getElementById('modalPlatos').style.display = 'block';
};

// Cierra la ventana de platos. Si viene de un clic, solo cuando el clic fue en el fondo oscuro
// (igual que cerrarModalListo); con la ✕, "Cerrar" o Escape se llama sin evento y cierra siempre.
window.cerrarDetallesPedido = function (e) {
  const modal = document.getElementById('modalPlatos');
  if (e && e.target !== modal) return;
  modal.style.display = 'none';
};

// Escape cierra también la ventana del pedido a cocina y el resumen
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  window.cerrarDetallesPedido();
  cerrarVentanaCocina('modalPedidoCocina');
  cerrarVentanaCocina('fondoResumen');
});

window.confirmarListo = async function () {
  if (!_listoPendiente) return;
  const { pedidoId, btnEl } = _listoPendiente;
  window.cerrarModalListo();

  // Deshabilitar todos los botones de ese pedido (hay uno por plato)
  const botones = document.querySelectorAll(`tr[data-pedido-id="${pedidoId}"] .btn-listo`);
  botones.forEach(b => { b.disabled = true; });
  btnEl.textContent = 'Actualizando...';

  try {
    const res = await apiFetch(`/api/pedidos/${pedidoId}/listo-cocinero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      }
    });
    const data = await res.json().catch(() => ({}));

    // Los platos quedaron listos en todos estos casos: se sacan de la pantalla
    if (res.ok || data.platos_listos) {
      quitarPedidoDeLaTabla(pedidoId);

      if (res.ok && data.completo) {
        mostrarAviso('exito', 'Pedido completo, pasó a Listo para Entregar.');
      } else if (res.ok) {
        mostrarAviso('info', 'Tus platos quedaron listos. Faltan platos de otros cocineros.');
      } else {
        // 409 por stock: el pedido sigue En Preparación hasta que lo resuelva el administrador
        mostrarAviso('error', data.mensaje || 'Tus platos quedaron listos, pero el pedido no pudo avanzar.', data.error);
      }
      return;
    }

    const mensaje = res.status === 401
      ? 'Tu sesión expiró. Volvé a iniciar sesión.'
      : (data.error || 'No se pudo marcar como listo. Intentá de nuevo.');
    throw new Error(mensaje);

  } catch (err) {
    botones.forEach(b => { b.disabled = false; });
    btnEl.textContent = '✓ Listo para entregar';
    mostrarAviso('error', err.message || 'No se pudo conectar con el servidor.');
  }
};

function quitarPedidoDeLaTabla(pedidoId) {
  // Eliminar todas las filas de ese pedido de la tabla
  document.querySelectorAll(`tr[data-pedido-id="${pedidoId}"]`).forEach(f => f.remove());

  // Actualizar estado reactivo, volver a dibujar la tabla (sin ese pedido; sin ninguno, "No hay pedidos…")
  // y refrescar el resumen. El número de "Pedidos de clientes" lo vuelve a contar dibujarTabla (25/10: antes se le
  // restaba 1 acá)
  _tareasActivas = _tareasActivas.filter(p => String(p.id) !== String(pedidoId));
  dibujarTabla('clientes');
  construirResumen(_tareasActivas);
}

// Aviso flotante. tipo: 'exito' | 'info' | 'error'. detalle: texto secundario opcional.
function mostrarAviso(tipo, mensaje, detalle) {
  document.getElementById('avisoCocina')?.remove();

  const aviso = document.createElement('div');
  aviso.id = 'avisoCocina';
  aviso.className = `aviso-cocina aviso-cocina--${tipo}`;
  aviso.setAttribute('role', 'status');

  const texto = document.createElement('span');
  texto.textContent = (tipo === 'exito' ? '✓ ' : tipo === 'error' ? '⚠ ' : '') + mensaje;
  aviso.appendChild(texto);

  if (detalle) {
    const extra = document.createElement('span');
    extra.className = 'aviso-cocina-detalle';
    extra.textContent = detalle;
    aviso.appendChild(extra);
  }

  const cerrar = document.createElement('button');
  cerrar.className = 'aviso-cocina-cerrar';
  cerrar.textContent = '×';
  cerrar.onclick = () => aviso.remove();
  aviso.appendChild(cerrar);

  document.body.appendChild(aviso);
  // Los errores quedan hasta que se cierran; los demás se van solos
  if (tipo !== 'error') setTimeout(() => aviso.remove(), 5000);
}
