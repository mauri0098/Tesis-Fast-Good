let todosInsumos = []; //array para todos los insumos 

document.addEventListener('DOMContentLoaded', () => {//CUAANDO TODO EL HTML ESTE CARGADO SE EJECUTA ESTA FUNCION QUE TRAE LOS INSUMOS Y INICIA LOS FILTROS
  fetchInsumos();   
  iniciarFiltros();
});

// ==========================================
// TRAER INSUMOS DEL SERVIDOR
// ==========================================w

async function fetchInsumos() {//Un fetch aclara lo que es un fetch
  const tbody = document.getElementById('stockBody');//esto selecciona una parte del html que vamos a trabjar

  try {//usamos el try catch para manejar errores por si el servidor no reponde 
   
    const response = await apiFetch('/api/insumos');// AWAIT ESPERABA UNA REPUESTA, ACA LO QUE HACEMOS ES TRAER TODOS LOS INSUMOS DE LA BASE DE DATOS 
    const data = await response.json();//Y NOS VA A REPONDER CON UN JSON PARA QUE LO PODAMOS USAR EN JS 

    todosInsumos = data; // PONEMOS LOS INSUMOS EN EL ARRAY

    
    cargarCategoriasEnFiltro();//ESTO DEBE SER UNA FUNCION PARA LOS FILTROS NOSE QUE HACE ACA 

    
    renderizarInsumos(todosInsumos);//REDERIZAMOS LOS INSUMOS CON ESTA FUNCION DE MAS ABAJO QUE HACE LA TABLA tr td etc

  } catch (error) {// si hay un error al traer los insumos, lo mostramos en consola y en la tabla
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="8" class="celda-error-carga">Error al conectar con el servidor</td></tr>';
  }
}

// ==========================================
// DIBUJAR LA TABLA
// ==========================================

function renderizarInsumos(insumos) {//funcion para hacer la tabla de insumos. recibe un array de insumos (todos o filtrados) y los dibuja paginados de a 15 en la tabla del html
  crearPaginacion({
    datos: insumos,
    porPagina: 15,
    contenedorTabla: document.getElementById('stockBody'),//la parte del html donde va la tabla de insumos
    contenedorPaginacion: document.getElementById('paginacion'),//el div de los botones anterior / siguiente
    funcionRenderFila: crearFilaInsumo,
    filaVacia: '<tr><td colspan="8" class="loading-text">No se encontraron insumos</td></tr>'//si no hay ningun insumo se muesta este mensaje
  });
}

//DUDA RAPIDA SE MEZCLA EL HTML ACA CON EL JAVASCRIP ESTA BIEN ESTO O TIENE QUE VENIR EN VARIABLES

function crearFilaInsumo(insumo) {// SE ARMA LA FILA DE UN INSUMO, LA PAGINACION LLAMA A ESTA FUNCION POR CADA INSUMO DE LA PAGINA
  const tr = document.createElement('tr');// ESTE TR ES CADA FILA DE LA TABLA, SE CREA POR CADA INSUMO

  const codigo = String(insumo.id).padStart(3, '0');   // ej: "005" (29/10: sin el "#" adelante)

  const nombre = insumo.nombre;

  const stockActual = insumo.stock_actual;

  const unidad = insumo.unidad_medida || '-';

  const categoria = insumo.categorias_insumos?.nombre || '-';

  // Fecha de caducidad (puede venir null si el insumo no vence)
  // 28/10: se lee como fecha LOCAL. new Date('2026-10-29') la tomaba como medianoche UTC, que en Argentina son las
  // 21 h del 28: se mostraba un día antes. slice(0, 10) = solo 'AAAA-MM-DD' (por si viniera con hora);
  // parseFechaLocal y fechaDDMMAAAA están en fechas.js. Ej: '2026-10-29' → "29/10/2026"
  let fechaCaducidad;
  if (insumo.fecha_caducidad) {
    fechaCaducidad = fechaDDMMAAAA(parseFechaLocal(String(insumo.fecha_caducidad).slice(0, 10)));
  } else {
    fechaCaducidad = '-';
  }

  const esBajo = insumo.stock_actual <= insumo.stock_minimo;//ESTO ES PARA SABER SI EL STOCK ESTA BAJO O NO, COMPARANDO EL STOCK ACTUAL CON EL MINIMO

  // 28/10: ¿ya venció o vence hoy? Se comparan los días como texto 'AAAA-MM-DD' (así no hay desfase de UTC):
  // hoy es el día LOCAL (fechaLocalISO, de fechas.js). Ej: hoy '2026-10-28' y vence '2026-10-26' → vencido
  const hoyISO = fechaLocalISO(new Date());
  const venceISO = insumo.fecha_caducidad ? String(insumo.fecha_caducidad).slice(0, 10) : '';   // '' = no vence
  const vencido = venceISO !== '' && venceISO < hoyISO;
  const venceHoy = venceISO === hoyISO;

  // El estado, por prioridad: vencido > vence hoy > bajo mínimo > normal (el último "if" que se cumple gana)
  const ESTADOS_INSUMO = {
    vencido:  { texto: 'Vencido',     clase: 'badge-vencido' },     // rojo oscuro
    venceHoy: { texto: 'Vence hoy',   clase: 'badge-vence-hoy' },   // naranja
    bajo:     { texto: 'Bajo mínimo', clase: 'badge-bajo' },
    normal:   { texto: 'Normal',      clase: 'badge-normal' }
  };
  let claveEstado = 'normal';
  if (esBajo) claveEstado = 'bajo';
  if (venceHoy) claveEstado = 'venceHoy';
  if (vencido) claveEstado = 'vencido';
  const estado = ESTADOS_INSUMO[claveEstado].texto;
  const badgeClass = ESTADOS_INSUMO[claveEstado].clase;

  // La fecha en rojo si ya venció o vence hoy (calculado antes: nada de "? :" adentro del HTML)
  const claseFecha = vencido || venceHoy ? 'fecha-vencida' : '';

  if (esBajo) tr.classList.add('row-bajo');

  tr.innerHTML = `
    <td class="celda-codigo-insumo">${codigo}</td>
    <td><strong>${escHtml(nombre)}</strong></td>
    <td class="celda-stock-actual">${stockActual}</td>
    <td>${unidad}</td>
    <td>${categoria}</td>
    <td><span class="${claseFecha}">${fechaCaducidad}</span></td>
    <td><span class="badge-estado ${badgeClass}">${estado}</span></td>
    <td class="td-acciones">
      <div class="acciones-grupo">
        <button class="btn-editar" onclick="abrirModalEditarInsumo(${insumo.id})">✎ Editar</button>
        <button class="btn-borrar" onclick="eliminarInsumo(${insumo.id})">🗑 Eliminar</button>
      </div>
    </td>
  `;

  return tr;
}

// ==========================================
// FILTROS
// ==========================================


// ----------------------------------------------------------------------------
// cargarCategoriasEnFiltro → llena el filtro "Todas las categorías" con TODAS las categorías de la base
// ENTRADA: nada · SALIDA: nada (llena el select y deja elegida la que estaba)
// (11/11) Antes armaba la lista con las categorías de los insumos cargados: una categoría nueva sin
// insumos (ej: "Trigo") no aparecía. Ahora las pide al servidor, como el modal de Incorporar.
// ----------------------------------------------------------------------------
async function cargarCategoriasEnFiltro() {
  const select = document.getElementById('filtroCategoria');
  const elegida = select.value;   // la que estaba elegida, para no perderla al recargar

  try {
    const res = await apiFetch('/api/categorias-insumos');
    if (!res.ok) { // ¿el servidor respondió mal? SÍ: 500 → va al catch · NO: 200 → sigue
      throw new Error('HTTP ' + res.status);
    }
    const categorias = await res.json();   // ya vienen ordenadas por nombre

    select.innerHTML = '<option value="">Todas las categorías</option>';
    categorias.forEach(categoria => {
      const option = document.createElement('option');
      option.value = categoria.nombre;        // el filtro compara por nombre (ver aplicarFiltros)
      option.textContent = categoria.nombre;  // textContent: se muestra como texto, nunca como HTML
      select.appendChild(option);
    });
    select.value = elegida;
  } catch {
    // Si falla, queda solo "Todas las categorías": la tabla se sigue viendo entera
    select.innerHTML = '<option value="">Todas las categorías</option>';
  }
}

function iniciarFiltros() {
  const filtroNombre    = document.getElementById('filtroNombre');
  const filtroCategoria = document.getElementById('filtroCategoria');
  const filtroEstado    = document.getElementById('filtroEstado');

  
  function aplicarFiltros() {
    const texto     = filtroNombre.value.toLowerCase();
    const categoria = filtroCategoria.value;
    const estado    = filtroEstado.value;

    
    const filtrados = todosInsumos.filter(insumo => {
      
      const cumpleTexto     = insumo.nombre.toLowerCase().includes(texto);

     
      const cumpleCategoria = !categoria || insumo.categorias_insumos?.nombre === categoria;

      
      const esBajo = insumo.stock_actual <= insumo.stock_minimo;

      let estadoInsumo;
      if (esBajo) {
        estadoInsumo = 'Bajo mínimo';
      } else {
        estadoInsumo = 'Normal';
      }

      const cumpleEstado = !estado || estadoInsumo === estado;

      
      return cumpleTexto && cumpleCategoria && cumpleEstado;
    });

    
    renderizarInsumos(filtrados);
  }

  
  filtroNombre.addEventListener('input', aplicarFiltros);    // se dispara al escribir
  filtroCategoria.addEventListener('change', aplicarFiltros); // se dispara al elegir
  filtroEstado.addEventListener('change', aplicarFiltros);    // se dispara al elegir
}

// ==========================================
// MODAL INCORPORAR NUEVO INSUMO
// ==========================================

async function abrirModalNuevoInsumo() {
  // cargar categorías desde la API
  try {
    const res = await apiFetch('/api/categorias-insumos');
    const categorias = await res.json();
    const select = document.getElementById('niCategoria');
    select.innerHTML = '<option value="">Seleccione una categoría...</option>';
    categorias.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      select.appendChild(option);
    });
  } catch {
    document.getElementById('niCategoria').innerHTML = '<option value="">Error al cargar categorías</option>';
  }

  // limpiar campos
  ['niNombre', 'niStockMinimo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('niUnidad').value = '';
  document.getElementById('niError').style.display = 'none';

  document.getElementById('modalNuevoInsumo').style.display = 'block';
}

function cerrarModalNuevoInsumo() {
  document.getElementById('modalNuevoInsumo').style.display = 'none';
}

async function confirmarNuevoInsumo() {
  const errEl = document.getElementById('niError');

  const nombre      = document.getElementById('niNombre').value.trim();
  const stockMinimo = parseFloat(document.getElementById('niStockMinimo').value);
  const unidad      = document.getElementById('niUnidad').value;
  const idCategoria = document.getElementById('niCategoria').value;

  if (!nombre || !unidad || !idCategoria || isNaN(stockMinimo) || stockMinimo < 0) {
    errEl.textContent = 'Completá todos los campos obligatorios.';
    errEl.style.display = 'block';
    return;
  }

  const hoy = fechaLocalISO(new Date()); // fecha LOCAL (toISOString() pasa a UTC y a las 21 h ya es mañana)

  try {
    const token = localStorage.getItem('fg_token');

    const res = await apiFetch('/api/insumos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        nombre,
        stock_actual: 0,
        stock_minimo: stockMinimo,
        unidad_medida: unidad,
        id_categoria_insumo: parseInt(idCategoria),
        fecha_ingreso: hoy,
        fecha_caducidad: null
      })
    });

    if (!res.ok) throw new Error();

    cerrarModalNuevoInsumo();
    await fetchInsumos();

  } catch {
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
}

window.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalNuevoInsumo')) cerrarModalNuevoInsumo();
  if (e.target === document.getElementById('modalEditarInsumo')) cerrarModalEditarInsumo();
  // ¿tocó afuera del modal de categoría? SÍ: el fondo oscuro → se cierra · NO: adentro del cuadro → sigue abierto
  if (e.target === document.getElementById('modalNuevaCategoria')) {
    cerrarModalNuevaCategoria();
  }
});

// ==========================================
// MODAL CATEGORÍAS DE INSUMOS (11/11): agregar y eliminar
// ==========================================

// ----------------------------------------------------------------------------
// abrirModalNuevaCategoria → abre el modal y llena la lista "Eliminar una categoría"
// ENTRADA: nada (la llama el botón "+ Nueva categoría", y eliminarCategoriaInsumo para refrescar)
// SALIDA:  nada. El campo "Agregar" queda vacío y la lista con todas las categorías.
// Ej: hay "Carnes" y "Trigo" → la lista dice: Elegí una categoría… · Carnes · Trigo
// ----------------------------------------------------------------------------
async function abrirModalNuevaCategoria() {
  const select = document.getElementById('ncEliminar');

  // 1. El modal se abre limpio
  document.getElementById('ncNombre').value = '';
  document.getElementById('ncError').style.display = 'none';
  select.innerHTML = '<option value="">Cargando categorías...</option>';
  document.getElementById('modalNuevaCategoria').style.display = 'block';
  document.getElementById('ncNombre').focus();

  // 2. Se piden las categorías y se ponen en la lista (value = el número, texto = el nombre).
  //    textContent: el nombre viene de la base y se muestra como texto, nunca como HTML.
  try {
    const res = await apiFetch('/api/categorias-insumos');
    if (!res.ok) { // ¿el servidor respondió mal? SÍ: 500 → va al catch · NO: 200 → sigue
      throw new Error('HTTP ' + res.status);
    }
    const categorias = await res.json();

    select.innerHTML = '<option value="">Elegí una categoría...</option>';
    categorias.forEach(categoria => {
      const option = document.createElement('option');
      option.value = categoria.id;
      option.textContent = categoria.nombre;
      select.appendChild(option);
    });
  } catch {
    select.innerHTML = '<option value="">No pudimos cargar las categorías</option>';
  }
}

// ----------------------------------------------------------------------------
// guardarCategoriaInsumo → manda el nombre nuevo al servidor (POST /api/categorias-insumos)
// ENTRADA: nada (lee el campo "Nombre" del modal)
// SALIDA:  nada. Si sale bien, cierra el modal y avisa. Si no, muestra el error en rojo y el modal queda abierto.
// Ej: "Verduras" → se guarda · "verduras" (ya existe "Verduras") → 'Ya existe la categoría "Verduras"'
// El servidor vuelve a controlar todo (vacío, largo, repetida): acá solo se avisa antes lo más común.
// ----------------------------------------------------------------------------
async function guardarCategoriaInsumo() {
  const errorEl = document.getElementById('ncError');
  const nombre = document.getElementById('ncNombre').value.trim();

  // 1. Si no escribió nada, se avisa sin ir al servidor
  if (nombre === '') { // ¿está vacío? SÍ: '' o '   ' · NO: 'Verduras'
    errorEl.textContent = 'Escribí el nombre de la categoría.';
    errorEl.style.display = 'block';
    return;
  }

  // 2. Se manda al servidor. textContent muestra el mensaje como texto, nunca como HTML.
  try {
    const res = await apiFetch('/api/categorias-insumos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre })
    });
    const respuesta = await res.json();

    if (!res.ok) { // ¿el servidor dijo que no? SÍ: 400 (vacío o largo) o 409 (repetida) → su mensaje · NO: 200 → sigue
      errorEl.textContent = respuesta.error;
      errorEl.style.display = 'block';
      return;
    }

    // 3. Salió bien: se cierra, se recarga el filtro y se avisa. Los selects de Incorporar y Editar piden
    //    las categorías cada vez que se abren, así que la nueva ya aparece ahí.
    cerrarModalNuevaCategoria();
    await cargarCategoriasEnFiltro();   // la nueva aparece también en el filtro de arriba
    alert(`Categoría "${respuesta.categoria.nombre}" creada.`);
  } catch {
    errorEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errorEl.style.display = 'block';
  }
}

// ----------------------------------------------------------------------------
// eliminarCategoriaInsumo → borra la categoría elegida en la lista (DELETE /api/categorias-insumos/:id)
// ENTRADA: nada (lee la lista "Eliminar una categoría"; la llama el botón Eliminar)
// SALIDA:  nada. Si sale bien, avisa con el nombre y vuelve a llenar la lista y el filtro.
//          Si la categoría tiene insumos, muestra el mensaje del servidor en rojo y no borra nada.
// Ej: elige "Trigo" (sin insumos) → "¿Eliminar la categoría Trigo?" → 'Categoría "Trigo" eliminada'
//     elige "Carnes" (5 insumos)  → 'La categoría tiene 5 insumos: cambiales la categoría antes de eliminarla'
// ----------------------------------------------------------------------------
async function eliminarCategoriaInsumo() {
  const errorEl = document.getElementById('ncError');
  const select = document.getElementById('ncEliminar');
  const idCategoria = select.value;

  // 1. Tiene que haber elegido una
  if (idCategoria === '') { // ¿no eligió ninguna? SÍ: quedó en "Elegí una categoría…" · NO: eligió "Trigo"
    errorEl.textContent = 'Elegí la categoría que querés eliminar.';
    errorEl.style.display = 'block';
    return;
  }
  // El nombre de la elegida, para la pregunta y el aviso. selectedIndex = cuál está elegida en la lista
  const nombre = select.options[select.selectedIndex].textContent;

  // 2. Se pregunta antes de borrar
  const confirmo = confirm(`¿Eliminar la categoría "${nombre}"?`);
  if (!confirmo) { // ¿dijo que no? SÍ: Cancelar → no se borra · NO: Aceptar → sigue
    return;
  }

  // 3. Se manda al servidor (él controla que no tenga insumos)
  try {
    const res = await apiFetch(`/api/categorias-insumos/${idCategoria}`, { method: 'DELETE' });
    const respuesta = await res.json();

    if (!res.ok) { // ¿el servidor dijo que no? SÍ: 409 (tiene insumos) o 404 → su mensaje · NO: 200 → sigue
      errorEl.textContent = respuesta.error;
      errorEl.style.display = 'block';
      return;
    }

    // 4. Salió bien: se vuelve a llenar la lista del modal y el filtro de arriba, y se avisa con el nombre
    await abrirModalNuevaCategoria();
    await cargarCategoriasEnFiltro();
    alert(respuesta.mensaje);   // ej: 'Categoría "Trigo" eliminada'
  } catch {
    errorEl.textContent = 'Error al eliminar. Intentá de nuevo.';
    errorEl.style.display = 'block';
  }
}

// ----------------------------------------------------------------------------
// cerrarModalNuevaCategoria → cierra el modal de categoría
// ENTRADA: nada · SALIDA: nada (el modal se oculta)
// La usan la ×, el botón Cerrar, el clic afuera y guardarCategoriaInsumo (igual que los otros modales).
// ----------------------------------------------------------------------------
function cerrarModalNuevaCategoria() {
  document.getElementById('modalNuevaCategoria').style.display = 'none';
}

// ==========================================
// ELIMINAR INSUMO
// ==========================================

async function eliminarInsumo(id) {
  const insumo = todosInsumos.find(i => i.id === id);
  if (!insumo) return;

  const confirmar = confirm(`¿Eliminar el insumo "${insumo.nombre}"? Esta acción no se puede deshacer.`);
  if (!confirmar) return;

  try {
    const res  = await apiFetch(`/api/insumos/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarToast(data.error || 'No se pudo eliminar el insumo.', 'error');
      return;
    }

    await fetchInsumos();
    mostrarToast(`Insumo "${insumo.nombre}" eliminado correctamente.`, 'exito');

  } catch {
    mostrarToast('No se pudo conectar con el servidor.', 'error');
  }
}

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

// ==========================================
// MODAL EDITAR INSUMO
// ==========================================

let insumoEditandoId = null; // id del insumo que se está editando actualmente

async function abrirModalEditarInsumo(id) {
  const insumo = todosInsumos.find(i => i.id === id);
  if (!insumo) return;

  insumoEditandoId = id;
  const errEl = document.getElementById('eiError');
  errEl.style.display = 'none';

  // cargar categorías desde la API y preseleccionar la actual del insumo
  try {
    const res = await apiFetch('/api/categorias-insumos');
    const categorias = await res.json();
    const select = document.getElementById('eiCategoria');
    select.innerHTML = '<option value="">Seleccione una categoría...</option>';
    categorias.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      select.appendChild(option);
    });

    const categoriaActual = categorias.find(c => c.nombre === insumo.categorias_insumos?.nombre);
    if (categoriaActual) select.value = categoriaActual.id;
  } catch {
    document.getElementById('eiCategoria').innerHTML = '<option value="">Error al cargar categorías</option>';
  }

  document.getElementById('eiNombre').value       = insumo.nombre;
  document.getElementById('eiStockMinimo').value  = insumo.stock_minimo;
  document.getElementById('eiStockActual').value  = insumo.stock_actual;
  document.getElementById('eiUnidad').value       = insumo.unidad_medida || '';

  document.getElementById('modalEditarInsumo').style.display = 'block';
}

function cerrarModalEditarInsumo() {
  document.getElementById('modalEditarInsumo').style.display = 'none';
  insumoEditandoId = null;
}

async function confirmarEditarInsumo() {
  const errEl = document.getElementById('eiError');

  const nombre      = document.getElementById('eiNombre').value.trim();
  const stockMinimo = parseFloat(document.getElementById('eiStockMinimo').value);
  const stockActual = parseFloat(document.getElementById('eiStockActual').value);
  const unidad      = document.getElementById('eiUnidad').value;
  const idCategoria = document.getElementById('eiCategoria').value;

  if (!nombre || !unidad || !idCategoria || isNaN(stockMinimo) || stockMinimo < 0 || isNaN(stockActual) || stockActual < 0) {
    errEl.textContent = 'Completá todos los campos obligatorios.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await apiFetch(`/api/insumos/${insumoEditandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        stock_minimo: stockMinimo,
        stock_actual: stockActual,
        unidad_medida: unidad,
        id_categoria_insumo: parseInt(idCategoria)
      })
    });

    if (!res.ok) throw new Error();

    cerrarModalEditarInsumo();
    await fetchInsumos();

  } catch {
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
}

