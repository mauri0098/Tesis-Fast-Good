// armarCombo.js — La ventana donde el cliente elige los platos de UN combo.
//
// Lo que hace el cliente          → la función
//   Toca "¡Lo quiero!"            → abrirVentanaCombo      (abre la ventana)
//   (después de cada toque)       → renderizarVentanaCombo (dibuja los platos y el "3 de 10")
//   Toca − o +                    → cambiarCantidad        (suma o resta 1 plato)
//   Toca "Armalo por mí"          → armarloPorMi           (completa el combo solo)
//   Toca "Agregar al pedido"      → confirmarCombo         (manda el combo al carrito)

// El combo que se está armando
let comboEnArmado = null;

// Los platos que va eligiendo. Ej: [ { idPlato: 5, nombre: "Fideos", texto: "", cantidad: 3 } ]
let platosElegidos = [];

// Cuántos platos lleva elegidos en total
let totalElegido = 0;
// El plato que tiene abierto el campo "Personalizar"
let platoPersonalizando = null;
// Cuántos se pueden elegir de cada plato
let topePorPlato = {};

const LARGO_MAXIMO_PERSONALIZADO = 150;

// Tablas: eligen un texto según sí (true) o no (false). Ej: ATRIBUTO_APAGADO[false] → el botón queda apagado
const ATRIBUTO_APAGADO = { true: '', false: 'disabled' };
const CLASE_PLATO_ELEGIDO = { true: ' plato-elegido', false: '' };
const AVISO_SIN_STOCK = { true: '<p class="plato-quedan plato-sin-stock">Sin stock · podés pedirlo personalizado</p>', false: '' };

// Los elementos de la página
const ventanaCombo = document.getElementById('modal-combo');
const listaPlatosCombo = document.getElementById('lista-platos');
const botonAgregarCombo = document.getElementById('boton-agregar-combo');
const botonArmarPorMi = document.getElementById('boton-armar-por-mi');
const avisoSalir = document.getElementById('aviso-salir');

// ABRE la ventana de un combo, con todo en 0.
function abrirVentanaCombo(combo) {
  comboEnArmado = combo;
  platosElegidos = [];
  totalElegido = 0;
  platoPersonalizando = null;

  // Cuántos de cada plato ya están en el carrito
  const enCarritoPorPlato = {};
  combo.menu.forEach((plato) => {
    enCarritoPorPlato[plato.id] = 0;
  });
  let platosDelCarrito = [];
  carritoCombos.forEach((comboDelCarrito) => {
    platosDelCarrito = platosDelCarrito.concat(comboDelCarrito.platos);
  });
  platosDelCarrito.forEach((platoDelCarrito) => {
    const cuentaParaElTope = !platoDelCarrito.personalizado && enCarritoPorPlato[platoDelCarrito.producto_id] !== undefined;
    if (cuentaParaElTope) {
      enCarritoPorPlato[platoDelCarrito.producto_id] = enCarritoPorPlato[platoDelCarrito.producto_id] + platoDelCarrito.cantidad;
    }
  });

  // Cuántos se pueden elegir de cada plato (lo que queda en la heladera)
  topePorPlato = {};
  combo.menu.forEach((plato) => {
    let tope = plato.disponibles;
    if (plato.disponibles < combo.cantidad) {
      tope = Math.max(0, plato.disponibles - enCarritoPorPlato[plato.id]);
    }
    topePorPlato[plato.id] = tope;
  });

  // El título y la foto de arriba
  let encabezado = combo.plan;
  if (combo.categoria) {
    encabezado = combo.categoria.nombre + ' · ' + combo.plan;
  }
  document.getElementById('modal-combo-categoria').textContent = encabezado;
  document.getElementById('modal-combo-titulo').textContent = combo.nombre;
  document.getElementById('armar-combo-foto').innerHTML = armarFotoTarjeta([combo], combo.plan_imagen, '');
  document.getElementById('armar-combo-nombre').textContent = combo.nombre;
  document.getElementById('armar-combo-precio').textContent = '$ ' + Number(combo.precio).toLocaleString('es-AR');
  document.getElementById('armar-combo-rotulo').textContent = `Elegí tus ${combo.cantidad} platos · podés repetir`;
  botonAgregarCombo.hidden = false;
  avisoSalir.hidden = true;

  renderizarVentanaCombo();
  ventanaCombo.showModal();
}

// DIBUJA la ventana: los platos, el "3 de 10", la barra y los botones.
function renderizarVentanaCombo() {
  const cantidadDelCombo = comboEnArmado.cantidad;
  const completo = totalElegido === cantidadDelCombo;
  const apagadoSiCompleto = ATRIBUTO_APAGADO[!completo];

  // Cuántos lleva elegidos de cada plato, y sus personalizados
  const cantidadPorPlato = {};
  const personalizadosPorPlato = {};
  comboEnArmado.menu.forEach((plato) => {
    cantidadPorPlato[plato.id] = 0;
    personalizadosPorPlato[plato.id] = '';
  });
  let indicePersonalizado = 0;
  platosElegidos.forEach((renglon) => {
    if (renglon.texto === '') {
      cantidadPorPlato[renglon.idPlato] = renglon.cantidad;
    } else {
      personalizadosPorPlato[renglon.idPlato] = personalizadosPorPlato[renglon.idPlato] + `
          <div class="renglon-personalizado">
            <span class="renglon-personalizado-texto">⚠ ${escHtml(renglon.texto)}</span>
            <div class="selector-cantidad">
              <button type="button" class="boton-cantidad" data-accion="personalizado-restar" data-indice="${indicePersonalizado}"
                      aria-label="Sacar una personalizada">
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
              </button>
              <span class="numero-cantidad">${renglon.cantidad}</span>
              <button type="button" class="boton-cantidad boton-sumar" data-accion="personalizado-sumar" data-indice="${indicePersonalizado}"
                      aria-label="Sumar una personalizada" ${apagadoSiCompleto}>
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
              </button>
            </div>
          </div>`;
      indicePersonalizado = indicePersonalizado + 1;
    }
  });

  // Un renglón por cada plato del menú
  let contenidoHTML = '';
  comboEnArmado.menu.forEach((plato) => {
    const cantidad = cantidadPorPlato[plato.id];
    const tope = topePorPlato[plato.id];
    const tieneElegidas = cantidad > 0;
    const puedeSumar = !completo && cantidad < tope;
    const quedanPocas = tope > 0 && tope < cantidadDelCombo;
    const tieneFoto = Boolean(plato.imagen);
    const estaPersonalizando = platoPersonalizando === plato.id;
    const nombre = escHtml(plato.nombre);
    const idPlato = escHtml(plato.id);

    const avisoQuedan = { true: `<p class="plato-quedan">Quedan ${escHtml(tope)}</p>`, false: '' }[quedanPocas];
    const descripcion = { true: `<p>${escHtml(plato.descripcion)}</p>`, false: '' }[Boolean(plato.descripcion)];
    const imagen = escHtml({ true: plato.imagen, false: IMAGEN_POR_DEFECTO }[tieneFoto]);
    const claseLogo = { true: '', false: ' foto-logo' }[tieneFoto];
    const codigoPlato = pastillaCodigo(plato.codigo_plato, plato.nombre);

    const campoPersonalizar = `
          <div class="personalizar-plato">
            <input type="text" class="casillero" id="texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal"
                   aria-label="Cómo querés ${nombre}">
            <button type="button" class="boton boton-principal" data-accion="personalizado-agregar"
                    data-id-plato="${idPlato}" ${apagadoSiCompleto}>Agregar</button>
            <button type="button" class="boton boton-secundario" data-accion="personalizado-cancelar">Cancelar</button>
          </div>`;
    const botonPersonalizar = `
          <button type="button" class="boton-enlace" data-accion="personalizado-abrir"
                  data-id-plato="${idPlato}" ${apagadoSiCompleto}>✎ Personalizar</button>`;
    const personalizar = { true: campoPersonalizar, false: botonPersonalizar }[estaPersonalizando];

    contenidoHTML += `
      <li class="plato${CLASE_PLATO_ELEGIDO[tieneElegidas]}">
        <img class="foto${claseLogo}" src="${imagen}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">
        <div class="plato-datos">
          <h3>${codigoPlato}${nombre}</h3>
          ${descripcion}
          ${AVISO_SIN_STOCK[tope === 0]}${avisoQuedan}
        </div>
        <div class="selector-cantidad">
          <button type="button" class="boton-cantidad" data-accion="restar" data-id-plato="${idPlato}"
                  aria-label="Sacar una de ${nombre}" ${ATRIBUTO_APAGADO[tieneElegidas]}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
          </button>
          <span class="numero-cantidad">${cantidad}</span>
          <button type="button" class="boton-cantidad boton-sumar" data-accion="sumar" data-id-plato="${idPlato}"
                  aria-label="Sumar una de ${nombre}" ${ATRIBUTO_APAGADO[puedeSumar]}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
          </button>
        </div>
        <div class="plato-personalizados">
          ${personalizadosPorPlato[plato.id]}
          ${personalizar}
        </div>
      </li>`;
  });

  const hayPersonalizados = indicePersonalizado > 0;
  contenidoHTML += { true: `
      <li class="nota">
        Los platos personalizados se cocinan aparte: hay un día de producción en el medio (si pedís un martes, se cocina el miércoles y te llega desde el jueves).
      </li>`, false: '' }[hayPersonalizados];
  listaPlatosCombo.innerHTML = contenidoHTML;

  const campoTexto = document.getElementById('texto-personalizado');
  if (campoTexto) {
    campoTexto.focus();
  }

  // El "3 de 10", el texto del botón y la barra
  const faltan = cantidadDelCombo - totalElegido;
  const esCelu = window.matchMedia('(max-width: 767px)').matches;
  const palabraPlatos = { true: 'plato', false: 'platos' }[faltan === 1];
  const precioDelCombo = '$ ' + Number(comboEnArmado.precio).toLocaleString('es-AR');
  const textosPorPantalla = {
    compu: { falta: `Te faltan ${faltan}`, completo: '¡Combo completo!',
             boton: 'Agregar al pedido', botonCompleto: 'Agregar al pedido' },
    celu:  { falta: 'Tus platos', completo: '¡Listo! Ya podés mandarlo',
             boton: `Elegí ${faltan} ${palabraPlatos} más`, botonCompleto: 'Mandar pedido · ' + precioDelCombo }
  };
  const textos = textosPorPantalla[{ true: 'celu', false: 'compu' }[esCelu]];
  document.getElementById('modal-combo-cuenta').textContent = `${totalElegido} de ${cantidadDelCombo}`;
  document.getElementById('modal-combo-falta').textContent = { true: textos.completo, false: textos.falta }[completo];
  botonAgregarCombo.textContent = { true: textos.botonCompleto, false: textos.boton }[completo];

  const progreso = document.getElementById('modal-combo-progreso');
  if (completo) {
    progreso.classList.add('progreso-completo');
  } else {
    progreso.classList.remove('progreso-completo');
  }

  const barra = document.getElementById('modal-combo-barra');
  barra.setAttribute('aria-valuemax', cantidadDelCombo);
  barra.setAttribute('aria-valuenow', totalElegido);
  document.getElementById('modal-combo-relleno').style.transform = 'scaleX(' + (totalElegido / cantidadDelCombo) + ')';

  botonAgregarCombo.disabled = !completo;
  botonArmarPorMi.disabled = completo;
}

// SUMA o RESTA 1 plato (cambio = 1 o -1). texto vacío = de la heladera · texto "sin sal" = personalizado.
// Devuelve true si cambió algo, false si no se podía.
function cambiarCantidad(idPlato, cambio, texto) {
  // Busca el plato en el menú, y si ya lo había elegido antes
  const plato = comboEnArmado.menu.find((p) => p.id === idPlato);
  let renglon = platosElegidos.find((r) => r.idPlato === idPlato && r.texto.toLowerCase() === texto.toLowerCase());
  const esNuevo = renglon === undefined;
  // Si es la primera vez que elige ese plato, arranca en 0
  if (esNuevo) {
    renglon = { idPlato: idPlato, nombre: plato?.nombre, texto: texto, cantidad: 0 };
  }

  // ¿Se puede? (no menos de 0, no más de lo que queda, no más que el combo)
  const nuevaCantidad = renglon.cantidad + cambio;
  const noEstaEnElMenu = plato === undefined;
  const quedariaNegativo = nuevaCantidad < 0;
  const pasaElTope = texto === '' && nuevaCantidad > topePorPlato[idPlato];
  const pasaElCombo = totalElegido + cambio > comboEnArmado.cantidad;
  const noSePuede = noEstaEnElMenu || quedariaNegativo || pasaElTope || pasaElCombo;
  if (noSePuede) {
    return false;
  }

  // Se cambia la cantidad (uno nuevo se agrega a la lista; el que queda en 0 se saca)
  if (esNuevo) {
    platosElegidos.push(renglon);
  }
  renglon.cantidad = nuevaCantidad;
  totalElegido = totalElegido + cambio;
  platosElegidos = platosElegidos.filter((r) => r.cantidad > 0);
  return true;
}

// COMPLETA el combo solo: reparte de a 1 plato por vuelta hasta llenarlo.
function armarloPorMi() {
  if (comboEnArmado === null) {
    return false;
  }
  platoPersonalizando = null;

  const vueltas = Array.from({ length: comboEnArmado.cantidad });
  vueltas.forEach(() => {
    comboEnArmado.menu.forEach((plato) => {
      cambiarCantidad(plato.id, 1, '');
    });
  });
  return true;
}

// MANDA el combo armado al carrito y cierra la ventana.
function confirmarCombo() {
  const comboCompleto = comboEnArmado !== null && totalElegido === comboEnArmado.cantidad;
  if (!comboCompleto) {
    return;
  }

  // Los platos elegidos: primero los de heladera, después los personalizados
  const platos = [];
  comboEnArmado.menu.forEach((plato) => {
    const renglon = platosElegidos.find((r) => r.idPlato === plato.id && r.texto === '');
    if (renglon === undefined) {
      return;
    }
    platos.push({ producto_id: plato.id, nombre: plato.nombre, cantidad: renglon.cantidad, personalizado: null });
  });

  platosElegidos.filter((r) => r.texto !== '').forEach((renglon) => {
    platos.push({ producto_id: renglon.idPlato, nombre: renglon.nombre, cantidad: renglon.cantidad, personalizado: renglon.texto });
  });

  agregarAlCarrito({
    id_combo: comboEnArmado.id,
    nombre:   comboEnArmado.nombre,
    precio:   comboEnArmado.precio,
    cantidad: comboEnArmado.cantidad,
    platos:   platos
  });
  cerrarVentanaCombo(true);
}

// Lo que escribió en "Personalizar": si el texto sirve, suma 1 plato personalizado.
function agregarPersonalizado(idPlato, textoEscrito) {
  const textoLimpio = String(textoEscrito).trim();
  const textoNoSirve = textoLimpio === '' || textoLimpio.length > LARGO_MAXIMO_PERSONALIZADO;
  if (textoNoSirve) {
    document.getElementById('texto-personalizado').focus();
    return false;
  }
  const seAgrego = cambiarCantidad(idPlato, 1, textoLimpio);
  if (seAgrego) {
    platoPersonalizando = null;
  }
  return seAgrego;
}

// CIERRA la ventana. Si ya eligió platos, antes pregunta "¿Salir?".
function cerrarVentanaCombo(forzar) {
  const hayQuePreguntar = !forzar && totalElegido > 0;
  if (hayQuePreguntar) {
    document.getElementById('aviso-salir-texto').textContent =
      `Elegiste ${totalElegido} de ${comboEnArmado.cantidad}. Si salís, se pierde lo que elegiste.`;
    botonAgregarCombo.hidden = true;
    avisoSalir.hidden = false;
    return;
  }
  botonAgregarCombo.hidden = false;
  avisoSalir.hidden = true;
  ventanaCombo.close();
  comboEnArmado = null;
  platosElegidos = [];
  totalElegido = 0;
  platoPersonalizando = null;
}

// Qué hace cada botón de la ventana cuando lo tocan.
const BOTONES_DE_LA_VENTANA = {
  'sumar':                  (boton) => cambiarCantidad(Number(boton.dataset.idPlato), 1, ''),
  'restar':                 (boton) => cambiarCantidad(Number(boton.dataset.idPlato), -1, ''),
  'personalizado-abrir':    (boton) => { platoPersonalizando = Number(boton.dataset.idPlato); return true; },
  'personalizado-cancelar': () => { platoPersonalizando = null; return true; },
  'personalizado-agregar':  (boton) => agregarPersonalizado(Number(boton.dataset.idPlato), document.getElementById('texto-personalizado').value),
  'personalizado-sumar':    (boton) => cambiarPersonalizado(Number(boton.dataset.indice), 1),
  'personalizado-restar':   (boton) => cambiarPersonalizado(Number(boton.dataset.indice), -1),
  'armar-por-mi':           () => armarloPorMi(),
  'agregar-combo':          () => { confirmarCombo(); return false; },
  'cerrar':                 () => { cerrarVentanaCombo(false); return false; },
  'combo-salir':            () => { cerrarVentanaCombo(true); return false; },
  'combo-seguir':           () => { avisoSalir.hidden = true; botonAgregarCombo.hidden = false; return false; }
};

// El − y el + de un plato personalizado.
function cambiarPersonalizado(indice, cambio) {
  const renglon = platosElegidos.filter((r) => r.texto !== '')[indice];
  if (renglon === undefined) {
    return false;
  }
  return cambiarCantidad(renglon.idPlato, cambio, renglon.texto);
}

// Quién escucha los clics.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('combos').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion="armar-combo"]');
    if (!boton) {
      return;
    }
    const combo = combosDisponibles.find((c) => c.id === Number(boton.dataset.idCombo));
    if (combo === undefined) {
      return;
    }
    abrirVentanaCombo(combo);
  });

  ventanaCombo.addEventListener('click', (evento) => {
    if (evento.target === ventanaCombo) {
      cerrarVentanaCombo(false);
      return;
    }
    const hacer = BOTONES_DE_LA_VENTANA[evento.target.closest('[data-accion]')?.dataset.accion];
    if (hacer === undefined) {
      return;
    }
    const hayQueDibujar = hacer(evento.target.closest('[data-accion]'));
    if (hayQueDibujar) {
      renderizarVentanaCombo();
    }
  });

  ventanaCombo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    if (platoPersonalizando !== null) {
      platoPersonalizando = null;
      renderizarVentanaCombo();
      return;
    }
    cerrarVentanaCombo(false);
  });

  ventanaCombo.addEventListener('keydown', (evento) => {
    const esEnterEnElCampo = evento.key === 'Enter' && evento.target.id === 'texto-personalizado';
    if (!esEnterEnElCampo) {
      return;
    }
    evento.preventDefault();
    const seAgrego = agregarPersonalizado(platoPersonalizando, evento.target.value);
    if (seAgrego) {
      renderizarVentanaCombo();
    }
  });
});
