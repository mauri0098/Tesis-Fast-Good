// ====================================================================
// ARMARCOMBO.JS — Ventana "X de N" para armar un combo (index-combos.html)
//
// Funciones:
//   abrirModalCombo              → abre la ventana con el menú de un combo, con todo en 0, y calcula
//                                  el tope de cada plato (descontando lo que ya está en el carrito)
//   renderizarMenuCombo          → dibuja los platos con sus botones − / +, los personalizados,
//                                  el "X de N", la barra y si se puede agregar al pedido
//   cambiarCantidadPlato         → suma o resta 1 vianda de heladera de un plato, respetando los límites
//   agregarPlatoPersonalizado    → suma 1 vianda personalizada (plato + texto, ej: "sin sal")
//   cambiarCantidadPersonalizado → suma o resta 1 a un renglón personalizado (en 0 desaparece)
//   confirmarCombo               → arma el combo elegido y lo manda al carrito
//   cerrarModalCombo             → pregunta "¿Salir?" si hay platos elegidos; si no, cierra y limpia
//
// Personalizado: mismo precio, NO sale de la heladera (no tiene tope de stock), va a cocina
// y se entrega 1 día hábil más tarde. Un renglón personalizado = un plato + un texto.
//
// Necesita antes: escape.js (escHtml) y combosCatalogo.js (combosDisponibles, IMAGEN_POR_DEFECTO).
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

  // Tope de cada plato. Si quedan MENOS viandas que las del combo, el número que mandó el servidor
  // es exacto: se le restan las de heladera que ya están en el carrito (las personalizadas no cuentan,
  // no salen de la heladera). Si quedan muchas, el servidor manda el número con tope y no se resta:
  // si al final no alcanzaran, el servidor lo frena al crear el pedido.
  topePorPlato = {};
  for (const plato of combo.menu) {
    let tope = plato.disponibles;

    if (plato.disponibles < combo.cantidad && typeof carritoCombos !== 'undefined') {
      let enCarrito = 0;
      for (const comboDelCarrito of carritoCombos) {
        for (const platoDelCarrito of comboDelCarrito.platos) {
          if (platoDelCarrito.producto_id === plato.id && !platoDelCarrito.personalizado) {
            enCarrito = enCarrito + platoDelCarrito.cantidad;
          }
        }
      }
      tope = Math.max(0, plato.disponibles - enCarrito);
    }

    topePorPlato[plato.id] = tope;
  }

  // Encabezado (textContent muestra el texto tal cual, no hace falta escHtml)
  document.getElementById('mc-cat').textContent = combo.categoria.nombre + ' · ' + combo.plan;
  document.getElementById('mc-titulo').textContent = combo.nombre;

  // Pie: se ve el botón "Agregar", no el "¿Salir?"
  document.getElementById('mc-agregar').hidden = false;
  document.getElementById('mc-salir').hidden = true;

  renderizarMenuCombo();
  document.getElementById('modal-combo').showModal();
}

// ── Dibuja los platos, el progreso y el botón de agregar ──────────────────
function renderizarMenuCombo() {
  const lista = document.getElementById('mc-platos');
  const cantidadDelCombo = comboEnArmado.cantidad;
  const completo = totalElegido === cantidadDelCombo;

  let html = '';
  for (const plato of comboEnArmado.menu) {
    const cantidad = cantidadesElegidas[plato.id] || 0;

    // Se puede sumar si el combo no está completo y quedan viandas de ese plato
    const tope = topePorPlato[plato.id];
    const puedeSumar = !completo && cantidad < tope;
    const puedeRestar = cantidad > 0;

    // Aviso de stock: solo si hay menos viandas que las del combo
    let avisoStock = '';
    if (tope === 0) {
      avisoStock = '<span class="plato__aviso">Sin stock · podés pedirlo personalizado</span>';
    } else if (tope < cantidadDelCombo) {
      avisoStock = `<span class="plato__aviso">Quedan ${escHtml(tope)}</span>`;
    }

    // Descripción solo si tiene
    let descripcion = '';
    if (plato.descripcion) {
      descripcion = `<p class="plato__desc">${escHtml(plato.descripcion)}</p>`;
    }

    // Imagen del plato o la de por defecto (también si no carga)
    const imagen = plato.imagen || IMAGEN_POR_DEFECTO;

    html += `
      <li class="plato${cantidad > 0 ? ' plato--elegido' : ''}">
        <img class="plato__img" src="${escHtml(imagen)}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}';">
        <div class="plato__info">
          <p class="plato__nombre">${escHtml(plato.nombre)}</p>
          ${descripcion}
          ${avisoStock}
        </div>
        <div class="plato__contador">
          <button type="button" class="plato__btn" data-accion="restar" data-id-plato="${escHtml(plato.id)}"
                  aria-label="Sacar una de ${escHtml(plato.nombre)}" ${puedeRestar ? '' : 'disabled'}>−</button>
          <span class="plato__cantidad">${cantidad}</span>
          <button type="button" class="plato__btn" data-accion="sumar" data-id-plato="${escHtml(plato.id)}"
                  aria-label="Sumar una de ${escHtml(plato.nombre)}" ${puedeSumar ? '' : 'disabled'}>+</button>
        </div>
        <div class="plato__extra">`;

    // Renglones personalizados de este plato. El índice es su posición en "personalizados".
    personalizados.forEach((renglon, indice) => {
      if (renglon.idPlato !== plato.id) return;
      html += `
          <div class="personalizado">
            <span class="personalizado__texto">⚠ ${escHtml(renglon.texto)}</span>
            <div class="plato__contador">
              <button type="button" class="plato__btn" data-accion="personalizado-restar" data-indice="${indice}"
                      aria-label="Sacar una personalizada">−</button>
              <span class="plato__cantidad">${renglon.cantidad}</span>
              <button type="button" class="plato__btn" data-accion="personalizado-sumar" data-indice="${indice}"
                      aria-label="Sumar una personalizada" ${completo ? 'disabled' : ''}>+</button>
            </div>
          </div>`;
    });

    // Campo de texto (solo en el plato que se está personalizando) o el botón para abrirlo
    if (platoPersonalizando === plato.id) {
      html += `
          <div class="personalizar">
            <input type="text" class="personalizar__input" id="mc-texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal"
                   aria-label="Cómo querés ${escHtml(plato.nombre)}">
            <button type="button" class="btn btn--primario" data-accion="personalizado-agregar"
                    data-id-plato="${escHtml(plato.id)}" ${completo ? 'disabled' : ''}>Agregar</button>
            <button type="button" class="btn btn--secundario" data-accion="personalizado-cancelar">Cancelar</button>
          </div>`;
    } else {
      html += `
          <button type="button" class="enlace-personalizar" data-accion="personalizado-abrir"
                  data-id-plato="${escHtml(plato.id)}" ${completo ? 'disabled' : ''}>✎ Personalizar</button>`;
    }

    html += `
        </div>
      </li>`;
  }

  // Aviso de entrega: solo si hay algún plato personalizado
  if (personalizados.length > 0) {
    html += `
      <li class="aviso-personalizado">
        Los platos personalizados se cocinan aparte: se entregan 1 día hábil más tarde.
      </li>`;
  }
  lista.innerHTML = html;

  // Si el campo de texto está abierto, el cursor va directo ahí
  const campoTexto = document.getElementById('mc-texto-personalizado');
  if (campoTexto) {
    campoTexto.focus();
  }

  // Progreso: "3 de 10" y "Te faltan 7"
  const faltan = cantidadDelCombo - totalElegido;
  document.getElementById('mc-cuenta').textContent = `${totalElegido} de ${cantidadDelCombo}`;
  if (faltan > 0) {
    document.getElementById('mc-falta').textContent = `Te faltan ${faltan}`;
  } else {
    document.getElementById('mc-falta').textContent = '¡Combo completo!';
  }

  // Barra: el ancho del relleno es el porcentaje elegido
  const barra = document.getElementById('mc-barra');
  barra.setAttribute('aria-valuemax', cantidadDelCombo);
  barra.setAttribute('aria-valuenow', totalElegido);
  document.getElementById('mc-relleno').style.width = (totalElegido / cantidadDelCombo * 100) + '%';

  // "Agregar al pedido" se activa solo con el combo justo
  document.getElementById('mc-agregar').disabled = !completo;
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

// ── Suma 1 vianda personalizada de un plato (ej: fideos "sin sal") ────────
// No tiene tope de stock: no sale de la heladera. El único tope es la cantidad del combo.
function agregarPlatoPersonalizado(idPlato, texto) {
  // El plato tiene que estar en el menú de este combo
  const plato = comboEnArmado.menu.find(p => p.id === idPlato);
  if (!plato) return;

  // Texto sin espacios de más, no vacío y no más largo que el máximo
  const textoLimpio = String(texto || '').trim();
  if (textoLimpio === '' || textoLimpio.length > LARGO_MAXIMO_PERSONALIZADO) {
    const campoTexto = document.getElementById('mc-texto-personalizado');
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
  for (const plato of comboEnArmado.menu) {
    const cantidad = cantidadesElegidas[plato.id] || 0;
    if (cantidad > 0) {
      platos.push({ producto_id: plato.id, nombre: plato.nombre, cantidad: cantidad, personalizado: null });
    }
  }

  // Los personalizados van como platos aparte, con su texto
  for (const renglon of personalizados) {
    platos.push({ producto_id: renglon.idPlato, nombre: renglon.nombre, cantidad: renglon.cantidad, personalizado: renglon.texto });
  }

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
  const botonAgregar = document.getElementById('mc-agregar');
  const bloqueSalir = document.getElementById('mc-salir');

  // Hay platos elegidos y no se pidió cerrar igual: se pregunta "¿Salir?"
  if (!forzar && totalElegido > 0) {
    document.getElementById('mc-salir-texto').textContent =
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
      agregarPlatoPersonalizado(Number(boton.dataset.idPlato), document.getElementById('mc-texto-personalizado').value);
    } else if (accion === 'personalizado-sumar') {
      cambiarCantidadPersonalizado(Number(boton.dataset.indice), 1);
    } else if (accion === 'personalizado-restar') {
      cambiarCantidadPersonalizado(Number(boton.dataset.indice), -1);
    } else if (accion === 'agregar-combo') {
      confirmarCombo();
    } else if (accion === 'cerrar') {
      cerrarModalCombo(false);
    } else if (accion === 'combo-salir') {
      cerrarModalCombo(true);
    } else if (accion === 'combo-seguir') {
      // Vuelve a armar: se esconde el "¿Salir?" y vuelve el botón de agregar
      document.getElementById('mc-salir').hidden = true;
      document.getElementById('mc-agregar').hidden = false;
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
    if (evento.key === 'Enter' && evento.target.id === 'mc-texto-personalizado') {
      evento.preventDefault();
      agregarPlatoPersonalizado(platoPersonalizando, evento.target.value);
    }
  });
});
