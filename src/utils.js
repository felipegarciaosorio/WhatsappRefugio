const moment = require('moment-timezone');

const TZ = 'America/Bogota';

function ahora() {
  return moment().tz(TZ);
}

function formatFecha(dateStr) {
  return moment(dateStr).tz(TZ).format('D [de] MMMM [de] YYYY');
}

function formatCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && moment(str, 'YYYY-MM-DD', true).isValid();
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

module.exports = { ahora, formatFecha, formatCOP, isValidDate, diasDelMes, diasEnRango, nombreMes, TZ };
