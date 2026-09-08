// Variables globales
let todasRecetas    = [];
let todosInsumos    = [];
let todosProductos  = [];
let todasCategorias = [];
let idProductoEditando = null;
let modoCreacion       = false;

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
    const response = await fetch('/api/recetas');
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
function renderizarRecetas(recetas) {
  const tbody = document.getElementById('recetasBody');
  tbody.innerHTML = '';

  if (recetas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-text">No existen productos que cumplan los filtros especificados</td></tr>';
    return;
  }

  recetas.forEach(function (receta) {
    const tr = document.createElement('tr');

    // — ID —
    const tdId = document.createElement('td');
    tdId.style.fontWeight = 'bold';
    tdId.textContent = '#' + String(receta.id_producto).padStart(3, '0');

    // — Código de Plato —
    const tdCodigo = document.createElement('td');
    tdCodigo.className   = 'td-codigo';
    tdCodigo.textContent = receta.codigo_plato || '-';

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

    tr.appendChild(tdId);
    tr.appendChild(tdCodigo);
    tr.appendChild(tdCategoria);
    tr.appendChild(tdPlan);
    tr.appendChild(tdNombre);
    tr.appendChild(tdPrecio);
    tr.appendChild(tdDescuento);
    tr.appendChild(tdCant);
    tr.appendChild(tdAcciones);
    tbody.appendChild(tr);
  });
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

function armarResumenReceta(insumos) {
  if (!insumos || insumos.length === 0) return 'Sin insumos';

  const partes = insumos.slice(0, 3).map(function (ins) {
    return ins.nombre_insumo + ' ' + ins.cantidad_necesaria + ' ' + ins.unidad_medida;
  });

  const resumen = partes.join(', ');
  return insumos.length > 3 ? resumen + ' … (+' + (insumos.length - 3) + ')' : resumen;
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
    const response = await fetch('/api/productos/' + idProducto + '/imagen', {
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
  limpiarImagen();

  const planSelect = document.getElementById('edPlan');
  planSelect.innerHTML = '<option value="">Seleccioná una categoría primero</option>';
  planSelect.disabled  = true;

  Promise.all([
    cargarCategoriasEnSelect(),
    cargarInsumosDisponibles()
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

  await cargarInsumosDisponibles();

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
  limpiarImagen();
  idProductoEditando = null;
  modoCreacion       = false;
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
async function actualizarCodigoAutomatico(idPlan) {
  const codigoInput     = document.getElementById('edCodigo');
  codigoInput.value     = 'Calculando...';
  codigoInput.classList.add('calculando');

  try {
    const response = await fetch('/api/planes/' + idPlan + '/siguiente-codigo');
    const data     = await response.json();

    codigoInput.value = response.ok ? data.codigo : '';
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
    const response = await fetch('/api/insumos');
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

  const yaExiste = todasRecetas.some(function (r) {
    return (r.nombre_producto || '').trim().toLowerCase() === nombre.toLowerCase();
  });
  if (yaExiste) {
    mostrarError('Ya existe una receta con este nombre. Por favor, ingresá un nombre diferente.');
    return;
  }

  try {
    const response = await fetch('/api/productos/con-receta', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nombre, id_plan: parseInt(idPlan), precio, descuento, insumos })
    });

    const data = await response.json();
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

  try {
    const response = await fetch('/api/recetas', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_producto: idProductoEditando, precio, descuento, insumos })
    });

    if (!response.ok) throw new Error('Error en el servidor');

    if (imagenPendiente) await subirImagenProducto(idProductoEditando);

    cerrarModalEditar();
    await fetchRecetas();

  } catch (error) {
    console.error('Error al guardar receta:', error);
    mostrarError('Error al guardar. Intentá de nuevo.');
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
    const response = await fetch('/api/recetas/' + idProducto, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error en el servidor');
    await fetchRecetas();
  } catch (error) {
    console.error('Error al borrar receta:', error);
    alert('Error al eliminar. Intentá de nuevo.');
  }
}
