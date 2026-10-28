// ============================================================================
// pedirCocina.js — Ventana "Pedir a cocina" de la pantalla Producción (pages/heladera.html)
//
// Funciones:
//   abrirPedirACocina        → abre la ventana: fecha (mañana), el aviso de los que faltan, el filtro de plan y la lista limpia
//                              (si se le pasa un plato, abre con ese plato ya buscado)
//   platosDelFiltro          → los platos que se ven con el plan, las pestañas y lo buscado, ya ordenados
//   renderizarPestanasPedido → dibuja las pestañas Todos / Sin stock / Bajos / Bien (se pueden elegir varias)
//   renderizarListaPedido    → dibuja la tabla de platos con −, casillero y + (y el total)
//   alCambiarCantidad        → lo que pasa al escribir o tocar − / + en un plato: guarda, pinta el renglón y actualiza el total
//   leerCantidadPedida       → lo escrito para un plato: 0 si está vacío, el número, o null si es inválido
//   actualizarTotalPedido    → "Tu pedido" (lo pedido, para cuándo y el total) y si se puede enviar
//   cargaRapida              → "A cada uno", "Repartir" o "Limpiar" sobre los platos que se ven
//   enviarPedidoACocina      → manda el pedido (POST /api/ordenes-produccion)
//
// Usa de heladera.js: todosPlatos, estadoDelPlato, ESTADOS_STOCK, CANTIDAD_COLORES_PLAN, cerrarVentana, mostrarToast
// y cargarPendientesCocina. Usa de pedidosCocina.js: conPlural. De fechas.js: fechaLocalISO.
// Lo escrito en cada plato se guarda en cantidadesPedido: así no se pierde al cambiar el filtro.
// Acá no se calculan insumos: los gasta la cocina cuando toca "Hecho".
// ============================================================================

let cantidadesPedido = {};   // lo escrito en cada plato, tal como se escribió: { id_producto: '3' }
let estadosPedido = [];      // las pestañas elegidas: ej ['sin', 'bajo']. [] = "Todos"

// Las pestañas de estado de la ventana (además de "Todos")
const PESTANAS_PEDIDO = [
  { valor: 'sin',  texto: 'Sin stock' },
  { valor: 'bajo', texto: 'Bajos' },
  { valor: 'bien', texto: 'Bien' }
];

// Los días de la semana, para "Para el miércoles 28/10" (getDay() da 0 para el domingo)
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];


// ─────────────────────────────────────────────────────────────────────────────
// abrirPedirACocina → abre la ventana "Pedir a cocina"
// ENTRADA: nombrePlato (opcional): el plato del menú ⋯ de una fila. Sin nada ("+ Pedir a cocina" y la ventana
//          Pendientes) abre con todos los platos
// SALIDA:  nada (pone la fecha de mañana, el aviso de los que faltan, arma el filtro de plan,
//          elige las pestañas, borra lo escrito antes y dibuja la lista)
// Ej: con 2 platos sin stock y 3 bajos → "5 platos están abajo del mínimo" y arranca con "Sin stock" y "Bajos" elegidas
//     abrirPedirACocina('fideos') → arranca en "Todos" con "fideos" escrito en Buscar
// ─────────────────────────────────────────────────────────────────────────────
function abrirPedirACocina(nombrePlato) {
  const platoBuscado = nombrePlato || '';                                           // '' = sin plato elegido

  // 1. Para cuándo: arranca en mañana y no deja elegir días pasados
  const hoy = new Date();                                                           // hoy, en la computadora
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);    // mañana
  const inputFecha = document.getElementById('pFecha');                             // el casillero de la fecha
  inputFecha.min = fechaLocalISO(hoy);                                              // no deja elegir antes de hoy
  inputFecha.value = fechaLocalISO(manana);                                         // arranca en mañana

  // 2. Cuántos platos faltan, con la misma regla de la tabla (los "sin mínimo" no cuentan).
  //    filter arma una lista con los que cumplen y length dice cuántos son. Ej: [fideos (sin), tarta (bien)] → 1 sin stock
  const sinStock = todosPlatos.filter(plato => estadoDelPlato(plato) === 'sin').length;   // cuántos sin stock
  const bajos = todosPlatos.filter(plato => estadoDelPlato(plato) === 'bajo').length;     // cuántos bajos
  const faltan = sinStock + bajos;                                                  // los que faltan

  // 3. El aviso de arriba: "5 platos están abajo del mínimo" (si no falta nada, no se ve).
  //    conPlural da un número y una palabra nuestra: no hace falta escHtml
  const aviso = document.getElementById('pAviso');
  aviso.innerHTML = '<span class="icono-aviso"><svg aria-hidden="true"><use href="#icono-alerta"></use></svg></span>'
    + '<span><strong>' + conPlural(faltan, 'plato', 'platos') + '</strong> están abajo del mínimo</span>';
  aviso.hidden = faltan === 0;

  // 4. Los planes activos que tienen platos activos, sin repetir: { id_plan: { id, nombre } }
  const planesPorId = {};                                                           // arranca vacío
  todosPlatos.forEach(plato => {                                                    // por cada plato...
    if (!plato.id_plan) return;                                                     // sin plan: saltear (return = seguir con el siguiente)
    if (!plato.plan_activo) return;                                                 // plan desactivado: saltear
    if (planesPorId[plato.id_plan]) return;                                         // plan ya anotado: saltear
    const nombre = plato.plan_nombre || 'Plan ' + plato.id_plan;                    // su nombre (o "Plan 3" si no tiene)
    planesPorId[plato.id_plan] = { id: plato.id_plan, nombre: nombre };             // se anota
  });
  const planes = Object.values(planesPorId);                                        // Object.values = lo que hay adentro. Ej: { 3: {…}, 5: {…} } → [{…}, {…}]
  planes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));                    // por nombre

  // 5. El filtro "Plan": "Todos los planes" y cada plan
  const select = document.getElementById('pPlan');                                  // el desplegable
  select.innerHTML = '';                                                            // se borran las opciones de antes
  const opciones = [{ valor: '', texto: 'Todos los planes' }];                      // la primera: todos
  planes.forEach(plan => {                                                          // después, cada plan
    opciones.push({ valor: String(plan.id), texto: plan.nombre });
  });
  opciones.forEach(opcion => {                                                      // por cada opción...
    const option = document.createElement('option');                               // ...una opción del desplegable
    option.value = opcion.valor;                                                    // su valor
    option.textContent = opcion.texto;                                              // su texto (textContent: el nombre del plan no se interpreta como HTML)
    select.appendChild(option);
  });
  select.value = '';                                                                // arranca en "Todos los planes"

  // 6. Las pestañas: arranca con "Sin stock" y "Bajos" si falta algo (lo que antes era "Los que faltan"); si no, "Todos".
  //    Si se eligió un plato, arranca en "Todos" (así se ve ese plato, esté como esté)
  const arrancaConFaltantes = faltan > 0 && !platoBuscado;
  estadosPedido = arrancaConFaltantes ? ['sin', 'bajo'] : [];

  // 7. Todo limpio, se dibuja y se abre
  document.getElementById('pBuscar').value = platoBuscado;                          // "Buscar": el plato elegido (o vacío)
  document.getElementById('pRapidoCantidad').value = '';                            // "Cargar rápido" vacío
  document.getElementById('pError').style.display = 'none';                         // sin error
  cantidadesPedido = {};                                                            // nada escrito
  renderizarListaPedido();                                                          // la lista (y las pestañas y el total)
  document.getElementById('modalPedido').style.display = 'block';                   // se abre la ventana
}


// ─────────────────────────────────────────────────────────────────────────────
// platosDelFiltro → los platos que se ven en la ventana, ya ordenados
// ENTRADA: nada (lee el plan elegido, las pestañas elegidas, lo buscado y todosPlatos)
// SALIDA:  una lista nueva de platos (todosPlatos no se toca). Orden: por estado (Sin stock, Bajo, Bien, Sin mínimo),
//          después por plan (los sin plan al final) y por nombre
// Ej: pestañas "Sin stock" + "Bajos" con fideos (bajo) y canelones (sin stock) → [canelones, fideos]
// La usan renderizarListaPedido (para dibujar) y cargaRapida (para cargar solo los que se ven).
// ─────────────────────────────────────────────────────────────────────────────
function platosDelFiltro() {
  const planElegido = document.getElementById('pPlan').value;                       // '' = todos los planes
  const textoBuscado = document.getElementById('pBuscar').value.trim().toLowerCase();  // lo escrito en "Buscar"
  const platos = todosPlatos.filter(plato => {                                      // filter = arma una lista nueva con los que cumplen
    const coincidePlan = planElegido === '' || plato.id_plan === Number(planElegido);       // es del plan elegido
    const coincideEstado = estadosPedido.length === 0 || estadosPedido.includes(estadoDelPlato(plato));  // su estado está elegido
    const coincideNombre = (plato.nombre || '').toLowerCase().includes(textoBuscado);       // tiene lo buscado
    return coincidePlan && coincideEstado && coincideNombre;                        // queda si cumple las tres cosas
  });
  platos.sort((a, b) => {                                                           // se ordenan...
    const porEstado = ESTADOS_STOCK[estadoDelPlato(a)].orden - ESTADOS_STOCK[estadoDelPlato(b)].orden;  // ...por estado
    if (porEstado !== 0) return porEstado;
    const planA = a.plan_nombre || '';                                              // ...por plan
    const planB = b.plan_nombre || '';
    if (planA === planB) return (a.nombre || '').localeCompare(b.nombre || '', 'es');  // mismo plan: por nombre
    if (!planA) return 1;                                                           // sin plan, al final
    if (!planB) return -1;
    return planA.localeCompare(planB, 'es');                                        // planes distintos: por plan
  });
  return platos;
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarPestanasPedido → dibuja las pestañas de la ventana: Todos, Sin stock, Bajos y Bien, con cuántos hay
// ENTRADA: nada (usa todosPlatos y estadosPedido)
// SALIDA:  nada (dibuja las pestañas; las elegidas quedan verdes. Al tocar una se elige o se saca, y "Todos" saca todas)
// Ej: elegidas "Sin stock" y "Bajos"; toca "Bajos" → queda solo "Sin stock"; toca "Sin stock" → queda "Todos"
// ─────────────────────────────────────────────────────────────────────────────
function renderizarPestanasPedido() {
  // 1. Cuántos platos hay en cada estado. Ej: { sin: 1, bajo: 2, bien: 1, sincontrol: 1 }
  const cuenta = { sin: 0, bajo: 0, bien: 0, sincontrol: 0 };
  todosPlatos.forEach(plato => {
    cuenta[estadoDelPlato(plato)] += 1;
  });

  // 2. "Todos" primero y después las de cada estado
  const pestanas = [{ valor: 'todos', texto: 'Todos', cantidad: todosPlatos.length, elegida: estadosPedido.length === 0 }];
  PESTANAS_PEDIDO.forEach(pestana => {
    pestanas.push({ valor: pestana.valor, texto: pestana.texto, cantidad: cuenta[pestana.valor], elegida: estadosPedido.includes(pestana.valor) });
  });

  const contenedor = document.getElementById('pPestanas');                          // donde van las pestañas
  contenedor.innerHTML = '';                                                        // se borran las de antes
  pestanas.forEach(pestana => {                                                     // por cada pestaña...
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'pestana-pedido pestana-estado pestana-' + pestana.valor;      // el estilo del molde (global.css). Ej: "pestana-bajo"
    if (pestana.elegida) boton.classList.add('activo');                             // la elegida, con fondo gris
    boton.setAttribute('aria-pressed', String(pestana.elegida));                    // para los lectores de pantalla
    // El puntito de color va en todas menos "Todos" (calculado antes: nada de "? :" adentro del HTML)
    const puntito = pestana.valor === 'todos' ? '' : '<span class="punto-pestana"></span>';
    // Los textos son nuestros (de la lista de arriba) y la cantidad es un número: no hace falta escHtml
    boton.innerHTML = `${puntito}${pestana.texto}<span class="cantidad-pestana">${Number(pestana.cantidad)}</span>`;
    boton.addEventListener('click', () => {                                         // al tocarla...
      const esTodos = pestana.valor === 'todos';
      estadosPedido = estadosPedido.filter(valor => valor !== pestana.valor);       // ...si estaba elegida, se saca
      if (!pestana.elegida) estadosPedido.push(pestana.valor);                      // ...si no estaba, se agrega
      if (esTodos) estadosPedido = [];                                              // ..."Todos" saca todas las demás
      renderizarListaPedido();                                                      // ...y se dibuja la lista
    });
    contenedor.appendChild(boton);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarListaPedido → dibuja la tabla de la ventana: una fila por plato con −, casillero y +
// ENTRADA: nada (usa platosDelFiltro y cantidadesPedido)
// SALIDA:  nada (dibuja las pestañas, la tabla y el total). Al escribir o tocar − / + se guarda lo escrito sin redibujar
//          la tabla (así no se pierde el lugar ni el cursor)
// Ej: "fideos [● Bajo]" · "● Mantenimiento" · 3 · 1 · 5 · [−] [ 4 ] [+]
// ─────────────────────────────────────────────────────────────────────────────
function renderizarListaPedido() {
  renderizarPestanasPedido();                                                       // las pestañas (cuáles están elegidas)
  const contenedor = document.getElementById('pPlatos');                            // donde van las filas
  const platos = platosDelFiltro();                                                 // los que se ven
  contenedor.innerHTML = '';                                                        // se borra lo de antes

  if (platos.length === 0) {                                                        // si no hay ninguno...
    contenedor.innerHTML = `
      <tr class="fila-vacia"><td colspan="6">
        <div class="pedido-vacio">
          <div class="tabla-vacia-titulo">No hay platos para mostrar</div>
          <div class="tabla-vacia-texto">Probá con otro filtro o buscá el plato por otro nombre.</div>
        </div>
      </td></tr>`;
    actualizarTotalPedido();                                                        // ...igual se actualiza el total
    return;
  }

  platos.forEach(plato => {                                                         // por cada plato...
    // a. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
    const estado = estadoDelPlato(plato);
    const datosEstado = ESTADOS_STOCK[estado];                                      // su texto y su color
    const etiquetaReceta = plato.tiene_receta ? '' : '<span class="etiqueta-sin-receta">sin receta</span>';
    const plan = plato.plan_nombre || 'Sin plan';
    const clasePunto = 'punto-plan-' + (Number(plato.id_plan || 0) % CANTIDAD_COLORES_PLAN);  // el color fijo de su plan

    // b. La fila, pintada según su estado
    const fila = document.createElement('tr');
    fila.className = 'plato-pedido fila-' + estado;
    fila.innerHTML = `
      <td class="col-plato">
        <div class="pp-nombre">${escHtml(plato.nombre)}</div>
        <div class="pp-etiquetas"><span class="etiqueta-estado ${datosEstado.clase}"><span class="punto-estado"></span>${datosEstado.texto}</span>${etiquetaReceta}</div>
      </td>
      <td class="col-plan"><span class="plan-con-punto"><span class="punto-plan ${clasePunto}"></span>${escHtml(plan)}</span></td>
      <td class="col-numero col-libres pp-libres">${Number(plato.stock_heladera)}</td>
      <td class="col-numero col-reservadas">${Number(plato.reservadas)}</td>
      <td class="col-numero col-minimo">${Number(plato.stock_minimo)}</td>
      <td class="col-pedir">
        <div class="pp-cantidad">
          <button type="button" class="btn-paso" data-paso="-1" aria-label="Uno menos"><svg aria-hidden="true"><use href="#icono-menos"></use></svg></button>
          <input type="text" inputmode="numeric" placeholder="0" aria-label="Cantidad a pedir de ${escHtml(plato.nombre)}">
          <button type="button" class="btn-paso btn-paso-mas" data-paso="1" aria-label="Uno más"><svg aria-hidden="true"><use href="#icono-mas"></use></svg></button>
        </div>
      </td>`;
    const input = fila.querySelector('input');                                      // el casillero
    input.value = cantidadesPedido[plato.id] || '';                                 // lo que ya tenía escrito (o vacío)

    // c. Al escribir: se guarda, se pinta el renglón y se actualiza el total
    input.addEventListener('input', () => alCambiarCantidad(plato.id, input, fila));

    // d. "−" y "+": suman o restan 1 (nunca bajan de 0; si había algo inválido, arrancan de 0)
    fila.querySelectorAll('.btn-paso').forEach(boton => {
      boton.addEventListener('click', () => {
        const actual = leerCantidadPedida(plato.id) || 0;                           // lo que hay (inválido = null → arranca de 0)
        const sumada = actual + Number(boton.dataset.paso);                         // +1 o −1
        const nueva = sumada < 0 ? 0 : sumada;                                      // nunca menos de 0
        input.value = String(nueva);                                                // se escribe en el casillero
        alCambiarCantidad(plato.id, input, fila);                                   // y se hace lo mismo que al escribir
      });
    });

    // e. Se pinta con lo que ya tenía y se agrega a la tabla
    const cantidadInicial = leerCantidadPedida(plato.id);
    input.classList.toggle('invalido', cantidadInicial === null);
    fila.classList.toggle('con-cantidad', cantidadInicial > 0);
    contenedor.appendChild(fila);
  });

  actualizarTotalPedido();                                                          // "Tu pedido" y el total
}


// ─────────────────────────────────────────────────────────────────────────────
// alCambiarCantidad → lo que pasa al escribir en el casillero de un plato o al tocar − / +
// ENTRADA: idProducto, input (su casillero) y fila (su renglón)
// SALIDA:  nada (guarda lo escrito en cantidadesPedido, pinta el renglón y actualiza el total)
// Ej: escribe "4" en fideos → cantidadesPedido[7] = '4', el renglón en verde suave y "Total: 4 viandas"
//     escribe "2.5" → el casillero en rojo y "Enviar a cocina" apagado
// ─────────────────────────────────────────────────────────────────────────────
function alCambiarCantidad(idProducto, input, fila) {
  cantidadesPedido[idProducto] = input.value;                                       // se guarda tal como está escrito
  const cantidad = leerCantidadPedida(idProducto);                                  // como número (null si es inválido)
  input.classList.toggle('invalido', cantidad === null);                            // rojo si es inválido
  fila.classList.toggle('con-cantidad', cantidad > 0);                              // verde suave si tiene más de 0
  actualizarTotalPedido();                                                          // "Tu pedido" y el total
}


// ─────────────────────────────────────────────────────────────────────────────
// leerCantidadPedida → lo escrito para un plato, como número
// ENTRADA: idProducto
// SALIDA:  0 si está vacío · el número si es un entero mayor o igual a 0 · null si es inválido
// Ej: '' → 0 · '4' → 4 · '2.5' → null · 'abc' → null
// ─────────────────────────────────────────────────────────────────────────────
function leerCantidadPedida(idProducto) {
  const texto = (cantidadesPedido[idProducto] || '').trim();   // lo escrito (vacío si no hay nada)
  if (texto === '') return 0;                                  // vacío = 0
  const cantidad = Number(texto);                              // como número
  if (!Number.isInteger(cantidad) || cantidad < 0) return null;  // con decimales, negativo o no es un número: inválido
  return cantidad;
}


// ─────────────────────────────────────────────────────────────────────────────
// actualizarTotalPedido → "Tu pedido" (lo pedido y para cuándo), el total y si se puede enviar
// ENTRADA: nada (cuenta TODOS los platos, también los que no se ven con el filtro)
// SALIDA:  nada (escribe "Para el miércoles 28/10", la lista de lo pedido con su ✕, "N viandas" y "de M platos",
//          muestra el error si hay algo inválido y prende "Enviar a cocina" solo si hay algo pedido y nada inválido)
// Ej: 4 fideos y 6 canelones → "fideos / 4 viandas", "canelones / 6 viandas" · "10 viandas" · "de 2 platos"
// ─────────────────────────────────────────────────────────────────────────────
function actualizarTotalPedido() {
  let total = 0;                                               // viandas pedidas
  let platos = 0;                                              // en cuántos platos
  let hayInvalida = false;                                     // si algún casillero tiene algo inválido
  let htmlResumen = '';                                        // los renglones de "Tu pedido"
  todosPlatos.forEach(plato => {                               // por cada plato...
    const cantidad = leerCantidadPedida(plato.id);             // ...lo escrito
    if (cantidad === null) {                                   // ...si es inválido, se anota
      hayInvalida = true;
      return;                                                  // (return = saltear este plato y seguir con el siguiente)
    }
    total += cantidad;                                         // ...se suma
    if (cantidad === 0) return;                                // ...sin nada pedido: saltear (no va a "Tu pedido")
    platos += 1;                                               // ...cuenta como plato pedido
    // ...y su renglón: el nombre y abajo "10 viandas" (conPlural: un número y una palabra nuestra)
    htmlResumen += `
      <div class="item-resumen">
        <div class="item-resumen-textos">
          <div class="item-resumen-nombre">${escHtml(plato.nombre)}</div>
          <div class="item-resumen-cantidad">${conPlural(cantidad, 'vianda', 'viandas')}</div>
        </div>
        <button type="button" class="quitar-del-pedido" data-id="${Number(plato.id)}" aria-label="Sacar ${escHtml(plato.nombre)} del pedido"><svg aria-hidden="true"><use href="#icono-cerrar"></use></svg></button>
      </div>`;
  });

  // 1. "Tu pedido": lo pedido (cada uno con su ✕ para sacarlo) o, si no hay nada, cómo empezar
  const vacio = `
    <div class="resumen-vacio">
      <span class="icono-vacio"><svg aria-hidden="true"><use href="#icono-olla"></use></svg></span>
      <span>Sumá platos con el <strong>+</strong> para armar el pedido.</span>
    </div>`;
  const listaResumen = document.getElementById('pResumenLista');
  listaResumen.innerHTML = htmlResumen || vacio;               // || = si no hay renglones, el aviso de vacío
  listaResumen.querySelectorAll('.quitar-del-pedido').forEach(boton => {
    boton.addEventListener('click', () => {                    // al tocar ✕...
      delete cantidadesPedido[Number(boton.dataset.id)];       // ...se borra lo escrito en ese plato
      renderizarListaPedido();                                 // ...y se redibuja (el casillero queda vacío)
    });
  });

  // 2. Para cuándo: '2026-10-28' → "Para el miércoles 28/10" (split parte el texto en los guiones: ['2026', '10', '28']).
  //    new Date(año, mes - 1, día) = ese día en la computadora (los meses van de 0 a 11), para saber qué día de la semana es
  const fecha = document.getElementById('pFecha').value;
  const partes = fecha.split('-');
  const diaElegido = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  const fechaLinda = DIAS_SEMANA[diaElegido.getDay()] + ' ' + partes[2] + '/' + partes[1];   // ej: "miércoles 28/10"
  document.getElementById('pParaCuando').textContent = fecha ? 'Para el ' + fechaLinda : 'Elegí para cuándo';

  // 3. El total: "10 viandas" (el número grande) y "de 2 platos". Solo números y palabras nuestras: sin escHtml
  const palabraViandas = total === 1 ? 'vianda' : 'viandas';
  document.getElementById('pTotal').innerHTML = '<strong class="total-numero">' + total + '</strong> ' + palabraViandas;
  document.getElementById('pTotalPlatos').textContent = 'de ' + conPlural(platos, 'plato', 'platos');

  // 4. El error y el botón
  const errorVentana = document.getElementById('pError');      // el lugar del error
  if (hayInvalida) errorVentana.textContent = 'Hay una cantidad inválida: tiene que ser un número entero mayor o igual a 0.';
  errorVentana.style.display = hayInvalida ? 'block' : 'none'; // con algo inválido se ve; si no, se esconde

  document.getElementById('pEnviar').disabled = total === 0 || hayInvalida;  // apagado si no hay nada o hay algo inválido
}


// ─────────────────────────────────────────────────────────────────────────────
// cargaRapida → "A cada uno", "Repartir" o "Limpiar", solo sobre los platos que se ven con el filtro
// ENTRADA: accion: 'cada' (el número de "Cargar rápido" a cada plato) · 'repartir' (ese número en partes iguales)
//          · 'limpiar' (todos en 0; los que no se ven no se tocan)
// SALIDA:  nada (cambia cantidadesPedido y redibuja la lista; si falta el número, muestra el error)
// Ej: "Repartir" 10 entre 6 platos → 2, 2, 2, 2, 1, 1 (lo que sobra va de a uno a los primeros)
// ─────────────────────────────────────────────────────────────────────────────
function cargaRapida(accion) {
  const visibles = platosDelFiltro();                          // los platos que se ven
  const errorVentana = document.getElementById('pError');      // el lugar del error

  // 1. "Limpiar" no necesita número
  if (accion === 'limpiar') {
    visibles.forEach(plato => {                                // por cada plato que se ve...
      delete cantidadesPedido[plato.id];                       // ...se borra lo escrito
    });
    renderizarListaPedido();
    return;
  }

  // 2. "A cada uno" y "Repartir" necesitan el número de "Cargar rápido": un entero mayor a 0
  const texto = document.getElementById('pRapidoCantidad').value.trim();
  const numero = Number(texto);
  const numeroInvalido = texto === '' || !Number.isInteger(numero) || numero <= 0;
  if (numeroInvalido) {
    errorVentana.textContent = 'Escribí un número entero mayor a 0 en "Cargar rápido".';
    errorVentana.style.display = 'block';
    return;
  }

  // 3. Sin platos no hay a quién repartir
  const repartirSinPlatos = accion === 'repartir' && visibles.length === 0;
  if (repartirSinPlatos) {
    errorVentana.textContent = 'No hay platos para repartir.';
    errorVentana.style.display = 'block';
    return;
  }

  // 4. Se carga cada plato que se ve
  switch (accion) {
    case 'cada':                                               // según sea "A cada uno": el mismo número en cada plato
      visibles.forEach(plato => {
        cantidadesPedido[plato.id] = String(numero);
      });
      break;
    case 'repartir': {                                         // según sea "Repartir": en partes iguales
      const base = Math.floor(numero / visibles.length);       // lo que le toca a cada uno. Ej: 10 entre 6 → 1
      const sobrante = numero % visibles.length;               // lo que sobra (% = el resto de dividir). Ej: 10 % 6 → 4
      visibles.forEach((plato, posicion) => {                  // posicion = 0 para el primero, 1 para el segundo…
        const parte = posicion < sobrante ? base + 1 : base;   // a los primeros, uno más
        cantidadesPedido[plato.id] = String(parte);
      });
      break;
    }
  }

  renderizarListaPedido();                                     // se redibuja con lo nuevo
}


// ─────────────────────────────────────────────────────────────────────────────
// enviarPedidoACocina → manda el pedido a cocina
// ENTRADA: nada (lee la fecha de la ventana y cantidadesPedido)
// SALIDA:  nada (si sale bien: cierra, avisa "Pedido a cocina #N enviado." y recarga los pendientes;
//          si no: muestra el error en la ventana)
// Ej: para el 16/10, 10 fideos → POST /api/ordenes-produccion { fecha_para: '2026-10-16', items: [{ id_producto: 7, cantidad: 10 }] }
// ─────────────────────────────────────────────────────────────────────────────
async function enviarPedidoACocina() {
  const errorVentana = document.getElementById('pError');      // el lugar del error
  const fecha = document.getElementById('pFecha').value;       // para cuándo
  if (!fecha) {                                                // tiene que estar elegida
    errorVentana.textContent = 'Elegí para cuándo es el pedido.';
    errorVentana.style.display = 'block';
    return;
  }

  // Los platos con más de 0, como los espera el servidor: [{ id_producto, cantidad }]
  const items = [];
  todosPlatos.forEach(plato => {                               // por cada plato (también los que no se ven)...
    const cantidad = leerCantidadPedida(plato.id);             // ...lo escrito
    if (cantidad > 0) items.push({ id_producto: plato.id, cantidad: cantidad });  // ...si es más de 0, va
  });

  const boton = document.getElementById('pEnviar');            // el botón "Enviar a cocina"
  boton.disabled = true;                                       // apagado: un doble clic no manda dos pedidos
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion', {
      method: 'POST',                                          // POST = crear algo nuevo
      headers: { 'Content-Type': 'application/json' },         // se manda un JSON
      body: JSON.stringify({ fecha_para: fecha, items: items }) // para cuándo y qué platos
    });
    const datos = await respuesta.json().catch(() => ({}));    // la respuesta (si no es JSON, un objeto vacío)

    if (!respuesta.ok) {                                       // si no se pudo...
      errorVentana.textContent = datos.error || 'No se pudo enviar el pedido a cocina.';  // ...el del servidor (o uno por si no vino)
      errorVentana.style.display = 'block';
      boton.disabled = false;                                  // ...y se puede corregir
      return;
    }

    cerrarVentana('modalPedido');                              // salió bien: se cierra
    mostrarToast('Pedido a cocina #' + datos.id_orden + ' enviado.', 'exito');  // se avisa
    await cargarPendientesCocina(false);                       // y se recargan los pendientes (el número del botón)
  } catch (error) {                                            // si no hubo respuesta...
    console.error('No se pudo enviar el pedido a cocina:', error);
    errorVentana.textContent = 'No se pudo conectar con el servidor.';
    errorVentana.style.display = 'block';
    boton.disabled = false;
  }
}
