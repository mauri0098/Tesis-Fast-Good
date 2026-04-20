let todosInsumos = []; //array para todos los insumos 

document.addEventListener('DOMContentLoaded', () => {//CUAANDO TODO EL HTML ESTE CARGADO SE EJECUTA ESTA FUNCION QUE TRAE LOS INSUMOS Y INICIA LOS FILTROS
  fetchInsumos();   
  iniciarFiltros();
});

// ==========================================
// TRAER INSUMOS DEL SERVIDOR
// ==========================================w

async function fetchInsumos() {//Un fetch aclara lo que es un fetch
  const tbody = document.getElementById('stockBody');//esto selecciona una parte del html que vamos a trabjar

  try {//usamos el try catch para manejar errores por si el servidor no reponde 
   
    const response = await fetch('http://localhost:3000/api/insumos');// AWAIT ESPERABA UNA REPUESTA, ACA LO QUE HACEMOS ES TRAER TODOS LOS INSUMOS DE LA BASE DE DATOS 
    const data = await response.json();//Y NOS VA A REPONDER CON UN JSON PARA QUE LO PODAMOS USAR EN JS 

    todosInsumos = data; // PONEMOS LOS INSUMOS EN EL ARRAY

    
    cargarCategoriasEnFiltro();//ESTO DEBE SER UNA FUNCION PARA LOS FILTROS NOSE QUE HACE ACA 

    
    renderizarInsumos(todosInsumos);//REDERIZAMOS LOS INSUMOS CON ESTA FUNCION DE MAS ABAJO QUE HACE LA TABLA tr td etc

  } catch (error) {// si hay un error al traer los insumos, lo mostramos en consola y en la tabla
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="8" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}

// ==========================================
// DIBUJAR LA TABLA
// ==========================================

function renderizarInsumos(insumos) {//funcion para hacer la tabla de insumos. es como renderizar productos pero para insumos. recibe un array de insumos y los dibuja en la tabla del html
  const tbody = document.getElementById('stockBody');//volvemos a secleccionar la parte del html donde va la tabla de insumos para mostrarlo ahi
  tbody.innerHTML = ''; // limpiar lo que había antes

  
  if (insumos.length === 0) {//si no hay ningun insumo se muesta este mensaje 
    tbody.innerHTML = '<tr><td colspan="9" class="loading-text">No se encontraron insumos</td></tr>';
    return;
  }
  //DUDA RAPIDA SE MEZCLA EL HTML ACA CON EL JAVASCRIP ESTA BIEN ESTO O TIENE QUE VENIR EN VARIABLES
  
  insumos.forEach(insumo => {// SE RECORRE CADA INSUMOS Y SE HACAE UNA GRILLA PARA CADA DE ELLOS 
    const tr = document.createElement('tr');// ESTE TR ES CADA FILA DE LA TABLA, SE CREA POR CADA INSUMO

    
    const idFormatted = '#' + String(insumo.id).padStart(3, '0');//SE METE EN VARIABLES LOS DISTITOS DATOS DEL INSUMO, NOSOTROS RECORRIMOS EL JSON ACA Y LOS VAMOS GUARDANDO EN VARIABLES PARA USARLAS EN EL HTML DE MAS ABAJO, POR EJEMPLO EL ID LO FORMATEAMOS PARA QUE TENGA 3 DIGITOS Y UN # AL PRINCIPIO

    
    const nombre = insumo.nombre;

    
    const stockActual = insumo.stock_actual;

    
    const unidad = insumo.unidad_medida || '-';

    
    const categoria = insumo.categorias_insumos?.nombre || '-';

    
    const fecha = insumo.fecha_ingreso
      ? new Date(insumo.fecha_ingreso).toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        })
      : '-';

    
    // Fecha de caducidad (puede venir null si el insumo no vence)
    let fechaCaducidad;
    if (insumo.fecha_caducidad) {
      fechaCaducidad = new Date(insumo.fecha_caducidad).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } else {
      fechaCaducidad = '-';
    }

    const esBajo = insumo.stock_actual <= insumo.stock_minimo;//ESTO ES PARA SABER SI EL STOCK ESTA BAJO O NO, COMPARANDO EL STOCK ACTUAL CON EL MINIMO

    let estado;
    if (esBajo) {
      estado = 'Bajo mínimo';
    } else {
      estado = 'Normal';
    }

    let badgeClass;
    if (esBajo) {
      badgeClass = 'badge-bajo';
    } else {
      badgeClass = 'badge-normal';
    }

    
    if (esBajo) tr.classList.add('row-bajo');

    // ACA SE AGARRA LO DEL HTML NO ME ACUERDO PORQUE PERO SE AGARRA UNA PARTE DE AHI QUE ESTA CREADO EN EL HTML Y SE METE LAS VARIABLES DE LOS INSUMOS 
    tr.innerHTML = `
      <td style="font-weight:bold">${idFormatted}</td>
      <td><strong>${nombre}</strong></td>
      <td style="font-weight:600">${stockActual}</td>
      <td>${unidad}</td>
      <td>${categoria}</td>
      <td>${fecha}</td>
      <td>${fechaCaducidad}</td>
      <td><span class="badge-estado ${badgeClass}">${estado}</span></td>
      <td><button class="btn-merma" disabled>Registrar merma</button></td>
    `;

    tbody.appendChild(tr);//Y ESTO NOSE QUE HACE 
  });
}

// ==========================================
// FILTROS
// ==========================================


function cargarCategoriasEnFiltro() {
  const select = document.getElementById('filtroCategoria');
  select.innerHTML = '<option value="">Todas las categorías</option>';

  
  const cats = [...new Set(todosInsumos.map(i => i.categorias_insumos?.nombre).filter(Boolean))].sort();

  cats.forEach(c => {
    const option = document.createElement('option');
    option.value = c;
    option.textContent = c;
    select.appendChild(option);
  });
}

function iniciarFiltros() {
  const filtroNombre    = document.getElementById('filtroNombre');
  const filtroCategoria = document.getElementById('filtroCategoria');
  const filtroEstado    = document.getElementById('filtroEstado');

  
  function aplicarFiltros() {
    const texto     = filtroNombre.value.toLowerCase();
    const categoria = filtroCategoria.value;
    const estado    = filtroEstado.value;

    
    const filtrados = todosInsumos.filter(insumo => {
      
      const cumpleTexto     = insumo.nombre.toLowerCase().includes(texto);

     
      const cumpleCategoria = !categoria || insumo.categorias_insumos?.nombre === categoria;

      
      const esBajo = insumo.stock_actual <= insumo.stock_minimo;

      let estadoInsumo;
      if (esBajo) {
        estadoInsumo = 'Bajo mínimo';
      } else {
        estadoInsumo = 'Normal';
      }

      const cumpleEstado = !estado || estadoInsumo === estado;

      
      return cumpleTexto && cumpleCategoria && cumpleEstado;
    });

    
    renderizarInsumos(filtrados);
  }

  
  filtroNombre.addEventListener('input', aplicarFiltros);    // se dispara al escribir
  filtroCategoria.addEventListener('change', aplicarFiltros); // se dispara al elegir
  filtroEstado.addEventListener('change', aplicarFiltros);    // se dispara al elegir
}

// ==========================================
// MODAL AGREGAR STOCK
// ==========================================

async function abrirModalAgregarStock() {
  
  try {
    const res = await fetch('http://localhost:3000/api/categorias-insumos');
    const categorias = await res.json();

    const select = document.getElementById('aCategoria');
    select.innerHTML = '<option value="">Seleccione una categoría...</option>';

    categorias.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      select.appendChild(option);
    });
  } catch {
    document.getElementById('aCategoria').innerHTML = '<option value="">Error al cargar categorías</option>';
  }

  
  const axItem = document.getElementById('axItem');
  axItem.innerHTML = '';
  todosInsumos.forEach(insumo => {
    const option = document.createElement('option');
    option.value = insumo.id;
    option.textContent = `${insumo.nombre} (stock actual: ${insumo.stock_actual} ${insumo.unidad_medida || ''})`;
    axItem.appendChild(option);
  });

  
  document.querySelectorAll('input[name="addMode"]').forEach(r => r.checked = r.value === 'nuevo');
  swapAddMode();
  ['aNombre', 'aCantidad', 'aStockMinimo', 'aIngreso', 'aVence', 'axCantidad'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('aUnidad').value = '';
  document.getElementById('aError').style.display = 'none';

  
  document.getElementById('addStockModal').style.display = 'block';
}

function cerrarModalAgregarStock() {
  document.getElementById('addStockModal').style.display = 'none';
}


function swapAddMode() {
  const mode = document.querySelector('input[name="addMode"]:checked')?.value || 'nuevo';
  if (mode === 'nuevo') {
    document.getElementById('addNuevo').style.display = 'grid';
  } else {
    document.getElementById('addNuevo').style.display = 'none';
  }

  if (mode === 'existente') {
    document.getElementById('addExistente').style.display = 'grid';
  } else {
    document.getElementById('addExistente').style.display = 'none';
  }
  document.getElementById('aError').style.display = 'none';
}

async function confirmarAgregarStock() {
  const mode  = document.querySelector('input[name="addMode"]:checked')?.value || 'nuevo';
  const errEl = document.getElementById('aError');

  
  function mostrarError(msg) {
    errEl.textContent = msg || 'Completá los campos obligatorios.';
    errEl.style.display = 'block';
  }

  if (mode === 'nuevo') {
   
    const nombre      = document.getElementById('aNombre').value.trim();
    const stockActual = parseFloat(document.getElementById('aCantidad').value);
    const stockMinimo = parseFloat(document.getElementById('aStockMinimo').value);
    const unidad      = document.getElementById('aUnidad').value;
    const idCategoria = document.getElementById('aCategoria').value;
    const ingreso     = document.getElementById('aIngreso').value;
    const vence       = document.getElementById('aVence').value;

    if (!nombre || !unidad || !idCategoria || !ingreso || isNaN(stockActual) || stockActual < 0 || isNaN(stockMinimo) || stockMinimo < 0) {
      return mostrarError();
    }

    try {
      
      const res = await fetch('http://localhost:3000/api/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          stock_actual: stockActual,
          stock_minimo: stockMinimo,
          unidad_medida: unidad,
          id_categoria_insumo: parseInt(idCategoria),
          fecha_ingreso: ingreso,
          fecha_caducidad: vence || null
        })
      });

      if (!res.ok) throw new Error();

      cerrarModalAgregarStock();
      await fetchInsumos(); // recargar la tabla con el nuevo insumo incluido

    } catch {
      mostrarError('Error al guardar. Intentá de nuevo.');
    }

  } else {
    
    const id    = document.getElementById('axItem').value;
    const sumar = parseFloat(document.getElementById('axCantidad').value);

    if (!id || isNaN(sumar) || sumar <= 0) return mostrarError();

    
    const insumo = todosInsumos.find(i => i.id === parseInt(id));
    if (!insumo) return mostrarError('Insumo no encontrado.');

    try {
      
      const res = await fetch(`http://localhost:3000/api/insumos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_actual: insumo.stock_actual + sumar })
      });

      if (!res.ok) throw new Error();

      cerrarModalAgregarStock();
      await fetchInsumos(); // recargar la tabla con el stock actualizado

    } catch {
      mostrarError('Error al actualizar. Intentá de nuevo.');
    }
  }
}


window.addEventListener('click', (e) => {
  if (e.target === document.getElementById('addStockModal')) cerrarModalAgregarStock();
});
