// ============================================================================
// productos.js — Pantalla Productos · EJEMPLO MODELO: así se escribe el JS de una pantalla
// (las rutas de guardar son de muestra; lo que importa es la forma)
//
// EL RECORRIDO (qué pasa, en orden, y por dónde viaja el dato):
//   Al abrir la página  → traerProductos() → GET /api/v1/productos → tabla productos
//                       → arregloProductos → renderizarProductos(arregloProductos, contenedorProductos)
//   Escribir en Buscar  → filtrarProductos(arregloProductos, texto) → productosFiltrados
//                       → renderizarProductos(productosFiltrados, contenedorProductos)
//   Tocar "Agregar"     → arregloCarro.push(id) → armarRenglonesDelCarro(arregloProductos, arregloCarro)
//                       → renglonesDelCarro → renderizarCarro(renglonesDelCarro, contenedorCarro)
//   Tocar "Confirmar"   → guardarPedido(arregloCarro) → POST /api/pedidos → tabla pedidos
//                       → traerProductos() → renderizarProductos(…)
//
// LAS FUNCIONES (cada una es de UNA sola clase):
//   TRAER       traerProductos         → pide los productos y los devuelve
//   FILTRAR     filtrarProductos       → devuelve los que empiezan con lo escrito
//   ARMAR       armarRenglonesDelCarro → junta el carrito con los productos: un renglón por producto
//   RENDERIZAR  renderizarProductos    → dibuja las tarjetas
//   RENDERIZAR  renderizarCarro        → dibuja el carrito
//   GUARDAR     guardarPedido          → manda el pedido y devuelve cómo salió
//
// Necesita antes: api.js (apiFetch) y escape.js (escHtml).
// ============================================================================


// ---------- 1. LOS ARREGLOS (lo que viene de la base y lo que arma la pantalla) ----------

// arregloProductos: todos los productos. Lo LLENA traerProductos (GET /api/v1/productos). Lo DIBUJA renderizarProductos.
//   Un elemento: { id: 1, nombre: "Ensalada César", descripcion: "Con pollo", imagen: "cesar.jpg", precio: 9000 }
let arregloProductos = [];

// arregloCarro: los números de los productos agregados (se repiten si se agrega dos veces). Lo llena el botón "Agregar".
//   Ej: [1, 3, 1] = dos del producto 1 y uno del 3
let arregloCarro = [];


// ---------- 2. LOS ELEMENTOS DEL HTML ----------

const contenedorProductos = document.getElementById("contenedorProductos");   // donde van las tarjetas
const contenedorCarro = document.getElementById("contenedorCarro");           // donde va el carrito
const buscadorProductos = document.getElementById("buscadorProductos");       // el casillero "Buscar"
const botonConfirmar = document.getElementById("botonConfirmar");             // "Confirmar pedido"
const avisoPedido = document.getElementById("avisoPedido");                   // el mensaje de error


// ---------- 3. TRAER (solo piden al servidor y DEVUELVEN el arreglo) ----------

// traerProductos → pide los productos al servidor
// ENTRADA: nada · SALIDA: el arreglo de productos ([] si falló)
// Ej: → [{ id: 1, nombre: "Ensalada César", precio: 9000, … }, { id: 2, … }]
async function traerProductos() {
  try {
    const respuesta = await apiFetch("/api/v1/productos");
    // ¿el servidor contestó con error? SÍ: 500 · NO: 200
    if (!respuesta.ok) {
      throw new Error("El servidor respondió " + respuesta.status);
    }
    const todosLosProductos = await respuesta.json();
    return todosLosProductos;
  } catch (error) {
    console.error("Error al traer los productos:", error);
    return [];
  }
}


// ---------- 4. FILTRAR Y ARMAR (devuelven un arreglo NUEVO; no dibujan ni piden nada) ----------

// filtrarProductos → los productos cuyo nombre empieza con lo escrito
// ENTRADA: arregloProductos y textoBusqueda · SALIDA: un arreglo nuevo (el original no cambia)
// Ej: "e" → Ensalada César y Empanadas · "" → todos
function filtrarProductos(arregloProductos, textoBusqueda) {
  const textoEnMinusculas = textoBusqueda.trim().toLowerCase();
  const productosFiltrados = arregloProductos.filter((producto) => {
    const empiezaConElTexto = producto.nombre.toLowerCase().startsWith(textoEnMinusculas);
    return empiezaConElTexto;
  });
  return productosFiltrados;
}

// armarRenglonesDelCarro → junta el carrito con los productos: un renglón por producto, con su cantidad y su subtotal
// ENTRADA: arregloProductos y arregloCarro (ej: [1, 3, 1]) · SALIDA: un arreglo nuevo, LISTO PARA DIBUJAR
// Ej: → [{ id: 1, nombre: "Ensalada César", cantidad: 2, subtotal: 18000 }, { id: 3, nombre: "Fideos", cantidad: 1, subtotal: 8000 }]
// (el subtotal es solo para mostrar: el total de verdad lo calcula el servidor)
function armarRenglonesDelCarro(arregloProductos, arregloCarro) {
  // 1. Cuántas veces está cada número en el carrito. Ej: [1, 3, 1] → { 1: 2, 3: 1 }
  const cantidadPorId = {};
  arregloCarro.forEach((idProducto) => {
    const esLaPrimeraVez = cantidadPorId[idProducto] === undefined;
    // ¿es la primera vez que aparece este producto? SÍ: el primer 1 · NO: el segundo 1
    if (esLaPrimeraVez) {
      cantidadPorId[idProducto] = 0;
    }
    cantidadPorId[idProducto] = cantidadPorId[idProducto] + 1;
  });

  // 2. Un renglón por cada producto que está en el carrito
  const renglonesDelCarro = [];
  arregloProductos.forEach((producto) => {
    const cantidad = cantidadPorId[producto.id];
    const noEstaEnElCarro = cantidad === undefined;
    // ¿este producto no está en el carrito? SÍ: el 2 · NO: el 1
    if (noEstaEnElCarro) {
      return;                                                      // return adentro del forEach = saltear este y seguir con el siguiente
    }
    renglonesDelCarro.push({
      id: producto.id,
      nombre: producto.nombre,
      cantidad: cantidad,
      subtotal: producto.precio * cantidad,
    });
  });
  return renglonesDelCarro;
}


// ---------- 5. RENDERIZAR (solo dibujan lo que les pasan) ----------

// renderizarProductos → dibuja una tarjeta por producto
// ENTRADA: arregloProductos (los que hay que dibujar) y contenedorProductos (dónde) · SALIDA: nada (cambia el HTML)
// Ej: 3 productos → 3 tarjetas, cada una con su botón "Agregar" y su data-id-producto
function renderizarProductos(arregloProductos, contenedorProductos) {
  // ¿no hay ninguno para dibujar? SÍ: buscó "xyz" · NO: hay al menos uno
  if (arregloProductos.length === 0) {
    contenedorProductos.innerHTML = '<p class="aviso-vacio">No hay productos para mostrar.</p>';
    return;
  }

  let contenidoHTML = "";
  arregloProductos.forEach((producto) => {
    // Lo que viene de la base, seguro para el HTML (se calcula ANTES del template)
    const nombre = escHtml(producto.nombre);
    const descripcion = escHtml(producto.descripcion);
    const imagen = escHtml(producto.imagen);
    const precio = escHtml(Number(producto.precio).toLocaleString("es-AR"));
    const idProducto = escHtml(producto.id);

    contenidoHTML += `
      <article class="tarjeta-producto">
        <img src="${imagen}" alt="${nombre}">
        <h3>${nombre}</h3>
        <p>${descripcion}</p>
        <div>$ ${precio}</div>
        <button type="button" class="boton-agregar" data-id-producto="${idProducto}">Agregar</button>
      </article>
    `;
  });
  contenedorProductos.innerHTML = contenidoHTML;                   // se dibuja una sola vez, al final
}

// renderizarCarro → dibuja un renglón por producto del carrito y el total
// ENTRADA: renglonesDelCarro (lo que devuelve armarRenglonesDelCarro) y contenedorCarro · SALIDA: nada (cambia el HTML)
// Ej: [{ nombre: "Ensalada César", cantidad: 2, subtotal: 18000 }] → "Ensalada César · 2 · $ 18.000" y "Total $ 18.000"
function renderizarCarro(renglonesDelCarro, contenedorCarro) {
  let contenidoHTML = "";
  let total = 0;
  renglonesDelCarro.forEach((renglon) => {
    total = total + renglon.subtotal;
    const nombre = escHtml(renglon.nombre);
    const cantidad = escHtml(renglon.cantidad);
    const subtotal = escHtml(renglon.subtotal.toLocaleString("es-AR"));

    contenidoHTML += `
      <li class="renglon-carro">
        <span>${nombre}</span>
        <span>Cantidad: ${cantidad}</span>
        <span>$ ${subtotal}</span>
      </li>
    `;
  });
  const textoTotal = escHtml(total.toLocaleString("es-AR"));
  contenedorCarro.innerHTML = `<ul>${contenidoHTML}</ul><p class="total-carro">Total $ ${textoTotal}</p>`;
}


// ---------- 6. GUARDAR (solo mandan al servidor y DEVUELVEN cómo salió) ----------

// guardarPedido → manda el carrito al servidor
// ENTRADA: arregloCarro (ej: [1, 3, 1]) · SALIDA: { ok: true } o { ok: false, error: "mensaje para mostrar" }
// Ej: sin stock → { ok: false, error: "No quedan suficientes viandas" }
async function guardarPedido(arregloCarro) {
  try {
    const respuesta = await apiFetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productos: arregloCarro }),
    });
    const datos = await respuesta.json();
    // ¿el servidor dijo que no? SÍ: 400 "No quedan suficientes viandas" · NO: 200
    if (!respuesta.ok) {
      return { ok: false, error: datos.error };
    }
    return { ok: true };
  } catch (error) {
    console.error("Error al guardar el pedido:", error);
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}


// ---------- 7. LOS EVENTOS (acá se lee el recorrido: quién llama a quién, y en qué orden) ----------

// Al abrir la página
document.addEventListener("DOMContentLoaded", async () => {
  arregloProductos = await traerProductos();                       // 1. se trae y se guarda
  renderizarProductos(arregloProductos, contenedorProductos);      // 2. se dibuja
});

// Escribir en "Buscar"
buscadorProductos.addEventListener("input", () => {
  const productosFiltrados = filtrarProductos(arregloProductos, buscadorProductos.value);   // 1. se eligen
  renderizarProductos(productosFiltrados, contenedorProductos);                              // 2. se dibujan
});

// Tocar "Agregar" en una tarjeta. Un solo escuchador en el contenedor: las tarjetas se dibujan de nuevo cada vez
contenedorProductos.addEventListener("click", (evento) => {
  const botonAgregar = evento.target.closest("[data-id-producto]");
  // ¿el clic no cayó en un botón "Agregar"? SÍ: tocó la foto · NO: tocó "Agregar"
  if (!botonAgregar) {
    return;
  }
  arregloCarro.push(Number(botonAgregar.dataset.idProducto));                                // 1. se anota en el carrito
  const renglonesDelCarro = armarRenglonesDelCarro(arregloProductos, arregloCarro);          // 2. se arma
  renderizarCarro(renglonesDelCarro, contenedorCarro);                                       // 3. se dibuja
});

// Tocar "Confirmar pedido"
botonConfirmar.addEventListener("click", async () => {
  const resultado = await guardarPedido(arregloCarro);             // 1. se manda
  // ¿salió mal? SÍ: "No quedan suficientes viandas" · NO: se guardó
  if (!resultado.ok) {
    avisoPedido.textContent = resultado.error;
    return;
  }
  arregloCarro = [];                                               // 2. se vacía el carrito
  renderizarCarro([], contenedorCarro);                            // 3. se dibuja vacío
  arregloProductos = await traerProductos();                       // 4. se trae de nuevo…
  renderizarProductos(arregloProductos, contenedorProductos);      // 5. …y se dibuja
});
