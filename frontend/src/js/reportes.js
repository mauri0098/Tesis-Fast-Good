// ============================================================
// reportes.js — Dashboard de reportes financieros y stock
// ============================================================

const API = 'http://localhost:3000';

// Instancias de los gráficos (se destruyen y recrean al actualizar)
let chartIG = null; // Ingresos vs Gastos
let chartTP = null; // Top Productos
let chartST = null; // Stock movimientos

// Cache de datos para exportar
let cacheIngresos = [];
let cacheCompras  = [];

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

// ── Carga principal ───────────────────────────────────────────
async function cargarReportes() {
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const qs = params.toString() ? '?' + params.toString() : '';

  mostrarLoading(true);
  try {
    const [resumen, ingDia, gasDia, topProd, stockMov, movsLista, pedidosList] =
      await Promise.all([
        fetchJSON(`${API}/api/reportes/resumen${qs}`),
        fetchJSON(`${API}/api/reportes/ingresos-por-dia${qs}`),
        fetchJSON(`${API}/api/reportes/gastos-por-dia${qs}`),
        fetchJSON(`${API}/api/reportes/productos-mas-vendidos${qs}`),
        fetchJSON(`${API}/api/reportes/stock-movimientos${qs}`),
        fetchJSON(`${API}/api/movimientos-stock`),
        fetchJSON(`${API}/api/pedidos${qs}`)
      ]);

    // Filtrar movimientos de stock de tipo entrada con costo para exportar como "gastos"
    cacheCompras  = (movsLista || []).filter(m => m.tipo === 'entrada' && m.costo_total != null);
    cacheIngresos = pedidosList || [];

    actualizarKPIs(resumen);
    actualizarChartIngresosGastos(ingDia, gasDia);
    actualizarChartTopProductos(topProd);
    actualizarChartStock(stockMov);

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

// ── KPI Cards ─────────────────────────────────────────────────
function actualizarKPIs(r) {
  const fmt = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 });

  document.getElementById('kpiIngresos').textContent = fmt(r.ingresos);
  document.getElementById('kpiGastos').textContent   = fmt(r.gastos);
  document.getElementById('kpiPedidos').textContent  = r.cantidad_pedidos ?? 0;

  const ganEl = document.getElementById('kpiGanancia');
  ganEl.textContent = fmt(r.ganancia);
  ganEl.classList.toggle('negativo', Number(r.ganancia) < 0);
}

// ── Chart 1: Ingresos vs Gastos ───────────────────────────────
function actualizarChartIngresosGastos(ingData, gasData) {
  // Unir todas las fechas
  const diasSet = new Set([
    ...ingData.map(d => d.dia),
    ...gasData.map(d => d.dia)
  ]);
  const dias = [...diasSet].sort();

  const ingMap = Object.fromEntries(ingData.map(d => [d.dia, d.ingresos]));
  const gasMap = Object.fromEntries(gasData.map(d => [d.dia, d.gastos]));

  const labels   = dias.map(d => formatFechaCorta(d));
  const dataIng  = dias.map(d => ingMap[d] || 0);
  const dataGas  = dias.map(d => gasMap[d] || 0);

  if (chartIG) chartIG.destroy();
  const ctx = document.getElementById('chartIngresosGastos').getContext('2d');
  chartIG = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data: dataIng,
          backgroundColor: 'rgba(40, 167, 69, 0.75)',
          borderColor: '#28a745',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Gastos',
          data: dataGas,
          backgroundColor: 'rgba(220, 53, 69, 0.70)',
          borderColor: '#dc3545',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Poppins', size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` $${Number(ctx.raw).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
          }
        }
      },
      scales: {
        x: { ticks: { font: { family: 'Poppins', size: 10 } } },
        y: {
          ticks: {
            font: { family: 'Poppins', size: 10 },
            callback: v => '$' + Number(v).toLocaleString('es-AR')
          }
        }
      }
    }
  });
}

// ── Chart 2: Top Productos ─────────────────────────────────────
function actualizarChartTopProductos(data) {
  if (!data || !data.length) {
    if (chartTP) chartTP.destroy();
    return;
  }

  const labels = data.map(d => truncar(d.nombre, 22));
  const valores = data.map(d => d.total_vendido);
  const colores = [
    '#28a745','#1565c0','#ff9800','#9c27b0','#00bcd4',
    '#ff5722','#607d8b','#e91e63','#4caf50','#795548'
  ].slice(0, data.length);

  if (chartTP) chartTP.destroy();
  const ctx = document.getElementById('chartTopProductos').getContext('2d');
  chartTP = new Chart(ctx, {
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
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const ing = data[ctx.dataIndex]?.ingresos || 0;
              return `Ingresos: $${Number(ing).toLocaleString('es-AR')}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { family: 'Poppins', size: 10 } } },
        y: { ticks: { font: { family: 'Poppins', size: 10 } } }
      }
    }
  });
}

// ── Chart 3: Movimientos de Stock ──────────────────────────────
function actualizarChartStock(data) {
  if (!data || !data.length) {
    if (chartST) chartST.destroy();
    return;
  }

  const labels   = data.map(d => formatFechaCorta(d.dia));
  const entradas = data.map(d => d.entradas);
  const salidas  = data.map(d => d.salidas);

  if (chartST) chartST.destroy();
  const ctx = document.getElementById('chartStock').getContext('2d');
  chartST = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Entradas',
          data: entradas,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40,167,69,0.10)',
          borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3
        },
        {
          label: 'Salidas',
          data: salidas,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220,53,69,0.08)',
          borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Poppins', size: 11 } } }
      },
      scales: {
        x: { ticks: { font: { family: 'Poppins', size: 10 } } },
        y: { ticks: { font: { family: 'Poppins', size: 10 } }, beginAtZero: true }
      }
    }
  });
}

// ── Exportar CSV ───────────────────────────────────────────────
function exportarCSV(tipo) {
  if (tipo === 'pedidos') {
    const filas = cacheIngresos
      .filter(p => p.id_estado !== 5)
      .map(p => [
        p.id,
        p.fecha_pedido?.slice(0,10) || '',
        p.cliente_nombre || '',
        p.total,
        p.metodo_pago || '',
        p.estados?.nombre || ''
      ]);
    descargarCSV(['ID','Fecha','Cliente','Total','Pago','Estado'], filas, 'ingresos.csv');
  } else {
    const filas = cacheCompras.map(m => [
      m.id,
      m.fecha?.slice(0,10) || '',
      m.insumos?.nombre || '',
      m.cantidad,
      m.costo_unitario,
      m.costo_total,
      m.motivo || ''
    ]);
    descargarCSV(['ID','Fecha','Insumo','Cantidad','Costo Unit.','Costo Total','Motivo'], filas, 'entradas_con_costo.csv');
  }
}

function descargarCSV(encabezados, filas, nombre) {
  const BOM = '﻿'; // UTF-8 BOM para que Excel lo abra bien
  const lineas = [encabezados.join(';'), ...filas.map(f => f.map(v => `"${v}"`).join(';'))];
  const blob = new Blob([BOM + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = nombre;
  link.click();
}

// ── Utilidades ─────────────────────────────────────────────────
function mostrarLoading(v) {
  document.getElementById('loadingOverlay').classList.toggle('visible', v);
}

function formatFechaCorta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function truncar(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Exponer globales ───────────────────────────────────────────
window.cargarReportes = cargarReportes;
window.exportarCSV    = exportarCSV;
