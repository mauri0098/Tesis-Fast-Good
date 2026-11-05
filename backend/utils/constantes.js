// ============================================================================
// constantes.js — números y textos que usan DOS o más módulos.
//   METODOS_PAGO, ESTADO_ANULADO, ESTADO_POR_ARMAR, OFFSET_ARGENTINA,
//   BUCKET_IMAGENES_PRODUCTOS, EXTENSIONES_IMAGEN, TAMANIO_MAX_IMAGEN, ENTERO_MAXIMO_BASE.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

const METODOS_PAGO  = ['Efectivo', 'Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Mixto'];
const ESTADO_ANULADO = 5;                                         // el estado "Cancelado": es final
// (05/11) "Por armar" (sql/estado_por_armar.sql): todo cocinado (o todo de heladera), esperando el Armado.
// El recorrido: 1 Registrado → 2 En Preparación → 6 Por armar → 3 Listo para entregar → 4 Entregado (5 Cancelado)
const ESTADO_POR_ARMAR = 6;
const OFFSET_ARGENTINA = '-03:00';                                // la hora de Argentina (no tiene horario de verano)
const BUCKET_IMAGENES_PRODUCTOS = 'imagenes-productos';
const EXTENSIONES_IMAGEN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TAMANIO_MAX_IMAGEN = 2 * 1024 * 1024; // 2MB
const ENTERO_MAXIMO_BASE = 2147483647; // tope de una columna integer de Postgres

module.exports = { METODOS_PAGO, ESTADO_ANULADO, ESTADO_POR_ARMAR, OFFSET_ARGENTINA, BUCKET_IMAGENES_PRODUCTOS, EXTENSIONES_IMAGEN, TAMANIO_MAX_IMAGEN, ENTERO_MAXIMO_BASE };
