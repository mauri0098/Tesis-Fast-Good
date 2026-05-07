document.addEventListener('DOMContentLoaded', cargarDatos);

async function cargarDatos() {
  const tbody = document.getElementById('planesBody');

  try {
    const [planes, cocineros] = await Promise.all([
      fetch('http://localhost:3000/api/planes/cocineros').then(r => r.json()),
      fetch('http://localhost:3000/api/cocineros').then(r => r.json()),
    ]);

    tbody.innerHTML = '';

    if (planes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No hay planes registrados</td></tr>';
      return;
    }

    planes.forEach(plan => {
      const tr = document.createElement('tr');

      const badgeEstado = plan.activo
        ? '<span class="badge-activo">Activo</span>'
        : '<span class="badge-inactivo">Inactivo</span>';

      const categoria = plan.categorias?.nombre || '-';

      tr.innerHTML = `
        <td style="font-weight:600; text-align:left">${plan.nombre}</td>
        <td>${categoria}</td>
        <td>${badgeEstado}</td>
        <td><select class="select-cocinero" id="principal-${plan.id}"></select></td>
        <td><select class="select-cocinero" id="suplente-${plan.id}"></select></td>
        <td><button class="btn-guardar" onclick="guardarCocinero(${plan.id}, this)">Guardar</button></td>
      `;

      const selectPrincipal = tr.querySelector(`#principal-${plan.id}`);
      const selectSuplente  = tr.querySelector(`#suplente-${plan.id}`);

      selectPrincipal.appendChild(crearOption('', 'Sin asignar'));
      selectSuplente.appendChild(crearOption('', 'Sin suplente'));

      cocineros.forEach(c => {
        const label = `Cocinero #${c.id} — ${c.nombre} ${c.apellido}`;
        selectPrincipal.appendChild(crearOption(c.id, label));
        selectSuplente.appendChild(crearOption(c.id, label));
      });

      selectPrincipal.value = plan.id_cocinero ?? '';
      selectSuplente.value  = plan.id_cocinero_suplente ?? '';

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

function crearOption(value, texto) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = texto;
  return opt;
}

async function guardarCocinero(planId, btn) {
  const principal = document.getElementById(`principal-${planId}`).value;
  const suplente  = document.getElementById(`suplente-${planId}`).value;

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const res = await fetch(`http://localhost:3000/api/planes/${planId}/cocinero`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_cocinero:          principal || null,
        id_cocinero_suplente: suplente  || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar');
    }

    btn.textContent = 'Guardado';
    btn.classList.add('guardado');
    setTimeout(() => {
      btn.textContent = 'Guardar';
      btn.classList.remove('guardado');
      btn.disabled = false;
    }, 2000);

  } catch (err) {
    alert('No se pudo guardar. Intentá de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}