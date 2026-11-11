// ============================================================================
// compras.js — Pantalla Compras (pantallas/compras/compras.html): qué compré, qué gasté y qué tengo que reponer
//
// CÓMO SE COMPARTEN LOS ARCHIVOS: en el front no hay import/export. compras.html carga los <script> en este orden:
//   roles.js → guard.js → api.js → escape.js → adminSidebar.js → fechas.js → paginacion.js
//   → stockCompartido.js → registrarCompra.js → compras.js (este, el último)
//   Todos comparten las mismas variables y funciones. Por eso el ORDEN importa: compras.js puede usar
//   listaInsumos o mostrarCantidad porque esos archivos se cargaron ANTES. Si compras.js fuera primero, no existirían.
//   Cada vez que acá se usa algo de otro archivo, al lado dice "← viene de <archivo>".
//
// EL RECORRIDO, en el orden en que pasa:
// ① Entrás a Compras → DOMContentLoaded (línea 831)
// ② Se elige la semana de hoy → elegirPeriodo("semana", hoy) (línea 131)
// ③ Se piden la tabla y las compras hechas → cargarCompras (línea 188) → GET /api/compras/resumen y GET /api/compras
//    → filtrarResumen (línea 268) → renderizarResumen (línea 303): la tabla, de a 20 por página
//    → renderizarComprasHechas (línea 441): el panel "Compras hechas" (se dibuja aunque esté cerrado)
// ④ Se llenan los insumos de la ventana Registrar compra → listaInsumos = await traerInsumos() (línea 839)
//    (listaInsumos NACE vacía en stockCompartido.js línea 21; acá se LLENA; registrarCompra.js
//     la USA en su línea 51 para dibujar el modal y la RECARGA en su línea 319 después de guardar)
//    → llenarCategorias(listaInsumos) (registrarCompra.js): las categorías de ESA ventana
// ⑤ ¿La dirección dice ?compra=1? → btnRegistrarCompra.click() (línea 849): la ventana se abre sola
// ⑥ Se llena el filtro de categorías de la tabla → GET /api/categorias-insumos (línea 854)
// ⑦ Tocás un botón (LOS BOTONES, desde la línea 750):
//    Semana / Mes / ‹ / ›      → elegirPeriodo + cargarCompras (vuelve a la página 1)
//    Buscar / Categoría        → filtrarResumen (sin pedir nada al servidor)
//    Página 2, 3…              → paginacion.js (no pasa por este archivo)
//    En qué se gastó ›         → abrirGastosInsumo (línea 546) → GET /api/compras/gastos/:id
//    Compras hechas            → abre el panel (ya lo dibujó ③) · Detalle › → abrirDetalleMovimiento (stockCompartido.js)
//    Imprimir lista de compras → imprimirListaCompras (línea 714)
//    Guardar una compra        → registrarCompra.js llama a cargarCompras(true) (queda en la misma página)
//    Escape / X / tocar afuera → cierra los paneles
// ⑧ Volvés a la pestaña → visibilitychange (línea 870) → cargarCompras(true)
//
// LAS FUNCIONES:
//   elegirPeriodo           → guarda la semana o el mes de un día y escribe el período en la pantalla
//   cargarCompras           → pide al servidor las filas de la tabla y las compras del panel (GET /api/compras/resumen y /api/compras)
//   filtrarResumen          → aplica el buscador y la categoría, sin volver a pedir nada al servidor
//   renderizarResumen       → dibuja la tabla (de a 20 por página, con crearPaginacion) y el pie
//   renderizarComprasHechas → dibuja el panel "Compras hechas", con el botón Detalle de cada compra
//   abrirGastosInsumo       → abre el panel "En qué se gastó" de un insumo y lo llena (GET /api/compras/gastos/:idInsumo)
//   imprimirListaCompras    → arma la hoja con lo que hay que comprar y abre la impresión
//
// Las cuentas (Compré, Gasté, Para repetir, los totales) las hace SIEMPRE el servidor: acá solo se muestran.
// Todo texto que viene de la base pasa por escHtml antes de ir al innerHTML.
// ============================================================================

// Los elementos de la página
const botonSemana = document.getElementById("botonSemana");                     // "Semana"
const botonMes = document.getElementById("botonMes");                           // "Mes"
const botonPeriodoAnterior = document.getElementById("botonPeriodoAnterior");   // "‹"
const botonPeriodoSiguiente = document.getElementById("botonPeriodoSiguiente"); // "›"
const textoPeriodo = document.getElementById("textoPeriodo");                   // "02/11 al 08/11"
const ayudaPeriodo = document.getElementById("ayudaPeriodo");                   // "la semana", en la franja verde
const buscadorInsumo = document.getElementById("buscadorInsumo");               // "Buscar insumo"
const filtroCategoria = document.getElementById("filtroCategoria");             // "Todas las categorías"
const cuerpoResumen = document.getElementById("cuerpoResumen");                 // las filas de la tabla
const contadorResumen = document.getElementById("contadorResumen");             // "8 insumos con compras o gastos en la semana"
const paginacionCompras = document.getElementById("paginacionCompras");         // (05/11) los botones ‹ 1 2 3 › de la tabla
const botonComprasHechas = document.getElementById("botonComprasHechas");       // "Compras hechas", arriba
const botonImprimirLista = document.getElementById("botonImprimirLista");       // "Imprimir lista de compras", abajo
const hojaListaCompras = document.getElementById("hojaListaCompras");           // la hoja que sale al imprimir

// El panel "Compras hechas"
const panelComprasHechas = document.getElementById("panelComprasHechas");               // lo oscuro con el panel adentro
const botonCerrarComprasHechas = document.getElementById("botonCerrarComprasHechas");   // la X
const subtituloComprasHechas = document.getElementById("subtituloComprasHechas");       // "Del 02/11 al 08/11 · también figuran…"
const listaComprasHechas = document.getElementById("listaComprasHechas");               // una compra por renglón
const cantidadComprasHechas = document.getElementById("cantidadComprasHechas");         // "4 compras"
const cantidadInsumosComprados = document.getElementById("cantidadInsumosComprados");   // "11 insumos"

// El panel "En qué se gastó"
const panelGastos = document.getElementById("panelGastos");                 // lo oscuro con el panel adentro
const botonCerrarGastos = document.getElementById("botonCerrarGastos");     // la X
const tituloGastos = document.getElementById("tituloGastos");               // "Carne picada especial magra"
const subtituloGastos = document.getElementById("subtituloGastos");         // "En qué se gastó · del 02/11 al 08/11"
const totalesGastos = document.getElementById("totalesGastos");             // las pastillas "Cocina: 9 kg"…
const listaGastos = document.getElementById("listaGastos");                 // una salida por renglón
const cantidadSalidas = document.getElementById("cantidadSalidas");         // "5 salidas"
const totalGastos = document.getElementById("totalGastos");                 // "Total − 15 kg"

// Cómo se nombra cada período en los textos. Ej: "lo que gastaste en la semana"
const NOMBRE_PERIODO = { semana: "la semana", mes: "el mes" };
// Qué botón corresponde a cada período
const BOTON_DE_PERIODO = { semana: botonSemana, mes: botonMes };

// Las pastillas de arriba del panel "En qué se gastó": el total de cada origen, en este orden.
// OJO con los nombres (vienen del servidor): 'produccion' = los Hechos de pedidos a cocina · 'cocina' = pedidos de cliente personalizados
const PASTILLAS_GASTO = [
  { origen: "produccion",    texto: "Cocina" },
  { origen: "cocina",        texto: "Pedidos personalizados" },
  { origen: "salida_manual", texto: "Salidas a mano" },
  { origen: "ajuste",        texto: "Ajuste" },                    // salidas viejas: solo se muestra si es mayor a 0
];

// Qué va en el renglón chico de cada salida, según su origen (los valores los arma abrirGastosInsumo)
// Ej: produccion → "02/11 10:30 · Marta · 20 viandas de Albóndigas" · salida_manual → "05/11 11:00 · Vencido · Ana López"
const DATOS_DE_SALIDA = {
  produccion:    ["fecha", "usuario", "viandas"],
  cocina:        ["fecha", "personalizado", "cliente"],
  salida_manual: ["fecha", "motivo", "usuario"],
  ajuste:        ["fecha", "motivo", "usuario"],
};

// El período que se está viendo
let modoPeriodo = "semana";   // "semana" o "mes"
let periodoDesde = "";        // el primer día, 'AAAA-MM-DD'. Ej: '2026-11-02'
let periodoHasta = "";        // el último día, 'AAAA-MM-DD'. Ej: '2026-11-08'

// Lo que mandó el servidor: los filtros trabajan sobre esto, sin volver a pedirlo
let filasResumen = [];
let errorResumen = "";        // el problema de la última vez que se pidieron ("" = ninguno)
let numeroDeCarga = 0;        // cuántas veces se pidieron: sirve para ignorar una respuesta que llega tarde (ver cargarCompras)
let filasParaComprar = [];    // las filas que se ven y hay que comprar (activas, sin "Te alcanza"): las imprime imprimirListaCompras
let errorComprasHechas = "";  // el problema de la última vez que se pidieron las compras del panel ("" = ninguno)
let numeroDeGastos = 0;       // cuántas veces se abrió "En qué se gastó": sirve para ignorar una respuesta que llega tarde
let paginacionResumen = null; // (05/11) lo que devuelve crearPaginacion: sirve para saber en qué página está la tabla
const FILAS_POR_PAGINA = 20;  // (05/11) cuántos insumos se ven por página


// ─────────────────────────────────────────────────────────────────────────────
// elegirPeriodo → guarda la semana (lunes a domingo) o el mes (del 1 al último día) de un día y lo escribe en la pantalla
// ENTRADA: modo ("semana" o "mes") y dia (un Date, cualquier día de ese período)
// SALIDA:  nada. Cambia periodoDesde y periodoHasta, escribe el período (también en el panel Compras hechas),
//          marca el botón elegido y apaga "›" si el período ya llega a hoy (más adelante no pasó nada)
// Ej: "semana", miércoles 04/11/2026 → '2026-11-02' a '2026-11-08' → "02/11 al 08/11"
//     "semana", domingo 08/11/2026   → '2026-11-02' a '2026-11-08' (el domingo es el último día, no el primero)
//     "mes", 04/11/2026              → '2026-11-01' a '2026-11-30' → "01/11 al 30/11"
// No pide nada al servidor: después hay que llamar a cargarCompras.
// La llaman la carga de la página (①②) y los botones Semana / Mes / ‹ / ›.
// ─────────────────────────────────────────────────────────────────────────────
function elegirPeriodo(modo, dia) {
  const anio = dia.getFullYear();
  const mes = dia.getMonth();
  const numeroDia = dia.getDate();

  // 1. Cuántos días pasaron desde el lunes. getDay da 0 el domingo, 1 el lunes… 6 el sábado
  let diasDesdeElLunes = dia.getDay() - 1;
  // ¿es domingo? SÍ: 08/11 → pasaron 6 días · NO: miércoles 04/11 → pasaron 2
  if (dia.getDay() === 0) {
    diasDesdeElLunes = 6;
  }

  // 2. El primer y el último día. Arranca con el mes: el día 0 del mes que viene es el último de este. Ej: noviembre → 30/11
  let primerDia = new Date(anio, mes, 1);
  let ultimoDia = new Date(anio, mes + 1, 0);
  // ¿es por semana? SÍ: del lunes al domingo · NO: queda el mes
  if (modo === "semana") {
    primerDia = new Date(anio, mes, numeroDia - diasDesdeElLunes);
    ultimoDia = new Date(anio, mes, numeroDia - diasDesdeElLunes + 6);
  }

  // 3. Se guarda. fechaLocalISO ← viene de fechas.js: un Date → '2026-11-02'
  modoPeriodo = modo;
  periodoDesde = fechaLocalISO(primerDia);
  periodoHasta = fechaLocalISO(ultimoDia);

  // 4. Se escribe en la pantalla. fechaDDMMAAAA ← viene de fechas.js: un Date → "02/11/2026".
  //    slice(0, 5) deja el día y el mes. Ej: "02/11/2026" → "02/11"
  textoPeriodo.textContent = fechaDDMMAAAA(primerDia).slice(0, 5) + " al " + fechaDDMMAAAA(ultimoDia).slice(0, 5);
  ayudaPeriodo.textContent = NOMBRE_PERIODO[modo];
  subtituloComprasHechas.textContent = "Del " + textoPeriodo.textContent + " · también figuran en Movimientos de Stock";

  // 5. Se marca el botón elegido: primero se desmarcan los dos y después se marca uno
  botonSemana.classList.remove("selector-periodo-activo");
  botonMes.classList.remove("selector-periodo-activo");
  botonSemana.setAttribute("aria-pressed", "false");               // para los lectores de pantalla
  botonMes.setAttribute("aria-pressed", "false");
  BOTON_DE_PERIODO[modo].classList.add("selector-periodo-activo");
  BOTON_DE_PERIODO[modo].setAttribute("aria-pressed", "true");

  // 6. "›" apagado si el período ya llega a hoy. En AAAA-MM-DD, el texto mayor es el día más nuevo
  botonPeriodoSiguiente.disabled = periodoHasta >= fechaLocalISO(new Date());
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarCompras → pide al servidor las filas de la tabla y las compras del período elegido, y dibuja las dos cosas
// ENTRADA: mantenerPagina (05/11): true = vuelve a dibujar en la página donde estaba (volver a la pestaña, guardar una compra);
//          sin nada = arranca en la página 1 (al abrir la pantalla, Semana / Mes, "‹ ›"). Además lee periodoDesde y periodoHasta
// SALIDA:  nada (llena filasResumen, errorResumen y errorComprasHechas; dibuja la tabla y el panel Compras hechas)
// Ej: del 02/11 al 08/11 → GET /api/compras/resumen?desde=2026-11-02&hasta=2026-11-08
//     → [{ nombre: 'Carne', unidad: 'g', compre: 20000, gaste: 15000, hoy_tenes: 8000, comprar: 7000, … }, …]
//     y después GET /api/compras?desde=2026-11-02&hasta=2026-11-08 → [{ origen: 'compra', numero: 15, … }, …]
// Si el servidor contesta mal una de las dos, la otra se muestra igual.
// La llaman la carga de la página (③), los botones del período, volver a esta pestaña (⑧)
// y registrarCompra.js después de guardar una compra. Llama a filtrarResumen y a renderizarComprasHechas.
// ─────────────────────────────────────────────────────────────────────────────
async function cargarCompras(mantenerPagina) {
  // 1. Este pedido es el último. Mientras se espera: "Cargando..." en la tabla y en el panel, e "Imprimir" apagado
  //    numeroDeCarga sirve para ignorar una respuesta que llega TARDE. Ej: tocás "‹" dos veces rápido:
  //      el 1er toque pide la semana del 26/10 → numeroDeCarga = 1, y este pedido se acuerda estaCarga = 1
  //      el 2º toque pide la semana del 19/10  → numeroDeCarga = 2, y ese pedido se acuerda estaCarga = 2
  //    Si la del 26/10 tarda más y llega última, sin esto pisaría la tabla: verías el 26/10 con el título del 19/10.
  //    Con esto, el pedido 1 ve que ya no es el último (1 ≠ 2) y no dibuja nada (ver el if de abajo de la parte 2).
  numeroDeCarga = numeroDeCarga + 1;
  const estaCarga = numeroDeCarga;
  cuerpoResumen.innerHTML = '<tr class="fila-sin-datos"><td colspan="6">Cargando...</td></tr>';
  contadorResumen.textContent = "";
  paginacionCompras.innerHTML = "";                                // los botones de página, mientras carga, no se ven
  botonImprimirLista.disabled = true;
  listaComprasHechas.innerHTML = '<li class="panel-sin-datos">Cargando...</li>';
  cantidadComprasHechas.textContent = "";
  cantidadInsumosComprados.textContent = "";

  // 2. Se piden las dos cosas, una atrás de la otra. Los datos de la dirección se arman sumando textos.
  //    Ej: "?desde=2026-11-02&hasta=2026-11-08" (las fechas no tienen espacios ni símbolos: van tal cual)
  const parametros = "?desde=" + periodoDesde + "&hasta=" + periodoHasta;
  let filas = [];
  let compras = [];
  let problema = "No se pudieron cargar las compras";
  let problemaCompras = "No se pudieron cargar las compras hechas";
  try {
    // apiFetch ← viene de api.js: es fetch, pero le agrega el token del login (y si es 401, manda al login)
    const res = await apiFetch("/api/compras/resumen" + parametros);   // la de la tabla
    const resCompras = await apiFetch("/api/compras" + parametros);    // la del panel
    // res.json() lee la respuesta como JSON. .catch(() => ({})) = si NO es JSON, queda un objeto vacío {} en vez de romper.
    // Ej: si el servidor se cae, puede contestar una página de error en HTML: sin esto se iría al catch de abajo
    // y diría "No se pudo conectar con el servidor" aunque el servidor sí contestó. Con esto dice "No se pudieron cargar las compras".
    const datos = await res.json().catch(() => ({}));
    const datosCompras = await resCompras.json().catch(() => ({}));
    // ¿salió bien la tabla? SÍ: 200 · NO: 400 o 500
    if (res.ok) {
      filas = datos;
      problema = "";
    }
    // ¿salió bien el panel? SÍ: 200 · NO: 400 o 500
    if (resCompras.ok) {
      compras = datosCompras;
      problemaCompras = "";
    }
    // ¿el servidor dijo qué pasó con la tabla? SÍ: "Las fechas son inválidas" · NO: salió bien, o no mandó mensaje
    if (datos.error) {
      problema = datos.error;
    }
    // ¿y con el panel? SÍ: "Hay demasiados renglones…" · NO: salió bien, o no mandó mensaje
    if (datosCompras.error) {
      problemaCompras = datosCompras.error;
    }
  } catch (error) {
    console.error("Error al traer las compras:", error);           // el detalle, a la consola
    problema = "No se pudo conectar con el servidor";              // y un mensaje simple en la tabla
    problemaCompras = "No se pudo conectar con el servidor";       // y en el panel
  }

  // ¿ya se pidió otro período mientras se esperaba? SÍ: tocó "‹" otra vez (esta respuesta llegó tarde) · NO: es la última
  if (estaCarga !== numeroDeCarga) {
    return;
  }

  // 3. Se guarda y se dibuja: la tabla con los filtros que estén elegidos, y el panel (aunque esté cerrado)
  filasResumen = filas;
  errorResumen = problema;
  errorComprasHechas = problemaCompras;
  filtrarResumen(mantenerPagina);
  renderizarComprasHechas(compras);
}


// ─────────────────────────────────────────────────────────────────────────────
// filtrarResumen → aplica el buscador y la categoría a filasResumen y dibuja la tabla
// ENTRADA: mantenerPagina (05/11): true = se queda en la página donde estaba (lo pide cargarCompras al recargar);
//          sin nada = página 1 (el buscador y la categoría). Además lee el buscador y la categoría
// SALIDA:  nada (dibuja las filas que pasan y guarda en filasParaComprar las que se imprimen). No le pide nada al servidor.
// Ej: buscar "CARN" → Carne picada · categoría Almacén → Harina, Huevo y Aceite · las dos juntas → las que cumplen las dos
//     Si todas las que se ven dicen "Te alcanza" (o están desactivadas), "Imprimir lista de compras" queda apagado.
// La llaman cargarCompras, el buscador y el filtro de categoría. Llama a renderizarResumen.
// ─────────────────────────────────────────────────────────────────────────────
function filtrarResumen(mantenerPagina) {
  const texto = buscadorInsumo.value.trim().toLowerCase();         // lo escrito, sin espacios en los bordes y en minúsculas
  const categoria = filtroCategoria.value;                         // el id elegido ("" = todas)

  // filter arma una lista nueva con las que cumplen
  const visibles = filasResumen.filter((fila) => {
    const coincideTexto = String(fila.nombre).toLowerCase().includes(texto);
    const coincideCategoria = categoria === "" || String(fila.id_categoria) === categoria;
    return coincideTexto && coincideCategoria;
  });

  // Las que se imprimen: de las que se ven, las activas con algo para comprar. Ej: Carne (7 kg) sí · Harina ("Te alcanza") no
  filasParaComprar = visibles.filter((fila) => {
    const hayQueComprar = fila.activo === true && fila.comprar > 0;
    return hayQueComprar;
  });
  botonImprimirLista.disabled = filasParaComprar.length === 0;     // sin nada para comprar, apagado

  renderizarResumen(visibles, mantenerPagina);
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarResumen → dibuja las filas de la tabla y el pie
// ENTRADA: filas (las que pasaron los filtros, ya calculadas por el servidor, en g, ml o u) y mantenerPagina
// SALIDA:  nada. Sin filas, un renglón que dice por qué.
// Ej: { nombre: 'Carne', categoria: 'Carnicería', unidad: 'g', compre: 20000, gaste: 15000, hoy_tenes: 8000, comprar: 7000 }
//     → "Carne / Carnicería · + 20 kg · − 15 kg · 8 kg · [7 kg] · En qué se gastó ›"
//     { …, compre: 4000, gaste: 4500, gasto_de_mas: 500 } → abajo del nombre, en naranja: "Gastaste 500 g más de lo que compraste"
//     { …, te_alcanza: true } → "Te alcanza" · { …, activo: false } → "Desactivado" abajo del nombre y "—" en vez de la cantidad a comprar
// "En qué se gastó ›" abre el panel de ese insumo (abrirGastosInsumo).
// (05/11) De a 20 por página (crearPaginacion). mantenerPagina: true = en la página donde estaba;
//         si esa página ya no existe (estaba en la 4 y ahora hay 3), crearPaginacion la deja en la última
// La llama filtrarResumen. Lo que viene de la base pasa por escHtml.
// ─────────────────────────────────────────────────────────────────────────────
function renderizarResumen(filas, mantenerPagina) {
  const nombrePeriodo = NOMBRE_PERIODO[modoPeriodo];               // "la semana" o "el mes"

  // 1. Sin filas: un renglón que dice por qué. Arranca en "no pasó nada en el período"
  let textoVacio = "No hay compras ni gastos en " + nombrePeriodo;
  let claseVacio = "fila-sin-datos";
  // ¿hay filas, pero los filtros las esconden? SÍ: buscó "xyz" · NO: el período vino vacío
  if (filasResumen.length > 0) {
    textoVacio = "Ningún insumo coincide con la búsqueda";
  }
  // ¿falló la última carga? SÍ: "No se pudo conectar con el servidor" · NO: no hubo ningún problema
  if (errorResumen !== "") {
    textoVacio = errorResumen;
    claseVacio = "fila-sin-datos fila-sin-datos--error";
  }
  // ¿no hay nada para mostrar? SÍ: ninguna fila · NO: hay al menos una
  if (filas.length === 0) {
    // escHtml ← viene de escape.js: convierte < > " & en texto, para que nada de la base se tome como HTML
    cuerpoResumen.innerHTML = '<tr class="' + claseVacio + '"><td colspan="6">' + escHtml(textoVacio) + "</td></tr>";
    contadorResumen.textContent = "";
    paginacionCompras.innerHTML = "";                              // sin filas, sin botones de página
    return;
  }

  // 2. El pie
  let textoPie = filas.length + " insumos con compras o gastos en " + nombrePeriodo;
  // ¿es uno solo? SÍ: "1 insumo con…" · NO: "8 insumos con…"
  if (filas.length === 1) {
    textoPie = "1 insumo con compras o gastos en " + nombrePeriodo;
  }
  contadorResumen.textContent = textoPie;

  // 3. La página donde arranca: la 1, o la que se estaba viendo
  let pagina = 1;
  const sigueEnLaPagina = mantenerPagina === true && paginacionResumen !== null;
  // ¿se queda en la página donde estaba? SÍ: volvió a la pestaña o guardó una compra · NO: buscó, cambió la categoría o el período
  if (sigueEnLaPagina) {
    pagina = paginacionResumen.paginaActual();
  }

  // 4. Las filas de esa página. crearPaginacion ← viene de paginacion.js: dibuja solo las filas de la página que se ve
  //    y abajo los botones ‹ 1 2 3 ›. Le pasamos una función (funcionRenderFila) que sabe dibujar UNA fila:
  //    crearPaginacion la llama una vez por cada fila de la página. Ej: página 2 → la llama con las filas 21 a 40,
  //    y cada <tr> que devuelve la función, crearPaginacion lo pega en la tabla. Al tocar "3", la llama con las 41 a 60.
  paginacionResumen = crearPaginacion({
    datos: filas,
    porPagina: FILAS_POR_PAGINA,
    contenedorTabla: cuerpoResumen,
    contenedorPaginacion: paginacionCompras,
    paginaInicial: pagina,
    funcionRenderFila: (fila) => {
      // Cada cantidad, en número y unidad (la unidad va más chica). split corta en el espacio. Ej: "16,6 lts" → ["16,6", "lts"]
      // mostrarCantidad ← viene de stockCompartido.js: 16600 ml → "16,6 lts" (la cantidad de la base, en la unidad cómoda)
      const partesCompre = escHtml(mostrarCantidad(fila.compre, fila.unidad)).split(" ");
      const partesGaste = escHtml(mostrarCantidad(fila.gaste, fila.unidad)).split(" ");
      const partesHoy = escHtml(mostrarCantidad(fila.hoy_tenes, fila.unidad)).split(" ");

      // Compré y Gasté. Sin compras o sin gastos, una rayita en vez de "+ 0 g"
      let htmlCompre = '<span class="sin-cantidad">—</span>';
      // ¿compró algo en el período? SÍ: 20 kg · NO: 0
      if (fila.compre > 0) {
        htmlCompre = "+ " + partesCompre[0] + ' <small class="unidad-cantidad">' + partesCompre[1] + "</small>";
      }
      let htmlGaste = '<span class="sin-cantidad">—</span>';
      // ¿gastó algo en el período? SÍ: 15 kg · NO: 0
      if (fila.gaste > 0) {
        htmlGaste = "− " + partesGaste[0] + ' <small class="unidad-cantidad">' + partesGaste[1] + "</small>";
      }
      const htmlHoy = partesHoy[0] + ' <small class="unidad-cantidad">' + partesHoy[1] + "</small>";

      // Para repetir: la pastilla con lo que hay que comprar, o "Te alcanza"
      let htmlComprar = '<span class="pastilla-comprar">' + escHtml(mostrarCantidad(fila.comprar, fila.unidad)) + "</span>";
      // ¿ya alcanza con lo que hay? SÍ: gasté 5 kg y tengo 8 kg · NO: gasté 15 kg y tengo 8 kg
      if (fila.te_alcanza) {
        htmlComprar = '<span class="texto-te-alcanza">Te alcanza</span>';
      }

      // Abajo del nombre: la categoría y si está desactivado, unidos con " · ". Se van guardando en una lista.
      // Ej: categoría "Almacén" y desactivado → ["Almacén", "Desactivado"] → "Almacén · Desactivado"
      //     sin categoría y activo → [] → ""
      const partesAbajo = [];
      // ¿tiene categoría? SÍ: "Almacén" · NO: vacía o null (no se escribe nada)
      if (fila.categoria) {
        partesAbajo.push(fila.categoria);
      }

      // Un insumo desactivado se ve, pero no se puede comprar: no se sugiere comprarlo
      const desactivado = fila.activo !== true;
      // ¿está desactivado? SÍ: activo false · NO: activo true
      if (desactivado) {
        partesAbajo.push("Desactivado");
        htmlComprar = '<span class="sin-cantidad">—</span>';
      }
      const textoAbajo = partesAbajo.join(" · ");                  // join une la lista. Ej: ["Almacén", "Desactivado"] → "Almacén · Desactivado"

      // El aviso naranja. El número ya viene calculado del servidor
      let htmlAviso = "";
      // ¿gastó más de lo que compró? SÍ: compré 4 kg y gasté 4,5 kg · NO: compré 20 kg y gasté 15 kg
      if (fila.gasto_de_mas > 0) {
        htmlAviso = '<span class="aviso-gasto-de-mas">Gastaste ' + escHtml(mostrarCantidad(fila.gasto_de_mas, fila.unidad)) + " más de lo que compraste</span>";
      }

      // Lo que viene de la base, seguro para el HTML
      const nombre = escHtml(fila.nombre);
      const abajo = escHtml(textoAbajo);

      // La fila
      const tr = document.createElement("tr");
      tr.className = "fila-resumen";
      tr.innerHTML = `
        <td><span class="dato-principal nombre-insumo">${nombre}</span><span class="dato-chico">${abajo}</span>${htmlAviso}</td>
        <td class="celda-numero cantidad-comprada">${htmlCompre}</td>
        <td class="celda-numero cantidad-gastada">${htmlGaste}</td>
        <td class="celda-numero">${htmlHoy}</td>
        <td class="celda-numero">${htmlComprar}</td>
        <td class="celda-accion"><button type="button" class="boton-gastos">En qué se gastó ›</button></td>
      `;

      // "En qué se gastó ›" abre el panel de este insumo
      tr.querySelector(".boton-gastos").addEventListener("click", () => {
        abrirGastosInsumo(fila.id_insumo, fila.nombre);
      });
      return tr;                                                     // crearPaginacion la pega en la tabla
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// renderizarComprasHechas → dibuja el panel "Compras hechas": una compra por renglón, con su botón Detalle
// ENTRADA: compras (las de GET /api/compras, de la más nueva a la más vieja: el mismo objeto que usa Movimientos de Stock)
// SALIDA:  nada (la lista y el pie del panel, aunque esté cerrado). Sin compras, un renglón que dice por qué.
// Ej: { numero: 15, proveedor: 'Molino Juan', fecha: '2026-11-03T19:20:00+00:00', usuario: 'Mauricio', insumos: [3 insumos] }
//     → [Compra #15] "Molino Juan" / "03/11 16:20 · Mauricio · +3 insumos" · [Detalle ›]
//     sin proveedor → "Sin proveedor" · abajo: "4 compras" y "11 insumos" (los insumos de todas, sumados)
// "Detalle ›" abre el MISMO modal de Detalle de Movimientos de Stock (abrirDetalleMovimiento).
// La llama cargarCompras. Lo que viene de la base pasa por escHtml.
// ─────────────────────────────────────────────────────────────────────────────
function renderizarComprasHechas(compras) {
  // 1. Sin compras: un renglón que dice por qué. Arranca en "no hubo compras en el período"
  let textoVacio = "No hay compras en " + NOMBRE_PERIODO[modoPeriodo];
  let claseVacio = "panel-sin-datos";
  // ¿falló la última carga? SÍ: "No se pudo conectar con el servidor" · NO: no hubo ningún problema
  if (errorComprasHechas !== "") {
    textoVacio = errorComprasHechas;
    claseVacio = "panel-sin-datos panel-sin-datos--error";
  }
  // ¿no hay compras? SÍ: una semana sin compras, o falló · NO: hay al menos una
  if (compras.length === 0) {
    listaComprasHechas.innerHTML = '<li class="' + claseVacio + '">' + escHtml(textoVacio) + "</li>";
    cantidadComprasHechas.textContent = "";
    cantidadInsumosComprados.textContent = "";
    return;
  }

  // 2. Un renglón por compra, y de paso se van sumando sus insumos
  let totalInsumos = 0;
  listaComprasHechas.innerHTML = "";
  compras.forEach((compra) => {
    totalInsumos = totalInsumos + compra.insumos.length;

    // La fecha: la entera para el Detalle y la corta para el renglón. Ej: "03/11/2026 16:20" → "03/11 16:20"
    // fechaDeTimestamp y fechaHoraDDMMAAAA ← vienen de fechas.js: de la base (UTC) a la hora de la computadora, y a texto
    const fecha = fechaHoraDDMMAAAA(fechaDeTimestamp(compra.fecha));
    const partesFecha = fecha.split(" ");                            // split corta en el espacio: ["03/11/2026", "16:20"]
    const fechaCorta = partesFecha[0].slice(0, 5) + " " + partesFecha[1];

    let proveedor = "Sin proveedor";
    const tieneProveedor = Boolean(compra.proveedor) && compra.proveedor !== "-";
    // ¿tiene proveedor? SÍ: "Molino Juan" · NO: vacío, null o "-" (como lo toma también el Detalle)
    if (tieneProveedor) {
      proveedor = compra.proveedor;
    }

    let textoInsumos = "+" + compra.insumos.length + " insumos";
    // ¿es uno solo? SÍ: "+1 insumo" · NO: "+3 insumos"
    if (compra.insumos.length === 1) {
      textoInsumos = "+1 insumo";
    }

    // La fecha y quién. La fecha siempre está; el usuario, solo si vino
    let fechaYQuien = fechaCorta;
    const tieneUsuario = Boolean(compra.usuario) && compra.usuario !== "-";
    // ¿vino quién la cargó? SÍ: "Mauricio" → "03/11 16:20 · Mauricio" · NO: vacío, null o "-" → "03/11 16:20"
    if (tieneUsuario) {
      fechaYQuien = fechaCorta + " · " + compra.usuario;
    }

    // Lo que viene de la base, seguro para el HTML
    const numero = escHtml("#" + compra.numero);
    const textoProveedor = escHtml(proveedor);
    const textoFechaYQuien = escHtml(fechaYQuien);

    // El renglón. El recuadro verde es el mismo de Movimientos de Stock (global.css, 13k).
    // ICONO_BOLSA ← viene de stockCompartido.js: el dibujito (svg) de la bolsa de las compras
    const li = document.createElement("li");
    li.className = "renglon-panel-compras";
    li.innerHTML = `
      <div class="datos-renglon-panel">
        <span class="recuadro-referencia recuadro-compra">${ICONO_BOLSA}<span>Compra</span><span class="recuadro-numero">${numero}</span></span>
        <p class="proveedor-compra">${textoProveedor}</p>
        <p class="detalle-renglon-panel">${textoFechaYQuien} · <b class="insumos-de-la-compra">${textoInsumos}</b></p>
      </div>
      <button type="button" class="boton-detalle-compra">Detalle ›</button>
    `;

    // "Detalle ›" abre el modal de Detalle con esta compra.
    // abrirDetalleMovimiento ← viene de stockCompartido.js: el mismo modal de Detalle que usa Movimientos de Stock
    li.querySelector(".boton-detalle-compra").addEventListener("click", () => {
      abrirDetalleMovimiento(compra, fecha);
    });
    listaComprasHechas.appendChild(li);
  });

  // 3. El pie
  let textoCompras = compras.length + " compras";
  // ¿es una sola? SÍ: "1 compra" · NO: "4 compras"
  if (compras.length === 1) {
    textoCompras = "1 compra";
  }
  let textoTotalInsumos = totalInsumos + " insumos";
  // ¿es uno solo? SÍ: "1 insumo" · NO: "11 insumos"
  if (totalInsumos === 1) {
    textoTotalInsumos = "1 insumo";
  }
  cantidadComprasHechas.textContent = textoCompras;
  cantidadInsumosComprados.textContent = textoTotalInsumos;
}


// ─────────────────────────────────────────────────────────────────────────────
// abrirGastosInsumo → abre el panel "En qué se gastó" de un insumo y lo llena con sus salidas del período
// ENTRADA: idInsumo (ej: 7) y nombre (ej: 'Carne picada', el título mientras carga)
// SALIDA:  nada (el panel abierto). Pide GET /api/compras/gastos/7?desde=…&hasta=… y dibuja las pastillas, los renglones y el pie
// Ej: carne, del 02/11 al 08/11 → pastillas "Cocina: 9 kg" · "Pedidos personalizados: 2 kg" · "Salidas a mano: 4 kg", y abajo:
//     [Salida manual]        "05/11 11:00 · Vencido · Ana López"                      − 4 kg
//     [Pedido cliente #119]  '04/11 14:49 · Personalizado "sin sal" · Laura R.'      − 1,5 kg
//     [Pedido a Cocina #009] "02/11 10:30 · Marta · 20 viandas de Albóndigas"         − 6 kg
//     pie: "5 salidas" y "Total − 15 kg" (el mismo número que la columna Gasté)
// La pastilla "Ajuste" (salidas viejas, sin pedido ni salida manual) sale solo si es mayor a 0.
// Si se cierra y se abre otro insumo antes de que llegue la respuesta, la vieja se ignora (numeroDeGastos, como en cargarCompras).
// La llama el botón "En qué se gastó ›" de cada fila (renderizarResumen). Lo que viene de la base pasa por escHtml.
// ─────────────────────────────────────────────────────────────────────────────
async function abrirGastosInsumo(idInsumo, nombre) {
  // 1. Se abre enseguida: el nombre, el período y "Cargando..."
  //    estaVez = el número de esta apertura. Ej: abrís "Carne" (1), cerrás y abrís "Harina" (2): si la respuesta
  //    de Carne llega después, ve que ya no es la última (1 ≠ 2) y no pisa el panel de Harina
  numeroDeGastos = numeroDeGastos + 1;
  const estaVez = numeroDeGastos;
  tituloGastos.textContent = nombre;                               // textContent: se muestra como texto, nunca como HTML
  subtituloGastos.textContent = "En qué se gastó · del " + textoPeriodo.textContent;
  totalesGastos.innerHTML = "";
  listaGastos.innerHTML = '<li class="panel-sin-datos">Cargando...</li>';
  cantidadSalidas.textContent = "";
  totalGastos.textContent = "";
  panelGastos.hidden = false;
  botonCerrarGastos.focus();                                       // el cursor en la X: con Enter se cierra

  // 2. Se piden sus salidas del período. Ej: "/api/compras/gastos/7?desde=2026-11-02&hasta=2026-11-08"
  //    encodeURIComponent deja el id seguro para ir en la dirección (un número queda igual: 7 → "7")
  const parametros = "?desde=" + periodoDesde + "&hasta=" + periodoHasta;
  let datos = {};
  let problema = "No se pudieron cargar los gastos";
  try {
    const res = await apiFetch("/api/compras/gastos/" + encodeURIComponent(idInsumo) + parametros);
    datos = await res.json().catch(() => ({}));                    // si no es JSON, un objeto vacío (ver cargarCompras)
    // ¿salió bien? SÍ: 200 · NO: 400, 404 o 500
    if (res.ok) {
      problema = "";
    }
    // ¿el servidor dijo qué pasó? SÍ: "El insumo no existe" · NO: salió bien, o no mandó mensaje
    if (datos.error) {
      problema = datos.error;
    }
  } catch (error) {
    console.error("Error al traer los gastos:", error);            // el detalle, a la consola
    problema = "No se pudo conectar con el servidor";              // y un mensaje simple en el panel
  }

  // ¿se abrió otro insumo mientras se esperaba? SÍ: cerró y tocó otro (esta respuesta llegó tarde) · NO: es la última
  if (estaVez !== numeroDeGastos) {
    return;
  }
  // ¿hubo un problema? SÍ: "No se pudo conectar con el servidor" · NO: vinieron los gastos
  if (problema !== "") {
    listaGastos.innerHTML = '<li class="panel-sin-datos panel-sin-datos--error">' + escHtml(problema) + "</li>";
    return;
  }
  // ¿no gastó nada? SÍ: un insumo que en el período solo se compró · NO: tiene al menos una salida
  if (datos.salidas.length === 0) {
    listaGastos.innerHTML = '<li class="panel-sin-datos">No se gastó nada de este insumo en ' + NOMBRE_PERIODO[modoPeriodo] + "</li>";
    return;
  }

  const unidad = datos.insumo.unidad;                              // la del insumo: 'g', 'ml' o 'u'

  // 3. Las pastillas con el total de cada origen, una atrás de la otra en un solo texto
  let htmlTotales = "";
  PASTILLAS_GASTO.forEach((pastilla) => {
    const esAjusteEnCero = pastilla.origen === "ajuste" && datos.totales.ajuste <= 0;
    // ¿es la de Ajuste y está en 0? SÍ: Ajuste 0 g (no se muestra) · NO: Cocina 9 kg, o Ajuste 50 g
    if (esAjusteEnCero) {
      return;                                                      // return adentro del forEach = saltear esta y seguir con la otra
    }
    const cantidad = escHtml(mostrarCantidad(datos.totales[pastilla.origen], unidad));
    htmlTotales = htmlTotales + '<span class="pastilla-total-gasto">' + pastilla.texto + ": <b>" + cantidad + "</b></span>";
  });

  // 4. Un renglón por salida (ya vienen de la más nueva a la más vieja), sumados en un solo texto
  let htmlSalidas = "";
  datos.salidas.forEach((salida) => {
    // El recuadro, como en Movimientos de Stock: lo que no tiene número va en gris con su origen. Ej: "Salida manual"
    // ASPECTO_ORIGEN, ORIGENES e ICONO_CAJA ← vienen de stockCompartido.js:
    //   ASPECTO_ORIGEN = el color, el ícono y el nombre del recuadro de cada origen (ej: produccion → azul, "Pedido a Cocina")
    //   ORIGENES = cómo se escribe un origen sin número (ej: salida_manual → "Salida manual") · ICONO_CAJA = el dibujito gris
    const aspecto = ASPECTO_ORIGEN[salida.origen];
    let claseRecuadro = "recuadro-neutro";
    let iconoRecuadro = ICONO_CAJA;
    let etiqueta = ORIGENES[salida.origen];
    let textoNumero = "";
    // ¿tiene número? SÍ: el pedido a cocina 9 o el pedido 119 · NO: una salida manual, o una tanda vieja sin pedido a cocina
    if (salida.numero) {
      claseRecuadro = aspecto.recuadro;
      iconoRecuadro = aspecto.icono;
      etiqueta = aspecto.etiqueta;                                 // ej: "Pedido a Cocina"
      textoNumero = "#" + String(salida.numero).padStart(aspecto.ceros, "0");  // ej: 9 → "#009"
    }

    // Lo de un Hecho: cuántas viandas de qué plato. Ej: "20 viandas de Albóndigas"
    let textoViandas = "";
    // ¿salió de un Hecho? SÍ: tiene plato · NO: una salida manual o un pedido de cliente
    if (salida.plato) {
      textoViandas = salida.viandas + " viandas de " + salida.plato;
    }
    // ¿es una sola? SÍ: "1 vianda de Albóndigas" · NO: "20 viandas de Albóndigas"
    if (salida.viandas === 1) {
      textoViandas = "1 vianda de " + salida.plato;
    }

    // Lo de un pedido de cliente: su personalizado. Ej: 'Personalizado "sin sal"'
    let textoPersonalizado = "";
    // ¿tiene personalizado? SÍ: "sin sal" · NO: vacío (un pedido viejo, de antes de la heladera)
    if (salida.personalizado) {
      textoPersonalizado = 'Personalizado "' + salida.personalizado + '"';
    }

    // El renglón chico: DATOS_DE_SALIDA dice qué lleva cada origen. Ej: produccion → fecha, usuario y viandas
    const partesFecha = fechaHoraDDMMAAAA(fechaDeTimestamp(salida.fecha)).split(" ");  // ["02/11/2026", "10:30"]
    const fechaCorta = partesFecha[0].slice(0, 5) + " " + partesFecha[1];             // "02/11 10:30"
    const valores = {
      fecha: fechaCorta,
      usuario: salida.usuario,
      viandas: textoViandas,
      personalizado: textoPersonalizado,
      cliente: salida.cliente,
      motivo: motivoParaMostrar(salida.motivo),                    // motivoParaMostrar ← viene de escape.js: "Pedido a cocina #9" → "Cocina #009"
    };
    // Se recorren los campos de este origen y se guardan los que tienen algo. Ej: produccion de Marta, 20 viandas
    // → ["02/11 10:30", "Marta", "20 viandas de Albóndigas"] → "02/11 10:30 · Marta · 20 viandas de Albóndigas"
    const partesAbajo = [];
    DATOS_DE_SALIDA[salida.origen].forEach((campo) => {
      const valor = valores[campo];
      const faltaDato = !valor || valor === "-";
      // ¿no hay dato? SÍ: usuario vacío, null o "-" · NO: "Marta"
      if (faltaDato) {
        return;                                                    // return adentro del forEach = saltear este campo y seguir con el otro
      }
      partesAbajo.push(valor);
    });
    const textoAbajo = partesAbajo.join(" · ");

    // Lo que viene de la base, seguro para el HTML
    const textoEtiqueta = escHtml(etiqueta);
    const numero = escHtml(textoNumero);
    const abajo = escHtml(textoAbajo);
    const cantidad = escHtml(mostrarCantidad(salida.cantidad, unidad));

    htmlSalidas = htmlSalidas + `
      <li class="renglon-panel-compras">
        <div class="datos-renglon-panel">
          <span class="recuadro-referencia ${claseRecuadro}">${iconoRecuadro}<span>${textoEtiqueta}</span><span class="recuadro-numero">${numero}</span></span>
          <p class="detalle-renglon-panel">${abajo}</p>
        </div>
        <b class="cantidad-salida">− ${cantidad}</b>
      </li>`;
  });

  // 5. El pie
  let textoSalidas = datos.salidas.length + " salidas";
  // ¿es una sola? SÍ: "1 salida" · NO: "5 salidas"
  if (datos.salidas.length === 1) {
    textoSalidas = "1 salida";
  }

  totalesGastos.innerHTML = htmlTotales;
  listaGastos.innerHTML = htmlSalidas;
  cantidadSalidas.textContent = textoSalidas;
  totalGastos.textContent = "Total − " + mostrarCantidad(datos.total, unidad);
}


// ─────────────────────────────────────────────────────────────────────────────
// imprimirListaCompras → arma la hoja con lo que hay que comprar y abre la impresión del navegador
// ENTRADA: nada (usa filasParaComprar: las filas que se ven con los filtros, activas y sin "Te alcanza")
// SALIDA:  nada. Llena #hojaListaCompras (en la pantalla no se ve) y abre la impresión: el CSS de impresión
//          (compras.css, parte 6) deja en la hoja solo la lista
// Ej: semana del 02/11 al 08/11, categoría Carnicería → "Lista de compras"
//     / "Del 02/11 al 08/11 · lo que gastaste en la semana menos lo que tenés hoy"
//     / Carne picada · 7 kg / Pechuga de pollo · 11 kg / "2 insumos"
// La llama el botón "Imprimir lista de compras" (apagado si no hay nada para comprar).
// ─────────────────────────────────────────────────────────────────────────────
function imprimirListaCompras() {
  // ¿no hay nada para comprar? SÍ: todo dice "Te alcanza" (el botón ya está apagado: esto es por las dudas) · NO: hay al menos uno
  if (filasParaComprar.length === 0) {
    return;
  }

  // 1. Un renglón por insumo: su nombre y cuánto comprar, sumados en un solo texto
  let htmlRenglones = "";
  filasParaComprar.forEach((fila) => {
    const nombre = escHtml(fila.nombre);
    const comprar = escHtml(mostrarCantidad(fila.comprar, fila.unidad));
    htmlRenglones = htmlRenglones + '<tr><td>' + nombre + '</td><td class="celda-comprar">' + comprar + "</td></tr>";
  });

  // 2. Arriba, el período, y abajo, cuántos son (el período es texto de esta pantalla, pero pasa igual por escHtml)
  const periodo = escHtml("Del " + textoPeriodo.textContent + " · lo que gastaste en " + NOMBRE_PERIODO[modoPeriodo] + " menos lo que tenés hoy");
  let textoPie = filasParaComprar.length + " insumos";
  // ¿es uno solo? SÍ: "1 insumo" · NO: "2 insumos"
  if (filasParaComprar.length === 1) {
    textoPie = "1 insumo";
  }

  // 3. Se llena la hoja y se abre la impresión (con su vista previa)
  hojaListaCompras.innerHTML = `
    <h1 class="titulo-lista-compras">Lista de compras</h1>
    <p class="periodo-lista-compras">${periodo}</p>
    <table class="tabla-lista-compras">
      <thead><tr><th>Insumo</th><th class="celda-comprar">Comprá</th></tr></thead>
      <tbody>${htmlRenglones}</tbody>
    </table>
    <p class="pie-lista-compras">${textoPie}</p>
  `;
  window.print();
}


// ---------- LOS BOTONES Y LOS FILTROS ----------

// "Semana" y "Mes": si lo que se ve incluye hoy, se queda en hoy; si no, en el primer día de lo que se ve.
// Los dos hacen lo mismo con distinto modo: por eso una lista de 2 y un forEach, en vez de escribirlo 2 veces
[{ boton: botonSemana, modo: "semana" }, { boton: botonMes, modo: "mes" }].forEach((opcion) => {
  opcion.boton.addEventListener("click", () => {
    const hoy = fechaLocalISO(new Date());
    const hoyEstaAdentro = periodoDesde <= hoy && hoy <= periodoHasta;
    let dia = parseFechaLocal(periodoDesde);                       // parseFechaLocal ← viene de fechas.js: '2026-11-02' → un Date
    // ¿lo que se ve incluye hoy? SÍ: la semana actual · NO: octubre, si hoy es noviembre
    if (hoyEstaAdentro) {
      dia = new Date();
    }
    elegirPeriodo(opcion.modo, dia);
    cargarCompras();
  });
});

// "‹" y "›": lo único distinto es para qué lado van (lado: −1 para atrás, +1 para adelante)
// Ej: semana del 02/11, "‹" → 7 días para atrás → 26/10 · mes de noviembre, "›" → el 1 de diciembre
[{ boton: botonPeriodoAnterior, lado: -1 }, { boton: botonPeriodoSiguiente, lado: 1 }].forEach((flecha) => {
  flecha.boton.addEventListener("click", () => {
    const base = parseFechaLocal(periodoDesde);                    // el primer día de lo que se ve
    let dia = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * flecha.lado);  // 7 días para ese lado
    // ¿es por mes? SÍ: el 1 del mes de al lado · NO: quedan los 7 días
    if (modoPeriodo === "mes") {
      dia = new Date(base.getFullYear(), base.getMonth() + flecha.lado, 1);
    }
    elegirPeriodo(modoPeriodo, dia);
    cargarCompras();
  });
});

// El buscador y la categoría vuelven a dibujar la tabla sin pedir nada al servidor
// (05/11) Los dos arrancan en la página 1. Van con () => para no pasarle el evento como si fuera mantenerPagina
buscadorInsumo.addEventListener("input", () => {
  filtrarResumen();
});
filtroCategoria.addEventListener("change", () => {
  filtrarResumen();
});

// "Imprimir lista de compras"
botonImprimirLista.addEventListener("click", imprimirListaCompras);

// "Compras hechas" abre su panel: ya está dibujado (lo llena cargarCompras)
botonComprasHechas.addEventListener("click", () => {
  panelComprasHechas.hidden = false;
  botonCerrarComprasHechas.focus();                                // el cursor en la X: con Enter se cierra
});

// Los dos paneles se cierran con su X o tocando lo oscuro de afuera
[{ panel: panelComprasHechas, botonCerrar: botonCerrarComprasHechas }, { panel: panelGastos, botonCerrar: botonCerrarGastos }].forEach((opcion) => {
  opcion.botonCerrar.addEventListener("click", () => {
    opcion.panel.hidden = true;
  });
  opcion.panel.addEventListener("click", (evento) => {
    const tocoAfuera = evento.target === opcion.panel;
    // ¿tocó lo oscuro? SÍ: afuera del panel · NO: adentro del panel
    if (tocoAfuera) {
      opcion.panel.hidden = true;
    }
  });
});

// …y con Escape. Si el Detalle de una compra está abierto encima, Escape cierra solo el Detalle (eso lo hace stockCompartido.js).
// modalDetalleMovimiento ← viene de stockCompartido.js: el modal de Detalle (hidden = true quiere decir cerrado).
// { capture: true } = este escuchador se fija ANTES que el Escape de stockCompartido.js. Ej: Detalle abierto encima de
// "Compras hechas", apretás Escape → 1º corre este: ve el Detalle abierto y no cierra nada → 2º corre el de stockCompartido.js
// y cierra solo el Detalle. Sin capture sería al revés: el Detalle ya estaría cerrado y un solo Escape cerraría los dos.
document.addEventListener("keydown", (evento) => {
  const cierraLosPaneles = evento.key === "Escape" && modalDetalleMovimiento.hidden;
  // ¿apretó Escape sin el Detalle abierto? SÍ: Escape con el panel solo · NO: otra tecla, o Escape con el Detalle encima
  if (cierraLosPaneles) {
    panelComprasHechas.hidden = true;
    panelGastos.hidden = true;
  }
}, { capture: true });

// ① Al cargar la página. DOMContentLoaded = "el HTML ya está armado": recién ahí están todos los elementos para llenar.
// async = adentro se puede esperar (await) una respuesta del servidor antes de seguir con la línea de abajo
document.addEventListener("DOMContentLoaded", async () => {
  // ②③ La semana de hoy y sus filas
  elegirPeriodo("semana", new Date());
  cargarCompras();

  // ④ Los insumos de la ventana Registrar compra y sus categorías.
  // listaInsumos y traerInsumos ← vienen de stockCompartido.js (listaInsumos nace vacía allá; acá se llena con GET /api/insumos)
  // llenarCategorias ← viene de registrarCompra.js: llena el select de categorías de la ventana Registrar compra
  listaInsumos = await traerInsumos();
  llenarCategorias(listaInsumos);

  // ⑤ Si se llegó con la dirección terminada en ?compra=1 ("+ Registrar compra" de Movimientos de Stock, o "Ir a Compras"
  // de Pedir a cocina), la ventana se abre sola, como si se tocara "+ Registrar compra".
  // URLSearchParams lee los datos de la dirección. Ej: compras.html?compra=1 → .get("compra") da "1"
  // btnRegistrarCompra ← viene de registrarCompra.js: el botón "+ Registrar compra" (click() = como si lo tocaran)
  const vieneAComprar = new URLSearchParams(window.location.search).get("compra") === "1";
  // ¿la dirección dice ?compra=1? SÍ: compras.html?compra=1 · NO: compras.html
  if (vieneAComprar) {
    btnRegistrarCompra.click();
  }

  // ⑥ Las categorías del filtro de la tabla. Si fallan, queda solo "Todas las categorías" y la tabla anda igual
  try {
    const res = await apiFetch("/api/categorias-insumos");
    const categorias = await res.json();
    categorias.forEach((categoria) => {
      const opcion = document.createElement("option");
      opcion.value = categoria.id;                                 // el valor que lee el JS
      opcion.textContent = categoria.nombre;                       // textContent: se muestra como texto, nunca como HTML
      filtroCategoria.appendChild(opcion);
    });
  } catch (error) {
    console.error("Error al traer las categorías:", error);
  }
});

// ⑧ Al volver a esta pestaña se piden de nuevo: así aparece lo que se hizo en otra pantalla.
// visibilitychange = la pestaña se escondió o se volvió a ver. Ej: estás en Compras, vas a la pestaña de Cocina,
// tocás Hecho y volvés → se piden las compras de nuevo y ves el gasto nuevo
document.addEventListener("visibilitychange", () => {
  // ¿volvió a la pestaña? SÍ: estaba en otra y volvió · NO: se fue a otra
  if (document.visibilityState === "visible") {
    cargarCompras(true);                                           // (05/11) se queda en la página donde estaba
  }
});
