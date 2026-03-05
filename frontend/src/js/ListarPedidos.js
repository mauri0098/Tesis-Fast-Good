document.addEventListener('DOMContentLoaded', fetchPedidos);

async function fetchPedidos() {
  const tbody = document.getElementById('pedidosBody');

  try {
    const response = await fetch('http://localhost:3000/api/pedidos');
    const data = await response.json();

    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No hay pedidos registrados</td></tr>';
      return;
    }

    data.forEach(pedido => {
      const tr = document.createElement('tr');

      // 1. N° Pedido (#001)
      const idFormatted = '#' + String(pedido.id).padStart(3, '0');

      // 2. Fecha
      const fecha = new Date(pedido.fecha_entrega || pedido.fecha_pedido).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      // 3. Cliente
      const cliente = pedido.cliente_nombre || pedido.usuarios?.nombre || 'Anónimo';

      // 4. Dirección
      const direccion = pedido.cliente_direccion || '-';

      // 5. & 6. Contacto
      const telefono = pedido.cliente_telefono || '-';
      const email = pedido.cliente_email || '-';

      // 7. Viandas (Lista)
      let viandasHtml = '<ul class="ingredientes-list">';
      if (pedido.pedido_detalles && pedido.pedido_detalles.length > 0) {
        pedido.pedido_detalles.forEach(d => {
          viandasHtml += `<li>${d.cantidad}x ${d.productos?.nombre || 'Producto'}</li>`;
        });
      } else {
        viandasHtml += '<li>Sin detalle</li>';
      }
      viandasHtml += '</ul>';

      // 8. Costo
      const costo = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(pedido.total);

      // 9. Estado
      const estado = pedido.estados?.nombre || 'Registrado';
      let estadoClass = 'bg-reg';
      if (estado.toLowerCase().includes('prepara')) estadoClass = 'bg-prep';
      if (estado.toLowerCase().includes('listo')) estadoClass = 'bg-listo';

      // 10. Método Pago
      const metodo = pedido.metodo_pago || 'Efectivo';
      const isPaid = pedido.pagado;
      const pagoHtml = `
        <div class="pago-info">
          <span class="metodo-tag">${metodo}</span>
          <span class="${isPaid ? 'status-paid' : 'status-pending'}">
            ${isPaid ? 'PAGADO' : 'PENDIENTE'}
          </span>
        </div>
      `;

      tr.innerHTML = `
        <td style="font-weight:bold">${idFormatted}</td>
        <td>${fecha}</td>
        <td><strong>${cliente}</strong></td>
        <td>${direccion}</td>
        <td>${telefono}</td>
        <td>${email}</td>
        <td>${viandasHtml}</td>
        <td style="font-weight:700">${costo}</td>
        <td><span class="badge-status ${estadoClass}">${estado}</span></td>
        <td>${pagoHtml}</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="10" style="color:red; text-align:center; padding:2rem;">Error al conectar con el servidor</td></tr>';
  }
}
