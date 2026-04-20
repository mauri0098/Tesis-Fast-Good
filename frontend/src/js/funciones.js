/**
 * Gestiona la adición o actualización de productos en el carrito.
 * Retorna una NUEVA copia del carrito modificado (no muta el original si es posible, aunque aquí usaremos push/splice por simplicidad pero retornando el array).
 * @param {Array} carrito - Array actual del carrito
 * @param {Object} producto - Objeto con datos del producto ({ id, nombre, precio })
 * @param {number} cantidad - Cantidad a agregar
 * @returns {Array} - El carrito actualizado
 */
function gestionarCarrito(carrito, producto, cantidad) {
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
function calcularTotales(carrito) {
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
function persistirDatos(clave, data) {
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
function recuperarDatos(clave) {
    try {
        const item = localStorage.getItem(clave);
        return item ? JSON.parse(item) : null;
    } catch (error) {
        console.error('Error recuperando de localStorage:', error);
        return null;
    }
}

// ============================================================
// RENDERIZADO DEL CATÁLOGO
// ============================================================

function renderizarproductos(arregloProductos, contenedorproductos) {
    if (arregloProductos.length === 0) {
        contenedorproductos.innerHTML = '<p class="sin-resultados">No hay productos disponibles.</p>';
        return;
    }

    let contenidoHTML = '<div class="productos-grid">';
    arregloProductos.forEach((producto) => {
        contenidoHTML += `
      <article class="productos">
        <figure class="productos__fig">
          <img src="${producto.imagen || '../src/assets/img/logo.webp'}" alt="${producto.nombre}" loading="lazy" onerror="this.src='../src/assets/img/logo.webp'" />
        </figure>
        <div class="Datos-productos">
          <h3>${producto.nombre}</h3>
          <p>${producto.descripcion || ''}</p>
          <div class="productos__precio">$ ${producto.precio}</div>
        </div>
        <div class="counter">
          <button class="counter-btn" data-btn-menos data-id="${producto.id}">−</button>
          <span class="counter-cantidad" data-id="${producto.id}">1</span>
          <button class="counter-btn" data-btn-mas data-id="${producto.id}">+</button>
        </div>
        <button class="boton-Productos" data-btn-carro data-id="${producto.id}">
          Agregar al carrito
        </button>
      </article>
    `;
    });
    contenidoHTML += '</div>';
    contenedorproductos.innerHTML = contenidoHTML;
}

function buscarProductos(buscadorProductos, arregloProductos, contenedorproductos) {
    const textoBusqueda = buscadorProductos.value.toLowerCase();
    const productosFiltrados = arregloProductos.filter((producto) =>
        producto.nombre.toLowerCase().startsWith(textoBusqueda)
    );
    renderizarproductos(productosFiltrados, contenedorproductos);
}

const IMAGENES_CATEGORIAS = {
    'Viandas Saludables':   '../src/assets/img/vianda 1.png',
    'Viandas Sin Gluten':   '../src/assets/img/sinGluten.png',
    'Pastelería Saludable': '../src/assets/img/pastel.png',
    'Combos Saludables':    '../src/assets/img/combo.png',
};
const IMG_CATEGORIA_DEFAULT = '../src/assets/img/logo.webp';

function renderizarCategorias(categorias, contenedor, onCategoriaClick) {
    if (categorias.length === 0) {
        contenedor.innerHTML = '<p class="sin-resultados">No hay categorías disponibles.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.classList.add('grid');

    categorias.forEach((categoria) => {
        const imagen = IMAGENES_CATEGORIAS[categoria.nombre] || IMG_CATEGORIA_DEFAULT;
        const card = document.createElement('div');
        card.classList.add('card');
        card.innerHTML = `
            <img src="${imagen}" alt="${categoria.nombre}" loading="lazy" />
            <h3>${categoria.nombre}</h3>
        `;
        const btn = document.createElement('button');
        btn.classList.add('btn');
        btn.textContent = 'Ver Planes';
        btn.addEventListener('click', () => onCategoriaClick(categoria));
        card.appendChild(btn);
        grid.appendChild(card);
    });

    contenedor.innerHTML = '';
    contenedor.appendChild(grid);
}

function renderizarPlanes(planes, contenedor, onPlanClick) {
    if (planes.length === 0) {
        contenedor.innerHTML = '<p class="sin-resultados">No hay planes disponibles para esta categoría.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.classList.add('planes-grid');

    planes.forEach((plan) => {
        const card = document.createElement('div');
        card.classList.add('plan-card');
        card.innerHTML = `
      <h3>${plan.nombre}</h3>
      <p>${plan.descripcion_nutricional || ''}</p>
      <button class="btn-ver-plan">Ver productos</button>
    `;
        card.querySelector('.btn-ver-plan').addEventListener('click', () => onPlanClick(plan));
        grid.appendChild(card);
    });

    contenedor.innerHTML = '';
    contenedor.appendChild(grid);
}
