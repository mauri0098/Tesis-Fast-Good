// ============================================================================
// generarReceta.js — Generar Receta (pages/generarReceta.html): la lista de platos con su receta,
// "Nuevo producto", "Editar receta" y (28/10) las abreviaturas de los planes.
//
// Funciones nuevas o cambiadas por el código de plato (28/10):
//   crearFilaReceta            → la columna Código muestra la pastillita ("F3")
//   abrirModalEditar           → arranca con la categoría y el plan del plato, y su código
//   actualizarCodigoAutomatico → muestra el código que tendría con el plan elegido; al editar, el aviso "F3 → K5"
//   actualizarRecetaExistente  → si cambió el plan, pregunta y lo cambia primero (con cambiarPlanDelPlato)
//   cambiarPlanDelPlato        → PUT /api/productos/:id/plan: el servidor da el código nuevo
//   abrirAbreviaturas          → la ventana "Abreviaturas de los planes" (GET /api/planes)
//   guardarAbreviatura         → guarda la abreviatura de un plan (PUT /api/planes/:id/abreviatura)
//   cerrarAbreviaturas         → cierra esa ventana
// Lo que viene de la base pasa por escHtml (o se pone con textContent).
// ============================================================================

// Variables globales
let todasRecetas    = [];
let todosInsumos    = [];
let todosProductos  = [];
let todasCategorias = [];
let idProductoEditando = null;
let modoCreacion       = false;
let cocineroOriginal   = '';   // cocinero del plato al abrir "Editar", para saber si cambió
let planOriginal       = '';   // plan del plato al abrir "Editar" (su número, como texto), para saber si cambió (28/10)
let codigoOriginal     = '';   // código del plato al abrir "Editar" (ej: "F3")
let codigoPrevisto     = '';   // el código que mostró la pantalla con el plan nuevo (ej: "K5")

// Imagen pendiente de subir (se sube recién después de guardar la receta,
// porque para un producto nuevo todavía no existe id_producto)
let imagenPendiente = null; // { base64, tipo } | null

const TIPOS_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANIO_MAX_IMAGEN      = 2 * 1024 * 1024; // 2MB

// ==========================================
// INICIO
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  fetchRecetas();
  iniciarFiltros();

  window.addEventListener('click', function (e) {
    if (e.target === document.getElementById('modalDetalles')) cerrarModalDetalles();
    if (e.target === document.getElementById('modalEditar'))   cerrarModalEditar();
    if (e.target === document.getElementById('modalAbreviaturas')) cerrarAbreviaturas();
  });

  document.getElementById('btnEditarDesdeDetalles').addEventListener('click', function () {
    const id = idProductoEditando;
    cerrarModalDetalles();
    abrirModalEditar(id);
  });

  // Cascada: categoría → plan
  document.getElementById('edCategoria').addEventListener('change', function () {
    const idCat       = this.value;
    const planSelect  = document.getElementById('edPlan');
    const codigoInput = document.getElementById('edCodigo');

    codigoInput.value = '';
    document.getElementById('edAvisoCodigo').hidden = true;   // sin plan elegido, no hay aviso del código

    if (!idCat) {
      planSelect.innerHTML = '<option value="">Seleccioná una categoría primero</option>';
      planSelect.disabled  = true;
      return;
    }

    cargarPlanesParaCategoria(parseInt(idCat));
  });

  // Cascada: plan → código automático
  document.getElementById('edPlan').addEventListener('change', function () {
    const idPlan      = this.value;
    const codigoInput = document.getElementById('edCodigo');

    if (!idPlan) {
      codigoInput.value = '';
      document.getElementById('edAvisoCodigo').hidden = true;
      return;
    }

    actualizarCodigoAutomatico(parseInt(idPlan));
  });
});

// ==========================================
// TRAER RECETAS
// ==========================================
async function fetchRecetas() {
  const tbody = document.getElementById('recetasBody');

  try {
    const response = await apiFetch('/api/recetas');
    const data     = await response.json();

    if (!response.ok) throw new Error(data.error || 'Error en el servidor');

    todasRecetas = data;
    cargarPlanesEnFiltro();
    cargarCategoriasEnFiltro();
    renderizarRecetas(todasRecetas);

  } catch (error) {
    console.error('Error al traer recetas:', error);
    tbody.innerHTML = '<tr><td colspan="9" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// ==========================================
// TABLA PRINCIPAL
// ==========================================
// Recibe todas las recetas o las filtradas y las dibuja paginadas de a 15
function renderizarRecetas(recetas) {
  crearPaginacion({
    datos:                recetas,
    porPagina:            15,
    contenedorTabla:      document.getElementById('recetasBody'),
    contenedorPaginacion: document.getElementById('paginacion'),
    funcionRenderFila:    crearFilaReceta,
    filaVacia:            '<tr><td colspan="9" class="loading-text">No existen productos que cumplan los filtros especificados</td></tr>'
  });
}

function crearFilaReceta(receta) {
  const tr = document.createElement('tr');

  // — Código de Plato: la pastillita ("F3"), la misma de todas las pantallas (pastillaCodigo, escape.js).
  //   El servidor manda '-' cuando el plato no tiene código: ahí va "—"
  const tdCodigo = document.createElement('td');
  tdCodigo.className = 'td-codigo';
  const codigo = receta.codigo_plato !== '-' ? receta.codigo_plato : null;
  tdCodigo.innerHTML = pastillaCodigo(codigo, '') || '—';     // pastillaCodigo ya pasa el código por escHtml

  // — Categoría —
  const tdCategoria = document.createElement('td');
  tdCategoria.textContent = (receta.plan && receta.plan.categoria) ? receta.plan.categoria : '-';

  // — Plan (sin (null) si el código no existe) —
  const tdPlan = document.createElement('td');
  if (receta.plan) {
    tdPlan.textContent = receta.plan.codigo
      ? receta.plan.nombre + ' (' + receta.plan.codigo + ')'
      : receta.plan.nombre;
  } else {
    tdPlan.textContent = '-';
  }

  // — Nombre Producto —
  const tdNombre = document.createElement('td');
  const strong   = document.createElement('strong');
  strong.textContent = receta.nombre_producto || '-';
  tdNombre.appendChild(strong);

  // — Cocinero (el propio del plato; si no tiene, lo ve el cocinero del plan) —
  const tdCocinero = document.createElement('td');
  if (receta.cocinero_nombre) {
    tdCocinero.textContent = receta.cocinero_nombre;
  } else {
    tdCocinero.textContent = 'Del plan';
    tdCocinero.className   = 'td-del-plan';
  }

  // — Precio —
  const tdPrecio = document.createElement('td');
  tdPrecio.textContent = receta.precio != null ? '$' + Number(receta.precio).toFixed(2) : '-';

  // — Descuento —
  const tdDescuento = document.createElement('td');
  tdDescuento.textContent = receta.descuento != null ? receta.descuento + '%' : '-';

  // — Cantidad Posible —
  const tdCant   = document.createElement('td');
  const posible  = calcularCantidadPosible(receta.insumos || []);
  const spanCant = document.createElement('span');
  spanCant.textContent = posible;
  spanCant.className   = posible === 0 ? 'cant-cero' : posible < 5 ? 'cant-baja' : 'cant-ok';
  tdCant.appendChild(spanCant);

  // — Acciones —
  const tdAcciones    = document.createElement('td');
  tdAcciones.className = 'td-acciones';

  // Div flex interno: evita que display:flex en el <td> rompa la tabla
  const grupoAcciones    = document.createElement('div');
  grupoAcciones.className = 'acciones-grupo';

  const btnDetalle = document.createElement('button');
  btnDetalle.className = 'btn-detalle';
  btnDetalle.textContent = 'Detalles';
  btnDetalle.onclick = function () { abrirModalDetalles(receta.id_producto); };

  const btnEditar = document.createElement('button');
  btnEditar.className = 'btn-editar';
  btnEditar.textContent = 'Editar';
  btnEditar.onclick = function () { abrirModalEditar(receta.id_producto); };

  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-borrar';
  btnBorrar.textContent = 'Borrar';
  btnBorrar.onclick = function () { borrarReceta(receta.id_producto); };

  grupoAcciones.appendChild(btnDetalle);
  grupoAcciones.appendChild(btnEditar);
  grupoAcciones.appendChild(btnBorrar);
  tdAcciones.appendChild(grupoAcciones);

  tr.appendChild(tdCodigo);
  tr.appendChild(tdCategoria);
  tr.appendChild(tdPlan);
  tr.appendChild(tdNombre);
  tr.appendChild(tdCocinero);
  tr.appendChild(tdPrecio);
  tr.appendChild(tdDescuento);
  tr.appendChild(tdCant);
  tr.appendChild(tdAcciones);
  return tr;
}

// ==========================================
// CÁLCULOS
// ==========================================
function calcularCantidadPosible(insumos) {
  if (!insumos || insumos.length === 0) return 0;

  let posible = Infinity;

  for (let i = 0; i < insumos.length; i++) {
    const ins = insumos[i];
    if (!ins.cantidad_necesaria || ins.cantidad_necesaria <= 0) return 0;
    const cant = Math.floor(ins.stock_actual / ins.cantidad_necesaria);
    if (cant < posible) posible = cant;
  }

  return isFinite(posible) ? posible : 0;
}

// ==========================================
// FILTROS
// ==========================================
function cargarPlanesEnFiltro() {
  const select = document.getElementById('filtroPlan');
  select.innerHTML = '<option value="">Todos los planes</option>';

  const planesVistos = [];

  todasRecetas.forEach(function (receta) {
    if (!receta.plan) return;
    const nombre = receta.plan.nombre;
    if (planesVistos.indexOf(nombre) !== -1) return;
    planesVistos.push(nombre);

    const option = document.createElement('option');
    option.value = nombre;
    option.textContent = receta.plan.codigo
      ? nombre + ' (' + receta.plan.codigo + ')'
      : nombre;
    select.appendChild(option);
  });
}

function cargarCategoriasEnFiltro() {
  const select = document.getElementById('filtroCategoria');
  select.innerHTML = '<option value="">Todas las categorías</option>';

  const categoriasVistas = [];

  todasRecetas.forEach(function (receta) {
    if (!receta.plan || !receta.plan.categoria) return;
    const cat = receta.plan.categoria;
    if (categoriasVistas.indexOf(cat) !== -1) return;
    categoriasVistas.push(cat);

    const option       = document.createElement('option');
    option.value       = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

function iniciarFiltros() {
  const filtroNombre         = document.getElementById('filtroNombre');
  const filtroPlan           = document.getElementById('filtroPlan');
  const filtroCategoria      = document.getElementById('filtroCategoria');
  const filtroDisponibilidad = document.getElementById('filtroDisponibilidad');

  function aplicarFiltros() {
    const texto         = filtroNombre.value.toLowerCase();
    const plan          = filtroPlan.value;
    const categoria     = filtroCategoria.value;
    const disponibilidad = filtroDisponibilidad.value;

    const filtradas = todasRecetas.filter(function (receta) {
      const cumpleNombre     = receta.nombre_producto.toLowerCase().includes(texto);
      const cumplePlan       = !plan      || (receta.plan && receta.plan.nombre === plan);
      const cumpleCategoria  = !categoria || (receta.plan && receta.plan.categoria === categoria);

      const posible = calcularCantidadPosible(receta.insumos || []);
      let cumpleDisp = true;
      if (disponibilidad === 'disponible') cumpleDisp = posible > 0;
      if (disponibilidad === 'sin_stock')  cumpleDisp = posible === 0;

      return cumpleNombre && cumplePlan && cumpleCategoria && cumpleDisp;
    });

    renderizarRecetas(filtradas);
  }

  filtroNombre.addEventListener('input',   aplicarFiltros);
  filtroPlan.addEventListener('change',    aplicarFiltros);
  filtroCategoria.addEventListener('change', aplicarFiltros);
  filtroDisponibilidad.addEventListener('change', aplicarFiltros);
}

// ==========================================
// MODAL DETALLES
// ==========================================
function abrirModalDetalles(idProducto) {
  const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
  if (!receta) return;

  idProductoEditando = idProducto;

  document.getElementById('detTitulo').textContent   = 'Receta de ' + receta.nombre_producto;
  document.getElementById('detProducto').textContent = receta.nombre_producto || '-';
  document.getElementById('detPlan').textContent     = receta.plan
    ? receta.plan.nombre + ' (' + receta.plan.codigo + ')'
    : '-';

  const posible    = calcularCantidadPosible(receta.insumos || []);
  const spanPosible = document.getElementById('detPosible');
  spanPosible.textContent = posible + ' unidades';
  spanPosible.className   = posible === 0 ? 'cant-cero' : posible < 5 ? 'cant-baja' : 'cant-ok';

  const tbody  = document.getElementById('detInsumosBody');
  const insumos = receta.insumos || [];
  tbody.innerHTML = '';

  if (insumos.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.style.textAlign = 'center';
    td.textContent = 'Sin insumos registrados';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    insumos.forEach(function (ins) {
      const tr      = document.createElement('tr');
      const tdNombre = document.createElement('td');
      tdNombre.textContent = ins.nombre_insumo || '-';
      const tdCant  = document.createElement('td');
      tdCant.textContent = ins.cantidad_necesaria;
      const tdUnidad = document.createElement('td');
      tdUnidad.textContent = ins.unidad_medida || '-';
      tr.appendChild(tdNombre);
      tr.appendChild(tdCant);
      tr.appendChild(tdUnidad);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('modalDetalles').style.display = 'block';
}

function cerrarModalDetalles() {
  document.getElementById('modalDetalles').style.display = 'none';
}

// ==========================================
// IMAGEN DEL PLATO
// ==========================================
function previsualizarImagen(event) {
  const input  = event.target;
  const errEl  = document.getElementById('edImagenError');
  const archivo = input.files && input.files[0];

  errEl.style.display = 'none';
  if (!archivo) return;

  if (TIPOS_IMAGEN_PERMITIDOS.indexOf(archivo.type) === -1) {
    errEl.textContent    = 'Formato no soportado. Usá JPG, PNG o WebP.';
    errEl.style.display  = 'block';
    input.value = '';
    return;
  }

  if (archivo.size > TAMANIO_MAX_IMAGEN) {
    errEl.textContent    = 'La imagen supera el tamaño máximo permitido (2MB).';
    errEl.style.display  = 'block';
    input.value = '';
    return;
  }

  const lector = new FileReader();
  lector.onload = function () {
    const dataUrl = lector.result; // "data:image/png;base64,AAAA..."
    const base64  = dataUrl.split(',')[1];

    imagenPendiente = { base64: base64, tipo: archivo.type };
    mostrarPreviewImagen(dataUrl);
  };
  lector.readAsDataURL(archivo);
}

function mostrarPreviewImagen(src) {
  const preview     = document.getElementById('edImagenPreview');
  const previewVacio = document.getElementById('edImagenPreviewVacio');
  preview.src           = src;
  preview.style.display = 'block';
  previewVacio.style.display = 'none';
}

function limpiarImagen() {
  imagenPendiente = null;
  document.getElementById('edImagenInput').value = '';
  document.getElementById('edImagenError').style.display = 'none';

  const preview      = document.getElementById('edImagenPreview');
  const previewVacio = document.getElementById('edImagenPreviewVacio');
  preview.removeAttribute('src');
  preview.style.display      = 'none';
  previewVacio.style.display = 'flex';
}

async function subirImagenProducto(idProducto) {
  if (!imagenPendiente) return true;

  try {
    const response = await apiFetch('/api/productos/' + idProducto + '/imagen', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imagen_base64: imagenPendiente.base64, tipo: imagenPendiente.tipo })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al subir la imagen');

    return true;
  } catch (error) {
    console.error('Error al subir imagen:', error);
    alert('La receta se guardó correctamente, pero no se pudo subir la imagen: ' + error.message);
    return false;
  }
}

// ==========================================
// MODAL CREAR NUEVO PRODUCTO + RECETA
// ==========================================
function abrirModalNuevaReceta() {
  modoCreacion       = true;
  idProductoEditando = null;

  document.getElementById('edTitulo').textContent      = 'Nuevo Producto y Receta';
  document.getElementById('edError').style.display     = 'none';
  document.getElementById('edInsumosBody').innerHTML   = '';

  document.getElementById('bloqueNuevoProducto').style.display = 'block';
  document.getElementById('bloqueEditar').style.display        = 'none';

  // Limpiar campos
  document.getElementById('edNombre').value    = '';
  document.getElementById('edCodigo').value    = '';
  document.getElementById('edPrecio').value    = '';
  document.getElementById('edDescuento').value = '';
  document.getElementById('edAvisoCodigo').hidden = true;     // el aviso del código es solo para "Editar"
  limpiarImagen();

  const planSelect = document.getElementById('edPlan');
  planSelect.innerHTML = '<option value="">Seleccioná una categoría primero</option>';
  planSelect.disabled  = true;

  Promise.all([
    cargarCategoriasEnSelect(),
    cargarInsumosDisponibles(),
    cargarCocinerosEnSelect(null, null)
  ]).then(function () {
    agregarFilaInsumo(null);
  });

  document.getElementById('modalEditar').style.display = 'block';
}

// ==========================================
// MODAL EDITAR RECETA EXISTENTE
// ==========================================
async function abrirModalEditar(idProducto) {
  modoCreacion       = false;
  idProductoEditando = idProducto;

  document.getElementById('edError').style.display   = 'none';
  document.getElementById('edInsumosBody').innerHTML = '';

  document.getElementById('bloqueNuevoProducto').style.display = 'none';
  document.getElementById('bloqueEditar').style.display        = 'block';

  limpiarImagen();

  const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
  if (receta) {
    document.getElementById('edTitulo').textContent                 = 'Editar Receta';
    document.getElementById('edNombreProductoEditando').textContent = receta.nombre_producto;
    document.getElementById('edPrecio').value    = receta.precio    != null ? receta.precio    : '';
    document.getElementById('edDescuento').value = receta.descuento != null ? receta.descuento : '';
    if (receta.imagen) mostrarPreviewImagen(receta.imagen);
  }

  await Promise.all([
    cargarInsumosDisponibles(),
    cargarCocinerosEnSelect(receta ? receta.id_cocinero : null, receta ? receta.cocinero_nombre : null),
    cargarCategoriasEnSelect()
  ]);
  cocineroOriginal = (receta && receta.id_cocinero) || '';

  // Categoría, plan y código del plato (28/10): arrancan con los suyos. Si se elige otro plan, el código se
  // recalcula y aparece el aviso (actualizarCodigoAutomatico). || = el valor de la derecha si no hay plan
  const planDelPlato = (receta && receta.plan) || {};
  planOriginal   = planDelPlato.id ? String(planDelPlato.id) : '';
  codigoOriginal = receta && receta.codigo_plato !== '-' ? receta.codigo_plato : '';
  codigoPrevisto = '';
  document.getElementById('edCodigo').value        = codigoOriginal;
  document.getElementById('edAvisoCodigo').hidden  = true;
  if (planDelPlato.id_categoria) {
    document.getElementById('edCategoria').value = String(planDelPlato.id_categoria);
    await cargarPlanesParaCategoria(planDelPlato.id_categoria);  // los planes de su categoría…
    document.getElementById('edPlan').value = planOriginal;      // …con el suyo elegido
  }

  if (receta && receta.insumos) {
    receta.insumos.forEach(function (ins) { agregarFilaInsumo(ins); });
  }

  document.getElementById('modalEditar').style.display = 'block';
}

function cerrarModalEditar() {
  document.getElementById('modalEditar').style.display = 'none';
  document.getElementById('edInsumosBody').innerHTML   = '';
  document.getElementById('edError').style.display     = 'none';
  document.getElementById('edNombre').value            = '';
  document.getElementById('edCodigo').value            = '';
  document.getElementById('edPrecio').value            = '';
  document.getElementById('edDescuento').value         = '';
  document.getElementById('edCocinero').value          = '';
  limpiarImagen();
  idProductoEditando = null;
  modoCreacion       = false;
  cocineroOriginal   = '';
  planOriginal       = '';
  codigoOriginal     = '';
  codigoPrevisto     = '';
  document.getElementById('edAvisoCodigo').hidden = true;
}

// ==========================================
// CARGAR COCINEROS (select del modal, opcional)
// idAsignado / nombreAsignado: el cocinero que ya tiene el plato (al editar), o null
// ==========================================
async function cargarCocinerosEnSelect(idAsignado, nombreAsignado) {
  const select = document.getElementById('edCocinero');
  select.innerHTML = '';

  const optVacio       = document.createElement('option');
  optVacio.value       = '';
  optVacio.textContent = 'Sin asignar (usa el del plan)';
  select.appendChild(optVacio);

  let cocineros = [];
  try {
    const response = await apiFetch('/api/cocineros');
    if (response.ok) cocineros = await response.json();
  } catch (error) {
    console.error('Error al cargar cocineros:', error);
  }

  cocineros.forEach(function (c) {
    const option       = document.createElement('option');
    option.value       = c.id;
    option.textContent = [c.nombre, c.apellido].filter(Boolean).join(' ');
    select.appendChild(option);
  });

  // Asignado a alguien que ya no es cocinero: se muestra igual para no perderlo sin querer
  // (mismo criterio que la pantalla Asignar Cocineros)
  if (idAsignado && !cocineros.some(function (c) { return c.id === idAsignado; })) {
    const option       = document.createElement('option');
    option.value       = idAsignado;
    option.textContent = (nombreAsignado || 'Usuario eliminado') + ' (ya no es cocinero)';
    select.appendChild(option);
  }

  select.value = idAsignado || '';
}

// ==========================================
// CARGAR CATEGORÍAS (select modal creación)
// ==========================================
async function cargarCategoriasEnSelect() {
  const select = document.getElementById('edCategoria');
  select.innerHTML = '<option value="">Cargando categorías...</option>';

  try {
    const response    = await fetch('/api/v1/categorias');
    todasCategorias   = await response.json();

    select.innerHTML = '<option value="">Seleccioná una categoría...</option>';
    todasCategorias.forEach(function (cat) {
      const option       = document.createElement('option');
      option.value       = cat.id;
      option.textContent = cat.nombre;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar categorías:', error);
    select.innerHTML = '<option value="">Error al cargar</option>';
  }
}

// ==========================================
// CARGAR PLANES (cascada desde categoría)
// ==========================================
async function cargarPlanesParaCategoria(idCategoria) {
  const planSelect = document.getElementById('edPlan');
  planSelect.innerHTML = '<option value="">Cargando planes...</option>';
  planSelect.disabled  = true;

  try {
    const response = await fetch('/api/v1/categorias/' + idCategoria + '/planes');

    if (!response.ok) {
      planSelect.innerHTML = '<option value="">Sin planes para esta categoría</option>';
      return;
    }

    const planes = await response.json();

    planSelect.innerHTML = '<option value="">Seleccioná un plan...</option>';
    planes.forEach(function (plan) {
      const option       = document.createElement('option');
      option.value       = plan.id;
      option.textContent = plan.nombre;
      planSelect.appendChild(option);
    });

    planSelect.disabled = false;
  } catch (error) {
    console.error('Error al cargar planes:', error);
    planSelect.innerHTML = '<option value="">Error al cargar</option>';
  }
}

// ==========================================
// CÓDIGO AUTOMÁTICO (según plan seleccionado)
// ==========================================
// actualizarCodigoAutomatico → muestra el código que tendría el plato con el plan elegido
// ENTRADA: idPlan, el plan elegido en el formulario
// SALIDA:  nada. Escribe el código en el casillero (de solo lectura) y, al EDITAR con otro plan, el aviso
//          "El código va a cambiar de F3 a K5". Si el plan no tiene abreviatura, el aviso lo dice.
// Ej: Nuevo, plan Mantenimiento con el contador en 3 → "F4" · Editar F3 y elegir Descenso de peso → "K5" + aviso
// Es solo para mostrar: el código de verdad lo da el servidor al guardar.
async function actualizarCodigoAutomatico(idPlan) {
  const codigoInput     = document.getElementById('edCodigo');
  const aviso           = document.getElementById('edAvisoCodigo');
  aviso.hidden          = true;
  codigoPrevisto        = '';

  // Al editar y volver a su mismo plan: el código de siempre, sin aviso
  const esSuPlan = !modoCreacion && String(idPlan) === planOriginal;
  if (esSuPlan) {
    codigoInput.value = codigoOriginal;
    return;
  }

  codigoInput.value     = 'Calculando...';
  codigoInput.classList.add('calculando');

  try {
    const response = await apiFetch('/api/planes/' + idPlan + '/siguiente-codigo');
    const data     = await response.json();

    codigoInput.value = response.ok ? data.codigo : '';
    if (!response.ok) {                                         // ej: el plan no tiene abreviatura
      aviso.textContent = data.error || 'No se pudo calcular el código.';
      aviso.hidden      = false;
      return;
    }
    codigoPrevisto = data.codigo;
    if (modoCreacion) return;                                   // en "Nuevo" no hay aviso: el código es nuevo
    aviso.textContent = 'El código va a cambiar de ' + (codigoOriginal || 'sin código') + ' a ' + data.codigo + '.';
    aviso.hidden      = false;
  } catch (error) {
    console.error('Error al calcular código:', error);
    codigoInput.value = '';
  } finally {
    codigoInput.classList.remove('calculando');
  }
}

// ==========================================
// CARGAR INSUMOS DISPONIBLES (para los selects de la tabla)
// ==========================================
async function cargarInsumosDisponibles() {
  try {
    const response = await apiFetch('/api/insumos');
    todosInsumos   = await response.json();
  } catch (error) {
    console.error('Error al cargar insumos:', error);
    todosInsumos = [];
  }
}

// ==========================================
// AGREGAR FILA EDITABLE DE INSUMO
// insumoExistente: null = fila vacía | objeto = datos pre-cargados (modo edición)
// ==========================================
function agregarFilaInsumo(insumoExistente) {
  const tbody = document.getElementById('edInsumosBody');
  const tr    = document.createElement('tr');

  // — Celda: select de insumo —
  const tdInsumo    = document.createElement('td');
  const selectInsumo = document.createElement('select');
  selectInsumo.className = 'ed-insumo';

  const optVacio       = document.createElement('option');
  optVacio.value       = '';
  optVacio.textContent = 'Seleccionar insumo...';
  selectInsumo.appendChild(optVacio);

  todosInsumos.forEach(function (ins) {
    const opt       = document.createElement('option');
    opt.value       = ins.id;
    opt.textContent = ins.nombre;
    selectInsumo.appendChild(opt);
  });

  if (insumoExistente && insumoExistente.id_insumo) {
    selectInsumo.value = insumoExistente.id_insumo;
  }

  tdInsumo.appendChild(selectInsumo);

  // — Celda: cantidad —
  const tdCantidad    = document.createElement('td');
  const inputCantidad = document.createElement('input');
  inputCantidad.type      = 'number';
  inputCantidad.min       = '0.01';
  inputCantidad.step      = '0.01';
  inputCantidad.className = 'ed-cantidad';
  if (insumoExistente && insumoExistente.cantidad_necesaria) {
    inputCantidad.value = insumoExistente.cantidad_necesaria;
  }
  tdCantidad.appendChild(inputCantidad);

  // — Celda: unidad (solo lectura — viene siempre del insumo seleccionado) —
  // La unidad de medida es una propiedad fija del insumo, definida únicamente
  // en "Gestión de Stock". Acá solo se refleja, nunca se edita manualmente.
  const tdUnidad     = document.createElement('td');
  const inputUnidad  = document.createElement('input');
  inputUnidad.type      = 'text';
  inputUnidad.className = 'ed-unidad input-readonly';
  inputUnidad.readOnly  = true;
  inputUnidad.disabled  = true;
  inputUnidad.tabIndex  = -1;

  function mostrarUnidadDeInsumo(idInsumo) {
    const ins = todosInsumos.find(function (i) { return String(i.id) === String(idInsumo); });
    inputUnidad.value = ins ? (ins.unidad_medida || '') : '';
  }

  if (insumoExistente && insumoExistente.id_insumo) {
    mostrarUnidadDeInsumo(insumoExistente.id_insumo);
  }
  // Si el insumo fue borrado del catálogo, se conserva la unidad histórica de la receta
  if (!inputUnidad.value && insumoExistente && insumoExistente.unidad_medida) {
    inputUnidad.value = insumoExistente.unidad_medida;
  }

  // Al cambiar el insumo, la unidad se autocompleta con la del insumo seleccionado
  selectInsumo.addEventListener('change', function () {
    mostrarUnidadDeInsumo(this.value);
  });

  tdUnidad.appendChild(inputUnidad);

  // — Celda: botón eliminar fila —
  const tdEliminar = document.createElement('td');
  const btnElim    = document.createElement('button');
  btnElim.className   = 'btn-fila-borrar';
  btnElim.textContent = 'Eliminar';
  btnElim.type        = 'button';
  btnElim.onclick     = function () { tbody.removeChild(tr); };
  tdEliminar.appendChild(btnElim);

  tr.appendChild(tdInsumo);
  tr.appendChild(tdCantidad);
  tr.appendChild(tdUnidad);
  tr.appendChild(tdEliminar);
  tbody.appendChild(tr);
}

// ==========================================
// GUARDAR (crea producto + receta, o actualiza receta existente)
// ==========================================
async function guardarReceta() {
  const errEl = document.getElementById('edError');
  errEl.style.display = 'none';

  // Recolectar filas de insumos
  const filas   = document.getElementById('edInsumosBody').querySelectorAll('tr');
  const insumos = [];
  let hayError  = false;

  filas.forEach(function (fila) {
    const selectInsumo  = fila.querySelector('.ed-insumo');
    const inputCantidad = fila.querySelector('.ed-cantidad');

    const idInsumo = selectInsumo  ? selectInsumo.value           : '';
    const cantidad = inputCantidad ? parseFloat(inputCantidad.value) : 0;

    // La unidad nunca se toma de un campo editable: siempre se busca la
    // oficial del insumo (fuente de verdad: Gestión de Stock).
    const insumo = todosInsumos.find(function (i) { return String(i.id) === String(idInsumo); });
    const unidad = insumo ? (insumo.unidad_medida || '') : '';

    if (!idInsumo || !unidad || isNaN(cantidad) || cantidad <= 0) {
      hayError = true;
    }

    insumos.push({
      id_insumo:          parseInt(idInsumo),
      cantidad_necesaria: cantidad,
      unidad_medida:      unidad
    });
  });

  if (insumos.length === 0) {
    mostrarError('Agregá al menos un insumo.');
    return;
  }

  if (hayError) {
    mostrarError('Completá todos los campos (insumo, cantidad mayor a cero).');
    return;
  }

  if (modoCreacion) {
    await guardarNuevoProductoConReceta(insumos);
  } else {
    await actualizarRecetaExistente(insumos);
  }
}

// --- MODO CREACIÓN: POST /api/productos/con-receta ---
async function guardarNuevoProductoConReceta(insumos) {
  const nombre    = document.getElementById('edNombre').value.trim();
  const idPlan    = document.getElementById('edPlan').value;
  const precio    = document.getElementById('edPrecio').value    !== '' ? parseFloat(document.getElementById('edPrecio').value)    : null;
  const descuento = document.getElementById('edDescuento').value !== '' ? parseFloat(document.getElementById('edDescuento').value) : null;

  if (!nombre) { mostrarError('Ingresá el nombre del producto.'); return; }
  if (!idPlan) { mostrarError('Seleccioná un plan.');             return; }
  if (precio === null || isNaN(precio) || precio < 0) { mostrarError('Ingresá un precio válido.'); return; }

  const idCocinero = document.getElementById('edCocinero').value || null; // opcional

  try {
    const response = await apiFetch('/api/productos/con-receta', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token') // lo exige el servidor si hay cocinero
      },
      body:    JSON.stringify({ nombre, id_plan: parseInt(idPlan), precio, descuento, id_cocinero: idCocinero, insumos })
    });

    const data = await response.json();
    if (response.status === 401) throw new Error('Tu sesión expiró. Volvé a iniciar sesión.');
    if (!response.ok) throw new Error(data.error || 'Error en el servidor');

    if (imagenPendiente) await subirImagenProducto(data.producto.id);

    cerrarModalEditar();
    await fetchRecetas();

  } catch (error) {
    console.error('Error al crear producto y receta:', error);
    mostrarError('Error: ' + error.message);
  }
}

// --- MODO EDICIÓN: POST /api/recetas ---
async function actualizarRecetaExistente(insumos) {
  if (!idProductoEditando) { mostrarError('No hay producto seleccionado.'); return; }

  const precio    = document.getElementById('edPrecio').value    !== '' ? parseFloat(document.getElementById('edPrecio').value)    : null;
  const descuento = document.getElementById('edDescuento').value !== '' ? parseFloat(document.getElementById('edDescuento').value) : null;

  // El plan (28/10): si se eligió otro, se pregunta y se cambia PRIMERO. Si eso falla, no se guarda nada más.
  const idPlanElegido = document.getElementById('edPlan').value;
  if (!idPlanElegido) { mostrarError('Seleccioná un plan.'); return; }
  const cambioElPlan = idPlanElegido !== planOriginal;
  if (cambioElPlan) {
    const pregunta = 'El código va a cambiar de ' + (codigoOriginal || 'sin código') + ' a ' + (codigoPrevisto || 'uno nuevo') + '. ¿Seguimos?';
    if (!confirm(pregunta)) return;                             // si dice que no, no se guarda nada
    const resultadoPlan = await cambiarPlanDelPlato(idProductoEditando, parseInt(idPlanElegido, 10));
    if (resultadoPlan.error) { mostrarError(resultadoPlan.error); return; }
    // Si en el medio otro plato tomó ese número, el servidor dio el siguiente: se avisa cuál quedó
    if (codigoPrevisto && resultadoPlan.codigo_nuevo !== codigoPrevisto) {
      alert('El código quedó ' + resultadoPlan.codigo_nuevo + ' (el ' + codigoPrevisto + ' lo tomó otro plato mientras editabas).');
    }
  }

  try {
    const response = await apiFetch('/api/recetas', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_producto: idProductoEditando, precio, descuento, insumos })
    });

    if (!response.ok) throw new Error('Error en el servidor');

    if (imagenPendiente) await subirImagenProducto(idProductoEditando);

  } catch (error) {
    console.error('Error al guardar receta:', error);
    mostrarError('Error al guardar. Intentá de nuevo.');
    return;
  }

  // Cocinero: solo si cambió, con el mismo endpoint que usa Asignar Cocineros
  const idCocinero = document.getElementById('edCocinero').value;
  if (idCocinero !== cocineroOriginal) {
    const errorCocinero = await guardarCocineroDelPlato(idProductoEditando, idCocinero || null);
    if (errorCocinero) {
      // La receta ya quedó guardada: se avisa y el modal queda abierto para reintentar
      imagenPendiente = null; // la imagen ya se subió
      mostrarError('La receta se guardó, pero no se pudo asignar el cocinero: ' + errorCocinero);
      await fetchRecetas();
      return;
    }
  }

  cerrarModalEditar();
  await fetchRecetas();
}

// cambiarPlanDelPlato → pasa el plato a otro plan (PUT /api/productos/:id/plan): el servidor le da el código nuevo
// ENTRADA: idProducto y idPlan (el plan nuevo)
// SALIDA:  { codigo_anterior, codigo_nuevo } si salió bien, o { error: 'mensaje' }
// Ej: (4, 1) → { codigo_anterior: 'F3', codigo_nuevo: 'K5' }
async function cambiarPlanDelPlato(idProducto, idPlan) {
  try {
    const response = await apiFetch('/api/productos/' + idProducto + '/plan', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_plan: idPlan })
    });
    const data = await response.json().catch(function () { return {}; });   // si no es JSON, un objeto vacío
    if (response.ok) return data;
    return { error: data.error || 'No se pudo cambiar el plan.' };
  } catch (error) {
    console.error('Error al cambiar el plan:', error);
    return { error: 'No se pudo conectar con el servidor.' };
  }
}

// PUT /api/productos/:id/cocinero → devuelve null si salió bien, o el mensaje de error
async function guardarCocineroDelPlato(idProducto, idCocinero) {
  try {
    const response = await apiFetch('/api/productos/' + idProducto + '/cocinero', {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      },
      body:    JSON.stringify({ id_cocinero: idCocinero })
    });

    if (response.ok) return null;
    if (response.status === 401) return 'Tu sesión expiró. Volvé a iniciar sesión.';
    const data = await response.json().catch(function () { return {}; });
    return data.error || 'Error en el servidor';
  } catch (error) {
    console.error('Error al asignar cocinero:', error);
    return 'No se pudo conectar con el servidor';
  }
}

function mostrarError(texto) {
  const errEl = document.getElementById('edError');
  errEl.textContent    = texto;
  errEl.style.display  = 'block';
}

// ==========================================
// BORRAR RECETA
// ==========================================
async function borrarReceta(idProducto) {
  const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
  if (!receta) return;

  const confirmar = confirm('¿Eliminar la receta de "' + receta.nombre_producto + '"? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  try {
    const response = await apiFetch('/api/recetas/' + idProducto, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error en el servidor');
    await fetchRecetas();
  } catch (error) {
    console.error('Error al borrar receta:', error);
    alert('Error al eliminar. Intentá de nuevo.');
  }
}

// ==========================================
// ABREVIATURAS DE LOS PLANES (28/10)
// ==========================================

// planesAbreviaturas: los planes que muestra la ventana, por número (para guardar sin volver a pedirlos)
let planesAbreviaturas = {};

// abrirAbreviaturas → abre la ventana con cada plan, su abreviatura y el código que tendría su próximo plato
// ENTRADA: nada
// SALIDA:  nada. Pide GET /api/planes y dibuja una fila por plan: "MANTENIMIENTO · [F] · F4 · Guardar"
async function abrirAbreviaturas() {
  const tbody = document.getElementById('listaAbreviaturas');
  tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Cargando planes...</td></tr>';
  document.getElementById('abResultado').hidden = true;
  document.getElementById('modalAbreviaturas').style.display = 'block';

  let planes = [];
  try {
    const response = await apiFetch('/api/planes');
    if (!response.ok) throw new Error('HTTP ' + response.status);   // si el servidor dio error, va al catch
    planes = await response.json();
  } catch (error) {
    console.error('Error al cargar los planes:', error);
    tbody.innerHTML = '<tr><td colspan="4" class="loading-text">No se pudieron cargar los planes.</td></tr>';
    return;
  }

  // Una fila por plan. El nombre y la abreviatura vienen de la base: escHtml
  planesAbreviaturas = {};
  let html = '';
  planes.forEach(function (plan) {
    planesAbreviaturas[plan.id] = plan;
    const abreviatura = plan.codigo_plan || '';
    const proximo = abreviatura + ((Number(plan.ultimo_numero_plato) || 0) + 1);      // ej: "F4"
    const celdaProximo = abreviatura ? pastillaCodigo(proximo, '') : '—';              // sin abreviatura: "—"
    html += '<tr>'
      + '<td>' + escHtml(plan.nombre) + '</td>'
      + '<td><input type="text" class="input-texto casillero-abreviatura" id="abPlan' + Number(plan.id) + '" maxlength="4"'
      + ' value="' + escHtml(abreviatura) + '" aria-label="Abreviatura de ' + escHtml(plan.nombre) + '"></td>'
      + '<td>' + celdaProximo + '</td>'
      + '<td><button type="button" class="btn-guardar-abreviatura" onclick="guardarAbreviatura(' + Number(plan.id) + ')">Guardar</button></td>'
      + '</tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="4" class="loading-text">No hay planes activos.</td></tr>';
}

// guardarAbreviatura → guarda la abreviatura de un plan; los códigos de sus platos cambian con el mismo número
// ENTRADA: idPlan
// SALIDA:  nada. Pregunta "Los códigos de MANTENIMIENTO pasan de F… a M… (F3 → M3). ¿Seguimos?", manda
//          PUT /api/planes/:id/abreviatura y muestra el resultado ("✓ Listo: 3 platos pasaron a M…") o el error.
// Ej: plan 2, de "F" a "m" → se manda "M"; F1, F2, F3 pasan a M1, M2, M3.
// El servidor vuelve a controlar el formato y que no la use otro plan.
async function guardarAbreviatura(idPlan) {
  const plan      = planesAbreviaturas[idPlan];
  const resultado = document.getElementById('abResultado');
  if (!plan) return;

  // 1. La abreviatura escrita: de 1 a 4 letras, en mayúscula
  const nueva    = document.getElementById('abPlan' + idPlan).value.trim().toUpperCase();
  const anterior = plan.codigo_plan || '';
  const formatoMal = !/^[A-Z]{1,4}$/.test(nueva);
  if (formatoMal) {
    resultado.className   = 'resultado-abreviaturas resultado-error';
    resultado.textContent = 'La abreviatura de ' + plan.nombre + ' tiene que tener de 1 a 4 letras, sin números.';
    resultado.hidden      = false;
    return;
  }
  if (nueva === anterior) return;                               // no cambió: nada

  // 2. Se pregunta (con un ejemplo: el último número que se dio en el plan)
  const ejemplo  = Number(plan.ultimo_numero_plato) || 1;
  const pregunta = anterior
    ? 'Los códigos de los platos de ' + plan.nombre + ' pasan de ' + anterior + '… a ' + nueva + '… (' + anterior + ejemplo + ' → ' + nueva + ejemplo + '). ¿Seguimos?'
    : 'La abreviatura de ' + plan.nombre + ' va a ser ' + nueva + '. ¿Seguimos?';
  if (!confirm(pregunta)) return;

  // 3. Se guarda
  try {
    const response = await apiFetch('/api/planes/' + idPlan + '/abreviatura', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ abreviatura: nueva })
    });
    const data = await response.json().catch(function () { return {}; });   // si no es JSON, un objeto vacío
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la abreviatura.');

    const palabraPlatos = data.platos_cambiados === 1 ? 'plato pasó' : 'platos pasaron';
    resultado.className   = 'resultado-abreviaturas resultado-ok';
    resultado.textContent = '✓ Listo: ' + plan.nombre + ' ahora es ' + data.abreviatura_nueva + ' (' + data.platos_cambiados + ' ' + palabraPlatos + ' a ' + data.abreviatura_nueva + '…).';
    await abrirAbreviaturas();                                   // la ventana, con lo nuevo…
    resultado.hidden = false;                                    // …y el resultado a la vista
    await fetchRecetas();                                        // y la lista con los códigos nuevos
  } catch (error) {
    console.error('Error al guardar la abreviatura:', error);
    resultado.className   = 'resultado-abreviaturas resultado-error';
    resultado.textContent = error.message;
    resultado.hidden      = false;
  }
}

// cerrarAbreviaturas → cierra la ventana (la ✕, "Cerrar" o un clic afuera)
function cerrarAbreviaturas() {
  document.getElementById('modalAbreviaturas').style.display = 'none';
}
