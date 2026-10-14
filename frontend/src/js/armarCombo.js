// ====================================================================
// ARMARCOMBO.JS — Ventana "X de N" para armar un combo (index-combos.html)
//
// Funciones:
//   abrirModalCombo      → abre la ventana con el menú de un combo, con todo en 0
//   renderizarMenuCombo  → dibuja los platos con sus botones − / +, el "X de N", la barra
//                          y si se puede agregar al pedido
//   cambiarCantidadPlato → suma o resta 1 a un plato, solo si se respetan los límites
//   confirmarCombo       → arma el combo elegido y lo manda al carrito
//   cerrarModalCombo     → pregunta "¿Salir?" si hay platos elegidos; si no, cierra y limpia
//
// Necesita antes: escape.js (escHtml) y combosCatalogo.js (combosDisponibles, IMAGEN_POR_DEFECTO).
// Los límites de acá son una AYUDA para el cliente: el servidor los vuelve a controlar
// todos al crear el pedido.
// ====================================================================

// Combo que se está armando (uno de combosDisponibles). null = ventana cerrada
let comboEnArmado = null;

// Cuántas viandas eligió de cada plato: { idPlato: cantidad }
let cantidadesElegidas = {};

// Suma de todas las viandas elegidas (para no recorrer la lista cada vez)
let totalElegido = 0;

// ── Abre la ventana con el menú de un combo ───────────────────────────────
function abrirModalCombo(idCombo) {
  // El id sale de un botón de la página: se busca en lo que mandó el servidor
  const combo = combosDisponibles.find(c => c.id === idCombo);
  if (!combo) return;

  // Arranca de cero
  comboEnArmado = combo;
  cantidadesElegidas = {};
  totalElegido = 0;

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
    const puedeSumar = !completo && cantidad < plato.disponibles;
    const puedeRestar = cantidad > 0;

    // Aviso de stock: solo si hay menos viandas que las del combo
    let avisoStock = '';
    if (plato.disponibles === 0) {
      avisoStock = '<span class="plato__aviso">Sin stock</span>';
    } else if (plato.disponibles < cantidadDelCombo) {
      avisoStock = `<span class="plato__aviso">Quedan ${escHtml(plato.disponibles)}</span>`;
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
      </li>`;
  }
  lista.innerHTML = html;

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
  if (nuevaCantidad > plato.disponibles) return;
  if (totalElegido + cambio > comboEnArmado.cantidad) return;

  cantidadesElegidas[idPlato] = nuevaCantidad;
  totalElegido = totalElegido + cambio;
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

  // Tecla Escape: el navegador cerraría la ventana; se frena para preguntar antes
  modal.addEventListener('cancel', evento => {
    evento.preventDefault();
    cerrarModalCombo(false);
  });
});
