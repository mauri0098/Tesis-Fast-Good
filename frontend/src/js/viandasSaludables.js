const estado = {
  vista: 'categorias',
  categoriaActual: null,
  planActual: null,
  productosActuales: []
};

document.addEventListener('DOMContentLoaded', () => {

  const contenedor     = document.getElementById('contenedor-catalogo');
  const breadcrumb     = document.getElementById('breadcrumb');
  const buscadorBox    = document.getElementById('buscador-container');
  const buscadorInput  = document.getElementById('buscador-productos');
  const tituloCatalogo = document.getElementById('titulo-catalogo');
  const cargandoTxt    = document.getElementById('cargando-catalogo');

  function mostrarCargando() {
    cargandoTxt.style.display = 'block';
    contenedor.innerHTML = '';
  }

  function ocultarCargando() {
    cargandoTxt.style.display = 'none';
  }

  function mostrarBuscador(visible) {
    buscadorBox.style.display = visible ? 'flex' : 'none';
  }

  function crearSeparador() {
    const s = document.createElement('span');
    s.className = 'separador';
    s.textContent = '›';
    return s;
  }

  function crearTextoActual(texto) {
    const s = document.createElement('span');
    s.className = 'actual';
    s.textContent = texto;
    return s;
  }

  function actualizarBreadcrumb() {
    breadcrumb.innerHTML = '';

    if (estado.vista === 'categorias') {
      breadcrumb.appendChild(crearTextoActual('Categorías'));
      return;
    }

    const btnCategorias = document.createElement('button');
    btnCategorias.textContent = 'Categorías';
    btnCategorias.addEventListener('click', irACategorias);
    breadcrumb.appendChild(btnCategorias);
    breadcrumb.appendChild(crearSeparador());

    if (estado.vista === 'planes') {
      breadcrumb.appendChild(crearTextoActual(estado.categoriaActual.nombre));
      return;
    }

    const btnCategoria = document.createElement('button');
    btnCategoria.textContent = estado.categoriaActual.nombre;
    btnCategoria.addEventListener('click', () => irAPlanes(estado.categoriaActual));
    breadcrumb.appendChild(btnCategoria);
    breadcrumb.appendChild(crearSeparador());
    breadcrumb.appendChild(crearTextoActual(estado.planActual.nombre));
  }

  async function irACategorias() {
    estado.vista = 'categorias';
    estado.categoriaActual = null;
    estado.planActual = null;
    estado.productosActuales = [];

    tituloCatalogo.textContent = 'Nuestras Categorías';
    mostrarBuscador(false);
    actualizarBreadcrumb();
    mostrarCargando();

    const categorias = await traerCategorias();
    ocultarCargando();
    renderizarCategorias(categorias, contenedor, irAPlanes);
  }

  async function irAPlanes(categoria) {
    estado.vista = 'planes';
    estado.categoriaActual = categoria;
    estado.planActual = null;
    estado.productosActuales = [];

    tituloCatalogo.textContent = categoria.nombre;
    mostrarBuscador(false);
    actualizarBreadcrumb();
    mostrarCargando();

    const planes = await traerPlanesPorCategoria(categoria.id);
    ocultarCargando();
    renderizarPlanes(planes, contenedor, irAProductos);
  }

  async function irAProductos(plan) {
    estado.vista = 'productos';
    estado.planActual = plan;

    tituloCatalogo.textContent = plan.nombre;
    mostrarBuscador(true);
    actualizarBreadcrumb();
    mostrarCargando();

    const productos = await traerProductosPorPlan(plan.id);
    ocultarCargando();

    estado.productosActuales = productos;
    buscadorInput.value = '';
    renderizarproductos(productos, contenedor);
  }

  // Delegación de eventos: + / − / Agregar al carrito
  contenedor.addEventListener('click', (e) => {
    const btnMas = e.target.closest('[data-btn-mas]');
    if (btnMas) {
      const span = contenedor.querySelector(`.counter-cantidad[data-id="${btnMas.dataset.id}"]`);
      span.textContent = parseInt(span.textContent) + 1;
      return;
    }

    const btnMenos = e.target.closest('[data-btn-menos]');
    if (btnMenos) {
      const span = contenedor.querySelector(`.counter-cantidad[data-id="${btnMenos.dataset.id}"]`);
      const actual = parseInt(span.textContent);
      if (actual > 1) span.textContent = actual - 1;
      return;
    }

    const btnCarro = e.target.closest('[data-btn-carro]');
    if (!btnCarro) return;

    const id = Number(btnCarro.dataset.id);
    const spanCantidad = contenedor.querySelector(`.counter-cantidad[data-id="${id}"]`);
    const cantidad = spanCantidad ? parseInt(spanCantidad.textContent) : 1;
    const producto = estado.productosActuales.find(p => p.id === id);
    if (producto) {
      window.agregarItemAlCarrito(producto, cantidad);
    }
  });

  buscadorInput.addEventListener('input', () => {
    buscarProductos(buscadorInput, estado.productosActuales, contenedor);
  });

  irACategorias();
});
