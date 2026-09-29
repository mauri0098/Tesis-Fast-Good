// ============================================================================
// fechas.js — Días hábiles y fechas locales (compartido)
// Lo usan formulario.js (fecha de entrega del cliente) y ListarPedidos.js
// (pedidos a producir hoy). Todo trabaja con la fecha LOCAL: nunca usar
// toISOString(), que convierte a UTC y en Argentina cambia de día a las 21 h.
// ============================================================================

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
