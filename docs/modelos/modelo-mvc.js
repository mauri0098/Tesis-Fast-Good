// ============================================================================
// modelo-mvc.js — EJEMPLO MODELO: así se escribe un módulo del servidor (rutas, modelo y controlador)
// Es la muestra de la FORMA (módulo productos, dos rutas). No es un archivo que corra: en el proyecto
// cada parte va en su propio archivo, dentro de backend/modulos/<modulo>/.
//
// La idea, igual que en el front:
//   FRONT:  traerProductos()  →  arregloProductos  →  renderizarProductos(arreglo, contenedor)
//   BACK:   modelo.traerX()   →  { data, error }   →  res.json(data)
// El modelo es el "traer": solo va a buscar y devuelve. El controlador recibe eso y responde,
// como renderizar recibe el arreglo y dibuja. Las rutas solo dicen qué dirección va con qué función.
//
// Todo controlador tiene SIEMPRE los mismos 4 pasos, en el mismo orden:
//   1. LEER      → saca los datos del pedido          (req.params, req.body, req.usuario)
//   2. REVISAR   → ¿los datos sirven? Si no, corta    (if (…) { return res.status(400)… })
//   3. PEDIR     → le pide al modelo y espera         (const { data, error } = await modelo.…)
//   4. RESPONDER → contesta según lo que volvió       (errorInterno, 404 o res.json(…))
// ============================================================================


// ===================== rutas.productos.js =====================
// SOLO: la dirección + los patovicas + qué función del controlador atiende.
const express = require('express');
const router = express.Router();
const { requireAuth, requireRol } = require('../../middlewares/auth');
const controlador = require('./controlador.productos');

router.get('/api/productos', requireAuth, requireRol(6, 5), controlador.listarProductos);
router.put('/api/productos/:id/activo', requireAuth, requireRol(6, 5), controlador.cambiarEstadoProducto);

module.exports = router;


// ===================== modelo.productos.js =====================
// SOLO: consultas a la base. Devuelve { data, error } tal cual. No conoce req ni res.
const supabase = require('../../config/supabaseClient');

// traerProductosBD → todos los productos, por nombre
// ENTRADA: nada · SALIDA: { data: [ { id: 1, nombre: "Fideos", activo: true } ], error: null }
async function traerProductosBD() {
  return await supabase
    .from('productos')
    .select('id, nombre, precio, activo')
    .order('nombre', { ascending: true });
}

// cambiarEstadoProductoBD → pone activo en true o false y devuelve el producto
// ENTRADA: idProducto (7) y activo (false) · SALIDA: { data: el producto, o null si no existe; error }
async function cambiarEstadoProductoBD(idProducto, activo) {
  return await supabase
    .from('productos')
    .update({ activo: activo })
    .eq('id', idProducto)
    .select('id, nombre, activo')
    .maybeSingle();
}

module.exports = { traerProductosBD, cambiarEstadoProductoBD };


// ===================== controlador.productos.js =====================
// SIEMPRE los 4 pasos: 1. LEER · 2. REVISAR · 3. PEDIR · 4. RESPONDER
const modelo = require('./modelo.productos');
const { errorInterno } = require('../../utils/errores');
const { ENTERO_MAXIMO_BASE } = require('../../utils/constantes');

// listarProductos → GET /api/productos
// ENTRADA: req y res · SALIDA: 200 con el arreglo · 500 si falla la base
// Ej: → [ { id: 1, nombre: "Fideos", precio: 8000, activo: true } ]
async function listarProductos(req, res) {
  // 1. LEER: nada (esta ruta no recibe datos)
  // 2. REVISAR: nada

  // 3. PEDIR: el modelo va a la base y vuelve con { data, error }
  const { data, error } = await modelo.traerProductosBD();

  // 4. RESPONDER
  // ¿falló la base? SÍ: se cayó Supabase · NO: vino el arreglo
  if (error) {
    return errorInterno(res, error);
  }
  res.json(data);
}

// cambiarEstadoProducto → PUT /api/productos/:id/activo
// ENTRADA: el id en la dirección y { activo: true/false } en el body
// SALIDA: 200 con el producto · 400 dato inválido · 404 no existe · 500 falla la base
// Ej: PUT /api/productos/7/activo con { activo: false } → { id: 7, nombre: "Fideos", activo: false }
async function cambiarEstadoProducto(req, res) {
  // 1. LEER
  const idProducto = Number(req.params.id);   // de la dirección: /api/productos/7/activo → 7
  const activo = req.body.activo;             // del body: false

  // 2. REVISAR (cada control corta con return)
  const idInvalido = !Number.isInteger(idProducto) || idProducto <= 0 || idProducto > ENTERO_MAXIMO_BASE;
  // ¿el número no sirve? SÍ: "abc" o -3 · NO: 7
  if (idInvalido) {
    return res.status(400).json({ error: 'ID de producto inválido' });
  }
  const activoInvalido = activo !== true && activo !== false;
  // ¿activo no es true ni false? SÍ: "hola" · NO: false
  if (activoInvalido) {
    return res.status(400).json({ error: 'El estado tiene que ser true o false' });
  }

  // 3. PEDIR
  const { data, error } = await modelo.cambiarEstadoProductoBD(idProducto, activo);

  // 4. RESPONDER
  // ¿falló la base? SÍ: se cayó Supabase · NO: sigue
  if (error) {
    return errorInterno(res, error);
  }
  // ¿no cambió ninguna fila? SÍ: el producto 999 no existe · NO: volvió el producto
  if (!data) {
    return res.status(404).json({ error: 'El producto no existe' });
  }
  res.json(data);
}

module.exports = { listarProductos, cambiarEstadoProducto };
