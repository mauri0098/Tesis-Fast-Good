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


// ---------- TABLA DE MOVIMIENTOS ----------

// Filtros de arriba de la tabla
const filtroInsumo = document.getElementById("filtroInsumo"); // buscador de insumo
const filtroTipo = document.getElementById("filtroTipo");     // select de tipo
const filtroDesde = document.getElementById("filtroDesde");   // fecha desde
const filtroHasta = document.getElementById("filtroHasta");   // fecha hasta

// Cuando cambia cualquier filtro, se vuelve a dibujar la tabla (sin pedir nada a la base)
filtroInsumo.addEventListener("input", filtrarMovimientos);
filtroTipo.addEventListener("change", filtrarMovimientos);
filtroDesde.addEventListener("change", filtrarMovimientos);
filtroHasta.addEventListener("change", filtrarMovimientos);

// Lista de movimientos: se pide a la base y los filtros trabajan sobre ella
let listaMovimientos = [];

// Trae los movimientos de la base (vienen del más nuevo al más viejo)
async function traerMovimientos() {
  try {
    const res = await apiFetch("/api/movimientos-stock");
    if (!res.ok) throw new Error("El servidor respondió " + res.status);
    const movimientos = await res.json();
    console.log("Movimientos traídos:", movimientos);
    return movimientos;
  } catch (error) {
    console.error("Error al traer los movimientos:", error);
    return [];
  }
}

// Dibuja los movimientos en la tabla principal, de a 15 por página (paginacion.js).
// Se pagina DESPUÉS de filtrar y de agrupar: una compra cuenta como un solo renglón.
// crearPaginacion arranca siempre en la página 1
function renderizarMovimientos(movimientos) {
  // Los movimientos de una misma compra vienen juntos en un solo objeto (esCompra)
  // Primero se ordenan (más nuevo arriba), después se agrupan
  const renglones = agruparCompras(ordenarMovimientos(movimientos));

  crearPaginacion({
    datos: renglones,
    porPagina: 15,                                                     // igual que las otras pantallas
    contenedorTabla: document.getElementById("movimientosBody"),       // el tbody
    contenedorPaginacion: document.getElementById("paginacion"),       // los botones de página
    funcionRenderFila: crearRenglon,                                   // arma cada renglón
    filaVacia: `<tr class="empty-row"><td colspan="8">No hay movimientos</td></tr>`, // sin movimientos
  });
}

// crearPaginacion necesita que le DEVUELVAN el renglón para pegarlo en la tabla.
// Un DocumentFragment es como un tbody vacío en memoria: se dibuja ahí adentro y se devuelve.
// Así una compra entra entera (su renglón + el detalle) y no se parte entre páginas
function crearRenglon(renglon) {
  const fragmento = document.createDocumentFragment();

  if (renglon.esCompra) {                  // ¿es una compra agrupada?
    dibujarCompra(renglon, fragmento);     // ...la dibuja su propia función
  } else {
    dibujarMovimiento(renglon, fragmento); // si no, un movimiento suelto
  }

  return fragmento;
}

// Dibuja un movimiento suelto (sin compra) en "destino" (el tbody o un fragmento)
function dibujarMovimiento(mov, destino) {
  const tr = document.createElement("tr");   // crear un renglón nuevo

  // Fecha de la base (en UTC) → "12/10/2026 12:00" en hora de Argentina (fechas.js)
  let fecha = "-";
  if (mov.fecha) fecha = fechaHoraDDMMAAAA(fechaDeTimestamp(mov.fecha));

  // Datos del insumo (puede faltar si el insumo se borró)
  let nombreInsumo = "-";
  let unidadInsumo = "";
  if (mov.insumos) {
    nombreInsumo = mov.insumos.nombre;
    unidadInsumo = mov.insumos.unidad_medida;
  }

  // Tipo: badge con flecha + clases del CSS (color del badge y borde del renglón)
  let tipo = "▼ SALIDA";
  let claseTipo = "badge-salida";
  tr.className = "fila-salida";
  if (mov.tipo === "entrada") {
    tipo = "▲ ENTRADA";
    claseTipo = "badge-entrada";
    tr.className = "fila-entrada";
  }

  // Cantidad en kg / lts. Si el movimiento no guardó unidad, uso la del insumo
  const cantidad = mostrarCantidad(mov.cantidad, mov.unidad || unidadInsumo);

  // Proveedor: solo lo tienen las compras
  let proveedor = "-";
  if (mov.compras && mov.compras.proveedor) proveedor = mov.compras.proveedor;

  // Las 8 celdas (la última vacía: el botón Detalles es solo de las compras).
  // Los textos que vienen de la base pasan por escHtml
  tr.innerHTML = `
    <td>${fecha}</td>
    <td>${escHtml(nombreInsumo)}</td>
    <td><span class="badge ${claseTipo}">${tipo}</span></td>
    <td>${escHtml(cantidad)}</td>
    <td>${escHtml(nombreUsuario(mov))}</td>
    <td>${escHtml(proveedor)}</td>
    <td>${escHtml(mov.motivo || "-")}</td>
    <td></td>
  `;

  destino.appendChild(tr);   // pegar el renglón
}

// "Nombre Apellido" de quien registró el movimiento, o "-" si no se guardó
function nombreUsuario(mov) {
  if (!mov.usuarios) return "-";
  return `${mov.usuarios.nombre || ""} ${mov.usuarios.apellido || ""}`.trim() || "-";
}

// Devuelve una COPIA ordenada: fecha más nueva primero y, si empatan
// (ej: compras del mismo día, todas a las 12:00), id más alto primero.
// Se ordena una copia para no desordenar listaMovimientos
function ordenarMovimientos(movimientos) {
  return [...movimientos].sort((a, b) => {
    let fechaA = 0;
    let fechaB = 0;
    if (a.fecha) fechaA = fechaDeTimestamp(a.fecha).getTime(); // fecha → milisegundos, para restar
    if (b.fecha) fechaB = fechaDeTimestamp(b.fecha).getTime();

    if (fechaA !== fechaB) return fechaB - fechaA; // distinta fecha: la más nueva primero
    return b.id - a.id;                            // misma fecha: el id más alto primero
  });
}

// Junta los movimientos con el mismo id_compra en UN objeto:
// { esCompra: true, id_compra, fecha, usuario, proveedor, items: [movimientos] }.
// La compra queda donde aparece su primer movimiento (así se respeta el orden por fecha).
// Los movimientos sin id_compra quedan como están.
function agruparCompras(movimientos) {
  const renglones = [];      // lo que se va a dibujar, en orden
  const comprasPorId = {};   // "diccionario" para encontrar cada compra rápido

  movimientos.forEach((mov) => {
    if (!mov.id_compra) {        // no es de una compra → va suelto
      renglones.push(mov);
      return;
    }

    let compra = comprasPorId[mov.id_compra];
    if (!compra) {               // primer movimiento de esta compra: armo el grupo
      let proveedor = "-";
      if (mov.compras && mov.compras.proveedor) proveedor = mov.compras.proveedor;

      compra = {
        esCompra: true,
        id_compra: mov.id_compra,
        fecha: mov.fecha,
        usuario: nombreUsuario(mov),
        proveedor: proveedor,
        items: [],
      };
      comprasPorId[mov.id_compra] = compra;
      renglones.push(compra);
    }

    compra.items.push(mov);      // el movimiento pasa a ser un insumo de la compra
  });

  return renglones;
}

// Dibuja una compra: el renglón con el resumen y, debajo, el detalle (arranca oculto).
// "tbody" es dónde se dibuja: la tabla o el fragmento de crearRenglon
function dibujarCompra(compra, tbody) {
  // 1. Renglón principal
  const tr = document.createElement("tr");
  tr.className = "fila-entrada";

  let fecha = "-";
  if (compra.fecha) fecha = fechaHoraDDMMAAAA(fechaDeTimestamp(compra.fecha));

  // "1 insumo" o "3 insumos"
  let cuantos = compra.items.length + " insumos";
  if (compra.items.length === 1) cuantos = "1 insumo";

  tr.innerHTML = `
    <td>${fecha}</td>
    <td><span class="flecha-grupo">▸</span> <strong>Compra #${escHtml(String(compra.id_compra))}</strong></td>
    <td><span class="badge badge-entrada">▲ ENTRADA</span></td>
    <td>${cuantos}</td>
    <td>${escHtml(compra.usuario)}</td>
    <td>${escHtml(compra.proveedor)}</td>
    <td>-</td>
    <td><button type="button" class="btn-detalles">Detalles</button></td>
  `;

  // 2. Renglón de detalle: una fila por insumo comprado
  const trDetalle = document.createElement("tr");
  trDetalle.className = "fila-detalle-grupo";
  trDetalle.hidden = true;   // arranca cerrado
  trDetalle.innerHTML = `
    <td colspan="8">
      <div class="tarjeta-compra">
        <ul class="lista-compra">${compra.items.map(htmlItemCompra).join("")}</ul>
      </div>
    </td>
  `;

  // 3. El botón abre y cierra el detalle
  const boton = tr.querySelector(".btn-detalles");
  const flecha = tr.querySelector(".flecha-grupo");
  boton.addEventListener("click", () => {
    trDetalle.hidden = !trDetalle.hidden;   // si estaba oculto se muestra, y al revés
    const abierto = !trDetalle.hidden;
    boton.textContent = abierto ? "Ocultar" : "Detalles";
    flecha.classList.toggle("abierta", abierto); // la flechita gira
  });

  tbody.appendChild(tr);
  tbody.appendChild(trDetalle);
}

// Un insumo del detalle de la compra: nombre · cantidad · vencimiento
function htmlItemCompra(mov) {
  let nombre = "-";
  let unidadInsumo = "";
  if (mov.insumos) {
    nombre = mov.insumos.nombre;
    unidadInsumo = mov.insumos.unidad_medida;
  }

  const cantidad = mostrarCantidad(mov.cantidad, mov.unidad || unidadInsumo);

  // Vencimiento 'AAAA-MM-DD' → "31/12/2026" (fechas.js), o "-" si no tiene
  let vence = "-";
  if (mov.fecha_vencimiento) vence = fechaDDMMAAAA(parseFechaLocal(mov.fecha_vencimiento));

  return `
    <li>
      <span>${escHtml(nombre)}</span>
      <span class="cantidad-insumo">${escHtml(cantidad)}</span>
      <span class="vence-insumo">Vence: ${vence}</span>
    </li>`;
}


// ---------- FILTROS ----------

// ¿El movimiento es del tipo elegido en el select? ("" = Todos)
function coincideTipo(mov, tipo) {
  if (tipo === "entrada") return mov.tipo === "entrada";
  if (tipo === "produccion") return mov.tipo === "salida" && Boolean(mov.id_movimiento_vianda);
  if (tipo === "salida-otra") return mov.tipo === "salida" && !mov.id_movimiento_vianda;
  return true;
}

// Fecha de la base → día 'AAAA-MM-DD' en hora de ARGENTINA, aunque la compu tenga otra zona.
// Así un movimiento de las 23:00 no cae en el día siguiente.
// "en-CA" es el formato de Canadá, que escribe justo 'AAAA-MM-DD'
function diaArgentina(texto) {
  return fechaDeTimestamp(texto).toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// ¿La fecha del movimiento está entre Desde y Hasta? (vacías = sin límite, los dos días incluidos)
// Se compara el día 'AAAA-MM-DD' como texto: '2026-10-05' < '2026-10-12'.
// Si Desde es mayor que Hasta, ninguno pasa → "No hay movimientos"
function coincideFecha(mov, desde, hasta) {
  if (!mov.fecha) return !desde && !hasta;
  const dia = diaArgentina(mov.fecha);
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  return true;
}

// ¿El nombre del insumo contiene lo que se escribió en el buscador?
function coincideInsumo(mov, texto) {
  if (!texto) return true;
  let nombre = "";
  if (mov.insumos) nombre = mov.insumos.nombre.toLowerCase();
  return nombre.includes(texto);
}

// Filtra listaMovimientos con los filtros de arriba y redibuja la tabla
function filtrarMovimientos() {
  const texto = filtroInsumo.value.trim().toLowerCase();
  const tipo = filtroTipo.value;
  const desde = filtroDesde.value;
  const hasta = filtroHasta.value;

  // Compras que tienen ALGÚN insumo que coincide con el buscador:
  // de esas se muestran todos sus insumos, así el detalle no queda incompleto
  const comprasQueCoinciden = new Set();
  listaMovimientos.forEach((mov) => {
    if (mov.id_compra && coincideInsumo(mov, texto)) comprasQueCoinciden.add(mov.id_compra);
  });

  const filtrados = listaMovimientos.filter((mov) => {
    const insumoOk = coincideInsumo(mov, texto) || comprasQueCoinciden.has(mov.id_compra);
    return insumoOk && coincideTipo(mov, tipo) && coincideFecha(mov, desde, hasta);
  });

  renderizarMovimientos(filtrados);
}


// Al cargar la página: traer los insumos, llenar el select de categorías y dibujar los movimientos
document.addEventListener("DOMContentLoaded", async () => {
  listaInsumos = await traerInsumos();
  llenarCategorias(listaInsumos);
  listaMovimientos = await traerMovimientos();
  filtrarMovimientos();
});


