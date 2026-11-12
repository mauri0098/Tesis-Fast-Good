// carritoCombos.js — El carrito ("Mi pedido")
const CLAVE_CARRITO = 'FG_CARRITO_COMBOS';

// EL ARRAY DEL CARRITO
let carritoCombos = [];

function cargarCarrito() {
  let guardado = [];
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
  } catch (error) {
    console.warn('No se pudo leer el carrito guardado:', error);
    guardado = [];
  }
  if (!Array.isArray(guardado)) {
    guardado = [];
  }

  carritoCombos = [];
  guardado.forEach(combo => {
    const formaDeCombo = combo && Number.isInteger(combo.id_combo) && Array.isArray(combo.platos);
    if (!formaDeCombo) return;

    const platosBien = combo.platos.every(plato =>
      plato && Number.isInteger(plato.producto_id) && Number.isInteger(plato.cantidad) && plato.cantidad > 0
    );
    if (!platosBien) return;

    carritoCombos.push(combo);
  });

  renderizarCarrito();
}

function guardarCarrito() {
  try {
    // ACÁ SE GUARDA en el navegador
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carritoCombos));
  } catch (error) {
    console.warn('No se pudo guardar el carrito:', error);
  }
}

function agregarAlCarrito(comboArmado) {
  // ACÁ LLEGA el combo de armarCombo.js y SE PUSHEA al array del carrito
  carritoCombos.push(comboArmado);
  guardarCarrito();

  const esCelu = window.matchMedia('(max-width: 767px)').matches;
  if (esCelu) {
    renderizarCarrito();
    abrirFinalizarPedido();
    return;
  }
  abrirMiPedido();
}

function quitarDelCarrito(indice) {
  if (indice < 0 || indice >= carritoCombos.length) return;
  carritoCombos.splice(indice, 1);
  guardarCarrito();
  renderizarCarrito();
}

function renderizarCarrito() {
  const cuerpo = document.getElementById('modal-pedido-combos');
  let total = 0;
  let html = '';

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

    const viandas = Number(combo.cantidad) || 0;
    const tieneViandas = viandas > 0;
    const textoPorVianda = tieneViandas ? '$ ' + Math.round(precio / viandas).toLocaleString('es-AR') + ' c/u' : '';

    const platosHtml = combo.platos.map(plato => {
      const textoPersonalizado = plato.personalizado ? ' · ⚠ ' + escHtml(plato.personalizado) : '';
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

  // ACÁ SE RENDERIZA "Mi pedido"
  cuerpo.innerHTML = html;

  document.getElementById('modal-pedido-total').textContent = '$ ' + total.toLocaleString('es-AR');
  document.getElementById('contador-combos').textContent = carritoCombos.length;
  document.getElementById('boton-finalizar-pedido').disabled = carritoCombos.length === 0;
}

function abrirMiPedido() {
  renderizarCarrito();
  const ventana = document.getElementById('modal-pedido');
  if (!ventana.open) {
    ventana.showModal();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ventana = document.getElementById('modal-pedido');

  cargarCarrito();

  document.getElementById('boton-mi-pedido').addEventListener('click', abrirMiPedido);

  ventana.addEventListener('click', evento => {
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
  });
});
