/**
 * TEST END-TO-END — Fast Good (migración Supabase)
 * 
 * Testea todos los flujos principales simulando peticiones HTTP reales
 * al servidor Express levantado en localhost:3000.
 * 
 * IMPORTANTE: El servidor debe estar corriendo ANTES de ejecutar este script.
 * 
 * Se ejecuta con: node test_e2e.js
 */

const BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────
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
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function get(path, headers = {}) {
  const res = await fetch(BASE_URL + path, { headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function put(path, body, headers = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function del(path, headers = {}) {
  const res = await fetch(BASE_URL + path, { method: 'DELETE', headers });
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

  // 1a. Login con nombre_usuario correcto (mauro_admin / 123)
  const r1 = await post('/api/login', { nombre: 'mauro_admin', contraseña: '123' });
  if (r1.status === 200 && r1.data?.token) {
    ok('Login con nombre_usuario "mauro_admin" + contraseña "123"',
       `token=${r1.data.token.substring(0,20)}…`);
  } else {
    fail('Login con mauro_admin/123', `status=${r1.status} body=${JSON.stringify(r1.data)}`);
  }

  // 1b. Login con contraseña incorrecta → debe dar 401
  const r2 = await post('/api/login', { nombre: 'mauro_admin', contraseña: 'wrongpass' });
  if (r2.status === 401) {
    ok('Login con contraseña incorrecta → rechazado (401)');
  } else {
    fail('Login con contraseña incorrecta', `esperaba 401, recibió ${r2.status}`);
  }

  // 1c. Login con usuario inexistente → debe dar 401
  const r3 = await post('/api/login', { nombre: 'usuario_fantasma_xyz', contraseña: '123' });
  if (r3.status === 401) {
    ok('Login con usuario inexistente → rechazado (401)');
  } else {
    fail('Login con usuario inexistente', `esperaba 401, recibió ${r3.status}`);
  }

  // 1d. Login con email en vez de nombre_usuario
  const r4 = await post('/api/login', { nombre: 'mauricio.test@fastgood.com', contraseña: '123' });
  if (r4.status === 200 && r4.data?.token) {
    ok('Login por email funciona', `usuario=${r4.data.usuario?.nombre}`);
  } else {
    fail('Login por email', `status=${r4.status} body=${JSON.stringify(r4.data)}`);
  }

  // 1e. Login con lucas (admin existente que vimos en la DB)
  const r5 = await post('/api/login', { nombre: 'lucas', contraseña: '123' });
  if (r5.status === 200 && r5.data?.token) {
    ok('Login con nombre_usuario "lucas" (admin)',
       `rol=${r5.data.usuario?.id_rol}`);
  } else {
    fail('Login con lucas/123', `status=${r5.status} body=${JSON.stringify(r5.data)}`);
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
    fecha_entrega: new Date().toISOString().split('T')[0],
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

// ─── Limpieza ─────────────────────────────────────────────────
async function cleanup() {
  console.log('\n══════ LIMPIEZA ══════');

  for (const pid of cleanupIds.pedidos) {
    const r = await del(`/api/pedidos/${pid}`);
    console.log(`  🗑️  Pedido ${pid}: ${r.status === 200 ? 'eliminado' : 'error ' + r.status}`);
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

  const token = await testLogin();
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
