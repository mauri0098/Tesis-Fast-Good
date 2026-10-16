// ============================================================================
// heladera.js — Pantalla Producción (pages/heladera.html)
//
// Funciones:
//   iniciarProduccion      → al abrir la pantalla: engancha botones y filtros, hace la primera carga y recarga cada 60 s
//   estadoDelPlato         → la regla única del estado de un plato: sin stock / bajo / bien / sin control
//   cargarPlatos           → pide los platos (GET /api/viandas-stock) y dibuja la tabla
//   renderizarTabla        → dibuja los botones de estado, la franja "Te faltan…" y la tabla (filtrada, ordenada y paginada)
//   guardarMinimo          → manda el mínimo nuevo de un plato (PUT /api/viandas-stock/:id/minimo) y redibuja
//   cargarMovimientos      → pide y dibuja "Últimos movimientos" con el filtro de tipo; "Ver más" agrega 50 más
//   cargarHechosHoy        → pide y dibuja "Hecho hoy"
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
    let hayVentanaAbierta = false;                                             // ¿hay alguna ventana abierta?
    document.querySelectorAll('.modal').forEach(ventana => {                   // por cada ventana de la pantalla...
      if (ventana.style.display === 'block') hayVentanaAbierta = true;         // ...si se ve, hay una abierta
    });
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
// Ej: fideos con 61 libres y 10 reservadas → "fideos · Mantenimiento · 61 · 10 · 71 · [5 ✓] · Bien · ✖ Descartar"
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
  let filtroExiste = false;                                                  // ¿el filtro elegido está entre los botones?
  opciones.forEach(opcion => {                                               // por cada botón...
    if (opcion.valor === filtroEstado) filtroExiste = true;                  // ...si es el elegido, existe
  });
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
  if (!puedeAdministrar || faltan === 0) {                                   // si no puede pedir o no falta nada...
    aviso.style.display = 'none';                                            // ...no se muestra
  } else {                                                                   // si falta algo...
    const partes = [];                                                       // ...se arma el texto por partes
    if (cuenta.sin > 0) partes.push(cuenta.sin + ' sin stock');              // "2 sin stock"
    if (cuenta.bajo > 0) partes.push(conPlural(cuenta.bajo, 'bajo', 'bajos'));  // "3 bajos"
    document.getElementById('avisoTexto').textContent =                      // textContent: se muestra como texto
      'Te faltan ' + conPlural(faltan, 'plato', 'platos') + ': ' + partes.join(' y ');  // join une las partes con " y "
    aviso.style.display = '';                                                // se muestra
  }

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

  // 5. La tabla, de a 15 por página. crearPaginacion (paginacion.js) llama a funcionRenderFila una vez por fila.
  let pagina = 1;                                                            // arranca en la página 1...
  if (mantenerPagina && paginacionPlatos) pagina = paginacionPlatos.paginaActual();  // ...o se queda donde estaba
  paginacionPlatos = crearPaginacion({
    datos: visibles,                                                         // los platos que se ven
    porPagina: 15,                                                           // de a 15
    contenedorTabla: document.getElementById('heladeraBody'),                // donde van las filas
    contenedorPaginacion: document.getElementById('paginacion'),             // donde van los números de página
    filaVacia: '<tr><td colspan="8" class="loading-text">No se encontraron platos</td></tr>',  // si no hay ninguno
    paginaInicial: pagina,                                                   // en qué página arranca
    funcionRenderFila: plato => {                                            // cómo se arma la fila de un plato:
      // a. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
      let plan = '-';                                                        // el plan ("-" si no tiene)
      if (plato.plan_nombre) plan = plato.plan_nombre;
      const estado = estadoDelPlato(plato);                                  // su estado
      let etiqueta = '<span class="estado-sincontrol">— Sin control</span>';  // "Sin control" es un guion gris...
      if (estado !== 'sincontrol') {                                         // ...los demás, una etiqueta de color
        etiqueta = `<span class="etiqueta-estado ${ESTADOS_STOCK[estado].clase}">${ESTADOS_STOCK[estado].texto}</span>`;
      }
      let descarteApagado = '';                                              // sin libres no se puede descartar
      if (Number(plato.stock_heladera) <= 0) descarteApagado = 'disabled';
      let celdaMinimo = String(Number(plato.stock_minimo));                  // el cocinero solo ve el número...
      if (puedeAdministrar) {                                                // ...los que administran lo pueden cambiar
        celdaMinimo = `
          <div class="minimo-editar">
            <input type="number" class="input-minimo" min="0" max="9999" step="1" value="${Number(plato.stock_minimo)}"
                   aria-label="Mínimo de ${escHtml(plato.nombre)}">
            <button type="button" class="btn-guardar-minimo" title="Guardar el mínimo">✓</button>
          </div>`;
      }

      // b. La fila (lo que viene de la base pasa por escHtml; los números, por Number)
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

      // c. Los botones de la fila
      fila.querySelector('.btn-descartar').addEventListener('click', () => abrirDescarte(plato.id));  // "Descartar"
      if (puedeAdministrar) {                                                // el mínimo: con ✓ o con Enter
        const input = fila.querySelector('.input-minimo');                   // el casillero del mínimo
        fila.querySelector('.btn-guardar-minimo').addEventListener('click', () => guardarMinimo(plato.id, input));
        input.addEventListener('keydown', evento => {                        // al apretar una tecla en el casillero...
          if (evento.key === 'Enter') guardarMinimo(plato.id, input);        // ...si es Enter, se guarda
        });
      }
      return fila;                                                           // la fila terminada
    }
  });
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
  if (texto === '' || !Number.isInteger(minimo) || minimo < 0 || minimo > 9999) {  // vacío, con decimales, negativo o muy grande
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
      let mensaje = 'No se pudo guardar el mínimo.';           // ...un mensaje por si no mandó ninguno
      if (datos.error) mensaje = datos.error;                  // ...o el del servidor
      mostrarToast(mensaje, 'error');                          // ...se avisa
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
    if (!agregar) {
      lista.innerHTML = '';                                                          // se borra lo de antes
      if (movimientos.length === 0) {                                                // si no hay ninguno...
        let textoVacio = 'Todavía no hay movimientos';                               // ...sin filtro
        if (tipoMovimientos) textoVacio = 'No hay movimientos de este tipo';         // ...con filtro
        lista.innerHTML = `<li class="mov-vacio">${textoVacio}</li>`;
      }
    }

    // 4. Un renglón por movimiento: cantidad con signo y plato; abajo tipo · fecha · quién; y el motivo, si hay
    movimientos.forEach(movimiento => {
      const cantidad = Number(movimiento.cantidad);                                  // + entran, − salen
      let textoCantidad = String(cantidad);                                          // negativa: tal cual (en rojo)...
      let claseCantidad = 'salida';
      if (cantidad > 0) {                                                            // ...positiva: con "+" (en verde)
        textoCantidad = '+' + cantidad;
        claseCantidad = 'entrada';
      }
      let tipo = movimiento.tipo;                                                    // el tipo como viene...
      if (NOMBRES_TIPO[movimiento.tipo]) tipo = NOMBRES_TIPO[movimiento.tipo];       // ...o bien escrito: "Venta"
      let fecha = '-';                                                               // la fecha, como "15/10 18:40"
      if (movimiento.fecha) {
        const momento = fechaDeTimestamp(movimiento.fecha);                          // de la base (UTC) a la hora de la computadora
        const dia = String(momento.getDate()).padStart(2, '0');                      // padStart: completa con ceros. Ej: '7' → '07'
        const mes = String(momento.getMonth() + 1).padStart(2, '0');                 // los meses van de 0 a 11
        const hora = String(momento.getHours()).padStart(2, '0');
        const minuto = String(momento.getMinutes()).padStart(2, '0');
        fecha = dia + '/' + mes + ' ' + hora + ':' + minuto;
      }
      const detalle = tipo + ' · ' + fecha + ' · ' + movimiento.usuario_nombre;      // "Venta · 15/10 18:40 · Consumidor Final"
      let htmlMotivo = '';                                                           // el motivo, solo si tiene
      if (movimiento.motivo) htmlMotivo = `<div class="mov-motivo">${escHtml(movimiento.motivo)}</div>`;

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
      mostrarToast('No se pudieron cargar más movimientos.', 'error');
    } else {                                                                         // ...si no, en la lista
      lista.innerHTML = '<li class="mov-vacio" style="color:red;">Error al cargar los movimientos</li>';
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarHechosHoy → pide y dibuja "Hecho hoy" (debajo de la tabla)
// ENTRADA: nada
// SALIDA:  nada (un renglón por plato que la cocina marcó hecho hoy, del más nuevo al más viejo)
// Ej: GET /api/ordenes-produccion/hechos-hoy → "14:32 · 2 · fideos · Mantenimiento · Ana López"
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
      let hora = '-';                                                                // ...la hora, como "14:32"
      if (hecho.fecha_hecho) {
        const momento = fechaDeTimestamp(hecho.fecha_hecho);                         // de la base a la hora de la computadora
        hora = String(momento.getHours()).padStart(2, '0') + ':' + String(momento.getMinutes()).padStart(2, '0');
      }
      let plan = '';                                                                 // ...el plan, si tiene
      if (hecho.plan) plan = ` <span class="hh-plan">· ${escHtml(hecho.plan)}</span>`;
      let quien = '';                                                                // ...quién lo marcó, si se sabe
      if (hecho.marcado_por) quien = hecho.marcado_por;
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

  const boton = document.getElementById('btnPendientes');                            // el botón de la cabecera
  if (pendientes) {                                                                  // si se cargó...
    boton.textContent = 'Pendientes de cocina (' + pendientes.length + ')';          // ...con cuántos hay
  } else {                                                                           // si no...
    boton.textContent = 'Pendientes de cocina';                                      // ...sin número
  }
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
  let info = plato.nombre + ' — libres: ' + Number(plato.stock_heladera);  // el texto de arriba...
  if (Number(plato.reservadas) > 0) {                                  // ...y si tiene reservadas, se aclara
    info += ' (las ' + Number(plato.reservadas) + ' reservadas no se pueden descartar)';
  }
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

  // 1. Controles en la pantalla (el servidor y la base los vuelven a hacer)
  let error = '';                                                      // el primer problema (vacío = ninguno)
  if (textoCantidad === '' || !Number.isInteger(cantidad) || cantidad <= 0) {
    error = 'La cantidad tiene que ser un número entero mayor a 0.';
  } else if (cantidad > Number(platoDescarte.stock_heladera)) {
    error = 'No podés descartar más viandas de las libres.';
  } else if (!motivo) {
    error = 'Escribí el motivo del descarte.';
  }
  if (error) {                                                         // si hay un problema...
    errorVentana.textContent = error;                                  // ...se muestra
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
      let mensaje = 'No se pudo registrar el descarte.';               // ...un mensaje por si no vino ninguno
      if (datos.error) mensaje = datos.error;                          // ...o el del servidor
      errorVentana.textContent = mensaje;                              // ...se muestra en la ventana
      errorVentana.style.display = 'block';
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
// ─────────────────────────────────────────────────────────────────────────────
function cerrarVentana(idVentana) {
  document.getElementById(idVentana).style.display = 'none';           // se esconde
  if (idVentana === 'modalDescarte') platoDescarte = null;             // ya no hay plato para descartar
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarToast → un aviso flotante que se va solo a los 3,5 segundos (el mismo de stock.js)
// ENTRADA: mensaje (el texto) y tipo: 'exito' (verde) o 'error' (rojo)
// SALIDA:  nada (lo muestra y lo saca solo)
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
