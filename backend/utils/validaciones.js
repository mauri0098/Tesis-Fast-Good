// ============================================================================
// validaciones.js — leer y controlar datos que entran (los usan varios módulos).
//   leerFechaPara → ENTRADA: un texto · SALIDA: la fecha "AAAA-MM-DD" si existe de verdad, o null.
//   leerPeriodo   → ENTRADA: req.query { desde, hasta } · SALIDA: { desdeISO, hastaISO } o { error } (hasta 62 días).
//   leerIdPlan    → ENTRADA: el texto de la dirección · SALIDA: el número (entero, mayor a 0) o null.
// Protege de datos raros: fechas que no existen, números truchos y períodos enormes que harían trabajar a la base.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

const fechas = require('../../frontend/compartido/fechas.js');             // días hábiles y feriados (el mismo del front)
const { OFFSET_ARGENTINA, ENTERO_MAXIMO_BASE } = require('./constantes');

// Fecha "AAAA-MM-DD" que exista de verdad (rechaza 2026-02-30). Devuelve el texto o null.
// Que no sea anterior a hoy lo controla la base, con la hora de Argentina.
function leerFechaPara(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(valor + 'T00:00:00Z');
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  return valor;
}

const MAXIMO_DIAS_PERIODO = 62;                                   // el período más largo que se puede pedir (contando los dos extremos)
const MILISEGUNDOS_POR_DIA = 86400000;                            // 24 × 60 × 60 × 1000

// ─────────────────────────────────────────────────────────────────────────────
// leerPeriodo → revisa las fechas de la dirección y las pasa a horas de Argentina
// ENTRADA: consulta (req.query): { desde: 'AAAA-MM-DD', hasta: 'AAAA-MM-DD' }, las dos obligatorias
// SALIDA:  { desdeISO, hastaISO } · { error: 'mensaje' } si algo está mal (la ruta responde 400)
// Ej: { desde: '2026-11-02', hasta: '2026-11-08' } → { desdeISO: '2026-11-02T00:00:00-03:00', hastaISO: '2026-11-09T00:00:00-03:00' }
//     { desde: '2026-02-30', hasta: '2026-03-01' } → { error: 'Las fechas son inválidas' } (el 30 de febrero no existe)
//     { desde: '2026-09-01', hasta: '2026-11-30' } → { error: 'El período puede tener hasta 62 días' } (son 91)
// La usan las tres rutas de la pantalla Compras. Lee y frena: así un pedido de años no hace trabajar a la base.
// ─────────────────────────────────────────────────────────────────────────────
function leerPeriodo(consulta) {
  const desde = leerFechaPara(consulta.desde);                    // 'AAAA-MM-DD' que exista de verdad, o null
  const hasta = leerFechaPara(consulta.hasta);

  // 1. Las dos fechas tienen que servir. Fuera de 2000 a 2099 no hay nada guardado (y el año 0000 la base ni lo acepta)
  //    En AAAA-MM-DD, el texto menor es el día más viejo: se comparan directo. Ej: '2026-11-02' < '2026-11-08'
  const fechaMala = desde === null || hasta === null || desde < '2000-01-01' || hasta > '2099-12-31';
  // ¿alguna no sirve? SÍ: vacía o '2026-02-30' · NO: '2026-11-02'
  if (fechaMala) {
    return { error: 'Las fechas son inválidas' };
  }
  // ¿están al revés? SÍ: desde 08/11 y hasta 02/11 · NO: desde 02/11 y hasta 08/11
  if (desde > hasta) {
    return { error: 'La fecha "desde" no puede ser mayor que "hasta"' };
  }

  // 2. Cuántos días son, contando los dos extremos. Ej: del 02/11 al 08/11 → 6 de diferencia + 1 = 7
  const horaDesde = new Date(desde + 'T00:00:00Z').getTime();     // el día como número (milisegundos)
  const horaHasta = new Date(hasta + 'T00:00:00Z').getTime();
  const dias = (horaHasta - horaDesde) / MILISEGUNDOS_POR_DIA + 1;
  // ¿son demasiados? SÍ: 63 días · NO: un mes de 31
  if (dias > MAXIMO_DIAS_PERIODO) {
    return { error: 'El período puede tener hasta ' + MAXIMO_DIAS_PERIODO + ' días' };
  }

  // 3. Desde las 00:00 de "desde" hasta antes de las 00:00 del día después de "hasta" (en Argentina)
  const diaSiguiente = new Date(horaHasta + MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);  // ej: '2026-11-09'
  return {
    desdeISO: desde + 'T00:00:00' + OFFSET_ARGENTINA,             // ej: '2026-11-02T00:00:00-03:00'
    hastaISO: diaSiguiente + 'T00:00:00' + OFFSET_ARGENTINA       // ej: '2026-11-09T00:00:00-03:00'
  };
}

// Lee el número de plan de la dirección: entero, mayor a 0 y que entre en la base (null si no sirve)
function leerIdPlan(texto) {
  const idPlan = Number(texto);                                   // Number: "12abc" no pasa
  const idInvalido = !Number.isInteger(idPlan) || idPlan <= 0 || idPlan > ENTERO_MAXIMO_BASE;
  return idInvalido ? null : idPlan;
}

module.exports = { leerFechaPara, leerPeriodo, leerIdPlan };
