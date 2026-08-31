// ===================================================
// INDEX.JS — SPA Catálogo · Single Fetch Edition
// Fast Good — Performance & Motion Design
//
// Estrategia: UNA sola consulta profunda al iniciar
// carga todo el árbol categorias→planes→productos en
// memoria. Cada interacción del acordeón es O(1) y
// no genera ninguna request adicional al servidor.
// ===================================================

(function () {
    'use strict';

    const IMG_DEFAULT = './src/assets/img/logo.webp';

    // ── Estado central ────────────────────────────────
    let catalogoData  = [];   // árbol completo en memoria
    let categoriasMap = {};   // nombre → objeto categoría (lookup O(1))

    // Plan activo en el acordeón
    let planActivoBtn   = null;
    let planActivoPanel = null;

    // ── Single Fetch ──────────────────────────────────
    async function fetchCatalogo() {
        try {
            const r = await fetch('/api/v1/catalogo');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (err) {
            console.error('[FastGood] Error cargando catálogo:', err);
            return [];
        }
    }

    // ── Render de precio con descuento ────────────────
    function renderPrecio(precio, descuento) {
        if (precio == null) return '';

        if (descuento && descuento > 0) {
            const precioFinal = Math.round(precio * (1 - descuento / 100));
            return `
                <div class="plato-card__precio">
                    <span class="precio-original">$ ${precio}</span>
                    <span class="precio-final">$ ${precioFinal}</span>
                    <span class="descuento-badge">−${descuento}%</span>
                </div>`;
        }

        return `<div class="plato-card__precio">$ ${precio}</div>`;
    }

    // ── Precio efectivo para el carrito ───────────────
    function precioEfectivo(precio, descuento) {
        if (!precio) return 0;
        if (descuento && descuento > 0) return Math.round(precio * (1 - descuento / 100));
        return precio;
    }

    // ── Render de tarjeta de producto ─────────────────
    function buildPlatoHTML(p, index) {
        const img   = p.imagen || IMG_DEFAULT;
        const delay = index * 60;
        return `
            <article class="plato-card" data-id="${p.id}" style="animation-delay:${delay}ms">
                <div class="plato-card__img">
                    <img src="${img}" alt="${p.nombre}" loading="lazy"
                         onerror="this.src='${IMG_DEFAULT}'" />
                </div>
                <div class="plato-card__body">
                    <h3 class="plato-card__nombre">${p.nombre}</h3>
                    <p  class="plato-card__desc">${p.descripcion || ''}</p>
                    ${renderPrecio(p.precio, p.descuento)}
                </div>
                <div class="plato-card__footer">
                    <div class="plato-counter">
                        <button class="plato-counter__btn" data-btn-menos data-id="${p.id}">−</button>
                        <span   class="plato-counter__qty"  data-id="${p.id}">1</span>
                        <button class="plato-counter__btn" data-btn-mas  data-id="${p.id}">+</button>
                    </div>
                    <button class="plato-add-btn" data-btn-carro data-id="${p.id}">
                        Agregar al carrito
                    </button>
                </div>
            </article>`;
    }

    function renderProductos(contentEl, productos) {
        if (!productos.length) {
            contentEl.innerHTML = '<p class="panel-vacio">No hay productos disponibles en este plan.</p>';
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'productos-catalogo';
        grid.innerHTML = productos.map((p, i) => buildPlatoHTML(p, i)).join('');
        contentEl.innerHTML = '';
        contentEl.appendChild(grid);
    }

    // ── Delegación de eventos — productos viene de memoria
    function attachPanelEvents(contentEl, productos) {
        contentEl.addEventListener('click', e => {
            const mas = e.target.closest('[data-btn-mas]');
            if (mas) {
                const s = contentEl.querySelector(`.plato-counter__qty[data-id="${mas.dataset.id}"]`);
                if (s) s.textContent = parseInt(s.textContent) + 1;
                return;
            }

            const menos = e.target.closest('[data-btn-menos]');
            if (menos) {
                const s = contentEl.querySelector(`.plato-counter__qty[data-id="${menos.dataset.id}"]`);
                if (s) { const v = parseInt(s.textContent); if (v > 1) s.textContent = v - 1; }
                return;
            }

            const carro = e.target.closest('[data-btn-carro]');
            if (!carro) return;

            const id       = Number(carro.dataset.id);
            const spanQty  = contentEl.querySelector(`.plato-counter__qty[data-id="${id}"]`);
            const cantidad = spanQty ? parseInt(spanQty.textContent) : 1;
            const prod     = productos.find(p => p.id === id);

            if (prod && typeof window.agregarItemAlCarrito === 'function') {
                // Precio ya descontado para que el carrito calcule correctamente
                window.agregarItemAlCarrito(
                    { ...prod, precio: precioEfectivo(prod.precio, prod.descuento) },
                    cantidad
                );
            }
        });
    }

    // ── Acordeón — ahora completamente sincrónico ─────
    function closePlanActivo() {
        if (planActivoBtn)   planActivoBtn.classList.remove('active');
        if (planActivoPanel) planActivoPanel.classList.remove('open');
        planActivoBtn   = null;
        planActivoPanel = null;
    }

    function togglePlan(btn, panelEl, contentEl, plan) {
        const estabaAbierto = btn.classList.contains('active');
        closePlanActivo();

        if (estabaAbierto) {
            btn.setAttribute('aria-expanded', 'false');
            return;
        }

        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        panelEl.classList.add('open');
        planActivoBtn   = btn;
        planActivoPanel = panelEl;

        // Renderizado instantáneo desde memoria — sin await, sin fetch, sin lag
        if (!contentEl.dataset.rendered) {
            contentEl.dataset.rendered = '1';
            renderProductos(contentEl, plan.productos || []);
        }

        setTimeout(() => {
            panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 420);
    }

    function buildPlanItem(plan) {
        const item = document.createElement('div');
        item.className = 'plan-item';
        item.innerHTML = `
            <button class="plan-accordion-btn" aria-expanded="false">
                <span>${plan.nombre}</span>
                <span class="plan-chevron" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </span>
            </button>
            <div class="plan-panel" role="region">
                <div class="plan-panel-inner">
                    <div class="plan-panel-content"></div>
                </div>
            </div>`;

        const btn     = item.querySelector('.plan-accordion-btn');
        const panel   = item.querySelector('.plan-panel');
        const content = item.querySelector('.plan-panel-content');

        attachPanelEvents(content, plan.productos || []);
        btn.addEventListener('click', () => togglePlan(btn, panel, content, plan));

        return item;
    }

    // ── SPA: transición entre vistas ──────────────────
    function switchView(hide, show) {
        hide.classList.add('spa-view--oculta');
        void show.offsetWidth;
        show.classList.remove('spa-view--oculta');
    }

    // ── VISTA DE PLANES — sin fetch, renderizado desde memoria
    function mostrarPlanes(nombreCategoria) {
        const cat = categoriasMap[nombreCategoria];
        if (!cat) {
            console.warn('[FastGood] Categoría no encontrada:', nombreCategoria);
            return;
        }

        const vCat      = document.getElementById('vista-categorias');
        const vPlanes   = document.getElementById('vista-planes');
        const titulo    = document.getElementById('titulo-planes-vista');
        const container = document.getElementById('planes-container');

        titulo.textContent = `Planes de ${cat.nombre}`;
        closePlanActivo();
        switchView(vCat, vPlanes);
        window.scrollTo({ top: document.getElementById('menu').offsetTop - 80, behavior: 'smooth' });

        container.innerHTML = '';

        const planes = cat.planes || [];
        if (!planes.length) {
            container.innerHTML = '<p class="panel-vacio">No hay planes disponibles para esta categoría.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        planes.forEach(p => frag.appendChild(buildPlanItem(p)));
        container.appendChild(frag);
    }

    // ── VOLVER A CATEGORÍAS ────────────────────────────
    function volverACategorias() {
        closePlanActivo();
        switchView(
            document.getElementById('vista-planes'),
            document.getElementById('vista-categorias')
        );
        window.scrollTo({ top: document.getElementById('menu').offsetTop - 80, behavior: 'smooth' });
    }

    // ── Init: UNA sola consulta al arrancar ───────────
    async function init() {
        window.mostrarPlanes     = mostrarPlanes;
        window.volverACategorias = volverACategorias;

        catalogoData = await fetchCatalogo();
        catalogoData.forEach(cat => { categoriasMap[cat.nombre] = cat; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
