// ============================================================================
// registrarCompra.js — La ventana "Registrar compra" de la pantalla Compras (pages/compras.html)
// (05/11) Se mudó desde movimientosStockNuevo.js sin reescribirla: las funciones son las mismas y lo que se manda al
// servidor (POST /api/compras) no cambió. Cambiaron solo el HTML que arma cada renglón (diseño 4-registrar-compra),
// la X de arriba y el final de guardarCompra, que ahora recarga la pantalla Compras.
//
// Funciones:
//   estaBajo               → ¿el insumo tiene menos stock que el mínimo?
//   calcularVencimiento    → fecha de compra + días de duración
//   renderizarInsumosModal → un renglón por insumo en la lista de la ventana
//   recalcularVencimientos → recalcula los vencimientos al cambiar la fecha de compra
//   filtrarRenglonesCompra → muestra u oculta renglones por categoría y "Solo los bajos"
//   llenarCategorias       → llena el select de categorías
//   juntarItemsCompra      → los renglones con cantidad escrita
//   guardarCompra          → manda la compra (POST /api/compras), cierra la ventana y recarga la pantalla
//   contarCargadosCompra   → (05/11) cuenta en vivo los renglones con cantidad, los marca y avisa si hay una negativa
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml), fechas.js y stockCompartido.js (listaInsumos,
// traerInsumos, opcionesUnidad y mostrarCantidad). Después de guardar llama a cargarCompras (compras.js).
// Los insumos los trae compras.js al cargar la página (y abre esta ventana sola si la dirección dice ?compra=1).
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

// ---------- MODAL DE COMPRA ----------

// 1. Buscar los elementos del HTML por su id y guardarlos en constantes
const modalCompra = document.getElementById("modalCompra");               // el modal entero
const btnRegistrarCompra = document.getElementById("btnRegistrarCompra"); // botón "+ Registrar compra"
const btnCancelarCompra = document.getElementById("btnCancelarCompra");   // botón "Cancelar"
const botonCerrarCompra = document.getElementById("botonCerrarCompra");   // (05/11) la X de arriba, nueva del diseño
const compraFecha = document.getElementById("compraFecha");               // fecha de la compra
const compraCategoria = document.getElementById("compraCategoria");       // select de categoría
const compraSoloBajos = document.getElementById("compraSoloBajos");       // checkbox "Solo los bajos"
const btnGuardarCompra = document.getElementById("btnGuardarCompra");         // botón "Guardar compra"
const compraProveedor = document.getElementById("compraProveedor");                     // input de proveedor (texto)
const compraError = document.getElementById("compraError");                           // div de error
// (05/11) El contador de abajo y la lista de renglones (los dibuja renderizarInsumosModal)
const compraRenglones = document.getElementById("comprasItemsBody");                    // la lista de renglones
const numeroCargados = document.querySelector("#compraContador .numero-cargados");      // el circulito con el número
const textoCargados = document.querySelector("#compraContador .texto-cargados");        // "insumos cargados"


btnGuardarCompra.addEventListener("click", guardarCompra);  // cuando tocan "Guardar compra", llamar a la función que guarda

// 2. Cuando tocan "+ Registrar compra"...
btnRegistrarCompra.addEventListener("click", () => {
  compraFecha.value = fechaLocalISO(new Date()); // la fecha arranca en hoy (fechaLocalISO está en fechas.js)
  modalCompra.hidden = false;                    // ...le saco el "oculto" → el modal aparece
  renderizarInsumosModal(listaInsumos);          // ...dibujo los renglones de cero
  filtrarRenglonesCompra();                      // ...y aplico los filtros que estén elegidos
  contarCargadosCompra();                        // ...y el contador vuelve a 0 (05/11: los renglones arrancan vacíos)
});

// (05/11) Mientras se escribe una cantidad, el contador cuenta de nuevo
compraRenglones.addEventListener("input", contarCargadosCompra);

// Si cambian la fecha de compra, se recalculan los vencimientos de todos los renglones
compraFecha.addEventListener("change", recalcularVencimientos);

// Si cambian la categoría o "Solo los bajos", se filtran los renglones
compraCategoria.addEventListener("change", filtrarRenglonesCompra);
compraSoloBajos.addEventListener("change", filtrarRenglonesCompra);

// 3. Cuando tocan "Cancelar" o la X (05/11: la X es nueva del diseño y hace lo mismo que "Cancelar")...
// Escape y tocar afuera NO la cierran, igual que antes: así no se pierden las cantidades ya escritas
[btnCancelarCompra, botonCerrarCompra].forEach((boton) => {
  boton.addEventListener("click", () => {
    modalCompra.hidden = true;    // ...le pongo el "oculto" → el modal desaparece
  });
});


// ¿El insumo está bajo? (tiene menos stock que el mínimo)
function estaBajo(insumo) {
  return Number(insumo.stock_actual) < Number(insumo.stock_minimo);
}

// Vencimiento = fecha de compra + dias_duracion. Devuelve 'AAAA-MM-DD' o "" si no se puede calcular.
// Trabaja con la fecha LOCAL (parseFechaLocal y fechaLocalISO están en fechas.js):
// toISOString pasaría a UTC y podría dar un día menos.
function calcularVencimiento(fechaCompra, diasDuracion) {
  if (!fechaCompra || diasDuracion === null || diasDuracion === undefined) return "";

  const fecha = parseFechaLocal(fechaCompra);            // 'AAAA-MM-DD' → Date
  fecha.setDate(fecha.getDate() + Number(diasDuracion)); // sumar los días
  return fechaLocalISO(fecha);                           // Date → 'AAAA-MM-DD'
}

// Dibuja un renglón por insumo en la lista del modal
// 28/10: la lista ya no es una <table>: cada renglón es un <div class="renglon-compra"> con las mismas 6 columnas
// de grilla que los títulos (los nombres tbody y tr quedan como estaban: ahora son la lista y su renglón)
// 05/11 (diseño 4-registrar-compra): abajo del nombre va su categoría, y la cantidad muestra un "0" de ejemplo.
// Al final, el aviso "Tiene que ser mayor a 0", escondido: lo muestra contarCargadosCompra si la cantidad es negativa
function renderizarInsumosModal(insumos) {
  const tbody = document.getElementById("comprasItemsBody"); // buscar la lista de renglones
  tbody.innerHTML = "";                                       // vaciarla

  // Los bajos primero. Se ordena una copia para no desordenar listaInsumos
  const ordenados = [...insumos].sort((a, b) => estaBajo(b) - estaBajo(a));

  ordenados.forEach((insumo) => {              // recorrer: "insumo" es uno solo en cada vuelta
    const tr = document.createElement("div");  // crear un renglón nuevo (28/10: un div de la grilla)
    tr.className = "renglon-compra";           // las 6 columnas de la grilla (CSS)
    tr.setAttribute("role", "row");            // para el lector de pantalla: un renglón de la tabla
    tr.dataset.id = insumo.id;                 // data-id: de qué insumo es este renglón

    // data-categoria: de qué categoría es este renglón (lo usa el filtro)
    // 05/11: y el texto que va abajo del nombre (sin categoría, no va nada)
    let textoCategoria = "";
    if (insumo.categorias_insumos) {
      tr.dataset.categoria = insumo.categorias_insumos.nombre;
      textoCategoria = insumo.categorias_insumos.nombre;
    } else {
      tr.dataset.categoria = "Sin categoría";
    }

    // Si está bajo, la clase fila-baja (la usa "Solo los bajos"; 05/11: con el diseño nuevo el renglón ya no se pinta,
    // lo rojo es solo la pastilla del stock)
    if (estaBajo(insumo)) tr.classList.add("fila-baja");
    // 28/10: el stock va en una pastilla: gris, o roja si está bajo
    const clasePastilla = estaBajo(insumo) ? "pastilla-stock pastilla-stock--baja" : "pastilla-stock";
    const nombre = escHtml(insumo.nombre);     // el nombre, seguro para el HTML (también va en los aria-label)
    const categoria = escHtml(textoCategoria); // la categoría, segura para el HTML

    // Vencimiento ya calculado con la fecha de compra de arriba (se puede cambiar a mano)
    const vence = calcularVencimiento(compraFecha.value, insumo.dias_duracion);
    // 28/10: el calendario no deja elegir un vencimiento anterior a HOY (min). Hoy es el día LOCAL ('AAAA-MM-DD',
    // fechaLocalISO de fechas.js): toISOString pasaría a UTC y a las 21 h ya sería mañana. Ej: hoy 28/10 → '2026-10-28'
    const hoy = fechaLocalISO(new Date());

    // Stock y mínimo en kg / lts. Los textos que vienen de la base
    // pasan por escHtml (escape.js) antes del innerHTML
    const stock  = escHtml(mostrarCantidad(insumo.stock_actual, insumo.unidad_medida));
    const minimo = escHtml(mostrarCantidad(insumo.stock_minimo, insumo.unidad_medida));

    // Las 6 celdas del renglón. ${ } mete el dato del insumo en el texto.
    // 28/10: celdas <span role="cell"> en lugar de <td>; cada casillero dice para qué insumo es (aria-label)
    tr.innerHTML = `
      <span role="cell" class="renglon-compra-nombre">${nombre}<span class="categoria-renglon-compra">${categoria}</span></span>
      <span role="cell"><span class="${clasePastilla}">${stock}</span></span>
      <span role="cell" class="renglon-compra-minimo">${minimo}</span>
      <span role="cell"><input type="number" min="0" step="any" placeholder="0" class="compra-cantidad" aria-label="Cantidad de ${nombre}"></span>
      <span role="cell">
        <select class="compra-unidad" aria-label="Unidad de ${nombre}">
          ${opcionesUnidad(insumo.unidad_medida)}
        </select>
      </span>
      <span role="cell"><input type="date" class="compra-vence" value="${vence}" min="${hoy}" aria-label="Vencimiento de ${nombre}"></span>
      <span class="aviso-renglon-compra" hidden>Tiene que ser mayor a 0</span>
    `;

    tbody.appendChild(tr);   // pegar el renglón en la lista
  });
}

// Recalcula la columna Vence de todos los renglones con la fecha de compra nueva
function recalcularVencimientos() {
  const filas = document.querySelectorAll("#comprasItemsBody .renglon-compra[data-id]");

  filas.forEach((tr) => {
    // Buscar el insumo de este renglón por su data-id
    const insumo = listaInsumos.find((i) => String(i.id) === tr.dataset.id);
    if (!insumo) return;

    tr.querySelector(".compra-vence").value = calcularVencimiento(compraFecha.value, insumo.dias_duracion);
  });
}

// Muestra u oculta renglones según la categoría y "Solo los bajos".
// No redibuja la tabla: así no se borran las cantidades que ya escribió.
function filtrarRenglonesCompra() {
  const categoria = compraCategoria.value;   // lo elegido en el select ("" = Todas)
  const soloBajos = compraSoloBajos.checked; // true si está tildado

  const filas = document.querySelectorAll("#comprasItemsBody .renglon-compra[data-id]"); // todos los renglones

  filas.forEach((tr) => {
    // ¿Eligió "Todas" O la categoría del renglón es la elegida?
    const coincideCategoria = categoria === "" || tr.dataset.categoria === categoria;

    // ¿NO tildó "Solo los bajos" O el renglón está bajo (tiene la clase fila-baja)?
    const pasaBajos = !soloBajos || tr.classList.contains("fila-baja");

    // Se ve solo si cumple las dos. Si no, se oculta
    tr.hidden = !(coincideCategoria && pasaBajos);
  });
}

// Llena el select de categorías con las categorías de los insumos (sin repetir)
function llenarCategorias(insumos) {
  // NO lo vaciamos: así queda la opción "Todas" del HTML
  const categorias = new Set();          // un Set: como un array, pero no acepta repetidos

  insumos.forEach((insumo) => {          // recorrer los insumos
    if (insumo.categorias_insumos) {     // si el insumo tiene categoría…
      categorias.add(insumo.categorias_insumos.nombre); // …agregar el nombre (si ya está, no lo repite)
    }
  });

  categorias.forEach((nombre) => {                   // por cada categoría (sin repetidos)…
    const option = document.createElement("option"); // …crear un <option>
    option.value = nombre;                           // el valor que lee el JS
    option.textContent = nombre;                     // el texto que se ve
    compraCategoria.appendChild(option);             // pegarlo en el select
  });
}

// Recorre los renglones y devuelve solo los que tienen cantidad escrita
function juntarItemsCompra() {
  const items = [];                                                          // acá se van juntando
  const filas = document.querySelectorAll("#comprasItemsBody .renglon-compra[data-id]");  // todos los renglones

  filas.forEach((tr) => {
    const cantidad = Number(tr.querySelector(".compra-cantidad").value);  // el input de cantidad (por su class)
    if (!cantidad) return;                                      // vacío o 0 → lo salteo

    items.push({                                              // agregarlo a la lista (método de array)
      id_insumo: Number(tr.dataset.id),                     // el id guardado en el renglón
      cantidad: cantidad,
      unidad: tr.querySelector(".compra-unidad").value,                 // el select de unidad (por su class)
      fecha_vencimiento: tr.querySelector(".compra-vence").value || null, // la fecha, o null si está vacía
    });
  });

  return items;
}

// Arma la compra, la manda al server y cierra el modal si salió bien
async function guardarCompra() {                    // ← NUEVO: async
  compraError.textContent = "";                     // ← NUEVO: borro errores viejos

  const items = juntarItemsCompra();                // ← NUEVO: junto antes, para revisar
  if (items.length === 0) {                         // ¿no cargó ninguna cantidad?
    compraError.textContent = "Cargá al menos un insumo";
    return;                                         // corto acá, no mando nada
  }

  btnGuardarCompra.disabled = true;                 // apago el botón: que no la guarde dos veces

  try {
    const res = await apiFetch("/api/compras", {    // ← ruta corregida
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items,
        fecha: compraFecha.value,
        proveedor: compraProveedor.value || null,   // si está vacío, enviar null
      }),
    });

    // La respuesta del server. Si no es JSON (ej: un error 500 en HTML), queda un objeto vacío
    const datos = await res.json().catch(() => ({}));

    if (!res.ok) {                                  // ¿salió mal? (ej: kg en la leche)
      compraError.textContent = datos.error || "No se pudo guardar la compra"; // el error del server, o uno genérico
      return;                                       // el modal queda abierto para corregir
    }

    modalCompra.hidden = true;                      // salió bien: cierro el modal
    listaInsumos = await traerInsumos();            // traigo los insumos de nuevo (stock nuevo)
    await cargarCompras(true);                      // (05/11) recargo la tabla (en la misma página) y las compras hechas: aparece la compra nueva (compras.js)
  } catch (error) {
    compraError.textContent = "No se pudo conectar con el servidor";
  } finally {
    btnGuardarCompra.disabled = false;              // prendo el botón de nuevo, pase lo que pase
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// contarCargadosCompra → cuenta los renglones con cantidad, los marca y avisa si hay una cantidad negativa
// ENTRADA: nada (lee las cantidades de todos los renglones)
// SALIDA:  nada. Escribe el contador, pone verdes el circulito y los renglones con cantidad, y si hay una cantidad
//          negativa muestra el aviso en su renglón y apaga "Guardar compra" (como Registrar salida)
// Ej: Harina 2, Ajo vacío, Leche 0 → "1 insumo cargado", el circulito verde y Harina en verde clarito
//     Harina 2, Ajo 3            → "2 insumos cargados"
//     Ajo −2                     → "0 insumos cargados"; abajo de Ajo, en rojo, "Tiene que ser mayor a 0", y "Guardar compra" apagado
// Cuenta también los renglones que esconde un filtro: "Guardar compra" también los manda.
// El servidor lo vuelve a revisar: esto es para avisar antes. La llaman escribir una cantidad y abrir la ventana.
// ─────────────────────────────────────────────────────────────────────────────
function contarCargadosCompra() {
  let cargados = 0;
  let hayNegativa = false;

  compraRenglones.querySelectorAll(".renglon-compra").forEach((renglon) => {
    const cantidad = Number(renglon.querySelector(".compra-cantidad").value);   // vacío → 0
    const aviso = renglon.querySelector(".aviso-renglon-compra");

    // ¿tiene cantidad? SÍ: 2 o 0.5 · NO: vacío, 0 o −2
    if (cantidad > 0) {
      cargados = cargados + 1;
      renglon.classList.add("renglon-compra--cargada");
    } else {
      renglon.classList.remove("renglon-compra--cargada");
    }

    // ¿es negativa? SÍ: −2 · NO: 2, 0 o vacío
    if (cantidad < 0) {
      aviso.hidden = false;
      renglon.classList.add("renglon-compra--negativa");
      hayNegativa = true;
    } else {
      aviso.hidden = true;
      renglon.classList.remove("renglon-compra--negativa");
    }
  });

  let texto = "insumos cargados";
  // ¿es uno solo? SÍ: 1 → "1 insumo cargado" · NO: 0 → "0 insumos cargados", 3 → "3 insumos cargados"
  if (cargados === 1) {
    texto = "insumo cargado";
  }
  numeroCargados.textContent = cargados;
  textoCargados.textContent = texto;

  // ¿hay al menos uno? SÍ: el circulito verde · NO: gris
  if (cargados > 0) {
    numeroCargados.classList.add("numero-cargados--con-insumos");
  } else {
    numeroCargados.classList.remove("numero-cargados--con-insumos");
  }

  btnGuardarCompra.disabled = hayNegativa;          // con una cantidad negativa, apagado; si no, prendido
}
