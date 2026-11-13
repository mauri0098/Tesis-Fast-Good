// ====================================================================
// ARMARCOMBO.JS — Ventana "X de N" para armar un combo (index.html)
//
// Funciones:
//   abrirModalCombo              → abre la ventana con el menú de un combo, con todo en 0, y calcula
//                                  el tope de cada plato (descontando lo que ya está en el carrito)
//   renderizarMenuCombo          → dibuja los platos con sus botones − / +, el "X de N", la barra
//                                  y si se puede agregar al pedido ("Elegí 7 platos más" / "Agregar al pedido · $…")
//   cambiarCantidadPlato         → suma o resta 1 vianda de heladera de un plato, respetando los límites
//   armarloPorMi                 → "✨ Armalo por mí": completa el combo repartiendo de a un plato, en orden,
//                                  con la misma función del + (respeta lo que queda de cada plato y el máximo)
//   agregarPlatoPersonalizado    → suma 1 vianda personalizada (plato + texto, ej: "sin sal")
//   cambiarCantidadPersonalizado → suma o resta 1 a un renglón personalizado (en 0 desaparece)
//   confirmarCombo               → arma el combo elegido y lo manda al carrito
//   cerrarModalCombo             → pregunta "¿Salir?" si hay platos elegidos; si no, cierra y limpia
//
// Personalizado: mismo precio, NO sale de la heladera (no tiene tope de stock), va a cocina
// y (24/10) tiene un día de producción en el medio: el pedido se entrega desde 2 días hábiles después.
// Un renglón personalizado = un plato + un texto.
//
// Necesita antes: escape.js (escHtml), index.html (el HTML de la ventana) y
// renderizadoCatalogo.js (combosDisponibles, IMAGEN_POR_DEFECTO, armarFotoTarjeta).
// Los límites de acá son una AYUDA para el cliente: el servidor los vuelve a controlar
// todos al crear el pedido.
// ====================================================================

// Combo que se está armando (uno de combosDisponibles). null = ventana cerrada
let comboEnArmado = null;

// Cuántas viandas eligió de cada plato: { idPlato: cantidad }
let cantidadesElegidas = {};

// Viandas personalizadas: [{ idPlato, nombre, texto, cantidad }]
let personalizados = [];

// Plato que tiene abierto el campo "Personalizar" (su id). null = ninguno
let platoPersonalizando = null;

// Suma de todas las viandas elegidas, de heladera y personalizadas (para no recorrer las listas cada vez)
let totalElegido = 0;

// Largo máximo del texto personalizado (el servidor lo vuelve a controlar)
const LARGO_MAXIMO_PERSONALIZADO = 150;

// Máximo de viandas de heladera que se pueden elegir de cada plato en este combo: { idPlato: tope }
// (lo disponible menos lo que ya está en el carrito; se calcula al abrir la ventana)
let topePorPlato = {};

// ── Abre la ventana con el menú de un combo ───────────────────────────────
function abrirModalCombo(idCombo) {
  // El id sale de un botón de la página: se busca en lo que mandó el servidor
  const combo = combosDisponibles.find(c => c.id === idCombo);
  if (!combo) return;

  // Arranca de cero
  comboEnArmado = combo;
  cantidadesElegidas = {};
  personalizados = [];
  platoPersonalizando = null;
  totalElegido = 0;

  // 1. Todos los platos de todos los combos del carrito, en UNA sola lista.
  //    flatMap recorre los combos y junta sus listas de platos en una sola.
  //    Ejemplo: entra [ { platos: [fideos x3, berenjenas x7] }, { platos: [fideos x2 "sin sal", arroz x8] } ]
  //             sale  [ fideos x3, berenjenas x7, fideos x2 "sin sal", arroz x8 ]
  let platosDelCarrito = [];
  if (typeof carritoCombos !== 'undefined') {
    platosDelCarrito = carritoCombos.flatMap(comboDelCarrito => comboDelCarrito.platos);
  }

  // 2. Cuántas viandas DE HELADERA de cada plato ya hay en el carrito: { idPlato: cantidad }
  //    Ejemplo con la lista de arriba (fideos = 5, berenjenas = 3, arroz = 9): { 5: 3, 3: 7, 9: 8 }
  //    (los fideos "sin sal" no cuentan)
  const enCarritoPorPlato = {};
  platosDelCarrito.forEach(platoDelCarrito => {
    // Los personalizados no salen de la heladera: return = saltear este y seguir con el siguiente
    if (platoDelCarrito.personalizado) return;
    const yaContadas = enCarritoPorPlato[platoDelCarrito.producto_id] || 0;
    enCarritoPorPlato[platoDelCarrito.producto_id] = yaContadas + platoDelCarrito.cantidad;
  });

  // 3. Tope de cada plato del menú. Si quedan MENOS viandas que las del combo, el número que mandó
  //    el servidor es exacto y se le resta lo que ya está en el carrito. Si quedan muchas, el servidor
  //    lo manda con tope y no se resta: si al final no alcanzaran, el servidor lo frena al crear el pedido.
  topePorPlato = {};
  combo.menu.forEach(plato => {
    let tope = plato.disponibles;
    if (plato.disponibles < combo.cantidad) {
      const enCarrito = enCarritoPorPlato[plato.id] || 0;
      tope = Math.max(0, plato.disponibles - enCarrito);
    }
    topePorPlato[plato.id] = tope;
  });

  // Encabezado (diseño nuevo): arriba el plan chiquito en gris y abajo "10 viandas · $ 137.000"
  // (textContent muestra el texto tal cual, no hace falta escHtml)
  const precioEncabezado = '$ ' + Number(combo.precio).toLocaleString('es-AR');   // solo para mostrar
  document.getElementById('modal-combo-categoria').textContent = combo.plan;
  document.getElementById('modal-combo-titulo').textContent = `${combo.cantidad} viandas · ${precioEncabezado}`;

  // Arriba de los platos (se ve solo en el celu): la foto del combo (con la misma regla de las tarjetas,
  // armarFotoTarjeta de renderizadoCatalogo.js, que ya pasa los datos por escHtml), el nombre, el precio y
  // "Elegí tus 10 platos · podés repetir". El precio es solo para mostrar: el que se cobra lo calcula el servidor.
  document.getElementById('armar-combo-foto').innerHTML = armarFotoTarjeta([combo], combo.plan_imagen, '');
  document.getElementById('armar-combo-nombre').textContent = combo.nombre;
  document.getElementById('armar-combo-precio').textContent = '$ ' + Number(combo.precio).toLocaleString('es-AR');
  document.getElementById('armar-combo-rotulo').textContent = `Elegí tus ${combo.cantidad} platos · podés repetir`;

  // Pie: se ve el botón "Agregar", no el "¿Salir?"
  document.getElementById('boton-agregar-combo').hidden = false;
  document.getElementById('aviso-salir').hidden = true;

  renderizarMenuCombo();
  document.getElementById('modal-combo').showModal();
}

// ── Dibuja los platos, el progreso y el botón de agregar ──────────────────
// ENTRADA: nada (usa comboEnArmado, cantidadesElegidas, personalizados, platoPersonalizando, topePorPlato y totalElegido)
// SALIDA:  nada (dibuja la lista de platos, escribe "Elegí 10 platos" y "3 de 10", llena la barra
//          y prende o apaga "Agregar al pedido")
// Ej: combo x10 con 4 fideos elegidos y 3 tartas en la heladera → fideos resaltado con un 4, la tarta con
//     "Quedan 3", "4 de 10", el botón "Elegí 6 platos más" y la barra llena al 40 %
function renderizarMenuCombo() {
  const lista = document.getElementById('lista-platos');
  const cantidadDelCombo = comboEnArmado.cantidad;
  const completo = totalElegido === cantidadDelCombo;

  // (13/11) Vuelven los personalizados (opción A): "✎ Personalizar" debajo de cada plato, sus renglones "⚠ sin sal"
  // con − / +, y la nota del día de producción al final.

  // Con el combo completo se apagan los botones que suman (el + de los personalizados, Agregar y Personalizar)
  let apagadoSiCompleto = '';
  if (completo) { // ¿ya eligió todos? SÍ: 10 de 10 → apagados · NO: 7 de 10 → prendidos
    apagadoSiCompleto = 'disabled';
  }

  // 1. Los renglones personalizados ya dibujados, juntos por plato: { idPlato: html }.
  //    Así no hace falta recorrer "personalizados" adentro del recorrido de los platos.
  //    El índice es la posición del renglón en "personalizados" (lo usan sus botones − y +).
  //    Ej: [{ idPlato: 5, texto: 'sin sal', cantidad: 2 }] → { 5: '<div class="renglon-personalizado">⚠ sin sal … 2 …</div>' }
  const personalizadosPorPlato = {};
  personalizados.forEach((renglon, indice) => {
    let yaDibujados = '';                                         // los renglones de ese plato que ya se armaron
    if (personalizadosPorPlato[renglon.idPlato]) { // ¿ese plato ya tiene otro renglón? SÍ: "sin sal" y ahora "sin ajo" · NO: el primero
      yaDibujados = personalizadosPorPlato[renglon.idPlato];
    }
    // El texto lo escribió el cliente: pasa por escHtml (se muestra como texto, nunca se ejecuta)
    personalizadosPorPlato[renglon.idPlato] = yaDibujados + `
          <div class="renglon-personalizado">
            <span class="renglon-personalizado-texto">⚠ ${escHtml(renglon.texto)}</span>
            <div class="selector-cantidad">
              <button type="button" class="boton-cantidad" data-accion="personalizado-restar" data-indice="${indice}"
                      aria-label="Sacar una personalizada">
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
              </button>
              <span class="numero-cantidad">${renglon.cantidad}</span>
              <button type="button" class="boton-cantidad boton-sumar" data-accion="personalizado-sumar" data-indice="${indice}"
                      aria-label="Sumar una personalizada" ${apagadoSiCompleto}>
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
              </button>
            </div>
          </div>`;
  });

  // 2. Un renglón por plato del menú
  let html = '';
  comboEnArmado.menu.forEach(plato => {
    const cantidad = cantidadesElegidas[plato.id] || 0;

    // Se puede sumar si el combo no está completo y quedan viandas de ese plato
    const tope = topePorPlato[plato.id];
    const puedeSumar = !completo && cantidad < tope;
    const puedeRestar = cantidad > 0;

    // Plato resaltado si ya tiene viandas elegidas; − y + apagados cuando no se pueden usar
    const claseElegido = cantidad > 0 ? ' plato-elegido' : '';
    const apagadoRestar = puedeRestar ? '' : 'disabled';
    const apagadoSumar = puedeSumar ? '' : 'disabled';

    // Aviso de stock (diseño nuevo): "Hay stock" en gris, "Quedan N" en verde o "Sin stock" en rojo
    let avisoStock = '<p class="plato-quedan plato-hay-stock">Hay stock</p>';
    let claseAgotado = '';
    if (tope === 0) {                       // ¿no queda ninguna? SÍ: 0 · NO: 3
      // (13/11) Personalizado no sale de la heladera: se puede pedir igual
      avisoStock = '<p class="plato-quedan plato-sin-stock">Sin stock · podés pedirlo personalizado</p>';
      claseAgotado = ' plato-agotado';      // foto más clarita
    }
    const quedanPocas = tope > 0 && tope < cantidadDelCombo;
    if (quedanPocas) {                      // ¿quedan menos que las del combo? SÍ: 3 de un x10 · NO: 12 de un x10
      avisoStock = `<p class="plato-quedan">Quedan ${escHtml(tope)}</p>`;
    }

    // Foto del plato, o el logo si no tiene (con foto-logo se ve entero, sin recortar). Si la foto no carga, también el logo.
    const imagen = plato.imagen || IMAGEN_POR_DEFECTO;
    const claseLogo = plato.imagen ? '' : ' foto-logo';
    let fotoPlato = `<img class="foto${claseLogo}" src="${escHtml(imagen)}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
    // Sin foto pero con código: un cuadradito con el código ("F1") en vez del logo
    const sinFotoConCodigo = !plato.imagen && plato.codigo_plato;
    if (sinFotoConCodigo) {                 // ¿no tiene foto y sí código? SÍ: sin foto y "F1" · NO: con foto
      fotoPlato = `<span class="foto foto-plato-codigo">${escHtml(plato.codigo_plato)}</span>`;
    }

    // 28/10: el código del plato ("F3") adelante del nombre, salvo que el nombre ya lo traiga ("F3 - …"): pastillaCodigo
    const codigoPlato = pastillaCodigo(plato.codigo_plato, plato.nombre);

    // (13/11) Debajo del plato: sus renglones personalizados (del paso 1, o nada) y, si es el que se está
    // personalizando, el casillero para escribir cómo lo quiere; si no, el botón "✎ Personalizar" que lo abre
    let personalizadosDelPlato = '';
    if (personalizadosPorPlato[plato.id]) { // ¿tiene renglones personalizados? SÍ: fideos "sin sal" · NO: ninguno
      personalizadosDelPlato = personalizadosPorPlato[plato.id];
    }
    let personalizar = `
          <button type="button" class="boton-enlace" data-accion="personalizado-abrir"
                  data-id-plato="${escHtml(plato.id)}" ${apagadoSiCompleto}>✎ Personalizar</button>`;
    if (platoPersonalizando === plato.id) { // ¿es el plato que se está personalizando? SÍ: el casillero · NO: el botón
      personalizar = `
          <div class="personalizar-plato">
            <input type="text" class="casillero" id="texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal, sin cebolla"
                   aria-label="Cómo querés ${escHtml(plato.nombre)}">
            <button type="button" class="boton boton-principal" data-accion="personalizado-agregar"
                    data-id-plato="${escHtml(plato.id)}" ${apagadoSiCompleto}>Agregar</button>
            <button type="button" class="boton boton-secundario" data-accion="personalizado-cancelar">Cancelar</button>
          </div>`;
    }

    html += `
      <li class="plato${claseElegido}${claseAgotado}">
        ${fotoPlato}
        <div class="plato-datos">
          <h3>${codigoPlato}${escHtml(plato.nombre)}</h3>
          ${avisoStock}
        </div>
        <div class="selector-cantidad">
          <button type="button" class="boton-cantidad" data-accion="restar" data-id-plato="${escHtml(plato.id)}"
                  aria-label="Sacar una de ${escHtml(plato.nombre)}" ${apagadoRestar}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
          </button>
          <span class="numero-cantidad">${cantidad}</span>
          <button type="button" class="boton-cantidad boton-sumar" data-accion="sumar" data-id-plato="${escHtml(plato.id)}"
                  aria-label="Sumar una de ${escHtml(plato.nombre)}" ${apagadoSumar}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
          </button>
        </div>
        <div class="plato-personalizados">
          ${personalizadosDelPlato}
          ${personalizar}
        </div>
      </li>`;
  });

  // 3. (13/11) La nota del día de producción: solo si hay algún plato personalizado (recuadro "nota", index.css)
  if (personalizados.length > 0) { // ¿eligió algún personalizado? SÍ: 2 fideos "sin sal" · NO: todo de la heladera
    html += `
      <li class="nota">
        Los platos personalizados se cocinan aparte: te llegan un día hábil más tarde
        (si pedís un martes, se cocina el miércoles y te llega desde el jueves).
      </li>`;
  }
  lista.innerHTML = html;

  // Si el casillero de "Personalizar" está abierto, el cursor va directo ahí
  const campoTexto = document.getElementById('texto-personalizado');
  if (campoTexto) { // ¿está abierto el casillero? SÍ: tocó "✎ Personalizar" · NO: no hay casillero
    campoTexto.focus();
  }

  // Progreso y botón (diseño nuevo, los mismos textos en compu y celu):
  // a la izquierda "Elegí 10 platos", a la derecha "7 de 10"; el botón dice "Elegí 3 platos más"
  // o, con el combo completo, "Agregar al pedido · $ 137.000"
  const faltan = cantidadDelCombo - totalElegido;
  const palabraPlatos = faltan === 1 ? 'plato' : 'platos';                              // "1 plato" o "7 platos"
  const precioDelCombo = '$ ' + Number(comboEnArmado.precio).toLocaleString('es-AR');  // solo para mostrar
  let textoBoton = `Elegí ${faltan} ${palabraPlatos} más`;
  if (completo) {                           // ¿ya eligió todos? SÍ: 10 de 10 · NO: 7 de 10
    textoBoton = 'Agregar al pedido · ' + precioDelCombo;
  }
  document.getElementById('modal-combo-cuenta').textContent = `${totalElegido} de ${cantidadDelCombo}`;
  document.getElementById('modal-combo-falta').textContent = `Elegí ${cantidadDelCombo} platos`;
  // En el celu, este botón agrega el combo y abre "Finalizar pedido" directo (agregarAlCarrito, de carritoCombos.js)
  document.getElementById('boton-agregar-combo').textContent = textoBoton;
  // Con el combo completo, el progreso lleva la clase "progreso-completo" (el texto se pone verde).
  // toggle(clase, true) la pone y toggle(clase, false) la saca. Ej: 10 de 10 → la pone · 4 de 10 → la saca
  document.getElementById('modal-combo-progreso').classList.toggle('progreso-completo', completo);

  // Barra: el relleno se estira según lo elegido. scaleX(0) = vacía, scaleX(0.4) = 40 %, scaleX(1) = llena
  const barra = document.getElementById('modal-combo-barra');
  barra.setAttribute('aria-valuemax', cantidadDelCombo);
  barra.setAttribute('aria-valuenow', totalElegido);
  document.getElementById('modal-combo-relleno').style.transform = 'scaleX(' + (totalElegido / cantidadDelCombo) + ')';

  // "Agregar al pedido" se activa solo con el combo justo
  document.getElementById('boton-agregar-combo').disabled = !completo;
  // "✨ Armalo por mí" se apaga con el combo completo (no queda nada por repartir)
  document.getElementById('boton-armar-por-mi').disabled = completo;
}

// ── Suma (cambio = 1) o resta (cambio = -1) una vianda de un plato ────────
function cambiarCantidadPlato(idPlato, cambio) {
  // El plato tiene que estar en el menú de este combo
  const plato = comboEnArmado.menu.find(p => p.id === idPlato);
  if (!plato) return;

  const nuevaCantidad = (cantidadesElegidas[idPlato] || 0) + cambio;

  // Límites: no menos de 0, no más de lo que hay en la heladera, no más que el combo
  if (nuevaCantidad < 0) return;
  if (nuevaCantidad > topePorPlato[idPlato]) return;
  if (totalElegido + cambio > comboEnArmado.cantidad) return;

  cantidadesElegidas[idPlato] = nuevaCantidad;
  totalElegido = totalElegido + cambio;
  renderizarMenuCombo();
}

// ── "✨ Armalo por mí": completa el combo solo ────────────────────────────
// ENTRADA: nada (usa comboEnArmado y totalElegido)
// SALIDA:  nada (suma viandas de a una con cambiarCantidadPlato, la misma función del +, hasta completar el combo
//          o hasta que no quede de ningún plato). No llama al servidor.
// Cómo reparte: da vueltas por el menú en orden y en cada vuelta suma 1 a cada plato. Si un plato ya no tiene
// ("quedan" 0) o el combo se completó, cambiarCantidadPlato no suma y se sigue con el siguiente.
// Si ya había platos elegidos, completa lo que falta.
// Ej: combo x10 con 2 fideos ya elegidos y el menú [fideos, canelones (quedan 3), berenjenas] →
//     1.ª vuelta: fideos 3, canelones 1, berenjenas 1 · 2.ª: 4, 2, 2 · 3.ª: 5, 3 y se completa → 10 de 10
function armarloPorMi() {
  // Sin combo abierto no hay nada que armar
  if (!comboEnArmado) return;

  // Si estaba abierto el campo "Personalizar", se cierra (se reparten viandas de heladera, no personalizadas)
  platoPersonalizando = null;

  // Se sigue dando vueltas mientras falten viandas y la vuelta anterior haya podido sumar algo
  // (si en una vuelta entera no se sumó nada, no queda de ningún plato: se frena)
  let sumoEnLaVuelta = true;
  while (totalElegido < comboEnArmado.cantidad && sumoEnLaVuelta) {
    sumoEnLaVuelta = false;
    comboEnArmado.menu.forEach(plato => {
      const yaEstaCompleto = totalElegido >= comboEnArmado.cantidad;
      // Combo completo: return = saltear este plato y seguir con el siguiente (no se suma más)
      if (yaEstaCompleto) return;
      const antes = totalElegido;                 // cuántas había antes de tocar el +
      cambiarCantidadPlato(plato.id, 1);          // la misma función del +: respeta lo que queda y el máximo
      if (totalElegido > antes) sumoEnLaVuelta = true;   // se pudo sumar: hay que dar otra vuelta
    });
  }

  // Se vuelve a dibujar una vez más (por si no se pudo sumar nada: así se cierra el campo "Personalizar")
  renderizarMenuCombo();
}

// ── Suma 1 vianda personalizada de un plato (ej: fideos "sin sal") ────────
// No tiene tope de stock: no sale de la heladera. El único tope es la cantidad del combo.
function agregarPlatoPersonalizado(idPlato, texto) {
  // El plato tiene que estar en el menú de este combo
  const plato = comboEnArmado.menu.find(p => p.id === idPlato);
  if (!plato) return;

  // Texto sin espacios de más, no vacío y no más largo que el máximo
  const textoLimpio = String(texto || '').trim();
  if (textoLimpio === '' || textoLimpio.length > LARGO_MAXIMO_PERSONALIZADO) {
    const campoTexto = document.getElementById('texto-personalizado');
    if (campoTexto) campoTexto.focus();
    return;
  }

  // Con el combo completo no entra nada más
  if (totalElegido >= comboEnArmado.cantidad) return;

  // Mismo plato con el mismo texto (sin importar mayúsculas): se suma a ese renglón
  const renglonIgual = personalizados.find(renglon =>
    renglon.idPlato === idPlato && renglon.texto.toLowerCase() === textoLimpio.toLowerCase()
  );
  if (renglonIgual) {
    renglonIgual.cantidad = renglonIgual.cantidad + 1;
  } else {
    personalizados.push({ idPlato: plato.id, nombre: plato.nombre, texto: textoLimpio, cantidad: 1 });
  }

  totalElegido = totalElegido + 1;
  platoPersonalizando = null;   // se cierra el campo de texto
  renderizarMenuCombo();
}

// ── Suma (cambio = 1) o resta (cambio = -1) una vianda de un renglón personalizado ──
function cambiarCantidadPersonalizado(indice, cambio) {
  const renglon = personalizados[indice];
  if (!renglon) return;

  // Con el combo completo no se puede sumar
  if (cambio > 0 && totalElegido >= comboEnArmado.cantidad) return;

  renglon.cantidad = renglon.cantidad + cambio;
  totalElegido = totalElegido + cambio;

  // Un renglón en 0 desaparece
  if (renglon.cantidad <= 0) {
    personalizados.splice(indice, 1);
  }
  renderizarMenuCombo();
}

// ── Arma el combo elegido y lo manda al carrito ───────────────────────────
function confirmarCombo() {
  // Solo con la cantidad justa del combo
  if (!comboEnArmado || totalElegido !== comboEnArmado.cantidad) return;

  // Los platos con al menos una vianda (los que quedaron en 0 no van)
  const platos = [];
  comboEnArmado.menu.forEach(plato => {
    const cantidad = cantidadesElegidas[plato.id] || 0;
    if (cantidad > 0) {
      platos.push({ producto_id: plato.id, nombre: plato.nombre, cantidad: cantidad, personalizado: null });
    }
  });

  // Los personalizados van como platos aparte, con su texto
  personalizados.forEach(renglon => {
    platos.push({ producto_id: renglon.idPlato, nombre: renglon.nombre, cantidad: renglon.cantidad, personalizado: renglon.texto });
  });

  // El precio es solo para mostrar: el servidor lo vuelve a sacar de la base
  const comboArmado = {
    id_combo: comboEnArmado.id,
    nombre:   comboEnArmado.nombre,
    precio:   comboEnArmado.precio,
    cantidad: comboEnArmado.cantidad,
    platos:   platos
  };

  // El carrito (carritoCombos.js) llega en el paso 7. Mientras no exista, el combo se ve en la consola.
  if (typeof agregarAlCarrito === 'function') {
    agregarAlCarrito(comboArmado);
  } else {
    console.log('Combo armado (el carrito se conecta en el paso 7):', comboArmado);
  }

  cerrarModalCombo(true);
}

// ── Cierra la ventana; con platos elegidos, primero pregunta ──────────────
function cerrarModalCombo(forzar) {
  const botonAgregar = document.getElementById('boton-agregar-combo');
  const bloqueSalir = document.getElementById('aviso-salir');

  // Hay platos elegidos y no se pidió cerrar igual: se pregunta "¿Salir?"
  if (!forzar && totalElegido > 0) {
    document.getElementById('aviso-salir-texto').textContent =
      `Elegiste ${totalElegido} de ${comboEnArmado.cantidad}. Si salís, se pierde lo que elegiste.`;
    botonAgregar.hidden = true;
    bloqueSalir.hidden = false;
    return;
  }

  // Cierra y deja todo limpio para el próximo combo
  botonAgregar.hidden = false;
  bloqueSalir.hidden = true;
  document.getElementById('modal-combo').close();
  comboEnArmado = null;
  cantidadesElegidas = {};
  personalizados = [];
  platoPersonalizando = null;
  totalElegido = 0;
}

// ── Al cargar la página: quién escucha los clics ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-combo');

  // Botones "¡Lo quiero!" de las tarjetas. Las dibuja renderizadoCatalogo.js, y se vuelven a dibujar
  // al abrir otro plan, por eso se escucha en el contenedor #combos.
  document.getElementById('combos').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-accion="armar-combo"]');
    if (boton) {
      abrirModalCombo(Number(boton.dataset.idCombo));
    }
  });

  // Todos los botones de la ventana
  modal.addEventListener('click', evento => {
    // Clic en el fondo oscuro (fuera de la ventana): se intenta cerrar
    if (evento.target === modal) {
      cerrarModalCombo(false);
      return;
    }

    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;

    if (accion === 'sumar') {
      cambiarCantidadPlato(Number(boton.dataset.idPlato), 1);
    } else if (accion === 'restar') {
      cambiarCantidadPlato(Number(boton.dataset.idPlato), -1);
    } else if (accion === 'personalizado-abrir') {
      // Abre el campo de texto debajo de ese plato
      platoPersonalizando = Number(boton.dataset.idPlato);
      renderizarMenuCombo();
    } else if (accion === 'personalizado-cancelar') {
      platoPersonalizando = null;
      renderizarMenuCombo();
    } else if (accion === 'personalizado-agregar') {
      agregarPlatoPersonalizado(Number(boton.dataset.idPlato), document.getElementById('texto-personalizado').value);
    } else if (accion === 'personalizado-sumar') {
      cambiarCantidadPersonalizado(Number(boton.dataset.indice), 1);
    } else if (accion === 'personalizado-restar') {
      cambiarCantidadPersonalizado(Number(boton.dataset.indice), -1);
    } else if (accion === 'armar-por-mi') {
      armarloPorMi();
    } else if (accion === 'agregar-combo') {
      confirmarCombo();
    } else if (accion === 'cerrar') {
      cerrarModalCombo(false);
    } else if (accion === 'combo-salir') {
      cerrarModalCombo(true);
    } else if (accion === 'combo-seguir') {
      // Vuelve a armar: se esconde el "¿Salir?" y vuelve el botón de agregar
      document.getElementById('aviso-salir').hidden = true;
      document.getElementById('boton-agregar-combo').hidden = false;
    }
  });

  // Tecla Escape: el navegador cerraría la ventana; se frena para preguntar antes.
  // Si está abierto el campo "Personalizar", Escape solo cierra ese campo.
  modal.addEventListener('cancel', evento => {
    evento.preventDefault();
    if (platoPersonalizando !== null) {
      platoPersonalizando = null;
      renderizarMenuCombo();
      return;
    }
    cerrarModalCombo(false);
  });

  // Enter en el campo de texto = tocar "Agregar"
  modal.addEventListener('keydown', evento => {
    if (evento.key === 'Enter' && evento.target.id === 'texto-personalizado') {
      evento.preventDefault();
      agregarPlatoPersonalizado(platoPersonalizando, evento.target.value);
    }
  });
});
