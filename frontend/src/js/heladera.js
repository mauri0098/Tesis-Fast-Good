// ============================================================================
// heladera.js — Stock de viandas terminadas en heladera
// Lista los platos con cuántas viandas hay, permite cargar un combo (un plan
// repartido entre sus platos) o un solo plato (descuenta insumos y suma viandas),
// descartar viandas, y muestra los últimos movimientos en un panel al costado.
// Todo lo que viene de la base se escapa con escHtml (escape.js) antes de mostrarlo.
// ============================================================================

let todosPlatos = [];       // platos activos con su stock_heladera, plan y si tienen receta
let calculoVigente = null;  // { idProducto, cantidad } del último cálculo de un plato que alcanzó
let platoDescarte = null;   // plato que se está descartando
let platosCombo = [];       // platos del plan elegido en el combo: [{ plato, cantidad }]
let calculoComboVigente = null; // items [{ id_producto, cantidad }] del último cálculo de combo que alcanzó
let cantidadesPedido = {};  // pedir a cocina: id_producto → lo escrito en "A pedir" (sobrevive a los filtros)
let filtroEstado = 'todos'; // filtro de la tabla: 'todos', 'sin', 'bajo', 'bien' o 'sincontrol'

const INTERVALO_ACTUALIZACION = 60000; // cada 60 segundos se vuelven a pedir stock y pendientes

document.addEventListener('DOMContentLoaded', () => {
  fetchPlatos();
  fetchHistorial();
  fetchPendientes();
  iniciarFiltro();
  iniciarModalTanda();
  iniciarModalCombo();
  iniciarModalPedido();
  mostrarBotonPedir();
  iniciarActualizacionAutomatica();
});

// ==========================================
// ESTADO DEL STOCK DE UN PLATO
// Única regla de la pantalla (la usan tabla, filtros, aviso y ventana de pedir):
//   mínimo 0              → 'sincontrol' (no se controla, nunca falta)
//   0 viandas             → 'sin'   (Sin stock)
//   menos que el mínimo   → 'bajo'
//   el mínimo o más       → 'bien'
// ==========================================

const ESTADOS_STOCK = {
  sin:        { texto: 'Sin stock',   clase: 'estado-sin',  orden: 0 },
  bajo:       { texto: 'Bajo',        clase: 'estado-bajo', orden: 1 },
  bien:       { texto: 'Bien',        clase: 'estado-bien', orden: 2 },
  sincontrol: { texto: 'Sin control', clase: '',            orden: 3 }
};

function estadoStock(plato) {
  const minimo = Number(plato.stock_minimo);
  const stock = Number(plato.stock_heladera);
  if (minimo === 0) return 'sincontrol';
  if (stock <= 0) return 'sin';
  if (stock < minimo) return 'bajo';
  return 'bien';
}

// "Los que faltan": los Sin stock más los Bajos
function faltaPlato(plato) {
  const estado = estadoStock(plato);
  return estado === 'sin' || estado === 'bajo';
}

// Etiqueta de color del estado. "Sin control" es un guion gris, no una etiqueta.
function etiquetaEstado(plato) {
  const estado = estadoStock(plato);
  if (estado === 'sincontrol') return '<span class="estado-sincontrol">— Sin control</span>';
  const datos = ESTADOS_STOCK[estado];
  return `<span class="etiqueta-estado ${datos.clase}">${datos.texto}</span>`;
}

// Cuántos platos hay en cada estado
function contarEstados() {
  const cuenta = { sin: 0, bajo: 0, bien: 0, sincontrol: 0 };
  todosPlatos.forEach(p => { cuenta[estadoStock(p)] += 1; });
  return cuenta;
}

// Orden por estado (Sin stock, Bajo, Bien, Sin control). 0 si los dos están en el mismo estado.
function compararEstado(a, b) {
  return ESTADOS_STOCK[estadoStock(a)].orden - ESTADOS_STOCK[estadoStock(b)].orden;
}

// "1 plato" / "3 platos"
function conPlural(cantidad, singular, plural) {
  if (cantidad === 1) return cantidad + ' ' + singular;
  return cantidad + ' ' + plural;
}

// ==========================================
// TRAER DATOS DEL SERVIDOR
// ==========================================

// mantenerPagina: true en la recarga automática, para no volver a la página 1
async function fetchPlatos(mantenerPagina) {
  const tbody = document.getElementById('heladeraBody');

  try {
    const res = await apiFetch('/api/viandas-stock');
    if (!res.ok) throw new Error();
    todosPlatos = await res.json();
    aplicarFiltro(mantenerPagina);
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

async function fetchHistorial() {
  const lista = document.getElementById('listaMovimientos');

  try {
    const res = await apiFetch('/api/movimientos-viandas');
    if (!res.ok) throw new Error();
    const movimientos = await res.json();
    renderizarHistorial(movimientos);
  } catch {
    lista.innerHTML = '<li class="mov-vacio" style="color:red;">Error al cargar los movimientos</li>';
  }
}

// ¿Hay alguna ventana abierta? Mientras haya una, la pantalla no se recarga sola
function hayVentanaAbierta() {
  return [...document.querySelectorAll('.modal')].some(m => m.style.display === 'block');
}

function iniciarActualizacionAutomatica() {
  setInterval(() => {
    if (hayVentanaAbierta()) return;
    fetchPlatos(true);
    fetchPendientes();
  }, INTERVALO_ACTUALIZACION);
}

// ==========================================
// TABLA DE PLATOS (paginada de a 15)
// ==========================================

let paginacionPlatos = null; // lo que devuelve crearPaginacion: sirve para saber en qué página está

function renderizarPlatos(platos, mantenerPagina) {
  let pagina = 1;
  if (mantenerPagina && paginacionPlatos) pagina = paginacionPlatos.paginaActual();

  paginacionPlatos = crearPaginacion({
    datos: platos,
    porPagina: 15,
    contenedorTabla: document.getElementById('heladeraBody'),
    contenedorPaginacion: document.getElementById('paginacion'),
    funcionRenderFila: crearFilaPlato,
    filaVacia: '<tr><td colspan="6" class="loading-text">No se encontraron platos</td></tr>',
    paginaInicial: pagina
  });
}

function crearFilaPlato(plato) {
  const tr = document.createElement('tr');

  let plan = '-';
  if (plato.plan_nombre) plan = plato.plan_nombre;

  // Sin viandas no se puede descartar
  let deshabilitado = '';
  if (plato.stock_heladera <= 0) deshabilitado = 'disabled';

  tr.innerHTML = `
    <td><strong>${escHtml(plato.nombre)}</strong></td>
    <td>${escHtml(plan)}</td>
    <td class="celda-stock">${Number(plato.stock_heladera)}</td>
    <td>${Number(plato.stock_minimo)}</td>
    <td>${etiquetaEstado(plato)}</td>
    <td class="td-acciones">
      <div class="acciones-grupo">
        <button class="btn-borrar" onclick="abrirModalDescarte(${Number(plato.id)})" ${deshabilitado}>✖ Descartar</button>
      </div>
    </td>
  `;

  return tr;
}

// ==========================================
// FILTRO POR NOMBRE
// ==========================================

// Buscador + filtro de estado, ordenado por estado y nombre.
// También actualiza los botones de filtro y la franja de faltantes (cambian con cada recarga).
function aplicarFiltro(mantenerPagina) {
  const cuenta = contarEstados();
  renderizarFiltrosEstado(cuenta);
  actualizarAvisoFaltantes(cuenta);

  const texto = document.getElementById('filtroNombre').value.toLowerCase();
  const filtrados = todosPlatos
    .filter(p => (p.nombre || '').toLowerCase().includes(texto))
    .filter(p => filtroEstado === 'todos' || estadoStock(p) === filtroEstado)
    .sort((a, b) => compararEstado(a, b) || (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  renderizarPlatos(filtrados, mantenerPagina);
}

// Botones "Todos (20)", "Sin stock (2)", "Bajos (3)", "Bien (15)" y, si hay, "Sin control (N)"
function renderizarFiltrosEstado(cuenta) {
  const opciones = [
    { valor: 'todos', texto: 'Todos',     cantidad: todosPlatos.length },
    { valor: 'sin',   texto: 'Sin stock', cantidad: cuenta.sin },
    { valor: 'bajo',  texto: 'Bajos',     cantidad: cuenta.bajo },
    { valor: 'bien',  texto: 'Bien',      cantidad: cuenta.bien }
  ];
  if (cuenta.sincontrol > 0) {
    opciones.push({ valor: 'sincontrol', texto: 'Sin control', cantidad: cuenta.sincontrol });
  }

  // Si el filtro elegido ya no existe (no quedan "Sin control"), vuelve a Todos
  if (!opciones.some(o => o.valor === filtroEstado)) filtroEstado = 'todos';

  const contenedor = document.getElementById('filtrosEstado');
  contenedor.innerHTML = '';
  opciones.forEach(opcion => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-filtro-estado';
    boton.classList.toggle('activo', opcion.valor === filtroEstado);
    boton.textContent = opcion.texto + ' (' + opcion.cantidad + ')';
    boton.addEventListener('click', () => {
      filtroEstado = opcion.valor;
      aplicarFiltro();
    });
    contenedor.appendChild(boton);
  });
}

// Franja "Te faltan 5 platos: 2 sin stock y 3 bajos". Solo para quien puede pedir y solo si falta algo.
function actualizarAvisoFaltantes(cuenta) {
  const aviso = document.getElementById('avisoFaltantes');
  const faltan = cuenta.sin + cuenta.bajo;

  if (!puedePedir() || faltan === 0) {
    aviso.style.display = 'none';
    return;
  }

  const partes = [];
  if (cuenta.sin > 0) partes.push(cuenta.sin + ' sin stock');
  if (cuenta.bajo > 0) partes.push(conPlural(cuenta.bajo, 'bajo', 'bajos'));

  document.getElementById('avisoTexto').textContent =
    'Te faltan ' + conPlural(faltan, 'plato', 'platos') + ': ' + partes.join(' y ');
  aviso.style.display = '';
}

function iniciarFiltro() {
  document.getElementById('filtroNombre').addEventListener('input', aplicarFiltro);
}

// ==========================================
// PANEL "ÚLTIMOS MOVIMIENTOS"
// Un renglón por movimiento: cantidad con signo, plato, y debajo tipo · fecha · usuario.
// El motivo, si hay, va en letra chica abajo de todo.
// ==========================================

const NOMBRES_TIPO = {
  produccion: 'Producción',
  venta:      'Venta',
  devolucion: 'Devolución',
  descarte:   'Descarte',
  ajuste:     'Ajuste'
};

// Timestamp de la base (UTC) → "07/10 14:30" en hora local
function fechaCorta(texto) {
  const fecha = fechaDeTimestamp(texto);
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mi = String(fecha.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

let combosAbiertos = new Set(); // id_lote de los combos con el detalle desplegado

// Los movimientos de una misma carga de combo (mismo id_lote) se juntan en un solo
// renglón, ubicado donde aparece el más nuevo. El resto queda de a uno.
// Devuelve [{ esCombo: false, mov }] o [{ esCombo: true, idLote, fecha, usuario, total, planes, platos }].
function agruparMovimientos(movimientos) {
  const renglones = [];
  const comboPorLote = {};

  movimientos.forEach(m => {
    if (m.id_lote == null) {
      renglones.push({ esCombo: false, mov: m });
      return;
    }

    let combo = comboPorLote[m.id_lote];
    if (!combo) {
      combo = {
        esCombo: true,
        idLote:  m.id_lote,
        fecha:   m.fecha,
        usuario: m.usuario_nombre,
        total:   0,
        planes:  new Set(),
        platos:  []
      };
      comboPorLote[m.id_lote] = combo;
      renglones.push(combo);
    }
    combo.total += Number(m.cantidad);
    combo.planes.add(m.plan_nombre || '');
    combo.platos.push({ nombre: m.plato_nombre, cantidad: Number(m.cantidad) });
  });

  return renglones;
}

// "Combo Mantenimiento #12", o "Combo #12" si los platos son de más de un plan (o no tienen plan)
function nombreCombo(planes, idLote) {
  const lista = [...planes];
  if (lista.length === 1 && lista[0]) return 'Combo ' + lista[0] + ' #' + idLote;
  return 'Combo #' + idLote;
}

// Cantidad con signo y su clase de color: positiva = entrada (verde), negativa = salida (rojo)
function cantidadConSigno(cantidad) {
  if (cantidad > 0) return { texto: '+' + cantidad, clase: 'entrada' };
  return { texto: String(cantidad), clase: 'salida' };
}

function renderizarHistorial(movimientos) {
  const lista = document.getElementById('listaMovimientos');

  if (!movimientos || movimientos.length === 0) {
    lista.innerHTML = '<li class="mov-vacio">Todavía no hay movimientos</li>';
    return;
  }

  lista.innerHTML = '';
  agruparMovimientos(movimientos).forEach(renglon => {
    if (renglon.esCombo) {
      lista.appendChild(crearRenglonCombo(renglon));
    } else {
      lista.appendChild(crearRenglonMovimiento(renglon.mov));
    }
  });
}

// Renglón agrupado de un combo: total, nombre, fecha · usuario y "Detalles",
// que despliega debajo los platos con su cantidad
function crearRenglonCombo(combo) {
  const li = document.createElement('li');
  li.className = 'mov-item mov-grupo';

  const cantidad = cantidadConSigno(combo.total);

  let fecha = '-';
  if (combo.fecha) fecha = fechaCorta(combo.fecha);
  const detalle = fecha + ' · ' + combo.usuario;

  const platos = combo.platos
    .slice()
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
    .map(p => {
      const cant = cantidadConSigno(p.cantidad);
      return `<li><span>${escHtml(p.nombre)}</span><span class="mov-cantidad ${cant.clase}">${escHtml(cant.texto)}</span></li>`;
    })
    .join('');

  li.innerHTML = `
    <div class="mov-linea">
      <span class="mov-cantidad ${cantidad.clase}">${escHtml(cantidad.texto)}</span>
      <span class="mov-plato"><span class="mov-flecha">▸</span> ${escHtml(nombreCombo(combo.planes, combo.idLote))}</span>
      <button type="button" class="btn-detalles" aria-expanded="false">Detalles</button>
    </div>
    <div class="mov-detalle">${escHtml(detalle)}</div>
    <ul class="mov-subdetalle" hidden>${platos}</ul>
  `;

  // Abrir / cerrar el detalle en el lugar. Se recuerda cuáles quedaron abiertos
  // para que no se cierren al recargar la lista después de una carga.
  const boton = li.querySelector('.btn-detalles');
  const sub = li.querySelector('.mov-subdetalle');
  const flecha = li.querySelector('.mov-flecha');

  function mostrarDetalle(abierto) {
    sub.hidden = !abierto;
    boton.setAttribute('aria-expanded', String(abierto));
    if (abierto) {
      flecha.textContent = '▾';
      combosAbiertos.add(combo.idLote);
    } else {
      flecha.textContent = '▸';
      combosAbiertos.delete(combo.idLote);
    }
  }

  boton.addEventListener('click', () => mostrarDetalle(sub.hidden));
  mostrarDetalle(combosAbiertos.has(combo.idLote));

  return li;
}

// Renglón de un movimiento suelto (plato suelto, descarte, datos viejos)
function crearRenglonMovimiento(m) {
  const li = document.createElement('li');
  li.className = 'mov-item';

  // Positivo = entraron viandas (verde con "+"), negativo = salieron (rojo)
  const cantidad = cantidadConSigno(Number(m.cantidad));

  let tipo = m.tipo;
  if (NOMBRES_TIPO[m.tipo]) tipo = NOMBRES_TIPO[m.tipo];

  let fecha = '-';
  if (m.fecha) fecha = fechaCorta(m.fecha);

  const detalle = tipo + ' · ' + fecha + ' · ' + m.usuario_nombre;

  let htmlMotivo = '';
  if (m.motivo) htmlMotivo = `<div class="mov-motivo">${escHtml(m.motivo)}</div>`;

  li.innerHTML = `
    <div class="mov-linea">
      <span class="mov-cantidad ${cantidad.clase}">${escHtml(cantidad.texto)}</span>
      <span class="mov-plato">${escHtml(m.plato_nombre)}</span>
    </div>
    <div class="mov-detalle">${escHtml(detalle)}</div>
    ${htmlMotivo}
  `;
  return li;
}

// ==========================================
// MODAL CARGAR TANDA
// Primero se calcula (GET .../calculo) y recién si alcanza se habilita "Confirmar".
// Si se cambia el plato o la cantidad, el cálculo deja de valer y hay que recalcular.
// ==========================================

function iniciarModalTanda() {
  document.getElementById('tPlato').addEventListener('change', invalidarCalculo);
  document.getElementById('tCantidad').addEventListener('input', invalidarCalculo);
}

function invalidarCalculo() {
  calculoVigente = null;
  document.getElementById('tConfirmar').disabled = true;
  document.getElementById('tCalculo').innerHTML = '';
  document.getElementById('tError').style.display = 'none';
}

function abrirModalTanda() {
  // Cargar los platos en el select (textContent: el nombre no se interpreta como HTML)
  const select = document.getElementById('tPlato');
  select.innerHTML = '<option value="">Seleccione un plato...</option>';
  todosPlatos.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    let texto = p.nombre;
    if (p.codigo_plato) texto = p.codigo_plato + ' — ' + p.nombre;
    option.textContent = texto;
    select.appendChild(option);
  });

  document.getElementById('tCantidad').value = '';
  document.getElementById('tMotivo').value = '';
  invalidarCalculo();

  document.getElementById('modalTanda').style.display = 'block';
}

function cerrarModalTanda() {
  document.getElementById('modalTanda').style.display = 'none';
}

// Cantidad del input como entero mayor a 0, o null si no es válida
function leerCantidad(idInput) {
  const valor = document.getElementById(idInput).value.trim();
  const cantidad = Number(valor);
  if (valor === '' || !Number.isInteger(cantidad) || cantidad <= 0) return null;
  return cantidad;
}

// Número con hasta 2 decimales, formato argentino (ej: 1.250,5)
function formatearNumero(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function mostrarErrorModal(idError, mensaje) {
  const errEl = document.getElementById(idError);
  errEl.textContent = mensaje;
  errEl.style.display = 'block';
}

async function calcularTanda() {
  invalidarCalculo();

  const idProducto = Number(document.getElementById('tPlato').value);
  const cantidad = leerCantidad('tCantidad');

  if (!idProducto) {
    mostrarErrorModal('tError', 'Elegí un plato.');
    return;
  }
  if (cantidad === null) {
    mostrarErrorModal('tError', 'La cantidad tiene que ser un número entero mayor a 0.');
    return;
  }

  try {
    const res = await apiFetch(`/api/viandas-stock/${idProducto}/calculo?cantidad=${cantidad}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarErrorModal('tError', data.error || 'No se pudo calcular la tanda.');
      return;
    }

    // Plato sin receta: no hay nada que mostrar
    if (data.error) {
      mostrarErrorModal('tError', data.error);
      return;
    }

    renderizarCalculo(data, 'tCalculo');

    // Solo si alcanza todo, y el cálculo corresponde a lo que está elegido ahora
    if (data.alcanza) {
      calculoVigente = { idProducto, cantidad };
      document.getElementById('tConfirmar').disabled = false;
    }
  } catch {
    mostrarErrorModal('tError', 'No se pudo conectar con el servidor.');
  }
}

// Tabla de insumos (necesario / disponible / estado) dentro del contenedor indicado.
// La usan los dos modales: tanda de un plato (tCalculo) y combo (cCalculo).
function renderizarCalculo(data, idContenedor) {
  const filas = data.insumos.map(i => {
    let unidad = '';
    if (i.unidad_medida) unidad = ' ' + i.unidad_medida;

    let estado = '✔ Alcanza';
    let clase = '';
    if (!i.alcanza) {
      estado = '✖ Faltan ' + formatearNumero(i.necesario - i.disponible) + unidad;
      clase = 'no-alcanza';
    }

    return `
      <tr class="${clase}">
        <td>${escHtml(i.nombre)}</td>
        <td>${escHtml(formatearNumero(i.necesario) + unidad)}</td>
        <td>${escHtml(formatearNumero(i.disponible) + unidad)}</td>
        <td>${escHtml(estado)}</td>
      </tr>
    `;
  }).join('');

  let resumen = '<div class="calculo-resumen ok">Alcanzan todos los insumos. Podés confirmar la tanda.</div>';
  if (!data.alcanza) {
    resumen = '<div class="calculo-resumen falta">No alcanzan los insumos: la tanda no se puede cargar.</div>';
  }

  document.getElementById(idContenedor).innerHTML = `
    <table>
      <thead>
        <tr><th>Insumo</th><th>Necesario</th><th>Disponible</th><th>Estado</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    ${resumen}
  `;
}

async function confirmarTanda() {
  if (!calculoVigente) return;

  const btn = document.getElementById('tConfirmar');
  btn.disabled = true; // evita doble click mientras se guarda

  try {
    const res = await apiFetch('/api/viandas-stock/tanda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_producto: calculoVigente.idProducto,
        cantidad:    calculoVigente.cantidad,
        motivo:      document.getElementById('tMotivo').value.trim()
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 409 con faltantes: el stock cambió entre el cálculo y la confirmación
      let mensaje = data.error || 'No se pudo registrar la tanda.';
      if (data.faltantes && data.faltantes.length > 0) {
        const detalle = data.faltantes
          .map(f => f.nombre + ' (faltan ' + formatearNumero(f.falta) + ')')
          .join(', ');
        mensaje = mensaje + ': ' + detalle + '. Volvé a calcular.';
      }
      mostrarErrorModal('tError', mensaje);
      calculoVigente = null;
      return;
    }

    cerrarModalTanda();
    mostrarToast('Tanda registrada. En stock: ' + data.stock_heladera + ' viandas.', 'exito');
    await Promise.all([fetchPlatos(), fetchHistorial()]);
  } catch {
    mostrarErrorModal('tError', 'No se pudo conectar con el servidor.');
    btn.disabled = false;
  }
}

// ==========================================
// MODAL CARGAR COMBO
// Se elige un plan y una cantidad total; se reparte en partes iguales entre los
// platos del plan que tienen receta (el sobrante, de a uno a los primeros).
// Cada plato se puede editar. Hay que calcular antes de confirmar, y cualquier
// cambio (plan, cantidad o un plato) obliga a recalcular.
// ==========================================

function iniciarModalCombo() {
  document.getElementById('cPlan').addEventListener('change', alCambiarPlanCombo);
  document.getElementById('cCantidad').addEventListener('input', alCambiarCantidadCombo);
}

// Orden de los platos para el reparto: por código en orden natural (PL2 antes que PL10);
// los que no tienen código van al final, por nombre
function compararPlatos(a, b) {
  if (a.codigo_plato && b.codigo_plato) {
    return a.codigo_plato.localeCompare(b.codigo_plato, 'es', { numeric: true, sensitivity: 'base' });
  }
  if (a.codigo_plato) return -1;
  if (b.codigo_plato) return 1;
  return (a.nombre || '').localeCompare(b.nombre || '', 'es');
}

// Planes activos que tienen platos activos (salen de GET /api/viandas-stock), ordenados por nombre
function planesDelCombo() {
  const porId = {};
  todosPlatos.forEach(p => {
    if (p.id_plan && p.plan_activo && !porId[p.id_plan]) {
      let nombre = 'Plan ' + p.id_plan;
      if (p.plan_nombre) nombre = p.plan_nombre;
      porId[p.id_plan] = { id: p.id_plan, nombre };
    }
  });
  return Object.values(porId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function abrirModalCombo() {
  // Cargar los planes en el select (textContent: el nombre no se interpreta como HTML)
  const select = document.getElementById('cPlan');
  select.innerHTML = '<option value="">Seleccione un plan...</option>';
  planesDelCombo().forEach(plan => {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = plan.nombre;
    select.appendChild(option);
  });

  document.getElementById('cCantidad').value = '';
  document.getElementById('cMotivo').value = '';
  platosCombo = [];
  renderizarPlatosCombo();
  actualizarContadorCombo();

  document.getElementById('modalCombo').style.display = 'block';
}

function cerrarModalCombo() {
  document.getElementById('modalCombo').style.display = 'none';
}

// Botones rápidos 10 / 20 / 30: completan el casillero y reparten
function elegirCantidadRapida(cantidad) {
  document.getElementById('cCantidad').value = cantidad;
  alCambiarCantidadCombo();
}

function invalidarCalculoCombo() {
  calculoComboVigente = null;
  document.getElementById('cConfirmar').disabled = true;
  document.getElementById('cCalculo').innerHTML = '';
  document.getElementById('cError').style.display = 'none';
}

// Al cambiar de plan: se arma la lista con los platos de ese plan y se reparte
function alCambiarPlanCombo() {
  const idPlan = Number(document.getElementById('cPlan').value);

  platosCombo = todosPlatos
    .filter(p => idPlan && p.id_plan === idPlan)
    .sort(compararPlatos)
    .map(plato => ({ plato, cantidad: 0 }));

  repartirCombo();
}

// Al cambiar la cantidad total: se vuelve a repartir desde cero
function alCambiarCantidadCombo() {
  repartirCombo();
}

// Reparto en partes iguales entre los platos con receta. El sobrante va de a uno
// a los primeros. Ej.: 10 viandas en 6 platos → 2, 2, 2, 2, 1, 1.
// Los platos sin receta quedan en 0 y no entran en el reparto.
function repartirCombo() {
  const total = leerCantidad('cCantidad');
  const conReceta = platosCombo.filter(pc => pc.plato.tiene_receta);

  platosCombo.forEach(pc => { pc.cantidad = 0; });

  if (total !== null && conReceta.length > 0) {
    const base = Math.floor(total / conReceta.length);
    const sobrante = total % conReceta.length;
    conReceta.forEach((pc, indice) => {
      pc.cantidad = base;
      if (indice < sobrante) pc.cantidad = base + 1;
    });
  }

  renderizarPlatosCombo();
  actualizarContadorCombo();
}

// Lista de platos del plan, cada uno con su casillero editable
function renderizarPlatosCombo() {
  const contenedor = document.getElementById('cPlatos');
  contenedor.innerHTML = '';

  platosCombo.forEach(pc => {
    const fila = document.createElement('div');
    fila.className = 'plato-combo';

    let texto = pc.plato.nombre;
    if (pc.plato.codigo_plato) texto = pc.plato.codigo_plato + ' — ' + pc.plato.nombre;

    let etiqueta = '';
    if (!pc.plato.tiene_receta) {
      fila.classList.add('sin-receta');
      etiqueta = '<span class="etiqueta-sin-receta">sin receta</span>';
    }

    fila.innerHTML = `
      <span>${escHtml(texto)}${etiqueta}</span>
      <input type="number" min="0" step="1">
    `;

    // El casillero se arma por DOM: el valor es un número y el plato sin receta queda deshabilitado
    const input = fila.querySelector('input');
    input.value = pc.cantidad;
    if (!pc.plato.tiene_receta) {
      input.disabled = true;
    } else {
      input.addEventListener('input', () => {
        const valor = input.value.trim();
        const cantidad = Number(valor);
        if (valor === '' || !Number.isInteger(cantidad) || cantidad < 0) {
          pc.cantidad = null; // inválido: el contador lo marca y no deja calcular
        } else {
          pc.cantidad = cantidad;
        }
        actualizarContadorCombo();
      });
    }

    contenedor.appendChild(fila);
  });
}

// "Repartidas X de Y". Si no coincide (o hay un casillero inválido) se marca en rojo
// y no se puede calcular. Cualquier cambio invalida el cálculo anterior.
function actualizarContadorCombo() {
  invalidarCalculoCombo();

  const contador = document.getElementById('cContador');
  const btnCalcular = document.getElementById('cCalcular');
  const total = leerCantidad('cCantidad');
  const conReceta = platosCombo.filter(pc => pc.plato.tiene_receta);

  btnCalcular.disabled = true;
  contador.classList.add('no-coincide');

  if (!document.getElementById('cPlan').value) {
    contador.textContent = '';
    return;
  }
  if (conReceta.length === 0) {
    contador.textContent = 'Este plan no tiene platos con receta cargada.';
    return;
  }
  if (total === null) {
    contador.textContent = 'Elegí la cantidad de viandas.';
    return;
  }
  if (conReceta.some(pc => pc.cantidad === null)) {
    contador.textContent = 'Hay una cantidad inválida: tiene que ser un número entero mayor o igual a 0.';
    return;
  }

  const repartidas = conReceta.reduce((suma, pc) => suma + pc.cantidad, 0);
  if (repartidas !== total) {
    contador.textContent = `Repartidas ${repartidas} de ${total}: la suma de los platos tiene que dar ${total}.`;
    return;
  }

  contador.textContent = `Repartidas ${repartidas} de ${total}`;
  contador.classList.remove('no-coincide');
  btnCalcular.disabled = false;
}

// Platos del combo con cantidad mayor a 0, en el formato que espera el servidor
function itemsDelCombo() {
  return platosCombo
    .filter(pc => pc.plato.tiene_receta && pc.cantidad > 0)
    .map(pc => ({ id_producto: pc.plato.id, cantidad: pc.cantidad }));
}

async function calcularCombo() {
  invalidarCalculoCombo();

  const items = itemsDelCombo();
  if (items.length === 0) {
    mostrarErrorModal('cError', 'Cargá al menos un plato con cantidad mayor a 0.');
    return;
  }

  try {
    const res = await apiFetch('/api/viandas-stock/calculo-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarErrorModal('cError', data.error || 'No se pudo calcular el combo.');
      return;
    }

    renderizarCalculo(data, 'cCalculo');

    // Plato inactivo o sin receta: se muestra el motivo aunque los insumos alcancen
    if (data.error) {
      mostrarErrorModal('cError', data.error);
      return;
    }

    // Se guarda exactamente lo que se calculó: eso es lo que se confirma
    if (data.alcanza) {
      calculoComboVigente = items;
      document.getElementById('cConfirmar').disabled = false;
    }
  } catch {
    mostrarErrorModal('cError', 'No se pudo conectar con el servidor.');
  }
}

async function confirmarCombo() {
  if (!calculoComboVigente) return;

  const btn = document.getElementById('cConfirmar');
  btn.disabled = true; // evita doble click mientras se guarda

  try {
    const res = await apiFetch('/api/viandas-stock/tanda-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items:  calculoComboVigente,
        motivo: document.getElementById('cMotivo').value.trim()
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 409: no se cargó ningún plato. Se dice cuál falló y qué insumos le faltan.
      let mensaje = data.error || 'No se pudo registrar el combo.';
      if (data.plato) mensaje = data.plato + ': ' + mensaje;
      if (data.faltantes && data.faltantes.length > 0) {
        const detalle = data.faltantes
          .map(f => f.nombre + ' (faltan ' + formatearNumero(f.falta) + ')')
          .join(', ');
        mensaje = mensaje + ': ' + detalle;
      }
      mostrarErrorModal('cError', mensaje + '. No se cargó ningún plato. Volvé a calcular.');
      calculoComboVigente = null;
      return;
    }

    cerrarModalCombo();
    mostrarToast('Combo registrado: ' + data.total + ' viandas cargadas en stock.', 'exito');
    await Promise.all([fetchPlatos(), fetchHistorial()]);
  } catch {
    mostrarErrorModal('cError', 'No se pudo conectar con el servidor.');
    btn.disabled = false;
  }
}

// ==========================================
// PENDIENTES DE COCINA
// Lo pedido a cocina que todavía no está hecho, agrupado por cocinero.
// ==========================================

async function fetchPendientes() {
  const contenedor = document.getElementById('listaPendientes');
  const boton = document.getElementById('btnPendientes');

  try {
    const res = await apiFetch('/api/ordenes-produccion/pendientes');
    if (!res.ok) throw new Error();
    const pendientes = await res.json();
    // N = cantidad de platos pendientes (el servidor manda un renglón por plato de cada pedido)
    boton.textContent = 'Pendientes de cocina (' + pendientes.length + ')';
    renderizarPendientes(pendientes);
  } catch {
    boton.textContent = 'Pendientes de cocina';
    contenedor.innerHTML = '<p class="mov-vacio" style="color:red;">Error al cargar los pendientes de cocina</p>';
  }
}

// "2026-10-08" → "08/10"
function diaMes(texto) {
  const fecha = parseFechaLocal(texto);
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// Urgencia de una fecha "AAAA-MM-DD" comparada con hoy (fecha de la computadora):
// 'atrasado' si ya pasó, 'hoy' si es hoy, '' si es más adelante
function urgenciaFecha(fechaPara) {
  const hoy = fechaLocalISO(new Date());
  if (fechaPara < hoy) return 'atrasado';
  if (fechaPara === hoy) return 'hoy';
  return '';
}

function renderizarPendientes(pendientes) {
  const contenedor = document.getElementById('listaPendientes');

  if (!pendientes || pendientes.length === 0) {
    contenedor.innerHTML = '<p class="mov-vacio">No hay nada pendiente en cocina.</p>';
    return;
  }

  // Una tarjeta por cocinero (agrupado por id). El servidor manda todo ordenado por fecha y
  // número de pedido, así que las tarjetas quedan en orden de urgencia (la primera es la que
  // tiene lo más urgente) y adentro de cada una también. Sin cocinero: tarjeta aparte, al final.
  const tarjetas = [];
  const tarjetaPorId = {};
  const sinCocinero = { nombre: 'Sin cocinero asignado', sinAsignar: true, platos: [] };
  let totalViandas = 0;

  pendientes.forEach(d => {
    totalViandas += Number(d.cantidad);

    if (!d.id_cocinero) {
      sinCocinero.platos.push(d);
      return;
    }

    let tarjeta = tarjetaPorId[d.id_cocinero];
    if (!tarjeta) {
      let nombre = 'Cocinero';
      if (d.cocinero) nombre = d.cocinero;
      tarjeta = { nombre, sinAsignar: false, platos: [] };
      tarjetaPorId[d.id_cocinero] = tarjeta;
      tarjetas.push(tarjeta);
    }
    tarjeta.platos.push(d);
  });

  if (sinCocinero.platos.length > 0) tarjetas.push(sinCocinero);

  const resumen = `
    <p class="pend-resumen">
      ${conPlural(pendientes.length, 'plato pendiente', 'platos pendientes')} · ${conPlural(totalViandas, 'vianda', 'viandas')}
    </p>
  `;
  contenedor.innerHTML = resumen + tarjetas.map(crearTarjetaCocinero).join('');
}

// Tarjeta de un cocinero: nombre grande, "3 platos · 25 viandas" y un renglón por plato
function crearTarjetaCocinero(tarjeta) {
  let viandas = 0;
  tarjeta.platos.forEach(d => { viandas += Number(d.cantidad); });

  const filas = tarjeta.platos.map(d => {
    const urgencia = urgenciaFecha(d.fecha_para);
    let clase = '';
    let marca = '';
    if (urgencia) {
      clase = 'pend-' + urgencia;
      marca = `<span class="marca-urgencia">${urgencia}</span>`;
    }

    let plan = '';
    if (d.plan) plan = `<span class="pend-plan">${escHtml(d.plan)}</span>`;

    return `
      <li class="${clase}">
        <span class="pend-cantidad">${Number(d.cantidad)}</span>
        <div class="pend-info">
          <div class="pend-plato">${escHtml(d.plato)} ${plan}</div>
          <div class="pend-detalle">
            para el ${escHtml(diaMes(d.fecha_para))}${marca}
            <span class="pend-numero">· pedido #${Number(d.id_orden)}</span>
          </div>
        </div>
      </li>
    `;
  }).join('');

  let claseTarjeta = 'tarjeta-cocinero';
  if (tarjeta.sinAsignar) claseTarjeta += ' sin-asignar';

  return `
    <div class="${claseTarjeta}">
      <div class="tarjeta-cabecera">
        <h4 class="tarjeta-nombre">${escHtml(tarjeta.nombre)}</h4>
        <span class="tarjeta-resumen">${conPlural(tarjeta.platos.length, 'plato', 'platos')} · ${conPlural(viandas, 'vianda', 'viandas')}</span>
      </div>
      <ul class="pend-platos">${filas}</ul>
    </div>
  `;
}

// Al abrir se vuelve a pedir la lista, para mostrar lo último (y actualizar el número del botón)
function abrirModalPendientes() {
  fetchPendientes();
  document.getElementById('modalPendientes').style.display = 'block';
}

function cerrarModalPendientes() {
  document.getElementById('modalPendientes').style.display = 'none';
}

// ==========================================
// MODAL PEDIR A COCINA
// Una lista de platos activos con "−", un casillero y "+". El filtro (Los que faltan, Sin stock,
// Bajos, Todos los planes o un plan) solo decide lo que se ve: lo escrito se guarda en cantidadesPedido.
// Se piden los platos con un número mayor a 0. Acá no se calculan insumos.
// ==========================================

// Pueden pedir a cocina: administrador del sistema, dueño y administrador (el cocinero no pide)
function puedePedir() {
  const rol = parseInt(localStorage.getItem('usuario_rol') || '0', 10);
  const rolesQuePiden = [FG_ROLES.ROL.SISTEMA, FG_ROLES.ROL.DUENO, FG_ROLES.ROL.ADMINISTRADOR];
  return rolesQuePiden.includes(rol);
}

function mostrarBotonPedir() {
  if (puedePedir()) {
    document.getElementById('btnPedirCocina').style.display = '';
  }
}

function iniciarModalPedido() {
  document.getElementById('pPlan').addEventListener('change', alCambiarPlanPedido);
}

// Agrega una opción a un select (textContent: el texto no se interpreta como HTML)
function agregarOpcion(select, valor, texto) {
  const option = document.createElement('option');
  option.value = valor;
  option.textContent = texto;
  select.appendChild(option);
}

function abrirModalPedido() {
  // Para cuándo: arranca en mañana y no deja elegir días pasados
  const hoy = new Date();
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  const inputFecha = document.getElementById('pFecha');
  inputFecha.min = fechaLocalISO(hoy);
  inputFecha.value = fechaLocalISO(manana);

  // Filtro: "Los que faltan (N)", "Sin stock (N)", "Bajos (N)", "Todos los planes" y cada plan activo.
  // Las cantidades salen de contarEstados (la regla única): los "sin control" no entran en ninguna.
  const cuenta = contarEstados();
  const cantidadFaltan = cuenta.sin + cuenta.bajo;
  const select = document.getElementById('pPlan');
  select.innerHTML = '';

  agregarOpcion(select, 'faltan', 'Los que faltan (' + cantidadFaltan + ')');
  agregarOpcion(select, 'sin', 'Sin stock (' + cuenta.sin + ')');
  agregarOpcion(select, 'bajo', 'Bajos (' + cuenta.bajo + ')');
  agregarOpcion(select, '', 'Todos los planes');
  planesDelCombo().forEach(plan => agregarOpcion(select, plan.id, plan.nombre));

  // Si falta algo abre en "Los que faltan"; si no, en "Todos los planes"
  select.value = '';
  if (cantidadFaltan > 0) select.value = 'faltan';

  document.getElementById('pRapidoCantidad').value = '';
  document.getElementById('pError').style.display = 'none';
  cantidadesPedido = {};

  alCambiarPlanPedido();
  document.getElementById('modalPedido').style.display = 'block';
}

function cerrarModalPedido() {
  document.getElementById('modalPedido').style.display = 'none';
}

// Lo escrito para un plato: 0 si está vacío, el número si es un entero >= 0, o null si es inválido
function cantidadAPedir(idProducto) {
  const valor = (cantidadesPedido[idProducto] || '').trim();
  if (valor === '') return 0;
  const cantidad = Number(valor);
  if (!Number.isInteger(cantidad) || cantidad < 0) return null;
  return cantidad;
}

// Orden de la lista: por estado (Sin stock, Bajo, Bien, Sin control); después por plan (sin plan al final) y por nombre
function compararPlatosPedido(a, b) {
  const porEstado = compararEstado(a, b);
  if (porEstado !== 0) return porEstado;

  const planA = a.plan_nombre || '';
  const planB = b.plan_nombre || '';
  if (planA !== planB) {
    if (!planA) return 1;
    if (!planB) return -1;
    return planA.localeCompare(planB, 'es');
  }
  return (a.nombre || '').localeCompare(b.nombre || '', 'es');
}

// Platos que se ven con el filtro elegido, ya ordenados.
// slice(): copia la lista para que sort no desordene todosPlatos.
function platosVisiblesPedido() {
  const filtro = document.getElementById('pPlan').value;
  let platos = todosPlatos;
  if (filtro === 'faltan') {
    platos = todosPlatos.filter(faltaPlato);
  } else if (filtro === 'sin' || filtro === 'bajo') {
    // El valor del filtro es el mismo que devuelve estadoStock
    platos = todosPlatos.filter(p => estadoStock(p) === filtro);
  } else if (filtro !== '') {
    platos = todosPlatos.filter(p => p.id_plan === Number(filtro));
  }
  return platos.slice().sort(compararPlatosPedido);
}

// Filtros que no son un plan: los de estado y "Todos los planes"
const FILTROS_PEDIDO_SIN_PLAN = ['faltan', 'sin', 'bajo', ''];

// ¿El filtro elegido es un plan? (entonces el plan no se repite en cada renglón)
function filtroEsPlan() {
  const filtro = document.getElementById('pPlan').value;
  return !FILTROS_PEDIDO_SIN_PLAN.includes(filtro);
}

function alCambiarPlanPedido() {
  renderizarListaPedido();
}

function renderizarListaPedido() {
  const contenedor = document.getElementById('pPlatos');
  const platos = platosVisiblesPedido();
  contenedor.innerHTML = '';

  if (platos.length === 0) {
    contenedor.innerHTML = '<div class="pedido-vacio">No hay platos para este filtro</div>';
    actualizarResumenPedido();
    return;
  }

  platos.forEach(plato => {
    const fila = document.createElement('div');
    fila.className = 'plato-pedido';

    // Etiquetas: el estado solo si falta (Sin stock / Bajo), y "sin receta"
    let etiquetas = '';
    if (faltaPlato(plato)) etiquetas += etiquetaEstado(plato);
    if (!plato.tiene_receta) {
      etiquetas += '<span class="etiqueta-sin-receta">sin receta</span>';
    }

    // Línea gris: "En stock: N · mínimo M" (+ el plan, si el filtro no es un plan)
    let detalle = 'En stock: ' + Number(plato.stock_heladera);
    if (estadoStock(plato) === 'sincontrol') {
      detalle += ' · sin control';
    } else {
      detalle += ' · mínimo ' + Number(plato.stock_minimo);
    }
    if (!filtroEsPlan()) {
      let plan = 'Sin plan';
      if (plato.plan_nombre) plan = plato.plan_nombre;
      detalle += ' · ' + plan;
    }

    fila.innerHTML = `
      <div class="pp-info">
        <div class="pp-nombre">${escHtml(plato.nombre)}${etiquetas}</div>
        <div class="pp-detalle">${escHtml(detalle)}</div>
      </div>
      <div class="pp-cantidad">
        <button type="button" class="btn-paso" data-paso="-1" aria-label="Uno menos">−</button>
        <input type="text" inputmode="numeric" placeholder="0" aria-label="Cantidad a pedir">
        <button type="button" class="btn-paso" data-paso="1" aria-label="Uno más">+</button>
      </div>
    `;

    // El valor se pone por DOM; cada cambio se guarda en cantidadesPedido
    const input = fila.querySelector('input');
    input.value = cantidadesPedido[plato.id] || '';
    pintarFilaPedido(fila, input, plato.id);

    input.addEventListener('input', () => {
      cantidadesPedido[plato.id] = input.value;
      pintarFilaPedido(fila, input, plato.id);
      actualizarResumenPedido();
    });

    // "−" y "+": suman o restan 1 sin redibujar la lista (no se pierde el scroll)
    fila.querySelectorAll('.btn-paso').forEach(boton => {
      boton.addEventListener('click', () => {
        cambiarCantidadPedido(plato.id, Number(boton.dataset.paso));
        input.value = cantidadesPedido[plato.id];
        pintarFilaPedido(fila, input, plato.id);
        actualizarResumenPedido();
      });
    });

    contenedor.appendChild(fila);
  });

  actualizarResumenPedido();
}

// Rojo si el casillero es inválido; fondo verde suave si tiene más de 0
function pintarFilaPedido(fila, input, idProducto) {
  const cantidad = cantidadAPedir(idProducto);
  input.classList.toggle('invalido', cantidad === null);
  fila.classList.toggle('con-cantidad', cantidad > 0);
}

// Suma o resta 1. Nunca baja de 0. Si había algo inválido escrito, arranca de 0.
function cambiarCantidadPedido(idProducto, paso) {
  let actual = cantidadAPedir(idProducto);
  if (actual === null) actual = 0;
  let nueva = actual + paso;
  if (nueva < 0) nueva = 0;
  cantidadesPedido[idProducto] = String(nueva);
}

// Reparto en partes iguales: el sobrante va de a uno a los primeros (misma cuenta que repartirCombo).
// Ej.: 10 en 6 platos → [2, 2, 2, 2, 1, 1]
function partesIguales(total, cantidadPlatos) {
  const base = Math.floor(total / cantidadPlatos);
  const sobrante = total % cantidadPlatos;
  const partes = [];
  for (let i = 0; i < cantidadPlatos; i++) {
    let parte = base;
    if (i < sobrante) parte = base + 1;
    partes.push(parte);
  }
  return partes;
}

// "Cargar rápido": las tres acciones trabajan sobre los platos que se ven con el filtro elegido.
// Devuelve el número del casillero, o null (y muestra el error) si está vacío o es inválido.
function leerCargaRapida() {
  const cantidad = leerCantidad('pRapidoCantidad');
  if (cantidad === null) {
    mostrarErrorModal('pError', 'Escribí un número entero mayor a 0 en "Cargar rápido".');
  }
  return cantidad;
}

// "A cada uno": el mismo número en cada plato visible
function pedidoACadaUno() {
  const cantidad = leerCargaRapida();
  if (cantidad === null) return;
  platosVisiblesPedido().forEach(plato => {
    cantidadesPedido[plato.id] = String(cantidad);
  });
  renderizarListaPedido();
}

// "Repartir": el número en partes iguales entre los visibles (el sobrante, de a uno a los primeros)
function pedidoRepartir() {
  const total = leerCargaRapida();
  if (total === null) return;
  const visibles = platosVisiblesPedido();
  if (visibles.length === 0) {
    mostrarErrorModal('pError', 'No hay platos para repartir.');
    return;
  }
  const partes = partesIguales(total, visibles.length);
  visibles.forEach((plato, indice) => {
    cantidadesPedido[plato.id] = String(partes[indice]);
  });
  renderizarListaPedido();
}

// "Limpiar": deja en 0 los visibles (los ocultos por el filtro no se tocan)
function pedidoLimpiar() {
  platosVisiblesPedido().forEach(plato => {
    delete cantidadesPedido[plato.id];
  });
  renderizarListaPedido();
}

// Total de viandas pedidas, en cuántos platos, y si se puede enviar.
// Cuenta TODOS los platos, también los que no se ven por el filtro elegido.
function actualizarResumenPedido() {
  let total = 0;
  let platos = 0;
  let hayInvalida = false;

  todosPlatos.forEach(plato => {
    const cantidad = cantidadAPedir(plato.id);
    if (cantidad === null) {
      hayInvalida = true;
      return;
    }
    total += cantidad;
    if (cantidad > 0) platos += 1;
  });

  document.getElementById('pTotal').textContent = 'Total: ' + conPlural(total, 'vianda', 'viandas');
  document.getElementById('pTotalPlatos').textContent = 'en ' + conPlural(platos, 'plato', 'platos');

  const errEl = document.getElementById('pError');
  if (hayInvalida) {
    mostrarErrorModal('pError', 'Hay una cantidad inválida: tiene que ser un número entero mayor o igual a 0.');
  } else {
    errEl.style.display = 'none';
  }

  document.getElementById('pEnviar').disabled = total === 0 || hayInvalida;
}

// Platos con un número mayor a 0, en el formato que espera el servidor
function itemsDelPedido() {
  return todosPlatos
    .filter(plato => cantidadAPedir(plato.id) > 0)
    .map(plato => ({ id_producto: plato.id, cantidad: cantidadAPedir(plato.id) }));
}

async function enviarPedido() {
  const fecha = document.getElementById('pFecha').value;
  if (!fecha) {
    mostrarErrorModal('pError', 'Elegí para cuándo es el pedido.');
    return;
  }

  const btn = document.getElementById('pEnviar');
  btn.disabled = true; // evita doble click mientras se guarda

  try {
    const res = await apiFetch('/api/ordenes-produccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_para: fecha, items: itemsDelPedido() })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarErrorModal('pError', data.error || 'No se pudo enviar el pedido a cocina.');
      btn.disabled = false;
      return;
    }

    cerrarModalPedido();
    mostrarToast('Pedido a cocina #' + data.id_orden + ' enviado.', 'exito');
    await fetchPendientes();
  } catch {
    mostrarErrorModal('pError', 'No se pudo conectar con el servidor.');
    btn.disabled = false;
  }
}

// ==========================================
// MODAL DESCARTAR VIANDAS
// ==========================================

function abrirModalDescarte(idProducto) {
  const plato = todosPlatos.find(p => p.id === idProducto);
  if (!plato) return;

  platoDescarte = plato;
  document.getElementById('dInfo').textContent =
    plato.nombre + ' — en stock: ' + plato.stock_heladera + ' viandas';
  document.getElementById('dCantidad').value = '';
  document.getElementById('dCantidad').max = plato.stock_heladera;
  document.getElementById('dMotivo').value = '';
  document.getElementById('dError').style.display = 'none';
  document.getElementById('dConfirmar').disabled = false;

  document.getElementById('modalDescarte').style.display = 'block';
}

function cerrarModalDescarte() {
  document.getElementById('modalDescarte').style.display = 'none';
  platoDescarte = null;
}

async function confirmarDescarte() {
  if (!platoDescarte) return;

  const cantidad = leerCantidad('dCantidad');
  const motivo = document.getElementById('dMotivo').value.trim();

  if (cantidad === null) {
    mostrarErrorModal('dError', 'La cantidad tiene que ser un número entero mayor a 0.');
    return;
  }
  if (cantidad > platoDescarte.stock_heladera) {
    mostrarErrorModal('dError', 'No podés descartar más viandas de las que hay en stock.');
    return;
  }
  if (!motivo) {
    mostrarErrorModal('dError', 'Escribí el motivo del descarte.');
    return;
  }

  const btn = document.getElementById('dConfirmar');
  btn.disabled = true;

  try {
    const res = await apiFetch('/api/viandas-stock/descarte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: platoDescarte.id, cantidad, motivo })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarErrorModal('dError', data.error || 'No se pudo registrar el descarte.');
      btn.disabled = false;
      return;
    }

    cerrarModalDescarte();
    mostrarToast('Descarte registrado. En stock: ' + data.stock_heladera + ' viandas.', 'exito');
    await Promise.all([fetchPlatos(), fetchHistorial()]);
  } catch {
    mostrarErrorModal('dError', 'No se pudo conectar con el servidor.');
    btn.disabled = false;
  }
}

// Cerrar los modales al hacer click afuera
window.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalCombo')) cerrarModalCombo();
  if (e.target === document.getElementById('modalTanda')) cerrarModalTanda();
  if (e.target === document.getElementById('modalDescarte')) cerrarModalDescarte();
  if (e.target === document.getElementById('modalPendientes')) cerrarModalPendientes();
});

// ==========================================
// TOAST (mismo aviso flotante que stock.js)
// ==========================================

function mostrarToast(mensaje, tipo) {
  const toast = document.createElement('div');
  toast.className   = `toast-stock ${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
