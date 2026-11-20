// ============================================================================
// personalizadoCombo.js — GUARDADO Y APAGADO (19/11): el "✎ Personalizar" (ej: "sin sal") de la ventana Armar combo.
//
// QUÉ ES: lo que hacía armarCombo.js para que el cliente pidiera un plato personalizado. Se sacó de armarCombo.js
// para dejar ese archivo solo con lo normal (elegir platos con "−" y "+"). El personalizado se va a agregar
// después, en otro lado. Mientras tanto la tienda NO ofrece personalizados.
//
// ESTÁ TODO COMENTADO Y ESTE ARCHIVO NO SE CARGA en index.html: no corre.
//
// DE DÓNDE SALIÓ CADA PEDAZO (líneas de armarCombo.js antes del 19/11) y qué hacía:
//   A. Las variables (líneas 8 y 11)          → platoPersonalizando y LARGO_MAXIMO_PERSONALIZADO (150 letras)
//   B. abrirVentanaCombo (línea 26)           → platoPersonalizando = null al abrir
//   C. renderizarVentanaCombo (líneas 73-100) → los renglones "⚠ sin sal" de cada plato, con su "−" y "+"
//   D. renderizarVentanaCombo (líneas 136-148)→ el casillero "Ej: sin sal" con Agregar / Cancelar, o el botón "✎ Personalizar"
//   E. renderizarVentanaCombo (líneas 168-171)→ dónde iban C y D adentro del renglón del plato (<div class="plato-personalizados">)
//   F. renderizarVentanaCombo (líneas 175-187)→ la nota "te llegan un día hábil más tarde" y el foco en el casillero
//   G. renderizarVentanaCombo (línea 119)     → el aviso "Sin stock · podés pedirlo personalizado" (hoy dice solo "Sin stock")
//   H. cambiarCantidad (líneas 218-244)       → el 3.er dato "texto": un renglón por plato Y por texto ("" = normal)
//   I. confirmarCombo (líneas 276-278)        → los personalizados van al carrito con personalizado: "sin sal"
//   J. agregarPersonalizado (líneas 291-303)  → revisa el texto y suma 1 personalizado
//   K. cerrarVentanaCombo (línea 320)         → platoPersonalizando = null al cerrar
//   L. BOTONES_DE_LA_VENTANA (líneas 326-330) → los 5 botones: abrir, cancelar, agregar, sumar y restar personalizado
//   M. cambiarPersonalizado (líneas 338-344)  → "−" y "+" de un renglón personalizado
//   N. Esc (líneas 377-381) y Enter (385-395) → Esc cierra el casillero; Enter agrega lo escrito
//
// LO QUE NO SE TOCÓ (sigue funcionando con los personalizados):
//   - El servidor (POST /api/pedidos-combos) los sigue aceptando: personalizado = texto, mismo precio, +1 día hábil.
//   - carritoCombos.js y pedidoCombos.js muestran los personalizados que haya en el carrito.
//   - abrirVentanaCombo sigue sin contar los personalizados del carrito para el tope (no salen de la heladera).
//   - El CSS de los personalizados (index.css: .renglon-personalizado, .personalizar-plato, .boton-enlace…) sigue ahí, sin usar.
// ============================================================================


/* ---------- A. Las variables (iban arriba de armarCombo.js) ----------

let platoPersonalizando = null;   // el plato con el casillero "personalizar" abierto (ej: 6), o null
const LARGO_MAXIMO_PERSONALIZADO = 150;

*/


/* ---------- B. En abrirVentanaCombo, al empezar ----------

  platoPersonalizando = null;

*/


/* ---------- C. En renderizarVentanaCombo: los renglones personalizados de cada plato ----------
   (iba en lugar del forEach de platosElegidos que hoy solo llena cantidadPorPlato)

  const apagadoSiCompleto = ATRIBUTO_APAGADO[!completo];

  const cantidadPorPlato = {};
  const personalizadosPorPlato = {};
  comboEnArmado.menu.forEach((plato) => {
    cantidadPorPlato[plato.id] = 0;
    personalizadosPorPlato[plato.id] = '';
  });
  let indicePersonalizado = 0;
  platosElegidos.forEach((renglon) => {
    if (renglon.texto === '') {
      cantidadPorPlato[renglon.idPlato] = renglon.cantidad;
    } else {
      personalizadosPorPlato[renglon.idPlato] = personalizadosPorPlato[renglon.idPlato] + `
          <div class="renglon-personalizado">
            <span class="renglon-personalizado-texto">⚠ ${escHtml(renglon.texto)}</span>
            <div class="selector-cantidad">
              <button type="button" class="boton-cantidad" data-accion="personalizado-restar" data-indice="${indicePersonalizado}"
                      aria-label="Sacar una personalizada">
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-menos"></use></svg>
              </button>
              <span class="numero-cantidad">${renglon.cantidad}</span>
              <button type="button" class="boton-cantidad boton-sumar" data-accion="personalizado-sumar" data-indice="${indicePersonalizado}"
                      aria-label="Sumar una personalizada" ${apagadoSiCompleto}>
                <svg class="icono" aria-hidden="true" focusable="false"><use href="#icono-mas"></use></svg>
              </button>
            </div>
          </div>`;
      indicePersonalizado = indicePersonalizado + 1;
    }
  });

*/


/* ---------- D. En renderizarVentanaCombo, adentro del forEach de cada plato: el casillero o el botón "✎ Personalizar" ----------

    const estaPersonalizando = platoPersonalizando === plato.id;

    const campoPersonalizar = `
          <div class="personalizar-plato">
            <input type="text" class="casillero" id="texto-personalizado"
                   maxlength="${LARGO_MAXIMO_PERSONALIZADO}" placeholder="Ej: sin sal, sin cebolla"
                   aria-label="Cómo querés ${nombre}">
            <button type="button" class="boton boton-principal" data-accion="personalizado-agregar"
                    data-id-plato="${idPlato}" ${apagadoSiCompleto}>Agregar</button>
            <button type="button" class="boton boton-secundario" data-accion="personalizado-cancelar">Cancelar</button>
          </div>`;
    const botonPersonalizar = `
          <button type="button" class="boton-enlace" data-accion="personalizado-abrir"
                  data-id-plato="${idPlato}" ${apagadoSiCompleto}>✎ Personalizar</button>`;
    const personalizar = { true: campoPersonalizar, false: botonPersonalizar }[estaPersonalizando];

*/


/* ---------- E. En renderizarVentanaCombo, al final del <li class="plato">, después del selector-cantidad ----------

        <div class="plato-personalizados">
          ${personalizadosPorPlato[plato.id]}
          ${personalizar}
        </div>

*/


/* ---------- F. En renderizarVentanaCombo, después del forEach de los platos ----------

  const hayPersonalizados = indicePersonalizado > 0;
  contenidoHTML += { true: `
      <li class="nota">
        Los platos personalizados se cocinan aparte: te llegan un día hábil más tarde
        (si pedís un martes, se cocina el miércoles y te llega desde el jueves).
      </li>`, false: '' }[hayPersonalizados];

  // …y después del listaPlatosCombo.innerHTML = contenidoHTML;
  const campoTexto = document.getElementById('texto-personalizado');
  if (campoTexto) {
    campoTexto.focus();
  }

*/


/* ---------- G. El aviso de "Sin stock" (en renderizarVentanaCombo, cuando tope === 0) ----------

      // Personalizado no sale de la heladera: se puede pedir igual
      avisoStock = '<p class="plato-quedan plato-sin-stock">Sin stock · podés pedirlo personalizado</p>';

*/


/* ---------- H. cambiarCantidad, como era (con el texto: "" = normal, "sin sal" = personalizado) ----------

function cambiarCantidad(idPlato, cambio, texto) {
  const plato = comboEnArmado.menu.find((p) => p.id === idPlato);
  let renglon = platosElegidos.find((r) => r.idPlato === idPlato && r.texto.toLowerCase() === texto.toLowerCase());
  const esNuevo = renglon === undefined;
  if (esNuevo) {
    renglon = { idPlato: idPlato, nombre: plato?.nombre, texto: texto, cantidad: 0 };
  }

  const nuevaCantidad = renglon.cantidad + cambio;
  const noEstaEnElMenu = plato === undefined;
  const quedariaNegativo = nuevaCantidad < 0;
  const pasaElTope = texto === '' && nuevaCantidad > topePorPlato[idPlato];   // los personalizados no tienen tope
  const pasaElCombo = totalElegido + cambio > comboEnArmado.cantidad;
  const noSePuede = noEstaEnElMenu || quedariaNegativo || pasaElTope || pasaElCombo;
  if (noSePuede) {
    return false;
  }

  if (esNuevo) {
    platosElegidos.push(renglon);
  }
  renglon.cantidad = nuevaCantidad;
  totalElegido = totalElegido + cambio;
  platosElegidos = platosElegidos.filter((r) => r.cantidad > 0);
  return true;
}

*/


/* ---------- I. En confirmarCombo, después del forEach de los platos normales ----------

  platosElegidos.filter((r) => r.texto !== '').forEach((renglon) => {
    platos.push({ producto_id: renglon.idPlato, nombre: renglon.nombre, cantidad: renglon.cantidad, personalizado: renglon.texto });
  });

*/


/* ---------- J. agregarPersonalizado ----------

function agregarPersonalizado(idPlato, textoEscrito) {
  const textoLimpio = String(textoEscrito).trim();
  const textoNoSirve = textoLimpio === '' || textoLimpio.length > LARGO_MAXIMO_PERSONALIZADO;
  if (textoNoSirve) {
    document.getElementById('texto-personalizado').focus();
    return false;
  }
  const seAgrego = cambiarCantidad(idPlato, 1, textoLimpio);
  if (seAgrego) {
    platoPersonalizando = null;
  }
  return seAgrego;
}

*/


/* ---------- K. En cerrarVentanaCombo, al final ----------

  platoPersonalizando = null;

*/


/* ---------- L. Los 5 botones de BOTONES_DE_LA_VENTANA ----------

  'personalizado-abrir':    (boton) => { platoPersonalizando = Number(boton.dataset.idPlato); return true; },
  'personalizado-cancelar': () => { platoPersonalizando = null; return true; },
  'personalizado-agregar':  (boton) => agregarPersonalizado(Number(boton.dataset.idPlato), document.getElementById('texto-personalizado').value),
  'personalizado-sumar':    (boton) => cambiarPersonalizado(Number(boton.dataset.indice), 1),
  'personalizado-restar':   (boton) => cambiarPersonalizado(Number(boton.dataset.indice), -1),

*/


/* ---------- M. cambiarPersonalizado ----------

function cambiarPersonalizado(indice, cambio) {
  const renglon = platosElegidos.filter((r) => r.texto !== '')[indice];
  if (renglon === undefined) {
    return false;
  }
  return cambiarCantidad(renglon.idPlato, cambio, renglon.texto);
}

*/


/* ---------- N. Esc y Enter (en el DOMContentLoaded de armarCombo.js) ----------

  // Esc: si el casillero estaba abierto, lo cierra (en vez de cerrar la ventana)
  ventanaCombo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    if (platoPersonalizando !== null) {
      platoPersonalizando = null;
      renderizarVentanaCombo();
      return;
    }
    cerrarVentanaCombo(false);
  });

  // Enter en el casillero: agrega lo escrito
  ventanaCombo.addEventListener('keydown', (evento) => {
    const esEnterEnElCampo = evento.key === 'Enter' && evento.target.id === 'texto-personalizado';
    if (!esEnterEnElCampo) {
      return;
    }
    evento.preventDefault();
    const seAgrego = agregarPersonalizado(platoPersonalizando, evento.target.value);
    if (seAgrego) {
      renderizarVentanaCombo();
    }
  });

*/
