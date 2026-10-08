// ============================================================================
// pedidosCocina.js — Pendientes de cocina (pedidos a cocina), compartido por
// Producción (heladera.html) y Tareas de Cocina (cocinero.html).
// Dibuja la lista agrupada por cocinero, con un botón "Hecho" por plato, y marca
// los platos hechos (POST /api/ordenes-produccion/detalles/:id/hecho).
// Necesita antes: api.js (apiFetch), escape.js (escHtml) y fechas.js.
// Lo que viene de la base pasa por escHtml (o se pone con textContent).
// ============================================================================

let marcandoHecho = false; // true mientras se marca un plato: el refresco automático espera

// Por cada lista dibujada (clave: id del contenedor):
//   { conBotonHecho, recargar, porId }
//   recargar: función de la pantalla que se llama después de marcar (recarga lo suyo)
//   porId: los renglones por id, para armar la confirmación
const listasPendientes = {};

// "1 plato" / "3 platos"
function conPlural(cantidad, singular, plural) {
  if (cantidad === 1) return cantidad + ' ' + singular;
  return cantidad + ' ' + plural;
}

// "2026-10-08" → "08/10"
function diaMes(texto) {
  const fecha = parseFechaLocal(texto);
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// Urgencia de una fecha "AAAA-MM-DD" comparada con hoy (fecha de la computadora):
// 'atrasado' si ya pasó, 'hoy' si es hoy, '' si es más adelante
function urgenciaFecha(fechaPara) {
  const hoy = fechaLocalISO(new Date());
  if (fechaPara < hoy) return 'atrasado';
  if (fechaPara === hoy) return 'hoy';
  return '';
}

// Arma (la primera vez) las dos partes del contenedor: el cuadro del resultado y la lista.
// Los clics en "Hecho" se escuchan sobre la lista entera, una sola vez.
function partesDeLista(idContenedor) {
  const contenedor = document.getElementById(idContenedor);
  let lista = contenedor.querySelector('.pend-contenido');

  if (!lista) {
    contenedor.innerHTML = '<div class="aviso-hecho" hidden></div><div class="pend-contenido"></div>';
    lista = contenedor.querySelector('.pend-contenido');
    lista.addEventListener('click', (e) => {
      const boton = e.target.closest('.btn-hecho');
      if (boton) marcarDetalleHecho(idContenedor, Number(boton.dataset.id), boton);
    });
  }

  return { aviso: contenedor.querySelector('.aviso-hecho'), lista };
}

// Pide los pendientes y los dibuja en el contenedor.
// opciones (la primera vez): { conBotonHecho, recargar }. En las recargas no hace falta pasarlas.
// Devuelve la lista de pendientes, o null si no se pudo cargar.
async function cargarPendientes(idContenedor, opciones) {
  if (opciones) listasPendientes[idContenedor] = { ...opciones, porId: {} };

  try {
    const res = await apiFetch('/api/ordenes-produccion/pendientes');
    if (!res.ok) throw new Error();
    const pendientes = await res.json();
    renderizarPendientes(idContenedor, pendientes);
    return pendientes;
  } catch {
    partesDeLista(idContenedor).lista.innerHTML =
      '<p class="pend-vacio pend-error">Error al cargar los pendientes de cocina</p>';
    return null;
  }
}

function renderizarPendientes(idContenedor, pendientes) {
  const { lista } = partesDeLista(idContenedor);
  const config = listasPendientes[idContenedor];

  config.porId = {};
  pendientes.forEach(d => { config.porId[d.id] = d; });

  if (pendientes.length === 0) {
    lista.innerHTML = '<p class="pend-vacio">No hay nada pendiente en cocina.</p>';
    return;
  }

  // Una tarjeta por cocinero (agrupado por id). El servidor manda todo ordenado por fecha y
  // número de pedido, así que las tarjetas quedan en orden de urgencia (la primera es la que
  // tiene lo más urgente) y adentro de cada una también. Sin cocinero: tarjeta aparte, al final.
  const tarjetas = [];
  const tarjetaPorId = {};
  const sinCocinero = { nombre: 'Sin cocinero asignado', sinAsignar: true, platos: [] };
  let totalViandas = 0;

  pendientes.forEach(d => {
    totalViandas += Number(d.cantidad);

    if (!d.id_cocinero) {
      sinCocinero.platos.push(d);
      return;
    }

    let tarjeta = tarjetaPorId[d.id_cocinero];
    if (!tarjeta) {
      let nombre = 'Cocinero';
      if (d.cocinero) nombre = d.cocinero;
      tarjeta = { nombre, sinAsignar: false, platos: [] };
      tarjetaPorId[d.id_cocinero] = tarjeta;
      tarjetas.push(tarjeta);
    }
    tarjeta.platos.push(d);
  });

  if (sinCocinero.platos.length > 0) tarjetas.push(sinCocinero);

  const resumen = `
    <p class="pend-resumen">
      ${conPlural(pendientes.length, 'plato pendiente', 'platos pendientes')} · ${conPlural(totalViandas, 'vianda', 'viandas')}
    </p>
  `;
  lista.innerHTML = resumen + tarjetas.map(t => crearTarjetaCocinero(t, config.conBotonHecho)).join('');
}

// Tarjeta de un cocinero: nombre grande, "3 platos · 25 viandas" y un renglón por plato.
// conBoton: cada renglón lleva el botón "Hecho".
function crearTarjetaCocinero(tarjeta, conBoton) {
  let viandas = 0;
  tarjeta.platos.forEach(d => { viandas += Number(d.cantidad); });

  const filas = tarjeta.platos.map(d => {
    const urgencia = urgenciaFecha(d.fecha_para);
    let clase = '';
    let marca = '';
    if (urgencia) {
      clase = 'pend-' + urgencia;
      marca = `<span class="marca-urgencia">${urgencia}</span>`;
    }

    let plan = '';
    if (d.plan) plan = `<span class="pend-plan">${escHtml(d.plan)}</span>`;

    let boton = '';
    if (conBoton) boton = `<button type="button" class="btn-hecho" data-id="${Number(d.id)}">Hecho</button>`;

    return `
      <li class="${clase}">
        <span class="pend-cantidad">${Number(d.cantidad)}</span>
        <div class="pend-info">
          <div class="pend-plato">${escHtml(d.plato)} ${plan}</div>
          <div class="pend-detalle">
            para el ${escHtml(diaMes(d.fecha_para))}${marca}
            <span class="pend-numero">· pedido #${Number(d.id_orden)}</span>
          </div>
        </div>
        ${boton}
      </li>
    `;
  }).join('');

  let claseTarjeta = 'tarjeta-cocinero';
  if (tarjeta.sinAsignar) claseTarjeta += ' sin-asignar';

  return `
    <div class="${claseTarjeta}">
      <div class="tarjeta-cabecera">
        <h4 class="tarjeta-nombre">${escHtml(tarjeta.nombre)}</h4>
        <span class="tarjeta-resumen">${conPlural(tarjeta.platos.length, 'plato', 'platos')} · ${conPlural(viandas, 'vianda', 'viandas')}</span>
      </div>
      <ul class="pend-platos">${filas}</ul>
    </div>
  `;
}

// Botón "Hecho": confirma, marca el plato y recarga. El resultado queda en el cuadro de arriba.
// El marcado y la recarga van en try separados: si el plato se marcó bien y después falla
// la recarga, el cuadro sigue diciendo "hecho" (lo marcado no se deshace por eso).
async function marcarDetalleHecho(idContenedor, idDetalle, boton) {
  const config = listasPendientes[idContenedor];
  const detalle = config.porId[idDetalle];
  if (!detalle || marcandoHecho) return;

  const texto = Number(detalle.cantidad) + ' ' + detalle.plato;
  if (!confirm('¿Marcar ' + texto + ' como hecho?')) return;

  marcandoHecho = true;
  boton.disabled = true;

  try {
    // 1. Marcar
    try {
      const res = await apiFetch(`/api/ordenes-produccion/detalles/${idDetalle}/hecho`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const avisos = textosAvisos(data.avisos);
        let tipo = 'ok';
        if (avisos.length > 0) tipo = 'aviso';
        mostrarResultadoHecho(idContenedor, tipo, '✓ ' + texto + ': hecho.', avisos);
      } else if (res.status === 409) {
        mostrarResultadoHecho(idContenedor, 'info', 'Ya estaba marcado.', []);
      } else {
        mostrarResultadoHecho(idContenedor, 'error', data.error || 'No se pudo marcar el plato como hecho.', []);
      }
    } catch {
      // No llegó la respuesta: no se sabe si se marcó. Se avisa y se recarga para ver cómo quedó.
      mostrarResultadoHecho(idContenedor, 'error', 'No se pudo conectar con el servidor.', []);
      boton.disabled = false;
    }

    // 2. Recargar (en todos los casos: desaparece lo que ya está hecho).
    //    Si falla, el cuadro queda como está; la lista muestra su propio error.
    try {
      await config.recargar();
    } catch {
      // Nada que mostrar acá: cada lista avisa su error al no poder cargarse
    }
  } finally {
    marcandoHecho = false;
  }
}

// Número con hasta 2 decimales, formato argentino (ej: 1.250,5)
function numeroCorto(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

// Avisos del servidor en frases: "Faltaron 2 kg de Pollo" o el mensaje de "sin receta"
function textosAvisos(avisos) {
  if (!Array.isArray(avisos)) return [];
  return avisos.map(a => {
    if (a.tipo === 'insumo_corto') {
      let unidad = '';
      if (a.unidad) unidad = ' ' + a.unidad;
      return 'Faltaron ' + numeroCorto(a.falta) + unidad + ' de ' + a.nombre;
    }
    return a.mensaje || 'Aviso sin detalle';
  });
}

// Cuadro con el resultado del último "Hecho", arriba de la lista. Queda hasta cerrarlo o marcar otro.
// tipo: 'ok' (verde), 'aviso' (amarillo: se hizo, con avisos), 'info' (gris) o 'error' (rojo).
// Todo con textContent: lo que viene de la base no se interpreta como HTML.
function mostrarResultadoHecho(idContenedor, tipo, mensaje, detalles) {
  const { aviso } = partesDeLista(idContenedor);
  aviso.className = 'aviso-hecho aviso-hecho--' + tipo;
  aviso.innerHTML = '';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'aviso-hecho-cuerpo';
  const linea = document.createElement('div');
  linea.textContent = mensaje;
  cuerpo.appendChild(linea);

  if (detalles.length > 0) {
    const ul = document.createElement('ul');
    detalles.forEach(texto => {
      const li = document.createElement('li');
      li.textContent = texto;
      ul.appendChild(li);
    });
    cuerpo.appendChild(ul);
  }

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'aviso-hecho-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => { aviso.hidden = true; });

  aviso.appendChild(cuerpo);
  aviso.appendChild(cerrar);
  aviso.hidden = false;
}
