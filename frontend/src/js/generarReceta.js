// Variables globales
let todasRecetas   = [];  // todas las recetas traídas del servidor
let todosInsumos   = [];  // insumos disponibles para el select del modal
let todosProductos = [];  // productos activos para el select del modal
let idProductoEditando = null; // null = nueva receta, number = editar

// ==========================================
// INICIO: cuando el HTML está listo
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  fetchRecetas();
  iniciarFiltros();

  // Cerrar modales al hacer click en el fondo oscuro
  window.addEventListener('click', function (e) {
    if (e.target === document.getElementById('modalDetalles')) cerrarModalDetalles();
    if (e.target === document.getElementById('modalEditar'))   cerrarModalEditar();
  });

  // Botón "Editar" dentro del modal de detalles
  document.getElementById('btnEditarDesdeDetalles').addEventListener('click', function () {
    const id = idProductoEditando;
    cerrarModalDetalles();
    abrirModalEditar(id);
  });
});

// ==========================================
// TRAER RECETAS DEL SERVIDOR
// NAVEGADOR → SERVIDOR → SUPABASE
// ==========================================
async function fetchRecetas() {
  const tbody = document.getElementById('recetasBody');

  try {
    const response = await fetch('/api/recetas');
    const data     = await response.json();

    todasRecetas = data;

    cargarPlanesEnFiltro();
    renderizarRecetas(todasRecetas);

  } catch (error) {
    console.error('Error al traer recetas:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// ==========================================
// DIBUJAR LA TABLA
// ==========================================
function renderizarRecetas(recetas) {
  const tbody = document.getElementById('recetasBody');
  tbody.innerHTML = '';

  if (recetas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No se encontraron recetas</td></tr>';
    return;
  }

  recetas.forEach(function (receta) {
    const tr = document.createElement('tr');

    // — Columna ID —
    const tdId = document.createElement('td');
    tdId.style.fontWeight = 'bold';
    tdId.textContent = '#' + String(receta.id_producto).padStart(3, '0');

    // — Columna Plan —
    const tdPlan = document.createElement('td');
    if (receta.plan) {
      tdPlan.textContent = receta.plan.nombre + ' (' + receta.plan.codigo + ')';
    } else {
      tdPlan.textContent = '-';
    }

    // — Columna Nombre Producto —
    const tdNombre = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = receta.nombre_producto || '-';
    tdNombre.appendChild(strong);

    // — Columna Receta (resumen) —
    const tdReceta = document.createElement('td');
    tdReceta.className = 'receta-resumen';
    tdReceta.textContent = armarResumenReceta(receta.insumos || []);

    // — Columna Cantidad Posible —
    const tdCant = document.createElement('td');
    const posible = calcularCantidadPosible(receta.insumos || []);
    const spanCant = document.createElement('span');
    spanCant.textContent = posible;

    if (posible === 0) {
      spanCant.className = 'cant-cero';
    } else if (posible < 5) {
      spanCant.className = 'cant-baja';
    } else {
      spanCant.className = 'cant-ok';
    }
    tdCant.appendChild(spanCant);

    // — Columna Acciones —
    const tdAcciones = document.createElement('td');

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

    tdAcciones.appendChild(btnDetalle);
    tdAcciones.appendChild(btnEditar);
    tdAcciones.appendChild(btnBorrar);

    tr.appendChild(tdId);
    tr.appendChild(tdPlan);
    tr.appendChild(tdNombre);
    tr.appendChild(tdReceta);
    tr.appendChild(tdCant);
    tr.appendChild(tdAcciones);

    tbody.appendChild(tr);
  });
}

// ==========================================
// CALCULAR CANTIDAD POSIBLE
// Por cada insumo: stock_actual / cantidad_necesaria
// Se toma el mínimo — cuántas unidades se pueden preparar
// ==========================================
function calcularCantidadPosible(insumos) {
  if (!insumos || insumos.length === 0) return 0;

  let posible = Infinity;

  for (let i = 0; i < insumos.length; i++) {
    const ins = insumos[i];

    if (!ins.cantidad_necesaria || ins.cantidad_necesaria <= 0) {
      return 0;
    }

    const cantConEsteInsumo = Math.floor(ins.stock_actual / ins.cantidad_necesaria);

    if (cantConEsteInsumo < posible) {
      posible = cantConEsteInsumo;
    }
  }

  if (!isFinite(posible)) return 0;
  return posible;
}

// ==========================================
// ARMAR RESUMEN DE RECETA
// Muestra los primeros 3 insumos y un "+N más" si hay más
// ==========================================
function armarResumenReceta(insumos) {
  if (!insumos || insumos.length === 0) return 'Sin insumos';

  const primeros = insumos.slice(0, 3);
  const partes   = primeros.map(function (ins) {
    return ins.nombre_insumo + ' ' + ins.cantidad_necesaria + ' ' + ins.unidad_medida;
  });

  const resumen = partes.join(', ');

  if (insumos.length > 3) {
    return resumen + ' … (+' + (insumos.length - 3) + ')';
  }

  return resumen;
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

    const codigo = receta.plan.codigo;
    const yaEsta = planesVistos.indexOf(codigo) !== -1;

    if (!yaEsta) {
      planesVistos.push(codigo);
      const option = document.createElement('option');
      option.value = codigo;
      option.textContent = receta.plan.nombre + ' (' + codigo + ')';
      select.appendChild(option);
    }
  });
}

function iniciarFiltros() {
  const filtroNombre = document.getElementById('filtroNombre');
  const filtroPlan   = document.getElementById('filtroPlan');

  function aplicarFiltros() {
    const texto = filtroNombre.value.toLowerCase();
    const plan  = filtroPlan.value;

    const filtradas = todasRecetas.filter(function (receta) {
      const cumpleNombre = receta.nombre_producto.toLowerCase().includes(texto);

      let cumplePlan = true;
      if (plan) {
        cumplePlan = receta.plan && receta.plan.codigo === plan;
      }

      return cumpleNombre && cumplePlan;
    });

    renderizarRecetas(filtradas);
  }

  filtroNombre.addEventListener('input', aplicarFiltros);
  filtroPlan.addEventListener('change', aplicarFiltros);
}

// ==========================================
// MODAL DETALLES
// ==========================================
function abrirModalDetalles(idProducto) {
  const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
  if (!receta) return;

  idProductoEditando = idProducto;

  document.getElementById('detTitulo').textContent = 'Receta de ' + receta.nombre_producto;
  document.getElementById('detProducto').textContent = receta.nombre_producto || '-';

  if (receta.plan) {
    document.getElementById('detPlan').textContent = receta.plan.nombre + ' (' + receta.plan.codigo + ')';
  } else {
    document.getElementById('detPlan').textContent = '-';
  }

  // Badge cantidad posible
  const posible    = calcularCantidadPosible(receta.insumos || []);
  const spanPosible = document.getElementById('detPosible');
  spanPosible.textContent = posible + ' unidades';

  if (posible === 0) {
    spanPosible.className = 'cant-cero';
  } else if (posible < 5) {
    spanPosible.className = 'cant-baja';
  } else {
    spanPosible.className = 'cant-ok';
  }

  // Tabla de insumos
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
      const tr = document.createElement('tr');

      const tdNombre = document.createElement('td');
      tdNombre.textContent = ins.nombre_insumo || '-';

      const tdCant = document.createElement('td');
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
// MODAL NUEVA / EDITAR RECETA
// ==========================================
function abrirModalNuevaReceta() {
  abrirModalEditar(null);
}

async function abrirModalEditar(idProducto) {
  idProductoEditando = idProducto;
  document.getElementById('edError').style.display = 'none';
  document.getElementById('edInsumosBody').innerHTML = '';

  if (idProducto === null) {
    document.getElementById('edTitulo').textContent = 'Nueva Receta';
  } else {
    const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
    if (receta) {
      document.getElementById('edTitulo').textContent = 'Editar Receta — ' + receta.nombre_producto;
    }
  }

  // Cargar datos del servidor antes de mostrar el modal
  // NAVEGADOR → SERVIDOR → SUPABASE
  await cargarProductosEnSelect();
  await cargarInsumosDisponibles();

  // Si es edición, preseleccionar el producto y cargar sus insumos
  if (idProducto !== null) {
    document.getElementById('edProducto').value = idProducto;

    const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
    if (receta && receta.insumos) {
      receta.insumos.forEach(function (ins) { agregarFilaInsumo(ins); });
    }
  }

  document.getElementById('modalEditar').style.display = 'block';
}

function cerrarModalEditar() {
  document.getElementById('modalEditar').style.display = 'none';
  document.getElementById('edInsumosBody').innerHTML = '';
  idProductoEditando = null;
}

// ==========================================
// CARGAR PRODUCTOS EN EL SELECT DEL MODAL
// NAVEGADOR → SERVIDOR → SUPABASE
// ==========================================
async function cargarProductosEnSelect() {
  const select = document.getElementById('edProducto');
  select.innerHTML = '<option value="">Cargando...</option>';

  try {
    const response = await fetch('/api/v1/productos');
    todosProductos = await response.json();

    select.innerHTML = '<option value="">Seleccione un producto...</option>';

    todosProductos.forEach(function (prod) {
      const option = document.createElement('option');
      option.value = prod.id;
      option.textContent = prod.nombre;
      select.appendChild(option);
    });

  } catch (error) {
    console.error('Error al cargar productos:', error);
    select.innerHTML = '<option value="">Error al cargar</option>';
  }
}

// ==========================================
// CARGAR INSUMOS DISPONIBLES (para los selects de la tabla)
// NAVEGADOR → SERVIDOR → SUPABASE
// ==========================================
async function cargarInsumosDisponibles() {
  try {
    const response = await fetch('/api/insumos');
    todosInsumos = await response.json();
  } catch (error) {
    console.error('Error al cargar insumos:', error);
    todosInsumos = [];
  }
}

// ==========================================
// AGREGAR FILA EDITABLE A LA TABLA DEL MODAL
// insumoExistente puede ser null (fila vacía) o un objeto con datos
// ==========================================
function agregarFilaInsumo(insumoExistente) {
  const tbody = document.getElementById('edInsumosBody');
  const tr    = document.createElement('tr');

  // — Celda: select de insumo —
  const tdInsumo    = document.createElement('td');
  const selectInsumo = document.createElement('select');
  selectInsumo.className = 'ed-insumo';

  const optVacio = document.createElement('option');
  optVacio.value = '';
  optVacio.textContent = 'Seleccionar insumo...';
  selectInsumo.appendChild(optVacio);

  todosInsumos.forEach(function (ins) {
    const opt = document.createElement('option');
    opt.value = ins.id;
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
  inputCantidad.min       = '0';
  inputCantidad.step      = '0.01';
  inputCantidad.className = 'ed-cantidad';
  if (insumoExistente && insumoExistente.cantidad_necesaria) {
    inputCantidad.value = insumoExistente.cantidad_necesaria;
  }
  tdCantidad.appendChild(inputCantidad);

  // — Celda: select de unidad —
  const tdUnidad    = document.createElement('td');
  const selectUnidad = document.createElement('select');
  selectUnidad.className = 'ed-unidad';

  const unidades = ['g', 'kg', 'ml', 'lts', 'u'];
  unidades.forEach(function (u) {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    selectUnidad.appendChild(opt);
  });

  if (insumoExistente && insumoExistente.unidad_medida) {
    selectUnidad.value = insumoExistente.unidad_medida;
  }

  tdUnidad.appendChild(selectUnidad);

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
// GUARDAR RECETA
// POST /api/recetas → NAVEGADOR → SERVIDOR → SUPABASE
// ==========================================
async function guardarReceta() {
  const errEl     = document.getElementById('edError');
  errEl.style.display = 'none';

  const idProducto = document.getElementById('edProducto').value;

  if (!idProducto) {
    errEl.textContent = 'Seleccioná un producto.';
    errEl.style.display = 'block';
    return;
  }

  // Recolectar filas de la tabla editable
  const filas   = document.getElementById('edInsumosBody').querySelectorAll('tr');
  const insumos = [];
  let   hayError = false;

  filas.forEach(function (fila) {
    const selectInsumo  = fila.querySelector('.ed-insumo');
    const inputCantidad = fila.querySelector('.ed-cantidad');
    const selectUnidad  = fila.querySelector('.ed-unidad');

    const idInsumo = selectInsumo  ? selectInsumo.value  : '';
    const cantidad = inputCantidad ? parseFloat(inputCantidad.value) : 0;
    const unidad   = selectUnidad  ? selectUnidad.value  : '';

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
    errEl.textContent = 'Agregá al menos un insumo.';
    errEl.style.display = 'block';
    return;
  }

  if (hayError) {
    errEl.textContent = 'Completá todos los campos de cada insumo.';
    errEl.style.display = 'block';
    return;
  }

  try {
    // NAVEGADOR → SERVIDOR → SUPABASE
    const response = await fetch('/api/recetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_producto: parseInt(idProducto),
        insumos: insumos
      })
    });

    if (!response.ok) throw new Error('Error en el servidor');

    cerrarModalEditar();
    await fetchRecetas(); // recargar tabla con los datos actualizados

  } catch (error) {
    console.error('Error al guardar receta:', error);
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
}

// ==========================================
// BORRAR RECETA
// DELETE /api/recetas/:idProducto → NAVEGADOR → SERVIDOR → SUPABASE
// ==========================================
async function borrarReceta(idProducto) {
  const receta = todasRecetas.find(function (r) { return r.id_producto === idProducto; });
  if (!receta) return;

  const confirmar = confirm('¿Eliminar la receta de "' + receta.nombre_producto + '"? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  try {
    // NAVEGADOR → SERVIDOR → SUPABASE
    const response = await fetch('/api/recetas/' + idProducto, { method: 'DELETE' });

    if (!response.ok) throw new Error('Error en el servidor');

    await fetchRecetas(); // recargar tabla

  } catch (error) {
    console.error('Error al borrar receta:', error);
    alert('Error al eliminar. Intentá de nuevo.');
  }
}
