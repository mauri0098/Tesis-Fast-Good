// ============================================================================
// movimientosStockNuevo.js — Pantalla Movimientos de Stock (pages/MovimientosStockNuevo.html)
//
// Funciones del MODAL DE COMPRA ("+ Registrar compra"; no cambiaron):
//   traerInsumos           → pide los insumos (GET /api/insumos)
//   opcionesUnidad         → las <option> de unidad según la unidad del insumo (kg / g, lts / ml, u)
//   mostrarCantidad        → una cantidad en la unidad grande: 16600 ml → "16,6 lts"
//   estaBajo               → ¿el insumo tiene menos stock que el mínimo?
//   calcularVencimiento    → fecha de compra + días de duración
//   renderizarInsumosModal → un renglón por insumo en la tabla del modal
//   recalcularVencimientos → recalcula los vencimientos al cambiar la fecha de compra
//   filtrarRenglonesCompra → muestra u oculta renglones por categoría y "Solo los bajos"
//   llenarCategorias       → llena el select de categorías
//   juntarItemsCompra      → los renglones con cantidad escrita
//   guardarCompra          → manda la compra (POST /api/compras)
//
// Funciones de la TABLA DE MOVIMIENTOS (paso H8, parada 3C: insumos y viandas, todo junto):
//   traerMovimientos      → pide TODOS los movimientos entre las fechas (GET /api/movimientos)
//   filtrarMovimientos    → Todo / Insumos / Viandas, Entradas / Salidas y el buscador; después dibuja
//   renderizarMovimientos → la tabla, de a 15 por página
//   crearRenglon          → la fila de un movimiento y su Detalle (Ver / Ocultar)
//   htmlDetalle           → lo de adentro del Detalle, según el origen (compra, producción, venta…)
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion) y fechas.js.
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

// ---------- MODAL DE COMPRA ----------

// 1. Buscar los elementos del HTML por su id y guardarlos en constantes
const modalCompra = document.getElementById("modalCompra");               // el modal entero
const btnRegistrarCompra = document.getElementById("btnRegistrarCompra"); // botón "+ Registrar compra"
const btnCancelarCompra = document.getElementById("btnCancelarCompra");   // botón "Cancelar"
const compraFecha = document.getElementById("compraFecha");               // fecha de la compra
const compraCategoria = document.getElementById("compraCategoria");       // select de categoría
const compraSoloBajos = document.getElementById("compraSoloBajos");       // checkbox "Solo los bajos"
const btnGuardarCompra = document.getElementById("btnGuardarCompra");         // botón "Guardar compra"
const compraProveedor = document.getElementById("compraProveedor");                     // input de proveedor (texto)
const compraError = document.getElementById("compraError");                           // div de error


btnGuardarCompra.addEventListener("click", guardarCompra);  // cuando tocan "Guardar compra", llamar a la función que guarda

// 2. Cuando tocan "+ Registrar compra"...
btnRegistrarCompra.addEventListener("click", () => {
  compraFecha.value = fechaLocalISO(new Date()); // la fecha arranca en hoy (fechaLocalISO está en fechas.js)
  modalCompra.hidden = false;                    // ...le saco el "oculto" → el modal aparece
  renderizarInsumosModal(listaInsumos);          // ...dibujo los renglones de cero
  filtrarRenglonesCompra();                      // ...y aplico los filtros que estén elegidos
});

// Si cambian la fecha de compra, se recalculan los vencimientos de todos los renglones
compraFecha.addEventListener("change", recalcularVencimientos);

// Si cambian la categoría o "Solo los bajos", se filtran los renglones
compraCategoria.addEventListener("change", filtrarRenglonesCompra);
compraSoloBajos.addEventListener("change", filtrarRenglonesCompra);

// 3. Cuando tocan "Cancelar"...
btnCancelarCompra.addEventListener("click", () => {
  modalCompra.hidden = true;    // ...le pongo el "oculto" → el modal desaparece
});

// Lista de insumos: se pide a la base una sola vez y se usa para dibujar los renglones del modal
let listaInsumos = [];

// Trae los insumos de la base
async function traerInsumos() {
  try {
    const res = await apiFetch("/api/insumos");
    if (!res.ok) throw new Error("El servidor respondió " + res.status);
    const insumos = await res.json();
    console.log("Insumos traídos:", insumos);
    return insumos;
  } catch (error) {
    console.error("Error al traer los insumos:", error);
    return [];
  }
}

// Unidades que se pueden elegir según la unidad del insumo
// (el servidor las convierte con convertirACantidadBase).
// La PRIMERA de cada lista es la que arranca elegida: kg y lts son más cómodas para cargar.
const UNIDADES_COMPATIBLES = {
  g:  ["kg", "g"],
  ml: ["lts", "ml"],
  u:  ["u"],
};

// Arma las <option> del select de unidad. Por defecto queda elegida la primera de la lista
function opcionesUnidad(unidadInsumo) {
  const unidades = UNIDADES_COMPATIBLES[unidadInsumo] || [unidadInsumo]; // si no la conozco, solo la suya

  return unidades
    .map((unidad, posicion) => {
      const elegida = posicion === 0 ? "selected" : "";
      return `<option value="${escHtml(unidad)}" ${elegida}>${escHtml(unidad)}</option>`;
    })
    .join("");
}

// Muestra una cantidad de la base en la unidad grande:
// g → kg y ml → lts (divide por 1000) desde 1000 para arriba; u queda igual.
// Menos de 1000 queda en g / ml (10 g → "10 g", no "0,01 kg").
// Formato argentino: coma decimal y hasta 2 decimales (16600 ml → "16,6 lts").
function mostrarCantidad(cantidad, unidad) {
  let numero = Number(cantidad);
  let unidadMostrada = unidad;

  if (unidad === "g" && numero >= 1000) {
    numero = numero / 1000;
    unidadMostrada = "kg";
  } else if (unidad === "ml" && numero >= 1000) {
    numero = numero / 1000;
    unidadMostrada = "lts";
  }

  // toLocaleString con 'es-AR' pone la coma y saca los ceros de más
  const texto = numero.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return `${texto} ${unidadMostrada}`;
}

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

// Dibuja un renglón por insumo en la tabla del modal
function renderizarInsumosModal(insumos) {
  const tbody = document.getElementById("comprasItemsBody"); // buscar el tbody
  tbody.innerHTML = "";                                       // vaciarlo

  // Los bajos primero. Se ordena una copia para no desordenar listaInsumos
  const ordenados = [...insumos].sort((a, b) => estaBajo(b) - estaBajo(a));

  ordenados.forEach((insumo) => {              // recorrer: "insumo" es uno solo en cada vuelta
    const tr = document.createElement("tr");   // crear un renglón nuevo
    tr.dataset.id = insumo.id;                 // data-id: de qué insumo es este renglón

    // data-categoria: de qué categoría es este renglón (lo usa el filtro)
    if (insumo.categorias_insumos) {
      tr.dataset.categoria = insumo.categorias_insumos.nombre;
    } else {
      tr.dataset.categoria = "Sin categoría";
    }

    // Si está bajo, fondo rojo suave (clase del CSS)
    if (estaBajo(insumo)) tr.classList.add("fila-baja");

    // Vencimiento ya calculado con la fecha de compra de arriba (se puede cambiar a mano)
    const vence = calcularVencimiento(compraFecha.value, insumo.dias_duracion);

    // Stock y mínimo en kg / lts. Los textos que vienen de la base
    // pasan por escHtml (escape.js) antes del innerHTML
    const stock  = escHtml(mostrarCantidad(insumo.stock_actual, insumo.unidad_medida));
    const minimo = escHtml(mostrarCantidad(insumo.stock_minimo, insumo.unidad_medida));

    // Las 6 celdas del renglón. ${ } mete el dato del insumo en el texto
    tr.innerHTML = `
      <td>${escHtml(insumo.nombre)}</td>
      <td>${stock}</td>
      <td>${minimo}</td>
      <td><input type="number" min="0" step="any" class="compra-cantidad"></td>
      <td>
        <select class="compra-unidad">
          ${opcionesUnidad(insumo.unidad_medida)}
        </select>
      </td>
      <td><input type="date" class="compra-vence" value="${vence}"></td>
    `;

    tbody.appendChild(tr);   // pegar el renglón en la tabla
  });
}

// Recalcula la columna Vence de todos los renglones con la fecha de compra nueva
function recalcularVencimientos() {
  const filas = document.querySelectorAll("#comprasItemsBody tr[data-id]");

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

  const filas = document.querySelectorAll("#comprasItemsBody tr[data-id]"); // todos los renglones

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
  const filas = document.querySelectorAll("#comprasItemsBody tr[data-id]");  // todos los renglones

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
    listaMovimientos = await traerMovimientos();    // traigo los movimientos de nuevo (aparece la compra nueva)
    filtrarMovimientos();                           // y redibujo la tabla respetando los filtros elegidos
  } catch (error) {
    compraError.textContent = "No se pudo conectar con el servidor";
  } finally {
    btnGuardarCompra.disabled = false;              // prendo el botón de nuevo, pase lo que pase
  }
}


// ---------- TABLA DE MOVIMIENTOS (paso H8, parada 3C: insumos y viandas, todo junto) ----------

// Filtros de arriba de la tabla
const filtroInsumo = document.getElementById("filtroInsumo"); // buscador de insumo o plato
const filtroQue = document.getElementById("filtroQue");       // Todo / Insumos / Viandas
const filtroTipo = document.getElementById("filtroTipo");     // Entradas y salidas / Entradas / Salidas
const filtroDesde = document.getElementById("filtroDesde");   // fecha desde
const filtroHasta = document.getElementById("filtroHasta");   // fecha hasta

// El buscador y los dos select vuelven a dibujar la tabla sin pedir nada al servidor
filtroInsumo.addEventListener("input", filtrarMovimientos);
filtroQue.addEventListener("change", filtrarMovimientos);
filtroTipo.addEventListener("change", filtrarMovimientos);

// Las fechas sí piden de nuevo: el servidor trae solo lo de esos días
[filtroDesde, filtroHasta].forEach((campo) => {
  campo.addEventListener("change", async () => {
    listaMovimientos = await traerMovimientos();   // lo de las fechas nuevas
    filtrarMovimientos();                          // y se dibuja con los otros filtros
  });
});

// Lista de movimientos: se pide al servidor y los filtros trabajan sobre ella
let listaMovimientos = [];
let errorMovimientos = "";   // el problema de la última vez que se pidieron ("" = ninguno)

// Cómo se escribe cada origen en la columna "Origen"
const ORIGENES = {
  compra:     "Compra",
  produccion: "Producción",
  venta:      "Venta",
  devolucion: "Devolución",
  descarte:   "Descarte",
  cocina:     "Cocina de un pedido",
  ajuste:     "Ajuste",
};

// Los orígenes con un motivo fijo en la columna "Motivo" (los demás muestran el que se escribió)
const MOTIVO_FIJO = {
  produccion: "Producción de viandas",
};

// El título de cada parte del Detalle según el origen (si no está acá: "Platos" e "Insumos")
const TITULO_VIANDAS = {
  produccion: "Viandas que entraron a la heladera",
  venta:      "Platos que salieron de la heladera",
  devolucion: "Platos que volvieron a la heladera",
  descarte:   "Platos descartados",
};
const TITULO_INSUMOS = {
  compra:     "Insumos comprados",
  produccion: "Insumos que se usaron",
  cocina:     "Insumos que gastaron los personalizados",
};


// ─────────────────────────────────────────────────────────────────────────────
// traerMovimientos → pide al servidor TODOS los movimientos entre las fechas de arriba
// ENTRADA: nada (lee "Desde" y "Hasta"; vacías = sin límite)
// SALIDA:  la lista de movimientos, cada uno con sus "partes" para los filtros ([] si falló:
//          el problema queda en errorMovimientos y la tabla lo muestra)
// Ej: Desde 16/09 y Hasta 16/10 → GET /api/movimientos?desde=2026-09-16&hasta=2026-10-16 →
//     [{ origen: 'produccion', tipo: 'entrada', numero: 9, viandas: [fideos 2], insumos: [harina, huevo], … }, …]
//     y ese "Hecho" queda con partes: [{ que: 'viandas', tipo: 'entrada' }, { que: 'insumos', tipo: 'salida' }]
// La usan la carga de la página, el cambio de fechas y guardarCompra (para que aparezca la compra nueva).
// ─────────────────────────────────────────────────────────────────────────────
async function traerMovimientos() {
  // 1. Mientras se pide, la tabla dice "Cargando..."
  document.getElementById("movimientosBody").innerHTML = '<tr class="empty-row"><td colspan="9">Cargando...</td></tr>';
  errorMovimientos = "";                                         // todavía no hay problema

  // 2. Las fechas van en la dirección. Ej: "desde=2026-09-16&hasta=2026-10-16"
  const parametros = new URLSearchParams();                      // URLSearchParams arma los datos de la dirección
  if (filtroDesde.value) parametros.set("desde", filtroDesde.value);
  if (filtroHasta.value) parametros.set("hasta", filtroHasta.value);

  try {
    const res = await apiFetch("/api/movimientos?" + parametros.toString());
    const movimientos = await res.json().catch(() => ({}));      // si no es JSON, un objeto vacío
    // 400 = fechas mal o demasiados movimientos: el servidor manda un mensaje para mostrar
    if (!res.ok) {
      errorMovimientos = movimientos.error || "No se pudieron cargar los movimientos";
      return [];
    }

    // 3. Las partes de cada movimiento, para los filtros: { que, tipo, nombres }.
    //    En una producción las viandas ENTRAN a la heladera y los insumos SALEN (se usaron);
    //    en todo lo demás, las dos partes van para el mismo lado que el movimiento.
    //    nombres = los platos (o los insumos) en minúsculas, separados por un salto de línea (para el buscador).
    //    map arma una lista con el nombre de cada uno y join los une. Ej: [{ plato: 'Fideos' }, { plato: 'Tarta' }] → 'fideos\ntarta'
    movimientos.forEach((mov) => {
      const tipoInsumos = mov.origen === "produccion" ? "salida" : mov.tipo;
      const platos = mov.viandas.map((vianda) => vianda.plato).join("\n").toLowerCase();
      const insumos = mov.insumos.map((insumo) => insumo.nombre).join("\n").toLowerCase();
      mov.partes = [];
      if (mov.viandas.length > 0) mov.partes.push({ que: "viandas", tipo: mov.tipo, nombres: platos });
      if (mov.insumos.length > 0) mov.partes.push({ que: "insumos", tipo: tipoInsumos, nombres: insumos });
    });
    return movimientos;
  } catch (error) {
    console.error("Error al traer los movimientos:", error);     // el detalle, a la consola
    errorMovimientos = "No se pudo conectar con el servidor";    // y un mensaje simple en la tabla
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// filtrarMovimientos → aplica los filtros de arriba a listaMovimientos y dibuja la tabla
// ENTRADA: nada (lee el buscador, "Todo / Insumos / Viandas" y "Entradas / Salidas")
// SALIDA:  nada (dibuja los que pasan). Un movimiento se ve si ALGUNA de sus partes coincide con las tres cosas.
// Ej: el "Hecho" de 2 fideos (viandas que entran, insumos que salen) aparece con "Viandas + Entradas"
//     y con "Insumos + Salidas", pero no con "Insumos + Entradas". Buscar "harina" lo muestra por su insumo.
// ─────────────────────────────────────────────────────────────────────────────
function filtrarMovimientos() {
  const texto = filtroInsumo.value.trim().toLowerCase();   // lo escrito, sin espacios en los bordes y en minúsculas
  const que = filtroQue.value || "todo";                   // "todo", "insumos" o "viandas" (sin elegir: todo)
  const tipo = filtroTipo.value;                           // "" (las dos), "entrada" o "salida"

  // filter arma una lista nueva con los que cumplen; some responde true si AL MENOS UNA parte cumple.
  // Ej: partes [viandas entrada, insumos salida] con "Insumos" + "Salidas" → la segunda cumple → true
  const visibles = listaMovimientos.filter((mov) => {
    return mov.partes.some((parte) => {
      const coincideQue = que === "todo" || parte.que === que;          // la parte es de lo elegido
      const coincideTipo = tipo === "" || parte.tipo === tipo;          // y va para el lado elegido
      const coincideTexto = texto === "" || parte.nombres.includes(texto);  // y tiene lo buscado
      return coincideQue && coincideTipo && coincideTexto;
    });
  });

  renderizarMovimientos(visibles);
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarMovimientos → dibuja la tabla, de a 15 movimientos por página (paginacion.js)
// ENTRADA: movimientos (los que pasaron los filtros, del más nuevo al más viejo)
// SALIDA:  nada (la tabla y los números de página; arranca siempre en la página 1)
// Ej: 40 movimientos → 3 páginas (15 + 15 + 10). Sin ninguno: "No hay movimientos", o el problema en rojo.
// ─────────────────────────────────────────────────────────────────────────────
function renderizarMovimientos(movimientos) {
  // Sin movimientos: el problema de la última carga (en rojo) o "No hay movimientos"
  const filaVacia = errorMovimientos
    ? '<tr class="empty-row"><td colspan="9" style="color:red;">' + escHtml(errorMovimientos) + "</td></tr>"
    : '<tr class="empty-row"><td colspan="9">No hay movimientos</td></tr>';

  crearPaginacion({
    datos: movimientos,
    porPagina: 15,                                                     // igual que las otras pantallas
    contenedorTabla: document.getElementById("movimientosBody"),       // el tbody
    contenedorPaginacion: document.getElementById("paginacion"),       // los botones de página
    funcionRenderFila: crearRenglon,                                   // arma cada movimiento (abajo)
    filaVacia: filaVacia,
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// crearRenglon → arma un movimiento para la tabla: su renglón y, debajo, su Detalle (arranca cerrado)
// ENTRADA: mov (uno de listaMovimientos)
// SALIDA:  un DocumentFragment con los dos renglones (crearPaginacion lo pega en la tabla).
//          Un DocumentFragment es como un tbody vacío en memoria: así el movimiento entra entero en su página.
// Columnas: Fecha y hora · Origen · Referencia · Tipo · Resumen · Usuario · Proveedor · Motivo · Detalle
// Ej: el "Hecho" de 2 fideos → "15/10/2026 14:32 · Producción · Cocina #009 · ▲ Entrada ·
//     2 viandas · 2 insumos · Ana López · — · Producción de viandas · [Ver]"
// ─────────────────────────────────────────────────────────────────────────────
function crearRenglon(mov) {
  // 1. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
  const fecha = mov.fecha ? fechaHoraDDMMAAAA(fechaDeTimestamp(mov.fecha)) : "-";   // de la base (UTC) a la hora de la computadora
  const origen = ORIGENES[mov.origen] || "Ajuste";                 // ej: "Producción"
  const numeroPedido = "#" + String(mov.numero).padStart(3, "0");  // ej: "#005" (solo lo usan los pedidos)

  // La referencia, según sea el origen (descarte y ajuste no tienen)
  let referencia = "—";
  switch (mov.origen) {
    case "compra":                                                 // según sea una compra: su número
      referencia = "Compra #" + mov.numero;
      break;
    case "produccion":                                             // según sea un "Hecho": su pedido a cocina
      referencia = mov.numero ? "Cocina #" + String(mov.numero).padStart(3, "0") : "Tanda vieja";  // ej: "Cocina #009" (29/10); las tandas de antes no tienen
      break;
    case "venta":                                                  // según sea una venta: el pedido
      referencia = "Pedido " + numeroPedido;
      break;
    case "devolucion":                                             // según sea una anulación: el pedido anulado
      referencia = "Pedido " + numeroPedido + " anulado";
      break;
    case "cocina":                                                 // según sea lo que gastó la cocina: el pedido
      referencia = "Pedido " + numeroPedido;
      break;
  }

  // El tipo: pastilla verde ▲ o roja ▼, y el borde del renglón del mismo color
  const esEntrada = mov.tipo === "entrada";
  const textoTipo = esEntrada ? "▲ Entrada" : "▼ Salida";
  const claseTipo = esEntrada ? "badge-entrada" : "badge-salida";

  // El resumen: cuántas viandas y cuántos insumos. Ej: "2 viandas · 2 insumos"
  let totalViandas = 0;                                            // las viandas, sumadas
  mov.viandas.forEach((vianda) => {
    totalViandas = totalViandas + vianda.cantidad;
  });
  const textoViandas = totalViandas === 1 ? "1 vianda" : totalViandas + " viandas";
  const textoInsumos = mov.insumos.length === 1 ? "1 insumo" : mov.insumos.length + " insumos";
  const partesResumen = [];
  if (mov.viandas.length > 0) partesResumen.push(textoViandas);
  if (mov.insumos.length > 0) partesResumen.push(textoInsumos);
  const resumen = partesResumen.join(" · ");                       // join las une con " · "

  const proveedor = mov.proveedor || "—";                          // solo las compras tienen
  const motivo = MOTIVO_FIJO[mov.origen] || motivoParaMostrar(mov.motivo) || "—";  // el fijo, el escrito o "—" (29/10: con el número como en todas las pantallas: "Pedido #068")

  // 2. El renglón (lo que viene de la base pasa por escHtml). 25/10: el Motivo, en un <span class="dos-renglones">
  //    (global.css): si es largo, corta en 2 renglones con "…" y entero aparece al pasar el mouse
  const tr = document.createElement("tr");
  tr.className = esEntrada ? "fila-entrada" : "fila-salida";
  tr.innerHTML = `
    <td>${escHtml(fecha)}</td>
    <td>${escHtml(origen)}</td>
    <td><span class="flecha-grupo">▸</span> <strong>${escHtml(referencia)}</strong></td>
    <td><span class="badge ${claseTipo}">${textoTipo}</span></td>
    <td>${escHtml(resumen)}</td>
    <td>${escHtml(mov.usuario)}</td>
    <td>${escHtml(proveedor)}</td>
    <td title="${escHtml(motivo)}"><span class="dos-renglones">${escHtml(motivo)}</span></td>
    <td><button type="button" class="btn-detalles">Ver</button></td>
  `;

  // 3. El Detalle, en el renglón de abajo, a todo el ancho (arranca cerrado)
  const trDetalle = document.createElement("tr");
  trDetalle.className = "fila-detalle-grupo";
  trDetalle.hidden = true;
  trDetalle.innerHTML = '<td colspan="9">' + htmlDetalle(mov) + "</td>";

  // 4. "Ver" abre el Detalle y "Ocultar" lo cierra (la flechita gira)
  const boton = tr.querySelector(".btn-detalles");
  const flecha = tr.querySelector(".flecha-grupo");
  boton.addEventListener("click", () => {
    trDetalle.hidden = !trDetalle.hidden;          // si estaba cerrado se abre, y al revés
    const abierto = !trDetalle.hidden;
    boton.textContent = abierto ? "Ocultar" : "Ver";
    flecha.classList.toggle("abierta", abierto);   // toggle(clase, sí/no): la pone si está abierto, la saca si no
  });

  // 5. Los dos renglones juntos
  const fragmento = document.createDocumentFragment();
  fragmento.appendChild(tr);
  fragmento.appendChild(trDetalle);
  return fragmento;
}


// ─────────────────────────────────────────────────────────────────────────────
// htmlDetalle → lo de adentro del Detalle de un movimiento, según su origen
// ENTRADA: mov (uno de listaMovimientos)
// SALIDA:  el HTML de la tarjeta (todo lo de la base pasa por escHtml):
//          compra → insumos con cantidad y vencimiento · producción → quién pidió y quién marcó Hecho,
//          las viandas que entraron y los insumos que se usaron · venta → el cliente y los platos que salieron ·
//          devolución → los platos que volvieron · descarte y ajuste → el motivo y qué · cocina → los insumos
// Ej: el "Hecho" de 2 fideos → "Lo pidió: Mauri Rodriguez" / "Marcó Hecho: Ana López" /
//     "Viandas que entraron a la heladera: fideos · 2 viandas" / "Insumos que se usaron: Harina integral · 600 g, Huevo · 4 u"
// ─────────────────────────────────────────────────────────────────────────────
function htmlDetalle(mov) {
  // 1. Las personas y el porqué, según sea el origen
  let datos = "";
  switch (mov.origen) {
    case "produccion":                                             // según sea un "Hecho": quién lo pidió y quién lo marcó
      datos = '<p class="detalle-linea"><strong>Lo pidió:</strong> ' + escHtml(mov.pidio || "—") + "</p>" +
              '<p class="detalle-linea"><strong>Marcó Hecho:</strong> ' + escHtml(mov.usuario) + "</p>";
      break;
    case "venta":                                                  // según sea una venta: el cliente
      datos = '<p class="detalle-linea"><strong>Cliente:</strong> ' + escHtml(mov.cliente || "—") + "</p>";
      break;
    case "descarte":                                               // según sea un descarte: por qué
      datos = '<p class="detalle-linea"><strong>Motivo:</strong> ' + escHtml(motivoParaMostrar(mov.motivo) || "—") + "</p>";
      break;
    case "ajuste":                                                 // según sea un ajuste: por qué
      datos = '<p class="detalle-linea"><strong>Motivo:</strong> ' + escHtml(motivoParaMostrar(mov.motivo) || "—") + "</p>";
      break;
  }

  // 2. Los platos: "fideos · 2 viandas"
  //    map arma una lista nueva con un <li> por plato y join la une. Ej: [{ plato: 'fideos', cantidad: 2 }] → '<li>…fideos…2 viandas…</li>'
  const lineasViandas = mov.viandas.map((vianda) => {
    const cantidad = vianda.cantidad === 1 ? "1 vianda" : vianda.cantidad + " viandas";
    return "<li><span>" + escHtml(vianda.plato) + '</span><span class="cantidad-insumo">' + escHtml(cantidad) + "</span></li>";
  }).join("");

  // 3. Los insumos: "Harina integral · 600 g" (las compras, también "Vence: 31/12/2026")
  const conVencimiento = mov.origen === "compra";
  const lineasInsumos = mov.insumos.map((insumo) => {
    const cantidad = mostrarCantidad(insumo.cantidad, insumo.unidad);                          // ej: 16600 ml → "16,6 lts"
    const vence = insumo.vence ? fechaDDMMAAAA(parseFechaLocal(insumo.vence)) : "-";           // 'AAAA-MM-DD' → "31/12/2026"
    const textoVence = conVencimiento ? '<span class="vence-insumo">Vence: ' + escHtml(vence) + "</span>" : "";
    return "<li><span>" + escHtml(insumo.nombre) + '</span><span class="cantidad-insumo">' + escHtml(cantidad) + "</span>" + textoVence + "</li>";
  }).join("");

  // 4. Cada parte con su título (solo las que tiene)
  const tituloViandas = TITULO_VIANDAS[mov.origen] || "Platos";
  const tituloInsumos = TITULO_INSUMOS[mov.origen] || "Insumos";
  const parteViandas = lineasViandas ? '<p class="detalle-titulo">' + tituloViandas + '</p><ul class="lista-compra">' + lineasViandas + "</ul>" : "";
  const parteInsumos = lineasInsumos ? '<p class="detalle-titulo">' + tituloInsumos + '</p><ul class="lista-compra">' + lineasInsumos + "</ul>" : "";

  return '<div class="tarjeta-compra">' + datos + parteViandas + parteInsumos + "</div>";
}


// Al cargar la página: las fechas en los últimos 30 días, los insumos (para el modal de compra)
// y los movimientos
document.addEventListener("DOMContentLoaded", async () => {
  const hoy = new Date();                                                              // hoy, en la computadora
  const hace30Dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30); // hace 30 días
  filtroDesde.value = fechaLocalISO(hace30Dias);                                       // 'AAAA-MM-DD' (fechas.js)
  filtroHasta.value = fechaLocalISO(hoy);

  listaInsumos = await traerInsumos();
  llenarCategorias(listaInsumos);
  listaMovimientos = await traerMovimientos();
  filtrarMovimientos();

  // (27/10) Si se llegó desde "Ir a Compras" (Producción → Pedir a cocina, cuando faltan insumos): la dirección
  // termina en ?compra=1 y se abre sola la ventana "Registrar compra" (como si se tocara "+ Registrar compra")
  const vieneDeCompras = new URLSearchParams(window.location.search).get('compra') === '1';
  if (vieneDeCompras) btnRegistrarCompra.click();
});
