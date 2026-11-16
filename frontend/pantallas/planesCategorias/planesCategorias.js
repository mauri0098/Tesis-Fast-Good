// ====================================================================
// PLANESCATEGORIAS.JS — Los PLANES del panel (pantalla Catálogo, y la vieja pantallas/planesCategorias/planesCategorias.html)
// (16/11) Sin categorías: se sacaron sus 5 funciones, la columna y el desplegable. La tienda muestra planes → combos.
//
// Funciones:
//   cargarDatos              → trae los planes del servidor y dibuja la lista
//   renderizarPlanesPanel    → dibuja la lista de planes (en la pantalla Catálogo, filtrada por su buscador)
//   armarFotoLista           → arma el HTML de la foto de una fila
//   direccionDeFoto          → adapta la dirección de una foto para usarla desde cualquier pantalla
//   abrirFormularioPlan      → abre la ventana para crear (null) o editar (con id) un plan
//   guardarPlan              → controla los campos, pregunta y manda el plan al servidor
//   cambiarEstadoPlan        → pregunta y activa o desactiva un plan (nunca se borra)
//   elegirFoto               → controla el archivo elegido y lo deja listo para subir
//   mostrarFotoEnVentana     → muestra la foto en la ventana, o "Sin foto"
//   subirFoto                → sube la foto elegida al servidor
//   mostrarAviso             → escribe el resultado arriba de la pantalla
//
// Necesita antes: api.js (apiFetch) y escape.js (escHtml). Todo lo que viene de la base pasa por escHtml.
// Los controles de acá son una AYUDA: el servidor vuelve a controlar todo.
// ====================================================================

// Los mismos topes que controla el servidor (server.js: API PLANES)
const LARGO_MAXIMO_NOMBRE_CATALOGO = 100;
const LARGO_MAXIMO_FRASE_CATALOGO  = 200;
const FORMATOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANIO_MAXIMO_FOTO = 2 * 1024 * 1024;   // 2 MB

// Lo que mandó el servidor (activos y desactivados)
let planesDelPanel = [];

// Lo que se está editando en la ventana (null = se está creando uno nuevo)
let planEditando = null;

// Foto elegida en la ventana, lista para subir: { base64, tipo }. null = no se eligió ninguna
let fotoElegida = null;

// ── Trae los planes y dibuja la lista ─────────────────────────────────────
// ENTRADA: nada
// SALIDA:  nada (guarda los datos y dibuja la lista; si falla, un mensaje simple en la lista)
async function cargarDatos() {
  try {
    const respuestaPlanes = await apiFetch('/api/planes/todos');
    if (!respuestaPlanes.ok) throw new Error('HTTP ' + respuestaPlanes.status);
    planesDelPanel = await respuestaPlanes.json();
  } catch (error) {
    // Mensaje simple en la pantalla; el detalle queda en la consola
    console.error('Error al cargar los planes:', error);
    document.getElementById('planesBody').innerHTML = '<tr><td colspan="5" class="loading-text">No pudimos cargar los planes. Probá de nuevo en un momento.</td></tr>';
    return;
  }

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
// ENTRADA: la dirección de la foto (o null) y el nombre del plan o el combo
// SALIDA:  el HTML de la foto (si no carga, se cambia por el logo una sola vez) o "Sin foto"
function armarFotoLista(imagen, nombre) {
  if (!imagen) return '<span class="sin-foto">Sin foto</span>';
  return `<img class="foto-lista" src="${escHtml(direccionDeFoto(imagen))}" alt="${escHtml(nombre)}" loading="lazy"
               onerror="this.onerror = null; this.src = '/src/assets/img/logo.webp';">`;
}

// ── Dibuja la lista de planes ─────────────────────────────────────────────
// ENTRADA: nada (usa planesDelPanel)
// SALIDA:  nada (dibuja #planesBody). Un plan desactivado muestra solo el botón Activar.
// Ej: MANTENIMIENTO activo → su fila con Editar y Desactivar
function renderizarPlanesPanel() {
  const tbody = document.getElementById('planesBody');

  if (planesDelPanel.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Todavía no hay planes. Creá el primero con "+ Nuevo plan".</td></tr>';
    return;
  }

  // (11/11) El buscador por nombre (solo en Catálogo). Ej: "descenso" → PLAN DESCENSO DE PESO
  const buscadorPlan = document.getElementById('buscarPlan');
  let textoBuscado = '';
  if (buscadorPlan) { // ¿está el buscador? SÍ: pantalla Catálogo → se lee · NO: pantalla vieja → sin búsqueda
    textoBuscado = buscadorPlan.value.trim().toLowerCase();
  }
  // filter = se queda con los planes cuyo nombre contiene lo buscado (includes = "contiene")
  const planesVisibles = planesDelPanel.filter(plan => String(plan.nombre).toLowerCase().includes(textoBuscado));
  if (planesVisibles.length === 0) { // ¿ninguno cumple? SÍ: "pizza" · NO: hay al menos uno
    tbody.innerHTML = '<tr><td colspan="5" class="loading-text">No hay planes con esa búsqueda.</td></tr>';
    return;
  }

  let html = '';
  planesVisibles.forEach(plan => {
    const idPlan = Number(plan.id);

    // Activo: Editar y Desactivar · Desactivado: solo Activar
    const estadoActivo = '<span class="estado-combo estado-combo--activo">Activo</span>';
    const estadoDesactivado = '<span class="estado-combo estado-combo--inactivo">Desactivado</span>';
    const botonesActivo = `<button class="btn-editar" onclick="abrirFormularioPlan(${idPlan})">Editar</button>
          <button class="btn-borrar" onclick="cambiarEstadoPlan(${idPlan})">Desactivar</button>`;
    const botonesDesactivado = `<button class="btn-activar" onclick="cambiarEstadoPlan(${idPlan})">Activar</button>`;
    const estado = plan.activo ? estadoActivo : estadoDesactivado;
    const botones = plan.activo ? botonesActivo : botonesDesactivado;

    // Todo lo que viene de la base pasa por escHtml
    // El orden: Nombre · Abreviatura · Foto · Estado · Acciones (en fila). (16/11) Sin la columna Categoría.
    //         La frase se ve en "Editar"
    const nombreSeguro = escHtml(plan.nombre);
    let abreviatura = '—';
    if (plan.codigo_plan) { // ¿tiene abreviatura? SÍ: 'KE' · NO: '—'
      abreviatura = plan.codigo_plan;
    }
    const abreviaturaSegura = escHtml(abreviatura);
    const foto = armarFotoLista(plan.imagen, plan.nombre);   // la fotito o "Sin foto" (ya pasa por escHtml)
    html += `
      <tr>
        <td class="dato-principal">${nombreSeguro}</td>
        <td>${abreviaturaSegura}</td>
        <td>${foto}</td>
        <td>${estado}</td>
        <td class="td-acciones"><div class="botones-fila-catalogo">${botones}</div></td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

// ── Abre la ventana de plan: nuevo (null) o editar uno ────────────────────
// ENTRADA: idPlan, o null para crear uno
// SALIDA:  nada (llena y muestra la ventana). Al editar, la abreviatura se ve pero no se cambia desde acá.
function abrirFormularioPlan(idPlan) {
  planEditando = planesDelPanel.find(plan => plan.id === idPlan) || null;
  const titulo = planEditando ? 'Editar plan' : 'Nuevo plan';
  const datos = planEditando || { nombre: '', codigo_plan: '', descripcion: '', imagen: null };

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
// Ej: "PLAN KETO", abreviatura "ke" → pregunta, lo crea como KE, y su primer plato va a ser KE1
async function guardarPlan() {
  const errorEl = document.getElementById('fpError');
  errorEl.style.display = 'none';
  const nombre = document.getElementById('fpNombre').value.trim();
  const abreviatura = document.getElementById('fpAbreviatura').value.trim().toUpperCase();
  const frase = document.getElementById('fpFrase').value.trim();

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
  const datosDelPlan = { nombre: nombre, descripcion: frase || null };
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

// ── Controla el archivo elegido y lo deja listo para subir ────────────────
// ENTRADA: el evento del campo de archivo y el comienzo de los ids de la ventana ('fp' plan, 'mc' combo)
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
// ENTRADA: el comienzo de los ids de la ventana ('fp' o 'mc') y la dirección de la foto ('' = sin foto)
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
  document.body.classList.add('cargada');   // muestra la página (ver global.css)
  const ventana = document.getElementById('modalPlan');

  cargarDatos();

  // Cerrar la ventana: con la ✕, "Cancelar" o un clic en el fondo oscuro
  ventana.addEventListener('click', evento => {
    const botonCerrar = evento.target.closest('[data-accion="cerrar"]');
    if (evento.target === ventana || botonCerrar) {
      ventana.style.display = 'none';
    }
  });
});
