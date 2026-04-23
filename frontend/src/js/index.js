// ===================================================
// INDEX.JS — SPA Catálogo (Categorías → Planes → Productos)
// Fast Good — Motion Design Edition
// ===================================================

(function () {
    'use strict';

    const IMG_DEFAULT = './src/assets/img/logo.webp';

    // Cache de productos por plan (evita re-fetch al reabrir)
    const productosCache = {};

    // Mapa de nombre → objeto categoría (cargado desde la API)
    let categoriasMap = {};

    // Plan actualmente abierto en el acordeón
    let planActivoBtn   = null;
    let planActivoPanel = null;

    // ── Fetch helpers ──────────────────────────────────────
    async function fetchCategorias() {
        try {
            const r = await fetch('/api/v1/categorias');
            if (!r.ok) throw new Error();
            return await r.json();
        } catch { return []; }
    }

    async function fetchPlanes(catId) {
        try {
            const r = await fetch(`/api/v1/categorias/${catId}/planes`);
            if (!r.ok) throw new Error();
            return await r.json();
        } catch { return []; }
    }

    async function fetchProductos(planId) {
        if (productosCache[planId]) return productosCache[planId];
        try {
            const r = await fetch(`/api/v1/planes/${planId}/productos`);
            if (!r.ok) throw new Error();
            const data = await r.json();
            productosCache[planId] = data;
            return data;
        } catch { return []; }
    }

    // ── Render de tarjeta de producto ──────────────────────
    function buildPlatoHTML(p, index) {
        const img    = p.imagen || IMG_DEFAULT;
        const precio = p.precio != null ? `$ ${p.precio}` : '';
        const delay  = index * 65; // stagger en ms
        return `
            <article class="plato-card" data-id="${p.id}" style="animation-delay:${delay}ms">
                <div class="plato-card__img">
                    <img src="${img}" alt="${p.nombre}" loading="lazy"
                         onerror="this.src='${IMG_DEFAULT}'" />
                </div>
                <div class="plato-card__body">
                    <h3 class="plato-card__nombre">${p.nombre}</h3>
                    <p  class="plato-card__desc">${p.descripcion || ''}</p>
                    ${precio ? `<div class="plato-card__precio">${precio}</div>` : ''}
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

    function renderProductos(contentEl, planId, productos) {
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

    // ── Delegación de eventos dentro del panel de un plan ──
    function attachPanelEvents(contentEl, planId) {
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

            const id      = Number(carro.dataset.id);
            const spanQty = contentEl.querySelector(`.plato-counter__qty[data-id="${id}"]`);
            const cantidad = spanQty ? parseInt(spanQty.textContent) : 1;
            const prods    = productosCache[planId] || [];
            const prod     = prods.find(p => p.id === id);

            if (prod && typeof window.agregarItemAlCarrito === 'function') {
                window.agregarItemAlCarrito(prod, cantidad);
            }
        });
    }

    // ── Acordeón de planes ─────────────────────────────────
    function closePlanActivo() {
        if (planActivoBtn)   planActivoBtn.classList.remove('active');
        if (planActivoPanel) planActivoPanel.classList.remove('open');
        planActivoBtn   = null;
        planActivoPanel = null;
    }

    async function togglePlan(btn, panelEl, contentEl, plan) {
        const estabaAbierto = btn.classList.contains('active');
        closePlanActivo();

        if (estabaAbierto) {
            btn.setAttribute('aria-expanded', 'false');
            return; // era el mismo → solo cierra
        }

        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        panelEl.classList.add('open');
        planActivoBtn   = btn;
        planActivoPanel = panelEl;

        // Lazy-load: pide productos solo la primera vez
        if (!contentEl.dataset.loaded) {
            contentEl.innerHTML = '<p class="panel-cargando">Cargando productos…</p>';
            const prods = await fetchProductos(plan.id);
            contentEl.dataset.loaded = '1';
            renderProductos(contentEl, plan.id, prods);
        }

        // Scroll suave al panel recién abierto
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

        attachPanelEvents(content, plan.id);
        btn.addEventListener('click', () => togglePlan(btn, panel, content, plan));

        return item;
    }

    // ── Transición entre vistas ────────────────────────────
    function switchView(hide, show) {
        hide.classList.add('spa-view--oculta');
        // Forzar reflow para que la animación se re-dispare
        void show.offsetWidth;
        show.classList.remove('spa-view--oculta');
    }

    // ── VISTA DE PLANES (expuesto globalmente para onclick HTML) ──
    async function mostrarPlanes(nombreCategoria) {
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
        container.innerHTML = '<p class="panel-cargando">Cargando planes…</p>';

        closePlanActivo();
        switchView(vCat, vPlanes);
        window.scrollTo({ top: document.getElementById('menu').offsetTop - 80, behavior: 'smooth' });

        const planes = await fetchPlanes(cat.id);
        container.innerHTML = '';

        if (!planes.length) {
            container.innerHTML = '<p class="panel-vacio">No hay planes disponibles para esta categoría.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        planes.forEach(p => frag.appendChild(buildPlanItem(p)));
        container.appendChild(frag);
    }

    // ── VOLVER A CATEGORÍAS (expuesto globalmente para onclick HTML) ──
    function volverACategorias() {
        closePlanActivo();
        const vCat    = document.getElementById('vista-categorias');
        const vPlanes = document.getElementById('vista-planes');
        switchView(vPlanes, vCat);
        window.scrollTo({ top: document.getElementById('menu').offsetTop - 80, behavior: 'smooth' });
    }

    // ── Inicialización ─────────────────────────────────────
    async function init() {
        // Exponer funciones al scope global (usadas en onclick del HTML)
        window.mostrarPlanes     = mostrarPlanes;
        window.volverACategorias = volverACategorias;

        // Cargar categorías para obtener sus IDs antes de que el usuario haga clic
        const categorias = await fetchCategorias();
        categorias.forEach(c => { categoriasMap[c.nombre] = c; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
