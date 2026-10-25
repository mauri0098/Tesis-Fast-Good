let todosPlatos = [];   // platos activos con su cocinero (de /api/productos/cocineros)
let cocineros   = [];   // usuarios con rol cocinero, para armar los selects

document.addEventListener('DOMContentLoaded', () => {
  cargarDatos();
  document.getElementById('BuscarPlato').addEventListener('input', () => renderizarPlatos(filtrarPlatos()));
});

async function cargarDatos() {
  const tbody = document.getElementById('platosBody');

  try {
    [todosPlatos, cocineros] = await Promise.all([
      apiFetch('/api/productos/cocineros').then(r => r.json()),
      apiFetch('/api/cocineros').then(r => r.json()),
    ]);

    renderizarPlatos(todosPlatos);
    actualizarAviso();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

function filtrarPlatos() {
  const texto = document.getElementById('BuscarPlato').value.trim().toLowerCase();
  if (!texto) return todosPlatos;
  return todosPlatos.filter(p =>
    String(p.codigo_plato || '').toLowerCase().includes(texto) ||
    (p.nombre || '').toLowerCase().includes(texto) ||
    (p.plan?.nombre || '').toLowerCase().includes(texto)
  );
}

function renderizarPlatos(platos) {
  const tbody = document.getElementById('platosBody');
  tbody.innerHTML = '';

  if (platos.length === 0) {
    const hayBusqueda = document.getElementById('BuscarPlato').value.trim() !== '';
    tbody.innerHTML = `<tr><td colspan="5" class="loading-text">${hayBusqueda ? 'No se encontraron platos' : 'No hay platos cargados'}</td></tr>`;
    return;
  }

  platos.forEach(plato => tbody.appendChild(crearFilaPlato(plato)));
}

function crearFilaPlato(plato) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="codigo-plato"></td>
    <td class="plato-nombre-celda"></td>
    <td></td>
    <td><select class="select-cocinero" id="cocinero-${plato.id}"></select></td>
    <td><button class="btn-guardar" onclick="guardarCocinero(${plato.id}, this)">Guardar</button></td>
  `;

  // Datos cargados por el admin → textContent para evitar XSS
  tr.cells[0].textContent = plato.codigo_plato || '—';
  tr.cells[1].textContent = plato.nombre;
  tr.cells[2].textContent = plato.plan?.nombre || '—';

  const select = tr.querySelector('select');

  // Opción vacía: muestra qué cocinero lo va a ver igual (el del plan: el principal o, si no hay, el suplente)
  // o, si el plan tampoco tiene (25/10), que lo ven todos los cocineros
  const delPlan = cocineroDelPlan(plato);
  let textoSinAsignar = 'Sin asignar — el plan tampoco tiene: lo ven todos los cocineros';
  if (delPlan) textoSinAsignar = `Sin asignar — usa el del plan (${nombreCompleto(delPlan)})`;
  select.appendChild(crearOption('', textoSinAsignar));

  cocineros.forEach(c => select.appendChild(crearOption(c.id, nombreCompleto(c))));

  // Asignado a alguien que ya no es cocinero: se muestra igual para que no quede oculto
  if (plato.id_cocinero && !cocineros.some(c => c.id === plato.id_cocinero)) {
    const nombre = plato.cocinero ? nombreCompleto(plato.cocinero) : 'Usuario eliminado';
    select.appendChild(crearOption(plato.id_cocinero, `${nombre} (ya no es cocinero)`));
  }

  select.value = plato.id_cocinero ?? '';
  estiloSelect(select, plato);
  select.addEventListener('change', () => estiloSelect(select, plato));

  return tr;
}

// ─────────────────────────────────────────────────────────────────────────────
// cocineroDelPlan → el cocinero de respaldo de un plato: el principal de su plan o, si no tiene, el suplente (25/10)
// ENTRADA: plato (uno de /api/productos/cocineros) · SALIDA: { id, nombre, apellido } o null si el plan no tiene a nadie
// Ej: plan con principal Marta → Marta · plan sin principal y con suplente Juan → Juan · plan sin nadie → null
// Es la misma regla del servidor (platoEsDelCocinero): sin cocinero propio, lo ven el principal y el suplente del plan.
// ─────────────────────────────────────────────────────────────────────────────
function cocineroDelPlan(plato) {
  return plato.cocinero_plan || plato.cocinero_suplente_plan || null;
}

// Gris/itálica cuando usa el del plan; amarillo cuando no tiene a nadie (25/10: entonces lo ven todos los cocineros)
function estiloSelect(select, plato) {
  const hayDelPlan = Boolean(cocineroDelPlan(plato));
  select.classList.toggle('usa-plan',  select.value === '' && hayDelPlan);
  select.classList.toggle('sin-nadie', select.value === '' && !hayDelPlan);
}

// El aviso de arriba (25/10): cuántos platos no tienen a nadie (ni propio, ni principal ni suplente del plan).
// Esos platos los ven todos los cocineros, en "Para stock" y en "Pedidos de clientes", y cualquiera los puede marcar.
function actualizarAviso() {
  const aviso = document.getElementById('avisoSinCocinero');
  const sinNadie = todosPlatos.filter(p => !p.id_cocinero && !cocineroDelPlan(p)).length;
  const queTiene = sinNadie === 1 ? '1 plato no tiene' : sinNadie + ' platos no tienen';
  aviso.textContent = '⚠ ' + queTiene + ' cocinero (ni propio ni del plan, principal o suplente): '
    + 'lo ven todos los cocineros y cualquiera lo puede marcar como hecho o listo.';
  aviso.classList.toggle('visible', sinNadie > 0);
}

function nombreCompleto(u) {
  return [u.nombre, u.apellido].filter(Boolean).join(' ');
}

function crearOption(value, texto) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = texto;
  return opt;
}

async function guardarCocinero(platoId, btn) {
  const idCocinero = document.getElementById(`cocinero-${platoId}`).value || null;

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const res = await apiFetch(`/api/productos/${platoId}/cocinero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('fg_token')
      },
      body: JSON.stringify({ id_cocinero: idCocinero }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(res.status === 401 ? 'Tu sesión expiró. Volvé a iniciar sesión.' : (err.error || 'No se pudo guardar. Intentá de nuevo.'));
    }

    // Actualizar en memoria para que el aviso y la búsqueda reflejen el cambio
    const plato = todosPlatos.find(p => p.id === platoId);
    if (plato) {
      plato.id_cocinero = idCocinero;
      plato.cocinero = cocineros.find(c => c.id === idCocinero) || null;
    }
    actualizarAviso();

    btn.textContent = 'Guardado';
    btn.classList.add('guardado');
    setTimeout(() => {
      btn.textContent = 'Guardar';
      btn.classList.remove('guardado');
      btn.disabled = false;
    }, 2000);

  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}
