# Reglas para trabajar en Fast Good (seguirlas al pie de la letra)

## Cómo trabajamos
- Trabajamos DE A UN PASO CHICO. Hacé un solo paso y FRENÁ. No sigas al siguiente hasta que yo diga "seguí".
- Antes de escribir código, mostrame el PLAN del paso: qué archivos vas a tocar y qué funciones vas a crear o cambiar.
- Después de cada paso, explicame CADA función que creaste o cambiaste:
  1. Qué hace, en una frase simple.
  2. ENTRADA (qué recibe) y SALIDA (qué devuelve o qué cambia).
  3. Por qué la hiciste así.
  4. Cómo se conecta con el resto (quién la llama y a quién llama).
- Explicá en español simple, para alguien que está aprendiendo. Nada de palabras raras sin explicar.

## Cómo escribir el código
- Funciones SIMPLES y claras, con nombres en español que digan lo que hacen.
- Pocas funciones, cada una con un trabajo claro (ej: renderizarCarrito, agregarAlCarrito, guardarCarrito).
  Nada de partir todo en funcioncitas de 3 líneas. Si una función se usa una sola vez y es corta, va adentro de la otra.
- Cada archivo JS arranca con un comentario que lista sus funciones y qué hace cada una.
- ANTES de escribir un archivo nuevo, mostrame la lista de funciones que va a tener (nombre + una línea).
- Pocas funciones, grandes pero claras. NO crear funciones chiquitas de ayuda (ej: precioMasBajo, textoPlural):
  ese cálculo va escrito adentro de la función que lo usa. Si creés que hace falta una función nueva, PREGUNTAME antes.
- Comentarios en español en cada parte.
- Respetá mis funciones y mi estilo. Cambiá lo mínimo posible. Si algo hay que reescribir, preguntame antes.
- Nada de trucos difíciles de leer. Prefiero más líneas claras que pocas líneas complicadas.

## Estilo: buenas prácticas, pero que yo lo lea al ojo
- Buenas prácticas SIEMPRE (seguro, rápido, sin código repetido, una sola pasada por la lista cuando se pueda),
  pero escrito con lo que yo sé leer.
- LO QUE SE PUEDE USAR: if / else con llaves, forEach, map, filter, find, return temprano,
  booleanos con nombre (const tieneCategoria = ...), tablas (objetos) para elegir un valor (COLORES_ESTADO[estado]).
- NUNCA un if adentro de otro if. Máximo un nivel.
- Si varias cosas dependen de la MISMA pregunta, UN solo if / else que las resuelve todas juntas.
  Ej: let textoBoton = 'Ver combos'; let atributoId = 'data-id-plan';
      if (tieneCategoria) { textoBoton = 'Ver planes'; atributoId = 'data-id-categoria'; }
- Pocos if por función (2 o 3). Si quedan MUCHOS if, NO decidas vos: PREGUNTAME si prefiero
  un ternario (? :) o un switch, mostrándome cómo quedaría cada opción. Sin mi OK, ni ternario ni switch.
- Si te doy el OK al switch: cada case con su comentario "según sea…" y su break.
  Si te doy el OK al ternario: de un solo nivel, nunca uno adentro de otro, nunca adentro de un template (`...`).
- Salir temprano: los "no" arriba con return, siempre con llaves: if (!pedido) { return; }
- Si una condición mezcla varias cosas, primero se guarda en una variable con nombre claro
  (const faltaEfectivo = a && !b;) y después el if.
- PROHIBIDO (difícil de leer): Math.min(...lista) y Math.max(...lista), new Set, flatMap, some, reduce,
  ?. , ?? , || para valores por defecto, classList.toggle con condición, if de una sola línea sin llaves.
  En su lugar: un forEach con una variable que se va guardando (let masBajo = ...; if (precio < masBajo) { masBajo = precio; }),
  if / else con llaves, classList.add / classList.remove.
- .sort se puede usar, con un comentario en palabras y un ejemplo
  (ej: Mantenimiento 2 − Viandas 3 = −1 → negativo → Mantenimiento va primero).
- Comentario en cada if: qué pregunta, un ejemplo SÍ y uno NO. Ej: if (num > 100) // ¿es mayor a 100? SÍ: 122 · NO: 80
- Código básico que se entienda leyéndolo una vez: nombres en español, ENTRADA / SALIDA y un ejemplo arriba de cada función.
  Profesional no quiere decir complicado.

## Cómo recorrer listas y armar HTML (para que yo lo entienda)
- Para recorrer listas usá forEach (es el que mejor entiendo). No uses for...of ni for con contador.
  Adentro del forEach, "return" = saltear ese y seguir con el siguiente: poné un comentario que lo diga.
- Para buscar UN solo elemento en una lista usá find. Para filtrar varios, filter.
- Nada de forEach adentro de otro forEach si se puede evitar. Si hay que cruzar dos listas,
  primero armá un objeto { id: valor } con una de ellas y después recorré la otra.
- Nada calculado adentro de los template strings (`...`): se calcula antes, en una variable, con if / else.
  Ej: let claseElegido = ''; if (cantidad > 0) { claseElegido = ' plato--elegido'; }

## Cambios de pantalla: SOLO lo visual
- En un cambio de pantalla se toca SOLO: el HTML, el CSS y las animaciones. Si un JS arma HTML (innerHTML),
  se cambia SOLO el HTML que arma, nada más.
- NUNCA cambia el funcionamiento: ni datos, ni rutas, ni validaciones, ni lo que se manda al servidor,
  ni server.js, ni sql/.
- NO se renombra nada que ya exista: ni funciones, ni variables, ni ids, ni clases que use el JS.
  Si el JS busca 'pedidosBody', el HTML sigue teniendo id="pedidosBody".
- Lo NUEVO (clases o ids que agregues para el diseño) va en español y diciendo qué es
  (ej: "tarjeta-combo", no "oferta"; "boton-anular", no "btn-x").
- CSS siempre en su archivo .css: nada de <style> en el HTML ni style="" sueltos.
- Si para el diseño hace falta cambiar algo del JS o un nombre, PREGUNTAME antes.
- Al terminar: node tests/test_e2e.js heladera tiene que dar 61/61, y me pasás el recorrido a mano (celu y compu).
- En los cambios de DISEÑO (pantallas nuevas): NO actualizar docs/INFORME-CAMBIOS-HELADERA.md ni docs/HELADERA-AVANCE.md,
  y no sacar capturas salvo que las pida. Al terminar, solo un resumen corto en el chat: qué archivos tocaste,
  las funciones nuevas con ENTRADA/SALIDA en una línea cada una, el test y el recorrido a mano.

## Seguridad y cuidado
- NUNCA hagas commit ni push. Los hago yo.
- NUNCA trabajes en la rama Rodriguez (es producción). Siempre en mejoras-fastgood.
- La base de datos es la REAL (la usa mi prima). No ejecutes nada en la base.
  Si hace falta SQL, escribilo en un archivo dentro de sql/, con comentarios en cada línea, y yo lo corro.
- En la base solo se AGREGA (tablas o columnas nuevas). No borres ni renombres nada sin preguntarme.
- No toques el .env ni muestres claves.

## Decisiones del negocio (combos)
- Se vende solo por COMBOS (ej: "Keto x10"). Cada combo es de UN plan y tiene cantidad y precio.
- El menú de cada combo está en combo_productos. Un plato puede estar en muchos combos, de cualquier plan.
- El cliente elige platos del menú, repitiendo, hasta llegar justo a la cantidad del combo.
- Un pedido puede tener varios combos (pedido_combos). Los platos elegidos van en pedido_detalles con id_pedido_combo.
- Las viandas salen de la HELADERA (productos.stock_heladera) y se descuentan AL CREAR el pedido. Esas no descuentan insumos
  (ya los gastaron cuando la cocina tocó "Hecho").
- Personalizado (ej: "sin sal"): se escribe en la web, mismo precio, NO sale de la heladera, va a cocina, +1 día hábil.
  Sus insumos se descuentan cuando el pedido pasa a 3 (Listo para entregar).
- Anular un pedido en estado 1, 2 o 3 devuelve las viandas a la heladera. Un pedido anulado (5) no cambia más de estado.
- Las cosas se DESACTIVAN, no se borran

## Seguridad (siempre, aunque el código sea simple)
- NUNCA confiar en lo que manda el navegador. El servidor revisa todo de nuevo:
  precios, totales, cantidades, que el plato exista y esté activo, que el combo sume justo.
- Los PRECIOS y TOTALES los calcula SIEMPRE el servidor, desde la base. Nunca los que manda la pantalla.
- El USUARIO sale del token del login (req.usuario), nunca del body.
- Toda ruta del panel lleva requireAuth + requireRol con los roles que corresponden.
  Las rutas públicas (web del cliente) llevan límite de pedidos por IP.
- Validar cada dato que entra: tipo, que no esté vacío, largo máximo, números enteros y mayores a 0.
  Si algo está mal, responder 400 con un mensaje claro.
- Nunca armar SQL pegando texto. Usar las funciones de supabase (.eq, .in, .rpc) o parámetros.
- Lo que guarda en varias tablas a la vez va en una FUNCIÓN DE LA BASE (todo o nada), con
  "revoke ... from public, anon, authenticated" y "grant ... to service_role".
- Las tablas nuevas siempre con RLS activado.
- En el navegador: todo texto que venga de la base pasa por escHtml antes de ir al innerHTML.
- No mostrar errores internos al usuario (ni detalles de la base). Mensaje simple y el detalle en el log.
- Nunca poner claves ni datos sensibles en el frontend.
- En la explicación de cada paso, decime también QUÉ protege cada control de seguridad y de qué ataque.
