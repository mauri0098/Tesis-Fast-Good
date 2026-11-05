// ============================================================================
// platosDelCocinero.js — qué platos le tocan a cada cocinero (lo usan cocina y heladera).
//   platoEsDelCocinero       → ENTRADA: el plato y el id del cocinero · SALIDA: true si es suyo (propio o por su plan).
//   platoSinCocinero         → ENTRADA: el plato · SALIDA: true si no tiene a nadie asignado.
//   platoVisibleParaCocinero → ENTRADA: el plato y el id · SALIDA: true si es suyo o de nadie.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

// Un plato le corresponde a un cocinero si lo tiene asignado directamente o, cuando el plato
// no tiene cocinero propio, si es el principal o el suplente de su plan (respaldo).
// `producto` debe traer id_cocinero y planes(id_cocinero, id_cocinero_suplente).
function platoEsDelCocinero(producto, cocineroId) {
  if (producto.id_cocinero) return producto.id_cocinero === cocineroId;
  const plan = producto.planes;
  return !!plan && (plan.id_cocinero === cocineroId || plan.id_cocinero_suplente === cocineroId);
}

// Plato sin nadie asignado: ni cocinero propio, ni principal ni suplente en su plan.
// `producto` trae id_cocinero y planes(id_cocinero, id_cocinero_suplente), igual que platoEsDelCocinero.
function platoSinCocinero(producto) {
  if (producto.id_cocinero) return false;
  const plan = producto.planes;
  return !plan || (!plan.id_cocinero && !plan.id_cocinero_suplente);
}

// Lo que un cocinero puede ver y marcar: los platos que le tocan (platoEsDelCocinero)
// y los que no tienen a nadie asignado. Misma regla en pendientes, hechos de hoy y marcar hecho.
function platoVisibleParaCocinero(producto, idCocinero) {
  return platoEsDelCocinero(producto, idCocinero) || platoSinCocinero(producto);
}

module.exports = { platoEsDelCocinero, platoSinCocinero, platoVisibleParaCocinero };
