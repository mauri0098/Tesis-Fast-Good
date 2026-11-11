# Prompt: un módulo del servidor a mi forma (4 pasos)

Sirve para dos cosas:
- **Reescribir** un módulo que ya existe → usalo tal cual.
- **Revisar** uno que escribí yo → cambiá "quede escrito" por "revisá si está escrito", y que me diga qué función
  no respeta los 4 pasos, sin tocar nada.

```
Quiero que el módulo <NOMBRE> (backend/modulos/<nombre>/) quede escrito A MI FORMA.
Mi forma está en docs/modelos/modelo-mvc.js: abrilo y copiá esa forma exacta.

Las reglas:
1. RUTAS: solo la dirección entera + requireAuth/requireRol + la función del controlador. Nada más.
2. MODELO: una función por consulta, con nombre terminado en BD. Solo supabase.from / supabase.rpc.
   Devuelve { data, error } tal cual. No conoce req ni res. Es como mi "traer" del front: va a buscar y devuelve.
3. CONTROLADOR: cada función SIEMPRE con estos 4 pasos, numerados y con este título en el comentario:
     // 1. LEER      → req.params, req.body, req.usuario (el usuario NUNCA del body)
     // 2. REVISAR   → cada control en una variable con nombre (const idInvalido = …), su if con
     //                comentario "¿…? SÍ: ejemplo · NO: ejemplo", y corta con return res.status(400)…
     // 3. PEDIR     → const { data, error } = await modelo.<algo>BD(…)
     // 4. RESPONDER → if (error) errorInterno · if (!data) 404 · res.json(…)
   Si un paso no hace nada, igual va el comentario ("// 1. LEER: nada").
   Si la función pide dos cosas al modelo, se repiten los pasos 3 y 4 (3a, 4a, 3b, 4b), nunca mezclados.
   Si hay que acomodar los datos antes de responder (agrupar, contar), va como paso aparte:
     // 4. ARMAR → un forEach que arma el arreglo nuevo · // 5. RESPONDER
4. Arriba de cada función: qué ruta atiende, ENTRADA, SALIDA con todos los códigos posibles y un Ej.
5. Las reglas de estilo del CLAUDE.md valen todas (sin if adentro de if, sin reduce, sin ??, forEach, etc.).

LA REGLA DE ORO: cada ruta responde EXACTAMENTE lo mismo que hoy (mismos códigos, mismos mensajes, mismo JSON).
Solo cambia cómo está escrito.

PRIMERO EL PLAN, no toques nada. Frená para mi OK con:
a) Una tabla: cada ruta → función del controlador → funciones del modelo que usa.
b) De cada función del controlador, sus 4 pasos en una línea cada uno (qué lee, qué revisa, qué pide, qué responde).
c) Lo que hoy NO entra en los 4 pasos, y cómo lo resolverías. Preguntame antes de decidir.
d) Cómo probás que quedó igual: la respuesta de cada ruta antes y después, y su 401/403.
Pruebas: solo lo de este módulo, sin el test de la heladera. NUNCA commit ni push.
```
