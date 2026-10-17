// ====================================================================
// COMBOSCATALOGO.JS — Catálogo de combos de index.html
//
// Funciones:
//   cargarCombos         → pide los combos al servidor (GET /api/v1/combos), los guarda, escribe el
//                          "Combos desde $…" de la portada y muestra la primera categoría
//                          (o, al recargar, la que estaba elegida)
//   renderizarCategorias → dibuja un botón por cada categoría que tiene combos y marca la elegida
//   renderizarCombos     → dibuja el nombre de la categoría elegida y las tarjetas de sus combos
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

// Id de la categoría que se está mostrando
let categoriaElegida = null;

// ── Trae los combos del servidor y muestra la primera categoría ─────────────
// ENTRADA: mantenerCategoria: false al abrir la página · true al recargar (pedidoCombos.js, cuando no alcanzan
//          las viandas): se queda en la categoría elegida si todavía tiene combos
// SALIDA:  nada (guarda los combos en combosDisponibles, escribe "Combos desde $…" y dibuja categorías y tarjetas)
// Ej: recarga con "Keto" elegida → sigue en "Keto", con los "disponibles" nuevos de cada plato
async function cargarCombos(mantenerCategoria) {
  const zonaCombos = document.getElementById('combos');

  try {
    const respuesta = await fetch('/api/v1/combos');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    combosDisponibles = await respuesta.json();
  } catch (error) {
    // Al cliente, un mensaje simple; el detalle queda en la consola
    console.error('Error al cargar los combos:', error);
    zonaCombos.innerHTML = '<p class="aviso-combos">No pudimos cargar los combos. Probá de nuevo más tarde.</p>';
    return;
  }

  if (combosDisponibles.length === 0) {
    zonaCombos.innerHTML = '<p class="aviso-combos">Por ahora no hay combos disponibles.</p>';
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

  // Arranca mostrando la categoría del primer combo. Al recargar, se queda en la elegida si todavía tiene combos.
  // some responde true si AL MENOS UN combo es de la categoría elegida.
  // Ej: elegida "Keto" (4) y quedan combos Keto → true · ya no queda ninguno → false
  const sigueLaElegida = mantenerCategoria && combosDisponibles.some(combo => combo.categoria.id === categoriaElegida);
  categoriaElegida = sigueLaElegida ? categoriaElegida : combosDisponibles[0].categoria.id;  // si no, la del primer combo
  renderizarCategorias();
  renderizarCombos();
}

// ── Botones de categorías ─────────────────────────────────────────────────
// ENTRADA: nada (usa combosDisponibles y categoriaElegida)
// SALIDA:  nada (dibuja en #lista-categorias un botón por categoría; al tocar uno, esa pasa a ser la elegida)
// Ej: combos de "Viandas Saludables" (id 1) y de "Keto" (id 4), con la 1 elegida →
//     [✓ Viandas Saludables] (verde) y [Keto] (blanco)
function renderizarCategorias() {
  const contenedor = document.getElementById('lista-categorias');

  // Una categoría por cada combo, sin repetir, en el orden en que vienen los combos
  const categorias = [];
  combosDisponibles.forEach(combo => {
    // some responde true si AL MENOS UNO de la lista cumple la condición.
    // Ejemplo: categorias = [{ id: 1 }, { id: 4 }] y combo.categoria.id = 4 → true (ya está, no se agrega)
    //          categorias = [{ id: 1 }]            y combo.categoria.id = 4 → false (se agrega)
    const yaEsta = categorias.some(categoria => categoria.id === combo.categoria.id);
    if (!yaEsta) {
      categorias.push(combo.categoria);
    }
  });

  // Un botón por categoría. La elegida va con aria-pressed="true": el CSS la pinta de verde y le
  // muestra la ✓ (boton-categoria-tilde), y los lectores de pantalla dicen "presionado"
  let html = '';
  categorias.forEach(categoria => {
    const esLaElegida = categoria.id === categoriaElegida;   // true o false
    html += `
      <button type="button" class="boton-categoria" data-id-categoria="${escHtml(categoria.id)}" aria-pressed="${esLaElegida}">
        <span class="boton-categoria-tilde" aria-hidden="true"><svg class="icono"><use href="#icono-check"></use></svg></span>
        ${escHtml(categoria.nombre)}
      </button>`;
  });
  contenedor.innerHTML = html;

  // Al tocar una categoría: pasa a ser la elegida y se vuelve a dibujar todo
  contenedor.querySelectorAll('.boton-categoria').forEach(boton => {
    boton.addEventListener('click', () => {
      categoriaElegida = Number(boton.dataset.idCategoria);
      renderizarCategorias();
      renderizarCombos();
    });
  });
}

// ── Nombre de la categoría elegida y las tarjetas de sus combos ──────────
// ENTRADA: nada (usa combosDisponibles y categoriaElegida)
// SALIDA:  nada (dibuja en #combos el título, la bajada y una tarjeta por combo: 1 por fila en celu, hasta 3 en compu)
// Ej: "Viandas Saludables" con el combo "PRUEBA Mantenimiento x10" (plan MANTENIMIENTO) de $ 137.000 →
//     título "Combos Viandas Saludables" y la tarjeta con la foto "combo mantenimiento", "PRUEBA Mantenimiento x10",
//     "$ 137.000", "$ 13.700 por vianda" y "Armar combo ›"
function renderizarCombos() {
  const zonaCombos = document.getElementById('combos');
  const combosDeLaCategoria = combosDisponibles.filter(combo => combo.categoria.id === categoriaElegida);

  // Sin combos en la categoría (no debería pasar: la elegida siempre es la de algún combo): no se dibuja nada
  if (combosDeLaCategoria.length === 0) return;

  // Título: "Combos" y el nombre de la categoría (todos los combos de la lista son de la misma), y el texto.
  // "revelar": aparecen suaves al llegar a la pantalla (animaciones-index.js)
  let html = `
    <h3 class="revelar">Combos ${escHtml(combosDeLaCategoria[0].categoria.nombre)}</h3>
    <p class="revelar">Elegís la cantidad y después armás tus platos. Podés repetir.</p>
    <div class="grilla-combos">`;

  combosDeLaCategoria.forEach(combo => {
    // Foto del combo: la primera que corresponda (decisión del 16/10):
    // 1) plan Mantenimiento → la foto "combo mantenimiento" · 2) categoría con "saludable" → la foto "combo saludable" ·
    // 3) la de antes: la del primer plato del menú que tenga una · 4) ninguna → el recuadro gris "foto del combo".
    // includes = "contiene"; se pasa todo a minúsculas. Ej: 'MANTENIMIENTO' → 'mantenimiento'.includes('mantenimiento') → true
    const esPlanMantenimiento = String(combo.plan || '').toLowerCase().includes('mantenimiento');
    const esCategoriaSaludable = String(combo.categoria.nombre || '').toLowerCase().includes('saludable');
    const platoConImagen = combo.menu.find(plato => plato.imagen);   // el primer plato con foto, o undefined
    // Las fotos posibles en orden ('' = esa no corresponde); find se queda con la primera que no está vacía.
    // Ej: plan MANTENIMIENTO y categoría "Viandas Saludables" → [mantenimiento, saludable, fideos.png] → mantenimiento
    const fotosPosibles = [
      esPlanMantenimiento ? FOTO_COMBO_MANTENIMIENTO : '',
      esCategoriaSaludable ? FOTO_COMBO_SALUDABLE : '',
      platoConImagen?.imagen || ''   // ?. = "si encontró un plato, su imagen"
    ];
    const foto = fotosPosibles.find(posible => posible !== '');   // undefined si no hay ninguna
    const tieneFoto = foto !== undefined;
    // Con foto: la imagen (si no carga, se cambia por el logo una sola vez). Sin foto: el recuadro "foto del combo"
    const imagenHtml = `<img src="${escHtml(foto)}" alt="Combo ${escHtml(combo.categoria.nombre)}" loading="lazy"
               onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
    const recuadroHtml = '<span class="foto">foto del combo</span>';
    const fotoHtml = tieneFoto ? imagenHtml : recuadroHtml;

    // Precio del combo y de cada vianda, con separador de miles (ej: 137.000 y 13.700).
    // Son solo para mostrar: el que se cobra lo calcula el servidor desde la base.
    const precio = Number(combo.precio);
    const precioPorVianda = Math.round(precio / combo.cantidad);   // cantidad: siempre 1 o más (lo controla el servidor)

    // La tarjeta entera es el botón (mismos data-accion y data-id-combo de siempre: el clic lo escucha armarCombo.js).
    // Los datos a la izquierda y la foto a la derecha; index.css (parte 2) pone la foto arriba.
    // "revelar": aparece suave; la demora de cada tarjeta está en index.css (parte 2).
    // (Para un combo "más elegido" ya están en el CSS tarjeta-combo-destacada y la pastilla tarjeta-combo-sello;
    //  no se usan porque el sistema no tiene un dato que diga cuál es)
    html += `
      <button type="button" class="tarjeta-combo revelar" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</span>
          <span class="tarjeta-combo-precio">$ ${escHtml(precio.toLocaleString('es-AR'))}</span>
          <span class="tarjeta-combo-por-vianda">$ ${escHtml(precioPorVianda.toLocaleString('es-AR'))} por vianda</span>
          <span class="tarjeta-combo-boton" aria-hidden="true">Armar combo<svg class="icono"><use href="#icono-der"></use></svg></span>
        </span>
        <span class="tarjeta-combo-foto">${fotoHtml}</span>
      </button>`;
  });

  html += '</div>';
  zonaCombos.innerHTML = html;
}

// ── Al cargar la página ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => cargarCombos(false));  // al abrir: desde la primera categoría
