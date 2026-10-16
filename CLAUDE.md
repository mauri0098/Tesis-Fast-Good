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
  Si son más de 6-8, explicame por qué.
- Comentarios en español en cada parte.
- Respetá mis funciones y mi estilo. Cambiá lo mínimo posible. Si algo hay que reescribir, preguntame antes.
- Nada de trucos difíciles de leer. Prefiero más líneas claras que pocas líneas complicadas.

## Estilo: código profesional y simple (sin if anidados)
- NUNCA un if adentro de otro if. Máximo un nivel.
- Valores por defecto con ||: const direccion = pedido.cliente_direccion || '-';  (nada de let + if)
- switch ("según sea") cuando se compara una misma variable contra varios valores. Cada case con su comentario "según sea…" y su break.
- Tablas (objetos) en vez de if / else if para elegir un texto, un color o un valor. Ej: MENSAJE_VACIO[modo], COLORES_ESTADO[estado].
- Salir temprano: los "no" arriba con return (if (!pedido) return;) y lo importante abajo, sin else.
- Ternario simple, de un solo nivel, solo FUERA del HTML, para elegir entre dos valores: const texto = pedido.pagado ? 'PAGADO' : 'PENDIENTE';  Nunca un ternario adentro de otro, ni adentro de un template.
- Si una condición mezcla varias cosas, primero se guarda en una variable con nombre claro (const faltaEfectivo = a && !b;) y después un solo if.
- Código básico que se entienda leyéndolo una vez: nombres en español, comentario en cada línea, ENTRADA / SALIDA y un ejemplo arriba de cada función. Profesional no quiere decir complicado.

## Cómo recorrer listas y armar HTML (para que yo lo entienda)
- Para recorrer listas usá forEach (es el que mejor entiendo). No uses for...of ni for con contador.
  Adentro del forEach, "return" = saltear ese y seguir con el siguiente: poné un comentario que lo diga.
- Para buscar UN solo elemento en una lista usá find. Para filtrar varios, filter.
- Nada de forEach adentro de otro forEach si se puede evitar. Si hay que cruzar dos listas,
  primero armá un objeto { id: valor } con una de ellas y después recorré la otra.
- Nada de "? :" adentro de los template strings (`...`). Calculá eso antes en una variable (ver "Estilo" arriba).
  Ej: const claseElegido = cantidad > 0 ? ' plato--elegido' : '';
- Cuando uses algo que no sea básico (flatMap, some, reduce, etc.), poné un comentario con un ejemplo
  de qué entra y qué sale.

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
- Al terminar: node tests/test_e2e.js heladera tiene que dar 40/40, y me pasás el recorrido a mano (celu y compu).

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
- Las cosas se DESACTIVAN, no se borran.

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
