// ============================================================================
// heladera.js — Pantalla Producción: stock de viandas terminadas
// Lista los platos con cuántas viandas hay y su estado, permite pedir a cocina,
// ver lo pendiente y lo hecho hoy, descartar viandas, y muestra los últimos
// movimientos en un panel al costado.
// Todo lo que viene de la base se escapa con escHtml (escape.js) antes de mostrarlo.
// ============================================================================

let todosPlatos = [];       // platos activos con su stock_heladera, plan y si tienen receta
let platoDescarte = null;   // plato que se está descartando
let cantidadesPedido = {};  // pedir a cocina: id_producto → lo escrito en "A pedir" (sobrevive a los filtros)
let filtroEstado = 'todos'; // filtro de la tabla: 'todos', 'sin', 'bajo', 'bien' o 'sincontrol'

const INTERVALO_ACTUALIZACION = 60000; // cada 60 segundos se vuelven a pedir stock y pendientes

document.addEventListener('DOMContentLoaded', () => {
  fetchPlatos();
  fetchHistorial();
  fetchPendientes();
  fetchHechosHoy();
  iniciarFiltro();
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
    fetchHechosHoy();
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
  movimientos.forEach(m => lista.appendChild(crearRenglonMovimiento(m)));
}

// Renglón de un movimiento
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
// AYUDAS DE LAS VENTANAS (pedir a cocina y descartar)
// ==========================================

// Cantidad del input como entero mayor a 0, o null si no es válida
function leerCantidad(idInput) {
  const valor = document.getElementById(idInput).value.trim();
  const cantidad = Number(valor);
  if (valor === '' || !Number.isInteger(cantidad) || cantidad <= 0) return null;
  return cantidad;
}

function mostrarErrorModal(idError, mensaje) {
  const errEl = document.getElementById(idError);
  errEl.textContent = mensaje;
  errEl.style.display = 'block';
}

// Planes activos que tienen platos activos (salen de GET /api/viandas-stock), ordenados por nombre
function planesConPlatos() {
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

// ==========================================
// PENDIENTES DE COCINA (ventana)
// La lista la dibuja pedidosCocina.js (compartido con Tareas de Cocina), con "Hecho" para todos.
// Acá solo queda el número del botón y qué se recarga después de marcar un plato.
// ==========================================

// Después de marcar un plato se recargan pendientes, stock (sin cambiar de página) y "Hecho hoy"
const OPCIONES_PENDIENTES = {
  conBotonHecho: true,
  recargar: () => Promise.all([fetchPendientes(), fetchPlatos(true), fetchHechosHoy()])
};

async function fetchPendientes() {
  const pendientes = await cargarPendientes('listaPendientes', OPCIONES_PENDIENTES);
  // N = cantidad de platos pendientes (el servidor manda un renglón por plato de cada pedido)
  const boton = document.getElementById('btnPendientes');
  if (pendientes) {
    boton.textContent = 'Pendientes de cocina (' + pendientes.length + ')';
  } else {
    boton.textContent = 'Pendientes de cocina';
  }
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
// HECHO HOY (debajo de la tabla)
// Platos de pedidos a cocina marcados hechos hoy, del más reciente al más viejo.
// ==========================================

// Timestamp de la base → "14:32" en hora local
function horaCorta(texto) {
  const fecha = fechaDeTimestamp(texto);
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mi = String(fecha.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

async function fetchHechosHoy() {
  const lista = document.getElementById('listaHechoHoy');

  try {
    const res = await apiFetch('/api/ordenes-produccion/hechos-hoy');
    if (!res.ok) throw new Error();
    renderizarHechosHoy(await res.json());
  } catch {
    lista.innerHTML = '<li class="mov-vacio" style="color:red;">Error al cargar lo hecho hoy</li>';
  }
}

function renderizarHechosHoy(hechos) {
  const lista = document.getElementById('listaHechoHoy');

  if (!hechos || hechos.length === 0) {
    lista.innerHTML = '<li class="mov-vacio">Todavía no se marcó nada hoy.</li>';
    return;
  }

  lista.innerHTML = hechos.map(h => {
    let hora = '-';
    if (h.fecha_hecho) hora = horaCorta(h.fecha_hecho);

    let plan = '';
    if (h.plan) plan = ` <span class="hh-plan">· ${escHtml(h.plan)}</span>`;

    let quien = '';
    if (h.marcado_por) quien = h.marcado_por;

    return `
      <li>
        <span class="hh-hora">${escHtml(hora)}</span>
        <span class="hh-cantidad">${Number(h.cantidad)}</span>
        <span class="hh-plato">${escHtml(h.plato)}${plan}</span>
        <span class="hh-quien">${escHtml(quien)}</span>
      </li>
    `;
  }).join('');
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
  planesConPlatos().forEach(plan => agregarOpcion(select, plan.id, plan.nombre));

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

// Reparto en partes iguales: el sobrante va de a uno a los primeros.
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
