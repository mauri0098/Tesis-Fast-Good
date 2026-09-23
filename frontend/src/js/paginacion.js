// ============================================================
// paginacion.js — Paginación client-side reutilizable
// Recibe el array YA FILTRADO, dibuja en el tbody solo las filas de la
// página actual y abajo los controles numéricos: ‹ 1 ... 4 5 6 ... 12 ›
//
// Uso:
//   crearPaginacion({
//     datos,                // array completo o filtrado
//     porPagina: 15,
//     contenedorTabla,      // <tbody> donde van las filas
//     contenedorPaginacion, // <div id="paginacion"> debajo de la tabla
//     funcionRenderFila,    // (item) => <tr>
//     filaVacia,            // HTML a mostrar si no hay datos (opcional)
//     paginaInicial         // por defecto 1 (opcional)
//   });
// ============================================================

function crearPaginacion({
  datos,
  porPagina = 15,
  contenedorTabla,
  contenedorPaginacion,
  funcionRenderFila,
  filaVacia = '',
  paginaInicial = 1
}) {
  const totalPaginas = Math.max(1, Math.ceil(datos.length / porPagina));
  let paginaActual   = Math.min(Math.max(1, paginaInicial), totalPaginas);

  function crearBoton(texto, destino, clase, etiqueta) {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'paginacion-btn ' + clase;
    btn.textContent = texto;
    btn.setAttribute('aria-label', etiqueta);
    btn.addEventListener('click', () => irAPagina(destino));
    return btn;
  }

  // Números a mostrar (máximo 5): siempre la primera y la última, y las 3
  // alrededor de la actual. Los huecos se marcan con '...'
  // Ej. con 12 páginas: 1 2 3 4 ... 12 | 1 ... 4 5 6 ... 12 | 1 ... 9 10 11 12
  function numerosVisibles() {
    if (totalPaginas <= 5) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    }

    const desde = Math.min(Math.max(2, paginaActual - 1), totalPaginas - 3);
    const hasta = desde + 2;

    const numeros = [1];
    if (desde > 2) numeros.push('...');
    for (let n = desde; n <= hasta; n++) numeros.push(n);
    if (hasta < totalPaginas - 1) numeros.push('...');
    numeros.push(totalPaginas);
    return numeros;
  }

  function crearControles() {
    const anterior = crearBoton('‹', paginaActual - 1, 'paginacion-flecha', 'Página anterior');
    anterior.disabled = paginaActual === 1;
    contenedorPaginacion.appendChild(anterior);

    numerosVisibles().forEach(n => {
      if (n === '...') {
        const puntos = document.createElement('span');
        puntos.className   = 'paginacion-puntos';
        puntos.textContent = '...';
        contenedorPaginacion.appendChild(puntos);
        return;
      }

      const btn = crearBoton(String(n), n, 'paginacion-numero', 'Página ' + n);
      if (n === paginaActual) {
        btn.classList.add('activa');
        btn.setAttribute('aria-current', 'page');
      }
      contenedorPaginacion.appendChild(btn);
    });

    const siguiente = crearBoton('›', paginaActual + 1, 'paginacion-flecha', 'Página siguiente');
    siguiente.disabled = paginaActual === totalPaginas;
    contenedorPaginacion.appendChild(siguiente);
  }

  function renderizar() {
    contenedorTabla.innerHTML      = '';
    contenedorPaginacion.innerHTML = '';

    // Sin datos: mensaje de la pantalla y sin controles
    if (datos.length === 0) {
      contenedorTabla.innerHTML = filaVacia;
      return;
    }

    const inicio = (paginaActual - 1) * porPagina;
    datos.slice(inicio, inicio + porPagina).forEach(item => {
      contenedorTabla.appendChild(funcionRenderFila(item));
    });

    crearControles();
  }

  function irAPagina(numero) {
    paginaActual = Math.min(Math.max(1, numero), totalPaginas);
    renderizar();
  }

  renderizar();

  return {
    irAPagina,
    paginaActual: () => paginaActual,
    totalPaginas
  };
}
