require('dotenv').config();// credeceales secretas de supabase (URL Y CLAVE) en .env SIN ESTO EL SERVIDOR NO PUEDE HABLAR CON LA BASE DE DATOS

const express = require('express');// Framework para crear el servidor y manejar rutas
const cors = require('cors');// Middleware para permitir solicitudes desde el frontend (CORS)
const path = require('path');// Módulo para manejar rutas de archivos (para servir el frontend)

const app = express();// Crear instancia del servidor Express

app.use(cors());
app.use(express.json());

const supabase = require('./config/supabaseClient');// Cliente de Supabase para interactuar con la base de datos

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
    observaciones
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
      id_estado,
      estados ( nombre ),
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

app.put('/api/pedidos/:pedidoId/estado', async (req, res) => {
  const { pedidoId } = req.params;
  const { estado_id } = req.body;

  const { data, error } = await supabase
    .from('pedidos')
    .update({ id_estado: estado_id })
    .eq('id', pedidoId)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Estado actualizado', pedido: data });
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
      nombre_producto:nombre,w
      plan:planes ( nombre, codigo:codigo_plan ),
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

  // Aplanar los datos anidados de insumos al formato que espera el frontend
  const resultado = conReceta.map(p => ({
    id_producto:    p.id_producto,
    nombre_producto: p.nombre_producto,
    plan:           p.plan,
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

// POST /api/recetas → crear o reemplazar la receta de un producto
// Body: { id_producto, insumos: [{ id_insumo, cantidad_necesaria, unidad_medida }] }
app.post('/api/recetas', async (req, res) => {
  const { id_producto, insumos } = req.body;

  if (!id_producto || !insumos || insumos.length === 0) {
    return res.status(400).json({ error: 'id_producto e insumos son requeridos' });
  }

  // 1. Borrar la receta anterior del producto (si existe)
  const { error: errorDelete } = await supabase
    .from('producto_insumo')
    .delete()
    .eq('id_producto', id_producto);

  if (errorDelete) return res.status(500).json({ error: errorDelete.message });

  // 2. Insertar los nuevos insumos
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

