// ====================================================================
// RENDERIZADOCATALOGO.JS — El catálogo de index.html, en 3 niveles
//
// Funciones:
//   cargarCombos                  → trae los combos y dibuja el nivel que corresponde (la llama también pedidoCombos.js)
//   armarFotoTarjeta              → arma el HTML de la foto de una tarjeta (la usa también armarCombo.js)
//   renderizarTarjetasDelIndex    → NIVEL 1: los planes sueltos y una tarjeta por categoría
//   renderizarPlanesDeLaCategoria → NIVEL 2: los planes de una categoría
//   renderizarCombosDelPlan       → NIVEL 3: los combos de un plan
//   mostrarNivelElegido           → lee el historial del navegador y muestra ese nivel
//   volverAPlanes                 → vuelve al nivel 1 (la llama pedidoCombos.js al confirmar el pedido)
// ====================================================================

const IMAGEN_POR_DEFECTO = './src/assets/img/logo.webp';

let combosDisponibles = [];
let idCategoriaElegida = null;
let idPlanElegido = null;

// ENTRADA: nada
// SALIDA:  nada (guarda los combos, escribe "Combos desde $…" y dibuja el nivel 1 y el nivel elegido)
// Ej: combos de $ 137.000 y $ 60.000 → "Combos desde $ 60.000"
async function cargarCombos() {
  const zonaTarjetas = document.getElementById('tarjetas-del-index');

  try {
    const respuesta = await fetch('/api/v1/combos');
    // ¿el servidor respondió con error? SÍ: 500 · NO: 200
    if (!respuesta.ok) {
      throw new Error('HTTP ' + respuesta.status);
    }
    combosDisponibles = await respuesta.json();
  } catch (error) {
    console.error('Error al cargar los combos:', error);
    zonaTarjetas.innerHTML = '<p class="aviso-combos">No pudimos cargar los combos. Probá de nuevo más tarde.</p>';
    return;
  }

  // ¿no hay ningún combo a la venta? SÍ: lista vacía · NO: 5 combos
  if (combosDisponibles.length === 0) {
    zonaTarjetas.innerHTML = '<p class="aviso-combos">Por ahora no hay combos disponibles.</p>';
    return;
  }

  let precioMasBajo = Number(combosDisponibles[0].precio);
  combosDisponibles.forEach(combo => {
    const precio = Number(combo.precio);
    // ¿este combo es más barato que el más bajo hasta ahora? SÍ: 60000 contra 137000 · NO: 137000 contra 60000
    if (precio < precioMasBajo) {
      precioMasBajo = precio;
    }
  });
  document.getElementById('combos-desde-precio').textContent = '$ ' + precioMasBajo.toLocaleString('es-AR');
  document.getElementById('combos-desde').hidden = false;

  renderizarTarjetasDelIndex();
  mostrarNivelElegido();
}

// ENTRADA: combos = de dónde puede salir la foto de un plato · fotoPropia = la foto de la categoría o del plan, o null
//          textoAlternativo = lo que lee un lector de pantalla
// SALIDA:  el HTML de la foto: 1) la propia · 2) la del primer plato con foto · 3) el recuadro gris
// Ej: SIN TACC sin foto y su plato "fideos.png" → la imagen fideos.png
function armarFotoTarjeta(combos, fotoPropia, textoAlternativo) {
  let foto = fotoPropia;

  combos.forEach(combo => {
    const platoConFoto = combo.menu.find(plato => plato.imagen);
    const faltaFoto = !foto && platoConFoto !== undefined;
    // ¿todavía no hay foto y este combo tiene un plato con foto? SÍ: sin foto de plan y con "fideos.png" · NO: ya tiene foto
    if (faltaFoto) {
      foto = platoConFoto.imagen;
    }
  });

  // ¿no hay ninguna foto? SÍ: sin foto propia ni de platos · NO: tiene el banner
  if (!foto) {
    return '<span class="foto">foto del combo</span>';
  }

  return `<img src="${escHtml(foto)}" alt="${escHtml(textoAlternativo)}" loading="lazy"
               onerror="this.onerror = null; this.src = '${IMAGEN_POR_DEFECTO}'; this.classList.add('foto-logo');">`;
}

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN 1 · NIVEL 1 · renderizarTarjetasDelIndex()
// ESTA FUNCIÓN SE ENCARGA DE RENDERIZAR LOS PLANES SUELTOS
// (planes sin categoría) Y UNA TARJETA POR CADA CATEGORÍA.
// Recibe: nada (usa combosDisponibles)
// Dibuja en: #tarjetas-del-index
// Ej: MANTENIMIENTO (data-id-plan="2") y Viandas Saludables (data-id-categoria="1")
// ═══════════════════════════════════════════════════════════════
function renderizarTarjetasDelIndex() {
  const categorias = {};
  const planesSueltos = {};
  const tarjetas = [];

  combosDisponibles.forEach(combo => {
    const precio = Number(combo.precio);
    const precioPorVianda = Math.round(precio / combo.cantidad);

    let lista = planesSueltos;
    let id = combo.id_plan;
    let nombre = combo.plan;
    let imagen = combo.plan_imagen;
    let descripcion = combo.plan_descripcion;
    let queSeCuenta = combo.id;     // un plan suelto cuenta sus combos
    let textoUno = '1 combo';
    let textoVarios = ' combos';
    let textoBoton = 'Ver combos';
    let atributoId = 'data-id-plan';

    const tieneCategoria = combo.categoria !== null;
    // ¿el plan tiene categoría? SÍ: PLAN VEGGIE · NO: MANTENIMIENTO
    if (tieneCategoria) {
      lista = categorias;
      id = combo.categoria.id;
      nombre = combo.categoria.nombre;
      imagen = combo.categoria.imagen;
      descripcion = combo.categoria.descripcion;
      queSeCuenta = combo.id_plan;  // una categoría cuenta sus planes
      textoUno = '1 plan';
      textoVarios = ' planes';
      textoBoton = 'Ver planes';
      atributoId = 'data-id-categoria';
    }

    const esLaPrimeraVez = lista[id] === undefined;
    // ¿es el primer combo de esta tarjeta? SÍ: el primero de Viandas Saludables · NO: el segundo
    if (esLaPrimeraVez) {
      lista[id] = {
        id: id, nombre: nombre, imagen: imagen, descripcion: descripcion,
        textoUno: textoUno, textoVarios: textoVarios, textoBoton: textoBoton, atributoId: atributoId,
        idPlanMenor: combo.id_plan, desde: precio, desdePorVianda: precioPorVianda,
        cantidad: 0, contados: {}, combos: []
      };
      tarjetas.push(lista[id]);
    }

    const tarjeta = lista[id];
    tarjeta.combos.push(combo);

    // ¿este plan tiene un número más chico? SÍ: 3 contra 4 · NO: 5 contra 3
    if (combo.id_plan < tarjeta.idPlanMenor) {
      tarjeta.idPlanMenor = combo.id_plan;
    }
    // ¿este combo es más barato? SÍ: 50000 contra 60000 · NO: 110000 contra 60000
    if (precio < tarjeta.desde) {
      tarjeta.desde = precio;
    }
    // ¿sale menos por vianda? SÍ: 10000 contra 12000 · NO: 13700 contra 12000
    if (precioPorVianda < tarjeta.desdePorVianda) {
      tarjeta.desdePorVianda = precioPorVianda;
    }
    const noSeContoTodavia = tarjeta.contados[queSeCuenta] === undefined;
    // ¿esto todavía no se contó? SÍ: el primer combo de Veggie · NO: el segundo combo de Veggie
    if (noSeContoTodavia) {
      tarjeta.contados[queSeCuenta] = true;
      tarjeta.cantidad = tarjeta.cantidad + 1;
    }
  });

  // Se ordena por el plan más chico de cada tarjeta. Ej: Mantenimiento 2 − Viandas 3 = −1 → negativo → Mantenimiento va primero
  tarjetas.sort((tarjetaA, tarjetaB) => tarjetaA.idPlanMenor - tarjetaB.idPlanMenor);

  let html = '';
  tarjetas.forEach(tarjeta => {
    let textoCantidad = tarjeta.cantidad + tarjeta.textoVarios;
    // ¿hay uno solo? SÍ: "1 plan" · NO: "3 planes"
    if (tarjeta.cantidad === 1) {
      textoCantidad = tarjeta.textoUno;
    }

    let descripcionHtml = '';
    // ¿tiene frase? SÍ: "Para toda la semana" · NO: null
    if (tarjeta.descripcion) {
      descripcionHtml = `<small class="tarjeta-combo-descripcion">${escHtml(tarjeta.descripcion)}</small>`;
    }

    const fotoHtml = armarFotoTarjeta(tarjeta.combos, tarjeta.imagen, 'Categoría ' + tarjeta.nombre);
    const textoDesde = tarjeta.desde.toLocaleString('es-AR');
    const textoPorVianda = tarjeta.desdePorVianda.toLocaleString('es-AR');

    // acá se dibuja la tarjeta de un plan suelto (data-id-plan) o de una categoría (data-id-categoria)
    html += `
      <button type="button" class="tarjeta-combo tarjeta-del-index revelar" ${tarjeta.atributoId}="${escHtml(tarjeta.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
          <span class="tarjeta-combo-cantidad">${escHtml(textoCantidad)}</span>
          <span class="tarjeta-combo-nombre">${escHtml(tarjeta.nombre)}${descripcionHtml}</span>
        </span>
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-precios">
            <span class="tarjeta-desde">Desde</span>
            <span class="tarjeta-combo-precio">$ ${escHtml(textoDesde)}</span>
            <span class="tarjeta-combo-por-vianda">o <b>$ ${escHtml(textoPorVianda)}</b> por vianda</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">${escHtml(tarjeta.textoBoton)}<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });

  // acá se dibujan todas las tarjetas del nivel 1 en #tarjetas-del-index
  document.getElementById('tarjetas-del-index').innerHTML = `<div class="grilla-tarjetas-del-index">${html}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN 2 · NIVEL 2 · renderizarPlanesDeLaCategoria(idCategoria)
// ESTA FUNCIÓN SE ENCARGA, CON EL ID DE LA CATEGORÍA,
// DE RENDERIZAR LOS PLANES QUE ESTÁN ADENTRO DE ESA CATEGORÍA.
// Recibe: idCategoria (ej: 1)
// Dibuja en: #planes-de-la-categoria
// Ej: (1) → PLAN DEPORTIVO, PLAN VEGGIE, PLAN KIDS (cada uno con data-id-plan)
// ═══════════════════════════════════════════════════════════════
function renderizarPlanesDeLaCategoria(idCategoria) {
  const combosDeLaCategoria = combosDisponibles.filter(combo => combo.categoria !== null && combo.categoria.id === idCategoria);
  const categoria = combosDeLaCategoria[0].categoria;

  const planesPorId = {};
  const planes = [];
  combosDeLaCategoria.forEach(combo => {
    const precio = Number(combo.precio);
    const esElPrimero = planesPorId[combo.id_plan] === undefined;
    // ¿es el primer combo de este plan? SÍ: el primero de Veggie · NO: el segundo
    if (esElPrimero) {
      planesPorId[combo.id_plan] = { id: combo.id_plan, nombre: combo.plan, imagen: combo.plan_imagen, desde: precio, combos: [] };
      planes.push(planesPorId[combo.id_plan]);
    }

    const plan = planesPorId[combo.id_plan];
    plan.combos.push(combo);
    // ¿este combo es más barato? SÍ: 60000 contra 110000 · NO: 200000 contra 60000
    if (precio < plan.desde) {
      plan.desde = precio;
    }
  });

  // Se ordena por el número de plan. Ej: Deportivo 3 − Veggie 4 = −1 → negativo → Deportivo va primero
  planes.sort((planA, planB) => planA.id - planB.id);

  let htmlPlanes = '';
  planes.forEach(plan => {
    const fotoHtml = armarFotoTarjeta(plan.combos, plan.imagen, 'Plan ' + plan.nombre);
    const textoDesde = plan.desde.toLocaleString('es-AR');

    // acá se dibuja una tarjeta por cada plan de idCategoria
    htmlPlanes += `
      <button type="button" class="tarjeta-plan revelar" data-id-plan="${escHtml(plan.id)}">
        <span class="tarjeta-plan-foto">${fotoHtml}</span>
        <span class="tarjeta-plan-textos">
          <span class="tarjeta-plan-nombre">${escHtml(plan.nombre)}</span>
          <span class="tarjeta-desde">Desde</span>
          <span class="tarjeta-combo-precio">$ ${escHtml(textoDesde)}</span>
        </span>
        <span class="tarjeta-plan-flecha" aria-hidden="true">›</span>
      </button>`;
  });

  let fraseHtml = '';
  // ¿la categoría tiene frase? SÍ: "Para toda la semana" · NO: null
  if (categoria.descripcion) {
    fraseHtml = `<p class="frase-de-la-categoria">${escHtml(categoria.descripcion)}</p>`;
  }

  // acá se dibujan el "‹", el nombre de idCategoria y sus planes en #planes-de-la-categoria
  document.getElementById('planes-de-la-categoria').innerHTML = `
    <div class="combos-barra">
      <button type="button" class="boton-volver-un-nivel" data-accion="volver-un-nivel" aria-label="Volver a todas las categorías">
        <span class="boton-volver-flecha" aria-hidden="true">‹</span>
        <span class="boton-volver-texto">Todas las categorías</span>
      </button>
      <h3 class="combos-barra-titulo">${escHtml(categoria.nombre)}</h3>
    </div>
    <h3 class="revelar">${escHtml(categoria.nombre)}</h3>
    ${fraseHtml}
    <div class="grilla-planes-categoria">${htmlPlanes}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN 3 · NIVEL 3 · renderizarCombosDelPlan(idPlan)
// ESTA FUNCIÓN SE ENCARGA, CON EL ID DEL PLAN,
// DE RENDERIZAR LOS COMBOS DE ESE PLAN.
// Recibe: idPlan (ej: 4)
// Dibuja en: #combos
// Ej: (4) → los combos de PLAN VEGGIE: 5, 10 y 20 viandas
// ═══════════════════════════════════════════════════════════════
function renderizarCombosDelPlan(idPlan) {
  const combosDelPlan = combosDisponibles.filter(combo => combo.id_plan === idPlan);
  const nombrePlan = combosDelPlan[0].plan;
  const frase = combosDelPlan[0].plan_descripcion;

  let fraseHtml = '';
  // ¿el plan tiene frase? SÍ: "Sin carne" · NO: null
  if (frase) {
    fraseHtml = `<p class="frase-del-plan">${escHtml(frase)}</p>`;
  }

  let textoVolver = 'Todas las categorías';
  let ayudaVolver = 'Volver a todas las categorías';
  const vieneDeUnaCategoria = idCategoriaElegida !== null;
  // ¿el plan se abrió desde una categoría? SÍ: PLAN VEGGIE · NO: MANTENIMIENTO
  if (vieneDeUnaCategoria) {
    textoVolver = 'Todos los planes';
    ayudaVolver = 'Volver a los planes de la categoría';
  }

  let htmlCombos = '';
  combosDelPlan.forEach(combo => {
    const fotoHtml = armarFotoTarjeta([combo], combo.plan_imagen, 'Combo ' + combo.plan);
    const precio = Number(combo.precio);
    const textoPrecio = precio.toLocaleString('es-AR');
    const textoPorVianda = Math.round(precio / combo.cantidad).toLocaleString('es-AR');

    let claseDestacada = '';
    let selloHtml = '';
    // ¿el combo está marcado como destacado? SÍ: "Más elegido" · NO: sin pastilla
    if (combo.destacado === true) {
      claseDestacada = ' tarjeta-combo-destacada';
      selloHtml = '<span class="tarjeta-combo-sello">Más elegido</span>';
    }

    // acá se dibuja una tarjeta por cada combo de idPlan
    htmlCombos += `
      <button type="button" class="tarjeta-combo revelar${claseDestacada}" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
          <span class="tarjeta-combo-cantidad">${escHtml(combo.cantidad)} viandas</span>
          ${selloHtml}
          <span class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</span>
        </span>
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-precios">
            <span class="tarjeta-combo-precio">$ ${escHtml(textoPrecio)}</span>
            <span class="tarjeta-combo-por-vianda">$ ${escHtml(textoPorVianda)} por vianda</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">¡Lo quiero!<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });

  // acá se dibujan el "‹", el nombre de idPlan y sus combos en #combos
  document.getElementById('combos').innerHTML = `
    <div class="combos-barra">
      <button type="button" class="boton-volver-un-nivel" data-accion="volver-un-nivel" aria-label="${escHtml(ayudaVolver)}">
        <span class="boton-volver-flecha" aria-hidden="true">‹</span>
        <span class="boton-volver-texto">${escHtml(textoVolver)}</span>
      </button>
      <h3 class="combos-barra-titulo">${escHtml(nombrePlan)}</h3>
    </div>
    <h3 class="revelar">${escHtml(nombrePlan)}</h3>
    ${fraseHtml}
    <p class="revelar">Elegís la cantidad y después armás tus platos. Podés repetir.</p>
    <p class="rotulo zona-combos-rotulo">¿Cuántas viandas?</p>
    <div class="grilla-combos">${htmlCombos}</div>`;
}

// ENTRADA: nada (lee el paso del historial: { idCategoria, idPlan })
// SALIDA:  nada (guarda los ids, pone la clase del nivel y lo dibuja). Si un id ya no tiene combos, queda en null
// Ej: paso { idCategoria: 1, idPlan: 4 } → planes de la categoría 1, y arriba los combos del plan 4
function mostrarNivelElegido() {
  let idCategoriaDelPaso = null;
  let idPlanDelPaso = null;
  const hayPaso = history.state !== null;
  // ¿hay un paso guardado? SÍ: se tocó una tarjeta · NO: se acaba de abrir la página
  if (hayPaso) {
    idCategoriaDelPaso = history.state.idCategoria;
    idPlanDelPaso = history.state.idPlan;
  }

  idCategoriaElegida = null;
  idPlanElegido = null;
  combosDisponibles.forEach(combo => {
    // ¿este combo es del plan del paso? SÍ: plan 4 y paso 4 · NO: plan 2 y paso 4
    if (combo.id_plan === idPlanDelPaso) {
      idPlanElegido = idPlanDelPaso;
    }
    const esDeLaCategoria = combo.categoria !== null && combo.categoria.id === idCategoriaDelPaso;
    // ¿este combo es de la categoría del paso? SÍ: categoría 1 y paso 1 · NO: sin categoría
    if (esDeLaCategoria) {
      idCategoriaElegida = idCategoriaDelPaso;
    }
  });

  const seccion = document.getElementById('catalogo');
  seccion.classList.remove('mostrando-planes');
  seccion.classList.remove('mostrando-combos');

  // ¿hay una categoría elegida? SÍ: 1 · NO: null
  if (idCategoriaElegida !== null) {
    seccion.classList.add('mostrando-planes');
    // NIVEL 2: acá se renderizan los planes de la categoría idCategoriaElegida
    renderizarPlanesDeLaCategoria(idCategoriaElegida);
  }
  // ¿hay un plan elegido? SÍ: 4 · NO: null
  if (idPlanElegido !== null) {
    seccion.classList.add('mostrando-combos');
    // NIVEL 3: acá se renderizan los combos del plan idPlanElegido
    renderizarCombosDelPlan(idPlanElegido);
  }
}

// ENTRADA: nada
// SALIDA:  nada (borra el paso actual y deja el nivel 1)
// Ej: se confirmó el pedido viendo PLAN VEGGIE → detrás quedan las tarjetas del index
function volverAPlanes() {
  history.replaceState(null, '');
  mostrarNivelElegido();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarCombos();

  // Abrir un nivel anota un paso en el historial. "‹" vuelve un paso, igual que el "atrás" del navegador.
  document.getElementById('catalogo').addEventListener('click', evento => {
    const botonVolver = evento.target.closest('[data-accion="volver-un-nivel"]');
    // ¿tocó "‹"? SÍ: el botón de volver · NO: una tarjeta
    if (botonVolver) {
      history.back();
      return;
    }

    const tarjetaCategoria = evento.target.closest('[data-id-categoria]');
    const tarjetaPlan = evento.target.closest('[data-id-plan]');
    const noTocoUnaTarjeta = !tarjetaCategoria && !tarjetaPlan;
    // ¿el clic cayó fuera de las tarjetas de nivel? SÍ: un combo o el fondo · NO: Viandas Saludables
    if (noTocoUnaTarjeta) {
      return;
    }

    let idCategoria = idCategoriaElegida;
    let idPlan = null;
    // ¿tocó una categoría? SÍ: Viandas Saludables · NO: PLAN VEGGIE
    if (tarjetaCategoria) {
      idCategoria = Number(tarjetaCategoria.dataset.idCategoria);
    }
    // ¿tocó un plan? SÍ: PLAN VEGGIE · NO: Viandas Saludables
    if (tarjetaPlan) {
      idPlan = Number(tarjetaPlan.dataset.idPlan);
    }

    history.pushState({ idCategoria: idCategoria, idPlan: idPlan }, '');
    mostrarNivelElegido();
  });

  window.addEventListener('popstate', mostrarNivelElegido);
});
