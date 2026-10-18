// ====================================================================
// ARMARCOMBO.JS — Ventana "X de N" para armar un combo (index.html)
//
// Funciones:
//   abrirModalCombo              → abre la ventana con el menú de un combo, con todo en 0, y calcula
//                                  el tope de cada plato (descontando lo que ya está en el carrito)
//   renderizarMenuCombo          → dibuja los platos con sus botones − / +, los personalizados,
//                                  el "X de N", la barra y si se puede agregar al pedido
//                                  (con los textos de compu o los del celu: "Elegí 7 platos más" / "Mandar pedido · $…")
//   cambiarCantidadPlato         → suma o resta 1 vianda de heladera de un plato, respetando los límites
//   armarloPorMi                 → "✨ Armalo por mí": completa el combo repartiendo de a un plato, en orden,
//                                  con la misma función del + (respeta lo que queda de cada plato y el máximo)
//   agregarPlatoPersonalizado    → suma 1 vianda personalizada (plato + texto, ej: "sin sal")
//   cambiarCantidadPersonalizado → suma o resta 1 a un renglón personalizado (en 0 desaparece)
//   confirmarCombo               → arma el combo elegido y lo manda al carrito
//   cerrarModalCombo             → pregunta "¿Salir?" si hay platos elegidos; si no, cierra y limpia
//
// Personalizado: mismo precio, NO sale de la heladera (no tiene tope de stock), va a cocina
// y se entrega 1 día hábil más tarde. Un renglón personalizado = un plato + un texto.
//
// Necesita antes: escape.js (escHtml) y combosCatalogo.js (combosDisponibles, IMAGEN_POR_DEFECTO, armarFotoTarjeta).
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

  // Encabezado (textContent muestra el texto tal cual, no hace falta escHtml)
  document.getElementById('modal-combo-categoria').textContent = combo.categoria.nombre + ' · ' + combo.plan;
  document.getElementById('modal-combo-titulo').textContent = combo.nombre;

  // Arriba de los platos (se ve solo en el celu): la foto del combo (con la misma regla de las tarjetas,
  // armarFotoTarjeta de combosCatalogo.js, que ya pasa los datos por escHtml), el nombre, el precio y
  // "Elegí tus 10 platos · podés repetir". El precio es solo para mostrar: el que se cobra lo calcula el servidor.
  document.getElementById('armar-combo-foto').innerHTML = armarFotoTarjeta(combo, '', '');
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
// SALIDA:  nada (dibuja la lista de platos, escribe "3 de 10" y "Te faltan 7", llena la barra
//          y prende o apaga "Agregar al pedido")
// Ej: combo x10 con 4 fideos elegidos y 3 tartas en la heladera → fideos resaltado con un 4, la tarta con
//     "Quedan 3", "4 de 10", "Te faltan 6" y la barra llena al 40 %
function renderizarMenuCombo() {
  const lista = document.getElementById('lista-platos');
  const cantidadDelCombo = comboEnArmado.cantidad;
  const completo = totalElegido === cantidadDelCombo;

  // Con el combo completo se apagan los botones que suman (+ personalizado, Agregar, Personalizar)
  const apagadoSiCompleto = completo ? 'disabled' : '';

  // 1. Los renglones personalizados ya dibujados, juntos por plato: { idPlato: html }.
  //    Así no hace falta recorrer "personalizados" adentro del recorrido de los platos.
  //    El índice es la posición del renglón en "personalizados" (lo usan sus botones − y +).
  //    Ej: [{ idPlato: 5, texto: 'sin sal', cantidad: 2 }] → { 5: '<div class="renglon-personalizado">⚠ sin sal … 2 …</div>' }
  const personalizadosPorPlato = {};
  personalizados.forEach((renglon, indice) => {
    const yaDibujados = personalizadosPorPlato[renglon.idPlato] || '';   // los de antes de ese plato (o nada)
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

    // Aviso de stock, solo si hay menos viandas que las del combo: "Sin stock…" (en rojo) o "Quedan N"
    const sinStock = tope === 0;
    const quedanPocas = tope > 0 && tope < cantidadDelCombo;
    const avisoSinStock = sinStock ? '<p class="plato-quedan plato-sin-stock">Sin stock · podés pedirlo personalizado</p>' : '';
    const avisoQuedan = quedanPocas ? `<p class="plato-quedan">Quedan ${escHtml(tope)}</p>` : '';

    // Descripción solo si tiene
    const descripcion = plato.descripcion ? `<p>${escHtml(plato.descripcion)}</p>` : '';

    // Foto del plato, o el logo si no tiene (con foto-logo se ve entero, sin recortar). Si la foto no carga, también el logo.
    const imagen = plato.imagen || IMAGEN_POR_DEFECTO;
    const claseLogo = plato.imagen ? '' : ' foto-logo';

    // Sus renglones personalizados (los del paso 1), o nada
    const personalizadosDelPlato = personalizadosPorPlato[plato.id] || '';

    // Debajo del plato: el campo para escribir cómo lo quiere (si es el que se está personalizando)
    // o el botón "✎ Personalizar" que abre ese campo
    const campoPersonalizar = `
          <div class="personalizar-plato">
            <input type="text" class="casillero" id="texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal"
                   aria-label="Cómo querés ${escHtml(plato.nombre)}">
            <button type="button" class="boton boton-principal" data-accion="personalizado-agregar"
                    data-id-plato="${escHtml(plato.id)}" ${apagadoSiCompleto}>Agregar</button>
            <button type="button" class="boton boton-secundario" data-accion="personalizado-cancelar">Cancelar</button>
          </div>`;
    const botonPersonalizar = `
          <button type="button" class="boton-enlace" data-accion="personalizado-abrir"
                  data-id-plato="${escHtml(plato.id)}" ${apagadoSiCompleto}>✎ Personalizar</button>`;
    const estaPersonalizando = platoPersonalizando === plato.id;
    const personalizar = estaPersonalizando ? campoPersonalizar : botonPersonalizar;

    html += `
      <li class="plato${claseElegido}">
        <img class="foto${claseLogo}" src="${escHtml(imagen)}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">
        <div class="plato-datos">
          <h3>${escHtml(plato.nombre)}</h3>
          ${descripcion}
          ${avisoSinStock}${avisoQuedan}
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

  // Aviso de entrega: solo si hay algún plato personalizado (con el estilo "nota": recuadro verde clarito)
  if (personalizados.length > 0) {
    html += `
      <li class="nota">
        Los platos personalizados se cocinan aparte: se entregan 1 día hábil más tarde.
      </li>`;
  }
  lista.innerHTML = html;

  // Si el campo de texto está abierto, el cursor va directo ahí
  const campoTexto = document.getElementById('texto-personalizado');
  if (campoTexto) {
    campoTexto.focus();
  }

  // Progreso: "3 de 10" y el texto de al lado, y el texto del botón. Cambian según la pantalla (tabla de abajo):
  // en compu, los de siempre ("Te faltan 7" o "¡Combo completo!" y "Agregar al pedido"); en el celu, los de la
  // referencia ("Tus platos" o "¡Listo! Ya podés mandarlo", y "Elegí 7 platos más" o "Mandar pedido · $ 137.000").
  // matchMedia pregunta si la pantalla cumple esa medida. Ej: celular de 390 px → true · compu de 1440 px → false
  const faltan = cantidadDelCombo - totalElegido;
  const esCelu = window.matchMedia('(max-width: 767px)').matches;
  const pantalla = esCelu ? 'celu' : 'compu';
  const palabraPlatos = faltan === 1 ? 'plato' : 'platos';                              // "1 plato" o "7 platos"
  const precioDelCombo = '$ ' + Number(comboEnArmado.precio).toLocaleString('es-AR');  // solo para mostrar
  // La tabla se arma acá adentro (y no arriba de todo) porque usa cuántos faltan y el precio de este combo
  const textosPorPantalla = {
    compu: { falta: `Te faltan ${faltan}`, completo: '¡Combo completo!',
             boton: 'Agregar al pedido', botonCompleto: 'Agregar al pedido' },
    celu:  { falta: 'Tus platos', completo: '¡Listo! Ya podés mandarlo',
             boton: `Elegí ${faltan} ${palabraPlatos} más`, botonCompleto: 'Mandar pedido · ' + precioDelCombo }
  };
  const textos = textosPorPantalla[pantalla];
  const textoFalta = completo ? textos.completo : textos.falta;
  document.getElementById('modal-combo-cuenta').textContent = `${totalElegido} de ${cantidadDelCombo}`;
  document.getElementById('modal-combo-falta').textContent = textoFalta;
  // En el celu, "Mandar pedido" agrega el combo y abre "Finalizar pedido" directo (agregarAlCarrito, de carritoCombos.js)
  document.getElementById('boton-agregar-combo').textContent = completo ? textos.botonCompleto : textos.boton;
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

  // Botones "Armar combo" de las tarjetas. Las dibuja combosCatalogo.js y se vuelven a dibujar
  // al cambiar de categoría, por eso se escucha en el contenedor #combos.
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
