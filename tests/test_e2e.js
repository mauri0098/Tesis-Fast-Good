/**
 * TEST END-TO-END — Fast Good (migración Supabase)
 * 
 * Testea todos los flujos principales simulando peticiones HTTP reales
 * al servidor Express levantado en localhost:3000.
 * 
 * IMPORTANTE: El servidor debe estar corriendo ANTES de ejecutar este script.
 *
 * Se ejecuta con: node tests/test_e2e.js
 * Las credenciales del admin se leen del .env (TEST_ADMIN_USER y TEST_ADMIN_PASS).
 *
 * SOLO la sección HELADERA (pasos H8 y H9): node tests/test_e2e.js heladera
 * Es la que se puede correr contra la base REAL: crea pedidos "PRUEBA – NO PREPARAR" y los anula al final,
 * no marca Hecho, no descarta, no carga compras y no muestra el usuario ni el PIN (ver sus REGLAS más abajo).
 * Lo de antes (sin "heladera") crea un producto, pasa un pedido a 3 y 4 (gasta insumos) y borra renglones:
 * no correrlo contra la base real.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const fechas = require(path.join(__dirname, '..', 'frontend', 'src', 'js', 'fechas.js'));
// Para la limpieza de pedidos de prueba: ya no existe DELETE /api/pedidos/:id (los pedidos se anulan)
const supabase = require(path.join(__dirname, '..', 'config', 'supabaseClient'));
// Para la sección HELADERA: firma un token de un cocinero de mentira (solo para ver que el servidor le dice 403)
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const ADMIN_USER = process.env.TEST_ADMIN_USER;
const ADMIN_PASS = process.env.TEST_ADMIN_PASS;
if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('❌ Faltan TEST_ADMIN_USER y/o TEST_ADMIN_PASS en el .env (ver .env.example)');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────
// Token del admin (TEST_ADMIN_USER): se obtiene en testLogin() y va en todas las llamadas,
// porque los endpoints no públicos piden JWT. Un header Authorization explícito tiene prioridad.
let tokenAdmin = null;
function conSesion(headers) {
  return tokenAdmin && !headers.Authorization ? { Authorization: 'Bearer ' + tokenAdmin, ...headers } : headers;
}

let passCount = 0;
let failCount = 0;
let warnCount = 0;
const failures = [];

function ok(testName, detail) {
  passCount++;
  console.log(`  ✅ ${testName}${detail ? ' — ' + detail : ''}`);
}
function fail(testName, detail) {
  failCount++;
  const msg = `  ❌ ${testName}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  failures.push(msg);
}
function warn(testName, detail) {
  warnCount++;
  console.log(`  ⚠️  ${testName}${detail ? ' — ' + detail : ''}`);
}

async function post(path, body, headers = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: conSesion({ 'Content-Type': 'application/json', ...headers }),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function get(path, headers = {}) {
  const res = await fetch(BASE_URL + path, { headers: conSesion(headers) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function put(path, body, headers = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'PUT',
    headers: conSesion({ 'Content-Type': 'application/json', ...headers }),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function del(path, headers = {}) {
  const res = await fetch(BASE_URL + path, { method: 'DELETE', headers: conSesion(headers) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ─── IDs de limpieza ──────────────────────────────────────────
const cleanupIds = { pedidos: [], usuarios: [], productos: [] };

// ═══════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════

async function testLogin() {
  console.log('\n══════ 1. LOGIN / AUTENTICACIÓN ══════');

  // 1a. Login con el nombre_usuario del admin (credenciales del .env)
  const r1 = await post('/api/login', { nombre: ADMIN_USER, contraseña: ADMIN_PASS });
  if (r1.status === 200 && r1.data?.token) {
    ok(`Login con nombre_usuario "${ADMIN_USER}"`,
       `token=${r1.data.token.substring(0,20)}…`);
  } else {
    fail(`Login con ${ADMIN_USER}`, `status=${r1.status} body=${JSON.stringify(r1.data)}`);
  }

  // 1b. Login con contraseña incorrecta → debe dar 401
  const r2 = await post('/api/login', { nombre: ADMIN_USER, contraseña: 'wrongpass' });
  if (r2.status === 401) {
    ok('Login con contraseña incorrecta → rechazado (401)');
  } else {
    fail('Login con contraseña incorrecta', `esperaba 401, recibió ${r2.status}`);
  }

  // 1c. Login con usuario inexistente → debe dar 401
  const r3 = await post('/api/login', { nombre: 'usuario_fantasma_xyz', contraseña: 'cualquier-clave' });
  if (r3.status === 401) {
    ok('Login con usuario inexistente → rechazado (401)');
  } else {
    fail('Login con usuario inexistente', `esperaba 401, recibió ${r3.status}`);
  }

  // 1d. Login con email en vez de nombre_usuario (el email del mismo admin, tomado del login 1a)
  const emailAdmin = r1.data?.usuario?.email;
  if (!emailAdmin) {
    warn('Login por email', 'omitido: el login 1a no devolvió el email del admin');
  } else {
    const r4 = await post('/api/login', { nombre: emailAdmin, contraseña: ADMIN_PASS });
    if (r4.status === 200 && r4.data?.token) {
      ok('Login por email funciona', `usuario=${r4.data.usuario?.nombre}`);
    } else {
      fail('Login por email', `status=${r4.status} body=${JSON.stringify(r4.data)}`);
    }
  }

  // 1f. Validar estructura de respuesta
  if (r1.status === 200) {
    const u = r1.data.usuario;
    const tieneId    = u?.id !== undefined;
    const tieneNombre = u?.nombre !== undefined;
    const tieneEmail  = u?.email !== undefined;
    const tieneRol    = u?.id_rol !== undefined;
    if (tieneId && tieneNombre && tieneEmail && tieneRol) {
      ok('Estructura de respuesta del login correcta',
         `id=${u.id.substring(0,8)}… nombre=${u.nombre} email=${u.email} rol=${u.id_rol}`);
    } else {
      fail('Estructura de respuesta del login', `faltan campos: ${JSON.stringify(u)}`);
    }
  }

  return r1.data?.token;
}

async function testCatalogo() {
  console.log('\n══════ 2. CATÁLOGO (categorías, planes, productos) ══════');

  // 2a. Categorías
  const r1 = await get('/api/v1/categorias');
  if (r1.status === 200 && Array.isArray(r1.data) && r1.data.length > 0) {
    ok('GET /api/v1/categorias', `${r1.data.length} categorías`);
  } else if (r1.status === 200 && Array.isArray(r1.data)) {
    warn('GET /api/v1/categorias', 'Responde OK pero vacío (tabla sin datos)');
  } else {
    fail('GET /api/v1/categorias', `status=${r1.status} data=${JSON.stringify(r1.data)}`);
  }

  // 2b. Catálogo completo (árbol)
  const r2 = await get('/api/v1/catalogo');
  if (r2.status === 200 && Array.isArray(r2.data)) {
    const totalPlanes = r2.data.reduce((s, c) => s + (c.planes?.length || 0), 0);
    ok('GET /api/v1/catalogo (árbol completo)', `${r2.data.length} cats, ${totalPlanes} planes`);
  } else {
    fail('GET /api/v1/catalogo', `status=${r2.status}`);
  }

  // 2c. Planes de una categoría
  if (r1.data?.length > 0) {
    const catId = r1.data[0].id;
    const r3 = await get(`/api/v1/categorias/${catId}/planes`);
    if (r3.status === 200 || r3.status === 404) {
      ok(`GET planes de categoría #${catId}`, `status=${r3.status} planes=${r3.data?.length || 0}`);
    } else {
      fail(`GET planes de categoría #${catId}`, `status=${r3.status}`);
    }
  }

  // 2d. Productos activos
  const r4 = await get('/api/v1/productos');
  if (r4.status === 200 && Array.isArray(r4.data)) {
    ok('GET /api/v1/productos', `${r4.data.length} productos activos`);
  } else {
    fail('GET /api/v1/productos', `status=${r4.status}`);
  }

  // 2e. Planes
  const r5 = await get('/api/planes');
  if (r5.status === 200 && Array.isArray(r5.data)) {
    ok('GET /api/planes', `${r5.data.length} planes activos`);
    return r5.data;
  } else {
    fail('GET /api/planes', `status=${r5.status}`);
    return [];
  }
}

async function testStock() {
  console.log('\n══════ 3. STOCK E INSUMOS ══════');

  // 3a. Insumos
  const r1 = await get('/api/insumos');
  if (r1.status === 200 && Array.isArray(r1.data)) {
    ok('GET /api/insumos', `${r1.data.length} insumos`);
  } else {
    fail('GET /api/insumos', `status=${r1.status} err=${JSON.stringify(r1.data)}`);
  }

  // 3b. Categorías de insumos
  const r2 = await get('/api/categorias-insumos');
  if (r2.status === 200 && Array.isArray(r2.data)) {
    ok('GET /api/categorias-insumos', `${r2.data.length} categorías`);
  } else {
    fail('GET /api/categorias-insumos', `status=${r2.status}`);
  }

  // 3c. Movimientos de stock
  const r3 = await get('/api/movimientos-stock');
  if (r3.status === 200 && Array.isArray(r3.data)) {
    ok('GET /api/movimientos-stock', `${r3.data.length} movimientos`);
  } else {
    fail('GET /api/movimientos-stock', `status=${r3.status}`);
  }

  return r1.data || [];
}

async function testRecetas() {
  console.log('\n══════ 4. RECETAS ══════');

  const r1 = await get('/api/recetas');
  if (r1.status === 200 && Array.isArray(r1.data)) {
    ok('GET /api/recetas', `${r1.data.length} productos con receta`);
    if (r1.data.length > 0) {
      const primera = r1.data[0];
      ok('Estructura de receta',
         `producto="${primera.nombre_producto}" insumos=${primera.insumos?.length || 0}`);
    }
  } else {
    fail('GET /api/recetas', `status=${r1.status} err=${JSON.stringify(r1.data)}`);
  }
}

async function testProductoConReceta(planes, insumos, token) {
  console.log('\n══════ 5. CREAR PRODUCTO CON RECETA ══════');

  if (!planes || planes.length === 0) {
    warn('Crear producto con receta', 'No hay planes disponibles, saltando test');
    return;
  }
  if (!insumos || insumos.length === 0) {
    warn('Crear producto con receta', 'No hay insumos disponibles, saltando test');
    return;
  }

  const plan = planes[0];
  const insumo = insumos[0];

  const body = {
    nombre: '_TEST_PRODUCTO_E2E_' + Date.now(),
    id_plan: plan.id,
    precio: 1500,
    descuento: 0,
    insumos: [{
      id_insumo: insumo.id,
      cantidad_necesaria: 100,
      unidad_medida: insumo.unidad_medida || 'g'
    }]
  };

  const r1 = await post('/api/productos/con-receta', body);
  if (r1.status === 200 && r1.data?.producto?.id) {
    ok('POST /api/productos/con-receta',
       `id=${r1.data.producto.id} código=${r1.data.producto.codigo_plato}`);
    cleanupIds.productos.push(r1.data.producto.id);

    // Verificar que la receta se guardó
    const r2 = await get('/api/recetas');
    const encontrado = r2.data?.find(p => p.id_producto === r1.data.producto.id);
    if (encontrado && encontrado.insumos?.length > 0) {
      ok('Receta del producto creado existe', `insumos=${encontrado.insumos.length}`);
    } else {
      fail('Receta del producto creado', 'No se encontró en GET /api/recetas');
    }

    return r1.data.producto.id;
  } else {
    fail('POST /api/productos/con-receta', `status=${r1.status} err=${JSON.stringify(r1.data)}`);
    return null;
  }
}

async function testPedidoCompleto(productoId) {
  console.log('\n══════ 6. FLUJO COMPLETO DE PEDIDO ══════');

  // 6a. Crear pedido
  const pedidoBody = {
    total: 1500,
    items: [{ producto_id: productoId, cantidad: 2 }],
    cliente_nombre: 'Test E2E Bot',
    cliente_direccion: 'Calle Test 123',
    cliente_telefono: '1234567890',
    cliente_email: 'test_e2e@fastgood.com',
    // La primera fecha que acepta el servidor: 2 días hábiles después de hoy (misma regla que el formulario)
    fecha_entrega: fechas.fechaLocalISO(fechas.sumarDiasHabiles(new Date(), 2)),
    metodo_pago: 'Efectivo',
    observaciones: 'Pedido de prueba automática E2E',
    tipo_entrega: 'Delivery'
  };

  const r1 = await post('/api/pedidos', pedidoBody);
  if (r1.status === 200 && r1.data?.pedido?.id) {
    ok('POST /api/pedidos (crear pedido)', `pedido_id=${r1.data.pedido.id}`);
    cleanupIds.pedidos.push(r1.data.pedido.id);
  } else {
    fail('POST /api/pedidos', `status=${r1.status} err=${JSON.stringify(r1.data)}`);
    return;
  }

  const pedidoId = r1.data.pedido.id;

  // 6b. Listar pedidos y verificar que aparece
  const r2 = await get('/api/pedidos');
  if (r2.status === 200 && Array.isArray(r2.data)) {
    const existe = r2.data.some(p => p.id === pedidoId);
    if (existe) {
      ok('GET /api/pedidos contiene el pedido creado');
    } else {
      fail('GET /api/pedidos', 'El pedido creado no aparece en la lista');
    }
  } else {
    fail('GET /api/pedidos', `status=${r2.status}`);
  }

  // 6c. Cambiar estado a "En Preparación" (2)
  const r3 = await put(`/api/pedidos/${pedidoId}/estado`, { estado_id: 2 });
  if (r3.status === 200) {
    ok('PUT estado → En Preparación (2)', `id_estado=${r3.data?.pedido?.id_estado}`);
  } else {
    fail('PUT estado → 2', `status=${r3.status} err=${JSON.stringify(r3.data)}`);
  }

  // 6d. Cambiar estado a "Listo" (3) — esto debería descontar stock
  const r4 = await put(`/api/pedidos/${pedidoId}/estado`, { estado_id: 3 });
  if (r4.status === 200) {
    ok('PUT estado → Listo (3) — descuenta stock', `id_estado=${r4.data?.pedido?.id_estado}`);
  } else if (r4.status === 409) {
    warn('PUT estado → 3', `Stock insuficiente (esperado si insumos están en 0): ${r4.data?.error}`);
  } else {
    fail('PUT estado → 3', `status=${r4.status} err=${JSON.stringify(r4.data)}`);
  }

  // 6e. Marcar como pagado
  const r5 = await put(`/api/pedidos/${pedidoId}/pagado`, { pagado: true });
  if (r5.status === 200) {
    ok('PUT pagado → true');
  } else {
    fail('PUT pagado', `status=${r5.status}`);
  }

  // 6f. Cambiar estado a "Entregado" (4)
  const r6 = await put(`/api/pedidos/${pedidoId}/estado`, { estado_id: 4 });
  if (r6.status === 200) {
    ok('PUT estado → Entregado (4)');
  } else if (r6.status === 409) {
    warn('PUT estado → 4', `Stock insuficiente: ${r6.data?.error}`);
  } else {
    fail('PUT estado → 4', `status=${r6.status} err=${JSON.stringify(r6.data)}`);
  }
}

async function testEstados() {
  console.log('\n══════ 7. ESTADOS ══════');

  const r = await get('/api/estados');
  if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
    ok('GET /api/estados', `${r.data.length} estados: ${r.data.map(e => e.nombre).join(', ')}`);
  } else {
    fail('GET /api/estados', `status=${r.status} data=${JSON.stringify(r.data)}`);
  }
}

async function testCocineros() {
  console.log('\n══════ 8. COCINEROS ══════');

  const r1 = await get('/api/cocineros');
  if (r1.status === 200 && Array.isArray(r1.data)) {
    ok('GET /api/cocineros', `${r1.data.length} cocineros`);
  } else {
    fail('GET /api/cocineros', `status=${r1.status}`);
  }

  const r2 = await get('/api/planes/cocineros');
  if (r2.status === 200 && Array.isArray(r2.data)) {
    ok('GET /api/planes/cocineros', `${r2.data.length} planes con asignación`);
  } else {
    fail('GET /api/planes/cocineros', `status=${r2.status}`);
  }
}

async function testUsuarios() {
  console.log('\n══════ 9. GESTIÓN DE USUARIOS ══════');

  const r1 = await get('/api/usuarios');
  if (r1.status === 200 && Array.isArray(r1.data)) {
    ok('GET /api/usuarios', `${r1.data.length} usuarios`);
  } else {
    fail('GET /api/usuarios', `status=${r1.status}`);
  }
}

async function testRegister() {
  console.log('\n══════ 10. REGISTRO DE USUARIO (POST /api/register) ══════');

  const email = `test_e2e_${Date.now()}@fastgood.com`;
  const r = await post('/api/register', {
    nombre: 'Test',
    apellido: 'E2E',
    email: email,
    'contraseña': 'test123',
    telefono: '000',
    direccion: 'Test 123'
  });

  if (r.status === 200 && r.data?.usuario?.id) {
    ok('POST /api/register', `id=${r.data.usuario.id} email=${email}`);
    cleanupIds.usuarios.push(r.data.usuario.id);

    // Verificar login con el usuario recién creado
    const r2 = await post('/api/login', { nombre: email, 'contraseña': 'test123' });
    if (r2.status === 200 && r2.data?.token) {
      ok('Login con usuario recién registrado funciona');
    } else {
      fail('Login con usuario recién registrado',
           `status=${r2.status} err=${JSON.stringify(r2.data)}`);
    }
  } else {
    fail('POST /api/register', `status=${r.status} err=${JSON.stringify(r.data)}`);
  }
}

async function testReportes() {
  console.log('\n══════ 11. REPORTES ══════');

  const endpoints = [
    '/api/reportes/resumen',
    '/api/reportes/ingresos-por-dia',
    '/api/reportes/gastos-por-dia',
    '/api/reportes/productos-mas-vendidos',
    '/api/reportes/stock-movimientos'
  ];

  for (const ep of endpoints) {
    const r = await get(ep);
    if (r.status === 200) {
      ok(`GET ${ep}`, `OK`);
    } else {
      fail(`GET ${ep}`, `status=${r.status} err=${JSON.stringify(r.data)}`);
    }
  }
}

async function testBarriosEnvios() {
  console.log('\n══════ 12. BARRIOS Y ENVÍOS ══════');

  const r1 = await get('/api/barrios');
  if (r1.status === 200 && Array.isArray(r1.data)) {
    ok('GET /api/barrios', `${r1.data.length} barrios`);
  } else {
    fail('GET /api/barrios', `status=${r1.status} err=${JSON.stringify(r1.data)}`);
  }

  const r2 = await get('/api/envios');
  if (r2.status === 200 && Array.isArray(r2.data)) {
    ok('GET /api/envios', `${r2.data.length} envíos`);
  } else {
    fail('GET /api/envios', `status=${r2.status} err=${JSON.stringify(r2.data)}`);
  }
}

async function testCocinaYTareas() {
  console.log('\n══════ 13. TAREAS DE COCINA ══════');

  const r = await get('/api/cocina/tareas');
  if (r.status === 200 && Array.isArray(r.data)) {
    ok('GET /api/cocina/tareas', `${r.data.length} tareas pendientes`);
  } else {
    fail('GET /api/cocina/tareas', `status=${r.status} err=${JSON.stringify(r.data)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECCIÓN HELADERA (pasos H8 y H9). Corre SOLA con: node tests/test_e2e.js heladera
//
// Funciones:
//   comprobar          → anota una prueba: ✅ si se cumple, ❌ si no
//   loginSinMostrar    → inicia sesión con el usuario del .env, sin mostrar el usuario ni el token
//   leerHeladera       → cómo están algunos platos: { id: { nombre, libres, reservadas, en_heladera } }
//   crearPedidoPrueba  → manda un pedido "PRUEBA – NO PREPARAR" por la web pública (sin sesión, como un cliente)
//   anularPedidoPrueba → anula un pedido de prueba con el PIN del .env (sin mostrarlo)
//   revisarHeladera    → compara la heladera con lo que tendría que haber cambiado: ✅ o ❌
//   testArmado         → (26/10) la sección ARMADO: corre adentro de testHeladera, con sus pedidos A y D
//   necesarioConMuchas → (27/10) cuánto "necesitás" de cada insumo con 1.000.000 viandas de un plato (solo lee)
//   testAvisosInsumos  → (27/10) la sección AVISOS DE INSUMOS: Pedir a cocina, Para stock y la red de "Hecho"
//   testHeladera       → la sección entera, de principio a fin (los pasos están numerados adentro)
// Eran 7 (más testArmado, 26/10) porque cada una hace un trabajo que se repite varias veces en la sección (leer la heladera,
// crear y anular pedidos, revisar); testHeladera es la receta que las usa en orden.
//
// REGLAS (corre contra la base REAL, la que usa el negocio):
//   - Solo crea pedidos "PRUEBA – NO PREPARAR" y los anula al final, aunque algo falle en el medio.
//   - NUNCA marca "Hecho", ni descarta, ni pasa a 3 o 4 un pedido con personalizados, ni carga compras.
//   - Guarda la heladera de los platos que usa y al final comprueba que quedó igual (si no, lo dice en rojo).
//   - El usuario, la contraseña y el PIN salen del .env y nunca se muestran.
//   - Manda 3 pedidos por la web (el límite es 5 cada 10 minutos por IP): para correrlo dos veces
//     seguidas, esperar 10 minutos o reiniciar el servidor.
// ═══════════════════════════════════════════════════════════════

const NOMBRE_PRUEBA = 'PRUEBA – NO PREPARAR';    // así se ven los pedidos de prueba en todas las pantallas
const ROJO = '\x1b[31m';                          // para escribir en rojo en la consola...
const NORMAL = '\x1b[0m';                         // ...y volver al color de siempre
const pedidosDePrueba = [];                       // los pedidos de prueba creados que todavía no se anularon

// ─────────────────────────────────────────────────────────────────────────────
// comprobar → anota una prueba en el resultado
// ENTRADA: nombre (qué se prueba), seCumple (true o false) y detalle (lo que se ve al lado)
// SALIDA:  seCumple (así se puede cortar si lo que sigue depende de esta prueba)
// Ej: comprobar('Vender (A) → 200', true, 'pedido #260') → "✅ Vender (A) → 200 — pedido #260"
// ─────────────────────────────────────────────────────────────────────────────
function comprobar(nombre, seCumple, detalle) {
  if (seCumple) ok(nombre, detalle);              // se cumple: ✅
  if (!seCumple) fail(nombre, detalle);           // no se cumple: ❌ (va al detalle de fallos del final)
  return seCumple;
}

// ─────────────────────────────────────────────────────────────────────────────
// loginSinMostrar → inicia sesión con TEST_ADMIN_USER / TEST_ADMIN_PASS del .env
// ENTRADA: nada
// SALIDA:  { token, id } del usuario, o null si no se pudo. No escribe el usuario, la contraseña ni el token.
// Ej: → { token: 'eyJ…', id: '3f2a…' } (nada de eso aparece en la consola)
// ─────────────────────────────────────────────────────────────────────────────
async function loginSinMostrar() {
  const r = await post('/api/login', { nombre: ADMIN_USER, contraseña: ADMIN_PASS });
  const salioBien = r.status === 200 && Boolean(r.data?.token);   // ?. = "si vino data, su token"
  if (!salioBien) return null;
  return { token: r.data.token, id: r.data.usuario?.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// leerHeladera → cómo están algunos platos en la heladera (GET /api/viandas-stock)
// ENTRADA: ids (los números de los platos)
// SALIDA:  { id: { nombre, libres, reservadas, en_heladera } }, o null si la ruta falló
// Ej: [7] → { 7: { nombre: 'fideos', libres: 61, reservadas: 10, en_heladera: 71 } }
// ─────────────────────────────────────────────────────────────────────────────
async function leerHeladera(ids) {
  const r = await get('/api/viandas-stock');
  if (r.status !== 200 || !Array.isArray(r.data)) return null;    // si falló: null
  const heladera = {};
  ids.forEach(id => {                                             // por cada plato pedido...
    const plato = r.data.find(p => p.id === id);                  // ...find = el plato con ese número (o undefined)
    if (!plato) return;                                           // (return = saltear: ya no está activo)
    heladera[id] = { nombre: plato.nombre, libres: plato.stock_heladera, reservadas: plato.reservadas, en_heladera: plato.en_heladera };
  });
  return heladera;
}

// ─────────────────────────────────────────────────────────────────────────────
// crearPedidoPrueba → manda un pedido de combos "PRUEBA – NO PREPARAR" por la web pública (POST /api/pedidos-combos)
// ENTRADA: combos ([{ id_combo, platos: [{ producto_id, cantidad, personalizado }] }]) y fechaEntrega ('AAAA-MM-DD')
// SALIDA:  { status, data } (200 con id_pedido · 400 con el error · 429 si se pasó el límite de pedidos).
//          Si se creó, el número queda en pedidosDePrueba (para anularlo al final, pase lo que pase).
// Ej: 1 combo "Keto x10" con 10 fideos → { status: 200, data: { id_pedido: 260, total: 137000, … } }
// Va SIN sesión, como un cliente de la web: el pedido queda a nombre de "Consumidor Final".
// ─────────────────────────────────────────────────────────────────────────────
async function crearPedidoPrueba(combos, fechaEntrega) {
  const res = await fetch(BASE_URL + '/api/pedidos-combos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },              // sin Authorization: como la web sin sesión
    body: JSON.stringify({
      combos:            combos,
      cliente_nombre:    NOMBRE_PRUEBA,
      cliente_direccion: 'PRUEBA (no entregar)',
      cliente_telefono:  '0',
      cliente_email:     null,
      fecha_entrega:     fechaEntrega,
      metodo_pago:       'Efectivo',
      tipo_entrega:      'Retiro en local',
      barrio_id:         null,
      observaciones:     'Pedido de prueba del test HELADERA: no preparar (el test lo anula solo)'
    })
  });
  const data = await res.json().catch(() => null);                // si no es JSON: null
  const idCreado = data?.id_pedido;                               // el número, si se creó
  if (idCreado) pedidosDePrueba.push(idCreado);                   // se anota para anularlo al final
  return { status: res.status, data: data };
}

// ─────────────────────────────────────────────────────────────────────────────
// anularPedidoPrueba → anula un pedido de prueba (POST /api/pedidos/:id/anular) con el PIN del .env
// ENTRADA: idPedido
// SALIDA:  { status, data } (200 con viandas_devueltas · 409 si ya estaba anulado). El PIN no se muestra.
//          Anulado (o ya anulado), sale de pedidosDePrueba.
// Ej: 260 → { status: 200, data: { mensaje: 'Pedido anulado. Volvieron 10 viandas a la heladera.', viandas_devueltas: 10 } }
// ─────────────────────────────────────────────────────────────────────────────
async function anularPedidoPrueba(idPedido) {
  const r = await post(`/api/pedidos/${idPedido}/anular`, { pin: process.env.ADMIN_PIN || '' });
  const yaNoHayQueAnular = r.status === 200 || r.status === 409;  // se anuló ahora, o ya estaba anulado
  const posicion = pedidosDePrueba.indexOf(idPedido);             // indexOf = en qué lugar de la lista está (−1 si no está)
  const sacarDeLaLista = yaNoHayQueAnular && posicion >= 0;
  if (sacarDeLaLista) pedidosDePrueba.splice(posicion, 1);        // splice(lugar, 1) = saca ese de la lista
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// revisarHeladera → compara la heladera con lo que tendría que haber cambiado, plato por plato
// ENTRADA: paso (el nombre de la prueba), antes y ahora (de leerHeladera) y los cambios esperados
//          { id: { libres, reservadas } } (un plato que no está en cambios tiene que seguir igual)
// SALIDA:  true si todo coincide (✅), false si no (❌ con lo que esperaba y lo que hay)
// Ej: vender 10 fideos → cambios { 7: { libres: -10, reservadas: 10 } }: libres 61 → 51 y reservadas 10 → 20
// ─────────────────────────────────────────────────────────────────────────────
function revisarHeladera(paso, antes, ahora, cambios) {
  if (!antes || !ahora) return comprobar(paso, false, 'no se pudo leer la heladera (GET /api/viandas-stock)');

  const diferencias = [];                                         // lo que no coincide, en frases
  // Object.keys da la lista de números de plato del objeto. Ej: { 7: {...}, 9: {...} } → ['7', '9']
  Object.keys(antes).forEach(id => {                              // por cada plato...
    const cambio = cambios[id] || { libres: 0, reservadas: 0 };   // ...lo que tenía que cambiar (nada, si no está)
    const libresEsperadas = antes[id].libres + cambio.libres;
    const reservadasEsperadas = antes[id].reservadas + cambio.reservadas;
    const actual = ahora[id] || { libres: '?', reservadas: '?', en_heladera: '?' };  // si ya no está: "?"
    const coincide = actual.libres === libresEsperadas && actual.reservadas === reservadasEsperadas
      && actual.en_heladera === libresEsperadas + reservadasEsperadas;
    if (coincide) return;                                         // (return = este plato está bien: seguir con el siguiente)
    diferencias.push(`${antes[id].nombre}: libres ${actual.libres} (esperaba ${libresEsperadas}), reservadas ${actual.reservadas} (esperaba ${reservadasEsperadas})`);
  });

  // Cómo quedó cada plato, para mostrarlo. Ej: "fideos: 51 libres, 20 reservadas"
  const comoQuedo = Object.keys(antes).map(id => `${antes[id].nombre}: ${ahora[id]?.libres} libres, ${ahora[id]?.reservadas} reservadas`).join(' · ');
  const detalle = diferencias.length > 0 ? diferencias.join(' · ') : comoQuedo;
  return comprobar(paso, diferencias.length === 0, detalle);
}

// ─────────────────────────────────────────────────────────────────────────────
// testArmado → la sección ARMADO (26/10): la pantalla "Armado de pedidos", por sus rutas (GET /api/armado y
//              POST /api/pedidos/:id/armado). Corre ADENTRO de testHeladera, con sus pedidos de prueba, antes de anularlos:
//              así no crea pedidos nuevos (no choca con el límite de 5 pedidos cada 10 minutos).
// ENTRADA: idA (todo de heladera, ya en 3), idD (con 2 "sin sal" sin cocinar), fechaEntrega (la de los dos),
//          comoCocinero (el header del cocinero de mentira, para el 403) e idUsuario (el del .env, para ver quién armó)
// SALIDA:  nada (escribe ✅ / ❌ por cada prueba). A queda ARMADO (es una marca: sigue en 3); al final se anula igual.
// Ej: D → 409 "Todavía falta cocinar…" · A → 200 y sigue en 3 · A otra vez → 409 · fecha 2026-02-30 → 400 · cocinero → 403
// REGLAS: no cocina nada ni marca "Listo" (eso pasaría D a 3 y gastaría insumos). Si D quedó en 1 (faltan insumos),
//         lo pasa a 2 "aunque falten insumos": en 2 no se descuenta nada.
// ─────────────────────────────────────────────────────────────────────────────
async function testArmado(idA, idD, fechaEntrega, comoCocinero, idUsuario) {
  console.log('\n══════ ARMADO (pantalla Armado de pedidos) ══════');

  // 1. D tiene que estar en 2 (En preparación) para probar "falta cocinar". Si quedó en 1, pasa a 2 sin revisar insumos.
  const lecturaD = await supabase.from('pedidos').select('id_estado').eq('id', idD).maybeSingle();
  const dEn1 = lecturaD.data?.id_estado === 1;
  const pasarD = dEn1 ? await put(`/api/pedidos/${idD}/estado`, { estado_id: 2, aunque_falten_insumos: true }) : null;
  if (dEn1) comprobar('Armado: D pasa a 2 (aunque falten insumos: en 2 no se descuenta nada)', pasarD.status === 200 && pasarD.data?.pedido?.id_estado === 2, `status=${pasarD.status} ${pasarD.data?.error || ''}`);

  // 2. Traer el día: están A y D, con sus renglones como los guardó la base
  const dia = await get(`/api/armado?fecha=${fechaEntrega}`);
  const delDia = Array.isArray(dia.data) ? dia.data : [];
  const enDiaA = delDia.find(p => p.id === idA);                  // find = el pedido A (o undefined)
  const enDiaD = delDia.find(p => p.id === idD);
  comprobar('Armado: GET /api/armado del día → 200 con A y D', dia.status === 200 && Boolean(enDiaA) && Boolean(enDiaD), `status=${dia.status} · ${delDia.length} pedidos ese día ${dia.data?.error || ''}`);
  const renglonesA = enDiaA?.pedido_detalles || [];
  const aTodoDeHeladera = renglonesA.length > 0 && renglonesA.every(d => d.cantidad_de_heladera === d.cantidad && d.listo === true) && enDiaA.armado_en === null;
  comprobar('Armado: A viene todo de la heladera y sin armar', aTodoDeHeladera, JSON.stringify(renglonesA.map(d => ({ cantidad: d.cantidad, de_heladera: d.cantidad_de_heladera, listo: d.listo }))));
  const sinSalD = (enDiaD?.pedido_detalles || []).find(d => d.personalizado === true);
  const dSinCocinar = Boolean(sinSalD) && sinSalD.cantidad === 2 && sinSalD.cantidad_de_heladera === 0 && sinSalD.listo === false;
  comprobar('Armado: D trae los 2 "sin sal" sin cocinar', dSinCocinar, sinSalD ? `${sinSalD.cantidad} · de heladera ${sinSalD.cantidad_de_heladera} · listo ${sinSalD.listo}` : 'no apareció');

  // 3. Lo que el servidor NO deja (409): D con algo sin cocinar, y A con otra fecha
  const armarD = await post(`/api/pedidos/${idD}/armado`, { fecha: fechaEntrega });
  comprobar('Armado: D con un personalizado sin cocinar → 409', armarD.status === 409 && String(armarD.data?.error).startsWith('Todavía falta cocinar'), `status=${armarD.status} "${armarD.data?.error}"`);
  const otraFecha = fechas.fechaLocalISO(fechas.proximoDiaHabil(fechas.parseFechaLocal(fechaEntrega)));
  const armarAOtroDia = await post(`/api/pedidos/${idA}/armado`, { fecha: otraFecha });
  comprobar('Armado: A con otra fecha → 409', armarAOtroDia.status === 409 && String(armarAOtroDia.data?.error).startsWith('El pedido no se entrega ese día'), `status=${armarAOtroDia.status} "${armarAOtroDia.data?.error}"`);

  // 4. A (sin nada para cocinar) SÍ se arma: guarda quién (el del token) y no cambia el estado
  const armarA = await post(`/api/pedidos/${idA}/armado`, { fecha: fechaEntrega });
  const armadoBien = armarA.status === 200 && Boolean(armarA.data?.pedido?.armado_en) && armarA.data?.pedido?.armado_por === idUsuario;
  comprobar('Armado: A → 200, con la hora y el usuario del token', armadoBien, `status=${armarA.status} ${armarA.data?.mensaje || armarA.data?.error}`);
  const despues = await get(`/api/armado?fecha=${fechaEntrega}`);
  const aDespues = (Array.isArray(despues.data) ? despues.data : []).find(p => p.id === idA);
  comprobar('Armado: A sigue en 3 y figura armado (con nombre)', aDespues?.id_estado === 3 && Boolean(aDespues?.armado_en) && Boolean(aDespues?.armado_por_nombre), aDespues ? `estado ${aDespues.id_estado} · armado ${Boolean(aDespues.armado_en)} · nombre ${aDespues.armado_por_nombre ? 'sí' : 'no'}` : 'no apareció');

  // 5. Dos veces no
  const armarAOtraVez = await post(`/api/pedidos/${idA}/armado`, { fecha: fechaEntrega });
  comprobar('Armado: A otra vez → 409', armarAOtraVez.status === 409 && armarAOtraVez.data?.error === 'El pedido ya estaba armado', `status=${armarAOtraVez.status} "${armarAOtraVez.data?.error}"`);

  // 6. Datos malos → 400 (el servidor corta antes de ir a la base)
  const fechasMalas = await Promise.all([get('/api/armado?fecha=2026-02-30'), get('/api/armado?fecha=hola'), get('/api/armado')]);
  comprobar('Armado: fecha inválida o sin fecha → 400', fechasMalas.every(r => r.status === 400), fechasMalas.map(r => r.status).join(', '));   // every = ¿todas?
  const malos = await Promise.all([post('/api/pedidos/abc/armado', { fecha: fechaEntrega }), post(`/api/pedidos/${idA}/armado`, { fecha: '29/10/2026' })]);
  comprobar('Armado: número o fecha inválidos en el POST → 400', malos.every(r => r.status === 400), malos.map(r => r.status).join(', '));

  // 7. Un rol sin permiso (el cocinero) → 403, en las dos rutas
  const verCocinero = await get(`/api/armado?fecha=${fechaEntrega}`, comoCocinero);
  const armarCocinero = await post(`/api/pedidos/${idA}/armado`, { fecha: fechaEntrega }, comoCocinero);
  comprobar('Armado: el cocinero → 403 (ver y armar)', verCocinero.status === 403 && armarCocinero.status === 403, `GET ${verCocinero.status} · POST ${armarCocinero.status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// necesarioConMuchas → (27/10) cuánto "necesitás" de cada insumo si se pidieran a cocina 1.000.000 viandas de un plato
// ENTRADA: idPlato
// SALIDA:  { status, porInsumo: { nombre: necesitas } }. Con tantas viandas, TODOS los insumos de la receta faltan,
//          así aparecen todos. Solo lee (POST /api/pedir-cocina/faltantes no guarda nada).
// Ej: berenjenas (Carne 140 g por vianda) → { status: 200, porInsumo: { Carne: 140000280 } } (incluye lo comprometido)
// ─────────────────────────────────────────────────────────────────────────────
async function necesarioConMuchas(idPlato) {
  const r = await post('/api/pedir-cocina/faltantes', { items: [{ id_producto: idPlato, cantidad: 1000000 }] });
  const porInsumo = {};
  (Array.isArray(r.data?.faltantes) ? r.data.faltantes : []).forEach(f => { porInsumo[f.nombre] = f.necesitas; });
  return { status: r.status, porInsumo: porInsumo };
}

// ─────────────────────────────────────────────────────────────────────────────
// testAvisosInsumos → (27/10) la sección AVISOS DE INSUMOS: "Pedir a cocina", "Para stock" y la red de "Hecho".
//                     Corre adentro de testHeladera, mientras D (con 2 "sin sal" en estado 2) todavía no se anuló.
// ENTRADA: plato (el de A y D), comoCocinero (el header del cocinero de mentira)
// SALIDA:  lo que devolvió necesarioConMuchas con D abierto (para comparar después de anularlo)
// NO crea pedidos a cocina ni marca "Hecho" de verdad: el "Hecho" se prueba con un renglón que no existe.
// ─────────────────────────────────────────────────────────────────────────────
async function testAvisosInsumos(plato, comoCocinero) {
  console.log('\n══════ AVISOS DE INSUMOS (Pedir a cocina · Para stock · Hecho) ══════');

  // 1. Datos malos → 400 y el cocinero → 403 (el cocinero no pide a cocina)
  const malos = await Promise.all([post('/api/pedir-cocina/faltantes', { items: [] }), post('/api/pedir-cocina/faltantes', { items: [{ id_producto: 'x', cantidad: 2 }] }), post('/api/pedir-cocina/faltantes', {})]);
  comprobar('Faltantes: lista vacía o inválida → 400', malos.every(r => r.status === 400), malos.map(r => r.status).join(', '));
  const delCocinero = await post('/api/pedir-cocina/faltantes', { items: [{ id_producto: plato.id, cantidad: 1 }] }, comoCocinero);
  comprobar('Faltantes: el cocinero → 403', delCocinero.status === 403, `status=${delCocinero.status}`);

  // 2. Una cantidad enorme: faltan todos los insumos de la receta, y cada uno trae bien la cuenta (falta = necesitás − tenés)
  const r = await post('/api/pedir-cocina/faltantes', { items: [{ id_producto: plato.id, cantidad: 1000000 }] });
  const lista = Array.isArray(r.data?.faltantes) ? r.data.faltantes : [];
  const recetaPlato = await supabase.from('producto_insumo').select('id_insumo').eq('id_producto', plato.id);   // solo lee
  const insumosReceta = (recetaPlato.data || []).length;
  const cuentasBien = lista.every(f => f.tenes < f.necesitas && Math.abs(f.falta - (f.necesitas - f.tenes)) < 0.001 && typeof f.texto === 'string');
  comprobar('Faltantes: 1.000.000 viandas → falta cada insumo de la receta, con su cuenta', r.status === 200 && lista.length === insumosReceta && cuentasBien,
    `status=${r.status} · ${lista.length} faltantes de ${insumosReceta} insumos · ${lista.slice(0, 2).map(f => f.texto).join(', ')}`);
  const unaSola = await post('/api/pedir-cocina/faltantes', { items: [{ id_producto: plato.id, cantidad: 1 }] });
  comprobar('Faltantes: 1 vianda → 200 con su lista (puede estar vacía)', unaSola.status === 200 && Array.isArray(unaSola.data?.faltantes), `status=${unaSola.status} · ${(unaSola.data?.faltantes || []).map(f => f.texto).join(', ') || 'alcanza todo'}`);

  // 3. "Para stock": cada pendiente trae su lista de faltantes
  const pendientes = await get('/api/ordenes-produccion/pendientes');
  const listaPendientes = Array.isArray(pendientes.data) ? pendientes.data : [];
  comprobar('Para stock: cada pendiente trae faltantes (una lista)', pendientes.status === 200 && listaPendientes.every(p => Array.isArray(p.faltantes)),
    `status=${pendientes.status} · ${listaPendientes.length} pendientes · ${listaPendientes.filter(p => p.faltantes?.length > 0).length} con faltantes`);

  // 4. La red de "Hecho", con un renglón que no existe: no calcula, no toca nada y responde como siempre (409)
  const hechoQueNoExiste = await post('/api/ordenes-produccion/detalles/2147483647/hecho', {});
  comprobar('Hecho de un renglón que no existe → 409, sin pedir confirmación', hechoQueNoExiste.status === 409 && hechoQueNoExiste.data?.necesita_confirmar !== true, `status=${hechoQueNoExiste.status} "${hechoQueNoExiste.data?.error}"`);

  // 5. Lo comprometido con D abierto (se compara después de anularlo, en testHeladera)
  return necesarioConMuchas(plato.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// testHeladera → la sección HELADERA entera, por las rutas, contra la base real (ver las REGLAS arriba)
// ENTRADA: nada (usa el .env y el servidor prendido)
// SALIDA:  nada (escribe ✅ / ❌ / ⚠️ por cada prueba; los totales salen en el resumen del final)
// Ej: con "Keto x10" y 61 fideos libres: vende 10 (A), intenta más de los que quedan (B, no alcanza),
//     vende 8 + 2 "sin sal" (D), A salta a 3, D queda en 2, revisa los movimientos y el mínimo,
//     anula A y D, prueba que un anulado no se toca más y comprueba que la heladera volvió a 61.
// ─────────────────────────────────────────────────────────────────────────────
async function testHeladera() {
  console.log('\n══════ HELADERA (pasos H8 y H9) ══════');
  console.log(`  Crea pedidos "${NOMBRE_PRUEBA}" y los anula al final. No marca Hecho, no descarta, no carga compras.`);
  let heladeraInicial = null;                                     // la heladera de los platos usados, al empezar

  try {
    // 1. Sesión (sin mostrar el usuario) y un cocinero de mentira (rol 2) para las pruebas de "403".
    //    El token del cocinero se firma con el JWT_SECRET del .env; su id no existe (el 403 sale antes de ir a la base).
    const sesion = await loginSinMostrar();
    const ayudaLogin = sesion ? '' : 'revisá TEST_ADMIN_USER y TEST_ADMIN_PASS';   // la ayuda, solo si falló
    if (!comprobar('Login con el usuario del .env (no se muestra)', Boolean(sesion), ayudaLogin)) return;
    tokenAdmin = sesion.token;                                    // de acá en adelante, get / post / put van con sesión
    const tokenCocinero = jwt.sign({ id: '00000000-0000-4000-8000-000000000002', rol: 2 }, process.env.JWT_SECRET || 'falta', { expiresIn: '10m' });
    const comoCocinero = { Authorization: 'Bearer ' + tokenCocinero };

    // 2. El combo y el plato (P): un combo de 3 o más viandas con un plato que tenga libres para dos pedidos
    //    a la vez (A con N viandas y D con N − 2). Los datos salen de la web (/api/v1/combos) y de Producción.
    const catalogo = await get('/api/v1/combos');
    const stock = await get('/api/viandas-stock');
    const hayDatos = catalogo.status === 200 && Array.isArray(catalogo.data) && stock.status === 200 && Array.isArray(stock.data);
    if (!comprobar('Combos de la web y heladera de Producción', hayDatos, `combos ${catalogo.status} · heladera ${stock.status}`)) return;
    const libresPorPlato = {};                                    // { id_producto: libres }
    stock.data.forEach(plato => { libresPorPlato[plato.id] = plato.stock_heladera; });
    // Cada combo con cada plato de su menú, en una sola lista. Acá sí hay un map adentro de un forEach: cada combo
    // trae su propio menú. concat junta las listas. Ej: [Keto x10 con menú [fideos, tarta]] → [Keto+fideos, Keto+tarta]
    let opciones = [];
    catalogo.data.forEach(combo => {
      opciones = opciones.concat(combo.menu.map(plato => ({ combo: combo, plato: plato })));
    });
    const elegida = opciones.find(op => op.combo.cantidad >= 3 && (libresPorPlato[op.plato.id] || 0) >= 2 * op.combo.cantidad - 2);
    const ayudaCombo = elegida ? '' : 'hace falta un combo de 3 o más viandas con un plato con libres para dos pedidos';  // solo si falta
    if (!comprobar('Hay un combo y un plato para probar', Boolean(elegida), ayudaCombo)) return;
    const combo = elegida.combo;                                  // ej: "Keto x10"
    const plato = elegida.plato;                                  // ej: fideos
    const N = combo.cantidad;                                     // ej: 10
    // Para "no alcanza": otro plato (Q) con menos libres que su combo. Si no hay, P repetido en varios combos.
    const conPocas = opciones.find(op => op.plato.id !== plato.id && (libresPorPlato[op.plato.id] || 0) < op.combo.cantidad);
    console.log(`  Combo «${combo.nombre}» (${N} viandas) · plato «${plato.nombre}» (${libresPorPlato[plato.id]} libres)`);

    // 3. La heladera de los platos que se usan, al empezar (al final tiene que quedar igual), y las fechas
    const idsUsados = conPocas ? [plato.id, conPocas.plato.id] : [plato.id];
    heladeraInicial = await leerHeladera(idsUsados);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date());  // 'AAAA-MM-DD' en Argentina
    const fechaEntrega = fechas.fechaLocalISO(fechas.sumarDiasHabiles(fechas.parseFechaLocal(hoy), 4));          // 4 días hábiles: alcanza también con personalizados
    // [plato.id]: … = la clave es el número del plato. Ej: { [7]: { libres: -10 } } es { 7: { libres: -10 } }

    // 4. VENDER (pedido A): N viandas de P → libres −N, reservadas +N
    const pedidoA = await crearPedidoPrueba([{ id_combo: combo.id, platos: [{ producto_id: plato.id, cantidad: N, personalizado: null }] }], fechaEntrega);
    const idA = pedidoA.data?.id_pedido;                          // el número del pedido A
    const ventaCreada = pedidoA.status === 200 && Boolean(idA);
    if (!comprobar('Vender (A) → 200', ventaCreada, `status=${pedidoA.status} ${pedidoA.data?.error || 'pedido #' + idA}`)) return;
    const despuesDeA = await leerHeladera(idsUsados);
    revisarHeladera('Vender: la heladera baja y las reservadas suben', heladeraInicial, despuesDeA, { [plato.id]: { libres: -N, reservadas: N } });

    // 5. NO ALCANZA (pedido B): más viandas de las que quedan → 400 con el mensaje, y no se crea ningún pedido.
    //    Con Q: un combo de Q. Sin Q: P repetido en tantos combos como haga falta para pasarse (hasta 10).
    const libresP = despuesDeA ? despuesDeA[plato.id].libres : 0;
    const combosNecesarios = Math.floor(libresP / N) + 1;         // ej: 51 libres y combos de 10 → 6 combos = 60
    const comboDeP = { id_combo: combo.id, platos: [{ producto_id: plato.id, cantidad: N, personalizado: null }] };
    const comboDeQ = conPocas ? { id_combo: conPocas.combo.id, platos: [{ producto_id: conPocas.plato.id, cantidad: conPocas.combo.cantidad, personalizado: null }] } : null;
    const combosB = conPocas ? [comboDeQ] : Array(combosNecesarios).fill(comboDeP);  // Array(6).fill(x) = [x, x, x, x, x, x]
    const platoB = conPocas ? conPocas.plato : plato;             // el plato que no alcanza
    const sePuedeProbarB = Boolean(conPocas) || combosNecesarios <= 10;
    if (!sePuedeProbarB) warn('No alcanza (B)', `no se probó: hay demasiadas libres de «${plato.nombre}» (harían falta más de 10 combos)`);
    if (sePuedeProbarB) {
      const listaAntes = await get(`/api/pedidos?desde=${hoy}&hasta=${hoy}`);    // los pedidos de hoy, antes
      const pedidoB = await crearPedidoPrueba(combosB, fechaEntrega);
      const listaDespues = await get(`/api/pedidos?desde=${hoy}&hasta=${hoy}`);  // y después
      const cuantosAntes = (listaAntes.data || []).filter(p => p.cliente_nombre === NOMBRE_PRUEBA).length;
      const cuantosDespues = (listaDespues.data || []).filter(p => p.cliente_nombre === NOMBRE_PRUEBA).length;
      const mensajeB = String(pedidoB.data?.error || '');
      const avisaBien = pedidoB.status === 400 && mensajeB.startsWith(`No quedan suficientes viandas de «${platoB.nombre}»`);  // startsWith = "empieza con"
      comprobar('No alcanza (B) → 400 con el mensaje', avisaBien, `status=${pedidoB.status} "${mensajeB}"`);
      comprobar('No alcanza: no se creó ningún pedido', cuantosDespues === cuantosAntes, `pedidos "${NOMBRE_PRUEBA}" de hoy: ${cuantosAntes} → ${cuantosDespues}`);
      revisarHeladera('No alcanza: la heladera no cambió', despuesDeA, await leerHeladera(idsUsados), {});
    }

    // 6. CON PERSONALIZADO (pedido D): N − 2 de la heladera + 2 "sin sal" (esos no salen de la heladera: van a cocina)
    const antesDeD = await leerHeladera(idsUsados);
    const pedidoD = await crearPedidoPrueba([{ id_combo: combo.id, platos: [
      { producto_id: plato.id, cantidad: N - 2, personalizado: null },
      { producto_id: plato.id, cantidad: 2, personalizado: 'sin sal (PRUEBA)' }
    ] }], fechaEntrega);
    const idD = pedidoD.data?.id_pedido;                          // el número del pedido D
    const ventaDCreada = pedidoD.status === 200 && Boolean(idD);
    comprobar('Con personalizado (D) → 200', ventaDCreada, `status=${pedidoD.status} ${pedidoD.data?.error || 'pedido #' + idD}`);
    revisarHeladera('Con personalizado: solo baja lo que sale de la heladera', antesDeD, await leerHeladera(idsUsados), { [plato.id]: { libres: -(N - 2), reservadas: N - 2 } });

    // 7. TODO DE HELADERA SALTA A 3: A (sin personalizados) de 1 a 2 → el servidor lo deja en 3.
    //    Al llegar a 3 corre descontar_insumos_pedido: A no tiene personalizados, así que no descuenta nada.
    const estadoA = await put(`/api/pedidos/${idA}/estado`, { estado_id: 2 });
    const saltoA3 = estadoA.status === 200 && estadoA.data?.pedido?.id_estado === 3;
    comprobar('Todo de heladera: de 1 a 2 salta a 3', saltoA3, `status=${estadoA.status} estado=${estadoA.data?.pedido?.id_estado} ${estadoA.data?.error || ''}`);
    const lecturaInsumosA = await supabase.from('movimientos_stock').select('id', { count: 'exact', head: true }).eq('id_pedido', idA);  // solo cuenta (head: sin traer filas)
    const sinInsumosA = !lecturaInsumosA.error && lecturaInsumosA.count === 0;
    comprobar('descontar_insumos_pedido en A (sin personalizados): 0 insumos', sinInsumosA,
      lecturaInsumosA.error ? 'no se pudo leer movimientos_stock.id_pedido (¿se corrió sql/insumos_pedido.sql, bloque 1?)' : `${lecturaInsumosA.count} renglones de insumos`);

    // 8. CON PERSONALIZADO QUEDA EN 2: D de 1 a 2. Solo si alcanzan los insumos de los 2 "sin sal"
    //    (a 2 se revisan, no se descuentan). D nunca pasa a 3.
    const stockD = await get(`/api/pedidos/${idD}/verificar-stock`);
    const alcanzanInsumos = stockD.status === 200 && stockD.data?.ok === true;
    if (!alcanzanInsumos) warn('Con personalizado queda en 2', `no se probó (el pedido no se movió): ${stockD.data?.error || 'status ' + stockD.status}`);
    const estadoD = alcanzanInsumos ? await put(`/api/pedidos/${idD}/estado`, { estado_id: 2 }) : null;
    const quedoEn2 = alcanzanInsumos && estadoD.status === 200 && estadoD.data?.pedido?.id_estado === 2;
    if (alcanzanInsumos) comprobar('Con personalizado: de 1 a 2 queda en 2', quedoEn2, `status=${estadoD.status} estado=${estadoD.data?.pedido?.id_estado} ${estadoD.data?.error || ''}`);

    // 9. FILTROS DE "ÚLTIMOS MOVIMIENTOS" (Producción): por tipo, y datos malos → 400
    const ventas = await get('/api/movimientos-viandas?tipo=venta');
    const listaVentas = Array.isArray(ventas.data) ? ventas.data : [];
    const soloVentas = ventas.status === 200 && listaVentas.every(m => m.tipo === 'venta');   // every = ¿TODOS cumplen? Ej: [venta, venta] → true
    comprobar('Últimos movimientos: ?tipo=venta trae solo ventas', soloVentas, `status=${ventas.status} · ${listaVentas.length} renglones`);
    const ventaDeA = listaVentas.find(m => m.motivo === 'Pedido #' + idA);
    const ventaDeABien = Boolean(ventaDeA) && Number(ventaDeA.cantidad) === -N && ventaDeA.plato_nombre === plato.nombre;
    comprobar('Últimos movimientos: está la venta de A', ventaDeABien, ventaDeA ? `${ventaDeA.cantidad} ${ventaDeA.plato_nombre} · "${ventaDeA.motivo}"` : 'no apareció');
    const tipoMalo = await get('/api/movimientos-viandas?tipo=raro');
    comprobar('Últimos movimientos: ?tipo=raro → 400', tipoMalo.status === 400, `status=${tipoMalo.status} "${tipoMalo.data?.error}"`);
    const desdeMalo = await get('/api/movimientos-viandas?desde=-5');
    comprobar('Últimos movimientos: ?desde=-5 → 400', desdeMalo.status === 400, `status=${desdeMalo.status} "${desdeMalo.data?.error}"`);

    // 10. MOVIMIENTOS DE STOCK, TODO JUNTO (GET /api/movimientos): las ventas de A y de D, con sus platos
    const deHoy = await get(`/api/movimientos?desde=${hoy}&hasta=${hoy}`);
    const movimientosHoy = Array.isArray(deHoy.data) ? deHoy.data : [];
    comprobar('Movimientos de Stock: GET /api/movimientos de hoy → 200', deHoy.status === 200, `status=${deHoy.status} · ${movimientosHoy.length} movimientos ${deHoy.data?.error || ''}`);
    const movVentaA = movimientosHoy.find(m => m.origen === 'venta' && m.numero === idA);
    const ventaABien = Boolean(movVentaA) && movVentaA.tipo === 'salida' && movVentaA.cliente === NOMBRE_PRUEBA
      && JSON.stringify(movVentaA.viandas) === JSON.stringify([{ plato: plato.nombre, cantidad: N }]);
    comprobar('Movimientos de Stock: la venta de A (salida, con el cliente y sus platos)', ventaABien, movVentaA ? JSON.stringify(movVentaA.viandas) : 'no apareció');
    const movVentaD = movimientosHoy.find(m => m.origen === 'venta' && m.numero === idD);
    const ventaDBien = Boolean(movVentaD) && JSON.stringify(movVentaD.viandas) === JSON.stringify([{ plato: plato.nombre, cantidad: N - 2 }]);
    comprobar('Movimientos de Stock: la venta de D, solo con lo que salió de la heladera', ventaDBien, movVentaD ? JSON.stringify(movVentaD.viandas) : 'no apareció');
    const fechaMala = await get('/api/movimientos?desde=2026-02-30');
    comprobar('Movimientos de Stock: fecha inválida → 400', fechaMala.status === 400, `status=${fechaMala.status} "${fechaMala.data?.error}"`);
    const alReves = await get(`/api/movimientos?desde=${hoy}&hasta=2020-01-01`);
    comprobar('Movimientos de Stock: "desde" mayor que "hasta" → 400', alReves.status === 400, `status=${alReves.status} "${alReves.data?.error}"`);

    // 11. EL MÍNIMO: datos malos → 400 (el servidor corta antes de ir a la base: no cambia nada) y el cocinero → 403
    const rutaMinimo = `/api/viandas-stock/${plato.id}/minimo`;
    const casosMalos = [
      { ruta: rutaMinimo, body: { stock_minimo: -1 } },           // negativo
      { ruta: rutaMinimo, body: { stock_minimo: 2.5 } },          // con decimales
      { ruta: rutaMinimo, body: { stock_minimo: 'abc' } },        // no es un número
      { ruta: rutaMinimo, body: { stock_minimo: 10000 } },        // más de 9999
      { ruta: rutaMinimo, body: {} },                             // sin el dato
      { ruta: '/api/viandas-stock/abc/minimo', body: { stock_minimo: 5 } },   // plato que no es un número
      { ruta: '/api/viandas-stock/0/minimo', body: { stock_minimo: 5 } }      // plato 0
    ];
    // map arma una lista de pedidos al servidor y Promise.all espera todas las respuestas. Ej: 7 casos → 7 respuestas
    const respuestasMalas = await Promise.all(casosMalos.map(caso => put(caso.ruta, caso.body)));
    const todos400 = respuestasMalas.every(r => r.status === 400);
    comprobar('Mínimo: 7 datos malos → 400', todos400, respuestasMalas.map(r => r.status).join(', '));
    const minimoCocinero = await put(rutaMinimo, { stock_minimo: 5 }, comoCocinero);
    comprobar('Mínimo: el cocinero → 403', minimoCocinero.status === 403, `status=${minimoCocinero.status}`);
    const heladeraCocinero = await get('/api/viandas-stock', comoCocinero);
    comprobar('El cocinero ve la heladera → 200', heladeraCocinero.status === 200, `status=${heladeraCocinero.status}`);
    const movimientosCocinero = await get(`/api/movimientos?desde=${hoy}&hasta=${hoy}`, comoCocinero);
    comprobar('Movimientos de Stock: el cocinero → 403', movimientosCocinero.status === 403, `status=${movimientosCocinero.status}`);

    // 11b. (26/10) ARMADO: la pantalla Armado de pedidos, con A y D antes de anularlos (ver testArmado)
    await testArmado(idA, idD, fechaEntrega, comoCocinero, sesion.id);

    // 11c. (27/10) AVISOS DE INSUMOS, con D abierto (sus 2 "sin sal" en estado 2 cuentan como comprometido)
    const conDAbierto = await testAvisosInsumos(plato, comoCocinero);

    // 12. ANULAR DEVUELVE: A (en 3) devuelve N y D (en 2) devuelve N − 2 (los "sin sal" no habían salido)
    const antesDeAnular = await leerHeladera(idsUsados);
    const anularA = await anularPedidoPrueba(idA);
    comprobar('Anular A → 200 y devuelve sus viandas', anularA.status === 200 && anularA.data?.viandas_devueltas === N, `status=${anularA.status} "${anularA.data?.mensaje || anularA.data?.error}"`);
    const anularD = await anularPedidoPrueba(idD);
    comprobar('Anular D → 200 y devuelve solo las de heladera', anularD.status === 200 && anularD.data?.viandas_devueltas === N - 2, `status=${anularD.status} "${anularD.data?.mensaje || anularD.data?.error}"`);
    // 12b. (27/10) Con D anulado, sus 2 "sin sal" dejan de estar comprometidos: lo que "necesitás" de cada insumo
    //      baja exactamente 2 × la receta por vianda (leída de la base, solo lectura)
    const conDAnulado = await necesarioConMuchas(plato.id);
    const receta = await supabase.from('producto_insumo').select('cantidad_necesaria, insumos ( nombre )').eq('id_producto', plato.id);
    const diferencias = (receta.data || []).map(renglon => {
      const nombre = renglon.insumos?.nombre;
      const bajo = (conDAbierto.porInsumo[nombre] || 0) - (conDAnulado.porInsumo[nombre] || 0);
      return { nombre: nombre, bajo: bajo, esperado: 2 * Number(renglon.cantidad_necesaria) };
    });
    const comprometidoBien = diferencias.length > 0 && diferencias.every(d => Math.abs(d.bajo - d.esperado) < 0.001);
    comprobar('Faltantes: cuenta lo comprometido (al anular D, baja 2 × la receta)', comprometidoBien, diferencias.map(d => `${d.nombre} −${d.bajo} (esperaba −${d.esperado})`).join(' · ') || 'el plato no tiene receta');

    const devueltas = N + (N - 2);                                // las de A más las de D
    revisarHeladera('Anular: las viandas volvieron a la heladera', antesDeAnular, await leerHeladera(idsUsados), { [plato.id]: { libres: devueltas, reservadas: -devueltas } });

    // 13. UN ANULADO NO CAMBIA DE ESTADO NI SE COBRA (A). El servidor corta antes de cambiar nada.
    const estadoAnulado = await put(`/api/pedidos/${idA}/estado`, { estado_id: 2 });
    comprobar('Anulado: cambiar el estado → 409', estadoAnulado.status === 409 && estadoAnulado.data?.error === 'Un pedido anulado no cambia de estado', `status=${estadoAnulado.status} "${estadoAnulado.data?.error}"`);
    const pagadoAnulado = await put(`/api/pedidos/${idA}/pagado`, { pagado: true });
    comprobar('Anulado: marcar pagado → 409', pagadoAnulado.status === 409 && pagadoAnulado.data?.error === 'Un pedido anulado no se puede cobrar', `status=${pagadoAnulado.status} "${pagadoAnulado.data?.error}"`);
    const pagoAnulado = await put(`/api/pedidos/${idA}/pago`, { metodo_pago: 'Efectivo' });
    comprobar('Anulado: cambiar el método de pago → 409', pagoAnulado.status === 409 && pagoAnulado.data?.error === 'Un pedido anulado no se puede cobrar', `status=${pagoAnulado.status} "${pagoAnulado.data?.error}"`);
    const transferenciaAnulado = await put(`/api/pedidos/${idA}/transferencia-confirmada`, {});
    comprobar('Anulado: confirmar la transferencia → 409', transferenciaAnulado.status === 409 && transferenciaAnulado.data?.error === 'Un pedido anulado no se puede cobrar', `status=${transferenciaAnulado.status} "${transferenciaAnulado.data?.error}"`);
    const anularOtraVez = await anularPedidoPrueba(idA);
    comprobar('Anulado: anular otra vez → 409', anularOtraVez.status === 409, `status=${anularOtraVez.status} "${anularOtraVez.data?.error}"`);
    const armarAnulado = await post(`/api/pedidos/${idA}/armado`, { fecha: fechaEntrega });   // (26/10) ARMADO
    comprobar('Anulado: marcar armado → 409', armarAnulado.status === 409 && armarAnulado.data?.error === 'Un pedido anulado no se arma', `status=${armarAnulado.status} "${armarAnulado.data?.error}"`);

    // 14. Las devoluciones, en "Últimos movimientos" (Producción) y en Movimientos de Stock
    const devoluciones = await get('/api/movimientos-viandas?tipo=devolucion');
    const devolucionDeA = (Array.isArray(devoluciones.data) ? devoluciones.data : []).find(m => m.motivo === 'Anulación del pedido #' + idA);
    const devolucionABien = Boolean(devolucionDeA) && Number(devolucionDeA.cantidad) === N;
    comprobar('Últimos movimientos: ?tipo=devolucion trae la anulación de A', devolucionABien, devolucionDeA ? `+${devolucionDeA.cantidad} ${devolucionDeA.plato_nombre}` : 'no apareció');
    const deHoyDespues = await get(`/api/movimientos?desde=${hoy}&hasta=${hoy}`);
    const movDevolucionA = (Array.isArray(deHoyDespues.data) ? deHoyDespues.data : []).find(m => m.origen === 'devolucion' && m.numero === idA);
    const devolucionUnificadaBien = Boolean(movDevolucionA) && movDevolucionA.tipo === 'entrada'
      && JSON.stringify(movDevolucionA.viandas) === JSON.stringify([{ plato: plato.nombre, cantidad: N }]);
    comprobar('Movimientos de Stock: la devolución de A (entrada, con sus platos)', devolucionUnificadaBien, movDevolucionA ? JSON.stringify(movDevolucionA.viandas) : 'no apareció');

    // 15. descontar_insumos_pedido (la función de la base de la parada 3B), en los casos que no descuentan nada.
    //     Se llama directo a la base (no hay una ruta solo para esto); ninguno de estos casos guarda nada.
    const sinUsuario = await supabase.rpc('descontar_insumos_pedido', { p_id_pedido: idA, p_id_usuario: null });
    comprobar('descontar_insumos_pedido sin usuario → no hace nada', sinUsuario.data?.error === 'Falta el usuario que cambia el estado del pedido', sinUsuario.error ? 'error de la base (¿se corrió sql/insumos_pedido.sql, bloque 2?)' : `"${sinUsuario.data?.error}"`);
    const noExiste = await supabase.rpc('descontar_insumos_pedido', { p_id_pedido: 2147483647, p_id_usuario: sesion.id });
    comprobar('descontar_insumos_pedido de un pedido que no existe', noExiste.data?.error === 'El pedido no existe', noExiste.error ? 'error de la base' : `"${noExiste.data?.error}"`);
    const deUnAnulado = await supabase.rpc('descontar_insumos_pedido', { p_id_pedido: idA, p_id_usuario: sesion.id });
    comprobar('descontar_insumos_pedido de un anulado → no descuenta', deUnAnulado.data?.error === 'Un pedido anulado no descuenta insumos', deUnAnulado.error ? 'error de la base' : `"${deUnAnulado.data?.error}"`);
    console.log('  ℹ️  "Ya descontado" la segunda vez (con insumos de verdad) se prueba en sql/insumos_pedido_probar.sql, parte B,');
    console.log('      que se deshace sola: acá habría que pasar a 3 un pedido con personalizados, y eso gastaría insumos reales.');
  } finally {
    // 16. Al final, pase lo que pase: se anulan los pedidos de prueba que quedaron y la heladera tiene que estar igual.
    //     slice() = una copia de la lista (anularPedidoPrueba va sacando de la original los que anula)
    const quedan = pedidosDePrueba.slice();
    await Promise.all(quedan.map(id => anularPedidoPrueba(id)));  // map + Promise.all = los anula y espera a todos
    if (quedan.length > 0) console.log(`  🗑️  Anulados al final: ${quedan.map(id => '#' + id).join(', ')}`);
    //     Si el test se cortó antes de leer la heladera, no hay con qué comparar ("? … : …" = solo se lee si hace falta)
    const idsIniciales = heladeraInicial ? Object.keys(heladeraInicial).map(Number) : [];   // los platos que se usaron
    const heladeraFinal = heladeraInicial ? await leerHeladera(idsIniciales) : null;
    const quedoIgual = heladeraInicial ? revisarHeladera('Al final: la heladera quedó igual que al empezar', heladeraInicial, heladeraFinal, {}) : true;
    if (!quedoIgual) console.log(`${ROJO}  ❌ LA HELADERA NO QUEDÓ IGUAL QUE AL EMPEZAR: mirá Producción (¿alguien cargó algo mientras corría el test?)${NORMAL}`);
  }
}

// ─── Limpieza ─────────────────────────────────────────────────
async function cleanup() {
  console.log('\n══════ LIMPIEZA ══════');

  for (const pid of cleanupIds.pedidos) {
    const { error: e1 } = await supabase.from('pedido_detalles').delete().eq('id_pedido', pid);
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from('pedidos').delete().eq('id', pid);
    console.log(`  🗑️  Pedido ${pid}: ${e2 ? 'error ' + e2.message : 'eliminado'}`);
  }
  for (const prodId of cleanupIds.productos) {
    // Borrar receta primero
    await del(`/api/recetas/${prodId}`);
    // Luego borrar producto directamente via supabase (no hay DELETE /api/productos/:id)
    // Lo desactivamos en su lugar: no hay endpoint, dejamos el producto de test
    console.log(`  🗑️  Producto ${prodId}: receta eliminada (producto queda como inactivo/test)`);
  }
  for (const uid of cleanupIds.usuarios) {
    const r = await del(`/api/usuarios/${uid}`);
    console.log(`  🗑️  Usuario ${uid}: ${r.status === 200 ? 'eliminado' : 'error ' + r.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  TEST END-TO-END — Fast Good (migración Supabase)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`⏰ ${new Date().toISOString()}\n`);

  // Verificar que el servidor responde
  try {
    await fetch(BASE_URL + '/api/estados');
  } catch (e) {
    console.error('❌ No se puede conectar al servidor en', BASE_URL);
    console.error('   Asegurate de que el servidor esté corriendo: node server.js');
    process.exit(1);
  }

  // "node tests/test_e2e.js heladera" corre SOLO la sección HELADERA (la que se puede correr contra la base
  // real: no crea productos ni borra nada) y termina ahí. Sin "heladera", corre todo lo de antes.
  if (process.argv[2] === 'heladera') {
    await testHeladera();
    terminar();
  }

  const token = await testLogin();
  tokenAdmin = token;
  const planes = await testCatalogo();
  const insumos = await testStock();
  await testRecetas();
  const productoId = await testProductoConReceta(planes, insumos, token);
  if (productoId) {
    await testPedidoCompleto(productoId);
  } else {
    warn('Pedido completo', 'Saltado porque no se pudo crear el producto');
  }
  await testEstados();
  await testCocineros();
  await testUsuarios();
  await testRegister();
  await testReportes();
  await testBarriosEnvios();
  await testCocinaYTareas();

  await cleanup();

  terminar();
}

// ─── Resumen y salida (lo usan las dos formas de correr el test) ───
// ENTRADA: nada (usa los contadores de ok / fail / warn)
// SALIDA:  escribe el resumen y termina el programa (código 1 si algo falló, 0 si no)
function terminar() {
  // ─── Resumen ────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN DE RESULTADOS                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Pasaron:   ${passCount}`);
  console.log(`  ❌ Fallaron:  ${failCount}`);
  console.log(`  ⚠️  Warnings: ${warnCount}`);

  if (failures.length > 0) {
    console.log('\n  ── Detalle de fallos ──');
    failures.forEach(f => console.log(f));
  }

  console.log(`\n⏰ Fin: ${new Date().toISOString()}`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
