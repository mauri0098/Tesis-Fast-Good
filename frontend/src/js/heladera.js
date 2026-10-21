// ============================================================================
// heladera.js — Pantalla Producción (pages/heladera.html)
//
// Funciones:
//   iniciarProduccion      → al abrir la pantalla: engancha botones y filtros, hace la primera carga y recarga cada 60 s
//   estadoDelPlato         → la regla única del estado de un plato: sin stock / bajo / bien / sin mínimo
//   cargarPlatos           → pide los platos (GET /api/viandas-stock) y dibuja la tabla
//   renderizarTabla        → dibuja las pestañas de estado y la tabla (filtrada, ordenada y paginada)
//   renderizarFiltroPlan   → dibuja la lista de planes de "Filtros" (con casillas), el número del botón y los ✕ de los elegidos
//   limpiarFiltros         → saca todos los filtros: planes, buscador y pestaña (vuelve a "Todos")
//   ordenarPor             → ordena la tabla por una columna (tocar otra vez la misma da vuelta el orden)
//   crearFilaPlato         → arma la fila de un plato, con su mínimo (✎ para quien administra) y su ⋯
//   abrirMenuFila          → abre el menú ⋯ de una fila: "Ver movimientos del plato" y "Descartar viandas"
//   guardarMinimo          → manda el mínimo nuevo de un plato (PUT /api/viandas-stock/:id/minimo) y redibuja
//   abrirMovimientos       → abre el panel "Últimos movimientos" (de todos los platos o de uno solo)
//   cargarMovimientos      → pide y dibuja "Últimos movimientos" con el filtro de tipo; "Ver más" agrega 50 más
//   abrirHechoHoy          → abre la ventana "Hecho hoy" y la recarga
//   cargarHechosHoy        → pide y dibuja "Hecho hoy" (y cuántos son, en su botón)
//   fechaYHoraCortas       → una fecha de la base en dos textos cortos: { dia: '15/10', hora: '18:40' }
//   cargarPendientesCocina → pide los pendientes de cocina (los dibuja pedidosCocina.js), pone cuántos hay en el botón
//                            y, si se pide, abre la ventana
//   abrirDescarte          → abre la ventana "Descartar" con los datos del plato
//   confirmarDescarte      → controla y manda el descarte (POST /api/viandas-stock/descarte)
//   cerrarVentana          → cierra una ventana (modal) o el panel de movimientos
//   mostrarToast           → muestra un aviso flotante que se va solo
//
// Son más de 8 porque la pantalla tiene muchas partes (tabla, filtros, menú ⋯, 4 ventanas y un panel)
// y cada función hace UNA de esas partes.
// La ventana "Pedir a cocina" está en pedirCocina.js (usa todosPlatos y estadoDelPlato de acá).
// Necesita antes: roles.js (FG_ROLES), api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion),
// fechas.js (fechaDeTimestamp) y pedidosCocina.js (cargarPendientes, conPlural).
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

let todosPlatos = [];                // los platos que mandó el servidor (también los usa pedirCocina.js)
let filtroEstado = 'todos';          // la pestaña elegida: 'todos', 'sin', 'bajo', 'bien' o 'sincontrol'
let planesElegidos = [];             // los planes tildados en "Filtros" (sus números; 0 = "Sin plan"). [] = todos los planes
let ordenTabla = { columna: 'estado', direccion: 1 };  // cómo se ordena la tabla: columna y 1 (de menor a mayor) o -1 (al revés)
let paginacionPlatos = null;         // lo que devuelve crearPaginacion: sirve para saber en qué página está la tabla
let puedeAdministrar = false;        // true para los roles 6, 5 y 1: piden a cocina y cambian el mínimo
let platoDescarte = null;            // el plato que se está descartando (mientras la ventana está abierta)
let platoDelMenu = null;             // el número del plato cuyo menú ⋯ está abierto
let tipoMovimientos = '';            // el filtro de "Últimos movimientos" ('' = todos los tipos)
let platoMovimientos = '';           // el plato de "Ver movimientos del plato" ('' = todos los platos)
let movimientosMostrados = 0;        // cuántos movimientos se pidieron (para pedir los siguientes con "Ver más")

const INTERVALO_ACTUALIZACION = 60000;  // cada 60 segundos se recargan la tabla, los pendientes y "Hecho hoy"
const MOVIMIENTOS_POR_PAGINA = 50;      // cuántos movimientos manda el servidor por vez
const CANTIDAD_COLORES_PLAN = 6;        // cuántos colores hay para el puntito de cada plan (heladera.css: .punto-plan-0 a -5)

// Los 4 estados de un plato: el texto, la clase de color y el orden en la tabla (primero los que faltan)
const ESTADOS_STOCK = {
  sin:        { texto: 'Sin stock',  clase: 'estado-sin',        orden: 0 },   // no quedan libres
  bajo:       { texto: 'Bajo',       clase: 'estado-bajo',       orden: 1 },   // menos libres que el mínimo
  bien:       { texto: 'Bien',       clase: 'estado-bien',       orden: 2 },   // el mínimo o más
  sincontrol: { texto: 'Sin mínimo', clase: 'estado-sincontrol', orden: 3 }    // mínimo 0: no se controla
};

// Qué valor se compara al ordenar por cada columna. Ej: VALOR_PARA_ORDENAR.libres(fideos) → 61
const VALOR_PARA_ORDENAR = {
  nombre:      plato => (plato.nombre || '').toLowerCase(),           // Plato: por nombre
  plan:        plato => (plato.plan_nombre || '').toLowerCase(),      // Plan: por nombre del plan
  estado:      plato => ESTADOS_STOCK[estadoDelPlato(plato)].orden,   // Estado: primero los sin stock
  libres:      plato => Number(plato.stock_heladera),                 // Libres: por número
  en_heladera: plato => Number(plato.en_heladera)                     // En heladera: por número
};

// Lo que se avisa a los lectores de pantalla en el título de la columna ordenada (1 = de menor a mayor)
const ARIA_ORDEN = { '1': 'ascending', '-1': 'descending' };

// Los botones de filtro de "Últimos movimientos" (valor = el tipo que entiende el servidor; '' = todos)
const FILTROS_MOVIMIENTOS = [
  { valor: '',           texto: 'Todos' },
  { valor: 'produccion', texto: 'Producción' },
  { valor: 'venta',      texto: 'Ventas' },
  { valor: 'devolucion', texto: 'Devoluciones' },
  { valor: 'descarte',   texto: 'Descartes' }
];

// Cómo se escribe cada tipo de movimiento en la lista
const NOMBRES_TIPO = {
  produccion: 'Producción',
  venta:      'Venta',
  devolucion: 'Devolución',
  descarte:   'Descarte',
  ajuste:     'Ajuste'
};

// Las ventanas que se cierran al tocar lo oscuro de afuera ("Pedir a cocina" no, para no perder lo escrito)
const VENTANAS_QUE_CIERRAN_AFUERA = ['modalDescarte', 'modalPendientes', 'modalHechoHoy', 'panelMovimientos'];

document.addEventListener('DOMContentLoaded', iniciarProduccion);   // cuando la página terminó de cargar, arranca


// ─────────────────────────────────────────────────────────────────────────────
// iniciarProduccion → arranca la pantalla
// ENTRADA: nada (la llama el navegador cuando la página terminó de cargar)
// SALIDA:  nada (engancha los botones y los filtros, hace la primera carga y programa la recarga cada 60 s)
// Ej: entra la dueña → ve "+ Pedir a cocina"; entra un cocinero → no lo ve
// ─────────────────────────────────────────────────────────────────────────────
function iniciarProduccion() {
  // 1. ¿Puede pedir a cocina y cambiar el mínimo? Administrador del sistema, dueño y administrador (el cocinero no)
  const rol = parseInt(localStorage.getItem('usuario_rol') || '0', 10);                         // el rol del usuario logueado
  const rolesQueAdministran = [FG_ROLES.ROL.SISTEMA, FG_ROLES.ROL.DUENO, FG_ROLES.ROL.ADMINISTRADOR];  // 6, 5 y 1
  puedeAdministrar = rolesQueAdministran.includes(rol);                                         // includes = "está en la lista"
  document.getElementById('btnPedirCocina').hidden = !puedeAdministrar;                         // "+ Pedir a cocina" (hidden = escondido)
  document.getElementById('btnPedirDesdePendientes').hidden = !puedeAdministrar;                // y el de la ventana "Pendientes"

  // 2. El buscador de la tabla: al escribir se vuelve a dibujar desde la página 1
  document.getElementById('filtroNombre').addEventListener('input', () => renderizarTabla(false));

  // 3. "Filtros": abre y cierra la lista de planes; "Buscar plan…" la filtra; "Limpiar filtro" destilda todo
  const botonFiltros = document.getElementById('btnFiltroPlan');
  const menuPlanes = document.getElementById('menuFiltroPlan');
  botonFiltros.addEventListener('click', () => {
    menuPlanes.hidden = !menuPlanes.hidden;                                      // si estaba abierta se cierra, y al revés
    botonFiltros.setAttribute('aria-expanded', String(!menuPlanes.hidden));      // para los lectores de pantalla
    if (!menuPlanes.hidden) document.getElementById('buscarPlan').focus();       // abierta: el cursor va a "Buscar plan…"
  });
  document.getElementById('buscarPlan').addEventListener('input', renderizarFiltroPlan);
  document.getElementById('btnLimpiarPlan').addEventListener('click', () => {
    planesElegidos = [];                                                         // ningún plan tildado = todos
    renderizarTabla(false);
  });

  // 4. Los títulos de la tabla que ordenan (Plato, Plan, Estado, Libres y En heladera)
  document.querySelectorAll('.boton-ordenar').forEach(boton => {
    boton.addEventListener('click', () => ordenarPor(boton.dataset.columna));    // data-columna dice por qué columna
  });

  // 5. Las dos opciones del menú ⋯ de las filas (el menú es uno solo; platoDelMenu dice de qué plato es)
  document.getElementById('menuFilaMovimientos').addEventListener('click', () => {
    const plato = todosPlatos.find(p => p.id === platoDelMenu);                  // find = el plato del menú (o undefined)
    document.getElementById('menuFila').hidden = true;                           // se cierra el menú
    if (plato) abrirMovimientos(plato.nombre);                                   // y se ven los movimientos de ese plato
  });
  document.getElementById('menuFilaDescartar').addEventListener('click', () => {
    document.getElementById('menuFila').hidden = true;                           // se cierra el menú
    abrirDescarte(platoDelMenu);                                                 // y se abre "Descartar viandas"
  });

  // 6. Los botones de filtro de "Últimos movimientos": Todos, Producción, Ventas, Devoluciones y Descartes
  const contenedorFiltros = document.getElementById('filtrosMovimientos');   // donde van los botones
  FILTROS_MOVIMIENTOS.forEach(filtro => {                                    // por cada filtro...
    const boton = document.createElement('button');                         // ...un botón
    boton.type = 'button';                                                   // no envía ningún formulario
    boton.className = 'btn-filtro-estado';                                   // su estilo (heladera.css)
    boton.dataset.tipo = filtro.valor;                                       // se guarda su tipo (para marcarlo cuando está elegido)
    boton.textContent = filtro.texto;                                        // el texto del botón
    boton.addEventListener('click', () => {                                  // al tocarlo...
      tipoMovimientos = filtro.valor;                                        // ...se guarda el filtro elegido
      cargarMovimientos(false);                                              // ...y se pide la lista desde el principio
    });
    contenedorFiltros.appendChild(boton);                                    // se agrega a la pantalla
  });
  document.getElementById('btnVerMas').addEventListener('click', () => cargarMovimientos(true));  // "Ver más": los 50 siguientes

  // 7. La ventana "Pedir a cocina" (está en pedirCocina.js): al cambiar el plan o lo buscado se vuelve a dibujar
  //    su lista; al cambiar la fecha, se actualiza "Para …" de "Tu pedido"
  document.getElementById('pPlan').addEventListener('change', renderizarListaPedido);
  document.getElementById('pBuscar').addEventListener('input', renderizarListaPedido);
  document.getElementById('pFecha').addEventListener('change', actualizarTotalPedido);

  // 8. Cualquier clic: cierra la ventana si se tocó lo oscuro de afuera, y los menús si se tocó fuera de ellos
  window.addEventListener('click', evento => {
    VENTANAS_QUE_CIERRAN_AFUERA.forEach(idVentana => {                          // por cada ventana que cierra afuera...
      if (evento.target === document.getElementById(idVentana)) cerrarVentana(idVentana);  // ...si se tocó su fondo, se cierra
    });
    // closest busca el elemento (o un "padre" suyo) que cumpla. Ej: un clic en el dibujo del ⋯ → el botón ⋯; afuera → null
    const tocoMenuFila = evento.target.closest('#menuFila, .boton-menu-fila');
    if (!tocoMenuFila) document.getElementById('menuFila').hidden = true;      // fuera del menú ⋯: se cierra
    const tocoFiltroPlan = evento.target.closest('.caja-filtro-plan');
    if (!tocoFiltroPlan) menuPlanes.hidden = true;                              // fuera de "Filtros": se cierra
    if (!tocoFiltroPlan) botonFiltros.setAttribute('aria-expanded', 'false');
  });

  // 9. Escape cierra los menús; al mover la pantalla, el menú ⋯ se cierra (si no, quedaría lejos de su fila)
  document.addEventListener('keydown', evento => {
    if (evento.key !== 'Escape') return;                                       // solo la tecla Escape
    document.getElementById('menuFila').hidden = true;
    menuPlanes.hidden = true;
  });
  window.addEventListener('scroll', () => { document.getElementById('menuFila').hidden = true; }, true);  // true = también el scroll de la tabla

  // 10. La primera carga
  cargarPlatos(false);                // la tabla
  cargarMovimientos(false);           // los últimos movimientos
  cargarPendientesCocina(false);      // los pendientes de cocina (y cuántos son, en el botón)
  cargarHechosHoy();                  // "Hecho hoy" (y cuántos son, en el botón)

  // 11. Cada 60 segundos se recargan la tabla (en la misma página y con el mismo orden), los pendientes y "Hecho hoy".
  //     No se recarga si hay una ventana abierta o si se está escribiendo un mínimo (así no se pierde lo escrito).
  setInterval(() => {
    // Array.from convierte las ventanas de la pantalla en una lista común (para poder usar some).
    // some responde true si AL MENOS UNA se ve. Ej: [Descartar cerrada, Pendientes abierta] → true
    const ventanas = Array.from(document.querySelectorAll('.modal'));
    const hayVentanaAbierta = ventanas.some(ventana => ventana.style.display === 'block');
    const enfocado = document.activeElement;                                   // el elemento que tiene el cursor (puede no haber)
    const escribiendoMinimo = Boolean(enfocado) && enfocado.classList.contains('input-minimo');  // ¿es un casillero de mínimo?
    if (hayVentanaAbierta || escribiendoMinimo) return;                        // (return = esta vez no se recarga)
    cargarPlatos(true);                                                        // la tabla, sin volver a la página 1
    cargarPendientesCocina(false);                                             // los pendientes de cocina
    cargarHechosHoy();                                                         // "Hecho hoy"
  }, INTERVALO_ACTUALIZACION);
}


// ─────────────────────────────────────────────────────────────────────────────
// estadoDelPlato → la regla única del estado de un plato
//                  (la usan la tabla, las pestañas, el orden y la ventana "Pedir a cocina")
// ENTRADA: plato, con stock_heladera (las libres) y stock_minimo
// SALIDA:  'sincontrol' si el mínimo es 0 · 'sin' si no hay libres · 'bajo' si hay menos que el mínimo · 'bien' si no
// Ej: { stock_heladera: 3, stock_minimo: 5 } → 'bajo'   ·   { stock_heladera: 0, stock_minimo: 5 } → 'sin'
// Mira solo las LIBRES: las reservadas ya son de un pedido y no se pueden vender.
// ─────────────────────────────────────────────────────────────────────────────
function estadoDelPlato(plato) {
  const minimo = Number(plato.stock_minimo);   // el mínimo del plato
  const libres = Number(plato.stock_heladera); // las libres
  if (minimo === 0) return 'sincontrol';       // mínimo 0: no se controla, nunca "falta"
  if (libres <= 0) return 'sin';               // no queda ninguna libre
  if (libres < minimo) return 'bajo';          // quedan menos que el mínimo
  return 'bien';                               // el mínimo o más
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarPlatos → pide los platos al servidor y dibuja la tabla
// ENTRADA: mantenerPagina: true en la recarga automática (para no volver a la página 1)
// SALIDA:  nada (guarda los platos en todosPlatos y dibuja la tabla; si falla, deja un mensaje en la tabla)
// Ej: GET /api/viandas-stock → [{ nombre: 'fideos', descripcion: 'Con salsa', stock_heladera: 61, reservadas: 10, ... }]
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPlatos(mantenerPagina) {
  try {
    const respuesta = await apiFetch('/api/viandas-stock');                  // pide los platos
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);          // si el servidor dio error, va al catch
    todosPlatos = await respuesta.json();                                    // la lista de platos
    renderizarTabla(mantenerPagina);                                         // se dibuja la tabla
  } catch (error) {                                                          // si no se pudo...
    console.error('No se pudieron cargar los platos:', error);               // ...el detalle va a la consola
    document.getElementById('heladeraBody').innerHTML =                      // ...y en la tabla, un mensaje simple
      '<tr><td colspan="8" class="loading-text texto-error">Error al conectar con el servidor</td></tr>';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarTabla → dibuja todo lo de la tabla de platos
// ENTRADA: mantenerPagina: true para quedarse en la misma página (recarga automática o después de guardar un mínimo)
// SALIDA:  nada (dibuja las pestañas con cuántos hay, los filtros de plan y la tabla paginada de a 15,
//          con "Mostrando X de Y platos" abajo)
// Columnas: Plato · Plan · Estado · Libres · Reservadas · En heladera · Mínimo · ⋯
// Ej: 2 platos sin stock y 3 bajos → pestañas "Sin stock 2" y "Bajos 3"
// ─────────────────────────────────────────────────────────────────────────────
function renderizarTabla(mantenerPagina) {
  // 1. Cuántos platos hay en cada estado. Ej: { sin: 2, bajo: 3, bien: 15, sincontrol: 0 }
  const cuenta = { sin: 0, bajo: 0, bien: 0, sincontrol: 0 };                // arranca todo en 0
  todosPlatos.forEach(plato => {                                             // por cada plato...
    cuenta[estadoDelPlato(plato)] += 1;                                      // ...suma 1 en su estado
  });

  // 2. Las pestañas: "Todos 20", "Sin stock 2", "Bajos 3", "Bien 15" y, si hay, "Sin mínimo N"
  const opciones = [                                                         // las pestañas que siempre están
    { valor: 'todos', texto: 'Todos',     cantidad: todosPlatos.length },
    { valor: 'sin',   texto: 'Sin stock', cantidad: cuenta.sin },
    { valor: 'bajo',  texto: 'Bajos',     cantidad: cuenta.bajo },
    { valor: 'bien',  texto: 'Bien',      cantidad: cuenta.bien }
  ];
  if (cuenta.sincontrol > 0) {                                               // "Sin mínimo" solo si hay alguno
    opciones.push({ valor: 'sincontrol', texto: 'Sin mínimo', cantidad: cuenta.sincontrol });
  }
  // some responde true si AL MENOS UNA pestaña es la elegida. Ej: elegida 'sincontrol' y ya no hay ninguno → false
  const filtroExiste = opciones.some(opcion => opcion.valor === filtroEstado);
  if (!filtroExiste) filtroEstado = 'todos';                                 // si ya no está, vuelve a "Todos"

  const contenedorFiltros = document.getElementById('filtrosEstado');        // donde van las pestañas
  contenedorFiltros.innerHTML = '';                                          // se borran las de antes
  opciones.forEach(opcion => {                                               // por cada pestaña...
    const elegida = opcion.valor === filtroEstado;                           // ¿es la elegida?
    const boton = document.createElement('button');                         // ...se crea
    boton.type = 'button';                                                   // no envía ningún formulario
    boton.className = 'btn-filtro-estado pestana-estado';                    // su estilo
    if (elegida) boton.classList.add('activo');                              // la elegida queda blanca
    boton.setAttribute('aria-pressed', String(elegida));                     // para los lectores de pantalla
    // Los textos son nuestros (de la lista de arriba) y la cantidad es un número: no hace falta escHtml
    boton.innerHTML = `${opcion.texto}<span class="cantidad-pestana">${Number(opcion.cantidad)}</span>`;
    boton.addEventListener('click', () => {                                  // al tocarla...
      filtroEstado = opcion.valor;                                           // ...se elige ese filtro
      renderizarTabla(false);                                                // ...y se dibuja desde la página 1
    });
    contenedorFiltros.appendChild(boton);                                    // se agrega a la pantalla
  });

  // 3. "Filtros": la lista de planes, el número del botón y los ✕ de los planes elegidos
  //    (antes de filtrar: si un plan elegido ya no existe, ahí se saca de planesElegidos)
  renderizarFiltroPlan();

  // 4. Los platos que se ven: los que coinciden con el buscador, la pestaña y los planes elegidos
  const texto = document.getElementById('filtroNombre').value.toLowerCase();  // lo escrito en el buscador, en minúsculas
  const visibles = todosPlatos.filter(plato => {                             // filter = arma una lista nueva con los que cumplen
    const coincideNombre = (plato.nombre || '').toLowerCase().includes(texto);  // el nombre tiene lo escrito
    const coincideEstado = filtroEstado === 'todos' || estadoDelPlato(plato) === filtroEstado;  // el estado es el elegido
    const coincidePlan = planesElegidos.length === 0 || planesElegidos.includes(plato.id_plan || 0);  // su plan está tildado
    return coincideNombre && coincideEstado && coincidePlan;                 // queda si cumple las tres cosas
  });

  // 5. El orden elegido (arranca por estado: primero los que faltan). Si empatan, por nombre.
  const leerValor = VALOR_PARA_ORDENAR[ordenTabla.columna];                  // qué se compara (ver la tabla de arriba)
  visibles.sort((a, b) => {
    const valorA = leerValor(a);
    const valorB = leerValor(b);
    const esTexto = typeof valorA === 'string';                              // nombre y plan son texto; el resto, números
    const comparacion = esTexto ? valorA.localeCompare(valorB, 'es') : valorA - valorB;  // negativo: a va antes
    if (comparacion !== 0) return comparacion * ordenTabla.direccion;        // × -1 da vuelta el orden
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');             // empate: por nombre
  });

  // 6. Los títulos que ordenan: el elegido muestra su flecha (sube o baja); los demás, las dos en gris
  document.querySelectorAll('.boton-ordenar').forEach(boton => {
    const elegido = boton.dataset.columna === ordenTabla.columna;            // ¿es la columna del orden?
    boton.classList.toggle('orden-sube', elegido && ordenTabla.direccion === 1);   // toggle(clase, sí/no)
    boton.classList.toggle('orden-baja', elegido && ordenTabla.direccion === -1);
    const textoOrden = elegido ? ARIA_ORDEN[ordenTabla.direccion] : 'none';  // para los lectores de pantalla
    boton.closest('th').setAttribute('aria-sort', textoOrden);               // closest('th') = la celda del título
  });

  // 7. La tabla, de a 15 por página. crearPaginacion (paginacion.js) llama a crearFilaPlato una vez por fila
  //    y escribe "Mostrando 15 de 40 platos" en resumenPlatos.
  const filaVacia = `
    <tr class="fila-vacia"><td colspan="8">
      <div class="tabla-vacia">
        <span class="icono-vacio"><svg aria-hidden="true"><use href="#icono-heladera"></use></svg></span>
        <div class="tabla-vacia-titulo">No hay platos para mostrar</div>
        <div class="tabla-vacia-texto">Probá con otro filtro o buscá el plato por otro nombre.</div>
        <button type="button" class="boton-limpiar-filtros" onclick="limpiarFiltros()">Limpiar filtros</button>
      </div>
    </td></tr>`;
  const sigueEnLaPagina = mantenerPagina && paginacionPlatos !== null;       // ¿se queda en la página donde estaba?
  const pagina = sigueEnLaPagina ? paginacionPlatos.paginaActual() : 1;      // si no, arranca en la página 1
  paginacionPlatos = crearPaginacion({
    datos: visibles,                                                         // los platos que se ven
    porPagina: 15,                                                           // de a 15
    contenedorTabla: document.getElementById('heladeraBody'),                // donde van las filas
    contenedorPaginacion: document.getElementById('paginacion'),             // donde van los números de página
    contenedorResumen: document.getElementById('resumenPlatos'),             // donde va "Mostrando X de Y platos"
    nombreDatos: 'platos',                                                   // cómo se llaman en ese texto
    filaVacia: filaVacia,                                                    // si no hay ninguno
    paginaInicial: pagina,                                                   // en qué página arranca
    funcionRenderFila: crearFilaPlato                                        // cómo se arma la fila de un plato (abajo)
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarFiltroPlan → dibuja lo de "Filtros": la lista de planes con casillas, el número del botón
//                        y, debajo de los filtros, un ✕ por cada plan elegido (y "Limpiar todo")
// ENTRADA: nada (usa todosPlatos, planesElegidos y lo escrito en "Buscar plan…")
// SALIDA:  nada (dibuja; al tildar o destildar un plan cambia planesElegidos y redibuja la tabla)
// Ej: tilda "Mantenimiento" → el botón dice "Filtros 1", abajo aparece "Plan: Mantenimiento ✕" y la tabla muestra solo esos
// La llaman renderizarTabla (cada vez que se dibuja) y "Buscar plan…" (al escribir).
// ─────────────────────────────────────────────────────────────────────────────
function renderizarFiltroPlan() {
  // 1. Los planes que tienen platos, sin repetir y con cuántos platos tiene cada uno: { id_plan: { id, nombre, cantidad } }
  const planesPorId = {};                                                    // arranca vacío
  todosPlatos.forEach(plato => {                                             // por cada plato...
    const idPlan = plato.id_plan || 0;                                       // ...su plan (0 = sin plan)
    const yaAnotado = Boolean(planesPorId[idPlan]);
    if (!yaAnotado) planesPorId[idPlan] = { id: idPlan, nombre: plato.plan_nombre || 'Sin plan', cantidad: 0 };
    planesPorId[idPlan].cantidad += 1;                                       // ...un plato más en ese plan
  });
  // Object.values = lo que hay adentro. Ej: { 3: {…}, 5: {…} } → [{…}, {…}]
  const planes = Object.values(planesPorId);
  planes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));            // por nombre

  // 2. Si un plan elegido ya no tiene platos (se desactivó), se saca: si no, la tabla quedaría vacía
  planesElegidos = planesElegidos.filter(idPlan => planesPorId[idPlan]);

  // 3. La lista del menú, con los planes que coinciden con lo escrito en "Buscar plan…"
  const textoPlan = document.getElementById('buscarPlan').value.trim().toLowerCase();
  const planesVisibles = planes.filter(plan => plan.nombre.toLowerCase().includes(textoPlan));
  const lista = document.getElementById('listaFiltroPlan');                  // donde van los planes
  lista.innerHTML = '';                                                      // se borran los de antes
  if (planesVisibles.length === 0) lista.innerHTML = '<p class="plan-vacio">No hay planes con ese nombre</p>';
  planesVisibles.forEach(plan => {                                           // por cada plan...
    const opcion = document.createElement('label');                          // ...un renglón (label: tocar el texto tilda la casilla)
    opcion.className = 'opcion-plan';
    const clasePunto = 'punto-plan-' + (Number(plan.id) % CANTIDAD_COLORES_PLAN);   // su color (% = el resto de dividir)
    opcion.innerHTML = `
      <input type="checkbox" class="casilla-plan">
      <span class="punto-plan ${clasePunto}"></span>
      <span class="nombre-plan">${escHtml(plan.nombre)}</span>
      <span class="cantidad-plan">${Number(plan.cantidad)}</span>`;
    const casilla = opcion.querySelector('input');                           // la casilla
    casilla.checked = planesElegidos.includes(plan.id);                      // tildada si ya estaba elegido
    casilla.addEventListener('change', () => {                               // al tildar o destildar...
      planesElegidos = planesElegidos.filter(idPlan => idPlan !== plan.id);  // ...primero se saca (si estaba)
      if (casilla.checked) planesElegidos.push(plan.id);                     // ...y si quedó tildada, se agrega
      renderizarTabla(false);                                                // ...y se dibuja desde la página 1
    });
    lista.appendChild(opcion);
  });

  // 4. El número del botón "Filtros" y "Limpiar filtro": solo si hay planes elegidos
  const hayElegidos = planesElegidos.length > 0;
  document.getElementById('cantidadFiltroPlan').textContent = String(planesElegidos.length);
  document.getElementById('cantidadFiltroPlan').hidden = !hayElegidos;
  document.getElementById('btnLimpiarPlan').hidden = !hayElegidos;

  // 5. Debajo de los filtros: "Plan: Mantenimiento ✕" por cada plan elegido, y "Limpiar todo"
  const chips = document.getElementById('chipsFiltros');                    // la fila de los ✕
  chips.innerHTML = '';                                                      // se borran los de antes
  chips.hidden = !hayElegidos;                                               // sin planes elegidos no se ve
  planesElegidos.forEach(idPlan => {                                         // por cada plan elegido...
    const chip = document.createElement('span');
    chip.className = 'chip-filtro';
    chip.innerHTML = `Plan: ${escHtml(planesPorId[idPlan].nombre)}
      <button type="button" class="quitar-chip" aria-label="Sacar este filtro"><svg aria-hidden="true"><use href="#icono-cerrar"></use></svg></button>`;
    chip.querySelector('button').addEventListener('click', () => {           // al tocar su ✕...
      planesElegidos = planesElegidos.filter(id => id !== idPlan);           // ...se saca ese plan
      renderizarTabla(false);
    });
    chips.appendChild(chip);
  });
  const botonLimpiarTodo = document.createElement('button');                 // "Limpiar todo", al final
  botonLimpiarTodo.type = 'button';
  botonLimpiarTodo.className = 'boton-limpiar-todo';
  botonLimpiarTodo.textContent = 'Limpiar todo';
  botonLimpiarTodo.addEventListener('click', limpiarFiltros);
  chips.appendChild(botonLimpiarTodo);
}


// ─────────────────────────────────────────────────────────────────────────────
// limpiarFiltros → saca todos los filtros de la tabla
// ENTRADA: nada (la llaman "Limpiar todo" y "Limpiar filtros" de la tabla vacía)
// SALIDA:  nada (ningún plan tildado, buscador vacío, pestaña "Todos" y la tabla desde la página 1)
// Ej: estaba en "Bajos" + "Plan: Mantenimiento" + "fid" → se ven todos los platos
// ─────────────────────────────────────────────────────────────────────────────
function limpiarFiltros() {
  planesElegidos = [];                                   // todos los planes
  filtroEstado = 'todos';                                // pestaña "Todos"
  document.getElementById('filtroNombre').value = '';    // buscador vacío
  renderizarTabla(false);                                // se dibuja desde la página 1
}


// ─────────────────────────────────────────────────────────────────────────────
// ordenarPor → ordena la tabla por una columna
// ENTRADA: columna: 'nombre', 'plan', 'estado', 'libres' o 'en_heladera' (el data-columna del título tocado)
// SALIDA:  nada (guarda el orden en ordenTabla y redibuja desde la página 1).
//          El orden queda guardado: la recarga de cada 60 s lo respeta.
// Ej: toca "Libres" → de menos a más libres; toca "Libres" otra vez → de más a menos
// ─────────────────────────────────────────────────────────────────────────────
function ordenarPor(columna) {
  const mismaColumna = ordenTabla.columna === columna;                 // ¿tocó la columna que ya ordenaba?
  const direccion = mismaColumna ? -ordenTabla.direccion : 1;          // la misma: se da vuelta · otra: de menor a mayor
  ordenTabla = { columna: columna, direccion: direccion };             // se guarda
  renderizarTabla(false);                                              // y se dibuja
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaPlato → arma la fila de un plato para la tabla (la llama crearPaginacion, una vez por fila)
// ENTRADA: plato (uno de todosPlatos)
// SALIDA:  la fila <tr> lista para poner en la tabla, con sus botones andando
// Ej: fideos con 61 libres, 10 reservadas y mínimo 5 →
//     "fideos / Con salsa · ● Mantenimiento · ● Bien · 61 · 10 · 71 · 5 ✎ · ⋯"
//     (el cocinero ve el mínimo como número, sin ✎)
// ─────────────────────────────────────────────────────────────────────────────
function crearFilaPlato(plato) {
  // 1. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
  const estado = estadoDelPlato(plato);                                      // su estado
  const datosEstado = ESTADOS_STOCK[estado];                                 // su texto y su color
  const plan = plato.plan_nombre || 'Sin plan';                              // el plan ("Sin plan" si no tiene)
  const clasePunto = 'punto-plan-' + (Number(plato.id_plan || 0) % CANTIDAD_COLORES_PLAN);  // el color fijo de su plan
  const descripcion = plato.descripcion || '';                               // la frase de abajo del nombre ('' si no tiene)
  const minimo = Number(plato.stock_minimo);                                 // el mínimo
  const editorMinimo = `
          <button type="button" class="boton-minimo" title="Cambiar el mínimo">${minimo}<svg class="icono-lapiz" aria-hidden="true"><use href="#icono-lapiz"></use></svg></button>
          <div class="minimo-editar" hidden>
            <input type="number" class="input-minimo" min="0" max="9999" step="1" value="${minimo}"
                   aria-label="Mínimo de ${escHtml(plato.nombre)}">
            <button type="button" class="btn-guardar-minimo" title="Guardar el mínimo" aria-label="Guardar el mínimo"><svg aria-hidden="true"><use href="#icono-check"></use></svg></button>
          </div>`;                                                           // ✎ abre el casillero con ✓ (los que administran)
  const numeroMinimo = `<span class="numero-minimo">${minimo}</span>`;       // el cocinero solo ve el número
  const celdaMinimo = puedeAdministrar ? editorMinimo : numeroMinimo;

  // 2. La fila, pintada según su estado (lo que viene de la base pasa por escHtml; los números, por Number)
  const fila = document.createElement('tr');
  fila.className = 'fila-plato fila-' + estado;                              // ej: "fila-bajo" = amarillo clarito
  fila.innerHTML = `
        <td class="col-plato">
          <div class="plato-nombre" title="${escHtml(plato.nombre)}">${escHtml(plato.nombre)}</div>
          <div class="plato-descripcion" title="${escHtml(descripcion)}">${escHtml(descripcion)}</div>
        </td>
        <td class="col-plan"><span class="plan-con-punto"><span class="punto-plan ${clasePunto}"></span>${escHtml(plan)}</span></td>
        <td class="col-estado"><span class="etiqueta-estado ${datosEstado.clase}"><span class="punto-estado"></span>${datosEstado.texto}</span></td>
        <td class="col-numero numero-libres">${Number(plato.stock_heladera)}</td>
        <td class="col-numero numero-secundario">${Number(plato.reservadas)}</td>
        <td class="col-numero numero-secundario">${Number(plato.en_heladera)}</td>
        <td class="col-minimo">${celdaMinimo}</td>
        <td class="col-menu">
          <button type="button" class="boton-menu-fila" title="Más acciones" aria-label="Más acciones de ${escHtml(plato.nombre)}" aria-haspopup="menu">
            <svg aria-hidden="true"><use href="#icono-puntos"></use></svg>
          </button>
        </td>`;

  // 3. El ⋯ abre el menú de la fila (currentTarget = el botón, aunque se toque el dibujo de adentro)
  fila.querySelector('.boton-menu-fila').addEventListener('click', evento => abrirMenuFila(evento.currentTarget, plato.id));
  if (!puedeAdministrar) return fila;                                        // el cocinero no cambia el mínimo: la fila ya está

  // 4. El mínimo: ✎ cambia el número por el casillero con ✓; se guarda con ✓ o Enter; Escape deja todo como estaba
  const botonMinimo = fila.querySelector('.boton-minimo');                   // el número con ✎
  const editor = fila.querySelector('.minimo-editar');                       // el casillero con ✓
  const input = fila.querySelector('.input-minimo');
  botonMinimo.addEventListener('click', () => {                              // al tocar ✎...
    botonMinimo.hidden = true;                                               // ...se esconde el número
    editor.hidden = false;                                                   // ...aparece el casillero
    input.focus();                                                           // ...con el cursor adentro
    input.select();                                                          // ...y el número marcado (para escribir encima)
  });
  fila.querySelector('.btn-guardar-minimo').addEventListener('click', () => guardarMinimo(plato.id, input));
  input.addEventListener('keydown', evento => {                              // al apretar una tecla en el casillero...
    switch (evento.key) {
      case 'Enter':                                                          // según sea Enter: se guarda
        guardarMinimo(plato.id, input);
        break;
      case 'Escape':                                                         // según sea Escape: vuelve el número de antes
        input.value = minimo;
        editor.hidden = true;
        botonMinimo.hidden = false;
        break;
    }
  });
  return fila;                                                               // la fila terminada
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirMenuFila → abre el menú ⋯ de una fila, al lado del botón que se tocó
// ENTRADA: boton (el ⋯ tocado) e idProducto (el plato de esa fila)
// SALIDA:  nada (muestra el menú con "Ver movimientos del plato" y "Descartar viandas"; tocar el mismo ⋯ otra vez lo cierra)
// Ej: ⋯ de fideos con 0 libres → el menú se abre con "Descartar viandas" apagado
// El menú es uno solo para toda la tabla: platoDelMenu dice de qué plato es (lo usan sus dos opciones, en iniciarProduccion).
// ─────────────────────────────────────────────────────────────────────────────
function abrirMenuFila(boton, idProducto) {
  const plato = todosPlatos.find(p => p.id === idProducto);                 // find = el plato con ese número (o undefined)
  if (!plato) return;                                                        // si ya no está, no hace nada

  const menu = document.getElementById('menuFila');
  const eraElMismo = !menu.hidden && platoDelMenu === idProducto;            // ¿ya estaba abierto para este plato?
  menu.hidden = true;                                                        // se cierra
  if (eraElMismo) return;                                                    // tocar el mismo ⋯ otra vez solo lo cierra

  // 1. Para este plato: sin libres no se puede descartar
  platoDelMenu = idProducto;
  document.getElementById('menuFilaDescartar').disabled = Number(plato.stock_heladera) <= 0;

  // 2. Se muestra y se ubica debajo del ⋯, alineado a su derecha. Si no entra abajo, va arriba.
  //    getBoundingClientRect = dónde está el botón en la pantalla. Ej: { top: 400, bottom: 434, right: 1380 }
  menu.hidden = false;                                                       // primero se muestra (para poder medirlo)
  const lugar = boton.getBoundingClientRect();
  const noEntraAbajo = lugar.bottom + 6 + menu.offsetHeight > window.innerHeight;
  const arriba = noEntraAbajo ? lugar.top - 6 - menu.offsetHeight : lugar.bottom + 6;
  const izquierda = Math.max(8, lugar.right - menu.offsetWidth);             // Math.max: nunca pegado al borde izquierdo
  menu.style.top = arriba + 'px';
  menu.style.left = izquierda + 'px';
}


// ─────────────────────────────────────────────────────────────────────────────
// guardarMinimo → cambia el mínimo de un plato
// ENTRADA: idProducto (el plato) e input (el casillero donde se escribió el número)
// SALIDA:  nada (si sale bien, guarda el mínimo en todosPlatos, redibuja la tabla en la misma página y avisa;
//          si no, avisa el error y el casillero queda como estaba escrito)
// Ej: fideos con 61 libres, mínimo 5 → 100: la fila pasa de "Bien" a "Bajo" y sale "Mínimo de «fideos»: 100"
// ─────────────────────────────────────────────────────────────────────────────
async function guardarMinimo(idProducto, input) {
  const plato = todosPlatos.find(p => p.id === idProducto);   // find = el primer plato con ese número (o undefined)
  if (!plato) return;                                          // si ya no está, no hace nada

  // 1. Control en la pantalla (el servidor lo vuelve a controlar): un entero de 0 a 9999
  const texto = input.value.trim();                            // lo escrito, sin espacios en los bordes
  const minimo = Number(texto);                                // como número
  const minimoInvalido = texto === '' || !Number.isInteger(minimo) || minimo < 0 || minimo > 9999;  // vacío, con decimales, negativo o muy grande
  if (minimoInvalido) {
    mostrarToast('El mínimo tiene que ser un número entero de 0 a 9999.', 'error');   // se avisa
    input.focus();                                             // y el cursor vuelve al casillero
    return;
  }

  // 2. Se manda al servidor
  input.disabled = true;                                       // mientras se guarda, no se puede tocar
  try {
    const respuesta = await apiFetch(`/api/viandas-stock/${idProducto}/minimo`, {
      method: 'PUT',                                           // PUT = cambiar algo que ya existe
      headers: { 'Content-Type': 'application/json' },         // se manda un JSON
      body: JSON.stringify({ stock_minimo: minimo })           // el mínimo nuevo
    });
    const datos = await respuesta.json().catch(() => ({}));    // la respuesta (si no es JSON, un objeto vacío)

    if (!respuesta.ok) {                                       // si el servidor no lo aceptó...
      mostrarToast(datos.error || 'No se pudo guardar el mínimo.', 'error');  // ...se avisa con su mensaje (o uno por si no mandó)
      input.disabled = false;                                  // ...y se puede corregir
      return;
    }

    // 3. Salió bien: se guarda en la lista y se redibuja (el estado del plato puede cambiar)
    plato.stock_minimo = datos.stock_minimo;                   // el mínimo nuevo
    renderizarTabla(true);                                     // la tabla, en la misma página
    mostrarToast('Mínimo de «' + plato.nombre + '»: ' + datos.stock_minimo, 'exito');  // se avisa
  } catch (error) {                                            // si no hubo respuesta...
    console.error('No se pudo guardar el mínimo:', error);     // ...el detalle a la consola
    mostrarToast('No se pudo conectar con el servidor.', 'error');  // ...y un aviso simple
    input.disabled = false;                                    // ...y se puede volver a intentar
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirMovimientos → abre el panel "Últimos movimientos", de todos los platos o de uno solo
// ENTRADA: nombrePlato: '' = todos (botón "Últimos movimientos") · el nombre = solo ese plato (⋯ "Ver movimientos del plato")
// SALIDA:  nada (abre el panel, muestra "Plato: … ✕" si es de un plato, y pide la lista de nuevo)
// Ej: abrirMovimientos('fideos') → el panel con "Plato: fideos ✕" y solo los movimientos de fideos que se cargaron
// Filtra lo que trae el servidor (los últimos 50 y, con "Ver más", 50 más): no pide nada distinto.
// ─────────────────────────────────────────────────────────────────────────────
function abrirMovimientos(nombrePlato) {
  platoMovimientos = nombrePlato;                                            // el plato elegido ('' = todos)
  const chip = document.getElementById('chipPlatoMovimientos');              // "Plato: fideos ✕"
  chip.hidden = !nombrePlato;                                                // sin plato no se ve
  // Su ✕ vuelve a todos los platos (abrirMovimientos('') con comillas vacías: no lleva nada de la base)
  chip.innerHTML = `Plato: ${escHtml(nombrePlato)}
    <button type="button" class="quitar-chip" onclick="abrirMovimientos('')" aria-label="Ver todos los platos"><svg aria-hidden="true"><use href="#icono-cerrar"></use></svg></button>`;
  document.getElementById('panelMovimientos').style.display = 'block';       // se abre el panel
  cargarMovimientos(false);                                                  // y se pide la lista desde el principio
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarMovimientos → pide y dibuja "Últimos movimientos" con el filtro de tipo elegido
//                     (y, si se eligió un plato con el ⋯, solo los de ese plato)
// ENTRADA: agregar: false = empezar de nuevo (al abrir o al cambiar de filtro) · true = "Ver más" (agrega los 50 siguientes)
// SALIDA:  nada (dibuja los renglones, marca el filtro elegido y muestra "Ver más" solo si puede haber más)
// Ej: filtro "Ventas" → GET /api/movimientos-viandas?desde=0&tipo=venta →
//     "−10  fideos [Venta]" / "15/10 18:40 · Consumidor Final" / "Pedido #251"
// ─────────────────────────────────────────────────────────────────────────────
async function cargarMovimientos(agregar) {
  const lista = document.getElementById('listaMovimientos');   // la lista de renglones
  const botonVerMas = document.getElementById('btnVerMas');    // el botón "Ver más"

  // 1. Queda marcado el botón del filtro elegido
  document.querySelectorAll('#filtrosMovimientos .btn-filtro-estado').forEach(boton => {  // por cada botón de filtro...
    boton.classList.toggle('activo', boton.dataset.tipo === tipoMovimientos);  // toggle(clase, sí/no): la pone si es el elegido, la saca si no
  });

  // 2. Si se empieza de nuevo, se pide desde el primero
  if (!agregar) movimientosMostrados = 0;

  try {
    // URLSearchParams arma los datos de la dirección. Ej: { desde: '50' } + tipo 'venta' → "desde=50&tipo=venta"
    const parametros = new URLSearchParams({ desde: String(movimientosMostrados) });  // cuántos saltear
    if (tipoMovimientos) parametros.set('tipo', tipoMovimientos);                     // y el tipo, si se eligió uno
    const respuesta = await apiFetch('/api/movimientos-viandas?' + parametros.toString());  // se piden
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);                  // si el servidor dio error, va al catch
    const movimientos = await respuesta.json();                                      // hasta 50 renglones

    // 3. Si se empieza de nuevo, se borra la lista; si no, se saca el "No hay…" que hubiera
    if (!agregar) lista.innerHTML = '';                                              // se borra lo de antes
    lista.querySelectorAll('.mov-vacio').forEach(renglon => renglon.remove());       // el aviso "No hay…" (si estaba)

    // 4. Un renglón por movimiento: cantidad con signo; plato y tipo; fecha · quién; y el motivo, si hay
    movimientos.forEach(movimiento => {
      const esDeOtroPlato = Boolean(platoMovimientos) && movimiento.plato_nombre !== platoMovimientos;  // ¿se pidió otro plato?
      if (esDeOtroPlato) return;                                                     // (return = saltear este y seguir con el siguiente)
      const cantidad = Number(movimiento.cantidad);                                  // + entran, − salen
      const esEntrada = cantidad > 0;                                                // positiva: entra
      const textoCantidad = esEntrada ? '+' + cantidad : String(cantidad);           // positiva con "+" (verde); negativa tal cual (rojo)
      const claseCantidad = esEntrada ? 'entrada' : 'salida';
      const tipo = NOMBRES_TIPO[movimiento.tipo] || movimiento.tipo;                 // bien escrito ("Venta"), o como viene
      const claseTipo = NOMBRES_TIPO[movimiento.tipo] ? 'tipo-' + movimiento.tipo : 'tipo-otro';  // su color (solo los tipos conocidos)
      const cuando = fechaYHoraCortas(movimiento.fecha);                             // { dia: '15/10', hora: '18:40' } o null
      const fecha = cuando ? cuando.dia + ' ' + cuando.hora : '-';                   // "15/10 18:40" (sin fecha: "-")
      const detalle = fecha + ' · ' + movimiento.usuario_nombre;                     // "15/10 18:40 · Consumidor Final"
      const htmlMotivo = movimiento.motivo ? '<div class="mov-motivo">' + escHtml(movimiento.motivo) + '</div>' : '';  // solo si tiene

      const renglon = document.createElement('li');                                 // el renglón
      renglon.className = 'mov-item';
      renglon.innerHTML = `
        <span class="mov-cantidad ${claseCantidad}">${escHtml(textoCantidad)}</span>
        <div class="mov-cuerpo">
          <div class="mov-linea">
            <span class="mov-plato">${escHtml(movimiento.plato_nombre)}</span>
            <span class="mov-tipo ${claseTipo}">${escHtml(tipo)}</span>
          </div>
          <div class="mov-detalle">${escHtml(detalle)}</div>
          ${htmlMotivo}
        </div>`;
      lista.appendChild(renglon);                                                    // se agrega al final
    });

    // 5. Si la lista quedó vacía, se avisa por qué
    const textoSinPlato = tipoMovimientos ? 'No hay movimientos de este tipo' : 'Todavía no hay movimientos';  // con filtro · sin filtro
    const textoVacio = platoMovimientos ? 'No hay movimientos de este plato entre los cargados' : textoSinPlato;
    if (lista.children.length === 0) lista.innerHTML = `<li class="mov-vacio">${textoVacio}</li>`;

    // 6. "Ver más": si llegaron 50, puede haber más; si llegaron menos, ya no
    movimientosMostrados = movimientosMostrados + movimientos.length;                // ya se pidieron estos
    botonVerMas.hidden = movimientos.length < MOVIMIENTOS_POR_PAGINA;                // hidden = escondido
  } catch (error) {                                                                  // si no se pudo...
    console.error('No se pudieron cargar los movimientos:', error);                  // ...el detalle a la consola
    if (agregar) {                                                                   // ...si era "Ver más", un aviso
      mostrarToast('No se pudieron cargar más movimientos.', 'error');               //    (la lista queda como estaba)
      return;
    }
    lista.innerHTML = '<li class="mov-vacio texto-error">Error al cargar los movimientos</li>';  // ...si no, en la lista
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirHechoHoy → abre la ventana "Hecho hoy"
// ENTRADA: nada (la llama el botón "Hecho hoy")
// SALIDA:  nada (abre la ventana y vuelve a pedir la lista, así se ve lo último)
// Ej: toca "Hecho hoy 3" → la ventana con "Entraron a la heladera: 45 viandas" y los 3 renglones
// ─────────────────────────────────────────────────────────────────────────────
function abrirHechoHoy() {
  document.getElementById('modalHechoHoy').style.display = 'block';   // se abre (se ve lo que ya estaba)
  cargarHechosHoy();                                                 // y se recarga
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarHechosHoy → pide y dibuja "Hecho hoy" (en su ventana) y cuántos son (en su botón)
// ENTRADA: nada
// SALIDA:  nada (un renglón por plato que la cocina marcó hecho hoy, del más nuevo al más viejo,
//          y arriba "Entraron a la heladera: N viandas")
// Ej: GET /api/ordenes-produccion/hechos-hoy →
//     "+20  Plato de prueba (MANTENIMIENTO)" / "Marta Garcia · Pedido a cocina #6"  ·  "09:03"
// ─────────────────────────────────────────────────────────────────────────────
async function cargarHechosHoy() {
  const lista = document.getElementById('listaHechoHoy');                            // la lista
  const resumen = document.getElementById('resumenHechoHoy');                        // "Entraron a la heladera: N viandas"
  const cantidadBoton = document.getElementById('cantidadHechoHoy');                 // el número del botón
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/hechos-hoy');          // se pide
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);                  // si el servidor dio error, va al catch
    const hechos = await respuesta.json();                                           // lo hecho hoy

    cantidadBoton.textContent = String(hechos.length);                               // el botón: cuántos renglones hay
    cantidadBoton.hidden = false;
    resumen.hidden = hechos.length === 0;                                            // sin nada hecho, no se ve el resumen

    if (hechos.length === 0) {                                                       // si no hay nada...
      lista.innerHTML = '<li class="mov-vacio">Todavía no se marcó nada hoy.</li>';
      return;
    }

    let html = '';                                                                   // se arman los renglones
    let totalViandas = 0;                                                            // y se suman las viandas
    hechos.forEach(hecho => {                                                        // por cada plato hecho...
      const cuando = fechaYHoraCortas(hecho.fecha_hecho);                            // ...cuándo se marcó (o null)
      const hora = cuando ? cuando.hora : '-';                                       // ...la hora, como "14:32" (sin fecha: "-")
      const plan = hecho.plan ? ' <span class="hh-plan">(' + escHtml(hecho.plan) + ')</span>' : '';  // ...el plan entre paréntesis, si tiene
      const partes = [];                                                             // ...el renglón gris: "Marta Garcia · Pedido a cocina #6"
      if (hecho.marcado_por) partes.push(hecho.marcado_por);                         //    quién lo marcó, si se sabe
      partes.push('Pedido a cocina #' + Number(hecho.id_orden));                     //    y de qué pedido a cocina
      totalViandas += Number(hecho.cantidad);
      html += `
        <li class="hecho-item">
          <span class="hh-cantidad">+${Number(hecho.cantidad)}</span>
          <div class="hh-info">
            <div class="hh-plato">${escHtml(hecho.plato)}${plan}</div>
            <div class="hh-quien">${escHtml(partes.join(' · '))}</div>
          </div>
          <span class="hh-hora">${escHtml(hora)}</span>
        </li>`;
    });
    lista.innerHTML = html;                                                          // se muestran todos juntos
    // conPlural da un número y una palabra nuestra (ej: "45 viandas"): no hace falta escHtml
    resumen.innerHTML = '<svg class="icono-resumen" aria-hidden="true"><use href="#icono-heladera"></use></svg>'
      + '<span>Entraron a la heladera: <strong>' + conPlural(totalViandas, 'vianda', 'viandas') + '</strong></span>';
  } catch (error) {                                                                  // si no se pudo...
    console.error('No se pudo cargar lo hecho hoy:', error);                         // ...el detalle a la consola
    lista.innerHTML = '<li class="mov-vacio texto-error">Error al cargar lo hecho hoy</li>';
    resumen.hidden = true;                                                           // ...sin resumen
    cantidadBoton.hidden = true;                                                     // ...y sin número en el botón
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// fechaYHoraCortas → una fecha de la base en dos textos cortos, en la hora de la computadora
//                    (la usan "Últimos movimientos", con día y hora, y "Hecho hoy", solo con la hora)
// ENTRADA: texto de la base (ej: '2026-10-15T21:40:00+00:00'), o null / '' si no hay fecha
// SALIDA:  { dia: '15/10', hora: '18:40' }, o null si no vino fecha
// Ej: '2026-10-15T21:40:00+00:00' → { dia: '15/10', hora: '18:40' } (Argentina va 3 horas atrás de UTC)
// ─────────────────────────────────────────────────────────────────────────────
function fechaYHoraCortas(texto) {
  if (!texto) return null;                                             // sin fecha, nada
  const momento = fechaDeTimestamp(texto);                             // de la base (UTC) a la hora de la computadora
  const dia = String(momento.getDate()).padStart(2, '0');              // padStart: completa con ceros. Ej: '7' → '07'
  const mes = String(momento.getMonth() + 1).padStart(2, '0');         // los meses van de 0 a 11
  const hora = String(momento.getHours()).padStart(2, '0');
  const minuto = String(momento.getMinutes()).padStart(2, '0');
  return { dia: dia + '/' + mes, hora: hora + ':' + minuto };
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarPendientesCocina → los pendientes de cocina: los pide, pone cuántos hay en el botón y, si se pide, abre la ventana
// ENTRADA: abrirVentana: true al tocar el botón "Pendientes de cocina" · false en la carga y en las recargas
// SALIDA:  nada (la lista la dibuja pedidosCocina.js en la ventana, con "Hecho" en cada plato)
// Ej: 3 platos pendientes → el botón dice "Pendientes de cocina 3"
// Después de marcar un plato "Hecho" se recargan los pendientes, la tabla (en la misma página) y "Hecho hoy".
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPendientesCocina(abrirVentana) {
  if (abrirVentana) document.getElementById('modalPendientes').style.display = 'block';  // primero se abre (se ve "Cargando…")

  const opciones = {                                                                 // lo que necesita pedidosCocina.js:
    conBotonHecho: true,                                                             // ...cada plato con su botón "Hecho"
    recargar: () => Promise.all([cargarPendientesCocina(false), cargarPlatos(true), cargarHechosHoy()])  // ...qué recargar después (Promise.all = espera las tres)
  };
  const pendientes = await cargarPendientes('listaPendientes', opciones);           // la lista (o null si no se pudo cargar)

  const cantidadBoton = document.getElementById('cantidadPendientes');              // el número del botón de la cabecera
  cantidadBoton.textContent = pendientes ? String(pendientes.length) : '';          // si se cargó, cuántos hay
  cantidadBoton.hidden = !pendientes;                                                // si no se pudo cargar, sin número
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirDescarte → abre la ventana "Descartar viandas" para un plato
// ENTRADA: idProducto (el plato del menú ⋯)
// SALIDA:  nada (llena la ventana con el plato, sus libres y sus reservadas, y la abre limpia)
// Ej: fideos con 61 libres y 10 reservadas → "fideos · las viandas salen de la heladera." y
//     "Hay 61 disponibles; las 10 reservadas no se pueden descartar."
// ─────────────────────────────────────────────────────────────────────────────
function abrirDescarte(idProducto) {
  const plato = todosPlatos.find(p => p.id === idProducto);           // find = el plato con ese número (o undefined)
  if (!plato) return;                                                  // si no está, no hace nada

  platoDescarte = plato;                                               // el plato que se descarta
  const libres = Number(plato.stock_heladera);                         // las que se pueden descartar
  const reservadas = Number(plato.reservadas);                         // las que no
  const textoReservadas = '; las <strong>' + reservadas + ' reservadas</strong> no se pueden descartar.';
  const aclaracion = reservadas > 0 ? textoReservadas : ' para descartar.';   // si tiene reservadas, se aclara
  document.getElementById('dInfo').textContent = plato.nombre + ' · las viandas salen de la heladera.';  // textContent: el nombre se muestra como texto
  // Solo números y textos nuestros: no hace falta escHtml
  document.getElementById('dDisponibles').innerHTML = 'Hay <strong>' + conPlural(libres, 'disponible', 'disponibles') + '</strong>' + aclaracion;
  document.getElementById('dCantidad').value = '';                     // la cantidad, vacía
  document.getElementById('dCantidad').max = plato.stock_heladera;     // el casillero no deja pasar de las libres
  document.getElementById('dMotivo').value = '';                       // el motivo, vacío
  document.getElementById('dError').style.display = 'none';            // sin error
  document.getElementById('dConfirmar').disabled = false;              // el botón, prendido
  document.getElementById('modalDescarte').style.display = 'block';    // se abre
}


// ─────────────────────────────────────────────────────────────────────────────
// confirmarDescarte → controla lo escrito y manda el descarte
// ENTRADA: nada (lee la cantidad y el motivo de la ventana, y platoDescarte)
// SALIDA:  nada (si sale bien: cierra, avisa y recarga la tabla y los movimientos; si no: muestra el error en la ventana)
// Ej: fideos con 61 libres, 2 "vencidos" → POST /api/viandas-stock/descarte → "Descarte registrado. Libres: 59."
// ─────────────────────────────────────────────────────────────────────────────
async function confirmarDescarte() {
  if (!platoDescarte) return;                                          // si no hay plato elegido, no hace nada

  const errorVentana = document.getElementById('dError');              // donde se muestra el error
  const textoCantidad = document.getElementById('dCantidad').value.trim();  // la cantidad escrita
  const cantidad = Number(textoCantidad);                              // como número
  const motivo = document.getElementById('dMotivo').value.trim();      // el motivo, sin espacios en los bordes

  // 1. Controles en la pantalla (el servidor y la base los vuelven a hacer), en orden: { estaMal, mensaje }.
  //    Vale el PRIMERO que está mal. Ej: cantidad 0 y sin motivo → 'La cantidad tiene que ser un número entero mayor a 0.'
  const cantidadInvalida = textoCantidad === '' || !Number.isInteger(cantidad) || cantidad <= 0;
  const controles = [
    { estaMal: cantidadInvalida, mensaje: 'La cantidad tiene que ser un número entero mayor a 0.' },
    { estaMal: cantidad > Number(platoDescarte.stock_heladera), mensaje: 'No podés descartar más viandas de las disponibles.' },
    { estaMal: !motivo, mensaje: 'Escribí el motivo del descarte.' }
  ];
  const controlQueFalla = controles.find(control => control.estaMal);  // find = el primero que está mal (o undefined)
  if (controlQueFalla) {                                               // si hay un problema...
    errorVentana.textContent = controlQueFalla.mensaje;                // ...se muestra
    errorVentana.style.display = 'block';
    return;                                                            // ...y no se manda nada
  }

  // 2. Se manda al servidor
  const boton = document.getElementById('dConfirmar');                 // el botón "Confirmar descarte"
  boton.disabled = true;                                               // apagado: un doble clic no descarta dos veces
  try {
    const respuesta = await apiFetch('/api/viandas-stock/descarte', {
      method: 'POST',                                                  // POST = registrar algo nuevo
      headers: { 'Content-Type': 'application/json' },                 // se manda un JSON
      body: JSON.stringify({ id_producto: platoDescarte.id, cantidad: cantidad, motivo: motivo })  // qué, cuántas y por qué
    });
    const datos = await respuesta.json().catch(() => ({}));            // la respuesta (si no es JSON, un objeto vacío)

    if (!respuesta.ok) {                                               // si no se pudo...
      errorVentana.textContent = datos.error || 'No se pudo registrar el descarte.';  // ...el mensaje del servidor (o uno por si no vino)
      errorVentana.style.display = 'block';                            // ...se muestra en la ventana
      boton.disabled = false;                                          // ...y se puede corregir
      return;
    }

    // 3. Salió bien
    cerrarVentana('modalDescarte');                                    // se cierra la ventana
    mostrarToast('Descarte registrado. Disponibles: ' + datos.stock_heladera + '.', 'exito');  // se avisa cuántas quedaron disponibles
    await Promise.all([cargarPlatos(true), cargarMovimientos(false)]); // se recargan la tabla y los movimientos
  } catch (error) {                                                    // si no hubo respuesta...
    console.error('No se pudo registrar el descarte:', error);         // ...el detalle a la consola
    errorVentana.textContent = 'No se pudo conectar con el servidor.'; // ...y un mensaje simple
    errorVentana.style.display = 'block';
    boton.disabled = false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// cerrarVentana → cierra una ventana (modal) de la pantalla, o el panel de movimientos
// ENTRADA: idVentana: 'modalPedido', 'modalPendientes', 'modalHechoHoy', 'modalDescarte' o 'panelMovimientos'
// SALIDA:  nada (la esconde; si es la de descartar, se olvida el plato elegido)
// Ej: cerrarVentana('modalDescarte') → la ventana se esconde y platoDescarte vuelve a null
// ─────────────────────────────────────────────────────────────────────────────
function cerrarVentana(idVentana) {
  document.getElementById(idVentana).style.display = 'none';           // se esconde
  if (idVentana === 'modalDescarte') platoDescarte = null;             // ya no hay plato para descartar
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarToast → un aviso flotante que se va solo a los 3,5 segundos (el mismo de stock.js)
// ENTRADA: mensaje (el texto) y tipo: 'exito' (verde) o 'error' (rojo)
// SALIDA:  nada (lo muestra y lo saca solo)
// Ej: mostrarToast('Mínimo de «fideos»: 100', 'exito') → un cartel verde abajo que se va solo
// ─────────────────────────────────────────────────────────────────────────────
function mostrarToast(mensaje, tipo) {
  const toast = document.createElement('div');                         // el aviso
  toast.className = 'toast-stock ' + tipo;                             // su estilo y su color
  toast.textContent = mensaje;                                         // textContent: el texto no se interpreta como HTML
  document.body.appendChild(toast);                                    // se agrega a la página
  requestAnimationFrame(() => toast.classList.add('visible'));         // en el próximo dibujo aparece (con animación)
  setTimeout(() => {                                                   // a los 3,5 segundos...
    toast.classList.remove('visible');                                 // ...empieza a irse
    setTimeout(() => toast.remove(), 300);                             // ...y a los 0,3 segundos se borra
  }, 3500);
}
