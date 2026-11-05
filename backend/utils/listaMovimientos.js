// ============================================================================
// listaMovimientos.js — arma la lista de movimientos (la usan movimientos y compras).
//   nombreDeUsuario      → ENTRADA: { nombre, apellido } o null · SALIDA: "Ana López" o "-".
//   origenDeRenglonStock → ENTRADA: un renglón de movimientos_stock · SALIDA: de qué movimiento es.
//   armarMovimientos     → ENTRADA: los renglones de viandas y de insumos · SALIDA: la lista, una fila por movimiento.
// Se mudó tal cual de server.js en el paso 2 del MVC (mover no es cambiar).
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// nombreDeUsuario → "Nombre Apellido" de un usuario que vino de la base, o "-" si no vino
// ENTRADA: usuario ({ nombre, apellido } o null)
// SALIDA:  el texto. Ej: { nombre: 'Ana', apellido: 'López' } → 'Ana López' · null → '-'
// La usa armarMovimientos (para quién cargó, quién pidió y quién marcó Hecho).
// ─────────────────────────────────────────────────────────────────────────────
function nombreDeUsuario(usuario) {
  if (!usuario) return '-';                                       // no vino: "-"
  const nombre = (String(usuario.nombre || '') + ' ' + String(usuario.apellido || '')).trim();  // "Ana López" (trim saca el espacio que sobra)
  return nombre || '-';                                           // si quedó vacío, "-"
}

// ─────────────────────────────────────────────────────────────────────────────
// origenDeRenglonStock → dice de qué movimiento es un renglón de insumos (movimientos_stock)
// ENTRADA: fila, con motivo, tipo, id, id_compra, id_movimiento_vianda, id_pedido e id_salida_manual
// SALIDA:  { clave, origen, tipo, numero }. origen = 'compra' · 'produccion' · 'cocina' · 'salida_manual' · 'ajuste'
//          Se elige el primero que corresponde, en ese orden.
// Ej: { id_movimiento_vianda: 40 } → { clave: 'produccion-40', origen: 'produccion', tipo: 'entrada', numero: null }
//     { motivo: 'Consumo por producción pedido #005' } → { clave: 'cocina-5-…', origen: 'cocina', tipo: 'salida', numero: 5 }
//     { id: 9, tipo: 'salida' } (sin ningún id) → { clave: 'ajuste-insumo-9', origen: 'ajuste', tipo: 'salida', numero: null }
// La usan armarMovimientos y GET /api/compras/gastos/:idInsumo: así las dos pantallas dicen lo mismo.
// ─────────────────────────────────────────────────────────────────────────────
function origenDeRenglonStock(fila) {
  // a. ¿Es lo que gastó la cocina en un pedido? Los nuevos tienen id_pedido; los viejos, el motivo EXACTO.
  //    exec busca el texto: ^ y $ = tiene que ser el motivo entero; (\d+) = el número. Ej: '…pedido #005' → ['…', '005']
  const motivoDePedido = /^Consumo por producción pedido #(\d+)$/.exec(fila.motivo || '');
  const pedidoDelMotivo = motivoDePedido ? Number(motivoDePedido[1]) : null;  // '005' → 5 (null si no es de un pedido)
  const idPedido = fila.id_pedido || pedidoDelMotivo;             // primero id_pedido; si no, el del motivo

  // b. A qué movimiento pertenece: se elige el primero que corresponde, en este orden
  //    (compra, después "Hecho", después pedido; si no es ninguno, lo cargado a mano es un ajuste)
  let datos = null;
  if (fila.id_compra) datos = { clave: 'compra-' + fila.id_compra, origen: 'compra', tipo: 'entrada', numero: fila.id_compra };
  if (!datos && fila.id_movimiento_vianda) datos = { clave: 'produccion-' + fila.id_movimiento_vianda, origen: 'produccion', tipo: 'entrada', numero: null };
  if (!datos && idPedido) datos = { clave: 'cocina-' + idPedido + '-' + fila.fecha, origen: 'cocina', tipo: 'salida', numero: idPedido };
  // ¿es de la ventana "Registrar salida"? SÍ: tiene id_salida_manual · NO: una salida de la pantalla vieja (esas siguen como ajuste)
  if (!datos && fila.id_salida_manual) {
    datos = { clave: 'salida-manual-' + fila.id_salida_manual, origen: 'salida_manual', tipo: 'salida', numero: null };
  }
  if (!datos) datos = { clave: 'ajuste-insumo-' + fila.id, origen: 'ajuste', tipo: fila.tipo === 'entrada' ? 'entrada' : 'salida', numero: null };

  return datos;
}

// ─────────────────────────────────────────────────────────────────────────────
// armarMovimientos → junta los renglones de las dos libretas en MOVIMIENTOS (una fila por cosa que pasó)
// ENTRADA: filasViandas (renglones de movimientos_viandas) y filasStock (renglones de movimientos_stock),
//          con sus datos unidos (plato, insumo, usuario, compra, pedido, pedido a cocina)
// SALIDA:  [{ clave, origen, tipo, fecha, numero, usuario, proveedor, motivo, cliente, pidio, insumos, viandas }],
//          del más nuevo al más viejo
//            origen  = 'compra' · 'produccion' · 'venta' · 'devolucion' · 'descarte' · 'cocina' · 'salida_manual' · 'ajuste'
//            tipo    = 'entrada' o 'salida'
//            numero  = el de la compra, el pedido a cocina o el pedido (null si no tiene)
//            insumos = [{ nombre, cantidad, unidad, vence }] · viandas = [{ plato, cantidad }]
// Ej: el "Hecho" de 2 fideos del pedido a cocina #9 = 1 renglón de viandas (+2) y 2 de insumos (harina, huevo)
//     → { origen: 'produccion', tipo: 'entrada', numero: 9, usuario: 'Ana López', pidio: 'Mauri Rodriguez',
//         viandas: [{ plato: 'fideos', cantidad: 2 }],
//         insumos: [{ nombre: 'Harina integral', cantidad: 600, unidad: 'g' }, { nombre: 'Huevo', cantidad: 4, unidad: 'u' }] }
// Cómo se juntan, sin forEach adentro de otro: un objeto { clave: movimiento } y cada renglón se suma al suyo.
//   compra → id_compra · produccion → el renglón de viandas (los insumos lo traen en id_movimiento_vianda)
//   venta y devolucion → el pedido (todos sus renglones se guardan juntos, con la misma hora)
//   cocina → id_pedido, o el motivo EXACTO "Consumo por producción pedido #005" (los renglones viejos y los de Render)
//   salida_manual → id_salida_manual (todos los insumos de una salida juntos, en una fila)
//   descarte y ajuste → uno por renglón
// La usa GET /api/movimientos.
// ─────────────────────────────────────────────────────────────────────────────
function armarMovimientos(filasViandas, filasStock) {
  const movimientoPorClave = {};                                  // { clave: movimiento }
  const movimientos = [];                                         // la lista, en el orden en que se crean

  // 1. LAS VIANDAS (movimientos_viandas): producción, venta, devolución, descarte y ajuste
  filasViandas.forEach(fila => {                                  // por cada renglón de viandas...
    const cantidad = Number(fila.cantidad);                       // + entran, − salen
    const pedidoACocina = (fila.orden_produccion_detalles || [])[0];  // el pedido a cocina del "Hecho" (undefined si no tiene)

    // a. A qué movimiento pertenece, según sea el tipo del renglón. Lo que no es de estos tipos
    //    (o una venta o devolución sin pedido) queda como ajuste, uno por renglón.
    const ajuste = { clave: 'ajuste-vianda-' + fila.id, origen: 'ajuste', tipo: cantidad > 0 ? 'entrada' : 'salida', numero: null };
    let datos = ajuste;
    switch (fila.tipo) {
      case 'produccion':                                          // según sea un "Hecho" (o una tanda vieja): sus insumos traen este número
        datos = { clave: 'produccion-' + fila.id, origen: 'produccion', tipo: 'entrada', numero: pedidoACocina?.id_orden_produccion ?? null };
        break;
      case 'venta':                                               // según sea una venta de la web nueva: todos los platos del pedido juntos
        datos = fila.id_pedido ? { clave: 'venta-' + fila.id_pedido + '-' + fila.fecha, origen: 'venta', tipo: 'salida', numero: fila.id_pedido } : ajuste;
        break;
      case 'devolucion':                                          // según sea una anulación: todos los platos que volvieron juntos
        datos = fila.id_pedido ? { clave: 'devolucion-' + fila.id_pedido + '-' + fila.fecha, origen: 'devolucion', tipo: 'entrada', numero: fila.id_pedido } : ajuste;
        break;
      case 'descarte':                                            // según sea un descarte: uno por renglón
        datos = { clave: 'descarte-' + fila.id, origen: 'descarte', tipo: 'salida', numero: null };
        break;
    }

    // b. Si es el primer renglón de su movimiento, se crea el movimiento
    //    (?. = "si existe…"; en producción: quién pidió a cocina; en venta: el cliente)
    const esNuevo = !movimientoPorClave[datos.clave];
    if (esNuevo) {
      const quienPidio = datos.origen === 'produccion' ? pedidoACocina?.ordenes_produccion : null;  // solo en producción: el pedido a cocina, con su usuario
      movimientoPorClave[datos.clave] = {
        clave:     datos.clave,                                   // para reconocerlo
        origen:    datos.origen,                                  // de dónde viene
        tipo:      datos.tipo,                                    // entrada o salida
        fecha:     fila.fecha,                                    // cuándo
        numero:    datos.numero,                                  // el pedido o el pedido a cocina
        usuario:   nombreDeUsuario(fila.usuarios),                // quién lo hizo (en producción: quién marcó Hecho)
        proveedor: null,                                          // solo las compras
        motivo:    fila.motivo,                                   // el motivo escrito (ej: "vencidas")
        cliente:   datos.origen === 'venta' ? fila.pedidos?.cliente_nombre ?? null : null,  // solo las ventas: el cliente
        pidio:     quienPidio ? nombreDeUsuario(quienPidio.usuarios) : null,               // solo la producción: quién pidió
        insumos:   [],                                            // los insumos (se llenan en el paso 2)
        viandas:   []                                             // los platos
      };
      movimientos.push(movimientoPorClave[datos.clave]);          // y se agrega a la lista
    }

    // c. El plato de este renglón (en positivo: el tipo ya dice si entra o sale)
    const plato = fila.productos && fila.productos.nombre ? fila.productos.nombre : '-';
    movimientoPorClave[datos.clave].viandas.push({ plato: plato, cantidad: Math.abs(cantidad) });
  });

  // 2. LOS INSUMOS (movimientos_stock): compra, producción (se suman a su renglón de viandas), cocina y ajuste
  filasStock.forEach(fila => {                                    // por cada renglón de insumos...
    // a. y b. A qué movimiento pertenece (compra, "Hecho", pedido, salida manual o ajuste)
    const datos = origenDeRenglonStock(fila);

    // c. Si es el primer renglón de su movimiento, se crea (en producción ya lo creó el paso 1)
    const esNuevo = !movimientoPorClave[datos.clave];
    if (esNuevo) {
      movimientoPorClave[datos.clave] = {
        clave:     datos.clave,
        origen:    datos.origen,
        tipo:      datos.tipo,
        fecha:     fila.fecha,
        numero:    datos.numero,
        usuario:   nombreDeUsuario(fila.usuarios),
        proveedor: datos.origen === 'compra' ? fila.compras?.proveedor || null : null,  // solo las compras
        motivo:    fila.motivo,
        cliente:   null,
        pidio:     null,
        insumos:   [],
        viandas:   []
      };
      movimientos.push(movimientoPorClave[datos.clave]);
    }

    // d. El insumo de este renglón. La unidad: la del renglón o, si no la guardó, la del insumo.
    movimientoPorClave[datos.clave].insumos.push({
      nombre:   fila.insumos?.nombre || '-',                      // ej: "Harina integral"
      cantidad: Number(fila.cantidad),                            // ej: 600
      unidad:   fila.unidad || fila.insumos?.unidad_medida || '', // ej: "g"
      vence:    fila.fecha_vencimiento || null                    // solo las compras
    });
  });

  // 3. Del más nuevo al más viejo (si dos tienen la misma hora, por su clave, para que el orden no cambie)
  //    sort recibe una función que compara dos movimientos: negativo = a va antes, positivo = b va antes
  movimientos.sort((a, b) => {
    const horaA = new Date(a.fecha).getTime();                    // la fecha como número (milisegundos)
    const horaB = new Date(b.fecha).getTime();
    if (horaA !== horaB) return horaB - horaA;                    // el más nuevo primero
    return a.clave.localeCompare(b.clave);                        // empate: por clave
  });

  return movimientos;
}

module.exports = { nombreDeUsuario, origenDeRenglonStock, armarMovimientos };
