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

/* ======================================================
   API COCINEROS
   ====================================================== */

app.get('/api/cocineros', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol_id')
    .eq('rol_id', 3);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.post('/api/asignar-cocineros', async (req, res) => {
  const { pedido_id, tareas } = req.body;

  if (!pedido_id || !Array.isArray(tareas) || tareas.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const registros = tareas.map(t => ({
    pedido_id,
    cocinero_id: t.cocineroId,
    producto_id: t.producto_id,
    cantidad: t.cantidad
  }));

  const { error } = await supabase
    .from('pedido_cocineros')
    .insert(registros);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Cocineros asignados correctamente' });
});

app.get('/api/tareas-cocinero/:cocineroId', async (req, res) => {
  const { cocineroId } = req.params;

  const { data, error } = await supabase
    .from('pedido_cocineros')
    .select(`
      cantidad,
      productos ( nombre ),
      pedidos (
        id,
        estados ( nombre )
      )
    `)
    .eq('cocinero_id', cocineroId);

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

app.put('/api/pedidos/:pedidoId/pagado', async (req, res) => {
  const { pedidoId } = req.params;
  const { pagado } = req.body; // Expect boolean

  const { data, error } = await supabase
    .from('pedidos')
    .update({ pagado: pagado })
    .eq('id', pedidoId)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mensaje: 'Pago actualizado', pedido: data });
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
   SERVER
   ====================================================== */

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Accesible en red local via IP:3000`);
});


