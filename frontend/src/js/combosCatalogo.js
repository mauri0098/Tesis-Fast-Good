// ====================================================================
// COMBOSCATALOGO.JS — Catálogo de combos de index.html
//
// Funciones:
//   cargarCombos         → pide los combos al servidor (GET /api/v1/combos), los guarda, escribe el
//                          "Combos desde $…" de la portada y dibuja las categorías
//                          (al recargar, se queda en la categoría que estaba abierta)
//   armarFotoTarjeta     → arma el HTML de la foto de una tarjeta (de combo o de categoría) con la regla de las fotos
//   renderizarCategorias → dibuja una tarjeta por cada categoría que tiene combos (la MISMA en compu y en el celu)
//   renderizarCombos     → dibuja los combos de la categoría elegida, con "‹ Todas las categorías" para volver,
//                          y los muestra en lugar de las categorías (en el celu, como una pantalla aparte)
//   volverACategorias    → esconde los combos y vuelve a mostrar las categorías
//
// Qué se ve lo decide la clase "mostrando-combos" de la sección #categorias (la pone o la saca renderizarCombos):
// sin la clase se ven las categorías; con la clase, los combos de la elegida (en compu, en el mismo lugar;
// en el celu, una pantalla que entra desde la derecha). Cómo se ve cada cosa está en index.css.
//
// Necesita antes: escape.js (escHtml). Todo texto que viene de la base pasa por escHtml
// antes de ir al innerHTML.
// ====================================================================

// Imagen que se usa cuando un plato no tiene imagen o la imagen no carga
const IMAGEN_POR_DEFECTO = './src/assets/img/logo.webp';

// Fotos de las tarjetas de combos: versiones livianas (1200 px) de "COMBO MANTENIMIENTO.jpeg" y "COMBO SALUDABLE.jpeg"
// (las originales se borraron el 17/10: están en git)
const FOTO_COMBO_MANTENIMIENTO = './src/assets/img/combo-mantenimiento-1200.jpg';
const FOTO_COMBO_SALUDABLE = './src/assets/img/combo-saludable-1200.jpg';

// Combos que mandó el servidor. Los va a usar también el modal de armar combo.
let combosDisponibles = [];

// Id de la categoría abierta (la que muestra sus combos). null = ninguna: se ven las categorías
let categoriaElegida = null;

// ── Trae los combos del servidor y dibuja las categorías ──────────────────
// ENTRADA: mantenerCategoria: false al abrir la página · true al recargar (pedidoCombos.js, cuando no alcanzan
//          las viandas): si había una categoría abierta y todavía tiene combos, se queda en ella
// SALIDA:  nada (guarda los combos en combosDisponibles, escribe "Combos desde $…" y dibuja categorías y combos)
// Ej: recarga con "Keto" abierta → sigue en "Keto", con los "disponibles" nuevos de cada plato
async function cargarCombos(mantenerCategoria) {
  // Los avisos ("Cargando…", "No pudimos…") van donde están las categorías: los combos arrancan escondidos
  const zonaCategorias = document.getElementById('lista-categorias');

  try {
    const respuesta = await fetch('/api/v1/combos');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    combosDisponibles = await respuesta.json();
  } catch (error) {
    // Al cliente, un mensaje simple; el detalle queda en la consola
    console.error('Error al cargar los combos:', error);
    zonaCategorias.innerHTML = '<p class="aviso-combos">No pudimos cargar los combos. Probá de nuevo más tarde.</p>';
    return;
  }

  if (combosDisponibles.length === 0) {
    zonaCategorias.innerHTML = '<p class="aviso-combos">Por ahora no hay combos disponibles.</p>';
    return;
  }

  // Un combo cuyo plan no tiene categoría va a una categoría "Otros combos" (id 0),
  // así el resto del código siempre encuentra combo.categoria.id y combo.categoria.nombre
  combosDisponibles.forEach(combo => {
    if (!combo.categoria) {
      combo.categoria = { id: 0, nombre: 'Otros combos' };
    }
  });

  // "Combos desde $…" de la portada: el precio más bajo de todos los combos (solo para mostrar).
  // map arma la lista de precios y Math.min(...lista) devuelve el menor (los ... pasan la lista como números sueltos).
  // Ej: combos de $ 137.000, $ 80.000 y $ 250.000 → [137000, 80000, 250000] → 80000 → "Combos desde $ 80.000"
  const precios = combosDisponibles.map(combo => Number(combo.precio));
  const precioMasBajo = Math.min(...precios);
  document.getElementById('combos-desde-precio').textContent = '$ ' + precioMasBajo.toLocaleString('es-AR');  // textContent: se muestra como texto
  document.getElementById('combos-desde').hidden = false;   // estaba escondido hasta tener el precio

  // Al abrir la página se ven las categorías (ninguna abierta). Al recargar, se queda en la abierta si todavía
  // tiene combos. some responde true si AL MENOS UN combo es de la categoría abierta.
  // Ej: abierta "Keto" (4) y quedan combos Keto → true · ya no queda ninguno → false (vuelve a las categorías)
  const sigueLaElegida = mantenerCategoria && combosDisponibles.some(combo => combo.categoria.id === categoriaElegida);
  categoriaElegida = sigueLaElegida ? categoriaElegida : null;   // si no, ninguna: las categorías
  renderizarCategorias();
  renderizarCombos();
}

// ── La foto de una tarjeta (de combo o de categoría) ──────────────────────
// ENTRADA: combo            = el combo del que sale la foto (para una categoría: su primer combo)
//          fotoPropia       = una foto de la base que va antes que todas (la de la categoría), o null / '' si no hay
//          textoAlternativo = lo que lee un lector de pantalla en lugar de la foto (ej: 'Combo Keto')
// SALIDA:  el HTML de la foto: la imagen (si no carga, se cambia por el logo una sola vez) o, si no hay ninguna,
//          el recuadro gris "foto del combo"
// La foto es la primera que corresponda (decisión del 16/10; la foto propia de la categoría, del 17/10):
// 0) la foto propia · 1) plan Mantenimiento → la foto "combo mantenimiento" · 2) categoría con "saludable" →
// la foto "combo saludable" · 3) la del primer plato del menú que tenga una · 4) ninguna → el recuadro gris.
// Ej: categoría "Viandas Saludables" sin foto propia y su primer combo de plan MANTENIMIENTO → la foto "combo mantenimiento"
function armarFotoTarjeta(combo, fotoPropia, textoAlternativo) {
  // includes = "contiene"; se pasa todo a minúsculas. Ej: 'MANTENIMIENTO' → 'mantenimiento'.includes('mantenimiento') → true
  const esPlanMantenimiento = String(combo.plan || '').toLowerCase().includes('mantenimiento');
  const esCategoriaSaludable = String(combo.categoria.nombre || '').toLowerCase().includes('saludable');
  const platoConImagen = combo.menu.find(plato => plato.imagen);   // el primer plato con foto, o undefined
  // Las fotos posibles en orden ('' = esa no corresponde); find se queda con la primera que no está vacía.
  // Ej: sin foto propia, plan MANTENIMIENTO y categoría "Viandas Saludables" → ['', mantenimiento, saludable, fideos.png] → mantenimiento
  const fotosPosibles = [
    fotoPropia || '',              // la de la categoría (null o vacía → '')
    esPlanMantenimiento ? FOTO_COMBO_MANTENIMIENTO : '',
    esCategoriaSaludable ? FOTO_COMBO_SALUDABLE : '',
    platoConImagen?.imagen || ''   // ?. = "si encontró un plato, su imagen"
  ];
  const foto = fotosPosibles.find(posible => posible !== '');   // undefined si no hay ninguna

  // Sin ninguna foto: el recuadro gris "foto del combo"
  if (foto === undefined) return '<span class="foto">foto del combo</span>';

  // Con foto: la imagen (si no carga, se cambia por el logo una sola vez: onerror se borra para no repetirse)
  return `<img src="${escHtml(foto)}" alt="${escHtml(textoAlternativo)}" loading="lazy"
               onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
}

// ── Tarjetas de categorías ────────────────────────────────────────────────
// ENTRADA: nada (usa combosDisponibles)
// SALIDA:  nada (dibuja en #lista-categorias una tarjeta por categoría que tiene combos, en el orden en que vienen
//          los combos). Es la MISMA tarjeta en compu y en el celu (solo cambia el tamaño, en index.css) y usa el
//          mismo molde que la tarjeta de combo. Al tocarla se abren sus combos (el clic se escucha al final del archivo).
// Ej: "Viandas Saludables" con combos de $ 137.000 (x10) y $ 250.000 (x20), sin foto ni descripción en la base →
//     la foto "combo mantenimiento" con "Viandas Saludables" en blanco encima y "2 combos"; abajo "DESDE",
//     "$ 137.000", "o $ 12.500 por vianda" y "Ver combos →"
function renderizarCategorias() {
  const contenedor = document.getElementById('lista-categorias');

  // 1. Los combos juntos por categoría: { idCategoria: [combos] }, y la lista de categorías sin repetir
  //    (en el orden en que vienen los combos). Así no hace falta recorrer los combos adentro de las categorías.
  //    Ej: [combo A (cat 4), combo B (cat 1), combo C (cat 4)] → { 4: [A, C], 1: [B] } y categorias = [cat 4, cat 1]
  const combosPorCategoria = {};
  const categorias = [];
  combosDisponibles.forEach(combo => {
    const idCategoria = combo.categoria.id;
    const esNueva = combosPorCategoria[idCategoria] === undefined;   // todavía no tiene lista: es la primera vez que aparece
    if (esNueva) {
      combosPorCategoria[idCategoria] = [];
      categorias.push(combo.categoria);
    }
    combosPorCategoria[idCategoria].push(combo);
  });

  // 2. Una tarjeta por categoría
  let html = '';
  categorias.forEach(categoria => {
    const combosDeLaCategoria = combosPorCategoria[categoria.id];

    // "DESDE": el precio del combo más barato. "o $ … por vianda": el menor precio por vianda de sus combos
    // (puede ser de otro combo: el más grande suele salir menos por vianda). Son solo para mostrar.
    // map arma una lista nueva con un número por combo y Math.min(...lista) devuelve el menor.
    // Ej: combos de $ 137.000 (x10) y $ 250.000 (x20) → [137000, 250000] → 137000 · por vianda [13700, 12500] → 12500
    const precios = combosDeLaCategoria.map(combo => Number(combo.precio));
    const preciosPorVianda = combosDeLaCategoria.map(combo => Math.round(Number(combo.precio) / combo.cantidad));
    const desde = Math.min(...precios);
    const desdePorVianda = Math.min(...preciosPorVianda);

    // "1 combo" o "2 combos"
    const cantidadCombos = combosDeLaCategoria.length;
    const textoCantidad = cantidadCombos === 1 ? '1 combo' : cantidadCombos + ' combos';

    // La descripción va debajo del nombre solo si la categoría tiene una en la base (si no, sin frase)
    const descripcionHtml = categoria.descripcion ? `<small class="tarjeta-combo-descripcion">${escHtml(categoria.descripcion)}</small>` : '';

    // La foto: la de la categoría (si tiene en la base) o la de su primer combo, con la regla de siempre
    const fotoHtml = armarFotoTarjeta(combosDeLaCategoria[0], categoria.imagen, 'Categoría ' + categoria.nombre);

    // La tarjeta entera es el botón (data-accion="ver-combos"). Mismo molde que la de combo: la foto con el nombre
    // (y la descripción) en blanco encima y "N combos"; abajo "DESDE", el precio, "o $ … por vianda" y
    // "Ver combos →" (con el estilo de "¡Lo quiero!"). "revelar": aparecen de a una (la demora está en index.css).
    html += `
      <button type="button" class="tarjeta-combo tarjeta-categoria revelar" data-accion="ver-combos" data-id-categoria="${escHtml(categoria.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
          <span class="tarjeta-combo-cantidad">${escHtml(textoCantidad)}</span>
          <span class="tarjeta-combo-nombre">${escHtml(categoria.nombre)}${descripcionHtml}</span>
        </span>
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-precios">
            <span class="tarjeta-categoria-desde">Desde</span>
            <span class="tarjeta-combo-precio">$ ${escHtml(desde.toLocaleString('es-AR'))}</span>
            <span class="tarjeta-combo-por-vianda">o <b>$ ${escHtml(desdePorVianda.toLocaleString('es-AR'))}</b> por vianda</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">Ver combos<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });

  contenedor.innerHTML = `<div class="grilla-categorias">${html}</div>`;
}

// ── Los combos de la categoría elegida ────────────────────────────────────
// ENTRADA: nada (usa combosDisponibles y categoriaElegida)
// SALIDA:  nada. Con una categoría elegida: dibuja en #combos el botón para volver ("‹ Todas las categorías"),
//          el título, la bajada y una tarjeta por combo (1 por fila en el celu, hasta 3 en compu), y le pone a
//          #categorias la clase "mostrando-combos": en compu los combos reemplazan a las categorías; en el celu
//          entran como una pantalla aparte, con "‹" y el nombre de la categoría arriba (como la referencia).
//          Sin categoría elegida (null): le saca la clase y se ven las categorías.
// Ej: "Viandas Saludables" con el combo "PRUEBA Mantenimiento x10" (plan MANTENIMIENTO) de $ 137.000 →
//     "‹ Todas las categorías", título "Combos Viandas Saludables" y la tarjeta: la foto "combo mantenimiento" con
//     "PRUEBA Mantenimiento x10" en blanco encima y "10 viandas"; abajo "$ 137.000", "$ 13.700 por vianda" y "¡Lo quiero! →".
//     Si en la base está como destacado, además la pastilla naranja "Más elegido" y el botón en naranja.
function renderizarCombos() {
  const zonaCombos = document.getElementById('combos');
  const combosDeLaCategoria = combosDisponibles.filter(combo => combo.categoria.id === categoriaElegida);

  // Se ven los combos solo si hay una categoría elegida que tenga combos; si no, las categorías.
  // toggle(clase, true) pone la clase y toggle(clase, false) la saca. Ej: "Keto" con 3 combos → la pone · null → la saca
  const hayCombos = combosDeLaCategoria.length > 0;
  document.getElementById('categorias').classList.toggle('mostrando-combos', hayCombos);
  if (!hayCombos) return;

  // Título: "Combos" y el nombre de la categoría (todos los combos de la lista son de la misma), y el texto.
  // Si el nombre ya empieza con "Combos" (ej: "Combos Saludables") va solo el nombre, para no repetir "Combos Combos…".
  // startsWith = "empieza con". Ej: 'combos saludables'.startsWith('combos') → true · 'viandas saludables' → false
  const nombreCategoria = combosDeLaCategoria[0].categoria.nombre;
  const yaDiceCombos = String(nombreCategoria).toLowerCase().startsWith('combos');
  const tituloZona = yaDiceCombos ? nombreCategoria : 'Combos ' + nombreCategoria;
  // Arriba, la barra: el botón para volver (en compu "‹ Todas las categorías"; en el celu solo la "‹", con el nombre
  // de la categoría al lado). Después el título y la bajada (compu) o "¿Cuántas viandas?" (celu): index.css esconde
  // lo que no va en cada pantalla. "revelar": aparecen suaves al llegar a la pantalla (animaciones-index.js)
  let html = `
    <div class="combos-barra">
      <button type="button" class="boton-volver-categorias" data-accion="volver-categorias" aria-label="Volver a todas las categorías">
        <span class="boton-volver-flecha" aria-hidden="true">‹</span>
        <span class="boton-volver-texto">Todas las categorías</span>
      </button>
      <h3 class="combos-barra-titulo">${escHtml(nombreCategoria)}</h3>
    </div>
    <h3 class="revelar">${escHtml(tituloZona)}</h3>
    <p class="revelar">Elegís la cantidad y después armás tus platos. Podés repetir.</p>
    <p class="rotulo zona-combos-rotulo">¿Cuántas viandas?</p>
    <div class="grilla-combos">`;

  combosDeLaCategoria.forEach(combo => {
    // Foto del combo, con la regla de las fotos (armarFotoTarjeta). Los combos no tienen foto propia: ''
    const fotoHtml = armarFotoTarjeta(combo, '', 'Combo ' + combo.categoria.nombre);

    // Precio del combo y de cada vianda, con separador de miles (ej: 137.000 y 13.700).
    // Son solo para mostrar: el que se cobra lo calcula el servidor desde la base.
    const precio = Number(combo.precio);
    const precioPorVianda = Math.round(precio / combo.cantidad);   // cantidad: siempre 1 o más (lo controla el servidor)

    // "Más elegido": solo si en la base el combo está marcado como destacado (combos.destacado).
    // Sin ese dato, la tarjeta va sin pastilla y con el botón verde.
    const esDestacado = combo.destacado === true;
    const claseDestacada = esDestacado ? ' tarjeta-combo-destacada' : '';
    const selloHtml = esDestacado ? '<span class="tarjeta-combo-sello">Más elegido</span>' : '';

    // La tarjeta entera es el botón (mismos data-accion y data-id-combo de siempre: el clic lo escucha armarCombo.js).
    // Arriba la foto, con el nombre en blanco encima, "N viandas" y (si es destacado) "Más elegido";
    // abajo el precio, "por vianda" y "¡Lo quiero! →". "revelar": aparece suave (la demora de cada tarjeta está en index.css).
    html += `
      <button type="button" class="tarjeta-combo revelar${claseDestacada}" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
          <span class="tarjeta-combo-cantidad">${escHtml(combo.cantidad)} viandas</span>
          ${selloHtml}
          <span class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</span>
        </span>
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-precios">
            <span class="tarjeta-combo-precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
            <span class="tarjeta-combo-por-vianda">$ ${escHtml(precioPorVianda.toLocaleString('es-AR'))} por vianda</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">¡Lo quiero!<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });

  html += '</div>';
  zonaCombos.innerHTML = html;
}

// ── Vuelve a las categorías ───────────────────────────────────────────────
// ENTRADA: nada
// SALIDA:  nada (ninguna categoría abierta: se esconden los combos y se ven las categorías; en el celu se cierra
//          la pantalla de combos). La usan el botón "‹", el "atrás" del navegador y la confirmación del pedido.
// Ej: viendo los combos de "Keto" → se ven otra vez las tarjetas de categorías
function volverACategorias() {
  categoriaElegida = null;
  renderizarCombos();   // sin categoría elegida, renderizarCombos saca la clase "mostrando-combos"
}

// ── Al cargar la página: quién escucha los clics ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Si se recargó la página estando en los combos, el navegador se acuerda de ese paso del historial (pushState, abajo).
  // Se borra, porque la página arranca en las categorías: si no, el "atrás" no cerraría la próxima categoría abierta.
  // ?. = "si hay algo guardado, su pantalla" (sin nada guardado da undefined)
  const quedoUnPasoViejo = history.state?.pantalla === 'combos';
  if (quedoUnPasoViejo) history.replaceState(null, '');

  cargarCombos(false);  // al abrir: las categorías

  // Tocar una tarjeta de categoría: se abren sus combos. Se escucha en el contenedor porque las tarjetas se vuelven
  // a dibujar (closest = la tarjeta tocada, aunque el clic caiga en su foto o en su texto)
  document.getElementById('lista-categorias').addEventListener('click', evento => {
    const tarjeta = evento.target.closest('[data-accion="ver-combos"]');
    if (!tarjeta) return;
    categoriaElegida = Number(tarjeta.dataset.idCategoria);
    renderizarCombos();
    // Se anota un paso en el historial del navegador (pushState): así el "atrás" del celu o del navegador vuelve
    // a las categorías en lugar de salir de la página (lo escucha "popstate", más abajo)
    history.pushState({ pantalla: 'combos' }, '');
  });

  // "‹ Todas las categorías": vuelve, y saca del historial el paso que se anotó al abrir la categoría
  // (si sigue siendo el último). Las tarjetas de combo ("¡Lo quiero!") las escucha armarCombo.js en este mismo #combos
  document.getElementById('combos').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-accion="volver-categorias"]');
    if (!boton) return;
    volverACategorias();
    const quedoElPaso = history.state?.pantalla === 'combos';
    if (quedoElPaso) history.back();
  });

  // "Atrás" del celu o del navegador (o un enlace del menú): si se llegó a un paso de antes de abrir la categoría,
  // se vuelve a las categorías
  window.addEventListener('popstate', () => {
    const salioDeLosCombos = history.state?.pantalla !== 'combos';
    if (salioDeLosCombos) volverACategorias();
  });
});
