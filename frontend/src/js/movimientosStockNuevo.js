// ============================================================================
// movimientosStockNuevo.js — Pantalla Movimientos de Stock (pages/MovimientosStockNuevo.html)
//
// (05/11) La ventana "Registrar compra" se mudó a la pantalla Compras (registrarCompra.js): el botón
// "+ Registrar compra" de acá es un link a compras.html?compra=1, que la abre sola.
//
// Funciones de la TABLA DE MOVIMIENTOS (paso H8, parada 3C: insumos y viandas, todo junto):
//   traerMovimientos      → pide TODOS los movimientos entre las fechas (GET /api/movimientos)
//   filtrarMovimientos    → Todo / Insumos / Viandas / Mixtos, Entradas / Salidas y el buscador; después dibuja
//   renderizarMovimientos → la tabla, de a 15 por página
//   crearRenglon          → la fila de un movimiento, con su botón Detalle
//
// Funciones de la ventana REGISTRAR SALIDA:
//   renderizarInsumosSalida → un renglón por cada insumo activo con stock
//   revisarCantidadesSalida → cuenta los cargados, avisa si alguno pide más de lo que hay y apaga el botón
//   guardarSalida           → manda la salida (POST /api/salidas-stock) y recarga la lista
//
// En stockCompartido.js (lo comparte con la pantalla Compras): traerInsumos, opcionesUnidad, mostrarCantidad,
// abrirDetalleMovimiento, listaInsumos y las tablas ASPECTO_ORIGEN, ORIGENES y DETALLE_ORIGEN.
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml), paginacion.js (crearPaginacion), fechas.js y stockCompartido.js.
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

// ---------- TABLA DE MOVIMIENTOS (paso H8, parada 3C: insumos y viandas, todo junto) ----------

// Filtros de arriba de la tabla
const filtroInsumo = document.getElementById("filtroInsumo"); // buscador de insumo o plato
const filtroQue = document.getElementById("filtroQue");       // Todo / Insumos / Viandas / Mixtos
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


// El signo y el color de cada parte en la columna Resumen. Ej: lo que entra → "+5 viandas" en verde
const SIGNOS_RESUMEN = {
  entrada: { signo: "+", clase: "resumen-entra" },
  salida:  { signo: "−", clase: "resumen-sale" },
};


// Los orígenes con un motivo fijo en la columna "Motivo" (los demás muestran el que se escribió)
const MOTIVO_FIJO = {
  produccion: "Producción de viandas",
};


// ─────────────────────────────────────────────────────────────────────────────
// traerMovimientos → pide al servidor TODOS los movimientos entre las fechas de arriba
// ENTRADA: nada (lee "Desde" y "Hasta"; vacías = sin límite)
// SALIDA:  la lista de movimientos, cada uno con sus "partes" para los filtros ([] si falló:
//          el problema queda en errorMovimientos y la tabla lo muestra)
// Ej: Desde 16/09 y Hasta 16/10 → GET /api/movimientos?desde=2026-09-16&hasta=2026-10-16 →
//     [{ origen: 'produccion', tipo: 'entrada', numero: 9, viandas: [fideos 2], insumos: [harina, huevo], … }, …]
//     y ese "Hecho" queda con partes: [{ que: 'viandas', tipo: 'entrada' }, { que: 'insumos', tipo: 'salida' }]
// La usan la carga de la página, el cambio de fechas, volver a la pestaña y guardarSalida (para que aparezca la salida nueva).
// ─────────────────────────────────────────────────────────────────────────────
async function traerMovimientos() {
  // 1. Mientras se pide, la tabla dice "Cargando..."
  document.getElementById("movimientosBody").innerHTML = '<tr class="empty-row"><td colspan="6">Cargando...</td></tr>';
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
    //    (05/11) Ese lado de cada parte lo usa la columna Resumen ("+20 viandas · −2 insumos"); el filtro "Entradas / Salidas"
    //    mira el lado del movimiento entero (un Hecho es una entrada).
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
// ENTRADA: nada (lee el buscador, "Todo / Insumos / Viandas / Mixtos" y "Entradas / Salidas")
// SALIDA:  nada (dibuja los que pasan). Un movimiento se ve si ALGUNA de sus partes coincide con lo elegido en
//          "Todo / Insumos / Viandas" y con el buscador, y si el MOVIMIENTO va para el lado de "Entradas / Salidas".
//          Con "Mixtos", además, tiene que mover viandas E insumos juntos.
// Ej: (05/11) el "Hecho" de 2 fideos es una ENTRADA: aparece con "Entradas", "Viandas + Entradas", "Insumos + Entradas"
//     y "Mixtos", pero no con "Salidas" (antes aparecía por los insumos que gastó). Buscar "harina" lo muestra por su insumo.
//     Una venta (solo viandas) no aparece con "Mixtos".
// ─────────────────────────────────────────────────────────────────────────────
function filtrarMovimientos() {
  const texto = filtroInsumo.value.trim().toLowerCase();   // lo escrito, sin espacios en los bordes y en minúsculas
  const que = filtroQue.value || "todo";                   // "todo", "insumos", "viandas" o "mixtos" (sin elegir: todo)
  const tipo = filtroTipo.value;                           // "" (las dos), "entrada" o "salida"

  // filter arma una lista nueva con los que cumplen
  const visibles = listaMovimientos.filter((mov) => {
    const tieneLasDos = mov.viandas.length > 0 && mov.insumos.length > 0;   // mueve viandas E insumos
    const quedaAfuera = que === "mixtos" && !tieneLasDos;
    // ¿eligió Mixtos y este no mueve las dos cosas? SÍ: una venta · NO: un Hecho con receta
    if (quedaAfuera) {
      return false;
    }

    // Las partes de este movimiento que cumplen las tres cosas (con "Mixtos" vale cualquiera de las dos)
    const partesQueCumplen = mov.partes.filter((parte) => {
      const coincideQue = que === "todo" || que === "mixtos" || parte.que === que;  // la parte es de lo elegido
      const coincideTipo = tipo === "" || mov.tipo === tipo;            // y el movimiento va para el lado elegido (05/11: un Hecho, entrada)
      const coincideTexto = texto === "" || parte.nombres.includes(texto);  // y tiene lo buscado
      return coincideQue && coincideTipo && coincideTexto;
    });

    // ¿cumple al menos una parte? SÍ: un Hecho con "Insumos" + "Salidas" (cumplen sus insumos) · NO: una compra con "Viandas"
    return partesQueCumplen.length > 0;
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
  let filaVacia = '<tr class="empty-row"><td colspan="6">No hay movimientos</td></tr>';
  // ¿falló la última carga? SÍ: "No se pudo conectar con el servidor" · NO: no hay ningún problema
  if (errorMovimientos) {
    filaVacia = '<tr class="empty-row fila-error"><td colspan="6">' + escHtml(errorMovimientos) + "</td></tr>";
  }

  crearPaginacion({
    datos: movimientos,
    porPagina: 15,                                                     // igual que las otras pantallas
    contenedorTabla: document.getElementById("movimientosBody"),       // el tbody
    contenedorPaginacion: document.getElementById("paginacion"),       // los botones de página
    funcionRenderFila: crearRenglon,                                   // arma cada movimiento (abajo)
    filaVacia: filaVacia,
    contenedorResumen: document.getElementById("resumenMovimientos"),  // "Mostrando 15 de 48 movimientos registrados"
    nombreDatos: "movimientos registrados",
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// crearRenglon → arma el renglón de un movimiento para la tabla; su botón Detalle abre el modal
// ENTRADA: mov (uno de listaMovimientos)
// SALIDA:  el <tr> del movimiento (crearPaginacion lo pega en la tabla)
// Columnas: Fecha y hora · Tipo · Referencia · Resumen · Detalle (motivo, y abajo usuario · proveedor) · Acción
// Ej: el "Hecho" de 2 fideos → "15/10/2026 14:32 · (↙) Entrada · Pedido a Cocina #009 ·
//     +2 viandas · −2 insumos · Producción de viandas / Ana López · [Detalle ›]"
// ─────────────────────────────────────────────────────────────────────────────
function crearRenglon(mov) {
  // 1. Lo que va en cada celda, calculado antes (nada de "? :" adentro del HTML)
  const fecha = mov.fecha ? fechaHoraDDMMAAAA(fechaDeTimestamp(mov.fecha)) : "-";   // de la base (UTC) a la hora de la computadora
  const partesFecha = fecha.split(" ");                            // split corta en el espacio. Ej: "24/10/2026 16:57" → ["24/10/2026", "16:57"]
  const aspecto = ASPECTO_ORIGEN[mov.origen];                      // la línea, la pastilla y el recuadro de este origen

  // La referencia: lo que no tiene pedido ni compra va en un recuadro gris con su origen
  let claseRecuadro = "recuadro-neutro";
  let iconoRecuadro = ICONO_CAJA;
  let etiqueta = ORIGENES[mov.origen];                             // ej: "Descarte"
  let textoNumero = "";
  // ¿tiene pedido o compra? SÍ: la compra 11 · NO: un descarte
  if (mov.numero) {
    claseRecuadro = aspecto.recuadro;
    iconoRecuadro = aspecto.icono;
    etiqueta = aspecto.etiqueta;                                   // ej: "Pedido a Cocina"
    textoNumero = "#" + String(mov.numero).padStart(aspecto.ceros, "0") + aspecto.sufijo;  // ej: "#015" o "#088 anulado"
  }

  // El resumen: cuánto entró (+, verde) y cuánto salió (−, rojo). Ej: "+5 viandas · −3 insumos"
  // El nombre y la cantidad de cada insumo se ven solo en el Detalle (abrirDetalleMovimiento)
  let totalViandas = 0;                                            // las viandas, sumadas
  mov.viandas.forEach((vianda) => {
    totalViandas = totalViandas + vianda.cantidad;
  });
  let textoViandas = totalViandas + " viandas";
  // ¿es una sola? SÍ: 1 → "1 vianda" · NO: 5 → "5 viandas"
  if (totalViandas === 1) {
    textoViandas = "1 vianda";
  }

  let textoInsumos = mov.insumos.length + " insumos";
  // ¿es un solo insumo? SÍ: 1 → "1 insumo" · NO: 3 → "3 insumos"
  if (mov.insumos.length === 1) {
    textoInsumos = "1 insumo";
  }

  // Un texto por parte, con el signo y el color de su lado. En un Hecho las viandas entran y los insumos salen:
  // eso ya lo dice parte.tipo (traerMovimientos). El signo y la clase son fijos; lo demás, con escHtml.
  const textoDeParte = { viandas: textoViandas, insumos: textoInsumos };
  const htmlResumen = mov.partes.map((parte) => {
    const lado = SIGNOS_RESUMEN[parte.tipo];                       // ej: { signo: "−", clase: "resumen-sale" }
    return '<span class="' + lado.clase + '">' + lado.signo + escHtml(textoDeParte[parte.que]) + "</span>";
  }).join(" · ");                                                  // join las une con " · "

  let motivo = MOTIVO_FIJO[mov.origen] || motivoParaMostrar(mov.motivo) || "—";  // el fijo, el escrito o "—" (29/10: con el número como en todas las pantallas: "Pedido #068")
  // ¿es una compra? SÍ: "Compra de mercadería #11" · NO: un "Hecho" sigue con "Producción de viandas"
  if (mov.origen === "compra") {
    motivo = "Compra de mercadería #" + mov.numero;
  }

  // Quién y el proveedor (solo las compras tienen). filter se queda con los que tienen algo y join los une.
  // Ej: ["Ana López", "Avícola Sierras"] → "Ana López · Avícola Sierras" · ["Ana López", null] → "Ana López"
  const quienes = [mov.usuario, mov.proveedor].filter((dato) => dato).join(" · ");

  // 2. El renglón (lo que viene de la base pasa por escHtml). 25/10: el Motivo, en un <span class="dos-renglones">
  //    (global.css): si es largo, corta en 2 renglones con "…" y entero aparece al pasar el mouse
  const tr = document.createElement("tr");
  tr.className = aspecto.fila;
  tr.innerHTML = `
    <td><span class="fecha-dia">${escHtml(partesFecha[0])}</span><span class="fecha-hora">${escHtml(partesFecha[1])}</span></td>
    <td><span class="badge ${aspecto.pastilla}">${aspecto.textos[mov.tipo]}</span></td>
    <td><span class="recuadro-referencia ${claseRecuadro}">${iconoRecuadro}<span>${escHtml(etiqueta)}</span><span class="recuadro-numero">${escHtml(textoNumero)}</span></span></td>
    <td>${htmlResumen}</td>
    <td title="${escHtml(motivo)}"><span class="dos-renglones detalle-motivo">${escHtml(motivo)}</span><span class="dato-chico">${escHtml(quienes)}</span></td>
    <td><button type="button" class="btn-detalles"><span class="btn-detalles-texto">Detalle</span><span class="flecha-grupo">›</span></button></td>
  `;

  // 3. "Detalle" abre el modal con los datos de este movimiento
  tr.querySelector(".btn-detalles").addEventListener("click", () => {
    abrirDetalleMovimiento(mov, fecha);
  });

  return tr;
}


// ---------- VENTANA REGISTRAR SALIDA ----------

const modalSalida = document.getElementById("modalSalida");                 // la ventana entera
const salidaMotivo = document.getElementById("salidaMotivo");               // el desplegable del motivo
const salidaOtroCampo = document.getElementById("salidaOtroCampo");         // el campo "¿Cuál es el motivo?"
const salidaOtro = document.getElementById("salidaOtro");                   // el texto de "Otro"
const salidaBuscador = document.getElementById("salidaBuscador");           // el buscador de insumos
const salidaRenglones = document.getElementById("salidaRenglones");         // la lista de renglones
const salidaSinResultados = document.getElementById("salidaSinResultados"); // "Ningún insumo coincide…"
const salidaContador = document.getElementById("salidaContador");           // "N insumos cargados"
const salidaError = document.getElementById("salidaError");                 // el error de abajo
const btnGuardarSalida = document.getElementById("btnGuardarSalida");       // el botón "Registrar salida" de la ventana

// Cuánto vale cada unidad en la unidad chica de su familia (el servidor tiene la misma tabla). Ej: 1 kg = 1000 g
const FACTOR_UNIDAD_SALIDA = { g: 1, kg: 1000, ml: 1, lts: 1000, u: 1 };


// ─────────────────────────────────────────────────────────────────────────────
// renderizarInsumosSalida → dibuja un renglón por cada insumo activo con stock (los demás no pueden salir)
// ENTRADA: insumos (la lista de GET /api/insumos)
// SALIDA:  nada (llena la lista). La unidad arranca en la grande: kg si el insumo es en g, lts si es en ml y u si es en u
//          (opcionesUnidad deja elegida la primera de UNIDADES_COMPATIBLES)
// Ej: { nombre: 'Carne', stock_actual: 5000, unidad_medida: 'g' } → "Carne · 5 kg · [cantidad] · [kg ▾]"
// La llama el botón "Registrar salida". Lo que viene de la base pasa por escHtml.
// ─────────────────────────────────────────────────────────────────────────────
function renderizarInsumosSalida(insumos) {
  salidaRenglones.innerHTML = "";

  const conStock = insumos.filter((insumo) => {
    return insumo.activo === true && Number(insumo.stock_actual) > 0;
  });

  // ¿no hay ninguno para sacar? SÍ: todos en 0 · NO: hay carne con 5 kg
  if (conStock.length === 0) {
    salidaRenglones.innerHTML = '<p class="salida-vacio">No hay insumos con stock para sacar</p>';
    return;
  }

  conStock.forEach((insumo) => {
    const nombre = escHtml(insumo.nombre);
    let textoCategoria = "";
    // ¿tiene categoría? SÍ: Carnicería · NO: un insumo sin categoría
    if (insumo.categorias_insumos) {
      textoCategoria = '<span class="dato-chico">' + escHtml(insumo.categorias_insumos.nombre) + "</span>";
    }

    const renglon = document.createElement("div");
    renglon.className = "renglon-salida";
    renglon.setAttribute("role", "row");
    renglon.dataset.id = insumo.id;                                 // para mandarlo al servidor
    renglon.dataset.stock = insumo.stock_actual;                    // cuánto hay, en la unidad del insumo. Ej: 5000
    renglon.dataset.unidad = insumo.unidad_medida;                  // la unidad del insumo. Ej: g
    renglon.dataset.nombre = insumo.nombre.toLowerCase();           // para el buscador. Ej: carne picada
    renglon.innerHTML = `
      <span role="cell" class="renglon-salida-nombre">${nombre}${textoCategoria}</span>
      <span role="cell"><span class="badge badge-neutra">${escHtml(mostrarCantidad(insumo.stock_actual, insumo.unidad_medida))}</span></span>
      <span role="cell"><input type="number" min="0" step="any" class="salida-cantidad" aria-label="Cantidad de ${nombre}"></span>
      <span role="cell"><select class="salida-unidad" aria-label="Unidad de ${nombre}">${opcionesUnidad(insumo.unidad_medida)}</select></span>
      <span class="salida-aviso" hidden></span>
    `;
    salidaRenglones.appendChild(renglon);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// revisarCantidadesSalida → revisa lo cargado: cuenta los insumos, avisa si alguno pide más de lo que hay y apaga el botón
// ENTRADA: nada (lee los renglones)
// SALIDA:  nada (el contador, el aviso de cada renglón y el botón). El servidor lo vuelve a revisar: esto es para avisar antes.
// Ej: carne con 5 kg de stock → escribe 2 kg: "1 insumo cargado" · escribe 6 kg: aviso "Hay 5 kg" y botón apagado
// La llaman escribir una cantidad y cambiar una unidad.
// ─────────────────────────────────────────────────────────────────────────────
function revisarCantidadesSalida() {
  let cargados = 0;
  let hayProblema = false;

  salidaRenglones.querySelectorAll(".renglon-salida").forEach((renglon) => {
    const cantidad = Number(renglon.querySelector(".salida-cantidad").value);
    const unidad = renglon.querySelector(".salida-unidad").value;
    const stock = Number(renglon.dataset.stock);

    // La cantidad en la unidad del insumo, redondeada a 3 decimales: en JavaScript, 1.1 × 1000 da 1100.0000000000002
    let cantidadBase = cantidad;
    // ¿eligió otra unidad? SÍ: kg en un insumo en g · NO: g en un insumo en g
    if (unidad !== renglon.dataset.unidad) {
      cantidadBase = Math.round((cantidad * FACTOR_UNIDAD_SALIDA[unidad] / FACTOR_UNIDAD_SALIDA[renglon.dataset.unidad]) * 1000) / 1000;
    }

    // ¿tiene cantidad? SÍ: 2 · NO: vacío o 0
    if (cantidad > 0) {
      cargados = cargados + 1;
    }

    let textoAviso = "";
    // ¿pide más de lo que hay? SÍ: 6 kg con 5 kg · NO: 2 kg con 5 kg
    if (cantidadBase > stock) {
      textoAviso = "Hay " + mostrarCantidad(stock, renglon.dataset.unidad);
    } else if (cantidad < 0) {
      textoAviso = "Tiene que ser mayor a 0";
    }

    const aviso = renglon.querySelector(".salida-aviso");
    aviso.textContent = textoAviso;
    // ¿hay algo para avisar? SÍ: "Hay 5 kg" · NO: la cantidad está bien
    if (textoAviso !== "") {
      aviso.hidden = false;
      renglon.classList.add("renglon-salida--se-pasa");
      hayProblema = true;
    } else {
      aviso.hidden = true;
      renglon.classList.remove("renglon-salida--se-pasa");
    }
  });

  let textoContador = cargados + " insumos cargados";
  // ¿es uno solo? SÍ: 1 → "1 insumo cargado" · NO: 3 → "3 insumos cargados"
  if (cargados === 1) {
    textoContador = "1 insumo cargado";
  }
  salidaContador.textContent = textoContador;
  btnGuardarSalida.disabled = hayProblema;
}


// ─────────────────────────────────────────────────────────────────────────────
// guardarSalida → junta lo cargado y lo manda. Si sale bien, cierra y recarga los insumos y la lista
// ENTRADA: nada (lee el motivo y los renglones)
// SALIDA:  nada. Si algo está mal, el mensaje queda abajo y la ventana sigue abierta con lo cargado.
// Ej: 2 kg de carne, Vencido → POST /api/salidas-stock { motivo: 'vencido', motivo_otro: '', items: [{ id_insumo: 7, cantidad: 2, unidad: 'kg' }] }
//     → se cierra y la salida aparece primera, con su recuadro "Salida manual"
// La llama el botón "Registrar salida" de la ventana. El servidor saca el usuario del token y revisa todo de nuevo.
// ─────────────────────────────────────────────────────────────────────────────
async function guardarSalida() {
  salidaError.textContent = "";

  // 1. Los renglones con cantidad. return = saltear este renglón y seguir con el siguiente
  const items = [];
  salidaRenglones.querySelectorAll(".renglon-salida").forEach((renglon) => {
    const cantidad = Number(renglon.querySelector(".salida-cantidad").value);
    // ¿no tiene cantidad? SÍ: vacío o 0 · NO: 2
    if (!(cantidad > 0)) {
      return;
    }
    items.push({ id_insumo: Number(renglon.dataset.id), cantidad: cantidad, unidad: renglon.querySelector(".salida-unidad").value });
  });

  // 2. Lo que falta completar
  const faltaOtro = salidaMotivo.value === "otro" && salidaOtro.value.trim() === "";
  let mensajeFalta = "";
  // ¿qué falta? Los insumos: ninguna cantidad · El motivo: sin elegir · El texto: eligió "Otro" y no escribió nada
  if (items.length === 0) {
    mensajeFalta = "Cargá al menos un insumo";
  } else if (salidaMotivo.value === "") {
    mensajeFalta = "Elegí un motivo";
  } else if (faltaOtro) {
    mensajeFalta = "Escribí cuál es el motivo";
  }
  // ¿falta algo? SÍ: no eligió motivo · NO: está todo
  if (mensajeFalta !== "") {
    salidaError.textContent = mensajeFalta;
    return;
  }

  // 3. Se manda. El botón apagado: que no se guarde dos veces
  btnGuardarSalida.disabled = true;
  try {
    const res = await apiFetch("/api/salidas-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: salidaMotivo.value, motivo_otro: salidaOtro.value, items: items }),
    });
    const datos = await res.json().catch(() => ({}));   // si no es JSON, un objeto vacío

    // ¿salió mal? SÍ: alguien ya sacó esa carne y no alcanza · NO: se guardó
    if (!res.ok) {
      let mensaje = "No se pudo registrar la salida";
      // ¿el servidor dijo por qué? SÍ: 'No alcanza "Carne"…' · NO: vino vacío
      if (datos.error) {
        mensaje = datos.error;
      }
      salidaError.textContent = mensaje;
      return;
    }

    // 4. Salió bien: se cierra y se recarga todo. La salida es la última: sale primera
    modalSalida.hidden = true;
    listaInsumos = await traerInsumos();
    listaMovimientos = await traerMovimientos();
    filtrarMovimientos();
  } catch (error) {
    console.error("Error al registrar la salida:", error);   // el detalle, a la consola
    salidaError.textContent = "No se pudo conectar con el servidor";
  } finally {
    btnGuardarSalida.disabled = false;                       // pase lo que pase, el botón vuelve a andar
  }
}


// El botón de arriba abre la ventana de cero y pide los insumos de nuevo, así el stock que se ve es el de ahora
document.getElementById("btnRegistrarSalida").addEventListener("click", async () => {
  salidaMotivo.value = "";
  salidaOtro.value = "";
  salidaOtroCampo.hidden = true;
  salidaBuscador.value = "";
  salidaSinResultados.hidden = true;
  salidaError.textContent = "";
  salidaRenglones.innerHTML = '<p class="salida-vacio">Cargando...</p>';
  revisarCantidadesSalida();
  modalSalida.hidden = false;
  listaInsumos = await traerInsumos();
  renderizarInsumosSalida(listaInsumos);
});

// Se cierra con la X, con Cancelar o con Escape. Tocar afuera no la cierra: se perdería lo cargado
document.addEventListener("keydown", (evento) => {
  // ¿apretó Escape? SÍ: Escape · NO: cualquier otra tecla
  if (evento.key === "Escape") {
    modalSalida.hidden = true;
  }
});
[document.getElementById("btnCerrarSalidaX"), document.getElementById("btnCancelarSalida")].forEach((boton) => {
  boton.addEventListener("click", () => {
    modalSalida.hidden = true;
  });
});

// "Otro" muestra el campo de texto; cualquier otro motivo lo esconde
salidaMotivo.addEventListener("change", () => {
  salidaOtroCampo.hidden = salidaMotivo.value !== "otro";
});

// Escribir una cantidad o cambiar una unidad revisa todo de nuevo. Se engancha en la lista: los renglones cambian al abrir
salidaRenglones.addEventListener("input", revisarCantidadesSalida);
salidaRenglones.addEventListener("change", revisarCantidadesSalida);

// El buscador esconde los que no coinciden. Un insumo con cantidad nunca se esconde: así no se manda algo que no se ve
salidaBuscador.addEventListener("input", () => {
  const texto = salidaBuscador.value.trim().toLowerCase();
  let visibles = 0;
  salidaRenglones.querySelectorAll(".renglon-salida").forEach((renglon) => {
    const coincide = renglon.dataset.nombre.includes(texto);
    const tieneCantidad = Number(renglon.querySelector(".salida-cantidad").value) !== 0;
    const seVe = coincide || tieneCantidad;
    renglon.hidden = !seVe;
    // ¿se ve? SÍ: buscó "car" y es Carne · NO: buscó "car" y es Harina, sin cantidad
    if (seVe) {
      visibles = visibles + 1;
    }
  });
  salidaSinResultados.hidden = visibles > 0;
});

btnGuardarSalida.addEventListener("click", guardarSalida);


// Al cargar la página: las fechas en los últimos 30 días y los movimientos
// (05/11: ya no se traen los insumos al cargar: eran para la ventana de compra, que se mudó a Compras.
//  La ventana Registrar salida los pide cuando se abre)
document.addEventListener("DOMContentLoaded", async () => {
  const hoy = new Date();                                                              // hoy, en la computadora
  const hace30Dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30); // hace 30 días
  filtroDesde.value = fechaLocalISO(hace30Dias);                                       // 'AAAA-MM-DD' (fechas.js)
  filtroHasta.value = fechaLocalISO(hoy);

  listaMovimientos = await traerMovimientos();
  filtrarMovimientos();
});

// Al volver a esta pestaña se piden los movimientos de nuevo: así aparece lo que se hizo en otra pantalla
// (un Hecho, un Listo para entregar, un pedido de la web…). Vuelve a la página 1 y cierra el Detalle abierto.
// (05/11: ya no pregunta por la ventana de compra, que se mudó a Compras)
document.addEventListener("visibilitychange", async () => {
  const hayQueRecargar = document.visibilityState === "visible";
  // ¿volvió a la pestaña? SÍ: estaba en otra y volvió · NO: se fue a otra
  if (!hayQueRecargar) {
    return;
  }
  listaMovimientos = await traerMovimientos();
  filtrarMovimientos();
});
