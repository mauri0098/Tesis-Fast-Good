// ====================================================================
// CARRITOCOMBOS.JS — Carrito de combos ("Mi pedido") de index-combos.html
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
  for (const combo of guardado) {
    const formaDeCombo = combo && Number.isInteger(combo.id_combo) && Array.isArray(combo.platos);
    if (!formaDeCombo) continue;

    const platosBien = combo.platos.every(plato =>
      plato && Number.isInteger(plato.producto_id) && Number.isInteger(plato.cantidad) && plato.cantidad > 0
    );
    if (!platosBien) continue;

    carritoCombos.push(combo);
  }

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
function renderizarCarrito() {
  const cuerpo = document.getElementById('mp-cuerpo');
  let total = 0;
  let html = '';

  if (carritoCombos.length === 0) {
    html = '<p class="aviso-vacio">Todavía no agregaste combos.</p>';
  }

  carritoCombos.forEach((combo, indice) => {
    const precio = Number(combo.precio) || 0;
    total = total + precio;

    // Los platos del combo; los personalizados con ⚠ y su texto
    let platosHtml = '';
    for (const plato of combo.platos) {
      let textoPersonalizado = '';
      if (plato.personalizado) {
        textoPersonalizado = ` <span class="carrito__personalizado">⚠ ${escHtml(plato.personalizado)}</span>`;
      }
      platosHtml += `<li>${escHtml(plato.cantidad)} × ${escHtml(plato.nombre)}${textoPersonalizado}</li>`;
    }

    html += `
      <article class="carrito__combo">
        <div class="carrito__cab">
          <h3>${escHtml(combo.nombre)}</h3>
          <span class="carrito__precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
          <button type="button" class="btn-cerrar" data-accion="quitar-combo" data-indice="${indice}"
                  aria-label="Quitar ${escHtml(combo.nombre)} del pedido">✕</button>
        </div>
        <ul class="carrito__platos">${platosHtml}</ul>
      </article>`;
  });

  cuerpo.innerHTML = html;

  // Total, número del ícono (cuenta combos) y botón Finalizar (apagado con el carrito vacío)
  document.getElementById('mp-total').textContent = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('contador').textContent = carritoCombos.length;
  document.getElementById('mp-finalizar').disabled = carritoCombos.length === 0;
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
  document.getElementById('btn-mi-pedido').addEventListener('click', abrirMiPedido);

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
