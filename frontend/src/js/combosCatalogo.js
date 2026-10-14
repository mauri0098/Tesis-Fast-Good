// ====================================================================
// COMBOSCATALOGO.JS — Catálogo de combos de index-combos.html
//
// Funciones:
//   cargarCombos         → pide los combos al servidor (GET /api/v1/combos), los guarda
//                          y muestra la primera categoría
//   renderizarCategorias → dibuja un botón por cada categoría que tiene combos y marca la elegida
//   renderizarCombos     → dibuja las tarjetas de los combos de la categoría elegida
//
// Necesita antes: escape.js (escHtml). Todo texto que viene de la base pasa por escHtml
// antes de ir al innerHTML.
// ====================================================================

// Imagen que se usa cuando un plato no tiene imagen o la imagen no carga
const IMAGEN_POR_DEFECTO = './src/assets/img/logo.webp';

// Combos que mandó el servidor. Los va a usar también el modal de armar combo.
let combosDisponibles = [];

// Id de la categoría que se está mostrando
let categoriaElegida = null;

// ── Trae los combos del servidor y muestra la primera categoría ─────────────
async function cargarCombos() {
  const zonaCombos = document.getElementById('combos');

  try {
    const respuesta = await fetch('/api/v1/combos');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    combosDisponibles = await respuesta.json();
  } catch (error) {
    // Al cliente, un mensaje simple; el detalle queda en la consola
    console.error('Error al cargar los combos:', error);
    zonaCombos.innerHTML = '<p class="aviso-vacio">No pudimos cargar los combos. Probá de nuevo más tarde.</p>';
    return;
  }

  if (combosDisponibles.length === 0) {
    zonaCombos.innerHTML = '<p class="aviso-vacio">Por ahora no hay combos disponibles.</p>';
    return;
  }

  // Un combo cuyo plan no tiene categoría va a una categoría "Otros combos" (id 0),
  // así el resto del código siempre encuentra combo.categoria.id y combo.categoria.nombre
  for (const combo of combosDisponibles) {
    if (!combo.categoria) {
      combo.categoria = { id: 0, nombre: 'Otros combos' };
    }
  }

  // Arranca mostrando la categoría del primer combo
  categoriaElegida = combosDisponibles[0].categoria.id;
  renderizarCategorias();
  renderizarCombos();
}

// ── Botones de categorías ─────────────────────────────────────────────────
function renderizarCategorias() {
  const contenedor = document.getElementById('lista-categorias');

  // Una categoría por cada combo, sin repetir, en el orden en que vienen los combos
  const categorias = [];
  for (const combo of combosDisponibles) {
    const yaEsta = categorias.some(categoria => categoria.id === combo.categoria.id);
    if (!yaEsta) {
      categorias.push(combo.categoria);
    }
  }

  // Un botón por categoría; la elegida lleva la clase "activa"
  let html = '';
  for (const categoria of categorias) {
    const esLaElegida = categoria.id === categoriaElegida;
    html += `
      <button type="button" class="categoria-btn${esLaElegida ? ' categoria-btn--activa' : ''}"
              data-id-categoria="${escHtml(categoria.id)}" aria-pressed="${esLaElegida}">
        ${escHtml(categoria.nombre)}
      </button>`;
  }
  contenedor.innerHTML = html;

  // Al tocar una categoría: pasa a ser la elegida y se vuelve a dibujar todo
  contenedor.querySelectorAll('.categoria-btn').forEach(boton => {
    boton.addEventListener('click', () => {
      categoriaElegida = Number(boton.dataset.idCategoria);
      renderizarCategorias();
      renderizarCombos();
    });
  });
}

// ── Tarjetas de los combos de la categoría elegida ────────────────────────
function renderizarCombos() {
  const zonaCombos = document.getElementById('combos');
  const combosDeLaCategoria = combosDisponibles.filter(combo => combo.categoria.id === categoriaElegida);

  let html = '<div class="combos-grilla">';

  for (const combo of combosDeLaCategoria) {
    // Imagen: la del primer plato del menú que tenga una; si ninguno tiene, la imagen por defecto
    const platoConImagen = combo.menu.find(plato => plato.imagen);
    let imagen = IMAGEN_POR_DEFECTO;
    if (platoConImagen) {
      imagen = platoConImagen.imagen;
    }

    // Nombres de los platos del menú, escapados, separados por " · "
    const nombresPlatos = combo.menu.map(plato => escHtml(plato.nombre)).join(' · ');

    // Precio con separador de miles (ej: 137.000). Es solo para mostrar: el servidor lo vuelve a calcular.
    const precio = Number(combo.precio).toLocaleString('es-AR');

    // Si la imagen no carga, se cambia por la de por defecto (una sola vez, para no repetir el error)
    html += `
      <article class="combo-tarjeta">
        <img class="combo-tarjeta__img" src="${escHtml(imagen)}" alt="" loading="lazy"
             onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}';">
        <div class="combo-tarjeta__cuerpo">
          <p class="combo-tarjeta__plan">${escHtml(combo.plan)}</p>
          <h3 class="combo-tarjeta__nombre">${escHtml(combo.nombre)}</h3>
          <p class="combo-tarjeta__cantidad">${escHtml(combo.cantidad)} viandas</p>
          <p class="combo-tarjeta__menu"><strong>Menú:</strong> ${nombresPlatos}</p>
          <p class="combo-tarjeta__precio">$ ${escHtml(precio)}</p>
          <button type="button" class="btn btn--primario btn--ancho" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
            Armar combo
          </button>
        </div>
      </article>`;
  }

  html += '</div>';
  zonaCombos.innerHTML = html;
}

// ── Al cargar la página ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', cargarCombos);
