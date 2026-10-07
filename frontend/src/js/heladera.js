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

document.addEventListener('DOMContentLoaded', () => {
  fetchPlatos();
  fetchHistorial();
  iniciarFiltro();
  iniciarModalTanda();
  iniciarModalCombo();
});

// ==========================================
// TRAER DATOS DEL SERVIDOR
// ==========================================

async function fetchPlatos() {
  const tbody = document.getElementById('heladeraBody');

  try {
    const res = await apiFetch('/api/viandas-stock');
    if (!res.ok) throw new Error();
    todosPlatos = await res.json();
    aplicarFiltro();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
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

// ==========================================
// TABLA DE PLATOS (paginada de a 15)
// ==========================================

function renderizarPlatos(platos) {
  crearPaginacion({
    datos: platos,
    porPagina: 15,
    contenedorTabla: document.getElementById('heladeraBody'),
    contenedorPaginacion: document.getElementById('paginacion'),
    funcionRenderFila: crearFilaPlato,
    filaVacia: '<tr><td colspan="5" class="loading-text">No se encontraron platos</td></tr>'
  });
}

function crearFilaPlato(plato) {
  const tr = document.createElement('tr');

  let codigo = '-';
  if (plato.codigo_plato) codigo = plato.codigo_plato;

  let plan = '-';
  if (plato.plan_nombre) plan = plato.plan_nombre;

  // Sin viandas: el número se ve gris y no se puede descartar
  let claseStock = '';
  let deshabilitado = '';
  if (plato.stock_heladera <= 0) {
    claseStock = 'stock-cero';
    deshabilitado = 'disabled';
  }

  tr.innerHTML = `
    <td style="font-weight:bold">${escHtml(codigo)}</td>
    <td><strong>${escHtml(plato.nombre)}</strong></td>
    <td>${escHtml(plan)}</td>
    <td style="font-weight:600" class="${claseStock}">${Number(plato.stock_heladera)}</td>
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

function aplicarFiltro() {
  const texto = document.getElementById('filtroNombre').value.toLowerCase();
  const filtrados = todosPlatos.filter(p => (p.nombre || '').toLowerCase().includes(texto));
  renderizarPlatos(filtrados);
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
    mostrarToast('Tanda registrada. En heladera: ' + data.stock_heladera + ' viandas.', 'exito');
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
    mostrarToast('Combo registrado: ' + data.total + ' viandas cargadas en heladera.', 'exito');
    await Promise.all([fetchPlatos(), fetchHistorial()]);
  } catch {
    mostrarErrorModal('cError', 'No se pudo conectar con el servidor.');
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
    plato.nombre + ' — en heladera: ' + plato.stock_heladera + ' viandas';
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
    mostrarErrorModal('dError', 'No podés descartar más viandas de las que hay en la heladera.');
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
    mostrarToast('Descarte registrado. En heladera: ' + data.stock_heladera + ' viandas.', 'exito');
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
