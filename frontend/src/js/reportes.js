// ============================================================
// reportes.js — Dashboard de Reportes Operativos — Fast Good
// ============================================================


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

// Del 1° del mes a hoy, en fecha LOCAL (toISOString() pasa a UTC y a las 21 h ya es "mañana")
function setFechasPorDefecto() {
  const hoy   = new Date();
  const hasta = fechaLocalISO(hoy);
  const desde = fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
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
      fetchJSON(`/api/reportes/productos-mas-vendidos${qs}`),
      fetchJSON(`/api/pedidos${qs}`)
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
  const res = await apiFetch(url);
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

// ── Sin datos: oculta el gráfico y muestra el aviso en su contenedor ─
function marcarSinDatos(canvasId, sinDatos) {
  const canvas = document.getElementById(canvasId);
  const contenedor = canvas.parentElement;
  let aviso = contenedor.querySelector('.chart-sin-datos');
  if (sinDatos && !aviso) {
    aviso = document.createElement('p');
    aviso.className = 'chart-sin-datos';
    aviso.textContent = 'Sin datos para el período';
    contenedor.appendChild(aviso);
  }
  if (aviso) aviso.style.display = sinDatos ? '' : 'none';
  canvas.style.display = sinDatos ? 'none' : '';
}

// ── Chart 1: Evolución de Pedidos por Día ────────────────────
// Agrupa cachePedidos por el día LOCAL de fecha_pedido (un pedido de las 22 h no pasa al día siguiente)
function actualizarChartEvolucion(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    if (!p.fecha_pedido) return;
    const dia = fechaLocalISO(fechaDeTimestamp(p.fecha_pedido));
    conteo[dia] = (conteo[dia] || 0) + 1;
  });

  if (chartEvo) { chartEvo.destroy(); chartEvo = null; }
  const sinDatos = Object.keys(conteo).length === 0;
  marcarSinDatos('chartEvolucion', sinDatos);
  if (sinDatos) return;

  const diasOrdenados = Object.keys(conteo).sort();
  const labels = diasOrdenados.map(d => formatFechaCorta(d));
  const datos  = diasOrdenados.map(d => conteo[d]);

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
// Agrupa cachePedidos por id_estado
function actualizarChartEstadoPedidos(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    const id = p.id_estado;
    if (id != null) conteo[id] = (conteo[id] || 0) + 1;
  });

  if (chartEstados) { chartEstados.destroy(); chartEstados = null; }
  const sinDatos = Object.keys(conteo).length === 0;
  marcarSinDatos('chartEstados', sinDatos);
  if (sinDatos) return;

  const entradas = Object.entries(conteo).sort((a, b) => Number(a[0]) - Number(b[0]));
  const labels  = entradas.map(([id]) => ESTADO_MAP[id]?.nombre || `Estado ${id}`);
  const datos   = entradas.map(([, v]) => v);
  const colores = entradas.map(([id]) => ESTADO_MAP[id]?.color  || '#607d8b');

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
// Agrupa cachePedidos por barrios.nombre
function actualizarChartPorBarrio(pedidos) {
  const conteo = {};
  pedidos.forEach(p => {
    const b = p.barrios?.nombre;
    if (b) conteo[b] = (conteo[b] || 0) + 1;
  });

  if (chartBarrio) { chartBarrio.destroy(); chartBarrio = null; }
  const sinDatos = Object.keys(conteo).length === 0;
  marcarSinDatos('chartPorBarrio', sinDatos);
  if (sinDatos) return;

  const sorted  = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels  = sorted.map(([b]) => b);
  const datos   = sorted.map(([, v]) => v);
  // Degradado de verde oscuro a verde claro según posición
  const colores = datos.map((_, i) =>
    `hsl(${136 - i * 8}, ${68 - i * 2}%, ${38 + i * 3}%)`
  );

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
  if (chartTP) { chartTP.destroy(); chartTP = null; }
  const sinDatos = !data || !data.length;
  marcarSinDatos('chartTopProductos', sinDatos);
  if (sinDatos) return;

  const labels  = data.map(d => truncar(d.nombre, 22));
  const valores = data.map(d => d.total_vendido);
  const colores = [
    '#28a745','#1565c0','#ff9800','#9c27b0','#00bcd4',
    '#ff5722','#607d8b','#e91e63','#4caf50','#795548'
  ].slice(0, data.length);

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
      p.fecha_pedido ? fechaLocalISO(fechaDeTimestamp(p.fecha_pedido)) : '',
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
