// ============================================================================
// armadoPedidos.js — Pantalla "Armado de pedidos" (26/10)
//
// El armador ve los pedidos que se ENTREGAN el día elegido (no el día de cocina) y arma cada bandeja:
// tilda cada vianda a medida que la pone y al final toca "✓ Pedido armado".
// Las casillas NO se guardan en la base (solo ayudan mientras arma): quedan en memoria (tildadas) y no se pierden
// con la recarga de cada 60 segundos. Lo único que se guarda es la marca "armado" (POST /api/pedidos/:id/armado).
//
// Funciones:
//   cargarPedidos      → trae los pedidos del día (GET /api/armado) y los dibuja
//   prepararPedido     → separa los renglones de un pedido: lo de la heladera y lo de la cocina, y sus totales
//   cambiarDia         → hoy, día hábil anterior o siguiente: cambia "Entrega: …" y vuelve a cargar
//   renderizarPedidos  → el filtro, los contadores, la barra de avance y las tarjetas
//   armarTarjeta       → el HTML de la tarjeta de un pedido (por armar, falta cocinar o armado)
//   estadoDelPie       → (26/10) "4 de 5 viandas en la bandeja" y si se puede tocar "✓ Pedido armado" (tarjeta y lista)
//   renglonesDeLista   → (26/10) los renglones de varios pedidos en una sola lista (para la lista y la planilla)
//   armarLista         → (26/10) la vista "Lista": una tabla con una fila por renglón de vianda
//   tildarVianda       → tilda o destilda un renglón y vuelve a dibujar (lo tildado es uno solo para las dos vistas)
//   elegirVista        → (26/10) tarjetas o lista; se guarda en el navegador (en el celu, siempre tarjetas)
//   exportarPlanilla   → (26/10) descarga la lista del filtro elegido como planilla para Excel (CSV)
//   abrirVentana       → abre la ventana de la pantalla con lo que se le pase (cerrarVentana la cierra)
//   abrirDatosCliente  → la ventana "Datos del cliente"
//   pedirConfirmacion  → la ventana "¿Armaste el pedido #081?" (Confirmar / Cancelar)
//   marcarArmado       → guarda la marca en el servidor
//   imprimirEtiqueta   → arma la etiqueta de la bandeja y abre la impresión
//   mostrarAviso       → el cartelito flotante ("✓ Pedido #081 armado" o un error)
// Son 17 (más cerrarVentana) porque cada una es una acción distinta de la pantalla; prepararPedido, estadoDelPie y
// renglonesDeLista van aparte porque los usan dos partes cada una (tarjeta y lista, lista y planilla).
// ============================================================================

// ── Lo que recuerda la pantalla ──────────────────────────────────────────────
let fechaElegida = '';             // el día que se está mirando, 'AAAA-MM-DD'
let textoDiaElegido = '';          // ese día, para leer. Ej: "jueves 29/10"
let hoyISO = '';                   // hoy en Argentina, 'AAAA-MM-DD'
let filtroElegido = 'por_armar';   // por_armar | falta_cocinar | armados | todos
let pedidosDelDia = [];            // los pedidos del día, ya preparados (prepararPedido)
let ultimaRespuesta = '';          // lo último que mandó el servidor, como texto (si la recarga trae lo mismo, no se redibuja)
let elementoAntesDeLaVentana = null;  // lo que tenía el foco antes de abrir una ventana (vuelve ahí al cerrarla)
// Lo tildado: { clave del renglón: true }. Ej: { '512-heladera': true }. Solo en memoria: no va a la base.
const tildadas = {};

const RECARGA_SEGUNDOS = 60;       // cada cuánto se vuelve a pedir el día (para ver cuando la cocina marca "✓ Listo")

// La vista (26/10): 'tarjetas' o 'lista'. Se guarda en el navegador. Con menos de 900 px siempre se ven las tarjetas.
const CLAVE_VISTA = 'armado_vista';                              // el nombre con el que se guarda en el navegador
const pantallaChica = window.matchMedia('(max-width: 899px)');  // matchMedia = "¿la pantalla mide menos de 900 px?"
let vistaElegida = 'tarjetas';
// El botón dice a qué vista se pasa. Ej: con la lista a la vista, "Ver tarjetas"
const TEXTO_BOTON_VISTA = { tarjetas: 'Ver lista', lista: 'Ver tarjetas' };

// ── Tablas ───────────────────────────────────────────────────────────────────
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];   // getDay(): 0 = domingo
const NOMBRE_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];                       // para la etiqueta
// Lo que va antes del día si está cerca de hoy (la clave es cuántos días hay de diferencia)
const DIA_CERCANO = { '-1': 'ayer, ', '0': 'hoy, ', '1': 'mañana, ' };
// Cómo se cambia de día (‹ y ›): de lunes a viernes, salteando feriados (fechas.js)
const PASO_DIA = {
  hoy:       () => parseFechaLocal(hoyISO),
  anterior:  () => diaHabilAnterior(parseFechaLocal(fechaElegida)),
  siguiente: () => proximoDiaHabil(parseFechaLocal(fechaElegida))
};
// Qué se dice cuando un filtro no tiene pedidos (si el día no tiene ninguno, se dice eso)
const MENSAJE_VACIO = {
  por_armar:     'No queda ningún pedido por armar.',
  falta_cocinar: 'No hay pedidos esperando a la cocina.',
  armados:       'Todavía no se armó ningún pedido.',
  todos:         'No hay pedidos.'
};
// El cartelito de lo que viene de la cocina, según esté hecho o no
const TAG_COCINA = {
  true:  '<span class="tag-exito">✓ cocinado</span>',
  false: '<span class="tag-espera">⏳ falta cocinar</span>'
};
// Para los lectores de pantalla: un error se anuncia enseguida (alert), lo demás cuando pueden (status)
const ROL_AVISO = { exito: 'status', error: 'alert' };

// ── Dibujitos (de línea, del color de la letra) ──────────────────────────────
const ICONO_HELADERA = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M5 10h14M9 6v1M9 14v3"></path></svg>';
const ICONO_COCINA = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13h12v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"></path><path d="M4 13h16M9 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4"></path></svg>';
const ICONO_INFO = '<svg class="icono-datos-cliente" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>';
const ICONO_PERSONA = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"></path></svg>';
const ICONO_BANDEJA = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-2 11H5z"></path><path d="M8 9V6a4 4 0 0 1 8 0v3"></path><path d="M9 14l2 2 4-4"></path></svg>';
const ICONO_CERRAR = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>';


// ─────────────────────────────────────────────────────────────────────────────
// cargarPedidos → trae los pedidos que se entregan el día elegido y los dibuja
// ENTRADA: esRecarga (true = la recarga sola de cada 60 s o después de armar: no muestra "Cargando…" y, si
//          falla, deja lo que se ve; false = cambió el día)
// SALIDA:  nada. Llena pedidosDelDia y llama a renderizarPedidos. Lo tildado no se toca (está en tildadas).
// Ej: día 29/10 → GET /api/armado?fecha=2026-10-29 → 4 pedidos → 4 tarjetas (los armados al final)
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPedidos(esRecarga) {
  const grilla = document.getElementById('pedidosBody');
  const fechaPedida = fechaElegida;                               // el día que se pide (por si cambia mientras tanto)

  // 1. Si cambió el día: "Cargando…" y se olvida la respuesta anterior
  if (!esRecarga) {
    grilla.innerHTML = '<p class="loading-text">Cargando pedidos...</p>';
    ultimaRespuesta = '';
  }

  try {
    // 2. Los pedidos del día (el servidor controla la fecha, el rol y qué estados van)
    const respuesta = await apiFetch('/api/armado?fecha=' + encodeURIComponent(fechaPedida));
    const datos = await respuesta.json().catch(() => null);      // si no es JSON: null
    if (fechaPedida !== fechaElegida) return;                     // mientras tanto se eligió otro día: esto ya no sirve
    if (!respuesta.ok || !Array.isArray(datos)) throw new Error(datos?.error || 'status ' + respuesta.status);

    // 3. Si la recarga trajo exactamente lo mismo, no se redibuja nada (no se pierde ni el foco)
    const texto = JSON.stringify(datos);
    if (texto === ultimaRespuesta) return;
    ultimaRespuesta = texto;

    // 4. Cada pedido preparado; primero los que faltan armar y al final los armados, por número.
    //    sort con dos reglas: Number(true) = 1 y Number(false) = 0 (los armados van después); si empatan, por número
    pedidosDelDia = datos.map(prepararPedido).sort((a, b) => Number(a.armado) - Number(b.armado) || a.id - b.id);
    renderizarPedidos();
  } catch (error) {
    console.error('[Armado] No se pudieron traer los pedidos:', error);   // el detalle, solo en la consola
    if (esRecarga) return;                                        // la recarga sola falló: queda lo que se ve
    grilla.innerHTML = '<p class="loading-text">No se pudieron traer los pedidos. Probá de nuevo en un rato.</p>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// prepararPedido → un pedido del servidor, con sus renglones separados por de dónde salen
// ENTRADA: pedido (como lo manda GET /api/armado)
// SALIDA:  { id, numero, cliente, esDelivery, entrega, heladera: [renglón], cocina: [renglón], sinCocinar: [renglón],
//            totalViandas, viandasDeHeladera, armado, estado, horaArmado, armadoPor, datos }
//          renglón = { clave, cantidad, codigo, nombre, texto (el personalizado o ''), listo, sePuedeTildar }
//          estado = 'por_armar' | 'falta_cocinar' | 'armados' (el de los filtros)
// Ej: #81 con 4 berenjenas de heladera + 1 canelones "sin sal" listo →
//     { numero: '#081', heladera: [4 berenjenas], cocina: [1 canelones · sin sal ✓], totalViandas: 5, estado: 'por_armar', … }
// Cuenta: de la heladera salen cantidad_de_heladera; lo demás (cantidad − cantidad_de_heladera) lo hizo la cocina.
// Es la misma cuenta que usa el servidor para decir "falta cocinar".
// ─────────────────────────────────────────────────────────────────────────────
function prepararPedido(pedido) {
  const heladera = [];
  const cocina = [];
  let totalViandas = 0;
  let viandasDeHeladera = 0;

  // 1. Cada renglón del pedido, en su grupo (un renglón puede tener viandas en los dos)
  (pedido.pedido_detalles || []).forEach(detalle => {
    const cantidad = Number(detalle.cantidad) || 0;
    const deHeladera = Number(detalle.cantidad_de_heladera) || 0;            // vacío cuenta como 0
    const deCocina = cantidad - deHeladera;                                  // lo que hizo (o hace) la cocina
    const plato = detalle.productos || {};
    const comun = { codigo: plato.codigo_plato, nombre: plato.nombre || 'Plato', texto: detalle.observaciones_plato || '' };
    totalViandas = totalViandas + cantidad;
    viandasDeHeladera = viandasDeHeladera + deHeladera;
    // ...de la heladera (ya están hechas: siempre se pueden tildar)
    if (deHeladera > 0) heladera.push({ ...comun, clave: detalle.id + '-heladera', cantidad: deHeladera, listo: true, sePuedeTildar: true });
    // ...de la cocina (se pueden tildar recién cuando la cocina las marcó "✓ Listo")
    if (deCocina > 0) cocina.push({ ...comun, clave: detalle.id + '-cocina', cantidad: deCocina, listo: Boolean(detalle.listo), sePuedeTildar: Boolean(detalle.listo) });
  });

  // 2. Lo que todavía no cocinó la cocina, y en qué filtro va el pedido
  const sinCocinar = cocina.filter(renglon => !renglon.listo);
  const armado = Boolean(pedido.armado_en);
  const estadoSinArmar = sinCocinar.length > 0 ? 'falta_cocinar' : 'por_armar';
  const estado = armado ? 'armados' : estadoSinArmar;

  // 3. Cómo se entrega. Ej: "Delivery · Av. Colón 1250" o "Retira en el local"
  const esDelivery = pedido.tipo_entrega === 'Delivery';
  const direccion = pedido.cliente_direccion || 'sin dirección';
  const entrega = esDelivery ? 'Delivery · ' + direccion : 'Retira en el local';

  // 4. A qué hora se armó, en hora de Argentina (o '' si no se armó). Ej: "08:42"
  const formatoHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const horaArmado = armado ? formatoHora.format(fechaDeTimestamp(pedido.armado_en)) : '';

  return {
    id:                pedido.id,
    numero:            '#' + String(pedido.id).padStart(3, '0'),   // ej: 81 → "#081"
    cliente:           pedido.cliente_nombre || 'Sin nombre',
    esDelivery:        esDelivery,
    entrega:           entrega,
    heladera:          heladera,
    cocina:            cocina,
    sinCocinar:        sinCocinar,
    totalViandas:      totalViandas,
    viandasDeHeladera: viandasDeHeladera,
    armado:            armado,
    estado:            estado,
    horaArmado:        horaArmado,
    armadoPor:         pedido.armado_por_nombre || '',
    datos:             pedido                                       // todo lo demás (teléfono, notas, pago…)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// cambiarDia → cambia el día que se mira y vuelve a cargar
// ENTRADA: direccion: 'hoy', 'anterior' o 'siguiente' (los dos últimos saltean sábados, domingos y feriados)
// SALIDA:  nada. Cambia fechaElegida, escribe "Entrega: …" y llama a cargarPedidos
// Ej: viernes 30/10 + 'siguiente' → lunes 02/11 → "Entrega: lunes 02/11"
//     hoy lunes 26/10 + 'hoy' → "Entrega: hoy, lunes 26/10"
// ─────────────────────────────────────────────────────────────────────────────
function cambiarDia(direccion) {
  const fecha = PASO_DIA[direccion]();                                      // el día nuevo (Date a medianoche)
  fechaElegida = fechaLocalISO(fecha);                                      // ej: '2026-10-29'
  textoDiaElegido = NOMBRE_DIA[fecha.getDay()] + ' ' + fechaDDMMAAAA(fecha).slice(0, 5);   // ej: "jueves 29/10"

  // "hoy, ", "mañana, ", "ayer, " o nada. La diferencia en días: milisegundos ÷ 86.400.000 (lo que tiene un día)
  const diferencia = Math.round((fecha - parseFechaLocal(hoyISO)) / 86400000);
  const cercano = DIA_CERCANO[diferencia] || '';
  document.getElementById('etiquetaFechaFiltro').textContent = 'Entrega: ' + cercano + textoDiaElegido;

  cargarPedidos(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// renderizarPedidos → dibuja lo que se ve: contadores de los filtros, barra de avance y tarjetas del filtro elegido
// ENTRADA: nada (usa pedidosDelDia, filtroElegido y tildadas)
// SALIDA:  nada. Cambia los contadores, la barra, los textos de avance y #pedidosBody
// Ej: 4 pedidos (2 por armar, 1 falta cocinar, 1 armado) → "Por armar · 2", "1 de 4 pedidos armados", barra al 25%
// Si el foco estaba en una casilla, vuelve a esa casilla (así la recarga de 60 s no lo saca de donde estaba).
// ─────────────────────────────────────────────────────────────────────────────
function renderizarPedidos() {
  const grilla = document.getElementById('pedidosBody');

  // 1. Cuántos pedidos hay en cada filtro, y las viandas del día
  const cuantos = { por_armar: 0, falta_cocinar: 0, armados: 0, todos: pedidosDelDia.length };
  let viandasDelDia = 0;
  pedidosDelDia.forEach(pedido => {
    cuantos[pedido.estado] = cuantos[pedido.estado] + 1;
    viandasDelDia = viandasDelDia + pedido.totalViandas;
  });

  // 2. Los contadores. "Falta cocinar" se ve (y va en amarillo) solo si hay alguno
  document.getElementById('contadorPorArmar').textContent = '· ' + cuantos.por_armar;
  document.getElementById('contadorFaltaCocinar').textContent = '· ' + cuantos.falta_cocinar;
  document.getElementById('contadorArmados').textContent = '· ' + cuantos.armados;
  document.getElementById('contadorTodos').textContent = '· ' + cuantos.todos;
  const hayFaltaCocinar = cuantos.falta_cocinar > 0;
  document.getElementById('contadorFaltaCocinar').hidden = !hayFaltaCocinar;
  document.querySelector('[data-filtro="falta_cocinar"]').classList.toggle('filtro-armado--alerta', hayFaltaCocinar);

  // 3. El avance: "1 de 4 pedidos armados", "30 viandas en total" y la barra (con lo que lee el lector de pantalla)
  const porcentaje = cuantos.todos > 0 ? Math.round(cuantos.armados * 100 / cuantos.todos) : 0;
  const palabraViandas = viandasDelDia === 1 ? 'vianda' : 'viandas';
  document.getElementById('pedidosArmadosTexto').textContent = cuantos.armados + ' de ' + cuantos.todos;
  document.getElementById('viandasTotalTexto').textContent = viandasDelDia + ' ' + palabraViandas + ' en total';
  document.getElementById('barraProgreso').style.width = porcentaje + '%';   // la parte verde (el ancho cambia con el avance)
  const barra = document.getElementById('barraFondo');
  barra.setAttribute('aria-valuemax', String(cuantos.todos));
  barra.setAttribute('aria-valuenow', String(cuantos.armados));

  // 4. Las tarjetas del filtro elegido (o el mensaje si no hay)
  const claveConFoco = document.activeElement?.dataset?.clave;   // la casilla con el foco (o undefined)
  const delFiltro = filtroElegido === 'todos' ? pedidosDelDia : pedidosDelDia.filter(pedido => pedido.estado === filtroElegido);
  const sinPedidosElDia = `No hay pedidos para entregar el ${textoDiaElegido}.`;
  const mensaje = pedidosDelDia.length === 0 ? sinPedidosElDia : MENSAJE_VACIO[filtroElegido];
  const vacioHTML = `<p class="loading-text">${escHtml(mensaje)}</p>`;
  const verLista = vistaElegida === 'lista' && !pantallaChica.matches;     // la lista, solo en pantallas de 900 px o más
  const contenido = verLista ? armarLista(delFiltro) : delFiltro.map(armarTarjeta).join('');
  grilla.innerHTML = delFiltro.length > 0 ? contenido : vacioHTML;
  grilla.classList.toggle('grilla-pedidos--lista', verLista);              // la lista no va en columnas

  // 5. El foco, de vuelta en su casilla (si sigue estando)
  const casillaConFoco = claveConFoco ? grilla.querySelector(`[data-clave="${claveConFoco}"]`) : null;
  if (casillaConFoco) casillaConFoco.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// armarTarjeta → el HTML de la tarjeta de un pedido
// ENTRADA: pedido (de prepararPedido)
// SALIDA:  el HTML (texto). Todo lo que viene de la base pasa por escHtml.
// Ej: armado → la chiquita verde "#079 · Facu Ruiz · Delivery · 5 viandas · ✓ Armado 08:42 · Juan"
//     sin armar → número, cliente (botón de "Datos del cliente"), viandas, los dos grupos con casillas y el pie:
//       falta cocinar   → cartel amarillo, "Esperando a la cocina" y "Todavía no se puede armar" (apagado)
//       faltan tildar   → "4 de 5 viandas en la bandeja" y "Faltan 1 de 5" (apagado)
//       todo tildado    → "5 de 5 viandas en la bandeja" y "✓ Pedido armado"
// ─────────────────────────────────────────────────────────────────────────────
function armarTarjeta(pedido) {
  const cliente = escHtml(pedido.cliente);
  const palabraViandas = pedido.totalViandas === 1 ? 'vianda' : 'viandas';

  // 1. Ya armado: la tarjeta chiquita en verde
  if (pedido.armado) {
    const tipo = pedido.esDelivery ? 'Delivery' : 'Retira';
    const quien = pedido.armadoPor ? ' · ' + escHtml(pedido.armadoPor) : '';   // ej: " · Juan"
    return `
      <article class="tarjeta-pedido tarjeta-pedido--armado" data-id-pedido="${pedido.id}">
        <div class="tarjeta-pedido-info">
          <h2 class="numero-armado">${pedido.numero}</h2>
          <div class="tarjeta-cliente">
            <strong class="cliente-nombre">${cliente}</strong>
            <span class="cliente-direccion">${tipo} · ${pedido.totalViandas} ${palabraViandas}</span>
          </div>
        </div>
        <span class="marca-armado">✓ Armado ${pedido.horaArmado}${quien}</span>
      </article>`;
  }

  // 2. Un renglón con su casilla. Ej: [✓] 4  F2 berenjenas rellenas · o · [ ] 2  F1 fideos  SIN SAL  ⏳ falta cocinar
  //    El renglón entero es un <label>: tocar cualquier parte tilda la casilla
  const renglonHTML = renglon => {
    const tildado = renglon.sePuedeTildar && tildadas[renglon.clave] === true;
    const claseTildada = tildado ? ' casilla-vianda--tildada' : '';
    const claseEsperando = renglon.sePuedeTildar ? '' : ' casilla-vianda--esperando';
    const marcada = tildado ? ' checked' : '';
    const apagada = renglon.sePuedeTildar ? '' : ' disabled';               // lo que falta cocinar no se puede tildar
    const personalizado = renglon.texto ? `<span class="etiqueta-estado tag-alerta">${escHtml(renglon.texto)}</span>` : '';
    const deCocina = renglon.clave.endsWith('-cocina');                     // endsWith = "termina con"
    const comoEsta = deCocina ? TAG_COCINA[renglon.listo] : '';            // "✓ cocinado" / "⏳ falta cocinar"
    return `
      <label class="casilla-vianda${claseTildada}${claseEsperando}">
        <input type="checkbox" class="casilla-input" data-clave="${renglon.clave}"${marcada}${apagada}>
        <span class="casilla-cantidad">${renglon.cantidad}</span>
        <span class="casilla-plato">${pastillaCodigo(renglon.codigo, renglon.nombre)}${escHtml(renglon.nombre)}</span>
        <span class="casilla-tags">${personalizado}${comoEsta}</span>
      </label>`;
  };

  // 3. Los dos grupos (cada uno, solo si tiene algo)
  const grupoHeladera = pedido.heladera.length > 0 ? `
    <section class="grupo-viandas">
      <h3 class="grupo-viandas-titulo grupo-viandas-titulo--heladera">${ICONO_HELADERA}SACAR DE LA HELADERA</h3>
      ${pedido.heladera.map(renglonHTML).join('')}
    </section>` : '';
  const grupoCocina = pedido.cocina.length > 0 ? `
    <section class="grupo-viandas">
      <h3 class="grupo-viandas-titulo grupo-viandas-titulo--cocina">${ICONO_COCINA}BUSCAR EN LO QUE DEJÓ LA COCINA</h3>
      ${pedido.cocina.map(renglonHTML).join('')}
    </section>` : '';

  // 4. El cartel amarillo, si falta cocinar algo. Ej: "Todavía falta cocinar 2 fideos (sin sal). Separá las 8 de la heladera…"
  const faltaCocinar = pedido.estado === 'falta_cocinar';
  const listaSinCocinar = pedido.sinCocinar.map(renglon => {
    const texto = renglon.texto ? ' (' + renglon.texto + ')' : '';
    return escHtml(renglon.cantidad + ' ' + renglon.nombre + texto);
  }).join(', ');
  const queHacer = pedido.viandasDeHeladera > 0 ? `Separá las ${pedido.viandasDeHeladera} de la heladera y esperá a la cocina.` : 'Esperá a la cocina.';
  const alertaHTML = faltaCocinar ? `<div class="alerta-cocina" role="status"><strong>Todavía falta cocinar ${listaSinCocinar}.</strong> ${queHacer}</div>` : '';

  // 5. El pie: el texto de abajo y el botón (estadoDelPie: lo usa también la lista)
  const pie = estadoDelPie(pedido);

  return `
    <article class="tarjeta-pedido" data-id-pedido="${pedido.id}" aria-labelledby="tituloPedido${pedido.id}">
      <div class="tarjeta-pedido-cabecera">
        <div class="tarjeta-pedido-info">
          <h2 class="etiqueta-numero" id="tituloPedido${pedido.id}">${pedido.numero}</h2>
          <div class="tarjeta-cliente">
            <button type="button" class="boton-datos-cliente" data-accion="datos" aria-haspopup="dialog" aria-label="${cliente}: datos del cliente">
              <strong class="cliente-nombre">${cliente}</strong>${ICONO_INFO}
            </button>
            <span class="cliente-direccion">${escHtml(pedido.entrega)}</span>
          </div>
        </div>
        <div class="tarjeta-pedido-total">
          <span class="total-numero">${pedido.totalViandas}</span>
          <span class="total-texto">${palabraViandas}</span>
        </div>
      </div>
      ${alertaHTML}
      ${grupoHeladera}
      ${grupoCocina}
      <div class="tarjeta-pedido-pie">
        <span class="pie-estado">${pie.texto}</span>
        <div class="pie-acciones">
          <button type="button" class="boton-secundario" data-accion="imprimir">Imprimir etiqueta</button>
          <button type="button" class="boton-principal" data-accion="armar"${pie.apagado}>${pie.boton}</button>
        </div>
      </div>
    </article>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// estadoDelPie → cómo está la bandeja de un pedido: lo que dice abajo y si se puede tocar "✓ Pedido armado"
// ENTRADA: pedido (de prepararPedido, sin armar)
// SALIDA:  { texto (HTML), boton (texto del botón en la tarjeta), apagado (' disabled' o '') }
// Ej: 4 de 5 tildadas → { texto: '<strong…>4 de 5</strong> viandas en la bandeja', boton: 'Faltan 1 de 5', apagado: ' disabled' }
//     falta cocinar   → { texto: 'Esperando a la cocina', boton: 'Todavía no se puede armar', apagado: ' disabled' }
//     todo tildado    → { …, boton: '✓ Pedido armado', apagado: '' }
// La usan la tarjeta (el pie entero) y la lista (el botón de la última fila del pedido): las reglas son las mismas.
// ─────────────────────────────────────────────────────────────────────────────
function estadoDelPie(pedido) {
  // 1. Cuántas viandas ya están en la bandeja (las de los renglones tildados)
  let enBandeja = 0;
  pedido.heladera.concat(pedido.cocina).forEach(renglon => {               // concat = las dos listas juntas
    if (!renglon.sePuedeTildar || !tildadas[renglon.clave]) return;        // (return = este no está tildado: el siguiente)
    enBandeja = enBandeja + renglon.cantidad;
  });

  // 2. El caso: esperando a la cocina, faltan tildar o todo listo para armar
  const todoTildado = enBandeja === pedido.totalViandas;
  const casoSinEsperar = todoTildado ? 'listo' : 'faltan';
  const caso = pedido.estado === 'falta_cocinar' ? 'esperando' : casoSinEsperar;
  const soloHeladera = pedido.cocina.length === 0 ? ' · todo de la heladera' : '';
  const PIE = {
    esperando: { texto: 'Esperando a la cocina', boton: 'Todavía no se puede armar', apagado: ' disabled' },
    faltan:    { texto: `<strong class="texto-oscuro">${enBandeja} de ${pedido.totalViandas}</strong> viandas en la bandeja`,
                 boton: `Faltan ${pedido.totalViandas - enBandeja} de ${pedido.totalViandas}`, apagado: ' disabled' },
    listo:     { texto: `<strong class="texto-exito">${enBandeja} de ${pedido.totalViandas}</strong> viandas en la bandeja${soloHeladera}`,
                 boton: '✓ Pedido armado', apagado: '' }
  };
  return PIE[caso];
}

// ─────────────────────────────────────────────────────────────────────────────
// renglonesDeLista → todos los renglones de varios pedidos en una sola lista, con su pedido al lado
// ENTRADA: pedidos (de prepararPedido)
// SALIDA:  [{ pedido, renglon, esPrimero, esUltimo }] — los del mismo pedido van juntos (primero heladera, después cocina)
// Ej: #081 (4 berenjenas + 1 canelones) y #083 (6 + 4) → 4 renglones: #081 primero, #081 último, #083 primero, #083 último
// La usan la lista (una fila por renglón) y la planilla (una línea por renglón).
// ─────────────────────────────────────────────────────────────────────────────
function renglonesDeLista(pedidos) {
  let renglones = [];
  pedidos.forEach(pedido => {
    const delPedido = pedido.heladera.concat(pedido.cocina);              // los renglones de este pedido
    // map con la posición: Ej: [berenjenas, canelones] → [{ …, esPrimero: true }, { …, esUltimo: true }]
    renglones = renglones.concat(delPedido.map((renglon, posicion) => ({
      pedido:    pedido,
      renglon:   renglon,
      esPrimero: posicion === 0,
      esUltimo:  posicion === delPedido.length - 1
    })));
  });
  return renglones;
}

// ─────────────────────────────────────────────────────────────────────────────
// armarLista → la vista "Lista": una tabla con una fila POR RENGLÓN de vianda
// ENTRADA: pedidos (los del filtro elegido)
// SALIDA:  el HTML de la tabla (texto). Todo lo que viene de la base pasa por escHtml.
// Ej: #081 → 2 filas: [ ] #081 · Luquitas · Delivery · Av. Colón · 4 · F2 · berenjenas · Heladera · — · Por armar
//                     [ ] #081 · Luquitas · … · 1 · P1 · canelones · Cocina · SIN SAL · ✓ cocinado · [✓ Pedido armado]
// N° y cliente van en TODAS las filas (el armador mira una fila a la vez); en las repetidas, en gris más clarito.
// Arriba de cada pedido nuevo, una línea más marcada. El botón va en la última fila, con las reglas de estadoDelPie.
// ─────────────────────────────────────────────────────────────────────────────
function armarLista(pedidos) {
  const filas = renglonesDeLista(pedidos).map(fila => {
    const pedido = fila.pedido;
    const renglon = fila.renglon;
    const cliente = escHtml(pedido.cliente);
    const deCocina = renglon.clave.endsWith('-cocina');                     // endsWith = "termina con"

    // 1. La casilla: tildada si se tildó (o si el pedido ya está armado); apagada si falta cocinar o ya está armado
    const tildado = pedido.armado || (renglon.sePuedeTildar && tildadas[renglon.clave] === true);
    const apagada = pedido.armado || !renglon.sePuedeTildar;
    const marcada = tildado ? ' checked' : '';
    const atributoApagada = apagada ? ' disabled' : '';
    const claseTildada = tildado ? ' fila-armado--tildada' : '';
    const clasePrimera = fila.esPrimero ? ' fila-armado--primera' : '';
    const claseRepetido = fila.esPrimero ? '' : ' dato-repetido';            // N° y cliente en gris clarito

    // 2. Código, de dónde sale y el personalizado
    const codigo = renglon.codigo ? `<span class="codigo-plato">${escHtml(renglon.codigo)}</span>` : '';
    const origen = deCocina ? '<span class="etiqueta-estado origen-cocina">Cocina</span>' : '<span class="etiqueta-estado origen-heladera">Heladera</span>';
    const personalizado = renglon.texto ? `<span class="etiqueta-estado tag-alerta">${escHtml(renglon.texto)}</span>` : '';

    // 3. El estado del renglón: ✓ Armado · ✓ cocinado · ⏳ falta cocinar · Por armar
    const quien = pedido.armadoPor ? ' · ' + escHtml(pedido.armadoPor) : '';
    const marcaArmado = `<span class="tag-exito">✓ Armado ${pedido.horaArmado}${quien}</span>`;
    const estadoSinArmar = deCocina ? TAG_COCINA[renglon.listo] : '<span class="estado-por-armar">Por armar</span>';
    const estado = pedido.armado ? marcaArmado : estadoSinArmar;

    // 4. El botón, solo en la última fila de un pedido sin armar (se prende con las mismas reglas que la tarjeta)
    const llevaBoton = fila.esUltimo && !pedido.armado;
    const botonHTML = `<button type="button" class="boton-principal boton-armar-fila" data-accion="armar"${estadoDelPie(pedido).apagado}>✓ Pedido armado</button>`;
    const boton = llevaBoton ? botonHTML : '';

    return `
      <tr class="fila-armado${clasePrimera}${claseTildada}" data-id-pedido="${pedido.id}">
        <td class="celda-casilla"><input type="checkbox" class="casilla-input" data-clave="${renglon.clave}" aria-label="${renglon.cantidad} ${escHtml(renglon.nombre)} del pedido ${pedido.numero}"${marcada}${atributoApagada}></td>
        <td class="celda-numero${claseRepetido}">${pedido.numero}</td>
        <td class="${claseRepetido}">
          <button type="button" class="boton-datos-cliente" data-accion="datos" aria-haspopup="dialog" aria-label="${cliente}: datos del cliente"><span class="cliente-nombre dos-renglones">${cliente}</span></button>
        </td>
        <td><span class="dos-renglones">${escHtml(pedido.entrega)}</span></td>
        <td class="celda-cantidad">${renglon.cantidad}</td>
        <td>${codigo}</td>
        <td><span class="celda-plato dos-renglones">${escHtml(renglon.nombre)}</span></td>
        <td>${origen}</td>
        <td>${personalizado}</td>
        <td>${estado}</td>
        <td class="celda-boton">${boton}</td>
      </tr>`;
  }).join('');

  return `
    <div class="table-wrapper tarjeta-lista-armado">
      <table class="standard-table grilla-fg tabla-armado">
        <thead>
          <tr>
            <th class="col-casilla"><span class="solo-lector">Tildado</span></th>
            <th class="col-numero">N°</th>
            <th class="col-cliente">Cliente</th>
            <th class="col-entrega">Entrega</th>
            <th class="col-cantidad">Cant.</th>
            <th class="col-codigo">Código</th>
            <th class="col-plato">Plato</th>
            <th class="col-origen">De dónde</th>
            <th class="col-personalizado">Personalización</th>
            <th class="col-estado">Estado</th>
            <th class="col-boton"><span class="solo-lector">Armar</span></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// tildarVianda → tilda o destilda un renglón (solo en memoria) y vuelve a dibujar la vista
// ENTRADA: casilla (el <input type="checkbox"> que se tocó, en una tarjeta o en la lista)
// SALIDA:  nada. Cambia tildadas y vuelve a dibujar (tachado, "4 de 5 viandas…" y el botón); el foco queda en la
//          misma casilla (lo hace renderizarPedidos). Lo tildado es uno solo para las dos vistas.
// Ej: #081 con 4 + 1 viandas: tildar las 4 → "4 de 5 viandas en la bandeja" y "Faltan 1 de 5"
// ─────────────────────────────────────────────────────────────────────────────
function tildarVianda(casilla) {
  const clave = casilla.dataset.clave;                            // ej: '512-heladera'
  tildadas[clave] = casilla.checked;                              // true = tildada
  renderizarPedidos();
  document.querySelector(`[data-clave="${clave}"]`)?.focus();     // el foco, en la misma casilla (?. = si sigue estando)
}

// ─────────────────────────────────────────────────────────────────────────────
// elegirVista → cambia entre tarjetas y lista, y se acuerda la elección en el navegador
// ENTRADA: vista: 'tarjetas' o 'lista'
// SALIDA:  nada. Guarda la elección (si el navegador deja), cambia el texto del botón y vuelve a dibujar
// Ej: 'lista' → el botón dice "Ver tarjetas" y se ve la tabla (en el celu, siempre las tarjetas)
// ─────────────────────────────────────────────────────────────────────────────
function elegirVista(vista) {
  vistaElegida = vista;
  try {
    localStorage.setItem(CLAVE_VISTA, vista);                     // para la próxima vez que se abra la pantalla
  } catch (error) {
    // Si el navegador no deja guardar (por ejemplo, en modo privado), la vista cambia igual
  }
  document.getElementById('botonVista').textContent = TEXTO_BOTON_VISTA[vista];
  renderizarPedidos();
}

// ─────────────────────────────────────────────────────────────────────────────
// exportarPlanilla → descarga la lista como planilla (CSV) para abrir en Excel, con el filtro elegido
// ENTRADA: nada (usa pedidosDelDia, filtroElegido y fechaElegida)
// SALIDA:  nada. Descarga "armado-AAAA-MM-DD.csv": una línea por renglón de vianda
// Ej: #081 → "#081";"Luquitas Gómez";"Delivery · Av. Colón 1250";"351 555-1234";"4";"F2";"berenjenas rellenas";"Heladera";"";"no"
// Separador ";" y BOM (﻿, una marca al principio) para que Excel abra bien los acentos. Cada dato va entre comillas.
// Seguridad: si un dato empieza con = + - o @, Excel lo tomaría como una fórmula (podría correr algo al abrirlo):
// se le pone un ' adelante y queda como texto.
// ─────────────────────────────────────────────────────────────────────────────
function exportarPlanilla() {
  const delFiltro = filtroElegido === 'todos' ? pedidosDelDia : pedidosDelDia.filter(pedido => pedido.estado === filtroElegido);
  const renglones = renglonesDeLista(delFiltro);
  if (renglones.length === 0) {
    mostrarAviso('error', 'No hay nada para exportar con el filtro elegido.');
    return;
  }

  // 1. Un dato, listo para la planilla. Ej: 'Dijo "hola"' → '"Dijo ""hola"""' · '=SUMA(A1)' → '"\'=SUMA(A1)"'
  const celda = valor => {
    const texto = String(valor ?? '');
    const pareceFormula = /^[=+\-@\t\r]/.test(texto);             // empieza con = + - @ (o un tab / enter)
    const seguro = pareceFormula ? "'" + texto : texto;
    return '"' + seguro.replace(/"/g, '""') + '"';                // las comillas de adentro se escriben dobles
  };

  // 2. Los títulos y una línea por renglón
  const titulos = ['N° pedido', 'Cliente', 'Entrega', 'Teléfono', 'Cantidad', 'Código', 'Plato', 'De dónde sale', 'Personalización', 'Armado'];
  const lineas = [titulos.map(celda).join(';')];
  renglones.forEach(fila => {
    const pedido = fila.pedido;
    const renglon = fila.renglon;
    const deDonde = renglon.clave.endsWith('-cocina') ? 'Cocina' : 'Heladera';
    const quien = pedido.armadoPor ? ' · ' + pedido.armadoPor : '';
    const armado = pedido.armado ? `sí ${pedido.horaArmado}${quien}` : 'no';
    const datos = [pedido.numero, pedido.cliente, pedido.entrega, pedido.datos.cliente_telefono, renglon.cantidad,
      renglon.codigo, renglon.nombre, deDonde, renglon.texto, armado];
    lineas.push(datos.map(celda).join(';'));
  });

  // 3. La descarga: un archivo armado en el navegador (Blob) y un link que se toca solo
  const archivo = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const direccion = URL.createObjectURL(archivo);
  const link = document.createElement('a');
  link.href = direccion;
  link.download = `armado-${fechaElegida}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(direccion);                                 // se libera la memoria del archivo
}

// ─────────────────────────────────────────────────────────────────────────────
// abrirVentana → abre la ventana de la pantalla (la misma caja de las ventanas nuevas de global.css)
// ENTRADA: contenido = { icono, titulo, frase, cuerpo, botones } (HTML: lo que venga de la base ya tiene que venir con escHtml)
// SALIDA:  nada. Llena #ventanaArmado, la muestra y pone el foco en el primer botón de abajo
// Ej: abrirVentana({ icono: ICONO_PERSONA, titulo: 'Datos del cliente', frase: '#081 · …', cuerpo: '<dl>…</dl>', botones: '…' })
// Se cierra con cerrarVentana: la X, "Cerrar" / "Cancelar", tocando lo oscuro de afuera o con Escape.
// ─────────────────────────────────────────────────────────────────────────────
function abrirVentana(contenido) {
  const ventana = document.getElementById('ventanaArmado');
  elementoAntesDeLaVentana = document.activeElement;              // para volver ahí al cerrar
  ventana.innerHTML = `
    <div class="modal-content ventana-panel ventana-armado" role="dialog" aria-modal="true" aria-labelledby="tituloVentanaArmado" aria-describedby="fraseVentanaArmado">
      <div class="cabecera-ventana">
        <span class="icono-ventana">${contenido.icono}</span>
        <div class="textos-ventana">
          <h3 id="tituloVentanaArmado">${contenido.titulo}</h3>
          <p class="frase-ventana" id="fraseVentanaArmado">${contenido.frase}</p>
        </div>
        <button type="button" class="boton-cerrar-ventana" data-cerrar aria-label="Cerrar">${ICONO_CERRAR}</button>
      </div>
      <div class="cuerpo-ventana">${contenido.cuerpo}</div>
      <div class="botones-ventana pie-ventana">${contenido.botones}</div>
    </div>`;
  ventana.style.display = 'block';                                // se abre (como las ventanas de Producción)
  ventana.querySelector('.pie-ventana button').focus();
}

// cerrarVentana → cierra la ventana y deja el foco donde estaba antes de abrirla (si todavía está en la pantalla)
function cerrarVentana() {
  const ventana = document.getElementById('ventanaArmado');
  ventana.style.display = 'none';
  ventana.innerHTML = '';
  if (elementoAntesDeLaVentana && elementoAntesDeLaVentana.isConnected) elementoAntesDeLaVentana.focus();   // isConnected = sigue en la pantalla
  elementoAntesDeLaVentana = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// abrirDatosCliente → la ventana "Datos del cliente" de un pedido
// ENTRADA: idPedido
// SALIDA:  nada. Abre la ventana con: cliente, entrega, teléfono, WhatsApp, notas y pago
// Ej: #081 con teléfono "351 555-1234" → Teléfono para llamar y "Escribir por WhatsApp" (wa.me/5493515551234)
//     #082 con teléfono "5465465" (7 dígitos) → WhatsApp: "5465465" como texto, sin link
// WhatsApp: el link se arma solo si el teléfono tiene 10 dígitos o más (sin espacios ni guiones). No se agrega la
// característica: solo el código del país para celulares (549), si no lo tiene. Lo que no está en la base no se muestra
// (horario de entrega, cadete, factura).
// ─────────────────────────────────────────────────────────────────────────────
function abrirDatosCliente(idPedido) {
  const pedido = pedidosDelDia.find(p => p.id === idPedido);     // find = el pedido (o undefined)
  if (!pedido) return;
  const datos = pedido.datos;

  // 1. Teléfono: para tocar y llamar (tel:) si tiene algún número
  const telefono = datos.cliente_telefono || '';
  const digitos = telefono.replace(/\D/g, '');                    // solo los números. Ej: "351 555-1234" → "3515551234"
  const telefonoComoTexto = telefono ? escHtml(telefono) : '<span class="dato-vacio">Sin teléfono</span>';
  const telefonoHTML = digitos ? `<a href="tel:${digitos}">${escHtml(telefono)}</a>` : telefonoComoTexto;

  // 2. WhatsApp: con 10 dígitos o más, el link; si no, el teléfono como texto
  const sinCero = digitos.replace(/^0/, '');                      // sin el 0 de adelante. Ej: "03515551234" → "3515551234"
  const numeroWhatsapp = sinCero.startsWith('54') ? sinCero : '549' + sinCero;   // con el código del país para celulares
  const linkWhatsapp = `<a href="https://wa.me/${numeroWhatsapp}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>`;
  const whatsappHTML = digitos.length >= 10 ? linkWhatsapp : telefonoComoTexto;

  // 3. Entrega, notas y pago. Ej: "Delivery · Av. Colón 1250 · Alberdi" · "Efectivo · $ 20.000 · Sin cobrar"
  const barrio = datos.barrios?.nombre ? ' · ' + datos.barrios.nombre : '';
  const entrega = pedido.esDelivery ? pedido.entrega + barrio : pedido.entrega;
  const notasHTML = datos.observaciones ? escHtml(datos.observaciones) : '<span class="dato-vacio">Sin notas</span>';
  const cobrado = datos.pagado ? '✓ Cobrado' : 'Sin cobrar';
  const total = '$ ' + (Number(datos.total) || 0).toLocaleString('es-AR');   // ej: "$ 20.000"
  const pago = (datos.metodo_pago || 'Sin método de pago') + ' · ' + total + ' · ' + cobrado;

  abrirVentana({
    icono:  ICONO_PERSONA,
    titulo: 'Datos del cliente',
    frase:  escHtml(`${pedido.numero} · Entrega ${textoDiaElegido}`),
    cuerpo: `
      <dl class="datos-cliente">
        <dt>Cliente</dt><dd>${escHtml(pedido.cliente)}</dd>
        <dt>Entrega</dt><dd>${escHtml(entrega)}</dd>
        <dt>Teléfono</dt><dd>${telefonoHTML}</dd>
        <dt>WhatsApp</dt><dd>${whatsappHTML}</dd>
        <dt>Notas</dt><dd>${notasHTML}</dd>
        <dt>Pago</dt><dd>${escHtml(pago)}</dd>
      </dl>`,
    botones: '<button type="button" class="btn-cancelar" data-cerrar>Cerrar</button>'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// pedirConfirmacion → pregunta antes de guardar la marca (no se puede deshacer)
// ENTRADA: idPedido
// SALIDA:  nada. Abre "¿Armaste el pedido #081?" con Cancelar / Confirmar (Confirmar llama a marcarArmado)
// Ej: #081 de Luquitas Gómez → "¿Armaste el pedido #081?" · "Luquitas Gómez · 5 viandas. Queda marcado como armado…"
// ─────────────────────────────────────────────────────────────────────────────
function pedirConfirmacion(idPedido) {
  const pedido = pedidosDelDia.find(p => p.id === idPedido);     // find = el pedido (o undefined)
  if (!pedido) return;
  const palabraViandas = pedido.totalViandas === 1 ? 'vianda' : 'viandas';
  abrirVentana({
    icono:  ICONO_BANDEJA,
    titulo: `¿Armaste el pedido ${pedido.numero}?`,
    frase:  escHtml(`${pedido.cliente} · ${pedido.totalViandas} ${palabraViandas}. Queda marcado como armado y no se puede deshacer.`),
    cuerpo: '',
    botones: `
      <button type="button" class="btn-cancelar" data-cerrar>Cancelar</button>
      <button type="button" class="btn-confirmar" data-confirmar-armado="${pedido.id}">Confirmar</button>`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// marcarArmado → guarda en el servidor que el pedido está armado (POST /api/pedidos/:id/armado)
// ENTRADA: idPedido y boton (el "Confirmar" de la ventana, para apagarlo mientras se guarda)
// SALIDA:  nada. Bien → cierra la ventana, avisa "✓ Pedido #081 armado" y vuelve a cargar (la tarjeta queda chiquita
//          y verde). Si el servidor dice que no (ej: 409 "Todavía falta cocinar…"), cierra y muestra su mensaje.
// Ej: #081 → { mensaje: 'Pedido #81 armado' } → aviso verde
// Manda el día que se está mirando: el servidor controla que el pedido sea de ese día. El usuario sale del token.
// ─────────────────────────────────────────────────────────────────────────────
async function marcarArmado(idPedido, boton) {
  const numero = '#' + String(idPedido).padStart(3, '0');         // ej: "#081"
  boton.disabled = true;                                          // que no se toque dos veces
  boton.textContent = 'Guardando…';

  try {
    const respuesta = await apiFetch(`/api/pedidos/${idPedido}/armado`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fecha: fechaElegida })
    });
    const datos = await respuesta.json().catch(() => null);      // si no es JSON: null
    cerrarVentana();
    const mensajeError = datos?.error || 'No se pudo marcar el pedido como armado';
    if (!respuesta.ok) mostrarAviso('error', mensajeError);       // el mensaje del servidor (ej: "Todavía falta cocinar…")
    if (respuesta.ok) mostrarAviso('exito', `Pedido ${numero} armado`);
    await cargarPedidos(true);                                    // en los dos casos: lo que dice la base ahora
  } catch (error) {
    console.error('[Armado] No se pudo marcar el pedido:', error);
    cerrarVentana();
    mostrarAviso('error', 'No se pudo conectar con el servidor. Probá de nuevo.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// imprimirEtiqueta → la etiqueta de la bandeja, para imprimir y pegar
// ENTRADA: idPedido
// SALIDA:  nada. Llena #hojaEtiqueta (en la pantalla no se ve) y abre la impresión: el CSS de impresión
//          (armadoPedidos.css, parte 11) deja en la hoja solo la etiqueta
// Ej: #081 → PEDIDO #081 · ENTREGA Jue 29/10 · Luquitas Gómez · Av. Colón 1250 · Tel. 5465465 · DELIVERY
//     · 4 F2 berenjenas rellenas · 1 P1 canelones · SIN SAL · Total: 5 viandas
// ─────────────────────────────────────────────────────────────────────────────
function imprimirEtiqueta(idPedido) {
  const pedido = pedidosDelDia.find(p => p.id === idPedido);     // find = el pedido (o undefined)
  if (!pedido) return;

  // 1. Los renglones: cantidad, código (si no está ya en el nombre), plato y el personalizado en mayúscula
  const renglones = pedido.heladera.concat(pedido.cocina).map(renglon => {
    // pastillaCodigo devuelve '' si el código ya está en el nombre: en ese caso tampoco se escribe acá
    const codigo = pastillaCodigo(renglon.codigo, renglon.nombre) ? escHtml(renglon.codigo) + ' ' : '';
    const personalizado = renglon.texto ? ` <strong>· ${escHtml(renglon.texto.toUpperCase())}</strong>` : '';
    return `<li><span class="etiqueta-bandeja-cantidad">${renglon.cantidad}</span>${codigo}${escHtml(renglon.nombre)}${personalizado}</li>`;
  }).join('');

  // 2. Dirección y teléfono. Ej: "Av. Colón 1250 · Tel. 5465465" · "Retira en el local · Tel. 5465465"
  const fecha = parseFechaLocal(fechaElegida);
  const dia = NOMBRE_DIA_CORTO[fecha.getDay()] + ' ' + fechaDDMMAAAA(fecha).slice(0, 5);   // ej: "Jue 29/10"
  const lugar = pedido.esDelivery ? (pedido.datos.cliente_direccion || 'sin dirección') : 'Retira en el local';
  const telefono = pedido.datos.cliente_telefono ? ' · Tel. ' + pedido.datos.cliente_telefono : '';
  const tipo = pedido.esDelivery ? 'DELIVERY' : 'RETIRA';
  const palabraViandas = pedido.totalViandas === 1 ? 'vianda' : 'viandas';

  document.getElementById('hojaEtiqueta').innerHTML = `
    <section class="etiqueta-bandeja" aria-label="Etiqueta del pedido ${pedido.numero}">
      <div class="etiqueta-bandeja-arriba">
        <div><span class="etiqueta-bandeja-rotulo">PEDIDO</span><span class="etiqueta-bandeja-numero">${pedido.numero}</span></div>
        <div class="etiqueta-bandeja-entrega"><span class="etiqueta-bandeja-rotulo">ENTREGA</span><span class="etiqueta-bandeja-dia">${dia}</span></div>
      </div>
      <div class="etiqueta-bandeja-cliente">
        <div><strong>${escHtml(pedido.cliente)}</strong><span class="etiqueta-bandeja-direccion">${escHtml(lugar + telefono)}</span></div>
        <span class="etiqueta-bandeja-tipo">${tipo}</span>
      </div>
      <ul class="etiqueta-bandeja-lista">${renglones}</ul>
      <div class="etiqueta-bandeja-pie"><span>Total: ${pedido.totalViandas} ${palabraViandas}</span><span>Fast &amp; Good</span></div>
    </section>`;
  window.print();                                                 // la ventana de impresión del navegador (con su vista previa)
}

// ─────────────────────────────────────────────────────────────────────────────
// mostrarAviso → el cartelito flotante de arriba a la derecha
// ENTRADA: tipo ('exito' o 'error') y mensaje (texto: se muestra como texto, nunca como HTML)
// SALIDA:  nada. Lo muestra; el de éxito se va solo a los 5 segundos, el de error queda hasta tocar ×
// Ej: ('exito', 'Pedido #081 armado') → "✓ Pedido #081 armado"
// ─────────────────────────────────────────────────────────────────────────────
function mostrarAviso(tipo, mensaje) {
  document.getElementById('avisoArmado')?.remove();               // si había uno, se va (?. = solo si existe)

  const SIGNO = { exito: '✓ ', error: '⚠ ' };
  const aviso = document.createElement('div');
  aviso.id = 'avisoArmado';
  aviso.className = 'aviso-armado aviso-armado--' + tipo;
  aviso.setAttribute('role', ROL_AVISO[tipo]);
  aviso.innerHTML = '<span class="aviso-armado-texto"></span><button type="button" class="aviso-armado-cerrar" aria-label="Cerrar aviso">×</button>';
  aviso.querySelector('.aviso-armado-texto').textContent = SIGNO[tipo] + mensaje;   // textContent: como texto
  aviso.querySelector('.aviso-armado-cerrar').addEventListener('click', () => aviso.remove());
  document.body.appendChild(aviso);

  if (tipo === 'exito') setTimeout(() => aviso.remove(), 5000);  // el de éxito se va solo
}


// ── Al abrir la pantalla ─────────────────────────────────────────────────────

// 1. Hoy en Argentina (ZONA_ARGENTINA, de fechas.js), sin importar la hora de la compu. 'en-CA' da 'AAAA-MM-DD'
hoyISO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ARGENTINA }).format(new Date());

// 2. La ventana (vacía, se llena al abrirla) y la hoja de la etiqueta (solo se ve al imprimir), al final del <body>
const ventanaArmado = document.createElement('div');
ventanaArmado.id = 'ventanaArmado';
ventanaArmado.className = 'modal';
document.body.appendChild(ventanaArmado);
const hojaEtiqueta = document.createElement('div');
hojaEtiqueta.id = 'hojaEtiqueta';
hojaEtiqueta.className = 'hoja-etiqueta';
document.body.appendChild(hojaEtiqueta);

// 3. Los botones de arriba: ‹ › y los filtros
document.getElementById('btnDiaAnterior').addEventListener('click', () => cambiarDia('anterior'));
document.getElementById('btnDiaSiguiente').addEventListener('click', () => cambiarDia('siguiente'));
document.getElementById('grupoFiltros').addEventListener('click', evento => {
  const boton = evento.target.closest('[data-filtro]');           // el filtro tocado (closest = él o el que lo contiene)
  if (!boton) return;
  filtroElegido = boton.dataset.filtro;
  document.querySelectorAll('#grupoFiltros [data-filtro]').forEach(filtro => {
    const elegido = filtro === boton;
    filtro.classList.toggle('filtro-armado--activo', elegido);   // verde el elegido
    filtro.setAttribute('aria-pressed', String(elegido));        // para los lectores de pantalla
  });
  renderizarPedidos();
});

// 4. Las tarjetas: un solo "escuchador" para todas (se dibujan de nuevo seguido). data-accion dice qué botón se tocó
const grillaPedidos = document.getElementById('pedidosBody');
grillaPedidos.addEventListener('change', evento => {
  if (!evento.target.matches('.casilla-input')) return;           // solo las casillas
  tildarVianda(evento.target);
});
grillaPedidos.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) return;
  const idPedido = Number(boton.closest('[data-id-pedido]').dataset.idPedido);   // la tarjeta o la fila de la lista
  switch (boton.dataset.accion) {
    case 'datos':      // según sea "Datos del cliente" (el nombre)
      abrirDatosCliente(idPedido);
      break;
    case 'imprimir':   // según sea "Imprimir etiqueta"
      imprimirEtiqueta(idPedido);
      break;
    case 'armar':      // según sea "✓ Pedido armado": primero pregunta
      pedirConfirmacion(idPedido);
      break;
  }
});

// 5. La ventana: la X, "Cerrar" / "Cancelar" o lo oscuro de afuera la cierran; "Confirmar" guarda. Escape también cierra
ventanaArmado.addEventListener('click', evento => {
  const tocoAfuera = evento.target === ventanaArmado;             // lo oscuro, no la caja
  const tocoCerrar = Boolean(evento.target.closest('[data-cerrar]'));
  if (tocoAfuera || tocoCerrar) cerrarVentana();
  const confirmar = evento.target.closest('[data-confirmar-armado]');
  if (confirmar) marcarArmado(Number(confirmar.dataset.confirmarArmado), confirmar);
});
document.addEventListener('keydown', evento => {
  const ventanaAbierta = ventanaArmado.style.display === 'block';
  if (evento.key === 'Escape' && ventanaAbierta) cerrarVentana();
});

// 6. (26/10) La vista: la que se eligió la última vez (si no se puede leer o es otra cosa, tarjetas).
//    "Ver lista" / "Ver tarjetas" la cambia; si la pantalla cambia de ancho (ej: se gira la tablet), se vuelve a dibujar.
let vistaGuardada = '';
try {
  vistaGuardada = localStorage.getItem(CLAVE_VISTA) || '';
} catch (error) {
  vistaGuardada = '';                                             // el navegador no deja leer: tarjetas
}
vistaElegida = vistaGuardada === 'lista' ? 'lista' : 'tarjetas';
document.getElementById('botonVista').textContent = TEXTO_BOTON_VISTA[vistaElegida];
document.getElementById('botonVista').addEventListener('click', () => {
  const otraVista = vistaElegida === 'lista' ? 'tarjetas' : 'lista';
  elegirVista(otraVista);
});
document.getElementById('botonExportar').addEventListener('click', exportarPlanilla);
pantallaChica.addEventListener('change', () => {
  if (ultimaRespuesta) renderizarPedidos();                       // solo si ya hay pedidos cargados
});

// 7. Arranca en hoy, y se vuelve a pedir el día cada 60 s (lo tildado y la ventana abierta no se tocan)
cambiarDia('hoy');
setInterval(() => cargarPedidos(true), RECARGA_SEGUNDOS * 1000);
