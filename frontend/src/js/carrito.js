// ====================================================================
// CARRITO.JS - Módulo independiente del carrito de compras (Fast Good)
// Gestiona: estado del carrito, panel lateral, vista, y persistencia.
// ====================================================================

// ====================================================================
// 1. ESTADO DEL CARRITO
// ====================================================================

// Items seleccionados
let carrito = [];

// Visibilidad del panel lateral
let carritoVisible = false;

// ====================================================================
// 2. PANEL LATERAL - Mostrar / Ocultar
// ====================================================================

/**
 * Abre o cierra el carrito lateral
 */
function alternarCarrito() {
    const elementoCarrito = document.getElementById('carrito');
    carritoVisible = !carritoVisible;
    if (carritoVisible) {
        elementoCarrito.classList.add('mostrar');
    } else {
        elementoCarrito.classList.remove('mostrar');
    }
    elementoCarrito.style.right = '';
}

/**
 * Cierra el carrito lateral
 */
function cerrarCarrito() {
    const elementoCarrito = document.getElementById('carrito');
    elementoCarrito.classList.remove('mostrar');
    elementoCarrito.style.right = '';
    carritoVisible = false;
}

// ====================================================================
// 3. AGREGAR ITEM (punto de entrada para cualquier página)
// ====================================================================

/**
 * Recibe un producto y cantidad, actualiza el carrito, la vista y abre el panel.
 * Esta es la función que las páginas de catálogo deben llamar.
 * @param {Object} producto - Objeto con { id, nombre, precio }
 * @param {number} cantidad - Cantidad seleccionada
 */
function agregarItemAlCarrito(producto, cantidad) {
    // Delegamos la matemática a funciones.js
    carrito = gestionarCarrito(carrito, producto, cantidad);

    // Actualizar la vista del carrito
    actualizarVistaCarrito();
}

// ====================================================================
// 4. ACTUALIZAR VISTA
// ====================================================================

/**
 * Renderiza la lista de items y actualiza el contador del ícono
 */
function actualizarVistaCarrito() {
    const listaCarrito = document.getElementById('carrito-items');
    listaCarrito.innerHTML = '';

    carrito.forEach((item, indice) => {
        const elementoLista = document.createElement('li');
        elementoLista.innerHTML = `
      ${item.nombre} x${item.cantidad} - $${item.subtotal}
      <button onclick="eliminarDelCarrito(${indice})">❌</button>
    `;
        listaCarrito.appendChild(elementoLista);
    });

    const totales = calcularTotales(carrito);
    document.getElementById('cart-count').textContent = totales.cantidadItems;
}

// ====================================================================
// 5. ELIMINAR ITEM
// ====================================================================

/**
 * Elimina un item del carrito por su índice
 * @param {number} indice - Posición del item a eliminar
 */
function eliminarDelCarrito(indice) {
    carrito.splice(indice, 1);
    actualizarVistaCarrito();
}

// ====================================================================
// 6. CONFIRMAR PEDIDO
// ====================================================================

/**
 * Valida el carrito, persiste en localStorage y redirige al formulario
 */
function confirmarPedido() {
    if (carrito.length === 0) {
        alert('Tu carrito está vacío. Agregá al menos un plato antes de confirmar el pedido.');
        return;
    }

    persistirDatos('FG_CARRITO_ACTUAL', carrito);
    window.location.href = '/pages/formulario.html';
}

// ====================================================================
// 7. EXPORTS AL WINDOW (para uso desde HTML con onclick)
// ====================================================================
window.toggleCarrito = alternarCarrito;
window.cerrarCarrito = cerrarCarrito;
window.agregarItemAlCarrito = agregarItemAlCarrito;
window.eliminarDelCarrito = eliminarDelCarrito;
window.confirmarPedido = confirmarPedido;
