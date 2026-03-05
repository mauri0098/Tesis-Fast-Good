document.addEventListener('DOMContentLoaded', () => {
  /* ======= Datos semilla (simulan BD) ======= */
  const PLANES = {
    'K4': { nombre:'Keto', code:'K4', categorias:['vianda','ensalada'] },
    'V2': { nombre:'Vegano', code:'V2', categorias:['vianda','pasteleria'] },
    'C1': { nombre:'Clásico', code:'C1', categorias:['vianda','pasteleria','combo'] }
  };

  // Stock actual por insumo y unidad
  let STOCK = JSON.parse(localStorage.getItem('FG_STOCK')||'{}');
  if (Object.keys(STOCK).length===0){
    STOCK = {
      'Pechuga de pollo': { qty: 3200, unit:'g' },
      'Quinoa': { qty: 1500, unit:'g' },
      'Zanahoria': { qty: 1200, unit:'g' },
      'Brócoli': { qty: 1600, unit:'g' },
      'Aceite de oliva': { qty: 900, unit:'ml' },
      'Sal': { qty: 500, unit:'g' },
      'Pimienta': { qty: 120, unit:'g' },
      'Pasta integral': { qty: 4000, unit:'g' },
      'Tomate triturado': { qty: 5000, unit:'g' },
      'Cebolla': { qty: 2500, unit:'g' },
      'Ajo': { qty: 200, unit:'u' },
      'Albahaca': { qty: 200, unit:'g' },
      'Salmón cocido': { qty: 1800, unit:'g' },
      'Palta': { qty: 40, unit:'u' },
      'Mix verdes': { qty: 1500, unit:'g' },
      'Pepino': { qty: 900, unit:'g' },
      'Jugo de limón': { qty: 800, unit:'ml' },
      'Harina de avena': { qty: 2500, unit:'g' },
      'Cacao amargo': { qty: 600, unit:'g' },
      'Huevo': { qty: 180, unit:'u' },
      'Leche': { qty: 3000, unit:'ml' },
      'Aceite neutro': { qty: 1000, unit:'ml' },
      'Endulzante': { qty: 800, unit:'g' },
      'Brownie porción': { qty: 30, unit:'u' }
    };
  }

  let PRODUCTOS = JSON.parse(localStorage.getItem('FG_RECETAS')||'[]');
  if (PRODUCTOS.length===0){
    PRODUCTOS = [
      {
        id: 101, plan:'C1', nombre:'Pollo grillado con quinoa', categoria:'vianda', version:1, updatedAt: ts(),
        receta:[
          { insumo:'Pechuga de pollo', qty:180, unit:'g' },
          { insumo:'Quinoa', qty:80, unit:'g' },
          { insumo:'Zanahoria', qty:60, unit:'g' },
          { insumo:'Brócoli', qty:80, unit:'g' },
          { insumo:'Aceite de oliva', qty:10, unit:'ml' },
          { insumo:'Sal', qty:2, unit:'g' },
          { insumo:'Pimienta', qty:1, unit:'g' },
        ],
        historial:[]
      },
      {
        id: 205, plan:'V2', nombre:'Tallarines integrales con salsa', categoria:'vianda', version:1, updatedAt: ts(),
        receta:[
          { insumo:'Pasta integral', qty:90, unit:'g' },
          { insumo:'Tomate triturado', qty:150, unit:'g' },
          { insumo:'Cebolla', qty:50, unit:'g' },
          { insumo:'Ajo', qty:1, unit:'u' },
          { insumo:'Aceite de oliva', qty:10, unit:'ml' },
          { insumo:'Albahaca', qty:5, unit:'g' },
          { insumo:'Sal', qty:2, unit:'g' },
        ],
        historial:[]
      },
      {
        id: 309, plan:'K4', nombre:'Ensalada keto salmón y palta', categoria:'ensalada', version:1, updatedAt: ts(),
        receta:[
          { insumo:'Salmón cocido', qty:120, unit:'g' },
          { insumo:'Palta', qty:0.5, unit:'u' },
          { insumo:'Mix verdes', qty:70, unit:'g' },
          { insumo:'Pepino', qty:60, unit:'g' },
          { insumo:'Aceite de oliva', qty:10, unit:'ml' },
          { insumo:'Jugo de limón', qty:10, unit:'ml' },
          { insumo:'Sal', qty:1, unit:'g' },
        ],
        historial:[]
      },
      {
        id: 414, plan:'C1', nombre:'Brownie de avena y cacao', categoria:'pasteleria', version:1, updatedAt: ts(),
        receta:[
          { insumo:'Harina de avena', qty:60, unit:'g' },
          { insumo:'Cacao amargo', qty:15, unit:'g' },
          { insumo:'Huevo', qty:1, unit:'u' },
          { insumo:'Leche', qty:80, unit:'ml' },
          { insumo:'Aceite neutro', qty:10, unit:'ml' },
          { insumo:'Endulzante', qty:10, unit:'g' },
        ],
        historial:[]
      },
      {
        id: 512, plan:'C1', nombre:'Combo Fit (pollo+quinoa+brownie)', categoria:'combo', version:1, updatedAt: ts(),
        receta:[
          { insumo:'Pechuga de pollo', qty:150, unit:'g' },
          { insumo:'Quinoa', qty:60, unit:'g' },
          { insumo:'Brócoli', qty:60, unit:'g' },
          { insumo:'Brownie porción', qty:1, unit:'u' },
        ],
        historial:[]
      }
    ];
  }

  /* ======= Utilidades ======= */
  function ts(){ return new Date().toLocaleString() }
  function fmt(n){ return (Math.round(n*100)/100).toString().replace('.',',') }
  function unidadOk(u){ return ['g','ml','u'].includes((u||'').toLowerCase()) }

  // Cantidad posible según stock y receta (entero hacia abajo)
  function cantidadPosible(producto){
    if (!producto.receta?.length) return 0;
    let posibles = Infinity;
    for (const r of producto.receta){
      const st = STOCK[r.insumo];
      if (!st) return 0;
      if ((st.unit||'').toLowerCase() !== (r.unit||'').toLowerCase()) return 0;
      if (!r.qty || r.qty<=0) return 0;
      posibles = Math.min(posibles, Math.floor(st.qty / r.qty));
    }
    return isFinite(posibles) ? posibles : 0;
  }

  function recetaResumen(rec){
    const s = rec.slice(0,3).map(r=>`${r.insumo} ${fmt(r.qty)} ${r.unit}`).join(', ');
    return rec.length>3 ? s+` … (+${rec.length-3})` : s;
  }

  function saveAll(){
    localStorage.setItem('FG_RECETAS', JSON.stringify(PRODUCTOS));
    localStorage.setItem('FG_STOCK', JSON.stringify(STOCK));
  }

  /* ======= DOM ======= */
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  const fPlan = document.getElementById('fPlan');
  const fCategoria = document.getElementById('fCategoria');
  const fNombre = document.getElementById('fNombre');
  const btnNueva = document.getElementById('btnNueva');

  // Filtros
  function initFiltros(){
    fPlan.innerHTML = '<option value="*">Todos</option>'+
      Object.values(PLANES).map(p=>`<option value="${p.code}">${p.code} - ${p.nombre}</option>`).join('');
    const cats = new Set();
    Object.values(PLANES).forEach(p=>p.categorias.forEach(c=>cats.add(c)));
    fCategoria.innerHTML = '<option value="*">Todas</option>'+
      [...cats].sort().map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  // Render
  function render(){
    const planSel = fPlan.value||'*';
    const catSel = fCategoria.value||'*';
    const q = (fNombre.value||'').toLowerCase().trim();

    const data = PRODUCTOS.filter(p=>{
      const okPlan = planSel==='*' || p.plan===planSel;
      const okCat = catSel==='*' || p.category===catSel || p.categoria===catSel;
      const okName = !q || p.nombre.toLowerCase().includes(q);
      return okPlan && okCat && okName;
    });

    tbody.innerHTML = '';
    if (!data.length){ empty.style.display='block'; return }
    empty.style.display='none';

    data.forEach(p=>{
      const posible = cantidadPosible(p);
      const cls = posible===0 ? 'qtyzero' : (posible<5 ? 'qtylow' : 'qtyok');
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${p.id}</td>
         <td><span class="badge">${p.plan}</span></td>
         <td>${p.nombre}<div class="muted">v.${p.version}</div></td>
         <td>${p.categoria}</td>
         <td class="recipe-mini">${recetaResumen(p.receta)}</td>
         <td class="${cls}">${posible}</td>
         <td>
           <button class="btn secondary" data-act="det" data-id="${p.id}">Detalles</button>
           <button class="btn" data-act="edit" data-id="${p.id}">Editar</button>
           <button class="btn danger" data-act="del" data-id="${p.id}">Borrar</button>
         </td>`;
      tbody.appendChild(tr);
    });
  }

  [fPlan,fCategoria,fNombre].forEach(el=>el.addEventListener('input', render));

  tbody.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = +btn.dataset.id;
    const act = btn.dataset.act;
    if (act==='det') abrirDetalles(id);
    if (act==='edit') abrirEditor(id);
    if (act==='del') borrarReceta(id);
  });

  /* ======= DETALLES ======= */
  const mDet = document.getElementById('modalDetalles');
  const detTitulo = document.getElementById('detTitulo');
  const detProd = document.getElementById('detProd');
  const detPlan = document.getElementById('detPlan');
  const detCat = document.getElementById('detCat');
  const detFecha = document.getElementById('detFecha');
  const detPosible = document.getElementById('detPosible');
  const detTablaBody = document.querySelector('#detTabla tbody');
  const detHist = document.getElementById('detHist');
  const btnCocinar = document.getElementById('btnCocinar');
  const btnEditarDesdeDetalles = document.getElementById('btnEditarDesdeDetalles');
  let detId = null;

  function abrirDetalles(id){
    const p = PRODUCTOS.find(x=>x.id===id); if(!p) return;
    detId = id;
    detTitulo.textContent = `Receta de ${p.nombre}`;
    detProd.textContent = p.nombre;
    detPlan.textContent = `${p.plan} - ${PLANES[p.plan]?.nombre||''}`;
    detCat.textContent = p.categoria;
    detFecha.textContent = p.updatedAt;
    const pos = cantidadPosible(p);
    detPosible.textContent = pos + ' unid';
    detPosible.className = 'badge ' + (pos===0?'qtyzero':(pos<5?'qtylow':'qtyok'));
    detTablaBody.innerHTML = p.receta.map(r=>`<tr><td>${r.insumo}</td><td>${fmt(r.qty)}</td><td>${r.unit}</td></tr>`).join('');
    detHist.innerHTML = (p.historial?.length? p.historial.map(h=>`<div>v.${h.version} · ${h.updatedAt} — ${h.usuario||'admin'}</div>`).join('') : '<div class="muted">Sin versiones anteriores</div>');
    btnCocinar.onclick = ()=> cocinarUno(p.id);
    btnEditarDesdeDetalles.onclick = ()=> { cerrar('modalDetalles'); abrirEditor(p.id); };
    abrir('modalDetalles');
  }

  function cocinarUno(id){
    const p = PRODUCTOS.find(x=>x.id===id); if(!p) return;
    if (cantidadPosible(p) <= 0){ alert('No hay stock suficiente para cocinar 1 unidad.'); return }
    for (const r of p.receta){
      STOCK[r.insumo].qty -= r.qty;
      if (STOCK[r.insumo].qty < 0) STOCK[r.insumo].qty = 0;
    }
    saveAll();
    abrirDetalles(id);
    render();
  }

  /* ======= EDITOR ======= */
  const mEd = document.getElementById('modalEditar');
  const edTitulo = document.getElementById('edTitulo');
  const edNombre = document.getElementById('edNombre');
  const edPlan = document.getElementById('edPlan');
  const edCat = document.getElementById('edCat');
  const edTablaBody = document.querySelector('#edTabla tbody');
  const btnAddInsumo = document.getElementById('btnAddInsumo');
  const btnGuardarReceta = document.getElementById('btnGuardarReceta');
  let edId = null; // null para nueva
  let bufferReceta = [];

  function initEditorCombos(planSel, catSel){
    edPlan.innerHTML = Object.values(PLANES).map(p=>`<option value="${p.code}">${p.code} - ${p.nombre}</option>`).join('');
    const cats = new Set();
    Object.values(PLANES).forEach(p=>p.categorias.forEach(c=>cats.add(c)));
    edCat.innerHTML = [...cats].sort().map(c=>`<option value="${c}">${c}</option>`).join('');
    if (planSel) edPlan.value = planSel;
    if (catSel) edCat.value = catSel;
  }

  function pintarEditorTabla(){
    edTablaBody.innerHTML = '';
    bufferReceta.forEach((r,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td><input type="text" value="${r.insumo}" data-idx="${idx}" class="ed-insumo"></td>
         <td><input type="number" min="0" step="0.01" value="${r.qty}" data-idx="${idx}" class="ed-qty"></td>
         <td><input type="text" value="${r.unit}" data-idx="${idx}" class="ed-unit" style="width:80px"></td>
         <td><button class="btn danger" data-del="${idx}">Eliminar</button></td>`;
      edTablaBody.appendChild(tr);
    });
  }

  edTablaBody.addEventListener('input',(e)=>{
    const i = e.target.dataset.idx;
    if (e.target.classList.contains('ed-insumo')) bufferReceta[i].insumo = e.target.value;
    if (e.target.classList.contains('ed-qty')) bufferReceta[i].qty = parseFloat(e.target.value||'0');
    if (e.target.classList.contains('ed-unit')) bufferReceta[i].unit = e.target.value;
  });
  edTablaBody.addEventListener('click',(e)=>{
    const btn = e.target.closest('button[data-del]'); if(!btn) return;
    const i = +btn.dataset.del; bufferReceta.splice(i,1); pintarEditorTabla();
  });

  btnAddInsumo.addEventListener('click', ()=>{
    bufferReceta.push({insumo:'',qty:0,unit:'g'}); pintarEditorTabla();
  });

  btnGuardarReceta.addEventListener('click', ()=>{
    if (!edNombre.value.trim()) return alert('Ingresá el nombre del producto.');
    if (!bufferReceta.length) return alert('Agregá al menos un insumo.');
    for (const r of bufferReceta){
      if (!r.insumo.trim()) return alert('Todos los insumos deben tener nombre.');
      if (!unidadOk((r.unit||'').toLowerCase())) return alert('Unidades válidas: g, ml o u.');
      const st = STOCK[r.insumo];
      if (!st) return alert(`El insumo "${r.insumo}" no existe en stock (datos demo).`);
      if ((st.unit||'').toLowerCase() !== (r.unit||'').toLowerCase()) return alert(`Unidad incoherente en "${r.insumo}": stock=${st.unit} / receta=${r.unit}`);
      if (!r.qty || r.qty<=0) return alert(`Cantidad inválida en "${r.insumo}".`);
    }

    if (edId===null){
      const nextId = Math.max(0,...PRODUCTOS.map(p=>p.id))+1;
      PRODUCTOS.push({
        id: nextId,
        plan: edPlan.value, nombre: edNombre.value.trim(), categoria: edCat.value,
        version:1, updatedAt: ts(), receta: JSON.parse(JSON.stringify(bufferReceta)), historial:[]
      });
    } else {
      const p = PRODUCTOS.find(x=>x.id===edId);
      p.historial = p.historial || [];
      p.historial.unshift({ version:p.version, updatedAt:p.updatedAt, usuario:'admin', receta: p.receta });
      p.version += 1;
      p.updatedAt = ts();
      p.plan = edPlan.value;
      p.nombre = edNombre.value.trim();
      p.categoria = edCat.value;
      p.receta = JSON.parse(JSON.stringify(bufferReceta));
    }
    saveAll();
    cerrar('modalEditar');
    render();
  });

  function abrirEditor(id=null){
    edId = id;
    if (id===null){
      edTitulo.textContent = 'Nueva Receta';
      edNombre.value = '';
      initEditorCombos();
      bufferReceta = [];
      pintarEditorTabla();
    } else {
      const p = PRODUCTOS.find(x=>x.id===id); if(!p) return;
      edTitulo.textContent = `Editar Receta — ${p.nombre} (v.${p.version})`;
      edNombre.value = p.nombre;
      initEditorCombos(p.plan, p.categoria);
      bufferReceta = JSON.parse(JSON.stringify(p.receta));
      pintarEditorTabla();
    }
    abrir('modalEditar');
  }

  function borrarReceta(id){
    const p = PRODUCTOS.find(x=>x.id===id); if(!p) return;
    if (!confirm(`¿Eliminar la receta de "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    PRODUCTOS = PRODUCTOS.filter(x=>x.id!==id);
    saveAll();
    render();
  }

  /* ======= Helpers modal ======= */
  function abrir(id){ document.getElementById(id).style.display='block' }
  function cerrar(id){ document.getElementById(id).style.display='none' }
  window.cerrar = cerrar;

  /* ======= INIT ======= */
  initFiltros();
  render();
  btnNueva.addEventListener('click', ()=> abrirEditor(null));
});
