// animaciones-index.js — Animaciones del index (solo visual, no toca datos ni funciones).
// 1) Las secciones con clase "revelar" aparecen cuando llegan a la pantalla al bajar.
// 2) El contador de "Mi pedido" salta cada vez que cambia su número.
// Se carga al final del index, después de los demás scripts.
//
// Funciones:
//   iniciarAnimacionesIndex → pone la clase "js" en <html>, mira los elementos "revelar" (les pone "visible" cuando
//                             entran en la pantalla) y hace saltar el contador de "Mi pedido" cuando cambia
//     observarNuevos (adentro) → empieza a mirar los "revelar" que todavía no se vieron (también los que se dibujan
//                             después, como las tarjetas al cambiar de categoría)
//
// Es el animaciones-index.js del diseño final tal cual (su carpeta de referencia se borró el 17/10: está en git);
// lo único distinto es el nombre del contador: ".contador" → ".contador-combos" (regla "Nombres claros" del CLAUDE.md).
// Lo que hace cada clase (js, visible, salta) está en index.css.

function iniciarAnimacionesIndex() {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sinMovimiento || !('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('js');

  const observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('visible');
        observador.unobserve(entrada.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  function observarNuevos() {
    document.querySelectorAll('.revelar:not(.visible)').forEach(function (elemento) {
      observador.observe(elemento);
    });
  }
  observarNuevos();

  // Las tarjetas de combos se vuelven a dibujar al tocar una categoría: las nuevas también se observan.
  const vigia = new MutationObserver(observarNuevos);
  vigia.observe(document.body, { childList: true, subtree: true });

  // Contador de "Mi pedido": cuando cambia el número, salta.
  document.querySelectorAll('.contador-combos').forEach(function (contador) {
    let anterior = contador.textContent;
    const vigiaContador = new MutationObserver(function () {
      if (contador.textContent === anterior) return;
      anterior = contador.textContent;
      contador.classList.remove('salta');
      void contador.offsetWidth; // reinicia la animación
      contador.classList.add('salta');
    });
    vigiaContador.observe(contador, { childList: true, characterData: true, subtree: true });
  });
}

iniciarAnimacionesIndex();
