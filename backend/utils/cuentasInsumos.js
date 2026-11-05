// ============================================================================
// cuentasInsumos.js — cuentas de insumos que no le preguntan nada a la base.
//   calcularFaltantes      → qué insumos no alcanzan para unas viandas (ENTRADA y SALIDA en su comentario).
//   unirConY               → ENTRADA: una lista de textos · SALIDA: "a, b y c".
//   convertirACantidadBase → pasa una cantidad a la unidad del insumo (ej: 1 kg → 1000 g) o { error } si no se puede.
//   FACTOR_UNIDAD          → la tabla de cuánto vale cada unidad (la usan también las salidas de stock).
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// calcularFaltantes → qué insumos no alcanzan para cocinar unas viandas (la cuenta; no pregunta nada a la base)
// ENTRADA: viandasPorPlato ({ id_producto: viandas } lo que se quiere cocinar), datos (de leerRecetasEInsumos) y,
//          opcional, comprometidoPorPlato ({ id_producto: viandas } lo que ya está pedido y todavía no gastó insumos)
// SALIDA:  [{ id_insumo, nombre, unidad, tenes, necesitas, falta, texto }], en orden de número de insumo ([] si alcanza)
//          necesitas = receta × (lo nuevo + lo comprometido). Solo van los insumos que usa lo NUEVO.
// Ej: 2 fideos (300 g de harina c/u), harina 400 → [{ nombre: 'Harina', unidad: 'g', tenes: 400, necesitas: 600, falta: 200, texto: '200 g de Harina' }]
//     lo mismo con 1 fideo ya pedido sin hacer (comprometido) → necesitas 900, falta 500
// ─────────────────────────────────────────────────────────────────────────────
function calcularFaltantes(viandasPorPlato, datos, comprometidoPorPlato) {
  const comprometido = comprometidoPorPlato || {};                // sin comprometido: nada
  const necesarioPorInsumo = {};                                  // { id_insumo: cuánto hace falta en total }
  const usaLoNuevo = {};                                          // { id_insumo: true } los que usa lo que se quiere cocinar

  // 1. Receta × viandas, sumando todos los platos. Ej: fideos (300 g de harina) × (2 nuevos + 1 pedido) → harina 900
  datos.recetas.forEach(renglon => {                              // por cada renglón de receta...
    const nuevas = Number(viandasPorPlato[renglon.id_producto] || 0);
    const yaPedidas = Number(comprometido[renglon.id_producto] || 0);
    const porVianda = Number(renglon.cantidad_necesaria || 0);
    necesarioPorInsumo[renglon.id_insumo] = (necesarioPorInsumo[renglon.id_insumo] || 0) + porVianda * (nuevas + yaPedidas);
    if (nuevas > 0) usaLoNuevo[renglon.id_insumo] = true;         // este insumo lo usa lo nuevo
  });

  // 2. Los que no alcanzan, en orden de número (el mismo de la base). Object.keys da los números como texto: Number los pasa a número
  const faltantes = [];
  Object.keys(usaLoNuevo).map(Number).sort((a, b) => a - b).forEach(idInsumo => {   // sort (a − b) = de menor a mayor
    const insumo = datos.insumoPorId[idInsumo];                   // sus datos (pueden faltar si se borró)
    const tenes = Number(insumo?.stock_actual ?? 0);              // ?. = "si existe el insumo, su stock"; ?? 0 = vacío cuenta como 0
    const necesitas = necesarioPorInsumo[idInsumo];
    if (tenes >= necesitas) return;                               // alcanza (return = saltear este y seguir con el siguiente)
    const falta = necesitas - tenes;
    const unidad = insumo?.unidad_medida || '';                   // ej: "g" (sin unidad: '')
    const nombre = insumo?.nombre || String(idInsumo);            // su nombre (o su número si no se encontró)
    const conUnidad = unidad ? ' ' + unidad : '';
    const texto = falta.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + conUnidad + ' de ' + nombre;   // ej: "200 g de Harina"
    faltantes.push({ id_insumo: idInsumo, nombre: nombre, unidad: unidad, tenes: tenes, necesitas: necesitas, falta: falta, texto: texto });
  });
  return faltantes;
}

// unirConY → una lista en una frase: los de antes con coma y el último con "y"
// Ej: ['200 g de Carne'] → "200 g de Carne" · ['200 g de Carne', '39 u de Huevo', '1 kg de Sal'] → "200 g de Carne, 39 u de Huevo y 1 kg de Sal"
function unirConY(lista) {
  const ultimo = lista[lista.length - 1];                         // el último de la lista
  return lista.length === 1 ? ultimo : lista.slice(0, -1).join(', ') + ' y ' + ultimo;   // slice(0, -1) = todos menos el último
}

// Conversión entre unidades de una misma familia (masa / volumen / unidad),
// para poder cargar un movimiento en una unidad distinta a la base del
// insumo (ej: insumo en "g", carga en "kg") sin desalinear stock_actual.
const FACTOR_UNIDAD  = { g: 1, kg: 1000, ml: 1, lts: 1000, u: 1 };
const FAMILIA_UNIDAD = { g: 'masa', kg: 'masa', ml: 'volumen', lts: 'volumen', u: 'unidad' };

function convertirACantidadBase(cantidad, unidadIngresada, unidadBaseInsumo) {
  const unidadBase = (unidadBaseInsumo || '').toLowerCase().trim();
  const unidadIn   = (unidadIngresada || unidadBase).toLowerCase().trim();

  const factorBase = FACTOR_UNIDAD[unidadBase];
  const factorIn   = FACTOR_UNIDAD[unidadIn];

  // Si alguna unidad no es reconocida, no convertimos: se asume que ya
  // viene expresada en la unidad base del insumo (comportamiento previo).
  if (factorBase === undefined || factorIn === undefined) {
    return { cantidadBase: Number(cantidad) };
  }

  if (FAMILIA_UNIDAD[unidadIn] !== FAMILIA_UNIDAD[unidadBase]) {
    return { error: 'La unidad ingresada no corresponde a la familia de medida del insumo.' };
  }

  return { cantidadBase: Number(cantidad) * factorIn / factorBase };
}

module.exports = { calcularFaltantes, unirConY, convertirACantidadBase, FACTOR_UNIDAD };
