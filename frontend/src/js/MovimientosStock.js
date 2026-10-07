// ============================================================
// MovimientosStock.js — Registro de entradas y salidas de stock
// ============================================================


let todosMovimientos = [];
let renglonesPantalla = [];        // movimientos ya agrupados (combos y tandas en un renglón)
let gruposAbiertos = new Set();    // claves de los renglones agrupados con el detalle desplegado
let textoResaltado = '';           // texto del filtro de insumo, para resaltarlo en los detalles
let tipoActual = 'entrada'; // 'entrada' | 'salida'

// ── Inicialización ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setFechaActual();
  cargarInsumos();
  cargarMovimientos();
});

function setFechaActual() {
  const ahora = new Date();
  // Formato requerido por datetime-local: YYYY-MM-DDTHH:MM, en hora local
  const hh = String(ahora.getHours()).padStart(2, '0');
  const mi = String(ahora.getMinutes()).padStart(2, '0');
  document.getElementById('inputFecha').value = `${fechaLocalISO(ahora)}T${hh}:${mi}`;
}

// ── Carga de datos ────────────────────────────────────────────
async function cargarMovimientos() {
  const tbody = document.getElementById('tablaBody');
  try {
    const res = await apiFetch(`/api/movimientos-stock`);
    if (!res.ok) throw new Error('Error al obtener movimientos');
    todosMovimientos = await res.json();
    renglonesPantalla = agruparMovimientos(todosMovimientos);
    aplicarFiltros(); // dibuja respetando los filtros que ya estén puestos
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="color:#d32f2f;">Error al conectar con el servidor</td></tr>`;
  }
}

async function cargarInsumos() {
  try {
    const res = await apiFetch(`/api/insumos`);
    if (!res.ok) return;
    const insumos = await res.json();
    const select = document.getElementById('selectInsumo');
    select.innerHTML = '<option value="">Seleccioná un insumo...</option>';
    insumos.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.dataset.unidad = i.unidad_medida || '';
      opt.textContent = `${i.nombre} (Stock: ${i.stock_actual} ${i.unidad_medida})`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error al cargar insumos:', e);
  }
}

// ── Sincronizar Unidad de Medida con el insumo seleccionado ───
// La unidad base del insumo se define en Alta de Insumos ("Gestión de Stock").
// Acá se permite elegir entre las unidades de la MISMA familia (ej: g/kg,
// ml/lts) para cargar cómodo según cómo venga el insumo del proveedor, pero
// nunca una unidad de otra familia (no se puede cargar "litros" de harina).
// En salidas se bloquea a la unidad base estricta, porque ahí el valor sale
// directo del sistema (consumo de receta), no de una carga manual.
function actualizarUnidadSegunInsumo() {
  const select = document.getElementById('selectInsumo');
  const opt    = select.selectedOptions[0];
  const unidadInsumo = opt ? (opt.dataset.unidad || '').toLowerCase().trim() : '';
  const selectUnidad = document.getElementById('inputUnidad');

  // Limpiamos las opciones actuales para reescribirlas según la familia de medida
  selectUnidad.innerHTML = '';

  if (!unidadInsumo) {
    selectUnidad.innerHTML = '<option value="">-</option>';
    selectUnidad.disabled = true;
    return;
  }

  if (tipoActual === 'entrada') {
    // SI ES ENTRADA (Proveedores): habilitamos y mostramos la familia de unidades permitida
    selectUnidad.disabled = false;

    if (unidadInsumo === 'g' || unidadInsumo === 'kg') {
      selectUnidad.innerHTML = `
        <option value="g">g</option>
        <option value="kg">kg</option>
      `;
    } else if (unidadInsumo === 'ml' || unidadInsumo === 'lts' || unidadInsumo === 'litros') {
      selectUnidad.innerHTML = `
        <option value="ml">ml</option>
        <option value="lts">lts</option>
      `;
    } else if (unidadInsumo === 'u' || unidadInsumo === 'unidades') {
      selectUnidad.innerHTML = `<option value="u">u</option>`;
    } else {
      selectUnidad.innerHTML = `<option value="${unidadInsumo}">${unidadInsumo}</option>`;
    }

    // Mantenemos seleccionada la unidad base por defecto
    const unidadNormalizada = unidadInsumo === 'litros' ? 'lts' : (unidadInsumo === 'unidades' ? 'u' : unidadInsumo);
    if ([...selectUnidad.options].some(o => o.value === unidadNormalizada)) {
      selectUnidad.value = unidadNormalizada;
    }
  } else {
    // SI ES SALIDA (Consumo interno): bloqueamos para asegurar que use la unidad base estricta
    selectUnidad.innerHTML = `<option value="${unidadInsumo}">${unidadInsumo}</option>`;
    selectUnidad.value = unidadInsumo;
    selectUnidad.disabled = true;
  }
}

// ── Clasificar movimiento por concepto de negocio ─────────────
// La BD solo conoce 'entrada' / 'salida'. Esta función traduce
// esos valores a los términos visuales Compra / Venta / Descarte /
// Combo / Producción. `clave` es la que usa el filtro por tipo.
function clasificarMovimiento(m) {
  if (m.tipo === 'entrada') {
    return { clave: 'compra', filaClass: 'fila-entrada', badgeClass: 'badge-compra', icono: '▲', label: 'Compra' };
  }

  // Salidas de la heladera: se reconocen por id_movimiento_vianda (la tanda que las provocó),
  // no por el texto. Es combo si su movimiento de viandas tiene número de carga (id_lote);
  // los combos viejos, sin ese número, se reconocen por el motivo "Producción combo ...".
  if (m.id_movimiento_vianda) {
    const motivoHeladera = (m.motivo || '').toLowerCase();
    if (idLoteDe(m) !== null || motivoHeladera.startsWith('producción combo')) {
      return { clave: 'combo', filaClass: 'fila-combo', badgeClass: 'badge-combo', icono: '🍱', label: 'Combo' };
    }
    return { clave: 'produccion', filaClass: 'fila-produccion', badgeClass: 'badge-produccion', icono: '🧊', label: 'Producción' };
  }

  // Lista blanca de señales inequívocas de consumo productivo automatizado.
  // Solo si el motivo contiene una de estas, la salida es "Venta".
  // Cualquier otra cosa (texto libre, errores tipográficos, campo vacío) → "Descarte".
  const PALABRAS_VENTA = ['consumo', 'produccion', 'pedido', '#'];
  const motivo  = (m.motivo || '').toLowerCase();
  const esVenta = PALABRAS_VENTA.some(kw => motivo.includes(kw));

  if (esVenta) {
    return { clave: 'venta',    filaClass: 'fila-venta',    badgeClass: 'badge-venta',    icono: '💰', label: 'Venta'    };
  }
  return   { clave: 'descarte', filaClass: 'fila-descarte', badgeClass: 'badge-descarte', icono: '✖', label: 'Descarte' };
}

// ── Agrupar salidas de la heladera ────────────────────────────
// Las salidas de una carga de combo (mismo id_lote) van en UN renglón; las de un
// plato suelto, en un renglón por tanda (id_movimiento_vianda). Compras, ventas,
// descartes y combos viejos sin número de carga siguen de a uno.

// Número de carga de combo de la salida, o null si no tiene
function idLoteDe(m) {
  if (m.movimientos_viandas && m.movimientos_viandas.id_lote != null) return m.movimientos_viandas.id_lote;
  return null;
}

// Devuelve los renglones de pantalla, en el orden de los movimientos (más nuevo primero):
//   { esGrupo: false, mov }
//   { esGrupo: true, clave, idLote, fecha, usuario, total, insumos: [...], platos: [...] }
function agruparMovimientos(movimientos) {
  const renglones = [];
  const grupoPorClave = {};

  movimientos.forEach(m => {
    const clasif = clasificarMovimiento(m);
    const mv = m.movimientos_viandas;

    // ¿A qué grupo pertenece? Sin grupo → renglón suelto
    let claveGrupo = null;
    if (m.id_movimiento_vianda && mv) {
      if (idLoteDe(m) !== null) {
        claveGrupo = 'combo-' + idLoteDe(m);
      } else if (clasif.clave === 'produccion') {
        claveGrupo = 'tanda-' + m.id_movimiento_vianda;
      }
    }
    if (claveGrupo === null) {
      renglones.push({ esGrupo: false, mov: m });
      return;
    }

    let grupo = grupoPorClave[claveGrupo];
    if (!grupo) {
      let usuario = '-';
      if (mv.usuarios) usuario = [mv.usuarios.nombre, mv.usuarios.apellido].filter(Boolean).join(' ');
      grupo = {
        esGrupo:   true,
        claveGrupo,
        clave:     clasif.clave,   // 'combo' o 'produccion'
        clasif,
        idLote:    idLoteDe(m),
        fecha:     m.fecha,         // el primero que aparece es el más nuevo
        usuario,
        insumoPorClave: {},
        platoPorTanda:  {}
      };
      grupoPorClave[claveGrupo] = grupo;
      renglones.push(grupo);
    }

    // Insumo de esta salida
    let idInsumo = '';
    let nombreInsumo = '-';
    let unidad = m.unidad || '';
    if (m.insumos) {
      idInsumo = m.insumos.id;
      nombreInsumo = m.insumos.nombre || '-';
      if (!unidad) unidad = m.insumos.unidad_medida || '';
    }
    const claveInsumo = idInsumo + '|' + unidad;

    // Total del grupo: el insumo se suma entre todos los platos (por insumo y unidad)
    if (!grupo.insumoPorClave[claveInsumo]) {
      grupo.insumoPorClave[claveInsumo] = { nombre: nombreInsumo, unidad, total: 0 };
    }
    grupo.insumoPorClave[claveInsumo].total += Number(m.cantidad);

    // Plato: uno por tanda (id_movimiento_vianda). La cantidad de viandas se toma una sola vez,
    // porque cada insumo la repite. Cada plato junta sus propios insumos, para su tarjeta.
    if (!grupo.platoPorTanda[m.id_movimiento_vianda]) {
      let plato = '-';
      let plan = '';
      if (mv.productos) {
        plato = mv.productos.nombre || '-';
        if (mv.productos.planes) plan = mv.productos.planes.nombre || '';
      }
      grupo.platoPorTanda[m.id_movimiento_vianda] = {
        nombre: plato,
        plan,
        cantidad: Number(mv.cantidad),
        insumoPorClave: {}
      };
      // Motivo escrito al cargar (se guarda en movimientos_viandas). En un combo es el mismo para todos los platos.
      if (mv.motivo && !grupo.motivoEscrito) grupo.motivoEscrito = mv.motivo;
    }
    const platoActual = grupo.platoPorTanda[m.id_movimiento_vianda];
    if (!platoActual.insumoPorClave[claveInsumo]) {
      platoActual.insumoPorClave[claveInsumo] = { nombre: nombreInsumo, unidad, total: 0 };
    }
    platoActual.insumoPorClave[claveInsumo].total += Number(m.cantidad);
  });

  // Listas finales (ordenadas por nombre) y total de viandas de cada grupo
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  renglones.forEach(r => {
    if (!r.esGrupo) return;
    r.insumos = Object.values(r.insumoPorClave).sort(porNombre);
    r.platos  = Object.values(r.platoPorTanda).sort(porNombre);
    r.platos.forEach(p => { p.insumos = Object.values(p.insumoPorClave).sort(porNombre); });
    r.total   = r.platos.reduce((suma, p) => suma + p.cantidad, 0);
  });

  return renglones;
}

// Título del renglón agrupado: "Combo Mantenimiento #12", "Combo #12" si hay platos
// de más de un plan (o sin plan), o "Producción: 5 Pollo" para un plato suelto
function tituloGrupo(grupo) {
  if (grupo.clave === 'combo') {
    const planes = [...new Set(grupo.platos.map(p => p.plan))];
    let numero = '';
    if (grupo.idLote !== null) numero = ' #' + grupo.idLote;
    if (planes.length === 1 && planes[0]) return 'Combo ' + planes[0] + numero;
    return 'Combo' + numero;
  }
  const plato = grupo.platos[0];
  return 'Producción: ' + plato.cantidad + ' ' + plato.nombre;
}

// Fecha y hora local: "07/10/2026 14:30"
function formatearFechaMovimiento(texto) {
  if (!texto) return '-';
  return new Date(texto).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Render de tabla (paginada de a 15) ────────────────────────
function renderTabla(renglones) {
  crearPaginacion({
    datos:                renglones,
    porPagina:            15,
    contenedorTabla:      document.getElementById('tablaBody'),
    contenedorPaginacion: document.getElementById('paginacion'),
    funcionRenderFila:    crearFilaRenglon,
    filaVacia:            `<tr class="empty-row"><td colspan="7">No hay movimientos registrados todavía.</td></tr>`
  });
}

function crearFilaRenglon(renglon) {
  if (renglon.esGrupo) return crearFilaGrupo(renglon);
  return crearFilaMovimiento(renglon.mov);
}

// Cantidad de insumo con formato argentino y su unidad: "2.500 g"
function cantidadConUnidad(total, unidad) {
  const numero = Number(total).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  if (unidad) return numero + ' ' + unidad;
  return numero;
}

// ¿El insumo coincide con lo escrito en el filtro de insumo? (para resaltarlo)
function coincideConFiltro(nombre) {
  return Boolean(textoResaltado) && nombre.toLowerCase().includes(textoResaltado);
}

// Tarjeta de un plato: nombre y viandas arriba, y sus insumos uno por renglón
function htmlTarjetaPlato(plato) {
  let textoViandas = plato.cantidad + ' viandas';
  if (plato.cantidad === 1) textoViandas = '1 vianda';

  const insumos = plato.insumos.map(i => {
    let clase = '';
    if (coincideConFiltro(i.nombre)) clase = 'insumo-resaltado';
    return `
      <li class="${clase}">
        <span>${escHtml(i.nombre)}</span>
        <span class="cantidad-insumo">${escHtml(cantidadConUnidad(i.total, i.unidad))}</span>
      </li>`;
  }).join('');

  return `
    <div class="tarjeta-plato">
      <div class="tarjeta-plato-titulo">
        <strong>${escHtml(plato.nombre)}</strong>
        <span class="tarjeta-plato-viandas">· ${escHtml(textoViandas)}</span>
      </div>
      <ul class="tarjeta-plato-insumos">${insumos}</ul>
    </div>`;
}

// Franja "Total del combo": cada insumo sumado entre todos los platos, como etiquetas
function htmlTotalCombo(grupo) {
  const etiquetas = grupo.insumos.map(i => {
    let clase = 'etiqueta-insumo';
    if (coincideConFiltro(i.nombre)) clase += ' insumo-resaltado';
    return `<span class="${clase}">${escHtml(i.nombre)} <b>${escHtml(cantidadConUnidad(i.total, i.unidad))}</b></span>`;
  }).join('');

  return `
    <div class="total-combo">
      <span class="total-combo-titulo">Total del combo</span>
      <div class="total-combo-etiquetas">${etiquetas}</div>
    </div>`;
}

// Columna Motivo del renglón agrupado: "Producción de combo" o "Producción",
// más el motivo que se escribió al cargar, si hay
function motivoGrupo(grupo) {
  let texto = 'Producción';
  if (grupo.clave === 'combo') texto = 'Producción de combo';
  if (grupo.motivoEscrito) texto += ' · ' + grupo.motivoEscrito;
  return texto;
}

// Renglón agrupado (combo o plato suelto) + fila de detalle desplegable debajo.
// Devuelve un fragmento con las dos filas. Sin botón de borrar: las salidas de
// una tanda no se borran desde acá (el servidor también lo bloquea).
function crearFilaGrupo(grupo) {
  const { filaClass, badgeClass, icono, label } = grupo.clasif;
  const fragmento = document.createDocumentFragment();

  // Fila principal
  const tr = document.createElement('tr');
  tr.className = filaClass + ' fila-grupo';
  tr.innerHTML = `
    <td>${escHtml(formatearFechaMovimiento(grupo.fecha))}</td>
    <td><span class="flecha-grupo">▸</span> <strong>${escHtml(tituloGrupo(grupo))}</strong></td>
    <td><span class="badge ${badgeClass}">${icono} ${label}</span></td>
    <td>${Number(grupo.total).toLocaleString('es-AR')}</td>
    <td>viandas</td>
    <td style="color:var(--color-muted); font-size:0.83rem;">${escHtml(motivoGrupo(grupo))}</td>
    <td><button type="button" class="btn-detalles" aria-expanded="false">Detalles</button></td>
  `;

  // Fila de detalle: una tarjeta por plato, el total del combo (si hay más de un plato)
  // y al pie quién lo cargó y cuándo. El color del borde depende de si es combo o producción.
  const tarjetas = grupo.platos.map(htmlTarjetaPlato).join('');

  let total = '';
  if (grupo.clave === 'combo' && grupo.platos.length > 1) total = htmlTotalCombo(grupo);

  const pie = 'Cargado por ' + grupo.usuario + ' · ' + formatearFechaMovimiento(grupo.fecha);

  const trDetalle = document.createElement('tr');
  trDetalle.className = 'fila-detalle-grupo';
  trDetalle.innerHTML = `
    <td colspan="7">
      <div class="detalle-grupo detalle-${grupo.clave}">
        <div class="tarjetas-platos">${tarjetas}</div>
        ${total}
        <div class="pie-detalle">${escHtml(pie)}</div>
      </div>
    </td>
  `;

  // Abrir / cerrar en el lugar: la flechita gira y el botón pasa a "Ocultar".
  // Se recuerda cuáles quedaron abiertos para que no se cierren al cambiar de página o de filtro.
  const boton = tr.querySelector('.btn-detalles');
  const flecha = tr.querySelector('.flecha-grupo');

  function mostrarDetalle(abierto) {
    trDetalle.hidden = !abierto;
    boton.setAttribute('aria-expanded', String(abierto));
    if (abierto) {
      boton.textContent = 'Ocultar';
      flecha.classList.add('abierta');
      gruposAbiertos.add(grupo.claveGrupo);
    } else {
      boton.textContent = 'Detalles';
      flecha.classList.remove('abierta');
      gruposAbiertos.delete(grupo.claveGrupo);
    }
  }

  boton.addEventListener('click', () => mostrarDetalle(trDetalle.hidden));
  mostrarDetalle(gruposAbiertos.has(grupo.claveGrupo));

  fragmento.appendChild(tr);
  fragmento.appendChild(trDetalle);
  return fragmento;
}

function crearFilaMovimiento(m) {
  const { filaClass, badgeClass, icono, label } = clasificarMovimiento(m);

  const tr = document.createElement('tr');
  tr.className      = filaClass;
  tr.dataset.tipo   = m.tipo;
  tr.dataset.insumo = (m.insumos?.nombre || '').toLowerCase();
  tr.dataset.fecha  = m.fecha || '';

  const fecha = m.fecha
    ? new Date(m.fecha).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '-';

  const badgeLabel = `${icono} ${label}`;

  tr.innerHTML = `
    <td>${fecha}</td>
    <td><strong>${escHtml(m.insumos?.nombre || '-')}</strong></td>
    <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
    <td>${Number(m.cantidad).toLocaleString('es-AR')}</td>
    <td>${escHtml(m.unidad || m.insumos?.unidad_medida || '-')}</td>
    <td style="color:var(--color-muted); font-size:0.83rem;">${escHtml(m.motivo || '—')}</td>
    <td><button class="btn-eliminar">✕ Eliminar</button></td>
  `;
  // Sin onclick armado con texto: el nombre del insumo no se mete en el HTML
  tr.querySelector('.btn-eliminar').addEventListener('click', () => eliminarMovimiento(m.id, m.insumos?.nombre || '', m.tipo));
  return tr;
}

// ── Filtros ───────────────────────────────────────────────────
function aplicarFiltros() {
  const textoInsumo = document.getElementById('filtroInsumo').value.toLowerCase();
  const tipo        = document.getElementById('filtroTipo').value;
  const desde       = document.getElementById('filtroDesde').value;
  const hasta       = document.getElementById('filtroHasta').value;

  textoResaltado = textoInsumo;

  // Se filtran los renglones ya agrupados: así el detalle de un combo nunca queda incompleto
  const filtrados = renglonesPantalla.filter(r => {
    // Datos que necesita cada filtro, según sea un renglón agrupado o uno suelto
    let nombresInsumo;
    let tipoBase;
    let claveTipo;
    let fechaTexto;
    if (r.esGrupo) {
      nombresInsumo = r.insumos.map(i => i.nombre.toLowerCase());
      tipoBase      = 'salida';
      claveTipo     = r.clave;
      fechaTexto    = r.fecha;
    } else {
      nombresInsumo = [(r.mov.insumos?.nombre || '').toLowerCase()];
      tipoBase      = r.mov.tipo;
      claveTipo     = clasificarMovimiento(r.mov).clave;
      fechaTexto    = r.mov.fecha;
    }

    // Insumo: un grupo pasa si contiene alguno que coincida
    const nombreOk = !textoInsumo || nombresInsumo.some(n => n.includes(textoInsumo));

    // Tipo: "entrada" / "salida" comparan la columna de la base; el resto
    // (compra, venta, descarte, combo, produccion) compara la etiqueta de la pantalla
    let tipoOk = true;
    if (tipo === 'entrada' || tipo === 'salida') {
      tipoOk = tipoBase === tipo;
    } else if (tipo) {
      tipoOk = claveTipo === tipo;
    }

    let fechaMov = null;
    if (fechaTexto) fechaMov = new Date(fechaTexto);
    // "Desde" a medianoche LOCAL (new Date('YYYY-MM-DD') la toma como UTC: 21 h del día anterior)
    const desdeOk  = !desde || (fechaMov && fechaMov >= parseFechaLocal(desde));
    const hastaOk  = !hasta || (fechaMov && fechaMov <= new Date(hasta + 'T23:59:59'));
    return nombreOk && tipoOk && desdeOk && hastaOk;
  });

  renderTabla(filtrados);
}

// ── Modal ─────────────────────────────────────────────────────
function abrirModal(tipo) {
  tipoActual = tipo;
  const esEntrada = tipo === 'entrada';

  document.getElementById('modalTitulo').textContent  = esEntrada ? 'Registrar Entrada' : 'Registrar Salida';
  document.getElementById('notaSalida').style.display = esEntrada ? 'none' : 'block';

  // Campo de costo oculto en la interfaz (se mantiene la lógica/payload interna)
  document.getElementById('grupoCosto').style.display        = 'none';
  document.getElementById('inputCostoUnit').value            = '';
  document.getElementById('costoTotalDisplay').style.display = 'none';

  const btn = document.getElementById('btnConfirmar');
  btn.textContent = esEntrada ? 'Confirmar Entrada' : 'Confirmar Salida';
  btn.className   = `btn-confirmar ${tipo}`;

  document.getElementById('modalError').classList.remove('visible');
  document.getElementById('inputCantidad').value = '';

  // Actualiza y bloquea/desbloquea el selector de unidades según corresponda
  actualizarUnidadSegunInsumo();
  document.getElementById('inputMotivo').value   = '';
  setFechaActual();

  document.getElementById('modalMovimiento').classList.add('visible');
}

function actualizarCostoTotal() {
  const cantidad = parseFloat(document.getElementById('inputCantidad').value) || 0;
  const costo    = parseFloat(document.getElementById('inputCostoUnit').value) || 0;
  const display  = document.getElementById('costoTotalDisplay');
  if (costo > 0 && cantidad > 0) {
    display.textContent   = `Costo total: $${(cantidad * costo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    display.style.display = 'block';
  } else {
    display.style.display = 'none';
  }
}

function cerrarModal() {
  document.getElementById('modalMovimiento').classList.remove('visible');
}

function cerrarModalSiOverlay(e) {
  if (e.target === document.getElementById('modalMovimiento')) cerrarModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});

// ── Guardar movimiento ────────────────────────────────────────
async function guardarMovimiento() {
  const id_insumo = document.getElementById('selectInsumo').value;
  const cantidad  = document.getElementById('inputCantidad').value;
  const unidad    = document.getElementById('inputUnidad').value;
  const motivo    = document.getElementById('inputMotivo').value.trim();
  const fecha     = document.getElementById('inputFecha').value;
  const errorEl   = document.getElementById('modalError');

  errorEl.classList.remove('visible');

  if (!id_insumo) { mostrarError('Seleccioná un insumo.'); return; }
  if (!cantidad || Number(cantidad) <= 0) { mostrarError('Ingresá una cantidad válida mayor a 0.'); return; }

  const btn = document.getElementById('btnConfirmar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  const costoUnit = tipoActual === 'entrada'
    ? parseFloat(document.getElementById('inputCostoUnit').value) || null
    : null;

  try {
    const res = await apiFetch(`/api/movimientos-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_insumo:     Number(id_insumo),
        tipo:          tipoActual,
        cantidad:      Number(cantidad),
        unidad:        unidad,
        motivo:        motivo || null,
        fecha:         fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        costo_unitario: costoUnit
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarError(data.error || 'Error al guardar el movimiento.');
      return;
    }

    cerrarModal();
    // Refrescar insumos (para que el dropdown tenga stock actualizado)
    await cargarInsumos();
    await cargarMovimientos();

  } catch (e) {
    mostrarError('No se pudo conectar con el servidor.');
  } finally {
    btn.disabled    = false;
    btn.textContent = tipoActual === 'entrada' ? 'Confirmar Entrada' : 'Confirmar Salida';
  }
}

function mostrarError(msg) {
  const el = document.getElementById('modalError');
  el.textContent = msg;
  el.classList.add('visible');
}

// ── Eliminar movimiento ───────────────────────────────────────
async function eliminarMovimiento(id, nombreInsumo, tipo) {
  const tipoLabel = tipo === 'entrada' ? 'entrada' : 'salida';
  const confirmar = confirm(
    `¿Eliminar este registro de ${tipoLabel} de "${nombreInsumo}"?\n\nEsto revertirá el efecto sobre el stock del insumo.`
  );
  if (!confirmar) return;

  try {
    const res = await apiFetch(`/api/movimientos-stock/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el movimiento.');
      return;
    }

    await cargarInsumos();
    await cargarMovimientos();
  } catch (e) {
    alert('No se pudo conectar con el servidor.');
  }
}
