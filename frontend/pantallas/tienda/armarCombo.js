// armarCombo.js — La ventana donde el cliente elige los platos de un combo
let comboEnArmado = null;

// EL ARRAY de los platos que va eligiendo el cliente
let platosElegidos = [];

let totalElegido = 0;
let platoPersonalizando = null;
let topePorPlato = {};

const LARGO_MAXIMO_PERSONALIZADO = 150;

const ATRIBUTO_APAGADO = { true: '', false: 'disabled' };
const CLASE_PLATO_ELEGIDO = { true: ' plato-elegido', false: '' };

const ventanaCombo = document.getElementById('modal-combo');
const listaPlatosCombo = document.getElementById('lista-platos');
const botonAgregarCombo = document.getElementById('boton-agregar-combo');
const botonArmarPorMi = document.getElementById('boton-armar-por-mi');
const avisoSalir = document.getElementById('aviso-salir');

function abrirVentanaCombo(combo) {
  comboEnArmado = combo;
  platosElegidos = [];
  totalElegido = 0;
  platoPersonalizando = null;

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

  topePorPlato = {};
  combo.menu.forEach((plato) => {
    let tope = plato.disponibles;
    if (plato.disponibles < combo.cantidad) {
      tope = Math.max(0, plato.disponibles - enCarritoPorPlato[plato.id]);
    }
    topePorPlato[plato.id] = tope;
  });

  // (13/11, diseño nuevo) Arriba el plan chiquito en gris y abajo "10 viandas · $ 137.000"
  const precioEncabezado = '$ ' + Number(combo.precio).toLocaleString('es-AR');
  document.getElementById('modal-combo-plan').textContent = combo.plan;
  document.getElementById('modal-combo-titulo').textContent = `${combo.cantidad} viandas · ${precioEncabezado}`;
  document.getElementById('armar-combo-foto').innerHTML = armarFotoTarjeta([combo], combo.plan_imagen, '');
  document.getElementById('armar-combo-nombre').textContent = combo.nombre;
  document.getElementById('armar-combo-precio').textContent = '$ ' + Number(combo.precio).toLocaleString('es-AR');
  document.getElementById('armar-combo-rotulo').textContent = `Elegí tus ${combo.cantidad} platos · podés repetir`;
  botonAgregarCombo.hidden = false;
  avisoSalir.hidden = true;

  renderizarVentanaCombo();
  ventanaCombo.showModal();
}

function renderizarVentanaCombo() {
  const cantidadDelCombo = comboEnArmado.cantidad;
  const completo = totalElegido === cantidadDelCombo;
  const apagadoSiCompleto = ATRIBUTO_APAGADO[!completo];

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

    // (13/11, diseño nuevo) Aviso de stock: "Hay stock" en gris, "Quedan N" en verde o "Sin stock" en rojo
    let avisoStock = '<p class="plato-quedan plato-hay-stock">Hay stock</p>';
    let claseAgotado = '';
    if (tope === 0) { // ¿no queda ninguna? SÍ: 0 · NO: 3
      // Personalizado no sale de la heladera: se puede pedir igual
      avisoStock = '<p class="plato-quedan plato-sin-stock">Sin stock · podés pedirlo personalizado</p>';
      claseAgotado = ' plato-agotado';
    }
    if (quedanPocas) { // ¿quedan menos que las del combo? SÍ: 3 de un x10 · NO: 12 de un x10
      avisoStock = `<p class="plato-quedan">Quedan ${escHtml(tope)}</p>`;
    }
    const imagen = escHtml({ true: plato.imagen, false: IMAGEN_POR_DEFECTO }[tieneFoto]);
    const claseLogo = { true: '', false: ' foto-logo' }[tieneFoto];
    const codigoPlato = pastillaCodigo(plato.codigo_plato, plato.nombre);
    // (13/11) Sin foto pero con código: un cuadradito con el código ("F1") en vez del logo
    let fotoPlato = `<img class="foto${claseLogo}" src="${imagen}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
    const sinFotoConCodigo = !tieneFoto && Boolean(plato.codigo_plato);
    if (sinFotoConCodigo) { // ¿no tiene foto y sí código? SÍ: sin foto y "F1" · NO: con foto
      fotoPlato = `<span class="foto foto-plato-codigo">${escHtml(plato.codigo_plato)}</span>`;
    }

    const campoPersonalizar = `
          <div class="personalizar-plato">
            <input type="text" class="casillero" id="texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal, sin cebolla"
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
      <li class="plato${CLASE_PLATO_ELEGIDO[tieneElegidas]}${claseAgotado}">
        ${fotoPlato}
        <div class="plato-datos">
          <h3>${codigoPlato}${nombre}</h3>
          ${avisoStock}
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
        Los platos personalizados se cocinan aparte: te llegan un día hábil más tarde
        (si pedís un martes, se cocina el miércoles y te llega desde el jueves).
      </li>`, false: '' }[hayPersonalizados];
  // ACÁ SE RENDERIZAN los platos del combo
  listaPlatosCombo.innerHTML = contenidoHTML;

  const campoTexto = document.getElementById('texto-personalizado');
  if (campoTexto) {
    campoTexto.focus();
  }

  const faltan = cantidadDelCombo - totalElegido;
  // (13/11, diseño nuevo) Los mismos textos en compu y celu: a la izquierda "Elegí 10 platos", a la derecha "7 de 10";
  // el botón dice "Elegí 3 platos más" o, con el combo completo, "Agregar al pedido · $ 137.000"
  const palabraPlatos = { true: 'plato', false: 'platos' }[faltan === 1];
  const precioDelCombo = '$ ' + Number(comboEnArmado.precio).toLocaleString('es-AR');
  let textoBoton = `Elegí ${faltan} ${palabraPlatos} más`;
  if (completo) { // ¿ya eligió todos? SÍ: 10 de 10 · NO: 7 de 10
    textoBoton = 'Agregar al pedido · ' + precioDelCombo;
  }
  document.getElementById('modal-combo-cuenta').textContent = `${totalElegido} de ${cantidadDelCombo}`;
  document.getElementById('modal-combo-falta').textContent = `Elegí ${cantidadDelCombo} platos`;
  botonAgregarCombo.textContent = textoBoton;

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

function cambiarCantidad(idPlato, cambio, texto) {
  const plato = comboEnArmado.menu.find((p) => p.id === idPlato);
  let renglon = platosElegidos.find((r) => r.idPlato === idPlato && r.texto.toLowerCase() === texto.toLowerCase());
  const esNuevo = renglon === undefined;
  if (esNuevo) {
    renglon = { idPlato: idPlato, nombre: plato?.nombre, texto: texto, cantidad: 0 };
  }

  const nuevaCantidad = renglon.cantidad + cambio;
  const noEstaEnElMenu = plato === undefined;
  const quedariaNegativo = nuevaCantidad < 0;
  const pasaElTope = texto === '' && nuevaCantidad > topePorPlato[idPlato];
  const pasaElCombo = totalElegido + cambio > comboEnArmado.cantidad;
  const noSePuede = noEstaEnElMenu || quedariaNegativo || pasaElTope || pasaElCombo;
  if (noSePuede) {
    return false;
  }

  if (esNuevo) {
    // ACÁ SE PUSHEA: el plato elegido se agrega al array platosElegidos
    platosElegidos.push(renglon);
  }
  renglon.cantidad = nuevaCantidad;
  totalElegido = totalElegido + cambio;
  platosElegidos = platosElegidos.filter((r) => r.cantidad > 0);
  return true;
}

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

function confirmarCombo() {
  const comboCompleto = comboEnArmado !== null && totalElegido === comboEnArmado.cantidad;
  if (!comboCompleto) {
    return;
  }

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

  // ACÁ SE PASA AL CARRITO (carritoCombos.js)
  agregarAlCarrito({
    id_combo: comboEnArmado.id,
    nombre:   comboEnArmado.nombre,
    precio:   comboEnArmado.precio,
    cantidad: comboEnArmado.cantidad,
    platos:   platos
  });
  cerrarVentanaCombo(true);
}

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

function cambiarPersonalizado(indice, cambio) {
  const renglon = platosElegidos.filter((r) => r.texto !== '')[indice];
  if (renglon === undefined) {
    return false;
  }
  return cambiarCantidad(renglon.idPlato, cambio, renglon.texto);
}

document.addEventListener('DOMContentLoaded', () => {
  // ACÁ SE ABRE LA VENTANA: tocaron "¡Lo quiero!" (los platos ya vienen en combo.menu)
  document.getElementById('cantidad-productos').addEventListener('click', (evento) => {
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
