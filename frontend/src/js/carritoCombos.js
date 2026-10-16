// ====================================================================
// CARRITOCOMBOS.JS — Carrito de combos ("Mi pedido") de index.html
//
// Funciones:
//   cargarCarrito    → lee el carrito guardado en el navegador (localStorage) y descarta lo que esté roto
//   guardarCarrito   → guarda el carrito en el navegador (se llama en cada cambio)
//   agregarAlCarrito → suma un combo armado, guarda y abre "Mi pedido"
//   quitarDelCarrito → saca un combo, guarda y vuelve a dibujar
//   renderizarCarrito→ dibuja los combos con sus platos, el total, el número del ícono y el botón Finalizar
//   abrirMiPedido    → dibuja el carrito y abre la ventana "Mi pedido"
//
// Cada combo es un elemento aparte, aunque sea igual a otro (en la base, cada combo comprado
// es una fila de pedido_combos con sus propias viandas). El ícono cuenta combos, no viandas.
// El total es solo para mostrar: el que se cobra lo calcula el servidor desde la base.
// Necesita antes: escape.js (escHtml).
// ====================================================================

// Clave en localStorage (distinta de la del carrito viejo, FG_CARRITO_ACTUAL, para no mezclarlos)
const CLAVE_CARRITO = 'FG_CARRITO_COMBOS';

// Combos del carrito: [{ id_combo, nombre, precio, cantidad, platos: [{ producto_id, nombre, cantidad, personalizado }] }]
let carritoCombos = [];

// ── Lee el carrito guardado en el navegador ───────────────────────────────
function cargarCarrito() {
  let guardado = [];
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
  } catch (error) {
    // Texto roto o el navegador no deja leer: se arranca vacío
    console.warn('No se pudo leer el carrito guardado:', error);
    guardado = [];
  }
  if (!Array.isArray(guardado)) {
    guardado = [];
  }

  // Solo se quedan los combos con la forma esperada (cualquiera puede editar localStorage)
  carritoCombos = [];
  guardado.forEach(combo => {
    // Sin id de combo entero o sin lista de platos: return = saltear este y seguir con el siguiente
    const formaDeCombo = combo && Number.isInteger(combo.id_combo) && Array.isArray(combo.platos);
    if (!formaDeCombo) return;

    // every responde true solo si TODOS los de la lista cumplen la condición.
    // Ejemplo: [{ producto_id: 5, cantidad: 3 }, { producto_id: 3, cantidad: 7 }]  → true
    //          [{ producto_id: 5, cantidad: 3 }, { producto_id: 3, cantidad: -2 }] → false
    const platosBien = combo.platos.every(plato =>
      plato && Number.isInteger(plato.producto_id) && Number.isInteger(plato.cantidad) && plato.cantidad > 0
    );
    // Algún plato roto: return = saltear este combo y seguir con el siguiente
    if (!platosBien) return;

    carritoCombos.push(combo);
  });

  renderizarCarrito();
}

// ── Guarda el carrito en el navegador ─────────────────────────────────────
function guardarCarrito() {
  try {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carritoCombos));
  } catch (error) {
    // Por ejemplo, en modo privado: el carrito sigue andando mientras no se recargue la página
    console.warn('No se pudo guardar el carrito:', error);
  }
}

// ── Suma un combo armado (lo llama confirmarCombo, de armarCombo.js) ──────
function agregarAlCarrito(comboArmado) {
  carritoCombos.push(comboArmado);
  guardarCarrito();
  abrirMiPedido();
}

// ── Saca el combo de esa posición ─────────────────────────────────────────
function quitarDelCarrito(indice) {
  if (indice < 0 || indice >= carritoCombos.length) return;
  carritoCombos.splice(indice, 1);
  guardarCarrito();
  renderizarCarrito();
}

// ── Dibuja "Mi pedido" y el número del ícono ──────────────────────────────
// ENTRADA: nada (usa carritoCombos)
// SALIDA:  nada (dibuja en #modal-pedido-combos un renglón por combo, o el aviso de vacío; escribe el total,
//          el número del ícono y prende o apaga "Finalizar pedido")
// Ej: [Mantenimiento x10 de $ 137.000 con 8 fideos y 2 fideos "sin sal"] → "Mantenimiento x10 · $ 137.000",
//     "8 × fideos", "2 × fideos · ⚠ sin sal", "$ 13.700 c/u" y "Quitar"; total $ 137.000 y el ícono en 1
function renderizarCarrito() {
  const cuerpo = document.getElementById('modal-pedido-combos');
  let total = 0;
  let html = '';

  // Carrito vacío: el aviso de siempre, con el ícono de la bolsa
  if (carritoCombos.length === 0) {
    html = `
      <div class="pedido-vacio">
        <span class="pedido-vacio-icono" aria-hidden="true"><svg class="icono"><use href="#icono-bolsa"></use></svg></span>
        <p>Todavía no agregaste combos.</p>
      </div>`;
  }

  carritoCombos.forEach((combo, indice) => {
    const precio = Number(combo.precio) || 0;
    total = total + precio;

    // Precio de cada vianda (ej: $ 137.000 / 10 = $ 13.700 c/u). Si el combo guardado no trae
    // su cantidad (alguien tocó lo guardado en el navegador), no se muestra.
    const viandas = Number(combo.cantidad) || 0;
    const tieneViandas = viandas > 0;
    const textoPorVianda = tieneViandas ? '$ ' + Math.round(precio / viandas).toLocaleString('es-AR') + ' c/u' : '';

    // Los platos del combo, uno por renglón; los personalizados con " · ⚠ " y su texto.
    // map arma una lista nueva con un <li> por plato y join la une en un solo texto.
    // Ej: entra [{ cantidad: 8, nombre: 'fideos' }, { cantidad: 2, nombre: 'fideos', personalizado: 'sin sal' }]
    //     sale  '<li>8 × fideos</li><li>2 × fideos · ⚠ sin sal</li>'
    const platosHtml = combo.platos.map(plato => {
      const textoPersonalizado = plato.personalizado ? ' · ⚠ ' + escHtml(plato.personalizado) : '';  // solo el personalizado
      return '<li>' + escHtml(plato.cantidad) + ' × ' + escHtml(plato.nombre) + textoPersonalizado + '</li>';
    }).join('');

    html += `
      <div class="combo-del-pedido">
        <div class="nombre-y-precio">
          <span class="combo-nombre">${escHtml(combo.nombre)}</span>
          <span class="combo-precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
        </div>
        <ul class="combo-platos">${platosHtml}</ul>
        <div class="combo-acciones">
          <span class="combo-precio-vianda">${escHtml(textoPorVianda)}</span>
          <button type="button" class="boton-quitar" data-accion="quitar-combo" data-indice="${indice}"
                  aria-label="Quitar ${escHtml(combo.nombre)} del pedido">Quitar</button>
        </div>
      </div>`;
  });

  cuerpo.innerHTML = html;

  // Total, número del ícono (cuenta combos) y botón Finalizar (apagado con el carrito vacío)
  document.getElementById('modal-pedido-total').textContent = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('contador-combos').textContent = carritoCombos.length;
  document.getElementById('boton-finalizar-pedido').disabled = carritoCombos.length === 0;
}

// ── Abre la ventana "Mi pedido" ───────────────────────────────────────────
function abrirMiPedido() {
  renderizarCarrito();
  const ventana = document.getElementById('modal-pedido');
  if (!ventana.open) {
    ventana.showModal();
  }
}

// ── Al cargar la página ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ventana = document.getElementById('modal-pedido');

  // El carrito guardado (si había) y el número del ícono
  cargarCarrito();

  // Botón "Mi pedido" del encabezado
  document.getElementById('boton-mi-pedido').addEventListener('click', abrirMiPedido);

  // Botones de la ventana
  ventana.addEventListener('click', evento => {
    // Clic en el fondo oscuro (fuera de la ventana): cierra
    if (evento.target === ventana) {
      ventana.close();
      return;
    }

    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;

    if (boton.dataset.accion === 'cerrar') {
      ventana.close();
    } else if (boton.dataset.accion === 'quitar-combo') {
      quitarDelCarrito(Number(boton.dataset.indice));
    }
    // "Finalizar pedido" se conecta en el paso del formulario
  });
});
