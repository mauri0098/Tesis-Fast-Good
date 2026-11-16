// ============================================================================
// renderizadoCatalogo.js — El catálogo de la tienda: los PLANES y, al tocar uno, sus CANTIDADES (x5, x10, x20…)
//
// EL RECORRIDO:
//   Al abrir        → traerPlanes() + traerCombos() (a la vez) → planes, combosDisponibles
//                   → renderizarPlanes(planes, contenedorPlanes) y renderizarPrecioDesde(…)
//   Tocar un plan   → filtrarCantidadProductos(combosDisponibles, idPlan) → cantidadProductos
//                   → renderizarCantidadProductos(cantidadProductos, plan, contenedorCantidadProductos)
//   Volver / Atrás  → mostrarNivelElegido() → la lista de planes
//
// LAS FUNCIONES:
//   TRAER       traerPlanes, traerCombos
//   FILTRAR     filtrarCantidadProductos   → las cantidades (combos) de un plan
//   ARMAR       armarPrecioDesde           → el precio más bajo · armarFotoTarjeta → el HTML de una foto
//   RENDERIZAR  renderizarPlanes, renderizarCantidadProductos, renderizarPrecioDesde
//   EVENTOS     cargarCombos, mostrarNivelElegido, volverAPlanes
// Lo usan también: armarCombo.js (combosDisponibles, armarFotoTarjeta) y pedidoCombos.js (cargarCombos, volverAPlanes).
// ============================================================================


// ---------- 1. LOS ARREGLOS ----------

// planes: una tarjeta por plan (GET /api/v1/planes, ya armado por el servidor)
//   { id: 2, nombre: "MANTENIMIENTO", imagen, descripcion, texto_tamanios: "5 o 10 viandas" }
let planes = [];

// combosDisponibles: los combos a la venta (GET /api/v1/combos). Lo lee también armarCombo.js
//   { id: 13, nombre: "10 Viandas Mantenimiento", cantidad: 10, precio: 151000, precio_por_vianda: 15100, id_plan: 2, menu: [ … ] }
let combosDisponibles = [];


// ---------- 2. LOS ELEMENTOS DEL HTML ----------

const IMAGEN_POR_DEFECTO = './src/assets/img/logo.webp';

const seccionPlanes = document.getElementById('planes');
const contenedorPlanes = document.getElementById('tarjetas-planes');
const contenedorCantidadProductos = document.getElementById('cantidad-productos');
const avisoCombosDesde = document.getElementById('combos-desde');
const precioCombosDesde = document.getElementById('combos-desde-precio');


// ---------- 3. TRAER ----------

// ENTRADA: nada · SALIDA: los planes ([] si falla)
async function traerPlanes() {
  try {
    const respuesta = await fetch('/api/v1/planes');
    if (!respuesta.ok) {
      throw new Error('El servidor respondió ' + respuesta.status);
    }
    const todosLosPlanes = await respuesta.json();
    return todosLosPlanes;
  } catch (error) {
    console.error('Error al traer los planes:', error);
    return [];
  }
}

// ENTRADA: nada · SALIDA: los combos a la venta ([] si falla)
async function traerCombos() {
  try {
    const respuesta = await fetch('/api/v1/combos');
    if (!respuesta.ok) {
      throw new Error('El servidor respondió ' + respuesta.status);
    }
    const todosLosCombos = await respuesta.json();
    return todosLosCombos;
  } catch (error) {
    console.error('Error al traer los combos:', error);
    return [];
  }
}


// ---------- 4. FILTRAR Y ARMAR ----------

// ENTRADA: combosDisponibles, idPlan · SALIDA: las cantidades de ese plan. Ej: plan 2 → [x10]
function filtrarCantidadProductos(combosDisponibles, idPlan) {
  const cantidadProductos = combosDisponibles.filter((combo) => combo.id_plan === idPlan);
  return cantidadProductos;
}

// ENTRADA: combosDisponibles · SALIDA: el precio más bajo (0 si no hay). Ej: $151.000 y $60.000 → 60000
function armarPrecioDesde(combosDisponibles) {
  if (combosDisponibles.length === 0) {
    return 0;
  }
  let precioMasBajo = Number(combosDisponibles[0].precio);
  combosDisponibles.forEach((combo) => {
    const precio = Number(combo.precio);
    if (precio < precioMasBajo) {
      precioMasBajo = precio;
    }
  });
  return precioMasBajo;
}

// ENTRADA: combos, foto propia (o null), texto alternativo · SALIDA: el HTML de la foto
// Sin foto propia, usa la del primer plato con foto. Si la foto no carga, pone el logo.
function armarFotoTarjeta(combos, fotoPropia, textoAlternativo) {
  let foto = fotoPropia;

  combos.forEach((combo) => {
    const platoConFoto = combo.menu.find((plato) => plato.imagen);
    const faltaFoto = !foto && platoConFoto !== undefined;
    if (faltaFoto) {
      foto = platoConFoto.imagen;
    }
  });

  if (!foto) {
    return '<span class="foto">foto del combo</span>';
  }

  return `<img src="${escHtml(foto)}" alt="${escHtml(textoAlternativo)}" loading="lazy"
               onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
}


// ---------- 5. RENDERIZAR ----------

// ENTRADA: planes, contenedorPlanes · SALIDA: nada (dibuja una tarjeta por plan)
function renderizarPlanes(planes, contenedorPlanes) {
  if (planes.length === 0) {
    contenedorPlanes.innerHTML = '<p class="aviso-combos">Por ahora no hay combos disponibles.</p>';
    return;
  }

  let contenidoHTML = '';
  planes.forEach((plan) => {
    // Todo lo que viene de la base pasa por escHtml (contra XSS)
    const idPlan = escHtml(plan.id);
    const nombre = escHtml(plan.nombre);
    const textoTamanios = escHtml(plan.texto_tamanios);
    const fotoHtml = armarFotoTarjeta([], plan.imagen, 'Plan ' + plan.nombre);

    let descripcionHtml = '';
    if (plan.descripcion) {
      descripcionHtml = `<span class="tarjeta-descripcion">${escHtml(plan.descripcion)}</span>`;
    }

    contenidoHTML += `
      <button type="button" class="tarjeta tarjeta-plan revelar" data-id-plan="${idPlan}">
        <span class="tarjeta-foto">
          ${fotoHtml}
        </span>
        <span class="tarjeta-nombre">${nombre}</span>
        ${descripcionHtml}
        <span class="tarjeta-datos">
          <span class="dato-tarjeta">
            <svg class="icono-cajita" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M21 8l-9-5-9 5v8l9 5 9-5z"></path><path d="M3 8l9 5 9-5"></path><path d="M12 13v8"></path>
            </svg>
            <span class="dato-tarjeta-texto">${textoTamanios}</span>
          </span>
          <span class="tarjeta-boton" aria-hidden="true">Ver combos<span class="tarjeta-flecha">→</span></span>
        </span>
      </button>`;
  });
  contenedorPlanes.innerHTML = `<div class="grilla-planes">${contenidoHTML}</div>`;
}

// ENTRADA: cantidadProductos (de filtrarCantidadProductos), plan, contenedorCantidadProductos
// SALIDA:  nada (dibuja "‹ Todos los planes", el título y una tarjeta por cantidad: x5, x10…)
function renderizarCantidadProductos(cantidadProductos, plan, contenedorCantidadProductos) {
  let contenidoHTML = '';
  cantidadProductos.forEach((cantidadProducto) => {
    // La foto: la de esta cantidad (el combo); si no tiene, la del plan
    let foto = cantidadProducto.plan_imagen;
    if (cantidadProducto.imagen) {
      foto = cantidadProducto.imagen;
    }
    const fotoHtml = armarFotoTarjeta([cantidadProducto], foto, 'Combo ' + cantidadProducto.nombre);

    const idCombo = escHtml(cantidadProducto.id);
    const nombre = escHtml(cantidadProducto.nombre);
    const textoPorVianda = escHtml(Number(cantidadProducto.precio_por_vianda).toLocaleString('es-AR'));

    let claseDestacada = '';
    let selloHtml = '';
    if (cantidadProducto.destacado === true) {
      claseDestacada = ' tarjeta-destacada';
      selloHtml = '<span class="tarjeta-sello">Más elegido</span>';
    }

    contenidoHTML += `
      <button type="button" class="tarjeta tarjeta-cantidad-productos revelar${claseDestacada}" data-accion="armar-combo" data-id-combo="${idCombo}">
        <span class="tarjeta-foto">
          ${fotoHtml}
          ${selloHtml}
        </span>
        <span class="tarjeta-nombre">${nombre}</span>
        <span class="tarjeta-datos">
          <span class="tarjeta-precios">
            <span class="tarjeta-precio">$ ${textoPorVianda}</span>
            <span class="tarjeta-por-vianda">por vianda</span>
          </span>
          <span class="tarjeta-boton" aria-hidden="true">¡Lo quiero!<span class="tarjeta-flecha">→</span></span>
        </span>
      </button>`;
  });

  const nombrePlan = escHtml(plan.nombre);
  let fraseHtml = '';
  if (plan.descripcion) {
    fraseHtml = `<p class="frase-del-plan">${escHtml(plan.descripcion)}</p>`;
  }

  contenedorCantidadProductos.innerHTML = `
    <div class="combos-barra">
      <button type="button" class="boton-volver-un-nivel" data-accion="volver-un-nivel" aria-label="Volver a todos los planes">
        <span class="boton-volver-flecha" aria-hidden="true">‹</span>
        <span class="boton-volver-texto">Todos los planes</span>
      </button>
      <h3 class="combos-barra-titulo">${nombrePlan}</h3>
    </div>
    <h3 class="revelar">${nombrePlan}</h3>
    ${fraseHtml}
    <p class="revelar">Elegís la cantidad y después armás tus platos. Podés repetir.</p>
    <p class="rotulo zona-cantidad-productos-rotulo">¿Cuántas viandas?</p>
    <div class="grilla-cantidad-productos">${contenidoHTML}</div>`;
}

// ENTRADA: el precio (de armarPrecioDesde) · SALIDA: nada (escribe "Combos desde $…", o lo esconde si es 0)
function renderizarPrecioDesde(precio) {
  if (precio === 0) {
    avisoCombosDesde.hidden = true;
    return;
  }
  precioCombosDesde.textContent = '$ ' + precio.toLocaleString('es-AR');
  avisoCombosDesde.hidden = false;
}


// ---------- 6. GUARDAR ----------
// (no hay: el pedido se guarda en pedidoCombos.js)


// ---------- 7. LOS EVENTOS ----------

// Trae todo y dibuja los planes. La llaman: al abrir y pedidoCombos.js (después de un pedido)
async function cargarCombos() {
  // Promise.all: los dos pedidos salen JUNTOS (~275 ms en vez de ~520). Vuelven en orden: [planes, combos]
  const respuestas = await Promise.all([traerPlanes(), traerCombos()]);
  planes = respuestas[0];
  combosDisponibles = respuestas[1];

  renderizarPlanes(planes, contenedorPlanes);
  renderizarPrecioDesde(armarPrecioDesde(combosDisponibles));
  mostrarNivelElegido();
}

// Muestra la lista de planes, o las cantidades del plan anotado en el historial (history.state = { idPlan: 2 } o null)
function mostrarNivelElegido() {
  let idPlanDelPaso = null;
  if (history.state !== null) {
    idPlanDelPaso = history.state.idPlan;
  }

  const planElegido = planes.find((plan) => plan.id === idPlanDelPaso);
  seccionPlanes.classList.remove('mostrando-cantidad-productos');
  if (planElegido === undefined) {
    return;
  }

  const cantidadProductos = filtrarCantidadProductos(combosDisponibles, planElegido.id);
  renderizarCantidadProductos(cantidadProductos, planElegido, contenedorCantidadProductos);
  seccionPlanes.classList.add('mostrando-cantidad-productos');
}

// Vuelve a la lista de planes y borra el paso anotado (la llama pedidoCombos.js al confirmar)
function volverAPlanes() {
  history.replaceState(null, '');
  mostrarNivelElegido();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarCombos();

  // Un solo escuchador para todo el catálogo
  seccionPlanes.addEventListener('click', (evento) => {
    // "‹ Todos los planes" = el Atrás del navegador
    const botonVolver = evento.target.closest('[data-accion="volver-un-nivel"]');
    if (botonVolver) {
      history.back();
      return;
    }

    const tarjetaPlan = evento.target.closest('[data-id-plan]');
    if (!tarjetaPlan) {
      return;
    }
    // pushState anota un paso en el historial: así el Atrás del celu vuelve a los planes en vez de salir de la tienda
    history.pushState({ idPlan: Number(tarjetaPlan.dataset.idPlan) }, '');
    mostrarNivelElegido();
  });

  // Atrás del navegador (o "‹ Todos los planes")
  window.addEventListener('popstate', mostrarNivelElegido);
});
