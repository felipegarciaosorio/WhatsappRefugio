const moment = require('moment-timezone');

const TZ = 'America/Bogota';

function ahora() {
  return moment().tz(TZ);
}

function formatFecha(dateStr) {
  return moment(dateStr).tz(TZ).format('D [de] MMMM [de] YYYY');
}

/** Ej: "6 de junio" o "del 23 al 24 de mayo" */
function formatRangoFechasCorto(fechaEntrada, fechaSalida) {
  const e = moment.tz(fechaEntrada, TZ).locale('es');
  const s = moment.tz(fechaSalida, TZ).locale('es');
  const noches = s.diff(e, 'days');
  if (noches === 1) {
    return e.format('D [de] MMMM');
  }
  if (e.month() === s.month() && e.year() === s.year()) {
    return `del ${e.format('D')} al ${s.format('D')} de ${e.format('MMMM')}`;
  }
  return `del ${e.format('D [de] MMMM')} al ${s.format('D [de] MMMM')}`;
}

function formatCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && moment(str, 'YYYY-MM-DD', true).isValid();
}

const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Convierte fechas del modelo o del usuario a YYYY-MM-DD */
function normalizarFechaISO(str, yearDefault) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase();
  if (isValidDate(s)) return s;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return isValidDate(iso) ? iso : null;
  }

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidDate(iso) ? iso : null;
  }

  m = s.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?/i);
  if (m) {
    const mes = MESES_ES[m[2].normalize('NFD').replace(/\p{Diacritic}/gu, '')] || MESES_ES[m[2]];
    if (!mes) return null;
    const year = m[3] ? parseInt(m[3], 10) : (yearDefault || ahora().year());
    const iso = `${year}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return isValidDate(iso) ? iso : null;
  }

  return null;
}

/** Intenta inferir entrada/salida desde texto en español (ej. "23 y 24 de mayo") */
function parsearRangoFechas(texto) {
  const t = String(texto).toLowerCase();
  const year = ahora().year();

  const dosDias = t.match(/(\d{1,2})\s*y\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  if (dosDias) {
    const mes = MESES_ES[dosDias[3].normalize('NFD').replace(/\p{Diacritic}/gu, '')] || MESES_ES[dosDias[3]];
    if (!mes) return null;
    const d1 = parseInt(dosDias[1], 10);
    const d2 = parseInt(dosDias[2], 10);
    const entrada = `${year}-${String(mes).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    // Segundo día = noche de estadía → salida al día siguiente del último día ocupado
    const salida = `${year}-${String(mes).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
    if (isValidDate(entrada) && isValidDate(salida) && entrada < salida) {
      return { fecha_entrada: entrada, fecha_salida: salida };
    }
  }

  const unDia = t.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/gi);
  if (unDia && unDia.length >= 2) {
    const a = normalizarFechaISO(unDia[0], year);
    const b = normalizarFechaISO(unDia[1], year);
    if (a && b && a < b) return { fecha_entrada: a, fecha_salida: b };
  }

  return null;
}

/** Noches = días entre check-in (3pm entrada) y check-out (1pm salida) */
/** Corrige años pasados (ej. IA manda 2023) al año actual o siguiente */
function ajustarAnioReserva(fechaISO) {
  if (!fechaISO || !isValidDate(fechaISO)) return fechaISO;
  let m = moment.tz(fechaISO, TZ);
  const hoy = ahora().startOf('day');
  if (m.year() < hoy.year()) {
    m = m.year(hoy.year());
  }
  if (m.isBefore(hoy, 'day')) {
    m = m.year(hoy.year() + 1);
  }
  return m.format('YYYY-MM-DD');
}

function calcularNoches(fechaEntrada, fechaSalida) {
  const entrada = moment.tz(fechaEntrada, TZ);
  const salida = moment.tz(fechaSalida, TZ);
  return salida.diff(entrada, 'days');
}

/**
 * Si el cliente dice "23 y 24" (o similar) y la IA mandó salida +2 días,
 * corrige a 1 noche: entrada 23, salida 24 (check-out 1pm del 24).
 */
function corregirFechasEstadia(fechaEntrada, fechaSalida, textoContexto = '') {
  const entrada = normalizarFechaISO(fechaEntrada, ahora().year());
  let salida = normalizarFechaISO(fechaSalida, ahora().year());
  if (!entrada || !salida) return { fecha_entrada: entrada, fecha_salida: salida };

  const noches = calcularNoches(entrada, salida);
  if (noches !== 2) return { fecha_entrada: entrada, fecha_salida: salida };

  const t = String(textoContexto).toLowerCase();
  const d1 = parseInt(entrada.slice(8, 10), 10);
  const d2 = d1 + 1;
  const patronConsecutivo = new RegExp(
    `\\b${d1}\\s*(?:y|al|a|hasta|-)\\s*${d2}\\b`,
    'i'
  );
  const patronDosDias = t.match(/(\d{1,2})\s*y\s*(\d{1,2})/i);
  const diasSeguidosEnTexto =
    patronConsecutivo.test(t) ||
    (patronDosDias &&
      parseInt(patronDosDias[1], 10) === d1 &&
      parseInt(patronDosDias[2], 10) === d2);

  if (diasSeguidosEnTexto) {
    salida = moment.tz(entrada, TZ).add(1, 'day').format('YYYY-MM-DD');
  }

  return { fecha_entrada: entrada, fecha_salida: salida };
}

function diasDelMes(year, month) {
  const dias = [];
  const inicio = moment.tz(`${year}-${String(month).padStart(2, '0')}-01`, TZ);
  const total = inicio.daysInMonth();
  for (let d = 1; d <= total; d++) {
    dias.push(inicio.clone().date(d).format('YYYY-MM-DD'));
  }
  return dias;
}

// Genera todos los días de un rango [inicio, fin] inclusive
function diasEnRango(fechaInicio, fechaFin) {
  const dias = [];
  const cur = moment.tz(fechaInicio, TZ);
  const fin = moment.tz(fechaFin, TZ);
  while (cur.isSameOrBefore(fin, 'day')) {
    dias.push(cur.format('YYYY-MM-DD'));
    cur.add(1, 'day');
  }
  return dias;
}

function nombreMes(year, month) {
  return moment.tz(`${year}-${String(month).padStart(2, '0')}-01`, TZ)
    .locale('es')
    .format('MMMM YYYY');
}

module.exports = {
  ahora, formatFecha, formatRangoFechasCorto, formatCOP, isValidDate, normalizarFechaISO, parsearRangoFechas,
  calcularNoches, corregirFechasEstadia, ajustarAnioReserva,
  diasDelMes, diasEnRango, nombreMes, TZ,
};
