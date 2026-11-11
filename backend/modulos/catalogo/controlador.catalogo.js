// ============================================================================
// controlador.catalogo.js — lo que hace la ruta del módulo CATÁLOGO (la web del cliente).
// Cada función SIEMPRE con los mismos pasos: 1. LEER · 2. REVISAR · 3. PEDIR · 4. RESPONDER
// (y si hay que acomodar los datos antes de contestar: 4. ARMAR · 5. RESPONDER).
// Funciones:
//   listarCombos → GET /api/v1/combos → los combos con su plan, su categoría y su menú (con esto se dibuja la tienda)
// (12/11) Las 6 rutas viejas del catálogo (/api/v1/catalogo, categorias, planes, productos) se borraron: la tienda
// vende COMBOS y no las usaba nadie. GET /api/barrios sigue en server.js hasta que el formulario deje de pedir el barrio.
// ============================================================================

const modelo = require('./modelo.catalogo');                 // las consultas a la base de este módulo
const { errorInterno } = require('../../utils/errores');     // el 500 con mensaje simple (el detalle va al log)


// listarCombos → GET /api/v1/combos (la tienda dibuja sus tarjetas con esto)
// ENTRADA: nada · SALIDA: 200 con el arreglo · 500 si falla la base (y 429 si se pasa del límite: eso lo hace la ruta)
// Ej: → [ { id: 9, nombre: "Keto x3", cantidad: 3, precio: 3000, destacado: false, plan: "Keto", id_plan: 9,
//          plan_imagen: null, plan_descripcion: null, categoria: { id: 3, nombre: "Saludable", … },
//          menu: [ { id: 9, nombre: "Fideos", codigo_plato: "F1", descripcion, imagen, disponibles: 3 } ] } ]
// No se muestra: un combo sin plan o de un plan desactivado, ni un combo que se queda sin platos para elegir.
// "disponibles" = las viandas de la heladera, con un tope igual a la cantidad del combo (así no se ve el stock real).
async function listarCombos(req, res) {
  // 1. LEER: nada
  // 2. REVISAR: nada

  // 3. PEDIR: los combos activos con su plan y su menú
  const { data, error } = await modelo.traerCombosBD();
  // ¿falló la base? SÍ: se cayó Supabase · NO: vinieron los combos
  if (error) {
    return errorInterno(res, error);
  }

  // 4. ARMAR: un elemento por combo que se puede mostrar, con su menú ya listo
  const combos = [];
  data.forEach((combo) => {
    // 4a. ¿El combo tiene un plan, y ese plan está activo?
    //     combo.planes = el plan del combo (la base lo trae con ese nombre). Si el combo no tiene plan, viene null.
    //     Las dos cosas tienen que cumplirse: que el plan exista Y que esté activo.
    //     Ej: "Keto x3" con el plan Keto activo → true · "Keto x3" con Keto desactivado → false · un combo sin plan → false
    const tienePlanActivo = Boolean(combo.planes) && Boolean(combo.planes.activo);
    // ¿el plan NO está activo? SÍ: Keto desactivado → se saltea · NO: activo → sigue
    if (tienePlanActivo === false) {
      return;                                              // return adentro del forEach = saltear este combo y seguir con el siguiente
    }

    // 4b. El menú del combo. combo.combo_productos = los renglones del menú (tabla combo_productos):
    //     cada renglón dice si ESE plato sigue en el menú de ESTE combo (renglon.activo) y trae el plato (renglon.productos).
    const menu = [];
    combo.combo_productos.forEach((renglon) => {
      const plato = renglon.productos;

      // ¿Este plato se puede elegir? Tienen que cumplirse las 3 cosas:
      //   renglon.activo → el plato sigue en el menú de este combo (no lo sacaron con "Quitar" en la pantalla Combos)
      //   plato          → el plato existe
      //   plato.activo   → el plato no está desactivado en todo el sistema
      // Ej: Fideos en el menú y activo → true · Fideos quitado del menú → false · Fideos desactivado → false
      const sePuedeElegir = Boolean(renglon.activo) && Boolean(plato) && Boolean(plato.activo);
      // ¿el plato NO se puede elegir? SÍ: sacaron "Fideos" del menú → se saltea · NO: está en el menú y activo → sigue
      if (sePuedeElegir === false) {
        return;                                            // saltear este plato y seguir con el siguiente
      }

      // Cuántas viandas puede elegir el cliente: las de la heladera, pero nunca más que la cantidad del combo
      // (así la tienda no muestra el stock real). Ej: hay 14 y el combo es x3 → 3 · hay 2 → 2
      let enHeladera = Number(plato.stock_heladera);
      const noVinoUnNumero = isNaN(enHeladera);
      // ¿la heladera no trajo un número? SÍ: vino vacío → se toma 0 · NO: 14
      if (noVinoUnNumero) {
        enHeladera = 0;
      }
      const disponibles = Math.min(enHeladera, combo.cantidad);   // el más chico de los dos (son 2 números, no una lista)

      // Su código de plato, o null si no tiene. Ej: "F3"
      let codigoPlato = null;
      const tieneCodigo = Boolean(plato.codigo_plato);
      // ¿tiene código? SÍ: "F3" · NO: vacío
      if (tieneCodigo) {
        codigoPlato = plato.codigo_plato;
      }

      menu.push({
        id: plato.id,
        nombre: plato.nombre,
        codigo_plato: codigoPlato,
        descripcion: plato.descripcion,
        imagen: plato.imagen,
        disponibles: disponibles,
      });
    });

    // 4c. ¿El combo se quedó sin platos para elegir? Un combo así no se puede comprar: no se muestra.
    const menuVacio = menu.length === 0;
    // ¿el menú quedó vacío? SÍ: le sacaron todos los platos · NO: tiene al menos uno → sigue
    if (menuVacio) {
      return;                                              // saltear este combo
    }

    // 4d. Los platos, de la A a la Z (como en un menú). localeCompare compara con las reglas del castellano:
    //     "Albóndigas" vs "Fideos" → negativo → Albóndigas va primero
    menu.sort((platoA, platoB) => platoA.nombre.localeCompare(platoB.nombre, 'es'));

    // 4e. El combo, con lo que necesita la tienda
    combos.push({
      id: combo.id,
      nombre: combo.nombre,
      cantidad: combo.cantidad,
      precio: Number(combo.precio),
      destacado: combo.destacado === true,                  // true = lleva "Más elegido" (sin el dato, false)
      plan: combo.planes.nombre,
      id_plan: combo.planes.id,                             // la tienda agrupa las tarjetas con esto
      plan_imagen: combo.planes.imagen,                     // la foto del plan, o null
      plan_descripcion: combo.planes.descripcion,           // la frase del plan, o null
      categoria: combo.planes.categorias,                   // { id, nombre, imagen, descripcion }, o null
      menu: menu,
    });
  });

  // 5. RESPONDER
  res.json(combos);
}


module.exports = { listarCombos };
