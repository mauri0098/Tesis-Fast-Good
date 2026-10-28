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
// Catálogo de combos (público): 60 consultas por minuto por IP. Sobra para una persona que navega
// la página; frena a quien la llama sin parar para saturar el servidor o copiar el catálogo.
const limiteCatalogo = limitador({
  minutos: 1, maximo: 60,
  mensaje: 'Demasiadas consultas seguidas. Esperá un momento y volvé a intentar.'
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
   INSUMOS DE LOS PEDIDOS (solo lo que cocina la cocina: cantidad − cantidad_de_heladera)
   - verificarStockPedido: al pasar a "En Preparación" (2). Solo lee: ¿alcanzan los insumos?
   - descontarStockPedido: al pasar a "Listo para Entregar" (3) o "Entregado" (4). Descuenta una sola vez,
     todo junto, con la función de la base descontar_insumos_pedido (sql/insumos_pedido.sql, paso H8 parada 3B).
   Las viandas de la heladera ya gastaron sus insumos cuando se produjeron: así no se descuentan dos veces.
   Las dos devuelven null si todo OK, o { status, error }:
     409 = falta un insumo (el mensaje dice cuál) · 500 = falló algo interno (el detalle va al log).
   ====================================================== */

// ─────────────────────────────────────────────────────────────────────────────
// verificarStockPedido → ¿alcanzan los insumos de lo que cocina la cocina? Solo lee: no descuenta nada.
// ENTRADA: pedidoId (el número de pedido)
// SALIDA:  null si alcanza (o si no hay nada para cocinar) · { status: 409, error } si falta un insumo
//          · { status: 500, error } si falló la base
// Ej: 8 fideos de heladera + 2 fideos "sin sal" (receta: 300 g de harina integral y 2 huevos) → la cocina
//     cocina 2 → hacen falta 600 g de harina y 4 huevos. Con Huevo en −35 →
//     { status: 409, error: 'Stock insuficiente de "Huevo": se necesitan 4, hay -35 disponibles' }
// La usan cambiarEstadoPedido (al pasar a 2) y GET /api/pedidos/:id/verificar-stock.
// Es la misma cuenta que hace descontar_insumos_pedido en la base al pasar a 3 o 4.
// ─────────────────────────────────────────────────────────────────────────────
async function verificarStockPedido(pedidoId) {
  try {
    // 1. Los platos del pedido: cuántas viandas tiene cada uno y cuántas salieron de la heladera
    const { data: detalles, error: errDetalles } = await supabase  // pide a la base...
      .from('pedido_detalles')                                    // ...los platos de los pedidos...
      .select('id_producto, cantidad, cantidad_de_heladera')      // ...plato, viandas y viandas de heladera...
      .eq('id_pedido', pedidoId);                                 // ...de este pedido
    if (errDetalles) {                                            // si falló la base...
      console.error('ERROR REAL DEL SERVIDOR [pedido_detalles]:', errDetalles);  // ...el detalle al log
      return { status: 500, error: MENSAJE_ERROR_INTERNO };       // ...y un mensaje simple
    }

    // 2. Lo que cocina la cocina, por plato: cantidad − cantidad_de_heladera (vacío cuenta como 0).
    //    Ej: [8 fideos de heladera (8 − 8 = 0), 2 fideos "sin sal" (2 − 0 = 2)] → { 7: 2 }
    const aCocinarPorPlato = {};                                  // { id_producto: viandas que cocina la cocina }
    const idsPlatos = [];                                         // los platos que cocina la cocina, sin repetir
    (detalles || []).forEach(detalle => {                         // por cada plato del pedido...
      const aCocinar = Number(detalle.cantidad) - Number(detalle.cantidad_de_heladera ?? 0);  // ...lo que cocina la cocina
      if (aCocinar <= 0) return;                                  // (return = saltear este plato: todo sale de la heladera)
      const esNuevo = aCocinarPorPlato[detalle.id_producto] === undefined;  // ¿es la primera vez que aparece?
      if (esNuevo) idsPlatos.push(detalle.id_producto);           // la primera vez se anota
      aCocinarPorPlato[detalle.id_producto] = (aCocinarPorPlato[detalle.id_producto] || 0) + aCocinar;  // se suma
    });
    if (idsPlatos.length === 0) return null;                      // no hay nada para cocinar: alcanza

    // 3. Las recetas de esos platos
    const { data: recetas, error: errRecetas } = await supabase   // pide a la base...
      .from('producto_insumo')                                    // ...las recetas...
      .select('id_producto, id_insumo, cantidad_necesaria')       // ...plato, insumo y cuánto lleva por vianda...
      .in('id_producto', idsPlatos);                              // ...de los platos que cocina la cocina
    if (errRecetas) {                                             // si falló la base...
      console.error('ERROR REAL DEL SERVIDOR [producto_insumo]:', errRecetas);
      return { status: 500, error: MENSAJE_ERROR_INTERNO };
    }

    // 4. Cuánto hace falta de cada insumo: receta × viandas que cocina la cocina, sumando todos los platos.
    //    Ej: fideos (300 g de harina, 2 huevos) × 2 → { harina: 600, huevo: 4 }
    const necesarioPorInsumo = {};                                // { id_insumo: cuánto hace falta }
    const idsInsumos = [];                                        // los insumos, sin repetir
    (recetas || []).forEach(renglon => {                          // por cada renglón de receta...
      const necesario = Number(renglon.cantidad_necesaria || 0) * aCocinarPorPlato[renglon.id_producto];  // ...receta × viandas
      const esNuevo = necesarioPorInsumo[renglon.id_insumo] === undefined;  // ¿es la primera vez que aparece?
      if (esNuevo) idsInsumos.push(renglon.id_insumo);            // la primera vez se anota
      necesarioPorInsumo[renglon.id_insumo] = (necesarioPorInsumo[renglon.id_insumo] || 0) + necesario;  // se suma
    });
    if (idsInsumos.length === 0) return null;                     // sin receta no se gasta nada: alcanza

    // 5. Cuánto hay de cada insumo
    const { data: insumos, error: errInsumos } = await supabase   // pide a la base...
      .from('insumos')                                            // ...los insumos...
      .select('id, nombre, stock_actual')                         // ...número, nombre y cuánto hay...
      .in('id', idsInsumos);                                      // ...los de las recetas
    if (errInsumos) {                                             // si falló la base...
      console.error('ERROR REAL DEL SERVIDOR [insumos select]:', errInsumos);
      return { status: 500, error: MENSAJE_ERROR_INTERNO };
    }
    const insumoPorId = {};                                       // { id_insumo: { nombre, stock_actual } }
    (insumos || []).forEach(insumo => {                           // por cada insumo...
      insumoPorId[insumo.id] = insumo;                            // ...se guarda por su número
    });

    // 6. El primer insumo (en orden de número) que no alcanza: con ese se avisa. Si ninguno falta, alcanza.
    //    sort con (a, b) => a − b ordena números de menor a mayor. Ej: [9, 2, 5] → [2, 5, 9]
    idsInsumos.sort((a, b) => a - b);                             // el mismo orden que usa la base
    let error = null;                                             // el aviso (null = alcanza todo)
    idsInsumos.forEach(idInsumo => {                              // por cada insumo...
      if (error) return;                                          // (return = saltear: ya se encontró uno que falta)
      const insumo = insumoPorId[idInsumo];                       // ...sus datos (pueden faltar si se borró)
      const disponible = Number(insumo?.stock_actual ?? 0);       // ?. = "si existe el insumo, su stock"; ?? 0 = vacío cuenta como 0
      const nombre = insumo?.nombre || String(idInsumo);          // su nombre (o su número si no se encontró)
      const necesario = Number(necesarioPorInsumo[idInsumo]);     // cuánto hace falta
      if (disponible < necesario) error = `Stock insuficiente de "${nombre}": se necesitan ${necesario}, hay ${disponible} disponibles`;  // el mismo mensaje de antes
    });
    if (error) return { status: 409, error: error };              // falta un insumo: 409 con el mensaje
    return null;                                                  // alcanza todo
  } catch (error) {                                               // si algo falló de golpe...
    console.error('ERROR REAL DEL SERVIDOR en verificarStockPedido:', error);
    return { status: 500, error: MENSAJE_ERROR_INTERNO };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// descontarStockPedido → descuenta, una sola vez y todo junto, los insumos de lo que cocinó la cocina
// ENTRADA: pedidoId (el pedido que pasa a 3 o 4) e idUsuario (quién lo pasa: sale del token)
// SALIDA:  null si salió bien (o si ya estaba descontado) · { status: 409, error } si falta un insumo o el
//          pedido no se puede (anulado, no existe) · { status: 500, error } si falló la base
// Ej: 8 fideos de heladera + 2 "sin sal" al pasar a 3 → harina integral −600 g y huevo −4 u, con id_pedido
//     y el motivo de siempre ("Consumo por producción pedido #250"). Si después pasa a 4: no descuenta otra vez.
// La hace la base (descontar_insumos_pedido, sql/insumos_pedido.sql): candado al pedido y a los insumos,
// todo o nada. La usa cambiarEstadoPedido (al pasar a 3 o 4).
// ─────────────────────────────────────────────────────────────────────────────
async function descontarStockPedido(pedidoId, idUsuario) {
  try {
    const { data, error } = await supabase.rpc('descontar_insumos_pedido', {  // llama a la función de la base con...
      p_id_pedido:  pedidoId,                                     // ...el pedido...
      p_id_usuario: idUsuario                                     // ...y quién lo pasa (del token, nunca del body)
    });
    if (error) {                                                  // si falló la base...
      console.error('ERROR REAL DEL SERVIDOR [descontar_insumos_pedido]:', error);  // ...el detalle al log
      return { status: 500, error: MENSAJE_ERROR_INTERNO };       // ...y un mensaje simple
    }

    // ok: false = la base no descontó nada (falta un insumo, el pedido está anulado o no existe).
    // El mensaje es el de la base (?. = "si vino data, su error") o uno por si no mandó ninguno.
    if (!data || !data.ok) {
      return { status: 409, error: data?.error || 'No se pudieron descontar los insumos del pedido' };
    }

    return null;                                                  // descontó (o ya estaba descontado)
  } catch (error) {                                               // si algo falló de golpe...
    console.error('ERROR REAL DEL SERVIDOR en descontarStockPedido:', error);
    return { status: 500, error: MENSAJE_ERROR_INTERNO };
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
      console.log('Login fallido'); // sin datos: el log no guarda emails ni dice si el usuario existe
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
      console.log('Login fallido'); // mismo texto que arriba: no se distingue "no existe" de "contraseña mal"
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
      imagen,
      descripcion,
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
    id:          cat.id,
    nombre:      cat.nombre,
    imagen:      cat.imagen,        // la dirección de su foto, o null
    descripcion: cat.descripcion,   // su frase corta, o null
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

// GET /api/v1/categorias → todas las categorías (con su foto y su frase corta, o null si no tienen)
app.get('/api/v1/categorias', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, imagen, descripcion');
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

// GET /api/v1/combos → combos activos con su plan, la categoría del plan y su menú (lo usa index-combos.html).
// 28/10 (código de plato): cada plato del menú trae también su codigo_plato (ej: "F3").
// Es pública, como el catálogo: solo manda lo que la web necesita mostrar.
// De cada plato del menú manda "disponibles": las viandas que hay en la heladera, con un tope igual a
// la cantidad del combo (así no se muestra el stock real completo). Lo personalizado no tiene tope:
// no sale de la heladera.
app.get('/api/v1/combos', limiteCatalogo, async (req, res) => {
  // 1. Combos activos con su plan (y la categoría del plan) y su menú, en una sola consulta
  const { data, error } = await supabase
    .from('combos')
    .select(`
      id,
      nombre,
      cantidad,
      precio,
      destacado,
      planes (
        nombre,
        activo,
        categorias ( id, nombre, imagen, descripcion )
      ),
      combo_productos (
        activo,
        productos ( id, nombre, codigo_plato, descripcion, imagen, activo, stock_heladera )
      )
    `)
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);

  const combos = [];

  for (const combo of data || []) {
    // 2. Un combo sin plan o de un plan inactivo no se muestra
    if (!combo.planes || !combo.planes.activo) continue;

    // 3. Menú: solo los renglones activos cuyo plato también está activo
    const menu = [];
    for (const renglon of combo.combo_productos || []) {
      const plato = renglon.productos;
      if (!renglon.activo || !plato || !plato.activo) continue;

      // Viandas que se pueden elegir de la heladera: las que hay, sin pasar la cantidad del combo
      const enHeladera = Number(plato.stock_heladera) || 0;
      menu.push({
        id:          plato.id,
        nombre:      plato.nombre,
        codigo_plato: plato.codigo_plato || null,   // su código (ej: "F3"; 28/10). La web lo muestra si no está ya en el nombre
        descripcion: plato.descripcion,
        imagen:      plato.imagen,
        disponibles: Math.min(enHeladera, combo.cantidad)
      });
    }

    // 4. Un combo sin ningún plato para elegir no se muestra
    if (menu.length === 0) continue;

    // Los platos, por nombre (como en un menú)
    menu.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

    combos.push({
      id:        combo.id,
      nombre:    combo.nombre,
      cantidad:  combo.cantidad,
      precio:    Number(combo.precio),
      destacado: combo.destacado === true,  // true = lleva "Más elegido" (sin el dato, false)
      plan:      combo.planes.nombre,
      categoria: combo.planes.categorias, // { id, nombre, imagen, descripcion }, o null si el plan no tiene categoría
      menu
    });
  }

  res.json(combos);
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
      fecha_entrega,
      cliente_nombre,
      observaciones,
      id_estado,
      pedido_detalles (
        id_producto,
        cantidad,
        precio_unitario,
        listo,
        personalizado,
        observaciones_plato,
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
// Usuario "Consumidor Final" de los pedidos sin login (rol 4, nadie puede iniciar sesión con él).
// Lo crea sql/usuario_consumidor_final.sql. Antes acá estaba el id de un usuario admin.
const ID_CONSUMIDOR_FINAL = 'b344f2e8-cd3c-42af-953c-7d97cada6c63';

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

// Reglas del pedido de COMBOS (POST /api/pedidos-combos)
const MAXIMO_COMBOS_POR_PEDIDO       = 10;  // la base controla lo mismo (crear_pedido_combos)
const LARGO_MAXIMO_EMAIL             = 100; // la columna pedidos.cliente_email no acepta más
const DIAS_HABILES_ENTREGA           = 2;   // 48 hs hábiles, como el pedido viejo
const DIAS_HABILES_CON_PERSONALIZADO = 3;   // un plato personalizado se cocina aparte: 1 día hábil más

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pedidos-combos → crea un pedido de COMBOS (VENDER: la web nueva, index-combos.html). Es pública.
// ENTRADA: body { combos: [{ id_combo, platos: [{ producto_id, cantidad, personalizado }] }], cliente_nombre,
//          cliente_direccion, cliente_telefono, cliente_email, fecha_entrega, metodo_pago, observaciones,
//          barrio_id, tipo_entrega }. El navegador NO manda precios, total ni usuario (y si los manda, no se usan).
// SALIDA:  { mensaje, id_pedido, total, combos } · 400 con un mensaje claro si algo está mal o no alcanzan
//          las viandas · 429 si se hicieron demasiados pedidos seguidos (limitePedidos) · 500 error interno
// Ej: 1 combo "PRUEBA Mantenimiento x10" con 8 fideos + 2 fideos "sin sal" → { id_pedido: 250, total: 137000, ... }
//     y fideos 71 → 63. Con 12 fideos y 16 pedidos → 400 'No quedan suficientes viandas de «fideos»: pediste 16 y quedan 12'.
// Acá se controlan los datos del cliente (las mismas reglas que POST /api/pedidos) y la FORMA de los combos.
// El contenido de cada combo (activo, platos del menú, suma justa, texto personalizado), el precio, el total
// y la heladera los controla la base: crear_pedido_combos (sql/pedido_combos_funciones.sql), todo o nada.
// Paso H9: misma entrada, misma salida y mismos mensajes; solo se reescribió con forEach y sin if anidados.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/pedidos-combos', limitePedidos, async (req, res) => {
  const {
    combos,
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

  // 1. Combos: una lista de 1 a 10. Acá solo se mira la FORMA (lo justo para saber si hay platos
  //    personalizados, que cambian la fecha mínima). El contenido lo controla la base.
  const cantidadInvalida = !Array.isArray(combos) || combos.length < 1 || combos.length > MAXIMO_COMBOS_POR_PEDIDO;
  if (cantidadInvalida) {
    return res.status(400).json({ error: `El pedido tiene que tener entre 1 y ${MAXIMO_COMBOS_POR_PEDIDO} combos` });
  }

  // 2. Cada combo tiene que ser un objeto con su lista de platos. Ej: [{ platos: [...] }, { platos: 'hola' }] → mal
  let hayComboMalArmado = false;                                  // arranca en "todos bien"
  combos.forEach(combo => {                                       // por cada combo...
    const malArmado = !combo || typeof combo !== 'object' || !Array.isArray(combo.platos);  // ...¿le falta su lista?
    if (malArmado) hayComboMalArmado = true;                      // ...si le falta, está mal
  });
  if (hayComboMalArmado) return res.status(400).json({ error: 'Hay un combo con datos inválidos' });

  // 3. Los platos de todos los combos en una sola lista. concat = junta dos listas en una nueva.
  //    Ej: [{ platos: [fideos, berenjenas] }, { platos: [arroz] }] → [fideos, berenjenas, arroz]
  let platos = [];                                                // arranca vacía
  combos.forEach(combo => {                                       // por cada combo...
    platos = platos.concat(combo.platos);                         // ...se le suman sus platos
  });

  // 4. Cada plato tiene que ser un objeto, y "personalizado" un texto o vacío (null o sin el dato).
  //    De paso se mira si hay algún personalizado con texto escrito (cambia la fecha mínima).
  //    Ej: [{ personalizado: null }, { personalizado: 'sin sal' }] → bien, y hay personalizado
  let hayPlatoMalArmado = false;                                  // arranca en "todos bien"
  let hayPersonalizado = false;                                   // arranca en "ninguno personalizado"
  platos.forEach(plato => {                                       // por cada plato...
    const noEsObjeto = !plato || typeof plato !== 'object';       // ...¿no es un objeto?
    const textoNoEsTexto = !noEsObjeto && plato.personalizado != null && typeof plato.personalizado !== 'string';  // ...¿"personalizado" no es texto?
    const conTextoEscrito = !noEsObjeto && typeof plato.personalizado === 'string' && plato.personalizado.trim() !== '';  // ...¿tiene texto?
    if (noEsObjeto || textoNoEsTexto) hayPlatoMalArmado = true;   // si no es objeto o el texto no es texto: está mal
    if (conTextoEscrito) hayPersonalizado = true;                 // si tiene texto escrito: hay un personalizado
  });
  if (hayPlatoMalArmado) return res.status(400).json({ error: 'Hay un plato con datos inválidos' });

  // 5. Método de pago y tipo de entrega: las mismas listas cerradas que POST /api/pedidos
  if (!METODOS_PAGO.includes(metodo_pago)) return res.status(400).json({ error: 'Método de pago inválido' });
  const tipoInvalido = tipo_entrega != null && !TIPOS_ENTREGA.includes(tipo_entrega);  // vino un tipo y no es de la lista
  if (tipoInvalido) return res.status(400).json({ error: 'Tipo de entrega inválido' });

  // 6. Datos del cliente.
  //    a) Los mismos largos máximos que POST /api/pedidos. Cada renglón de LARGO_MAXIMO_PEDIDO es
  //       [campo, nombre para el mensaje, largo máximo], ej: ['cliente_nombre', 'El nombre', 100].
  //       find devuelve el PRIMER renglón que no se cumple (o undefined si están todos bien).
  const largoNoCumplido = LARGO_MAXIMO_PEDIDO.find(renglon => {
    const valor = req.body[renglon[0]];                           // lo que mandó el navegador en ese campo
    const maximo = renglon[2];                                    // su largo máximo
    return valor != null && (typeof valor !== 'string' || valor.length > maximo);  // no cumple: no es texto o es muy largo
  });
  if (largoNoCumplido) {
    return res.status(400).json({ error: `${largoNoCumplido[1]} admite hasta ${largoNoCumplido[2]} caracteres` });
  }

  //    b) Nombre, dirección y teléfono obligatorios (un texto que no quede vacío)
  const faltaNombre = typeof cliente_nombre !== 'string' || cliente_nombre.trim() === '';
  if (faltaNombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const faltaDireccion = typeof cliente_direccion !== 'string' || cliente_direccion.trim() === '';
  if (faltaDireccion) return res.status(400).json({ error: 'La dirección es obligatoria' });
  const faltaTelefono = typeof cliente_telefono !== 'string' || cliente_telefono.trim() === '';
  if (faltaTelefono) return res.status(400).json({ error: 'El teléfono es obligatorio' });

  //    c) El email es opcional, pero si viene, hasta 100 caracteres
  const emailInvalido = cliente_email != null && (typeof cliente_email !== 'string' || cliente_email.length > LARGO_MAXIMO_EMAIL);
  if (emailInvalido) return res.status(400).json({ error: `El email admite hasta ${LARGO_MAXIMO_EMAIL} caracteres` });

  // 7. Fecha de entrega: obligatoria, que exista de verdad (leerFechaPara rechaza, por ejemplo, 2026-02-30),
  //    día hábil y al menos 2 días hábiles después de hoy en Argentina (3 si hay algún personalizado)
  if (!leerFechaPara(fecha_entrega)) {
    return res.status(400).json({ error: 'La fecha de entrega es obligatoria (formato AAAA-MM-DD)' });
  }
  if (!fechas.esDiaHabil(fechas.parseFechaLocal(fecha_entrega))) {
    return res.status(400).json({ error: 'La fecha de entrega tiene que ser un día hábil (de lunes a viernes, sin feriados)' });
  }
  const diasHabiles = hayPersonalizado ? DIAS_HABILES_CON_PERSONALIZADO : DIAS_HABILES_ENTREGA;  // 3 con personalizados, si no 2
  const aclaracionFecha = hayPersonalizado ? '(48 hs hábiles, más 1 día por los platos personalizados)' : '(48 hs hábiles)';
  const primeraFecha = fechas.fechaLocalISO(fechas.sumarDiasHabiles(hoyArgentina(), diasHabiles));  // la primera que se acepta
  const primeraFechaTexto = fechas.fechaDDMMAAAA(fechas.parseFechaLocal(primeraFecha));             // como "21/10/2026"
  if (fecha_entrega < primeraFecha) {                             // "AAAA-MM-DD" se puede comparar como texto
    return res.status(400).json({ error: `La primera fecha de entrega disponible es el ${primeraFechaTexto} ${aclaracionFecha}` });
  }

  // 8. Barrio: opcional. Si viene, tiene que ser un número entero que exista en la tabla barrios
  const vinoBarrio = barrio_id != null && barrio_id !== '';       // ¿mandó un barrio?
  const barrioId = vinoBarrio ? Number(barrio_id) : null;         // como número (null si no mandó)
  const barrioInvalido = vinoBarrio && (!Number.isInteger(barrioId) || barrioId <= 0 || barrioId > ENTERO_MAXIMO_BASE);
  if (barrioInvalido) return res.status(400).json({ error: 'Barrio inválido' });
  let barrioEncontrado = true;                                    // sin barrio no hay nada que buscar
  let errorBarrio = null;                                         // el error de la base, si hubo
  if (vinoBarrio) {                                               // con barrio, se busca en la base
    const consulta = await supabase.from('barrios').select('id').eq('id', barrioId).maybeSingle();
    errorBarrio = consulta.error;                                 // el error (o null)
    barrioEncontrado = Boolean(consulta.data);                    // ¿existe?
  }
  if (errorBarrio) return errorInterno(res, errorBarrio);         // si falló la base: 500
  if (!barrioEncontrado) return res.status(400).json({ error: 'El barrio elegido no existe' });

  // 9. Usuario: sale del token si el cliente inició sesión; si no, "Consumidor Final". Nunca del body.
  //    ?. = "si vino un token, su id"; || = si no, Consumidor Final
  const idUsuario = leerToken(req)?.id || ID_CONSUMIDOR_FINAL;

  // 10. Lo opcional que no vino se manda como null: a la base hay que pasarle TODOS los datos
  //     (si faltara uno, no encontraría la función). ?? = "si no vino (null o nada), null"; un '' se respeta.
  const email = cliente_email ?? null;
  const notas = observaciones ?? null;
  const tipoEntrega = tipo_entrega ?? null;

  // 11. A la base van SOLO los datos de cada combo y de cada plato: si el navegador mandó otra cosa
  //     (por ejemplo un precio), ni siquiera llega. Acá sí hay un forEach adentro de otro: cada combo
  //     trae su propia lista de platos y hay que armar una lista adentro de otra.
  //     Ej: entra [{ id_combo: 1, precio: 1, platos: [{ producto_id: 5, cantidad: 10, nombre: 'x' }] }]
  //         sale  [{ id_combo: 1, platos: [{ producto_id: 5, cantidad: 10, personalizado: null }] }]
  const combosParaLaBase = [];                                    // arranca vacía
  combos.forEach(combo => {                                       // por cada combo...
    const platosDelCombo = [];                                    // ...sus platos limpios
    combo.platos.forEach(plato => {                               // ...por cada plato...
      platosDelCombo.push({ producto_id: plato.producto_id, cantidad: plato.cantidad, personalizado: plato.personalizado ?? null });
    });
    combosParaLaBase.push({ id_combo: combo.id_combo, platos: platosDelCombo });
  });

  // 12. Guardar: la función de la base controla el contenido de los combos, calcula el total con los
  //     precios de la base, saca de la heladera los platos normales y guarda todo junto (o nada)
  try {
    const { data, error } = await supabase.rpc('crear_pedido_combos', {
      p_id_usuario:        idUsuario,
      p_cliente_nombre:    cliente_nombre,
      p_cliente_direccion: cliente_direccion,
      p_cliente_telefono:  cliente_telefono,
      p_cliente_email:     email,
      p_fecha_entrega:     fecha_entrega,
      p_metodo_pago:       metodo_pago,
      p_tipo_entrega:      tipoEntrega,
      p_barrio_id:         barrioId,
      p_observaciones:     notas,
      p_combos:            combosParaLaBase
    });
    if (error) return errorInterno(res, error);                   // error de la base: mensaje genérico (el detalle al log)

    // ok: false = la base encontró algo mal en los combos, o no alcanzan las viandas, y NO guardó nada
    // (ej: "«Keto x10» tiene 9 viandas…" o "No quedan suficientes viandas de «fideos»…")
    if (!data || !data.ok) return res.status(400).json({ error: data?.error || 'No se pudo crear el pedido' });

    // 13. Listo: número de pedido, total y combos con los nombres y precios de la base (para el WhatsApp)
    res.json({
      mensaje:   'Pedido creado correctamente',
      id_pedido: data.id_pedido,
      total:     data.total,
      combos:    data.combos
    });
  } catch (e) {
    errorInterno(res, e);
  }
});

// =============================================================================
// CONSULTAR PEDIDOS (paso H8, parada 2): lista, pago, estado. Un pedido ANULADO (estado 5)
// no cambia más de estado ni se cobra.
// =============================================================================
const ESTADO_ANULADO = 5;                                         // el estado "Cancelado": es final
const OFFSET_ARGENTINA = '-03:00';                                // la hora de Argentina (no tiene horario de verano)
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;                      // una fecha AAAA-MM-DD (ej: 2026-10-16)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pedidos → los pedidos, del más nuevo al más viejo (pantalla Consultar Pedidos)
// ENTRADA: ?desde=AAAA-MM-DD y ?hasta=AAAA-MM-DD (opcionales: filtran por fecha_pedido, en días de Argentina)
// SALIDA:  [{ id, fecha_pedido, fecha_entrega, total, metodo_pago, pagado, cliente_nombre, …, id_estado,
//            estados, barrios, pedido_detalles: [...], pedido_combos: [...] }] · 400 si una fecha es inválida · 500
// Ej: GET /api/pedidos → [{ id: 250, cliente_nombre: 'PRUEBA – NO PREPARAR', total: 137000, id_estado: 1, … }]
// fecha_pedido está en UTC: un pedido de las 22 h del 30/09 es 01:00 UTC del 01/10; por eso se compara con -03:00.
// Ojo: Supabase manda como mucho 1000 pedidos por consulta (anotado en pendientes: falta paginar).
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pedidos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const desde = req.query.desde;                                  // desde qué día (o nada)
  const hasta = req.query.hasta;                                  // hasta qué día (o nada)

  // 1. Las fechas, si vienen, con el formato AAAA-MM-DD
  const fechaInvalida = (desde && !FORMATO_FECHA.test(desde)) || (hasta && !FORMATO_FECHA.test(hasta));
  if (fechaInvalida) return res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD' });

  try {
    // 2. Los pedidos con su estado, su barrio, sus platos y sus combos
    let consulta = supabase                                       // arma el pedido a la base...
      .from('pedidos')                                            // ...la tabla de pedidos...
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
          id_pedido_combo,
          personalizado,
          observaciones_plato,
          productos ( nombre, codigo_plato )
        ),
        pedido_combos (
          id,
          precio,
          combos ( nombre )
        )
      `)                                                          // ...con todo lo que muestra la grilla
      .order('fecha_pedido', { ascending: false });               // del más nuevo al más viejo

    // 3. El filtro de fechas, si vino (días de Argentina)
    if (desde) consulta = consulta.gte('fecha_pedido', `${desde}T00:00:00${OFFSET_ARGENTINA}`);   // desde las 00:00
    if (hasta) consulta = consulta.lte('fecha_pedido', `${hasta}T23:59:59.999${OFFSET_ARGENTINA}`);  // hasta las 23:59

    const { data, error } = await consulta;                       // se hace la consulta
    if (error) return errorInterno(res, error);                   // si falló la base: 500 con un mensaje simple

    res.json(data);                                               // la lista de pedidos
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/pedidos/:id/pagado → marca un pedido como cobrado (o lo desmarca)
// ENTRADA: el número de pedido en la dirección y { pagado: true | false } en el body
// SALIDA:  { mensaje: 'Pago actualizado', pedido } · 400 número inválido · 404 no existe
//          · 409 si está anulado, o si es un Mixto sin la transferencia confirmada · 500
// Ej: PUT /api/pedidos/250/pagado { pagado: true } → { mensaje: 'Pago actualizado', pedido: { id: 250, pagado: true, … } }
//     Si el #250 está anulado → 409 'Un pedido anulado no se puede cobrar'
// pagado = true quiere decir TOTALMENTE cobrado. En un Mixto pide que la transferencia ya esté confirmada
// (la marca el admin al pasarlo a En Preparación); el repartidor completa el cobro con "Cobrado" en Envíos.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/pedidos/:id/pagado', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  // 1. El número de pedido: entero, mayor a 0 y que entre en la base ("12abc" no pasa)
  const id = Number(req.params.id);
  const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });
  const pagado = Boolean(req.body?.pagado);                       // true = cobrado, false = sin cobrar (como antes)

  try {
    // 2. El pedido tiene que existir y no estar anulado
    const { data: pedido, error: errLectura } = await supabase    // pide a la base...
      .from('pedidos')                                            // ...el pedido...
      .select('id, id_estado, metodo_pago, transferencia_confirmada')  // ...su estado y su pago...
      .eq('id', id)                                               // ...este
      .maybeSingle();                                             // uno o ninguno
    if (errLectura) return errorInterno(res, errLectura);         // si falló la base: 500
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.id_estado === ESTADO_ANULADO) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });

    // 3. Un Mixto no se puede marcar cobrado si la transferencia todavía no se confirmó
    const faltaTransferencia = pagado && pedido.metodo_pago === 'Mixto' && !pedido.transferencia_confirmada;
    if (faltaTransferencia) {
      return res.status(409).json({
        error: 'No se puede marcar como cobrado: la transferencia de este pedido Mixto todavía no fue confirmada. Confirmala desde Consultar Pedidos.'
      });
    }

    // 4. Se guarda. ".neq" = "distinto de": si justo lo anularon en el medio, no se toca.
    const { data, error } = await supabase                        // pide a la base...
      .from('pedidos')                                            // ...en la tabla de pedidos...
      .update({ pagado: pagado })                                 // ...que cambie si está cobrado...
      .eq('id', id)                                               // ...de este pedido...
      .neq('id_estado', ESTADO_ANULADO)                           // ...solo si no está anulado...
      .select()                                                   // ...y devuelva cómo quedó
      .maybeSingle();                                             // uno o ninguno
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!data) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });  // lo anularon justo

    res.json({ mensaje: 'Pago actualizado', pedido: data });      // listo: el pedido como quedó
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/pedidos/:id/transferencia-confirmada → en un Mixto, registra que la transferencia ya llegó
// ENTRADA: el número de pedido en la dirección
// SALIDA:  { mensaje: 'Transferencia confirmada', pedido } · 400 número inválido · 404 no existe
//          · 409 si está anulado o no es Mixto · 500
// Ej: PUT /api/pedidos/250/transferencia-confirmada → { pedido: { id: 250, transferencia_confirmada: true, … } }
// No toca "pagado": el efectivo del Mixto se cobra al entregar.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/pedidos/:id/transferencia-confirmada', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  // 1. El número de pedido: entero, mayor a 0 y que entre en la base
  const id = Number(req.params.id);
  const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });

  try {
    // 2. El pedido tiene que existir, no estar anulado y ser Mixto
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, id_estado, metodo_pago')
      .eq('id', id)
      .maybeSingle();
    if (errLectura) return errorInterno(res, errLectura);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.id_estado === ESTADO_ANULADO) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });
    if (pedido.metodo_pago !== 'Mixto') {
      return res.status(409).json({ error: 'Solo los pedidos con pago Mixto tienen una transferencia para confirmar.' });
    }

    // 3. Se guarda (solo si no lo anularon justo en el medio)
    const { data, error } = await supabase
      .from('pedidos')
      .update({ transferencia_confirmada: true })
      .eq('id', id)
      .neq('id_estado', ESTADO_ANULADO)
      .select()
      .maybeSingle();
    if (error) return errorInterno(res, error);
    if (!data) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });

    res.json({ mensaje: 'Transferencia confirmada', pedido: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// pesosACentavos → pasa un monto en pesos a centavos (un número entero), para comparar sin errores de redondeo
// ENTRADA: un número o un texto con un número (ej: 137000 o '68500.5')
// SALIDA:  los centavos, redondeados (ej: 13700000 · 6850050). Si no es un número da NaN
// Ej: en JavaScript 0.1 + 0.2 da 0.30000000000000004; en centavos, 10 + 20 = 30 justo.
// La usa PUT /api/pedidos/:id/pago varias veces (por eso es una función aparte y no va adentro de la ruta).
// ─────────────────────────────────────────────────────────────────────────────
function pesosACentavos(monto) {
  return Math.round(Number(monto) * 100);                         // ej: 685.5 → 68550
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/pedidos/:id/pago → guarda el método de pago: Efectivo, Transferencia, Tarjeta Débito,
//                             Tarjeta Crédito o Mixto (Mixto = efectivo + transferencia, sin tarjeta)
// ENTRADA: el número de pedido en la dirección y { metodo_pago, monto_efectivo, monto_transferencia,
//          monto_tarjeta, pago_anticipado } en el body (los montos solo cuentan en el Mixto)
// SALIDA:  { mensaje: 'Método de pago actualizado', pedido } · 400 datos inválidos · 404 no existe
//          · 409 si está anulado · 500
// Ej: pedido #250 de $137.000 en Mixto con 68.500 + 68.500 → guarda los dos montos y 0 en tarjeta.
//     Con 68.500 + 60.000 → 400 'La suma de los montos ($128500) debe ser igual al total del pedido ($137000).'
// Los montos se controlan contra el total de la BASE, nunca contra el que manda la pantalla. Siempre se
// escriben los tres montos (los que no corresponden en 0). pago_anticipado solo puede ser true con Efectivo.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/pedidos/:id/pago', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const metodo_pago = req.body?.metodo_pago;                      // el método elegido
  const monto_efectivo = req.body?.monto_efectivo;                // en el Mixto: lo que se paga en efectivo
  const monto_transferencia = req.body?.monto_transferencia;      // en el Mixto: lo que se paga por transferencia
  const monto_tarjeta = req.body?.monto_tarjeta;                  // en el Mixto tiene que ser 0
  const pago_anticipado = req.body?.pago_anticipado;              // con Efectivo: si pagó antes

  // 1. El número de pedido: entero, mayor a 0 y que entre en la base
  const id = Number(req.params.id);
  const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });

  // 2. El método, de la lista cerrada
  if (!METODOS_PAGO.includes(metodo_pago)) {
    return res.status(400).json({ error: 'Método de pago inválido. Debe ser Efectivo, Transferencia, Tarjeta Débito, Tarjeta Crédito o Mixto.' });
  }

  try {
    // 3. El pedido tiene que existir y no estar anulado. El total sale de la base.
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, total, id_estado')
      .eq('id', id)
      .maybeSingle();
    if (errLectura) return errorInterno(res, errLectura);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.id_estado === ESTADO_ANULADO) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });

    // 4. El Mixto: sin tarjeta, los dos montos mayores a 0 y que sumen justo el total (en centavos)
    const totalCent = pesosACentavos(pedido.total);               // el total de la base
    const esMixto = metodo_pago === 'Mixto';
    const efectivoMixto = pesosACentavos(monto_efectivo);         // lo escrito en efectivo
    const transferenciaMixto = pesosACentavos(monto_transferencia);  // lo escrito en transferencia
    const tarjetaEnMixto = esMixto && pesosACentavos(monto_tarjeta ?? 0) !== 0;  // ?? 0 = si no vino, 0
    if (tarjetaEnMixto) {
      return res.status(400).json({ error: 'El pago mixto solo puede combinar efectivo y transferencia (sin tarjeta).' });
    }
    const montosInvalidos = esMixto && (!Number.isFinite(efectivoMixto) || !Number.isFinite(transferenciaMixto) || efectivoMixto <= 0 || transferenciaMixto <= 0);
    if (montosInvalidos) {
      return res.status(400).json({ error: 'En el pago mixto, los montos en efectivo y en transferencia deben ser mayores a 0.' });
    }
    const sumaDistinta = esMixto && efectivoMixto + transferenciaMixto !== totalCent;
    if (sumaDistinta) {
      return res.status(400).json({
        error: `La suma de los montos ($${(efectivoMixto + transferenciaMixto) / 100}) debe ser igual al total del pedido ($${totalCent / 100}).`
      });
    }

    // 5. Cuánto va en cada forma de pago, según sea el método (una tabla en vez de if / else if)
    const CENTAVOS_POR_METODO = {
      'Efectivo':        { efectivo: totalCent,     transferencia: 0,                  tarjeta: 0 },
      'Transferencia':   { efectivo: 0,             transferencia: totalCent,          tarjeta: 0 },
      'Tarjeta Débito':  { efectivo: 0,             transferencia: 0,                  tarjeta: totalCent },
      'Tarjeta Crédito': { efectivo: 0,             transferencia: 0,                  tarjeta: totalCent },
      'Mixto':           { efectivo: efectivoMixto, transferencia: transferenciaMixto, tarjeta: 0 }
    };
    const centavos = CENTAVOS_POR_METODO[metodo_pago];            // ej: Transferencia de $137.000 → { 0, 13700000, 0 }

    // 6. Se guarda (solo si no lo anularon justo en el medio)
    const { data, error } = await supabase
      .from('pedidos')
      .update({
        metodo_pago:         metodo_pago,
        monto_efectivo:      centavos.efectivo / 100,
        monto_transferencia: centavos.transferencia / 100,
        monto_tarjeta:       centavos.tarjeta / 100,
        pago_anticipado:     metodo_pago === 'Efectivo' && pago_anticipado === true  // true solo con Efectivo
      })
      .eq('id', id)
      .neq('id_estado', ESTADO_ANULADO)
      .select()
      .maybeSingle();

    // 23514 = violación de un CHECK: la base todavía no acepta este valor de metodo_pago
    const metodoNoAceptado = Boolean(error) && error.code === '23514';
    if (metodoNoAceptado) {
      return res.status(400).json({
        error: `La base de datos no acepta el método "${metodo_pago}". Hay que actualizar la restricción (CHECK) de metodo_pago en la tabla pedidos.`
      });
    }
    if (error) return errorInterno(res, error);                   // otro error de la base: 500
    if (!data) return res.status(409).json({ error: 'Un pedido anulado no se puede cobrar' });  // lo anularon justo

    res.json({ mensaje: 'Método de pago actualizado', pedido: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// cambiarEstadoPedido → cambia el estado de un pedido, con lo que pide cada estado
// ENTRADA: pedidoId, nuevoEstado (1 a 4) e idUsuario (quién lo cambia: sale del token)
// SALIDA:  { status: 200, pedido } (el pedido como quedó) · { status: 409, error } si falta un insumo o el
//          pedido está anulado · { status: 500, error } si falló la base
// Ej: pedido #251 (8 fideos de heladera + 2 "sin sal") a 2 → se revisan 600 g de harina y 4 huevos (no se descuentan);
//     a 3 → se descuentan (descontar_insumos_pedido) y todos sus platos quedan listos.
// La usan PUT /api/pedidos/:pedidoId/estado (admin) y PUT /api/pedidos/:id/listo-cocinero (cocina).
// ─────────────────────────────────────────────────────────────────────────────
async function cambiarEstadoPedido(pedidoId, nuevoEstado, idUsuario) {
  // 1. A 2 (En Preparación): ¿alcanzan los insumos de lo que cocina la cocina? Solo lee.
  //    "condición ? await … : null" = solo se consulta si hace falta.
  const errorInsumos = nuevoEstado === 2 ? await verificarStockPedido(pedidoId) : null;
  if (errorInsumos) return errorInsumos;                          // ya viene armado: { status: 409 o 500, error }

  // 2. A 3 o 4: se descuentan los insumos, una sola vez por pedido (lo controla la base)
  const pasaA3o4 = nuevoEstado === 3 || nuevoEstado === 4;
  const errorDescuento = pasaA3o4 ? await descontarStockPedido(pedidoId, idUsuario) : null;
  if (errorDescuento) return errorDescuento;                      // ya viene armado: { status: 409 o 500, error }

  // 3. Cambia el estado SOLO si el pedido no está anulado (.neq = "distinto de"). Las rutas ya lo
  //    controlan antes; esto es por si alguien lo anula justo en el medio: así no "revive".
  //    maybeSingle: si no cambió ninguna fila, data viene vacío (con .single() sería un error 500).
  const { data, error } = await supabase
    .from('pedidos')
    .update({ id_estado: nuevoEstado })
    .eq('id', pedidoId)
    .neq('id_estado', ESTADO_ANULADO)
    .select()
    .maybeSingle();
  if (error) return { status: 500, error: mensajeInterno(error) };
  if (!data) return { status: 409, error: 'Un pedido anulado no cambia de estado' };  // no cambió nada: está anulado

  // 4. Solo a 3: todos los platos quedan listos (la cocina deja de verlos). Si es otro estado, ya está.
  if (nuevoEstado !== 3) return { status: 200, pedido: data };
  const { error: errListo } = await supabase
    .from('pedido_detalles')
    .update({ listo: true })
    .eq('id_pedido', pedidoId);
  // El estado ya cambió, que es lo importante: el pedido sale de cocina igual. Solo se registra.
  if (errListo) console.error('[ESTADO] no se pudieron marcar los platos como listos:', errListo);
  return { status: 200, pedido: data };                           // el pedido como quedó
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pedidos/:id/verificar-stock → ¿alcanzan los insumos para preparar el pedido? Solo lee.
// ENTRADA: el número de pedido en la dirección
// SALIDA:  { ok: true } · { ok: false, error } si falta un insumo · 400 número inválido · 404 no existe · 500
// Ej: pedido con 2 fideos "sin sal" y Huevo en −35 → { ok: false, error: 'Stock insuficiente de "Huevo": se necesitan 4, hay -35 disponibles' }
// La usa la grilla antes de abrir "Confirmar Pago", para no pedir la confirmación si igual no puede pasar a 2.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pedidos/:id/verificar-stock', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  // 1. El número de pedido: entero, mayor a 0 y que entre en la base
  const id = Number(req.params.id);
  const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });

  try {
    // 2. Tiene que existir
    const { data: pedido, error: errLectura } = await supabase
      .from('pedidos')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (errLectura) return errorInterno(res, errLectura);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // 3. ¿Alcanzan los insumos?
    const errorStock = await verificarStockPedido(id);
    if (!errorStock) return res.json({ ok: true });               // alcanza
    if (errorStock.status === 500) return res.status(500).json({ error: errorStock.error });  // falló algo interno (ya está en el log)
    res.json({ ok: false, error: errorStock.error });             // falta un insumo: la grilla muestra el aviso
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/pedidos/:pedidoId/estado → cambia el estado de un pedido (grilla de Consultar Pedidos y Envíos)
// ENTRADA: el número de pedido en la dirección y { estado_id } en el body: 1, 2, 3 o 4 (el 5 va por "Anular")
// SALIDA:  { mensaje: 'Estado actualizado', pedido } (con el estado que quedó guardado) · 400 datos inválidos
//          · 403 cancelar sin PIN o repartidor que no marca Entregado · 404 no existe
//          · 409 anulado o falta un insumo · 500
// Ej: pedido #250 con 10 fideos (todo de heladera) de 1 a 2 → queda en 3: { pedido: { id: 250, id_estado: 3, … } }
//     pedido #251 con 8 fideos + 2 "sin sal" de 1 a 2 → queda en 2 (si alcanzan los insumos)
// Un pedido anulado no cambia más de estado: sus viandas ya volvieron a la heladera.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/pedidos/:pedidoId/estado', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  const pedidoId = Number(req.params.pedidoId);                   // el pedido, de la dirección
  const nuevoEstado = Number(req.body?.estado_id);                // el estado nuevo, del body

  // 1. El número de pedido: entero, mayor a 0 y que entre en la base
  const idInvalido = !Number.isInteger(pedidoId) || pedidoId <= 0 || pedidoId > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });

  // 2. Cancelar (5) solo se puede por POST /anular, que pide el PIN
  if (nuevoEstado === ESTADO_ANULADO) {
    return res.status(403).json({ error: 'Para cancelar un pedido usá "Anular", que pide el PIN de autorización' });
  }

  // 3. El estado nuevo tiene que ser 1, 2, 3 o 4 (includes = "está en la lista". Ej: [1, 2, 3, 4].includes(7) → false)
  if (![1, 2, 3, 4].includes(nuevoEstado)) return res.status(400).json({ error: 'Estado inválido' });

  // 4. El repartidor (rol 3) solo puede marcar un pedido como Entregado (4)
  const repartidorNoEntrega = req.usuario.rol === 3 && nuevoEstado !== 4;
  if (repartidorNoEntrega) return res.status(403).json({ error: 'El repartidor solo puede marcar un pedido como Entregado' });

  try {
    // 5. El pedido tiene que existir (maybeSingle: si no existe, data viene vacío; con .single() sería un 500)
    const { data: pedidoActual, error: errLectura } = await supabase
      .from('pedidos')
      .select('id, id_estado')
      .eq('id', pedidoId)
      .maybeSingle();
    if (errLectura) return errorInterno(res, errLectura);
    if (!pedidoActual) return res.status(404).json({ error: 'Pedido no encontrado' });

    // 6. Un pedido anulado no cambia más de estado. Se corta ANTES de revisar o descontar insumos.
    if (pedidoActual.id_estado === ESTADO_ANULADO) return res.status(409).json({ error: 'Un pedido anulado no cambia de estado' });

    // 7. Nada para cocinar → 3 (paso H5): al pasar de 1 a 2, si TODOS sus platos salen de la heladera
    //    (ninguno va a la cocina), el pedido pasa directo a 3 "Listo para Entregar".
    //    Si quedara en 2, la cocina no lo vería nunca (nace con todo listo) y Envíos solo muestra 3 y 4.
    //    Los platos se piden solo si pasa de 1 a 2 ("condición ? await … : …" = solo se consulta si hace falta).
    const de1a2 = pedidoActual.id_estado === 1 && nuevoEstado === 2;
    const consultaPlatos = de1a2
      ? await supabase.from('pedido_detalles').select('cantidad, cantidad_de_heladera').eq('id_pedido', pedidoId)
      : { data: [], error: null };
    if (consultaPlatos.error) return errorInterno(res, consultaPlatos.error);
    const detalles = consultaPlatos.data || [];                   // los platos del pedido (vacía si no pasa de 1 a 2)

    // Cuántas viandas cocina la cocina: cantidad − cantidad_de_heladera (vacío cuenta como 0),
    // la misma cuenta que verificarStockPedido. Ej: 8 fideos de heladera + 2 "sin sal" → 0 + 2 = 2.
    let viandasACocinar = 0;
    detalles.forEach(detalle => {                                 // por cada plato...
      const aCocinar = Number(detalle.cantidad) - Number(detalle.cantidad_de_heladera ?? 0);  // ...lo que cocina la cocina
      if (aCocinar > 0) viandasACocinar = viandasACocinar + aCocinar;                           // ...se suma
    });

    // Salta solo si tiene platos y la cocina no tiene nada que hacer (un pedido sin platos no salta)
    const todoDeHeladera = de1a2 && detalles.length > 0 && viandasACocinar === 0;
    const estadoFinal = todoDeHeladera ? 3 : nuevoEstado;         // el estado que se va a guardar

    // 8. Se cambia (con los insumos que correspondan). El usuario sale del token.
    const resultado = await cambiarEstadoPedido(pedidoId, estadoFinal, req.usuario.id);
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

    res.json({ mensaje: 'Estado actualizado', pedido: resultado.pedido });  // con el estado que quedó guardado
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/pedidos/:id/listo-cocinero → el cocinero logueado marca SUS platos del pedido como listos.
// El cocinero sale del JWT, no del body. Cuando todos los platos del pedido quedan listos, el pedido
// pasa a 3 (Listo para Entregar) con la misma lógica que usa el admin, incluido el descuento de stock.
// Si falta stock, los platos quedan listos, el pedido sigue en 2 y se avisa (lo resuelve el admin).
app.put('/api/pedidos/:id/listo-cocinero', requireAuth, requireRol(2, 6, 5, 1), async (req, res) => {
  const id = Number(req.params.id);                               // el pedido, de la dirección (Number: "12abc" no pasa)
  const cocineroId = req.usuario.id;                              // el cocinero sale del token, nunca del body

  if (!Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE) {  // entero, mayor a 0 y que entre en la base
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

    const resultado = await cambiarEstadoPedido(id, 3, cocineroId);  // pasa a 3 y descuenta los insumos (queda anotado quién)

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pedidos/:id/anular → anula un pedido (DEVOLVER: el botón "Anular" de Consultar Pedidos, con PIN)
// ENTRADA: el número de pedido en la dirección y { pin } en el body. El usuario que anula sale del token.
// SALIDA:  { mensaje, viandas_devueltas } · 400 número inválido · 403 PIN incorrecto · 409 no existe o ya
//          está anulado · 429 demasiados intentos fallidos (limiteAnular) · 500
// Ej: pedido #250 en 2 con 10 fideos de heladera → { mensaje: 'Pedido anulado. Volvieron 10 viandas a la heladera.',
//     viandas_devueltas: 10 } y fideos 61 → 71. Otra vez → 409 'El pedido ya está anulado'.
// El pedido no se borra: pasa a 5 (Cancelado) con anular_pedido_con_devolucion (sql/heladera.sql), que en 1, 2 o 3
// devuelve a la heladera las viandas que sacó; en 4 (entregado) no devuelve nada.
// El PIN es el de .env (ADMIN_PIN) y se controla acá, nunca en la pantalla.
// Paso H9: misma entrada, misma salida y mismos mensajes; solo se ordenó con pasos y comentarios.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/pedidos/:id/anular', limiteAnular, requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const id = Number(req.params.id);                               // el pedido, de la dirección
  const pin = String(req.body?.pin ?? '');                        // el PIN escrito (vacío si no vino)

  // 1. El número de pedido: entero, mayor a 0 y que entre en la base
  const idInvalido = !Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de pedido inválido' });

  // 2. El PIN del servidor tiene que estar configurado
  const adminPin = process.env.ADMIN_PIN;                         // el PIN de verdad, del .env (nunca se manda a la pantalla)
  if (!adminPin) {
    console.error('[ANULAR pedido] falta ADMIN_PIN en el .env');
    return res.status(500).json({ error: 'El PIN de autorización no está configurado en el servidor' });
  }

  // 3. El PIN escrito tiene que ser igual. Se compara "en tiempo constante" (timingSafeEqual): tarda lo
  //    mismo acierte o no, así nadie puede adivinarlo midiendo cuánto tarda la respuesta.
  const escrito = Buffer.from(pin);                               // el PIN escrito, como bytes
  const verdadero = Buffer.from(adminPin);                        // el PIN de verdad, como bytes
  const pinIncorrecto = escrito.length !== verdadero.length || !crypto.timingSafeEqual(escrito, verdadero);  // (si el largo es distinto, ni se compara)
  if (pinIncorrecto) return res.status(403).json({ error: 'PIN incorrecto' });

  try {
    // 4. La base anula y devuelve las viandas, todo junto o nada
    const { data, error } = await supabase.rpc('anular_pedido_con_devolucion', {
      p_id_pedido:  id,                                           // el pedido
      p_id_usuario: req.usuario.id                                // quién anula (del token)
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // ok: false = no se hizo nada (no existe o ya estaba anulado). El mensaje es el de la base (o uno por si no vino).
    if (!data || !data.ok) return res.status(409).json({ error: data?.error || 'No se pudo anular el pedido' });

    // 5. El mensaje dice cuántas viandas volvieron (0 si estaba entregado o no había sacado de la heladera)
    const devueltas = data.viandas_devueltas;                     // ej: 10
    const conViandas = devueltas === 1 ? 'Pedido anulado. Volvió 1 vianda a la heladera.' : `Pedido anulado. Volvieron ${devueltas} viandas a la heladera.`;
    const mensaje = devueltas >= 1 ? conViandas : 'Pedido anulado correctamente';

    res.json({ mensaje: mensaje, viandas_devueltas: devueltas });
  } catch (e) {
    errorInterno(res, e);
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/estados → los estados de un pedido, en orden (los selects de Consultar Pedidos y Envíos)
// ENTRADA: nada (el usuario logueado, rol 6, 5, 1 o 3)
// SALIDA:  [{ id: 1, nombre: 'Registrado' }, { id: 2, nombre: 'En Preparación' }, …] · 500
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/estados', requireAuth, requireRol(6, 5, 1, 3), async (req, res) => {
  try {
    const { data, error } = await supabase                        // pide a la base...
      .from('estados')                                            // ...la tabla de estados...
      .select('id, nombre')                                       // ...número y nombre...
      .order('id', { ascending: true });                          // ...del 1 al 5
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    res.json(data);                                               // la lista
  } catch (e) {
    errorInterno(res, e);
  }
});
/* ======================================================
   API STOCK
   ====================================================== */
app.get('/api/insumos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  const { data, error } = await supabase
    .from('insumos')
    .select(`
      id, nombre, stock_actual, stock_minimo, unidad_medida, 
      fecha_ingreso, fecha_caducidad, activo, dias_duracion,
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
        id,
        nombre,
        codigo_plan,
        id_categoria,
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
      id:           p.plan.id,                                    // 28/10: para que "Editar" arranque con su plan elegido…
      nombre:       p.plan.nombre,
      codigo:       p.plan.codigo_plan || null,
      id_categoria: p.plan.id_categoria,                          // …y con su categoría
      categoria:    p.plan.categoria ? p.plan.categoria.nombre : null
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
      id_compra, fecha_vencimiento,
      insumos ( id, nombre, unidad_medida ),
      usuarios ( nombre, apellido ),
      compras ( proveedor ),
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
   API COMPRAS
   Una compra = varios insumos que llegaron juntos.
   Se guarda en la función registrar_compra (sql/compras_funciones.sql),
   en una sola transacción: si algo falla, no se guarda nada.
   ====================================================== */

const ROLES_COMPRAS = [6, 5, 1]; // administradores y dueño

// Pasa cada renglón a la unidad base del insumo (g, ml o u), que es lo que
// espera registrar_compra. unidadesPorInsumo: { id_insumo: { nombre, unidad_medida } }.
// Devuelve { items } si todo está bien, o { error } con un mensaje para el usuario.
function convertirItemsCompra(items, unidadesPorInsumo) {
  const itemsConvertidos = [];

  for (const item of items) {
    const insumo = unidadesPorInsumo[item.id_insumo];
    if (!insumo) {
      return { error: `El insumo ${item.id_insumo} no existe` };
    }

    // Misma conversión que un movimiento suelto (ej: 2 kg → 2000 g)
    const conversion = convertirACantidadBase(item.cantidad, item.unidad, insumo.unidad_medida);
    if (conversion.error) {
      return { error: `No se puede cargar "${insumo.nombre}" en ${item.unidad}: ese insumo se mide en ${insumo.unidad_medida}` };
    }

    itemsConvertidos.push({
      id_insumo:         Number(item.id_insumo),
      cantidad:          conversion.cantidadBase,
      fecha_vencimiento: item.fecha_vencimiento || null
    });
  }

  return { items: itemsConvertidos };
}

// POST /api/compras → registra una compra con varios insumos (registrar_compra).
// Body: { fecha?, proveedor?, items: [{ id_insumo, cantidad, unidad, fecha_vencimiento }] }.
// El usuario sale del token.
app.post('/api/compras', requireAuth, requireRol(...ROLES_COMPRAS), async (req, res) => {
  const { fecha, proveedor, items } = req.body;

  // La fecha es opcional, pero si viene tiene que ser AAAA-MM-DD (ej: 2026-10-12)
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'La fecha es inválida' });
  }

  // 1. Tiene que venir una lista con al menos un insumo
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cargá al menos un insumo' });
  }

  // Cada renglón tiene que ser un objeto (ej: { id_insumo: 4, ... }), no null ni un texto
  if (!items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    return res.status(400).json({ error: 'Hay un renglón inválido' });
  }

  // Cada id_insumo tiene que ser un número entero (ej: 4, no "abc" ni 4.5)
  if (!items.every(item => Number.isInteger(Number(item.id_insumo)))) {
    return res.status(400).json({ error: 'Hay un insumo inválido' });
  }

  try {
    // 2. Traer la unidad de medida de todos los insumos de la lista, en una sola consulta
    const ids = items.map(item => Number(item.id_insumo));
    const { data: insumos, error: errInsumos } = await supabase
      .from('insumos')
      .select('id, nombre, unidad_medida')
      .in('id', ids);

    if (errInsumos) return errorInterno(res, errInsumos);

    // Armar un "diccionario" por id para encontrar cada insumo rápido
    const unidadesPorInsumo = {};
    for (const insumo of insumos) {
      unidadesPorInsumo[insumo.id] = insumo;
    }

    // 3. Convertir las cantidades a la unidad base de cada insumo
    const conversion = convertirItemsCompra(items, unidadesPorInsumo);
    if (conversion.error) return res.status(400).json({ error: conversion.error });

    // 4. Guardar todo en la base (valida, crea la compra, los movimientos y suma el stock)
    const { data, error } = await supabase.rpc('registrar_compra', {
      p_id_usuario: req.usuario.id,
      p_fecha:      fecha || null,
      p_proveedor:  proveedor || null,
      p_items:      conversion.items
    });

    if (error) return errorInterno(res, error);

    // ok: false = no se guardó nada (cantidad en 0, insumo inactivo, etc.)
    if (!data || !data.ok) {
      let mensaje = 'No se pudo registrar la compra';
      if (data && data.error) mensaje = data.error;
      return res.status(400).json({ error: mensaje });
    }

    res.status(201).json({ ok: true, id_compra: data.id_compra });
  } catch (e) {
    errorInterno(res, e);
  }
});

/* ======================================================
   API STOCK DE VIANDAS (PRODUCCIÓN)
   Viandas ya cocinadas guardadas en stock (productos.stock_heladera).
   El descarte y el "Hecho" (sql/heladera.sql) y los pedidos a cocina
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

// ─────────────────────────────────────────────────────────────────────────────
// leerItemsViandas → controla la lista de platos de un pedido a cocina y la deja limpia
// ENTRADA: items, lo que mandó el navegador: [{ id_producto, cantidad }] (hasta 100 renglones),
//          con cantidades enteras mayores o iguales a 0 y al menos una mayor a 0
// SALIDA:  { items } limpia (platos repetidos sumados, sin los que quedan en 0, ordenada por id_producto)
//          o { error } con un mensaje para mostrar (la ruta responde 400)
// Ej: [{ id_producto: 7, cantidad: 2 }, { id_producto: 3, cantidad: 0 }, { id_producto: 7, cantidad: 1 }]
//     → { items: [{ id_producto: 7, cantidad: 3 }] }
// La usa solo POST /api/ordenes-produccion.
// ─────────────────────────────────────────────────────────────────────────────
function leerItemsViandas(items) {
  if (!Array.isArray(items) || items.length === 0) {              // tiene que ser una lista con algo adentro
    return { error: 'La lista de platos está vacía' };            // si no: error
  }
  if (items.length > MAXIMO_PLATOS_PEDIDO) {                      // hasta 100 renglones
    return { error: `Un pedido admite hasta ${MAXIMO_PLATOS_PEDIDO} platos` };  // si no: error
  }

  const cantidadPorPlato = {};                                    // { id_producto: cantidad sumada }
  let error = null;                                               // el primer error que se encuentre (null = ninguno)
  items.forEach(item => {                                         // por cada renglón...
    if (error) return;                                            // (return = saltear: ya hubo un error, los demás no se miran)
    if (!item || typeof item !== 'object') {                      // ...tiene que ser un objeto
      error = 'La lista de platos es inválida';                   // si no: se anota el error
      return;                                                     // (return = saltear este renglón)
    }
    const idProducto = Number(item.id_producto);                  // ...el número de plato
    if (!Number.isInteger(idProducto) || idProducto <= 0) {       // ...entero mayor a 0
      error = 'Hay un plato con un identificador inválido';       // si no: se anota el error
      return;                                                     // (return = saltear este renglón)
    }
    const cantidad = leerCantidadViandas(item.cantidad, true);    // ...la cantidad: entero mayor o igual a 0 (null si no)
    if (cantidad === null) {                                      // si no es válida...
      error = 'Cada cantidad tiene que ser un número entero mayor o igual a 0';  // ...se anota el error
      return;                                                     // (return = saltear este renglón)
    }
    const sumada = (cantidadPorPlato[idProducto] || 0) + cantidad;  // ...se suma a lo que ya tenía ese plato
    if (sumada > ENTERO_MAXIMO_BASE) {                            // no puede pasar el tope de la base
      error = 'La cantidad de un plato es demasiado grande';      // si pasa: se anota el error
      return;                                                     // (return = saltear este renglón)
    }
    cantidadPorPlato[idProducto] = sumada;                        // se guarda la suma
  });
  if (error) return { error };                                    // hubo un error: se devuelve ese

  // La lista limpia: un renglón por plato con cantidad mayor a 0.
  // Object.keys da los números de plato que tiene el objeto. Ej: { 7: 3, 3: 0 } → ['3', '7']
  const limpios = [];                                             // arranca vacía
  Object.keys(cantidadPorPlato).forEach(id => {                   // por cada plato...
    const cantidad = cantidadPorPlato[id];                        // ...su cantidad sumada
    if (cantidad === 0) return;                                   // (return = saltear este plato: quedó en 0)
    limpios.push({ id_producto: Number(id), cantidad: cantidad }); // ...se agrega a la lista
  });
  limpios.sort((a, b) => a.id_producto - b.id_producto);          // ordenada por número de plato, de menor a mayor

  if (limpios.length === 0) {                                     // si todos quedaron en 0...
    return { error: 'Cargá al menos un plato con cantidad mayor a 0' };  // ...error
  }
  return { items: limpios };                                      // la lista limpia
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/viandas-stock → los platos activos con sus viandas (pantalla Producción)
// ENTRADA: nada (solo el usuario logueado, con rol 6, 5, 1 o 2)
// SALIDA:  una lista con un objeto por plato activo:
//          { id, nombre, descripcion, stock_heladera, reservadas, en_heladera, stock_minimo, id_plan, plan_nombre, plan_activo, tiene_receta }
//            descripcion    = la frase corta del plato ('' si no tiene): la tabla la muestra debajo del nombre
//            stock_heladera = las LIBRES: las que se pueden vender
//            reservadas     = las que ya son de un pedido en 1, 2 o 3 (todavía no se entregó)
//            en_heladera    = libres + reservadas: lo que hay de verdad en la heladera
//          Ej: fideos con 61 libres y un pedido de 10 fideos en estado 2 →
//              { nombre: 'fideos', stock_heladera: 61, reservadas: 10, en_heladera: 71, stock_minimo: 5, ... }
// La ventana "Pedir a cocina" arma su lista de planes con plan_nombre y plan_activo (así no necesita /api/planes).
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/viandas-stock', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  try {
    // 1. Los platos activos, con su plan y los insumos de su receta
    const { data: platos, error: errPlatos } = await supabase     // pide a la base...
      .from('productos')                                          // ...la tabla de platos
      .select('id, nombre, codigo_plato, descripcion, stock_heladera, stock_minimo, id_plan, planes ( nombre, activo ), producto_insumo ( id_insumo )')  // el plato (con su código y su descripción), su plan y su receta
      .eq('activo', true)                                         // solo los activos
      .order('nombre', { ascending: true });                      // ordenados por nombre
    if (errPlatos) return errorInterno(res, errPlatos);           // si falló la base: 500 con un mensaje simple

    // 2. Las reservadas: los platos de pedidos en 1, 2 o 3 que salieron de la heladera.
    //    Se suma cantidad_de_heladera (NO cantidad): un personalizado tiene 0, porque no salió de la heladera.
    //    "pedidos!inner" = trae solo los renglones cuyo pedido cumple el filtro de estado de abajo.
    const { data: renglones, error: errRenglones } = await supabase  // pide a la base...
      .from('pedido_detalles')                                    // ...los platos de los pedidos
      .select('id_producto, cantidad_de_heladera, pedidos!inner ( id_estado )')  // el plato, cuántas salieron de la heladera y el estado de su pedido
      .gt('cantidad_de_heladera', 0)                              // solo los renglones que sacaron viandas de la heladera
      .in('pedidos.id_estado', [1, 2, 3]);                        // de pedidos que todavía no se entregaron ni se anularon
    if (errRenglones) return errorInterno(res, errRenglones);     // si falló la base: 500

    // 3. Las reservadas de cada plato, en un objeto { id_producto: viandas }.
    //    Ej: [{ id_producto: 7, cantidad_de_heladera: 8 }, { id_producto: 7, cantidad_de_heladera: 10 }] → { 7: 18 }
    const reservadasPorPlato = {};                                // arranca vacío
    (renglones || []).forEach(renglon => {                        // por cada renglón...
      const yaSumadas = reservadasPorPlato[renglon.id_producto] || 0;  // ...lo que ya tenía ese plato (0 la primera vez)
      reservadasPorPlato[renglon.id_producto] = yaSumadas + Number(renglon.cantidad_de_heladera);  // ...más las de este renglón
    });

    // 4. La respuesta: un objeto por plato
    const resultado = [];                                         // la lista que se devuelve
    (platos || []).forEach(plato => {                             // por cada plato activo...
      const planNombre = plato.planes ? plato.planes.nombre : null;           // el nombre de su plan (null si no tiene)
      const planActivo = plato.planes ? Boolean(plato.planes.activo) : false; // si su plan está activo
      const libres = Number(plato.stock_heladera || 0);           // las que se pueden vender
      const reservadas = reservadasPorPlato[plato.id] || 0;       // las de pedidos sin entregar (0 si no hay)
      const tieneReceta = Array.isArray(plato.producto_insumo) && plato.producto_insumo.length > 0;  // si tiene al menos un insumo
      resultado.push({                                            // se agrega a la respuesta:
        id:             plato.id,                                 // número del plato
        nombre:         plato.nombre,                             // su nombre
        codigo_plato:   plato.codigo_plato || null,               // su código (ej: "F3"; 28/10)
        descripcion:    plato.descripcion || '',                  // su descripción ('' si no tiene)
        stock_heladera: libres,                                  // las libres
        reservadas:     reservadas,                               // las reservadas
        en_heladera:    libres + reservadas,                      // lo que hay de verdad en la heladera
        stock_minimo:   Number(plato.stock_minimo || 0),          // el mínimo (0 = sin control)
        id_plan:        plato.id_plan,                            // número de su plan
        plan_nombre:    planNombre,                               // nombre de su plan
        plan_activo:    planActivo,                               // si su plan está activo
        tiene_receta:   tieneReceta                               // si tiene receta
      });
    });

    res.json(resultado);                                          // se manda la lista
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple (el detalle va al log)
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/viandas-stock/:id/minimo → cambia el stock mínimo de un plato (pantalla Producción)
// ENTRADA: el número de plato en la ruta y { stock_minimo } en el body: un entero de 0 a 9999 (0 = "sin control")
// SALIDA:  { mensaje, id, stock_minimo } · 400 si un dato es inválido · 404 si el plato no existe o está desactivado · 500
// Ej: PUT /api/viandas-stock/7/minimo con { stock_minimo: 20 } → { mensaje: 'Mínimo actualizado', id: 7, stock_minimo: 20 }
// Solo lo cambian administradores y dueño (roles 6, 5 y 1). El cocinero lo ve, pero no lo puede cambiar.
// ─────────────────────────────────────────────────────────────────────────────
const ROLES_CAMBIAN_MINIMO = [6, 5, 1];                           // quiénes pueden cambiar el mínimo
const MINIMO_MAXIMO = 9999;                                       // el mínimo más alto que se acepta

app.put('/api/viandas-stock/:id/minimo', requireAuth, requireRol(...ROLES_CAMBIAN_MINIMO), async (req, res) => {
  const idProducto = Number(req.params.id);                       // el número de plato, de la ruta
  const idInvalido = !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE;  // tiene que ser un entero mayor a 0
  if (idInvalido) return res.status(400).json({ error: 'ID de plato inválido' });  // si no: 400

  const minimo = leerCantidadViandas(req.body?.stock_minimo, true);  // el mínimo nuevo: entero mayor o igual a 0 (null si no es válido)
  const minimoInvalido = minimo === null || minimo > MINIMO_MAXIMO;  // vacío, con decimales, negativo o más de 9999
  if (minimoInvalido) return res.status(400).json({ error: `El mínimo tiene que ser un número entero de 0 a ${MINIMO_MAXIMO}` });

  try {
    const { data, error } = await supabase                        // pide a la base...
      .from('productos')                                          // ...en la tabla de platos...
      .update({ stock_minimo: minimo })                           // ...que cambie el mínimo...
      .eq('id', idProducto)                                       // ...de este plato...
      .eq('activo', true)                                         // ...solo si está activo (los desactivados no se tocan)...
      .select('id, stock_minimo')                                 // ...y devuelva cómo quedó
      .maybeSingle();                                             // una fila o ninguna (ninguna = no existe o está desactivado)
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!data) return res.status(404).json({ error: 'El plato no existe o está desactivado' });  // no cambió ninguna fila: 404

    res.json({ mensaje: 'Mínimo actualizado', id: data.id, stock_minimo: data.stock_minimo });  // listo: cómo quedó
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/viandas-stock/descarte → descarta viandas libres de la heladera (DESCARTAR: "Descartar" de Producción)
// ENTRADA: body { id_producto, cantidad, motivo }: plato, entero mayor a 0 y motivo obligatorio (hasta 200).
//          El usuario sale del token.
// SALIDA:  { mensaje: 'Descarte registrado', id_movimiento, stock_heladera } · 400 dato inválido
//          · 409 si la base no lo acepta (no hay tantas libres, no existe) · 500
// Ej: { id_producto: 7, cantidad: 2, motivo: 'vencidas' } → { stock_heladera: 69 } (fideos 71 → 69).
//     Con 80 → 409 'En la heladera hay 71 viandas de «fideos»: no se pueden descartar 80'.
// La base (descartar_viandas, sql/heladera.sql) resta y anota el renglón "descarte" todo junto. No toca insumos.
// Paso H9: misma entrada, misma salida y mismos mensajes. El número de plato ahora también tiene que ser
// mayor a 0 y entrar en la base (antes "-3" llegaba a la base y volvía "El plato no existe"; ahora es un 400).
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/viandas-stock/descarte', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // 1. El plato: entero, mayor a 0 y que entre en la base
  const idProducto = Number(req.body?.id_producto);
  const idInvalido = !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de plato inválido' });

  // 2. La cantidad: entero mayor a 0
  const cantidad = leerCantidadViandas(req.body?.cantidad);
  if (cantidad === null) return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0' });

  // 3. El motivo: obligatorio, hasta 200 caracteres
  const lecturaMotivo = leerMotivoVianda(req.body?.motivo, true);
  if (lecturaMotivo.error) return res.status(400).json({ error: lecturaMotivo.error });

  try {
    // 4. La base descarta, todo junto o nada (vuelve a controlar todo)
    const { data, error } = await supabase.rpc('descartar_viandas', {
      p_id_producto: idProducto,                                  // qué plato
      p_cantidad:    cantidad,                                    // cuántas
      p_id_usuario:  req.usuario.id,                              // quién (del token)
      p_motivo:      lecturaMotivo.motivo                         // por qué
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // ok: false = no se guardó nada (no hay tantas libres, el plato no existe…). El mensaje es el de la base.
    if (!data || !data.ok) return res.status(409).json({ error: data?.error || 'No se pudo registrar el descarte' });

    // 5. Listo: el renglón nuevo y cuántas libres quedaron
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ordenes-produccion → crea un pedido a cocina (botón "Enviar a cocina" de Producción)
// ENTRADA: body { fecha_para: 'AAAA-MM-DD', items: [{ id_producto, cantidad }] }. El usuario sale del token.
// SALIDA:  { mensaje, id_orden } · 400 si un dato está mal o la base no lo acepta (fecha pasada, plato inactivo…) · 500
// Ej: { fecha_para: '2026-10-16', items: [{ id_producto: 7, cantidad: 10 }] } → { mensaje: 'Pedido a cocina creado', id_orden: 10 }
// La base (crear_orden_produccion, en sql/Produccion.sql) guarda el pedido y sus platos todo junto o nada.
// Solo piden administradores y dueño (roles 6, 5 y 1): el cocinero no pide, cocina.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ordenes-produccion', requireAuth, requireRol(...ROLES_PIDEN_COCINA), async (req, res) => {
  const fechaPara = leerFechaPara(req.body.fecha_para);           // la fecha: "AAAA-MM-DD" que exista de verdad (null si no)
  if (fechaPara === null) return res.status(400).json({ error: 'La fecha del pedido es inválida' });  // si no es válida: 400
  const lectura = leerItemsViandas(req.body.items);               // la lista de platos, controlada y limpia
  if (lectura.error) return res.status(400).json({ error: lectura.error });  // si algo está mal: 400 con el motivo

  try {
    const { data, error } = await supabase.rpc('crear_orden_produccion', {  // llama a la función de la base con...
      p_id_usuario: req.usuario.id,                               // ...quién pide (del token, nunca del body)
      p_fecha_para: fechaPara,                                    // ...para cuándo
      p_items:      lectura.items                                 // ...qué platos y cuántos
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500 con un mensaje simple

    // ok: false = la base no guardó nada (fecha pasada, plato inactivo, etc.): 400 con el mensaje de la base
    // (?. = "si vino data, su error"; || = si no mandó ninguno, este)
    if (!data || !data.ok) return res.status(400).json({ error: data?.error || 'No se pudo crear el pedido a cocina' });

    res.json({ mensaje: 'Pedido a cocina creado', id_orden: data.id_orden });  // listo: el número del pedido a cocina
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-produccion/pendientes → los platos pedidos a cocina que todavía no están hechos
//                                         ("Pendientes de cocina" de Producción y "Para stock" de Tareas de Cocina)
// ENTRADA: nada (el usuario logueado). Un cocinero (rol 2) ve los que le tocan (cocinero del plato o, si no tiene,
//          principal o suplente del plan) y los que no tienen a nadie. Los demás roles ven todo.
// SALIDA:  [{ id, id_cocinero, id_orden, fecha_para, fecha_pedido, pidio, plato, plan, cantidad, cocinero }], ordenados
//          por fecha_para, número de pedido a cocina y plato · 500
// Ej: [{ id: 21, id_orden: 9, fecha_para: '2026-10-16', fecha_pedido: '2026-10-15T13:05:00+00:00', pidio: 'Mauri',
//        plato: 'fideos', plan: 'Mantenimiento', cantidad: 2, cocinero: 'Ana López' }]
// El id_cocinero del renglón es solo para mostrar (agrupar por cocinero).
// 28/10 (Tareas de Cocina nueva): se suman fecha_pedido (cuándo se pidió) y pidio (quién lo pidió), solo para mostrar.
// 28/10 (código de plato): también el codigo_plato de cada plato (ej: "F3").
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/ordenes-produccion/pendientes', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  try {
    // 1. Los platos de pedidos a cocina sin hacer, con su pedido (y quién lo pidió), su plato, su plan y su cocinero
    const { data, error } = await supabase                        // pide a la base...
      .from('orden_produccion_detalles')                          // ...los platos de los pedidos a cocina...
      .select(`
        id, cantidad, id_cocinero,
        ordenes_produccion ( id, fecha_para, fecha_pedido, pidio:usuarios!id_usuario ( nombre, apellido ) ),
        productos ( nombre, codigo_plato, id_cocinero, planes ( nombre, id_cocinero, id_cocinero_suplente ) ),
        cocinero:usuarios!id_cocinero ( nombre, apellido )
      `)                                                          // ...con su pedido, plato, plan y cocinero...
      .eq('hecho', false);                                        // ...los que no están hechos
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // 2. Un objeto por plato (el cocinero ve solo lo suyo y lo que no tiene a nadie)
    const esCocinero = Number(req.usuario.rol) === 2;             // si el que mira es un cocinero
    const resultado = [];                                         // la lista que se devuelve
    (data || []).forEach(detalle => {                             // por cada plato pendiente...
      const loPuedeVer = Boolean(detalle.productos) && platoVisibleParaCocinero(detalle.productos, req.usuario.id);  // ¿es suyo o no tiene cocinero?
      const ocultoAlCocinero = esCocinero && !loPuedeVer;         // un cocinero no ve los platos de otro cocinero
      if (ocultoAlCocinero) return;                               // (return = saltear este plato y seguir con el siguiente)
      const plato = detalle.productos ? detalle.productos.nombre : null;                 // el nombre del plato (null si no vino)
      const plan = detalle.productos?.planes ? detalle.productos.planes.nombre : null;   // el de su plan (?. = "si vino el plato, su plan")
      const asignado = detalle.cocinero;                          // el cocinero asignado (o null)
      const cocinero = asignado ? ((asignado.nombre || '') + ' ' + (asignado.apellido || '')).trim() : null;  // "Ana López" (trim saca el espacio de más)
      const quienPidio = detalle.ordenes_produccion.pidio;        // el usuario que hizo el pedido a cocina (o null)
      const pidio = quienPidio ? ((quienPidio.nombre || '') + ' ' + (quienPidio.apellido || '')).trim() : null;  // "Mauri"
      resultado.push({                                            // se agrega a la respuesta:
        id:           detalle.id,                                 // número del renglón (el botón "Hecho" lo usa)
        id_cocinero:  detalle.id_cocinero,                        // para agrupar por cocinero
        id_orden:     detalle.ordenes_produccion.id,              // número del pedido a cocina
        fecha_para:   detalle.ordenes_produccion.fecha_para,      // para cuándo
        fecha_pedido: detalle.ordenes_produccion.fecha_pedido,    // cuándo se pidió (solo para mostrar)
        pidio:        pidio,                                      // quién lo pidió (solo para mostrar)
        plato:       plato,                                       // el plato
        codigo_plato: detalle.productos ? detalle.productos.codigo_plato : null,  // su código (ej: "F3"; 28/10)
        plan:        plan,                                        // su plan
        cantidad:    detalle.cantidad,                            // cuántas viandas
        cocinero:    cocinero                                     // quién lo cocina
      });
    });

    // 3. Por fecha_para, después por número de pedido a cocina y después por plato. Supabase no ordena
    //    la lista principal por columnas de otra tabla, así que se ordena acá ("AAAA-MM-DD" se compara como texto).
    //    sort recibe una función que compara dos renglones: negativo = a va antes, positivo = b va antes.
    resultado.sort((a, b) => {
      if (a.fecha_para !== b.fecha_para) return a.fecha_para.localeCompare(b.fecha_para);  // primero lo más urgente
      if (a.id_orden !== b.id_orden) return a.id_orden - b.id_orden;                      // después por pedido a cocina
      return (a.plato || '').localeCompare(b.plato || '', 'es');                          // y por nombre del plato
    });

    res.json(resultado);                                          // la lista
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ordenes-produccion/detalles/:id/hecho → la cocina terminó un plato de un pedido a cocina (PRODUCIR)
// ENTRADA: el número del renglón del pedido a cocina en la dirección. El usuario sale del token.
// SALIDA:  { mensaje: 'Plato marcado como hecho', stock_heladera, avisos } · 400 número inválido
//          · 403 un cocinero que no tiene ese plato · 404 no existe (cocinero) · 409 ya estaba hecho o no existe · 500
// Ej: "Pedido a cocina #9: 2 fideos" → { stock_heladera: 73, avisos: [] } (fideos 71 → 73, harina −600 g, huevo −4 u).
//     Si el huevo no alcanza → se marca igual y vuelve el aviso { tipo: 'insumo_corto', nombre: 'Huevo', falta: 39, … }.
// Lo hace la base (producir_viandas, sql/heladera.sql), todo junto. Un cocinero solo marca lo que le corresponde.
// Paso H9: misma entrada, misma salida y mismos mensajes; solo se ordenó con pasos y comentarios.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ordenes-produccion/detalles/:id/hecho', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // 1. El renglón: entero, mayor a 0 y que entre en la base
  const idDetalle = Number(req.params.id);
  const idInvalido = !Number.isInteger(idDetalle) || idDetalle <= 0 || idDetalle > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'ID de plato del pedido inválido' });

  try {
    // 2. Un cocinero solo marca lo que le corresponde (los demás roles, cualquiera).
    //    El plato se busca solo si es un cocinero ("condición ? await … : …" = solo se consulta si hace falta).
    const esCocinero = Number(req.usuario.rol) === 2;
    const consultaDetalle = esCocinero
      ? await supabase
        .from('orden_produccion_detalles')
        .select('id, productos ( id_cocinero, planes ( id_cocinero, id_cocinero_suplente ) )')
        .eq('id', idDetalle)
        .maybeSingle()
      : { data: null, error: null };
    if (consultaDetalle.error) return errorInterno(res, consultaDetalle.error);
    const detalle = consultaDetalle.data;                         // el renglón (solo si es un cocinero)
    const noExiste = esCocinero && !detalle;                      // el cocinero pidió un renglón que no existe
    if (noExiste) return res.status(404).json({ error: 'El plato del pedido no existe' });
    const noLeCorresponde = esCocinero && (!detalle.productos || !platoVisibleParaCocinero(detalle.productos, req.usuario.id));
    if (noLeCorresponde) return res.status(403).json({ error: 'Este plato no te corresponde' });

    // 3. La base produce, todo junto o nada: viandas a la heladera, insumos y renglón "produccion"
    const { data, error } = await supabase.rpc('producir_viandas', {
      p_id_detalle: idDetalle,                                    // qué renglón del pedido a cocina
      p_id_usuario: req.usuario.id                                // quién toca "Hecho" (del token)
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // ok: false = no se hizo nada (no existe o ya estaba hecho): 409 con el mensaje de la base
    if (!data || !data.ok) return res.status(409).json({ error: data?.error || 'No se pudo marcar el plato como hecho' });

    // 4. Listo: cuántas hay ahora y los avisos (si faltó un insumo o el plato no tiene receta)
    const avisos = Array.isArray(data.avisos) ? data.avisos : [];  // la lista de avisos (vacía si no vino)
    res.json({ mensaje: 'Plato marcado como hecho', stock_heladera: data.stock_heladera, avisos: avisos });
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-produccion/hechos-hoy → lo que la cocina marcó "Hecho" hoy (panel "Hecho hoy" de Producción)
// ENTRADA: nada (el usuario logueado). Un cocinero (rol 2) ve solo sus platos y los que no tienen cocinero.
// SALIDA:  [{ id, id_orden, plato, plan, cantidad, marcado_por, fecha_hecho }], del más nuevo al más viejo
//          28/10 (código de plato): cada uno trae también su codigo_plato (ej: "F3").
// Ej: [{ id: 21, id_orden: 9, plato: 'fideos', plan: 'Mantenimiento', cantidad: 2, marcado_por: 'Ana López', fecha_hecho: '2026-10-15T17:32:00+00:00' }]
// "Hoy" es el día de Argentina (de 00:00 a 24:00 en -03:00; no hay horario de verano), sin importar la hora del servidor.
// Quién lo marcó sale del renglón "produccion" del cuaderno que generó ese "Hecho".
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/ordenes-produccion/hechos-hoy', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // 1. Hoy y mañana en Argentina, como "AAAA-MM-DD"
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());  // "en-CA" escribe AAAA-MM-DD. Ej: '2026-10-15'
  const partes = hoy.split('-');                                  // separa año, mes y día. Ej: ['2026', '10', '15']
  const manana = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]) + 1))  // el día siguiente (en Date.UTC los meses van de 0 a 11)...
    .toISOString().slice(0, 10);                                  // ...como "AAAA-MM-DD". Ej: '2026-10-16'
  const desde = hoy + 'T00:00:00-03:00';                          // hoy a las 00:00 de Argentina
  const hasta = manana + 'T00:00:00-03:00';                       // mañana a las 00:00 de Argentina

  try {
    // 2. Los platos de pedidos a cocina marcados hechos hoy, con su plato, su plan y quién los marcó
    const { data, error } = await supabase                        // pide a la base...
      .from('orden_produccion_detalles')                          // ...los platos de los pedidos a cocina
      .select(`
        id, cantidad, fecha_hecho, id_orden_produccion,
        productos ( nombre, codigo_plato, id_cocinero, planes ( nombre, id_cocinero, id_cocinero_suplente ) ),
        movimiento:movimientos_viandas!id_movimiento_vianda ( usuarios ( nombre, apellido ) )
      `)                                                          // el renglón, su plato y plan, y el usuario del renglón "produccion"
      .eq('hecho', true)                                          // solo los hechos
      .gte('fecha_hecho', desde)                                  // desde hoy a las 00:00...
      .lt('fecha_hecho', hasta)                                   // ...hasta antes de mañana a las 00:00
      .order('fecha_hecho', { ascending: false });                // del más nuevo al más viejo
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // 3. La respuesta: un objeto por plato hecho
    const esCocinero = Number(req.usuario.rol) === 2;             // si el que mira es un cocinero
    const resultado = [];                                         // la lista que se devuelve
    (data || []).forEach(detalle => {                             // por cada plato hecho...
      const loPuedeVer = Boolean(detalle.productos) && platoVisibleParaCocinero(detalle.productos, req.usuario.id);  // ¿es suyo o no tiene cocinero?
      const ocultoAlCocinero = esCocinero && !loPuedeVer;         // un cocinero no ve los platos de otro cocinero
      if (ocultoAlCocinero) return;                               // (return = saltear este plato y seguir con el siguiente)
      const plato = detalle.productos ? detalle.productos.nombre : null;                 // el nombre del plato (null si no vino)
      const plan = detalle.productos?.planes ? detalle.productos.planes.nombre : null;   // el de su plan (?. = "si vino el plato, su plan")
      const quien = detalle.movimiento ? detalle.movimiento.usuarios : null;             // el usuario del renglón "produccion" (o null)
      const marcadoPor = quien ? ((quien.nombre || '') + ' ' + (quien.apellido || '')).trim() : null;  // "Ana López" (trim saca el espacio de más)
      resultado.push({                                            // se agrega a la respuesta:
        id:          detalle.id,                                  // número del renglón
        id_orden:    detalle.id_orden_produccion,                 // número del pedido a cocina
        plato:       plato,                                       // el plato
        codigo_plato: detalle.productos ? detalle.productos.codigo_plato : null,  // su código (ej: "F3"; 28/10)
        plan:        plan,                                        // su plan
        cantidad:    detalle.cantidad,                            // cuántas viandas
        marcado_por: marcadoPor,                                  // quién tocó "Hecho"
        fecha_hecho: detalle.fecha_hecho                          // cuándo
      });
    });

    res.json(resultado);                                          // se manda la lista
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-produccion/:id → un pedido a cocina con TODOS sus platos, hechos y sin hacer
//                                   (ventana "Detalles" de "Para stock" en Tareas de Cocina). Solo lee: no cambia nada.
// ENTRADA: el número del pedido a cocina en la dirección. El usuario sale del token.
//          Un cocinero (rol 2) ve solo los platos que le tocan y los que no tienen a nadie (la regla de siempre).
// SALIDA:  { id, fecha_pedido, fecha_para, pidio, platos: [{ id, plato, plan, cantidad, hecho }] }
//          28/10 (código de plato): cada plato trae también su codigo_plato (ej: "F3").
//          · 400 número inválido · 404 no existe (o el cocinero no tiene ningún plato ahí) · 500
// Ej: /api/ordenes-produccion/112 → { id: 112, fecha_pedido: '2026-10-24T13:05:00+00:00', fecha_para: '2026-10-25',
//        pidio: 'Mauri', platos: [{ id: 301, plato: 'Canelones de verdura', plan: 'Keto', cantidad: 12, hecho: false }, …] }
// Va DESPUÉS de /pendientes y /hechos-hoy: así esas dos direcciones no se toman como un número.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/ordenes-produccion/:id', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // 1. El número: entero, mayor a 0 y que entre en la base (Number: "12abc" no pasa)
  const idOrden = Number(req.params.id);
  const idInvalido = !Number.isInteger(idOrden) || idOrden <= 0 || idOrden > ENTERO_MAXIMO_BASE;
  if (idInvalido) return res.status(400).json({ error: 'Número de pedido a cocina inválido' });

  try {
    // 2. El pedido a cocina, quién lo pidió y todos sus platos (con su plan y sus cocineros, para la regla del cocinero)
    const { data, error } = await supabase                        // pide a la base...
      .from('ordenes_produccion')                                 // ...el pedido a cocina...
      .select(`
        id, fecha_pedido, fecha_para,
        pidio:usuarios!id_usuario ( nombre, apellido ),
        orden_produccion_detalles (
          id, cantidad, hecho,
          productos ( nombre, codigo_plato, id_cocinero, planes ( nombre, id_cocinero, id_cocinero_suplente ) )
        )
      `)                                                          // ...con quién lo pidió y sus platos...
      .eq('id', idOrden)                                          // ...el de este número
      .maybeSingle();                                             // (uno solo, o null si no existe)
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!data) return res.status(404).json({ error: 'El pedido a cocina no existe' });  // no existe: 404

    // 3. Un objeto por plato (el cocinero ve solo lo suyo y lo que no tiene a nadie)
    const esCocinero = Number(req.usuario.rol) === 2;             // si el que mira es un cocinero
    const platos = [];                                            // los platos que se devuelven
    (data.orden_produccion_detalles || []).forEach(detalle => {   // por cada plato del pedido...
      const loPuedeVer = Boolean(detalle.productos) && platoVisibleParaCocinero(detalle.productos, req.usuario.id);  // ¿es suyo o no tiene cocinero?
      const ocultoAlCocinero = esCocinero && !loPuedeVer;         // un cocinero no ve los platos de otro cocinero
      if (ocultoAlCocinero) return;                               // (return = saltear este plato y seguir con el siguiente)
      const plato = detalle.productos ? detalle.productos.nombre : null;                 // el nombre del plato (null si no vino)
      const plan = detalle.productos?.planes ? detalle.productos.planes.nombre : null;   // el de su plan (?. = "si vino el plato, su plan")
      platos.push({                                               // se agrega:
        id:       detalle.id,                                     // número del renglón
        plato:    plato,                                          // el plato
        codigo_plato: detalle.productos ? detalle.productos.codigo_plato : null,  // su código (ej: "F3"; 28/10)
        plan:     plan,                                           // su plan
        cantidad: detalle.cantidad,                               // cuántas viandas
        hecho:    detalle.hecho                                   // si ya está hecho
      });
    });
    if (platos.length === 0) return res.status(404).json({ error: 'El pedido a cocina no existe' });  // un cocinero sin platos ahí: como si no existiera

    // 4. En el orden en que se cargaron (sort: negativo = a va antes)
    platos.sort((a, b) => a.id - b.id);

    const quienPidio = data.pidio;                                // el usuario que hizo el pedido (o null)
    const pidio = quienPidio ? ((quienPidio.nombre || '') + ' ' + (quienPidio.apellido || '')).trim() : null;  // "Mauri"
    res.json({                                                    // la respuesta:
      id:           data.id,                                      // el número del pedido a cocina
      fecha_pedido: data.fecha_pedido,                            // cuándo se pidió
      fecha_para:   data.fecha_para,                              // para cuándo
      pidio:        pidio,                                        // quién lo pidió
      platos:       platos                                        // sus platos
    });
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/movimientos-viandas → los renglones del cuaderno de la heladera, del más nuevo al más viejo, de a 50
//                                (panel "Últimos movimientos" de Producción)
// ENTRADA: ?tipo=  (opcional) produccion, venta, devolucion, descarte o ajuste. Sin tipo = todos.
//          ?desde= (opcional) cuántos saltear, para "Ver más": 0, 50, 100… Sin desde = 0.
// SALIDA:  hasta 50 renglones: [{ id, tipo, cantidad, motivo, fecha, plato_nombre, usuario_nombre }]
//          · 400 si tipo o desde son inválidos · 500 error interno
// Ej: ?tipo=venta → [{ id: 140, tipo: 'venta', cantidad: -10, motivo: 'Pedido #251', fecha: '…',
//                      plato_nombre: 'fideos', usuario_nombre: 'Consumidor Final' }, …]
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS_MOVIMIENTO_VIANDA = ['produccion', 'venta', 'devolucion', 'descarte', 'ajuste'];  // los 5 tipos que acepta el cuaderno
const MOVIMIENTOS_POR_PAGINA = 50;                                // cuántos renglones se mandan por vez

app.get('/api/movimientos-viandas', requireAuth, requireRol(...ROLES_HELADERA), async (req, res) => {
  // 1. El tipo: vacío (todos) o uno de la lista cerrada. La consulta nunca se arma con el texto que llegó.
  const vinoTipo = req.query.tipo != null && req.query.tipo !== '';  // ¿se eligió un tipo?
  const tipo = vinoTipo ? String(req.query.tipo) : '';            // el tipo como texto ('' = todos)
  const tipoInvalido = vinoTipo && !TIPOS_MOVIMIENTO_VIANDA.includes(tipo);  // tiene que ser uno de los 5 (includes = "está en la lista")
  if (tipoInvalido) return res.status(400).json({ error: 'Tipo de movimiento inválido' });

  // 2. Desde: cuántos renglones saltear. Entero mayor o igual a 0 (vacío = 0)
  const vinoDesde = req.query.desde != null && req.query.desde !== '';  // ¿vino "desde"?
  const desde = vinoDesde ? leerCantidadViandas(req.query.desde, true) : 0;  // entero mayor o igual a 0 (null si no es válido)
  if (desde === null) return res.status(400).json({ error: 'El valor de "desde" es inválido' });

  try {
    // 3. La consulta: los renglones con su plato y quién los anotó, del más nuevo al más viejo
    let consulta = supabase                                       // arma el pedido a la base...
      .from('movimientos_viandas')                                // ...el cuaderno de la heladera
      .select('id, tipo, cantidad, motivo, fecha, productos ( nombre ), usuarios ( nombre, apellido )')  // el renglón, su plato y quién lo anotó
      .order('fecha', { ascending: false })                       // del más nuevo al más viejo
      .order('id', { ascending: false })                          // si dos tienen la misma fecha, primero el de número más alto
      .range(desde, desde + MOVIMIENTOS_POR_PAGINA - 1);          // range = del renglón "desde" al "desde + 49". Ej: (50, 99) → del 51.º al 100.º
    if (tipo) consulta = consulta.eq('tipo', tipo);               // solo ese tipo, si se eligió uno
    const { data, error } = await consulta;                       // se hace la consulta
    if (error) return errorInterno(res, error);                   // si falló la base: 500

    // 4. La respuesta: un objeto por renglón
    const resultado = [];                                         // la lista que se devuelve
    (data || []).forEach(movimiento => {                          // por cada renglón...
      const platoNombre = movimiento.productos ? movimiento.productos.nombre : '-';  // ...el nombre del plato ("-" si no vino)
      const quien = movimiento.usuarios;                          // ...quién lo anotó (o null)
      const usuarioNombre = quien ? ((quien.nombre || '') + ' ' + (quien.apellido || '')).trim() : '-';  // "Consumidor Final" ("-" si no vino)
      resultado.push({                                            // se agrega a la respuesta:
        id:             movimiento.id,                            // número del renglón
        tipo:           movimiento.tipo,                          // produccion, venta, devolucion, descarte o ajuste
        cantidad:       movimiento.cantidad,                      // + entran, − salen
        motivo:         movimiento.motivo,                        // ej: "Pedido #251"
        fecha:          movimiento.fecha,                         // cuándo
        plato_nombre:   platoNombre,                              // el plato
        usuario_nombre: usuarioNombre                             // quién
      });
    });

    res.json(resultado);                                          // se manda la lista
  } catch (e) {                                                   // si algo falló de golpe...
    errorInterno(res, e);                                         // ...500 con un mensaje simple
  }
});

/* ======================================================
   MOVIMIENTOS DE STOCK, TODO JUNTO (paso H8, parada 3C)
   Insumos (movimientos_stock) y viandas (movimientos_viandas) en una sola lista:
   una fila por cada cosa que pasó (una compra, un "Hecho", una venta, una devolución, un descarte,
   lo que gastó la cocina en un pedido o un ajuste a mano). Solo lee: no cambia nada en la base.
   ====================================================== */

const FILAS_POR_VUELTA = 1000;                                    // Supabase manda como mucho 1000 renglones por consulta
const TOPE_FILAS_MOVIMIENTOS = 20000;                             // más que esto por libreta = "elegí menos días"

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
// traerTodasLasFilas → trae TODOS los renglones de una libreta entre dos fechas, de a 1000
//                      (Supabase manda como mucho 1000 por consulta)
// ENTRADA: tabla ('movimientos_stock' o 'movimientos_viandas', la pone el servidor, nunca la pantalla),
//          columnas (qué traer) y desdeISO / hastaISO (fecha y hora con -03:00; null = sin límite)
// SALIDA:  { filas } con todos los renglones, del más nuevo al más viejo y sin repetir
//          · { error } si falló la base · { demasiadas: true } si pasa el tope de 20.000
// Ej: 2.350 renglones → 3 vueltas: del 0 al 999, del 1000 al 1999 y del 2000 al 2349 (vinieron 350: no hay más).
// La usa GET /api/movimientos.
// ─────────────────────────────────────────────────────────────────────────────
async function traerTodasLasFilas(tabla, columnas, desdeISO, hastaISO) {
  const filas = [];                                               // todos los renglones juntos
  const vistos = {};                                              // { id: true }: si entra uno nuevo mientras se pide, no se repite
  let desde = 0;                                                  // desde qué renglón se pide en cada vuelta
  let hayMas = true;                                              // ¿puede haber más?

  // while = "mientras": repite el bloque mientras hayMas sea true. No es recorrer una lista:
  // no se sabe de antemano cuántas vueltas hacen falta.
  while (hayMas) {
    // 1. La consulta: siempre en el mismo orden (si no, una vuelta podría repetir o saltear renglones)
    let consulta = supabase                                       // arma el pedido a la base...
      .from(tabla)                                                // ...la libreta...
      .select(columnas)                                           // ...con estas columnas...
      .order('fecha', { ascending: false })                       // ...del más nuevo al más viejo...
      .order('id', { ascending: false });                         // ...y si empatan, por número
    if (desdeISO) consulta = consulta.gte('fecha', desdeISO);     // desde esa hora (incluida)
    if (hastaISO) consulta = consulta.lt('fecha', hastaISO);      // hasta antes de esa hora

    // 2. Esta vuelta: del renglón "desde" al "desde + 999"
    const { data, error } = await consulta.range(desde, desde + FILAS_POR_VUELTA - 1);
    if (error) return { error: error };                           // si falló la base: se avisa

    // 3. Se agregan los que no estaban
    const vuelta = data || [];                                    // los renglones de esta vuelta
    vuelta.forEach(fila => {                                      // por cada uno...
      if (vistos[fila.id]) return;                                // (return = saltear: ya estaba)
      vistos[fila.id] = true;                                     // ...se anota...
      filas.push(fila);                                           // ...y se agrega
    });
    if (filas.length > TOPE_FILAS_MOVIMIENTOS) return { demasiadas: true };  // demasiados: se corta

    // 4. ¿Hay más? Si vinieron 1000 puede haber más; si vinieron menos, ya está
    hayMas = vuelta.length === FILAS_POR_VUELTA;
    desde = desde + FILAS_POR_VUELTA;                             // la próxima vuelta arranca 1000 más abajo
  }

  return { filas: filas };                                        // todos los renglones
}

// ─────────────────────────────────────────────────────────────────────────────
// armarMovimientos → junta los renglones de las dos libretas en MOVIMIENTOS (una fila por cosa que pasó)
// ENTRADA: filasViandas (renglones de movimientos_viandas) y filasStock (renglones de movimientos_stock),
//          con sus datos unidos (plato, insumo, usuario, compra, pedido, pedido a cocina)
// SALIDA:  [{ clave, origen, tipo, fecha, numero, usuario, proveedor, motivo, cliente, pidio, insumos, viandas }],
//          del más nuevo al más viejo
//            origen  = 'compra' · 'produccion' · 'venta' · 'devolucion' · 'descarte' · 'cocina' · 'ajuste'
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
    // a. ¿Es lo que gastó la cocina en un pedido? Los nuevos tienen id_pedido; los viejos, el motivo EXACTO.
    //    exec busca el texto: ^ y $ = tiene que ser el motivo entero; (\d+) = el número. Ej: '…pedido #005' → ['…', '005']
    const motivoDePedido = /^Consumo por producción pedido #(\d+)$/.exec(fila.motivo || '');
    const pedidoDelMotivo = motivoDePedido ? Number(motivoDePedido[1]) : null;  // '005' → 5 (null si no es de un pedido)
    const idPedido = fila.id_pedido || pedidoDelMotivo;           // primero id_pedido; si no, el del motivo

    // b. A qué movimiento pertenece: se elige el primero que corresponde, en este orden
    //    (compra, después "Hecho", después pedido; si no es ninguno, lo cargado a mano es un ajuste)
    let datos = null;
    if (fila.id_compra) datos = { clave: 'compra-' + fila.id_compra, origen: 'compra', tipo: 'entrada', numero: fila.id_compra };
    if (!datos && fila.id_movimiento_vianda) datos = { clave: 'produccion-' + fila.id_movimiento_vianda, origen: 'produccion', tipo: 'entrada', numero: null };
    if (!datos && idPedido) datos = { clave: 'cocina-' + idPedido + '-' + fila.fecha, origen: 'cocina', tipo: 'salida', numero: idPedido };
    if (!datos) datos = { clave: 'ajuste-insumo-' + fila.id, origen: 'ajuste', tipo: fila.tipo === 'entrada' ? 'entrada' : 'salida', numero: null };

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/movimientos → TODO lo que entró y salió, insumos y viandas juntos (pantalla Movimientos de Stock)
// ENTRADA: ?desde=AAAA-MM-DD y ?hasta=AAAA-MM-DD (opcionales; días de Argentina, los dos incluidos)
// SALIDA:  la lista de armarMovimientos, del más nuevo al más viejo · 400 si una fecha es inválida, si "desde"
//          es mayor que "hasta" o si hay demasiados renglones · 500
// Ej: ?desde=2026-10-15&hasta=2026-10-15 → la compra #2 (6 insumos), el "Hecho" de 2 fideos del pedido a cocina #9
//     (2 viandas · 2 insumos), la venta del pedido #250 (18 viandas), …
// Solo lee. La pantalla dibuja una fila por movimiento con su Detalle (Ver / Ocultar) y filtra.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/movimientos', requireAuth, requireRol(6, 5, 1), async (req, res) => {
  // 1. Las fechas (opcionales): AAAA-MM-DD que existan de verdad (leerFechaPara rechaza 2026-02-30)
  const vinoDesde = req.query.desde != null && req.query.desde !== '';
  const vinoHasta = req.query.hasta != null && req.query.hasta !== '';
  const desde = vinoDesde ? leerFechaPara(req.query.desde) : null;  // null = desde el principio
  const hasta = vinoHasta ? leerFechaPara(req.query.hasta) : null;  // null = hasta ahora
  const desdeInvalida = vinoDesde && desde === null;              // vino y no es una fecha de verdad
  if (desdeInvalida) return res.status(400).json({ error: 'La fecha "desde" es inválida' });
  const hastaInvalida = vinoHasta && hasta === null;
  if (hastaInvalida) return res.status(400).json({ error: 'La fecha "hasta" es inválida' });
  const fechasAlReves = desde && hasta && desde > hasta;          // "AAAA-MM-DD" se compara como texto
  if (fechasAlReves) return res.status(400).json({ error: 'La fecha "desde" no puede ser mayor que "hasta"' });

  // 2. Las horas: desde las 00:00 de "desde" hasta antes de las 00:00 del día después de "hasta" (en Argentina)
  const partes = hasta ? hasta.split('-') : null;                 // ej: ['2026', '10', '15']
  const diaSiguiente = partes                                     // el día después de "hasta" (en Date.UTC los meses van de 0 a 11)
    ? new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]) + 1)).toISOString().slice(0, 10)
    : null;                                                       // ej: '2026-10-16'
  const desdeISO = desde ? desde + 'T00:00:00' + OFFSET_ARGENTINA : null;               // ej: '2026-10-15T00:00:00-03:00'
  const hastaISO = diaSiguiente ? diaSiguiente + 'T00:00:00' + OFFSET_ARGENTINA : null;  // ej: '2026-10-16T00:00:00-03:00'

  try {
    // 3. Las viandas, con su plato, quién, el cliente (ventas) y el pedido a cocina con quién lo pidió (producción).
    //    "pedidos!id_pedido" = el pedido de la columna id_pedido (se aclara la columna por si hay más de un camino).
    const viandas = await traerTodasLasFilas('movimientos_viandas',
      'id, tipo, cantidad, motivo, fecha, id_pedido, productos ( nombre ), usuarios ( nombre, apellido ), ' +
      'pedidos!id_pedido ( cliente_nombre ), ' +
      'orden_produccion_detalles ( id_orden_produccion, ordenes_produccion ( usuarios ( nombre, apellido ) ) )',
      desdeISO, hastaISO);
    if (viandas.error) return errorInterno(res, viandas.error);
    if (viandas.demasiadas) return res.status(400).json({ error: 'Hay demasiados movimientos en esas fechas: elegí menos días' });

    // 4. Los insumos, con su nombre y unidad, quién, y el proveedor (compras)
    const stock = await traerTodasLasFilas('movimientos_stock',
      'id, tipo, cantidad, unidad, motivo, fecha, fecha_vencimiento, id_compra, id_movimiento_vianda, id_pedido, ' +
      'insumos ( nombre, unidad_medida ), usuarios ( nombre, apellido ), compras ( proveedor )',
      desdeISO, hastaISO);
    if (stock.error) return errorInterno(res, stock.error);
    if (stock.demasiadas) return res.status(400).json({ error: 'Hay demasiados movimientos en esas fechas: elegí menos días' });

    // 5. Se juntan en movimientos (una fila por cosa que pasó) y se mandan
    res.json(armarMovimientos(viandas.filas, stock.filas));
  } catch (e) {
    errorInterno(res, e);
  }
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
        productos ( nombre, codigo_plato )
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

// GET /api/planes → planes activos con su abreviatura (codigo_plan) y su contador de platos
// SALIDA: [{ id, nombre, codigo_plan, id_categoria, ultimo_numero_plato }]. Lo usan Combos (el select de planes)
//         y la ventana "Abreviaturas de los planes" de Generar Receta.
// 28/10 (código de plato): se suma ultimo_numero_plato (el último número que se dio en el plan).
app.get('/api/planes', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('planes')
    .select('id, nombre, codigo_plan, id_categoria, ultimo_numero_plato')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) return errorInterno(res, error);
  res.json(data || []);
});

// Lee el número de plan de la dirección: entero, mayor a 0 y que entre en la base (null si no sirve)
function leerIdPlan(texto) {
  const idPlan = Number(texto);                                   // Number: "12abc" no pasa
  const idInvalido = !Number.isInteger(idPlan) || idPlan <= 0 || idPlan > ENTERO_MAXIMO_BASE;
  return idInvalido ? null : idPlan;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planes/:id/siguiente-codigo → el código que le TOCARÍA al próximo plato del plan (solo para mostrar)
// ENTRADA: el número del plan en la dirección
// SALIDA:  { codigo: 'F4' } · 400 número inválido · 404 no existe o está desactivado · 409 el plan no tiene abreviatura
// Ej: Mantenimiento (F) con el contador en 3 → { codigo: 'F4' }
// No toma el número: el código de verdad lo da la base al guardar (tomar_codigo_plato / cambiar_plan_plato).
// Si en el medio alguien crea otro plato del mismo plan, al guardar sale el siguiente (y la pantalla lo muestra).
// 28/10: antes buscaba el número más alto leyendo los códigos; ahora usa el contador del plan (no reutiliza números).
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/planes/:id/siguiente-codigo', requireAuth, requireRol(6, 5), async (req, res) => {
  const idPlan = leerIdPlan(req.params.id);                       // el plan, controlado
  if (idPlan === null) return res.status(400).json({ error: 'ID de plan inválido' });

  try {
    const { data: plan, error } = await supabase                  // pide a la base…
      .from('planes')                                             // …el plan…
      .select('codigo_plan, ultimo_numero_plato')                 // …su abreviatura y su contador…
      .eq('id', idPlan)                                           // …de este número…
      .eq('activo', true)                                         // …si está activo
      .maybeSingle();                                             // (uno solo, o null)
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    if (!plan.codigo_plan) return res.status(409).json({ error: 'Este plan no tiene abreviatura: cargala en "Abreviaturas de los planes"' });

    const siguiente = (Number(plan.ultimo_numero_plato) || 0) + 1; // el número que vendría
    res.json({ codigo: plan.codigo_plan + siguiente });           // ej: "F" + 4 = "F4"
  } catch (e) {
    errorInterno(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/planes/:id/abreviatura → cambia la abreviatura de un plan y el código de sus platos (F3 → M3)
//                                   (ventana "Abreviaturas de los planes" de Generar Receta)
// ENTRADA: el número del plan en la dirección y { abreviatura } en el body (de 1 a 4 letras; se pasa a mayúscula)
// SALIDA:  { mensaje, abreviatura_anterior, abreviatura_nueva, platos_cambiados }
//          · 400 dato inválido · 409 ya la usa otro plan o el plan no existe (la base no cambia nada) · 500
// Ej: plan 2, { abreviatura: 'M' } → { abreviatura_anterior: 'F', abreviatura_nueva: 'M', platos_cambiados: 3 }
// Lo hace la base (cambiar_abreviatura_plan, sql/codigo_plato.sql), todo junto o nada.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/planes/:id/abreviatura', requireAuth, requireRol(6, 5), async (req, res) => {
  // 1. Los datos: el plan (número válido) y la abreviatura (texto de 1 a 4 letras, sin números)
  const idPlan = leerIdPlan(req.params.id);
  if (idPlan === null) return res.status(400).json({ error: 'ID de plan inválido' });
  const abreviatura = typeof req.body?.abreviatura === 'string' ? req.body.abreviatura.trim().toUpperCase() : '';  // ?. = "si vino body, su abreviatura"
  if (!/^[A-Z]{1,4}$/.test(abreviatura)) return res.status(400).json({ error: 'La abreviatura tiene que tener de 1 a 4 letras, sin números' });

  try {
    // 2. La base cambia la abreviatura y los códigos de sus platos, todo junto
    const { data, error } = await supabase.rpc('cambiar_abreviatura_plan', {
      p_id_plan:     idPlan,                                      // qué plan
      p_abreviatura: abreviatura                                  // la abreviatura nueva
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!data || !data.ok) return res.status(409).json({ error: data?.error || 'No se pudo cambiar la abreviatura' });

    res.json({                                                    // listo:
      mensaje:              'Abreviatura cambiada',
      abreviatura_anterior: data.abreviatura_anterior,            // la de antes
      abreviatura_nueva:    data.abreviatura_nueva,               // la de ahora
      platos_cambiados:     data.platos_cambiados                 // cuántos platos cambiaron de código
    });
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

  // El plan: un número entero mayor a 0 (que exista, esté activo y tenga abreviatura lo controla la base)
  const idPlan = leerIdPlan(id_plan);
  if (idPlan === null) return res.status(400).json({ error: 'El plan es inválido' });

  try {
    // El código del plato lo da la base (tomar_codigo_plato, sql/codigo_plato.sql): abreviatura del plan + el
    // siguiente número de su contador, en una sola instrucción (dos altas a la vez nunca reciben el mismo).
    // Si la pantalla mandara un código, no se usa. 28/10: antes se calculaba acá, leyendo los códigos.
    const { data: codigo, error: errCodigo } = await supabase.rpc('tomar_codigo_plato', { p_id_plan: idPlan });
    if (errCodigo) return errorInterno(res, errCodigo);           // si falló la base: 500
    if (!codigo || !codigo.ok) return res.status(400).json({ error: codigo?.error || 'No se pudo armar el código del plato' });
    const codigo_plato = codigo.codigo;                           // ej: "F4"

    // Paso 1: insertar el nuevo producto
    const { data: producto, error: errProducto } = await supabase
      .from('productos')
      .insert({
        nombre:       nombre.trim(),
        id_plan:      idPlan,
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

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/productos/:id/plan → pasa un plato a otro plan, con su código nuevo (Generar Receta → Editar)
// ENTRADA: el número del plato en la dirección y { id_plan } en el body
// SALIDA:  { mensaje, codigo_anterior, codigo_nuevo } · 400 dato inválido
//          · 409 el plato no existe, el plan nuevo no existe / está desactivado / no tiene abreviatura, o es el mismo · 500
// Ej: plato 4 (F3), { id_plan: 1 } con el contador de K en 4 → { codigo_anterior: 'F3', codigo_nuevo: 'K5' }
// El código lo da la base (cambiar_plan_plato, sql/codigo_plato.sql), todo junto: la pantalla solo muestra el aviso.
// Lo guardado (pedidos, pedidos a cocina, heladera, menús de combos) apunta al número del plato: no se rompe nada.
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/productos/:id/plan', requireAuth, requireRol(6, 5), async (req, res) => {
  // 1. Los datos: el plato y el plan nuevo, números enteros mayores a 0
  const idProducto = leerIdPlan(req.params.id);                   // (la misma regla de número que un plan)
  if (idProducto === null) return res.status(400).json({ error: 'ID de plato inválido' });
  const idPlan = leerIdPlan(req.body?.id_plan);                   // ?. = "si vino body, su id_plan"
  if (idPlan === null) return res.status(400).json({ error: 'Elegí un plan' });

  try {
    // 2. La base pasa el plato al plan nuevo y le da el código nuevo, todo junto
    const { data, error } = await supabase.rpc('cambiar_plan_plato', {
      p_id_producto: idProducto,                                  // qué plato
      p_id_plan:     idPlan                                       // a qué plan
    });
    if (error) return errorInterno(res, error);                   // si falló la base: 500
    if (!data || !data.ok) return res.status(409).json({ error: data?.error || 'No se pudo cambiar el plan' });

    res.json({                                                    // listo:
      mensaje:         'Plan cambiado',
      codigo_anterior: data.codigo_anterior,                      // ej: F3
      codigo_nuevo:    data.codigo_nuevo                          // ej: K5
    });
  } catch (e) {
    errorInterno(res, e);
  }
});

/* ======================================================
   API COMBOS (pantalla "Combos" del panel: pages/combos.html)
   Mismos roles que Generar Receta (6, 5). Los combos nunca se borran: se desactivan.
   Cada ruta escribe en UNA sola tabla con UNA sola instrucción: no hace falta una función de la base.
   ====================================================== */

const LARGO_MAXIMO_NOMBRE_COMBO = 100;
const MAXIMO_VIANDAS_POR_COMBO  = 100;
// pedidos.total admite hasta 99.999.999,99 y un pedido puede tener MAXIMO_COMBOS_POR_PEDIDO (10) combos:
// con este tope, ningún pedido puede pasarse del máximo de la base.
const PRECIO_MAXIMO_COMBO = 9999999;

// Lee y controla los datos de un combo que llegan del panel (crear y editar).
// Devuelve { datos: { nombre, id_plan, cantidad, precio } } si está todo bien,
// { error: 'mensaje' } si algún dato está mal (→ 400), o { errorDeBase } si falló la base (→ 500).
async function leerDatosCombo(body) {
  const { nombre, id_plan, cantidad, precio } = body || {};

  // Nombre: texto, sin espacios de más, no vacío y no muy largo
  if (typeof nombre !== 'string' || nombre.trim() === '') {
    return { error: 'El nombre es obligatorio' };
  }
  if (nombre.trim().length > LARGO_MAXIMO_NOMBRE_COMBO) {
    return { error: `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_COMBO} caracteres` };
  }

  // Plan: un número entero mayor a 0 (que exista y esté activo se mira al final, en la base)
  if (typeof id_plan !== 'number' || !Number.isInteger(id_plan) || id_plan <= 0 || id_plan > ENTERO_MAXIMO_BASE) {
    return { error: 'Elegí un plan' };
  }

  // Cantidad de viandas: entero entre 1 y 100
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAXIMO_VIANDAS_POR_COMBO) {
    return { error: `La cantidad de viandas tiene que ser un número entero entre 1 y ${MAXIMO_VIANDAS_POR_COMBO}` };
  }

  // Precio: número entre 0 y el máximo (ver PRECIO_MAXIMO_COMBO). Se guarda redondeado a centavos.
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0 || precio > PRECIO_MAXIMO_COMBO) {
    return { error: `El precio tiene que ser un número entre 0 y ${PRECIO_MAXIMO_COMBO.toLocaleString('es-AR')}` };
  }
  const precioEnCentavos = Math.round(precio * 100) / 100;

  // El plan tiene que existir y estar activo (un combo de un plan inactivo no se muestra en la web)
  const { data: plan, error: errorPlan } = await supabase
    .from('planes')
    .select('id, activo')
    .eq('id', id_plan)
    .maybeSingle();
  if (errorPlan) return { errorDeBase: errorPlan };
  if (!plan || !plan.activo) {
    return { error: 'El plan elegido no existe o está desactivado' };
  }

  return { datos: { nombre: nombre.trim(), id_plan: id_plan, cantidad: cantidad, precio: precioEnCentavos } };
}

// GET /api/combos → todos los combos (activos e inactivos) para la tabla del panel.
// platos_en_menu: renglones activos del menú con el plato activo (lo mismo que ve el cliente).
// veces_vendido: cuántas veces se compró (filas de pedido_combos); el panel lo usa para bloquear la cantidad.
app.get('/api/combos', requireAuth, requireRol(6, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('combos')
    .select(`
      id,
      nombre,
      id_plan,
      cantidad,
      precio,
      activo,
      destacado,
      planes ( nombre, activo ),
      combo_productos ( activo, productos ( activo ) ),
      pedido_combos ( count )
    `)
    .order('nombre', { ascending: true });

  if (error) return errorInterno(res, error);

  const combos = (data || []).map(combo => {
    // Menú que ve el cliente: renglón activo con el plato activo
    const platosEnMenu = (combo.combo_productos || []).filter(renglon =>
      renglon.activo && renglon.productos && renglon.productos.activo
    ).length;

    // La cuenta llega como una lista con un solo elemento. Ejemplo: pedido_combos: [{ count: 3 }] → 3
    let vecesVendido = 0;
    if (combo.pedido_combos && combo.pedido_combos[0]) {
      vecesVendido = Number(combo.pedido_combos[0].count) || 0;
    }

    let plan = null;
    let planActivo = false;
    if (combo.planes) {
      plan = combo.planes.nombre;
      planActivo = Boolean(combo.planes.activo);
    }

    return {
      id:             combo.id,
      nombre:         combo.nombre,
      id_plan:        combo.id_plan,
      plan:           plan,
      plan_activo:    planActivo,
      cantidad:       combo.cantidad,
      precio:         Number(combo.precio),
      activo:         combo.activo,
      destacado:      combo.destacado === true,   // "Más elegido" (por ahora se marca desde Supabase)
      platos_en_menu: platosEnMenu,
      veces_vendido:  vecesVendido
    };
  });

  res.json(combos);
});

// POST /api/combos → crea un combo (activo). Body: { nombre, id_plan, cantidad, precio }.
// El menú se arma después, con las rutas del menú.
app.post('/api/combos', requireAuth, requireRol(6, 5), async (req, res) => {
  try {
    const lectura = await leerDatosCombo(req.body);
    if (lectura.errorDeBase) return errorInterno(res, lectura.errorDeBase);
    if (lectura.error) return res.status(400).json({ error: lectura.error });

    const { data, error } = await supabase
      .from('combos')
      .insert({
        nombre:   lectura.datos.nombre,
        id_plan:  lectura.datos.id_plan,
        cantidad: lectura.datos.cantidad,
        precio:   lectura.datos.precio,
        activo:   true
      })
      .select('id, nombre, id_plan, cantidad, precio, activo')
      .single();

    if (error) return errorInterno(res, error);
    res.json({ mensaje: 'Combo creado', combo: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/combos/:id → edita nombre, plan, cantidad y precio. Body: { nombre, id_plan, cantidad, precio }.
// La CANTIDAD no se puede cambiar si el combo ya se vendió: los pedidos viejos dicen "x10" con 10 platos.
// En ese caso se crea un combo nuevo con la cantidad nueva y se desactiva este.
// El precio sí se puede cambiar: cada pedido guarda el precio que se cobró (pedido_combos.precio).
app.put('/api/combos/:id', requireAuth, requireRol(6, 5), async (req, res) => {
  const idCombo = Number(req.params.id);
  if (!Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Combo inválido' });
  }

  try {
    const lectura = await leerDatosCombo(req.body);
    if (lectura.errorDeBase) return errorInterno(res, lectura.errorDeBase);
    if (lectura.error) return res.status(400).json({ error: lectura.error });

    // El combo tiene que existir
    const { data: actual, error: errorActual } = await supabase
      .from('combos')
      .select('id, cantidad')
      .eq('id', idCombo)
      .maybeSingle();
    if (errorActual) return errorInterno(res, errorActual);
    if (!actual) return res.status(404).json({ error: 'El combo no existe' });

    // Si cambia la cantidad, el combo no tiene que haberse vendido nunca.
    // { count: 'exact', head: true } pide solo la cuenta de filas, sin traerlas.
    if (lectura.datos.cantidad !== actual.cantidad) {
      const { count, error: errorVentas } = await supabase
        .from('pedido_combos')
        .select('id', { count: 'exact', head: true })
        .eq('id_combo', idCombo);
      if (errorVentas) return errorInterno(res, errorVentas);
      if (count > 0) {
        return res.status(400).json({
          error: `Este combo ya se vendió (${count} veces): no se puede cambiar la cantidad. ` +
                 'Creá un combo nuevo con la cantidad nueva y desactivá este.'
        });
      }
    }

    const { data, error } = await supabase
      .from('combos')
      .update({
        nombre:   lectura.datos.nombre,
        id_plan:  lectura.datos.id_plan,
        cantidad: lectura.datos.cantidad,
        precio:   lectura.datos.precio
      })
      .eq('id', idCombo)
      .select('id, nombre, id_plan, cantidad, precio, activo')
      .maybeSingle();

    if (error) return errorInterno(res, error);
    if (!data) return res.status(404).json({ error: 'El combo no existe' });
    res.json({ mensaje: 'Combo actualizado', combo: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/combos/:id/activo → activa o desactiva un combo (nunca se borra). Body: { activo: true | false }.
// Un combo desactivado deja de aparecer en la web; sus pedidos viejos no cambian.
app.put('/api/combos/:id/activo', requireAuth, requireRol(6, 5), async (req, res) => {
  const idCombo = Number(req.params.id);
  if (!Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Combo inválido' });
  }
  const activo = req.body ? req.body.activo : undefined;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El estado tiene que ser activo (true) o inactivo (false)' });
  }

  try {
    const { data, error } = await supabase
      .from('combos')
      .update({ activo: activo })
      .eq('id', idCombo)
      .select('id, nombre, id_plan, cantidad, precio, activo')
      .maybeSingle();

    if (error) return errorInterno(res, error);
    if (!data) return res.status(404).json({ error: 'El combo no existe' });

    let mensaje = 'Combo desactivado';
    if (activo) mensaje = 'Combo activado';
    res.json({ mensaje: mensaje, combo: data });
  } catch (e) {
    errorInterno(res, e);
  }
});

// ── MENÚ DE UN COMBO (tabla combo_productos) ─────────────────────────────
// Un renglón del menú nunca se borra: "sacar" un plato es poner su renglón en activo = false,
// y "agregarlo" de nuevo lo vuelve a activar. Los pedidos viejos no cambian (sus platos están
// en pedido_detalles, no en el menú).

// GET /api/combos/:id/menu → el combo, los platos de su menú y los platos que se pueden agregar.
// menu: renglones activos. Si un plato se desactivó después (Generar Receta) aparece con
// plato_activo: false, para poder sacarlo. disponibles: platos activos de CUALQUIER plan que no están en el menú.
app.get('/api/combos/:id/menu', requireAuth, requireRol(6, 5), async (req, res) => {
  const idCombo = Number(req.params.id);
  if (!Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Combo inválido' });
  }

  try {
    // 1. El combo
    const { data: combo, error: errorCombo } = await supabase
      .from('combos')
      .select('id, nombre, cantidad, destacado')
      .eq('id', idCombo)
      .maybeSingle();
    if (errorCombo) return errorInterno(res, errorCombo);
    if (!combo) return res.status(404).json({ error: 'El combo no existe' });

    // 2. Los renglones activos de su menú, con el plato y el plan del plato
    const { data: renglones, error: errorMenu } = await supabase
      .from('combo_productos')
      .select('id_producto, productos ( id, nombre, codigo_plato, activo, planes ( nombre ) )')
      .eq('id_combo', idCombo)
      .eq('activo', true);
    if (errorMenu) return errorInterno(res, errorMenu);

    // 3. Todos los platos activos (para elegir cuáles agregar)
    const { data: platos, error: errorPlatos } = await supabase
      .from('productos')
      .select('id, nombre, codigo_plato, planes ( nombre )')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (errorPlatos) return errorInterno(res, errorPlatos);

    // 4. El menú, y de paso un objeto { idProducto: true } con los platos que ya están en él
    const enElMenu = {};
    const menu = [];
    (renglones || []).forEach(renglon => {
      // Un renglón sin plato (no debería pasar): return = saltear este y seguir con el siguiente
      if (!renglon.productos) return;
      enElMenu[renglon.id_producto] = true;

      let plan = null;
      if (renglon.productos.planes) plan = renglon.productos.planes.nombre;
      menu.push({
        id_producto:  renglon.id_producto,
        nombre:       renglon.productos.nombre,
        codigo:       renglon.productos.codigo_plato,
        plan:         plan,
        plato_activo: Boolean(renglon.productos.activo)
      });
    });
    menu.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

    // 5. Disponibles: los platos activos que todavía no están en el menú.
    //    filter se queda con los que cumplen la condición; map arma cada uno con los datos que usa la pantalla.
    //    Ejemplo: platos [fideos (5), arroz (9)] y enElMenu { 5: true } → [{ id: 9, nombre: 'arroz', ... }]
    const disponibles = (platos || [])
      .filter(plato => !enElMenu[plato.id])
      .map(plato => {
        let plan = null;
        if (plato.planes) plan = plato.planes.nombre;
        return { id: plato.id, nombre: plato.nombre, codigo: plato.codigo_plato, plan: plan };
      });

    res.json({ combo: combo, menu: menu, disponibles: disponibles });
  } catch (e) {
    errorInterno(res, e);
  }
});

// POST /api/combos/:id/menu → agrega un plato al menú (o lo vuelve a activar si ya había estado).
// Body: { id_producto }. El plato tiene que existir y estar activo; puede ser de cualquier plan.
app.post('/api/combos/:id/menu', requireAuth, requireRol(6, 5), async (req, res) => {
  const idCombo = Number(req.params.id);
  if (!Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Combo inválido' });
  }
  const idProducto = req.body ? req.body.id_producto : undefined;
  if (typeof idProducto !== 'number' || !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Elegí un plato' });
  }

  try {
    // El combo tiene que existir
    const { data: combo, error: errorCombo } = await supabase
      .from('combos')
      .select('id')
      .eq('id', idCombo)
      .maybeSingle();
    if (errorCombo) return errorInterno(res, errorCombo);
    if (!combo) return res.status(404).json({ error: 'El combo no existe' });

    // El plato tiene que existir y estar activo
    const { data: plato, error: errorPlato } = await supabase
      .from('productos')
      .select('id, nombre, activo')
      .eq('id', idProducto)
      .maybeSingle();
    if (errorPlato) return errorInterno(res, errorPlato);
    if (!plato || !plato.activo) {
      return res.status(400).json({ error: 'El plato no existe o está desactivado' });
    }

    // Agregar o reactivar en UNA instrucción: upsert usa la regla de la tabla que no deja repetir
    // (id_combo, id_producto). Si el renglón no existe lo crea; si existía (sacado), lo vuelve a activar.
    const { error } = await supabase
      .from('combo_productos')
      .upsert(
        { id_combo: idCombo, id_producto: idProducto, activo: true },
        { onConflict: 'id_combo,id_producto' }
      );
    if (error) return errorInterno(res, error);

    res.json({ mensaje: `"${plato.nombre}" quedó en el menú` });
  } catch (e) {
    errorInterno(res, e);
  }
});

// PUT /api/combos/:id/menu/:idProducto/quitar → saca un plato del menú: su renglón pasa a activo = false
// (nunca se borra). El plato no cambia y los pedidos viejos tampoco.
app.put('/api/combos/:id/menu/:idProducto/quitar', requireAuth, requireRol(6, 5), async (req, res) => {
  const idCombo = Number(req.params.id);
  const idProducto = Number(req.params.idProducto);
  if (!Number.isInteger(idCombo) || idCombo <= 0 || idCombo > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Combo inválido' });
  }
  if (!Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE) {
    return res.status(400).json({ error: 'Plato inválido' });
  }

  try {
    // Solo el renglón activo de ese combo y ese plato (hay uno solo, por la regla de la tabla)
    const { data, error } = await supabase
      .from('combo_productos')
      .update({ activo: false })
      .eq('id_combo', idCombo)
      .eq('id_producto', idProducto)
      .eq('activo', true)
      .select('id')
      .maybeSingle();

    if (error) return errorInterno(res, error);
    if (!data) return res.status(404).json({ error: 'Ese plato no está en el menú del combo' });

    res.json({ mensaje: 'Plato sacado del menú' });
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

