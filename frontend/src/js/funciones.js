/**
 * Gestiona la adición o actualización de productos en el carrito.
 * Retorna una NUEVA copia del carrito modificado (no muta el original si es posible, aunque aquí usaremos push/splice por simplicidad pero retornando el array).
 * @param {Array} carrito - Array actual del carrito
 * @param {Object} producto - Objeto con datos del producto ({ id, nombre, precio })
 * @param {number} cantidad - Cantidad a agregar
 * @returns {Array} - El carrito actualizado
 */
export function gestionarCarrito(carrito, producto, cantidad) {
    // Crear copia superficial para no mutar directamente el argumento si se quisiera ser estricto,
    // pero mantendremos la referencia si es lo esperado por el manejo de estado global simple.
    // Para este refactor, trabajaremos sobre el array pasado pero asegurando lógica encapsulada.

    const carritoActualizado = [...carrito];
    const productoExistente = carritoActualizado.find(item => item.producto_id === producto.id);

    if (productoExistente) {
        productoExistente.cantidad += cantidad;
        productoExistente.subtotal = productoExistente.precio * productoExistente.cantidad;
    } else {
        carritoActualizado.push({
            producto_id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            cantidad: cantidad,
            subtotal: producto.precio * cantidad
        });
    }

    return carritoActualizado;
}

/**
 * Calcula los totales del carrito.
 * @param {Array} carrito - Array de items
 * @returns {Object} - { cantidadItems, totalPrecio }
 */
export function calcularTotales(carrito) {
    return carrito.reduce((acc, item) => {
        acc.cantidadItems += item.cantidad;
        acc.totalPrecio += (item.precio * item.cantidad);
        return acc;
    }, { cantidadItems: 0, totalPrecio: 0 });
}

/**
 * Persiste datos en localStorage de forma centralizada.
 * @param {string} clave - Clave para localStorage
 * @param {any} data - Datos a guardar (se stringificarán si son objetos)
 */
export function persistirDatos(clave, data) {
    try {
        const valor = typeof data === 'object' ? JSON.stringify(data) : data;
        localStorage.setItem(clave, valor);
    } catch (error) {
        console.error('Error guardando en localStorage:', error);
    }
}

/**
 * Recupera datos del localStorage.
 * @param {string} clave 
 * @returns {any} - Datos parseados o null
 */
export function recuperarDatos(clave) {
    try {
        const item = localStorage.getItem(clave);
        return item ? JSON.parse(item) : null;
    } catch (error) {
        console.error('Error recuperando de localStorage:', error);
        return null;
    }
}
