require('dotenv').config();// credeceales secretas de supabase (URL Y CLAVE) en .env SIN ESTO EL SERVIDOR NO PUEDE HABLAR CON LA BASE DE DATOS

const express = require('express');// Framework para crear el servidor y manejar rutas
const cors = require('cors');// Middleware para permitir solicitudes desde el frontend (CORS)
const path = require('path');// Módulo para manejar rutas de archivos (para servir el frontend)

const app = express();// Crear instancia del servidor Express

app.use(cors());
app.use(express.json());

const supabase = require('./config/supabaseClient');// Cliente de Supabase para interactuar con la base de datos

/* ======================================================
   SERVIR FRONTEND (ESTÁTICO)
   ====================================================== */

// 👉 carpeta frontend
app.use(express.static(path.join(__dirname, 'frontend')));// Sirve archivos estáticos (HTML, CSS, JS) desde la carpeta 'frontend'

// 👉 ruta raíz → index.html
app.get('/', (req, res) => {// Cuando se accede a la raíz, se envía el archivo index.html
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));// Asegura que se sirva el index.html correcto
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
  const finalUserId = usuario_id || 'cabb426e-a977-411a-88b6-e1db2490d1b2';// Esto es para no romper la inserción si el frontend no envía un usuario_id (ejemplo: pedidos desde el admin)

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

  const itemsConPedido = items.map(item => ({
    id_pedido: pedido.id,
    id_producto: item.producto_id,
    cantidad: item.cantidad,
    precio_unitario: item.precio || 0 // Asumir 0 o precio del front
  }));

  // Notar cambio de tabla: pedido_items -> pedido_detalles
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
        productos ( nombre )
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
   SERVER
   ====================================================== */

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Accesible en red local via IP:3000`);
});

