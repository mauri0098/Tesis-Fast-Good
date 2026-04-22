// ===================================================
// ANIMATIONS.JS — Motion design layer (Fast Good)
// Solo se carga en index.html. No altera IDs ni onclicks.
// ===================================================

(function () {
    'use strict';

    // ─── 1. STAGGERED CARD REVEAL (IntersectionObserver) ───────────────────
    // Solo aplica en index.html donde se carga este script.
    // Las cards de otras páginas quedan visibles por defecto (global.css).
    function initCardReveal() {
        var cards = document.querySelectorAll('.card');
        if (!cards.length) return;

        // Marcar las cards como ocultas ANTES de que el observer las muestre
        cards.forEach(function (card) {
            card.classList.add('animate-hidden');
        });

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.remove('animate-hidden');
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        cards.forEach(function (card, i) {
            // Delay escalonado: cada tarjeta 110ms más tarde que la anterior
            card.style.transitionDelay = (i * 0.11) + 's';
            observer.observe(card);
        });

        // Limpiar delay inline post-reveal para que hover no lo herede
        cards.forEach(function (card) {
            card.addEventListener('transitionend', function clearDelay(e) {
                if (e.propertyName === 'opacity') {
                    card.style.transitionDelay = '0s';
                    card.removeEventListener('transitionend', clearDelay);
                }
            });
        });
    }

    // ─── 2. CART COUNT PULSE (MutationObserver) ────────────────────────────
    function initCartPulse() {
        var count = document.getElementById('cart-count');
        if (!count) return;

        var mo = new MutationObserver(function () {
            count.classList.remove('cart-pulse');
            void count.offsetWidth; // force reflow
            count.classList.add('cart-pulse');
        });

        mo.observe(count, { childList: true, characterData: true, subtree: true });

        count.addEventListener('animationend', function () {
            count.classList.remove('cart-pulse');
        });
    }

    // ─── 3. CARRITO OVERLAY ────────────────────────────────────────────────
    // Inyecta un overlay oscuro detrás del panel cuando se abre.
    function initCartOverlay() {
        var overlay = document.createElement('div');
        overlay.className = 'carrito-overlay';
        document.body.appendChild(overlay);

        var panel = document.getElementById('carrito');
        if (!panel) return;

        var panelObserver = new MutationObserver(function () {
            if (panel.classList.contains('mostrar')) {
                overlay.classList.add('visible');
            } else {
                overlay.classList.remove('visible');
            }
        });

        panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });

        overlay.addEventListener('click', function () {
            if (typeof window.cerrarCarrito === 'function') {
                window.cerrarCarrito();
            }
        });
    }

    // ─── INIT ───────────────────────────────────────────────────────────────
    function init() {
        initCardReveal();
        initCartPulse();
        initCartOverlay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
