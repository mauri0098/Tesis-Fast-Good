// ============================================================================
// reportes.js — El Inicio (admin.html): cómo viene el día, con datos reales (27/10, rediseño)
//
// Cada tarjeta se carga sola: si una falla, las demás se ven igual. Todo lo que se pide al servidor es de SOLO LECTURA
// y usa rutas que ya existían (no hay rutas nuevas):
//   /api/pedidos (los últimos 45 días) · /api/ordenes-produccion/pendientes · /api/cocina/tareas
//   /api/insumos · /api/recetas · /api/viandas-stock
// "Hoy" es el día de Argentina (ZONA_ARGENTINA, de fechas.js), sin importar la hora de la compu.
//
// Funciones:
//   cargarInicio            → al abrir: pide todo junto y llena cada tarjeta (una que falla no frena a las otras)
//   fetchJSON               → pide una ruta con la sesión y devuelve lo que manda (o un error si no salió bien)
//   diaDelPedido / sumarDias / plata → ayudas chiquitas: el día de Argentina de un pedido, "AAAA-MM-DD" ± días, "$184.500"
//   variacion               → la pastilla "+18,4%" / "−6,2%" contra el período anterior (Ventas y Pedidos de hoy)
//   mostrarVentas           → la tarjeta Ventas, según el selector (Hoy / Ayer / Esta semana)
//   mostrarPedidosDeHoy     → la tarjeta Pedidos de hoy: los que se ENTREGAN hoy, entregados y pendientes
//   cargarViandasACocinar   → la tarjeta Viandas a cocinar: lo pedido a cocina sin hacer + los personalizados sin listo
//   mostrarEvolucion        → el gráfico de Evolución de Ventas y el total, según el selector (y los combos del período)
//   dibujarCombos           → los 3 combos más vendidos del período, con su mini barra
//   cargarInsumosCriticos   → los insumos por debajo de su mínimo (la regla de Producción), con en qué platos se usan
//   cargarViandasPorReponer → las viandas con menos libres que su mínimo (la regla de Producción), con su barra fina
// Son más de 8 porque cada tarjeta carga y dibuja lo suyo; las 3 ayudas chiquitas se usan en varias tarjetas.
// ============================================================================

// ── Lo que recuerda la pantalla ──────────────────────────────────────────────
let pedidosRecientes = [];   // los pedidos de los últimos 45 días, sin anulados (los usan Ventas, Pedidos de hoy y Evolución)
let hoyISO = '';             // hoy en Argentina, 'AAAA-MM-DD'
let graficoEvolucion = null; // el gráfico de Chart.js (se borra y se vuelve a hacer al cambiar el período)

const DIAS_DE_PEDIDOS = 45;  // cuántos días para atrás se piden los pedidos (alcanza para todos los selectores y sobra)
const MAXIMO_RENGLONES = 5;  // cuántos insumos o viandas se muestran; los demás van en "y N más"
const ESTADO_ANULADO = 5;    // un pedido anulado no cuenta en nada
const ESTADO_ENTREGADO = 4;  // (28/10) para "2 entregados · 1 pendiente" en Pedidos de hoy

const NOMBRE_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];   // getDay(): 0 = domingo
// El día de Argentina de un momento: 'en-CA' escribe 'AAAA-MM-DD' (se arma una sola vez)
const FORMATO_DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ARGENTINA });
const FLECHA = '<svg aria-hidden="true"><use href="#icono-flecha-derecha"></use></svg>';   // la › de los enlaces sutiles


// ─────────────────────────────────────────────────────────────────────────────
// cargarInicio → al abrir la pantalla: pide todo y llena las tarjetas
// ENTRADA: nada
// SALIDA:  nada. Escribe el saludo ("Hola, Mauri") y cada tarjeta muestra sus datos, o "No se pudo cargar" si su
//          pedido al servidor falló
// Ej: abre el Inicio el martes 27/10 → pide los pedidos del 13/09 al 27/10, la cocina, los insumos y la heladera
// ─────────────────────────────────────────────────────────────────────────────
async function cargarInicio() {
  hoyISO = FORMATO_DIA_ARGENTINA.format(new Date());              // ej: '2026-10-27'

  // 0. (28/10) El saludo de arriba con el nombre del que entró (lo guardó auth.js al iniciar sesión).
  //    textContent: se muestra como texto. Ej: "Mauri" → "Hola, Mauri" · sin nombre → "Hola"
  const nombre = (localStorage.getItem('usuario_nombre') || '').trim();
  const saludo = nombre ? 'Hola, ' + nombre : 'Hola';
  document.getElementById('saludoInicio').textContent = saludo;

  // 1. Los pedidos (una sola vez): con ellos salen Ventas, Pedidos de hoy, Evolución y Combos.
  //    Los anulados no cuentan en nada: se sacan acá.
  const desde = sumarDias(hoyISO, -(DIAS_DE_PEDIDOS - 1));       // ej: 45 días contando hoy
  const cargaPedidos = fetchJSON(`/api/pedidos?desde=${desde}&hasta=${hoyISO}`)
    .then(pedidos => {
      pedidosRecientes = (pedidos || []).filter(pedido => pedido.id_estado !== ESTADO_ANULADO);
      mostrarVentas();
      mostrarPedidosDeHoy();
      mostrarEvolucion();
    })
    .catch(error => {
      console.error('[Inicio] No se pudieron traer los pedidos:', error);   // el detalle, solo en la consola
      ['ventasACobrar', 'pedidosHoyEstados'].forEach(id => { document.getElementById(id).textContent = 'No se pudo cargar'; });
      document.getElementById('evolucionTotal').textContent = '—';
      document.getElementById('vacioCombos').textContent = 'No se pudo cargar.';
      document.getElementById('vacioCombos').hidden = false;
    });

  // 2. Las otras tarjetas, todas a la vez (cada una se ocupa de sus errores)
  await Promise.all([cargaPedidos, cargarViandasACocinar(), cargarInsumosCriticos(), cargarViandasPorReponer()]);
}

// fetchJSON → pide una ruta con la sesión (apiFetch, de api.js) y devuelve lo que manda
// ENTRADA: url · SALIDA: los datos (o un error si el servidor no respondió bien)
// Ej: fetchJSON('/api/insumos') → [{ id: 3, nombre: 'Carne', stock_actual: 2.4, … }]
async function fetchJSON(url) {
  const respuesta = await apiFetch(url);
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status} en ${url}`);
  return respuesta.json();
}

// diaDelPedido → el día de Argentina en que se hizo un pedido. Ej: '2026-10-27T01:30:00+00:00' → '2026-10-26' (22:30 en Argentina)
function diaDelPedido(pedido) {
  return FORMATO_DIA_ARGENTINA.format(fechaDeTimestamp(pedido.fecha_pedido));   // fechaDeTimestamp: de fechas.js
}

// sumarDias → un día 'AAAA-MM-DD' más (o menos) N días. Ej: ('2026-10-01', -1) → '2026-09-30'
function sumarDias(iso, dias) {
  const fecha = parseFechaLocal(iso);                             // a medianoche (fechas.js)
  fecha.setDate(fecha.getDate() + dias);                          // setDate pasa de mes solo
  return fechaLocalISO(fecha);
}

// plata → un monto como se ve en el Inicio. Ej: 184500 → "$184.500"
function plata(monto) {
  return '$' + Math.round(Number(monto) || 0).toLocaleString('es-AR');
}


// ─────────────────────────────────────────────────────────────────────────────
// variacion → la pastilla con cuánto subió o bajó contra el período anterior
// ENTRADA: elemento (la pastilla), actual y anterior (dos números)
// SALIDA:  nada. Escribe "+18,4%" en verde (subió o quedó igual) o "−6,2%" en rojo (bajó).
//          Si antes hubo 0, no se puede comparar: la pastilla se esconde
// Ej: (pastilla, 184500, 155800) → "+18,4%" verde · (pastilla, 38, 40) → "−5%" rojo · (pastilla, 3, 0) → escondida
// ─────────────────────────────────────────────────────────────────────────────
function variacion(elemento, actual, anterior) {
  elemento.hidden = anterior === 0;                               // sin con qué comparar: escondida
  if (anterior === 0) return;
  const porcentaje = (actual - anterior) / anterior * 100;        // ej: (184500 − 155800) / 155800 × 100 = 18,4
  const subio = porcentaje >= 0;
  const signo = subio ? '+' : '−';                                // el "−" largo, como en los diseños
  const numero = Math.abs(porcentaje).toLocaleString('es-AR', { maximumFractionDigits: 1 });   // ej: "18,4"
  const clase = subio ? 'etiqueta-variacion--sube' : 'etiqueta-variacion--baja';
  elemento.textContent = signo + numero + '%';
  elemento.className = 'etiqueta-variacion ' + clase;
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarVentas → la tarjeta Ventas, según el selector
// ENTRADA: nada (lee el selector #ventasPeriodo y pedidosRecientes)
// SALIDA:  nada. Escribe el total vendido, la variación contra el período anterior y "A cobrar: $X"
// Ej: "Hoy" → lo vendido hoy (pedidos hechos hoy) contra ayer · "Esta semana" → de lunes a hoy contra la semana pasada
//     hasta el mismo día. "A cobrar" = los pedidos del período que todavía no están cobrados (pagado = no)
// Los días son los de fecha_pedido (cuándo se hizo el pedido), en hora de Argentina.
// ─────────────────────────────────────────────────────────────────────────────
function mostrarVentas() {
  // 1. Los dos períodos: el elegido y el anterior, cada uno { desde, hasta } ('AAAA-MM-DD')
  const ayer = sumarDias(hoyISO, -1);
  const diaSemana = parseFechaLocal(hoyISO).getDay();             // 0 = domingo … 6 = sábado
  const desdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;         // cuántos días pasaron desde el lunes (el domingo, 6)
  const lunes = sumarDias(hoyISO, -desdeLunes);
  const PERIODOS = {
    hoy:    { actual: { desde: hoyISO, hasta: hoyISO }, anterior: { desde: ayer, hasta: ayer } },
    ayer:   { actual: { desde: ayer, hasta: ayer }, anterior: { desde: sumarDias(hoyISO, -2), hasta: sumarDias(hoyISO, -2) } },
    semana: { actual: { desde: lunes, hasta: hoyISO }, anterior: { desde: sumarDias(lunes, -7), hasta: sumarDias(hoyISO, -7) } }
  };
  const periodo = PERIODOS[document.getElementById('ventasPeriodo').value] || PERIODOS.hoy;

  // 2. Lo vendido en cada período y lo que falta cobrar del elegido ('AAAA-MM-DD' se compara como texto)
  let vendido = 0;
  let vendidoAntes = 0;
  let aCobrar = 0;
  pedidosRecientes.forEach(pedido => {
    const dia = diaDelPedido(pedido);
    const total = Number(pedido.total) || 0;
    const enElPeriodo = dia >= periodo.actual.desde && dia <= periodo.actual.hasta;
    const enElAnterior = dia >= periodo.anterior.desde && dia <= periodo.anterior.hasta;
    if (enElPeriodo) vendido = vendido + total;
    if (enElAnterior) vendidoAntes = vendidoAntes + total;
    if (enElPeriodo && !pedido.pagado) aCobrar = aCobrar + total;
  });

  // 3. La tarjeta
  document.getElementById('ventasValor').textContent = plata(vendido);
  document.getElementById('ventasACobrar').textContent = 'A cobrar: ' + plata(aCobrar);
  variacion(document.getElementById('ventasVariacion'), vendido, vendidoAntes);
}

// ─────────────────────────────────────────────────────────────────────────────
// mostrarPedidosDeHoy → la tarjeta Pedidos de hoy: los pedidos que se ENTREGAN hoy (Delivery o Retiro)
// ENTRADA: nada (usa pedidosRecientes: los hechos en los últimos 45 días, sin anulados)
// SALIDA:  nada. Escribe cuántos, la variación contra los que se entregaron ayer y cómo van: "30 entregados · 8 pendientes"
//          (28/10: se sacó el renglón "26 Delivery · 12 Retiro")
// Ej: 38 con entrega hoy (30 ya entregados) y 40 ayer → "38", "−5%", "30 entregados · 8 pendientes"
// ─────────────────────────────────────────────────────────────────────────────
function mostrarPedidosDeHoy() {
  const ayer = sumarDias(hoyISO, -1);
  const deHoy = pedidosRecientes.filter(pedido => pedido.fecha_entrega === hoyISO);   // los que se entregan hoy
  const deAyer = pedidosRecientes.filter(pedido => pedido.fecha_entrega === ayer).length;

  // (28/10) Cómo van: entregados (estado 4) y pendientes (1, 2 y 3; los anulados ya no están). Ej: "2 entregados · 1 pendiente"
  const entregados = deHoy.filter(pedido => pedido.id_estado === ESTADO_ENTREGADO).length;
  const pendientes = deHoy.length - entregados;
  const palabraEntregados = entregados === 1 ? ' entregado' : ' entregados';
  const palabraPendientes = pendientes === 1 ? ' pendiente' : ' pendientes';

  document.getElementById('pedidosHoyValor').textContent = String(deHoy.length);
  document.getElementById('pedidosHoyEstados').textContent = entregados + palabraEntregados + ' · ' + pendientes + palabraPendientes;
  variacion(document.getElementById('pedidosHoyVariacion'), deHoy.length, deAyer);
}

// ─────────────────────────────────────────────────────────────────────────────
// cargarViandasACocinar → la tarjeta Viandas a cocinar
// ENTRADA: nada (pide /api/ordenes-produccion/pendientes y /api/cocina/tareas)
// SALIDA:  nada. Escribe el total, "Pendiente" (naranja) o "Al día" (verde) y "12 para stock · 6 personalizadas"
// Ej: un pedido a cocina de 12 sin "Hecho" + 6 "sin sal" de clientes sin listo → "18", "Pendiente", "12 para stock · 6 personalizadas"
//     nada pendiente → "0", "Al día", "0 para stock · 0 personalizadas"
// ─────────────────────────────────────────────────────────────────────────────
async function cargarViandasACocinar() {
  try {
    const [pendientes, tareas] = await Promise.all([
      fetchJSON('/api/ordenes-produccion/pendientes'),            // lo pedido a cocina sin "Hecho"
      fetchJSON('/api/cocina/tareas')                             // los pedidos de clientes en 2, con sus platos
    ]);

    // 1. Para stock: las viandas de los pedidos a cocina sin hacer
    let paraStock = 0;
    (pendientes || []).forEach(plato => { paraStock = paraStock + (Number(plato.cantidad) || 0); });

    // 2. Personalizadas: los platos personalizados sin listo. Primero todos los platos en una sola lista
    //    (concat los junta). Ej: [{ pedido_detalles: [a, b] }, { pedido_detalles: [c] }] → [a, b, c]
    let detalles = [];
    (tareas || []).forEach(pedido => { detalles = detalles.concat(pedido.pedido_detalles || []); });
    let personalizadas = 0;
    detalles.forEach(detalle => {
      const sinHacer = detalle.personalizado === true && !detalle.listo;
      if (!sinHacer) return;                                      // (return = este no: el siguiente)
      personalizadas = personalizadas + (Number(detalle.cantidad) || 0);
    });

    // 3. La tarjeta
    const total = paraStock + personalizadas;
    const hayPendientes = total > 0;
    const estado = document.getElementById('cocinarEstado');
    const claseEstado = hayPendientes ? 'etiqueta-estado-cocina--pendiente' : 'etiqueta-estado-cocina--al-dia';   // naranja o verde
    estado.textContent = hayPendientes ? 'Pendiente' : 'Al día';
    estado.className = 'etiqueta-estado-cocina ' + claseEstado;
    estado.hidden = false;
    const palabra = personalizadas === 1 ? 'personalizada' : 'personalizadas';
    document.getElementById('cocinarValor').textContent = String(total);
    document.getElementById('cocinarDetalle').textContent = paraStock + ' para stock · ' + personalizadas + ' ' + palabra;
  } catch (error) {
    console.error('[Inicio] No se pudo cargar lo de cocina:', error);
    document.getElementById('cocinarDetalle').textContent = 'No se pudo cargar';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// mostrarEvolucion → el gráfico de Evolución de Ventas, el total del período y los combos más vendidos
// ENTRADA: nada (lee el selector #evolucionPeriodo y pedidosRecientes)
// SALIDA:  nada. Dibuja un punto por día con lo vendido ese día (los días sin ventas en 0) y escribe el total
// Ej: "Últimos 7 días" el martes 27/10 → Mié 21 … Lun 26 · Hoy, y "$1.140.200"
//     "Este mes" → del 1/10 a hoy · "Últimos 30 días" → los 30 días hasta hoy
// ─────────────────────────────────────────────────────────────────────────────
function mostrarEvolucion() {
  // 1. Desde qué día, según el selector (hasta hoy, siempre)
  const selector = document.getElementById('evolucionPeriodo');
  const DESDE = {
    '7dias':  sumarDias(hoyISO, -6),
    'mes':    hoyISO.slice(0, 8) + '01',                          // ej: '2026-10-27' → '2026-10-01'
    '30dias': sumarDias(hoyISO, -29)
  };
  const desde = DESDE[selector.value] || DESDE['7dias'];

  // 2. Un lugar por día, en 0 (así se ven también los días sin ventas). Ej: { '2026-10-21': 0, …, '2026-10-27': 0 }
  const ventasPorDia = {};
  const dias = [];
  let dia = desde;
  while (dia <= hoyISO) {
    ventasPorDia[dia] = 0;
    dias.push(dia);
    dia = sumarDias(dia, 1);
  }

  // 3. Lo vendido cada día, y los pedidos del período (para los combos)
  let total = 0;
  const delPeriodo = pedidosRecientes.filter(pedido => diaDelPedido(pedido) >= desde);
  delPeriodo.forEach(pedido => {
    const diaPedido = diaDelPedido(pedido);
    const monto = Number(pedido.total) || 0;
    ventasPorDia[diaPedido] = (ventasPorDia[diaPedido] || 0) + monto;
    total = total + monto;
  });
  document.getElementById('evolucionTotal').textContent = plata(total);

  // 4. Los nombres de los días: "Mié 21" y el último "Hoy". El de hoy en verde; los demás en gris
  const etiquetas = dias.map(diaISO => {
    const fecha = parseFechaLocal(diaISO);
    const esHoy = diaISO === hoyISO;
    return esHoy ? 'Hoy' : NOMBRE_DIA_CORTO[fecha.getDay()] + ' ' + fecha.getDate();
  });
  const colores = dias.map(diaISO => (diaISO === hoyISO ? '#127f36' : '#6b766e'));   // verde-texto / gris suave

  // 5. El gráfico (se borra el de antes). El relleno: verde suave arriba que se va a transparente abajo
  if (graficoEvolucion) graficoEvolucion.destroy();
  const lienzo = document.getElementById('chartEvolucion');
  const contexto = lienzo.getContext('2d');
  const degrade = contexto.createLinearGradient(0, 0, 0, lienzo.parentElement.clientHeight);
  degrade.addColorStop(0, 'rgba(18, 137, 58, 0.14)');
  degrade.addColorStop(1, 'rgba(18, 137, 58, 0)');
  const muchosDias = dias.length > 10;                            // con muchos días, puntos más chicos
  const radio = muchosDias ? 2.5 : 4.5;
  graficoEvolucion = new Chart(contexto, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [{
        data: dias.map(diaISO => ventasPorDia[diaISO]),
        borderColor: '#12893a',                                   // --verde-principal
        backgroundColor: degrade,
        fill: true,
        tension: 0.4,                                             // la curva suave
        borderWidth: 3,
        pointRadius: radio,
        pointHoverRadius: radio + 2,
        // Los puntos blancos con borde verde; el de hoy, verde lleno
        pointBackgroundColor: dias.map(diaISO => (diaISO === hoyISO ? '#12893a' : '#ffffff')),
        pointBorderColor: '#12893a',
        pointBorderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,                                           // aparece ya dibujado (sin la animación de entrada)
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: punto => ' ' + plata(punto.raw) } }   // al pasar el mouse: "$184.500"
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: colores, font: { family: 'Inter', size: 11.5, weight: 500 } } },
        y: { display: false, beginAtZero: true }
      }
    }
  });
  lienzo.setAttribute('aria-label', 'Ventas por día: ' + plata(total) + ' en ' + selector.options[selector.selectedIndex].text.toLowerCase());

  // 6. Los combos más vendidos del mismo período
  document.getElementById('combosPeriodo').textContent = selector.options[selector.selectedIndex].text;   // ej: "Últimos 7 días"
  dibujarCombos(delPeriodo);
}

// ─────────────────────────────────────────────────────────────────────────────
// dibujarCombos → los 3 combos más vendidos, con su mini barra
// ENTRADA: pedidos (los del período del gráfico, sin anulados)
// SALIDA:  nada. Llena #listaCombos (o muestra "Sin ventas en el período")
// Ej: 77 "Combo semanal x10", 49 "Combo mensual x20", 22 "Combo express x5" de 148 → #1 77 u. 52% · #2 49 u. 33% · #3 22 u. 15%
// "u." = cuántas veces se vendió ese combo; el % es sobre todos los combos vendidos en el período.
// ─────────────────────────────────────────────────────────────────────────────
function dibujarCombos(pedidos) {
  // 1. Cuántas veces se vendió cada combo. Primero todos los combos de todos los pedidos en una lista (concat)
  let combos = [];
  pedidos.forEach(pedido => { combos = combos.concat(pedido.pedido_combos || []); });
  const vecesPorNombre = {};                                      // { nombre: veces }
  combos.forEach(combo => {
    const nombre = combo.combos?.nombre || 'Combo';               // ?. = "si vino el combo, su nombre"
    vecesPorNombre[nombre] = (vecesPorNombre[nombre] || 0) + 1;
  });

  // 2. Los 3 más vendidos. Object.entries da [nombre, veces]; sort de mayor a menor; slice(0, 3) = los 3 primeros
  //    Ej: { A: 2, B: 7, C: 4 } → [['B', 7], ['C', 4], ['A', 2]]
  const top = Object.entries(vecesPorNombre).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lista = document.getElementById('listaCombos');
  document.getElementById('vacioCombos').hidden = top.length > 0;
  lista.innerHTML = top.map((entrada, posicion) => {
    const porcentaje = Math.round(entrada[1] * 100 / combos.length);   // ej: 77 de 148 → 52
    return `
      <li class="item-combo">
        <div class="item-combo__cabecera">
          <span class="item-combo__izq"><span class="item-combo__posicion">#${posicion + 1}</span><span class="item-combo__nombre">${escHtml(entrada[0])}</span></span>
          <span class="item-combo__metricas"><span class="item-combo__unidades">${entrada[1]} u.</span><span class="item-combo__porcentaje">${porcentaje}%</span></span>
        </div>
        <div class="item-combo__barra"><div class="item-combo__progreso" data-ancho="${porcentaje}"></div></div>
      </li>`;
  }).join('');
  // El ancho de cada barra (data-ancho = el %): se pone desde acá, no escrito en el HTML
  lista.querySelectorAll('[data-ancho]').forEach(barra => { barra.style.width = barra.dataset.ancho + '%'; });
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarInsumosCriticos → la tarjeta Insumos críticos
// ENTRADA: nada (pide /api/insumos y /api/recetas)
// SALIDA:  nada. Llena #listaInsumosCriticos con los más justos primero (hasta 5, y "y N más" con el enlace a
//          Gestión de Stock) y "N alertas"; si no hay ninguno, muestra "✓ Stock de insumos al día"
// Ej: Carne 2,4 kg con mínimo 8 → "Carne" · "Lo usan: Berenjenas rellenas, Canelones" · "2,4 kg rest." · "Mínimo: 8 kg"
// La regla es la de Producción (28/10): con mínimo 0 no se controla; crítico si stock_actual < stock_minimo (justo en
// el mínimo no es alerta). Los desactivados no cuentan.
// Si las recetas no se pueden leer, debajo va la categoría del insumo.
// ─────────────────────────────────────────────────────────────────────────────
async function cargarInsumosCriticos() {
  const lista = document.getElementById('listaInsumosCriticos');
  try {
    // 1. Los insumos y las recetas (si las recetas fallan, la tarjeta sigue sin el "Lo usan")
    const [insumos, recetas] = await Promise.all([
      fetchJSON('/api/insumos'),
      fetchJSON('/api/recetas').catch(() => [])
    ]);

    // 2. En qué platos se usa cada insumo: { id_insumo: ['Berenjenas rellenas', 'Canelones'] }
    const platosPorInsumo = {};
    let renglonesReceta = [];                                     // cada renglón de receta con el nombre de su plato
    (recetas || []).forEach(plato => {
      renglonesReceta = renglonesReceta.concat((plato.insumos || []).map(renglon => ({ id_insumo: renglon.id_insumo, plato: plato.nombre_producto })));
    });
    renglonesReceta.forEach(renglon => {
      platosPorInsumo[renglon.id_insumo] = (platosPorInsumo[renglon.id_insumo] || []).concat(renglon.plato);
    });

    // 3. Los críticos, los más justos primero (lo que hay comparado con el mínimo: 0,3 va antes que 0,9)
    const cuanto = insumo => Number(insumo.stock_actual) / Math.max(Number(insumo.stock_minimo), 1);   // ej: 2,4 / 8 = 0,3
    // (28/10) La regla de Producción: con mínimo 0 no se controla; es crítico si el stock queda POR DEBAJO del mínimo
    // (justo en el mínimo, no). Ej: mínimo 8 → 7,9 es alerta, 8 no · mínimo 0 → nunca
    const esCritico = insumo => insumo.activo !== false && Number(insumo.stock_minimo) > 0 && Number(insumo.stock_actual) < Number(insumo.stock_minimo);
    const criticos = (insumos || []).filter(esCritico).sort((a, b) => cuanto(a) - cuanto(b));

    // 4. La pastilla "N alertas" y el estado vacío
    const contador = document.getElementById('contadorInsumos');
    contador.textContent = criticos.length + (criticos.length === 1 ? ' alerta' : ' alertas');
    contador.hidden = criticos.length === 0;
    document.getElementById('vacioInsumos').hidden = criticos.length > 0;

    // 5. Los renglones (hasta 5) y "y N más"
    const numero = valor => Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 });   // ej: 2.4 → "2,4"
    const renglones = criticos.slice(0, MAXIMO_RENGLONES).map(insumo => {
      const unidad = insumo.unidad_medida ? ' ' + insumo.unidad_medida : '';
      const platos = platosPorInsumo[insumo.id] || [];
      const categoria = insumo.categorias_insumos?.nombre || '';
      const detalle = platos.length > 0 ? 'Lo usan: ' + platos.join(', ') : categoria;
      return `
        <li class="renglon-insumo">
          <span class="renglon-insumo__icono"><svg aria-hidden="true"><use href="#icono-alerta"></use></svg></span>
          <span class="renglon-insumo__texto">
            <span class="renglon-insumo__nombre">${escHtml(insumo.nombre)}</span>
            <span class="renglon-insumo__detalle" title="${escHtml(detalle)}">${escHtml(detalle)}</span>
          </span>
          <span class="renglon-insumo__der">
            <span class="renglon-insumo__restante">${numero(insumo.stock_actual)}${escHtml(unidad)} rest.</span>
            <span class="renglon-insumo__minimo">Mínimo: ${numero(insumo.stock_minimo)}${escHtml(unidad)}</span>
          </span>
        </li>`;
    });
    const quedan = criticos.length - MAXIMO_RENGLONES;
    const mas = quedan > 0 ? `<li class="renglon-mas"><a class="enlace-sutil" href="pages/stock.html">y ${quedan} más en Gestión de Stock${FLECHA}</a></li>` : '';
    lista.innerHTML = renglones.join('') + mas;
  } catch (error) {
    console.error('[Inicio] No se pudieron cargar los insumos:', error);
    lista.innerHTML = '<li class="texto-vacio">No se pudo cargar.</li>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// cargarViandasPorReponer → la tarjeta Viandas por reponer
// ENTRADA: nada (pide /api/viandas-stock)
// SALIDA:  nada. Llena #listaViandasReponer con las más justas primero (hasta 5, y "y N más" con el enlace a
//          Producción); si no hay ninguna, muestra "✓ Heladera completa"
// Ej: F2 Berenjenas rellenas con 2 libres y mínimo 13 → "F2 Berenjenas rellenas · 2 u. restantes" y la barra al 15%
// La regla es la de Producción (estadoDelPlato, heladera.js): con mínimo 0 no se controla; falta si las libres
// (stock_heladera) son menos que el mínimo.
// ─────────────────────────────────────────────────────────────────────────────
async function cargarViandasPorReponer() {
  const lista = document.getElementById('listaViandasReponer');
  try {
    const platos = await fetchJSON('/api/viandas-stock');

    // 1. Las que faltan, las más justas primero (libres comparadas con el mínimo)
    const cuanto = plato => Number(plato.stock_heladera) / Number(plato.stock_minimo);   // ej: 2 / 13 = 0,15
    const porReponer = (platos || [])
      .filter(plato => Number(plato.stock_minimo) > 0 && Number(plato.stock_heladera) < Number(plato.stock_minimo))
      .sort((a, b) => cuanto(a) - cuanto(b));
    document.getElementById('vacioViandas').hidden = porReponer.length > 0;

    // 2. Los renglones (hasta 5) y "y N más". La barra: libres ÷ mínimo (entre 0 y 100)
    const renglones = porReponer.slice(0, MAXIMO_RENGLONES).map(plato => {
      const libres = Number(plato.stock_heladera);
      const palabra = libres === 1 ? 'u. restante' : 'u. restantes';
      const ancho = Math.max(0, Math.round(libres * 100 / Number(plato.stock_minimo)));   // ej: 2 de 13 → 15
      return `
        <li class="renglon-vianda">
          <div class="renglon-vianda__fila">
            <span class="renglon-vianda__izq">${pastillaCodigo(plato.codigo_plato, plato.nombre)}<span class="renglon-vianda__nombre">${escHtml(plato.nombre)}</span></span>
            <span class="renglon-vianda__restante">${libres} ${palabra}</span>
          </div>
          <div class="renglon-vianda__barra"><div class="renglon-vianda__progreso" data-ancho="${ancho}"></div></div>
        </li>`;
    });
    const quedan = porReponer.length - MAXIMO_RENGLONES;
    const mas = quedan > 0 ? `<li class="renglon-mas"><a class="enlace-sutil" href="pages/heladera.html">y ${quedan} más en Producción${FLECHA}</a></li>` : '';
    lista.innerHTML = renglones.join('') + mas;
    // El ancho de cada barra (data-ancho = el %): se pone desde acá, no escrito en el HTML
    lista.querySelectorAll('[data-ancho]').forEach(barra => { barra.style.width = barra.dataset.ancho + '%'; });
  } catch (error) {
    console.error('[Inicio] No se pudo cargar la heladera:', error);
    lista.innerHTML = '<li class="texto-vacio">No se pudo cargar.</li>';
  }
}


// ── Al abrir la pantalla ─────────────────────────────────────────────────────
// Los selectores vuelven a dibujar su tarjeta con los pedidos que ya están (no se vuelve a pedir nada)
document.getElementById('ventasPeriodo').addEventListener('change', mostrarVentas);
document.getElementById('evolucionPeriodo').addEventListener('change', mostrarEvolucion);
cargarInicio();
