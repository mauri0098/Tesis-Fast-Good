# 🔴 MODO POTENTE (Opus, Max) — Index: dejarlo IGUAL al diseño final (v5)

Te paso la carpeta `diseno-final-index/`. El index tiene que quedar **igualito** a ese diseño, con las animaciones.

**ES SOLO VISUAL** (lo dice CLAUDE.md, "Cambios de pantalla: SOLO lo visual"):
- No cambies cómo funciona nada.
- No renombres ids, clases que use el JS, funciones ni variables.
- No toques los campos del formulario ni del checkout.
- No toques los datos que vienen del servidor (categorías, combos, precios, platos, preguntas).
- Nada de SQL. No hagas commit.

## Qué hay en la carpeta
| Archivo | Para qué |
|---|---|
| `referencia.html` | La página como tiene que quedar. Abrila en el navegador para compararla. |
| `referencia-armar-combo.html` | Cómo se ven los platos dentro de "Armar combo". |
| `ref-compu.png`, `ref-celu.png`, `armar-compu.png`, `armar-celu.png` | Capturas a 1440px y a 390px. En las capturas la letra puede verse distinta porque no cargó Figtree: la letra correcta es Figtree. |
| `index-final.css` | CSS FINAL: copiarlo tal cual, sin cambiar nada. |
| `animaciones-index.js` | JS de las animaciones: copiarlo tal cual. Solo agrega clases (`js`, `visible`, `salta`) y no toca datos ni funciones. |
| `estilos.css` | El CSS v5 de referencia. NO lo copies encima del del repo: es solo para comparar. |

## Paso 0 — PLAN (no toques nada todavía)
1. Leé:
   - `frontend/index.html`;
   - `frontend/src/css/index-combos.css` y el CSS v5 que use el index;
   - `combosCatalogo.js`, `armarCombo.js`, `carritoCombos.js`, `pedidoCombos.js`.
2. Compará el CSS v5 del repo con `estilos.css` de la carpeta. Si hay diferencias, listalas.
3. Compará el HTML que genera el index (el fijo y el que arma el JS) con `referencia.html`.
4. Pasame una tabla: **qué cambia | archivo | línea aprox. | toca JS (sí/no)**.
5. **Esperá mi OK.**

## Paso 1 — CSS y letra
- Copiá `index-final.css` a `frontend/src/css/index-final.css`.
- Linkealo en `index.html` como el **último** CSS.
- En el `<head>` tiene que estar Figtree:
  `<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`
  Si ya está, no lo dupliques.

## Paso 2 — Estructura y títulos (igual a referencia.html)
- Las secciones van en este orden:
  1. Encabezado;
  2. Portada (con la franja de 3 pasos);
  3. **Categorías**, con la clase `seccion--tinte`;
  4. **Dónde estamos**;
  5. **Preguntas frecuentes**, con `seccion--tinte`;
  6. Pie;
  7. el botón flotante de WhatsApp.
- Sin "Ofertas".
- Debajo de las categorías van:
  - un `h3` que dice **"Combos {nombre de la categoría elegida}"** y se actualiza al tocar otra categoría;
  - abajo, el texto **"Elegís la cantidad y después armás tus platos. Podés repetir."**
- Los textos de los títulos son los de la referencia: "Categorías", "Dónde <span class="clave">estamos</span>" y "Preguntas <span class="clave">frecuentes</span>".
- Las preguntas, los datos de contacto y todo lo que hoy sale del sistema se quedan como están. Solo cambia cómo se ven.

## Paso 3 — Tarjeta de combo (en la función que dibuja las tarjetas)
Cambiá **solo el HTML del template**. Dejá los mismos `data-*`, eventos y datos que ya tiene.
Cada tarjeta tiene que quedar así:
```html
<button class="combo [combo--destacado] revelar" type="button" style="--d: {índice * 0.08}s" ...lo que ya tiene...>
  <span class="combo__info">
    <!-- solo en el destacado: -->
    <span class="combo__sello">Más elegido</span>
    <span class="combo__nombre">{cantidad} viandas {categoría}</span>
    <span class="combo__precio">{precio}</span>
    <span class="combo__unidad">{precio por vianda} por vianda</span>
    <span class="combo__cta" aria-hidden="true">Armar combo<svg class="icono"><use href="#icono-der"></use></svg></span>
  </span>
  <span class="combo__media">{la foto que ya usa}</span>
</button>
```
- Todas las tarjetas tienen que estar dentro de `<div class="combos">`. El CSS ya hace que haya 3 por fila y que se achiquen solas si hay más.
- Si hoy el botón dice "Seguir armando" (un combo a medio armar), dejá ese texto dentro de `combo__cta`.
- **"Más elegido":** si el sistema NO tiene un dato para saber cuál es el más elegido, no marques ninguno y avisame. No inventes un dato ni pongas uno fijo.

## Paso 3b — Fotos de los combos
Voy a poner 2 fotos en la carpeta de imágenes del front: **combo mantenimiento** y **combo saludable**. Fijate cómo se llaman exactamente y qué extensión tienen. **No las renombres.**
- Buscá en qué carpeta guardo las imágenes.
- Las tarjetas de la categoría **Mantenimiento** usan la foto **combo mantenimiento**.
- Las tarjetas de la categoría cuyo nombre tenga **"saludable"** usan la foto **combo saludable**.
- El resto de las categorías siguen con la foto que tienen hoy, o con el recuadro "foto del combo" si no tienen.
- La foto va dentro de `<span class="combo__media">`, como `<img src="…" alt="Combo {categoría}" loading="lazy">`. El CSS ya la recorta en 16/10.
- Si las fotos todavía no están en la carpeta, avisame y no sigas con este paso.
- En el plan del Paso 0 decime qué categoría va a usar cada foto.

## Paso 4 — Platos dentro de "Armar combo"
- Cada plato tiene que ser: `li.plato` › foto, `div.plato__info` (con `h3` nombre + `p` descripción) y `.cantidad` (− número +), en ese orden.
- Si ya es así, no toques el JS: el CSS lo acomoda solo. En compu queda nombre y descripción centrados entre la foto y el +/−; en celu el +/− va abajo de la descripción.
- Si el orden es otro, cambiá solo el template.

## Paso 5 — Animaciones
- Copiá `animaciones-index.js` a `frontend/src/js/animaciones-index.js` y cargalo al final de `index.html`, después de los otros scripts.
- Agregá la clase `revelar` (y `style="--d: …"` donde se indica) a:
  - el `h2` Categorías;
  - `.categorias` (`--d: .05s`);
  - el `h3` "Combos …";
  - el `p` de abajo (`--d: .05s`);
  - cada tarjeta de combo (`--d` según el índice, ver el Paso 3);
  - el `h2` Dónde estamos;
  - `.donde` (`--d: .08s`);
  - el `h2` Preguntas;
  - `.preguntas` (`--d: .08s`).
- Lo que ya hace el CSS solo: la portada entra al cargar, el botón se achica al apretar y el + de las preguntas gira.
- El contador de "Mi pedido" salta solo cuando cambia el número; lo maneja `animaciones-index.js`.
- Verificá que "Armar combo" y "Finalizar pedido" sean `<dialog class="hoja">` y que "Mi pedido" sea `<dialog class="hoja hoja--pedido">`. Así suben o entran deslizando con `estilos.css`. Si no lo son, avisame antes de cambiar nada.

## Paso 6 — Verificar y reportar
1. Abrí el index a **1440px** y a **390px** y comparalo con las capturas. Tiene que ser igual.
2. A 390px no puede haber scroll de costado.
3. Las secciones tienen que aparecer al bajar, y también las tarjetas cuando cambiás de categoría.
4. Con `prefers-reduced-motion: reduce` no se mueve nada y se ve todo.
5. La consola tiene que estar sin errores.
6. Corré `node tests/test_e2e.js heladera`: tiene que dar **40/40**.
7. Hacé un pedido de prueba completo, desde elegir combo hasta confirmar. Nombralo "PRUEBA – NO PREPARAR" y anulalo después.
8. Reportame en una tabla: **qué hiciste | archivo | resultado**. Agregá la lista de todo lo que NO pudiste dejar igual y por qué.
