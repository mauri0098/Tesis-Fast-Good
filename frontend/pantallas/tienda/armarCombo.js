// ============================================================================
// armarCombo.js — La ventana "Armar combo": el cliente elige los platos de UN combo
//
// EL RECORRIDO:
//   "¡Lo quiero!" → abrirVentanaCombo → armarStockDePlatos → renderizarVentanaCombo
//   "+" / "−"     → contarPlato → renderizarVentanaCombo
//   "Agregar"     → agregarComboAlCarrito → Mi pedido → cerrarVentanaCombo
//
// Viene de otros archivos: combosDisponibles, armarFotoTarjeta, IMAGEN_POR_DEFECTO (renderizadoCatalogo.js)
//   · carritoCombos, agregarAlCarrito (carritoCombos.js) · escHtml, pastillaCodigo (escape.js)
// ============================================================================


// ---------- 1. LOS DATOS ----------
// Ejemplo: Keto x10 con Bondiola (hay 5, ya tiene 3 en Mi pedido) y Arroz (hay 10)

// comboEnArmado: el combo que tocó. Sale de: combosDisponibles
// Termina: { id: 13, nombre: "Keto x10", cantidad: 10, precio: 151000, menu: [Bondiola, Arroz] }
let comboEnArmado = null;

// platosDelCombo: los platos con su tope y lo que eligió. Sale de: armarStockDePlatos · Lo cambia: contarPlato
// Termina: [{ nombre: "Bondiola", tope: 2, cantidad: 2 }, { nombre: "Arroz", tope: 10, cantidad: 8 }]
let platosDelCombo = [];

// totalElegido: la suma de lo que eligió. Lo cambia: contarPlato
// Termina: 10 (2 + 8)
let totalElegido = 0;


// ---------- 2. LOS ELEMENTOS DEL HTML ----------

const ventanaCombo = document.getElementById('modal-combo');
const listaPlatosCombo = document.getElementById('lista-platos');
const botonAgregarCombo = document.getElementById('boton-agregar-combo');
const botonArmarPorMi = document.getElementById('boton-armar-por-mi');
const avisoSalir = document.getElementById('aviso-salir');


// ---------- 3. ARMAR ----------

// armarStockDePlatos → cuántas puede elegir de cada plato (heladera − Mi pedido)
// Usa: combo + carritoCombos
// Termina: [{ nombre: "Bondiola", tope: 2, cantidad: 0 }, { nombre: "Arroz", tope: 10, cantidad: 0 }]
function armarStockDePlatos(combo, carritoCombos) {
  // 1. Un contador por plato → { 6: 0, 9: 0 }
  const yaEnMiPedido = {};
  combo.menu.forEach((plato) => {
    yaEnMiPedido[plato.id] = 0;
  });

  // 2. Los platos de Mi pedido en una sola lista → [Bondiola x3]
  let platosDeMiPedido = [];
  carritoCombos.forEach((comboDeMiPedido) => {
    platosDeMiPedido = platosDeMiPedido.concat(comboDeMiPedido.platos);
  });

  // 3. Se suman los de este menú → { 6: 3, 9: 0 }
  platosDeMiPedido.forEach((platoDeMiPedido) => {
    const esDeEsteMenu = yaEnMiPedido[platoDeMiPedido.producto_id] !== undefined;
    const esPersonalizado = Boolean(platoDeMiPedido.personalizado);
    const noCuenta = !esDeEsteMenu || esPersonalizado;
    if (noCuenta) {
      return;
    }
    yaEnMiPedido[platoDeMiPedido.producto_id] = yaEnMiPedido[platoDeMiPedido.producto_id] + platoDeMiPedido.cantidad;
  });

  // 4. El tope de cada plato → Bondiola 5 − 3 = 2 · Arroz 10
  const platos = [];
  combo.menu.forEach((plato) => {
    let tope = plato.disponibles;
    const hayMenosQueElCombo = plato.disponibles < combo.cantidad;
    if (hayMenosQueElCombo) {
      tope = plato.disponibles - yaEnMiPedido[plato.id];
    }
    if (tope < 0) {
      tope = 0;
    }
    platos.push({
      id: plato.id,
      nombre: plato.nombre,
      codigo_plato: plato.codigo_plato,
      imagen: plato.imagen,
      tope: tope,
      sinStock: tope === 0,
      quedanPocas: tope > 0 && tope < combo.cantidad,
      cantidad: 0,
    });
  });
  return platos;
}


// ---------- 4. RENDERIZAR ----------

// renderizarVentanaCombo → dibuja toda la ventana
// Usa: comboEnArmado + platosDelCombo + totalElegido
// Termina: KETO · Bondiola − 2 + · Arroz − 8 + · "10 de 10" · "Agregar al pedido · $ 151.000"
function renderizarVentanaCombo(combo, platosDelCombo, totalElegido) {
  const completo = totalElegido === combo.cantidad;
  const precio = '$ ' + Number(combo.precio).toLocaleString('es-AR');

  // 1. Arriba: el plan, la foto, el nombre y el precio
  document.getElementById('modal-combo-plan').textContent = combo.plan;
  document.getElementById('modal-combo-titulo').textContent = `${combo.cantidad} viandas · ${precio}`;
  document.getElementById('armar-combo-foto').innerHTML = armarFotoTarjeta([combo], combo.plan_imagen, '');
  document.getElementById('armar-combo-nombre').textContent = combo.nombre;
  document.getElementById('armar-combo-precio').textContent = precio;
  document.getElementById('armar-combo-rotulo').textContent = `Elegí tus ${combo.cantidad} platos · podés repetir`;

  // 2. Los platos: stock, botones "−" y "+", y foto
  let contenidoHTML = '';
  platosDelCombo.forEach((plato) => {
    const nombre = escHtml(plato.nombre);
    const idPlato = escHtml(plato.id);
    const cantidad = escHtml(plato.cantidad);
    const codigoPlato = pastillaCodigo(plato.codigo_plato, plato.nombre);

    let avisoStock = '<p class="plato-quedan plato-hay-stock">Hay stock</p>';
    let claseAgotado = '';
    if (plato.sinStock) {
      avisoStock = '<p class="plato-quedan plato-sin-stock">Sin stock</p>';
      claseAgotado = ' plato-agotado';
    }
    if (plato.quedanPocas) {
      const topeSeguro = escHtml(plato.tope);
      avisoStock = `<p class="plato-quedan">Quedan ${topeSeguro}</p>`;
    }

    let claseElegido = '';
    let apagadoRestar = 'disabled';
    if (plato.cantidad > 0) {
      claseElegido = ' plato-elegido';
      apagadoRestar = '';
    }
    let apagadoSumar = 'disabled';
    const puedeSumar = !completo && plato.cantidad < plato.tope;
    if (puedeSumar) {
      apagadoSumar = '';
    }

    let imagen = IMAGEN_POR_DEFECTO;
    let claseLogo = ' foto-logo';
    if (plato.imagen) {
      imagen = plato.imagen;
      claseLogo = '';
    }
    const imagenSegura = escHtml(imagen);
    let fotoPlato = `<img class="foto${claseLogo}" src="${imagenSegura}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
    const sinFotoConCodigo = !plato.imagen && Boolean(plato.codigo_plato);
    if (sinFotoConCodigo) {
      const codigoSeguro = escHtml(plato.codigo_plato);
      fotoPlato = `<span class="foto foto-plato-codigo">${codigoSeguro}</span>`;
    }

    contenidoHTML += `
      <li class="plato${claseElegido}${claseAgotado}">
        ${fotoPlato}
        <div class="plato-datos">
          <h3>${codigoPlato}${nombre}</h3>
          ${avisoStock}
        </div>
        <div class="selector-cantidad">
          <button type="button" class="boton-cantidad" data-accion="restar" data-id-plato="${idPlato}"
                  aria-label="Sacar una de ${nombre}" ${apagadoRestar}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
          </button>
          <span class="numero-cantidad">${cantidad}</span>
          <button type="button" class="boton-cantidad boton-sumar" data-accion="sumar" data-id-plato="${idPlato}"
                  aria-label="Sumar una de ${nombre}" ${apagadoSumar}>
            <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
          </button>
        </div>
      </li>`;
  });
  listaPlatosCombo.innerHTML = contenidoHTML;

  // 3. Abajo: "7 de 10", la barra y los botones
  const faltan = combo.cantidad - totalElegido;
  let palabraPlatos = 'platos';
  if (faltan === 1) {
    palabraPlatos = 'plato';
  }
  let textoBoton = `Elegí ${faltan} ${palabraPlatos} más`;
  if (completo) {
    textoBoton = 'Agregar al pedido · ' + precio;
  }
  document.getElementById('modal-combo-cuenta').textContent = `${totalElegido} de ${combo.cantidad}`;
  document.getElementById('modal-combo-falta').textContent = `Elegí ${combo.cantidad} platos`;
  botonAgregarCombo.textContent = textoBoton;

  const progreso = document.getElementById('modal-combo-progreso');
  if (completo) {
    progreso.classList.add('progreso-completo');
  } else {
    progreso.classList.remove('progreso-completo');
  }
  const barra = document.getElementById('modal-combo-barra');
  barra.setAttribute('aria-valuemax', combo.cantidad);
  barra.setAttribute('aria-valuenow', totalElegido);
  document.getElementById('modal-combo-relleno').style.transform = 'scaleX(' + (totalElegido / combo.cantidad) + ')';

  botonAgregarCombo.disabled = !completo;
  botonArmarPorMi.disabled = completo;
}


// ---------- 5. LOS EVENTOS ----------

// abrirVentanaCombo → llena los datos, dibuja y abre
// Usa: combo (de combosDisponibles) + carritoCombos
// Termina: comboEnArmado = Keto x10 · platosDelCombo = [Bondiola 0, Arroz 0] · totalElegido = 0
function abrirVentanaCombo(combo) {
  // 1. Se llenan los datos
  comboEnArmado = combo;
  platosDelCombo = armarStockDePlatos(combo, carritoCombos);
  totalElegido = 0;

  // 2. Se dibuja y se abre
  renderizarVentanaCombo(comboEnArmado, platosDelCombo, totalElegido);
  botonAgregarCombo.hidden = false;
  avisoSalir.hidden = true;
  ventanaCombo.showModal();
}

// contarPlato → +1 o −1 a un plato, si no pasa su tope ni el combo
// Usa: platosDelCombo + totalElegido + comboEnArmado
// Termina: "+" en Bondiola → Bondiola 1 → 2 · totalElegido 9 → 10
function contarPlato(idPlato, cuenta) {
  // 1. Se busca el plato
  const plato = platosDelCombo.find((platoDelCombo) => platoDelCombo.id === idPlato);
  if (!plato) {
    return;
  }

  // 2. ¿Se puede?
  const nuevaCantidad = plato.cantidad + cuenta;
  const nuevoTotal = totalElegido + cuenta;
  const quedariaNegativo = nuevaCantidad < 0;
  const pasaElTope = nuevaCantidad > plato.tope;
  const pasaElCombo = nuevoTotal > comboEnArmado.cantidad;
  const noSePuede = quedariaNegativo || pasaElTope || pasaElCombo;
  if (noSePuede) {
    return;
  }

  // 3. Se guarda y se dibuja
  plato.cantidad = nuevaCantidad;
  totalElegido = nuevoTotal;
  renderizarVentanaCombo(comboEnArmado, platosDelCombo, totalElegido);
}

// agregarComboAlCarrito → manda el combo a Mi pedido y cierra
// Usa: comboEnArmado + platosDelCombo
// Termina: Mi pedido recibe { id_combo: 13, cantidad: 10, platos: [Bondiola 2, Arroz 8] }
function agregarComboAlCarrito() {
  // 1. ¿Está completo?
  const faltanPlatos = totalElegido !== comboEnArmado.cantidad;
  if (faltanPlatos) {
    return;
  }

  // 2. Solo los platos que eligió
  const platos = [];
  platosDelCombo.forEach((plato) => {
    if (plato.cantidad === 0) {
      return;
    }
    platos.push({ producto_id: plato.id, nombre: plato.nombre, cantidad: plato.cantidad, personalizado: null });
  });

  // 3. A Mi pedido y se cierra
  agregarAlCarrito({
    id_combo: comboEnArmado.id,
    nombre:   comboEnArmado.nombre,
    precio:   comboEnArmado.precio,
    cantidad: comboEnArmado.cantidad,
    platos:   platos
  });
  cerrarVentanaCombo(true);
}

// cerrarVentanaCombo → cierra y vacía los datos (si eligió algo, primero pregunta "¿salís?")
// Usa: totalElegido + comboEnArmado
// Termina: comboEnArmado = null · platosDelCombo = [] · totalElegido = 0
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
  platosDelCombo = [];
  totalElegido = 0;
}

document.addEventListener('DOMContentLoaded', () => {
  // "¡Lo quiero!" → busca el combo en combosDisponibles → abrirVentanaCombo
  document.getElementById('cantidad-productos').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion="armar-combo"]');
    if (!boton) {
      return;
    }
    const combo = combosDisponibles.find((comboDisponible) => comboDisponible.id === Number(boton.dataset.idCombo));
    if (combo === undefined) {
      return;
    }
    abrirVentanaCombo(combo);
  });

  // Los botones de la ventana
  ventanaCombo.addEventListener('click', (evento) => {
    if (evento.target === ventanaCombo) {
      cerrarVentanaCombo(false);
      return;
    }
    const boton = evento.target.closest('[data-accion]');
    if (!boton) {
      return;
    }
    const idPlato = Number(boton.dataset.idPlato);

    switch (boton.dataset.accion) {
      case 'sumar':          // "+"
        contarPlato(idPlato, 1);
        break;
      case 'restar':         // "−"
        contarPlato(idPlato, -1);
        break;
      case 'armar-por-mi':   // "Armalo por mí": +1 a cada plato, vuelta por vuelta, hasta completar
        Array.from({ length: comboEnArmado.cantidad }).forEach(() => {
          platosDelCombo.forEach((plato) => {
            contarPlato(plato.id, 1);
          });
        });
        break;
      case 'agregar-combo':  // "Agregar al pedido"
        agregarComboAlCarrito();
        break;
      case 'cerrar':         // la X
        cerrarVentanaCombo(false);
        break;
      case 'combo-salir':    // "Salir"
        cerrarVentanaCombo(true);
        break;
      case 'combo-seguir':   // "Seguir armando"
        avisoSalir.hidden = true;
        botonAgregarCombo.hidden = false;
        break;
    }
  });

  // Esc
  ventanaCombo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    cerrarVentanaCombo(false);
  });
});
