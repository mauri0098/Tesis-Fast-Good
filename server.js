require('dotenv').config();// credeceales secretas de supabase (URL Y CLAVE) en .env SIN ESTO EL SERVIDOR NO PUEDE HABLAR CON LA BASE DE DATOS

const express = require('express');// Framework para crear el servidor y manejar rutas
const cors = require('cors');// Middleware para permitir solicitudes desde el frontend (CORS)
const path = require('path');// Módulo para manejar rutas de archivos (para servir el frontend)

const app = express();// Crear instancia del servidor Express

app.use(cors());
app.use(express.json());

const supabase = require('./config/supabaseClient');// Cliente de Supabase para interactuar con la base de datos

/* ======================================================
   LÓGICA DE DESCUENTO DE STOCK POR RECETA
   Retorna null si todo OK, o un string con el error.
   Se activa cuando un pedido pasa al estado "En Preparación" (id=2).
   ====================================================== */

async function descontarStockPedido(pedidoId) {
  try {
    const motivoBase = `pedido #${String(pedidoId).padStart(3, '0')}`;

    // 0. Idempotencia: si ya existe un movimiento para este pedido, no descontar de nuevo
    const { data: movPrevio, error: errCheck } = await supabase
      .from('movimientos_stock')
      .select('id')
      .ilike('motivo', `%${motivoBase}%`)
      .limit(1);

    if (errCheck) {
      console.error('ERROR REAL DEL SERVIDOR [movimientos_stock check]:', errCheck);
      return `Error al verificar movimientos previos: ${errCheck.message}`;
    }
    if (movPrevio && movPrevio.length > 0) {
      console.log(`[STOCK] Pedido #${pedidoId} ya fue procesado — omitiendo descuento.`);
      return null;
    }

    // 1. Productos y cantidades del pedido
    const { data: detalles, error: errDetalles } = await supabase
      .from('pedido_detalles')
      .select('id_producto, cantidad')
      .eq('id_pedido', pedidoId);

    if (errDetalles) {
      console.error('ERROR REAL DEL SERVIDOR [pedido_detalles]:', errDetalles);
      return `Error al leer detalles del pedido: ${errDetalles.message}`;
    }
    if (!detalles || detalles.length === 0) return null;

    // 2. Recetas desde producto_insumo — select(*) para no asumir nombre de columna
    const productIds = detalles.map(d => d.id_producto);
    const { data: recetas, error: errRecetas } = await supabase
      .from('producto_insumo')
      .select('*')
      .in('id_producto', productIds);

    if (errRecetas) {
      console.error('ERROR REAL DEL SERVIDOR [producto_insumo]:', errRecetas);
      return `Error al leer recetas: ${errRecetas.message}`;
    }
    if (!recetas || recetas.length === 0) return null;

    // 3. Consumo total por insumo (cantidad_receta × platos_pedidos)
    const consumo = {}; // { id_insumo: totalNecesario }
    for (const detalle of detalles) {
      const insumosDelProducto = recetas.filter(
        r => String(r.id_producto) === String(detalle.id_producto)
      );
      for (const r of insumosDelProducto) {
        console.log('[DEBUG RECETA]', r); // ← muestra los nombres reales de columnas en la terminal
        const cantidadReceta = Number(r.cantidad || r.cantidad_insumo || r.cantidad_necesaria || 0);
        const totalNecesario = cantidadReceta * Number(detalle.cantidad);
        consumo[r.id_insumo] = (consumo[r.id_insumo] || 0) + totalNecesario;
      }
    }

    const insumosIds = Object.keys(consumo).map(Number);
    if (insumosIds.length === 0) return null;

    // 4. Stock actual desde insumos
    const { data: insumos, error: errInsumos } = await supabase
      .from('insumos')
      .select('id, nombre, stock_actual')
      .in('id', insumosIds);

    if (errInsumos) {
      console.error('ERROR REAL DEL SERVIDOR [insumos select]:', errInsumos);
      return `Error al leer stock: ${errInsumos.message}`;
    }

    // Mapa de stock con clave y valor forzados a Number para eliminar ambigüedad de tipos
    const stockMap  = {}; // { id_num: stockActualNum }
    const nombreMap = {}; // { id_num: nombre }
    for (const fila of insumos) {
      const idNum          = Number(fila.id);
      stockMap[idNum]      = Number(fila.stock_actual ?? 0);
      nombreMap[idNum]     = fila.nombre || String(fila.id);
    }

    // 5. Pre-flight check: comparación estrictamente numérica, antes de tocar nada
    for (const [keyId, totalRaw] of Object.entries(consumo)) {
      const idNum              = Number(keyId);
      const stockActualNum     = stockMap[idNum] ?? 0;
      const cantidadRequerida  = Number(totalRaw);

      console.log(`[STOCK DEBUG] insumo ${idNum} | stock: ${stockActualNum} | requerido: ${cantidadRequerida}`);

      if (stockActualNum < cantidadRequerida) {
        return `Stock insuficiente de "${nombreMap[idNum]}": se necesitan ${cantidadRequerida}, hay ${stockActualNum} disponibles`;
      }
    }

    // 6. Aplicar descuentos en insumos
    const fechaHora = new Date().toISOString();
    const movimientosAInsertar = [];

    for (const [keyId, totalRaw] of Object.entries(consumo)) {
      const idNum             = Number(keyId);
      const cantidadRequerida = Number(totalRaw);
      const nuevoStock        = (stockMap[idNum] ?? 0) - cantidadRequerida;

      const { error: errUpdate } = await supabase
        .from('insumos')
        .update({ stock_actual: nuevoStock })
        .eq('id', idNum);

      if (errUpdate) {
        console.error('ERROR REAL DEL SERVIDOR [insumos update]:', errUpdate);
        return `Error al descontar stock de "${nombreMap[idNum]}": ${errUpdate.message}`;
      }

      movimientosAInsertar.push({
        id_insumo: idNum,
        tipo:      'salida',
        cantidad:  cantidadRequerida,
        motivo:    `Consumo por producción ${motivoBase}`,
        fecha:     fechaHora
      });
    }

    // 7. Registrar movimientos en movimientos_stock
    const { error: errMov } = await supabase
      .from('movimientos_stock')
      .insert(movimientosAInsertar);

    if (errMov) {
      console.error('ERROR REAL DEL SERVIDOR [movimientos_stock insert]:', errMov);
      return `Error al registrar movimientos de stock: ${errMov.message}`;
    }

    console.log(`[STOCK] Descuento registrado para ${motivoBase} (${insumos.length} insumos)`);
    return null; // éxito

  } catch (error) {
    console.error('ERROR REAL DEL SERVIDOR en descontarStockPedido:', error);
    return `Error inesperado al procesar stock: ${error.message}`;
  }
}

/* ======================================================
   API AUTENTICACIÓN
   ====================================================== */

// POST /api/login → Validar credenciales de usuario
app.post('/api/login', async (req, res) => {
  const { nombre, contraseña } = req.body;

  console.log('=== LOGIN INTENTADO ===');
  console.log('Usuario enviado:', nombre);
  console.log('Contraseña enviada:', contraseña);

  // Validar que se envíen nombre y contraseña
  if (!nombre || !contraseña) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    // Buscar usuario por nombre o email (case-insensitive)
    let { data: porNombre } = await supabase
      .from('usuarios')
      .select('id, nombre, apellido, email, id_rol, contraseña, telefono, direccion')
      .ilike('nombre', nombre)
      .limit(1);

    let usuarios = porNombre?.[0];

    if (!usuarios) {
      const { data: porEmail } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, id_rol, contraseña, telefono, direccion')
        .ilike('email', nombre)
        .limit(1);
      usuarios = porEmail?.[0];
    }

    console.log('Usuario encontrado:', usuarios);

    if (!usuarios) {
      console.log('Usuario no encontrado');
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    console.log('Contraseña en BD:', usuarios.contraseña);
    console.log('Contraseña enviada:', contraseña);
    console.log('¿Contraseñas coinciden?', usuarios.contraseña === contraseña);

    // Validar contraseña (comparación simple - en producción usar bcrypt)
    if (usuarios.contraseña !== contraseña) {
      console.log('Contraseña incorrecta');
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    console.log('LOGIN EXITOSO para:', usuarios.nombre);

    // El login fue exitoso, devolver datos del usuario
    return res.json({
      mensaje: 'Login exitoso',
      usuario: {
        id: usuarios.id,
        nombre: usuarios.nombre,
        apellido: usuarios.apellido,
        email: usuarios.email,
        id_rol: usuarios.id_rol,
        telefono: usuarios.telefono || '',
        direccion: usuarios.direccion || ''
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/register → Crear cuenta de usuario (rol 4)
app.post('/api/register', async (req, res) => {
  const { nombre, apellido, direccion, telefono, email, contraseña } = req.body;

  if (!nombre || !apellido || !email || !contraseña) {
    return res.status(400).json({ error: 'Nombre, apellido, email y contraseña son requeridos' });
  }

  try {
    // Verificar si ya existe una cuenta con ese email
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .ilike('email', email)
      .limit(1);

    if (existente && existente.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta con ese email' });
    }

    // Crear usuario con rol 4 (Usuario)
    const { data: nuevoUsuario, error } = await supabase
      .from('usuarios')
      .insert([{ nombre, apellido, email, contraseña, telefono, direccion, id_rol: 4 }])
      .select()
      .single();

    if (error) {
      console.error('Error al registrar:', error);
      return res.status(500).json({ error: 'Error al crear la cuenta: ' + error.message });
    }

    return res.json({
      mensaje: 'Cuenta creada exitosamente',
      usuario: { id: nuevoUsuario.id, nombre: nuevoUsuario.nombre, email: nuevoUsuario.email }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/* ======================================================
   API PRODUCTOS
   ====================================================== */

app.get('/api/productos-test', async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      id,
      nombre,
      planes (
        nombre,
        categorias (
          nombre
        )
      )
    `);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

/* ======================================================
   API v1 — CATÁLOGO (Categorías → Planes → Productos)
   ====================================================== */

// GET /api/v1/catalogo → árbol completo en una sola consulta (performance)
app.get('/api/v1/catalogo', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias')
    .select(`
      id,
      nombre,
      planes (
        id,
        nombre,
        descripcion_nutricional,
        activo,
        productos (
          id,
          nombre,
          descripcion,
          imagen,
          precio,
          descuento,
          activo
        )
      )
    `);

  if (error) return res.status(500).json({ error: error.message });

  // Filtrar planes y productos activos en el servidor
  const catalogo = (data || []).map(cat => ({
    id:     cat.id,
    nombre: cat.nombre,
    planes: (cat.planes || [])
      .filter(p => p.activo)
      .map(plan => ({
        id:     plan.id,
        nombre: plan.nombre,
        descripcion_nutricional: plan.descripcion_nutricional,
        productos: (plan.productos || []).filter(prod => prod.activo)
      }))
  }));

  res.json(catalogo);
});

// GET /api/v1/categorias → todas las categorías
app.get('/api/v1/categorias', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/v1/categorias/:id/planes → planes activos de una categoría
app.get('/api/v1/categorias/:id/planes', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de categoría inválido' });
  const { data, error } = await supabase
    .from('planes')
    .select('id, nombre, descripcion_nutricional')
    .eq('id_categoria', id)
    .eq('activo', true);
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No se encontraron planes para esta categoría' });
  res.json(data);
});

// GET /api/v1/planes/:id/productos → productos activos de un plan
app.get('/api/v1/planes/:id/productos', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de plan inválido' });
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen, precio')
    .eq('id_plan', id)
    .eq('activo', true);
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No se encontraron productos para este plan' });
  res.json(data);
});

// GET /api/v1/productos → todos los productos activos
app.get('/api/v1/productos', async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen, precio')
    .eq('activo', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/v1/productos/:id → producto por ID
app.get('/api/v1/productos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen, precio')
    .eq('id', id)
    .eq('activo', true)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Producto no encontrado' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

/* ======================================================
   API COCINEROS POR PEDIDO
   ====================================================== */

// GET /api/pedidos/:id/cocineros → cocineros asignados a un pedido
app.get('/api/pedidos/:id/cocineros', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const { data: asignaciones, error } = await supabase
    .from('pedido_cocineros')
    .select('cocinero_id')
    .eq('pedido_id', id);

  if (error) return res.status(500).json({ error: error.message });
  if (!asignaciones || asignaciones.length === 0) return res.json([]);

  const ids = [...new Set(asignaciones.map(r => r.cocinero_id))];

  const { data: usuarios, error: err2 } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .in('id', ids);

  if (err2) return res.status(500).json({ error: err2.message });
  res.json(usuarios || []);
});

/* ======================================================
   API PEDIDOS
   ====================================================== */

app.post('/api/pedidos', async (req, res) => {// Endpoint para crear un nuevo pedido
  const {
    usuario_id,
    total,
    items,
    cliente_nombre,
    cliente_direccion,
    cliente_telefono,
    cliente_email,
    fecha_entrega,
    metodo_pago,
    observaciones,
    barrio_id,
    tipo_entrega
  } = req.body;

  // UUID fijo si no viene usuario_id
  const finalUserId = usuario_id || 'd9b1ae00-fda5-4488-86b3-90d769b47a02'; // "Consumidor Final" para pedidos públicos sin login

  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      id_usuario: finalUserId,
      id_estado: 1,
      total,
      cliente_nombre,
      cliente_direccion,
      cliente_telefono,
      cliente_email,
      fecha_entrega,
      metodo_pago,
      observaciones,
      barrio_id: barrio_id || null,
      tipo_entrega: tipo_entrega || 'Delivery',
      pagado: false // Default false
    })
    .select()
    .single();

  if (errorPedido) {
    return res.status(500).json({ error: errorPedido.message });
  }

  // Buscar precios reales desde la tabla productos
  const productoIds = items.map(item => item.producto_id);
  const { data: productosDB, error: errorPrecios } = await supabase
    .from('productos')
    .select('id, precio')
    .in('id', productoIds);

  if (errorPrecios) {
    return res.status(500).json({ error: errorPrecios.message });
  }

  const precioMap = {};
  productosDB.forEach(p => { precioMap[p.id] = p.precio; });

  const itemsConPedido = items.map(item => ({
    id_pedido: pedido.id,
    id_producto: item.producto_id,
    cantidad: item.cantidad,
    precio_unitario: precioMap[item.producto_id] ?? 0
  }));

  const { error: errorItems } = await supabase
    .from('pedido_detalles')
    .insert(itemsConPedido);

  if (errorItems) {
    return res.status(500).json({ error: errorItems.message });
  }

  res.json({ mensaje: 'Pedido creado correctamente', pedido });
});

app.get('/api/pedidos', async (req, res) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      fecha_entrega,
      total,
      metodo_pago,
      pagado,
      cliente_nombre,
      cliente_direccion,
      cliente_telefono,
      cliente_email,
      observaciones,
      tipo_entrega,
      barrio_id,
      id_estado,
      estados ( nombre ),
      barrios ( id, nombre ),
      pedido_detalles (
        cantidad,
        precio_unitario,
        productos ( nombre, codigo_plato )
      )
    `)
    .order('fecha_pedido', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.put('/api/pedidos/:id/pagado', async (req, res) => {
  const { id } = req.params;
  const { pagado } = req.body;

  const { data, error } = await supabase
    .from('pedidos')
    .update({ pagado: Boolean(pagado) })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ mensaje: 'Pago actualizado', pedido: data });
});

app.put('/api/pedidos/:pedidoId/estado', async (req, res) => {
  const { pedidoId } = req.params;
  const { estado_id } = req.body;
  const nuevoEstado = parseInt(estado_id);

  try {
    // Verificar que el pedido existe
    const { data: pedidoActual, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, id_estado')
      .eq('id', pedidoId)
      .single();

    if (errLectura) {
      console.error('[ESTADO] Error leyendo pedido:', errLectura.message);
      return res.status(500).json({ error: `Error al leer pedido: ${errLectura.message}` });
    }
    if (!pedidoActual) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Disparar descuento si el nuevo estado requiere producción (2, 3 o 4).
    // La idempotencia se maneja dentro de descontarStockPedido consultando movimientos_stock.
    if ([3, 4].includes(nuevoEstado)) {
      const errorStock = await descontarStockPedido(pedidoId);
      if (errorStock) {
        return res.status(409).json({ error: errorStock });
      }
    }

    const { data, error } = await supabase
      .from('pedidos')
      .update({ id_estado: nuevoEstado })
      .eq('id', pedidoId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ mensaje: 'Estado actualizado', pedido: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  const { error: errorDetalles } = await supabase
    .from('pedido_detalles')
    .delete()
    .eq('id_pedido', id);

  if (errorDetalles) {
    console.error('[DELETE pedido] error en pedido_detalles:', errorDetalles);
    return res.status(500).json({ error: errorDetalles.message });
  }

  const { error } = await supabase
    .from('pedidos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[DELETE pedido] error en pedidos:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Pedido eliminado correctamente' });
});

/* ======================================================
   API COCINEROS / ASIGNACIÓN A PLANES
   ====================================================== */

app.get('/api/cocineros', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido')
    .eq('id_rol', 2)
    .order('nombre', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/planes/cocineros', async (req, res) => {
  const { data: planes, error: errorPlanes } = await supabase
    .from('planes')
    .select('id, nombre, activo, id_cocinero, id_cocinero_suplente, categorias(nombre)')
    .order('nombre', { ascending: true });

  if (errorPlanes) return res.status(500).json({ error: errorPlanes.message });

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido');

  const mapaUsuarios = {};
  (usuarios || []).forEach(u => { mapaUsuarios[u.id] = u; });

  const resultado = (planes || []).map(p => ({
    ...p,
    cocinero_principal: p.id_cocinero ? (mapaUsuarios[p.id_cocinero] || null) : null,
    cocinero_suplente:  p.id_cocinero_suplente ? (mapaUsuarios[p.id_cocinero_suplente] || null) : null,
  }));

  res.json(resultado);
});

app.put('/api/planes/:id/cocinero', async (req, res) => {
  const { id } = req.params;
  const { id_cocinero, id_cocinero_suplente } = req.body;

  const { data, error } = await supabase
    .from('planes')
    .update({
      id_cocinero: id_cocinero || null,
      id_cocinero_suplente: id_cocinero_suplente || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ mensaje: 'Cocinero actualizado correctamente', plan: data });
});

/* ======================================================
   API ESTADOS
   ====================================================== */

app.get('/api/estados', async (req, res) => {
  const { data, error } = await supabase
    .from('estados')
    .select('id, nombre')
    .order('id', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
/* ======================================================
   API STOCK
   ====================================================== */
app.get('/api/insumos', async (req, res) => {
  const { data, error } = await supabase
    .from('insumos')
    .select(`
      id, nombre, stock_actual, stock_minimo, unidad_medida, 
      fecha_ingreso, fecha_caducidad, activo,
      categorias_insumos ( nombre )
    `)
    .order('nombre', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.post('/api/insumos', async (req, res) => {
  const { nombre, stock_actual, stock_minimo, unidad_medida, fecha_ingreso, fecha_caducidad, id_categoria_insumo } = req.body;

  const { data, error } = await supabase
    .from('insumos')
    .insert({
      nombre,
      stock_actual,
      stock_minimo,
      unidad_medida,
      fecha_ingreso,
      fecha_caducidad,
      id_categoria_insumo
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Insumo creado correctamente', insumo: data });
});
app.put('/api/insumos/:id', async (req, res) => {
  const { id } = req.params;
  const { stock_actual } = req.body;

  const { data, error } = await supabase
    .from('insumos')
    .update({ stock_actual })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Stock actualizado', insumo: data });
});
app.get('/api/categorias-insumos', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias_insumos')
    .select('id, nombre')
    .order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
/* ======================================================
   API RECETAS
   ====================================================== */

// GET /api/recetas → productos que tienen receta, con sus insumos
app.get('/api/recetas', async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      id_producto:id,
      nombre_producto:nombre,
      codigo_plato,
      precio,
      descuento,
      plan:planes (
        nombre,
        codigo_plan,
        categoria:categorias ( nombre )
      ),
      insumos:producto_insumo (
        id_insumo,
        cantidad_necesaria,
        unidad_medida,
        insumos ( nombre, stock_actual )
      )
    `)
    .order('nombre', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Solo productos que tienen al menos un insumo en la receta
  const conReceta = data.filter(p => p.insumos && p.insumos.length > 0);

  const resultado = conReceta.map(p => ({
    id_producto:     p.id_producto,
    nombre_producto: p.nombre_producto,
    codigo_plato:    p.codigo_plato || '-',
    precio:          p.precio    != null ? Number(p.precio)    : null,
    descuento:       p.descuento != null ? Number(p.descuento) : null,
    plan: p.plan ? {
      nombre:    p.plan.nombre,
      codigo:    p.plan.codigo_plan || null,
      categoria: p.plan.categoria ? p.plan.categoria.nombre : null
    } : null,
    insumos: (p.insumos || []).map(ins => ({
      id_insumo:          ins.id_insumo,
      nombre_insumo:      ins.insumos ? ins.insumos.nombre      : '-',
      cantidad_necesaria: ins.cantidad_necesaria,
      unidad_medida:      ins.unidad_medida,
      stock_actual:       ins.insumos ? ins.insumos.stock_actual : 0
    }))
  }));

  res.json(resultado);
});

// POST /api/recetas → crear o reemplazar la receta de un producto y actualizar precio/descuento
// Body: { id_producto, precio?, descuento?, insumos: [{ id_insumo, cantidad_necesaria, unidad_medida }] }
app.post('/api/recetas', async (req, res) => {
  const { id_producto, precio, descuento, insumos } = req.body;

  if (!id_producto || !insumos || insumos.length === 0) {
    return res.status(400).json({ error: 'id_producto e insumos son requeridos' });
  }

  // 1. Actualizar precio y descuento en la tabla productos (si vienen en el body)
  if (precio != null || descuento != null) {
    const camposActualizar = {};
    if (precio    != null) camposActualizar.precio    = Number(precio);
    if (descuento != null) camposActualizar.descuento = Number(descuento);

    const { error: errProd } = await supabase
      .from('productos')
      .update(camposActualizar)
      .eq('id', id_producto);

    if (errProd) return res.status(500).json({ error: errProd.message });
  }

  // 2. Borrar la receta anterior del producto (si existe)
  const { error: errorDelete } = await supabase
    .from('producto_insumo')
    .delete()
    .eq('id_producto', id_producto);

  if (errorDelete) return res.status(500).json({ error: errorDelete.message });

  // 3. Insertar los nuevos insumos
  const filas = insumos.map(ins => ({
    id_producto,
    id_insumo:          ins.id_insumo,
    cantidad_necesaria: ins.cantidad_necesaria,
    unidad_medida:      ins.unidad_medida
  }));

  const { error: errorInsert } = await supabase
    .from('producto_insumo')
    .insert(filas);

  if (errorInsert) return res.status(500).json({ error: errorInsert.message });

  res.json({ mensaje: 'Receta guardada correctamente' });
});

// DELETE /api/recetas/:idProducto → borrar receta de un producto
app.delete('/api/recetas/:idProducto', async (req, res) => {
  const { idProducto } = req.params;

  const { error } = await supabase
    .from('producto_insumo')
    .delete()
    .eq('id_producto', idProducto);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ mensaje: 'Receta eliminada correctamente' });
});

/* ======================================================
   API MOVIMIENTOS DE STOCK
   ====================================================== */

// GET /api/movimientos-stock → listar todos los movimientos
app.get('/api/movimientos-stock', async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select(`
      id, tipo, cantidad, unidad, motivo, fecha,
      insumos ( id, nombre, unidad_medida )
    `)
    .order('fecha', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Convierte kg→g y lts→ml; otras unidades pasan sin cambio
function convertirCantidad(cantidad, unidad) {
  if (unidad === 'kg')  return { convertida: cantidad * 1000, base: 'g'  };
  if (unidad === 'lts') return { convertida: cantidad * 1000, base: 'ml' };
  return { convertida: cantidad, base: unidad };
}

// POST /api/movimientos-stock → registrar entrada o salida, actualiza stock_actual
app.post('/api/movimientos-stock', async (req, res) => {
  const { id_insumo, tipo, cantidad, unidad, motivo, fecha, costo_unitario } = req.body;

  if (!id_insumo || !tipo || !cantidad) {
    return res.status(400).json({ error: 'id_insumo, tipo y cantidad son requeridos' });
  }

  try {
    const { data: insumo, error: errInsumo } = await supabase
      .from('insumos')
      .select('id, stock_actual')
      .eq('id', id_insumo)
      .single();

    if (errInsumo || !insumo) {
      return res.status(404).json({ error: 'Insumo no encontrado' });
    }

    // Convertir a unidad base (g o ml) si corresponde
    const { convertida: cantidadBase, base: unidadBase } = convertirCantidad(Number(cantidad), unidad || 'u');

    const nuevoStock = tipo === 'entrada'
      ? Number(insumo.stock_actual) + cantidadBase
      : Number(insumo.stock_actual) - cantidadBase;

    if (nuevoStock < 0) {
      return res.status(400).json({ error: 'Stock insuficiente para registrar la salida' });
    }

    const costoUnit  = costo_unitario ? Number(costo_unitario) : null;
    const costoTotal = costoUnit ? costoUnit * Number(cantidad) : null;

    // Guardar el movimiento con la cantidad y unidad ORIGINALES (lo que cargó el admin)
    const { data: movimiento, error: errMov } = await supabase
      .from('movimientos_stock')
      .insert([{
        id_insumo,
        tipo,
        cantidad:      Number(cantidad),
        unidad:        unidad || null,
        motivo:        motivo || null,
        fecha:         fecha || new Date().toISOString(),
        costo_unitario: costoUnit,
        costo_total:    costoTotal
      }])
      .select()
      .single();

    if (errMov) return res.status(500).json({ error: errMov.message });

    // Actualizar stock en unidades base; si hubo conversión, también cambiar unidad_medida
    const updatePayload = { stock_actual: nuevoStock };
    if (unidad === 'kg' || unidad === 'lts') updatePayload.unidad_medida = unidadBase;

    const { error: errUpdate } = await supabase
      .from('insumos')
      .update(updatePayload)
      .eq('id', id_insumo);

    if (errUpdate) return res.status(500).json({ error: errUpdate.message });

    res.json({ mensaje: 'Movimiento registrado', movimiento });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/movimientos-stock/:id → eliminar movimiento y revertir stock
app.delete('/api/movimientos-stock/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: mov, error: errMov } = await supabase
      .from('movimientos_stock')
      .select('id, id_insumo, tipo, cantidad, unidad')
      .eq('id', id)
      .single();

    if (errMov || !mov) return res.status(404).json({ error: 'Movimiento no encontrado' });

    const { data: insumo, error: errInsumo } = await supabase
      .from('insumos')
      .select('id, stock_actual')
      .eq('id', mov.id_insumo)
      .single();

    if (errInsumo || !insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    // Revertir usando la misma conversión aplicada al registrar
    const { convertida: cantidadBase } = convertirCantidad(Number(mov.cantidad), mov.unidad || 'u');
    const nuevoStock = mov.tipo === 'entrada'
      ? Number(insumo.stock_actual) - cantidadBase
      : Number(insumo.stock_actual) + cantidadBase;

    if (nuevoStock < 0) {
      return res.status(400).json({ error: 'No se puede eliminar: el stock quedaría negativo' });
    }

    const { error: errDelete } = await supabase
      .from('movimientos_stock')
      .delete()
      .eq('id', id);

    if (errDelete) return res.status(500).json({ error: errDelete.message });

    const { error: errUpdate } = await supabase
      .from('insumos')
      .update({ stock_actual: nuevoStock })
      .eq('id', mov.id_insumo);

    if (errUpdate) return res.status(500).json({ error: errUpdate.message });

    res.json({ mensaje: 'Movimiento eliminado y stock revertido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   API REPORTES
   ====================================================== */

app.get('/api/reportes/resumen', async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let qP = supabase.from('pedidos').select('total').neq('id_estado', 5);
    let qM = supabase.from('movimientos_stock').select('costo_total').eq('tipo', 'entrada').not('costo_total', 'is', null);
    if (desde) { qP = qP.gte('fecha_pedido', desde + 'T00:00:00'); qM = qM.gte('fecha', desde + 'T00:00:00'); }
    if (hasta) { qP = qP.lte('fecha_pedido', hasta + 'T23:59:59'); qM = qM.lte('fecha', hasta + 'T23:59:59'); }
    const [{ data: pedidos }, { data: movs }] = await Promise.all([qP, qM]);
    const ingresos = (pedidos || []).reduce((s, p) => s + Number(p.total), 0);
    const gastos   = (movs    || []).reduce((s, m) => s + Number(m.costo_total), 0);
    res.json({ ingresos, gastos, ganancia: ingresos - gastos, cantidad_pedidos: (pedidos || []).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/ingresos-por-dia', async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('pedidos').select('fecha_pedido, total').neq('id_estado', 5);
  if (desde) query = query.gte('fecha_pedido', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha_pedido', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const map = {};
  (data || []).forEach(p => { const d = p.fecha_pedido.slice(0,10); map[d] = (map[d]||0) + Number(p.total); });
  res.json(Object.entries(map).map(([dia,ingresos])=>({dia,ingresos})).sort((a,b)=>a.dia.localeCompare(b.dia)));
});

app.get('/api/reportes/gastos-por-dia', async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('movimientos_stock').select('fecha, costo_total')
    .eq('tipo', 'entrada').not('costo_total', 'is', null);
  if (desde) query = query.gte('fecha', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const map = {};
  (data || []).forEach(m => { const d = m.fecha.slice(0,10); map[d] = (map[d]||0) + Number(m.costo_total); });
  res.json(Object.entries(map).map(([dia,gastos])=>({dia,gastos})).sort((a,b)=>a.dia.localeCompare(b.dia)));
});

app.get('/api/reportes/productos-mas-vendidos', async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let qP = supabase.from('pedidos').select('id').neq('id_estado', 5);
    if (desde) qP = qP.gte('fecha_pedido', desde + 'T00:00:00');
    if (hasta) qP = qP.lte('fecha_pedido', hasta + 'T23:59:59');
    const { data: pedidos } = await qP;
    const ids = (pedidos || []).map(p => p.id);
    if (!ids.length) return res.json([]);
    const { data: detalles, error } = await supabase
      .from('pedido_detalles').select('cantidad, precio_unitario, productos ( nombre )').in('id_pedido', ids);
    if (error) return res.status(500).json({ error: error.message });
    const map = {};
    (detalles || []).forEach(d => {
      const n = d.productos?.nombre || 'Desconocido';
      if (!map[n]) map[n] = { nombre: n, total_vendido: 0, ingresos: 0 };
      map[n].total_vendido += Number(d.cantidad);
      map[n].ingresos      += Number(d.cantidad) * Number(d.precio_unitario);
    });
    res.json(Object.values(map).sort((a,b)=>b.total_vendido-a.total_vendido).slice(0,10));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/stock-movimientos', async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('movimientos_stock').select('fecha, tipo, cantidad');
  if (desde) query = query.gte('fecha', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const map = {};
  (data || []).forEach(m => {
    const d = m.fecha.slice(0,10);
    if (!map[d]) map[d] = { dia: d, entradas: 0, salidas: 0 };
    if (m.tipo === 'entrada') map[d].entradas += Number(m.cantidad);
    else                       map[d].salidas  += Number(m.cantidad);
  });
  res.json(Object.values(map).sort((a,b)=>a.dia.localeCompare(b.dia)));
});

/* ======================================================
   API BARRIOS
   ====================================================== */

app.get('/api/barrios', async (req, res) => {
  const { data, error } = await supabase
    .from('barrios')
    .select('id, nombre')
    .order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* ======================================================
   API ENVÍOS (delivery del día, agrupado por barrio)
   ====================================================== */

app.get('/api/envios', async (req, res) => {
  const { fecha } = req.query;

  let query = supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      fecha_entrega,
      total,
      metodo_pago,
      pagado,
      cliente_nombre,
      cliente_direccion,
      cliente_telefono,
      cliente_email,
      observaciones,
      tipo_entrega,
      barrio_id,
      id_estado,
      estados ( nombre ),
      barrios ( id, nombre ),
      pedido_detalles (
        cantidad,
        precio_unitario,
        productos ( nombre )
      )
    `)
    .eq('tipo_entrega', 'Delivery')
    .in('id_estado', [3, 4])
    .order('id', { ascending: true });

  if (fecha) {
    query = query.eq('fecha_entrega', fecha);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* ======================================================
   API PLANES (para modal de recetas)
   ====================================================== */

// GET /api/planes → planes activos con su prefijo de código
app.get('/api/planes', async (req, res) => {
  const { data, error } = await supabase
    .from('planes')
    .select('id, nombre, codigo_plan, id_categoria')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/planes/:id/siguiente-codigo → calcula el próximo código correlativo del plan
app.get('/api/planes/:id/siguiente-codigo', async (req, res) => {
  const idPlan = parseInt(req.params.id, 10);
  if (isNaN(idPlan)) return res.status(400).json({ error: 'ID de plan inválido' });

  try {
    const { data: plan, error: errPlan } = await supabase
      .from('planes')
      .select('codigo_plan')
      .eq('id', idPlan)
      .single();

    if (errPlan || !plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const prefix = plan.codigo_plan || '';

    const { data: productos, error: errProd } = await supabase
      .from('productos')
      .select('codigo_plato')
      .eq('id_plan', idPlan);

    if (errProd) return res.status(500).json({ error: errProd.message });

    let maxNum = 0;
    (productos || []).forEach(p => {
      if (p.codigo_plato && p.codigo_plato.startsWith(prefix)) {
        const num = parseInt(p.codigo_plato.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    res.json({ codigo: prefix + (maxNum + 1) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/productos/con-receta → crea producto nuevo + receta de forma atómica
// Body: { nombre, id_plan, insumos: [{ id_insumo, cantidad_necesaria, unidad_medida }] }
app.post('/api/productos/con-receta', async (req, res) => {
  const { nombre, id_plan, precio, descuento, insumos } = req.body;

  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del producto es requerido' });
  if (!id_plan)                   return res.status(400).json({ error: 'El plan es requerido' });
  if (!insumos || insumos.length === 0) return res.status(400).json({ error: 'Agregá al menos un insumo' });

  try {
    // Calcular el próximo código de plato para el plan
    const { data: plan, error: errPlan } = await supabase
      .from('planes')
      .select('codigo_plan')
      .eq('id', id_plan)
      .single();

    if (errPlan || !plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const prefix = plan.codigo_plan || '';

    const { data: existentes, error: errExist } = await supabase
      .from('productos')
      .select('codigo_plato')
      .eq('id_plan', id_plan);

    if (errExist) return res.status(500).json({ error: errExist.message });

    let maxNum = 0;
    (existentes || []).forEach(p => {
      if (p.codigo_plato && p.codigo_plato.startsWith(prefix)) {
        const num = parseInt(p.codigo_plato.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const codigo_plato = prefix + (maxNum + 1);

    // Paso 1: insertar el nuevo producto
    const { data: producto, error: errProducto } = await supabase
      .from('productos')
      .insert({
        nombre:       nombre.trim(),
        id_plan:      parseInt(id_plan),
        codigo_plato,
        precio:       precio    != null ? Number(precio)    : null,
        descuento:    descuento != null ? Number(descuento) : null,
        activo:       true
      })
      .select()
      .single();

    if (errProducto) return res.status(500).json({ error: errProducto.message });

    // Paso 2: insertar la receta (producto_insumo)
    const filas = insumos.map(ins => ({
      id_producto:        producto.id,
      id_insumo:          parseInt(ins.id_insumo),
      cantidad_necesaria: Number(ins.cantidad_necesaria),
      unidad_medida:      ins.unidad_medida
    }));

    const { error: errReceta } = await supabase
      .from('producto_insumo')
      .insert(filas);

    if (errReceta) {
      // Rollback manual: borrar el producto recién creado
      await supabase.from('productos').delete().eq('id', producto.id);
      return res.status(500).json({ error: errReceta.message });
    }

    res.json({ mensaje: 'Producto y receta creados correctamente', producto });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   SERVIR FRONTEND (ESTÁTICO)
   ====================================================== */

// 👉 carpeta frontend - DEBE SER AL FINAL DESPUÉS DE TODAS LAS APIS
app.use(express.static(path.join(__dirname, 'frontend')));// Sirve archivos estáticos (HTML, CSS, JS) desde la carpeta 'frontend'

// 👉 ruta raíz → index.html
app.get('/', (req, res) => {// Cuando se accede a la raíz, se envía el archivo index.html
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));// Asegura que se sirva el index.html correcto
});

/* ======================================================
   SERVER
   ====================================================== */

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Accesible en red local via IP:3000`);
});

