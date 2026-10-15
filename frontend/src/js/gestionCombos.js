// ====================================================================
// GESTIONCOMBOS.JS — Pantalla "Combos" del panel (pages/combos.html)
//
// Funciones:
//   cargarCombos         → trae los combos y los planes del servidor y dibuja la tabla
//   renderizarCombos     → dibuja la tabla: precio, platos del menú, estado (con "no se ve en la web") y botones
//   abrirFormularioCombo → abre la ventana para crear (sin id) o editar (con id) un combo
//   guardarCombo         → controla los campos y manda el combo nuevo o editado al servidor
//   cambiarEstadoCombo   → pregunta y activa o desactiva un combo (nunca se borra)
//   abrirMenuCombo       → trae el menú de un combo y dibuja su ventana (platos con "Sacar" + lista para agregar)
//   agregarPlatoAlMenu   → agrega al menú el plato elegido en la lista (o lo reactiva si ya había estado)
//   quitarPlatoDelMenu   → pregunta y saca un plato del menú (se desactiva su renglón, nunca se borra)
//
// Necesita antes: api.js (apiFetch) y escape.js (escHtml).
// Los controles de acá son una AYUDA para tu prima: el servidor vuelve a controlar todo.
// ====================================================================

// Los mismos topes que controla el servidor (server.js: API COMBOS)
const LARGO_MAXIMO_NOMBRE_COMBO = 100;
const MAXIMO_VIANDAS_POR_COMBO  = 100;
const PRECIO_MAXIMO_COMBO       = 9999999;

// Lo que mandó el servidor
let combosDelPanel = [];   // todos los combos (activos e inactivos)
let planesActivos  = [];   // planes para la lista del formulario

// Combo que se está editando en la ventana (null = se está creando uno nuevo)
let comboEditando = null;

// Id del combo cuyo menú está abierto en la ventana "Menú" (null = cerrada) y los platos de ese menú
let idComboDelMenu = null;
let platosDelMenuAbierto = [];

// ── Trae los combos y los planes, y dibuja la tabla ───────────────────────
async function cargarCombos() {
  try {
    const respuestaCombos = await apiFetch('/api/combos');
    if (!respuestaCombos.ok) throw new Error('HTTP ' + respuestaCombos.status);
    combosDelPanel = await respuestaCombos.json();

    const respuestaPlanes = await apiFetch('/api/planes');
    if (!respuestaPlanes.ok) throw new Error('HTTP ' + respuestaPlanes.status);
    planesActivos = await respuestaPlanes.json();
  } catch (error) {
    // Mensaje simple en la pantalla; el detalle queda en la consola
    console.error('Error al cargar los combos:', error);
    document.getElementById('combosBody').innerHTML =
      '<tr><td colspan="7" class="loading-text">No pudimos cargar los combos. Probá de nuevo en un momento.</td></tr>';
    return;
  }

  renderizarCombos();
}

// ── Dibuja la tabla de combos ─────────────────────────────────────────────
function renderizarCombos() {
  const tbody = document.getElementById('combosBody');

  if (combosDelPanel.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Todavía no hay combos. Creá el primero con "+ Nuevo combo".</td></tr>';
    return;
  }

  let html = '';
  combosDelPanel.forEach(combo => {
    const idCombo = Number(combo.id);
    const precio = Number(combo.precio).toLocaleString('es-AR');

    let plan = 'Sin plan';
    if (combo.plan) plan = combo.plan;

    // Menú: "3 platos", "1 plato" o "Sin platos"
    let textoMenu = combo.platos_en_menu + ' platos';
    if (combo.platos_en_menu === 1) textoMenu = '1 plato';
    if (combo.platos_en_menu === 0) textoMenu = 'Sin platos';

    // Estado y botón. Un combo activo puede igual no verse en la web: las mismas reglas que usa
    // el catálogo (GET /api/v1/combos) piden un plan activo y al menos un plato en el menú.
    let estado = '<span class="estado-combo estado-combo--inactivo">Inactivo</span>';
    let botonEstado = `<button class="btn-activar" onclick="cambiarEstadoCombo(${idCombo})">Activar</button>`;
    if (combo.activo) {
      estado = '<span class="estado-combo estado-combo--activo">Activo</span>';
      botonEstado = `<button class="btn-borrar" onclick="cambiarEstadoCombo(${idCombo})">Desactivar</button>`;

      const motivos = [];
      if (!combo.plan_activo) motivos.push('plan desactivado');
      if (combo.platos_en_menu === 0) motivos.push('sin platos');
      if (motivos.length > 0) {
        estado += `<span class="no-se-ve">no se ve en la web (${escHtml(motivos.join(' y '))})</span>`;
      }
    }

    // Todo lo que viene de la base pasa por escHtml
    html += `
      <tr>
        <td>${escHtml(combo.nombre)}</td>
        <td>${escHtml(plan)}</td>
        <td>${escHtml(combo.cantidad)}</td>
        <td>$ ${escHtml(precio)}</td>
        <td>${escHtml(textoMenu)}</td>
        <td>${estado}</td>
        <td class="td-acciones">
          <button class="btn-editar" onclick="abrirFormularioCombo(${idCombo})">Editar</button>
          <button class="btn-menu" onclick="abrirMenuCombo(${idCombo})">Menú</button>
          ${botonEstado}
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

// ── Abre la ventana: nuevo combo (idCombo = null) o editar uno ─────────────
function abrirFormularioCombo(idCombo) {
  // Si se edita, se busca el combo en lo que mandó el servidor (si no está, no se abre nada)
  comboEditando = null;
  if (idCombo !== null) {
    comboEditando = combosDelPanel.find(combo => combo.id === Number(idCombo)) || null;
    if (!comboEditando) return;
  }

  // Lista de planes activos (los nombres vienen de la base: pasan por escHtml)
  const selectPlan = document.getElementById('mcPlan');
  let opciones = '<option value="">Elegí un plan...</option>';
  planesActivos.forEach(plan => {
    opciones += `<option value="${Number(plan.id)}">${escHtml(plan.nombre)}</option>`;
  });
  selectPlan.innerHTML = opciones;

  // Todo limpio: sin notas, sin error y con la cantidad habilitada
  const campoNombre   = document.getElementById('mcNombre');
  const campoCantidad = document.getElementById('mcCantidad');
  const campoPrecio   = document.getElementById('mcPrecio');
  const notaPlan      = document.getElementById('mcNotaPlan');
  const notaVendido   = document.getElementById('mcNotaVendido');
  notaPlan.hidden = true;
  notaVendido.hidden = true;
  campoCantidad.disabled = false;
  document.getElementById('mcError').style.display = 'none';

  if (!comboEditando) {
    // Nuevo combo: todo vacío
    document.getElementById('mcTitulo').textContent = 'Nuevo combo';
    campoNombre.value = '';
    selectPlan.value = '';
    campoCantidad.value = '';
    campoPrecio.value = '';
  } else {
    // Editar: los datos del combo (value y textContent muestran el texto tal cual, nunca como HTML)
    document.getElementById('mcTitulo').textContent = 'Editar combo';
    campoNombre.value = comboEditando.nombre;
    campoCantidad.value = comboEditando.cantidad;
    campoPrecio.value = comboEditando.precio;

    // El plan: si sigue activo se elige en la lista; si no, la lista queda en "Elegí un plan" y se avisa
    const planSigueActivo = planesActivos.find(plan => plan.id === comboEditando.id_plan);
    if (planSigueActivo) {
      selectPlan.value = String(comboEditando.id_plan);
    } else {
      selectPlan.value = '';
      let nombrePlan = 'sin plan';
      if (comboEditando.plan) nombrePlan = comboEditando.plan;
      notaPlan.textContent = `El plan de este combo (${nombrePlan}) está desactivado: elegí otro para poder guardar.`;
      notaPlan.hidden = false;
    }

    // Si el combo ya se vendió, la cantidad no se puede cambiar (los pedidos viejos dicen "x10" con 10 platos)
    if (comboEditando.veces_vendido > 0) {
      campoCantidad.disabled = true;
      notaVendido.textContent = `Este combo ya se vendió (${comboEditando.veces_vendido} veces): la cantidad de viandas no se puede cambiar. ` +
                                'Para otra cantidad, creá un combo nuevo y desactivá este.';
      notaVendido.hidden = false;
    }
  }

  document.getElementById('modalCombo').style.display = 'block';
  campoNombre.focus();
}

// ── Controla los campos y guarda el combo (nuevo o editado) ───────────────
async function guardarCombo() {
  const errorEl = document.getElementById('mcError');
  errorEl.style.display = 'none';

  const nombre       = document.getElementById('mcNombre').value.trim();
  const idPlan       = Number(document.getElementById('mcPlan').value);
  const textoCantidad = document.getElementById('mcCantidad').value;
  const textoPrecio  = document.getElementById('mcPrecio').value;
  const cantidad     = Number(textoCantidad);
  const precio       = Number(textoPrecio);

  // Controles (ayuda; el servidor controla lo mismo y además que el plan esté activo)
  let error = '';
  if (nombre === '') {
    error = 'Escribí el nombre del combo.';
  } else if (nombre.length > LARGO_MAXIMO_NOMBRE_COMBO) {
    error = `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_COMBO} caracteres.`;
  } else if (!Number.isInteger(idPlan) || idPlan <= 0) {
    error = 'Elegí un plan.';
  } else if (textoCantidad === '' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAXIMO_VIANDAS_POR_COMBO) {
    error = `Las viandas tienen que ser un número entero entre 1 y ${MAXIMO_VIANDAS_POR_COMBO}.`;
  } else if (textoPrecio === '' || !Number.isFinite(precio) || precio < 0 || precio > PRECIO_MAXIMO_COMBO) {
    error = `El precio tiene que ser un número entre 0 y ${PRECIO_MAXIMO_COMBO.toLocaleString('es-AR')}.`;
  }
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return;
  }

  // Nuevo → POST /api/combos · Editar → PUT /api/combos/:id
  let url = '/api/combos';
  let metodo = 'POST';
  let avisoExito = '✓ Combo creado. Para que se vea en la web, armale el menú.';
  if (comboEditando) {
    url = '/api/combos/' + Number(comboEditando.id);
    metodo = 'PUT';
    avisoExito = '✓ Combo actualizado';
  }

  // El botón se apaga mientras se guarda: así un doble clic no crea dos combos
  const botonGuardar = document.getElementById('mcGuardar');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  try {
    // Los datos van como números de verdad (el servidor rechaza "1000" como texto)
    const respuesta = await apiFetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre, id_plan: idPlan, cantidad: cantidad, precio: precio })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      // El mensaje del servidor (ej: "Este combo ya se vendió…"), como texto
      let mensaje = 'No se pudo guardar el combo.';
      if (cuerpo && cuerpo.error) mensaje = cuerpo.error;
      errorEl.textContent = mensaje;
      errorEl.style.display = 'block';
      return;
    }

    // Guardado: se cierra la ventana, se avisa y se recarga la tabla
    document.getElementById('modalCombo').style.display = 'none';
    const aviso = document.getElementById('avisoCombos');
    aviso.textContent = avisoExito;
    aviso.className = 'aviso-combos aviso-combos--exito';
    await cargarCombos();
  } catch (e) {
    console.error('Error al guardar el combo:', e);
    errorEl.textContent = 'No se pudo conectar con el servidor. Probá de nuevo.';
    errorEl.style.display = 'block';
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = 'Guardar';
  }
}

// ── Activa o desactiva un combo (nunca se borra) ──────────────────────────
async function cambiarEstadoCombo(idCombo) {
  const combo = combosDelPanel.find(c => c.id === Number(idCombo));
  if (!combo) return;

  const activar = !combo.activo;

  // Se pregunta antes (confirm muestra el texto tal cual, nunca como HTML)
  let pregunta = `¿Desactivar "${combo.nombre}"?\nDeja de verse en la web. Los pedidos que ya se hicieron no cambian.`;
  if (activar) {
    pregunta = `¿Activar "${combo.nombre}"?\nVuelve a verse en la web (si su plan está activo y tiene platos en el menú).`;
  }
  if (!confirm(pregunta)) return;

  const aviso = document.getElementById('avisoCombos');
  try {
    const respuesta = await apiFetch('/api/combos/' + Number(combo.id) + '/activo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activar })
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      let mensaje = 'No se pudo cambiar el estado del combo.';
      if (cuerpo && cuerpo.error) mensaje = cuerpo.error;
      aviso.textContent = mensaje;
      aviso.className = 'aviso-combos aviso-combos--error';
      return;
    }

    aviso.textContent = '✓ ' + cuerpo.mensaje;
    aviso.className = 'aviso-combos aviso-combos--exito';
    await cargarCombos();
  } catch (e) {
    console.error('Error al cambiar el estado del combo:', e);
    aviso.textContent = 'No se pudo conectar con el servidor. Probá de nuevo.';
    aviso.className = 'aviso-combos aviso-combos--error';
  }
}

// ── Trae el menú de un combo y dibuja su ventana ──────────────────────────
async function abrirMenuCombo(idCombo) {
  const avisoMenu = document.getElementById('mmAviso');
  avisoMenu.textContent = '';
  avisoMenu.className = 'aviso-combos';
  idComboDelMenu = Number(idCombo);

  // 1. El menú del servidor: { combo, menu, disponibles }
  let datos = null;
  try {
    const respuesta = await apiFetch('/api/combos/' + idComboDelMenu + '/menu');
    datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || ('HTTP ' + respuesta.status));
  } catch (e) {
    // Mensaje simple en la línea de avisos de la pantalla; el detalle queda en la consola
    console.error('Error al cargar el menú del combo:', e);
    const aviso = document.getElementById('avisoCombos');
    aviso.textContent = 'No pudimos cargar el menú. Probá de nuevo en un momento.';
    aviso.className = 'aviso-combos aviso-combos--error';
    return;
  }
  platosDelMenuAbierto = datos.menu;

  // 2. Título (textContent: el nombre se muestra tal cual, nunca como HTML)
  document.getElementById('mmTitulo').textContent =
    `Menú de «${datos.combo.nombre}» · ${datos.combo.cantidad} viandas`;

  // 3. Los platos del menú, cada uno con "Sacar". Todo lo que viene de la base pasa por escHtml.
  let filas = '';
  datos.menu.forEach(plato => {
    // Si el plato se desactivó después (en Generar Receta), se marca: el cliente ya no lo ve
    let nombre = escHtml(plato.nombre);
    if (!plato.plato_activo) {
      nombre = nombre + ' <span class="plato-desactivado">(desactivado)</span>';
    }
    let codigo = '—';
    if (plato.codigo) codigo = plato.codigo;
    let plan = '—';
    if (plato.plan) plan = plato.plan;

    filas += `
      <tr>
        <td>${escHtml(codigo)}</td>
        <td>${nombre}</td>
        <td>${escHtml(plan)}</td>
        <td><button class="btn-borrar" onclick="quitarPlatoDelMenu(${Number(plato.id_producto)})">Sacar</button></td>
      </tr>`;
  });
  if (datos.menu.length === 0) {
    filas = '<tr><td colspan="4" class="loading-text">Todavía no hay platos en el menú.</td></tr>';
  }
  document.getElementById('mmPlatos').innerHTML = filas;

  // Aviso de menú vacío: el combo no se ve en la web
  document.getElementById('mmVacio').hidden = datos.menu.length > 0;

  // 4. La lista para agregar: platos activos de cualquier plan que no están en el menú
  const lista = document.getElementById('mmDisponibles');
  const botonAgregar = document.getElementById('mmAgregar');
  if (datos.disponibles.length === 0) {
    lista.innerHTML = '<option value="">No hay más platos activos para agregar</option>';
    lista.disabled = true;
    botonAgregar.disabled = true;
  } else {
    let opciones = '<option value="">Elegí un plato...</option>';
    datos.disponibles.forEach(plato => {
      // Ej: "arroz — MANTENIMIENTO (M8)"
      let texto = plato.nombre;
      if (plato.plan) texto = texto + ' — ' + plato.plan;
      if (plato.codigo) texto = texto + ' (' + plato.codigo + ')';
      opciones += `<option value="${Number(plato.id)}">${escHtml(texto)}</option>`;
    });
    lista.innerHTML = opciones;
    lista.disabled = false;
    botonAgregar.disabled = false;
  }

  document.getElementById('modalMenu').style.display = 'block';
}

// ── Agrega al menú el plato elegido en la lista ───────────────────────────
async function agregarPlatoAlMenu() {
  const avisoMenu = document.getElementById('mmAviso');
  const idProducto = Number(document.getElementById('mmDisponibles').value);

  // Sin plato elegido, no se manda nada
  if (!Number.isInteger(idProducto) || idProducto <= 0) {
    avisoMenu.textContent = 'Elegí un plato de la lista.';
    avisoMenu.className = 'aviso-combos aviso-combos--error';
    return;
  }

  // El botón se apaga mientras se guarda (doble clic)
  document.getElementById('mmAgregar').disabled = true;

  let mensaje = '';
  let clase = 'aviso-combos--exito';
  try {
    // El id del plato va como número de verdad (el servidor rechaza "8" como texto)
    const respuesta = await apiFetch('/api/combos/' + idComboDelMenu + '/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: idProducto })
    });
    const cuerpo = await respuesta.json();
    if (respuesta.ok) {
      mensaje = '✓ ' + cuerpo.mensaje;
    } else {
      mensaje = cuerpo.error || 'No se pudo agregar el plato.';
      clase = 'aviso-combos--error';
    }
  } catch (e) {
    console.error('Error al agregar el plato al menú:', e);
    mensaje = 'No se pudo conectar con el servidor. Probá de nuevo.';
    clase = 'aviso-combos--error';
  }

  // Se vuelve a dibujar la ventana con lo que hay ahora, se muestra el mensaje (como texto)
  // y se actualiza la tabla de atrás ("N platos", "no se ve en la web")
  await abrirMenuCombo(idComboDelMenu);
  avisoMenu.textContent = mensaje;
  avisoMenu.className = 'aviso-combos ' + clase;
  cargarCombos();
}

// ── Saca un plato del menú (se desactiva su renglón, nunca se borra) ──────
async function quitarPlatoDelMenu(idProducto) {
  // El plato se busca en el menú que está abierto (si no está, no se hace nada)
  const plato = platosDelMenuAbierto.find(p => p.id_producto === Number(idProducto));
  if (!plato) return;

  // Se pregunta antes (confirm muestra el texto tal cual, nunca como HTML)
  if (!confirm(`¿Sacar "${plato.nombre}" del menú?\nLos pedidos que ya se hicieron no cambian.`)) return;

  // Los botones "Sacar" se apagan mientras se guarda (doble clic)
  document.querySelectorAll('#mmPlatos button').forEach(boton => {
    boton.disabled = true;
  });

  const avisoMenu = document.getElementById('mmAviso');
  let mensaje = '';
  let clase = 'aviso-combos--exito';
  try {
    const respuesta = await apiFetch('/api/combos/' + idComboDelMenu + '/menu/' + Number(plato.id_producto) + '/quitar', {
      method: 'PUT'
    });
    const cuerpo = await respuesta.json();
    if (respuesta.ok) {
      mensaje = '✓ ' + cuerpo.mensaje;
    } else {
      mensaje = cuerpo.error || 'No se pudo sacar el plato.';
      clase = 'aviso-combos--error';
    }
  } catch (e) {
    console.error('Error al sacar el plato del menú:', e);
    mensaje = 'No se pudo conectar con el servidor. Probá de nuevo.';
    clase = 'aviso-combos--error';
  }

  // Igual que al agregar: se redibuja la ventana, se muestra el mensaje y se actualiza la tabla
  await abrirMenuCombo(idComboDelMenu);
  avisoMenu.textContent = mensaje;
  avisoMenu.className = 'aviso-combos ' + clase;
  cargarCombos();
}

// ── Al cargar la página ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ventanas = [document.getElementById('modalCombo'), document.getElementById('modalMenu')];

  cargarCombos();

  // Cerrar cada ventana: con la ✕, "Cancelar"/"Cerrar" o un clic en el fondo oscuro
  ventanas.forEach(ventana => {
    ventana.addEventListener('click', evento => {
      const botonCerrar = evento.target.closest('[data-accion="cerrar"]');
      if (evento.target === ventana || botonCerrar) {
        ventana.style.display = 'none';
      }
    });
  });

  // Cerrar las ventanas con Escape
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape') {
      ventanas.forEach(ventana => {
        ventana.style.display = 'none';
      });
    }
  });
});
