// ============================================================================
// fechas.js — Días hábiles y fechas locales (compartido)
// Lo usan pedidoCombos.js (fecha de entrega del cliente en la web), ListarPedidos.js
// (pedidos a producir hoy), otras pantallas del panel y server.js. Todo trabaja con la fecha LOCAL: nunca usar
// toISOString(), que convierte a UTC y en Argentina cambia de día a las 21 h.
// 25/10: acá están también las reglas de la fecha de entrega (las usan la web y el servidor, así son las mismas):
//   HORA_CORTE, DIAS_HABILES_ENTREGA, DIAS_HABILES_CON_PERSONALIZADO y primeraFechaEntrega.
// ============================================================================

// ── Las reglas de la fecha de entrega (25/10: antes estaban repetidas en server.js y en pedidoCombos.js) ──
// La cocina corta a las 21: un pedido SOLO DE HELADERA hecho desde las 21:00 (hora de Argentina) ya no se entrega
// hoy; la primera fecha es el próximo día hábil. Un pedido con personalizado no cambia (mirá abajo).
const HORA_CORTE = 21;
// Días hábiles mínimos para la entrega (24/10):
//   0 → todo sale de la heladera (ya está hecho): cualquier día hábil desde hoy (antes de las 21).
//   2 → con algún personalizado: un día de producción en el medio. Pide el martes → se cocina el miércoles
//       → se entrega desde el jueves.
const DIAS_HABILES_ENTREGA = 0;
const DIAS_HABILES_CON_PERSONALIZADO = 2;
// La zona horaria de la cocina: "hoy" y la hora del corte salen de acá, sin importar la hora de la compu del
// cliente ni la del servidor (Render corre en UTC: a las 21 h de Argentina, para él ya es mañana)
const ZONA_ARGENTINA = 'America/Argentina/Cordoba';

const FERIADOS = [
  // '2026-01-01', // Año Nuevo
  // '2026-03-03', // Carnaval
  // '2026-03-04', // Carnaval
  // '2026-03-24', // Día de la Memoria
  // '2026-04-02', // Malvinas
  // '2026-04-03', // Viernes Santo
  // '2026-05-01', // Día del Trabajador
  // '2026-05-25', // Día de la Patria
  // '2026-06-15', // Paso a la Inmortalidad del Gral. Belgrano
  // '2026-07-09', // Día de la Independencia
  // '2026-08-17', // Paso a la Inmortalidad del Gral. San Martín
  // '2026-10-12', // Día del Respeto a la Diversidad Cultural
  // '2026-11-23', // Día de la Soberanía Nacional
  // '2026-12-08', // Inmaculada Concepción
  // '2026-12-25', // Navidad
];

// Date → 'YYYY-MM-DD' con la fecha local
function fechaLocalISO(fecha) {
  const yyyy = fecha.getFullYear();
  const mm   = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd   = String(fecha.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 'YYYY-MM-DD' → Date a medianoche LOCAL (new Date('YYYY-MM-DD') la toma como UTC)
function parseFechaLocal(texto) {
  const [y, m, d] = texto.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Timestamp de la base (ej. fecha_pedido '2026-09-28T20:06:11+00:00') → Date.
// Si viniera sin zona horaria se toma como UTC (la base guarda en UTC); new Date() solo
// lo tomaría como hora local. Después, getDate()/getDay() dan el día en hora de Argentina.
function fechaDeTimestamp(texto) {
  const tieneZona = /(Z|[+-]\d\d:?\d\d)$/.test(texto);
  return new Date(tieneZona ? texto : texto + 'Z');
}

// Lunes a viernes, salteando FERIADOS
function esDiaHabil(fecha) {
  const dia = fecha.getDay();
  if (dia === 0 || dia === 6) return false;
  return !FERIADOS.includes(fechaLocalISO(fecha));
}

// Avanza `cantidad` días hábiles desde `desde` (sin contar el propio día)
function sumarDiasHabiles(desde, cantidad) {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let contados = 0;
  while (contados < cantidad) {
    d.setDate(d.getDate() + 1);
    if (esDiaHabil(d)) contados++;
  }
  return d;
}

// El próximo día hábil después de `desde` (por defecto, hoy)
function proximoDiaHabil(desde = new Date()) {
  return sumarDiasHabiles(desde, 1);
}

// El último día hábil ANTES de `fecha` (sin contar el propio día).
// Es el día de producción de un pedido: se cocina el día hábil anterior a la entrega.
// Ej.: entrega lunes 19/10 → viernes 16/10 (se saltea el fin de semana).
function diaHabilAnterior(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  do { d.setDate(d.getDate() - 1); } while (!esDiaHabil(d));
  return d;
}

// Date → "16/10/2026" (fecha local)
function fechaDDMMAAAA(fecha) {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

// Date → "28/09/2026 22:05" (fecha y hora locales)
function fechaHoraDDMMAAAA(fecha) {
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mi = String(fecha.getMinutes()).padStart(2, '0');
  return `${fechaDDMMAAAA(fecha)} ${hh}:${mi}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// primeraFechaEntrega → la primera fecha de entrega que se puede elegir (25/10, con el horario de corte)
// ENTRADA: hayPersonalizado (true si el pedido tiene algún plato personalizado) y ahora (el momento; por defecto,
//          ahora mismo). Del momento se saca el día y la hora DE ARGENTINA.
// SALIDA:  { fecha, pasoElCorte }. fecha: la primera fecha (Date, a medianoche) · pasoElCorte: true si era solo de
//          heladera y ya eran las 21 o más (para avisarle al cliente por qué no es hoy)
// Ej: solo heladera, lunes 26/10 20:59 → { lunes 26/10, false } · lunes 21:01 → { martes 27/10, true }
//     viernes 30/10 21:01 → { lunes 02/11, true } · sábado a cualquier hora → { lunes, … } (el sábado no se entrega)
//     con personalizado, lunes 21:01 → { miércoles 28/10, false } (el corte no lo cambia: se cocina el martes)
// La usan el servidor (POST /api/pedidos-combos, que es el que manda) y la web (abrirFinalizarPedido).
// ─────────────────────────────────────────────────────────────────────────────
function primeraFechaEntrega(hayPersonalizado, ahora = new Date()) {
  // 1. El día y la hora de Argentina en ese momento. formatToParts los da por separado:
  //    Ej: [{ type: 'year', value: '2026' }, { type: 'month', value: '10' }, …, { type: 'hour', value: '21' }]
  //    hourCycle 'h23' = las horas de 0 a 23 (a la medianoche da "00", no "24")
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(ahora);
  const valor = tipo => Number(partes.find(parte => parte.type === tipo).value);   // find = la parte de ese tipo
  const hoy = new Date(valor('year'), valor('month') - 1, valor('day'));           // hoy en Argentina, a medianoche
  const hora = valor('hour');                                                       // la hora en Argentina (0 a 23)

  // 2. ¿Pasó el corte? Solo cuenta si todo sale de la heladera (con personalizado ya hay un día de producción)
  const pasoElCorte = !hayPersonalizado && hora >= HORA_CORTE;

  // 3. Desde qué día se cuenta: hoy, o mañana si pasó el corte (new Date con día + 1: el día siguiente)
  const desde = pasoElCorte ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1) : hoy;

  // 4. Más los días hábiles del pedido (0 o 2); si cae en un día que no es hábil (sábado, domingo), el próximo hábil
  const diasHabiles = hayPersonalizado ? DIAS_HABILES_CON_PERSONALIZADO : DIAS_HABILES_ENTREGA;
  const conDias = sumarDiasHabiles(desde, diasHabiles);
  const fecha = esDiaHabil(conDias) ? conDias : proximoDiaHabil(conDias);
  return { fecha: fecha, pasoElCorte: pasoElCorte };
}

// En el servidor (Node) se reutiliza este mismo archivo para validar la fecha de entrega
// (POST /api/pedidos-combos). En el navegador `module` no existe y esto no hace nada.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FERIADOS, fechaLocalISO, parseFechaLocal, esDiaHabil, sumarDiasHabiles, proximoDiaHabil, diaHabilAnterior, fechaDDMMAAAA,
    HORA_CORTE, DIAS_HABILES_ENTREGA, DIAS_HABILES_CON_PERSONALIZADO, primeraFechaEntrega   // 25/10
  };
}
