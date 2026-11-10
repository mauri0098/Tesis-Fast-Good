// ============================================================================
// catalogo.js — (11/11) Las PESTAÑAS de la pantalla Catálogo (pages/catalogo.html)
//
// La pantalla junta "Planes y categorías" y "Combos". Todo lo demás (las tablas, las ventanas, guardar,
// activar/desactivar, las fotos, el menú del combo) lo siguen haciendo planesCategorias.js y gestionCombos.js,
// sin cambios. Este archivo solo cambia de pestaña.
//
// Funciones:
//   mostrarPestana → muestra la tarjeta de una pestaña (Categorías, Planes o Combos), marca la pestaña en verde,
//                    escribe el botón "Siguiente" y vuelve a pedir los datos de esa pestaña
//
// Necesita antes: planesCategorias.js (cargarDatos) y gestionCombos.js (cargarCombos).
// ============================================================================

// Qué pestaña sigue a cada una y qué dice el botón "Siguiente" ('' = no hay siguiente: el botón se esconde)
const PESTANA_SIGUIENTE = { categorias: 'planes', planes: 'combos', combos: '' };
const TEXTO_SIGUIENTE   = { categorias: 'Siguiente: los planes →', planes: 'Siguiente: los combos →', combos: '' };

// ----------------------------------------------------------------------------
// mostrarPestana → cambia a la pestaña elegida
// ENTRADA: nombre = 'categorias', 'planes' o 'combos'
// SALIDA:  nada. Se ve solo su tarjeta, su pestaña queda en verde y "Siguiente" apunta a la que sigue.
// Ej: 'planes' → se ve la tarjeta Planes, la pestaña ② en verde y el botón "Siguiente: los combos →"
// Por qué vuelve a pedir los datos: si en Planes creaste un plan, al pasar a Combos ya aparece en su lista
// (y si en Categorías creaste una, aparece en el desplegable de cada plan).
// ----------------------------------------------------------------------------
function mostrarPestana(nombre) {
  // 1. La pestaña elegida en verde; las otras, blancas
  document.querySelectorAll('[data-pestana]').forEach(boton => {
    const esLaElegida = boton.dataset.pestana === nombre;
    boton.classList.remove('pestana-catalogo--elegida');
    if (esLaElegida) { // ¿es la que se tocó? SÍ: queda verde · NO: queda blanca
      boton.classList.add('pestana-catalogo--elegida');
    }
    boton.setAttribute('aria-pressed', String(esLaElegida));   // para los lectores de pantalla: cuál está elegida
  });

  // 2. Se ve solo la tarjeta de esa pestaña (hidden = escondida)
  document.querySelectorAll('[data-panel]').forEach(tarjeta => {
    tarjeta.hidden = tarjeta.dataset.panel !== nombre;
  });

  // 3. El botón "Siguiente": su texto y a dónde lleva. En Combos no hay siguiente: se esconde
  const botonSiguiente = document.getElementById('botonSiguienteCatalogo');
  botonSiguiente.textContent = TEXTO_SIGUIENTE[nombre];
  botonSiguiente.dataset.ir = PESTANA_SIGUIENTE[nombre];
  botonSiguiente.hidden = PESTANA_SIGUIENTE[nombre] === '';

  // 4. Los datos frescos de la pestaña (con las funciones de siempre)
  if (nombre === 'combos') { // ¿es Combos? SÍ: pide combos y planes (gestionCombos.js) · NO: pide categorías y planes
    cargarCombos();
  } else {
    cargarDatos();
  }
}

// ── LOS BOTONES ──────────────────────────────────────────────────────────────
// Cada pestaña muestra la suya; "Siguiente" lleva a la que sigue
document.querySelectorAll('[data-pestana]').forEach(boton => {
  boton.addEventListener('click', () => mostrarPestana(boton.dataset.pestana));
});
document.getElementById('botonSiguienteCatalogo').addEventListener('click', evento => {
  mostrarPestana(evento.currentTarget.dataset.ir);
  window.scrollTo({ top: 0, behavior: 'smooth' });   // vuelve arriba, a las pestañas
});

// El filtro "Categoría:" de la pestaña Planes: al elegir, se vuelve a dibujar la lista (renderizarPlanesPanel,
// de planesCategorias.js, con los datos que ya trajo)
document.getElementById('filtroCategoriaPlan').addEventListener('change', renderizarPlanesPanel);
// (11/11) Los buscadores de Categorías y de Planes: filtran mientras se escribe (con los datos que ya trajo)
document.getElementById('buscarCategoria').addEventListener('input', renderizarCategorias);
document.getElementById('buscarPlan').addEventListener('input', renderizarPlanesPanel);

// Al abrir: la pestaña ① Categorías, solo con el botón y el texto (los datos ya los piden los otros dos JS al cargar)
document.getElementById('botonSiguienteCatalogo').dataset.ir = 'planes';
