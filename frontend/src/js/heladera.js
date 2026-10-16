// ============================================================================
// heladera.js — Pantalla Producción (pages/heladera.html)
//
// Funciones:
//   iniciarProduccion      → al abrir la pantalla: engancha botones y filtros, hace la primera carga y recarga cada 60 s
//   estadoDelPlato         → la regla única del estado de un plato: sin stock / bajo / bien / sin control
//   cargarPlatos           → pide los platos (GET /api/viandas-stock) y dibuja la tabla
//   renderizarTabla        → dibuja los botones de estado, la franja "Te faltan…" y la tabla (filtrada, ordenada y paginada)
//   crearFilaPlato         → arma la fila de un plato, con sus botones (Descartar y, para quien administra, el mínimo)
//   guardarMinimo          → manda el mínimo nuevo de un plato (PUT /api/viandas-stock/:id/minimo) y redibuja
//   cargarMovimientos      → pide y dibuja "Últimos movimientos" con el filtro de tipo; "Ver más" agrega 50 más
//   cargarHechosHoy        → pide y dibuja "Hecho hoy"
//   fechaYHoraCortas       → una fecha de la base en dos textos cortos: { dia: '15/10', hora: '18:40' }
//   cargarPendientesCocina → pide los pendientes de cocina (los dibuja pedidosCocina.js), pone cuántos hay en el botón
//                            y, si se pide, abre la ventana
//   abrirDescarte          → abre la ventana "Descartar" con los datos del plato
//   confirmarDescarte      → controla y manda el descarte (POST /api/viandas-stock/descarte)
//   cerrarVentana          → cierra una ventana (modal)
//   mostrarToast           → muestra un aviso flotante que se va solo
//
// La ventana "Pedir a cocina" está en pedirCocina.js (usa todosPlatos y estadoDelPlato de acá).
// Necesita antes: roles.js (FG_ROLES), api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion),
// fechas.js (fechaDeTimestamp) y pedidosCocina.js (cargarPendientes, conPlural).
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

let todosPlatos = [];                // los platos que mandó el servidor (también los usa pedirCocina.js)
let filtroEstado = 'todos';          // el filtro de la tabla: 'todos', 'sin', 'bajo', 'bien' o 'sincontrol'
let paginacionPlatos = null;         // lo que devuelve crearPaginacion: sirve para saber en qué página está la tabla
let puedeAdministrar = false;        // true para los roles 6, 5 y 1: piden a cocina y cambian el mínimo
let platoDescarte = null;            // el plato que se está descartando (mientras la ventana está abierta)
let tipoMovimientos = '';            // el filtro de "Últimos movimientos" ('' = todos los tipos)
let movimientosMostrados = 0;        // cuántos movimientos hay en la lista (para pedir los siguientes con "Ver más")

const INTERVALO_ACTUALIZACION = 60000;  // cada 60 segundos se recargan la tabla, los pendientes y "Hecho hoy"
const MOVIMIENTOS_POR_PAGINA = 50;      // cuántos movimientos manda el servidor por vez

// Los 4 estados de un plato: el texto, la clase de color y el orden en la tabla (primero los que faltan)
const ESTADOS_STOCK = {
  sin:        { texto: 'Sin stock',   clase: 'estado-sin',  orden: 0 },   // no quedan libres
  bajo:       { texto: 'Bajo',        clase: 'estado-bajo', orden: 1 },   // menos libres que el mínimo
  bien:       { texto: 'Bien',        clase: 'estado-bien', orden: 2 },   // el mínimo o más
  sincontrol: { texto: 'Sin control', clase: '',            orden: 3 }    // mínimo 0: no se controla
};

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
  if (puedeAdministrar) document.getElementById('btnPedirCocina').style.display = '';           // se muestra "+ Pedir a cocina"

  // 2. El buscador de la tabla: al escribir se vuelve a dibujar desde la página 1
  document.getElementById('filtroNombre').addEventListener('input', () => renderizarTabla(false));

  // 3. Los botones de filtro de "Últimos movimientos": Todos, Producción, Ventas, Devoluciones y Descartes
  const contenedorFiltros = document.getElementById('filtrosMovimientos');   // donde van los botones
  FILTROS_MOVIMIENTOS.forEach(filtro => {                                    // por cada filtro...
    const boton = document.createElement('button');                         // ...un botón
    boton.type = 'button';                                                   // no envía ningún formulario
    boton.className = 'btn-filtro-estado';                                   // el mismo estilo que los filtros de la tabla
    boton.dataset.tipo = filtro.valor;                                       // se guarda su tipo (para marcarlo cuando está elegido)
    boton.textContent = filtro.texto;                                        // el texto del botón
    boton.addEventListener('click', () => {                                  // al tocarlo...
      tipoMovimientos = filtro.valor;                                        // ...se guarda el filtro elegido
      cargarMovimientos(false);                                              // ...y se pide la lista desde el principio
    });
    contenedorFiltros.appendChild(boton);                                    // se agrega a la pantalla
  });
  document.getElementById('btnVerMas').addEventListener('click', () => cargarMovimientos(true));  // "Ver más": los 50 siguientes

  // 4. La ventana "Pedir a cocina": al cambiar "Mostrar" se vuelve a dibujar su lista (está en pedirCocina.js)
  document.getElementById('pPlan').addEventListener('change', renderizarListaPedido);

  // 5. "Descartar" y "Pendientes" se cierran al tocar afuera ("Pedir a cocina" no, para no perder lo escrito)
  window.addEventListener('click', evento => {                                                        // cualquier clic...
    if (evento.target === document.getElementById('modalDescarte')) cerrarVentana('modalDescarte');      // ...en el fondo de "Descartar"
    if (evento.target === document.getElementById('modalPendientes')) cerrarVentana('modalPendientes');  // ...en el fondo de "Pendientes"
  });

  // 6. La primera carga
  cargarPlatos(false);                // la tabla
  cargarMovimientos(false);           // los últimos movimientos
  cargarPendientesCocina(false);      // los pendientes de cocina (y cuántos son, en el botón)
  cargarHechosHoy();                  // "Hecho hoy"

  // 7. Cada 60 segundos se recargan la tabla (en la misma página), los pendientes y "Hecho hoy".
  //    No se recarga si hay una ventana abierta o si se está escribiendo un mínimo (así no se pierde lo escrito).
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
//                  (la usan la tabla, los filtros, la franja "Te faltan…" y la ventana "Pedir a cocina")
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
// Ej: GET /api/viandas-stock → [{ nombre: 'fideos', stock_heladera: 61, reservadas: 10, en_heladera: 71, stock_minimo: 5, ... }]
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
      '<tr><td colspan="8" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarTabla → dibuja todo lo de la tabla de platos
// ENTRADA: mantenerPagina: true para quedarse en la misma página (recarga automática o después de guardar un mínimo)
// SALIDA:  nada (dibuja los botones de estado con cuántos hay, la franja "Te faltan…" y la tabla paginada de a 15)
// Columnas: Plato · Plan · Libres · Reservadas · En heladera · Mínimo · Estado · Descartar
// Ej: 2 platos sin stock y 3 bajos → botones "Sin stock (2)" y "Bajos (3)", y la franja "Te faltan 5 platos: 2 sin stock y 3 bajos"
// ─────────────────────────────────────────────────────────────────────────────
function renderizarTabla(mantenerPagina) {
  // 1. Cuántos platos hay en cada estado. Ej: { sin: 2, bajo: 3, bien: 15, sincontrol: 0 }
  const cuenta = { sin: 0, bajo: 0, bien: 0, sincontrol: 0 };                // arranca todo en 0
  todosPlatos.forEach(plato => {                                             // por cada plato...
    cuenta[estadoDelPlato(plato)] += 1;                                      // ...suma 1 en su estado
  });

  // 2. Los botones de filtro: "Todos (20)", "Sin stock (2)", "Bajos (3)", "Bien (15)" y, si hay, "Sin control (N)"
  const opciones = [                                                         // los botones que siempre están
    { valor: 'todos', texto: 'Todos',     cantidad: todosPlatos.length },
    { valor: 'sin',   texto: 'Sin stock', cantidad: cuenta.sin },
    { valor: 'bajo',  texto: 'Bajos',     cantidad: cuenta.bajo },
    { valor: 'bien',  texto: 'Bien',      cantidad: cuenta.bien }
  ];
  if (cuenta.sincontrol > 0) {                                               // "Sin control" solo si hay alguno
    opciones.push({ valor: 'sincontrol', texto: 'Sin control', cantidad: cuenta.sincontrol });
  }
  // some responde true si AL MENOS UN botón es el del filtro elegido. Ej: elegido 'sincontrol' y ya no hay ninguno → false
  const filtroExiste = opciones.some(opcion => opcion.valor === filtroEstado);
  if (!filtroExiste) filtroEstado = 'todos';                                 // si ya no está (no quedan "Sin control"), vuelve a "Todos"

  const contenedorFiltros = document.getElementById('filtrosEstado');        // donde van los botones
  contenedorFiltros.innerHTML = '';                                          // se borran los de antes
  opciones.forEach(opcion => {                                               // por cada botón...
    const boton = document.createElement('button');                         // ...se crea
    boton.type = 'button';                                                   // no envía ningún formulario
    boton.className = 'btn-filtro-estado';                                   // su estilo
    if (opcion.valor === filtroEstado) boton.classList.add('activo');        // el elegido queda marcado
    boton.textContent = opcion.texto + ' (' + opcion.cantidad + ')';         // ej: "Bajos (3)"
    boton.addEventListener('click', () => {                                  // al tocarlo...
      filtroEstado = opcion.valor;                                           // ...se elige ese filtro
      renderizarTabla(false);                                                // ...y se dibuja desde la página 1
    });
    contenedorFiltros.appendChild(boton);                                    // se agrega a la pantalla
  });

  // 3. La franja "Te faltan 5 platos: 2 sin stock y 3 bajos" (solo para quien puede pedir, y solo si falta algo)
  const aviso = document.getElementById('avisoFaltantes');                   // la franja
  const faltan = cuenta.sin + cuenta.bajo;                                   // los que faltan: sin stock más bajos
  const mostrarAviso = puedeAdministrar && faltan > 0;                       // ¿se muestra la franja?
  const partes = [];                                                         // el texto se arma por partes
  if (cuenta.sin > 0) partes.push(cuenta.sin + ' sin stock');                // "2 sin stock"
  if (cuenta.bajo > 0) partes.push(conPlural(cuenta.bajo, 'bajo', 'bajos'));  // "3 bajos"
  if (mostrarAviso) {                                                        // textContent: se muestra como texto
    document.getElementById('avisoTexto').textContent =
      'Te faltan ' + conPlural(faltan, 'plato', 'platos') + ': ' + partes.join(' y ');  // join une las partes con " y "
  }
  aviso.style.display = mostrarAviso ? '' : 'none';                          // '' = se ve · 'none' = escondida

  // 4. Los platos que se ven: los que coinciden con el buscador y con el filtro de estado
  const texto = document.getElementById('filtroNombre').value.toLowerCase();  // lo escrito en el buscador, en minúsculas
  const visibles = todosPlatos.filter(plato => {                             // filter = arma una lista nueva con los que cumplen
    const coincideNombre = (plato.nombre || '').toLowerCase().includes(texto);  // el nombre tiene lo escrito
    const coincideEstado = filtroEstado === 'todos' || estadoDelPlato(plato) === filtroEstado;  // y el estado es el elegido
    return coincideNombre && coincideEstado;                                 // queda si cumple las dos cosas
  });
  visibles.sort((a, b) => {                                                  // ordenados...
    const porEstado = ESTADOS_STOCK[estadoDelPlato(a)].orden - ESTADOS_STOCK[estadoDelPlato(b)].orden;  // ...por estado (primero los que faltan)
    if (porEstado !== 0) return porEstado;                                   // si tienen estados distintos, ya está
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');             // ...y si es el mismo, por nombre
  });

  // 5. La tabla, de a 15 por página. crearPaginacion (paginacion.js) llama a crearFilaPlato una vez por fila.
  const sigueEnLaPagina = mantenerPagina && paginacionPlatos !== null;       // ¿se queda en la página donde estaba?
  const pagina = sigueEnLaPagina ? paginacionPlatos.paginaActual() : 1;      // si no, arranca en la página 1
  paginacionPlatos = crearPaginacion({
    datos: visibles,                                                         // los platos que se ven
    porPagina: 15,                                                           // de a 15
    contenedorTabla: document.getElementById('heladeraBody'),                // donde van las filas
    contenedorPaginacion: document.getElementById('paginacion'),             // donde van los números de página
    filaVacia: '<tr><td colspan="8" class="loading-text">No se encontraron platos</td></tr>',  // si no hay ninguno
    paginaInicial: pagina,                                                   // en qué página arranca
    funcionRenderFila: crearFilaPlato                                        // cómo se arma la fila de un plato (abajo)
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// crearFilaPlato → arma la fila de un plato para la tabla (la llama crearPaginacion, una vez por fila)
// ENTRADA: plato (uno de todosPlatos)
// SALIDA:  la fila <tr> lista para poner en la tabla, con sus botones andando
// Ej: fideos con 61 libres, 10 reservadas y mínimo 5 → "fideos · Mantenimiento · 61 · 10 · 71 · [5 ✓] · Bien · ✖ Descartar"
//     (el cocinero ve el mínimo como número, sin casillero ni ✓)
// ─────────────────────────────────────────────────────────────────────────────
function crearFilaPlato(plato) {
  // 1. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
  const plan = plato.plan_nombre || '-';                                     // el plan ("-" si no tiene)
  const estado = estadoDelPlato(plato);                                      // su estado
  const datosEstado = ESTADOS_STOCK[estado];                                 // su texto y su color
  const etiquetaColor = '<span class="etiqueta-estado ' + datosEstado.clase + '">' + datosEstado.texto + '</span>';
  const sinControl = estado === 'sincontrol';                                // "Sin control" es un guion gris;
  const etiqueta = sinControl ? '<span class="estado-sincontrol">— Sin control</span>' : etiquetaColor;  // los demás, de color
  const sinLibres = Number(plato.stock_heladera) <= 0;                       // sin libres no se puede descartar
  const descarteApagado = sinLibres ? 'disabled' : '';
  const numeroMinimo = String(Number(plato.stock_minimo));                   // el cocinero solo ve el número...
  const editorMinimo = `
          <div class="minimo-editar">
            <input type="number" class="input-minimo" min="0" max="9999" step="1" value="${Number(plato.stock_minimo)}"
                   aria-label="Mínimo de ${escHtml(plato.nombre)}">
            <button type="button" class="btn-guardar-minimo" title="Guardar el mínimo">✓</button>
          </div>`;                                                           // ...los que administran lo pueden cambiar
  const celdaMinimo = puedeAdministrar ? editorMinimo : numeroMinimo;

  // 2. La fila (lo que viene de la base pasa por escHtml; los números, por Number)
  const fila = document.createElement('tr');
  fila.innerHTML = `
        <td><strong>${escHtml(plato.nombre)}</strong></td>
        <td>${escHtml(plan)}</td>
        <td class="celda-stock">${Number(plato.stock_heladera)}</td>
        <td class="celda-secundaria">${Number(plato.reservadas)}</td>
        <td class="celda-secundaria">${Number(plato.en_heladera)}</td>
        <td>${celdaMinimo}</td>
        <td>${etiqueta}</td>
        <td class="td-acciones">
          <div class="acciones-grupo">
            <button type="button" class="btn-borrar btn-descartar" ${descarteApagado}>✖ Descartar</button>
          </div>
        </td>`;

  // 3. Los botones de la fila
  fila.querySelector('.btn-descartar').addEventListener('click', () => abrirDescarte(plato.id));  // "Descartar"
  if (!puedeAdministrar) return fila;                                        // el cocinero no cambia el mínimo: la fila ya está
  const input = fila.querySelector('.input-minimo');                         // el mínimo se guarda con ✓ o con Enter
  fila.querySelector('.btn-guardar-minimo').addEventListener('click', () => guardarMinimo(plato.id, input));
  input.addEventListener('keydown', evento => {                              // al apretar una tecla en el casillero...
    if (evento.key === 'Enter') guardarMinimo(plato.id, input);              // ...si es Enter, se guarda
  });
  return fila;                                                               // la fila terminada
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
// cargarMovimientos → pide y dibuja "Últimos movimientos" con el filtro de tipo elegido
// ENTRADA: agregar: false = empezar de nuevo (al abrir o al cambiar de filtro) · true = "Ver más" (agrega los 50 siguientes)
// SALIDA:  nada (dibuja los renglones, marca el filtro elegido y muestra "Ver más" solo si puede haber más)
// Ej: filtro "Ventas" → GET /api/movimientos-viandas?desde=0&tipo=venta →
//     "−10 fideos" / "Venta · 15/10 18:40 · Consumidor Final" / "Pedido #251"
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

    // 3. Si se empieza de nuevo, se borra la lista (y si no vino nada, se avisa)
    const textoVacio = tipoMovimientos ? 'No hay movimientos de este tipo' : 'Todavía no hay movimientos';  // con filtro · sin filtro
    const nadaParaMostrar = !agregar && movimientos.length === 0;                    // empezó de nuevo y no vino ninguno
    if (!agregar) lista.innerHTML = '';                                              // se borra lo de antes
    if (nadaParaMostrar) lista.innerHTML = `<li class="mov-vacio">${textoVacio}</li>`;

    // 4. Un renglón por movimiento: cantidad con signo y plato; abajo tipo · fecha · quién; y el motivo, si hay
    movimientos.forEach(movimiento => {
      const cantidad = Number(movimiento.cantidad);                                  // + entran, − salen
      const esEntrada = cantidad > 0;                                                // positiva: entra
      const textoCantidad = esEntrada ? '+' + cantidad : String(cantidad);           // positiva con "+" (verde); negativa tal cual (rojo)
      const claseCantidad = esEntrada ? 'entrada' : 'salida';
      const tipo = NOMBRES_TIPO[movimiento.tipo] || movimiento.tipo;                 // bien escrito ("Venta"), o como viene
      const cuando = fechaYHoraCortas(movimiento.fecha);                             // { dia: '15/10', hora: '18:40' } o null
      const fecha = cuando ? cuando.dia + ' ' + cuando.hora : '-';                   // "15/10 18:40" (sin fecha: "-")
      const detalle = tipo + ' · ' + fecha + ' · ' + movimiento.usuario_nombre;      // "Venta · 15/10 18:40 · Consumidor Final"
      const htmlMotivo = movimiento.motivo ? '<div class="mov-motivo">' + escHtml(movimiento.motivo) + '</div>' : '';  // solo si tiene

      const renglon = document.createElement('li');                                 // el renglón
      renglon.className = 'mov-item';
      renglon.innerHTML = `
        <div class="mov-linea">
          <span class="mov-cantidad ${claseCantidad}">${escHtml(textoCantidad)}</span>
          <span class="mov-plato">${escHtml(movimiento.plato_nombre)}</span>
        </div>
        <div class="mov-detalle">${escHtml(detalle)}</div>
        ${htmlMotivo}`;
      lista.appendChild(renglon);                                                    // se agrega al final
    });

    // 5. "Ver más": si llegaron 50, puede haber más; si llegaron menos, ya no
    movimientosMostrados = movimientosMostrados + movimientos.length;                // ya se muestran estos
    botonVerMas.hidden = movimientos.length < MOVIMIENTOS_POR_PAGINA;                // hidden = escondido
  } catch (error) {                                                                  // si no se pudo...
    console.error('No se pudieron cargar los movimientos:', error);                  // ...el detalle a la consola
    if (agregar) {                                                                   // ...si era "Ver más", un aviso
      mostrarToast('No se pudieron cargar más movimientos.', 'error');               //    (la lista queda como estaba)
      return;
    }
    lista.innerHTML = '<li class="mov-vacio" style="color:red;">Error al cargar los movimientos</li>';  // ...si no, en la lista
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarHechosHoy → pide y dibuja "Hecho hoy" (debajo de la tabla)
// ENTRADA: nada
// SALIDA:  nada (un renglón por plato que la cocina marcó hecho hoy, del más nuevo al más viejo)
// Ej: GET /api/ordenes-produccion/hechos-hoy → "09:03 · 20 · Plato de prueba (MANTENIMIENTO) · Marta Garcia"
// ─────────────────────────────────────────────────────────────────────────────
async function cargarHechosHoy() {
  const lista = document.getElementById('listaHechoHoy');                            // la lista
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/hechos-hoy');          // se pide
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);                  // si el servidor dio error, va al catch
    const hechos = await respuesta.json();                                           // lo hecho hoy

    if (hechos.length === 0) {                                                       // si no hay nada...
      lista.innerHTML = '<li class="mov-vacio">Todavía no se marcó nada hoy.</li>';
      return;
    }

    let html = '';                                                                   // se arman los renglones
    hechos.forEach(hecho => {                                                        // por cada plato hecho...
      const cuando = fechaYHoraCortas(hecho.fecha_hecho);                            // ...cuándo se marcó (o null)
      const hora = cuando ? cuando.hora : '-';                                       // ...la hora, como "14:32" (sin fecha: "-")
      const plan = hecho.plan ? ' <span class="hh-plan">(' + escHtml(hecho.plan) + ')</span>' : '';  // ...el plan entre paréntesis, si tiene. Ej: " (MANTENIMIENTO)"
      const quien = hecho.marcado_por || '';                                         // ...quién lo marcó, si se sabe
      html += `
        <li>
          <span class="hh-hora">${escHtml(hora)}</span>
          <span class="hh-cantidad">${Number(hecho.cantidad)}</span>
          <span class="hh-plato">${escHtml(hecho.plato)}${plan}</span>
          <span class="hh-quien">${escHtml(quien)}</span>
        </li>`;
    });
    lista.innerHTML = html;                                                          // se muestran todos juntos
  } catch (error) {                                                                  // si no se pudo...
    console.error('No se pudo cargar lo hecho hoy:', error);                         // ...el detalle a la consola
    lista.innerHTML = '<li class="mov-vacio" style="color:red;">Error al cargar lo hecho hoy</li>';
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
// Ej: 3 platos pendientes → el botón dice "Pendientes de cocina (3)"
// Después de marcar un plato "Hecho" se recargan los pendientes, la tabla (en la misma página) y "Hecho hoy".
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPendientesCocina(abrirVentana) {
  if (abrirVentana) document.getElementById('modalPendientes').style.display = 'block';  // primero se abre (se ve "Cargando…")

  const opciones = {                                                                 // lo que necesita pedidosCocina.js:
    conBotonHecho: true,                                                             // ...cada plato con su botón "Hecho"
    recargar: () => Promise.all([cargarPendientesCocina(false), cargarPlatos(true), cargarHechosHoy()])  // ...qué recargar después (Promise.all = espera las tres)
  };
  const pendientes = await cargarPendientes('listaPendientes', opciones);           // la lista (o null si no se pudo cargar)

  const cuantos = pendientes ? ' (' + pendientes.length + ')' : '';                 // si se cargó, cuántos hay; si no, sin número
  document.getElementById('btnPendientes').textContent = 'Pendientes de cocina' + cuantos;  // el botón de la cabecera
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirDescarte → abre la ventana "Descartar viandas" para un plato
// ENTRADA: idProducto (el plato de la fila)
// SALIDA:  nada (llena la ventana con el plato, sus libres y sus reservadas, y la abre limpia)
// Ej: fideos con 61 libres y 10 reservadas → "fideos — libres: 61 (las 10 reservadas no se pueden descartar)"
// ─────────────────────────────────────────────────────────────────────────────
function abrirDescarte(idProducto) {
  const plato = todosPlatos.find(p => p.id === idProducto);           // find = el plato con ese número (o undefined)
  if (!plato) return;                                                  // si no está, no hace nada

  platoDescarte = plato;                                               // el plato que se descarta
  const tieneReservadas = Number(plato.reservadas) > 0;                // si tiene reservadas, se aclara
  const aclaracion = tieneReservadas ? ' (las ' + Number(plato.reservadas) + ' reservadas no se pueden descartar)' : '';
  const info = plato.nombre + ' — libres: ' + Number(plato.stock_heladera) + aclaracion;  // el texto de arriba
  document.getElementById('dInfo').textContent = info;                 // textContent: el nombre se muestra como texto
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
    { estaMal: cantidad > Number(platoDescarte.stock_heladera), mensaje: 'No podés descartar más viandas de las libres.' },
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
    mostrarToast('Descarte registrado. Libres: ' + datos.stock_heladera + '.', 'exito');  // se avisa cuántas quedaron libres
    await Promise.all([cargarPlatos(true), cargarMovimientos(false)]); // se recargan la tabla y los movimientos
  } catch (error) {                                                    // si no hubo respuesta...
    console.error('No se pudo registrar el descarte:', error);         // ...el detalle a la consola
    errorVentana.textContent = 'No se pudo conectar con el servidor.'; // ...y un mensaje simple
    errorVentana.style.display = 'block';
    boton.disabled = false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// cerrarVentana → cierra una ventana (modal) de la pantalla
// ENTRADA: idVentana: 'modalPedido', 'modalPendientes' o 'modalDescarte'
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
