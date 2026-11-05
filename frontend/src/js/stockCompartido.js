// ============================================================================
// stockCompartido.js — Lo que usan las dos pantallas de stock: Movimientos de Stock y Compras
//
// Funciones:
//   traerInsumos           → pide los insumos (GET /api/insumos)
//   opcionesUnidad         → las <option> de unidad según la unidad del insumo (kg / g, lts / ml, u)
//   mostrarCantidad        → una cantidad en la unidad grande: 16600 ml → "16,6 lts"
//   abrirDetalleMovimiento → llena y abre el modal de Detalle, según el origen (compra, producción, venta…)
//
// Tablas: ASPECTO_ORIGEN y ORIGENES (cómo se ve cada origen) y DETALLE_ORIGEN (qué muestra su Detalle).
// Además pone el HTML del modal de Detalle en la página, como adminSidebar.js con el menú: así está escrito una sola vez.
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml y motivoParaMostrar) y fechas.js.
// Va al final de la página, adentro de .admin-content: cuando corre, .admin-content ya existe.
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

// ---------- LOS INSUMOS (Registrar compra y Registrar salida) ----------

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


// ---------- CÓMO SE VE CADA ORIGEN ----------

// Los dibujitos de los recuadros y de la pastilla de producción (texto fijo: no viene de la base)
const ICONO_OLLA = '<svg class="icono-movimiento" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13h12v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"></path><path d="M4 13h16M9 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4"></path></svg>';
const ICONO_BOLSA = '<svg class="icono-movimiento" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><path d="M3 6h18M16 10a4 4 0 0 1-8 0"></path></svg>';
const ICONO_PERSONA = '<svg class="icono-movimiento" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path></svg>';
const ICONO_CAJA = '<svg class="icono-movimiento" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"></rect><path d="M3 12h18M8 7V4h8v3"></path></svg>';

// El texto de la pastilla de Tipo
const TEXTOS_TIPO = { entrada: "▲ Entrada", salida: "▼ Salida" };

// Cómo se ve cada origen: la línea de la fila, la pastilla y, si tiene número, su recuadro de Referencia
// (ceros = cuántas cifras lleva el número. Ej: 15 con 3 ceros → "015"). Sin número, el recuadro es gris (crearRenglon)
const ASPECTO_ORIGEN = {
  compra:     { fila: "fila-entrada",    pastilla: "badge-entrada",    textos: TEXTOS_TIPO, recuadro: "recuadro-compra",  icono: ICONO_BOLSA,   etiqueta: "Compra",          ceros: 0, sufijo: "" },
  produccion: { fila: "fila-produccion", pastilla: "badge-produccion", textos: { entrada: ICONO_OLLA + " Producción" }, recuadro: "recuadro-cocina", icono: ICONO_OLLA, etiqueta: "Pedido a Cocina", ceros: 3, sufijo: "" },
  venta:      { fila: "fila-salida",     pastilla: "badge-salida",     textos: TEXTOS_TIPO, recuadro: "recuadro-cliente", icono: ICONO_PERSONA, etiqueta: "Pedido cliente",  ceros: 3, sufijo: "" },
  cocina:     { fila: "fila-salida",     pastilla: "badge-salida",     textos: TEXTOS_TIPO, recuadro: "recuadro-cliente", icono: ICONO_PERSONA, etiqueta: "Pedido cliente",  ceros: 3, sufijo: "" },
  devolucion: { fila: "fila-entrada",    pastilla: "badge-entrada",    textos: TEXTOS_TIPO, recuadro: "recuadro-cliente", icono: ICONO_PERSONA, etiqueta: "Pedido cliente",  ceros: 3, sufijo: " anulado" },
  descarte:   { fila: "fila-neutra",     pastilla: "badge-neutra",     textos: TEXTOS_TIPO },
  ajuste:     { fila: "fila-neutra",     pastilla: "badge-neutra",     textos: TEXTOS_TIPO },
  salida_manual: { fila: "fila-neutra",  pastilla: "badge-neutra",     textos: TEXTOS_TIPO },
};

// Cómo se escribe cada origen en un recuadro gris (lo que no tiene pedido ni compra)
const ORIGENES = {
  compra:     "Compra",
  produccion: "Producción",
  venta:      "Venta",
  devolucion: "Devolución",
  descarte:   "Descarte",
  cocina:     "Cocina de un pedido",
  ajuste:     "Ajuste",
  salida_manual: "Salida manual",
};

// Qué muestra el modal de Detalle según el origen (lo usa abrirDetalleMovimiento):
//   titulo y antesDelNumero = el título. Ej: "Producción" + " · Cocina " + "#015" (sin número, solo "Producción")
//   datos = las cajitas: su nombre y de dónde sale el dato (los "campo" están en abrirDetalleMovimiento)
//   tituloViandas y tituloInsumos = el título de cada lista
//   conVencimiento y conTotal = solo las compras
const DETALLE_ORIGEN = {
  compra: {
    titulo: "Compra", antesDelNumero: " ",
    datos: [{ nombre: "Registró", campo: "usuario" }, { nombre: "Proveedor", campo: "proveedor" }],
    tituloViandas: "Viandas", tituloInsumos: "Insumos comprados", conVencimiento: true, conTotal: true,
  },
  produccion: {
    titulo: "Producción", antesDelNumero: " · Cocina ",
    datos: [{ nombre: "Lo pidió", campo: "pidio" }, { nombre: "Marcó Hecho", campo: "usuario" }],
    tituloViandas: "Viandas que entraron a la heladera", tituloInsumos: "Insumos que se usaron", conVencimiento: false, conTotal: false,
  },
  venta: {
    titulo: "Pedido cliente", antesDelNumero: " ",
    datos: [{ nombre: "Cliente", campo: "cliente" }],
    tituloViandas: "Viandas que salieron", tituloInsumos: "Insumos", conVencimiento: false, conTotal: false,
  },
  cocina: {
    titulo: "Gasto de cocina", antesDelNumero: " · Pedido ",
    datos: [{ nombre: "Pedido", campo: "pedido" }],
    tituloViandas: "Viandas", tituloInsumos: "Insumos que se usaron", conVencimiento: false, conTotal: false,
  },
  devolucion: {
    titulo: "Anulación", antesDelNumero: " · Pedido ",
    datos: [{ nombre: "Quién", campo: "usuario" }, { nombre: "Motivo", campo: "motivo" }],
    tituloViandas: "Viandas que volvieron a la heladera", tituloInsumos: "Insumos", conVencimiento: false, conTotal: false,
  },
  descarte: {
    titulo: "Descarte", antesDelNumero: "",
    datos: [{ nombre: "Quién", campo: "usuario" }, { nombre: "Motivo", campo: "motivo" }],
    tituloViandas: "Viandas descartadas", tituloInsumos: "Insumos", conVencimiento: false, conTotal: false,
  },
  ajuste: {
    titulo: "Ajuste", antesDelNumero: "",
    datos: [{ nombre: "Quién", campo: "usuario" }, { nombre: "Motivo", campo: "motivo" }],
    tituloViandas: "Viandas", tituloInsumos: "Insumos", conVencimiento: false, conTotal: false,
  },
  salida_manual: {
    titulo: "Salida manual", antesDelNumero: "",
    datos: [{ nombre: "Quién", campo: "usuario" }, { nombre: "Motivo", campo: "motivo" }],
    tituloViandas: "Viandas", tituloInsumos: "Insumos que salieron", conVencimiento: false, conTotal: false,
  },
};


// ---------- EL MODAL DE DETALLE ----------

// El HTML del modal de Detalle. Arranca oculto (hidden) y lo llena y lo abre abrirDetalleMovimiento.
// Es texto fijo: nada viene de la base. Las piezas son las de la ventana de Detalles de Consultar Pedidos (global.css, 7b y 7c)
document.querySelector(".admin-content").insertAdjacentHTML("beforeend", `
  <div id="modalDetalleMovimiento" class="modal-fondo" hidden>
    <div class="ventana ventana-detalles ventana-detalle-movimiento" role="dialog" aria-modal="true" aria-labelledby="detalleMovimientoTitulo">
      <!-- Arriba: la fecha en verde, el título y la X -->
      <div class="ventana-cabecera">
        <div>
          <p id="detalleMovimientoFecha" class="ventana-numero"></p>
          <h3 id="detalleMovimientoTitulo" class="ventana-titulo"></h3>
        </div>
        <button type="button" id="btnCerrarDetalleX" class="boton-cerrar" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
        </button>
      </div>
      <!-- Las cajitas de datos, las listas y el total (los arma abrirDetalleMovimiento) -->
      <div id="detalleMovimientoCuerpo" class="ventana-cuerpo"></div>
      <!-- Abajo: solo "Cerrar" -->
      <div class="ventana-pie">
        <button type="button" id="btnCerrarDetalle" class="boton-principal">Cerrar</button>
      </div>
    </div>
  </div>
`);


// ─────────────────────────────────────────────────────────────────────────────
// abrirDetalleMovimiento → llena el modal de Detalle con los datos de un movimiento y lo abre
// ENTRADA: mov (uno de listaMovimientos) y fecha (ya escrita por crearRenglon. Ej: "15/10/2026 14:32")
// SALIDA:  nada (el modal abierto). Lo que muestra cada origen está en la tabla DETALLE_ORIGEN.
//          Todo lo que viene de la base pasa por escHtml. No le pide nada al servidor.
// Ej: el "Hecho" de 2 fideos → arriba "15/10/2026 · 14:32" y "Producción · Cocina #009"; las cajitas
//     "LO PIDIÓ Mauri Rodriguez" y "MARCÓ HECHO Ana López"; la lista "Viandas que entraron a la heladera":
//     fideos · 2 viandas; y la lista "Insumos que se usaron": Harina integral · 600 g, Huevo · 4 u
// La llama el botón Detalle de cada renglón (crearRenglon). Usa mostrarCantidad y las funciones de fechas.js.
// ─────────────────────────────────────────────────────────────────────────────
function abrirDetalleMovimiento(mov, fecha) {
  const detalle = DETALLE_ORIGEN[mov.origen];                      // qué muestra este origen

  // 1. El título. Ej: "Compra #11" o, sin número, "Descarte"
  let titulo = detalle.titulo;
  let numero = "";
  // ¿tiene número? SÍ: la compra 11 · NO: un descarte
  if (mov.numero) {
    numero = "#" + String(mov.numero).padStart(ASPECTO_ORIGEN[mov.origen].ceros, "0");  // ej: 15 → "#015"
    titulo = detalle.titulo + detalle.antesDelNumero + numero;
  }

  // 2. Las cajitas de datos. "campo" dice de cuál de estos sale cada una (tabla DETALLE_ORIGEN)
  const valores = {
    usuario: mov.usuario,
    proveedor: mov.proveedor,
    pidio: mov.pidio,
    cliente: mov.cliente,
    motivo: motivoParaMostrar(mov.motivo),
    pedido: numero,
  };
  const htmlCajitas = detalle.datos.map((dato) => {
    let valor = valores[dato.campo];
    const faltaDato = !valor || valor === "-";
    // ¿no hay dato? SÍ: una compra sin proveedor · NO: "Avícola Sierras"
    if (faltaDato) {
      valor = "—";
    }
    return '<div class="cajita-detalle"><span class="nombre-cajita">' + dato.nombre + '</span><span class="valor-cajita">' + escHtml(valor) + "</span></div>";
  }).join("");                                                     // join une las cajitas en un solo texto

  // 3. Los renglones de viandas. Ej: { plato: 'Fideos', cantidad: 2 } → "Fideos · 2 viandas"
  const lineasViandas = mov.viandas.map((vianda) => {
    let cantidad = vianda.cantidad + " viandas";
    // ¿es una sola? SÍ: 1 → "1 vianda" · NO: 5 → "5 viandas"
    if (vianda.cantidad === 1) {
      cantidad = "1 vianda";
    }
    return '<div class="linea-plato"><span>' + escHtml(vianda.plato) + '</span><span class="cantidad-linea">' + escHtml(cantidad) + "</span></div>";
  }).join("");

  // 4. Los renglones de insumos. Ej: "Harina · 2 kg" y, en las compras, abajo "Vence: 31/12/2026"
  const lineasInsumos = mov.insumos.map((insumo) => {
    let textoVence = "";
    const muestraVence = detalle.conVencimiento && insumo.vence;
    // ¿es una compra y el insumo tiene vencimiento? SÍ: harina que vence el 31/12 · NO: un insumo de un Hecho
    if (muestraVence) {
      textoVence = '<span class="dato-chico">Vence: ' + escHtml(fechaDDMMAAAA(parseFechaLocal(insumo.vence))) + "</span>";
    }
    return '<div class="linea-plato"><span>' + escHtml(insumo.nombre) + textoVence + '</span><span class="cantidad-linea">' + escHtml(mostrarCantidad(insumo.cantidad, insumo.unidad)) + "</span></div>";
  }).join("");

  // 5. Un recuadro por lista, solo las que tienen algo. filter saca las vacías. Ej: una venta no tiene insumos
  const listas = [
    { titulo: detalle.tituloViandas, lineas: lineasViandas },
    { titulo: detalle.tituloInsumos, lineas: lineasInsumos },
  ];
  const htmlListas = listas.filter((lista) => lista.lineas !== "").map((lista) => {
    return '<div class="recuadro-combo"><div class="cabecera-combo"><span>' + lista.titulo + '</span></div><div class="platos-combo">' + lista.lineas + "</div></div>";
  }).join("");

  // 6. El total de la compra: cuántos insumos son (no se suman cantidades: una compra mezcla kg, lts y unidades)
  let htmlTotal = "";
  // ¿lleva total? SÍ: una compra · NO: un Hecho
  if (detalle.conTotal) {
    htmlTotal = '<div class="total-detalle"><span>Total de insumos</span><span>' + mov.insumos.length + "</span></div>";
  }

  // 7. Se llena y se abre. replace cambia el espacio entre la fecha y la hora. Ej: "15/10/2026 14:32" → "15/10/2026 · 14:32"
  document.getElementById("detalleMovimientoFecha").textContent = fecha.replace(" ", " · ");
  document.getElementById("detalleMovimientoTitulo").textContent = titulo;
  document.getElementById("detalleMovimientoCuerpo").innerHTML = '<div class="cajitas-detalle">' + htmlCajitas + "</div>" + htmlListas + htmlTotal;
  modalDetalleMovimiento.hidden = false;
  btnCerrarDetalle.focus();                                        // el cursor en "Cerrar": con Enter o Espacio se cierra
}


// El modal de Detalle se cierra con la X, con "Cerrar", tocando el fondo oscuro o con Escape
const modalDetalleMovimiento = document.getElementById("modalDetalleMovimiento");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");
[btnCerrarDetalle, document.getElementById("btnCerrarDetalleX")].forEach((boton) => {
  boton.addEventListener("click", () => {
    modalDetalleMovimiento.hidden = true;
  });
});
modalDetalleMovimiento.addEventListener("click", (evento) => {
  const tocoElFondo = evento.target === modalDetalleMovimiento;
  // ¿tocó lo oscuro? SÍ: afuera de la caja · NO: adentro de la caja
  if (tocoElFondo) {
    modalDetalleMovimiento.hidden = true;
  }
});
document.addEventListener("keydown", (evento) => {
  // ¿apretó Escape? SÍ: Escape · NO: cualquier otra tecla
  if (evento.key === "Escape") {
    modalDetalleMovimiento.hidden = true;
  }
});
