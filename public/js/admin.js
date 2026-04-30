let token = null;
let cal;
let mesActual = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let rangoSeleccionado = { entrada: null, salida: null };

// ── Auth ──────────────────────────────────────────────────────────────────────

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    });
    if (!res.ok) throw new Error('Credenciales incorrectas');
    const data = await res.json();
    token = data.token;
    sessionStorage.setItem('adminToken', token);
    document.getElementById('modal-login').classList.add('hidden');
    iniciarAdmin();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

function cerrarSesion() {
  sessionStorage.removeItem('adminToken');
  token = null;
  document.getElementById('modal-login').classList.remove('hidden');
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Arranque ──────────────────────────────────────────────────────────────────

async function iniciarAdmin() {
  cal = new Calendario('calendario-admin', {
    mode: 'admin',
    onSelect: handleSeleccionAdmin,
    onDayClick: handleDiaClickAdmin,
  });

  await cargarMetricas();
  await cargarReservasMes();
}

// ── Calendario ────────────────────────────────────────────────────────────────

function handleSeleccionAdmin(event) {
  if (event.tipo === 'inicio') {
    rangoSeleccionado = { entrada: event.entrada, salida: null };
    document.getElementById('panel-bloqueo').classList.add('hidden');
  }

  if (event.tipo === 'rango') {
    rangoSeleccionado = { entrada: event.entrada, salida: event.salida };
    const panelBloqueo = document.getElementById('panel-bloqueo');
    document.getElementById('bloqueo-fechas').textContent =
      `Del ${formatFechaDisplay(event.entrada)} al ${formatFechaDisplay(event.salida)}`;
    panelBloqueo.classList.remove('hidden');
    panelBloqueo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleDiaClickAdmin(dateStr, estado) {
  if (estado === 'reservada') {
    abrirDetalleReservaPorFecha(dateStr);
  }
}

// ── Métricas ──────────────────────────────────────────────────────────────────

async function cargarMetricas() {
  try {
    const res = await fetch(
      `/api/admin/metricas?year=${mesActual.year}&month=${mesActual.month}`,
      { headers: authHeaders() }
    );
    const data = await res.json();
    document.getElementById('met-noches').textContent    = data.nochesOcupadas;
    document.getElementById('met-ingresos').textContent  = formatCOP(data.ingresosConfirmados);
    document.getElementById('met-pendientes').textContent = data.pendientesPago;
  } catch (e) {
    console.error('Error cargando métricas:', e);
  }
}

// ── Lista de reservas ─────────────────────────────────────────────────────────

async function cargarReservasMes() {
  const mes = `${mesActual.year}-${String(mesActual.month).padStart(2, '0')}`;
  try {
    const res = await fetch(`/api/reservas?mes=${mes}`, { headers: authHeaders() });
    const reservas = await res.json();
    renderListaReservas(reservas);
  } catch (e) {
    document.getElementById('lista-reservas').innerHTML = '<p class="text-suave">Error cargando reservas</p>';
  }
}

function renderListaReservas(reservas) {
  const el = document.getElementById('lista-reservas');
  if (!reservas.length) {
    el.innerHTML = '<p class="text-suave">Sin reservas este mes</p>';
    return;
  }

  el.innerHTML = reservas.map(r => `
    <div class="reserva-item">
      <div class="reserva-item-nombre">${r.nombre} <span class="badge badge--${r.estado}">${r.estado}</span></div>
      <div class="reserva-item-fechas">
        ${formatFechaDisplay(r.fecha_entrada)} → ${formatFechaDisplay(r.fecha_salida)}
        &nbsp;·&nbsp; ${r.num_noches} noche(s) &nbsp;·&nbsp; ${r.num_personas} pers.
      </div>
      <div class="reserva-item-fechas">${formatCOP(r.total_cop)} · Anticipo: ${r.anticipo_pagado ? '✅ Pagado' : '⏳ Pendiente'}</div>
      <div class="reserva-item-acciones">
        <button class="btn btn--primary btn--sm" onclick="abrirDetalleReserva(${r.id})">Ver</button>
        ${r.estado === 'pendiente' ? `<button class="btn btn--success btn--sm" onclick="confirmarReserva(${r.id})">Confirmar pago</button>` : ''}
        ${r.estado !== 'cancelada' && r.estado !== 'completada' ? `<button class="btn btn--danger btn--sm" onclick="cancelarReserva(${r.id})">Cancelar</button>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Detalle reserva ───────────────────────────────────────────────────────────

async function abrirDetalleReserva(id) {
  try {
    const res = await fetch(`/api/reservas/${id}`, { headers: authHeaders() });
    const r = await res.json();
    mostrarModalReserva(r);
  } catch (e) { alert('Error cargando reserva'); }
}

async function abrirDetalleReservaPorFecha(fecha) {
  try {
    const mes = fecha.slice(0, 7);
    const res = await fetch(`/api/reservas?mes=${mes}`, { headers: authHeaders() });
    const reservas = await res.json();
    const r = reservas.find(rv =>
      rv.fecha_entrada <= fecha && rv.fecha_salida > fecha &&
      rv.estado !== 'cancelada'
    );
    if (r) mostrarModalReserva(r);
  } catch (e) {}
}

function mostrarModalReserva(r) {
  document.getElementById('detalle-reserva').innerHTML = `
    <table style="width:100%;font-size:.88rem;border-collapse:collapse;">
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Nombre</td><td>${r.nombre}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Cédula</td><td>${r.cedula || '—'}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Celular</td><td>${r.celular}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Entrada</td><td>${formatFechaDisplay(r.fecha_entrada)} · 3pm</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Salida</td><td>${formatFechaDisplay(r.fecha_salida)} · 1pm</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Personas</td><td>${r.num_personas}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Noches</td><td>${r.num_noches}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Total</td><td><strong>${formatCOP(r.total_cop)}</strong></td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Anticipo</td><td>${formatCOP(r.anticipo_cop)} · ${r.anticipo_pagado ? '✅ Pagado' : '⏳ Pendiente'}</td></tr>
      <tr><td style="padding:5px 0;color:var(--texto-suave);">Estado</td><td><span class="badge badge--${r.estado}">${r.estado}</span></td></tr>
      ${r.notas ? `<tr><td style="padding:5px 0;color:var(--texto-suave);">Notas</td><td>${r.notas}</td></tr>` : ''}
      ${r.wa_number ? `<tr><td style="padding:5px 0;color:var(--texto-suave);">WhatsApp</td><td><a href="https://wa.me/${r.wa_number}" target="_blank">${r.wa_number}</a></td></tr>` : ''}
    </table>
  `;

  const acciones = document.getElementById('acciones-reserva');
  acciones.innerHTML = '';

  if (r.estado === 'pendiente') {
    const btnConf = document.createElement('button');
    btnConf.className = 'btn btn--success btn--sm';
    btnConf.textContent = 'Confirmar anticipo pagado';
    btnConf.onclick = () => confirmarReserva(r.id);
    acciones.appendChild(btnConf);
  }

  if (r.estado === 'confirmada') {
    const btnComp = document.createElement('button');
    btnComp.className = 'btn btn--primary btn--sm';
    btnComp.textContent = 'Marcar completada';
    btnComp.onclick = () => completarReserva(r.id);
    acciones.appendChild(btnComp);
  }

  if (r.estado !== 'cancelada' && r.estado !== 'completada') {
    const btnCan = document.createElement('button');
    btnCan.className = 'btn btn--danger btn--sm';
    btnCan.textContent = 'Cancelar reserva';
    btnCan.onclick = () => cancelarReserva(r.id);
    acciones.appendChild(btnCan);
  }

  document.getElementById('modal-reserva').classList.remove('hidden');
}

// ── Acciones reserva ──────────────────────────────────────────────────────────

async function confirmarReserva(id) {
  if (!confirm('¿Marcar anticipo como pagado y confirmar la reserva?')) return;
  await fetch(`/api/reservas/${id}/confirmar`, { method: 'PATCH', headers: authHeaders() });
  cerrarModal('modal-reserva');
  await refrescar();
}

async function cancelarReserva(id) {
  if (!confirm('¿Cancelar esta reserva? Se liberarán las fechas.')) return;
  await fetch(`/api/reservas/${id}/cancelar`, { method: 'PATCH', headers: authHeaders() });
  cerrarModal('modal-reserva');
  await refrescar();
}

async function completarReserva(id) {
  await fetch(`/api/reservas/${id}/completar`, { method: 'PATCH', headers: authHeaders() });
  cerrarModal('modal-reserva');
  await refrescar();
}

// ── Bloqueos ──────────────────────────────────────────────────────────────────

async function bloquearRango() {
  const { entrada, salida } = rangoSeleccionado;
  if (!entrada || !salida) return;

  const motivo = document.getElementById('bloqueo-motivo').value;
  const descripcion = document.getElementById('bloqueo-descripcion').value;

  await fetch('/api/bloqueos/rango', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ fechaInicio: entrada, fechaFin: salida, motivo, descripcion }),
  });

  document.getElementById('bloqueo-descripcion').value = '';
  cancelarBloqueo();
  await refrescar();
}

function cancelarBloqueo() {
  rangoSeleccionado = { entrada: null, salida: null };
  document.getElementById('panel-bloqueo').classList.add('hidden');
  cal.clearSelection();
}

// ── Nueva reserva manual ──────────────────────────────────────────────────────

function abrirModalNuevaReserva() {
  document.getElementById('nueva-reserva-error').classList.add('hidden');
  document.getElementById('nr-precio-preview').classList.add('hidden');
  document.getElementById('modal-nueva-reserva').classList.remove('hidden');

  // Al cambiar fechas, mostrar preview de precio
  ['nr-entrada', 'nr-salida', 'nr-personas'].forEach(id => {
    document.getElementById(id).addEventListener('change', actualizarPreviewPrecio);
  });
}

function actualizarPreviewPrecio() {
  const entrada = document.getElementById('nr-entrada').value;
  const salida = document.getElementById('nr-salida').value;
  const personas = parseInt(document.getElementById('nr-personas').value) || 2;
  const preview = document.getElementById('nr-precio-preview');

  if (!entrada || !salida || entrada >= salida) { preview.classList.add('hidden'); return; }

  const e = new Date(entrada + 'T12:00:00');
  const s = new Date(salida + 'T12:00:00');
  const noches = Math.round((s - e) / (1000 * 60 * 60 * 24));
  const base = 350000;
  const adic = Math.max(0, personas - 2) * 70000;
  const tarifa = base + adic;
  const total = noches * tarifa;
  const anticipo = Math.round(total / 2);

  preview.innerHTML = `${noches} noche(s) × ${formatCOP(tarifa)} = <strong>${formatCOP(total)}</strong> · Anticipo: ${formatCOP(anticipo)}`;
  preview.classList.remove('hidden');
}

async function crearReserva() {
  const errEl = document.getElementById('nueva-reserva-error');
  const nombre = document.getElementById('nr-nombre').value.trim();
  const cedula = document.getElementById('nr-cedula').value.trim();
  const celular = document.getElementById('nr-celular').value.trim();
  const fecha_entrada = document.getElementById('nr-entrada').value;
  const fecha_salida = document.getElementById('nr-salida').value;
  const num_personas = document.getElementById('nr-personas').value;
  const wa_number = document.getElementById('nr-wa').value.trim();
  const notas = document.getElementById('nr-notas').value.trim();

  if (!nombre || !celular || !fecha_entrada || !fecha_salida) {
    errEl.textContent = 'Nombre, celular, fecha entrada y fecha salida son obligatorios.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nombre, cedula, celular, fecha_entrada, fecha_salida, num_personas: parseInt(num_personas), wa_number, notas }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    cerrarModal('modal-nueva-reserva');
    await refrescar();
    alert(`Reserva #${data.id} creada correctamente.`);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function cerrarModal(id) {
  document.getElementById(id).classList.add('hidden');
}

async function refrescar() {
  await Promise.all([cargarMetricas(), cargarReservasMes()]);
  await cal.loadMonth(cal.currentYear, cal.currentMonth);
}

function formatFechaDisplay(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`;
}

function formatCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

// ── Inicialización ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Permitir login con Enter
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  token = sessionStorage.getItem('adminToken');
  if (token) {
    document.getElementById('modal-login').classList.add('hidden');
    iniciarAdmin();
  }
});
