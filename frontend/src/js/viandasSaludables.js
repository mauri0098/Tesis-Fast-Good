// =============================================
// VIANDAS SALUDABLES - Lógica de la página
// =============================================
//
// ¿Qué hace este archivo?
//   - Tiene la lista de productos (nombre, precio, id)
//   - Deja sumar y restar cantidad con los botones + y -
//   - Abre y cierra los acordeones de cada plan
//   - Muestra u oculta la info extra de cada plan
//   - Manda el producto elegido al carrito (carrito.js)
//
// -----------------------------------------------
// EJEMPLO COMPLETO de cómo funciona:
// -----------------------------------------------
// 1. El usuario entra a la página y ve los productos.
//    En la pantalla aparece "Pollo al disco con arroz" con
//    un contador en 0 y botones [−] [+].
//
// 2. El usuario hace clic en [+] dos veces.
//    → Se ejecuta sumarProducto(0)  (porque el Pollo es el producto 0)
//    → cantidadSeleccionada pasa de [0, 0, 0] a [1, 0, 0] y luego a [2, 0, 0]
//    → En pantalla el contador muestra "2"
//
// 3. El usuario hace clic en "Agregar al carrito".
//    → Se ejecuta agregarProductoAlCarrito(0)
//    → Lee cantidadSeleccionada[0] → vale 2
//    → Busca PRODUCTOS[0] → { id: 3, nombre: 'Pollo al disco...', precio: 1800 }
//    → Resetea el contador a 0 (en pantalla y en memoria)
//    → Llama a window.agregarItemAlCarrito({ id:3, nombre:'Pollo...', precio:1800 }, 2)
//    → carrito.js recibe esos datos y los agrega al carrito
// -----------------------------------------------


// --- LISTA DE PRODUCTOS ---
// Cada producto tiene: id (mismo que en la base de datos), nombre, y precio.
const PRODUCTOS = [
  { id: 3, nombre: 'Pollo al disco con arroz', precio: 1800 },
  { id: 4, nombre: 'Milanesas de pechuga a la napolitana', precio: 2000 },
  { id: 5, nombre: 'Costillitas de cerdo a la barbacoa', precio: 2200 },
  // Agregar más productos aquí
];


// --- CANTIDADES SELECCIONADAS ---
// Un array con tantas posiciones como productos hay.
// Empieza todo en 0. Ejemplo: [0, 0, 0]
// Si el usuario suma 2 al primer producto queda: [2, 0, 0]
let cantidadSeleccionada = Array(PRODUCTOS.length).fill(0);


// --- ACORDEONES ---
// Cuando la página carga, le pone un "click" a cada título de plan.
// Al hacer clic, se muestra u oculta el contenido de ese plan.
document.addEventListener('DOMContentLoaded', () => {
  const botonesAcordeon = document.getElementsByClassName('accordion');

  for (let i = 0; i < botonesAcordeon.length; i++) {
    botonesAcordeon[i].addEventListener('click', function () {
      // Agrega o quita la clase "active" (para cambiar el estilo del botón)
      this.classList.toggle('active');

      // Busca el panel que está justo debajo del botón
      const panelDelPlan = this.nextElementSibling;

      // Si está visible lo oculta, si está oculto lo muestra
      panelDelPlan.style.display = (panelDelPlan.style.display === 'block') ? 'none' : 'block';
    });
  }
});


// --- SUMAR PRODUCTO ---
// Suma 1 a la cantidad de un producto y actualiza el número en pantalla.
// Ejemplo: si el usuario hace clic en [+] del producto 0,
//          cantidadSeleccionada[0] pasa de 0 a 1, y en pantalla se ve "1".
function sumarProducto(numeroProducto) {
  cantidadSeleccionada[numeroProducto]++;
  document.getElementById('cantidadProducto' + numeroProducto).innerText = cantidadSeleccionada[numeroProducto];
}


// --- RESTAR PRODUCTO ---
// Resta 1 a la cantidad, pero nunca baja de 0.
// Ejemplo: si cantidadSeleccionada[0] es 2 y el usuario hace clic en [−],
//          pasa a 1. Si ya es 0, no hace nada.
function restarProducto(numeroProducto) {
  if (cantidadSeleccionada[numeroProducto] > 0) {
    cantidadSeleccionada[numeroProducto]--;
    document.getElementById('cantidadProducto' + numeroProducto).innerText = cantidadSeleccionada[numeroProducto];
  }
}

// Se ponen en window para que el HTML pueda llamarlas con onclick="sumarProducto(0)"
window.sumarProducto = sumarProducto;
window.restarProducto = restarProducto;


// --- MÁS INFORMACIÓN ---
// Muestra u oculta el bloque de info extra de un plan.
// Ejemplo: si el usuario hace clic en "Más info" del plan 1,
//          se muestra o se esconde el div con id="moreInfo1".
function alternarMasInfo(numeroDePlan) {
  const bloqueDeInfo = document.getElementById('moreInfo' + numeroDePlan);
  bloqueDeInfo.style.display = (bloqueDeInfo.style.display === 'block') ? 'none' : 'block';
}

// Se pone en window para que el HTML pueda llamarla con onclick="toggleMoreInfo(0)"
window.toggleMoreInfo = alternarMasInfo;


// --- AGREGAR AL CARRITO ---
// Esta es la función principal. Hace lo siguiente:
//   1. Lee cuántas unidades eligió el usuario
//   2. Si es 0, no hace nada (el usuario no eligió cantidad)
//   3. Busca los datos del producto (nombre, precio, id)
//   4. Limpia el contador (lo deja en 0 para la próxima vez)
//   5. Manda todo a carrito.js para que lo agregue al carrito
//
// Ejemplo paso a paso con el producto 1 (Milanesas):
//   - El usuario hizo clic en [+] 3 veces → cantidadSeleccionada = [0, 3, 0]
//   - Hace clic en "Agregar al carrito" → se llama agregarProductoAlCarrito(1)
//   - cantidadElegida = cantidadSeleccionada[1] = 3
//   - productoElegido = PRODUCTOS[1] = { id: 4, nombre: 'Milanesas...', precio: 2000 }
//   - Resetea: cantidadSeleccionada vuelve a [0, 0, 0], pantalla muestra "0"
//   - Llama: window.agregarItemAlCarrito({ id:4, nombre:'Milanesas...', precio:2000 }, 3)
//   - carrito.js recibe eso y lo suma al carrito
function agregarProductoAlCarrito(numeroProducto) {
  // Paso 1: ¿Cuántas unidades eligió?
  const cantidadElegida = cantidadSeleccionada[numeroProducto];

  // Paso 2: Si no eligió nada, salir
  if (cantidadElegida <= 0) {
    return;
  }

  // Paso 3: Buscar los datos del producto en la lista
  const productoElegido = PRODUCTOS[numeroProducto];

  // Paso 4: Limpiar el contador (en memoria y en pantalla)
  cantidadSeleccionada[numeroProducto] = 0;
  document.getElementById('cantidadProducto' + numeroProducto).innerText = 0;

  // Paso 5: Mandar el producto y la cantidad a carrito.js
  window.agregarItemAlCarrito(productoElegido, cantidadElegida);
}

// Se pone en window para que el HTML pueda llamarla con onclick="agregarProductoAlCarrito(0)"
window.agregarProductoAlCarrito = agregarProductoAlCarrito;
