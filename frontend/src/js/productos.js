// Trae todos los productos activos
async function traerProductos() {
  try {
    const respuesta = await fetch('/api/v1/productos');
    return await respuesta.json();
  } catch (error) {
    console.error('Error al traer los productos:', error);
    return [];
  }
}

// Trae un producto por ID
async function traerProductoPorId(id) {
  try {
    const respuesta = await fetch(`/api/v1/productos/${id}`);
    if (!respuesta.ok) throw new Error(`Error: ${respuesta.status}`);
    return await respuesta.json();
  } catch (error) {
    console.error('Error al traer el producto por ID:', error);
    return null;
  }
}

// Trae todas las categorías
async function traerCategorias() {
  try {
    const respuesta = await fetch('/api/v1/categorias');
    if (!respuesta.ok) throw new Error(`Error: ${respuesta.status}`);
    return await respuesta.json();
  } catch (error) {
    console.error('Error al traer las categorías:', error);
    return [];
  }
}

// Trae los planes activos de una categoría
async function traerPlanesPorCategoria(idCategoria) {
  try {
    const respuesta = await fetch(`/api/v1/categorias/${idCategoria}/planes`);
    if (!respuesta.ok) throw new Error(`Error: ${respuesta.status}`);
    return await respuesta.json();
  } catch (error) {
    console.error('Error al traer los planes:', error);
    return [];
  }
}

// Trae los productos activos de un plan
async function traerProductosPorPlan(idPlan) {
  try {
    const respuesta = await fetch(`/api/v1/planes/${idPlan}/productos`);
    if (!respuesta.ok) throw new Error(`Error: ${respuesta.status}`);
    return await respuesta.json();
  } catch (error) {
    console.error('Error al traer los productos del plan:', error);
    return [];
  }
}
