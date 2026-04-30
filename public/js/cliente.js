let cal;
let numPersonas = 2;
let fechaEntrada = null;
let fechaSalida = null;
let numeroWa = '';

async function init() {
  // Cargar config pública (número WA)
  try {
    const cfg = await fetch('/api/config/publica').then(r => r.json());
    numeroWa = cfg.numeroWa || '';
  } catch (e) {}

  cal = new Calendario('calendario-cliente', {
    mode: 'client',
    onSelect: handleSeleccion,
  });
}

function handleSeleccion(event) {
  const msgEl = document.getElementById('msg-seleccion');
  const panelPersonas = document.getElementById('panel-personas');
  const panelCot = document.getElementById('panel-cotizacion');
  const panelErr = document.getElementById('panel-error');

  panelErr.classList.add('hidden');

  if (event.tipo === 'inicio') {
    fechaEntrada = event.entrada;
    fechaSalida = null;
    msgEl.textContent = `📅 Llegada: ${formatFechaDisplay(fechaEntrada)} (check-in 3pm) — Ahora elige tu fecha de salida`;
    panelPersonas.classList.remove('hidden');
    panelCot.classList.add('hidden');
  }

  if (event.tipo === 'rango') {
    fechaEntrada = event.entrada;
    fechaSalida = event.salida;
    msgEl.textContent = `✅ ${formatFechaDisplay(fechaEntrada)} → ${formatFechaDisplay(fechaSalida)}`;
    panelPersonas.classList.remove('hidden');
    actualizarCotizacion();
  }

  if (event.tipo === 'error') {
    panelErr.textContent = '⚠️ ' + event.mensaje;
    panelErr.classList.remove('hidden');
    panelCot.classList.add('hidden');
    fechaSalida = null;
  }
}

function cambiarPersonas(delta) {
  numPersonas = Math.min(4, Math.max(1, numPersonas + delta));
  document.getElementById('num-personas').textContent = numPersonas;
  const notaSofa = document.getElementById('nota-sofa');
  if (numPersonas >= 3) notaSofa.classList.remove('hidden');
  else notaSofa.classList.add('hidden');

  if (fechaEntrada && fechaSalida) actualizarCotizacion();
}

function calcularTotal(noches, personas) {
  const base = 350000;
  const adicionales = Math.max(0, personas - 2) * 70000;
  return noches * (base + adicionales);
}

function actualizarCotizacion() {
  if (!fechaEntrada || !fechaSalida) return;

  const e = new Date(fechaEntrada + 'T12:00:00');
  const s = new Date(fechaSalida + 'T12:00:00');
  const noches = Math.round((s - e) / (1000 * 60 * 60 * 24));

  if (noches < 1 || noches > 30) {
    document.getElementById('panel-error').textContent = '⚠️ El rango debe ser entre 1 y 30 noches.';
    document.getElementById('panel-error').classList.remove('hidden');
    document.getElementById('panel-cotizacion').classList.add('hidden');
    return;
  }

  const base = 350000;
  const adicionales = Math.max(0, numPersonas - 2) * 70000;
  const tarifaNoche = base + adicionales;
  const total = noches * tarifaNoche;
  const anticipo = Math.round(total / 2);
  const saldo = total - anticipo;

  document.getElementById('cot-llegada').textContent  = `${formatFechaDisplay(fechaEntrada)} · 3:00 PM`;
  document.getElementById('cot-salida').textContent   = `${formatFechaDisplay(fechaSalida)} · 1:00 PM`;
  document.getElementById('cot-noches').textContent   = `${noches} noche${noches > 1 ? 's' : ''}`;
  document.getElementById('cot-tarifa').textContent   = formatCOP(tarifaNoche);
  document.getElementById('cot-total').textContent    = formatCOP(total);
  document.getElementById('cot-anticipo').textContent = formatCOP(anticipo);
  document.getElementById('cot-saldo').textContent    = formatCOP(saldo);

  document.getElementById('panel-cotizacion').classList.remove('hidden');
  document.getElementById('panel-error').classList.add('hidden');
}

function reservarWhatsApp() {
  if (!fechaEntrada || !fechaSalida) return;

  const e = new Date(fechaEntrada + 'T12:00:00');
  const s = new Date(fechaSalida + 'T12:00:00');
  const noches = Math.round((s - e) / (1000 * 60 * 60 * 24));
  const total = calcularTotal(noches, numPersonas);
  const anticipo = Math.round(total / 2);

  const msg = `Hola! Quiero reservar la cabaña del ${formatFechaDisplay(fechaEntrada)} (check-in 3pm) al ${formatFechaDisplay(fechaSalida)} (checkout 1pm). Somos ${numPersonas} persona(s), son ${noches} noche(s). Total: ${formatCOP(total)} COP, anticipo: ${formatCOP(anticipo)}. ¿Cómo procedo?`;

  const destino = numeroWa || '573000000000';
  const url = `https://wa.me/${destino}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ── Utilidades de formato ────────────────────────────────────────────────────

function formatFechaDisplay(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`;
}

function formatCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

// Arrancar cuando carga el DOM
document.addEventListener('DOMContentLoaded', init);
