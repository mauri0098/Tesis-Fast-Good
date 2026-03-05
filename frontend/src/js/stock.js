/* ====== Datos (mock) con LOTES ====== */
let STOCK_DATA = [
  {
    id:'101', nombre:'Café molido', unidad:'kg', categoria:'Bebidas',
    lotes:[
      { loteId:'LCAF1', cantidad:5,  ingreso:'2025-02-01', vence:'2025-03-15' },
      { loteId:'LCAF2', cantidad:3,  ingreso:'2025-02-10', vence:'2025-04-10' }
    ]
  },
  {
    id:'102', nombre:'Leche', unidad:'u', categoria:'Lácteos',
    lotes:[ { loteId:'LLEC1', cantidad:35, ingreso:'2025-02-18', vence:'2025-03-01' } ]
  },
  {
    id:'103', nombre:'Arroz', unidad:'kg', categoria:'Secos',
    lotes:[ { loteId:'LARR1', cantidad:9,  ingreso:'2025-02-05', vence:'2026-02-01' } ]
  },
  {
    id:'104', nombre:'Harina', unidad:'kg', categoria:'Secos',
    lotes:[ { loteId:'LHAR1', cantidad:50, ingreso:'2025-02-02', vence:'2026-01-10' } ]
  },
  {
    id:'105', nombre:'Yogur', unidad:'u', categoria:'Lácteos',
    lotes:[ { loteId:'LYOG1', cantidad:12, ingreso:'2025-02-17', vence:'2025-02-28' } ]
  }
];

const PAGE = { size: 10, index: 0 };
const $ = (id)=>document.getElementById(id);

/* Helpers de lotes */
function totalStock(item){
  return (item.lotes||[]).reduce((a,l)=> a + (l.cantidad||0), 0);
}
function nearestExpiry(item){
  const vivos = (item.lotes||[]).filter(l => l.cantidad > 0 && l.vence);
  if (!vivos.length) return '';
  const d = vivos.map(l=> new Date(l.vence)).sort((a,b)=> a-b)[0];
  return d.toLocaleDateString('es-AR');
}
function estadoPorTotal(n){ return n <= 10 ? 'Bajo mínimo' : 'Normal'; }

/* ====== Filtros ====== */
function cargarCategorias(){
  const sel = $('filtroCategoria');
  sel.innerHTML = '<option value="">Todas</option>';
  const cats = [...new Set(STOCK_DATA.map(x=>x.categoria))].sort();
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value=c; o.textContent=c;
    sel.appendChild(o);
  });
}

function getFiltros(){
  return {
    nombre: ($('filtroNombre').value||'').toLowerCase(),
    categoria: $('filtroCategoria').value || '',
    estado: $('filtroEstado').value || ''
  };
}
function filtrar(rows, f){
  return rows.filter(r=>{
    const stock = totalStock(r);
    const okN = !f.nombre || r.nombre.toLowerCase().includes(f.nombre);
    const okC = !f.categoria || r.categoria===f.categoria;
    const okE = !f.estado || estadoPorTotal(stock)===f.estado;
    return okN && okC && okE;
  });
}

/* ====== Render ====== */
function render(){
  const f = getFiltros();
  const data = filtrar(STOCK_DATA, f);
  const start = PAGE.index * PAGE.size;
  const view = data.slice(start, start + PAGE.size);

  const body = $('stockBody');
  body.innerHTML = '';

  if (view.length === 0){ $('stockEmpty').style.display='block'; }
  else { $('stockEmpty').style.display='none'; }

  view.forEach(r=>{
    const stockTotal = totalStock(r);
    const est = estadoPorTotal(stockTotal);
    const tr = document.createElement('tr');
    if (est==='Bajo mínimo') tr.className='row--low';
    const pill = `<span class="pill ${est==='Bajo mínimo'?'pill--low':''}">${est}</span>`;
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.nombre}</td>
      <td style="font-weight:600">${stockTotal}</td>
      <td>${r.unidad}</td>
      <td>${r.categoria}</td>
      <td>${nearestExpiry(r) || '-'}</td>
      <td>${pill}</td>
      <td><button class="btn-sec" onclick="openMerma('${r.id}')">Registrar merma</button></td>
    `;
    body.appendChild(tr);
  });

  $('pageInfo').textContent = `${Math.min(start+1,data.length)}–${Math.min(start+view.length,data.length)} de ${data.length}`;
  $('prevPage').disabled = PAGE.index===0;
  $('nextPage').disabled = (start + PAGE.size) >= data.length;
}

/* ====== Paginación / eventos ====== */
document.addEventListener('DOMContentLoaded', ()=>{
  cargarCategorias();
  $('btnAplicarFiltros').onclick = ()=>{ PAGE.index=0; render(); };
  $('prevPage').onclick = ()=>{ if(PAGE.index>0){ PAGE.index--; render(); } };
  $('nextPage').onclick = ()=>{ PAGE.index++; render(); };
  render();
});

/* ====== Modal Merma (por lote) ====== */
let ITEM = null;

function openMerma(id){
  const it = STOCK_DATA.find(x=>x.id===id);
  if(!it) return;
  ITEM = it;

  $('mNombre').value = it.nombre;
  $('mCodigo').value = it.id;
  $('mUnidad').textContent = it.unidad;

  // Cargar lotes vivos por vencimiento asc
  const sel = $('mLote');
  sel.innerHTML = '';
  const lotesOrdenados = (it.lotes||[])
    .filter(l=> l.cantidad>0)
    .sort((a,b)=> new Date(a.vence) - new Date(b.vence));
  lotesOrdenados.forEach(l=>{
    const opt = document.createElement('option');
    const v = new Date(l.vence).toLocaleDateString('es-AR');
    const i = l.ingreso ? new Date(l.ingreso).toLocaleDateString('es-AR') : '-';
    opt.value = l.loteId;
    opt.textContent = `${l.loteId} — vence ${v} — ${l.cantidad} ${it.unidad}`;
    opt.dataset.ingreso = i;
    opt.dataset.vence = v;
    opt.dataset.cantidad = l.cantidad;
    sel.appendChild(opt);
  });

  actualizarDetalleLoteMerma();
  $('mMotivo').value = '';
  $('mCantidad').value = '';
  $('mObs').value = '';
  $('mError').style.display = 'none';
  $('mermaModal').style.display = 'block';

  sel.onchange = actualizarDetalleLoteMerma;
}

function actualizarDetalleLoteMerma(){
  const opt = $('mLote').selectedOptions[0];
  if (!opt){
    $('mStockLote').value = '0';
    $('mIngreso').value = '';
    $('mVence').value = '';
    return;
  }
  $('mStockLote').value = opt.dataset.cantidad + ' ' + $('mUnidad').textContent;
  $('mIngreso').value = opt.dataset.ingreso || '';
  $('mVence').value = opt.dataset.vence || '';
}

function closeMerma(){ $('mermaModal').style.display='none'; ITEM=null; }

/* ===== Agregar Stock (nuevo lote / nuevo insumo) ===== */
function openAddStock(){
  // llenar combo de existentes
  const sel = document.getElementById('axItem');
  sel.innerHTML = '';
  STOCK_DATA.forEach(r=>{
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.nombre} — total ${totalStock(r)} ${r.unidad}`;
    sel.appendChild(o);
  });
  // set modo por defecto
  document.querySelectorAll('input[name="addMode"]').forEach(r => r.checked = (r.value === 'nuevo'));
  swapAddMode();
  // limpiar campos
  ['aNombre','aCodigo','aCantidad','aUnidad','aCategoria','aIngreso','aVence','axCantidad','axIngreso','axVence'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('aError').style.display = 'none';
  document.getElementById('addStockModal').style.display = 'block';
}

function closeAddStock(){
  document.getElementById('addStockModal').style.display = 'none';
}

function swapAddMode(){
  const mode = document.querySelector('input[name="addMode"]:checked')?.value || 'nuevo';
  document.getElementById('addNuevo').style.display     = (mode === 'nuevo') ? 'grid' : 'none';
  document.getElementById('addExistente').style.display = (mode === 'existente') ? 'grid' : 'none';
  document.getElementById('aError').style.display = 'none';
}

function confirmarAddStock(){
  const mode = document.querySelector('input[name="addMode"]:checked')?.value || 'nuevo';
  const showErr = (msg)=>{
    const e = document.getElementById('aError');
    e.textContent = msg || 'Completá los campos obligatorios con valores válidos.';
    e.style.display = 'block';
  };

  if (mode === 'nuevo'){
    const nombre = document.getElementById('aNombre').value.trim();
    const codigo = document.getElementById('aCodigo').value.trim();
    const cantidad = parseFloat(document.getElementById('aCantidad').value);
    const unidad = document.getElementById('aUnidad').value;
    const categoria = document.getElementById('aCategoria').value.trim();
    const ingreso = document.getElementById('aIngreso').value;
    const vence   = document.getElementById('aVence').value;

    if (!nombre || !codigo || !unidad || !categoria || !ingreso || !vence || !cantidad || cantidad <= 0){
      return showErr();
    }
    if (STOCK_DATA.some(x=>x.id === codigo)){
      return showErr('Ya existe un insumo con ese Código/ID.');
    }

    STOCK_DATA.push({
      id: codigo,
      nombre,
      unidad,
      categoria,
      lotes: [{
        loteId: 'L' + Math.random().toString(36).slice(2,7).toUpperCase(),
        cantidad: +cantidad.toFixed(2),
        ingreso,
        vence
      }]
    });

    cargarCategorias(); // por si hay nueva categoría
    closeAddStock();
    PAGE.index = 0;
    render();
  } else {
    // EXISTENTE: crear un lote nuevo
    const id = document.getElementById('axItem').value;
    const cant = parseFloat(document.getElementById('axCantidad').value);
    const ingreso = document.getElementById('axIngreso').value;
    const vence   = document.getElementById('axVence').value;

    if (!id || !ingreso || !vence || !cant || cant <= 0) return showErr();

    const item = STOCK_DATA.find(x=>x.id === id);
    if (!item) return showErr('Insumo no encontrado.');

    if (!item.lotes) item.lotes = [];
    item.lotes.push({
      loteId: 'L' + Math.random().toString(36).slice(2,7).toUpperCase(),
      cantidad: +cant.toFixed(2),
      ingreso, vence
    });

    closeAddStock();
    render();
  }
}

// cerrar modales al click afuera (ambos)
window.addEventListener('click', (e)=>{
  if (e.target === document.getElementById('addStockModal')) closeAddStock();
  if (e.target === document.getElementById('mermaModal')) closeMerma();
});
