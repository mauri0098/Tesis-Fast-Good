// ============================================================================
// controlador.combos.js — lo que hace cada ruta del módulo COMBOS.
// QUÉ VA: leer y validar req (params, query, body), tomar el usuario de req.usuario (nunca del body),
//         llamar al modelo y decidir qué responder (200, 201, 400, 404, 409, 500).
// QUÉ NO VA: supabase.from(...) ni supabase.rpc(...): eso es del modelo.
// Funciones:
//   listarCombos          → GET /api/combos: pide los combos al modelo, los arma para la tabla y los manda al navegador.
//   actualizarEstadoCombo → PUT /api/combos/:id/activo: activa o desactiva un combo (nunca se borra).
//   quitarProductoDelCombo → PUT /api/combos/:id/menu/:idProducto/quitar: saca un plato del menú de un combo.
//   leerDatosCombo         → revisa nombre, plan, cantidad y precio con una tabla de controles (la usan crear y editar).
//   crearCombo             → POST /api/combos: crea un combo activo.
//   editarCombo            → PUT /api/combos/:id: edita un combo (la cantidad no, si ya se vendió).
//   verMenuCombo           → GET /api/combos/:id/menu: el combo, su menú y los platos para agregar.
//   agregarProductoAlCombo → POST /api/combos/:id/menu: agrega (o reactiva) un plato en el menú.
// ============================================================================

const modelo = require('./modelo.combos');
const { errorInterno } = require('../../utils/errores');   // el 500 con mensaje simple (el detalle va al log)
const { ENTERO_MAXIMO_BASE } = require('../../utils/constantes');   // el número más grande que entra en la base (2147483647)

// ----------------------------------------------------------------------------
// listarCombos → todos los combos (activos e inactivos) para la tabla del panel (el MOSTRADOR).
// ENTRADA: req (ya pasó por el patovica: requireAuth + requireRol(6, 5)) y res
// SALIDA:  responde 200 con la lista armada, o 500 "Error interno del servidor" si falla la base.
//   Ej: [{ id: 1, nombre: 'Keto x10', id_plan: 2, plan: 'Keto', plan_activo: true, cantidad: 10,
//          precio: 45000, activo: true, destacado: false, platos_en_menu: 8, veces_vendido: 3 }]
// Lo llama: rutas.combos.js · Llama a: modelo.traerCombosPanel y errorInterno.
// ----------------------------------------------------------------------------
async function listarCombos(req, res) {
    // 1. Esperamos a que el modelo traiga la materia prima (datos crudos) de la base de datos
    // ⏸ FRENO DE MANO (el 1º): esta función se queda quieta en esta línea hasta que vuelva el cocinero (modelo).
    //    El cocinero, a su vez, espera a Supabase (2º freno). El servidor NO se congela: mientras tanto atiende a otros.
    //    Cuando vuelve con la bandeja { data, error }, se suelta el freno y sigue a la línea de abajo.
    const { data, error } = await modelo.traerCombosPanel();

    // ¿El cocinero volvió con problema? SÍ: se cayó la base · NO: trajo la lista de combos
    if (error) {
      return errorInterno(res, error);   // 500 con mensaje simple; el detalle va al log, nunca a la pantalla
    }

    // 2. Procesamos y limpiamos los datos (cinta de montaje)
    // (Supabase siempre manda una lista: si no hay combos, llega [] y el map no hace nada)
    const combosListos = data.map(combo => { // SE RECORRE CON UN MAP PARA IR FORMATEANDO CADA COMBO

      // Cuenta los platos que pertenecen al combo Y que se siguen cocinando
      // (combo_productos siempre llega como lista, aunque esté vacía: [])
      const platosEnMenu = combo.combo_productos.filter(item =>
        item.activo && item.productos?.activo // pregunta si el plato pertenece al combo y si está activo
      ).length;

      // Lee cuántas veces se vendió (si nunca se vendió o vino nulo, pone 0)
      // La cuenta llega como una lista con un solo elemento. Ej: pedido_combos: [{ count: 3 }] → 3
      let vecesVendido = 0;
      if (combo.pedido_combos?.[0]) { // ¿vino la cuenta? SÍ: [{ count: 3 }] · NO: [] (nunca se vendió)
        vecesVendido = Number(combo.pedido_combos[0].count);
      }

      // ========================================================================
      // MAGIA DE LA CLAVE FORÁNEA (Foreign Key):
      // Como un combo pertenece a un ÚNICO plan, Supabase hace el JOIN 
      // automático en la base de datos comparando los IDs. 
      // Por eso NO manda un array [], sino un único objeto {}. 
      // Como es uno solo, NO hace falta recorrerlo con un map o for.
      // ========================================================================
      let plan = null;
      let planActivo = false;
      
      // Solo preguntamos: "¿Supabase trajo la caja de este plan asignado?"
      if (combo.planes) {
        plan = combo.planes.nombre;                 // Sacamos el nombre directo
        planActivo = Boolean(combo.planes.activo);  // Forzamos a que sea un true/false puro
      }

      // Este return es solo para el map: le entrega el objeto formateado para guardarlo en combosListos
      return {
        id:             combo.id,
        nombre:         combo.nombre,
        id_plan:        combo.id_plan,
        plan:           plan,
        plan_activo:    planActivo,
        cantidad:       combo.cantidad,
        precio:         Number(combo.precio),
        activo:         combo.activo,
        destacado:      combo.destacado === true, // "Más elegido"
        platos_en_menu: platosEnMenu,
        veces_vendido:  vecesVendido
      };
    }); // Cierre del map
    
    // 3. Despachamos el producto terminado por la red hacia el frontend
    // 📦 Recién acá sale la respuesta del servidor HACIA EL NAVEGADOR (200 + la lista)
    res.json(combosListos);
}


//actualizarEstadoCombo → PUT /api/combos/:id/activo: activa o desactiva un combo en la base de datos.
// ENTRADA: req.params.id (el combo, de la dirección) y req.body.activo (true o false, del cuerpo que manda la pantalla)
// SALIDA:  200 { mensaje: 'Combo activado' | 'Combo desactivado', combo } · 400 si el id o activo están mal
//          · 404 si el combo no existe · 500 si falla la base.
//   Ej: PUT /api/combos/7/activo con { activo: false } → { mensaje: 'Combo desactivado', combo: { id: 7, ..., activo: false } }
// Lo llama: rutas.combos.js · Llama a: modelo.actualizarEstadoComboBD y errorInterno.
async function actualizarEstadoCombo(req, res) {

  const idCombo = Number(req.params.id);     // <-- Convertimos a número (req.params siempre es string)
  const idInvalido = !Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE; // <-- Validación de ID: debe ser un entero positivo y no demasiado grande

  if (idInvalido) { // ¿el id no sirve? SÍ: 'abc', '-3', '0' · NO: '7'
    return res.status(400).json({ error: 'Combo inválido' });
  }

  // Lo que mandó la pantalla en el cuerpo. Si no mandó cuerpo, activo queda vacío (undefined)
  // y el if de abajo responde 400.
  let activo;
  if (req.body) { // ¿vino cuerpo? SÍ: { activo: false } · NO: pedido sin cuerpo
    activo = req.body.activo;
  }

  if (activo !== true && activo !== false) { // ¿activo NO es true ni false? SÍ: 'sí', 1, nada · NO: true o false
    return res.status(400).json({ error: 'El estado tiene que ser activo (true) o inactivo (false)' });
  }


  const { data, error } = await modelo.actualizarEstadoComboBD(idCombo, activo);


  if (error) { // ¿falló la base? SÍ: se cayó Supabase · NO: hizo el cambio
    return errorInterno(res, error);
  }

  if (!data) { // ¿no volvió ningún combo? SÍ: el combo 999999 no existe · NO: volvió el combo 7
    return res.status(404).json({ error: 'El combo no existe' });
  }

  // El mensaje depende de qué se pidió
  let mensaje = 'Combo desactivado';
  if (activo) { // ¿se activó? SÍ: activo = true → "Combo activado" · NO: false → queda "Combo desactivado"
    mensaje = 'Combo activado';
  }

  res.json({ mensaje: mensaje, combo: data });
}

//quitarProductoDelCombo → PUT /api/combos/:id/menu/:idProducto/quitar: quita un plato del menú de un combo.
// (el renglón de combo_productos pasa a activo = false, nunca se borra; el plato y los pedidos viejos no cambian)
// ENTRADA: req.params.id (el combo) y req.params.idProducto (el plato), los dos de la dirección
// SALIDA:  200 { mensaje: 'Plato sacado del menú' } · 400 si algún id está mal
//          · 404 si ese plato no está en el menú de ese combo · 500 si falla la base.
//   Ej: PUT /api/combos/7/menu/12/quitar → { mensaje: 'Plato sacado del menú' }
// Lo llama: rutas.combos.js · Llama a: modelo.quitarProductoDelComboBD y errorInterno.
async function quitarProductoDelCombo(req, res) {

  const idCombo = Number(req.params.id);              // <-- req.params siempre es string: lo pasamos a número
  const idProducto = Number(req.params.idProducto);
  const comboInvalido = !Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE;
  const platoInvalido = !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE;

  if (comboInvalido) { // ¿el id del combo no sirve? SÍ: 'abc', '-3' · NO: '7'
    return res.status(400).json({ error: 'Combo inválido' });
  }
  if (platoInvalido) { // ¿el id del plato no sirve? SÍ: 'abc', '0' · NO: '12'
    return res.status(400).json({ error: 'Plato inválido' });
  }

  const { data, error } = await modelo.quitarProductoDelComboBD(idCombo, idProducto);


  if (error) { // ¿falló la base? SÍ: se cayó Supabase · NO: hizo el cambio
    return errorInterno(res, error);
  }

  if (!data) { // ¿no se quitó ningún renglón? SÍ: el plato 12 no estaba en el menú del combo 7 · NO: volvió { id: 40 }
    return res.status(404).json({ error: 'Ese plato no está en el menú del combo' });
  }

  res.json({ mensaje: 'Plato sacado del menú' });
}

// ============================================================================
// CREAR Y EDITAR UN COMBO
// ============================================================================

// TOPES: los números más grandes que se aceptan en un combo (los usa leerDatosCombo).
// Son constantes (const en MAYÚSCULAS): se escriben una vez acá y, si un día cambian, se cambian en un solo lugar.
const LARGO_MAXIMO_NOMBRE_COMBO = 100;      // el nombre puede tener hasta 100 letras
const MAXIMO_VIANDAS_POR_COMBO  = 100;      // un combo puede ser de 1 a 100 viandas (ej: "x10")
// El precio de un combo puede ser hasta $9.999.999. ¿Por qué ese número? El total de un pedido
// se guarda en la base con un máximo de 99.999.999,99 y un pedido puede tener hasta 10 combos:
// 10 × 9.999.999 = 99.999.990 → nunca se pasa del máximo de la base.
const PRECIO_MAXIMO_COMBO = 9999999;

// ----------------------------------------------------------------------------
// leerDatosCombo → revisa los datos de un combo que manda el panel (la usan crearCombo y editarCombo).
// No va a la base: que el plan exista y esté activo lo miran crear y editar.
// ENTRADA: req.body { nombre, id_plan, cantidad, precio }
// SALIDA:  { datos: { nombre, id_plan, cantidad, precio } } si está todo bien · { error: 'mensaje' } si algo está mal (→ 400)
//   Ej: { nombre: ' Keto x10 ', id_plan: 1, cantidad: 10, precio: 45000 }
//       → { datos: { nombre: 'Keto x10', id_plan: 1, cantidad: 10, precio: 45000 } }
// Protege: no confía en la pantalla. Alguien puede mandar cualquier cosa con un programa, sin usar la pantalla.
// ----------------------------------------------------------------------------
function leerDatosCombo(body) {
  // 1. Los datos del cuerpo (si no vino cuerpo, quedan vacíos y la tabla de abajo responde "El nombre es obligatorio")
  let nombre;
  let id_plan;
  let cantidad;
  let precio;
  if (body) { // ¿vino cuerpo? SÍ: { nombre: 'Keto x10', ... } · NO: pedido sin cuerpo
    nombre = body.nombre;
    id_plan = body.id_plan;
    cantidad = body.cantidad;
    precio = body.precio;
  }

  // 2. Nombre: tiene que ser texto y no estar vacío.
  //    .trim() saca los espacios de las puntas: '  Keto x10  ' → 'Keto x10' · '   ' → '' (vacío)
  const nombreVacio = typeof nombre !== 'string' || nombre.trim() === '';
  if (nombreVacio) { // ¿falta el nombre? SÍ: '   ', nada, 25 (número) · NO: 'Keto x10'
    return { error: 'El nombre es obligatorio' };
  }
  const nombreLargo = nombre.trim().length > LARGO_MAXIMO_NOMBRE_COMBO;
  if (nombreLargo) { // ¿pasa de 100 letras? SÍ: 101 · NO: 'Keto x10' (8)
    return { error: `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_COMBO} caracteres` };
  }

  // 3. Plan: número entero mayor a 0 (que exista y esté activo lo mira crear o editar, en la base)
  const planInvalido = typeof id_plan !== 'number' || !Number.isInteger(id_plan) || id_plan <= 0 || id_plan > ENTERO_MAXIMO_BASE;
  if (planInvalido) { // ¿el plan no sirve? SÍ: '2' (texto), 0 · NO: 2
    return { error: 'Elegí un plan' };
  }

  // 4. Cantidad de viandas: entero entre 1 y 100
  const cantidadInvalida = typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAXIMO_VIANDAS_POR_COMBO;
  if (cantidadInvalida) { // ¿la cantidad no sirve? SÍ: 0, 2.5, 101 · NO: 10
    return { error: `La cantidad de viandas tiene que ser un número entero entre 1 y ${MAXIMO_VIANDAS_POR_COMBO}` };
  }

  // 5. Precio: número entre 0 y el tope. Number.isFinite frena NaN e Infinito.
  const precioInvalido = typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0 || precio > PRECIO_MAXIMO_COMBO;
  if (precioInvalido) { // ¿el precio no sirve? SÍ: -1, '10' (texto), 99999999 · NO: 45000
    const precioMaximoTexto = PRECIO_MAXIMO_COMBO.toLocaleString('es-AR');   // 9999999 → '9.999.999' (con puntos)
    return { error: `El precio tiene que ser un número entre 0 y ${precioMaximoTexto}` };
  }

  // 6. Todo bien. El precio se guarda redondeado a centavos. Ej: 1500.456 → 150045.6 → 150046 → 1500.46
  const precioEnCentavos = Math.round(precio * 100) / 100;
  return { datos: { nombre: nombre.trim(), id_plan: id_plan, cantidad: cantidad, precio: precioEnCentavos } };
}

// ----------------------------------------------------------------------------
// crearCombo → POST /api/combos: crea un combo (activo). El menú se arma después, con las rutas del menú.
// ENTRADA: req.body { nombre, id_plan, cantidad, precio }
// SALIDA:  200 { mensaje: 'Combo creado', combo } · 400 si algún dato está mal · 500 si falla la base.
// Lo llama: rutas.combos.js · Llama a: leerDatosCombo, modelo.traerPlanBD, modelo.crearComboBD y errorInterno.
// ----------------------------------------------------------------------------
async function crearCombo(req, res) {
  // 1. Los datos
  const lectura = leerDatosCombo(req.body);
  if (lectura.error) { // ¿algún dato está mal? SÍ: nombre vacío → 400 · NO: sigue
    return res.status(400).json({ error: lectura.error });
  }

  // 2. El plan tiene que existir y estar activo (un combo de un plan apagado no se ve en la web)
  const { data: plan, error: errorPlan } = await modelo.traerPlanBD(lectura.datos.id_plan);
  if (errorPlan) { return errorInterno(res, errorPlan); }
  const planNoSirve = !plan || !plan.activo;
  if (planNoSirve) { // ¿no existe o está apagado? SÍ: plan 999999 · NO: plan 2 activo
    return res.status(400).json({ error: 'El plan elegido no existe o está desactivado' });
  }

  // 3. Se guarda
  const { data, error } = await modelo.crearComboBD(lectura.datos);
  if (error) { return errorInterno(res, error); }

  res.json({ mensaje: 'Combo creado', combo: data });
}

// ----------------------------------------------------------------------------
// editarCombo → PUT /api/combos/:id: cambia nombre, plan, cantidad y precio.
// Regla: la CANTIDAD no se puede cambiar si el combo ya se vendió (los pedidos viejos dicen "x10" con 10 platos).
// En ese caso se crea un combo nuevo y se desactiva este. El precio sí se puede cambiar:
// cada pedido guarda el precio que cobró (pedido_combos.precio).
// ENTRADA: req.params.id y req.body { nombre, id_plan, cantidad, precio }
// SALIDA:  200 { mensaje: 'Combo actualizado', combo } · 400 datos mal, plan apagado o cantidad de un combo vendido
//          · 404 si no existe · 500 si falla la base.
// Lo llama: rutas.combos.js · Llama a: leerDatosCombo, modelo.traerPlanBD, traerComboBD, contarVentasComboBD, editarComboBD.
// ----------------------------------------------------------------------------
async function editarCombo(req, res) {
  // 1. El id de la dirección y los datos del cuerpo
  const idCombo = Number(req.params.id);
  const comboInvalido = !Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE;
  if (comboInvalido) { // ¿el id no sirve? SÍ: 'abc' · NO: '7'
    return res.status(400).json({ error: 'Combo inválido' });
  }
  const lectura = leerDatosCombo(req.body);
  if (lectura.error) { // ¿algún dato está mal? SÍ: precio '10' (texto) → 400 · NO: sigue
    return res.status(400).json({ error: lectura.error });
  }

  // 2. Lo que hay en la base: el plan, el combo y cuántas veces se vendió
  const { data: plan, error: errorPlan } = await modelo.traerPlanBD(lectura.datos.id_plan);
  if (errorPlan) { return errorInterno(res, errorPlan); }
  const { data: actual, error: errorActual } = await modelo.traerComboBD(idCombo);
  if (errorActual) { return errorInterno(res, errorActual); }
  const ventas = await modelo.contarVentasComboBD(idCombo);   // es solo una cuenta, no trae filas
  if (ventas.error) { return errorInterno(res, ventas.error); }

  // 3. La tabla de reglas, EN ORDEN: la primera que falla es la que se responde
  const planNoSirve = !plan || !plan.activo;
  const cambiaCantidad = actual !== null && lectura.datos.cantidad !== actual.cantidad;   // (si el combo no existe, no se compara)
  const reglas = [
    { falla: planNoSirve,                         codigo: 400, mensaje: 'El plan elegido no existe o está desactivado' },
    { falla: !actual,                             codigo: 404, mensaje: 'El combo no existe' },
    { falla: cambiaCantidad && ventas.count > 0,  codigo: 400,
      mensaje: `Este combo ya se vendió (${ventas.count} veces): no se puede cambiar la cantidad. ` +
               'Creá un combo nuevo con la cantidad nueva y desactivá este.' }
  ];
  const primerError = reglas.find(regla => regla.falla);   // la primera que falla, o undefined si ninguna
  if (primerError) { // ¿falló alguna? SÍ: combo 9 (vendido 60 veces) de 3 a 4 · NO: combo 2 con sus mismos datos
    return res.status(primerError.codigo).json({ error: primerError.mensaje });
  }

  // 4. Se guarda (el combo ya sabemos que existe, y los combos nunca se borran)
  const { data, error } = await modelo.editarComboBD(idCombo, lectura.datos);
  if (error) { return errorInterno(res, error); }

  res.json({ mensaje: 'Combo actualizado', combo: data });
}

// ============================================================================
// EL MENÚ DE UN COMBO (tabla combo_productos)
// Un renglón del menú nunca se borra: "sacar" un plato es ponerlo en activo = false,
// y "agregarlo" de nuevo lo vuelve a activar. Los pedidos viejos no cambian
// (sus platos están en pedido_detalles, no en el menú).
// ============================================================================

// ----------------------------------------------------------------------------
// verMenuCombo → GET /api/combos/:id/menu: el combo, los platos de su menú y los que se pueden agregar.
// ENTRADA: req.params.id
// SALIDA:  200 { combo, menu, disponibles } · 400 id mal · 404 no existe · 500 falla la base.
//   Ej: { combo: { id: 7, nombre: '10 viandas sin gluten', cantidad: 10, destacado: false },
//         menu: [{ id_producto: 6, nombre: 'Tarta', codigo: 'S1', plan: 'SIN TACC', plato_activo: true }],
//         disponibles: [{ id: 9, nombre: 'Arroz', codigo: 'M2', plan: 'MANTENIMIENTO' }] }
// menu: si un plato se desactivó después (Generar Receta), aparece con plato_activo: false, para poder sacarlo.
// disponibles: platos activos de CUALQUIER plan que todavía no están en el menú.
// Lo llama: rutas.combos.js · Llama a: modelo.traerComboBD, traerMenuDelComboBD, traerPlatosActivosBD.
// ----------------------------------------------------------------------------
async function verMenuCombo(req, res) {
  // 1. El id de la dirección
  const idCombo = Number(req.params.id);
  const comboInvalido = !Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE;
  if (comboInvalido) { // ¿el id no sirve? SÍ: 'abc' · NO: '7'
    return res.status(400).json({ error: 'Combo inválido' });
  }

  // 2. Lo que trae la BASE (por medio del modelo). Ejemplo con el combo 7:
  //    combo     → { id: 7, nombre: '10 viandas sin gluten', ... }
  //    renglones → lo que YA está en el menú del combo 7 (el modelo filtra por id_combo):
  //                [ Tarta (6), Pollo (12) ]
  //    platos    → TODOS los platos activos del local, de cualquier combo:
  //                [ Arroz (9), Pollo (12), Tarta (6), Fideos (15) ]
  const { data: combo, error: errorCombo } = await modelo.traerComboBD(idCombo);
  if (errorCombo) { return errorInterno(res, errorCombo); }
  if (!combo) { // ¿no existe? SÍ: combo 999999 · NO: combo 7
    return res.status(404).json({ error: 'El combo no existe' });
  }
  const { data: renglones, error: errorMenu } = await modelo.traerMenuDelComboBD(idCombo);
  if (errorMenu) { return errorInterno(res, errorMenu); }
  const { data: platos, error: errorPlatos } = await modelo.traerPlatosActivosBD();
  if (errorPlatos) { return errorInterno(res, errorPlatos); }

  // 3. El forEach recorre los RENGLONES (el menú), UNO POR UNO. No pregunta nada: a cada uno le hace 2 cosas:
  //    a) lo ANOTA en enElMenu (la "lista de presentes") → enElMenu[6] = true
  //    b) con push lo AGREGA AL FINAL del array menu (push no crea otro array: agranda el mismo)
  //    Vuelta 1: Tarta (6)  → enElMenu = { 6: true }            · menu = [Tarta]
  //    Vuelta 2: Pollo (12) → enElMenu = { 6: true, 12: true }  · menu = [Tarta, Pollo]
  //    (enElMenu sirve en el paso 4: así no hace falta un forEach adentro de otro)
  //    El modelo ya trae solo renglones con plato (!inner) y el plan como texto (productos.plan).
  const enElMenu = {};
  const menu = [];
  renglones.forEach(renglon => {
    enElMenu[renglon.id_producto] = true;   // a) lo anoto como presente
    menu.push({                             // b) lo agrego al final de menu, con los datos que usa la pantalla
      id_producto:  renglon.id_producto,
      nombre:       renglon.productos.nombre,
      codigo:       renglon.productos.codigo_plato,
      plan:         renglon.productos.plan,
      plato_activo: Boolean(renglon.productos.activo)
    });
  });
  // .sort ordena por nombre, como el diccionario (localeCompare con 'es' respeta acentos y la ñ).
  // Compara de a dos: si da negativo, a va primero. Ej: 'Arroz' vs 'Tarta' → negativo → Arroz va primero.
  // (todo plato tiene nombre: el servidor no deja crear uno sin nombre)
  menu.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // 4. Disponibles: el filter NO filtra menu. Recorre PLATOS (todos), uno por uno, y le pregunta a cada uno:
  //    "¿estás anotado en enElMenu?". Se queda solo con los que NO están.
  //    Arroz (9)   → enElMenu[9] no está  → ✅ se queda
  //    Pollo (12)  → enElMenu[12] = true  → ❌ ya está en el menú
  //    Tarta (6)   → enElMenu[6] = true   → ❌ ya está en el menú
  //    Fideos (15) → enElMenu[15] no está → ✅ se queda
  //    → disponibles = [Arroz, Fideos]. Después el map arma cada uno con { id, nombre, codigo, plan }.
  //    En la pantalla: menu = "platos del combo" (botón Quitar) · disponibles = "agregar plato" (botón Agregar).
  const disponibles = platos
    .filter(plato => !enElMenu[plato.id])
    .map(plato => {
      return { id: plato.id, nombre: plato.nombre, codigo: plato.codigo_plato, plan: plato.plan };
    });

  res.json({ combo: combo, menu: menu, disponibles: disponibles });
}

// ----------------------------------------------------------------------------
// agregarProductoAlCombo → POST /api/combos/:id/menu: agrega un plato al menú (o lo reactiva si ya había estado).
// El plato tiene que existir y estar activo; puede ser de cualquier plan.
// ENTRADA: req.params.id (el combo) y req.body.id_producto (el plato, número)
// SALIDA:  200 { mensaje: '"Tarta" quedó en el menú' } · 400 datos mal o plato apagado · 404 combo no existe · 500.
// Lo llama: rutas.combos.js · Llama a: modelo.traerComboBD, traerPlatoBD, agregarProductoAlComboBD.
// ----------------------------------------------------------------------------
async function agregarProductoAlCombo(req, res) {
  // 1. El combo (de la dirección)
  const idCombo = Number(req.params.id);
  const comboInvalido = !Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE;
  if (comboInvalido) { // ¿el id del combo no sirve? SÍ: 'abc' · NO: '7'
    return res.status(400).json({ error: 'Combo inválido' });
  }

  // 2. El plato (del cuerpo). NO pasa por Number(): tiene que venir como número de verdad (como lo manda la pantalla)
  let idProducto;
  if (req.body) { // ¿vino cuerpo? SÍ: { id_producto: 6 } · NO: pedido sin cuerpo
    idProducto = req.body.id_producto;
  }
  const platoInvalido = typeof idProducto !== 'number' || !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE;
  if (platoInvalido) { // ¿el plato no sirve? SÍ: '5' (texto), nada · NO: 6
    return res.status(400).json({ error: 'Elegí un plato' });
  }

  // 3. El combo tiene que existir
  const { data: combo, error: errorCombo } = await modelo.traerComboBD(idCombo);
  if (errorCombo) { return errorInterno(res, errorCombo); }
  if (!combo) { // ¿no existe? SÍ: combo 999999 · NO: combo 7
    return res.status(404).json({ error: 'El combo no existe' });
  }

  // 4. El plato tiene que existir y estar activo
  const { data: plato, error: errorPlato } = await modelo.traerPlatoBD(idProducto);
  if (errorPlato) { return errorInterno(res, errorPlato); }
  const platoNoSirve = !plato || !plato.activo;
  if (platoNoSirve) { // ¿no existe o está apagado? SÍ: plato 999999 · NO: plato 6 activo
    return res.status(400).json({ error: 'El plato no existe o está desactivado' });
  }

  // 5. Se agrega (o se reactiva)
  const { error } = await modelo.agregarProductoAlComboBD(idCombo, idProducto);
  if (error) { return errorInterno(res, error); }

  res.json({ mensaje: `"${plato.nombre}" quedó en el menú` });
}

module.exports = {
  listarCombos, actualizarEstadoCombo, quitarProductoDelCombo,
  crearCombo, editarCombo, verMenuCombo, agregarProductoAlCombo
};
