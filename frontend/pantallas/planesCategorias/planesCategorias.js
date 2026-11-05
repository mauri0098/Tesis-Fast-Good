// ====================================================================
// PLANESCATEGORIAS.JS — Pantalla "Planes y categorías" del panel (pantallas/planesCategorias/planesCategorias.html)
//
// Funciones:
//   cargarDatos              → trae las categorías y los planes del servidor y dibuja las dos listas
//   renderizarCategorias     → dibuja la lista de categorías, con los planes que tiene cada una
//   renderizarPlanesPanel    → dibuja la lista de planes, con el desplegable de categoría de cada uno
//   armarFotoLista           → arma el HTML de la foto de una fila
//   direccionDeFoto          → adapta la dirección de una foto para usarla desde pages/
//   abrirFormularioCategoria → abre la ventana para crear (null) o editar (con id) una categoría
//   guardarCategoria         → controla los campos, pregunta y manda la categoría al servidor
//   cambiarEstadoCategoria   → pregunta y activa o desactiva una categoría (nunca se borra)
//   abrirFormularioPlan      → abre la ventana para crear (null) o editar (con id) un plan
//   guardarPlan              → controla los campos, pregunta y manda el plan al servidor
//   cambiarEstadoPlan        → pregunta y activa o desactiva un plan (nunca se borra)
//   cambiarCategoriaPlan     → pregunta y guarda lo elegido en el desplegable de un plan: así se agrupan
//   elegirFoto               → controla el archivo elegido y lo deja listo para subir
//   mostrarFotoEnVentana     → muestra la foto en la ventana, o "Sin foto"
//   subirFoto                → sube la foto elegida al servidor
//   mostrarAviso             → escribe el resultado arriba de la pantalla
//
// Son más de 8 porque la pantalla maneja dos cosas distintas (categorías y planes), cada una con su lista,
// su ventana, su guardado y su estado. Juntarlas haría una sola función llena de if.
//
// Necesita antes: api.js (apiFetch) y escape.js (escHtml). Todo lo que viene de la base pasa por escHtml.
// Los controles de acá son una AYUDA: el servidor vuelve a controlar todo.
// ====================================================================

// Los mismos topes que controla el servidor (server.js: API PLANES Y CATEGORÍAS)
const LARGO_MAXIMO_NOMBRE_CATALOGO = 100;
const LARGO_MAXIMO_FRASE_CATALOGO  = 200;
const FORMATOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANIO_MAXIMO_FOTO = 2 * 1024 * 1024;   // 2 MB

// Lo que mandó el servidor (activos y desactivados)
let categoriasDelPanel = [];
let planesDelPanel = [];

// Lo que se está editando en cada ventana (null = se está creando uno nuevo)
let categoriaEditando = null;
let planEditando = null;

// Foto elegida en la ventana, lista para subir: { base64, tipo }. null = no se eligió ninguna
let fotoElegida = null;

// ── Trae las categorías y los planes, y dibuja las dos listas ─────────────
// ENTRADA: nada
// SALIDA:  nada (guarda los datos y dibuja las listas; si falla, un mensaje simple en cada lista)
async function cargarDatos() {
  try {
    const respuestaCategorias = await apiFetch('/api/categorias');
    if (!respuestaCategorias.ok) throw new Error('HTTP ' + respuestaCategorias.status);
    categoriasDelPanel = await respuestaCategorias.json();

    const respuestaPlanes = await apiFetch('/api/planes/todos');
    if (!respuestaPlanes.ok) throw new Error('HTTP ' + respuestaPlanes.status);
    planesDelPanel = await respuestaPlanes.json();
  } catch (error) {
    // Mensaje simple en la pantalla; el detalle queda en la consola
    console.error('Error al cargar planes y categorías:', error);
    document.getElementById('categoriasBody').innerHTML = '<tr><td colspan="5" class="loading-text">No pudimos cargar las categorías. Probá de nuevo en un momento.</td></tr>';
    document.getElementById('planesBody').innerHTML = '<tr><td colspan="7" class="loading-text">No pudimos cargar los planes. Probá de nuevo en un momento.</td></tr>';
    return;
  }

  renderizarCategorias();
  renderizarPlanesPanel();
}

// ── Adapta la dirección de una foto para usarla desde cualquier pantalla ──
// ENTRADA: la dirección guardada en la base
// SALIDA:  la dirección que sirve desde esta pantalla. Las guardadas con "./" están pensadas para index.html
// Ej: './src/assets/img/combo-saludable-1200.jpg' → '/src/assets/img/combo-saludable-1200.jpg' · 'https://…' → igual
// ("/" = la raíz de la web: la dirección sirve desde cualquier carpeta)
function direccionDeFoto(imagen) {
  if (imagen.startsWith('./')) return '/' + imagen.slice(2);   // slice(2) = sin los 2 primeros caracteres
  return imagen;
}

// ── La foto de una fila de las listas ─────────────────────────────────────
// ENTRADA: la dirección de la foto (o null) y el nombre del plan o la categoría
// SALIDA:  el HTML de la foto (si no carga, se cambia por el logo una sola vez) o "Sin foto"
function armarFotoLista(imagen, nombre) {
  if (!imagen) return '<span class="sin-foto">Sin foto</span>';
  return `<img class="foto-lista" src="${escHtml(direccionDeFoto(imagen))}" alt="${escHtml(nombre)}" loading="lazy"
               onerror="this.onerror = null; this.src = '/src/assets/img/logo.webp';">`;
}

// ── Dibuja la lista de categorías ─────────────────────────────────────────
// ENTRADA: nada (usa categoriasDelPanel y planesDelPanel)
// SALIDA:  nada (dibuja #categoriasBody)
// Ej: Viandas Saludables con Deportivo y Veggie → una fila con "PLAN DEPORTIVO, PLAN VEGGIE", Editar y Desactivar
function renderizarCategorias() {
  const tbody = document.getElementById('categoriasBody');

  if (categoriasDelPanel.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Todavía no hay categorías. Creá la primera con "+ Nueva categoría".</td></tr>';
    return;
  }

  // Primero, los planes de cada categoría: { idCategoria: [nombres] }. Así no hay un forEach adentro de otro.
  // Ej: [Veggie (cat. 1), Kids (cat. 1), Sin TACC (sin cat.)] → { 1: ['Veggie', 'Kids'] }
  const planesPorCategoria = {};
  planesDelPanel.forEach(plan => {
    // Un plan sin categoría no va en ninguna fila: return = saltear este y seguir con el siguiente
    if (!plan.id_categoria) return;
    const nombresDeLaCategoria = planesPorCategoria[plan.id_categoria] || [];
    const textoEstado = plan.activo ? '' : ' (desactivado)';
    nombresDeLaCategoria.push(plan.nombre + textoEstado);
    planesPorCategoria[plan.id_categoria] = nombresDeLaCategoria;
  });

  let html = '';
  categoriasDelPanel.forEach(categoria => {
    const idCategoria = Number(categoria.id);
    const planesAdentro = planesPorCategoria[categoria.id] || [];
    const textoPlanes = planesAdentro.join(', ') || 'Sin planes';   // join: ['Veggie', 'Kids'] → 'Veggie, Kids'

    // Activa: Editar y Desactivar · Desactivada: solo Activar
    const estadoActiva = '<span class="estado-combo estado-combo--activo">Activa</span>';
    const estadoDesactivada = '<span class="estado-combo estado-combo--inactivo">Desactivada</span>';
    const botonesActiva = `<button class="btn-editar" onclick="abrirFormularioCategoria(${idCategoria})">Editar</button>
          <button class="btn-borrar" onclick="cambiarEstadoCategoria(${idCategoria})">Desactivar</button>`;
    const botonesDesactivada = `<button class="btn-activar" onclick="cambiarEstadoCategoria(${idCategoria})">Activar</button>`;
    const estado = categoria.activo ? estadoActiva : estadoDesactivada;
    const botones = categoria.activo ? botonesActiva : botonesDesactivada;

    // Todo lo que viene de la base pasa por escHtml (armarFotoLista también)
    html += `
      <tr>
        <td>${armarFotoLista(categoria.imagen, categoria.nombre)}</td>
        <td>${escHtml(categoria.nombre)}</td>
        <td>${escHtml(textoPlanes)}</td>
        <td>${estado}</td>
        <td class="td-acciones">${botones}</td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

// ── Dibuja la lista de planes ─────────────────────────────────────────────
// ENTRADA: nada (usa planesDelPanel y categoriasDelPanel)
// SALIDA:  nada (dibuja #planesBody). En el desplegable salen "Sin categoría" y solo las categorías activas.
//          Un plan desactivado muestra su categoría como texto y solo el botón Activar.
// Ej: MANTENIMIENTO sin categoría → su fila con el desplegable en "Sin categoría", Editar y Desactivar
function renderizarPlanesPanel() {
  const tbody = document.getElementById('planesBody');

  if (planesDelPanel.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Todavía no hay planes. Creá el primero con "+ Nuevo plan".</td></tr>';
    return;
  }

  // Las opciones del desplegable se arman una sola vez, y los nombres de categoría quedan en { id: nombre }
  // para no recorrer las categorías adentro de los planes. Ej: [{ id: 1, nombre: 'Viandas Saludables' }] → { 1: 'Viandas Saludables' }
  let opciones = '<option value="">Sin categoría</option>';
  const nombresDeCategoria = {};
  categoriasDelPanel.forEach(categoria => {
    nombresDeCategoria[categoria.id] = categoria.nombre;
    // Una categoría desactivada no sale en el desplegable: return = saltear esta y seguir con la siguiente
    if (!categoria.activo) return;
    opciones += `<option value="${Number(categoria.id)}">${escHtml(categoria.nombre)}</option>`;
  });

  let html = '';
  planesDelPanel.forEach(plan => {
    const idPlan = Number(plan.id);
    const textoCategoria = nombresDeCategoria[plan.id_categoria] || 'Sin categoría';

    // Activo: desplegable, Editar y Desactivar · Desactivado: su categoría como texto y solo Activar
    const celdaActivo = `<select id="categoriaPlan${idPlan}" class="desplegable-categoria-plan" aria-label="Categoría de ${escHtml(plan.nombre)}" onchange="cambiarCategoriaPlan(${idPlan})">${opciones}</select>`;
    const celdaDesactivado = escHtml(textoCategoria);
    const estadoActivo = '<span class="estado-combo estado-combo--activo">Activo</span>';
    const estadoDesactivado = '<span class="estado-combo estado-combo--inactivo">Desactivado</span>';
    const botonesActivo = `<button class="btn-editar" onclick="abrirFormularioPlan(${idPlan})">Editar</button>
          <button class="btn-borrar" onclick="cambiarEstadoPlan(${idPlan})">Desactivar</button>`;
    const botonesDesactivado = `<button class="btn-activar" onclick="cambiarEstadoPlan(${idPlan})">Activar</button>`;
    const celdaCategoria = plan.activo ? celdaActivo : celdaDesactivado;
    const estado = plan.activo ? estadoActivo : estadoDesactivado;
    const botones = plan.activo ? botonesActivo : botonesDesactivado;

    // Todo lo que viene de la base pasa por escHtml (armarFotoLista también)
    html += `
      <tr>
        <td>${armarFotoLista(plan.imagen, plan.nombre)}</td>
        <td>${escHtml(plan.nombre)}</td>
        <td>${escHtml(plan.codigo_plan || '—')}</td>
        <td>${celdaCategoria}</td>
        <td>${escHtml(plan.descripcion || '—')}</td>
        <td>${estado}</td>
        <td class="td-acciones">${botones}</td>
      </tr>`;
  });

  tbody.innerHTML = html;

  // Cada desplegable arranca en la categoría de su plan. Un plan desactivado no tiene desplegable: return = saltear este
  planesDelPanel.forEach(plan => {
    const desplegable = document.getElementById('categoriaPlan' + Number(plan.id));
    if (!desplegable) return;
    desplegable.value = plan.id_categoria ? String(plan.id_categoria) : '';
  });
}

// ── Abre la ventana de categoría: nueva (null) o editar una ───────────────
// ENTRADA: idCategoria, o null para crear una
// SALIDA:  nada (llena y muestra la ventana)
function abrirFormularioCategoria(idCategoria) {
  categoriaEditando = categoriasDelPanel.find(categoria => categoria.id === idCategoria) || null;
  const titulo = categoriaEditando ? 'Editar categoría' : 'Nueva categoría';
  const datos = categoriaEditando || { nombre: '', descripcion: '', imagen: null };

  // value y textContent muestran el texto tal cual, nunca como HTML
  document.getElementById('fcTitulo').textContent = titulo;
  document.getElementById('fcNombre').value = datos.nombre;
  document.getElementById('fcFrase').value = datos.descripcion || '';
  document.getElementById('fcFotoInput').value = '';
  document.getElementById('fcError').style.display = 'none';
  fotoElegida = null;
  mostrarFotoEnVentana('fc', datos.imagen ? direccionDeFoto(datos.imagen) : '');

  document.getElementById('modalCategoria').style.display = 'block';
  document.getElementById('fcNombre').focus();
}

// ── Controla los campos y guarda la categoría (nueva o editada) ───────────
// ENTRADA: nada (lee la ventana)
// SALIDA:  nada. Pregunta, manda POST /api/categorias o PUT /api/categorias/:id, sube la foto si se eligió una y recarga.
// Ej: "Veggie" sin foto → pregunta, la crea, cierra la ventana y avisa "✓ Categoría creada"
async function guardarCategoria() {
  const errorEl = document.getElementById('fcError');
  errorEl.style.display = 'none';
  const nombre = document.getElementById('fcNombre').value.trim();
  const frase = document.getElementById('fcFrase').value.trim();

  // Controles (ayuda; el servidor controla lo mismo)
  let error = '';
  if (frase.length > LARGO_MAXIMO_FRASE_CATALOGO) error = `La frase admite hasta ${LARGO_MAXIMO_FRASE_CATALOGO} caracteres.`;
  if (nombre.length > LARGO_MAXIMO_NOMBRE_CATALOGO) error = `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_CATALOGO} caracteres.`;
  if (nombre === '') error = 'Escribí el nombre de la categoría.';
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return;
  }

  // Se pregunta antes, porque cambia la web al instante (confirm muestra el texto tal cual, nunca como HTML)
  if (!confirm(`¿Guardar la categoría "${nombre}"?\nEl cambio se ve en la web al instante.`)) return;

  // Nueva → POST /api/categorias · Editar → PUT /api/categorias/:id
  const url = categoriaEditando ? '/api/categorias/' + Number(categoriaEditando.id) : '/api/categorias';
  const metodo = categoriaEditando ? 'PUT' : 'POST';

  // El botón se apaga mientras se guarda: así un doble clic no crea dos
  const botonGuardar = document.getElementById('fcGuardar');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  try {
    const respuesta = await apiFetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre, descripcion: frase || null })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      errorEl.textContent = cuerpo.error || 'No se pudo guardar la categoría.';
      errorEl.style.display = 'block';
      return;
    }

    // Guardado: se sube la foto (si se eligió una), se cierra la ventana, se avisa y se recargan las listas
    const errorFoto = await subirFoto('/api/categorias/' + Number(cuerpo.categoria.id) + '/imagen');
    document.getElementById('modalCategoria').style.display = 'none';
    const textoAviso = errorFoto ? `✓ ${cuerpo.mensaje}, pero no se pudo subir la foto: ${errorFoto}` : `✓ ${cuerpo.mensaje}`;
    mostrarAviso(textoAviso, Boolean(errorFoto));
    await cargarDatos();
  } catch (e) {
    console.error('Error al guardar la categoría:', e);
    errorEl.textContent = 'No se pudo conectar con el servidor. Probá de nuevo.';
    errorEl.style.display = 'block';
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = 'Guardar';
  }
}

// ── Activa o desactiva una categoría (nunca se borra) ─────────────────────
// ENTRADA: idCategoria
// SALIDA:  nada. Pregunta, manda PUT /api/categorias/:id/activo y recarga.
// Ej: desactivar una con planes activos → el servidor dice "Todavía tiene planes activos: …" y no cambia nada
async function cambiarEstadoCategoria(idCategoria) {
  const categoria = categoriasDelPanel.find(fila => fila.id === idCategoria);
  if (!categoria) return;

  const activar = !categoria.activo;
  const pregunta = activar
    ? `¿Activar "${categoria.nombre}"?\nVuelve a salir en los desplegables.`
    : `¿Desactivar "${categoria.nombre}"?\nDeja de salir en los desplegables y en la web. No se borra.`;
  if (!confirm(pregunta)) return;

  try {
    const respuesta = await apiFetch('/api/categorias/' + Number(categoria.id) + '/activo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activar })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      mostrarAviso(cuerpo.error || 'No se pudo cambiar el estado de la categoría.', true);
      return;
    }

    mostrarAviso('✓ ' + cuerpo.mensaje, false);
    await cargarDatos();
  } catch (e) {
    console.error('Error al cambiar el estado de la categoría:', e);
    mostrarAviso('No se pudo conectar con el servidor. Probá de nuevo.', true);
  }
}

// ── Abre la ventana de plan: nuevo (null) o editar uno ────────────────────
// ENTRADA: idPlan, o null para crear uno
// SALIDA:  nada (llena y muestra la ventana). Al editar, la abreviatura se ve pero no se cambia desde acá.
function abrirFormularioPlan(idPlan) {
  planEditando = planesDelPanel.find(plan => plan.id === idPlan) || null;
  const titulo = planEditando ? 'Editar plan' : 'Nuevo plan';
  const datos = planEditando || { nombre: '', codigo_plan: '', id_categoria: null, descripcion: '', imagen: null };

  // El desplegable: "Sin categoría" y solo las categorías activas (los nombres vienen de la base: escHtml)
  let opciones = '<option value="">Sin categoría</option>';
  categoriasDelPanel.forEach(categoria => {
    // Una categoría desactivada no sale en el desplegable: return = saltear esta y seguir con la siguiente
    if (!categoria.activo) return;
    opciones += `<option value="${Number(categoria.id)}">${escHtml(categoria.nombre)}</option>`;
  });
  const desplegable = document.getElementById('fpCategoria');
  desplegable.innerHTML = opciones;
  desplegable.value = datos.id_categoria ? String(datos.id_categoria) : '';

  // value y textContent muestran el texto tal cual, nunca como HTML
  document.getElementById('fpTitulo').textContent = titulo;
  document.getElementById('fpNombre').value = datos.nombre;
  document.getElementById('fpAbreviatura').value = datos.codigo_plan || '';
  document.getElementById('fpAbreviatura').disabled = Boolean(planEditando);
  document.getElementById('fpNotaAbreviatura').hidden = !planEditando;
  document.getElementById('fpFrase').value = datos.descripcion || '';
  document.getElementById('fpFotoInput').value = '';
  document.getElementById('fpError').style.display = 'none';
  fotoElegida = null;
  mostrarFotoEnVentana('fp', datos.imagen ? direccionDeFoto(datos.imagen) : '');

  document.getElementById('modalPlan').style.display = 'block';
  document.getElementById('fpNombre').focus();
}

// ── Controla los campos y guarda el plan (nuevo o editado) ────────────────
// ENTRADA: nada (lee la ventana)
// SALIDA:  nada. Pregunta, manda POST /api/planes o PUT /api/planes/:id, sube la foto si se eligió una y recarga.
// Ej: "PLAN KETO", abreviatura "ke", sin categoría → pregunta, lo crea como KE, y su primer plato va a ser KE1
async function guardarPlan() {
  const errorEl = document.getElementById('fpError');
  errorEl.style.display = 'none';
  const nombre = document.getElementById('fpNombre').value.trim();
  const abreviatura = document.getElementById('fpAbreviatura').value.trim().toUpperCase();
  const frase = document.getElementById('fpFrase').value.trim();
  const valorCategoria = document.getElementById('fpCategoria').value;
  const idCategoria = valorCategoria === '' ? null : Number(valorCategoria);   // "" = Sin categoría

  // Controles (ayuda; el servidor controla lo mismo). La abreviatura solo se escribe al crear.
  const abreviaturaMal = !planEditando && !/^[A-Z]{1,4}$/.test(abreviatura);
  let error = '';
  if (frase.length > LARGO_MAXIMO_FRASE_CATALOGO) error = `La frase admite hasta ${LARGO_MAXIMO_FRASE_CATALOGO} caracteres.`;
  if (abreviaturaMal) error = 'La abreviatura tiene que tener de 1 a 4 letras, sin números.';
  if (nombre.length > LARGO_MAXIMO_NOMBRE_CATALOGO) error = `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_CATALOGO} caracteres.`;
  if (nombre === '') error = 'Escribí el nombre del plan.';
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return;
  }

  // Se pregunta antes, porque cambia la web al instante (confirm muestra el texto tal cual, nunca como HTML)
  if (!confirm(`¿Guardar el plan "${nombre}"?\nEl cambio se ve en la web al instante.`)) return;

  // Nuevo → POST /api/planes (con abreviatura) · Editar → PUT /api/planes/:id (la abreviatura va por su ruta propia)
  const url = planEditando ? '/api/planes/' + Number(planEditando.id) : '/api/planes';
  const metodo = planEditando ? 'PUT' : 'POST';
  const datosDelPlan = { nombre: nombre, id_categoria: idCategoria, descripcion: frase || null };
  if (!planEditando) datosDelPlan.abreviatura = abreviatura;

  // El botón se apaga mientras se guarda: así un doble clic no crea dos
  const botonGuardar = document.getElementById('fpGuardar');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  try {
    const respuesta = await apiFetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosDelPlan)
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      errorEl.textContent = cuerpo.error || 'No se pudo guardar el plan.';
      errorEl.style.display = 'block';
      return;
    }

    // Guardado: se sube la foto (si se eligió una), se cierra la ventana, se avisa y se recargan las listas
    const errorFoto = await subirFoto('/api/planes/' + Number(cuerpo.plan.id) + '/imagen');
    document.getElementById('modalPlan').style.display = 'none';
    const textoAviso = errorFoto ? `✓ ${cuerpo.mensaje}, pero no se pudo subir la foto: ${errorFoto}` : `✓ ${cuerpo.mensaje}`;
    mostrarAviso(textoAviso, Boolean(errorFoto));
    await cargarDatos();
  } catch (e) {
    console.error('Error al guardar el plan:', e);
    errorEl.textContent = 'No se pudo conectar con el servidor. Probá de nuevo.';
    errorEl.style.display = 'block';
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = 'Guardar';
  }
}

// ── Activa o desactiva un plan (nunca se borra) ───────────────────────────
// ENTRADA: idPlan
// SALIDA:  nada. Pregunta, manda PUT /api/planes/:id/activo y recarga.
// Ej: desactivar PLAN KIDS → sus combos dejan de verse en la web y de poder comprarse
async function cambiarEstadoPlan(idPlan) {
  const plan = planesDelPanel.find(fila => fila.id === idPlan);
  if (!plan) return;

  const activar = !plan.activo;
  const pregunta = activar
    ? `¿Activar "${plan.nombre}"?\nSus combos activos vuelven a verse en la web al instante.`
    : `¿Desactivar "${plan.nombre}"?\nSus combos dejan de verse en la web y de poder comprarse al instante. No se borra nada.`;
  if (!confirm(pregunta)) return;

  try {
    const respuesta = await apiFetch('/api/planes/' + Number(plan.id) + '/activo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activar })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      mostrarAviso(cuerpo.error || 'No se pudo cambiar el estado del plan.', true);
      return;
    }

    mostrarAviso('✓ ' + cuerpo.mensaje, false);
    await cargarDatos();
  } catch (e) {
    console.error('Error al cambiar el estado del plan:', e);
    mostrarAviso('No se pudo conectar con el servidor. Probá de nuevo.', true);
  }
}

// ── Guarda lo elegido en el desplegable de un plan: así se agrupan ────────
// ENTRADA: idPlan
// SALIDA:  nada. Pregunta y manda PUT /api/planes/:id/categoria. Si se cancela o falla, el desplegable vuelve a lo que tenía.
// Ej: MANTENIMIENTO, de "Viandas Saludables" a "Sin categoría" → en la web pasa a tener su propia tarjeta
async function cambiarCategoriaPlan(idPlan) {
  const plan = planesDelPanel.find(fila => fila.id === idPlan);
  if (!plan) return;

  const desplegable = document.getElementById('categoriaPlan' + Number(plan.id));
  const valorAnterior = plan.id_categoria ? String(plan.id_categoria) : '';
  const idCategoria = desplegable.value === '' ? null : Number(desplegable.value);   // "" = Sin categoría
  const nombreElegido = desplegable.options[desplegable.selectedIndex].text;

  if (!confirm(`¿Pasar "${plan.nombre}" a "${nombreElegido}"?\nSu tarjeta cambia en la web al instante.`)) {
    desplegable.value = valorAnterior;
    return;
  }

  try {
    const respuesta = await apiFetch('/api/planes/' + Number(plan.id) + '/categoria', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_categoria: idCategoria })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      desplegable.value = valorAnterior;
      mostrarAviso(cuerpo.error || 'No se pudo cambiar la categoría del plan.', true);
      return;
    }

    mostrarAviso('✓ ' + cuerpo.mensaje, false);
    await cargarDatos();
  } catch (e) {
    console.error('Error al cambiar la categoría del plan:', e);
    desplegable.value = valorAnterior;
    mostrarAviso('No se pudo conectar con el servidor. Probá de nuevo.', true);
  }
}

// ── Controla el archivo elegido y lo deja listo para subir ────────────────
// ENTRADA: el evento del campo de archivo y el comienzo de los ids de la ventana ('fc' categoría, 'fp' plan)
// SALIDA:  nada (guarda la foto en fotoElegida y la muestra, o escribe el error en la ventana)
// Ej: un JPG de 1 MB → se ve en la ventana · un PDF → "Formato no soportado" · 3 MB → "supera el tamaño máximo"
function elegirFoto(evento, prefijo) {
  const campo = evento.target;
  const archivo = campo.files[0];
  const errorEl = document.getElementById(prefijo + 'Error');
  errorEl.style.display = 'none';
  fotoElegida = null;
  if (!archivo) return;

  // Controles (ayuda; el servidor controla lo mismo)
  let error = '';
  if (archivo.size > TAMANIO_MAXIMO_FOTO) error = 'La imagen supera el tamaño máximo permitido (2 MB).';
  if (!FORMATOS_FOTO.includes(archivo.type)) error = 'Formato no soportado. Usá JPG, PNG o WebP.';
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    campo.value = '';
    return;
  }

  // FileReader lee el archivo como texto: "data:image/png;base64,AAAA…". split(',')[1] se queda con lo de después de la coma
  const lector = new FileReader();
  lector.onload = () => {
    fotoElegida = { base64: lector.result.split(',')[1], tipo: archivo.type };
    mostrarFotoEnVentana(prefijo, lector.result);
  };
  lector.readAsDataURL(archivo);
}

// ── Muestra la foto en la ventana, o "Sin foto" ───────────────────────────
// ENTRADA: el comienzo de los ids de la ventana ('fc' o 'fp') y la dirección de la foto ('' = sin foto)
// SALIDA:  nada (cambia la vista de la ventana). src y hidden muestran la dirección tal cual, nunca como HTML
function mostrarFotoEnVentana(prefijo, direccion) {
  const vista = document.getElementById(prefijo + 'FotoVista');
  const vacia = document.getElementById(prefijo + 'FotoVacia');
  vista.hidden = direccion === '';
  vacia.hidden = direccion !== '';
  if (direccion === '') {
    vista.removeAttribute('src');
    return;
  }
  vista.src = direccion;
}

// ── Sube la foto elegida ──────────────────────────────────────────────────
// ENTRADA: la dirección de la ruta (ej: '/api/planes/2/imagen'). Usa fotoElegida
// SALIDA:  '' si salió bien o si no había foto para subir · el texto del error si falló
async function subirFoto(url) {
  if (!fotoElegida) return '';

  try {
    const respuesta = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen_base64: fotoElegida.base64, tipo: fotoElegida.tipo })
    });
    if (respuesta.ok) return '';
    const cuerpo = await respuesta.json().catch(() => ({}));   // si no es JSON, un objeto vacío
    return cuerpo.error || 'probá de nuevo.';
  } catch (e) {
    console.error('Error al subir la foto:', e);
    return 'no se pudo conectar con el servidor.';
  }
}

// ── Escribe el resultado arriba de la pantalla ────────────────────────────
// ENTRADA: el texto y si es un error
// SALIDA:  nada (textContent muestra el texto tal cual, nunca como HTML)
function mostrarAviso(texto, esError) {
  const aviso = document.getElementById('avisoPlanes');
  const claseResultado = esError ? 'aviso-combos--error' : 'aviso-combos--exito';
  aviso.textContent = texto;
  aviso.className = 'aviso-combos aviso-planes ' + claseResultado;
}

// ── Al cargar la página ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('cargada');   // muestra la página (ver planesCategorias.css)
  const ventanas = [document.getElementById('modalCategoria'), document.getElementById('modalPlan')];

  cargarDatos();

  // Cerrar cada ventana: con la ✕, "Cancelar" o un clic en el fondo oscuro
  ventanas.forEach(ventana => {
    ventana.addEventListener('click', evento => {
      const botonCerrar = evento.target.closest('[data-accion="cerrar"]');
      if (evento.target === ventana || botonCerrar) {
        ventana.style.display = 'none';
      }
    });
  });
});
