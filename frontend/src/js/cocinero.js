document.addEventListener('DOMContentLoaded', async () => {

  const select = document.getElementById('selectCocinero');
  const tbody = document.getElementById('tablaTareas');

  // ===== Cargar cocineros =====
  async function cargarCocineros() {
    const res = await fetch('http://localhost:3000/api/cocineros');
    const cocineros = await res.json();

    cocineros.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      select.appendChild(option);
    });
  }

  // ===== Cargar tareas del cocinero =====
  async function cargarTareas(cocineroId) {
    tbody.innerHTML =
      '<tr><td colspan="5">Cargando tareas...</td></tr>';

    if (!cocineroId) {
      tbody.innerHTML =
        '<tr><td colspan="5">Seleccioná un cocinero</td></tr>';
      return;
    }

    const res = await fetch(
      `http://localhost:3000/api/tareas-cocinero/${cocineroId}`
    );
    const tareas = await res.json();

    tbody.innerHTML = '';

    if (!tareas.length) {
      tbody.innerHTML =
        '<tr><td colspan="5">Este cocinero no tiene tareas asignadas</td></tr>';
      return;
    }

    tareas.forEach(t => {

      const estado = t.pedidos?.estados || { nombre: 'Sin estado' };
      let boton = '—';

      // ✅ COMPARAR POR NOMBRE (NO POR ID)
      if (estado.nombre === 'Pendiente') {
        boton = `<button onclick="cambiarEstado(${t.pedidos.id}, 2)">
                   Iniciar
                 </button>`;
      } 
      else if (estado.nombre === 'En preparación') {
        boton = `<button onclick="cambiarEstado(${t.pedidos.id}, 3)">
                   Marcar listo
                 </button>`;
      } 
      else if (estado.nombre === 'Listo') {
        boton = `<button onclick="cambiarEstado(${t.pedidos.id}, 4)">
                   Marcar entregado
                 </button>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${t.pedidos?.id ?? '—'}</td>
        <td>${t.productos?.nombre ?? '—'}</td>
        <td>${t.cantidad}</td>
        <td>${estado.nombre}</td>
        <td>${boton}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Eventos
  select.addEventListener('change', () => {
    cargarTareas(select.value);
  });

  // INIT
  await cargarCocineros();
  cargarTareas('');
});

// ===== Cambiar estado del pedido =====
window.cambiarEstado = async function (pedidoId, nuevoEstado) {
  if (!confirm('¿Confirmar cambio de estado del pedido?')) return;

  try {
    const res = await fetch(
      `http://localhost:3000/api/pedidos/${pedidoId}/estado`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_id: nuevoEstado })
      }
    );

    if (!res.ok) {
      throw new Error('Error al cambiar estado');
    }

    alert('Estado actualizado correctamente');

    // Recargar tareas del cocinero seleccionado
    const select = document.getElementById('selectCocinero');
    if (select && select.value) {
      select.dispatchEvent(new Event('change'));
    }

  } catch (err) {
    alert('❌ No se pudo cambiar el estado');
  }
};
