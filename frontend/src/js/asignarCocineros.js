// ===============================
// ASIGNAR COCINEROS (FINAL)
// ===============================

let COCINEROS = [];
let pedido = [];
let pedidoId = null;

// ===== Cargar cocineros reales desde Supabase =====
async function cargarCocineros() {
  const res = await fetch('http://localhost:3000/api/cocineros');
  COCINEROS = await res.json();
}

// ===============================
document.addEventListener('DOMContentLoaded', async () => {

  const sinComandaDiv  = document.getElementById('sinComanda');
  const seccionComanda = document.getElementById('seccionComanda');
  const tbodyComanda   = document.getElementById('tbodyComanda');
  const btnAsignar     = document.getElementById('btnAsignar');
  const resumen        = document.getElementById('resumen');
  const listaResumen   = document.getElementById('listaResumen');

  // 1️⃣ Cargar cocineros
  await cargarCocineros();

  // 2️⃣ Leer comanda desde localStorage
  const crudo = JSON.parse(localStorage.getItem('pedidoFastGood') || 'null');

  if (!crudo || !Array.isArray(crudo.items)) {
    sinComandaDiv.style.display = 'block';
    seccionComanda.style.display = 'none';
    return;
  }

  pedidoId = crudo.id;
  pedido = crudo.items.map(it => ({
    nombre: it.nombre,
    producto_id: it.producto_id,
    cantidad: Number(it.cantidad) || 0
  })).filter(it => it.cantidad > 0);

  if (!pedido.length) {
    sinComandaDiv.style.display = 'block';
    seccionComanda.style.display = 'none';
    return;
  }

  seccionComanda.style.display = 'block';
  renderTablaComanda();

  // ===============================
  // Renderizar tabla
  function renderTablaComanda() {
    tbodyComanda.innerHTML = '';

    pedido.forEach((item, idxPlato) => {
      const tr = document.createElement('tr');

      const asigHtml = COCINEROS.map(c => `
        <div class="asig-celda">
          <label>${c.nombre}</label>
          <input type="number"
                 min="0"
                 value="0"
                 data-plato-index="${idxPlato}"
                 data-cocinero-id="${c.id}"
                 class="input-asig">
        </div>
      `).join('');

      tr.innerHTML = `
        <td>${item.nombre}</td>
        <td>${item.cantidad}</td>
        <td><div class="asig-grid">${asigHtml}</div></td>
      `;

      tbodyComanda.appendChild(tr);
    });
  }

  // ===============================
  // Confirmar asignación
  btnAsignar.addEventListener('click', async () => {
    const inputs = Array.from(document.querySelectorAll('.input-asig'));
    const tareas = [];

    // Validar sumas
    for (let i = 0; i < pedido.length; i++) {
      const totalAsignado = inputs
        .filter(inp => +inp.dataset.platoIndex === i)
        .reduce((acc, inp) => acc + (parseInt(inp.value || '0')), 0);

      if (totalAsignado !== pedido[i].cantidad) {
        alert(`La suma asignada para "${pedido[i].nombre}" no coincide`);
        return;
      }
    }

    // Armar tareas
 inputs.forEach(inp => {
  const cant = parseInt(inp.value || '0', 10) || 0;
  if (cant <= 0) return;

  const idxPlato   = Number(inp.dataset.platoIndex);
  const cocineroId = inp.dataset.cocineroId; // ✅ ACÁ ESTÁ LA CLAVE
  const cocinero   = COCINEROS.find(c => c.id === cocineroId);
  const plato      = pedido[idxPlato];

  tareas.push({
    cocineroId: cocineroId,
    cocineroNombre: cocinero ? cocinero.nombre : '—',
    producto_id: plato.producto_id,
    plato: plato.nombre,
    cantidad: cant
  });
});



    if (!tareas.length) {
      alert('No se asignaron tareas');
      return;
    }

    // 🔥 GUARDAR EN SUPABASE
    await fetch('http://localhost:3000/api/asignar-cocineros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id: pedidoId,
        tareas
      })
    });

    // Limpiar comanda
    localStorage.removeItem('pedidoFastGood');

    // Mostrar resumen
    mostrarResumen(tareas);

    tbodyComanda.innerHTML = '';
    resumen.style.display = 'block';

    alert('Asignación registrada correctamente');
  });

  // ===============================
  function mostrarResumen(tareas) {
    const porCocinero = {};

    tareas.forEach(t => {
      const coc = COCINEROS.find(c => c.id === t.cocineroId);
      if (!porCocinero[t.cocineroId]) {
        porCocinero[t.cocineroId] = { nombre: coc?.nombre || 'Cocinero', platos: [] };
      }
      porCocinero[t.cocineroId].platos.push(`Producto ${t.producto_id} x${t.cantidad}`);
    });

    listaResumen.innerHTML = '';
    Object.values(porCocinero).forEach(c => {
      const li = document.createElement('li');
      li.textContent = `${c.nombre}: ${c.platos.join(' · ')}`;
      listaResumen.appendChild(li);
    });
  }

});
