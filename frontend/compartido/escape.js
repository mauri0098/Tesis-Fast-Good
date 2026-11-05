/**
 * escape.js — lo que ayuda a poner textos de la base en el HTML sin riesgo.
 *   escHtml        → escapa un texto para insertarlo en HTML (innerHTML o un atributo).
 *                    Se usa con todo dato que venga de la base o del usuario (nombres, direcciones,
 *                    observaciones, etc.), para que se muestre como texto y nunca se ejecute como HTML/JS (XSS).
 *   pastillaCodigo → la pastillita con el código del plato ("F3") que va adelante del nombre (28/10).
 *   numeroPedido   → el número de un pedido como se escribe en todas las pantallas: "Pedido #015" / "Cocina #009" (29/10).
 *   motivoParaMostrar → un motivo guardado en la base ("Pedido a cocina #9") escrito como en las pantallas ("Cocina #009").
 */
function escHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// pastillaCodigo → la pastillita del código del plato, para poner adelante del nombre
// ENTRADA: codigo (ej: "F3", o null si el plato no tiene) y nombre (el nombre del plato, para no repetir)
// SALIDA:  el HTML de la pastilla, o '' (nada) si no hay código o si el nombre ya empieza con ese código
// Ej: ('F3', 'Pollito al horno')      → '<span class="codigo-plato">F3</span>'
//     ('F1', 'F1 - Pollito al horno') → ''   (el código ya está escrito en el nombre)
//     (null, 'fideos')                → ''
// El estilo es el mismo en todo el panel (.codigo-plato, global.css) y en la web (index.css).
// El código viene de la base: pasa por escHtml.
// ─────────────────────────────────────────────────────────────────────────────
function pastillaCodigo(codigo, nombre) {
  if (!codigo) return '';                                          // sin código: nada
  const codigoEnMayuscula = String(codigo).toUpperCase();          // ej: "F1"
  const nombreEnMayuscula = String(nombre || '').trim().toUpperCase();  // el nombre, sin espacios en los bordes
  const empiezaIgual = nombreEnMayuscula.startsWith(codigoEnMayuscula);  // "F1 - Pollito" empieza con "F1"…
  const sigueUnNumero = /[0-9]/.test(nombreEnMayuscula.charAt(codigoEnMayuscula.length));  // …pero "F10 - …" no es F1
  const yaEstaEnElNombre = empiezaIgual && !sigueUnNumero;          // el código ya está escrito en el nombre
  if (yaEstaEnElNombre) return '';                                 // ya se ve en el nombre: no se repite
  return '<span class="codigo-plato">' + escHtml(codigo) + '</span>';
}

// El comienzo del texto de cada tipo de pedido
const PALABRA_PEDIDO = { cliente: 'Pedido', cocina: 'Cocina' };

// ─────────────────────────────────────────────────────────────────────────────
// numeroPedido → el número de un pedido, con su palabra y 3 cifras (mismo dato, solo cambia cómo se escribe)
// ENTRADA: id (el número del pedido) y tipo: 'cliente' (un pedido de la web) o 'cocina' (un pedido a cocina)
// SALIDA:  el texto. Ej: (15, 'cliente') → "Pedido #015" · (9, 'cocina') → "Cocina #009" · (250, 'cliente') → "Pedido #250"
// Es texto plano (solo letras, # y números): se puede poner con textContent o adentro de un HTML.
// ─────────────────────────────────────────────────────────────────────────────
function numeroPedido(id, tipo) {
  const palabra = PALABRA_PEDIDO[tipo] || 'Pedido';               // si no se sabe el tipo, "Pedido"
  return palabra + ' #' + String(Number(id) || 0).padStart(3, '0');  // Number: lo que no es número queda en 0
}

// Los 3 motivos con número de pedido que guarda la base, y cómo se muestran.
// patron: la forma del texto (el número va entre paréntesis) · antes: lo que va antes del número · tipo: de qué pedido es
const MOTIVOS_CON_NUMERO = [
  { patron: /^Pedido a cocina #(\d+)$/,      antes: '',               tipo: 'cocina' },
  { patron: /^Pedido #(\d+)$/,               antes: '',               tipo: 'cliente' },
  { patron: /^Anulación del pedido #(\d+)$/, antes: 'Anulación del ', tipo: 'cliente' }
];

// ─────────────────────────────────────────────────────────────────────────────
// motivoParaMostrar → un motivo guardado en la base, con el número de pedido escrito como en todas las pantallas
// ENTRADA: motivo (el texto de la base, o null)
// SALIDA:  el texto para mostrar. Si no es ninguno de los 3 de MOTIVOS_CON_NUMERO, queda como está ('' si no hay)
// Ej: "Pedido a cocina #9" → "Cocina #009" · "Pedido #250" → "Pedido #250" · "Anulación del pedido #68" → "Anulación del Pedido #068"
//     "Se cayó al piso" → "Se cayó al piso"
// Solo cambia lo que se ve: en la base el motivo sigue igual. Es texto: pasarlo por escHtml antes de ponerlo en un HTML.
// ─────────────────────────────────────────────────────────────────────────────
function motivoParaMostrar(motivo) {
  const texto = motivo || '';
  const forma = MOTIVOS_CON_NUMERO.find(f => f.patron.test(texto));   // find = la primera forma que coincide (o undefined)
  if (!forma) return texto;                                       // ninguna: queda como está
  const partes = texto.match(forma.patron);                       // ej: ["Pedido a cocina #9", "9"]
  return forma.antes + numeroPedido(partes[1], forma.tipo);       // ej: "Cocina #009"
}
