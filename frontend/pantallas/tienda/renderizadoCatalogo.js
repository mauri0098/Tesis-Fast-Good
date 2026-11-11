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

function renderizarInicio(combos) {
  const categorias = {};
  const planesSueltos = {};
  const tarjetas = [];

  combos.forEach((combo) => {
    const precio = Number(combo.precio);
    const precioPorVianda = Math.round(precio / combo.cantidad);

    let lista = planesSueltos;
    let id = combo.id_plan;
    let nombre = combo.plan;
    let imagen = combo.plan_imagen;
    let descripcion = combo.plan_descripcion;
    let queSeCuenta = combo.id;
    let textoUno = '1 combo';
    let textoVarios = ' combos';
    let textoBoton = 'Ver combos';
    let atributoId = 'data-id-plan';

    const tieneCategoria = combo.categoria !== null;
    if (tieneCategoria) {
      lista = categorias;
      id = combo.categoria.id;
      nombre = combo.categoria.nombre;
      imagen = combo.categoria.imagen;
      descripcion = combo.categoria.descripcion;
      queSeCuenta = combo.id_plan;
      textoUno = '1 plan';
      textoVarios = ' planes';
      textoBoton = 'Ver planes';
      atributoId = 'data-id-categoria';
    }

    const esLaPrimeraVez = lista[id] === undefined;
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

    if (combo.id_plan < tarjeta.idPlanMenor) {
      tarjeta.idPlanMenor = combo.id_plan;
    }
    if (precio < tarjeta.desde) {
      tarjeta.desde = precio;
    }
    if (precioPorVianda < tarjeta.desdePorVianda) {
      tarjeta.desdePorVianda = precioPorVianda;
    }
    const noSeContoTodavia = tarjeta.contados[queSeCuenta] === undefined;
    if (noSeContoTodavia) {
      tarjeta.contados[queSeCuenta] = true;
      tarjeta.cantidad = tarjeta.cantidad + 1;
    }
  });

  tarjetas.sort((tarjetaA, tarjetaB) => tarjetaA.idPlanMenor - tarjetaB.idPlanMenor);
  // ACÁ QUEDA EL ARRAY FINAL: tarjetas (categorías y planes sueltos, ya ordenadas)

  let contenidoHTML = '';
  tarjetas.forEach((tarjeta) => {
    let textoCantidad = tarjeta.cantidad + tarjeta.textoVarios;
    if (tarjeta.cantidad === 1) {
      textoCantidad = tarjeta.textoUno;
    }
    let descripcionHtml = '';
    if (tarjeta.descripcion) {
      descripcionHtml = `<small class="tarjeta-combo-descripcion">${escHtml(tarjeta.descripcion)}</small>`;
    }
    const fotoHtml = armarFotoTarjeta(tarjeta.combos, tarjeta.imagen, 'Categoría ' + tarjeta.nombre);
    const textoDesde = tarjeta.desde.toLocaleString('es-AR');
    const textoPorVianda = tarjeta.desdePorVianda.toLocaleString('es-AR');

    contenidoHTML += `
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
  // ACÁ SE RENDERIZAN las categorías y los planes sueltos (INICIO)
  contenedorTarjetasDelIndex.innerHTML = `<div class="grilla-tarjetas-del-index">${contenidoHTML}</div>`;
}

function renderizarPlanes(combos, idCategoria) {
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
      planes.push(planesPorId[combo.id_plan]);
    }
    const plan = planesPorId[combo.id_plan];
    plan.combos.push(combo);
    if (precio < plan.desde) {
      plan.desde = precio;
    }
  });
  planes.sort((planA, planB) => planA.id - planB.id);
  // ACÁ QUEDA EL ARRAY FINAL: planes (los de la categoría, ya ordenados)

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

function renderizarCombos(combos, idPlan, vieneDeUnaCategoria) {
  const combosDelPlan = combos.filter((combo) => combo.id_plan === idPlan);
  // ACÁ QUEDA EL ARRAY FINAL: combosDelPlan (los combos de ese plan)
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
    const fotoHtml = armarFotoTarjeta([combo], combo.plan_imagen, 'Combo ' + combo.plan);
    const precio = Number(combo.precio);
    const textoPrecio = precio.toLocaleString('es-AR');
    const textoPorVianda = Math.round(precio / combo.cantidad).toLocaleString('es-AR');

    let claseDestacada = '';
    let selloHtml = '';
    if (combo.destacado === true) {
      claseDestacada = ' tarjeta-combo-destacada';
      selloHtml = '<span class="tarjeta-combo-sello">Más elegido</span>';
    }

    contenidoHTML += `
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

  let fraseHtml = '';
  if (frasePlan) {
    fraseHtml = `<p class="frase-del-plan">${escHtml(frasePlan)}</p>`;
  }

  // ACÁ SE RENDERIZAN los combos del plan
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
  combosDisponibles = combosTraidos;
  // ACÁ QUEDA EL ARRAY FINAL de combos: combosDisponibles (lo usan las 3 renderizar y armarCombo.js)

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

  renderizarInicio(combosDisponibles);
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
    renderizarPlanes(combosDisponibles, idCategoriaElegida);
  }
  if (idPlanElegido !== null) {
    seccionCatalogo.classList.add('mostrando-combos');
    const vieneDeUnaCategoria = idCategoriaElegida !== null;
    renderizarCombos(combosDisponibles, idPlanElegido, vieneDeUnaCategoria);
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
