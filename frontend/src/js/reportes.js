// ============================================================
// reportes.js — Dashboard de Reportes Operativos — Fast Good
// ============================================================

const API = 'http://localhost:3000';

// ── Instancias de gráficos (se destruyen y recrean al filtrar)
let chartEvo     = null;   // Evolución de pedidos por día
let chartEstados = null;   // Distribución por estado (donut)
let chartBarrio  = null;   // Pedidos por barrio
let chartTP      = null;   // Top productos más vendidos

// ── Caché de datos para exportar CSV
let cachePedidos = [];

// ── Mapa de estados: colores fijos por id_estado ─────────────
const ESTADO_MAP = {
  1: { nombre: 'Pendiente',          color: '#9e9e9e' },
  2: { nombre: 'En Preparación',     color: '#ff9800' },
  3: { nombre: 'Listo p/ Entregar',  color: '#1565c0' },
  4: { nombre: 'Entregado',          color: '#28a745' },
  5: { nombre: 'Cancelado',          color: '#dc3545' },
};

// ── Inicialización ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setFechasPorDefecto();
  cargarReportes();
});

function setFechasPorDefecto() {
  const hoy   = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('filtroDesde').value = desde;
  document.getElementById('filtroHasta').value = hasta;
}

// ── Carga principal ────────────────────────────────────────────
async function cargarReportes() {
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const qs = params.toString() ? '?' + params.toString() : '';

  mostrarLoading(true);
  try {
    const [topProd, pedidosList] = await Promise.all([
      fetchJSON(`${API}/api/reportes/productos-mas-vendidos${qs}`),
      fetchJSON(`${API}/api/pedidos${qs}`)
    ]);

    cachePedidos = pedidosList || [];

    actualizarKPIsOperativos(cachePedidos);
    actualizarChartEvolucion(cachePedidos);
    actualizarChartEstadoPedidos(cachePedidos);
    actualizarChartPorBarrio(cachePedidos);
    actualizarChartTopProductos(topProd);

  } catch (e) {
    console.error('Error cargando reportes:', e);
    alert('Error al cargar los reportes. Verificá que el servidor esté corriendo.');
  } finally {
    mostrarLoading(false);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} en ${url}`);
  return res.json();
}

// ── KPIs Operativos ───────────────────────────────────────────
function actualizarKPIsOperativos(pedidos) {
  // Total pedidos del período
  document.getElementById('kpiTotalPedidos').textContent = pedidos.length || '0';

  // % entregados (id_estado 4)
  const totalEntregados = pedidos.filter(p => p.id_estado === 4).length;
  const pct = pedidos.length > 0
    ? Math.round(totalEntregados / pedidos.length * 100)
    : 0;
  document.getElementById('kpiEntregados').textContent = pedidos.length ? `${pct}%` : '—';

  // Barrio con más pedidos
  const conteoBarrios = {};
  pedidos.forEach(p => {
    const b = p.barrios?.nombre;
    if (b) conteoBarrios[b] = (conteoBarrios[b] || 0) + 1;
  });
  const topBarrio = Object.entries(conteoBarrios)
    .sort((a, b) => b[1] - a[1])[0];
  document.getElementById('kpiBarrio').textContent =
    topBarrio ? topBarrio[0] : '—';
}

// ── Chart 1: Evolución de Pedidos por Día ────────────────────
// Conectar: usa cachePedidos agrupados por fecha_pedido
// Mock: 7 días recientes con valores aleatorios
function actualizarChartEvolucion(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    const dia = (p.fecha_pedido || '').slice(0, 10);
    if (dia) conteo[dia] = (conteo[dia] || 0) + 1;
  });

  let labels = [];
  let datos  = [];

  if (Object.keys(conteo).length) {
    const diasOrdenados = Object.keys(conteo).sort();
    labels = diasOrdenados.map(d => formatFechaCorta(d));
    datos  = diasOrdenados.map(d => conteo[d]);
  } else {
    // ── MOCK DATA (reemplazar con datos reales de la API) ──
    const hoy = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      labels.push(formatFechaCorta(d.toISOString().slice(0, 10)));
      datos.push(Math.floor(Math.random() * 10) + 4);
    }
  }

  if (chartEvo) chartEvo.destroy();
  chartEvo = new Chart(document.getElementById('chartEvolucion').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Pedidos por día',
        data: datos,
        borderColor: '#28a745',
        backgroundColor: 'rgba(40,167,69,0.10)',
        borderWidth: 2.5,
        pointBackgroundColor: '#28a745',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} pedidos` } }
      },
      scales: {
        x: { ticks: { font: { family: 'Poppins', size: 10 } } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: 'Poppins', size: 10 } }
        }
      }
    }
  });
}

// ── Chart 2: Distribución por Estado (Donut) ─────────────────
// Conectar: agrupa cachePedidos por id_estado
// Mock: distribución de ejemplo con 5 estados
function actualizarChartEstadoPedidos(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    const id = p.id_estado;
    if (id != null) conteo[id] = (conteo[id] || 0) + 1;
  });

  let entradas;
  if (Object.keys(conteo).length) {
    entradas = Object.entries(conteo).sort((a, b) => Number(a[0]) - Number(b[0]));
  } else {
    // ── MOCK DATA ──
    entradas = [[4, 18], [2, 6], [3, 4], [1, 2], [5, 2]];
  }

  const labels  = entradas.map(([id]) => ESTADO_MAP[id]?.nombre || `Estado ${id}`);
  const datos   = entradas.map(([, v]) => v);
  const colores = entradas.map(([id]) => ESTADO_MAP[id]?.color  || '#607d8b');

  if (chartEstados) chartEstados.destroy();
  chartEstados = new Chart(document.getElementById('chartEstados').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: datos,
        backgroundColor: colores,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Poppins', size: 10 }, padding: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = Math.round(ctx.raw / total * 100);
              return ` ${ctx.raw} pedidos (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Chart 4: Pedidos por Barrio — Top 10 (Horizontal) ────────
// Conectar: agrupa cachePedidos por barrios.nombre
// Mock: ranking de barrios de Córdoba de ejemplo
function actualizarChartPorBarrio(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    const b = p.barrios?.nombre;
    if (b) conteo[b] = (conteo[b] || 0) + 1;
  });

  let sorted;
  if (Object.keys(conteo).length) {
    sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  } else {
    // ── MOCK DATA ──
    sorted = [
      ['Nueva Córdoba', 14], ['Centro', 11], ['General Paz', 8],
      ['Alberdi', 7],        ['Alta Córdoba', 6], ['Güemes', 5],
      ['Cerro de las Rosas', 4], ['Villa Belgrano', 3],
      ['San Vicente', 3],    ['Cofico', 2]
    ];
  }

  const labels  = sorted.map(([b]) => b);
  const datos   = sorted.map(([, v]) => v);
  // Degradado de verde oscuro a verde claro según posición
  const colores = datos.map((_, i) =>
    `hsl(${136 - i * 8}, ${68 - i * 2}%, ${38 + i * 3}%)`
  );

  if (chartBarrio) chartBarrio.destroy();
  chartBarrio = new Chart(document.getElementById('chartPorBarrio').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pedidos',
        data: datos,
        backgroundColor: colores,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} pedidos` } }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: 'Poppins', size: 10 } }
        },
        y: { ticks: { font: { family: 'Poppins', size: 10 } } }
      }
    }
  });
}

// ── Chart 5: Top Productos más vendidos (CONSERVADO) ─────────
function actualizarChartTopProductos(data) {
  if (!data || !data.length) {
    if (chartTP) chartTP.destroy();
    return;
  }

  const labels  = data.map(d => truncar(d.nombre, 22));
  const valores = data.map(d => d.total_vendido);
  const colores = [
    '#28a745','#1565c0','#ff9800','#9c27b0','#00bcd4',
    '#ff5722','#607d8b','#e91e63','#4caf50','#795548'
  ].slice(0, data.length);

  if (chartTP) chartTP.destroy();
  chartTP = new Chart(document.getElementById('chartTopProductos').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Unidades vendidas',
        data: valores,
        backgroundColor: colores,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} unidades` } }
      },
      scales: {
        x: { ticks: { font: { family: 'Poppins', size: 10 } } },
        y: { ticks: { font: { family: 'Poppins', size: 10 } } }
      }
    }
  });
}

// ── Exportar CSV de pedidos ───────────────────────────────────
function exportarCSV() {
  const filas = cachePedidos
    .filter(p => p.id_estado !== 5) // excluye cancelados
    .map(p => [
      p.id,
      (p.fecha_pedido || '').slice(0, 10),
      p.cliente_nombre   || '',
      p.barrios?.nombre  || '',
      p.total            || 0,
      p.metodo_pago      || '',
      p.estados?.nombre  || ''
    ]);
  descargarCSV(
    ['ID', 'Fecha', 'Cliente', 'Barrio', 'Total', 'Método Pago', 'Estado'],
    filas,
    'pedidos.csv'
  );
}

function descargarCSV(encabezados, filas, nombre) {
  const BOM    = '﻿';
  const lineas = [encabezados.join(';'), ...filas.map(f => f.map(v => `"${v}"`).join(';'))];
  const blob   = new Blob([BOM + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link   = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = nombre;
  link.click();
}

// ── Utilidades ────────────────────────────────────────────────
function mostrarLoading(v) {
  document.getElementById('loadingOverlay').classList.toggle('visible', v);
}

function formatFechaCorta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function truncar(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Globales ──────────────────────────────────────────────────
window.cargarReportes = cargarReportes;
window.exportarCSV    = exportarCSV;
