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

## Refactor de JavaScript (pantalla por pantalla)
Cuando te diga "refactorizá este JS" (ej: generar receta), es ORDENARLO para que yo lo entienda, sin cambiar lo que hace.
- SOLO cuando yo te lo pido, y de a UN archivo del front (frontend/pantallas/ o frontend/compartido/). No refactorices JS por tu cuenta
  mientras hacemos otra cosa (ni durante el MVC). Primero se termina el MVC del servidor, después los JS que yo elija.
- POCAS FUNCIONES GRANDES, una por cada trabajo de la pantalla. Mejor 3 funciones que se entienden que 6 cortitas.
  La forma de casi toda pantalla:
    · cargar<Algo>     → pide los datos al servidor (fetch) y los guarda          Ej: cargarReceta
    · renderizar<Algo> → dibuja la pantalla con esos datos (innerHTML + escHtml)  Ej: renderizarReceta
    · guardar<Algo>    → junta lo que cargó el usuario, lo manda y vuelve a cargar Ej: guardarReceta
  Más los escuchadores (addEventListener) abajo de todo, en una sección "LOS BOTONES".
  Si la pantalla necesita más de 5 funciones, PREGUNTAME antes, mostrándome la lista.
- Una función grande se lee por PARTES NUMERADAS, cada una con su comentario: // 1. Lo que se pide · // 2. Se dibuja…
  Así es grande pero se lee de arriba a abajo, como compras.js.
- Si un pedazo se usa en varias pantallas, va a un archivo compartido (como stockCompartido.js). Preguntame antes.
- Lo que se borra: funciones de 3 líneas que se usan una sola vez (van adentro de la que las usa), código repetido,
  código muerto. Lo que NO se toca: ids, clases, rutas, lo que se manda al servidor y lo que se ve.
- ANTES de tocar: el PLAN con la lista de funciones de HOY → la lista NUEVA (qué se junta con qué y por qué), y FRENÁ.
- DESPUÉS: las mismas pruebas que antes tienen que dar lo mismo, y el recorrido a mano de esa pantalla.
- Todas las reglas de "Estilo" de arriba siguen valiendo (sin if adentro de if, sin trucos, comentario SÍ/NO en cada if).

## MVC del servidor (rama mvc_fastgood)
server.js se parte por MÓDULO, con la forma de mi proyecto viejo. La carpeta del servidor se llama backend/
(server.js se queda en la raíz):
  backend/config/            → la conexión a Supabase (se crea una sola vez)
  backend/middlewares/       → requireAuth, requireRol
  backend/utils/             → lo que usan varios módulos y NO habla con la base (errorInterno, leerPeriodo, leerFechaPara…).
                               Lo compartido que sí consulta la base va en el modelo de su módulo
                               (ej: traerTodasLasFilas en modelo.movimientos.js; compras la pide de ahí).
  backend/modulos/<modulo>/  → rutas.<modulo>.js, controlador.<modulo>.js, modelo.<modulo>.js
- rutas: SOLO dirección + requireAuth/requireRol/validaciones + qué controlador llama. Sin lógica.
  Las direcciones van ENTERAS, igual que hoy en server.js: router.get('/api/insumos', ...), router.put('/api/planes/:id/activo', ...).
  server.js las monta SIN prefijo: app.use(rutasStock). Así el frontend y el test no se enteran del cambio,
  y si buscás una dirección (ej: '/api/pedidos/:id/anular') la encontrás escrita tal cual.
  Las rutas fijas ('/api/ordenes-produccion/pendientes') van ANTES que las de parámetro ('/api/ordenes-produccion/:id').
- controlador: lee req, valida, llama al modelo y decide qué responder (200, 201, 400, 404, 409, 500). No toca Supabase.
- modelo: SOLO consultas a Supabase (supabase.from / supabase.rpc). No conoce req ni res. Devuelve { data, error }.
- server.js al final: arrancar Express, archivos estáticos y los app.use de cada módulo. Nada más.
- Mover NO es cambiar: cada ruta tiene que responder EXACTAMENTE lo mismo que antes. Primero se copia, se prueba, y después
  se borra de server.js. Un módulo por vez, con las pruebas antes y después.
- Seguir con require o import, el que ya use server.js. No mezclar.
- La carpeta frontend/ no se toca en el MVC.

### Quién hace qué en el MVC
- Claude hace SOLO la base común: backend/config/, backend/middlewares/ y backend/utils/ (con plan antes y freno).
- Los MÓDULOS (backend/modulos/: rutas, controlador y modelo) los escribo YO a mano, todos.
  Claude NO escribe ni corrige código en backend/modulos/.
- Para cada módulo, ANTES de que yo lo haga, Claude me da una GUÍA (sin escribirme el código):
  · cada ruta de server.js con su número de línea, y qué parte va a rutas, cuál a controlador y cuál a modelo;
  · los require que van arriba de cada uno de los 3 archivos.
- DESPUÉS de que yo lo paso, Claude lo REVISA y me dice qué está mal, sin arreglarlo:
  · que cada ruta responda igual que antes y que no falte ningún requireAuth / requireRol / límite;
  · corre node tests/test_e2e.js heladera (61/61) y cuenta las rutas (76 con requireAuth y 13 públicas,
    sumando server.js y backend/modulos/*/rutas.*.js).
  Si algo falla, me dice qué y dónde, y yo lo arreglo.

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
- NUNCA trabajes en la rama Rodriguez (es producción). Trabajás en la rama que yo tenga abierta:
  mejoras-fastgood (arreglos de lo que reporta mi prima) o mvc_fastgood (el refactor). Si no sabés cuál, preguntame.
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
  Le aparece al cocinero el día hábil ANTERIOR a la entrega (entrega lunes → se cocina el viernes).
  Sus insumos se descuentan cuando el cocinero toca "✓ Cocinado" y el pedido pasa a 6 (Por armar). Una sola vez por pedido.
- Anular un pedido en estado 1, 2, 3 o 6 devuelve las viandas a la heladera. Un pedido anulado (5) no cambia más de estado.
- Los estados, en orden: 1 Registrado → 2 En Preparación → 6 Por armar → 3 Listo para entregar → 4 Entregado (5 Cancelado).
  · Todo pedido pasa por En Preparación y por Por armar. SIEMPRE pasa por el Armado.
  · Todo de heladera: al confirmarlo pasa solo a 6. Con personalizados: queda en 2 hasta "✓ Cocinado".
  · "Listo para entregar" lo pone SOLO el Armado (OK en Armado de pedidos). El cocinero nunca.
  · Entregado solo desde Listo. Para atrás, solo Entregado → Listo. Envíos del Día muestra 3 y 4.
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