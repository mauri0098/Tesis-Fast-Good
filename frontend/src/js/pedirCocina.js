// ============================================================================
// pedirCocina.js — Ventana "Pedir a cocina" de la pantalla Producción (pages/heladera.html)
//
// Funciones:
//   abrirPedirACocina     → abre la ventana: fecha (mañana), el filtro "Mostrar" y la lista limpia
//   platosDelFiltro       → los platos que se ven con el filtro elegido, ya ordenados
//   renderizarListaPedido → dibuja la lista de platos con −, casillero y + (y el total)
//   leerCantidadPedida    → lo escrito para un plato: 0 si está vacío, el número, o null si es inválido
//   actualizarTotalPedido → "Total: N viandas en M platos" y si se puede enviar
//   cargaRapida           → "A cada uno", "Repartir" o "Limpiar" sobre los platos que se ven
//   enviarPedidoACocina   → manda el pedido (POST /api/ordenes-produccion)
//
// Usa de heladera.js: todosPlatos, estadoDelPlato, ESTADOS_STOCK, cerrarVentana, mostrarToast y cargarPendientesCocina.
// Usa de pedidosCocina.js: conPlural. De fechas.js: fechaLocalISO.
// Lo escrito en cada plato se guarda en cantidadesPedido: así no se pierde al cambiar el filtro.
// Acá no se calculan insumos: los gasta la cocina cuando toca "Hecho".
// ============================================================================

let cantidadesPedido = {};   // lo escrito en cada plato, tal como se escribió: { id_producto: '3' }

// Los valores de "Mostrar" que no son un plan
const FILTROS_PEDIDO_SIN_PLAN = ['faltan', 'sin', 'bajo', ''];


// ─────────────────────────────────────────────────────────────────────────────
// abrirPedirACocina → abre la ventana "Pedir a cocina"
// ENTRADA: nada (la llaman "+ Pedir a cocina" y "Pedir los que faltan")
// SALIDA:  nada (pone la fecha de mañana, arma el filtro "Mostrar", borra lo escrito antes y dibuja la lista)
// Ej: con 2 platos sin stock y 3 bajos, "Mostrar" arranca en "Los que faltan (5)"
// ─────────────────────────────────────────────────────────────────────────────
function abrirPedirACocina() {
  // 1. Para cuándo: arranca en mañana y no deja elegir días pasados
  const hoy = new Date();                                                           // hoy, en la computadora
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);    // mañana
  const inputFecha = document.getElementById('pFecha');                             // el casillero de la fecha
  inputFecha.min = fechaLocalISO(hoy);                                              // no deja elegir antes de hoy
  inputFecha.value = fechaLocalISO(manana);                                         // arranca en mañana

  // 2. Cuántos platos faltan, con la misma regla de la tabla (los "sin control" no cuentan)
  let sinStock = 0;                                                                 // cuántos sin stock
  let bajos = 0;                                                                    // cuántos bajos
  todosPlatos.forEach(plato => {                                                    // por cada plato...
    const estado = estadoDelPlato(plato);                                           // ...su estado
    if (estado === 'sin') sinStock += 1;
    if (estado === 'bajo') bajos += 1;
  });
  const faltan = sinStock + bajos;                                                  // los que faltan

  // 3. Los planes activos que tienen platos activos, sin repetir: { id_plan: { id, nombre } }
  const planesPorId = {};                                                           // arranca vacío
  todosPlatos.forEach(plato => {                                                    // por cada plato...
    if (!plato.id_plan || !plato.plan_activo || planesPorId[plato.id_plan]) return; // (return = saltear: sin plan, plan inactivo o ya anotado)
    let nombre = 'Plan ' + plato.id_plan;                                           // si el plan no tiene nombre
    if (plato.plan_nombre) nombre = plato.plan_nombre;                              // su nombre
    planesPorId[plato.id_plan] = { id: plato.id_plan, nombre: nombre };             // se anota
  });
  const planes = Object.values(planesPorId);                                        // Object.values = lo que hay adentro. Ej: { 3: {…}, 5: {…} } → [{…}, {…}]
  planes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));                    // por nombre

  // 4. El filtro "Mostrar": "Los que faltan (N)", "Sin stock (N)", "Bajos (N)", "Todos los planes" y cada plan
  const opciones = [
    { valor: 'faltan', texto: 'Los que faltan (' + faltan + ')' },
    { valor: 'sin',    texto: 'Sin stock (' + sinStock + ')' },
    { valor: 'bajo',   texto: 'Bajos (' + bajos + ')' },
    { valor: '',       texto: 'Todos los planes' }
  ];
  planes.forEach(plan => {                                                          // cada plan, al final
    opciones.push({ valor: String(plan.id), texto: plan.nombre });
  });
  const select = document.getElementById('pPlan');                                  // el desplegable
  select.innerHTML = '';                                                            // se borran las opciones de antes
  opciones.forEach(opcion => {                                                      // por cada opción...
    const option = document.createElement('option');                               // ...una opción del desplegable
    option.value = opcion.valor;                                                    // su valor
    option.textContent = opcion.texto;                                              // su texto (textContent: el nombre del plan no se interpreta como HTML)
    select.appendChild(option);
  });
  select.value = '';                                                                // arranca en "Todos los planes"...
  if (faltan > 0) select.value = 'faltan';                                          // ...o en "Los que faltan", si falta algo

  // 5. Todo limpio, se dibuja y se abre
  document.getElementById('pRapidoCantidad').value = '';                            // "Cargar rápido" vacío
  document.getElementById('pError').style.display = 'none';                         // sin error
  cantidadesPedido = {};                                                            // nada escrito
  renderizarListaPedido();                                                          // la lista
  document.getElementById('modalPedido').style.display = 'block';                   // se abre la ventana
}


// ─────────────────────────────────────────────────────────────────────────────
// platosDelFiltro → los platos que se ven con el filtro elegido en "Mostrar", ya ordenados
// ENTRADA: nada (lee el filtro elegido y todosPlatos)
// SALIDA:  una lista nueva de platos (todosPlatos no se toca). Orden: por estado (Sin stock, Bajo, Bien, Sin control),
//          después por plan (los sin plan al final) y por nombre
// Ej: "Los que faltan" con fideos (bajo) y canelones (sin stock) → [canelones, fideos]
// La usan renderizarListaPedido (para dibujar) y cargaRapida (para cargar solo los que se ven).
// ─────────────────────────────────────────────────────────────────────────────
function platosDelFiltro() {
  const filtro = document.getElementById('pPlan').value;                            // lo elegido en "Mostrar"
  const platos = todosPlatos.filter(plato => {                                      // filter = arma una lista nueva con los que cumplen
    const estado = estadoDelPlato(plato);                                           // el estado del plato
    if (filtro === 'faltan') return estado === 'sin' || estado === 'bajo';          // "Los que faltan": sin stock o bajos
    if (filtro === 'sin' || filtro === 'bajo') return estado === filtro;            // "Sin stock" o "Bajos": ese estado
    if (filtro === '') return true;                                                 // "Todos los planes": todos
    return plato.id_plan === Number(filtro);                                        // un plan: los de ese plan
  });
  platos.sort((a, b) => {                                                           // se ordenan...
    const porEstado = ESTADOS_STOCK[estadoDelPlato(a)].orden - ESTADOS_STOCK[estadoDelPlato(b)].orden;  // ...por estado
    if (porEstado !== 0) return porEstado;
    const planA = a.plan_nombre || '';                                              // ...por plan
    const planB = b.plan_nombre || '';
    if (planA !== planB) {
      if (!planA) return 1;                                                         // sin plan, al final
      if (!planB) return -1;
      return planA.localeCompare(planB, 'es');
    }
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');                    // ...y por nombre
  });
  return platos;
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarListaPedido → dibuja la lista de la ventana: un renglón por plato con −, casillero y +
// ENTRADA: nada (usa platosDelFiltro y cantidadesPedido)
// SALIDA:  nada (dibuja la lista y el total). Al escribir o tocar − / + se guarda lo escrito sin redibujar la lista
//          (así no se pierde el lugar ni el cursor)
// Ej: "fideos  [Bajo]" / "Libres: 3 · mínimo 5 · Mantenimiento" / [−] [ 4 ] [+]
// ─────────────────────────────────────────────────────────────────────────────
function renderizarListaPedido() {
  const contenedor = document.getElementById('pPlatos');                            // donde va la lista
  const platos = platosDelFiltro();                                                 // los que se ven
  const filtroEsPlan = !FILTROS_PEDIDO_SIN_PLAN.includes(document.getElementById('pPlan').value);  // si se eligió un plan, no se repite en cada renglón
  contenedor.innerHTML = '';                                                        // se borra lo de antes

  if (platos.length === 0) {                                                        // si no hay ninguno...
    contenedor.innerHTML = '<div class="pedido-vacio">No hay platos para este filtro</div>';
    actualizarTotalPedido();                                                        // ...igual se actualiza el total
    return;
  }

  platos.forEach(plato => {                                                         // por cada plato...
    // a. Las etiquetas: el estado solo si falta (Sin stock / Bajo), y "sin receta"
    const estado = estadoDelPlato(plato);
    let etiquetas = '';
    if (estado === 'sin' || estado === 'bajo') {
      etiquetas += `<span class="etiqueta-estado ${ESTADOS_STOCK[estado].clase}">${ESTADOS_STOCK[estado].texto}</span>`;
    }
    if (!plato.tiene_receta) etiquetas += '<span class="etiqueta-sin-receta">sin receta</span>';

    // b. La línea gris: "Libres: 3 · mínimo 5 · Mantenimiento" (el plan solo si el filtro no es un plan)
    let detalle = 'Libres: ' + Number(plato.stock_heladera);
    if (estado === 'sincontrol') {
      detalle += ' · sin control';
    } else {
      detalle += ' · mínimo ' + Number(plato.stock_minimo);
    }
    if (!filtroEsPlan) {
      let plan = 'Sin plan';
      if (plato.plan_nombre) plan = plato.plan_nombre;
      detalle += ' · ' + plan;
    }

    // c. El renglón
    const fila = document.createElement('div');
    fila.className = 'plato-pedido';
    fila.innerHTML = `
      <div class="pp-info">
        <div class="pp-nombre">${escHtml(plato.nombre)}${etiquetas}</div>
        <div class="pp-detalle">${escHtml(detalle)}</div>
      </div>
      <div class="pp-cantidad">
        <button type="button" class="btn-paso" data-paso="-1" aria-label="Uno menos">−</button>
        <input type="text" inputmode="numeric" placeholder="0" aria-label="Cantidad a pedir">
        <button type="button" class="btn-paso" data-paso="1" aria-label="Uno más">+</button>
      </div>`;
    const input = fila.querySelector('input');                                      // el casillero
    input.value = cantidadesPedido[plato.id] || '';                                 // lo que ya tenía escrito (o vacío)

    // d. Guarda lo escrito, pinta el renglón y actualiza el total (lo usan el casillero y los botones − y +)
    const alCambiar = () => {
      cantidadesPedido[plato.id] = input.value;                                     // se guarda tal como está escrito
      const cantidad = leerCantidadPedida(plato.id);                                // como número (null si es inválido)
      input.classList.toggle('invalido', cantidad === null);                        // rojo si es inválido
      fila.classList.toggle('con-cantidad', cantidad > 0);                          // verde suave si tiene más de 0
      actualizarTotalPedido();                                                      // el total de abajo
    };
    input.addEventListener('input', alCambiar);                                     // al escribir

    // e. "−" y "+": suman o restan 1 (nunca bajan de 0; si había algo inválido, arrancan de 0)
    fila.querySelectorAll('.btn-paso').forEach(boton => {
      boton.addEventListener('click', () => {
        let actual = leerCantidadPedida(plato.id);                                  // lo que hay
        if (actual === null) actual = 0;                                            // inválido: arranca de 0
        let nueva = actual + Number(boton.dataset.paso);                            // +1 o −1
        if (nueva < 0) nueva = 0;                                                   // nunca menos de 0
        input.value = String(nueva);                                                // se escribe en el casillero
        alCambiar();                                                                // y se hace lo mismo que al escribir
      });
    });

    // f. Se pinta con lo que ya tenía y se agrega a la lista
    const cantidadInicial = leerCantidadPedida(plato.id);
    input.classList.toggle('invalido', cantidadInicial === null);
    fila.classList.toggle('con-cantidad', cantidadInicial > 0);
    contenedor.appendChild(fila);
  });

  actualizarTotalPedido();                                                          // el total de abajo
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
// actualizarTotalPedido → el total de la ventana y si se puede enviar
// ENTRADA: nada (cuenta TODOS los platos, también los que no se ven con el filtro)
// SALIDA:  nada (escribe "Total: N viandas" y "en M platos", muestra el error si hay algo inválido,
//          y prende "Enviar a cocina" solo si hay algo pedido y nada inválido)
// Ej: 4 fideos y 6 canelones → "Total: 10 viandas" · "en 2 platos"
// ─────────────────────────────────────────────────────────────────────────────
function actualizarTotalPedido() {
  let total = 0;                                               // viandas pedidas
  let platos = 0;                                              // en cuántos platos
  let hayInvalida = false;                                     // si algún casillero tiene algo inválido
  todosPlatos.forEach(plato => {                               // por cada plato...
    const cantidad = leerCantidadPedida(plato.id);             // ...lo escrito
    if (cantidad === null) {                                   // ...si es inválido, se anota
      hayInvalida = true;
      return;                                                  // (return = saltear este plato y seguir con el siguiente)
    }
    total += cantidad;                                         // ...se suma
    if (cantidad > 0) platos += 1;                             // ...y si tiene algo, cuenta como plato pedido
  });

  document.getElementById('pTotal').textContent = 'Total: ' + conPlural(total, 'vianda', 'viandas');
  document.getElementById('pTotalPlatos').textContent = 'en ' + conPlural(platos, 'plato', 'platos');

  const errorVentana = document.getElementById('pError');      // el lugar del error
  if (hayInvalida) {                                           // si hay algo inválido, se avisa
    errorVentana.textContent = 'Hay una cantidad inválida: tiene que ser un número entero mayor o igual a 0.';
    errorVentana.style.display = 'block';
  } else {                                                     // si no, se esconde
    errorVentana.style.display = 'none';
  }

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

  // "Limpiar" no necesita número
  if (accion === 'limpiar') {
    visibles.forEach(plato => {                                // por cada plato que se ve...
      delete cantidadesPedido[plato.id];                       // ...se borra lo escrito
    });
    renderizarListaPedido();
    return;
  }

  // "A cada uno" y "Repartir" necesitan el número de "Cargar rápido": un entero mayor a 0
  const texto = document.getElementById('pRapidoCantidad').value.trim();
  const numero = Number(texto);
  if (texto === '' || !Number.isInteger(numero) || numero <= 0) {
    errorVentana.textContent = 'Escribí un número entero mayor a 0 en "Cargar rápido".';
    errorVentana.style.display = 'block';
    return;
  }

  if (accion === 'cada') {                                     // "A cada uno": el mismo número en cada plato
    visibles.forEach(plato => {
      cantidadesPedido[plato.id] = String(numero);
    });
  }

  if (accion === 'repartir') {                                 // "Repartir": en partes iguales
    if (visibles.length === 0) {                               // sin platos no hay a quién repartir
      errorVentana.textContent = 'No hay platos para repartir.';
      errorVentana.style.display = 'block';
      return;
    }
    const base = Math.floor(numero / visibles.length);         // lo que le toca a cada uno. Ej: 10 entre 6 → 1
    const sobrante = numero % visibles.length;                 // lo que sobra (% = el resto de dividir). Ej: 10 % 6 → 4
    visibles.forEach((plato, posicion) => {                    // posicion = 0 para el primero, 1 para el segundo…
      let parte = base;                                        // a cada uno, la base...
      if (posicion < sobrante) parte = base + 1;               // ...y a los primeros, uno más
      cantidadesPedido[plato.id] = String(parte);
    });
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
      let mensaje = 'No se pudo enviar el pedido a cocina.';   // ...un mensaje por si no vino ninguno
      if (datos.error) mensaje = datos.error;                  // ...o el del servidor
      errorVentana.textContent = mensaje;
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
