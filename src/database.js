const Database = require('better-sqlite3');
const path = require('path');
const { calcularNoches, ajustarAnioReserva } = require('./utils');

const DB_PATH = path.join(__dirname, '..', 'data', 'reservas.db');
let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cedula TEXT,
      celular TEXT NOT NULL,
      fecha_entrada TEXT NOT NULL,
      fecha_salida TEXT NOT NULL,
      num_personas INTEGER DEFAULT 1,
      num_noches INTEGER NOT NULL,
      total_cop INTEGER NOT NULL,
      anticipo_cop INTEGER NOT NULL,
      anticipo_pagado INTEGER DEFAULT 0,
      estado TEXT DEFAULT 'pendiente',
      notas TEXT,
      wa_number TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      recordatorio_checkin_enviado INTEGER DEFAULT 0,
      recordatorio_resena_enviado INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bloqueos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      motivo TEXT NOT NULL,
      descripcion TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(fecha)
    );

    CREATE TABLE IF NOT EXISTS conversaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_number TEXT NOT NULL UNIQUE,
      estado TEXT DEFAULT 'inicio',
      context_json TEXT DEFAULT '{}',
      ultimo_mensaje TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_number TEXT NOT NULL,
      direccion TEXT NOT NULL,
      contenido TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_reservas_fechas ON reservas(fecha_entrada, fecha_salida);
    CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado);
    CREATE INDEX IF NOT EXISTS idx_mensajes_wa ON mensajes(wa_number);
    CREATE INDEX IF NOT EXISTS idx_conversaciones_wa ON conversaciones(wa_number);
  `);

  // Migración: pendiente sin pago → prereserva
  db.prepare(`
    UPDATE reservas SET estado = 'prereserva'
    WHERE estado = 'pendiente' AND (anticipo_pagado IS NULL OR anticipo_pagado = 0)
  `).run();

  // Corregir años antiguos mal interpretados por la IA (2023/2024 → 2026)
  const anioActual = new Date().getFullYear();
  db.prepare(`
    UPDATE reservas
    SET fecha_entrada = printf('%d-%s', ?, substr(fecha_entrada, 6)),
        fecha_salida = printf('%d-%s', ?, substr(fecha_salida, 6))
    WHERE CAST(substr(fecha_entrada, 1, 4) AS INTEGER) < ?
      AND estado NOT IN ('cancelada', 'completada')
  `).run(anioActual, anioActual, anioActual);

  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

// ── Disponibilidad ────────────────────────────────────────────────────────────

function verificarDisponibilidad(fechaEntrada, fechaSalida) {
  const database = getDb();
  const conflictos = [];

  // Genera los días del rango [fechaEntrada, fechaSalida)
  const entrada = new Date(fechaEntrada + 'T12:00:00');
  const salida = new Date(fechaSalida + 'T12:00:00');
  const dias = [];
  const cur = new Date(entrada);
  while (cur < salida) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  // Verifica reservas: un día está ocupado si fecha_entrada <= dia < fecha_salida
  // Esto significa que el día de salida de una reserva existente NO bloquea
  for (const dia of dias) {
    const reserva = database.prepare(`
      SELECT id, nombre, fecha_entrada, fecha_salida FROM reservas
      WHERE fecha_entrada <= ? AND fecha_salida > ?
        AND estado NOT IN ('cancelada')
    `).get(dia, dia);

    if (reserva) {
      conflictos.push({ tipo: 'reserva', dia, detalle: reserva });
    }

    const bloqueo = database.prepare(`
      SELECT id, fecha, motivo FROM bloqueos WHERE fecha = ?
    `).get(dia);

    if (bloqueo) {
      conflictos.push({ tipo: 'bloqueo', dia, detalle: bloqueo });
    }
  }

  return { disponible: conflictos.length === 0, conflictos };
}

function calcularPrecio(fechaEntrada, fechaSalida, numPersonas = 2) {
  const noches = calcularNoches(fechaEntrada, fechaSalida);
  if (noches < 1) {
    throw new Error('fecha_salida debe ser al menos el día después del check-in');
  }
  const personas = Math.min(Math.max(parseInt(numPersonas) || 2, 1), 4);
  const tarifaBase = 350000;
  const adicionales = Math.max(0, personas - 2) * 70000;
  const tarifaNoche = tarifaBase + adicionales;
  const total = noches * tarifaNoche;
  const anticipo = Math.round(total / 2);
  return { noches, personas, tarifaBase, adicionales, tarifaNoche, total, anticipo };
}

// ── Reservas CRUD ─────────────────────────────────────────────────────────────

function crearReserva({
  nombre, cedula, celular, fecha_entrada, fecha_salida, num_personas, notas, wa_number,
  estado = 'prereserva',
}) {
  const database = getDb();
  fecha_entrada = ajustarAnioReserva(fecha_entrada);
  fecha_salida = ajustarAnioReserva(fecha_salida);
  const precio = calcularPrecio(fecha_entrada, fecha_salida, num_personas || 2);
  const estadoFinal = estado || 'prereserva';

  const result = database.prepare(`
    INSERT INTO reservas
      (nombre, cedula, celular, fecha_entrada, fecha_salida, num_personas, num_noches, total_cop, anticipo_cop, notas, wa_number, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nombre, cedula || null, celular, fecha_entrada, fecha_salida,
    precio.personas, precio.noches, precio.total, precio.anticipo,
    notas || null, wa_number || null, estadoFinal
  );

  return { id: result.lastInsertRowid, ...precio };
}

function getReserva(id) {
  return getDb().prepare('SELECT * FROM reservas WHERE id = ?').get(id);
}

function getReservas({ estado, mes } = {}) {
  const database = getDb();
  let query = 'SELECT * FROM reservas WHERE 1=1';
  const params = [];

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  }
  if (mes) {
    query += " AND strftime('%Y-%m', fecha_entrada) = ?";
    params.push(mes);
  }
  query += ' ORDER BY fecha_entrada ASC';

  return database.prepare(query).all(...params);
}

function actualizarReserva(id, campos) {
  const database = getDb();
  const sets = Object.keys(campos).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(campos);
  database.prepare(`UPDATE reservas SET ${sets} WHERE id = ?`).run(...vals, id);
  return getReserva(id);
}

// ── Bloqueos CRUD ─────────────────────────────────────────────────────────────

function crearBloqueo({ fecha, motivo, descripcion }) {
  const database = getDb();
  try {
    database.prepare(`
      INSERT OR IGNORE INTO bloqueos (fecha, motivo, descripcion) VALUES (?, ?, ?)
    `).run(fecha, motivo, descripcion || null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function eliminarBloqueo(fecha) {
  getDb().prepare('DELETE FROM bloqueos WHERE fecha = ?').run(fecha);
}

function getBloqueos() {
  return getDb().prepare('SELECT * FROM bloqueos ORDER BY fecha ASC').all();
}

function getBloqueosPorMes(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return getDb().prepare("SELECT * FROM bloqueos WHERE fecha LIKE ?").all(`${prefix}-%`);
}

// ── Estado día (para el calendario) ──────────────────────────────────────────

function getReservasEnDia(fecha) {
  return getDb().prepare(`
    SELECT * FROM reservas
    WHERE fecha_entrada <= ? AND fecha_salida > ?
      AND estado NOT IN ('cancelada')
    ORDER BY id ASC
  `).all(fecha, fecha);
}

function getEstadoDia(fecha) {
  const database = getDb();
  const bloqueo = database.prepare('SELECT motivo FROM bloqueos WHERE fecha = ?').get(fecha);
  if (bloqueo) return bloqueo.motivo === 'mantenimiento' ? 'mantenimiento' : 'bloqueado';

  const reservas = getReservasEnDia(fecha);
  if (reservas.length > 1) return 'conflicto';
  if (reservas.length === 1) {
    if (reservas[0].estado === 'prereserva' || reservas[0].estado === 'pendiente') return 'prereserva';
    return 'reservada';
  }

  return 'disponible';
}

// ── Conversaciones ────────────────────────────────────────────────────────────

function getConversacion(waNumber) {
  const conv = getDb().prepare('SELECT * FROM conversaciones WHERE wa_number = ?').get(waNumber);
  if (conv) {
    conv.context = JSON.parse(conv.context_json || '{}');
  }
  return conv;
}

function upsertConversacion(waNumber, estado, context) {
  const database = getDb();
  const contextJson = JSON.stringify(context || {});
  database.prepare(`
    INSERT INTO conversaciones (wa_number, estado, context_json, ultimo_mensaje)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(wa_number) DO UPDATE SET
      estado = excluded.estado,
      context_json = excluded.context_json,
      ultimo_mensaje = excluded.ultimo_mensaje
  `).run(waNumber, estado, contextJson);
}

function resetConversacion(waNumber) {
  getDb().prepare('DELETE FROM conversaciones WHERE wa_number = ?').run(waNumber);
}

// ── Mensajes ──────────────────────────────────────────────────────────────────

function guardarMensaje(waNumber, direccion, contenido) {
  getDb().prepare(`
    INSERT INTO mensajes (wa_number, direccion, contenido) VALUES (?, ?, ?)
  `).run(waNumber, direccion, contenido);
}

function getMensajes(waNumber, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM mensajes WHERE wa_number = ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(waNumber, limit).reverse();
}

// ── Métricas ──────────────────────────────────────────────────────────────────

function getMetricasMes(year, month) {
  const database = getDb();
  const mes = `${year}-${String(month).padStart(2, '0')}`;

  const reservasMes = database.prepare(`
    SELECT * FROM reservas
    WHERE strftime('%Y-%m', fecha_entrada) = ?
      AND estado NOT IN ('cancelada')
  `).all(mes);

  const nochesOcupadas = reservasMes.reduce((sum, r) => sum + r.num_noches, 0);
  const ingresosConfirmados = reservasMes
    .filter(r => r.estado === 'confirmada' || r.estado === 'completada')
    .reduce((sum, r) => sum + r.total_cop, 0);
  const pendientesPago = reservasMes.filter(r =>
    r.estado === 'prereserva' || r.estado === 'pendiente'
  ).length;

  return { nochesOcupadas, ingresosConfirmados, pendientesPago };
}

// ── Recordatorios (usados por scheduler) ─────────────────────────────────────

function getReservasParaRecordatorioCheckin(fecha) {
  return getDb().prepare(`
    SELECT * FROM reservas
    WHERE fecha_entrada = ? AND estado = 'confirmada' AND recordatorio_checkin_enviado = 0
  `).all(fecha);
}

function getReservasParaRecordatorioResena(fecha) {
  return getDb().prepare(`
    SELECT * FROM reservas
    WHERE fecha_salida = ? AND estado = 'confirmada' AND recordatorio_resena_enviado = 0
  `).all(fecha);
}

module.exports = {
  init,
  getDb,
  verificarDisponibilidad,
  calcularPrecio,
  crearReserva,
  getReserva,
  getReservas,
  actualizarReserva,
  crearBloqueo,
  eliminarBloqueo,
  getBloqueos,
  getBloqueosPorMes,
  getReservasEnDia,
  getEstadoDia,
  getConversacion,
  upsertConversacion,
  resetConversacion,
  guardarMensaje,
  getMensajes,
  getMetricasMes,
  getReservasParaRecordatorioCheckin,
  getReservasParaRecordatorioResena,
};
