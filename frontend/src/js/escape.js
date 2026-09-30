/**
 * escape.js — escHtml(): escapa un texto para insertarlo en HTML (innerHTML o un atributo).
 * Se usa con todo dato que venga de la base o del usuario (nombres, direcciones,
 * observaciones, etc.), para que se muestre como texto y nunca se ejecute como HTML/JS (XSS).
 */
function escHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
