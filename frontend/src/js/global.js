// ====================================================================
// GLOBAL.JS - Lógica compartida en todo el sitio (Fast Good)
// Sidebar, Modales y eventos globales.
// ====================================================================


// ====================================================================
// GESTIÓN DE BARRA LATERAL (SIDEBAR)
// ====================================================================
// Abre el menú lateral deslizando desde la izquierda
function abrirSidebar() {
    document.getElementById("sidebar").style.width = "250px";
}

// Cierra el menú lateral ocultándolo
function cerrarSidebar() {
    document.getElementById("sidebar").style.width = "0";
}

// Mantenemos las funciones con nombres originales para compatibilidad con HTML
function openSidebar() {
    abrirSidebar();
}

function closeSidebar() {
    cerrarSidebar();
}


// ====================================================================
// GESTIÓN DE MODALES (VENTANAS EMERGENTES)
// ====================================================================

// --- Modal de Sucursales ---
// Muestra la ventana modal con información de sucursales
function abrirModalSucursales() {
    document.getElementById('sucursalesModal').style.display = 'block';
}

// Cierra la ventana modal de sucursales
function cerrarModalSucursales() {
    document.getElementById('sucursalesModal').style.display = 'none';
}

// Mantenemos los nombres originales para compatibilidad
function openModal() {
    abrirModalSucursales();
}

function closeModal() {
    cerrarModalSucursales();
}


// --- Modal de Contacto ---
// Muestra la ventana modal con información de contacto
function abrirModalContacto() {
    document.getElementById('contactModal').style.display = 'block';
}

// Cierra la ventana modal de contacto
function cerrarModalContacto() {
    document.getElementById('contactModal').style.display = 'none';
}

// Mantenemos los nombres originales para compatibilidad
function openContactModal() {
    abrirModalContacto();
}

function closeContactModal() {
    cerrarModalContacto();
}


// --- Cerrar Modales al Hacer Click Fuera ---
// Si el usuario hace click fuera de un modal, se cierra automáticamente
window.onclick = function (event) {
    const modalSucursales = document.getElementById('sucursalesModal');
    const modalContacto = document.getElementById('contactModal');

    // Si hace click en el modal (no en su contenido), lo cierra
    if (event.target === modalSucursales) {
        modalSucursales.style.display = "none";
    }
    if (event.target === modalContacto) {
        modalContacto.style.display = "none";
    }
}
