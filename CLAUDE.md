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
-- Respetá mis funciones y mi estilo. Cambiá lo mínimo posible. Si algo hay que reescribir, preguntame antes.
- Nada de trucos difíciles de leer. Prefiero más líneas claras que pocas líneas complicadas.

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
- Las viandas salen de la HELADERA (productos.stock_heladera) y se descuentan AL CREAR el pedido. No se descuentan insumos.
- Personalizado (ej: "sin sal"): se escribe en la web, mismo precio, NO sale de la heladera, va a cocina, +1 día hábil.
- Cancelar un pedido devuelve las viandas a la heladera.
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