// renderizadoCatalogo.js — El catálogo de la tienda
let combosDisponibles = [];

let idCategoriaElegida = null;
let idPlanElegido = null;

const IMAGEN_POR_DEFECTO = './src/assets/img/logo.webp';

const seccionCatalogo = document.getElementById('catalogo');
const contenedorTarjetasDelIndex = document.getElementById('tarjetas-del-index');
const contenedorPlanes = document.getElementById('planes-de-la-categoria');
const contenedorCombos = document.getElementById('combos');
const avisoCombosDesde = document.getElementById('combos-desde');
const precioCombosDesde = document.getElementById('combos-desde-precio');

async function traerCombos() {
  try {
    // ACÁ SE TRAEN TODOS LOS DATOS: los combos con su plan, su categoría y sus platos
    const respuesta = await fetch('/api/v1/combos');
    if (!respuesta.ok) {
      throw new Error('HTTP ' + respuesta.status);
    }
    const combos = await respuesta.json();
    return combos;
  } catch (error) {
    console.error('Error al cargar los combos:', error);
    return null;
  }
}

function renderizarCategoriasYPlanes(combos) {
  const cajonDeLaCategoria = {};
  const cajonDelPlan = {};
  const tarjetasFinales = [];

  // ACÁ SE RECORREN los combos
  combos.forEach((combo) => {
    const precio = Number(combo.precio);
    const precioPorVianda = Math.round(precio / combo.cantidad);

    let cajonElegido = cajonDelPlan;
    let idDeLaTarjeta = combo.id_plan;
    let nombre = combo.plan;
    let imagen = combo.plan_imagen;
    let descripcion = combo.plan_descripcion;
    let idParaContar = combo.id;
    let textoUno = '1 combo';
    let textoVarios = ' combos';
    let textoBoton = 'Ver combos';
    let atributoId = 'data-id-plan';

    // ACÁ EL FILTRO: ¿el plan tiene categoría?
    const tieneCategoria = combo.categoria !== null;
    if (tieneCategoria) {
      cajonElegido = cajonDeLaCategoria;
      idDeLaTarjeta = combo.categoria.id;
      nombre = combo.categoria.nombre;
      imagen = combo.categoria.imagen;
      descripcion = combo.categoria.descripcion;
      idParaContar = combo.id_plan;
      textoUno = '1 plan';
      textoVarios = ' planes';
      textoBoton = 'Ver planes';
      atributoId = 'data-id-categoria';
    }

    const tarjetaNoExiste = cajonElegido[idDeLaTarjeta] === undefined;
    if (tarjetaNoExiste) {
      cajonElegido[idDeLaTarjeta] = {
        id: idDeLaTarjeta, nombre: nombre, imagen: imagen, descripcion: descripcion,
        textoUno: textoUno, textoVarios: textoVarios, textoBoton: textoBoton, atributoId: atributoId,
        idPlanMenor: combo.id_plan, desde: precio, desdePorVianda: precioPorVianda,
        cantidad: 0, yaContados: {}, combos: [],
        tamaniosVistos: {}, tamanios: []
      };
      // ACÁ SE PUSHEA: la tarjeta se agrega al final del array tarjetasFinales
      tarjetasFinales.push(cajonElegido[idDeLaTarjeta]);
    }

    const tarjetaActual = cajonElegido[idDeLaTarjeta];

    tarjetaActual.combos.push(combo);

    if (combo.id_plan < tarjetaActual.idPlanMenor) {
      tarjetaActual.idPlanMenor = combo.id_plan;
    }
    if (precio < tarjetaActual.desde) {
      tarjetaActual.desde = precio;
    }
    if (precioPorVianda < tarjetaActual.desdePorVianda) {
      tarjetaActual.desdePorVianda = precioPorVianda;
    }

    const noSeContoNunca = tarjetaActual.yaContados[idParaContar] === undefined;
    if (noSeContoNunca) {
      tarjetaActual.yaContados[idParaContar] = true;
      tarjetaActual.cantidad = tarjetaActual.cantidad + 1;
    }

    // (13/11) ACÁ SE PUSHEA cada tamaño de combo UNA vez (para "5, 10 o 20 viandas" en la tarjeta del plan)
    const tamanioNuevo = tarjetaActual.tamaniosVistos[combo.cantidad] === undefined;
    if (tamanioNuevo) { // ¿este tamaño todavía no está? SÍ: el primer x10 · NO: el segundo x10
      tarjetaActual.tamaniosVistos[combo.cantidad] = true;
      tarjetaActual.tamanios.push(combo.cantidad);
    }
  });

  tarjetasFinales.sort((tarjetaA, tarjetaB) => tarjetaA.idPlanMenor - tarjetaB.idPlanMenor);

  let contenidoHTML = '';
  tarjetasFinales.forEach((tarjetaActual) => {
    let textoCantidad = tarjetaActual.cantidad + tarjetaActual.textoVarios;
    if (tarjetaActual.cantidad === 1) {
      textoCantidad = tarjetaActual.textoUno;
    }
    let descripcionHtml = '';
    if (tarjetaActual.descripcion) {
      descripcionHtml = `<span class="tarjeta-combo-descripcion">${escHtml(tarjetaActual.descripcion)}</span>`;
    }

    // (13/11) El dato de abajo: una categoría muestra sus planes ("2 planes") y un plan, sus tamaños ("5, 10 o 20 viandas")
    let textoDato = textoCantidad;
    const esPlan = tarjetaActual.atributoId === 'data-id-plan';
    if (esPlan) { // ¿la tarjeta es de un plan? SÍ: MANTENIMIENTO · NO: una categoría
      // De menor a mayor. Ej: 10 − 5 = 5 → positivo → el 5 va primero
      tarjetaActual.tamanios.sort((cantidadA, cantidadB) => cantidadA - cantidadB);
      // Todas menos la última con ", " y la última con " o ". Ej: [5, 10, 20] → "5, 10 o 20 viandas" · [7] → "7 viandas"
      const ultima = tarjetaActual.tamanios[tarjetaActual.tamanios.length - 1];
      const primeras = tarjetaActual.tamanios.slice(0, tarjetaActual.tamanios.length - 1);
      textoDato = ultima + ' viandas';
      if (primeras.length > 0) { // ¿hay más de un tamaño? SÍ: [5, 10, 20] · NO: [7]
        textoDato = primeras.join(', ') + ' o ' + ultima + ' viandas';
      }
    }

    const fotoHtml = armarFotoTarjeta(tarjetaActual.combos, tarjetaActual.imagen, 'Categoría ' + tarjetaActual.nombre);

    // (13/11, diseño "la foto manda") la foto sola; debajo el nombre, la descripción y la fila con la cajita, el dato y el botón
    contenidoHTML += `
      <button type="button" class="tarjeta-combo tarjeta-del-index revelar" ${tarjetaActual.atributoId}="${escHtml(tarjetaActual.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
        </span>
        <span class="tarjeta-combo-nombre">${escHtml(tarjetaActual.nombre)}</span>
        ${descripcionHtml}
        <span class="tarjeta-combo-datos">
          <span class="dato-tarjeta">
            <svg class="icono-cajita" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M21 8l-9-5-9 5v8l9 5 9-5z"></path><path d="M3 8l9 5 9-5"></path><path d="M12 13v8"></path>
            </svg>
            <span class="dato-tarjeta-texto">${escHtml(textoDato)}</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">${escHtml(tarjetaActual.textoBoton)}<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });
  // ACÁ SE RENDERIZAN las categorías y los planes
  contenedorTarjetasDelIndex.innerHTML = `<div class="grilla-tarjetas-del-index">${contenidoHTML}</div>`;
}

function renderizarPlanesDeLaCategoria(combos, idCategoria) {
  // ACÁ EL FILTRO: los combos de la categoría que tocó
  const combosDeLaCategoria = combos.filter((combo) => {
    const esDeLaCategoria = combo.categoria !== null && combo.categoria.id === idCategoria;
    return esDeLaCategoria;
  });
  const categoria = combosDeLaCategoria[0].categoria;

  const planesPorId = {};
  const planes = [];
  combosDeLaCategoria.forEach((combo) => {
    const precio = Number(combo.precio);
    const esElPrimero = planesPorId[combo.id_plan] === undefined;
    if (esElPrimero) {
      planesPorId[combo.id_plan] = { id: combo.id_plan, nombre: combo.plan, imagen: combo.plan_imagen, desde: precio, combos: [] };
      // ACÁ SE PUSHEA: el plan se agrega al array planes
      planes.push(planesPorId[combo.id_plan]);
    }
    const plan = planesPorId[combo.id_plan];
    plan.combos.push(combo);
    if (precio < plan.desde) {
      plan.desde = precio;
    }
  });
  planes.sort((planA, planB) => planA.id - planB.id);

  let contenidoHTML = '';
  planes.forEach((plan) => {
    const fotoHtml = armarFotoTarjeta(plan.combos, plan.imagen, 'Plan ' + plan.nombre);
    const textoDesde = plan.desde.toLocaleString('es-AR');
    contenidoHTML += `
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
  if (categoria.descripcion) {
    fraseHtml = `<p class="frase-de-la-categoria">${escHtml(categoria.descripcion)}</p>`;
  }

  // ACÁ SE RENDERIZAN los planes de la categoría
  contenedorPlanes.innerHTML = `
    <div class="combos-barra">
      <button type="button" class="boton-volver-un-nivel" data-accion="volver-un-nivel" aria-label="Volver a todas las categorías">
        <span class="boton-volver-flecha" aria-hidden="true">‹</span>
        <span class="boton-volver-texto">Todas las categorías</span>
      </button>
      <h3 class="combos-barra-titulo">${escHtml(categoria.nombre)}</h3>
    </div>
    <h3 class="revelar">${escHtml(categoria.nombre)}</h3>
    ${fraseHtml}
    <div class="grilla-planes-categoria">${contenidoHTML}</div>`;
}

function renderizarCombosDelPlan(combos, idPlan, vieneDeUnaCategoria) {
  // ACÁ EL FILTRO: los combos del plan que tocó
  const combosDelPlan = combos.filter((combo) => combo.id_plan === idPlan);
  const nombrePlan = combosDelPlan[0].plan;
  const frasePlan = combosDelPlan[0].plan_descripcion;

  let textoVolver = 'Todas las categorías';
  let ayudaVolver = 'Volver a todas las categorías';
  if (vieneDeUnaCategoria) {
    textoVolver = 'Todos los planes';
    ayudaVolver = 'Volver a los planes de la categoría';
  }

  let contenidoHTML = '';
  combosDelPlan.forEach((combo) => {
    // (13/11) La foto: la del combo; si no tiene, la del plan (y si tampoco, armarFotoTarjeta usa la de un plato)
    let fotoDelCombo = combo.plan_imagen;
    if (combo.imagen) { // ¿el combo tiene foto propia? SÍ: va esa · NO: la del plan
      fotoDelCombo = combo.imagen;
    }
    const fotoHtml = armarFotoTarjeta([combo], fotoDelCombo, 'Combo ' + combo.nombre);
    const precio = Number(combo.precio);
    const textoPorVianda = Math.round(precio / combo.cantidad).toLocaleString('es-AR');

    let claseDestacada = '';
    let selloHtml = '';
    if (combo.destacado === true) {
      claseDestacada = ' tarjeta-combo-destacada';
      selloHtml = '<span class="tarjeta-combo-sello">Más elegido</span>';
    }

    // (13/11, diseño "la foto manda") la foto sola (solo lleva el sello "Más elegido"); debajo el nombre
    // (que ya dice cuántas viandas son) y la fila con el precio por vianda y "¡Lo quiero!"
    contenidoHTML += `
      <button type="button" class="tarjeta-combo tarjeta-combo-del-plan revelar${claseDestacada}" data-accion="armar-combo" data-id-combo="${escHtml(combo.id)}">
        <span class="tarjeta-combo-foto">
          ${fotoHtml}
          ${selloHtml}
        </span>
        <span class="tarjeta-combo-nombre">${escHtml(combo.nombre)}</span>
        <span class="tarjeta-combo-datos">
          <span class="tarjeta-combo-precios">
            <span class="tarjeta-combo-precio">$ ${escHtml(textoPorVianda)}</span>
            <span class="tarjeta-combo-por-vianda">por vianda</span>
          </span>
          <span class="tarjeta-combo-boton" aria-hidden="true">¡Lo quiero!<span class="tarjeta-combo-flecha">→</span></span>
        </span>
      </button>`;
  });

  let fraseHtml = '';
  if (frasePlan) {
    fraseHtml = `<p class="frase-del-plan">${escHtml(frasePlan)}</p>`;
  }

  // ACÁ SE RENDERIZAN los combos (con su botón "¡Lo quiero!" → armarCombo.js)
  contenedorCombos.innerHTML = `
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
    <div class="grilla-combos">${contenidoHTML}</div>`;
}

function armarFotoTarjeta(combos, fotoPropia, textoAlternativo) {
  let foto = fotoPropia;

  combos.forEach(combo => {
    const platoConFoto = combo.menu.find(plato => plato.imagen);
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

async function cargarCombos() {
  const combosTraidos = await traerCombos();

  if (combosTraidos === null) {
    contenedorTarjetasDelIndex.innerHTML = '<p class="aviso-combos">No pudimos cargar los combos. Probá de nuevo más tarde.</p>';
    return;
  }
  // ACÁ QUEDA EL ARRAY combosDisponibles
  combosDisponibles = combosTraidos;

  if (combosDisponibles.length === 0) {
    contenedorTarjetasDelIndex.innerHTML = '<p class="aviso-combos">Por ahora no hay combos disponibles.</p>';
    return;
  }

  let precioMasBajo = Number(combosDisponibles[0].precio);
  combosDisponibles.forEach((combo) => {
    const precio = Number(combo.precio);
    if (precio < precioMasBajo) {
      precioMasBajo = precio;
    }
  });
  precioCombosDesde.textContent = '$ ' + precioMasBajo.toLocaleString('es-AR');
  avisoCombosDesde.hidden = false;

  renderizarCategoriasYPlanes(combosDisponibles);
  mostrarNivelElegido();
}

function mostrarNivelElegido() {
  let idCategoriaDelPaso = null;
  let idPlanDelPaso = null;
  const hayPaso = history.state !== null;
  if (hayPaso) {
    idCategoriaDelPaso = history.state.idCategoria;
    idPlanDelPaso = history.state.idPlan;
  }

  idCategoriaElegida = null;
  idPlanElegido = null;
  combosDisponibles.forEach((combo) => {
    if (combo.id_plan === idPlanDelPaso) {
      idPlanElegido = idPlanDelPaso;
    }
    const esDeLaCategoria = combo.categoria !== null && combo.categoria.id === idCategoriaDelPaso;
    if (esDeLaCategoria) {
      idCategoriaElegida = idCategoriaDelPaso;
    }
  });

  seccionCatalogo.classList.remove('mostrando-planes');
  seccionCatalogo.classList.remove('mostrando-combos');

  if (idCategoriaElegida !== null) {
    seccionCatalogo.classList.add('mostrando-planes');
    renderizarPlanesDeLaCategoria(combosDisponibles, idCategoriaElegida);
  }
  if (idPlanElegido !== null) {
    seccionCatalogo.classList.add('mostrando-combos');
    const vieneDeUnaCategoria = idCategoriaElegida !== null;
    renderizarCombosDelPlan(combosDisponibles, idPlanElegido, vieneDeUnaCategoria);
  }
}

function volverAPlanes() {
  history.replaceState(null, '');
  mostrarNivelElegido();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarCombos();

  seccionCatalogo.addEventListener('click', (evento) => {
    const botonVolver = evento.target.closest('[data-accion="volver-un-nivel"]');
    if (botonVolver) {
      history.back();
      return;
    }

    const tarjetaCategoria = evento.target.closest('[data-id-categoria]');
    const tarjetaPlan = evento.target.closest('[data-id-plan]');
    const noTocoUnaTarjeta = !tarjetaCategoria && !tarjetaPlan;
    if (noTocoUnaTarjeta) {
      return;
    }

    let idCategoria = idCategoriaElegida;
    let idPlan = null;
    if (tarjetaCategoria) {
      idCategoria = Number(tarjetaCategoria.dataset.idCategoria);
    }
    if (tarjetaPlan) {
      idPlan = Number(tarjetaPlan.dataset.idPlan);
    }

    history.pushState({ idCategoria: idCategoria, idPlan: idPlan }, '');
    mostrarNivelElegido();
  });

  window.addEventListener('popstate', mostrarNivelElegido);
});
