// ============================================================================
// pedidosCocina.js — Pendientes de cocina (pedidos a cocina). Lo comparten Producción (heladera.html)
// y Tareas de Cocina (cocinero.html, la parte "Para stock").
//
// Funciones:
//   conPlural        → "1 plato" / "3 platos" (también la usan heladera.js y pedirCocina.js)
//   cargarPendientes → pide los pendientes (GET /api/ordenes-produccion/pendientes) y los dibuja: una tarjeta por
//                      cocinero, con un botón "Hecho" por plato si la pantalla lo pide. Devuelve la lista (o null)
//   marcarHecho      → el botón "Hecho": pregunta, marca el plato (POST /api/ordenes-produccion/detalles/:id/hecho),
//                      muestra el resultado arriba de la lista y recarga lo que pida la pantalla
//                      (27/10: si faltan insumos, la pregunta es "¿Las cocinaste igual?")
//   marcaFaltantes   → (27/10) "⚠ faltan 700 g de Carne" en rojo, para un plato al que le faltan insumos
//   preguntarCocinasteIgual → (27/10) la ventana "Faltan 700 g de Carne. ¿Las cocinaste igual?" (Cancelar / "Sí, las cociné")
//
// Necesita antes: api.js (apiFetch), escape.js (escHtml) y fechas.js (fechaLocalISO, parseFechaLocal).
// Lo que viene de la base pasa por escHtml (o se pone con textContent).
// ============================================================================

let marcandoHecho = false;   // true mientras se marca un plato: la recarga automática espera (la mira cocinero.html)

// Por cada lista dibujada (clave: el id del contenedor): { conBotonHecho, recargar, porId }
//   conBotonHecho: si cada plato lleva el botón "Hecho"
//   recargar:      la función de la pantalla que se llama después de marcar (recarga lo suyo)
//   porId:         los platos por número, para la pregunta "¿Marcar 2 fideos como hecho?"
const listasPendientes = {};


// ─────────────────────────────────────────────────────────────────────────────
// conPlural → un número con su palabra en singular o en plural
// ENTRADA: cantidad, la palabra en singular y en plural
// SALIDA:  el texto. Ej: (1, 'plato', 'platos') → "1 plato" · (3, 'plato', 'platos') → "3 platos"
// ─────────────────────────────────────────────────────────────────────────────
function conPlural(cantidad, singular, plural) {
  const palabra = cantidad === 1 ? singular : plural;           // uno: singular; cero o varios: plural
  return cantidad + ' ' + palabra;
}


// ─────────────────────────────────────────────────────────────────────────────
// cargarPendientes → pide los platos pedidos a cocina que no están hechos y los dibuja en un contenedor
// ENTRADA: idContenedor ('listaPendientes' en Producción, 'listaParaStock' en Tareas de Cocina) y, la primera
//          vez, opciones { conBotonHecho, recargar }. En las recargas no hace falta pasarlas.
// SALIDA:  la lista de pendientes (o null si no se pudo cargar). En pantalla: "3 platos pendientes · 25 viandas"
//          y una tarjeta por cocinero ("Sin cocinero asignado" al final), cada plato con su "Hecho" si se pidió.
// Ej: "Marta Garcia · 1 plato · 20 viandas" / "20  berenjenas rellenas (MANTENIMIENTO)" / "para el 16/10 hoy · Cocina #010" [Hecho]
// (29/10: el número del pedido a cocina se escribe "Cocina #010", con numeroPedido de escape.js)
// El servidor manda todo ordenado por fecha y número de pedido: la primera tarjeta es la más urgente.
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPendientes(idContenedor, opciones) {
  // 1. La configuración de esta lista (la primera vez vienen las opciones)
  if (opciones) listasPendientes[idContenedor] = { conBotonHecho: opciones.conBotonHecho, recargar: opciones.recargar, porId: {} };
  const config = listasPendientes[idContenedor];

  // 2. La primera vez se arman las dos partes del contenedor: el cuadro del resultado de "Hecho" y la lista.
  //    Los clics en "Hecho" se escuchan sobre la lista entera, una sola vez (así sirven para los platos nuevos).
  const contenedor = document.getElementById(idContenedor);
  const yaArmado = Boolean(contenedor.querySelector('.pend-contenido'));  // ¿ya se armó antes?
  if (!yaArmado) contenedor.innerHTML = '<div class="aviso-hecho" hidden></div><div class="pend-contenido"></div>';
  const lista = contenedor.querySelector('.pend-contenido');      // la lista de tarjetas
  if (!yaArmado) lista.addEventListener('click', evento => marcarHecho(idContenedor, evento));  // un clic en la lista

  // 3. Se piden los pendientes
  let pendientes = null;
  try {
    const respuesta = await apiFetch('/api/ordenes-produccion/pendientes');
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);  // si el servidor dio error, va al catch
    pendientes = await respuesta.json();
  } catch (error) {                                               // si no se pudo...
    console.error('No se pudieron cargar los pendientes de cocina:', error);  // ...el detalle a la consola
    lista.innerHTML = '<p class="pend-vacio pend-error">Error al cargar los pendientes de cocina</p>';
    return null;
  }

  // 4. Se guardan por número (para la pregunta de "Hecho")
  config.porId = {};
  pendientes.forEach(detalle => {
    config.porId[detalle.id] = detalle;
  });
  if (pendientes.length === 0) {
    lista.innerHTML = '<p class="pend-vacio">No hay nada pendiente en cocina.</p>';
    return pendientes;
  }

  // 5. Una tarjeta por cocinero. Cada plato se dibuja de una vez en el html de su tarjeta
  //    (así no hace falta un forEach adentro de otro). Los que no tienen cocinero van a una tarjeta aparte.
  const hoy = fechaLocalISO(new Date());                          // hoy, 'AAAA-MM-DD' (fechas.js)
  const tarjetas = [];                                            // las tarjetas, en orden de urgencia
  const tarjetaPorId = {};                                        // { id_cocinero: tarjeta }
  const sinCocinero = { nombre: 'Sin cocinero asignado', sinAsignar: true, filas: '', platos: 0, viandas: 0 };
  let totalViandas = 0;                                           // las viandas de todos los platos
  pendientes.forEach(detalle => {                                 // por cada plato pendiente...
    totalViandas = totalViandas + Number(detalle.cantidad);

    // a. Su tarjeta: la de su cocinero (se crea la primera vez que aparece) o la de "sin cocinero"
    const idCocinero = detalle.id_cocinero;                       // de quién es (null = de nadie)
    const tarjetaNueva = Boolean(idCocinero) && !tarjetaPorId[idCocinero];  // ¿primera vez de este cocinero?
    if (tarjetaNueva) {
      tarjetaPorId[idCocinero] = { nombre: detalle.cocinero || 'Cocinero', sinAsignar: false, filas: '', platos: 0, viandas: 0 };
      tarjetas.push(tarjetaPorId[idCocinero]);
    }
    const tarjeta = idCocinero ? tarjetaPorId[idCocinero] : sinCocinero;

    // b. La urgencia: 'atrasado' si el día ya pasó, 'hoy' si es hoy ('AAAA-MM-DD' se compara como texto)
    let urgencia = '';                                            // más adelante: sin marca
    if (detalle.fecha_para === hoy) urgencia = 'hoy';
    if (detalle.fecha_para < hoy) urgencia = 'atrasado';
    const clase = urgencia ? 'pend-' + urgencia : '';
    const marca = urgencia ? '<span class="marca-urgencia">' + urgencia + '</span>' : '';

    // c. Lo que va en el renglón, calculado antes (nada de "? :" adentro del HTML)
    const fecha = parseFechaLocal(detalle.fecha_para);            // '2026-10-08' → fecha
    const diaMes = String(fecha.getDate()).padStart(2, '0') + '/' + String(fecha.getMonth() + 1).padStart(2, '0');  // "08/10"
    // El plan va entre paréntesis después del plato, en gris: así se lee primero QUÉ plato es.
    // Ej: plato 'berenjenas rellenas' y plan 'MANTENIMIENTO' → "berenjenas rellenas (MANTENIMIENTO)"
    const plan = detalle.plan ? ' <span class="pend-plan">(' + escHtml(detalle.plan) + ')</span>' : '';
    const boton = config.conBotonHecho ? '<button type="button" class="btn-hecho" data-id="' + Number(detalle.id) + '">Hecho</button>' : '';
    // (27/10) Lo que le falta para cocinarlo, en rojo (o nada). Ej: "⚠ faltan 700 g de Carne"
    const faltan = marcaFaltantes(detalle.faltantes);

    tarjeta.filas += `
      <li class="${clase}">
        <span class="pend-cantidad">${Number(detalle.cantidad)}</span>
        <div class="pend-info">
          <div class="pend-plato">${escHtml(detalle.plato)}${plan}</div>
          <div class="pend-detalle">
            para el ${escHtml(diaMes)}${marca}
            <span class="pend-numero">· ${numeroPedido(detalle.id_orden, 'cocina')}</span>
          </div>
          ${faltan}
        </div>
        ${boton}
      </li>`;
    tarjeta.platos = tarjeta.platos + 1;                          // un plato más en la tarjeta
    tarjeta.viandas = tarjeta.viandas + Number(detalle.cantidad); // y sus viandas
  });
  if (sinCocinero.platos > 0) tarjetas.push(sinCocinero);         // "sin cocinero" va al final

  // 6. El resumen y las tarjetas
  let html = `
    <p class="pend-resumen">
      ${conPlural(pendientes.length, 'plato pendiente', 'platos pendientes')} · ${conPlural(totalViandas, 'vianda', 'viandas')}
    </p>`;
  tarjetas.forEach(tarjeta => {                                   // por cada tarjeta...
    const claseTarjeta = tarjeta.sinAsignar ? 'tarjeta-cocinero sin-asignar' : 'tarjeta-cocinero';
    html += `
      <div class="${claseTarjeta}">
        <div class="tarjeta-cabecera">
          <h4 class="tarjeta-nombre">${escHtml(tarjeta.nombre)}</h4>
          <span class="tarjeta-resumen">${conPlural(tarjeta.platos, 'plato', 'platos')} · ${conPlural(tarjeta.viandas, 'vianda', 'viandas')}</span>
        </div>
        <ul class="pend-platos">${tarjeta.filas}</ul>
      </div>`;
  });
  lista.innerHTML = html;
  return pendientes;                                              // la lista (heladera.js pone cuántos hay en su botón)
}


// ─────────────────────────────────────────────────────────────────────────────
// marcarHecho → un clic en la lista de pendientes: si fue en un botón "Hecho", marca ese plato
// ENTRADA: idContenedor (de qué lista) y evento (el clic; el botón tocado se busca con closest)
// SALIDA:  nada. Pregunta "¿Marcar 2 fideos como hecho?"; si dice que sí, lo marca y deja el resultado en el
//          cuadro de arriba de la lista: verde "✓ 2 fideos: hecho.", amarillo con avisos ("Faltaron 39 u de Huevo"),
//          gris si la base no lo aceptó (ej: "Este plato ya estaba marcado como hecho") o rojo si falló.
//          Después recarga (lo que ya está hecho desaparece).
// Lo hace el servidor con producir_viandas: heladera +2, insumos − receta × 2 y renglón "produccion".
// ─────────────────────────────────────────────────────────────────────────────
async function marcarHecho(idContenedor, evento) {
  // 1. Qué plato: el del botón "Hecho" tocado (closest = el botón donde se hizo clic, o null si se tocó otra cosa)
  const boton = evento.target.closest('.btn-hecho');
  if (!boton) return;                                             // se tocó otra parte de la lista
  const config = listasPendientes[idContenedor];
  const detalle = config.porId[Number(boton.dataset.id)];         // el plato tocado
  if (!detalle || marcandoHecho) return;                          // si no está, o ya se está marcando otro, nada

  // 2. Se pregunta. (27/10) Si le faltan insumos: "Faltan 700 g de Carne. ¿Las cocinaste igual?" (Cancelar / "Sí,
  //    las cociné"); si no, la pregunta de siempre. La recarga automática espera mientras está la pregunta.
  const texto = Number(detalle.cantidad) + ' ' + detalle.plato;   // ej: "2 fideos"
  const faltantes = Array.isArray(detalle.faltantes) ? detalle.faltantes : [];   // ej: ['700 g de Carne']
  const hayFaltantes = faltantes.length > 0;
  marcandoHecho = true;
  const quiereMarcar = hayFaltantes ? await preguntarCocinasteIgual(texto, faltantes) : confirm('¿Marcar ' + texto + ' como hecho?');
  marcandoHecho = false;
  if (!quiereMarcar) return;                                      // si dice que no, nada

  marcandoHecho = true;                                           // la recarga automática espera
  boton.disabled = true;                                          // un doble clic no marca dos veces
  try {
    // 3. Se marca. El resultado queda en { tipo, mensaje, detalles } para mostrarlo en el paso 4.
    //    tipo: 'ok' (verde), 'aviso' (amarillo), 'info' (gris) o 'error' (rojo)
    //    (27/10) Si confirmó "Sí, las cociné", va { aunque_falten_insumos: true }: sin eso, el servidor no lo marca
    //    si faltan insumos (409 con necesita_confirmar).
    let resultado = { tipo: 'error', mensaje: 'No se pudo conectar con el servidor.', detalles: [] };
    try {
      const respuesta = await apiFetch(`/api/ordenes-produccion/detalles/${detalle.id}/hecho`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ aunque_falten_insumos: hayFaltantes })
      });
      const datos = await respuesta.json().catch(() => ({}));     // la respuesta (si no es JSON, un objeto vacío)

      // Los avisos, en frases: "Faltaron 2 kg de Pollo" o el texto del aviso (ej: el de "sin receta")
      const avisos = Array.isArray(datos.avisos) ? datos.avisos : [];
      const frases = [];
      avisos.forEach(aviso => {                                   // por cada aviso...
        const unidad = aviso.unidad ? ' ' + aviso.unidad : '';    // ...su unidad, si tiene
        const falta = Number(aviso.falta).toLocaleString('es-AR', { maximumFractionDigits: 2 });  // ej: 1.250,5
        frases.push(aviso.tipo === 'insumo_corto' ? 'Faltaron ' + falta + unidad + ' de ' + aviso.nombre : aviso.mensaje || 'Aviso sin detalle');
      });

      // Qué pasó, según sea la respuesta: se marcó (ok), la base no lo aceptó (409) u otro error
      const RESULTADOS = {
        ok:        { tipo: frases.length > 0 ? 'aviso' : 'ok', mensaje: '✓ ' + texto + ': hecho.', detalles: frases },
        rechazado: { tipo: 'info',  mensaje: datos.error || 'Ya estaba marcado.', detalles: [] },    // el motivo de verdad
        // (27/10) La lista era vieja: ahora faltan insumos y no se marcó. Al recargar el plato queda en rojo y el
        // próximo "Hecho" pregunta "¿Las cocinaste igual?"
        faltan:    { tipo: 'aviso', mensaje: 'No se marcó: ' + (datos.error || 'faltan insumos.') + ' Volvé a tocar "Hecho" para confirmar.', detalles: [] },
        error:     { tipo: 'error', mensaje: datos.error || 'No se pudo marcar el plato como hecho.', detalles: [] }
      };
      let clave = 'error';
      if (respuesta.status === 409) clave = 'rechazado';
      if (datos.necesita_confirmar === true) clave = 'faltan';
      if (respuesta.ok) clave = 'ok';
      resultado = RESULTADOS[clave];
    } catch (error) {
      // No llegó la respuesta: no se sabe si se marcó. Se avisa (el resultado de arriba) y se recarga para ver cómo quedó.
      console.error('No se pudo marcar el plato como hecho:', error);
      boton.disabled = false;
    }

    // 4. El resultado, en el cuadro de arriba de la lista. Todo con textContent: nada se interpreta como HTML.
    const cuadro = document.getElementById(idContenedor).querySelector('.aviso-hecho');
    cuadro.className = 'aviso-hecho aviso-hecho--' + resultado.tipo;  // su color
    cuadro.innerHTML = '';                                        // se borra el anterior
    const cuerpo = document.createElement('div');
    cuerpo.className = 'aviso-hecho-cuerpo';
    const linea = document.createElement('div');
    linea.textContent = resultado.mensaje;                        // la frase principal
    cuerpo.appendChild(linea);
    const listaAvisos = document.createElement('ul');             // los avisos, uno por renglón
    resultado.detalles.forEach(frase => {
      const renglon = document.createElement('li');
      renglon.textContent = frase;
      listaAvisos.appendChild(renglon);
    });
    if (resultado.detalles.length > 0) cuerpo.appendChild(listaAvisos);  // solo si hay avisos
    const cerrar = document.createElement('button');              // la × para cerrarlo
    cerrar.type = 'button';
    cerrar.className = 'aviso-hecho-cerrar';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.textContent = '×';
    cerrar.addEventListener('click', () => { cuadro.hidden = true; });
    cuadro.appendChild(cuerpo);
    cuadro.appendChild(cerrar);
    cuadro.hidden = false;                                        // se muestra (queda hasta cerrarlo o marcar otro)

    // 5. Se recarga, en todos los casos (lo hecho desaparece). Si falla, cada lista muestra su propio error.
    try {
      await config.recargar();
    } catch (error) {
      console.error('No se pudo recargar después de "Hecho":', error);
    }
  } finally {                                                     // pase lo que pase...
    marcandoHecho = false;                                        // ...la recarga automática vuelve a andar
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// marcaFaltantes → (27/10) la marca roja de un plato al que le faltan insumos para cocinarlo
// ENTRADA: faltantes (la lista que manda el servidor con cada pendiente: ['700 g de Carne', '4 u de Huevo'], o nada)
// SALIDA:  el HTML de la marca, o '' si no falta nada. Lo que viene de la base pasa por escHtml.
// Ej: ['700 g de Carne'] → '<div class="pend-faltan">⚠ faltan 700 g de Carne</div>' · [] → ''
// La usan la lista de Producción (cargarPendientes) y "Para stock" de Tareas de Cocina (cocinero.js).
// Es solo un aviso: el botón "Hecho" sigue andando (pregunta antes, ver preguntarCocinasteIgual).
// ─────────────────────────────────────────────────────────────────────────────
function marcaFaltantes(faltantes) {
  const lista = Array.isArray(faltantes) ? faltantes : [];        // si no vino, una lista vacía
  if (lista.length === 0) return '';                              // no falta nada: sin marca
  const textos = lista.map(texto => escHtml(texto)).join(', ');   // ej: "700 g de Carne, 4 u de Huevo"
  return `<div class="pend-faltan">⚠ faltan ${textos}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// preguntarCocinasteIgual → (27/10) la pregunta de "Hecho" cuando faltan insumos
// ENTRADA: texto (el plato, ej: "2 fideos") y faltantes (ej: ['700 g de Carne'])
// SALIDA:  una promesa que da true si toca "Sí, las cociné" y false si toca Cancelar, la X, afuera o Escape
// Ej: "Faltan 700 g de Carne. ¿Las cocinaste igual?" · "2 fideos" · [Cancelar] [Sí, las cociné]
// Es la ventana nueva del panel (global.css: .modal + .ventana-panel). Se arma la primera vez y después se reusa.
// Todo con textContent: lo que viene de la base no se interpreta como HTML.
// ─────────────────────────────────────────────────────────────────────────────
function preguntarCocinasteIgual(texto, faltantes) {
  // 1. La ventana (la primera vez se crea al final del <body>)
  let ventana = document.getElementById('ventanaFaltanInsumos');
  if (!ventana) {
    ventana = document.createElement('div');
    ventana.id = 'ventanaFaltanInsumos';
    ventana.className = 'modal ventana-faltan-fondo';
    ventana.innerHTML = `
      <div class="modal-content ventana-panel ventana-faltan" role="alertdialog" aria-modal="true" aria-labelledby="faltanTitulo" aria-describedby="faltanFrase">
        <div class="cabecera-ventana">
          <span class="icono-ventana icono-ventana-peligro" aria-hidden="true">⚠</span>
          <div class="textos-ventana">
            <h3 id="faltanTitulo"></h3>
            <p class="frase-ventana" id="faltanFrase"></p>
          </div>
        </div>
        <div class="botones-ventana pie-ventana">
          <button type="button" class="btn-cancelar" data-respuesta="no">Cancelar</button>
          <button type="button" class="btn-confirmar" data-respuesta="si">Sí, las cociné</button>
        </div>
      </div>`;
    document.body.appendChild(ventana);
  }

  // 2. Lo que dice. Ej: "Faltan 700 g de Carne. ¿Las cocinaste igual?" y abajo "2 fideos: el stock de esos insumos queda en negativo."
  const ultimo = faltantes[faltantes.length - 1];
  const lista = faltantes.length === 1 ? ultimo : faltantes.slice(0, -1).join(', ') + ' y ' + ultimo;   // "a, b y c"
  ventana.querySelector('#faltanTitulo').textContent = 'Faltan ' + lista + '. ¿Las cocinaste igual?';
  ventana.querySelector('#faltanFrase').textContent = texto + ': si las cocinaste, se suman a la heladera y esos insumos quedan en negativo.';
  ventana.style.display = 'block';                                // se abre
  ventana.querySelector('[data-respuesta="no"]').focus();         // el foco en Cancelar (lo más seguro)

  // 3. La respuesta: un clic en un botón, afuera (= Cancelar) o Escape (= Cancelar). Después se cierra.
  return new Promise(resolver => {
    const responder = respuesta => {
      ventana.style.display = 'none';
      ventana.removeEventListener('click', alTocar);
      document.removeEventListener('keydown', alTeclear);
      resolver(respuesta);                                        // true = "Sí, las cociné"
    };
    const alTocar = evento => {
      const boton = evento.target.closest('[data-respuesta]');    // el botón tocado (o null)
      const tocoAfuera = evento.target === ventana;               // lo oscuro de atrás
      if (boton) responder(boton.dataset.respuesta === 'si');
      if (tocoAfuera) responder(false);
    };
    const alTeclear = evento => {
      if (evento.key === 'Escape') responder(false);
    };
    ventana.addEventListener('click', alTocar);
    document.addEventListener('keydown', alTeclear);
  });
}
