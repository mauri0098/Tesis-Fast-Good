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
//     paginaInicial,        // por defecto 1 (opcional)
//     contenedorResumen,    // (opcional) donde escribir "Mostrando 15 de 40 pedidos". Hoy lo usa solo
//                           //   Consultar Pedidos: las pantallas que no lo pasan quedan exactamente igual
//     nombreDatos           // (opcional) cómo se llaman los datos en ese texto. Ej: 'pedidos'
//   });
// ============================================================

function crearPaginacion({
  datos,
  porPagina = 15,
  contenedorTabla,
  contenedorPaginacion,
  funcionRenderFila,
  filaVacia = '',
  paginaInicial = 1,
  contenedorResumen = null,
  nombreDatos = 'registros'
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
    if (contenedorResumen) contenedorResumen.textContent = '';   // (solo si la pantalla pasó dónde va el resumen)

    // Sin datos: mensaje de la pantalla y sin controles
    if (datos.length === 0) {
      contenedorTabla.innerHTML = filaVacia;
      return;
    }

    const inicio = (paginaActual - 1) * porPagina;
    const filasDeEstaPagina = datos.slice(inicio, inicio + porPagina);  // slice = los de esta página
    filasDeEstaPagina.forEach(item => {
      contenedorTabla.appendChild(funcionRenderFila(item));
    });

    // "Mostrando X de Y …": cuántos hay en esta página y cuántos en total. Ej: página 3 de 40 → "Mostrando 10 de 40 pedidos"
    if (contenedorResumen) {
      contenedorResumen.textContent = 'Mostrando ' + filasDeEstaPagina.length + ' de ' + datos.length + ' ' + nombreDatos;
    }

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
