require('dotenv').config();// credeceales secretas de supabase (URL Y CLAVE) en .env SIN ESTO EL SERVIDOR NO PUEDE HABLAR CON LA BASE DE DATOS

const express = require('express');// Framework para crear el servidor y manejar rutas
const cors = require('cors');// Middleware para permitir solicitudes desde el frontend (CORS)
const path = require('path');// Módulo para manejar rutas de archivos (para servir el frontend)
const helmet = require('helmet');// Headers de seguridad HTTP

const app = express();// Crear instancia del servidor Express

// Detrás del proxy del hosting la IP real del cliente llega en X-Forwarded-For: hace falta para que el
// límite de intentos cuente por cliente y no por la IP del proxy. Solo en producción: sin proxy,
// cualquiera podría inventar ese header y saltear el límite.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Headers de seguridad (X-Frame-Options, nosniff, HSTS, Referrer-Policy, etc.).
// La CSP queda desactivada por ahora: la que trae helmet por defecto bloquea los onclick y <script> inline.
app.use(helmet({ contentSecurityPolicy: false }));

// Orígenes permitidos: localhost (desarrollo) + los de CORS_ORIGIN (el dominio publicado; varios, separados por coma)
const origenesPermitidos = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.CORS_ORIGIN || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
];

app.use(cors({
  origin: function (origin, callback) {
    // Las peticiones sin origen (Postman, curl, mismo servidor) se permiten
    if (!origin) {
      callback(null, true);
      return;
    }

    if (origenesPermitidos.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por política CORS'));
    }
  }
}));
// Tamaño máximo del cuerpo: 6 MB solo para subir imágenes de recetas (base64, máx. 2MB + overhead); el resto, 100 KB
app.use('/api/productos/:id/imagen', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '100kb' }));

const supabase   = require('./config/supabaseClient');// Cliente de Supabase para interactuar con la base de datos
const nodemailer = require('nodemailer');              // Envío de emails (recuperación de contraseña)
const bcrypt     = require('bcryptjs');                // Hash de contraseñas
const jwt        = require('jsonwebtoken');            // Tokens de autenticación
const crypto     = require('crypto');                  // Comparación segura del PIN de anulación
const fechas     = require('./frontend/src/js/fechas.js'); // Días hábiles y feriados (el mismo archivo que usa el frontend)

/* ======================================================
   LÍMITE DE INTENTOS POR IP (express-rate-limit)
   Frena la fuerza bruta (contraseñas, PIN) y la carga masiva de pedidos falsos.
   Cada endpoint tiene su propio contador. Superado el límite responde 429 con { error }.
   Si el servidor queda detrás de un proxy (Nginx, Render, etc.) hay que configurar
   app.set('trust proxy', 1): si no, todos los clientes comparten la IP del proxy.
   ====================================================== */
const { rateLimit } = require('express-rate-limit');

function limitador({ minutos, maximo, mensaje, soloFallidos = false }) {
  return rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: maximo,
    standardHeaders: 'draft-8', // informa el límite en el header RateLimit
    legacyHeaders: false,
    // soloFallidos: cuentan solo las respuestas de error (el objetivo es quien prueba claves, no el uso normal)
    skipSuccessfulRequests: soloFallidos,
    message: { error: mensaje }
  });
}

const limiteLogin = limitador({
  minutos: 15, maximo: 10, soloFallidos: true,
  mensaje: 'Demasiados intentos de inicio de sesión fallidos. Esperá unos minutos y volvé a intentar.'
});
const limiteRegistro = limitador({
  minutos: 15, maximo: 10,
  mensaje: 'Demasiados intentos de registro seguidos. Esperá unos minutos y volvé a intentar.'
});
const limiteRecuperarPassword = limitador({
  minutos: 15, maximo: 10,
  mensaje: 'Demasiadas solicitudes de recuperación de contraseña. Esperá unos minutos y volvé a intentar.'
});
const limiteAnular = limitador({
  minutos: 15, maximo: 10, soloFallidos: true,
  mensaje: 'Demasiados intentos de anulación fallidos. Esperá unos minutos y volvé a intentar.'
});
const limitePedidos = limitador({
  minutos: 10, maximo: 5,
  mensaje: 'Hiciste demasiados pedidos seguidos, esperá unos minutos.'
});

/* ======================================================
   MIDDLEWARE DE AUTENTICACIÓN JWT
   Lee el token del header Authorization: Bearer <token>
   ====================================================== */
// Devuelve el payload del token ({ id, rol, iat, exp }) si viene uno válido, o null. No corta la request.
function leerToken(req) {
  const partes = (req.headers['authorization'] || '').split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') return null;
  try {
    return jwt.verify(partes[1], process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = leerToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.usuario = payload; // { id, rol, iat, exp }
  next();
}

// Va después de requireAuth: deja pasar solo a los roles de la lista (403 si no).
// Roles: 1 Administrador, 2 Cocinero, 3 Repartidor, 4 Consumidor final, 5 Dueño, 6 Administrador del sistema.
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(Number(req.usuario.rol))) {
      return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

// Errores internos: el detalle va a la consola del servidor; al cliente, un mensaje genérico
// (no se filtran mensajes de la base ni stack traces).
const MENSAJE_ERROR_INTERNO = 'Error interno del servidor';
function mensajeInterno(err) {
  console.error('[ERROR INTERNO]', err);
  return MENSAJE_ERROR_INTERNO;
}
function errorInterno(res, err) {
  return res.status(500).json({ error: mensajeInterno(err) });
}

/* ======================================================
   LÓGICA DE STOCK POR RECETA
   - verificarStockPedido: al pasar a "En Preparación" (2). Solo lee, no descuenta.
   - descontarStockPedido: al pasar a "Listo para Entregar" (3) o "Entregado" (4). Descuenta.
   Las dos retornan null si todo OK, o un string con el error.
   ====================================================== */

// Calcula el consumo de insumos del pedido (receta × cantidad) y lo compara con el stock actual.
// Solo lee. Devuelve { error } si falla o no alcanza, o { consumo, stockMap, nombreMap } si alcanza
// (consumo vacío si el pedido no tiene detalles o sus platos no tienen receta).
async function calcularConsumoPedido(pedidoId) {
  const sinConsumo = { consumo: {}, stockMap: {}, nombreMap: {} };

  // 1. Productos y cantidades del pedido
  const { data: detalles, error: errDetalles } = await supabase
    .from('pedido_detalles')
    .select('id_producto, cantidad')
    .eq('id_pedido', pedidoId);

  if (errDetalles) {
    console.error('ERROR REAL DEL SERVIDOR [pedido_detalles]:', errDetalles);
    return { error: `Error al leer detalles del pedido: ${errDetalles.message}` };
  }
  if (!detalles || detalles.length === 0) return sinConsumo;

  // 2. Recetas desde producto_insumo — select(*) para no asumir nombre de columna
  const productIds = detalles.map(d => d.id_producto);
  const { data: recetas, error: errRecetas } = await supabase
    .from('producto_insumo')
    .select('*')
    .in('id_producto', productIds);

  if (errRecetas) {
    console.error('ERROR REAL DEL SERVIDOR [producto_insumo]:', errRecetas);
    return { error: `Error al leer recetas: ${errRecetas.message}` };
  }
  if (!recetas || recetas.length === 0) return sinConsumo;

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
  if (insumosIds.length === 0) return sinConsumo;

  // 4. Stock actual desde insumos
  const { data: insumos, error: errInsumos } = await supabase
    .from('insumos')
    .select('id, nombre, stock_actual')
    .in('id', insumosIds);

  if (errInsumos) {
    console.error('ERROR REAL DEL SERVIDOR [insumos select]:', errInsumos);
    return { error: `Error al leer stock: ${errInsumos.message}` };
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
      return { error: `Stock insuficiente de "${nombreMap[idNum]}": se necesitan ${cantidadRequerida}, hay ${stockActualNum} disponibles` };
    }
  }

  return { consumo, stockMap, nombreMap };
}

// Al pasar a "En Preparación": ¿alcanza el stock para todo el pedido? Solo lee, no descuenta.
async function verificarStockPedido(pedidoId) {
  try {
    const { error } = await calcularConsumoPedido(pedidoId);
    return error || null;
  } catch (error) {
    console.error('ERROR REAL DEL SERVIDOR en verificarStockPedido:', error);
    return `Error inesperado al verificar stock: ${error.message}`;
  }
}

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

    // 1–5. Consumo del pedido y pre-flight check (compartido con verificarStockPedido)
    const calculo = await calcularConsumoPedido(pedidoId);
    if (calculo.error) return calculo.error;

    const { consumo, stockMap, nombreMap } = calculo;
    if (Object.keys(consumo).length === 0) return null;

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

    console.log(`[STOCK] Descuento registrado para ${motivoBase} (${movimientosAInsertar.length} insumos)`);
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
app.post('/api/login', limiteLogin, async (req, res) => {
  // Aceptar 'nombre', 'nombre_usuario', 'usuario' o 'email' desde el frontend
  const identificador = (
    req.body.nombre_usuario ||
    req.body.nombre ||
    req.body.usuario ||
    req.body.email ||
    ''
  ).trim();

  // Aceptar 'contraseña', 'contrasena' o 'password'
  const passwordPlano = req.body.contraseña || req.body.contrasena || req.body.password;

  console.log('=== LOGIN INTENTADO ===');
  console.log('Identificador recibido:', identificador);

  // Validar que se envíen usuario y contraseña
  if (!identificador || !passwordPlano) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    // Buscar usuario por nombre_usuario, email o nombre (case-insensitive)
    let usuario = null;

    // 1. Buscar por nombre_usuario
    const { data: porNombreUsuario, error: errNombreUsuario } = await supabase
      .from('usuarios')
      .select('*')
      .ilike('nombre_usuario', identificador)
      .limit(1);

    if (errNombreUsuario) {
      console.error('Error al consultar por nombre_usuario:', errNombreUsuario.message);
    }
    usuario = porNombreUsuario?.[0];

    // 2. Si no se encontró, buscar por email
    if (!usuario) {
      const { data: porEmail, error: errEmail } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('email', identificador)
        .limit(1);

      if (errEmail) {
        console.error('Error al consultar por email:', errEmail.message);
      }
      usuario = porEmail?.[0];
    }

    // 3. Si aún no se encontró, buscar por nombre
    if (!usuario) {
      const { data: porNombre, error: errNombre } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('nombre', identificador)
        .limit(1);

      if (errNombre) {
        console.error('Error al consultar por nombre:', errNombre.message);
      }
      usuario = porNombre?.[0];
    }

    if (!usuario) {
      console.log('Usuario no encontrado:', identificador);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Obtener hash de contraseña (tolerante a 'contrasena' o 'contraseña')
    const hashDb = usuario.contrasena || usuario.contraseña;
    if (!hashDb) {
      console.error('El usuario no posee hash de contraseña en la base de datos');
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Validar contraseña con bcrypt
    const contrasenaValida = await bcrypt.compare(passwordPlano, hashDb);
    if (!contrasenaValida) {
      console.log('Contraseña inválida para:', identificador);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    console.log('LOGIN EXITOSO para:', usuario.nombre_usuario || usuario.nombre);

    // Generar token JWT con id y rol del usuario, válido por 8 horas
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.id_rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // El login fue exitoso, devolver token y datos del usuario
    return res.json({
      mensaje: 'Login exitoso',
      token: token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre || usuario.nombre_usuario,
        nombre_usuario: usuario.nombre_usuario,
        apellido: usuario.apellido || '',
        email: usuario.email,
        id_rol: usuario.id_rol,
        telefono: usuario.telefono || '',
        direccion: usuario.direccion || ''
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/register → Crear cuenta de usuario (rol 4)
app.post('/api/register', limiteRegistro, async (req, res) => {
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
    const hashContrasenaReg = await bcrypt.hash(contraseña, 10);
    const { data: nuevoUsuario, error } = await supabase
      .from('usuarios')
      // Siempre rol 4 (Consumidor final): el registro es público, se ignora cualquier id_rol del body
      .insert([{ nombre, apellido, email, contrasena: hashContrasenaReg, telefono, direccion, id_rol: 4 }])
      .select()
      .single();

    if (error) return errorInterno(res, error);

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

  if (error) return errorInterno(res, error);

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
  if (error) return errorInterno(res, error);
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
  if (error) return errorInterno(res, error);
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
  if (error) return errorInterno(res, error);
  if (!data || data.length === 0) return res.status(404).json({ error: 'No se encontraron productos para este plan' });
  res.json(data);
});

// GET /api/v1/productos → todos los productos activos
app.get('/api/v1/productos', async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen, precio')
    .eq('activo', true);
  if (error) return errorInterno(res, error);
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
    return errorInterno(res, error);
  }
  res.json(data);
});

/* ======================================================
   API TAREAS DE COCINA (filtradas por cocinero asignado)
   ====================================================== */

// Un plato le corresponde a un cocinero si lo tiene asignado directamente o, cuando el plato
// no tiene cocinero propio, si es el principal o el suplente de su plan (respaldo).
// `producto` debe traer id_cocinero y planes(id_cocinero, id_cocinero_suplente).
function platoEsDelCocinero(producto, cocineroId) {
  if (producto.id_cocinero) return producto.id_cocinero === cocineroId;
  const plan = producto.planes;
  return !!plan && (plan.id_cocinero === cocineroId || plan.id_cocinero_suplente === cocineroId);
}

// GET /api/cocina/tareas?cocinero_id=UUID
// Si se pasa cocinero_id, devuelve los pedidos en estado 2 que tienen al menos un plato de ese
// cocinero (asignado al plato o, como respaldo, por su plan) sin marcar como listo.
// Cada detalle lleva es_mio: true/false y listo.
// Sin cocinero_id devuelve todos los pedidos en estado 2 con es_mio: true (modo admin/debug).
// Un cocinero (rol 2) ve siempre solo lo suyo: el cocinero sale del token y se ignora cocinero_id.
app.get('/api/cocina/tareas', requireAuth, requireRol(2, 6, 5, 1), async (req, res) => {
  const cocinero_id = req.usuario.rol === 2 ? req.usuario.id : req.query.cocinero_id;
  let idsPedidos = null;      // null = sin filtro por cocinero
  let misProductos = null;    // Set de id_producto del cocinero

  if (cocinero_id) {
    // 1. Platos del cocinero. El filtro se hace en JS para no armar el filtro de Supabase con texto del cliente.
    const { data: productos, error: errProductos } = await supabase
      .from('productos')
      .select('id, id_cocinero, planes ( id_cocinero, id_cocinero_suplente )');

    if (errProductos) return errorInterno(res, errProductos);

    misProductos = new Set(
      (productos || []).filter(p => platoEsDelCocinero(p, cocinero_id)).map(p => p.id)
    );
    if (misProductos.size === 0) return res.json([]);

    // 2. Pedidos que tienen al menos un plato de ese cocinero todavía sin terminar
    //    (los pedidos donde ya marcó todos sus platos como listos no se le muestran)
    const { data: detalles, error: errDetalles } = await supabase
      .from('pedido_detalles')
      .select('id_pedido')
      .in('id_producto', [...misProductos])
      .eq('listo', false);

    if (errDetalles) return errorInterno(res, errDetalles);

    idsPedidos = [...new Set((detalles || []).map(d => d.id_pedido))];
    if (idsPedidos.length === 0) return res.json([]);
  }

  // 3. Traer pedidos en estado 2, con sus detalles
  let query = supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      observaciones,
      id_estado,
      pedido_detalles (
        id_producto,
        cantidad,
        precio_unitario,
        listo,
        productos ( nombre, codigo_plato )
      )
    `)
    .eq('id_estado', 2)
    .order('fecha_pedido', { ascending: true });

  if (idsPedidos !== null) {
    query = query.in('id', idsPedidos);
  }

  const { data, error } = await query;
  if (error) return errorInterno(res, error);

  // 4. Marcar en cada detalle si el plato es del cocinero que consulta
  const resultado = (data || []).map(pedido => ({
    ...pedido,
    pedido_detalles: (pedido.pedido_detalles || []).map(det => ({
      ...det,
      es_mio: misProductos ? misProductos.has(det.id_producto) : true
    }))
  }));

  res.json(resultado);
});

/* ======================================================
   API PEDIDOS
   ====================================================== */

// Precio que se cobra por un producto: el de lista con su descuento (%) aplicado.
// Mismo redondeo que muestra el catálogo (index.js → precioEfectivo). Es la única regla de precio del servidor.
function precioFinal(producto) {
  const precio    = Number(producto.precio);
  const descuento = Number(producto.descuento) || 0;
  return descuento > 0 ? Math.round(precio * (1 - descuento / 100)) : precio;
}

// "Hoy" en Argentina como Date de calendario (medianoche local del servidor), para operar con fechas.js.
// El servidor puede correr en UTC: a las 22 h de Argentina, su "hoy" ya sería mañana.
function hoyArgentina() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date()); // 'YYYY-MM-DD'
  return fechas.parseFechaLocal(iso);
}

const CANTIDAD_MAXIMA_POR_PLATO = 100;

// Valores permitidos (lista cerrada) y largo máximo de lo que manda el formulario público
const METODOS_PAGO  = ['Efectivo', 'Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Mixto'];
const TIPOS_ENTREGA = ['Delivery', 'Retiro en local'];
const LARGO_MAXIMO_PEDIDO = [
  ['cliente_nombre',    'El nombre',        100],
  ['cliente_direccion', 'La dirección',     200],
  ['cliente_telefono',  'El teléfono',       30],
  ['observaciones',     'Las observaciones', 500]
];
const ID_CONSUMIDOR_FINAL = 'd9b1ae00-fda5-4488-86b3-90d769b47a02'; // usuario "Consumidor Final" de los pedidos sin login

// POST /api/pedidos → crea un pedido. Es público (lo usa el formulario sin login).
// El navegador solo dice qué productos y cuántos: los precios y el total los calcula el servidor
// (se ignora el "total" del body), y la fecha de entrega tiene que respetar las 48 hs hábiles.
app.post('/api/pedidos', limitePedidos, async (req, res) => {
  const {
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

  // 1. Renglones: producto (entero) y cantidad (entero entre 1 y 100)
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido no tiene platos' });
  }
  for (const item of items) {
    const cantidad = Number(item?.cantidad);
    if (!Number.isInteger(Number(item?.producto_id))) {
      return res.status(400).json({ error: 'Hay un plato con un identificador inválido' });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAXIMA_POR_PLATO) {
      return res.status(400).json({ error: `La cantidad de cada plato tiene que ser un número entero entre 1 y ${CANTIDAD_MAXIMA_POR_PLATO}` });
    }
  }

  // Datos del cliente, método de pago y tipo de entrega: valores conocidos y largo máximo
  if (!METODOS_PAGO.includes(metodo_pago)) {
    return res.status(400).json({ error: 'Método de pago inválido' });
  }
  if (tipo_entrega != null && !TIPOS_ENTREGA.includes(tipo_entrega)) {
    return res.status(400).json({ error: 'Tipo de entrega inválido' });
  }
  for (const [campo, nombre, maximo] of LARGO_MAXIMO_PEDIDO) {
    const valor = req.body[campo];
    if (valor != null && (typeof valor !== 'string' || valor.length > maximo)) {
      return res.status(400).json({ error: `${nombre} admite hasta ${maximo} caracteres` });
    }
  }

  // 2. Fecha de entrega: obligatoria, día hábil y al menos 48 hs hábiles después de hoy (misma regla que el formulario)
  if (!fecha_entrega || !FORMATO_FECHA.test(fecha_entrega)) {
    return res.status(400).json({ error: 'La fecha de entrega es obligatoria (formato AAAA-MM-DD)' });
  }
  const entrega = fechas.parseFechaLocal(fecha_entrega);
  const primeraFecha = fechas.fechaLocalISO(fechas.sumarDiasHabiles(hoyArgentina(), 2));
  if (!fechas.esDiaHabil(entrega)) {
    return res.status(400).json({ error: 'La fecha de entrega tiene que ser un día hábil (de lunes a viernes, sin feriados)' });
  }
  if (fecha_entrega < primeraFecha) {
    return res.status(400).json({
      error: `La primera fecha de entrega disponible es el ${fechas.fechaDDMMAAAA(fechas.parseFechaLocal(primeraFecha))} (48 hs hábiles)`
    });
  }

  // 3. Productos: tienen que existir, estar activos y tener precio
  const productoIds = [...new Set(items.map(item => Number(item.producto_id)))];
  const { data: productosDB, error: errorProductos } = await supabase
    .from('productos')
    .select('id, nombre, precio, descuento, activo')
    .in('id', productoIds);

  if (errorProductos) return errorInterno(res, errorProductos);

  const productoPorId = {};
  (productosDB || []).forEach(p => { productoPorId[p.id] = p; });

  for (const id of productoIds) {
    const producto = productoPorId[id];
    if (!producto) {
      return res.status(400).json({ error: `El producto ${id} no existe` });
    }
    if (!producto.activo) {
      return res.status(400).json({ error: `El plato "${producto.nombre}" ya no está disponible. Sacalo del carrito y volvé a intentar.` });
    }
    if (producto.precio == null) {
      return res.status(400).json({ error: `El plato "${producto.nombre}" no tiene precio cargado` });
    }
  }

  // 4. Precios y total calculados acá (se ignora el total del navegador)
  const renglones = items.map(item => {
    const producto = productoPorId[Number(item.producto_id)];
    const cantidad = Number(item.cantidad);
    const precio_unitario = precioFinal(producto);
    return { producto, cantidad, precio_unitario };
  });
  const total = renglones.reduce((suma, r) => suma + r.cantidad * r.precio_unitario, 0);

  // 5. Guardar el pedido y sus renglones
  // El usuario sale del token si el cliente está logueado; si no, "Consumidor Final". Nunca del body.
  const finalUserId = leerToken(req)?.id || ID_CONSUMIDOR_FINAL;

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
    return errorInterno(res, errorPedido);
  }

  const { error: errorItems } = await supabase
    .from('pedido_detalles')
    .insert(renglones.map(r => ({
      id_pedido:       pedido.id,
      id_producto:     r.producto.id,
      cantidad:        r.cantidad,
      precio_unitario: r.precio_unitario
    })));

  if (errorItems) {
    // Sin renglones el pedido no sirve: se borra para no dejar un pedido vacío
    await supabase.from('pedidos').delete().eq('id', pedido.id);
    return errorInterno(res, errorItems);
  }

  res.json({
    mensaje: 'Pedido creado correctamente',
    pedido,
    total,
    // Los renglones con el precio que se cobró (para el resumen de WhatsApp)
    items: renglones.map(r => ({
      producto_id:     r.producto.id,
      nombre:          r.producto.nombre,
      cantidad:        r.cantidad,
      precio_unitario: r.precio_unitario,
      subtotal:        r.cantidad * r.precio_unitario
    }))
  });
});

// GET /api/pedidos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD → pedidos, opcionalmente filtrados por fecha_pedido.
// Sin parámetros devuelve todos (lo usa Consultar Pedidos). Los días son de Argentina (UTC-3, sin horario
// de verano): fecha_pedido está en UTC, y un pedido de las 22 h del 30/09 es 01:00 UTC del 01/10.
const OFFSET_ARGENTINA = '-03:00';
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/pedidos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { desde, hasta } = req.query;
  if ((desde && !FORMATO_FECHA.test(desde)) || (hasta && !FORMATO_FECHA.test(hasta))) {
    return res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD' });
  }

  let query = supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      fecha_entrega,
      total,
      metodo_pago,
      monto_efectivo,
      monto_transferencia,
      monto_tarjeta,
      pago_anticipado,
      pagado,
      transferencia_confirmada,
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

  if (desde) query = query.gte('fecha_pedido', `${desde}T00:00:00${OFFSET_ARGENTINA}`);
  if (hasta) query = query.lte('fecha_pedido', `${hasta}T23:59:59.999${OFFSET_ARGENTINA}`);

  const { data, error } = await query;

  if (error) {
    return errorInterno(res, error);
  }

  res.json(data);
});

// pagado = true significa que el pedido está TOTALMENTE cobrado.
// En un Mixto eso requiere que la transferencia ya esté confirmada (la marca el admin al pasarlo a
// En Preparación); el repartidor completa el cobro del efectivo con el botón Cobrado de Envíos.
app.put('/api/pedidos/:id/pagado', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const { id } = req.params;
  const { pagado } = req.body;

  if (pagado) {
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, metodo_pago, transferencia_confirmada')
      .eq('id', id)
      .maybeSingle();

    if (errLectura) return errorInterno(res, errLectura);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.metodo_pago === 'Mixto' && !pedido.transferencia_confirmada) {
      return res.status(409).json({
        error: 'No se puede marcar como cobrado: la transferencia de este pedido Mixto todavía no fue confirmada. Confirmala desde Consultar Pedidos.'
      });
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ pagado: Boolean(pagado) })
    .eq('id', id)
    .select()
    .single();

  if (error) return errorInterno(res, error);
  res.json({ mensaje: 'Pago actualizado', pedido: data });
});

// PUT /api/pedidos/:id/transferencia-confirmada → en un Mixto, registra que la parte por
// transferencia ya llegó. No toca pagado: el efectivo se cobra al entregar.
app.put('/api/pedidos/:id/transferencia-confirmada', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  const { data: pedido, error: errLectura } = await supabase
    .from('pedidos')
    .select('id, metodo_pago')
    .eq('id', id)
    .maybeSingle();

  if (errLectura) return errorInterno(res, errLectura);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.metodo_pago !== 'Mixto') {
    return res.status(409).json({ error: 'Solo los pedidos con pago Mixto tienen una transferencia para confirmar.' });
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ transferencia_confirmada: true })
    .eq('id', id)
    .select()
    .single();

  if (error) return errorInterno(res, error);
  res.json({ mensaje: 'Transferencia confirmada', pedido: data });
});

// Método de pago del pedido: Efectivo, Transferencia, Tarjeta Débito, Tarjeta Crédito o Mixto
// (Mixto = efectivo + transferencia, sin tarjeta).
// Los montos se calculan / validan contra el total guardado en la base, no contra el que manda el front.
// Siempre se escriben los tres montos (los que no corresponden en 0) para que no queden valores
// viejos al cambiar de método. pago_anticipado solo puede ser true con Efectivo.
app.put('/api/pedidos/:id/pago', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const id = parseInt(req.params.id);
  const { metodo_pago, monto_efectivo, monto_transferencia, monto_tarjeta, pago_anticipado } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  if (!METODOS_PAGO.includes(metodo_pago)) {
    return res.status(400).json({ error: 'Método de pago inválido. Debe ser Efectivo, Transferencia, Tarjeta Débito, Tarjeta Crédito o Mixto.' });
  }

  const { data: pedido, error: errLectura } = await supabase
    .from('pedidos')
    .select('id, total')
    .eq('id', id)
    .maybeSingle();

  if (errLectura) return errorInterno(res, errLectura);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  // Se trabaja en centavos para no arrastrar errores de redondeo (0.1 + 0.2 !== 0.3)
  const aCentavos = n => Math.round(Number(n) * 100);
  const totalCent = aCentavos(pedido.total);
  let efectivoCent      = 0;
  let transferenciaCent = 0;
  let tarjetaCent       = 0;

  if (metodo_pago === 'Efectivo') {
    efectivoCent = totalCent;
  } else if (metodo_pago === 'Transferencia') {
    transferenciaCent = totalCent;
  } else if (metodo_pago === 'Tarjeta Débito' || metodo_pago === 'Tarjeta Crédito') {
    tarjetaCent = totalCent;
  } else {
    // Mixto: solo efectivo + transferencia. La tarjeta no entra en el pago mixto.
    if (aCentavos(monto_tarjeta ?? 0) !== 0) {
      return res.status(400).json({ error: 'El pago mixto solo puede combinar efectivo y transferencia (sin tarjeta).' });
    }

    efectivoCent      = aCentavos(monto_efectivo);
    transferenciaCent = aCentavos(monto_transferencia);

    if (!Number.isFinite(efectivoCent) || !Number.isFinite(transferenciaCent) || efectivoCent <= 0 || transferenciaCent <= 0) {
      return res.status(400).json({ error: 'En el pago mixto, los montos en efectivo y en transferencia deben ser mayores a 0.' });
    }
    if (efectivoCent + transferenciaCent !== totalCent) {
      return res.status(400).json({
        error: `La suma de los montos ($${(efectivoCent + transferenciaCent) / 100}) debe ser igual al total del pedido ($${totalCent / 100}).`
      });
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({
      metodo_pago,
      monto_efectivo:      efectivoCent / 100,
      monto_transferencia: transferenciaCent / 100,
      monto_tarjeta:       tarjetaCent / 100,
      pago_anticipado:     metodo_pago === 'Efectivo' && pago_anticipado === true
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // 23514 = violación de un CHECK: la base todavía no acepta este valor de metodo_pago
    if (error.code === '23514') {
      return res.status(400).json({
        error: `La base de datos no acepta el método "${metodo_pago}". Hay que actualizar la restricción (CHECK) de metodo_pago en la tabla pedidos.`
      });
    }
    return errorInterno(res, error);
  }
  res.json({ mensaje: 'Método de pago actualizado', pedido: data });
});

// Cambia el estado de un pedido. La usan PUT /estado (admin) y PUT /listo-cocinero (cocina).
// Al pasar a 2 verifica que alcance el stock, sin descontar: si no alcanza, no se cambia nada y
// devuelve status 409. Al pasar a 3 o 4 descuenta el stock (idempotente, ver descontarStockPedido),
// con el mismo 409 si falla. Al pasar a 3 marca todos los platos como listos.
// Devuelve { status, pedido } o { status, error }.
async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
  if (nuevoEstado === 2) {
    const errorStock = await verificarStockPedido(pedidoId);
    if (errorStock) return { status: 409, error: errorStock };
  }

  if ([3, 4].includes(nuevoEstado)) {
    const errorStock = await descontarStockPedido(pedidoId);
    if (errorStock) return { status: 409, error: errorStock };
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ id_estado: nuevoEstado })
    .eq('id', pedidoId)
    .select()
    .single();

  if (error) return { status: 500, error: mensajeInterno(error) };

  if (nuevoEstado === 3) {
    const { error: errListo } = await supabase
      .from('pedido_detalles')
      .update({ listo: true })
      .eq('id_pedido', pedidoId);

    // El estado ya cambió, que es lo importante: el pedido sale de cocina igual. Solo se registra.
    if (errListo) console.error('[ESTADO] no se pudieron marcar los platos como listos:', errListo);
  }

  return { status: 200, pedido: data };
}

// GET /api/pedidos/:id/verificar-stock → ¿alcanza el stock para preparar el pedido? Solo lee.
// La usa la grilla antes de abrir "Confirmar Pago", para no pedir la confirmación si igual no puede pasar a 2.
app.get('/api/pedidos/:id/verificar-stock', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  const { data: pedido, error: errLectura } = await supabase
    .from('pedidos')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (errLectura) return errorInterno(res, errLectura);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const errorStock = await verificarStockPedido(id);
  res.json(errorStock ? { ok: false, error: errorStock } : { ok: true });
});

app.put('/api/pedidos/:pedidoId/estado', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const { pedidoId } = req.params;
  const { estado_id } = req.body;
  const nuevoEstado = parseInt(estado_id);

  // Cancelar (5) solo se puede por POST /anular, que pide el PIN
  if (nuevoEstado === 5) {
    return res.status(403).json({ error: 'Para cancelar un pedido usá "Anular", que pide el PIN de autorización' });
  }

  // El repartidor (rol 3) solo puede marcar un pedido como Entregado (4)
  if (req.usuario.rol === 3 && nuevoEstado !== 4) {
    return res.status(403).json({ error: 'El repartidor solo puede marcar un pedido como Entregado' });
  }

  try {
    // Verificar que el pedido existe
    const { data: pedidoActual, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, id_estado')
      .eq('id', pedidoId)
      .single();

    if (errLectura) return errorInterno(res, errLectura);
    if (!pedidoActual) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const resultado = await cambiarEstadoPedido(pedidoId, nuevoEstado);
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

    res.json({ mensaje: 'Estado actualizado', pedido: resultado.pedido });
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/pedidos/:id/listo-cocinero → el cocinero logueado marca SUS platos del pedido como listos.
// El cocinero sale del JWT, no del body. Cuando todos los platos del pedido quedan listos, el pedido
// pasa a 3 (Listo para Entregar) con la misma lógica que usa el admin, incluido el descuento de stock.
// Si falta stock, los platos quedan listos, el pedido sigue en 2 y se avisa (lo resuelve el admin).
app.put('/api/pedidos/:id/listo-cocinero', requireAuth, requireRol(2, 6, 5, 1), async (req, res) => {
  const id = parseInt(req.params.id);
  const cocineroId = req.usuario.id;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  try {
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select(`
        id,
        id_estado,
        pedido_detalles (
          id,
          listo,
          productos ( id_cocinero, planes ( id_cocinero, id_cocinero_suplente ) )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (errLectura) return errorInterno(res, errLectura);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.id_estado !== 2) {
      return res.status(409).json({ error: 'El pedido ya no está En Preparación' });
    }

    const detalles = pedido.pedido_detalles || [];
    const mios = detalles.filter(d => d.productos && platoEsDelCocinero(d.productos, cocineroId));
    if (mios.length === 0) {
      return res.status(403).json({ error: 'No tenés platos asignados en este pedido' });
    }

    const { error: errListo } = await supabase
      .from('pedido_detalles')
      .update({ listo: true })
      .in('id', mios.map(d => d.id));

    if (errListo) return errorInterno(res, errListo);

    // Platos de otros cocineros que todavía no están listos
    const idsMios = new Set(mios.map(d => d.id));
    const pendientes = detalles.filter(d => !idsMios.has(d.id) && !d.listo).length;

    if (pendientes > 0) {
      return res.json({
        completo: false,
        platos_pendientes: pendientes,
        mensaje: 'Tus platos quedaron listos. Faltan platos de otros cocineros.'
      });
    }

    const resultado = await cambiarEstadoPedido(id, 3);

    if (resultado.status === 409) {
      return res.status(409).json({
        completo: false,
        platos_listos: true,
        error: resultado.error,
        mensaje: 'Tus platos quedaron listos, pero el pedido no pudo pasar a Listo para Entregar por falta de stock. Avisale al administrador.'
      });
    }
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error, platos_listos: true });

    res.json({
      completo: true,
      mensaje: 'Pedido completo, pasó a Listo para Entregar.',
      pedido: resultado.pedido
    });
  } catch (e) {
    errorInterno(res, e);
  }
});

// Anular pedido: no se borra, se pasa a estado 5 (Cancelado).
// Requiere el PIN de autorización configurado en .env (ADMIN_PIN); se valida acá, nunca en el front.
app.post('/api/pedidos/:id/anular', limiteAnular, requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const id = parseInt(req.params.id);
  const pin = String(req.body?.pin ?? '');

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de pedido inválido' });
  }

  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) {
    console.error('[ANULAR pedido] falta ADMIN_PIN en el .env');
    return res.status(500).json({ error: 'El PIN de autorización no está configurado en el servidor' });
  }

  // Comparación en tiempo constante para no filtrar información por el tiempo de respuesta
  const a = Buffer.from(pin);
  const b = Buffer.from(adminPin);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'PIN incorrecto' });
  }

  const { data: pedido, error: errLectura } = await supabase
    .from('pedidos')
    .select('id, id_estado')
    .eq('id', id)
    .maybeSingle();

  if (errLectura) return errorInterno(res, errLectura);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.id_estado === 5) {
    return res.status(409).json({ error: 'El pedido ya está anulado' });
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ id_estado: 5 })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[ANULAR pedido] error:', error);
    return errorInterno(res, error);
  }

  res.json({ mensaje: 'Pedido anulado correctamente', pedido: data });
});

/* ======================================================
   API COCINEROS / ASIGNACIÓN A PLANES
   ====================================================== */

app.get('/api/cocineros', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido')
    .eq('id_rol', 2)
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);
  res.json(data || []);
});

app.get('/api/planes/cocineros', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data: planes, error: errorPlanes } = await supabase
    .from('planes')
    .select('id, nombre, activo, id_cocinero, id_cocinero_suplente, categorias(nombre)')
    .order('nombre', { ascending: true });

  if (errorPlanes) return errorInterno(res, errorPlanes);

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

app.put('/api/planes/:id/cocinero', requireAuth, requireRol(6, 5), async (req, res) => {
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

  if (error) return errorInterno(res, error);
  res.json({ mensaje: 'Cocinero actualizado correctamente', plan: data });
});

/* ======================================================
   API COCINEROS / ASIGNACIÓN POR PLATO
   Cada plato puede tener su cocinero (productos.id_cocinero).
   Si no tiene, se usa el principal de su plan como respaldo.
   ====================================================== */

// GET /api/productos/cocineros → platos activos con su cocinero propio y el efectivo
app.get('/api/productos/cocineros', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, codigo_plato, nombre, id_cocinero, planes ( id, nombre, id_cocinero, id_cocinero_suplente )')
    .eq('activo', true);

  if (error) return errorInterno(res, error);

  const { data: usuarios, error: errUsuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido, id_rol');

  if (errUsuarios) return errorInterno(res, errUsuarios);

  const mapaUsuarios = {};
  (usuarios || []).forEach(u => {
    mapaUsuarios[u.id] = { id: u.id, nombre: u.nombre, apellido: u.apellido, es_cocinero: u.id_rol === 2 };
  });
  const usuario = id => (id ? (mapaUsuarios[id] || null) : null);

  const resultado = (productos || []).map(p => {
    const cocinero     = usuario(p.id_cocinero);
    const cocineroPlan = usuario(p.planes?.id_cocinero);
    return {
      id:            p.id,
      codigo_plato:  p.codigo_plato,
      nombre:        p.nombre,
      plan:          p.planes ? { id: p.planes.id, nombre: p.planes.nombre } : null,
      id_cocinero:   p.id_cocinero,
      cocinero,                                   // el asignado al plato (o null)
      cocinero_plan: cocineroPlan,                // el principal del plan (respaldo)
      cocinero_efectivo: cocinero || cocineroPlan,
      origen: cocinero ? 'producto' : (cocineroPlan ? 'plan' : null)
    };
  });

  // Orden: por plan y, dentro del plan, por código (numérico si se puede: 2 antes que 10)
  resultado.sort((a, b) =>
    (a.plan?.nombre || '').localeCompare(b.plan?.nombre || '', 'es') ||
    String(a.codigo_plato || '').localeCompare(String(b.codigo_plato || ''), 'es', { numeric: true })
  );

  res.json(resultado);
});

// Valida que idCocinero sea un usuario existente con rol cocinero (2).
// Devuelve null si está bien, o { status, error } para responder.
// La usan PUT /api/productos/:id/cocinero y POST /api/productos/con-receta.
async function validarCocinero(idCocinero) {
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, id_rol')
    .eq('id', idCocinero)
    .maybeSingle();

  // 22P02 = el texto no es un UUID válido
  if (error && error.code !== '22P02') return { status: 500, error: mensajeInterno(error) };
  if (!usuario || usuario.id_rol !== 2) return { status: 400, error: 'El usuario elegido no es un cocinero' };
  return null;
}

// PUT /api/productos/:id/cocinero → asignar (o quitar, con null) el cocinero de un plato
app.put('/api/productos/:id/cocinero', requireAuth, requireRol(6, 5), async (req, res) => {
  const id = parseInt(req.params.id);
  const idCocinero = req.body?.id_cocinero || null;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID de producto inválido' });
  }

  // Si se asigna alguien, tiene que existir y ser cocinero (rol 2)
  if (idCocinero) {
    const invalido = await validarCocinero(idCocinero);
    if (invalido) return res.status(invalido.status).json({ error: invalido.error });
  }

  const { data, error } = await supabase
    .from('productos')
    .update({ id_cocinero: idCocinero })
    .eq('id', id)
    .select('id, codigo_plato, nombre, id_cocinero')
    .maybeSingle();

  if (error) return errorInterno(res, error);
  if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

  res.json({ mensaje: 'Cocinero del plato actualizado', producto: data });
});

/* ======================================================
   API ESTADOS
   ====================================================== */

app.get('/api/estados', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const { data, error } = await supabase
    .from('estados')
    .select('id, nombre')
    .order('id', { ascending: true });

  if (error) {
    return errorInterno(res, error);
  }

  res.json(data);
});
/* ======================================================
   API STOCK
   ====================================================== */
app.get('/api/insumos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { data, error } = await supabase
    .from('insumos')
    .select(`
      id, nombre, stock_actual, stock_minimo, unidad_medida, 
      fecha_ingreso, fecha_caducidad, activo,
      categorias_insumos ( nombre )
    `)
    .order('nombre', { ascending: true });

  if (error) {
    return errorInterno(res, error);
  }

  res.json(data);
});

app.post('/api/insumos', requireAuth, requireRol(6, 5), async (req, res) => {
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
    return errorInterno(res, error);
  }

  res.json({ mensaje: 'Insumo creado correctamente', insumo: data });
});
app.put('/api/insumos/:id', requireAuth, requireRol(6, 5), async (req, res) => {
  const { id } = req.params;
  const { stock_actual, nombre, stock_minimo, unidad_medida, id_categoria_insumo } = req.body;

  // Solo se actualizan los campos que llegan en el body
  const updatePayload = {};
  if (stock_actual         !== undefined) updatePayload.stock_actual         = stock_actual;
  if (nombre                !== undefined) updatePayload.nombre               = nombre;
  if (stock_minimo          !== undefined) updatePayload.stock_minimo         = stock_minimo;
  if (unidad_medida         !== undefined) updatePayload.unidad_medida        = unidad_medida;
  if (id_categoria_insumo   !== undefined) updatePayload.id_categoria_insumo  = id_categoria_insumo;

  try {
    const { data, error } = await supabase
      .from('insumos')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar insumo:', error);
      return errorInterno(res, error);
    }

    res.json({ mensaje: 'Insumo actualizado', insumo: data });
  } catch (e) {
    console.error('Excepción al actualizar insumo:', e);
    errorInterno(res, e);
  }
});

// DELETE /api/insumos/:id → eliminar insumo (si no tiene referencias en recetas/movimientos)
app.delete('/api/insumos/:id', requireAuth, requireRol(6, 5), async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('insumos')
      .delete()
      .eq('id', id);

    if (error) {
      // 23503 = foreign_key_violation (Postgres): el insumo está referenciado
      // desde producto_insumo (recetas) o movimientos_stock.
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'No se puede eliminar el insumo porque está siendo utilizado en una receta o tiene movimientos registrados.'
        });
      }
      console.error('Error al eliminar insumo:', error);
      return errorInterno(res, error);
    }

    res.json({ mensaje: 'Insumo eliminado correctamente' });
  } catch (e) {
    console.error('Excepción al eliminar insumo:', e);
    errorInterno(res, e);
  }
});

app.get('/api/categorias-insumos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { data, error } = await supabase
    .from('categorias_insumos')
    .select('id, nombre')
    .order('nombre', { ascending: true });
  if (error) return errorInterno(res, error);
  res.json(data);
});
/* ======================================================
   API RECETAS
   ====================================================== */

// GET /api/recetas → productos que tienen receta, con sus insumos
app.get('/api/recetas', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      id_producto:id,
      nombre_producto:nombre,
      codigo_plato,
      precio,
      descuento,
      imagen,
      id_cocinero,
      cocinero:usuarios!id_cocinero ( nombre, apellido ),
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

  if (error) return errorInterno(res, error);

  // Solo productos que tienen al menos un insumo en la receta
  const conReceta = data.filter(p => p.insumos && p.insumos.length > 0);

  const resultado = conReceta.map(p => ({
    id_producto:     p.id_producto,
    nombre_producto: p.nombre_producto,
    codigo_plato:    p.codigo_plato || '-',
    precio:          p.precio    != null ? Number(p.precio)    : null,
    descuento:       p.descuento != null ? Number(p.descuento) : null,
    imagen:          p.imagen || null,
    // Cocinero propio del plato (null = lo ve el cocinero del plan)
    id_cocinero:     p.id_cocinero || null,
    cocinero_nombre: p.cocinero ? [p.cocinero.nombre, p.cocinero.apellido].filter(Boolean).join(' ') : null,
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
app.post('/api/recetas', requireAuth, requireRol(6, 5), async (req, res) => {
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

    if (errProd) return errorInterno(res, errProd);
  }

  // 2. Borrar la receta anterior del producto (si existe)
  const { error: errorDelete } = await supabase
    .from('producto_insumo')
    .delete()
    .eq('id_producto', id_producto);

  if (errorDelete) return errorInterno(res, errorDelete);

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

  if (errorInsert) return errorInterno(res, errorInsert);

  res.json({ mensaje: 'Receta guardada correctamente' });
});

// DELETE /api/recetas/:idProducto → borrar receta de un producto y desactivarlo
// El producto NO se borra (soft delete) para no dejar pedidos históricos con id_producto huérfano
app.delete('/api/recetas/:idProducto', requireAuth, requireRol(6, 5), async (req, res) => {
  const { idProducto } = req.params;

  const { error } = await supabase
    .from('producto_insumo')
    .delete()
    .eq('id_producto', idProducto);

  if (error) return errorInterno(res, error);

  // Desactivar el producto para que deje de aparecer en el catálogo
  const { error: errProd } = await supabase
    .from('productos')
    .update({ activo: false })
    .eq('id', idProducto);

  if (errProd) return errorInterno(res, errProd);

  res.json({ mensaje: 'Receta eliminada y producto desactivado correctamente' });
});

// POST /api/productos/:id/imagen → sube/reemplaza la imagen de un producto en Supabase Storage
// Body: { imagen_base64, tipo } — tipo debe ser image/jpeg, image/png o image/webp
const BUCKET_IMAGENES_PRODUCTOS = 'imagenes-productos';
const EXTENSIONES_IMAGEN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TAMANIO_MAX_IMAGEN = 2 * 1024 * 1024; // 2MB

app.post('/api/productos/:id/imagen', requireAuth, requireRol(6, 5), async (req, res) => {
  const { id } = req.params;
  const { imagen_base64, tipo } = req.body;

  if (!imagen_base64 || !tipo) {
    return res.status(400).json({ error: 'imagen_base64 y tipo son requeridos' });
  }

  const extension = EXTENSIONES_IMAGEN[tipo];
  if (!extension) {
    return res.status(400).json({ error: 'Formato de imagen no soportado. Usá JPG, PNG o WebP.' });
  }

  try {
    const buffer = Buffer.from(imagen_base64, 'base64');

    if (buffer.length > TAMANIO_MAX_IMAGEN) {
      return res.status(400).json({ error: 'La imagen supera el tamaño máximo permitido (2MB).' });
    }

    // Mismo path por producto: el upsert reemplaza el archivo anterior en Storage
    const rutaArchivo = `productos/${id}.${extension}`;

    const { error: errSubida } = await supabase.storage
      .from(BUCKET_IMAGENES_PRODUCTOS)
      .upload(rutaArchivo, buffer, { contentType: tipo, upsert: true });

    if (errSubida) {
      console.error('Error al subir imagen a Supabase Storage:', errSubida);
      return res.status(500).json({ error: 'No se pudo subir la imagen. Intentá de nuevo.' });
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_IMAGENES_PRODUCTOS)
      .getPublicUrl(rutaArchivo);

    // Cache-busting: al reemplazar la imagen en el mismo path, el navegador/CDN
    // podría seguir mostrando la versión vieja sin este parámetro.
    const urlPublica = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: errUpdate } = await supabase
      .from('productos')
      .update({ imagen: urlPublica })
      .eq('id', id);

    if (errUpdate) return errorInterno(res, errUpdate);

    res.json({ mensaje: 'Imagen actualizada correctamente', imagen: urlPublica });
  } catch (e) {
    console.error('Excepción al subir imagen:', e);
    errorInterno(res, e);
  }
});

/* ======================================================
   API MOVIMIENTOS DE STOCK
   ====================================================== */

// GET /api/movimientos-stock → listar todos los movimientos
app.get('/api/movimientos-stock', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select(`
      id, tipo, cantidad, unidad, motivo, fecha, id_movimiento_vianda,
      insumos ( id, nombre, unidad_medida ),
      movimientos_viandas ( cantidad, motivo, productos ( nombre, planes ( nombre ) ), usuarios ( nombre, apellido ),
                            orden_produccion_detalles ( id_orden_produccion ) )
    `)
    .order('fecha', { ascending: false });

  if (error) return errorInterno(res, error);
  res.json(data);
});

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

// POST /api/movimientos-stock → registrar entrada o salida, actualiza stock_actual
app.post('/api/movimientos-stock', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { id_insumo, tipo, cantidad, unidad, motivo, fecha, costo_unitario } = req.body;

  if (!id_insumo || !tipo || !cantidad) {
    return res.status(400).json({ error: 'id_insumo, tipo y cantidad son requeridos' });
  }

  try {
    const { data: insumo, error: errInsumo } = await supabase
      .from('insumos')
      .select('id, stock_actual, unidad_medida')
      .eq('id', id_insumo)
      .single();

    if (errInsumo || !insumo) {
      return res.status(404).json({ error: 'Insumo no encontrado' });
    }

    const conversion = convertirACantidadBase(cantidad, unidad, insumo.unidad_medida);
    if (conversion.error) return res.status(400).json({ error: conversion.error });
    const cantidadBase = conversion.cantidadBase;

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

    if (errMov) return errorInterno(res, errMov);

    // Actualizar únicamente el stock; la unidad de medida del insumo
    // es fija y solo se edita desde Alta/Gestión de Insumos.
    const { error: errUpdate } = await supabase
      .from('insumos')
      .update({ stock_actual: nuevoStock })
      .eq('id', id_insumo);

    if (errUpdate) return errorInterno(res, errUpdate);

    res.json({ mensaje: 'Movimiento registrado', movimiento });
  } catch (e) {
    errorInterno(res, e);
  }
});

// DELETE /api/movimientos-stock/:id → eliminar movimiento y revertir stock
app.delete('/api/movimientos-stock/:id', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: mov, error: errMov } = await supabase
      .from('movimientos_stock')
      .select('id, id_insumo, tipo, cantidad, unidad, id_movimiento_vianda')
      .eq('id', id)
      .single();

    if (errMov || !mov) return res.status(404).json({ error: 'Movimiento no encontrado' });

    // Las salidas de una tanda de viandas no se borran sueltas: el insumo volvería
    // al stock pero las viandas seguirían en la heladera
    if (mov.id_movimiento_vianda) {
      return res.status(409).json({ error: 'Esta salida pertenece a una tanda de viandas y no se puede borrar desde acá' });
    }

    const { data: insumo, error: errInsumo } = await supabase
      .from('insumos')
      .select('id, stock_actual, unidad_medida')
      .eq('id', mov.id_insumo)
      .single();

    if (errInsumo || !insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    const conversion = convertirACantidadBase(mov.cantidad, mov.unidad, insumo.unidad_medida);
    if (conversion.error) return res.status(400).json({ error: conversion.error });
    const cantidadBase = conversion.cantidadBase;

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

    if (errDelete) return errorInterno(res, errDelete);

    const { error: errUpdate } = await supabase
      .from('insumos')
      .update({ stock_actual: nuevoStock })
      .eq('id', mov.id_insumo);

    if (errUpdate) return errorInterno(res, errUpdate);

    res.json({ mensaje: 'Movimiento eliminado y stock revertido' });
  } catch (e) {
    errorInterno(res, e);
  }
});

/* ======================================================
   API STOCK DE VIANDAS (PRODUCCIÓN)
   Viandas ya cocinadas guardadas en stock (productos.stock_heladera).
   El descarte (sql/stock_viandas_funciones.sql) y los pedidos a cocina
   (sql/Produccion.sql) se hacen en funciones de la base, en una sola transacción.
   ====================================================== */

const ROLES_HELADERA = [6, 5, 1, 2]; // administradores, dueño y cocinero
const LARGO_MAXIMO_MOTIVO_VIANDA = 200;
const ENTERO_MAXIMO_BASE = 2147483647; // tope de una columna integer de Postgres

const MAXIMO_PLATOS_PEDIDO = 100;

// Cantidad de viandas: entero mayor a 0 (o mayor o igual a 0 si permitirCero).
// Devuelve el número, o null si no es válida.
function leerCantidadViandas(valor, permitirCero) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  if (String(valor).trim() === '') return null;
  const cantidad = Number(valor);
  let minimo = 1;
  if (permitirCero) minimo = 0;
  if (!Number.isInteger(cantidad) || cantidad < minimo || cantidad > ENTERO_MAXIMO_BASE) return null;
  return cantidad;
}

// Lista de platos de un pedido a cocina: [{ id_producto, cantidad }], con cantidad entera >= 0 y al menos una > 0.
// Suma los platos repetidos y saca los que quedan en 0.
// Devuelve { items } (ordenados por id_producto) o { error }.
function leerItemsViandas(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'La lista de platos está vacía' };
  }
  if (items.length > MAXIMO_PLATOS_PEDIDO) {
    return { error: `Un pedido admite hasta ${MAXIMO_PLATOS_PEDIDO} platos` };
  }

  const cantidadPorPlato = {};
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { error: 'La lista de platos es inválida' };
    }
    const idProducto = Number(item.id_producto);
    if (!Number.isInteger(idProducto) || idProducto <= 0) {
      return { error: 'Hay un plato con un identificador inválido' };
    }
    const cantidad = leerCantidadViandas(item.cantidad, true);
    if (cantidad === null) {
      return { error: 'Cada cantidad tiene que ser un número entero mayor o igual a 0' };
    }
    cantidadPorPlato[idProducto] = (cantidadPorPlato[idProducto] || 0) + cantidad;
    if (cantidadPorPlato[idProducto] > ENTERO_MAXIMO_BASE) {
      return { error: 'La cantidad de un plato es demasiado grande' };
    }
  }

  const limpios = Object.entries(cantidadPorPlato)
    .map(([id, cantidad]) => ({ id_producto: Number(id), cantidad }))
    .filter(i => i.cantidad > 0)
    .sort((a, b) => a.id_producto - b.id_producto);

  if (limpios.length === 0) {
    return { error: 'Cargá al menos un plato con cantidad mayor a 0' };
  }
  return { items: limpios };
}

// Motivo: texto opcional de hasta 200 caracteres. Devuelve { motivo } o { error }.
function leerMotivoVianda(valor, obligatorio) {
  if (valor == null || (typeof valor === 'string' && valor.trim() === '')) {
    if (obligatorio) return { error: 'El motivo es obligatorio' };
    return { motivo: null };
  }
  if (typeof valor !== 'string' || valor.length > LARGO_MAXIMO_MOTIVO_VIANDA) {
    return { error: `El motivo admite hasta ${LARGO_MAXIMO_MOTIVO_VIANDA} caracteres` };
  }
  return { motivo: valor.trim() };
}

// GET /api/viandas-stock → platos activos con las viandas que hay en stock, su plan y si tienen receta.
// La ventana de pedir arma el select de planes con estos datos (plan_activo), así no hace falta
// permiso sobre /api/planes.
app.get('/api/viandas-stock', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, stock_heladera, stock_minimo, id_plan, planes ( nombre, activo ), producto_insumo ( id_insumo )')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);

  const resultado = (data || []).map(p => {
    let planNombre = null;
    let planActivo = false;
    if (p.planes) {
      planNombre = p.planes.nombre;
      planActivo = Boolean(p.planes.activo);
    }
    return {
      id:             p.id,
      nombre:         p.nombre,
      stock_heladera: Number(p.stock_heladera || 0),
      stock_minimo:   Number(p.stock_minimo || 0),
      id_plan:        p.id_plan,
      plan_nombre:    planNombre,
      plan_activo:    planActivo,
      tiene_receta:   Array.isArray(p.producto_insumo) && p.producto_insumo.length > 0
    };
  });

  res.json(resultado);
});

// POST /api/viandas-stock/descarte → descarta viandas de la heladera (registrar_descarte_vianda).
// Body: { id_producto, cantidad, motivo }. No toca insumos. El usuario sale del token.
app.post('/api/viandas-stock/descarte', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const idProducto = Number(req.body.id_producto);
  if (!Number.isInteger(idProducto)) {
    return res.status(400).json({ error: 'ID de plato inválido' });
  }
  const cantidad = leerCantidadViandas(req.body.cantidad);
  if (cantidad === null) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0' });
  }
  const lecturaMotivo = leerMotivoVianda(req.body.motivo, true);
  if (lecturaMotivo.error) return res.status(400).json({ error: lecturaMotivo.error });

  try {
    const { data, error } = await supabase.rpc('registrar_descarte_vianda', {
      p_id_producto: idProducto,
      p_cantidad:    cantidad,
      p_id_usuario:  req.usuario.id,
      p_motivo:      lecturaMotivo.motivo
    });

    if (error) return errorInterno(res, error);

    if (!data || !data.ok) {
      let mensaje = 'No se pudo registrar el descarte';
      if (data && data.error) mensaje = data.error;
      return res.status(409).json({ error: mensaje });
    }

    res.json({ mensaje: 'Descarte registrado', id_movimiento: data.id_movimiento, stock_heladera: data.stock_heladera });
  } catch (e) {
    errorInterno(res, e);
  }
});

/* ------------------------------------------------------
   PEDIDOS A COCINA (sql/Produccion.sql)
   En la base se llaman órdenes de producción; en pantalla, "pedidos a cocina".
   ------------------------------------------------------ */

const ROLES_PIDEN_COCINA = [6, 5, 1]; // administradores y dueño. El cocinero no pide, cocina.

// Fecha "AAAA-MM-DD" que exista de verdad (rechaza 2026-02-30). Devuelve el texto o null.
// Que no sea anterior a hoy lo controla la base, con la hora de Argentina.
function leerFechaPara(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(valor + 'T00:00:00Z');
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  return valor;
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

// POST /api/ordenes-produccion → crea un pedido a cocina (crear_orden_produccion).
// Body: { fecha_para: 'AAAA-MM-DD', items: [{ id_producto, cantidad }] }. El usuario sale del token.
app.post('/api/ordenes-produccion', requireAuth, requireRol(...ROLES_PIDEN_COCINA), async (req, res) => {
  const fechaPara = leerFechaPara(req.body.fecha_para);
  if (fechaPara === null) {
    return res.status(400).json({ error: 'La fecha del pedido es inválida' });
  }
  const lectura = leerItemsViandas(req.body.items);
  if (lectura.error) return res.status(400).json({ error: lectura.error });

  try {
    const { data, error } = await supabase.rpc('crear_orden_produccion', {
      p_id_usuario: req.usuario.id,
      p_fecha_para: fechaPara,
      p_items:      lectura.items
    });

    if (error) return errorInterno(res, error);

    // ok: false = no se guardó nada (fecha pasada, plato inactivo, etc.)
    if (!data || !data.ok) {
      let mensaje = 'No se pudo crear el pedido a cocina';
      if (data && data.error) mensaje = data.error;
      return res.status(400).json({ error: mensaje });
    }

    res.json({ mensaje: 'Pedido a cocina creado', id_orden: data.id_orden });
  } catch (e) {
    errorInterno(res, e);
  }
});

// GET /api/ordenes-produccion/pendientes → platos pedidos a cocina que todavía no están hechos.
// Un cocinero (rol 2) ve los que le tocan según platoEsDelCocinero (cocinero del plato o, si no tiene,
// principal o suplente del plan) y los que no tienen a nadie. El id_cocinero del detalle es solo para mostrar.
app.get('/api/ordenes-produccion/pendientes', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const { data, error } = await supabase
    .from('orden_produccion_detalles')
    .select(`
      id, cantidad, id_cocinero,
      ordenes_produccion ( id, fecha_para ),
      productos ( nombre, id_cocinero, planes ( nombre, id_cocinero, id_cocinero_suplente ) ),
      cocinero:usuarios!id_cocinero ( nombre, apellido )
    `)
    .eq('hecho', false);

  if (error) return errorInterno(res, error);

  // El filtro del cocinero se hace en JS, igual que en /api/cocina/tareas
  let detalles = data || [];
  if (Number(req.usuario.rol) === 2) {
    detalles = detalles.filter(d => d.productos && platoVisibleParaCocinero(d.productos, req.usuario.id));
  }

  const resultado = detalles.map(d => {
    let plato = null;
    let plan = null;
    if (d.productos) {
      plato = d.productos.nombre;
      if (d.productos.planes) plan = d.productos.planes.nombre;
    }
    let cocinero = null;
    if (d.cocinero) cocinero = `${d.cocinero.nombre || ''} ${d.cocinero.apellido || ''}`.trim();

    return {
      id:          d.id,
      id_cocinero: d.id_cocinero,
      id_orden:    d.ordenes_produccion.id,
      fecha_para:  d.ordenes_produccion.fecha_para,
      plato,
      plan,
      cantidad:    d.cantidad,
      cocinero
    };
  });

  // Por fecha_para y después por número de pedido. Supabase no ordena la lista principal por
  // columnas de una tabla unida, así que se ordena acá. "AAAA-MM-DD" se puede comparar como texto.
  resultado.sort((a, b) => {
    if (a.fecha_para !== b.fecha_para) return a.fecha_para.localeCompare(b.fecha_para);
    if (a.id_orden !== b.id_orden) return a.id_orden - b.id_orden;
    return (a.plato || '').localeCompare(b.plato || '', 'es');
  });

  res.json(resultado);
});

// POST /api/ordenes-produccion/detalles/:id/hecho → la cocina terminó un plato del pedido (marcar_detalle_hecho).
// Entran las viandas al stock y se descuentan los insumos. Si algo no alcanza se carga igual
// y vuelve en "avisos". El usuario sale del token. Un cocinero solo marca lo que le corresponde.
app.post('/api/ordenes-produccion/detalles/:id/hecho', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const idDetalle = Number(req.params.id);
  if (!Number.isInteger(idDetalle) || idDetalle <= 0 || idDetalle > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'ID de plato del pedido inválido' });
  }

  try {
    // Cocinero: antes de marcar, ver que el plato le corresponda
    if (Number(req.usuario.rol) === 2) {
      const { data: detalle, error: errDetalle } = await supabase
        .from('orden_produccion_detalles')
        .select('id, productos ( id_cocinero, planes ( id_cocinero, id_cocinero_suplente ) )')
        .eq('id', idDetalle)
        .maybeSingle();

      if (errDetalle) return errorInterno(res, errDetalle);
      if (!detalle) return res.status(404).json({ error: 'El plato del pedido no existe' });
      if (!detalle.productos || !platoVisibleParaCocinero(detalle.productos, req.usuario.id)) {
        return res.status(403).json({ error: 'Este plato no te corresponde' });
      }
    }

    const { data, error } = await supabase.rpc('marcar_detalle_hecho', {
      p_id_detalle: idDetalle,
      p_id_usuario: req.usuario.id
    });

    if (error) return errorInterno(res, error);

    // ok: false = no se hizo nada (no existe o ya estaba hecho)
    if (!data || !data.ok) {
      let mensaje = 'No se pudo marcar el plato como hecho';
      if (data && data.error) mensaje = data.error;
      return res.status(409).json({ error: mensaje });
    }

    let avisos = [];
    if (Array.isArray(data.avisos)) avisos = data.avisos;

    res.json({ mensaje: 'Plato marcado como hecho', stock_heladera: data.stock_heladera, avisos });
  } catch (e) {
    errorInterno(res, e);
  }
});

// Hoy en Argentina como "AAAA-MM-DD" (en-CA da ese formato), sin importar la zona del servidor
function hoyEnArgentina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

// "AAAA-MM-DD" del día siguiente
function diaSiguiente(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

// GET /api/ordenes-produccion/hechos-hoy → platos de pedidos a cocina marcados hechos hoy (hora de Argentina),
// del más reciente al más viejo. Quién lo marcó sale del movimiento de viandas que generó.
// Un cocinero ve lo mismo que en pendientes: sus platos y los que no tienen cocinero.
app.get('/api/ordenes-produccion/hechos-hoy', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // Argentina no tiene horario de verano: el día va de 00:00 a 24:00 en -03:00
  const hoy = hoyEnArgentina();
  const desde = hoy + 'T00:00:00-03:00';
  const hasta = diaSiguiente(hoy) + 'T00:00:00-03:00';

  const { data, error } = await supabase
    .from('orden_produccion_detalles')
    .select(`
      id, cantidad, fecha_hecho, id_orden_produccion,
      productos ( nombre, id_cocinero, planes ( nombre, id_cocinero, id_cocinero_suplente ) ),
      movimiento:movimientos_viandas!id_movimiento_vianda ( usuarios ( nombre, apellido ) )
    `)
    .eq('hecho', true)
    .gte('fecha_hecho', desde)
    .lt('fecha_hecho', hasta)
    .order('fecha_hecho', { ascending: false });

  if (error) return errorInterno(res, error);

  let detalles = data || [];
  if (Number(req.usuario.rol) === 2) {
    detalles = detalles.filter(d => d.productos && platoVisibleParaCocinero(d.productos, req.usuario.id));
  }

  const resultado = detalles.map(d => {
    let plato = null;
    let plan = null;
    if (d.productos) {
      plato = d.productos.nombre;
      if (d.productos.planes) plan = d.productos.planes.nombre;
    }
    let marcadoPor = null;
    if (d.movimiento && d.movimiento.usuarios) {
      marcadoPor = `${d.movimiento.usuarios.nombre || ''} ${d.movimiento.usuarios.apellido || ''}`.trim();
    }

    return {
      id:          d.id,
      id_orden:    d.id_orden_produccion,
      plato,
      plan,
      cantidad:    d.cantidad,
      marcado_por: marcadoPor,
      fecha_hecho: d.fecha_hecho
    };
  });

  res.json(resultado);
});

// GET /api/movimientos-viandas → últimos 50 movimientos de viandas, del más nuevo al más viejo.
app.get('/api/movimientos-viandas', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_viandas')
    .select('id, tipo, cantidad, motivo, fecha, productos ( nombre ), usuarios ( nombre, apellido )')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);

  if (error) return errorInterno(res, error);

  const resultado = (data || []).map(m => {
    let platoNombre = '-';
    if (m.productos) platoNombre = m.productos.nombre;
    let usuarioNombre = '-';
    if (m.usuarios) usuarioNombre = [m.usuarios.nombre, m.usuarios.apellido].filter(Boolean).join(' ');
    return {
      id:             m.id,
      tipo:           m.tipo,
      cantidad:       m.cantidad,
      motivo:         m.motivo,
      fecha:          m.fecha,
      plato_nombre:   platoNombre,
      usuario_nombre: usuarioNombre
    };
  });

  res.json(resultado);
});

/* ======================================================
   API REPORTES
   ====================================================== */

app.get('/api/reportes/resumen', requireAuth, requireRol(6, 5), async (req, res) => {
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
  } catch (e) { errorInterno(res, e); }
});

app.get('/api/reportes/ingresos-por-dia', requireAuth, requireRol(6, 5), async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('pedidos').select('fecha_pedido, total').neq('id_estado', 5);
  if (desde) query = query.gte('fecha_pedido', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha_pedido', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return errorInterno(res, error);
  const map = {};
  (data || []).forEach(p => { const d = p.fecha_pedido.slice(0,10); map[d] = (map[d]||0) + Number(p.total); });
  res.json(Object.entries(map).map(([dia,ingresos])=>({dia,ingresos})).sort((a,b)=>a.dia.localeCompare(b.dia)));
});

app.get('/api/reportes/gastos-por-dia', requireAuth, requireRol(6, 5), async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('movimientos_stock').select('fecha, costo_total')
    .eq('tipo', 'entrada').not('costo_total', 'is', null);
  if (desde) query = query.gte('fecha', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return errorInterno(res, error);
  const map = {};
  (data || []).forEach(m => { const d = m.fecha.slice(0,10); map[d] = (map[d]||0) + Number(m.costo_total); });
  res.json(Object.entries(map).map(([dia,gastos])=>({dia,gastos})).sort((a,b)=>a.dia.localeCompare(b.dia)));
});

app.get('/api/reportes/productos-mas-vendidos', requireAuth, requireRol(6, 5), async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let qP = supabase.from('pedidos').select('id').neq('id_estado', 5);
    // Mismo corte que GET /api/pedidos: días de Argentina, no de UTC
    if (desde) qP = qP.gte('fecha_pedido', `${desde}T00:00:00${OFFSET_ARGENTINA}`);
    if (hasta) qP = qP.lte('fecha_pedido', `${hasta}T23:59:59.999${OFFSET_ARGENTINA}`);
    const { data: pedidos } = await qP;
    const ids = (pedidos || []).map(p => p.id);
    if (!ids.length) return res.json([]);
    const { data: detalles, error } = await supabase
      .from('pedido_detalles').select('cantidad, precio_unitario, productos ( nombre )').in('id_pedido', ids);
    if (error) return errorInterno(res, error);
    const map = {};
    (detalles || []).forEach(d => {
      const n = d.productos?.nombre || 'Desconocido';
      if (!map[n]) map[n] = { nombre: n, total_vendido: 0, ingresos: 0 };
      map[n].total_vendido += Number(d.cantidad);
      map[n].ingresos      += Number(d.cantidad) * Number(d.precio_unitario);
    });
    res.json(Object.values(map).sort((a,b)=>b.total_vendido-a.total_vendido).slice(0,10));
  } catch (e) { errorInterno(res, e); }
});

app.get('/api/reportes/stock-movimientos', requireAuth, requireRol(6, 5), async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('movimientos_stock').select('fecha, tipo, cantidad');
  if (desde) query = query.gte('fecha', desde + 'T00:00:00');
  if (hasta) query = query.lte('fecha', hasta + 'T23:59:59');
  const { data, error } = await query;
  if (error) return errorInterno(res, error);
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
  if (error) return errorInterno(res, error);
  res.json(data);
});

/* ======================================================
   API ENVÍOS (delivery del día, agrupado por barrio)
   ====================================================== */

app.get('/api/envios', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const { fecha } = req.query;

  let query = supabase
    .from('pedidos')
    .select(`
      id,
      fecha_pedido,
      fecha_entrega,
      total,
      metodo_pago,
      monto_efectivo,
      monto_transferencia,
      pago_anticipado,
      pagado,
      transferencia_confirmada,
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
  if (error) return errorInterno(res, error);
  res.json(data);
});

/* ======================================================
   API PLANES (para modal de recetas)
   ====================================================== */

// GET /api/planes → planes activos con su prefijo de código
app.get('/api/planes', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('planes')
    .select('id, nombre, codigo_plan, id_categoria')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) return errorInterno(res, error);
  res.json(data || []);
});

// GET /api/planes/:id/siguiente-codigo → calcula el próximo código correlativo del plan
app.get('/api/planes/:id/siguiente-codigo', requireAuth, requireRol(6, 5), async (req, res) => {
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

    if (errProd) return errorInterno(res, errProd);

    let maxNum = 0;
    (productos || []).forEach(p => {
      if (p.codigo_plato && p.codigo_plato.startsWith(prefix)) {
        const num = parseInt(p.codigo_plato.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    res.json({ codigo: prefix + (maxNum + 1) });
  } catch (e) {
    errorInterno(res, e);
  }
});

// POST /api/productos/con-receta → crea producto nuevo + receta de forma atómica
// Body: { nombre, id_plan, insumos: [{ id_insumo, cantidad_necesaria, unidad_medida }] }
app.post('/api/productos/con-receta', requireAuth, requireRol(6, 5), async (req, res) => {
  const { nombre, id_plan, precio, descuento, insumos } = req.body;
  const idCocinero = req.body.id_cocinero || null; // opcional: null = usa el cocinero del plan

  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del producto es requerido' });
  if (!id_plan)                   return res.status(400).json({ error: 'El plan es requerido' });
  if (!insumos || insumos.length === 0) return res.status(400).json({ error: 'Agregá al menos un insumo' });

  // Antes de crear nada: si viene cocinero, tiene que ser un usuario con rol cocinero
  if (idCocinero) {
    const invalido = await validarCocinero(idCocinero);
    if (invalido) return res.status(invalido.status).json({ error: invalido.error });
  }

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

    if (errExist) return errorInterno(res, errExist);

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
        id_cocinero:  idCocinero,
        activo:       true
      })
      .select()
      .single();

    if (errProducto) return errorInterno(res, errProducto);

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
      return errorInterno(res, errReceta);
    }

    res.json({ mensaje: 'Producto y receta creados correctamente', producto });
  } catch (e) {
    errorInterno(res, e);
  }
});

/* ======================================================
   API USUARIOS (gestión interna de personal)
   ====================================================== */

// GET /api/usuarios → lista completa de usuarios
app.get('/api/usuarios', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, apellido, nombre_usuario, email, telefono, id_rol')
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);
  res.json(data || []);
});

// Roles: 1 Administrador · 2 Cocinero · 3 Repartidor · 4 Consumidor final · 5 Dueño · 6 Administrador del sistema
const ROL_SISTEMA = 6;
const MENSAJE_SOLO_SISTEMA = 'Solo un Administrador del sistema puede asignar o modificar el rol "Administrador del sistema".';

// Valida el rol que se quiere asignar: que exista en la tabla roles y que el rol 6 solo lo asigne un rol 6.
// Quién asigna sale del token (si no hay token válido, no puede asignar el rol 6).
// Devuelve null si está bien, o { status, error }.
async function validarAsignacionDeRol(req, idRol) {
  if (!Number.isInteger(idRol)) return { status: 400, error: 'Rol inválido' };

  const { data: rol, error } = await supabase.from('roles').select('id').eq('id', idRol).maybeSingle();
  if (error) return { status: 500, error: mensajeInterno(error) };
  if (!rol) return { status: 400, error: 'El rol elegido no existe' };

  if (idRol === ROL_SISTEMA && leerToken(req)?.rol !== ROL_SISTEMA) {
    return { status: 403, error: MENSAJE_SOLO_SISTEMA };
  }
  return null;
}

// POST /api/usuarios/crear → dar de alta un nuevo empleado
// Body: { nombre, apellido, nombre_usuario, email, telefono, contraseña, id_rol }
// La columna en la BD se llama "contrasena" (sin ñ)
app.post('/api/usuarios/crear', requireAuth, requireRol(6, 5), async (req, res) => {
  const { nombre, apellido, nombre_usuario, email, telefono, id_rol } = req.body;
  const contraseña = req.body['contraseña'];

  if (!nombre || !apellido || !nombre_usuario || !email || !contraseña || !id_rol) {
    return res.status(400).json({ error: 'Nombre, apellido, nombre de usuario, email, contraseña y rol son requeridos' });
  }

  const rolInvalido = await validarAsignacionDeRol(req, Number(id_rol));
  if (rolInvalido) return res.status(rolInvalido.status).json({ error: rolInvalido.error });

  // Verificar que el email no esté ya registrado
  const { data: existente } = await supabase
    .from('usuarios')
    .select('id')
    .ilike('email', email)
    .limit(1);

  if (existente && existente.length > 0) {
    return res.status(400).json({ error: 'Ya existe un usuario registrado con ese email' });
  }

  const nuevoRegistro = {
    nombre,
    apellido,
    nombre_usuario: nombre_usuario.trim(),
    email,
    telefono: telefono || null,
    id_rol:   parseInt(id_rol)
  };
  const hashContrasenaCreate = await bcrypt.hash(contraseña, 10);
  nuevoRegistro['contrasena'] = hashContrasenaCreate;

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .insert(nuevoRegistro)
      .select('id, nombre, apellido, nombre_usuario, email, telefono, id_rol')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El nombre de usuario ya está en uso. Por favor, elige otro.' });
      }
      return errorInterno(res, error);
    }
    res.json({ mensaje: 'Usuario creado correctamente', usuario: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/usuarios/:id → editar datos de un usuario existente
// Body: { nombre, apellido, nombre_usuario, email, telefono?, contraseña?, id_rol }
app.put('/api/usuarios/:id', requireAuth, requireRol(6, 5), async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, nombre_usuario, email, telefono, id_rol } = req.body;
  const nuevaContrasena = req.body['contraseña'];

  if (!nombre || !apellido || !nombre_usuario || !email || !id_rol) {
    return res.status(400).json({ error: 'Nombre, apellido, nombre de usuario, email y rol son requeridos' });
  }

  const rolInvalido = await validarAsignacionDeRol(req, Number(id_rol));
  if (rolInvalido) return res.status(rolInvalido.status).json({ error: rolInvalido.error });

  // Un Administrador del sistema solo lo puede modificar otro (si no, un rol 5 le podría bajar el rol o cambiarle la clave)
  const { data: actual, error: errActual } = await supabase.from('usuarios').select('id, id_rol').eq('id', id).maybeSingle();
  if (errActual && errActual.code !== '22P02') return errorInterno(res, errActual);
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (actual.id_rol === ROL_SISTEMA && leerToken(req)?.rol !== ROL_SISTEMA) {
    return res.status(403).json({ error: MENSAJE_SOLO_SISTEMA });
  }

  const campos = {
    nombre,
    apellido,
    nombre_usuario: nombre_usuario.trim(),
    email,
    telefono: telefono || null,
    id_rol:   parseInt(id_rol)
  };
  if (nuevaContrasena && nuevaContrasena.trim()) {
    campos['contrasena'] = await bcrypt.hash(nuevaContrasena.trim(), 10);
  }

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .update(campos)
      .eq('id', id)
      .select('id, nombre, apellido, nombre_usuario, email, telefono, id_rol')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El nombre de usuario ya está en uso. Por favor, elige otro.' });
      }
      return errorInterno(res, error);
    }
    res.json({ mensaje: 'Usuario actualizado correctamente', usuario: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// DELETE /api/usuarios/:id → eliminar un usuario
app.delete('/api/usuarios/:id', requireAuth, requireRol(6, 5), async (req, res) => {
  const { id } = req.params;

  // A un Administrador del sistema solo lo puede borrar otro Administrador del sistema
  const { data: aBorrar, error: errABorrar } = await supabase.from('usuarios').select('id_rol').eq('id', id).maybeSingle();
  if (errABorrar && errABorrar.code !== '22P02') return errorInterno(res, errABorrar);
  if (aBorrar?.id_rol === ROL_SISTEMA && req.usuario.rol !== ROL_SISTEMA) {
    return res.status(403).json({ error: 'Solo un Administrador del sistema puede borrar a otro Administrador del sistema.' });
  }

  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id);

  if (error) return errorInterno(res, error);
  res.json({ mensaje: 'Usuario eliminado correctamente' });
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

/* ======================================================
   API RECUPERAR CONTRASEÑA
   ====================================================== */

// POST /api/recuperar-password
// Body: { email }
// Genera una clave temporal, la persiste en usuarios.contraseña y la envía por email.
app.post('/api/recuperar-password', limiteRecuperarPassword, async (req, res) => {
  // Email normalizado (sin espacios, en minúsculas) y buscado exacto: sin comodines de ilike
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'El email es requerido' });

  // La respuesta es siempre la misma, exista o no el email, para no revelar qué cuentas hay
  const RESPUESTA = { mensaje: 'Si el email está registrado, te enviamos una contraseña temporal.' };

  // 1. Buscar usuario por email
  const { data: usuario, error: errBusca } = await supabase
    .from('usuarios')
    .select('id, nombre, email')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (errBusca) return errorInterno(res, errBusca);
  if (!usuario) return res.json(RESPUESTA);

  // 2. Generar contraseña temporal de 8 caracteres alfanuméricos con un generador criptográfico
  //    (sin letras/números ambiguos: O, 0, I, l, 1)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let claveTemporal = '';
  for (let i = 0; i < 8; i++) {
    claveTemporal += chars[crypto.randomInt(chars.length)];
  }

  // 3. Actualizar en Supabase — se guarda el HASH, no el texto plano
  // La clave en texto plano sólo viaja por email para que el usuario la escriba
  // La columna se llama "contrasena" (sin ñ) en PostgreSQL
  const campoActualizar = {};
  campoActualizar['contrasena'] = await bcrypt.hash(claveTemporal, 10);

  const { error: errUpdate } = await supabase
    .from('usuarios')
    .update(campoActualizar)
    .eq('id', usuario.id);

  if (errUpdate) {
    console.error('Error actualizando contraseña:', errUpdate);
    return res.json(RESPUESTA);
  }

  // 4. Enviar email con Nodemailer
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // App Password de Gmail (no la contraseña normal de la cuenta)
      },
    });

    await transporter.sendMail({
      from: `"Fast Good" <${process.env.MAIL_USER}>`,
      to:   usuario.email,
      subject: 'Recuperación de acceso - Fast Good',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#333;">
          <div style="background:#28a745;padding:1.2rem 1.5rem;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;color:#fff;font-size:1.3rem;">🌿 Fast Good — Viandas Saludables</h2>
          </div>
          <div style="background:#f9f9f9;padding:1.8rem 1.5rem;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
            <p>Hola <strong>${usuario.nombre}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña de acceso al sistema.</p>
            <p style="margin-bottom:0.5rem;">Tu nueva contraseña temporal es:</p>
            <div style="background:#fff;border:2px dashed #28a745;padding:1rem 1.5rem;border-radius:6px;text-align:center;margin:1rem 0;">
              <strong style="font-size:1.6rem;letter-spacing:0.12em;color:#28a745;">${claveTemporal}</strong>
            </div>
            <p>Iniciá sesión con esta contraseña y <strong>cámbiala cuanto antes</strong> desde tu perfil.</p>
            <p style="font-size:0.83rem;color:#999;margin-top:1.5rem;">
              Si no solicitaste este cambio, ignorá este email. Tu contraseña anterior sigue siendo válida solo si no hiciste esta solicitud.
            </p>
          </div>
          <p style="text-align:center;font-size:0.78rem;color:#bbb;margin-top:1rem;">Fast Good · Viandas Saludables &copy; 2025</p>
        </div>
      `,
    });

    res.json(RESPUESTA);

  } catch (errMail) {
    // La contraseña ya se actualizó pero el mail no salió: queda en el log del servidor.
    // Al cliente, la misma respuesta de siempre (una distinta revelaría que el email existe).
    console.error('Error al enviar email de recuperación:', errMail);
    res.json(RESPUESTA);
  }
});

/* ======================================================
   MANEJADOR DE ERRORES (al final de todo)
   Errores no atrapados en las rutas (y los del parser de JSON): nunca devuelve el stack trace.
   ====================================================== */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El contenido enviado no es un JSON válido' });
  }
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: MENSAJE_ERROR_INTERNO });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Accesible en red local via IP:3000`);
});

